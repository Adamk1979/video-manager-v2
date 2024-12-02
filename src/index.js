// src/index.js

import 'dotenv/config'; // Load environment variables
import express from 'express';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import * as fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { PORT, PATHS } from './utils/constants.js';
import { fileService } from './services/FileService.js';
import { VideoManageController } from './controllers/VideoManager.js';
import { pool } from './utils/dbConfig.js';
import { DatabaseService } from './services/DatabaseService.js';
import logger from './logger/logger.js';

const app = express();

// Trust proxy settings if behind a proxy
app.set('trust proxy', 1);

// Rate limiting configuration (as previously set up)
const rateLimitWindowMs =
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const rateLimitMaxRequests =
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100; // Limit each IP to 100 requests per windowMs

// Global rate limiter middleware
const limiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      error: 'Too many requests, please try again later.',
    });
  },
});

// Apply the rate limiting middleware to all requests
app.use(limiter);

// Routes
app.get('/view/media', VideoManageController.viewMedia);
app.get('/view/:file', VideoManageController.view);

// Apply rate limiting to heavy routes separately if needed
const heavyLimiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: parseInt(process.env.RATE_LIMIT_MAX_HEAVY_REQUESTS) || 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      error: 'Too many requests on heavy operation, please try again later.',
    });
  },
});

const storage = multer.memoryStorage();
const upload = multer({ storage });


app.post('/process', heavyLimiter, upload.single('file'), VideoManageController.process);




// Start the server
app.listen(PORT, () => {
  fileService
    .createFolder(PATHS)
    .then(() => {
      logger.info(`App started on port ${PORT}`);

      // Test database connection
      pool
        .getConnection()
        .then((connection) => {
          logger.info('Connected to MySQL database');
          connection.release();
        })
        .catch((err) => {
          logger.error('Unable to connect to MySQL database', err);
        });
    })
    .catch((err) => {
      logger.error('Error creating folders', err);
    });
});





cron.schedule('0 0 * * *', async () => {
  logger.info('Running cleanup job at 00:00...');
  const dbService = new DatabaseService();
  
  try {
    const expiredFiles = await dbService.getExpiredFiles();

    for (const file of expiredFiles) {
      // Parse the converted_files JSON column
      const convertedFiles = file.converted_files || [];
      const filesArray = Array.isArray(convertedFiles) ? convertedFiles : [];

      // Delete converted files
      for (const convertedFile of filesArray) {
        const filePath = path.join(PATHS.MEDIA, convertedFile.fileName);

        try {
          await fs.unlink(filePath);
          logger.info(`Deleted expired converted file: ${filePath}`);
        } catch (err) {
          if (err.code === 'ENOENT') {
            logger.warn(`Converted file not found for deletion: ${filePath}`);
          } else {
            logger.error(`Error deleting converted file ${filePath}:`, err);
          }
        }
      }

      // Delete compressed file if it exists
      if (file.compressed_file_name) {
        const compressedFilePath = path.join(PATHS.MEDIA, file.compressed_file_name);
        
        try {
          await fs.unlink(compressedFilePath);
          logger.info(`Deleted expired compressed file: ${compressedFilePath}`);
        } catch (err) {
          if (err.code === 'ENOENT') {
            logger.warn(`Compressed file not found for deletion: ${compressedFilePath}`);
          } else {
            logger.error(`Error deleting compressed file ${compressedFilePath}:`, err);
          }
        }
      }

      // Delete the record from the database
      try {
        await dbService.deleteConversionRecord(file.id);
        logger.info(`Deleted conversion record with ID: ${file.id}`);
      } catch (err) {
        logger.error(`Error deleting conversion record ID: ${file.id}`, err);
      }
    }

    logger.info('Expired files cleanup completed successfully');
  } catch (err) {
    logger.error('Error during expired files cleanup:', err);
  }
});



// Global handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
});
