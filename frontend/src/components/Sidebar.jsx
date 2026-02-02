import React, { useState, useEffect } from 'react';
import { fetchPDUList } from '../api/pduService';
// Sidebar.js
const Sidebar = ({ activeNode, onSelectNode, pduList, loaded, isOpen }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    // กำหนดโซนมาตรฐาน
    const zones = ["ICT", "PN", "PKY", "CE", "UB"];

    const groupedPDUs = pduList.reduce((acc, pdu) => {
        const name = (pdu.name || "").toUpperCase();
        // หาว่าชื่อ PDU เริ่มต้นด้วยโซนไหนในลิสต์ไหม
        let matchedZone = zones.find(z => name.startsWith(z));
        
        // ถ้าไม่ตรงกับโซนไหนเลยให้ลง Other
        const finalZone = matchedZone || "Other";

        if (!acc[finalZone]) acc[finalZone] = [];
        acc[finalZone].push(pdu);
        return acc;
    }, {});

    // เรียงลำดับโซนตามที่กำหนด + Other
    const displayZones = [...zones, "Other"];

    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-header" onClick={() => onSelectNode(null)} style={{cursor: 'pointer'}}>
                PDU MONITOR
            </div>
            <div className="menu-group">
                <button className="menu-header active" onClick={() => onSelectNode(null)}>
                    🏠 Dashboard Overview
                </button>
            </div>
            <div className="menu-group">
                <button className={`menu-header ${isExpanded ? 'active' : ''}`} onClick={() => setIsExpanded(!isExpanded)}>
                    <span>Locations / Zones</span>
                    <span className="menu-arrow">▼</span>
                </button>
                <ul className={`node-list ${isExpanded ? 'expanded' : 'collapsed'}`}>
                    {displayZones.map(zone => (
                        groupedPDUs[zone] && (
                            <li key={zone} className="node-item">
                                <button
                                    className={`node-btn ${activeNode === zone ? 'active' : ''}`}
                                    onClick={() => onSelectNode(zone)}
                                >
                                    {zone} ({groupedPDUs[zone].length})
                                </button>
                            </li>
                        )
                    ))}
                </ul>
            </div>
        </aside>
    );
};

export default Sidebar;
