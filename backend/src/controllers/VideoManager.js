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

    const dbService = new DatabaseService();

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
async function process(req, res) {
  const dbService = new DatabaseService();
  const uploadService = new UploadService({});
  const videoManager = new VideoManager({});
  const conversionId = uploadService.videoId;

  // Extract user options from the request query parameters
  const { 
    compress = false, 
    convert = false, 
    removeAudio = false, 
    formatType, 
    resolution, 
    width,
    generatePoster = false, // New parameter
    posterFormat = 'png',   // Optional: allow users to specify the image format
    posterTime = 1          // Optional: time in seconds to capture the poster image
  } = req.query;

  // Convert generatePoster to boolean if it's coming as a string
  const shouldRemoveAudio = removeAudio === 'true' || removeAudio === true;

  // Convert removeAudio to boolean if it's coming as a string
  const shouldGeneratePoster = generatePoster === 'true' || generatePoster === true;

  // Ensure at least one operation is specified
  if (!compress && !convert && !shouldRemoveAudio && !shouldGeneratePoster) {
    return res.status(400).send({
      error: 'At least one operation (compress, convert, removeAudio, or generatePoster) must be specified.',
    });
  }

  // Validate resolution and width for compression
  if (compress) {
    const validResolutions = ['1080p', '720p', '480p', 'custom'];
    if (resolution && !validResolutions.includes(resolution)) {
      return res.status(400).send({
        error: `Invalid resolution specified. Valid options are ${validResolutions.join(', ')}`,
      });
    }
    if (resolution === 'custom' && (!width || isNaN(width))) {
      return res.status(400).send({
        error: 'Custom width must be a valid number',
      });
    }
  }

  // Parse multiple formats if provided for conversion
  const formatTypes = convert ? formatType?.split(',').map((f) => f.trim()) : [];

  let audioRemovedFile = null; // To track the audio-removed file
  const convertedFiles = [];
  let compressedFile = null;
  let posterFile = null; // To track the poster image file

  try {
    // Initialize the conversion record in the database
    await dbService.createConversionRecord({
      id: conversionId,
      originalFileName: '', // Will be updated later
      originalFileSize: 0,  // Will be updated later
      conversionType: compress && convert ? 'multi_step' : compress ? 'compression' : 'format_conversion',
    });

    logger.info(`Started processing job with ID: ${conversionId}`);

    // Access the uploaded file from req.file
    const uploadedFile = req.file;

    if (!uploadedFile) {
      throw new Error('No file uploaded');
    }

    // Set the file buffer and original name in UploadService
    uploadService.setFile(uploadedFile.buffer, uploadedFile.originalname);

    // Proceed with file upload
    const isUploaded = await uploadService.uploadFile();
    if (!isUploaded) {
      throw new Error('Upload failed');
    }

    // Update the original file name and size in the database
    await dbService.updateConversionStatus(conversionId, 'processing', {
      originalFileName: uploadService.originalFileName,
      originalFileSize: uploadService.originalFileSize,
    });

    // Update videoManager properties with the full path
    videoManager.updateProperties({
      id: uploadService.videoId,
      extension: uploadService.videoExtension,
      inputFile: uploadService.videoFile, // Full path
    });

    // **Logging to Confirm Properties**
    logger.info(`VideoManager properties set - ID: ${videoManager.id}, Extension: ${videoManager.extension}, InputFile: ${videoManager.inputFile}`);

    // Perform audio removal if requested
    if (shouldRemoveAudio) {
      const isAudioRemoved = await videoManager.removeAudio();
      if (!isAudioRemoved) {
        throw new Error('Audio removal failed');
      }

      // Store audio-removed file information
      audioRemovedFile = {
        fileName: videoManager.fileName,
        fileSize: videoManager.fileSize,
        fileLink: linkToFile({ req, file: videoManager.fileName })
      };

      logger.info(`Audio removed file saved at: ${videoManager.outputFile}`);

      // Update the input file to the full path of the audio-removed file
      videoManager.updateProperties({
        inputFile: videoManager.outputFile, // Ensure this is the full path
      });

      // **Logging After Updating Input File**
      logger.info(`VideoManager inputFile updated after audio removal - InputFile: ${videoManager.inputFile}`);
    }

    // Perform compression if requested
    if (compress) {
      logger.info(`Compressing file: ${videoManager.inputFile} with resolution: ${resolution}, width: ${width}`);

      const isCompressed = await videoManager.compress(resolution, width);
      if (!isCompressed) {
        throw new Error('Compression failed');
      }

      // **Ensure id and extension remain the same after compression**
      videoManager.updateProperties({
        inputFile: videoManager.outputFile,
        // id and extension remain unchanged
      });

      // Collect information about the compressed file
      compressedFile = {
        fileName: videoManager.fileName,
        fileSize: videoManager.fileSize,
        fileLink: linkToFile({ req, file: videoManager.fileName }),
      };

      logger.info(`Compression completed. Output file: ${videoManager.outputFile}, Size: ${videoManager.fileSize}`);
    }

    // Perform conversion if requested
    if (convert) {
      if (formatTypes.length === 0) {
        throw new Error('No format types specified for conversion.');
      }

      for (const format of formatTypes) {
        const tempVideoManager = new VideoManager({
          id: `${uploadService.videoId}-${format}`,
          extension: format,
          inputFile: videoManager.inputFile, // Ensuring full path
        });

        const isConverted = await tempVideoManager.convert(format);
        if (!isConverted) {
          throw new Error(`Conversion to ${format} failed`);
        }

        // Collect information about each converted file
        convertedFiles.push({
          format,
          fileName: tempVideoManager.fileName,
          fileSize: tempVideoManager.fileSize,
          fileLink: linkToFile({ req, file: tempVideoManager.fileName }),
        });

        logger.info(`Conversion to ${format} completed. Output file: ${tempVideoManager.outputFile}, Size: ${tempVideoManager.fileSize}`);
      }
    }

    // Perform poster image generation if requested
    if (shouldGeneratePoster) {
      const isPosterGenerated = await videoManager.generatePosterImage(posterTime, posterFormat);
      if (!isPosterGenerated) {
        throw new Error('Poster image generation failed');
      }

      // Collect information about the poster image
      posterFile = {
        fileName: videoManager.posterFileName,
        fileSize: videoManager.posterFileSize,
        fileLink: linkToFile({ req, file: videoManager.posterFileName }),
      };

      logger.info(`Poster image generated at: ${videoManager.posterOutputFile}`);
    }

    // Clean up temporary files
    await fileService.cleanFolder(uploadService.videoPath);

    // Update the conversion record as completed
    await dbService.updateConversionStatus(conversionId, 'completed', {
      convertedFiles,
      compressedFileName: compressedFile ? compressedFile.fileName : null,
      audioRemoved: shouldRemoveAudio,
      audioRemovedFile: audioRemovedFile,
      posterFileName: posterFile ? posterFile.fileName : null,
      posterFileSize: posterFile ? posterFile.fileSize : null,
    });

    logger.info(`Processing job completed with ID: ${conversionId}`);

    // Prepare the response with the poster image information
    const response = {
      initialSize: formatBytes(uploadService.originalFileSize),
      finalSize: formatBytes(shouldRemoveAudio || compress ? videoManager.fileSize : uploadService.originalFileSize),
      audioRemoved: shouldRemoveAudio,
      audioRemovedFile: audioRemovedFile ? {
        size: formatBytes(audioRemovedFile.fileSize),
        link: audioRemovedFile.fileLink
      } : null,
      compressedFile: compressedFile
        ? {
            size: formatBytes(compressedFile.fileSize),
            link: compressedFile.fileLink,
          }
        : null,
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
  } catch (err) {
    // Handle errors during the upload and processing
    await dbService.updateConversionStatus(conversionId, 'failed', {
      errorMessage: err.message,
    });
    logger.error(`Processing failed for ID: ${conversionId}`, err);
    res.status(500).send({ error: err.message });
  }
}


export const VideoManageController = {
  view,
  viewMedia,
  process,
};
