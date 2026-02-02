// import express from "express";
// import { pool } from "../lib/db.js";

// const router = express.Router();

// // GET /api/pdus
// router.get("/", async (req, res) => {
//   try {
//     const { rows } = await pool.query(`
//       SELECT id, name, ip_address::text AS ip_address,
//              model, status, last_seen, created_at
//       FROM pdu_devices
//       ORDER BY id ASC
//     `);
//     res.json(rows);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "DB error" });
//   }
// });

// // GET /api/pdus/:id/status
// router.get("/:id/status", async (req, res) => {
//   const pduId = Number(req.params.id);
//   if (!Number.isFinite(pduId)) {
//     return res.status(400).json({ error: "Invalid ID" });
//   }

//   try {
//     const { rows } = await pool.query(
//       `
//       SELECT d.id, d.name, d.ip_address::text AS ip_address, d.model,
//              d.status, d.last_seen,
//              c.voltage, c.current, c.power, c.temperature,
//              c.alarm, c.updated_at
//       FROM pdu_devices d
//       LEFT JOIN pdu_status_current c ON c.pdu_id = d.id
//       WHERE d.id = $1
//       `,
//       [pduId]
//     );

//     if (!rows[0]) return res.status(404).json({ error: "Not found" });
//     res.json(rows[0]);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "DB error" });
//   }
// });

// export default router;



// src/routes/pduRoutes.js
const express = require('express');
const router = express.Router();
const pduController = require('../controllers/pduController');

// กำหนด URL และผูกกับ Controller function
router.get('/dashboard', pduController.getDashboardOverview);
router.get('/device/:id', pduController.getDeviceDetail);
router.get('/history/:id', pduController.getDeviceHistory);

module.exports = router;