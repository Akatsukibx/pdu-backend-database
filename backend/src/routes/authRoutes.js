// backend/src/routes/authRoutes.js
const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

// ✅ public
router.post("/login", authController.login);

// ✅ protected
router.post("/logout", requireAuth, authController.logout);
router.post("/logout-all", requireAuth, authController.logoutAll);
router.get("/ping", requireAuth, (req, res) => res.json({ ok: true }));

module.exports = router;