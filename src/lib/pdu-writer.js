// src/lib/pdu-writer.js
const { pool } = require("./db");

// helper: แปลงเลข ถ้า NaN -> null (ดูข้อมูลสะอาดกว่า)
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// หา/สร้าง device แล้วคืน id
async function ensureDevice({ name, ip, model, community }) {
  const q = `
    INSERT INTO pdu_devices (name, ip_address, model, snmp_community, status, last_seen)
    VALUES ($1, $2::inet, $3, $4, 'ONLINE', NOW())
    ON CONFLICT (ip_address)
    DO UPDATE SET
      name = COALESCE(EXCLUDED.name, pdu_devices.name),
      model = COALESCE(EXCLUDED.model, pdu_devices.model),
      snmp_community = COALESCE(EXCLUDED.snmp_community, pdu_devices.snmp_community),
      status = 'ONLINE',
      last_seen = NOW()
    RETURNING id
  `;

  const { rows } = await pool.query(q, [
    name || null,
    ip,
    model || null,
    community || null,
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

  // update last_seen
  await pool.query(
    `UPDATE pdu_devices SET last_seen = $2, status = 'ONLINE' WHERE id = $1`,
    [pduId, polledAt]
  );
}

async function ensureOutletsAndSaveStatus(pduId, outletsDetail) {
  // outletsDetail ตัวอย่าง: { Port1:"ON", Port2:"OFF", ... }
  const polledAt = new Date();

  for (let i = 1; i <= 8; i++) {
    const status = outletsDetail?.[`Port${i}`] || null;

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

    // outlet current (NOTE: ตอนนี้คุณ drop current/power/alarm แล้วใช่ไหม?
    // ถ้าคุณลบคอลัมน์พวกนี้ไปแล้ว ให้ใช้ query แบบ "status + updated_at" เท่านั้น
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

async function savePollResult(pduConfig, result) {
  // ✅ ip fallback หลายแบบ
  const ip =
    result.ip ||
    pduConfig.ip ||
    pduConfig.ip_address ||
    pduConfig.host;

  if (!ip) {
    throw new Error(`Missing IP for ${result?.name || pduConfig?.name || "unknown PDU"}`);
  }

  // ✅ model: เอาจาก result ก่อน ถ้าไม่มีเอาจาก config
  const model = result.model || pduConfig.model || null;

  const pduId = await ensureDevice({
    name: result.name || pduConfig.name,
    ip,
    model,
    community: pduConfig.community || null,
  });

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