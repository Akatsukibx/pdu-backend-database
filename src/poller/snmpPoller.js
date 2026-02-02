// src/poller/snmpPoller.js (CommonJS)

// ✅ IMPORTANT: path จาก src/poller -> src/lib
const { savePollResult } = require("../lib/pdu-writer");

const { pollAten } = require("./aten-snmp");
const { pollCyberpower } = require("./cyber-snmp");
const { pollApc } = require("./apc-snmp");
const { pollBaworn } = require("./baworn-snmp");

// ✅ ENV: เปิด/ปิด console.table ได้ (1=show, 0=hide)
const SHOW_TABLE = (() => {
  const v = String(process.env.POLL_LOG_TABLE || "on").toLowerCase();
  return ["1", "true", "yes", "on"].includes(v);
})();

// ---------- helpers ----------
function toNum(v) {
  if (v == null) return NaN;
  if (Buffer.isBuffer(v)) v = v.toString("utf8");
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function fmtNum(n, digits = 2) {
  const x = toNum(n);
  if (!Number.isFinite(x)) return "--";
  return x.toFixed(digits);
}

// ✅ กำหนดจำนวน outlet ตามรุ่น/ห้อง
function getOutletCount(pduOrResult) {
  const model = String(pduOrResult?.model || "").toUpperCase();
  const name = String(pduOrResult?.name || "").toUpperCase();

  // ✅ ห้อง BAWORN (RMCARD205) มี 12 ช่อง
  if (model === "RMCARD205") return 12;
  if (name.includes("BAWORN")) return 12;

  // default ทั่วไป
  return 8;
}

// แปลงค่าจริง -> ●/○/- (แยกตาม brand/model)
// ✅ NOTE: สำหรับ BAWORN (RMCARD205) ถ้าอ่านไม่ได้ให้ถือว่า OFF => ○
function outletToSymbol(v, brandUpper = "", modelUpper = "") {
  const b = String(brandUpper || "").toUpperCase();
  const m = String(modelUpper || "").toUpperCase();

  // ✅ BAWORN: null/undefined = OFF
  if (v == null) {
    if (b === "CYBERPOWER" && m === "RMCARD205") return "○";
    return "-";
  }

  if (Buffer.isBuffer(v)) v = v.toString("utf8");

  if (typeof v === "string") {
    const s = v.trim().toUpperCase();
    if (s === "ON") return "●";
    if (s === "OFF") return "○";

    // ✅ BAWORN: NA/-/"" = OFF
    if (s === "NA" || s === "N/A" || s === "-" || s === "") {
      if (b === "CYBERPOWER" && m === "RMCARD205") return "○";
      return "-";
    }
  }

  // boolean
  if (v === true) return "●";
  if (v === false) return "○";

  // numeric (force convert)
  const n = toNum(v);
  if (!Number.isFinite(n)) {
    // ✅ BAWORN: แปลงไม่ได้ = OFF
    if (b === "CYBERPOWER" && m === "RMCARD205") return "○";
    return "-";
  }

  // ✅ CyberPower RMCARD205 (BAWORN): 1=ON, 2=OFF (พิสูจน์ด้วย diff แล้ว)
  if (b === "CYBERPOWER" && m === "RMCARD205") {
    if (n === 1) return "●";
    if (n === 2) return "○";
    // ✅ ค่าอื่นถือว่า OFF ให้เหมือน "ปิด"
    return "○";
  }

  // ✅ CyberPower รุ่นอื่น (เช่น PDU41005): มักเป็น 3=ON, 0=OFF (+ เผื่อ 1/2)
  if (b === "CYBERPOWER") {
    if (n === 3) return "●";
    if (n === 0) return "○";
    if (n === 1) return "●";
    if (n === 2) return "○";
    return "-";
  }

  // ✅ ATEN/APC ทั่วไป: 1=ON, 0=OFF (+ เผื่อ 2/3)
  if (n === 1) return "●";
  if (n === 0) return "○";
  if (n === 2) return "●";
  if (n === 3) return "○";

  return "-";
}

function fmtOutlets(outlets, brandUpper = "", modelUpper = "", count = 8) {
  if (!Array.isArray(outlets)) return "N/A";

  const n = Number.isFinite(Number(count)) ? Number(count) : 8;

  const arr = outlets.slice(0, n);
  while (arr.length < n) arr.push(null);

  return arr
    .map((v, i) => `${i + 1}:${outletToSymbol(v, brandUpper, modelUpper)}`)
    .join(" ");
}

// ✅ outlets array -> object { Port1: "ON"/"OFF"/null, ... } สำหรับเขียน DB
// ✅ NOTE: สำหรับ BAWORN (RMCARD205) ถ้าอ่านไม่ได้ให้เก็บเป็น OFF (แทน null)
function outletsArrayToDetail(outlets, brandUpper = "", modelUpper = "", count = 8) {
  const b = String(brandUpper || "").toUpperCase();
  const m = String(modelUpper || "").toUpperCase();
  const n = Number.isFinite(Number(count)) ? Number(count) : 8;

  const arr = Array.isArray(outlets) ? outlets.slice(0, n) : [];
  while (arr.length < n) arr.push(null);

  const detail = {};
  for (let i = 0; i < n; i++) {
    const v = arr[i];

    // null / undefined
    if (v == null) {
      if (b === "CYBERPOWER" && m === "RMCARD205") {
        detail[`Port${i + 1}`] = "OFF";
      } else {
        detail[`Port${i + 1}`] = null;
      }
      continue;
    }

    // Buffer/string normalize
    let s = v;
    if (Buffer.isBuffer(s)) s = s.toString("utf8");

    if (typeof s === "string") {
      const t = s.trim().toUpperCase();

      if (t === "ON") {
        detail[`Port${i + 1}`] = "ON";
        continue;
      }
      if (t === "OFF") {
        detail[`Port${i + 1}`] = "OFF";
        continue;
      }

      if (t === "NA" || t === "N/A" || t === "-" || t === "") {
        if (b === "CYBERPOWER" && m === "RMCARD205") {
          detail[`Port${i + 1}`] = "OFF";
        } else {
          detail[`Port${i + 1}`] = null;
        }
        continue;
      }
      // ถ้าเป็น string ตัวเลข ให้ไปเข้า numeric branch ต่อ
    }

    // boolean
    if (s === true) {
      detail[`Port${i + 1}`] = "ON";
      continue;
    }
    if (s === false) {
      detail[`Port${i + 1}`] = "OFF";
      continue;
    }

    // numeric
    const nval = toNum(s);
    if (!Number.isFinite(nval)) {
      if (b === "CYBERPOWER" && m === "RMCARD205") {
        detail[`Port${i + 1}`] = "OFF";
      } else {
        detail[`Port${i + 1}`] = null;
      }
      continue;
    }

    // ✅ RMCARD205: 1=ON, 2=OFF
    if (b === "CYBERPOWER" && m === "RMCARD205") {
      if (nval === 1) detail[`Port${i + 1}`] = "ON";
      else if (nval === 2) detail[`Port${i + 1}`] = "OFF";
      else detail[`Port${i + 1}`] = "OFF";
      continue;
    }

    // ✅ CyberPower รุ่นอื่น: 3=ON, 0=OFF (+เผื่อ 1/2)
    if (b === "CYBERPOWER") {
      if (nval === 3 || nval === 1) detail[`Port${i + 1}`] = "ON";
      else if (nval === 0 || nval === 2) detail[`Port${i + 1}`] = "OFF";
      else detail[`Port${i + 1}`] = null;
      continue;
    }

    // ✅ อื่น ๆ
    if (nval === 1 || nval === 2) detail[`Port${i + 1}`] = "ON";
    else if (nval === 0 || nval === 3) detail[`Port${i + 1}`] = "OFF";
    else detail[`Port${i + 1}`] = null;
  }

  return detail;
}

async function pollOne(pdu) {
  const brand = String(pdu.brand || "").toUpperCase();
  const model = String(pdu.model || "").toUpperCase();

  // ✅ (B) เลือกตาม MODEL ก่อน
  if (model === "RMCARD205") return pollBaworn(pdu);

  // ✅ fallback ตาม BRAND
  if (brand === "ATEN") return pollAten(pdu);
  if (brand === "CYBERPOWER") return pollCyberpower(pdu);
  if (brand === "APC") return pollApc(pdu);

  const outletCount = getOutletCount(pdu);

  return {
    id: pdu.id,
    name: pdu.name,
    brand: pdu.brand,
    model: pdu.model,
    ip: pdu.ip,
    status: "OFFLINE",
    voltage: NaN,
    current: NaN,
    power: NaN,
    energy: NaN,
    outlets: Array(outletCount).fill(null),
    error: `Unknown brand/model: brand=${pdu.brand} model=${pdu.model}`,
  };
}

async function pollAllPDUs(pduList) {
  console.log(`🕒 Cron: Polling ${pduList.length} PDUs...`);

  const results = await Promise.all(pduList.map(pollOne));

  // ✅ แสดงตารางเฉพาะตอนเปิด env เท่านั้น
  if (SHOW_TABLE) {
    console.table(
      results.map((r, idx) => {
        const cfg = pduList[idx];
        const model = r.model || cfg?.model || "--";
        const brand = r.brand || cfg?.brand || "--";
        const outletCount = getOutletCount({ ...cfg, ...r });

        return {
          No: idx + 1,
          Model: model,
          Name: r.name ?? cfg?.name ?? "--",
          Brand: brand,
          Status: r.status ?? "--",
          Volt: fmtNum(r.voltage, 2),
          Amp: fmtNum(r.current, 2),
          Watt: fmtNum(r.power, 1),
          kWh: fmtNum(r.energy, 2),
          Outlets: fmtOutlets(r.outlets, brand, model, outletCount),
          Error: r.error ? String(r.error).slice(0, 80) : "",
        };
      })
    );
  }

  // ✅ บันทึกลง DB เฉพาะ ONLINE (ยิงครั้งเดียว)
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const cfg = pduList[i];
    if (String(r.status).toUpperCase() !== "ONLINE") continue;

    try {
      const merged = { ...cfg, ...r };
      const outletCount = getOutletCount(merged);

      const payload = {
        ...r,
        ip: r.ip || cfg.ip_address || cfg.ip || cfg.host,
        name: r.name || cfg.name,
        brand: r.brand || cfg.brand,
        model: r.model || cfg.model,
        outlets_detail: outletsArrayToDetail(
          r.outlets,
          r.brand || cfg.brand,
          r.model || cfg.model,
          outletCount
        ),
      };

      console.log("💾 saving to DB:", payload.name, payload.ip);
      await savePollResult(cfg, payload);
      console.log("✅ saved:", payload.name);
    } catch (e) {
      console.error("❌ DB save error:", cfg?.name || r?.name, e?.message || e);
    }
  }

  return results;
}

module.exports = pollAllPDUs;