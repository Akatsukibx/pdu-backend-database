// components/DashboardView.js
import React, { useState, useMemo, useEffect } from "react";

// backend base
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const ZONES = ["ICT", "PN", "PKY", "CE", "UB", "HP", "DENT", "MEETING"];

function normalizeUpper(v) {
  return String(v ?? "").trim().toUpperCase();
}

function isValidIPv4(ip) {
  const s = String(ip || "").trim();
  const parts = s.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return false;
    const n = Number(p);
    if (n < 0 || n > 255) return false;
  }
  return true;
}

async function safeReadError(res) {
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await res.json();
      return j?.error || j?.message || "";
    }
    return await res.text();
  } catch {
    return "";
  }
}

const DashboardView = ({ pduList, onSelectDevice, onChanged }) => {
  const [sortKey, setSortKey] = useState(null); // 'name' | 'current' | 'status'
  const [sortDir, setSortDir] = useState("asc"); // asc | desc

  // ---------- EDIT MODAL ----------
  const [editOpen, setEditOpen] = useState(false);
  const [editPdu, setEditPdu] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    ip_address: "",
    location: "MEETING",
    brand: "",
    model: "",
    snmp_version: "2c",
    snmp_community: "public",
    is_active: true,
  });
  const [editMsg, setEditMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const openEdit = (p) => {
    setEditMsg("");
    setEditPdu(p);
    setEditForm({
      name: p?.name ?? "",
      ip_address: p?.ip ?? p?.ip_address ?? "",
      location: normalizeUpper(p?.location ?? "MEETING"),
      brand: normalizeUpper(p?.brand ?? "ATEN"),
      model: String(p?.model ?? "PE6208AV"),
      snmp_version: String(p?.snmp_version ?? "2c"),
      snmp_community: String(p?.snmp_community ?? "public"),
      is_active: typeof p?.is_active === "boolean" ? p.is_active : true,
    });
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditPdu(null);
    setEditMsg("");
    setSaving(false);
  };

  useEffect(() => {
    if (!editOpen) {
      setEditMsg("");
      setSaving(false);
    }
  }, [editOpen]);

  const setF = (k, v) => setEditForm((prev) => ({ ...prev, [k]: v }));

  const submitEdit = async () => {
    setEditMsg("");

    if (!editPdu?.id) return setEditMsg("❌ ไม่พบ id ของ PDU");

    const name = String(editForm.name || "").trim();
    const ip = String(editForm.ip_address || "").trim();
    const location = normalizeUpper(editForm.location || "MEETING");

    if (!name) return setEditMsg("❌ กรุณาใส่ Name");
    if (!ip) return setEditMsg("❌ กรุณาใส่ IP Address");
    if (!isValidIPv4(ip)) return setEditMsg("❌ IP Address ไม่ถูกต้อง (IPv4)");
    if (!ZONES.includes(location)) return setEditMsg("❌ Location ไม่ถูกต้อง");

    const token = localStorage.getItem("pdu_token");
    if (!token) return setEditMsg("❌ ไม่พบ token กรุณา Login ใหม่");

    setSaving(true);
    try {
      const payload = {
        name,
        ip_address: ip,
        location,
        brand: normalizeUpper(editForm.brand || ""),
        model: String(editForm.model || "").trim(),
        snmp_version: String(editForm.snmp_version || "2c"),
        snmp_community: String(editForm.snmp_community || "").trim(),
        is_active: !!editForm.is_active,
      };

      const res = await fetch(`${API_BASE}/api/pdus/${editPdu.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await safeReadError(res);
        throw new Error(msg || `Update failed (${res.status})`);
      }

      setEditMsg("✅ บันทึกสำเร็จ");
      await onChanged?.();
      closeEdit();
    } catch (e) {
      setEditMsg(`❌ บันทึกไม่สำเร็จ: ${e?.message || "Unknown error"}`);
      setSaving(false);
    }
  };

  // ---------- SUMMARY ----------
  const total = pduList.length;
  const online = pduList.filter((p) => p.status?.toLowerCase() === "online").length;
  const offline = total - online;

  const totalPower = pduList.reduce((sum, p) => sum + (Number(p.metrics?.power) || 0), 0);
  const totalAmp = pduList.reduce((sum, p) => sum + (Number(p.metrics?.current) || 0), 0);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const statusRank = {
    online: 1,
    offline: 2,
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

      <div
        className="room-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
        }}
      >
        <div
          className="panel summary-card"
          style={{
            borderLeft: "4px solid var(--status-online)",
            padding: "15px",
            background: "var(--bg-panel)",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>ONLINE DEVICES</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--status-online)" }}>{online}</div>
        </div>

        <div
          className="panel summary-card"
          style={{
            borderLeft: "4px solid var(--status-critical)",
            padding: "15px",
            background: "var(--bg-panel)",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>OFFLINE DEVICES</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--status-critical)" }}>{offline}</div>
        </div>

        <div
          className="panel summary-card"
          style={{
            borderLeft: "4px solid var(--accent-blue)",
            padding: "15px",
            background: "var(--bg-panel)",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>TOTAL LOAD (W)</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{totalPower.toLocaleString()} W</div>
        </div>

        <div
          className="panel summary-card"
          style={{
            borderLeft: "4px solid #f39c12",
            padding: "15px",
            background: "var(--bg-panel)",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>TOTAL CURRENT (A)</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{totalAmp.toFixed(2)} A</div>
        </div>
      </div>

      <h3 style={{ marginTop: "2rem", marginBottom: "1rem" }}>Device Status Detail</h3>

      <div style={{ overflowX: "auto" }}>
        <table
          className="pdu-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            background: "var(--bg-panel)",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.05)", textAlign: "left" }}>
              <th style={{ padding: "12px", cursor: "pointer" }} onClick={() => toggleSort("name")}>
                Name {sortKey === "name" && (sortDir === "asc" ? "▲" : "▼")}
              </th>
              <th style={{ padding: "12px" }}>IP Address</th>
              <th style={{ padding: "12px", cursor: "pointer" }} onClick={() => toggleSort("status")}>
                Status {sortKey === "status" && (sortDir === "asc" ? "▲" : "▼")}
              </th>
              <th style={{ padding: "12px", cursor: "pointer" }} onClick={() => toggleSort("current")}>
                Load (A) {sortKey === "current" && (sortDir === "asc" ? "▲" : "▼")}
              </th>
              <th style={{ padding: "12px" }}>Action</th>
            </tr>
          </thead>

          <tbody>
            {sortedList.map((p) => (
              <tr
                key={p.id}
                onClick={() => onSelectDevice?.(p)}
                style={{ cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: 12 }}>{p.name}</td>
                <td style={{ padding: 12, fontFamily: "monospace" }}>{p.ip}</td>
                <td style={{ padding: 12 }}>
                  <span style={{ color: p.status?.toLowerCase() === "online" ? "var(--status-online)" : "var(--status-critical)" }}>
                    ● {p.status?.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: 12 }}>{(Number(p.metrics?.current) || 0).toFixed(2)} A</td>
                <td style={{ padding: 12 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(p);
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* -------- EDIT MODAL -------- */}
      {editOpen && (
        <div
          style={modalStyles.backdrop}
          onClick={closeEdit}
        >
          <div
            style={modalStyles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalStyles.header}>
              <div style={{ fontWeight: 700 }}>Edit PDU</div>
              <button onClick={closeEdit} style={modalStyles.iconBtn}>✕</button>
            </div>

            {/* ✅ ทำเป็น 2 คอลัมน์เหมือนหน้า Add PDU */}
            <div style={modalStyles.body}>
              {/* Name */}
              <div style={modalStyles.row}>
                <label style={modalStyles.label}>Name</label>
                <input
                  style={inputStyle}
                  value={editForm.name}
                  onChange={(e) => setF("name", e.target.value)}
                  placeholder="เช่น CE-07102-55"
                />
              </div>

              {/* IP */}
              <div style={modalStyles.row}>
                <label style={modalStyles.label}>IP Address</label>
                <input
                  style={inputStyle}
                  value={editForm.ip_address}
                  onChange={(e) => setF("ip_address", e.target.value)}
                  placeholder="เช่น 10.220.9.xxx"
                />
              </div>

              {/* Zone */}
              <div style={modalStyles.row}>
                <label style={modalStyles.label}>Zone (Location)</label>
                <select
                  style={inputStyle}
                  value={editForm.location}
                  onChange={(e) => setF("location", e.target.value)}
                >
                  {ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>

              {/* ✅ Active -> dropdown (อยู่ระนาบเดียว + กดง่าย) */}
              <div style={modalStyles.row}>
                <label style={modalStyles.label}>Active</label>
                <select
                  style={inputStyle}
                  value={editForm.is_active ? "true" : "false"}
                  onChange={(e) => setF("is_active", e.target.value === "true")}
                >
                  <option value="true">ใช้งาน (ให้ poller ดึง)</option>
                  <option value="false">ปิดใช้งาน (ไม่ให้ poller ดึง)</option>
                </select>
              </div>

              {/* Brand */}
              <div style={modalStyles.row}>
                <label style={modalStyles.label}>Brand</label>
                <input
                  style={inputStyle}
                  value={editForm.brand}
                  onChange={(e) => setF("brand", e.target.value)}
                />
              </div>

              {/* Model */}
              <div style={modalStyles.row}>
                <label style={modalStyles.label}>Model</label>
                <input
                  style={inputStyle}
                  value={editForm.model}
                  onChange={(e) => setF("model", e.target.value)}
                />
              </div>

              {/* SNMP Version */}
              <div style={modalStyles.row}>
                <label style={modalStyles.label}>SNMP Version</label>
                <select
                  style={inputStyle}
                  value={editForm.snmp_version}
                  onChange={(e) => setF("snmp_version", e.target.value)}
                >
                  <option value="2c">2c</option>
                  <option value="3">3</option>
                </select>
              </div>

              {/* SNMP Community */}
              <div style={modalStyles.row}>
                <label style={modalStyles.label}>SNMP Community</label>
                <input
                  style={inputStyle}
                  value={editForm.snmp_community}
                  onChange={(e) => setF("snmp_community", e.target.value)}
                  placeholder="administrator / public"
                />
              </div>

              {/* msg full width */}
              {editMsg && <div style={modalStyles.msgFull}>{editMsg}</div>}
            </div>

            <div style={modalStyles.footer}>
              <button style={btnGhost} onClick={closeEdit} disabled={saving}>
                Cancel
              </button>
              <button style={btnPrimary} onClick={submitEdit} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  color: "var(--text-primary)",
  outline: "none",
};

const btnGhost = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "transparent",
  color: "var(--text-primary)",
  cursor: "pointer",
};

const btnPrimary = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "var(--accent-blue)",
  color: "#fff",
  cursor: "pointer",
};

const modalStyles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16,
  },
  modal: {
    width: "min(840px, 100%)",
    background: "var(--bg-panel)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    overflow: "hidden",
  },
  header: {
    padding: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  iconBtn: {
    border: "none",
    background: "transparent",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontSize: 18,
  },
  body: {
    padding: 14,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    columnGap: 12,
  },
  row: { display: "grid", gap: 6 },
  label: { fontSize: 12, opacity: 0.8 },
  msgFull: {
    gridColumn: "1 / -1",
    padding: "8px 10px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.06)",
  },
  footer: {
    padding: 14,
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
};

export default DashboardView;