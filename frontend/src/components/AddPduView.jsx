// frontend/src/components/AddPduView.jsx
import React, { useMemo, useState } from "react";
import { createPDU } from "../api/pduService";

const DEFAULT_FORM = {
  name: "",
  ip_address: "",
  brand: "ATEN",
  model: "PE6208AV",
  location: "CE",

  snmp_version: "2c",
  // ✅ ล็อกค่าไว้ ไม่ต้องให้กรอก
  snmp_port: 161,
  snmp_timeout_ms: 2000,
  snmp_retries: 1,

  snmp_community: "administrator",
  is_active: true,
};

const BRAND_MODELS = {
  ATEN: ["PE6208AV"],
  CYBERPOWER: ["PDU41005", "RMCARD205"],
  APC: ["AP7921B"],
};

const BRAND_COMMUNITY_DEFAULT = {
  ATEN: "administrator",
  CYBERPOWER: "public",
  APC: "public",
};

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

export default function AddPduView({ onCreated, onCancel }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const modelOptions = useMemo(() => {
    const b = normalizeUpper(form.brand);
    return BRAND_MODELS[b] || [];
  }, [form.brand]);

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");

    const name = String(form.name || "").trim();
    const ip = String(form.ip_address || "").trim();

    // validate
    if (!name) return setMsg("❌ กรุณาใส่ Name");
    if (!ip) return setMsg("❌ กรุณาใส่ IP Address");
    if (!isValidIPv4(ip)) return setMsg("❌ IP Address ไม่ถูกต้อง (ต้องเป็น IPv4)");

    if (String(form.snmp_version) === "3") {
      return setMsg("❌ ตอนนี้ยังไม่รองรับ SNMP v3 (ต้องมี user/auth/priv เพิ่ม)");
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        name,
        ip_address: ip,

        brand: normalizeUpper(form.brand),
        model: normalizeUpper(form.model),
        location: normalizeUpper(form.location),

        snmp_version: String(form.snmp_version || "2c"),
        // ✅ ใช้ค่าที่ล็อกไว้เสมอ
        snmp_port: 161,
        snmp_timeout_ms: 2000,
        snmp_retries: 1,

        snmp_community: String(form.snmp_community || "").trim(),
        is_active: !!form.is_active,
      };

      await createPDU(payload);

      setMsg("✅ เพิ่ม PDU สำเร็จ");

      // reset แต่เก็บค่าบางอย่างไว้ให้เพิ่มตัวต่อไปง่าย
      setForm((prev) => ({
        ...DEFAULT_FORM,
        brand: payload.brand,
        model: payload.model,
        location: payload.location,
        snmp_community: payload.snmp_community || DEFAULT_FORM.snmp_community,
      }));

      onCreated?.(payload);
    } catch (err) {
      setMsg(`❌ เพิ่มไม่สำเร็จ: ${err?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="add-pdu-page">
      <div className="add-pdu-shell">
        <div className="add-pdu-panel">
          <div className="add-pdu-title">Add PDU</div>

          <form className="add-pdu-form" onSubmit={submit}>
            {/* Name */}
            <div className="form-group">
              <label>Name</label>
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="เช่น CE-07102-55"
                autoFocus
              />
            </div>

            {/* IP */}
            <div className="form-group">
              <label>IP Address</label>
              <input
                value={form.ip_address}
                onChange={(e) => set("ip_address", e.target.value)}
                placeholder="เช่น 10.220.9.xxx"
              />
            </div>

            {/* Zone */}
            <div className="form-group">
              <label>Zone (Location)</label>
              <select value={form.location} onChange={(e) => set("location", e.target.value)}>
                {ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>

            {/* Active (จัดให้อยู่ระนาบเดียว) */}
            <div className="form-group">
              <label>Active</label>
              <label className="pdu-checkbox">
                <input
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={(e) => set("is_active", e.target.checked)}
                />
                <span className="pdu-checkbox-text">ใช้งาน (ให้ poller ดึง)</span>
              </label>
            </div>

            {/* Brand */}
            <div className="form-group">
              <label>Brand</label>
              <select
                value={form.brand}
                onChange={(e) => {
                  const b = normalizeUpper(e.target.value);
                  const firstModel = (BRAND_MODELS[b] || [])[0] || "";
                  const comm = BRAND_COMMUNITY_DEFAULT[b] || "public";

                  setForm((prev) => ({
                    ...prev,
                    brand: b,
                    model: firstModel || prev.model,
                    snmp_community: comm,
                    snmp_version: "2c",
                  }));
                }}
              >
                <option value="ATEN">ATEN</option>
                <option value="CYBERPOWER">CYBERPOWER</option>
                <option value="APC">APC</option>
              </select>
            </div>

            {/* Model */}
            <div className="form-group">
              <label>Model</label>
              <select value={form.model} onChange={(e) => set("model", e.target.value)}>
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* SNMP Version */}
            <div className="form-group">
              <label>SNMP Version</label>
              <select value={form.snmp_version} onChange={(e) => set("snmp_version", e.target.value)}>
                <option value="2c">2c</option>
                <option value="3" disabled>
                  3 (ยังไม่รองรับ)
                </option>
              </select>
            </div>

            {/* Community */}
            <div className="form-group">
              <label>Community (v2c)</label>
              <input
                value={form.snmp_community}
                onChange={(e) => set("snmp_community", e.target.value)}
                placeholder="administrator / public"
              />
            </div>

            {/* spacer ให้กริดบาลานซ์ */}
            <div className="form-group" />

            {/* Message */}
            {msg ? (
              <div
                className="form-group full"
                style={{
                  color: msg.startsWith("✅") ? "var(--status-online)" : "var(--status-critical)",
                  fontSize: "0.95rem",
                }}
              >
                {msg}
              </div>
            ) : null}

            {/* Actions */}
            <div className="add-pdu-actions form-group full">
              <button className="btn-secondary" type="button" onClick={onCancel} disabled={saving}>
                Cancel
              </button>
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}