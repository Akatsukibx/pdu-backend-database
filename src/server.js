// server.js (DB)

require("dotenv").config();

const express = require("express");
const { checkDB } = require("./lib/db"); // ✅ CommonJS require (ไม่มี .js)
const { pduList } = require("./config/pdus");
const pollAllPDUs = require("./src/poller/snmpPoller");

const app = express();
app.use(express.json());

// ✅ ตั้งค่า Poll Interval
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 30000);

// ✅ Route ตัวอย่าง (ถ้าคุณมี routes อยู่แล้วค่อยเปลี่ยน)
try {
  // ถ้าคุณมี routes จริงที่เป็น CommonJS อยู่แล้ว:
  // const pduRoutes = require("./routes/pdu.routes");
  // app.use("/api/pdus", pduRoutes);
} catch (e) {
  // ไม่ทำอะไร ถ้าไม่มี routes
}

app.get("/health", async (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ✅ งาน Poller
async function runTask() {
  console.log(`🕒 Cron: Polling ${pduList.length} PDUs...`);
  try {
    await pollAllPDUs(pduList);
  } catch (err) {
    console.error("❌ poll error:", err?.message || err);
  }
}

async function main() {
  // 1) connect DB
  await checkDB();

  // 2) start API server
  const PORT = Number(process.env.PORT || 8000);
  app.listen(PORT, () => {
    console.log(`🚀 API server running on port ${PORT}`);
    console.log(`📟 PDU count = ${pduList.length}`);
    console.log(`⏱  Poll interval = ${POLL_INTERVAL} ms`);
  });

  // 3) start poller loop
  await runTask();
  setInterval(runTask, POLL_INTERVAL);
}

main().catch((e) => {
  console.error("❌ fatal:", e?.message || e);
  process.exit(1);
});