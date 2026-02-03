// src/lib/pdu-writer.js
const { pool } = require("./db");

// helper: แปลงเลข ถ้า NaN -> null (ดูข้อมูลสะอาดกว่า)
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ✅ helper: ดึงเลข port จาก key เช่น "Port12" => 12
function parsePortKey(k) {
  const m = /^Port(\d+)$/i.exec(String(k || "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// ✅ helper: หา max port จาก outletsDetail
function getMaxPortFromOutletsDetail(outletsDetail, fallback = 8) {
  if (!outletsDetail || typeof outletsDetail !== "object") return fallback;

  let max = 0;
  for (const k of Object.keys(outletsDetail)) {
    const n = parsePortKey(k);
    if (Number.isFinite(n) && n > max) max = n;
  }

  // ถ้าไม่มี PortX เลย ให้ fallback
  if (!max) return fallback;

  // กันค่าหลุดแบบ Port999
  if (max > 64) max = 64;

  return max;
}

async function ensureDevice({ name, ip, model, community, status }) {
  const st = String(status || "OFFLINE").toUpperCase();

  const q = `
    INSERT INTO pdu_devices (name, ip_address, model, snmp_community, status, last_seen)
    VALUES (
      $1,
      $2::inet,
      $3,
      $4,
      $5::varchar,
      CASE WHEN $5::varchar = 'ONLINE' THEN NOW() ELSE NULL::timestamp END
    )
    ON CONFLICT (ip_address)
    DO UPDATE SET
      name = COALESCE(EXCLUDED.name, pdu_devices.name),
      model = COALESCE(EXCLUDED.model, pdu_devices.model),
      snmp_community = COALESCE(EXCLUDED.snmp_community, pdu_devices.snmp_community),
      status = EXCLUDED.status,
      last_seen = CASE
        WHEN EXCLUDED.status = 'ONLINE' THEN NOW()
        ELSE pdu_devices.last_seen
      END
    RETURNING id
  `;

  const { rows } = await pool.query(q, [
    name || null,
    ip,
    model || null,
    community || null,
    st,
  ]);

  return rows[0].id;
}

async function upsertPduCurrentAndHistory(pduId, data) {
  const polledAt = new Date();

  // current
  await pool.query(
    `
    INSERT INTO pdu_status_current (pdu_id, voltage, current, power, temperature, alarm, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6, NOW())
    ON CONFLICT (pdu_id)
    DO UPDATE SET
      voltage=EXCLUDED.voltage,
      current=EXCLUDED.current,
      power=EXCLUDED.power,
      temperature=EXCLUDED.temperature,
      alarm=EXCLUDED.alarm,
      updated_at=NOW()
    `,
    [
      pduId,
      data.voltage ?? null,
      data.current ?? null,
      data.power ?? null,
      data.temperature ?? null,
      data.alarm ?? null,
    ]
  );

  // history
  await pool.query(
    `
    INSERT INTO pdu_status_history (pdu_id, voltage, current, power, temperature, alarm, polled_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    `,
    [
      pduId,
      data.voltage ?? null,
      data.current ?? null,
      data.power ?? null,
      data.temperature ?? null,
      data.alarm ?? null,
      polledAt,
    ]
  );

  // update last_seen + status ONLINE
  await pool.query(
    `UPDATE pdu_devices SET last_seen = $2, status = 'ONLINE' WHERE id = $1`,
    [pduId, polledAt]
  );
}

async function ensureOutletsAndSaveStatus(pduId, outletsDetail) {
  // outletsDetail ตัวอย่าง: { Port1:"ON", Port2:"OFF", ... }
  const polledAt = new Date();

  // ✅ dynamic outlet count (เช่น BAWORN จะได้ 12)
  const outletCount = getMaxPortFromOutletsDetail(outletsDetail, 8);

  for (let i = 1; i <= outletCount; i++) {
    // ถ้าไม่มี key PortX จะเป็น null (ปลอดภัยกว่า ไม่เดา)
    const status = outletsDetail?.[`Port${i}`] ?? null;

    // ensure outlet row
    const { rows } = await pool.query(
      `
      INSERT INTO pdu_outlets (pdu_id, outlet_no, name)
      VALUES ($1,$2,$3)
      ON CONFLICT (pdu_id, outlet_no)
      DO UPDATE SET name = COALESCE(pdu_outlets.name, EXCLUDED.name)
      RETURNING id
      `,
      [pduId, i, `Outlet-${i}`]
    );

    const outletId = rows[0].id;

    // outlet current
    await pool.query(
      `
      INSERT INTO pdu_outlet_status_current (outlet_id, status, updated_at)
      VALUES ($1,$2, NOW())
      ON CONFLICT (outlet_id)
      DO UPDATE SET
        status=EXCLUDED.status,
        updated_at=NOW()
      `,
      [outletId, status]
    );

    // outlet history
    await pool.query(
      `
      INSERT INTO pdu_outlet_status_history (outlet_id, status, polled_at)
      VALUES ($1,$2,$3)
      `,
      [outletId, status, polledAt]
    );
  }
}

/**
 * ✅ savePollResult behavior:
 * - ONLINE  : upsert device + upsert current/history + outlets
 * - OFFLINE : upsert device(status OFFLINE) ONLY แล้ว return
 *
 * ✅ OFFLINE จะไม่ไปทับค่าใน pdu_status_current/outlet_current เดิม
 * เพื่อให้ค่า last known ยังอยู่ (หรือจะให้ view ตัดโชว์เองก็ได้)
 */
async function savePollResult(pduConfig, result) {
  // ✅ ip fallback หลายแบบ
  const ip =
    result.ip ||
    pduConfig.ip ||
    pduConfig.ip_address ||
    pduConfig.host;

  if (!ip) {
    throw new Error(
      `Missing IP for ${result?.name || pduConfig?.name || "unknown PDU"}`
    );
  }

  // ✅ model: เอาจาก result ก่อน ถ้าไม่มีเอาจาก config
  const model = result.model || pduConfig.model || null;

  // ✅ สำคัญ: status ต้องมาจาก poller
  const status = String(result.status || "OFFLINE").toUpperCase();

  // ✅ 1) OFFLINE ก็ insert/update device ได้
  const pduId = await ensureDevice({
    name: result.name || pduConfig.name,
    ip,
    model,
    community: pduConfig.community || null,
    status,
  });

  // ✅ 2) OFFLINE: จบตรงนี้ ไม่เขียนตารางอื่น
  if (status !== "ONLINE") {
    return;
  }

  // ✅ 3) ONLINE: เขียน metrics + outlets ตามเดิม
  await upsertPduCurrentAndHistory(pduId, {
    voltage: numOrNull(result.voltage),
    current: numOrNull(result.current),
    power: numOrNull(result.power),
    temperature: null,
    alarm: null,
  });

  await ensureOutletsAndSaveStatus(pduId, result.outlets_detail);
}

module.exports = { savePollResult };