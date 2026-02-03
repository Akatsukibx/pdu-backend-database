// src/poller/apc-snmp.js
const snmp = require("net-snmp");
const oids = require("../../config/oids"); // optional: oids.apcRoot

function normalizeOid(x) {
  return String(x || "")
    .trim()
    .replace(/^\./, "")
    .replace(/\s+/g, "");
}

function createV2cSession(ip, community) {
  return snmp.createSession(ip, community, {
    version: snmp.Version2c,
    timeout: 10000,
    retries: 1,
    transport: "udp4",
  });
}

function vbToString(v) {
  if (v == null) return "";
  if (Buffer.isBuffer(v)) return v.toString();
  return String(v);
}

function toNum(v) {
  const s = vbToString(v).trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function isUsableNum(n) {
  // APC บาง field จะส่ง -1 มาแปลว่า not supported / not available
  return Number.isFinite(n) && n >= 0;
}

function parseApcOutletState(n) {
  // APC Logic:
  // 1 = ON
  // 2 = OFF
  if (n === 1) return "ON";
  if (n === 2) return "OFF";
  return "N/A";
}

// ดึง subtree แล้วคืน map { oidString: valueString }
function snmpSubtree(session, rootOid) {
  const root = normalizeOid(rootOid);
  return new Promise((resolve, reject) => {
    const raw = {};
    session.subtree(
      root,
      (varbinds) => {
        for (const vb of varbinds) {
          if (!snmp.isVarbindError(vb)) {
            raw[normalizeOid(vb.oid)] = vbToString(vb.value);
          }
        }
      },
      (err) => {
        if (err) return reject(err);
        resolve(raw);
      }
    );
  });
}

/**
 * เลือก Current ที่เชื่อถือได้จากหลาย OID (fallback)
 * - Primary: legacy/universal (.12) => 318.1.1.12.2.3.1.1.2.1
 * - Fallback: rPDU2 (.26) => 318.1.1.26.6.3.1.5.1
 * หมายเหตุ: จากการทดสอบของคุณ ทั้งสอง OID ให้ค่า raw เท่ากัน (เช่น 14)
 */
function pickApcCurrent(raw, base12) {
  // primary (legacy .12.*)
  const oid12 = normalizeOid(`${base12}.2.3.1.1.2.1`);

  // fallback (rpdu2 .26.*) - บางรุ่น UI ชอบอ้างกลุ่มนี้ แต่หลาย field เป็น -1/notsupported
  const oid26 = normalizeOid("1.3.6.1.4.1.318.1.1.26.6.3.1.5.1");

  // deci-amps => /10
  const scale = 10;

  let n12 = toNum(raw[oid12]);
  if (isUsableNum(n12)) {
    return { raw: n12, current: n12 / scale, oid: oid12, source: "apc_legacy_12", scale };
  }

  let n26 = toNum(raw[oid26]);
  if (isUsableNum(n26)) {
    return { raw: n26, current: n26 / scale, oid: oid26, source: "apc_rpdu2_26", scale };
  }

  return { raw: 0, current: 0, oid: null, source: "none", scale };
}

async function pollApc(pdu) {
  const session = createV2cSession(pdu.ip, pdu.community || "public");

  try {
    // ✅ Root ของ APC (Universal / Legacy)
    // แนะนำให้ตั้งใน ../../config/oids.js:
    // module.exports = { apcRoot: "1.3.6.1.4.1.318.1.1.12", ... }
    const base = normalizeOid(
      (oids && (oids.apcRoot || (oids.apc && oids.apc.root))) ||
        "1.3.6.1.4.1.318.1.1.12"
    );

    // ดึง subtree ของ base (.12) ก่อน (หลัก)
    const raw = await snmpSubtree(session, base);

    // --- 1) Current (Load) : ใช้ fallback ที่พิสูจน์แล้ว ---
    const cur = pickApcCurrent(raw, base);
    const current = cur.current;

    // --- 2) Voltage ---
    // รุ่นนี้จากที่คุณ walk ไม่พบ OID voltage ใน .12.2.3
    // เลยใช้ config ถ้ามี ไม่งั้น default 220 (เป็น estimated)
    const hasCfgVolt = pdu.config && Number.isFinite(Number(pdu.config.voltage));
    const voltage = hasCfgVolt ? Number(pdu.config.voltage) : 220;

    // --- 3) Power (Estimated) ---
    // P (W) = V * I (apparent/estimated)
    const power = voltage * current;

    // --- 4) Energy (Not supported) ---
    const energy = 0;

    // --- Outlet Status (1..8) ---
    const outlets = [];
    for (let i = 1; i <= 8; i++) {
      const oid = normalizeOid(`${base}.3.3.1.1.4.${i}`);
      const v = raw[oid];
      const n = Number(v);
      outlets.push(parseApcOutletState(Number.isFinite(n) ? n : NaN));
    }

    return {
      id: pdu.id,
      name: pdu.name,
      brand: pdu.brand,
      status: "ONLINE",
      voltage, // estimated (config/default)
      current, // from SNMP (fallback .12 -> .26)
      power,   // estimated (V*I)
      energy,  // 0
      outlets,
      error: "",
      // ✅ เพิ่ม debug เพื่อกันงงว่า current มาจาก OID ไหน (ไม่ใช้ก็ได้)
      debug: {
        current_oid: cur.oid,
        current_raw: cur.raw,
        current_source: cur.source,
        current_scale: cur.scale ? `/${cur.scale} (deci-amps)` : null,
        voltage_source: hasCfgVolt ? "config" : "default220",
        power_note: "estimated = voltage_source * current(SNMP)",
      },
    };
  } catch (err) {
    return {
      id: pdu.id,
      name: pdu.name,
      brand: pdu.brand,
      status: "OFFLINE",
      voltage: NaN,
      current: NaN,
      power: NaN,
      energy: NaN,
      outlets: Array(8).fill("N/A"),
      error: err?.message || String(err),
      debug: {
        note: "pollApc failed",
      },
    };
  } finally {
    session.close();
  }
}

module.exports = { pollApc };