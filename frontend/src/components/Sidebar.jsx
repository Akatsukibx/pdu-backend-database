// Sidebar.jsx
import React, { useState } from "react";
const Sidebar = ({ activeNode, onSelectNode, pduList, isOpen }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // ✅ โซนที่จะแสดงตามที่คุณต้องการ
  const displayZones = ["ICT", "PN", "PKY", "CE", "UB", "HP", "DENT", "MEETING"];

  // ✅ โซนที่ใช้เช็ค prefix จริง (ไม่รวม MEETING เพราะ MEETING = ที่เหลือ)
  const prefixZones = ["ICT", "PN", "PKY", "CE", "UB", "HP", "DENT"];

  // ✅ ฟังก์ชันกลาง: แปลง name -> zone
  const getZoneFromName = (nameRaw = "") => {
    const name = String(nameRaw).toUpperCase().trim();

    // 1) DENT: ให้ห้อง/เครื่องที่ขึ้นต้นด้วย DENT ไปอยู่ DENT (รวม Dent1f3 Dent1f4)
    if (name.startsWith("DENT")) return "DENT";

    // 2) HP: โรงพยาบาล
    if (name.startsWith("HP")) return "HP";

    // 3) โซนหลักเดิม
    const found = ["ICT", "PN", "PKY", "CE", "UB"].find((z) => name.startsWith(z));
    if (found) return found;

    // 4) ที่เหลือทั้งหมด
    return "MEETING";
  };

  // ✅ group PDUs ตามโซน
  const groupedPDUs = (pduList || []).reduce((acc, pdu) => {
    const zone = getZoneFromName(pdu?.name);
    if (!acc[zone]) acc[zone] = [];
    acc[zone].push(pdu);
    return acc;
  }, {});

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      <div
        className="sidebar-header"
        onClick={() => onSelectNode(null)}
        style={{ cursor: "pointer" }}
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
          className={`menu-header ${isExpanded ? "active" : ""}`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span>Locations / Zones</span>
          <span className="menu-arrow">▼</span>
        </button>

        <ul className={`node-list ${isExpanded ? "expanded" : "collapsed"}`}>
          {displayZones.map((zone) => {
  const count = groupedPDUs?.[zone]?.length ?? 0;

  return (
    <li key={zone} className="node-item">
      <button
        className={`node-btn ${activeNode === zone ? "active" : ""}`}
        onClick={() => onSelectNode(zone)}
      >
        {zone} ({count})
      </button>
    </li>
  );
})}
        </ul>
      </div>
    </aside>
  );
};

export default Sidebar;