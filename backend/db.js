const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

module.exports = pool;

// See all users
//mysql -u root -p chatapp -e "SELECT id, name, email, created_at FROM users;"

//See all reports
//mysql -u root -p chatapp -e "SELECT id, user_id, type, risk_level, created_at FROM reports;"

//See all progress
//mysql -u root -p chatapp -e "SELECT * FROM progress;"
