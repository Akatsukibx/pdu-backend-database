// scripts/resetPassword.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const bcrypt = require("bcrypt");
const { pool } = require("../src/lib/db");

const [,, username, newPassword] = process.argv;

if (!username || !newPassword) {
  console.log("Usage: node scripts/resetPassword.js <username> <newPassword>");
  process.exit(1);
}

(async () => {
  const hash = await bcrypt.hash(newPassword, 10);

  await pool.query(
    "UPDATE app_users SET password_hash=$1 WHERE username=$2",
    [hash, username]
  );

  console.log("✅ password reset for", username);
  process.exit();
})();