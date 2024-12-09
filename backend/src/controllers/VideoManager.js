//src/controllers/VideoManager.js

import { UploadService } from '../services/UploadService.js';
import { VideoManager } from '../services/VideoManager.js';
import { linkToFile } from '../utils/linkToFile.js';
import { fileService } from '../services/FileService.js';
import { formatBytes } from '../utils/formatBytes.js';
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
    
    // Updated SQL query to also check for files in the converted_files array
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
        fileInfo = {
          fileName: fileRecord.compressed_file_name,
        };
      } else if (fileRecord.poster_file_name === file) {
        fileInfo = {
          fileName: fileRecord.poster_file_name,
        };
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

    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileInfo.fileName}"`
    );

    // Add a custom header to indicate if audio was removed
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
 * Controller function to handle video format conversion.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */

function parseAndValidateParams(req) {
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

  const shouldRemoveAudio = removeAudio === 'true' || removeAudio === true;
  const shouldGeneratePoster = generatePoster === 'true' || generatePoster === true;

  // Validate compression parameters
  if (compress) {
    const validResolutions = ['1080p', '720p', '480p', 'custom'];
    if (resolution && !validResolutions.includes(resolution)) {
      throw new Error(`Invalid resolution specified. Valid options are ${validResolutions.join(', ')}`);
    }
    if (resolution === 'custom' && (!width || isNaN(width))) {
      throw new Error('Custom width must be a valid number');
    }
  }

  // Validate conversion parameters
  const formatTypes = convert ? formatType?.split(',').map((f) => f.trim()) : [];
  if (convert && formatTypes.length === 0) {
    throw new Error('No format types specified for conversion.');
  }

  if (!compress && !convert && !shouldRemoveAudio && !shouldGeneratePoster) {
    throw new Error('At least one operation (compress, convert, removeAudio, or generatePoster) must be specified.');
  }

  return {
    shouldRemoveAudio,
    compress,
    convert,
    formatTypes,
    resolution,
    width,
    shouldGeneratePoster,
    posterFormat,
    posterTime
  };
}

/**
 * Handle the initial file upload and record creation.
 */
async function initializeProcess(dbService, uploadService) {
  await dbService.createConversionRecord({
    id: uploadService.videoId,
    originalFileName: '', 
    originalFileSize: 0,  
    conversionType: 'multi_step', // Use a valid value from the enum
  });

  const uploadedFile = uploadService.req.file;
  if (!uploadedFile) {
    throw new Error('No file uploaded');
  }

  uploadService.setFile(uploadedFile.buffer, uploadedFile.originalname);
  await uploadService.uploadFile();

  // Update conversion to processing
  await dbService.updateConversionStatus(uploadService.videoId, 'processing', {
    originalFileName: uploadService.originalFileName,
    originalFileSize: uploadService.originalFileSize,
  });
}

/**
 * Perform audio removal if requested.
 */
async function performAudioRemoval(videoManager, shouldRemoveAudio, req) {
  let audioRemovedFile = null;
  if (shouldRemoveAudio) {
    const isAudioRemoved = await videoManager.removeAudio();
    if (!isAudioRemoved) throw new Error('Audio removal failed');

    audioRemovedFile = {
      fileName: videoManager.fileName,
      fileSize: videoManager.fileSize,
      fileLink: linkToFile({ req, file: videoManager.fileName }),
    };
  }
  return audioRemovedFile;
}

/**
 * Perform compression if requested.
 */
async function performCompression(videoManager, compress, resolution, width, req) {
  let compressedFile = null;
  if (compress) {
    const isCompressed = await videoManager.compress(resolution, width);
    if (!isCompressed) throw new Error('Compression failed');

    compressedFile = {
      fileName: videoManager.fileName,
      fileSize: videoManager.fileSize,
      fileLink: linkToFile({ req, file: videoManager.fileName }),
    };
  }
  return compressedFile;
}

/**
 * Perform format conversion if requested.
 */
async function performConversion(videoManager, convert, formatTypes, req) {
  const convertedFiles = [];
  if (convert) {
    for (const format of formatTypes) {
      const tempVideoManager = new VideoManager({
        id: `${videoManager.id}-${format}`,
        extension: format,
        inputFile: videoManager.inputFile,
      });
      const isConverted = await tempVideoManager.convert(format);
      if (!isConverted) throw new Error(`Conversion to ${format} failed`);

      convertedFiles.push({
        format,
        fileName: tempVideoManager.fileName,
        fileSize: tempVideoManager.fileSize,
        fileLink: linkToFile({ req, file: tempVideoManager.fileName }),
      });
    }
  }
  return convertedFiles;
}

/**
 * Generate poster image if requested.
 */
async function generatePosterIfRequested(videoManager, shouldGeneratePoster, posterFormat, posterTime, req) {
  let posterFile = null;
  if (shouldGeneratePoster) {
    const isPosterGenerated = await videoManager.generatePosterImage(posterTime, posterFormat);
    if (!isPosterGenerated) throw new Error('Poster image generation failed');

    posterFile = {
      fileName: videoManager.posterFileName,
      fileSize: videoManager.posterFileSize,
      fileLink: linkToFile({ req, file: videoManager.posterFileName }),
    };
  }
  return posterFile;
}

/**
 * Update the conversion record as completed and prepare the final response.
 */
async function finalizeProcess(dbService, uploadService, videoManager, audioRemovedFile, compressedFile, convertedFiles, posterFile, shouldRemoveAudio, req, res) {
  await dbService.updateConversionStatus(uploadService.videoId, 'completed', {
    convertedFiles,
    compressedFileName: compressedFile ? compressedFile.fileName : null,
    audioRemoved: shouldRemoveAudio,
    audioRemovedFile: audioRemovedFile,
    posterFileName: posterFile ? posterFile.fileName : null,
    posterFileSize: posterFile ? posterFile.fileSize : null,
  });

  const response = {
    initialSize: formatBytes(uploadService.originalFileSize),
    finalSize: formatBytes(shouldRemoveAudio || compressedFile ? videoManager.fileSize : uploadService.originalFileSize),
    audioRemoved: shouldRemoveAudio,
    audioRemovedFile: audioRemovedFile ? {
      size: formatBytes(audioRemovedFile.fileSize),
      link: audioRemovedFile.fileLink
    } : null,
    compressedFile: compressedFile ? {
      size: formatBytes(compressedFile.fileSize),
      link: compressedFile.fileLink,
    } : null,
    convertedFiles: convertedFiles.map((file) => ({
      format: file.format,
      size: formatBytes(file.fileSize),
      link: file.fileLink,
    })),
    posterImage: posterFile ? {
      size: formatBytes(posterFile.fileSize),
      link: posterFile.fileLink,
    } : null,
  };

  res.send(response);
}

/**
 * The main process controller function, now more readable.
 */
async function process(req, res) {
  const dbService = new DatabaseService();
  const uploadService = new UploadService({ path: PATHS.TMP });
  uploadService.req = req; // Pass request to UploadService if needed
  const videoManager = new VideoManager({});

  try {
    const {
      shouldRemoveAudio,
      compress,
      convert,
      formatTypes,
      resolution,
      width,
      shouldGeneratePoster,
      posterFormat,
      posterTime
    } = parseAndValidateParams(req);

    await initializeProcess(dbService, uploadService);

    videoManager.updateProperties({
      id: uploadService.videoId,
      extension: uploadService.videoExtension,
      inputFile: uploadService.videoFile
    });

    const audioRemovedFile = await performAudioRemoval(videoManager, shouldRemoveAudio, req);
    if (audioRemovedFile) {
      videoManager.updateProperties({ inputFile: videoManager.outputFile });
    }

    const compressedFile = await performCompression(videoManager, compress, resolution, width, req);
    if (compressedFile) {
      videoManager.updateProperties({ inputFile: videoManager.outputFile });
    }

    const convertedFiles = await performConversion(videoManager, convert, formatTypes, req);
    // If conversions occurred, last conversion step updated inputFile implicitly

    const posterFile = await generatePosterIfRequested(videoManager, shouldGeneratePoster, posterFormat, posterTime, req);

    await fileService.cleanFolder(uploadService.videoPath);

    await finalizeProcess(dbService, uploadService, videoManager, audioRemovedFile, compressedFile, convertedFiles, posterFile, shouldRemoveAudio, req, res);
  } catch (err) {
    await dbService.updateConversionStatus(uploadService.videoId, 'failed', {
      errorMessage: err.message,
    });
    logger.error(`Processing failed for ID: ${uploadService.videoId}`, err);
    res.status(500).send({ error: err.message });
  }
}


export const VideoManageController = {
  view,
  viewMedia,
  process,
};
