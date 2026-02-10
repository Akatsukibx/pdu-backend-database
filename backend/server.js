// backend/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { checkDB, pool } = require("./src/lib/db"); // ✅ ต้องมี pool เพื่อ cleanup
const pollAllPDUs = require("./src/poller/snmpPoller");
const { getActivePduDevices } = require("./src/lib/pduDevicesRepo");

// 🔐 AUTH
const authRoutes = require("./src/routes/authRoutes");
const { requireAuth } = require("./src/middleware/auth");

// 📊 PDU
const pduRoutes = require("./src/routes/pduRoutes");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 8000);

// ✅ poll interval (ms)
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 300000);

// ✅ session cleanup config
const SESSION_CLEANUP_INTERVAL_MS = Number(
  process.env.SESSION_CLEANUP_INTERVAL_MS || 60000
); // 1 นาที
const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES || 2); // แนะนำ 2 นาที (ปรับได้)

// -------------------------
// PUBLIC ROUTES
// -------------------------
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 🔐 LOGIN (ไม่ต้อง auth)
app.use("/api/auth", authRoutes);

// -------------------------
// PROTECTED ROUTES
// -------------------------
app.use("/api", requireAuth, pduRoutes);

// -------------------------
// SESSION CLEANUP JOB
// -------------------------
async function cleanupIdleSessions() {
  try {
    const { rowCount } = await pool.query(
      `
      DELETE FROM public.app_sessions
      WHERE revoked = TRUE
         OR expires_at <= NOW()
         OR last_seen <= NOW() - ($1::int * INTERVAL '1 minute')
      `,
      [SESSION_IDLE_MINUTES]
    );

    if (rowCount > 0) {
      console.log(
        `🧹 Session cleanup: deleted ${rowCount} rows (idle>${SESSION_IDLE_MINUTES}m)`
      );
    }
  } catch (e) {
    console.error("❌ cleanupIdleSessions error:", e?.message || e);
  }
}

// -------------------------
// POLLER
// -------------------------
// ✅ กัน cron ทับกัน ถ้า poll ใช้เวลานานกว่า interval
let isPolling = false;

async function runTask() {
  if (isPolling) {
    console.log("⏳ Cron: previous poll still running, skip this tick");
    return;
  }

  isPolling = true;
  const startedAt = Date.now();

  try {
    // ✅ โหลดรายการจาก DB ทุกครั้ง
    const pduList = await getActivePduDevices();

    console.log(`🕒 Cron: Polling ${pduList.length} PDUs (from DB)...`);

    if (pduList.length === 0) {
      console.log("ℹ️ No active PDUs found in DB (pdu_devices.is_active=true)");
      return;
    }

    // ✅ ส่งเข้าตัว poller
    await pollAllPDUs(pduList);

    const ms = Date.now() - startedAt;
    console.log(`✅ Cron: Poll completed in ${ms} ms`);
  } catch (err) {
    console.error("❌ poll error:", err?.message || err);
  } finally {
    isPolling = false;
  }
}

async function main() {
  await checkDB();
  console.log("✅ Database connected");

  app.listen(PORT, () => {
    console.log(`🚀 API server running on port ${PORT}`);
    console.log(`🔐 Auth login: POST http://localhost:${PORT}/api/auth/login`);
    console.log(`📊 Dashboard: GET http://localhost:${PORT}/api/dashboard (protected)`);
    console.log(`⏱  Poll interval = ${POLL_INTERVAL} ms`);
    console.log(
      `🧹 Session cleanup every ${SESSION_CLEANUP_INTERVAL_MS} ms (idle>${SESSION_IDLE_MINUTES}m)`
    );
  });

  // ✅ start session cleanup loop
  await cleanupIdleSessions(); // run once on boot
  setInterval(cleanupIdleSessions, SESSION_CLEANUP_INTERVAL_MS);

  // ✅ poller loop
  await runTask(); // run once on boot
  setInterval(runTask, POLL_INTERVAL);
}

main().catch((e) => {
  console.error("❌ fatal:", e);
  process.exit(1);
});