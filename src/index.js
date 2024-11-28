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
  console.log('Running cleanup job at 00:00...');
  const dbService = new DatabaseService();
  try {
    const expiredFiles = await dbService.getExpiredFiles();

    for (const file of expiredFiles) {
      const filePath = path.join(PATHS.MEDIA, file.converted_file_name);

      // Delete the file from the filesystem
      try {
        await fs.unlink(filePath);
        logger.info(`Deleted expired file: ${filePath}`);
      } catch (err) {
        if (err.code === 'ENOENT') {
          logger.warn(`File not found for deletion: ${filePath}`);
        } else {
          logger.error(`Error deleting file ${filePath}:`, err);
        }
      }

      // Delete the record from the database
      await dbService.deleteConversionRecord(file.id);
    }

    logger.info('Expired files cleanup completed');
  } catch (err) {
    logger.error('Error during expired files cleanup:', err);
  }
});


// Global handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
});
