// backend/src/controllers/VideoManager.js

import { UploadService } from '../services/UploadService.js';
import { VideoManager } from '../services/VideoManager.js';
import { linkToFile } from '../utils/linkToFile.js';
import { fileService } from '../services/FileService.js';
import { PATHS } from '../utils/constants.js';
import { DatabaseService } from '../services/DatabaseService.js';
import { pool } from '../utils/dbConfig.js';
import logger from '../logger/logger.js';
import fs from 'fs';

/**
 * Controller function to stream a video file to the client.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
async function view(req, res) {
  try {
    const { file } = req.params;
    logger.info(`Requested file: ${file}`);
    
    // SQL query to check for files in converted_files array or compressed/poster files
    const sql = `
      SELECT c.* 
      FROM conversions c 
      WHERE c.compressed_file_name = ?
         OR EXISTS (
           SELECT 1 
           FROM JSON_TABLE(
             c.converted_files,
             '$[*]' COLUMNS(
               fileName VARCHAR(255) PATH '$.fileName'
             )
           ) as files
           WHERE files.fileName = ?
         )
         OR (
           c.audio_removed = 1 
           AND ? LIKE CONCAT(c.id, '-noaudio.%')
         )
         OR c.poster_file_name = ?
    `;

    const [rows] = await pool.execute(sql, [file, file, file, file]);
    const fileRecord = rows[0];

    if (!fileRecord) {
      logger.warn(`File not found in database: ${file}`);
      return res.status(404).send({ message: 'File not found' });
    }

    // Check if the file has expired
    const now = new Date();
    if (new Date(fileRecord.expires_at) < now) {
      logger.warn(`Attempt to access expired file: ${file}`);
      return res
        .status(410)
        .send({ message: 'File has expired and is no longer available' });
    }

    let fileInfo = null;

    // Check if the file is in converted_files
    const convertedFiles = fileRecord.converted_files || [];
    const filesArray = Array.isArray(convertedFiles) ? convertedFiles : JSON.parse(convertedFiles);
    fileInfo = filesArray.find((f) => f.fileName === file);

    // If not found, check if it's the compressed file or poster file
    if (!fileInfo) {
      if (fileRecord.compressed_file_name === file) {
        fileInfo = { fileName: fileRecord.compressed_file_name };
      } else if (fileRecord.poster_file_name === file) {
        fileInfo = { fileName: fileRecord.poster_file_name };
      }
    }

    if (!fileInfo) {
      logger.warn(`File not found: ${file}`);
      return res.status(404).send({ message: 'File not found' });
    }

    // Check if the file exists on the filesystem
    const filePath = `${PATHS.MEDIA}/${file}`;
    if (!fs.existsSync(filePath)) {
      logger.warn(`File not found on filesystem: ${filePath}`);
      return res.status(404).send({ message: 'File not found' });
    }

    // Determine content type based on file extension
    const ext = file.split('.').pop().toLowerCase();
    const contentType = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      mkv: 'video/x-matroska',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg'
    }[ext] || 'application/octet-stream';

    // Stream the file to the client
    const videoManager = new VideoManager({});
    const readStream = videoManager.readFile({
      filePath: PATHS.MEDIA,
      fileType: file,
    });

    readStream.on('error', (err) => {
      logger.error(`Error reading file ${file}:`, err);
      res.status(404).send({ message: 'File not found' });
    });

    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);

    // Add a custom header if audio was removed
    if (fileRecord.audio_removed) {
      res.setHeader('X-Audio-Removed', 'true');
    }

    readStream.pipe(res);
  } catch (err) {
    logger.error('Error in view controller:', err);
    res.status(500).send({ message: 'Internal server error' });
  }
}

/**
 * Controller function to list all media files.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
async function viewMedia(req, res) {
  try {
    const files = await fileService.getAllFromFolder(PATHS.MEDIA);
    res.send({ files: files.map((file) => linkToFile({ req, file })) });
  } catch (err) {
    logger.error('Error in viewMedia controller:', err);
    res.status(500).send({ message: 'Internal server error' });
  }
}


/**
 * The new process method:
 * - Validates file
 * - Saves it temporarily
 * - Creates a pending job in the DB
 * - Returns UUID
 */
function extractOptionsFromRequest(req, videoExtension) {
  const {
    compress = false,
    convert = false,
    removeAudio = false,
    formatType,
    resolution,
    width,
    generatePoster = false,
    posterFormat = 'png',
    posterTime = 1
  } = req.query;

  return {
    compress: compress === 'true' || compress === true,
    convert: convert === 'true' || convert === true,
    removeAudio: removeAudio === 'true' || removeAudio === true,
    formatType: formatType || null,
    resolution: resolution || null,
    width: width || null,
    generatePoster: generatePoster === 'true' || generatePoster === true,
    posterFormat: posterFormat || 'png',
    posterTime: parseFloat(posterTime),
    videoExtension: videoExtension || 'mp4' // Ensure videoExtension is included
  };
}

/**
 * The new process method:
 * - Validates file
 * - Saves it temporarily
 * - Creates a pending job in the DB
 * - Returns UUID
 */
async function process(req, res) {
  try {
    const dbService = new DatabaseService();
    const uploadService = new UploadService({ path: PATHS.TMP });
    uploadService.req = req;

    const uploadedFile = req.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Save the file to TMP
    uploadService.setFile(uploadedFile.buffer, uploadedFile.originalname);
    await uploadService.uploadFile();

    // Extract options, including videoExtension
    const options = extractOptionsFromRequest(req, uploadService.videoExtension);

    // Create a record with status pending
    await dbService.createConversionRecord({
      id: uploadService.videoId,
      originalFileName: uploadService.originalFileName,
      originalFileSize: uploadService.originalFileSize,
      conversionType: 'multi_step',
      status: 'pending',
      options: JSON.stringify(options) // Ensure options are stored as JSON string
    });

    // Return the UUID to the client
    return res.json({ uuid: uploadService.videoId });

  } catch (error) {
    logger.error('Error in process controller:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Status method: Frontend polls this endpoint with the UUID
 * to get the current status of the job.
 */
async function status(req, res) {
  const { uuid } = req.params;

  function createFileLink(req, fileName) {
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}/view/${fileName}`;
  }

  try {
    const [rows] = await pool.execute(`
      SELECT 
        status, 
        progress, 
        converted_files, 
        compressed_file_name, 
        compressed_file_size,
        audio_removed, 
        audio_removed_file, 
        poster_file_name, 
        poster_file_size,
        original_file_size
      FROM conversions 
      WHERE id = ? 
      LIMIT 1
    `, [uuid]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = rows[0];

    logger.info(`Data Types for Job ${uuid}:`);
    logger.info(`converted_files type: ${typeof job.converted_files}`);
    logger.info(`audio_removed_file type: ${typeof job.audio_removed_file}`);

    if (job.status === 'pending' || job.status === 'processing') {
      return res.json({ 
        status: job.status, 
        progress: job.progress,
        initialSize: job.original_file_size 
      });
    } else if (job.status === 'completed') {
      // Handle convertedFiles
      let convertedFiles = [];
      if (job.converted_files) {
        if (typeof job.converted_files === 'string') {
          try {
            convertedFiles = JSON.parse(job.converted_files);
          } catch (e) {
            logger.error(`Error parsing converted_files for job ${uuid}:`, e);
            convertedFiles = [];
          }
        } else if (typeof job.converted_files === 'object') {
          convertedFiles = job.converted_files;
        }
      }

      // Add link field to converted files
      convertedFiles = convertedFiles.map(file => ({
        ...file,
        link: createFileLink(req, file.fileName)
      }));

      // Handle audioRemovedFile
      let audioRemovedFile = null;
      if (job.audio_removed_file) {
        if (typeof job.audio_removed_file === 'string') {
          try {
            audioRemovedFile = JSON.parse(job.audio_removed_file);
          } catch (e) {
            logger.error(`Error parsing audio_removed_file for job ${uuid}:`, e);
          }
        } else if (typeof job.audio_removed_file === 'object') {
          audioRemovedFile = job.audio_removed_file;
        }
      }

      if (audioRemovedFile) {
        audioRemovedFile.link = createFileLink(req, audioRemovedFile.fileName);
      }

      // Calculate the final size
      let finalSize = 0;
      convertedFiles.forEach(file => {
        finalSize += file.fileSize || 0;
      });
      if (audioRemovedFile && audioRemovedFile.fileSize) {
        finalSize += audioRemovedFile.fileSize;
      }
      if (job.poster_file_size) {
        finalSize += job.poster_file_size;
      }
      if (job.compressed_file_size) {
        finalSize += job.compressed_file_size;
      }

      const compressed = job.compressed_file_name ? {
        fileName: job.compressed_file_name,
        fileSize: job.compressed_file_size,
        link: createFileLink(req, job.compressed_file_name)
      } : null;

      const poster = job.poster_file_name ? {
        fileName: job.poster_file_name,
        fileSize: job.poster_file_size,
        link: createFileLink(req, job.poster_file_name)
      } : null;

      return res.json({
        status: 'completed',
        progress: 100,
        initialSize: job.original_file_size,
        finalSize: finalSize,
        files: convertedFiles,
        compressed,
        poster,
        audioRemovedFile
      });
    } else if (job.status === 'failed') {
      return res.json({ 
        status: 'failed', 
        error: job.error_message 
      });
    } else {
      return res.status(500).json({ error: 'Invalid job status.' });
    }
  } catch (error) {
    logger.error('Error fetching status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export const VideoManageController = {
  view,
  viewMedia,
  process,
  status
};
