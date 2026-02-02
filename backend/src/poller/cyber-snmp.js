// src/poller/cyber-snmp.js
const snmp = require("net-snmp");
const oids = require("../../config/oids");

function normalizeOid(x) {
  return String(x || "").trim().replace(/^\./, "").replace(/\.$/, "");
}

function createV2cSession(ip, community) {
  return snmp.createSession(ip, community, {
    version: snmp.Version2c,
    timeout: 10000,
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
        if (snmp.isVarbindError(vb)) continue;
        out[normalizeOid(vb.oid)] = vb.value;
      }
      resolve(out);
    });
  });
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * ✅ CyberPower รุ่นที่คุณเจอ สเกลประมาณนี้:
 * - voltage: 2215 => 221.5V (x10)
 * - current: 1800 => 18.00A (x100)
 * - energy : 40510 => 405.10 kWh (x100)
 * - power  : มักเป็น W ตรง ๆ (เช่น 1850 => 1850W)
 *
 * ถ้าค่าออกมาดู “ใหญ่เกินจริง” ให้ normalize ตาม threshold
 */
function scaleCyberVoltage(v) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return NaN;
  return n > 1000 ? n / 10 : n;
}

function scaleCyberCurrent(v) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return NaN;
  // 1800 => 18.00A
  return n > 100 ? n / 100 : n;
}

function scaleCyberEnergy(v) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return NaN;
  // 40510 => 405.10kWh
  return n > 1000 ? n / 100 : n;
}

function scaleCyberPower(v) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return NaN;
  // ส่วนใหญ่เป็นวัตต์ตรง ๆ
  return n;
}

// ✅ Cyber outlet status (ชุด “ตรงเว็บ” ที่คุณตาม diff)
// บางเครื่อง/บาง OID จะเป็น 1/2 = ON/OFF
function parseCyberOutletStatus(v) {
  const n = Number(v);
  if (n === 1) return "ON";
  if (n === 2) return "OFF";
  return "N/A";
}

// (fallback) OID อีกชุดที่คุณเคยใช้ (พบบางเครื่องเป็น 0/3 หรือ 0/1)
function parseCyberOutletFallback(v) {
  const n = Number(v);
  if (n === 1) return "ON";
  if (n === 0) return "OFF";

  // เคยเห็นจากบางเครื่อง:
  if (n === 3) return "ON";
  if (n === 2) return "OFF";

  return "N/A";
}

/**
 * บางเครื่อง “กลับขั้ว” (เช่น อ่านได้เป็น 3 ทั้งหมดแต่หน้าเว็บ OFF)
 * ให้ลองกลับ mapping เมื่อพบ pattern น่าสงสัย
 */
function maybeFlipOutlets(outlets) {
  // ถ้าได้ ON ทั้ง 8 ช่อง แต่ power/current = 0 และหน้าเว็บมัก OFF -> มีโอกาส mapping กลับ
  const onCount = outlets.filter((x) => x === "ON").length;
  const offCount = outlets.filter((x) => x === "OFF").length;

  // ถ้าค่าที่อ่านได้เป็น "ON" เยอะมาก และแทบไม่มี OFF เลย อาจเป็นคนละ semantic (enable vs relay)
  // เรา “ไม่ flip แบบบังคับ” เพราะเสี่ยง แต่จะคืนค่าเดิมไว้
  // (ถ้าคุณอยาก flip จริง ๆ บอกได้ ผมจะใส่เงื่อนไขตาม current/power เพิ่ม)
  return { outlets, flipped: false, onCount, offCount };
}

async function pollCyberpower(pdu) {
  const session = createV2cSession(pdu.ip, pdu.community || "public");

  try {
    const map =
      (oids.cyberpower && oids.cyberpower.map) ||
      (oids.cyber && oids.cyber.map) ||
      {};

    // ✅ ถ้า config/oids.js ไม่มี ก็ใช้ค่า default ที่คุณพิสูจน์แล้ว
    const OID_VOLT = normalizeOid(
      map.voltage || "1.3.6.1.4.1.3808.1.1.3.5.7.0"
    );
    const OID_AMP = normalizeOid(
      map.current || "1.3.6.1.4.1.3808.1.1.3.2.3.1.1.7.1"
    );
    const OID_WATT = normalizeOid(
      map.power || "1.3.6.1.4.1.3808.1.1.3.2.3.1.1.8.1"
    );
    const OID_ENERGY = normalizeOid(
      map.energy || "1.3.6.1.4.1.3808.1.1.3.2.3.1.1.10.1"
    );

    // ✅ Outlet Status “ชุดตรงเว็บ” (ที่คุณตั้งไว้)
    const OUTLET_STATUS_BASE = normalizeOid(
      map.outletStatusBase || "1.3.6.1.4.1.3808.1.1.3.3.3.1.1.4"
    );

    // ✅ fallback base (OID เดิมที่คุณใช้)
    const OUTLET_FALLBACK_BASE = normalizeOid(
      map.outletFallbackBase ||
        map.outletBase ||
        "1.3.6.1.4.1.3808.1.1.3.3.4.1.1.4"
    );

    const outletStatusOids = [];
    for (let i = 1; i <= 8; i++) outletStatusOids.push(`${OUTLET_STATUS_BASE}.${i}`);

    const outletFallbackOids = [];
    for (let i = 1; i <= 8; i++) outletFallbackOids.push(`${OUTLET_FALLBACK_BASE}.${i}`);

    // ยิงชุดหลักก่อน
    const wantMain = [OID_VOLT, OID_AMP, OID_WATT, OID_ENERGY, ...outletStatusOids];
    let raw = await snmpGet(session, wantMain);

    // เช็คว่าชุด outlet หลัก “ได้ค่าจริง” ไหม
    const anyMainOutlet = outletStatusOids.some(
      (oid) => raw[normalizeOid(oid)] !== undefined
    );

    // ถ้าไม่ได้ outlet หลักเลย -> ยิง fallback เพิ่ม
    if (!anyMainOutlet) {
      const rawFb = await snmpGet(session, outletFallbackOids);
      raw = { ...raw, ...rawFb };
    }

    // ✅ normalize หน่วย (แก้ค่า V แปลกๆ + kWh เพี้ยน)
    const voltage = scaleCyberVoltage(raw[OID_VOLT]);
    const current = scaleCyberCurrent(raw[OID_AMP]);
    const power = scaleCyberPower(raw[OID_WATT]);
    const energy = scaleCyberEnergy(raw[OID_ENERGY]);

    // outlets
    const outlets = [];
    for (let i = 1; i <= 8; i++) {
      const mainOid = normalizeOid(`${OUTLET_STATUS_BASE}.${i}`);
      const fbOid = normalizeOid(`${OUTLET_FALLBACK_BASE}.${i}`);

      if (raw[mainOid] !== undefined) {
        outlets.push(parseCyberOutletStatus(raw[mainOid]));
      } else if (raw[fbOid] !== undefined) {
        outlets.push(parseCyberOutletFallback(raw[fbOid]));
      } else {
        outlets.push("N/A");
      }
    }

    // optional: detect suspicious mapping (ยังไม่ flip อัตโนมัติ)
    const chk = maybeFlipOutlets(outlets);

    return {
      id: pdu.id,
      name: pdu.name,
      brand: pdu.brand,
      status: "ONLINE",
      voltage,
      current,
      power,
      energy,
      outlets: chk.outlets,
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

module.exports = { pollCyberpower };