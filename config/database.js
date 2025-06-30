const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'school_portal',
  charset: 'utf8mb4'
};

let connection;

async function getConnection() {
  if (!connection) {
    try {
      connection = await mysql.createConnection(dbConfig);
      console.log('✅ Connected to MySQL database');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      process.exit(1);
    }
  }
  return connection;
}

async function query(sql, params) {
  const conn = await getConnection();
  try {
    const [results] = await conn.execute(sql, params || []);
    return results;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

module.exports = { getConnection, query };