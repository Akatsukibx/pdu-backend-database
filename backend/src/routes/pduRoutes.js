

// src/routes/pduRoutes.js
const express = require("express");
const router = express.Router();
const pduController = require("../controllers/pduController");


// กำหนด URL และผูกกับ Controller function
router.get('/dashboard', pduController.getDashboardOverview);
router.get('/device/:id', pduController.getDeviceDetail);
router.get('/history/device/:id', pduController.getDeviceHistory);

module.exports = router;