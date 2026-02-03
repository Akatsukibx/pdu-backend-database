const { pool } = require("../lib/db");
const moment = require("moment");

/**
 * 0) Dashboard Summary
 * - รวมค่า power / current จาก DB
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
 * 1) Dashboard Overview (รายชื่ออุปกรณ์)
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
 * 2) Device Detail
 */
exports.getDeviceDetail = async (req, res) => {
  const { id } = req.params;

  try {
    const deviceQuery = `SELECT * FROM pdu_devices WHERE id = $1`;
    const statusQuery = `SELECT * FROM pdu_status_current WHERE pdu_id = $1`;
    const outletQuery = `
      SELECT o.id, o.outlet_no, o.name, s.status
      FROM pdu_outlets o
      LEFT JOIN pdu_outlet_status_current s ON o.id = s.outlet_id
      WHERE o.pdu_id = $1
      ORDER BY o.outlet_no ASC
    `;

    const [device, status, outlets] = await Promise.all([
      pool.query(deviceQuery, [id]),
      pool.query(statusQuery, [id]),
      pool.query(outletQuery, [id]),
    ]);

    if (device.rows.length === 0) {
      return res.status(404).json({ error: "PDU not found" });
    }

    res.json({
      info: device.rows[0],
      status: status.rows[0] || null,
      outlets: outlets.rows || [],
    });
  } catch (err) {
    console.error("[getDeviceDetail]", err);
    res.status(500).json({ error: "Database error" });
  }
};

/**
 * 3) History
 */
exports.getDeviceHistory = async (req, res) => {
  const { id } = req.params;
  const { start, end } = req.query;

  const startDate =
    start || moment().subtract(24, "hours").format("YYYY-MM-DD HH:mm:ss");
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