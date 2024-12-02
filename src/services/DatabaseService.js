// src/services/DatabaseService.js

import { pool } from '../utils/dbConfig.js';
import logger from '../logger/logger.js';

export class DatabaseService {
  constructor() {}

  async createConversionRecord(conversionData) {
    const sql = `
      INSERT INTO conversions
      (id, original_file_name, original_file_size, conversion_type, status, start_time, expires_at)
      VALUES (?, ?, ?, ?, ?, NOW(), ?)
    `;
  
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Set expiration date to 7 days from now
  
    const params = [
      conversionData.id,
      conversionData.originalFileName,
      conversionData.originalFileSize,
      conversionData.conversionType,
      'pending',
      expiresAt,
    ];
  
    try {
      await pool.execute(sql, params);
      logger.info(`Created conversion record with ID: ${conversionData.id}`);
    } catch (err) {
      logger.error('Error creating conversion record', err);
      throw err;
    }
  }
  

  async updateConversionStatus(id, status, additionalData = {}) {
    let sql = `
      UPDATE conversions
      SET status = ?, end_time = NOW()
    `;
    const params = [status];
  
    if (status === 'completed') {
        sql += `, converted_files = ?, compressed_file_name = ?`;
        params.push(
          JSON.stringify(additionalData.convertedFiles || []),
          additionalData.compressedFileName || null
        );
      } else if (status === 'failed') {
        sql += `, error_message = ?`;
        params.push(additionalData.errorMessage);
      }
  
    sql += ` WHERE id = ?`;
    params.push(id);
  
    try {
      await pool.execute(sql, params);
      logger.info(`Updated conversion ID: ${id} to status: ${status}`);
    } catch (err) {
      logger.error(`Error updating conversion ID: ${id}`, err);
      throw err;
    }
  }
  

  async getExpiredFiles() {
    const sql = `
      SELECT * FROM conversions WHERE expires_at < NOW() AND status = 'completed'
    `;
    try {
      const [rows] = await pool.execute(sql);
      return rows;
    } catch (err) {
      logger.error('Error fetching expired files', err);
      throw err;
    }
  }

  async deleteConversionRecord(id) {
    const sql = `
      DELETE FROM conversions WHERE id = ?
    `;
    try {
      await pool.execute(sql, [id]);
      logger.info(`Deleted conversion record with ID: ${id}`);
    } catch (err) {
      logger.error(`Error deleting conversion record ID: ${id}`, err);
      throw err;
    }
  }
}
