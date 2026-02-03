import React, { useState } from 'react';

// Sidebar.js
const Sidebar = ({ activeNode, onSelectNode, pduList, isOpen }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    // โซนหลักจริง ๆ
    const baseZones = ["ICT", "PN", "PKY", "CE", "UB"];

    const groupedPDUs = pduList.reduce((acc, pdu) => {
        const name = (pdu.name || "").toUpperCase();

        let zone = baseZones.find(z => name.startsWith(z));

        // ถ้าไม่เข้าโซนหลัก → MEETING
        if (!zone) zone = "MEETING";

        if (!acc[zone]) acc[zone] = [];
        acc[zone].push(pdu);
        return acc;
    }, {});

    // โซนที่จะแสดง
    const displayZones = [...baseZones, "MEETING"];

    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <div
                className="sidebar-header"
                onClick={() => onSelectNode(null)}
                style={{ cursor: 'pointer' }}
            >
                PDU MONITOR
            </div>

            <div className="menu-group">
                <button className="menu-header active" onClick={() => onSelectNode(null)}>
                    🏠 Dashboard Overview
                </button>
            </div>

            <div className="menu-group">
                <button
                    className={`menu-header ${isExpanded ? 'active' : ''}`}
                    onClick={() => setIsExpanded(!isExpanded)}
                >
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
