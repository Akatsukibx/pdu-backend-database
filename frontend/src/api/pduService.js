// pduService.js
const API_BASE_URL = "http://localhost:8000/api";

// ---------- helpers ----------
const toNumOrNull = (v) => {
  // รับทั้ง number และ string
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toNumOrZero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toUpper = (v) => String(v ?? "").trim().toUpperCase();

// เปิด/ปิด debug log ได้ง่าย ๆ
// ใช้: localStorage.setItem("PDU_DEBUG", "1") แล้ว refresh
// ปิด: localStorage.removeItem("PDU_DEBUG")
const isDebug = () => {
  try {
    return localStorage.getItem("PDU_DEBUG") === "1";
  } catch {
    return false;
  }
};

/**
 * ✅ NEW: ดึง Summary จาก Backend (รวม power/current ให้แล้ว)
 * ต้องมี route: GET /api/dashboard/summary
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
 * ใช้หา power จาก API โดย "ยึดค่าจาก DB" เป็นหลัก
 * - ถ้าไม่มีค่าเลย -> null
 */
const pickPowerFromApi = (item) => {
  // รองรับหลายชื่อ field เผื่อ view/alias ไม่ตรงกัน
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

/**
 * สถานะอุปกรณ์
 * - รองรับทั้ง status และ connection_status จาก backend
 */
const normalizeStatus = (item) => {
  const rawStatus = toUpper(item.connection_status ?? item.status);
  return rawStatus === "ONLINE" ? "online" : "offline";
};

// 1) ดึงรายการทั้งหมด (หน้า Dashboard overview)
export const fetchPDUList = async () => {
  const response = await fetch(`${API_BASE_URL}/dashboard`);
  if (!response.ok) throw new Error("Failed to fetch PDU list");
  const data = await response.json();

  if (isDebug()) {
    console.log("[/dashboard raw sample]", data?.[0]);
    console.log("[/dashboard raw keys]", data?.[0] ? Object.keys(data[0]) : []);
  }

  return (data || []).map((item) => {
    const status = normalizeStatus(item);

    // current/voltage ใช้เป็น number เพื่อ UI
    const current = toNumOrZero(item.current);
    const voltage = toNumOrZero(item.voltage);

    // ✅ POWER: ยึดจาก DB เท่านั้น
    const powerFromApi = pickPowerFromApi(item);

    // ✅ ถ้าไม่มี power จาก DB -> null (เพื่อให้ component เลือกไม่รวม)
    const power = powerFromApi;

    const mapped = {
      id: item.id,
      name: item.name,
      ip: item.ip_address,
      status, // online/offline

      metrics: {
        current,               // A (รวม Total Current)
        power,                 // W (รวม Total Load) -> null ถ้าไม่มีจาก DB
        voltage,               // เผื่อใช้
        hasPower: power !== null, // ✅ ตัวช่วยให้หน้า dashboard ตัดสินใจ
      },

      // เผื่อใช้ในอนาคต
      raw: isDebug() ? item : undefined,
    };

    if (isDebug()) {
      console.log("[mapped device]", mapped);
    }

    return mapped;
  });
};

// 2) ดึงรายละเอียดเครื่องรายตัว (หน้า RoomView.js)
export const fetchPDUMonitor = async (pduId) => {
  const response = await fetch(`${API_BASE_URL}/device/${pduId}`);
  if (!response.ok) throw new Error("Failed to fetch PDU monitor data");
  const data = await response.json();
  return transformMonitorData(data);
};

// 3) แปลงข้อมูล Detail ให้พร้อมใช้กับ UI
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
      lastSeen: status?.last_seen ? new Date(status.last_seen).toLocaleString() : "-",
      hasAlarm: !!(status?.alarm && status.alarm !== "NORMAL"),
      alarmText: status?.alarm || "NORMAL",
    },
    metrics: {
      current: formatNum(status?.current, 2),
      power: formatNum(status?.power, 1),
      voltage: formatNum(status?.voltage, 1),
      temperature: formatNum(status?.temperature, 1),
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
      formattedCurrent: "N/A",
    })),
  };
};