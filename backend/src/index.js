/* eslint-disable no-undef */
// src/index.js

import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import * as fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import cors from 'cors';
import { PORT, PATHS } from './utils/constants.js';
import { fileService } from './services/FileService.js';
import { VideoManageController } from './controllers/VideoManager.js';
import { pool } from './utils/dbConfig.js';
import { DatabaseService } from './services/DatabaseService.js';
import logger from './logger/logger.js';
import { fileURLToPath } from 'url';

const app = express();

app.set('trust proxy', 1);

app.use(cors({
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, '../../frontend');

app.use(express.static(frontendPath));

const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: {
        fileSize: 1024 * 1024 * 1024
    }
});

app.get('/view/media', VideoManageController.viewMedia);
app.get('/view/:file', VideoManageController.view);
app.get('/status/:uuid', VideoManageController.status);

app.post('/process', 
    upload.single('file'), 
    (err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                error: `Upload error: ${err.message}`
            });
        } else if (err) {
            return res.status(500).json({
                error: `Server error: ${err.message}`
            });
        }
        next();
    },
    VideoManageController.process
);

app.get('/', (req, res) => {
    res.sendFile('index.html', { root: frontendPath });
});

app.use((err, req, res, next) => {
  logger.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

app.use((req, res) => {
    res.status(404).json({
        error: 'Not found'
    });
});

app.listen(PORT, () => {
    fileService
        .createFolder(PATHS)
        .then(() => {
            logger.info(`Server running on port ${PORT}`);
            logger.info(`Frontend available at http://localhost:${PORT}`);

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
            const convertedFiles = file.converted_files || [];
            const filesArray = Array.isArray(convertedFiles) ? convertedFiles : [];

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

            if (file.poster_file_name) {
                const posterFilePath = path.join(PATHS.MEDIA, file.poster_file_name);
                
                try {
                  await fs.unlink(posterFilePath);
                  logger.info(`Deleted expired poster image: ${posterFilePath}`);
                } catch (err) {
                  if (err.code === 'ENOENT') {
                    logger.warn(`Poster image not found for deletion: ${posterFilePath}`);
                  } else {
                    logger.error(`Error deleting poster image ${posterFilePath}:`, err);
                  }
                }
            }

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

process.on('unhandledRejection', (reason,) => {
    logger.error('Unhandled Rejection:', reason);
});

app.use(express.static('public'));

