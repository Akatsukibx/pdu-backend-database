// backend/src/controllers/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../lib/db");

// ✅ ปรับจำนวนเครื่องที่ login พร้อมกันได้ตรงนี้
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 4);

exports.login = async (req, res) => {
  const { username, password, deviceId } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId is required" });
  }

  try {
    // ✅ บังคับให้ล็อกอินได้แค่ user เดียว (admin)
    const allowed = process.env.ALLOWED_USERNAME || "admin";
    if (String(username).trim() !== allowed) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 1) load user
    const { rows } = await pool.query(
      `
      SELECT id, username, password_hash, is_active
      FROM public.app_users
      WHERE username = $1
      LIMIT 1
      `,
      [String(username).trim()]
    );

    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (!user.is_active) return res.status(403).json({ error: "User disabled" });

    // 2) check password
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // 3) cleanup expired -> ✅ ลบทิ้งจริง (ไม่ให้ค้างใน DB)
    await pool.query(
      `
      DELETE FROM public.app_sessions
      WHERE user_id = $1 AND expires_at <= NOW()
      `,
      [user.id]
    );

    // 4) count active (เฉพาะยังไม่หมดอายุและไม่ revoked)
    const { rows: countRows } = await pool.query(
      `
      SELECT COUNT(*)::int AS cnt
      FROM public.app_sessions
      WHERE user_id = $1 AND revoked = FALSE AND expires_at > NOW()
      `,
      [user.id]
    );
    const activeCount = countRows[0]?.cnt ?? 0;

    // 5) existing device?
    const { rows: existingRows } = await pool.query(
      `
      SELECT id
      FROM public.app_sessions
      WHERE user_id = $1 AND device_id = $2 AND revoked = FALSE AND expires_at > NOW()
      LIMIT 1
      `,
      [user.id, String(deviceId)]
    );
    const hasExisting = !!existingRows[0];

    // ✅ ถ้าเครื่องใหม่ และเต็มแล้ว -> บล็อก
    if (!hasExisting && activeCount >= MAX_SESSIONS) {
      return res.status(403).json({
        error: `Max sessions reached (${MAX_SESSIONS} devices). Please logout from another device.`,
      });
    }

    // 6) upsert session
    // ✅ ใช้ SESSION_MINUTES จะตรงกว่า (ถ้าคุณอยากให้หลุดทุก 5 นาที)
    // ถ้าไม่มี SESSION_MINUTES ก็ fallback SESSION_HOURS
    const sessionMinutes = Number(process.env.SESSION_MINUTES || 0);
    const sessionHours = Number(process.env.SESSION_HOURS || 12);

    const ttlMs =
      sessionMinutes > 0
        ? sessionMinutes * 60 * 1000
        : sessionHours * 60 * 60 * 1000;

    const expiresAt = new Date(Date.now() + ttlMs);

    const { rows: sessionRows } = await pool.query(
      `
      INSERT INTO public.app_sessions (user_id, device_id, expires_at, last_seen, revoked)
      VALUES ($1, $2, $3, NOW(), FALSE)
      ON CONFLICT (user_id, device_id)
      DO UPDATE SET
        revoked = FALSE,
        expires_at = EXCLUDED.expires_at,
        last_seen = NOW()
      RETURNING id
      `,
      [user.id, String(deviceId), expiresAt]
    );

    const sid = sessionRows[0].id;

    // 7) issue token (sid สำคัญไว้ใช้ logout)
    const token = jwt.sign(
      { id: user.id, username: user.username, sid },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "12h" }
    );

    return res.json({ token });
  } catch (e) {
    console.error("[login] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};

// ✅ logout: ลบ session เฉพาะ token นี้ (sid)
exports.logout = async (req, res) => {
  try {
    const { id: userId, sid } = req.user || {};
    if (!userId || !sid) {
      return res.status(400).json({ error: "Missing session info" });
    }

    await pool.query(
      `DELETE FROM public.app_sessions WHERE id = $1 AND user_id = $2`,
      [sid, userId]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("[logout] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};

// ✅ logoutAll: ลบทุก session ของ user นี้
exports.logoutAll = async (req, res) => {
  try {
    const { id: userId } = req.user || {};
    if (!userId) return res.status(400).json({ error: "Missing user" });

    await pool.query(
      `DELETE FROM public.app_sessions WHERE user_id = $1`,
      [userId]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("[logoutAll] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};