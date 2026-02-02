// src/poller/apc-snmp.js
const snmp = require("net-snmp");
const oids = require("../../config/oids"); // ต้องมี oids.apcRoot หรือกำหนด Default ด้านล่าง

function normalizeOid(x) {
  return String(x || "").trim().replace(/^\./, "").replace(/\s+/g, "");
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
            // APC บางทีส่งค่ามาเป็น Integer เลย ไม่ใช่ Buffer
            // vbToString จัดการให้แล้ว
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

async function pollApc(pdu) {
  const session = createV2cSession(pdu.ip, pdu.community || "public");

  try {
    // ✅ ใช้ Root ของ APC (Universal / Legacy)
    // แนะนำให้ใส่ใน ../../config/oids.js เป็น:
    // module.exports = { apcRoot: "1.3.6.1.4.1.318.1.1.12", ... }
    const base = normalizeOid(
      (oids && (oids.apcRoot || (oids.apc && oids.apc.root))) ||
        "1.3.6.1.4.1.318.1.1.12"
    );

    const raw = await snmpSubtree(session, base);

    // --- ส่วนการคำนวณและดึงค่า (Mapping & Calculation) ---

    // 1. Current (Load)
    // OID: .2.3.1.1.2.1 (Phase 1 Load)
    // ค่าดิบมาเป็นหน่วย deci-amps (เช่น 24 แปลว่า 2.4A)
    const oidCurrent = normalizeOid(`${base}.2.3.1.1.2.1`);
    let rawCurrent = toNum(raw[oidCurrent]);
    
    // ถ้าหาไม่เจอ หรือเป็น NaN ให้เป็น 0
    if (!Number.isFinite(rawCurrent)) rawCurrent = 0;

    const current = rawCurrent / 10; // ✅ หาร 10 เพื่อให้ได้หน่วย Amp

    // 2. Voltage (Hardware Limitation: รุ่นนี้ไม่มีเซนเซอร์วัด Volt)
    // ให้ใช้ค่าจาก pdu.config.voltage ถ้ามี ถ้าไม่มีให้ Default 220
    const voltage = (pdu.config && Number(pdu.config.voltage)) 
      ? Number(pdu.config.voltage) 
      : 220; 

    // 3. Power (Calculation)
    // สูตร: P (Watts) = V x I
    // เนื่องจาก Hardware ไม่บอก Watt เราจึงต้องคำนวณเองแบบ Apparent Power
    const power = voltage * current;

    // 4. Energy (Hardware Limitation)
    // รุ่นนี้ไม่สะสม kWh ส่ง 0 กลับไป
    const energy = 0;

    // --- ส่วน Outlet Loop ---
    const outlets = [];
    // APC รุ่นนี้ส่วนใหญ่มี 8 Ports (แต่ loop เผื่อไว้ หรือดูจาก config ก็ได้)
    // OID Status Base: .3.3.1.1.4
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
      voltage, // Fixed Value
      current, // Calculated (/10)
      power,   // Calculated (V*I)
      energy,  // 0
      outlets,
      error: "",
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
    };
  } finally {
    session.close();
  }
}

module.exports = { pollApc };