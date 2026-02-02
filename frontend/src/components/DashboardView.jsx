// components/DashboardView.js
const DashboardView = ({ pduList }) => {
    const total = pduList.length;
    const online = pduList.filter(p => p.status === 'online').length;
    const offline = total - online;
    
    // คำนวณค่ารวม Metrics (ถ้ามีข้อมูล)
    const totalPower = pduList.reduce((sum, p) => sum + (Number(p.metrics?.power) || 0), 0);
    const totalAmp = pduList.reduce((sum, p) => sum + (Number(p.metrics?.current) || 0), 0);

    return (
        <div className="dashboard-container">
            <h2 className="page-title">System Overview</h2>
            
            <div className="room-grid"> {/* ใช้ grid เดิมเพื่อความสวยงาม */}
                <div className="panel summary-card" style={{borderLeft: '4px solid var(--status-online)'}}>
                    <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)'}}>ONLINE DEVICES</div>
                    <div style={{fontSize: '2rem', fontWeight: 'bold', color: 'var(--status-online)'}}>{online}</div>
                </div>
                
                <div className="panel summary-card" style={{borderLeft: '4px solid var(--status-critical)'}}>
                    <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)'}}>OFFLINE DEVICES</div>
                    <div style={{fontSize: '2rem', fontWeight: 'bold', color: 'var(--status-critical)'}}>{offline}</div>
                </div>

                <div className="panel summary-card" style={{borderLeft: '4px solid var(--accent-blue)'}}>
                    <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)'}}>TOTAL LOAD (W)</div>
                    <div style={{fontSize: '2rem', fontWeight: 'bold'}}>{totalPower.toLocaleString()} W</div>
                </div>

                <div className="panel summary-card" style={{borderLeft: '4px solid #f39c12'}}>
                    <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)'}}>TOTAL CURRENT (A)</div>
                    <div style={{fontSize: '2rem', fontWeight: 'bold'}}>{totalAmp.toFixed(2)} A</div>
                </div>
            </div>

            <h3 style={{marginTop: '2rem', marginBottom: '1rem'}}>Device Status Detail</h3>
            <table className="pdu-table" style={{width: '100%', borderCollapse: 'collapse', background: 'var(--bg-panel)', borderRadius: '8px', overflow: 'hidden'}}>
                <thead>
                    <tr style={{background: 'rgba(255,255,255,0.05)', textAlign: 'left'}}>
                        <th style={{padding: '12px'}}>Name</th>
                        <th style={{padding: '12px'}}>IP Address</th>
                        <th style={{padding: '12px'}}>Status</th>
                        <th style={{padding: '12px'}}>Load (A)</th>
                    </tr>
                </thead>
                <tbody>
                    {pduList.map(p => (
                        <tr key={p.id} style={{borderBottom: '1px solid var(--border-main)'}}>
                            <td style={{padding: '12px'}}>{p.name}</td>
                            <td style={{padding: '12px', fontFamily: 'monospace'}}>{p.ip}</td>
                            <td style={{padding: '12px'}}>
                                <span style={{color: p.status === 'online' ? 'var(--status-online)' : 'var(--status-critical)'}}>
                                    ● {p.status.toUpperCase()}
                                </span>
                            </td>
                            <td style={{padding: '12px'}}>{p.metrics?.current || 0} A</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default DashboardView;