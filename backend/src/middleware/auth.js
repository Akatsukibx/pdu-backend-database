//auth.js
const jwt = require("jsonwebtoken");
const { pool } = require("../lib/db");

exports.requireAuth = async (req, res, next) => {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { id: userId, sid } = payload || {};
    if (!userId || !sid) return res.status(401).json({ error: "Unauthorized" });

    // ✅ เช็ค session ใน DB ว่ายังไม่หมดอายุจริงไหม
    const { rows } = await pool.query(
      `
      SELECT id, user_id, revoked, expires_at
      FROM public.app_sessions
      WHERE id = $1 AND user_id = $2
      LIMIT 1
      `,
      [sid, userId]
    );

    const s = rows[0];
    if (!s) return res.status(401).json({ error: "Session expired" });

    // ✅ ถ้าหมดอายุ/ถูก revoke => ลบทิ้งแล้วตัด 401
    if (s.revoked || new Date(s.expires_at) <= new Date()) {
      await pool.query(
        `DELETE FROM public.app_sessions WHERE id = $1 AND user_id = $2`,
        [sid, userId]
      );
      return res.status(401).json({ error: "Session expired" });
    }

    // ✅ อัปเดต last_seen (optional แต่แนะนำ)
    await pool.query(
      `UPDATE public.app_sessions SET last_seen = NOW() WHERE id = $1`,
      [sid]
    );

    req.user = { id: userId, sid, username: payload.username };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
};