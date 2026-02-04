// src/controllers/pduController.js
const { pool } = require('../lib/db'); // เรียกใช้ pool จากไฟล์ db
const moment = require('moment'); // ถ้าไม่มีให้ npm install moment

// 1. ดึงภาพรวม Dashboard
exports.getDashboardOverview = async (req, res) => {
    try {
        const query = `
            SELECT
                id,
                name,
                location,
                model,
                ip_address,
                connection_status,
                voltage,
                current,
                power,
                temperature,
                alarm,
                last_seen,
                updated_at
            FROM public.v_pdu_show_name_device_api
            ORDER BY id ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
};


// 2. ดึงรายละเอียดรายเครื่อง (Details + Outlets)
exports.getDeviceDetail = async (req, res) => {
    const { id } = req.params;
    try {
        const deviceQuery = `SELECT * FROM pdu_devices WHERE id = $1`;
        const statusQuery = `SELECT * FROM pdu_status_current WHERE pdu_id = $1`;
        const outletQuery = `
            SELECT o.id, o.outlet_no, o.name, s.status 
            FROM pdu_outlets o
            LEFT JOIN pdu_outlet_status_current s ON o.id = s.outlet_id
            WHERE o.pdu_id = $1 ORDER BY o.outlet_no ASC
        `;

        const [device, status, outlets] = await Promise.all([
            pool.query(deviceQuery, [id]),
            pool.query(statusQuery, [id]),
            pool.query(outletQuery, [id])
        ]);

        if (device.rows.length === 0) return res.status(404).json({ error: 'PDU not found' });

        res.json({
            info: device.rows[0],
            status: status.rows[0],
            outlets: outlets.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
};

// 3. ดึงกราฟย้อนหลัง (History)
exports.getDeviceHistory = async (req, res) => {
    const { id } = req.params;
    const { start, end } = req.query;

    const startDate = start || moment().subtract(24, 'hours').format('YYYY-MM-DD HH:mm:ss');
    const endDate = end || moment().format('YYYY-MM-DD HH:mm:ss');

    try {
        console.log("📊 HISTORY REQUEST PDU:", id);

        const query = `
            SELECT polled_at, voltage, current, power, temperature
            FROM pdu_status_history
            WHERE pdu_id = $1
              AND polled_at BETWEEN $2 AND $3
            ORDER BY polled_at ASC
        `;

        const result = await pool.query(query, [id, startDate, endDate]);

        console.log("📈 ROWS:", result.rows.length);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
};
