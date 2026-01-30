const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "pdu_db_snmp",
  user: process.env.DB_USER || "dusitmuangmee",
  password: process.env.DB_PASSWORD || undefined,
  max: 10,
  idleTimeoutMillis: 30000,
});

async function checkDB() {
  const r = await pool.query("SELECT NOW()");
  console.log("✅ DB connected:", r.rows[0].now);
}

module.exports = { pool, checkDB };