// backend/src/lib/pduDevicesRepo.js
const { pool } = require("./db");

/**
 * ดึงเฉพาะ PDU ที่ active
 * - คืนค่า ip_address เป็น "10.x.x.x" (ตัด /32 ออก)
 * - field ให้ตรงที่ poller ใช้
 */
async function getActivePduDevices() {
  const q = `
    SELECT
      id,
      name,
      brand,
      model,
      split_part(ip_address::text,'/',1) AS ip_address,
      snmp_version,
      snmp_port,
      snmp_community,
      snmp_timeout_ms,
      snmp_retries,
      COALESCE(is_active, true) AS is_active
    FROM public.pdu_devices
    WHERE COALESCE(is_active, true) = true
    ORDER BY id ASC;
  `;

  const { rows } = await pool.query(q);

  // normalize ให้ field ที่ poller ใช้เป็นมาตรฐาน
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    model: r.model,
    ip_address: r.ip_address,
    snmp_version: r.snmp_version || "2c",
    snmp_port: Number(r.snmp_port || 161),
    snmp_community: r.snmp_community || "",
    snmp_timeout_ms: Number(r.snmp_timeout_ms || 2000),
    snmp_retries: Number(r.snmp_retries || 1),
    is_active: Boolean(r.is_active),
  }));
}

module.exports = { getActivePduDevices };