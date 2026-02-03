import React, { useState, useEffect } from 'react';
import { fetchPDUMonitor } from '../api/pduService';
import PduHistoryChart from '../components/PduHistoryChart';

const RoomView = ({ pduId, pduName, onBack }) => {
    const [pdu, setPdu] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const deviceId = 1;

    const loadData = async () => {
        try {
            // setLoading(true); // Don't block UI on refresh
            const data = await fetchPDUMonitor(pduId);
            setPdu(data);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // ล้างข้อมูลเก่าออกก่อน เพื่อป้องกันชื่อเก่าค้างตอนกำลังโหลดเครื่องใหม่
        setPdu(null);
        setLoading(true);

        loadData(); // ฟังก์ชันที่ไป fetch ข้อมูลจาก API

        const interval = setInterval(loadData, 5000);
        return () => clearInterval(interval);
    }, [pduId]); // <--- ต้องมี pduId ตรงนี้เพื่อให้มันโหลดข้อมูลใหม่เมื่อเปลี่ยนเครื่อง

    if (loading && !pdu) return <div style={{ padding: '2rem' }}>Loading PDU Data...</div>;
    if (error) return <div style={{ padding: '2rem', color: 'red' }}>Error: {error}</div>;
    if (!pdu) return null;

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
        }
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

                        {/* Progress Bar */}
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

                            {/* Markers */}
                            <div style={{ position: 'absolute', right: '20%', height: '100%', width: '2px', background: 'rgba(255,255,255,0.2)' }}></div>
                            <div style={{ position: 'absolute', right: '10%', height: '100%', width: '2px', background: 'rgba(255,255,255,0.2)' }}></div>
                        </div>
                        <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
                            <button className="btn-small">More &gt;</button>
                        </div>
                    </div>

                    {/* 3. Parameters Grid */}
                    <div className="panel" style={{ marginBottom: '1rem' }}>
                        <h3 style={styles.cardHeader}>Switched Rack PDU Parameters</h3>
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
                                <div style={styles.paramValue}>{status.uptime}</div>
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
                                <div style={styles.paramLabel}>Energy (kWh)</div>
                                <div style={styles.paramValue}>{metrics.energy} kWh</div>
                            </div>
                            <div>
                                <div style={styles.paramLabel}>Last Updated</div>
                                <div style={styles.paramValue}>
                                    {pdu.status.uptime} {/* นี่คือค่าที่แปลงมาจาก last_seen ใน Service ด้านบน */}
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
                                    <div style={{ fontSize: '0.7rem', color: '#999' }}>{outlet.formattedCurrent}A</div>
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
        </div>
    );
};

export default RoomView;
