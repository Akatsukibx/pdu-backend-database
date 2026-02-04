// backend/scripts/createUser.js
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../src/lib/db");

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.log("Usage: node scripts/createUser.js <username> <password>");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  const q = `
    INSERT INTO public.app_users (username, password_hash)
    VALUES ($1, $2)
    ON CONFLICT (username) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      is_active = TRUE
    RETURNING id, username
  `;

  const { rows } = await pool.query(q, [username, hash]);
  console.log("✅ user upserted:", rows[0]);
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ createUser error:", e);
  process.exit(1);
});