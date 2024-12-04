// src/utils/dbConfig.js

import mysql from 'mysql2/promise';

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',      // Use environment variables with defaults
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'my_database',
};

export const pool = mysql.createPool(dbConfig);
