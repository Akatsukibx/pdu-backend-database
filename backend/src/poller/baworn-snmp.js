// src/poller/baworn-snmp.js (CommonJS)

const snmp = require("net-snmp");
const oids = require("../../config/oids");

function normalizeOid(x) {
  return String(x || "").trim().replace(/^\./, "").replace(/\.$/, "");
}

function createV2cSession(ip, community) {
  return snmp.createSession(ip, community, {
    version: snmp.Version2c,
    timeout: 5000,
    retries: 1,
    transport: "udp4",
  });
}

function snmpGet(session, oidList) {
  const list = oidList.map(normalizeOid).filter(Boolean);

  return new Promise((resolve, reject) => {
    session.get(list, (err, varbinds) => {
      if (err) return reject(err);

      const out = {};
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) {
          out[normalizeOid(vb.oid)] = null;
        } else {
          out[normalizeOid(vb.oid)] = vb.value;
        }
      }
      resolve(out);
    });
  });
}

function toNumber(v) {
  if (v == null) return NaN;
  if (Buffer.isBuffer(v)) v = v.toString("utf8");
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function applyScale(raw, scale = 1) {
  const n = toNumber(raw);
  if (!Number.isFinite(n)) return NaN;
  return n * (Number(scale) || 1);
}

// ✅ RMCARD205 outlet: 1 = ON, 2 = OFF (คุณทดสอบ diff แล้ว)
function mapOutlet(v) {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return null;
  if (n === 1) return 1; // ON
  if (n === 2) return 0; // OFF
  return null;
}

async function pollBaworn(pdu) {
  const cfg = oids?.baworn;
  if (!cfg?.map?.voltage || !cfg?.map?.outletBase) {
    return {
      id: pdu.id,
      name: pdu.name,
      brand: pdu.brand,
      model: pdu.model,
      ip: pdu.ip_address || pdu.ip,
      status: "OFFLINE",
      voltage: NaN,
      current: NaN,
      power: NaN,
      energy: 0,
      outlets: Array(12).fill(null),
      error: "Error: [baworn-snmp] Missing oids.baworn.map config",
    };
  }

  const ip = pdu.ip_address || pdu.ip || pdu.host;
  const community = pdu.snmp_community || pdu.community || "public";
  const session = createV2cSession(ip, community);

  try {
    // 1) base metrics OIDs
    const baseOids = [
      cfg.map.voltage,
      cfg.map.current, // ✅ เพิ่ม
      cfg.map.power,   // ✅ เพิ่ม
    ].filter(Boolean);

    const base = await snmpGet(session, baseOids);

    const vRaw = base[normalizeOid(cfg.map.voltage)];
    const cRaw = cfg.map.current ? base[normalizeOid(cfg.map.current)] : null;
    const pRaw = cfg.map.power ? base[normalizeOid(cfg.map.power)] : null;

    const voltage = applyScale(vRaw, cfg.scale?.voltage ?? 1);
    const current = applyScale(cRaw, cfg.scale?.current ?? 1);
    const power   = applyScale(pRaw, cfg.scale?.power ?? 1);

    // 2) outlet 12 ports
    const outletBase = normalizeOid(cfg.map.outletBase);
    const outletOids = [];
    for (let i = 1; i <= 12; i++) outletOids.push(`${outletBase}.${i}`);

    const out = await snmpGet(session, outletOids);

    const outlets = outletOids.map((oid) => mapOutlet(out[normalizeOid(oid)]));

    return {
      id: pdu.id,
      name: pdu.name,
      brand: pdu.brand,
      model: pdu.model,
      ip,
      status: "ONLINE",
      voltage,
      current,
      power,
      energy: 0, // รุ่นนี้ยังไม่เจอ kWh OID => ไว้ค่อย integrate จาก watt ได้
      outlets,
      error: "",
    };
  } catch (e) {
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
      energy: 0,
      outlets: Array(12).fill(null),
      error: `Error: ${e?.message || e}`,
    };
  } finally {
    try { session.close(); } catch {}
  }
}

module.exports = { pollBaworn };