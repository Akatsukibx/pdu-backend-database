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

// ✅ กัน TooBig: แบ่งยิงเป็น batch เล็กๆ
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

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function scaleCyberVoltage(v) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return NaN;
  return n > 1000 ? n / 10 : n;
}

function scaleCyberCurrent(v) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return NaN;
  return n > 100 ? n / 100 : n;
}

function scaleCyberEnergy(v) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return NaN;
  return n > 1000 ? n / 100 : n;
}

function scaleCyberPower(v) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return NaN;
  return n;
}

// outlet status (บางรุ่น = 1/2)
function parseCyberOutletStatus(v) {
  const n = Number(v);
  if (n === 1) return "ON";
  if (n === 2) return "OFF";
  return "N/A";
}

// fallback (บางรุ่น = 0/3)
function parseCyberOutletFallback(v) {
  const n = Number(v);
  if (n === 1) return "ON";
  if (n === 0) return "OFF";
  if (n === 3) return "ON";
  if (n === 2) return "OFF";
  return "N/A";
}

function maybeFlipOutlets(outlets) {
  const onCount = outlets.filter((x) => x === "ON").length;
  const offCount = outlets.filter((x) => x === "OFF").length;
  return { outlets, flipped: false, onCount, offCount };
}

function isZeroish(n, eps = 0.000001) {
  return Number.isFinite(n) && Math.abs(n) <= eps;
}

async function pollCyberpower(pdu) {
  const session = createV2cSession(pdu.ip, pdu.community || "public");

  try {
    const map =
      (oids.cyberpower && oids.cyberpower.map) ||
      (oids.cyber && oids.cyber.map) ||
      {};

    // line table
    const OID_VOLT = normalizeOid(
      map.voltage || "1.3.6.1.4.1.3808.1.1.3.2.3.1.1.6.1"
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

    // outlet power base (W ต่อช่อง)
    const OUTLET_POWER_BASE = normalizeOid(
      map.outletPowerBase || "1.3.6.1.4.1.3808.1.1.3.3.5.1.1.8"
    );

    // outlet status base
    const OUTLET_STATUS_BASE = normalizeOid(
      map.outletStatusBase || "1.3.6.1.4.1.3808.1.1.3.3.3.1.1.4"
    );

    const OUTLET_FALLBACK_BASE = normalizeOid(
      map.outletFallbackBase ||
        map.outletBase ||
        "1.3.6.1.4.1.3808.1.1.3.3.4.1.1.4"
    );

    // ---- 1) GET line values (เล็กๆ ไม่ TooBig) ----
    let raw = await snmpGetBatched(
      session,
      [OID_VOLT, OID_AMP, OID_WATT, OID_ENERGY],
      4
    );

    // ---- 2) GET outlet power 8 ช่อง (batch) ----
    const outletPowerOids = [];
    for (let i = 1; i <= 8; i++) outletPowerOids.push(`${OUTLET_POWER_BASE}.${i}`);
    const rawPower = await snmpGetBatched(session, outletPowerOids, 4);
    raw = { ...raw, ...rawPower };

    // ---- 3) GET outlet status 8 ช่อง (batch) ----
    const outletStatusOids = [];
    for (let i = 1; i <= 8; i++) outletStatusOids.push(`${OUTLET_STATUS_BASE}.${i}`);
    let rawStatus = await snmpGetBatched(session, outletStatusOids, 4);

    // ถ้า status base ไม่ได้เลย -> fallback base
    const anyMainOutlet = outletStatusOids.some(
      (oid) => rawStatus[normalizeOid(oid)] !== undefined
    );
    if (!anyMainOutlet) {
      const outletFallbackOids = [];
      for (let i = 1; i <= 8; i++) outletFallbackOids.push(`${OUTLET_FALLBACK_BASE}.${i}`);
      const rawFb = await snmpGetBatched(session, outletFallbackOids, 4);
      rawStatus = { ...rawStatus, ...rawFb };
    }

    raw = { ...raw, ...rawStatus };

    // ---------- line values ----------
    const voltage = scaleCyberVoltage(raw[OID_VOLT]);
    const lineCurrent = scaleCyberCurrent(raw[OID_AMP]);
    const linePower = scaleCyberPower(raw[OID_WATT]);
    const energy = scaleCyberEnergy(raw[OID_ENERGY]);

    // ---------- outlet sum ----------
    let outletPowerSum = 0;
    let outletPowerSeen = 0;
    const outletWatts = [];
    for (let i = 1; i <= 8; i++) {
      const oid = normalizeOid(`${OUTLET_POWER_BASE}.${i}`);
      const w = Number(raw[oid]) || 0;
      if (raw[oid] !== undefined) outletPowerSeen++;
      outletPowerSum += w;
      outletWatts.push(w);
    }

    // ---------- outlets status parse ----------
    const outlets = [];
    for (let i = 1; i <= 8; i++) {
      const mainOid = normalizeOid(`${OUTLET_STATUS_BASE}.${i}`);
      const fbOid = normalizeOid(`${OUTLET_FALLBACK_BASE}.${i}`);

      if (raw[mainOid] !== undefined) outlets.push(parseCyberOutletStatus(raw[mainOid]));
      else if (raw[fbOid] !== undefined) outlets.push(parseCyberOutletFallback(raw[fbOid]));
      else outlets.push("N/A");
    }

    const chk = maybeFlipOutlets(outlets);

    // ============================================================
    // ✅ KEY FIX: ถ้า "Device Load" เป็น 0 จริง -> suppress ค่า outlet watt ค้าง
    //
    // หลักคิด:
    // - ถ้า lineCurrent=0 และ linePower=0 (เหมือนหน้าเว็บ) => PDU OFF/ไม่จ่ายจริง
    // - ในกรณีนี้ outlet watt บางรุ่นอาจค้าง/เป็น last measured -> ห้ามเอาไปคิด
    // ============================================================
    const lineSaysOff =
      (Number.isFinite(linePower) && isZeroish(linePower)) &&
      (Number.isFinite(lineCurrent) && isZeroish(lineCurrent));

    // บางรุ่น status OID บอก OFF ทั้งหมด (แม้จะไม่ 100% reliable) แต่ใช้เป็นตัวช่วยได้
    const allOutletsOffByStatus =
      chk.outlets.filter((x) => x === "OFF").length === 8;

    const deviceShouldSuppress = lineSaysOff || allOutletsOffByStatus;

    // ---------- auto-switch (แต่ต้องเคารพ suppress ก่อน) ----------
    let power = linePower;
    let current = lineCurrent;

    if (deviceShouldSuppress) {
      // ✅ บังคับเป็น 0 ทั้งหมด ไม่ให้กระทบส่วนอื่น
      power = 0;
      current = 0;

      // บังคับ outlets เป็น OFF
      for (let i = 0; i < 8; i++) chk.outlets[i] = "OFF";

      // outlet watt table แม้จะอ่านได้ ก็ไม่เอาไปใช้ (ถือว่า 0)
      for (let i = 0; i < outletWatts.length; i++) outletWatts[i] = 0;
      outletPowerSum = 0;
    } else {
      // ✅ ใช้ logic เดิม: ถ้า outlet sum มีเหตุผลกว่า linePower -> สลับมาใช้ sum
      const lineOk = Number.isFinite(linePower) && linePower >= 0;
      const sumOk =
        outletPowerSeen > 0 && Number.isFinite(outletPowerSum) && outletPowerSum > 0;

      if (lineOk && sumOk) {
        const diffPct = Math.abs(outletPowerSum - linePower) / Math.max(1, linePower);
        if (diffPct > 0.2) {
          power = outletPowerSum;
          current =
            Number.isFinite(voltage) && voltage > 0 ? power / voltage : NaN;
        }
      } else if (sumOk) {
        power = outletPowerSum;
        current =
          Number.isFinite(voltage) && voltage > 0 ? power / voltage : NaN;
      }
    }

    // ✅ สร้าง outlets_detail ให้ pdu-writer.js ใช้
    const outlets_detail = {};
    for (let i = 1; i <= 8; i++) {
      outlets_detail[`Port${i}`] = chk.outlets[i - 1]; // "ON"/"OFF"/"N/A"
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

      // ใช้ writer
      outlets_detail,

      // เผื่อ frontend ยังใช้ array
      outlets: chk.outlets,

      // debug flag (ถ้าคุณอยากเอาไปโชว์ badge)
      suppressed: deviceShouldSuppress ? true : false,

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
      outlets_detail: {
        Port1: "N/A",
        Port2: "N/A",
        Port3: "N/A",
        Port4: "N/A",
        Port5: "N/A",
        Port6: "N/A",
        Port7: "N/A",
        Port8: "N/A",
      },
      outlets: Array(8).fill("N/A"),
      suppressed: false,
      error: err?.message || String(err),
    };
  } finally {
    session.close();
  }
}

module.exports = { pollCyberpower };