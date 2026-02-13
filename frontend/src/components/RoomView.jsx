// RoomView.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchPDUMonitor } from '../api/pduService';
import PduHistoryChart from '../components/PduHistoryChart';
import EditPduModal from '../components/EditPduModal'; // ✅ ใช้ตัวเดียวกับ Dashboard

const DETAIL_REFRESH_MS = 60000; // ✅ ดึงข้อมูลใหม่ทุก 1 นาที (ค่าเป็นมิลลิวินาที)

const RoomView = ({ pduId, pduName, onBack }) => {
  const [pdu, setPdu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const deviceId = pduId;

  // ✅ เพิ่ม: uptime ตามการใช้งาน (อัปเดตทุก 1 นาที)
  const [usageUptimeText, setUsageUptimeText] = useState("-");

  // ✅ กันยิงซ้อน
  const isFetchingRef = useRef(false);

  // ✅ กัน stale response ตอนเปลี่ยน pduId (request เก่ามาทีหลัง)
  const requestSeqRef = useRef(0);

  // =========================
  // ✅ EDIT (เหมือน Dashboard)
  // =========================
  const [editOpen, setEditOpen] = useState(false);
  const [editPdu, setEditPdu] = useState(null); // ✅ snapshot สำหรับ modal (กันเด้งกลับ)

  const openEdit = useCallback(() => {
    if (!pdu?.info) return;

    // ✅ snapshot “ค่าปัจจุบัน” ตอนกดเปิด modal (ห้ามผูกกับ pdu.info สด ๆ)
    const info = pdu.info;
    setEditPdu({
      id: Number(pduId), // สำคัญ: EditPduModal ใช้ pdu.id
      name: info.name ?? "",
      ip: info.ip ?? info.ip_address ?? "",       // ให้ modal อ่านได้ทั้ง ip/ip_address
      ip_address: info.ip ?? info.ip_address ?? "",
      location: info.location ?? "MEETING",
      brand: info.brand ?? "ATEN",
      model: info.model ?? "PE6208AV",
      snmp_version: info.snmp_version ?? "2c",
      snmp_community: info.snmp_community ?? "public",
      is_active: typeof info.is_active === "boolean" ? info.is_active : true,
    });

    setEditOpen(true);
  }, [pdu, pduId]);

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    // จะเคลียร์หรือไม่เคลียร์ก็ได้ แต่เคลียร์จะชัวร์ว่าเปิดใหม่ได้ค่าใหม่
    setEditPdu(null);
  }, []);

  const onSavedEdit = useCallback(async () => {
    // ✅ บันทึกแล้วค่อยรีเฟรชข้อมูลหน้า RoomView
    await loadData(true);
  }, []); // loadData ถูกประกาศข้างล่าง แต่ useCallback นี้ไม่ต้องจับ loadData ถ้าคุณไม่ lint เข้ม
  // ถ้า eslint เตือน ให้ย้าย onSavedEdit ไปไว้หลังประกาศ loadData หรือใส่ loadData ใน deps

  const loadData = useCallback(async (isFirstLoad = false) => {
    if (!pduId) return;

    // กันยิงซ้อน
    if (isFetchingRef.current) return;

    // กันยิงตอน tab ไม่ได้ active (ลดภาระ backend)
    if (!isFirstLoad && document.hidden) return;

    // ✅ (ไม่เปลี่ยน behavior เดิม) ยังรีเฟรชได้แม้เปิด modal
    isFetchingRef.current = true;
    const mySeq = ++requestSeqRef.current;

    try {
      const data = await fetchPDUMonitor(pduId);

      if (mySeq !== requestSeqRef.current) return;

      setPdu(data);
      setError(null);
    } catch (err) {
      if (mySeq !== requestSeqRef.current) return;

      setError(err?.message || String(err));
    } finally {
      if (mySeq !== requestSeqRef.current) return;

      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [pduId]);

  // ✅ ถ้า eslint เตือน deps ของ onSavedEdit ให้ใช้ตัวนี้แทน
  const onSavedEditFixed = useCallback(async () => {
    await loadData(true);
  }, [loadData]);

  useEffect(() => {
    setPdu(null);
    setUsageUptimeText("-");

    setError(null);
    setLoading(true);

    loadData(true);

    const interval = setInterval(() => {
      loadData(false);
    }, DETAIL_REFRESH_MS);

    return () => {
      clearInterval(interval);
      requestSeqRef.current++;
      isFetchingRef.current = false;
    };
  }, [pduId, loadData]);

  // ✅ เพิ่ม: helper format duration เป็น "xh ym" / "xm"
  const formatDuration = (sec) => {
    const s = Math.max(0, Number(sec) || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);

    if (h > 0 && m > 0) return `${h} h ${m} m`;
    if (h > 0) return `${h} h`;
    return `${m} m`;
  };

  // ✅ เพิ่ม: parse startedAt (timestamp without time zone) ให้เป็นเวลาไทย
  const parseStartedAtThai = (ts) => {
    if (!ts) return null;
    let s = String(ts).trim();
    if (s.includes(" ") && !s.includes("T")) s = s.replace(" ", "T");
    if (!/[zZ]$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s += "+07:00";
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  useEffect(() => {
    const usage = pdu?.usage;

    if (!usage) {
      setUsageUptimeText("-");
      return;
    }

    const tick = () => {
      if (usage.isActive) {
        const start = parseStartedAtThai(usage.startedAt);
        if (!start) {
          setUsageUptimeText("-");
          return;
        }
        const now = new Date();
        const diffSec = Math.floor((now - start) / 1000);
        setUsageUptimeText(formatDuration(diffSec));
      } else {
        setUsageUptimeText(formatDuration(usage.durationSeconds));
      }
    };

    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [pdu?.usage]);

  if (loading && !pdu) return <div style={{ padding: '2rem' }}>Loading PDU Data...</div>;
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>Error: {error}</div>;
  if (!pdu) return <div style={{ padding: '2rem' }}>No PDU data (pdu is null)</div>;

  const styles = {
    cardHeader: {
      marginTop: 0,
      marginBottom: '1rem',
      fontSize: '1.25rem',
      fontWeight: 500,
      borderBottom: '1px solid var(--border-main)',
      paddingBottom: '0.5rem'
    },
    paramLabel: {
      fontSize: '0.85rem',
      fontWeight: 'bold',
      color: 'var(--text-primary)',
      marginBottom: '0.25rem'
    },
    paramValue: {
      fontSize: '0.95rem',
      color: 'var(--text-secondary)'
    },

    // ✅ header row + ปุ่ม Edit แบบ Dashboard
    cardHeaderRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginTop: 0,
      marginBottom: "1rem",
      borderBottom: "1px solid var(--border-main)",
      paddingBottom: "0.5rem",
    },
    editBtn: {
      padding: "6px 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
      color: "var(--text-primary)",
      cursor: "pointer",
      fontSize: 13,
      whiteSpace: "nowrap",
    },
  };

  const { info, metrics, status, outlets } = pdu;

  return (
    <div>
      <h2 className="page-title">
        Monitoring: {pduName || info.name}
      </h2>

      <div className="pdu-list">
        <div style={{ marginBottom: '3rem' }}>
          <div style={{ marginBottom: '1rem', color: 'var(--accent-blue)', fontWeight: 'bold', fontSize: '1.1rem' }}>
            DEVICE: {info.name} ({pdu.id})
          </div>

          <div>
            <h2>📈 PDU History</h2>
            <PduHistoryChart deviceId={deviceId} />
          </div>

          {/* 1. Active Alarms */}
          <div className="panel" style={{ marginBottom: '1rem' }}>
            <h3 style={styles.cardHeader}>Active Alarms</h3>
            {!status.hasAlarm ? (
              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--status-online)', fontWeight: 600 }}>
                <span style={{ fontSize: '1.2rem', marginRight: '8px' }}>✓</span> No Alarms Present
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--status-critical)', fontWeight: 600 }}>
                <span style={{ fontSize: '1.2rem', marginRight: '8px' }}>⚠</span> Critical Alarm Active ({status.alarmCount})
              </div>
            )}
          </div>

          {/* 2. Load Status */}
          <div className="panel" style={{ marginBottom: '1rem' }}>
            <h3 style={styles.cardHeader}>Load Status</h3>
            <div style={{ marginBottom: '0.5rem', fontWeight: 500 }}>Phase L1 Load</div>
            <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              {metrics.current} A
            </div>

            <div style={{
              height: '24px',
              backgroundColor: '#333',
              borderRadius: '4px',
              overflow: 'hidden',
              position: 'relative',
              display: 'flex'
            }}>
              <div style={{
                width: `${metrics.loadBar.percent}%`,
                backgroundColor: metrics.loadBar.color,
                height: '100%',
                transition: 'width 0.5s'
              }}></div>

              <div style={{ position: 'absolute', right: '20%', height: '100%', width: '2px', background: 'rgba(255,255,255,0.2)' }}></div>
              <div style={{ position: 'absolute', right: '10%', height: '100%', width: '2px', background: 'rgba(255,255,255,0.2)' }}></div>
            </div>
          </div>

          {/* 3. Parameters Grid */}
          <div className="panel" style={{ marginBottom: '1rem' }}>
            <div style={styles.cardHeaderRow}>
              <h3 style={{ margin: 0, fontSize: styles.cardHeader.fontSize, fontWeight: styles.cardHeader.fontWeight }}>
                Switched Rack PDU Parameters
              </h3>

              {/* ✅ สำคัญ: ผูก onClick ให้เปิด modal */}
              <button style={styles.editBtn} onClick={openEdit}>
                Edit
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1rem' }}>
              <div>
                <div style={styles.paramLabel}>Name</div>
                <div style={styles.paramValue}>{info.name}</div>
              </div>
              <div>
                <div style={styles.paramLabel}>Location</div>
                <div style={styles.paramValue}>{info.location}</div>
              </div>
              <div>
                <div style={styles.paramLabel}>Model Number</div>
                <div style={styles.paramValue}>{info.model}</div>
              </div>
              <div>
                <div style={styles.paramLabel}>IP Address</div>
                <div style={styles.paramValue}>{info.ip}</div>
              </div>

              <div>
                <div style={styles.paramLabel}>Uptime</div>
                <div style={styles.paramValue}>{usageUptimeText}</div>
              </div>

              <div>
                <div style={styles.paramLabel}>Current (A)</div>
                <div style={styles.paramValue}>{metrics.current} A</div>
              </div>
              <div>
                <div style={styles.paramLabel}>Power (W)</div>
                <div style={styles.paramValue}>{metrics.power} W</div>
              </div>
              <div>
                <div style={styles.paramLabel}>Voltage (V)</div>
                <div style={styles.paramValue}>{metrics.voltage} V</div>
              </div>

              <div>
                <div style={styles.paramLabel}>Last Updated</div>
                <div style={styles.paramValue}>
                  {pdu?.status?.lastUpdated ?? "-"}
                </div>
              </div>
            </div>
          </div>

          {/* 5. Outlets */}
          <div className="panel">
            <h3 style={styles.cardHeader}>Outlet Status</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: '400px' }}>
              {outlets && outlets.map((outlet) => (
                <div key={outlet.id} style={{ textAlign: 'center' }}>
                  <div style={{
                    width: '24px', height: '24px',
                    borderRadius: '50%',
                    backgroundColor: outlet.isOn ? 'var(--status-online)' : '#444',
                    boxShadow: outlet.isOn ? '0 0 10px var(--status-online)' : 'inset 0 2px 4px rgba(0,0,0,0.5)',
                    marginBottom: '0.5rem',
                    margin: '0 auto'
                  }}></div>
                  <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{outlet.id}</span>
                </div>
              ))}
              {(!outlets || outlets.length === 0) && <div style={{ color: '#666' }}>No outlets data</div>}
            </div>
          </div>

          {/* 6. Device Link */}
          <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
            <a
              href={info.deviceUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--accent-blue)',
                textDecoration: 'none',
                fontWeight: 600,
                padding: '0.5rem 1rem',
                border: '1px solid var(--accent-blue)',
                borderRadius: '4px',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(52, 152, 219, 0.1)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              onClick={() => console.log('Opening device URL:', info.deviceUrl)}
            >
              <span>⚙️</span> Access Device Web Interface ({info.ip}) &rarr;
            </a>
          </div>

        </div>
      </div>

      {/* ✅ ใช้ modal ตัวเดียวกับ Dashboard และส่ง snapshot เข้าไป */}
      <EditPduModal
        open={editOpen}
        pdu={editPdu}
        onClose={closeEdit}
        onSaved={onSavedEditFixed}
      />
    </div>
  );
};

export default RoomView;