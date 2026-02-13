import React, { useMemo, useState, useEffect } from "react";
import { updatePDU } from "../api/pduService";

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

export default function EditPduModal({ open, pdu, onClose, onSaved }) {
  const initial = useMemo(() => {
    if (!pdu) return null;
    return {
      name: pdu.name ?? "",
      ip_address: pdu.ip ?? pdu.ip_address ?? "",
      location: normalizeUpper(pdu.location ?? "MEETING"),
      brand: normalizeUpper(pdu.brand ?? "ATEN"),
      model: normalizeUpper(pdu.model ?? "PE6208AV"),
      snmp_version: String(pdu.snmp_version ?? "2c"),
      snmp_community: pdu.snmp_community ?? "public",
      is_active: typeof pdu.is_active === "boolean" ? pdu.is_active : true,
    };
  }, [pdu]);

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // reset เมื่อเปลี่ยน pdu
  useEffect(() => setForm(initial), [initial]);

  if (!open || !pdu || !form) return null;

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async () => {
    setMsg("");

    const name = String(form.name || "").trim();
    const ip = String(form.ip_address || "").trim();

    if (!name) return setMsg("❌ กรุณาใส่ Name");
    if (!ip) return setMsg("❌ กรุณาใส่ IP Address");
    if (!isValidIPv4(ip)) return setMsg("❌ IP Address ไม่ถูกต้อง (IPv4)");

    setSaving(true);
    try {
      const payload = {
        name,
        ip_address: ip,
        location: normalizeUpper(form.location),
        brand: normalizeUpper(form.brand),
        model: normalizeUpper(form.model),
        snmp_version: String(form.snmp_version || "2c"),
        snmp_community: String(form.snmp_community || "").trim(),
        is_active: !!form.is_active,
      };

      await updatePDU(pdu.id, payload);

      setMsg("✅ บันทึกสำเร็จ");
      onSaved?.();
      onClose?.();
    } catch (e) {
      setMsg(`❌ บันทึกไม่สำเร็จ: ${e?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={{ fontWeight: 700 }}>Edit PDU</div>
          <button style={styles.iconBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* ✅ ทำ layout ให้เหมือนหน้า Add PDU: 2 คอลัมน์ */}
        <div style={styles.body}>
          {/* Row 1 */}
          <div style={styles.row}>
            <label style={styles.label}>Name</label>
            <input
              style={styles.input}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="เช่น CE-07102-55"
            />
          </div>

          <div style={styles.row}>
            <label style={styles.label}>IP Address</label>
            <input
              style={styles.input}
              value={form.ip_address}
              onChange={(e) => set("ip_address", e.target.value)}
              placeholder="เช่น 10.220.9.xxx"
            />
          </div>

          {/* Row 2 */}
          <div style={styles.row}>
            <label style={styles.label}>Zone (Location)</label>
            <select
              style={styles.input}
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
            >
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          {/* ✅ Active แบบ dropdown (กดง่าย + อยู่ระนาบเดียวกัน) */}
          <div style={styles.row}>
            <label style={styles.label}>Active</label>
            <select
              style={styles.input}
              value={form.is_active ? "true" : "false"}
              onChange={(e) => set("is_active", e.target.value === "true")}
            >
              <option value="true">ใช้งาน (ให้ poller ดึง)</option>
              <option value="false">ปิดใช้งาน (ไม่ให้ poller ดึง)</option>
            </select>
          </div>

          {/* Row 3 */}
          <div style={styles.row}>
            <label style={styles.label}>Brand</label>
            <input
              style={styles.input}
              value={form.brand}
              onChange={(e) => set("brand", e.target.value)}
            />
          </div>

          <div style={styles.row}>
            <label style={styles.label}>Model</label>
            <input
              style={styles.input}
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
            />
          </div>

          {/* Row 4 */}
          <div style={styles.row}>
            <label style={styles.label}>SNMP Version</label>
            <select
              style={styles.input}
              value={String(form.snmp_version || "2c")}
              onChange={(e) => set("snmp_version", e.target.value)}
            >
              <option value="2c">2c</option>
              <option value="3">3</option>
            </select>
          </div>

          <div style={styles.row}>
            <label style={styles.label}>Community (v2c)</label>
            <input
              style={styles.input}
              value={form.snmp_community}
              onChange={(e) => set("snmp_community", e.target.value)}
              placeholder="administrator / public"
            />
          </div>

          {/* ✅ msg เต็มแถว */}
          {msg && <div style={styles.msgFull}>{msg}</div>}
        </div>

        <div style={styles.footer}>
          <button style={styles.btnGhost} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button style={styles.btnPrimary} onClick={submit} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
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

  // ✅ 2 คอลัมน์เหมือนหน้า Add PDU
  body: {
    padding: 14,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    columnGap: 12,
  },

  row: { display: "grid", gap: 6 },
  label: { fontSize: 12, opacity: 0.8 },

  input: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
    color: "var(--text-primary)",
    outline: "none",
  },

  // ✅ ข้อความแจ้งเตือนเต็มแถว
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
  btnGhost: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "transparent",
    color: "var(--text-primary)",
    cursor: "pointer",
  },
  btnPrimary: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: "var(--accent-blue)",
    color: "#fff",
    cursor: "pointer",
  },
};