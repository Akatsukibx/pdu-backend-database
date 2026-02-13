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
 */
exports.createPDU = async (req, res) => {
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

    const q = `
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

    const params = [
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
    ];

    const { rows } = await pool.query(q, params);
    res.status(201).json(rows[0]);
  } catch (err) {
    // ถ้าคุณทำ UNIQUE(ip_address) แล้ว จะชนตรงนี้
    if (err && err.code === "23505") {
      return res.status(409).json({ error: "duplicate key (maybe ip_address already exists)" });
    }
    console.error("[createPDU]", err);
    res.status(500).json({ error: "Database error" });
  }
};

/**
 * PUT /api/pdus/:id
 * - แก้ไข PDU (แก้บาง field ได้)
 * ✅ ปรับเพิ่ม: ถ้าเปลี่ยน name หรือ ip -> ล้างข้อมูลสถานะเก่าที่ทำให้ dashboard ค้าง
 * ✅ วิธี A: ถ้ามีการเปลี่ยน ip_address -> เคลียร์ record อื่นที่ใช้ ip นี้ก่อน แล้วค่อย UPDATE
 */
exports.updatePDU = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const body = req.body || {};

    // ถ้าไม่ส่งมา = null เพื่อให้ COALESCE ใช้ของเดิม
    const name = body.name != null ? String(body.name).trim() : null;
    const ip_address = body.ip_address != null ? cleanIp(body.ip_address) : null;

    const brand = body.brand != null ? String(body.brand).trim().toUpperCase() : null;
    const model = body.model != null ? String(body.model).trim() : null;

    // ถ้าไม่ส่ง location มา ให้ COALESCE ใช้ของเดิม
    // ถ้าต้องการเคลียร์ให้เป็น NULL ต้องส่ง location = null มาจริง ๆ
    const location = body.location !== undefined ? body.location : null;

    const snmp_version =
      body.snmp_version != null ? String(body.snmp_version).toLowerCase() : null;

    const snmp_port = body.snmp_port != null ? toInt(body.snmp_port, 161) : null;
    const snmp_community = body.snmp_community !== undefined ? body.snmp_community : null;

    const snmp_timeout_ms =
      body.snmp_timeout_ms != null ? toInt(body.snmp_timeout_ms, 2000) : null;

    const snmp_retries =
      body.snmp_retries != null ? toInt(body.snmp_retries, 1) : null;

    const is_active = typeof body.is_active === "boolean" ? body.is_active : null;

    // ------------------------------
    // 1) ดึงค่าปัจจุบัน (เช็ค v2c + เช็คว่า name/ip เปลี่ยนไหม)
    // ------------------------------
    const currentQ = `
      SELECT
        name,
        split_part(ip_address::text,'/',1) AS ip_address,
        snmp_version,
        snmp_community
      FROM public.pdu_devices
      WHERE id = $1
      LIMIT 1
    `;
    const current = await client.query(currentQ, [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: "PDU not found" });
    }

    const curName = String(current.rows[0].name || "");
    const curIp = String(current.rows[0].ip_address || "");

    const finalVersion = (snmp_version ?? current.rows[0].snmp_version ?? "2c").toLowerCase();
    const finalCommunity = snmp_community ?? current.rows[0].snmp_community;

    if (finalVersion === "2c" && !finalCommunity) {
      return res.status(400).json({ error: "snmp_community is required for SNMP v2c" });
    }

    // ✅ เช็คว่ามีการเปลี่ยน name/ip จริงไหม
    const willChangeName = name != null && String(name) !== curName;
    const willChangeIp = ip_address != null && String(ip_address) !== curIp;
    const shouldResetStatus = willChangeName || willChangeIp;

    // ------------------------------
    // 2) Transaction
    // ------------------------------
    await client.query("BEGIN");

    // ✅ เคลียร์ record อื่นที่ใช้ ip นี้ (กัน UNIQUE ip_address ชน)
    if (ip_address) {
      await client.query(
        `
        DELETE FROM public.pdu_devices
        WHERE ip_address = $1::inet
          AND id <> $2
        `,
        [ip_address, id]
      );
    }

    // ------------------------------
    // 3) UPDATE แถวเดิม
    // ------------------------------
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

    // ------------------------------
    // ✅ 4) ถ้าเปลี่ยน name/ip -> ล้างข้อมูลสถานะเก่า ไม่ให้ dashboard แสดงค้าง
    // ------------------------------
    if (shouldResetStatus) {
      // ลบสถานะปัจจุบันของเครื่องนี้
      await client.query(`DELETE FROM public.pdu_status_current WHERE pdu_id = $1`, [id]);

      // ลบ outlet current ของเครื่องนี้ (join ผ่าน pdu_outlets)
      await client.query(
        `
        DELETE FROM public.pdu_outlet_status_current s
        USING public.pdu_outlets o
        WHERE s.outlet_id = o.id
          AND o.pdu_id = $1
        `,
        [id]
      );

      // ถ้าต้องการล้างประวัติด้วย (ข้อมูลหายถาวร) ให้เปิดบรรทัดนี้:
      // await client.query(`DELETE FROM public.pdu_status_history WHERE pdu_id = $1`, [id]);
      // await client.query(
      //   `
      //   DELETE FROM public.pdu_outlet_status_history h
      //   USING public.pdu_outlets o
      //   WHERE h.outlet_id = o.id
      //     AND o.pdu_id = $1
      //   `,
      //   [id]
      // );
      // await client.query(`DELETE FROM public.pdu_usage_sessions WHERE pdu_id = $1`, [id]);
    }

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    if (err && err.code === "23505") {
      return res.status(409).json({ error: "duplicate key (maybe ip_address already exists)" });
    }
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