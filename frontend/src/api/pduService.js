
import axios from "axios";
const API_BASE_URL = 'http://localhost:8000/api';
const API = "http://localhost:8000/api";

// 1. ดึงรายการทั้งหมด (ใช้หน้า Dashboard overview)
export const fetchPDUList = async () => {
    const response = await fetch(`${API_BASE_URL}/dashboard`);
    if (!response.ok) throw new Error('Failed to fetch PDU list');
    const data = await response.json();

    // แปลงโครงสร้างให้เข้ากับ NodeView.js
    return data.map(item => ({
        id: item.id,
        name: item.name,
        location: item.location,
        status: item.connection_status?.toUpperCase() === 'ONLINE'
            ? 'online'
            : 'offline',
        model: item.model,
        ip: item.ip_address,
        metrics: {
            voltage: item.voltage,
            current: item.current,
            power: item.power
        }
    }));

};

// 2. ดึงรายละเอียดเครื่องรายตัว (ใช้หน้า RoomView.js)
export const fetchPDUMonitor = async (pduId) => {
    const response = await fetch(`${API_BASE_URL}/device/${pduId}`);
    if (!response.ok) throw new Error('Failed to fetch PDU monitor data');
    const data = await response.json();

    return transformMonitorData(data);
};

const transformMonitorData = (data) => {
    const { info, status, outlets } = data;

    const formatNum = (num, decimals = 2) =>
        (num !== null && num !== undefined)
            ? Number(num).toFixed(decimals)
            : '0.00';

    return {
        id: info.id,
        info: {
            name: info.name,
            location: info.location,
            model: info.model,
            ip: info.ip_address,
            deviceUrl: `http://${info.ip_address}`
        },
        status: {
            isOffline: status?.connection_status !== 'ONLINE',
            lastSeen: status?.last_seen
                ? new Date(status.last_seen).toLocaleString()
                : '-',
            hasAlarm: status?.alarm && status.alarm !== 'NORMAL',
            alarmText: status?.alarm || 'NORMAL'
        },
        metrics: {
            current: formatNum(status?.current, 2),
            power: formatNum(status?.power, 1),
            voltage: formatNum(status?.voltage, 1),
            temperature: formatNum(status?.temperature, 1),
            loadBar: {
                percent: status?.current
                    ? Math.min((status.current / 20) * 100, 100)
                    : 0,
                color: status?.current > 16
                    ? 'var(--status-critical)'
                    : 'var(--status-online)'
            }
        },
        outlets: outlets.map(o => ({
            id: o.outlet_no,
            name: o.name,
            isOn: o.status === 'ON',
            formattedCurrent: 'N/A'
        }))
    };
};


export const getDeviceHistory = (id, start, end) => {
  return axios.get(`${API}/history/device/${id}`, {
    params: { start, end }
  });
};