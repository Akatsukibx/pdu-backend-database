import React from 'react';

const NodeView = ({ location, pduList, onSelectPDU }) => {
    // Filter PDUs by location
    const pdus = pduList.filter(p => p.location === location);

    return (
        <div>
            <h2 className="page-title">
                {location}
            </h2>
            <div className="room-grid">
                {pdus.map(pdu => {
                    const isOnline = pdu.status === 'online';
                    const statusColor = isOnline ? 'var(--status-online)' : 'var(--status-critical)';
                    const statusText = isOnline ? 'ON' : 'OFF';

                    return (
                        <div key={pdu.id} className="room-card" onClick={() => onSelectPDU(pdu.id)}>
                            <div className="room-header" style={{ marginBottom: '0.75rem' }}>
                                <span className="room-name">{pdu.name}</span>

                                {/* Status Badge Design */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 10px',
                                    borderRadius: '20px',
                                    backgroundColor: isOnline ? 'rgba(39, 174, 96, 0.15)' : 'rgba(192, 57, 43, 0.15)',
                                    border: `1px solid ${isOnline ? 'rgba(39, 174, 96, 0.3)' : 'rgba(192, 57, 43, 0.3)'}`,
                                    color: statusColor,
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    letterSpacing: '0.5px'
                                }}>
                                    <span style={{
                                        display: 'block',
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: statusColor,
                                        boxShadow: `0 0 8px ${statusColor}`
                                    }}></span>
                                    {statusText}
                                </div>
                            </div>

                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                    <span>Device:</span>
                                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{pdu.model || 'N/A'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Status:</span>
                                    <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                                        {pdu.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default NodeView;
