// src/poller/aten-snmp.js (CommonJS)
const snmp = require("net-snmp");
const oids = require("../../config/oids");

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

// ✅ ATEN (จากค่าที่คุณ walk เจอจริง):
// 2 = ON, 1 = OFF
// 6 มักเจอใน index ที่ "ไม่มีจริง/NA" (เช่น 9..32 ใน PE6208AV)
function parseAtenOutletState(v) {
  const n = Number(v);
  if (n === 2) return "ON";
  if (n === 1) return "OFF";
  if (n === 6) return "N/A";
  if (n === 0) return "OFF";
  return "N/A";
}

function snmpGet(session, oidList) {
  const list = oidList.map(normalizeOid).filter(Boolean);

  return new Promise((resolve, reject) => {
    session.get(list, (err, varbinds) => {
      if (err) return reject(err);

      const out = {};
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) out[normalizeOid(vb.oid)] = null;
        else out[normalizeOid(vb.oid)] = vb.value;
      }
      resolve(out);
    });
  });
}

// ✅ ยิงเป็น batch กัน packet ใหญ่
async function snmpGetBatched(session, oidList, batchSize = 6) {
  const list = oidList.map(normalizeOid).filter(Boolean);
  const out = {};
  for (let i = 0; i < list.length; i += batchSize) {
    const chunk = list.slice(i, i + batchSize);
    const part = await snmpGet(session, chunk);
    Object.assign(out, part);
  }
  return out;
}

async function pollAten(pdu) {
  const ip = pdu.ip || pdu.ip_address || pdu.host;
  const community = pdu.community || pdu.snmp_community || "public";
  const session = createV2cSession(ip, community);

  try {
    const base = normalizeOid(
      (oids && ((oids.aten && oids.aten.root) || oids.atenMainRoot)) ||
        "1.3.6.1.4.1.21317.1.3.2.2.2.1"
    );

    // metrics OIDs
    const oidCurrent = normalizeOid(`${base}.3.1.2.1`);
    const oidVoltage = normalizeOid(`${base}.3.1.3.1`);
    const oidPower = normalizeOid(`${base}.3.1.4.1`);
    const oidEnergy = normalizeOid(`${base}.3.1.5.1`);

    const map = (oids && oids.aten && oids.aten.map) ? oids.aten.map : {};

    // outlet status base
    const outletStatusBase = normalizeOid(
      map.outletStatusBase || `${base}.5.1.2`
    );

    // ✅ PE6208AV มี 8 outlet
    const outletOids = [];
    for (let i = 1; i <= 8; i++) outletOids.push(`${outletStatusBase}.${i}`);

    const want = [oidCurrent, oidVoltage, oidPower, oidEnergy, ...outletOids];
    const raw = await snmpGetBatched(session, want, 6);

    const current = toNum(raw[oidCurrent]);
    const voltage = toNum(raw[oidVoltage]);
    const power = toNum(raw[oidPower]);
    const energy = toNum(raw[oidEnergy]);

    const outlets = [];
    for (let i = 1; i <= 8; i++) {
      const oid = normalizeOid(`${outletStatusBase}.${i}`);
      outlets.push(parseAtenOutletState(raw[oid]));
    }

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
    try { session.close(); } catch {}
  }
}

module.exports = { pollAten };