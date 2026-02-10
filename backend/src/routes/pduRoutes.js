// src/routes/pduRoutes.js
const express = require("express");
const router = express.Router();
const pduController = require("../controllers/pduController");

// ===============================
// ✅ PDU Management (NEW)
// ===============================
router.get("/pdus", pduController.listPDUs);
router.post("/pdus", pduController.createPDU);
router.put("/pdus/:id", pduController.updatePDU);
router.delete("/pdus/:id", pduController.deletePDU); // soft delete -> is_active=false

// ===============================
// ✅ Dashboard
// ===============================
router.get("/dashboard/summary", pduController.getDashboardSummary);
router.get("/dashboard", pduController.getDashboardOverview);

// ===============================
// ✅ Device
// ===============================
router.get("/device/:id", pduController.getDeviceDetail);
router.get("/history/device/:id", pduController.getDeviceHistory);

module.exports = router;