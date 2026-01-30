//server.js (config)
require("dotenv").config();

const { pduList } = require("./config/pdus");
const pollAllPDUs = require("./src/poller/snmpPoller");

const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 30000);

console.log("🚀 Backend running");
console.log(`📟 PDU count = ${pduList.length}`);
console.log(`⏱  Poll interval = ${POLL_INTERVAL} ms`);

async function run() {
  try {
    await pollAllPDUs(pduList);
  } catch (err) {
    console.error("❌ poll error:", err?.message || err);
  }
}

run();
setInterval(run, POLL_INTERVAL);