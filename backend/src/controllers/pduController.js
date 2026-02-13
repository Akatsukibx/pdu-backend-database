// src/controllers/pduController.js
const { pool } = require("../lib/db");
const moment = require("moment");

// ------------------------------
// helpers
// ------------------------------
function cleanIp(ip) {
  const s = String(ip || "").trim();
  if (!s) return "";
  return s.split("/")[0]; // กันกรอก 10.x.x.x/32 มา
}

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * ลบ PDU (และข้อมูลลูก) แบบ "hard delete" ตาม id หลายตัว
 * - ลบ status_current/history, outlet_status_current/history, outlets, usage_sessions ก่อน
 * - แล้วค่อยลบ pdu_devices
 */
async function hardDeletePdusByIds(client, ids) {
  const uniq = Array.from(new Set((ids || []).map((x) => Number(x)).filter((x) => Number.isFinite(x))));
  if (uniq.length === 0) return 0;

  // ลบข้อมูลลูกก่อน เพื่อกัน FK error
  await client.query(`DELETE FROM public.pdu_outlet_status_history WHERE outlet_id IN (
    SELECT id FROM public.pdu_outlets WHERE pdu_id = ANY($1::int[])
  )`, [uniq]);

  await client.query(`DELETE FROM public.pdu_outlet_status_current WHERE outlet_id IN (
    SELECT id FROM public.pdu_outlets WHERE pdu_id = ANY($1::int[])
  )`, [uniq]);

  await client.query(`DELETE FROM public.pdu_outlets WHERE pdu_id = ANY($1::int[])`, [uniq]);

  await client.query(`DELETE FROM public.pdu_status_history WHERE pdu_id = ANY($1::int[])`, [uniq]);
  await client.query(`DELETE FROM public.pdu_status_current WHERE pdu_id = ANY($1::int[])`, [uniq]);

  // ถ้าคุณใช้ตารางนี้อยู่
  try {
    await client.query(`DELETE FROM public.pdu_usage_sessions WHERE pdu_id = ANY($1::int[])`, [uniq]);
  } catch {
    // ถ้าไม่มีตารางนี้ ไม่ต้องล้ม
  }

  const del = await client.query(`DELETE FROM public.pdu_devices WHERE id = ANY($1::int[])`, [uniq]);
  return del.rowCount || 0;
}

// ===============================
// ✅ 0) PDU Management APIs
// ===============================

/**
 * GET /api/pdus
 * - list PDU ทั้งหมด (รวม inactive)
 */
exports.listPDUs = async (req, res) => {
  try {
    const q = `
      SELECT
        id,
        name,
        split_part(ip_address::text,'/',1) AS ip_address,
        brand,
        model,
        location,
        snmp_version,
        snmp_port,
        snmp_community,
        snmp_timeout_ms,
        snmp_retries,
        is_active
      FROM public.pdu_devices
      ORDER BY id ASC;
    `;
    const { rows } = await pool.query(q);
    res.json(rows);
  } catch (err) {
    console.error("[listPDUs]", err);
    res.status(500).json({ error: "Database error" });
  }
};

/**
 * POST /api/pdus
 * - เพิ่ม PDU ใหม่ลง DB
 * ✅ ปรับ: ถ้ามี name หรือ ip ซ้ำอยู่แล้ว -> ทำเป็น UPDATE แถวเดิม (ไม่สร้างแถวใหม่)
 */
exports.createPDU = async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};

    const name = String(body.name || "").trim();
    const ip_address = cleanIp(body.ip_address);
    const brand = String(body.brand || "").trim().toUpperCase();
    const model = String(body.model || "").trim();
    const location = body.location ?? null;

    const snmp_version = String(body.snmp_version || "2c").toLowerCase();
    const snmp_port = toInt(body.snmp_port, 161);
    const snmp_community = body.snmp_community ?? null;
    const snmp_timeout_ms = toInt(body.snmp_timeout_ms, 2000);
    const snmp_retries = toInt(body.snmp_retries, 1);
    const is_active = typeof body.is_active === "boolean" ? body.is_active : true;

    // validations
    if (!name) return res.status(400).json({ error: "name is required" });
    if (!ip_address) return res.status(400).json({ error: "ip_address is required" });
    if (!brand) return res.status(400).json({ error: "brand is required" });
    if (!model) return res.status(400).json({ error: "model is required" });

    if (snmp_version === "2c" && !snmp_community) {
      return res.status(400).json({ error: "snmp_community is required for SNMP v2c" });
    }

    await client.query("BEGIN");

    // ✅ ถ้ามี record เดิมที่ name หรือ ip ซ้ำ -> อัปเดต record นั้นแทน insert
    const findQ = `
      SELECT id
      FROM public.pdu_devices
      WHERE name = $1
         OR ip_address = $2::inet
      ORDER BY id ASC
      LIMIT 1
    `;
    const found = await client.query(findQ, [name, ip_address]);

    if (found.rows.length > 0) {
      const existingId = found.rows[0].id;

      const updQ = `
        UPDATE public.pdu_devices
        SET
          name = $2,
          ip_address = $3::inet,
          brand = $4,
          model = $5,
          location = $6,
          snmp_version = $7,
          snmp_port = $8,
          snmp_community = $9,
          snmp_timeout_ms = $10,
          snmp_retries = $11,
          is_active = $12
        WHERE id = $1
        RETURNING
          id,
          name,
          split_part(ip_address::text,'/',1) AS ip_address,
          brand,
          model,
          location,
          snmp_version,
          snmp_port,
          snmp_community,
          snmp_timeout_ms,
          snmp_retries,
          is_active;
      `;
      const { rows } = await client.query(updQ, [
        existingId,
        name,
        ip_address,
        brand,
        model,
        location,
        snmp_version,
        snmp_port,
        snmp_community,
        snmp_timeout_ms,
        snmp_retries,
        Boolean(is_active),
      ]);

      await client.query("COMMIT");
      return res.status(200).json(rows[0]);
    }

    // ✅ ไม่มีซ้ำ -> insert ปกติ
    const insQ = `
      INSERT INTO public.pdu_devices
      (name, ip_address, brand, model, location,
       snmp_version, snmp_port, snmp_community,
       snmp_timeout_ms, snmp_retries, is_active)
      VALUES
      ($1, $2::inet, $3, $4, $5,
       $6, $7, $8,
       $9, $10, $11)
      RETURNING
        id,
        name,
        split_part(ip_address::text,'/',1) AS ip_address,
        brand,
        model,
        location,
        snmp_version,
        snmp_port,
        snmp_community,
        snmp_timeout_ms,
        snmp_retries,
        is_active;
    `;

    const { rows } = await client.query(insQ, [
      name,
      ip_address,
      brand,
      model,
      location,
      snmp_version,
      snmp_port,
      snmp_community,
      snmp_timeout_ms,
      snmp_retries,
      Boolean(is_active),
    ]);

    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[createPDU]", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/pdus/:id
 * - แก้ไข PDU (แก้บาง field ได้)
 * ✅ ปรับตามที่คุณต้องการ:
 *   - ถ้าเปลี่ยน name หรือ ip -> ลบ “แถวอื่น” ที่เป็นของเก่า/ซ้ำ ทั้ง old และ new ทันที
 *   - ลบข้อมูลลูกด้วย (status/outlet/history/usage) เพื่อไม่ให้โผล่บน dashboard
 */
exports.updatePDU = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const body = req.body || {};

    const name = body.name != null ? String(body.name).trim() : null;
    const ip_address = body.ip_address != null ? cleanIp(body.ip_address) : null;

    const brand = body.brand != null ? String(body.brand).trim().toUpperCase() : null;
    const model = body.model != null ? String(body.model).trim() : null;
    const location = body.location !== undefined ? body.location : null;

    const snmp_version = body.snmp_version != null ? String(body.snmp_version).toLowerCase() : null;
    const snmp_port = body.snmp_port != null ? toInt(body.snmp_port, 161) : null;
    const snmp_community = body.snmp_community !== undefined ? body.snmp_community : null;
    const snmp_timeout_ms = body.snmp_timeout_ms != null ? toInt(body.snmp_timeout_ms, 2000) : null;
    const snmp_retries = body.snmp_retries != null ? toInt(body.snmp_retries, 1) : null;
    const is_active = typeof body.is_active === "boolean" ? body.is_active : null;

    // 1) อ่านค่าปัจจุบัน (ต้องเอา oldName/oldIp ไปใช้ลบของเก่า)
    const currentQ = `
      SELECT id, name, ip_address, snmp_version, snmp_community
      FROM public.pdu_devices
      WHERE id = $1
      LIMIT 1
    `;
    const current = await client.query(currentQ, [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: "PDU not found" });
    }

    const oldName = String(current.rows[0].name || "").trim();
    const oldIpText = current.rows[0].ip_address ? String(current.rows[0].ip_address) : "";
    const oldIp = cleanIp(oldIpText);

    const newName = name ?? oldName;
    const newIp = ip_address ?? oldIp;

    // validate snmp community when v2c
    const finalVersion = (snmp_version ?? current.rows[0].snmp_version ?? "2c").toLowerCase();
    const finalCommunity = snmp_community ?? current.rows[0].snmp_community;

    if (finalVersion === "2c" && !finalCommunity) {
      return res.status(400).json({ error: "snmp_community is required for SNMP v2c" });
    }

    await client.query("BEGIN");

    // 2) หา “แถวอื่น” ที่เป็นของเก่า/ซ้ำ แล้วลบทิ้งทันที
    // - ของเก่า: oldName / oldIp
    // - ของใหม่: newName / newIp (กันชน unique/กันข้อมูลซ้ำ)
    const victimsQ = `
      SELECT id
      FROM public.pdu_devices
      WHERE id <> $1
        AND (
          name = $2
          OR name = $3
          OR ip_address = $4::inet
          OR ip_address = $5::inet
        )
    `;

    const victims = await client.query(victimsQ, [id, oldName, newName, oldIp || "0.0.0.0", newIp || "0.0.0.0"]);
    const victimIds = victims.rows.map((r) => r.id);

    if (victimIds.length > 0) {
      await hardDeletePdusByIds(client, victimIds);
    }

    // 3) อัปเดตแถวหลัก (id เดิม)
    const q = `
      UPDATE public.pdu_devices
      SET
        name           = COALESCE($2, name),
        ip_address     = COALESCE($3::inet, ip_address),
        brand          = COALESCE($4, brand),
        model          = COALESCE($5, model),
        location       = COALESCE($6, location),
        snmp_version   = COALESCE($7, snmp_version),
        snmp_port      = COALESCE($8, snmp_port),
        snmp_community = COALESCE($9, snmp_community),
        snmp_timeout_ms= COALESCE($10, snmp_timeout_ms),
        snmp_retries   = COALESCE($11, snmp_retries),
        is_active      = COALESCE($12, is_active)
      WHERE id = $1
      RETURNING
        id,
        name,
        split_part(ip_address::text,'/',1) AS ip_address,
        brand,
        model,
        location,
        snmp_version,
        snmp_port,
        snmp_community,
        snmp_timeout_ms,
        snmp_retries,
        is_active;
    `;

    const params = [
      id,
      name,
      ip_address,
      brand,
      model,
      location,
      snmp_version,
      snmp_port,
      snmp_community,
      snmp_timeout_ms,
      snmp_retries,
      is_active,
    ];

    const { rows } = await client.query(q, params);

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[updatePDU]", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/pdus/:id
 * - soft delete -> is_active=false
 */
exports.deletePDU = async (req, res) => {
  const { id } = req.params;

  try {
    const q = `
      UPDATE public.pdu_devices
      SET is_active = false
      WHERE id = $1
      RETURNING
        id,
        name,
        split_part(ip_address::text,'/',1) AS ip_address,
        brand,
        model,
        location,
        snmp_version,
        snmp_port,
        snmp_community,
        snmp_timeout_ms,
        snmp_retries,
        is_active;
    `;

    const { rows } = await pool.query(q, [id]);
    if (rows.length === 0) return res.status(404).json({ error: "PDU not found" });

    res.json({ ok: true, device: rows[0] });
  } catch (err) {
    console.error("[deletePDU]", err);
    res.status(500).json({ error: "Database error" });
  }
};

// ===============================
// ✅ Dashboard APIs (ของเดิม)
// ===============================

/**
 * GET /api/dashboard/summary
 */
exports.getDashboardSummary = async (req, res) => {
  try {
    const q = `
      SELECT
        COUNT(*) FILTER (WHERE UPPER(connection_status) = 'ONLINE') AS online,
        COUNT(*) FILTER (WHERE UPPER(connection_status) <> 'ONLINE' OR connection_status IS NULL) AS offline,
        COALESCE(SUM(current), 0) AS total_current_a,
        COALESCE(SUM(power), 0)   AS total_load_w
      FROM public.v_pdu_show_name_device_api;
    `;
    const { rows } = await pool.query(q);
    const r = rows[0];

    res.json({
      online: Number(r.online),
      offline: Number(r.offline),
      total_current_a: Number(r.total_current_a),
      total_load_w: Number(r.total_load_w),
    });
  } catch (err) {
    console.error("[getDashboardSummary]", err);
    res.status(500).json({ error: "Database error" });
  }
};

/**
 * GET /api/dashboard
 */
exports.getDashboardOverview = async (req, res) => {
  try {
    const query = `
      SELECT
        id,
        name,
        ip_address,
        connection_status AS status,
        current,
        power
      FROM public.v_pdu_show_name_device_api
      ORDER BY id ASC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("[getDashboardOverview]", err);
    res.status(500).json({ error: "Database error" });
  }
};

/**
 * GET /api/device/:id
 */
exports.getDeviceDetail = async (req, res) => {
  const { id } = req.params;

  try {
    const deviceQuery = `SELECT * FROM pdu_devices WHERE id = $1`;

    const statusQuery = `
      SELECT *
      FROM public.v_pdu_show_name_device_api
      WHERE id = $1
      LIMIT 1
    `;

    const outletQuery = `
      SELECT o.id, o.outlet_no, o.name, s.status
      FROM pdu_outlets o
      LEFT JOIN pdu_outlet_status_current s ON o.id = s.outlet_id
      WHERE o.pdu_id = $1
      ORDER BY o.outlet_no ASC
    `;

    const usageQuery = `
      SELECT id, pdu_id, started_at, ended_at, duration_seconds, is_active, updated_at, last_current
      FROM public.pdu_usage_sessions
      WHERE pdu_id = $1
      ORDER BY started_at DESC
      LIMIT 1
    `;

    const [device, status, outlets, usage] = await Promise.all([
      pool.query(deviceQuery, [id]),
      pool.query(statusQuery, [id]),
      pool.query(outletQuery, [id]),
      pool.query(usageQuery, [id]),
    ]);

    if (device.rows.length === 0) {
      return res.status(404).json({ error: "PDU not found" });
    }

    res.json({
      info: device.rows[0],
      status: status.rows[0] || null,
      outlets: outlets.rows || [],
      usage: usage.rows[0] || null,
    });
  } catch (err) {
    console.error("[getDeviceDetail]", err);
    res.status(500).json({ error: "Database error" });
  }
};

/**
 * GET /api/history/device/:id?start=...&end=...
 */
exports.getDeviceHistory = async (req, res) => {
  const { id } = req.params;
  const { start, end } = req.query;

  const startDate = start || moment().subtract(24, "hours").format("YYYY-MM-DD HH:mm:ss");
  const endDate = end || moment().format("YYYY-MM-DD HH:mm:ss");

  try {
    const query = `
      SELECT polled_at, voltage, current, power, temperature
      FROM pdu_status_history
      WHERE pdu_id = $1
        AND polled_at BETWEEN $2 AND $3
      ORDER BY polled_at ASC
    `;

    const result = await pool.query(query, [id, startDate, endDate]);
    res.json(result.rows);
  } catch (err) {
    console.error("[getDeviceHistory]", err);
    res.status(500).json({ error: "Database error" });
  }
};