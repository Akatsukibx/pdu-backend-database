// //server.js (config)
// require("dotenv").config();

// const { pduList } = require("./config/pdus");
// const pollAllPDUs = require("./src/poller/snmpPoller");

// const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 30000);

// console.log("🚀 Backend running");
// console.log(`📟 PDU count = ${pduList.length}`);
// console.log(`⏱  Poll interval = ${POLL_INTERVAL} ms`);

// async function run() {
//   try {
//     await pollAllPDUs(pduList);
//   } catch (err) {
//     console.error("❌ poll error:", err?.message || err);
//   }
// }

// run();
// setInterval(run, POLL_INTERVAL);



// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors"); // แนะนำให้เพิ่ม เพื่อให้ Frontend เรียกได้
const { checkDB } = require("./src/lib/db"); 
const { pduList } = require("./config/pdus");
const pollAllPDUs = require("./src/poller/snmpPoller");

// ✅ Import Routes ที่เราสร้างตะกี้
const pduRoutes = require("./src/routes/pduRoutes");

const app = express();

// Middleware
app.use(cors()); 
app.use(express.json());

// ✅ เรียกใช้ API Routes
// เวลาเรียกจะเป็น: http://localhost:8000/api/dashboard
app.use("/api", pduRoutes);

const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 30000);

// Health Check
app.get("/health", async (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ✅ งาน Poller (คงเดิมไว้)
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
    console.log(`🔗 API Endpoint: http://localhost:${PORT}/api/dashboard`);
  });

  // 3) start poller loop
  await runTask();
  setInterval(runTask, POLL_INTERVAL);
}

main().catch((e) => {
  console.error("❌ fatal:", e?.message || e);
  process.exit(1);
});