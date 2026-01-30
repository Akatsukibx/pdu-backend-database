// src/poller/snmpPoller.js (CommonJS)

// ✅ IMPORTANT: path จาก src/poller -> src/lib
const { savePollResult } = require("../lib/pdu-writer");

const { pollAten } = require("./aten-snmp");
const { pollCyberpower } = require("./cyber-snmp");
const { pollApc } = require("./apc-snmp");

function fmtNum(n, digits = 2) {
  if (!Number.isFinite(n)) return "--";
  return n.toFixed(digits);
}

// แปลงค่าจริง -> ●/○/- (แยกตาม brand)
function outletToSymbol(v, brandUpper = "") {
  const b = String(brandUpper || "").toUpperCase();

  // normalize
  const s = typeof v === "string" ? v.trim().toUpperCase() : v;

  // common string forms
  if (s === "ON") return "●";
  if (s === "OFF") return "○";
  if (s === "NA" || s === "N/A" || s === "-" || s == null) return "-";

  // boolean
  if (s === true) return "●";
  if (s === false) return "○";

  // numeric forms
  if (typeof s === "number") {
    // ✅ CyberPower: 3 = ON, 0 = OFF (ตามที่คุณเจอ)
    if (b === "CYBERPOWER") {
      if (s === 3) return "●";
      if (s === 0) return "○";
      if (s === 1 || s === 2) return "●";
      return "-";
    }

    // ✅ ATEN/APC ทั่วไป: 1 = ON, 0 = OFF
    if (s === 1) return "●";
    if (s === 0) return "○";

    // เผื่อบางรุ่น
    if (s === 2) return "●";
    if (s === 3) return "○";
  }

  return "-";
}

function fmtOutlets(outlets, brandUpper = "") {
  if (!Array.isArray(outlets) || outlets.length === 0) return "N/A";

  // ให้ครบ 8 ช่องเสมอ
  const arr = outlets.slice(0, 8);
  while (arr.length < 8) arr.push(null);

  return arr.map((v, i) => `${i + 1}:${outletToSymbol(v, brandUpper)}`).join(" ");
}

// ✅ แปลง outlets array -> object { Port1: "ON"/"OFF"/null, ... } สำหรับเขียน DB
function outletsArrayToDetail(outlets, brandUpper = "") {
  const b = String(brandUpper || "").toUpperCase();
  const arr = Array.isArray(outlets) ? outlets.slice(0, 8) : [];
  while (arr.length < 8) arr.push(null);

  const detail = {};
  for (let i = 0; i < 8; i++) {
    const v = arr[i];

    // normalize similar logic แต่คืนค่า "ON"/"OFF"/null
    const s = typeof v === "string" ? v.trim().toUpperCase() : v;

    if (s === "ON") detail[`Port${i + 1}`] = "ON";
    else if (s === "OFF") detail[`Port${i + 1}`] = "OFF";
    else if (s === "NA" || s === "N/A" || s === "-" || s == null) detail[`Port${i + 1}`] = null;
    else if (s === true) detail[`Port${i + 1}`] = "ON";
    else if (s === false) detail[`Port${i + 1}`] = "OFF";
    else if (typeof s === "number") {
      if (b === "CYBERPOWER") {
        if (s === 3) detail[`Port${i + 1}`] = "ON";
        else if (s === 0) detail[`Port${i + 1}`] = "OFF";
        else if (s === 1 || s === 2) detail[`Port${i + 1}`] = "ON";
        else detail[`Port${i + 1}`] = null;
      } else {
        if (s === 1 || s === 2) detail[`Port${i + 1}`] = "ON";
        else if (s === 0 || s === 3) detail[`Port${i + 1}`] = "OFF";
        else detail[`Port${i + 1}`] = null;
      }
    } else {
      detail[`Port${i + 1}`] = null;
    }
  }
  return detail;
}

async function pollOne(pdu) {
  const brand = String(pdu.brand || "").toUpperCase();
  if (brand === "ATEN") return pollAten(pdu);
  if (brand === "CYBERPOWER") return pollCyberpower(pdu);
  if (brand === "APC") return pollApc(pdu);

  return {
    id: pdu.id,
    name: pdu.name,
    brand: pdu.brand,
    ip: pdu.ip, // เผื่อ config มี ip
    status: "OFFLINE",
    voltage: NaN,
    current: NaN,
    power: NaN,
    energy: NaN,
    outlets: Array(8).fill(null),
    error: `Unknown brand: ${pdu.brand}`,
  };
}

async function pollAllPDUs(pduList) {
  console.log(`🕒 Cron: Polling ${pduList.length} PDUs...`);

  // 1) poll ทุกตัว
  const results = await Promise.all(pduList.map(pollOne));

  // 2) แสดงผล
  console.table(
  results.map((r, idx) => {
    const cfg = pduList[idx];
    return {
      No: idx + 1,
      Model: r.model || cfg?.model || "--",
      Name: r.name ?? cfg?.name ?? "--",
      Brand: r.brand ?? cfg?.brand ?? "--",
      Status: r.status ?? "--",
      Volt: fmtNum(r.voltage, 2),
      Amp: fmtNum(r.current, 2),
      Watt: fmtNum(r.power, 1),
      kWh: fmtNum(r.energy, 2),
      Outlets: fmtOutlets(r.outlets, r.brand || cfg?.brand),
      Error: r.error ? String(r.error).slice(0, 60) : "",
    };
  })
);

  // 3) ✅ บันทึกลง DB (เฉพาะ ONLINE)
  // ทำแบบ sequential ปลอดภัยสุด (ไม่ยิง DB หนักเกิน)
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const cfg = pduList[i];

    if (String(r.status).toUpperCase() !== "ONLINE") continue;

    try {
      // เตรียม payload ให้ writer ใช้ง่าย
      const payload = {
        ...r,
        // เผื่อบาง poller ไม่ส่ง ip มา ให้ใช้ config
        ip: r.ip || cfg.ip_address || cfg.ip || cfg.host,
        name: r.name || cfg.name,
        brand: r.brand || cfg.brand,
        model: r.model || cfg.model,
        // outlets_detail สำหรับเขียน outlet tables
        outlets_detail: outletsArrayToDetail(r.outlets, r.brand || cfg.brand),
      };

      await savePollResult(cfg, payload);
      
      console.log("💾 saving to DB:", payload.name, payload.ip);
      await savePollResult(cfg, payload);
      console.log("✅ saved:", payload.name);
    } catch (e) {
      console.error(
        "❌ DB save error:",
        cfg?.name || r?.name,
        e?.message || e
      );
    }
  }

  return results;
}

module.exports = pollAllPDUs;