// backend/src/worker/worker.js

import 'dotenv/config';
import { DatabaseService } from '../services/DatabaseService.js';
import { VideoManager } from '../services/VideoManager.js';
import { fileService } from '../services/FileService.js';
import { PATHS } from '../utils/constants.js';
import { pool } from '../utils/dbConfig.js';
import logger from '../logger/logger.js';
import fs from 'fs/promises';
import path from 'path';
import EventEmitter from 'events';

// Create a queue emitter for job notifications
export const jobQueue = new EventEmitter();

async function updateProgress(id, progress) {
  try {
    await pool.execute('UPDATE conversions SET progress = ? WHERE id = ?', [progress, id]);
    logger.info(`Updated progress for job ${id} to ${progress}%`);
  } catch (err) {
    logger.error(`Failed to update progress for job ${id}:`, err);
  }
}

async function listDirectory(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    logger.info(`Contents of ${dirPath}: ${files.join(', ')}`);
  } catch (err) {
    logger.error(`Failed to list directory ${dirPath}:`, err);
  }
}

async function processJob(job) {
  const dbService = new DatabaseService();
  logger.info(`Starting processing of job ${job.id}`);

  try {
    await dbService.updateConversionStatus(job.id, 'processing');
    logger.info(`Job ${job.id} status updated to 'processing'`);
  } catch (err) {
    logger.error(`Failed to update status to 'processing' for job ${job.id}:`, err);
    return;
  }

  let options = {};
  try {
    options = JSON.parse(job.options || '{}');
    logger.info(`Job ${job.id} options: ${JSON.stringify(options)}`);
  } catch (err) {
    logger.error(`Failed to parse options for job ${job.id}:`, err);
    await dbService.updateConversionStatus(job.id, 'failed', { errorMessage: 'Invalid options format' });
    return;
  }

  logger.info(`PATHS.TMP: ${PATHS.TMP}`);

  const videoExtension = options.videoExtension || 'mp4';
  const inputFile = path.resolve(PATHS.TMP, `${job.id}.${videoExtension}`);
  logger.info(`Job ${job.id} input file path: ${inputFile}`);

  try {
    await fs.access(inputFile);
    logger.info(`Input file exists for job ${job.id}: ${inputFile}`);
  } catch {
    logger.error(`Input file not found for job ${job.id}: ${inputFile}`);
    await dbService.updateConversionStatus(job.id, 'failed', { errorMessage: 'Input file not found' });
    return;
  }

  await listDirectory(PATHS.TMP);

  const videoManager = new VideoManager({
    id: job.id,
    extension: videoExtension,
    inputFile: inputFile
  });

  let convertedFiles = [];
  let compressedFileName = null;
  let compressedFileSize = null;
  let audioRemoved = false;
  let audioRemovedFile = null;
  let posterFileName = null;
  let posterFileSize = null;

  try {
    let progress = 0;
    await updateProgress(job.id, progress);

    if (options.removeAudio) {
      logger.info(`Job ${job.id}: Starting audio removal`);
      const isRemoved = await videoManager.removeAudio();
      if (!isRemoved) throw new Error('Audio removal failed');
      audioRemoved = true;
      audioRemovedFile = {
        fileName: videoManager.fileName,
        fileSize: videoManager.fileSize,
      };
      progress += 20;
      await updateProgress(job.id, progress);
      logger.info(`Job ${job.id}: Audio removed successfully`);

      videoManager.updateProperties({ inputFile: videoManager.outputFile });
    }

    if (options.compress) {
      logger.info(`Job ${job.id}: Starting compression with parameters:`, {
        resolution: options.resolution,
        width: options.width,
        rawResolution: options.resolution,
        rawWidth: options.width
      });

      try {
        const isCompressed = await videoManager.compress(options.resolution, options.width);
        if (!isCompressed) throw new Error('Compression failed without specific error');
        compressedFileName = videoManager.fileName;
        compressedFileSize = videoManager.fileSize;
        progress += 20;
        await updateProgress(job.id, progress);
        logger.info(`Job ${job.id}: Compression completed successfully`);
      } catch (compressionError) {
        logger.error(`Job ${job.id}: Compression error details:`, compressionError);
        throw compressionError; // Re-throw to be caught by the outer try-catch
      }

      videoManager.updateProperties({ inputFile: videoManager.outputFile });
    }

    if (options.convert && options.formatType) {
      const formatTypes = options.formatType.split(',').map(f => f.trim());
      logger.info(`Job ${job.id}: Starting format conversion to ${formatTypes.join(', ')}`);
      for (const format of formatTypes) {
        logger.info(`Job ${job.id}: Converting to format ${format}`);
        const tempVideoManager = new VideoManager({
          id: `${job.id}-${format}`,
          extension: format,
          inputFile: videoManager.inputFile
        });
        const isConverted = await tempVideoManager.convert(format);
        if (!isConverted) throw new Error(`Conversion to ${format} failed`);

        convertedFiles.push({
          format: format,
          fileName: tempVideoManager.fileName,
          fileSize: tempVideoManager.fileSize
        });
        logger.info(`Job ${job.id}: Conversion to ${format} completed successfully`);
      }
      progress += 20;
      await updateProgress(job.id, progress);
    }

    if (options.generatePoster) {
      logger.info(`Job ${job.id}: Starting poster image generation`);
      const posterFormat = options.posterFormat || 'png';
      const posterTime = options.posterTime || 1;
      const isPosterGenerated = await videoManager.generatePosterImage(posterTime, posterFormat);
      if (!isPosterGenerated) throw new Error('Poster image generation failed');

      posterFileName = videoManager.posterFileName;
      posterFileSize = videoManager.posterFileSize;
      progress += 20;
      await updateProgress(job.id, progress);
      logger.info(`Job ${job.id}: Poster image generated successfully`);
    }

    logger.info(`Job ${job.id}: Cleaning up temporary files`);
    await fileService.cleanFolder(PATHS.TMP);
    logger.info(`Job ${job.id}: Temporary files cleaned up`);

    await dbService.updateConversionStatus(job.id, 'completed', {
      convertedFiles,
      compressedFileName,
      compressedFileSize,
      audioRemoved,
      audioRemovedFile,
      posterFileName,
      posterFileSize
    });
    progress = 100;
    await updateProgress(job.id, progress);
    logger.info(`Job ${job.id} completed successfully with 100% progress`);
  } catch (error) {
    logger.error(`Error processing job ${job.id}:`, error);
    logger.error(`Error stack trace:`, error.stack);
    try {
      await dbService.updateConversionStatus(job.id, 'failed', { errorMessage: error.message || 'Unknown error occurred' });
    } catch (dbError) {
      logger.error(`Failed to update job status after error:`, dbError);
    }
  }
}

// Initialize the queue listener
async function initQueueListener() {
  logger.info('Initializing queue listener');
  
  // Set up event listener for new jobs
  jobQueue.on('newJob', async (jobId) => {
    logger.info(`Queue event received for job: ${jobId}`);
    
    try {
      // Get the job information from the database
      const [rows] = await pool.execute(`
        SELECT * FROM conversions WHERE id = ? AND status = 'pending' LIMIT 1
      `, [jobId]);
      
      if (rows.length === 0) {
        logger.warn(`Job ${jobId} not found or not in pending status`);
        return;
      }
      
      const job = rows[0];
      await processJob(job);
    } catch (err) {
      logger.error(`Error processing job ${jobId} from queue:`, err);
    }
  });
  
  // Periodically check for pending jobs that might have been missed
  setInterval(async () => {
    try {
      logger.debug('Checking for pending jobs...');
      const [rows] = await pool.execute(`
        SELECT * FROM conversions WHERE status = 'pending' ORDER BY start_time LIMIT 5
      `);
      
      if (rows.length > 0) {
        logger.info(`Found ${rows.length} pending jobs in periodic check`);
        
        // Process each job sequentially
        for (const job of rows) {
          logger.info(`Processing pending job from periodic check: ${job.id}`);
          await processJob(job);
        }
      }
    } catch (err) {
      logger.error('Error in periodic job check:', err);
    }
  }, 60000); // Check every minute
  
  logger.info('Queue listener initialized successfully');
}

// Start the queue listener
initQueueListener().catch(err => logger.error('Failed to initialize queue listener:', err));
