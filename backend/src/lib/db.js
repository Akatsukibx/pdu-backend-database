const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "Monitor_pdu",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "admin",

  max: 10,
  idleTimeoutMillis: 30000,
});

async function checkDB() {
  const r = await pool.query("SELECT NOW()");
  console.log("✅ DB connected:", r.rows[0].now);
}

async function checkDB() {
    try {
        await pool.query('SELECT NOW()');
        console.log("✅ Database connected");
    } catch (e) {
        console.error("❌ Database connection failed", e);
        process.exit(1);
    }
}

module.exports = { pool, checkDB };