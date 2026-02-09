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

// ✅ รองรับทั้ง outlets_detail (object) และ outlets (array)
function normalizeOutletsDetail(result) {
  // 1) ถ้ามีอยู่แล้ว ใช้เลย
  if (result?.outlets_detail && typeof result.outlets_detail === "object") {
    return result.outlets_detail;
  }

  // 2) ถ้าเป็น array เช่น ["ON","OFF",...]
  if (Array.isArray(result?.outlets)) {
    const o = {};
    for (let i = 0; i < result.outlets.length; i++) {
      o[`Port${i + 1}`] = result.outlets[i];
    }
    return o;
  }

  // 3) ไม่มีจริง ๆ
  return null;
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

/**
 * ✅ Usage Uptime Session
 * - current >= threshold => start/keep session
 * - current <  threshold => stop session + duration_seconds
 */
const CURRENT_THRESHOLD = Number(process.env.USAGE_CURRENT_THRESHOLD || 0.05);

async function updateUsageSession(pduId, currentA, polledAt) {
  const cur = Number(currentA);
  const isUsing = Number.isFinite(cur) && cur >= CURRENT_THRESHOLD;

  const { rows } = await pool.query(
    `
    SELECT id, pdu_id, started_at, ended_at, duration_seconds, is_active
    FROM public.pdu_usage_sessions
    WHERE pdu_id = $1 AND is_active = true
    ORDER BY started_at DESC
    LIMIT 1
    `,
    [pduId]
  );

  const active = rows[0];

  if (isUsing) {
    if (!active) {
      await pool.query(
        `
        INSERT INTO public.pdu_usage_sessions
          (pdu_id, started_at, ended_at, duration_seconds, is_active, last_current, created_at, updated_at)
        VALUES
          ($1, $2, NULL, NULL, true, $3, NOW(), NOW())
        `,
        [pduId, polledAt, cur]
      );
      return;
    }

    await pool.query(
      `
      UPDATE public.pdu_usage_sessions
      SET last_current = $1,
          updated_at = NOW()
      WHERE id = $2
      `,
      [cur, active.id]
    );
    return;
  }

  if (active) {
    await pool.query(
      `
      UPDATE public.pdu_usage_sessions
      SET ended_at = $1,
          duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM ($1 - started_at))::int),
          is_active = false,
          last_current = $2,
          updated_at = NOW()
      WHERE id = $3
      `,
      [polledAt, Number.isFinite(cur) ? cur : null, active.id]
    );
  }
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

  // ✅ update usage session ตาม current (ไม่กระทบ logic เดิม)
  await updateUsageSession(pduId, data.current ?? null, polledAt);
}

async function ensureOutletsAndSaveStatus(pduId, outletsDetail) {
  const polledAt = new Date();

  const outletCount = getMaxPortFromOutletsDetail(outletsDetail, 8);

  for (let i = 1; i <= outletCount; i++) {
    const status = outletsDetail?.[`Port${i}`] ?? null;

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

  const model = result.model || pduConfig.model || null;
  const status = String(result.status || "OFFLINE").toUpperCase();

  const pduId = await ensureDevice({
    name: result.name || pduConfig.name,
    ip,
    model,
    community: pduConfig.community || null,
    status,
  });

  if (status !== "ONLINE") {
    await updateUsageSession(pduId, 0, new Date());
    return;
  }

  await upsertPduCurrentAndHistory(pduId, {
    voltage: numOrNull(result.voltage),
    current: numOrNull(result.current),
    power: numOrNull(result.power),
    temperature: null,
    alarm: null,
  });

  // ✅ รับได้ทั้ง outlets_detail และ outlets(array)
  const outletsDetail = normalizeOutletsDetail(result);
  await ensureOutletsAndSaveStatus(pduId, outletsDetail);
}

module.exports = { savePollResult };