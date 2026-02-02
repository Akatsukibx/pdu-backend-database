// src/poller/aten-snmp.js
const snmp = require("net-snmp");
const oids = require("../../config/oids"); // ต้องมี oids.atenMainRoot หรือกำหนดด้านล่าง

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

function parseAtenOutletState(n) {
  // ATEN ที่คุณเจอ: 1 = OFF, 2 = ON
  if (n === 2) return "ON";
  if (n === 1) return "OFF";
  // เผื่อบางรุ่น
  if (n === 0) return "OFF";
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
            raw[normalizeOid(vb.oid)] = Buffer.isBuffer(vb.value) ? vb.value.toString() : vb.value;
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

async function pollAten(pdu) {
  const session = createV2cSession(pdu.ip, pdu.community || "public");

  try {
    // ✅ ใช้ root เดียว แล้วแตก suffix เอา
    // แนะนำให้ใส่ใน ../../config/oids.js เป็น:
    // module.exports = { atenMainRoot: "1.3.6.1.4.1.21317.1.3.2.2.2.1", ... }
    const base = normalizeOid(
      (oids && (oids.atenMainRoot || (oids.aten && oids.aten.root))) ||
        "1.3.6.1.4.1.21317.1.3.2.2.2.1"
    );

    const raw = await snmpSubtree(session, base);

    // OID ที่คุณ diff เห็นชัดว่าใช้ชุดนี้ได้จริง
    const oidCurrent = normalizeOid(`${base}.3.1.2.1`); // STRING "0.85"
    const oidVoltage = normalizeOid(`${base}.3.1.3.1`); // STRING "228.84"
    const oidPower   = normalizeOid(`${base}.3.1.4.1`); // STRING "105.5760"
    const oidEnergy  = normalizeOid(`${base}.3.1.5.1`); // STRING "217.7482"

    const current = toNum(raw[oidCurrent]);
    const voltage = toNum(raw[oidVoltage]);
    const power   = toNum(raw[oidPower]);
    const energy  = toNum(raw[oidEnergy]); // kWh (ตามที่คุณเก็บโชว์)

    const outlets = [];
    for (let i = 1; i <= 8; i++) {
      const oid = normalizeOid(`${base}.5.1.2.${i}`); // คุณ snmpget แล้วได้ INTEGER: 1
      const v = raw[oid];
      const n = Number(v);
      outlets.push(parseAtenOutletState(Number.isFinite(n) ? n : NaN));
    }

    // ถ้าดึง subtree ได้ แต่ค่าเป็น NaN หมด อาจเป็นรุ่น/branch คนละชุด
    // อย่างน้อยให้ถือว่า ONLINE ถ้าคุย SNMP ได้
    return {
      id: pdu.id,
      name: pdu.name,
      brand: pdu.brand,
      status: "ONLINE",
      voltage,
      current,
      power,
      energy,
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

module.exports = { pollAten };