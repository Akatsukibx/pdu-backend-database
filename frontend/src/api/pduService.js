// frontend/src/api/pduService.js
import axios from "axios";

// ✅ รองรับ .env (VITE_API_BASE=http://localhost:8000)
const API_BASE_URL =
  (import.meta.env?.VITE_API_BASE || "http://localhost:8000") + "/api";

// ===============================
// ---------- auth helpers ----------
// ===============================
const getToken = () => {
  try {
    return localStorage.getItem("pdu_token") || "";
  } catch {
    return "";
  }
};

const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ✅ อ่าน error จาก response ให้ละเอียด (json/text)
const readErrorText = async (response) => {
  try {
    const ct = response.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await response.json();
      return j?.error || j?.message || "";
    }
    return await response.text();
  } catch {
    return "";
  }
};

// ✅ fetch wrapper ที่แนบ token + โยน error พร้อม status
const fetchWithAuth = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const msg = await readErrorText(res);
    const err = new Error(msg || res.statusText || `HTTP ${res.status}`);
    err.status = res.status;
    err.responseText = msg || "";
    throw err;
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;

  return res.json();
};

// ✅ axios แนบ token ทุกครั้ง (สำหรับ history chart)
let interceptorAdded = false;
if (!interceptorAdded) {
  interceptorAdded = true;

  axios.interceptors.request.use((config) => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
}

// ===============================
// ---------- helpers ----------
// ===============================
const toNumOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toNumOrZero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toUpper = (v) => String(v ?? "").trim().toUpperCase();

const isDebug = () => {
  try {
    return localStorage.getItem("PDU_DEBUG") === "1";
  } catch {
    return false;
  }
};

const normalizeStatus = (item) => {
  const raw = toUpper(item?.connection_status ?? item?.status);
  return raw === "ONLINE" ? "online" : "offline";
};

const pickPowerFromApi = (item) => {
  const candidates = [item?.power, item?.watt, item?.power_w, item?.load_w];
  for (const v of candidates) {
    const n = toNumOrNull(v);
    if (n !== null) return n;
  }
  return null;
};

/**
 * ✅ อนุมานโซนจาก "ชื่อเครื่อง"
 * - ICT1104/1 -> ICT
 * - PN1 -> PN
 * - PKY-1 -> PKY
 * - CE0xxxx -> CE
 * - UB-001 -> UB
 * - Dent1f3 -> DENT
 * - "61seat meeting" / "BAWORN MEETING" -> MEETING
 */
const inferLocationFromName = (name) => {
  const n = toUpper(name);

  if (!n) return null;

  // meeting keywords (ให้ชนะถ้าชื่อมีคำ meeting จริงๆ)
  if (n.includes("MEETING") || n.includes("SEAT MEETING")) return "MEETING";
  if (n.includes("BAWORN")) return "MEETING";

  // zones by prefix / contains pattern
  if (n.startsWith("ICT")) return "ICT";
  if (n.startsWith("PN")) return "PN";
  if (n.startsWith("PKY")) return "PKY";
  if (n.startsWith("CE")) return "CE";
  if (n.startsWith("UB")) return "UB";
  if (n.startsWith("HP")) return "HP";

  // DENT: Dent1f3 / DENTxxx / "DENT ..."
  if (n.startsWith("DENT") || n.includes("DENT")) return "DENT";

  return null;
};

/**
 * ✅ เลือก location:
 * 1) cfg.location (แหล่งจริง)
 * 2) dashboard.location
 * 3) อนุมานจากชื่อ (สำคัญ: แก้ DENT/MEETING นับผิด)
 *
 * แต่ถ้า cfg.location เป็น MEETING/ว่าง แล้วชื่อบอกโซนอื่น -> override
 */
const pickLocation = ({ cfg, dashItem, mergedName }) => {
  const cfgLoc = toUpper(cfg?.location);
  const dashLoc = toUpper(
    dashItem?.location ?? dashItem?.loc ?? dashItem?.zone ?? ""
  );
  const inferred = inferLocationFromName(mergedName);

  // ถ้า cfgLoc ว่าง -> ใช้ inferred/dashLoc
  if (!cfgLoc) return inferred || (dashLoc ? dashLoc : "MEETING");

  // ถ้า cfgLoc เป็น MEETING แต่ชื่อมันเป็น DENT/ICT/ฯลฯ -> override ให้ถูกโซน
  if (cfgLoc === "MEETING" && inferred && inferred !== "MEETING") return inferred;

  // ปกติยึด cfgLoc
  return cfgLoc;
};

// ===============================
// ---------- API ----------
// ===============================
export const fetchDashboardSummary = async () => {
  const data = await fetchWithAuth(`${API_BASE_URL}/dashboard/summary`);
  if (isDebug()) console.log("[/dashboard/summary]", data);

  return {
    online: toNumOrZero(data?.online),
    offline: toNumOrZero(data?.offline),
    total_load_w: toNumOrZero(data?.total_load_w),
    total_current_a: toNumOrZero(data?.total_current_a),
  };
};

export const fetchPDUList = async () => {
  // 1) realtime
  const dashboard = await fetchWithAuth(`${API_BASE_URL}/dashboard`);

  // 2) config
  const pdus = await fetchWithAuth(`${API_BASE_URL}/pdus`);
  const cfgById = new Map((pdus || []).map((p) => [Number(p.id), p]));

  const merged = (dashboard || []).map((item) => {
    const cfg = cfgById.get(Number(item.id)) || null;

    const power = pickPowerFromApi(item);

    const isActive =
      typeof cfg?.is_active === "boolean" ? cfg.is_active : true;

    const mergedName = item?.name ?? cfg?.name ?? "";
    const mergedIp = item?.ip_address ?? item?.ip ?? cfg?.ip_address ?? cfg?.ip ?? "";

    return {
      id: item.id,
      name: mergedName,
      ip: mergedIp,

      // ✅ แก้ตรงนี้: location จะไม่ไหลไป MEETING ทั้งหมดแล้ว
      location: pickLocation({ cfg, dashItem: item, mergedName }),
      is_active: isActive,

      brand: cfg?.brand ?? null,
      model: cfg?.model ?? null,
      snmp_version: cfg?.snmp_version ?? null,
      snmp_port: cfg?.snmp_port ?? null,
      snmp_community: cfg?.snmp_community ?? null,
      snmp_timeout_ms: cfg?.snmp_timeout_ms ?? null,
      snmp_retries: cfg?.snmp_retries ?? null,

      status: normalizeStatus(item),
      metrics: {
        current: toNumOrZero(item?.current),
        voltage: toNumOrZero(item?.voltage),
        power,
        hasPower: power !== null,
      },

      raw: isDebug() ? { dashboard: item, cfg } : undefined,
    };
  });

  return merged.filter((x) => x.is_active !== false);
};

/**
 * ===============================
 * Device Detail (RoomView)
 * GET /api/device/:id
 * ===============================
 */
export const fetchPDUMonitor = async (pduId) => {
  const data = await fetchWithAuth(`${API_BASE_URL}/device/${pduId}`);
  return transformMonitorData(data);
};

const parsePgTimestampAsThai = (ts) => {
  if (!ts) return null;
  let s = String(ts).trim();
  if (s.includes(" ") && !s.includes("T")) s = s.replace(" ", "T");
  if (!/[zZ]$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s += "+07:00";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatThaiDateTime = (dateObj) => {
  if (!dateObj) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(dateObj);
};

const transformMonitorData = (data) => {
  const { info, status, outlets, usage } = data || {};

  const formatNum = (num, decimals = 2) => {
    const n = Number(num);
    return Number.isFinite(n) ? n.toFixed(decimals) : "--";
  };

  const statusUpper = toUpper(status?.connection_status ?? status?.status);
  const lastUpdated = formatThaiDateTime(parsePgTimestampAsThai(status?.updated_at));

  return {
    id: info?.id,
    info: {
      name: info?.name,
      location: info?.location,
      model: info?.model,
      ip: info?.ip_address,
      deviceUrl: info?.ip_address ? `http://${info.ip_address}` : "",
    },
    status: {
      isOffline: statusUpper !== "ONLINE",
      uptime: status?.uptime || "-",
      lastSeen: status?.last_seen ? new Date(status.last_seen).toLocaleString() : "-",
      lastUpdated,
      hasAlarm: !!(status?.alarm && status.alarm !== "NORMAL"),
      alarmText: status?.alarm || "NORMAL",
    },
    usage: usage
      ? {
          isActive: !!usage.is_active,
          startedAt: usage.started_at,
          endedAt: usage.ended_at,
          durationSeconds: Number(usage.duration_seconds || 0),
          lastCurrent: usage.last_current ?? null,
        }
      : null,
    metrics: {
      current: formatNum(status?.current, 2),
      power: formatNum(status?.power, 1),
      voltage: formatNum(status?.voltage, 1),
      temperature: formatNum(status?.temperature, 1),
      energy: formatNum(status?.energy, 2),
      loadBar: {
        percent: status?.current ? Math.min((Number(status.current) / 20) * 100, 100) : 0,
        color: Number(status?.current) > 16 ? "var(--status-critical)" : "var(--status-online)",
      },
    },
    outlets: (outlets || []).map((o) => ({
      id: o.outlet_no,
      name: o.name,
      isOn: toUpper(o.status) === "ON",
      formattedCurrent: o.current ? Number(o.current).toFixed(2) : "N/A",
    })),
  };
};

export const getDeviceHistory = (id, start, end) => {
  return axios.get(`${API_BASE_URL}/history/device/${id}`, {
    params: { start, end },
  });
};

export const createPDU = async (payload) => {
  return fetchWithAuth(`${API_BASE_URL}/pdus`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};