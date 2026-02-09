// frontend/src/api/pduService.js
import axios from "axios";

// ✅ รองรับ .env (VITE_API_BASE=http://localhost:8000)
const API_BASE_URL =
  (import.meta.env?.VITE_API_BASE || "http://localhost:8000") + "/api";

// ===============================
// ✅ Auth helpers
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

// ✅ fetch wrapper ที่แนบ token + โยน error พร้อม status (ให้ App.jsx จับ 401 ได้ชัวร์)
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
    err.status = res.status; // ✅ สำคัญ: App.jsx จะเช็ค error.status === 401
    err.responseText = msg || ""; // ✅ เผื่อ debug
    throw err;
  }

  // ✅ ป้องกันกรณี 204/ไม่มี body
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

// debug toggle
const isDebug = () => {
  try {
    return localStorage.getItem("PDU_DEBUG") === "1";
  } catch {
    return false;
  }
};

/**
 * ✅ Parse/Format เวลาไทย (สำหรับ Postgres timestamp without time zone)
 * updated_at ตัวอย่าง: "2026-02-09 11:32:16.396477"
 */
const parsePgTimestampAsThai = (ts) => {
  if (!ts) return null;
  let s = String(ts).trim();

  // "YYYY-MM-DD HH:mm:ss.xxx" -> "YYYY-MM-DDTHH:mm:ss.xxx"
  if (s.includes(" ") && !s.includes("T")) s = s.replace(" ", "T");

  // ถ้าไม่มี timezone ต่อท้าย ให้ตีความว่าเป็นเวลาไทย +07:00
  if (!/[zZ]$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) {
    s += "+07:00";
  }

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

/**
 * ===============================
 * Dashboard Summary
 * GET /api/dashboard/summary
 * ===============================
 */
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

/**
 * ===============================
 * Dashboard Device List
 * GET /api/dashboard
 * ===============================
 */
const pickPowerFromApi = (item) => {
  const candidates = [item?.power, item?.watt, item?.power_w, item?.load_w];
  for (const v of candidates) {
    const n = toNumOrNull(v);
    if (n !== null) return n;
  }
  return null;
};

const normalizeStatus = (item) => {
  const raw = toUpper(item?.connection_status ?? item?.status);
  return raw === "ONLINE" ? "online" : "offline";
};

export const fetchPDUList = async () => {
  const data = await fetchWithAuth(`${API_BASE_URL}/dashboard`);

  return (data || []).map((item) => {
    const power = pickPowerFromApi(item);

    return {
      id: item.id,
      name: item.name,
      ip: item.ip_address,
      status: normalizeStatus(item),
      metrics: {
        current: toNumOrZero(item.current),
        voltage: toNumOrZero(item.voltage),
        power,
        hasPower: power !== null,
      },
      raw: isDebug() ? item : undefined,
    };
  });
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

const transformMonitorData = (data) => {
  const { info, status, outlets, usage } = data || {};

  const formatNum = (num, decimals = 2) => {
    const n = Number(num);
    return Number.isFinite(n) ? n.toFixed(decimals) : "--";
  };

  const statusUpper = toUpper(status?.connection_status ?? status?.status);

  // ✅ lastUpdated จาก status.updated_at (มาจาก VIEW)
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

      // ของเดิม (ถ้ามี)
      lastSeen: status?.last_seen ? new Date(status.last_seen).toLocaleString() : "-",

      // ✅ ของใหม่
      lastUpdated,

      hasAlarm: !!(status?.alarm && status.alarm !== "NORMAL"),
      alarmText: status?.alarm || "NORMAL",
    },

    // ✅ เพิ่ม usage (ไม่กระทบส่วนอื่น)
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
        percent: status?.current
          ? Math.min((Number(status.current) / 20) * 100, 100)
          : 0,
        color:
          Number(status?.current) > 16
            ? "var(--status-critical)"
            : "var(--status-online)",
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

/**
 * ===============================
 * Device History (Chart)
 * GET /api/history/device/:id
 * ===============================
 */
export const getDeviceHistory = (id, start, end) => {
  return axios.get(`${API_BASE_URL}/history/device/${id}`, {
    params: { start, end },
  });
};