// pduService.js
import axios from "axios";

const API_BASE_URL = "http://localhost:8000/api";

// ---------- helpers ----------
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
 * ===============================
 * Dashboard Summary
 * GET /api/dashboard/summary
 * ===============================
 */
export const fetchDashboardSummary = async () => {
  const response = await fetch(`${API_BASE_URL}/dashboard/summary`);
  if (!response.ok) throw new Error("Failed to fetch dashboard summary");
  const data = await response.json();

  if (isDebug()) console.log("[/dashboard/summary]", data);

  return {
    online: toNumOrZero(data.online),
    offline: toNumOrZero(data.offline),
    total_load_w: toNumOrZero(data.total_load_w),
    total_current_a: toNumOrZero(data.total_current_a),
  };
};

/**
 * ===============================
 * Dashboard Device List
 * GET /api/dashboard
 * ===============================
 */
const pickPowerFromApi = (item) => {
  const candidates = [
    item.power,
    item.watt,
    item.power_w,
    item.load_w,
  ];
  for (const v of candidates) {
    const n = toNumOrNull(v);
    if (n !== null) return n;
  }
  return null;
};

const normalizeStatus = (item) => {
  const raw = toUpper(item.connection_status ?? item.status);
  return raw === "ONLINE" ? "online" : "offline";
};

export const fetchPDUList = async () => {
  const response = await fetch(`${API_BASE_URL}/dashboard`);
  if (!response.ok) throw new Error("Failed to fetch PDU list");
  const data = await response.json();

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
  const response = await fetch(`${API_BASE_URL}/device/${pduId}`);
  if (!response.ok) throw new Error("Failed to fetch PDU monitor data");
  const data = await response.json();
  return transformMonitorData(data);
};

const transformMonitorData = (data) => {
  const { info, status, outlets } = data || {};

  const formatNum = (num, decimals = 2) => {
    const n = Number(num);
    return Number.isFinite(n) ? n.toFixed(decimals) : "--";
  };

  const statusUpper = toUpper(status?.connection_status ?? status?.status);

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
      lastSeen: status?.last_seen
        ? new Date(status.last_seen).toLocaleString()
        : "-",
      hasAlarm: !!(status?.alarm && status.alarm !== "NORMAL"),
      alarmText: status?.alarm || "NORMAL",
    },
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
      formattedCurrent: o.current
        ? Number(o.current).toFixed(2)
        : "N/A",
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
