import React from 'react';

// NodeView.js
const NodeView = ({ location, pduList, onSelectPDU }) => {
    // แก้ไขการ Filter: เดิมใช้ p.location === location
    // เปลี่ยนเป็นเช็คว่าชื่อ PDU ขึ้นต้นด้วยกลุ่มที่เลือกหรือไม่ (เช่น "ICT")
    const pdus = pduList.filter(p => {
        const name = (p.name || "").toUpperCase();
        const searchZone = location.toUpperCase();

        const zones = ["ICT", "PN", "PKY", "CE", "UB"];

        if (searchZone === "MEETING") {
            // กลุ่ม Meeting = ไม่ขึ้นต้นด้วยโซนหลักใด ๆ
            return !zones.some(z => name.startsWith(z));
        }

        // โซนปกติ
        return name.startsWith(searchZone);
    })

    return (
        <div>
            <h2 className="page-title">{location}</h2>
            <div className="room-grid">
                {pdus.length > 0 ? (
                    pdus.map(pdu => (
                        <div key={pdu.id} className="room-card" onClick={() => onSelectPDU(pdu.id)}>
                            {/* ... โค้ดแสดงผลการ์ดเดิมของคุณ ... */}
                            <div className="room-name">{pdu.name}</div>
                            <div style={{color: pdu.status === 'online' ? '#27ae60' : '#c0392b'}}>
                                ● {pdu.status.toUpperCase()}
                            </div>
                        </div>
                    ))
                ) : (
                    <div style={{padding: '20px', opacity: 0.5}}>No PDU found in this zone.</div>
                )}
            </div>
        </div>
    );
};

export default NodeView;
