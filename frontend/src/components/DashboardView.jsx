
// components/DashboardView.js
import { useState, useMemo } from "react";

const DashboardView = ({ pduList, onSelectDevice }) => {
    const [sortKey, setSortKey] = useState(null); // 'name' | 'current' | 'status'
    const [sortDir, setSortDir] = useState("asc"); // asc | desc

    // คำนวณค่าสรุป (Summary Metrics)
    const total = pduList.length;
    const online = pduList.filter(p => p.status?.toLowerCase() === 'online').length;
    const offline = total - online;

    const totalPower = pduList.reduce((sum, p) => sum + (Number(p.metrics?.power) || 0), 0);
    const totalAmp = pduList.reduce((sum, p) => sum + (Number(p.metrics?.current) || 0), 0);

    const toggleSort = (key) => {
        if (sortKey === key) {
            setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("asc");
        }
    };

    // กำหนดลำดับความสำคัญของสถานะ (Online มาก่อน Offline)
    const statusRank = {
        'online': 1,
        'offline': 2,
    };

    const sortedList = useMemo(() => {
        if (!sortKey) return pduList;

        return [...pduList].sort((a, b) => {
            let va, vb;

            if (sortKey === "name") {
                va = a.name?.toLowerCase() || "";
                vb = b.name?.toLowerCase() || "";
            } else if (sortKey === "current") {
                va = Number(a.metrics?.current) || 0;
                vb = Number(b.metrics?.current) || 0;
            } else if (sortKey === "status") {
                // แก้ไขให้ใช้ p.status โดยตรง และแปลงเป็น lowercase เพื่อเทียบกับ statusRank
                va = statusRank[a.status?.toLowerCase()] || 99;
                vb = statusRank[b.status?.toLowerCase()] || 99;
            }

            if (va < vb) return sortDir === "asc" ? -1 : 1;
            if (va > vb) return sortDir === "asc" ? 1 : -1;
            return 0;
        });
    }, [pduList, sortKey, sortDir]);

    return (
        <div className="dashboard-container">
            <h2 className="page-title">System Overview</h2>

            <div className="room-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div className="panel summary-card" style={{ borderLeft: '4px solid var(--status-online)', padding: '15px', background: 'var(--bg-panel)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>ONLINE DEVICES</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--status-online)' }}>{online}</div>
                </div>

                <div className="panel summary-card" style={{ borderLeft: '4px solid var(--status-critical)', padding: '15px', background: 'var(--bg-panel)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>OFFLINE DEVICES</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--status-critical)' }}>{offline}</div>
                </div>

                <div className="panel summary-card" style={{ borderLeft: '4px solid var(--accent-blue)', padding: '15px', background: 'var(--bg-panel)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>TOTAL LOAD (W)</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{totalPower.toLocaleString()} W</div>
                </div>

                <div className="panel summary-card" style={{ borderLeft: '4px solid #f39c12', padding: '15px', background: 'var(--bg-panel)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>TOTAL CURRENT (A)</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{totalAmp.toFixed(2)} A</div>
                </div>
            </div>

            <h3 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Device Status Detail</h3>
            <div style={{ overflowX: 'auto' }}>
                <table className="pdu-table" style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-panel)', borderRadius: '8px', overflow: 'hidden' }}>
                    <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                            <th style={{ padding: "12px", cursor: "pointer" }} onClick={() => toggleSort("name")}>
                                Name {sortKey === "name" && (sortDir === "asc" ? "▲" : "▼")}
                            </th>
                            <th style={{ padding: '12px' }}>IP Address</th>
                            <th style={{ padding: "12px", cursor: "pointer" }} onClick={() => toggleSort("status")}>
                                Status {sortKey === "status" && (sortDir === "asc" ? "▲" : "▼")}
                            </th>
                            <th style={{ padding: "12px", cursor: "pointer" }} onClick={() => toggleSort("current")}>
                                Load (A) {sortKey === "current" && (sortDir === "asc" ? "▲" : "▼")}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedList.map(p => (
                            <tr 
                                key={p.id} 
                                onClick={() => onSelectDevice?.(p)} 
                                style={{ cursor: "pointer", borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                <td style={{ padding: 12 }}>{p.name}</td>
                                <td style={{ padding: 12, fontFamily: "monospace" }}>{p.ip}</td>
                                <td style={{ padding: 12 }}>
                                    <span style={{ color: p.status?.toLowerCase() === "online" ? "var(--status-online)" : "var(--status-critical)" }}>
                                        ● {p.status?.toUpperCase()}
                                    </span>
                                </td>
                                <td style={{ padding: 12 }}>{(Number(p.metrics?.current) || 0).toFixed(2)} A</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DashboardView;