// src/components/Sidebar.jsx
import React, { useMemo, useState } from "react";

const ADD_PDU_KEY = "ADD_PDU";

function pickLocation(p) {
  // ✅ รองรับหลายชื่อ เผื่อ pduService map ชื่อ field มาไม่ตรง
  // ลองอ่านจากหลายที่ก่อน
  return (
    p?.location ??
    p?.zone ??
    p?.site ??
    p?.area ??
    p?.node ??
    p?.group ??
    p?.loc ??
    p?.info?.location ??
    p?.status?.location ??
    null
  );
}

function normalizeLocation(loc) {
  const s = (loc ?? "").toString().trim();
  if (!s) return "MEETING";
  const up = s.toUpperCase();
  if (up === "NULL" || up === "UNDEFINED" || up === "N/A" || up === "-") return "MEETING";
  return up;
}

const Sidebar = ({ activeNode, onSelectNode, pduList, loaded, isOpen }) => {
  const [zonesOpen, setZonesOpen] = useState(true);

  const zones = useMemo(() => {
    const countMap = new Map();

    (pduList || []).forEach((p) => {
      const loc = normalizeLocation(pickLocation(p));
      countMap.set(loc, (countMap.get(loc) || 0) + 1);
    });

    const baseOrder = ["ICT", "PN", "PKY", "CE", "UB", "HP", "DENT", "MEETING"];

    const baseItems = baseOrder.map((name) => ({
      name,
      count: countMap.get(name) || 0,
    }));

    const extras = Array.from(countMap.entries())
      .map(([name, count]) => ({ name, count }))
      .filter((z) => !baseOrder.includes(z.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    return [...baseItems, ...extras];
  }, [pduList]);

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      <div className="sidebar-header">PDU MONITOR</div>

      <div className="menu-group">
        <button
          className={`node-btn ${activeNode === null ? "active" : ""}`}
          onClick={() => onSelectNode(null)}
          disabled={!loaded}
          type="button"
        >
          🏠 Dashboard Overview
        </button>
      </div>

      <div className="menu-group">
        <button
          className={`menu-header ${zonesOpen ? "" : "collapsed"}`}
          onClick={() => setZonesOpen((v) => !v)}
          type="button"
        >
          <span>PDU / ZONES</span>
          <span className="menu-arrow">▼</span>
        </button>

        <ul className={`node-list ${zonesOpen ? "expanded" : "collapsed"}`}>
          <li className="node-action-wrap">
            <button
              className={`node-btn node-action-btn ${
                activeNode === ADD_PDU_KEY ? "active" : ""
              }`}
              onClick={() => onSelectNode(ADD_PDU_KEY)}
              disabled={!loaded}
              type="button"
            >
              <span className="node-icon">＋</span>
              <span>Add PDU</span>
            </button>
          </li>

          {zones.map((z) => (
            <li key={z.name}>
              <button
                className={`node-btn ${activeNode === z.name ? "active" : ""}`}
                onClick={() => onSelectNode(z.name)}
                disabled={!loaded}
                type="button"
              >
                {z.name} ({z.count})
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
};

export default Sidebar;