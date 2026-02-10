// backend/src/poller/snmpPoller.js (CommonJS)

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

// ✅ ENV: เปิด/ปิด debug log ต่อเครื่อง
// ใช้: POLL_DEBUG=on
const POLL_DEBUG = (() => {
  const v = String(process.env.POLL_DEBUG || "off").toLowerCase();
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

  // default
  return 8;
}

// ---------- outlet helpers ----------
function outletToSymbol(v, brandUpper = "", modelUpper = "") {
  const b = String(brandUpper || "").toUpperCase();
  const m = String(modelUpper || "").toUpperCase();

  if (v == null) {
    if (b === "CYBERPOWER" && m === "RMCARD205") return "○";
    return "-";
  }

  if (Buffer.isBuffer(v)) v = v.toString("utf8");

  if (typeof v === "string") {
    const s = v.trim().toUpperCase();
    if (s === "ON") return "●";
    if (s === "OFF") return "○";
    if (s === "NA" || s === "N/A" || s === "-" || s === "") {
      if (b === "CYBERPOWER" && m === "RMCARD205") return "○";
      return "-";
    }
  }

  if (v === true) return "●";
  if (v === false) return "○";

  const n = toNum(v);
  if (!Number.isFinite(n)) {
    if (b === "CYBERPOWER" && m === "RMCARD205") return "○";
    return "-";
  }

  if (b === "CYBERPOWER" && m === "RMCARD205") {
    if (n === 1) return "●";
    if (n === 2) return "○";
    return "○";
  }

  if (b === "CYBERPOWER") {
    if (n === 3 || n === 1) return "●";
    if (n === 0 || n === 2) return "○";
    return "-";
  }

  if (n === 1 || n === 2) return "●";
  if (n === 0 || n === 3) return "○";

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

// ---------- outlets -> detail ----------
function outletsArrayToDetail(outlets, brandUpper = "", modelUpper = "", count = 8) {
  const b = String(brandUpper || "").toUpperCase();
  const m = String(modelUpper || "").toUpperCase();
  const n = Number.isFinite(Number(count)) ? Number(count) : 8;

  const arr = Array.isArray(outlets) ? outlets.slice(0, n) : [];
  while (arr.length < n) arr.push(null);

  const detail = {};

  for (let i = 0; i < n; i++) {
    const v = arr[i];

    if (v == null) {
      detail[`Port${i + 1}`] = b === "CYBERPOWER" && m === "RMCARD205" ? "OFF" : null;
      continue;
    }

    let s = v;
    if (Buffer.isBuffer(s)) s = s.toString("utf8");

    if (typeof s === "string") {
      const t = s.trim().toUpperCase();
      if (t === "ON" || t === "OFF") {
        detail[`Port${i + 1}`] = t;
        continue;
      }
      if (["NA", "N/A", "-", ""].includes(t)) {
        detail[`Port${i + 1}`] = b === "CYBERPOWER" && m === "RMCARD205" ? "OFF" : null;
        continue;
      }
    }

    if (s === true) {
      detail[`Port${i + 1}`] = "ON";
      continue;
    }
    if (s === false) {
      detail[`Port${i + 1}`] = "OFF";
      continue;
    }

    const nval = toNum(s);
    if (!Number.isFinite(nval)) {
      detail[`Port${i + 1}`] = b === "CYBERPOWER" && m === "RMCARD205" ? "OFF" : null;
      continue;
    }

    if (b === "CYBERPOWER" && m === "RMCARD205") {
      detail[`Port${i + 1}`] = nval === 1 ? "ON" : "OFF";
      continue;
    }

    if (b === "CYBERPOWER") {
      if (nval === 3 || nval === 1) detail[`Port${i + 1}`] = "ON";
      else if (nval === 0 || nval === 2) detail[`Port${i + 1}`] = "OFF";
      else detail[`Port${i + 1}`] = null;
      continue;
    }

    if (nval === 1 || nval === 2) detail[`Port${i + 1}`] = "ON";
    else if (nval === 0 || nval === 3) detail[`Port${i + 1}`] = "OFF";
    else detail[`Port${i + 1}`] = null;
  }

  return detail;
}

// ---------- poll ----------
async function pollOne(pdu) {
  // รองรับทั้ง config เดิม (ip) และข้อมูลจาก DB (ip_address)
  const ip = pdu.ip_address || pdu.ip || pdu.host;
  const brand = String(pdu.brand || "").toUpperCase();
  const model = String(pdu.model || "").toUpperCase();

  // ✅ วาง log ตรงนี้เลย: ก่อนเรียก poller แบรนด์
  if (POLL_DEBUG) {
    console.log("[POLL]", {
      id: pdu.id,
      name: pdu.name,
      ip,
      brand: pdu.brand,
      model: pdu.model,
      snmp_version: pdu.snmp_version,
      snmp_port: pdu.snmp_port,
      snmp_community: pdu.snmp_community,
      is_active: pdu.is_active,
    });
  }

  if (model === "RMCARD205") return pollBaworn({ ...pdu, ip });
  if (brand === "ATEN") return pollAten({ ...pdu, ip });
  if (brand === "CYBERPOWER") return pollCyberpower({ ...pdu, ip });
  if (brand === "APC") return pollApc({ ...pdu, ip });

  const outletCount = getOutletCount(pdu);

  return {
    id: pdu.id,
    name: pdu.name,
    brand: pdu.brand,
    model: pdu.model,
    ip,
    status: "OFFLINE",
    voltage: NaN,
    current: NaN,
    power: NaN,
    energy: NaN,
    outlets: Array(outletCount).fill(null),
    error: `Unknown brand/model: brand=${pdu.brand} model=${pdu.model}`,
  };
}

async function pollAllPDUs(pduList = []) {
  console.log(`🕒 Cron: Polling ${pduList.length} PDUs...`);

  const results = await Promise.all(pduList.map(pollOne));

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

  // ---------- DB SAVE ----------
  let savedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const cfg = pduList[i];

    try {
      const merged = { ...cfg, ...r };
      const outletCount = getOutletCount(merged);

      const payload = {
        ...r,
        status: String(r.status || "OFFLINE").toUpperCase(),
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

      await savePollResult(cfg, payload);
      savedCount++;
    } catch (e) {
      errorCount++;
      console.error("❌ DB save error:", cfg?.name || r?.name, e?.message || e);
    }
  }

  console.log(
    `💾 DB save completed: ${savedCount}/${results.length} PDUs saved` +
      (errorCount ? `, ${errorCount} errors` : "")
  );

  return results;
}

module.exports = pollAllPDUs;