import 'dotenv/config';
import { DatabaseService } from '../services/DatabaseService.js';
import { VideoManager } from '../services/VideoManager.js';
import { fileService } from '../services/FileService.js';
import { PATHS } from '../utils/constants.js';
import { pool } from '../utils/dbConfig.js';
import logger from '../logger/logger.js';
import fs from 'fs/promises';
import path from 'path';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateProgress(id, progress) {
  try {
    await pool.execute('UPDATE conversions SET progress = ? WHERE id = ?', [progress, id]);
    logger.info(`Updated progress for job ${id} to ${progress}%`);
  } catch (err) {
    logger.error(`Failed to update progress for job ${id}:`, err);
  }
}

async function processJob(job) {
  const dbService = new DatabaseService();
  logger.info(`Starting processing of job ${job.id}`);

  try {
    await dbService.updateConversionStatus(job.id, 'processing');

    let options = JSON.parse(job.options || '{}');
    logger.info(`Job ${job.id} options: ${JSON.stringify({
      removeAudio: options.removeAudio,
      compress: options.compress,
      resolution: options.resolution,
      convert: options.convert,
      formatType: options.formatType,
      generatePoster: options.generatePoster
    })}`);

    const jobTmpDir = path.join(PATHS.TMP, job.id);
    const videoExtension = options.videoExtension || 'mp4';
    const inputFile = path.resolve(jobTmpDir, `${job.id}.${videoExtension}`);

    await fs.access(inputFile);

    const videoManager = new VideoManager({
      id: job.id,
      extension: videoExtension,
      inputFile: inputFile
    });

    let progress = 0;
    await updateProgress(job.id, progress);

    videoManager.on('progress', async (p) => {
      progress = p;
      await updateProgress(job.id, progress);
    });

    if (options.removeAudio) {
      logger.info(`Job ${job.id}: Starting audio removal`);
      const isRemoved = await videoManager.removeAudio();
      if (!isRemoved) throw new Error('Audio removal failed');
      logger.info(`Job ${job.id}: Audio removed successfully`);
    }

    if (options.compress) {
      logger.info(`Job ${job.id}: Starting compression`);
      const isCompressed = await videoManager.compress(options.resolution, options.width);
      if (!isCompressed) throw new Error('Compression failed');
      logger.info(`Job ${job.id}: Compression completed successfully`);
    }

    if (options.convert && options.formatType) {
      const formatTypes = options.formatType.split(',').map(f => f.trim());
      logger.info(`Job ${job.id}: Starting format conversion to ${formatTypes.join(', ')}`);

      for (const format of formatTypes) {
        const isConverted = await videoManager.convert(format);
        if (!isConverted) throw new Error(`Conversion to ${format} failed`);
        logger.info(`Job ${job.id}: Conversion to ${format} completed`);
      }
    }

    if (options.generatePoster) {
      logger.info(`Job ${job.id}: Starting poster generation`);
      const isPosterGenerated = await videoManager.generatePosterImage(
        options.posterTime || 1,
        options.posterFormat || 'png'
      );
      if (!isPosterGenerated) throw new Error('Poster generation failed');
      logger.info(`Job ${job.id}: Poster generation completed`);
    }

    const results = {
      convertedFiles: videoManager.convertedFiles || [],
      compressedFileName: videoManager.compressedFileName || null,
      compressedFileSize: videoManager.compressedFileSize || null,
      audioRemoved: options.removeAudio || false,
      audioRemovedFile: videoManager.audioRemovedFile || null,
      posterFileName: videoManager.posterFileName || null,
      posterFileSize: videoManager.posterFileSize || null
    };

    try {
      await fileService.deleteFolder(jobTmpDir);
      logger.info(`Job ${job.id}: Temporary directory removed`);
    } catch (cleanupError) {
      logger.error(`Job ${job.id}: Cleanup failed - ${cleanupError.message}`);
    }
    logger.info(`Job ${job.id}: Completed successfully`);

    await dbService.updateConversionStatus(job.id, 'completed', results);
    await updateProgress(job.id, 100);
  } catch (error) {
    logger.error(`Job ${job.id}: Failed - ${error.message}`);
    try {
      const jobTmpDir = path.join(PATHS.TMP, job.id);
      await fileService.deleteFolder(jobTmpDir);
      logger.info(`Job ${job.id}: Temporary directory removed after failure`);
    } catch (cleanupError) {
      logger.error(`Job ${job.id}: Cleanup failed - ${cleanupError.message}`);
    }
    await dbService.updateConversionStatus(job.id, 'failed', { errorMessage: error.message });
  }
}

async function workerLoop() {
  logger.info('Worker started and entering main loop');

  while (true) {
    try {
      logger.info('Looking for pending jobs...');
      const [rows] = await pool.execute(`
        SELECT * FROM conversions WHERE status='pending' ORDER BY start_time LIMIT 1
      `);

      if (rows.length === 0) {
        logger.info('No pending jobs found. Sleeping for 5 seconds.');
        await sleep(5000);
        continue;
      }

      const job = rows[0];
      logger.info(`Found pending job: ${job.id}`);
      await processJob(job);
    } catch (err) {
      logger.error('Unexpected error in worker loop:', err);
      await sleep(5000);
    }
  }
}

workerLoop().catch(err => logger.error('Worker crashed:', err));
