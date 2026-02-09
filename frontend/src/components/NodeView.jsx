// NodeView.js
import React from "react";

const NodeView = ({ location, pduList, onSelectPDU }) => {
  // ✅ ฟังก์ชันกลาง: name -> zone (ต้องตรงกับ Sidebar)
  const getZoneFromName = (nameRaw = "") => {
    const name = String(nameRaw).toUpperCase().trim();

    if (name.startsWith("DENT")) return "DENT";
    if (name.startsWith("HP")) return "HP";

    const found = ["ICT", "PN", "PKY", "CE", "UB"].find((z) => name.startsWith(z));
    if (found) return found;

    return "MEETING";
  };

  const searchZone = String(location || "").toUpperCase();

  // ✅ Filter ตาม zone ที่คำนวณได้ (ไม่ต้องเขียน if MEETING เองแล้ว)
  const pdus = (pduList || []).filter((p) => getZoneFromName(p?.name) === searchZone);

  return (
    <div>
      <h2 className="page-title">{location}</h2>

      <div className="room-grid">
        {pdus.length > 0 ? (
          pdus.map((pdu) => {
            // ✅ รองรับหลายรูปแบบ field (แล้วแต่ pduService ของคุณ)
            const current = pdu?.metrics?.current ?? pdu?.current ?? null;

            return (
              <div
                key={pdu.id}
                className="room-card"
                onClick={() => onSelectPDU(pdu.id)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "16px",
                }}
              >
                {/* ซ้าย: ชื่อ + สถานะ */}
                <div style={{ minWidth: 0 }}>
                  <div className="room-name">{pdu.name}</div>

                  <div
                    style={{
                      color: pdu.status === "online" ? "#27ae60" : "#c0392b",
                    }}
                  >
                    ● {String(pdu.status || "").toUpperCase()}
                  </div>
                </div>

                {/* ขวา: Current */}
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>Current</div>

                  <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                    {current != null && Number.isFinite(Number(current))
                      ? `${Number(current).toFixed(2)} A`
                      : "-"}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ padding: "20px", opacity: 0.5 }}>
            No PDU found in this zone.
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeView;