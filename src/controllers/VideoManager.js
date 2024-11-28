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
    const dbService = new DatabaseService();

    // Fetch file information from the database using JSON_SEARCH
    const sql = `
      SELECT * FROM conversions
      WHERE JSON_SEARCH(converted_files, 'one', ?, NULL, '$[*].fileName') IS NOT NULL
    `;
    const [rows] = await pool.execute(sql, [file]);
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

    // Use the converted_files object directly
    const convertedFiles = fileRecord.converted_files || [];
    // If necessary, add a check for array
    const filesArray = Array.isArray(convertedFiles) ? convertedFiles : [];

    const fileInfo = filesArray.find((f) => f.fileName === file);

    if (!fileInfo) {
      logger.warn(`File not found in converted_files: ${file}`);
      return res.status(404).send({ message: 'File not found' });
    }

    // Check if the file exists on the filesystem
    const filePath = `${PATHS.MEDIA}/${file}`;
    if (!fs.existsSync(filePath)) {
      logger.warn(`File not found on filesystem: ${filePath}`);
      return res.status(404).send({ message: 'File not found' });
    }

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

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileInfo.fileName}"`
    );
    res.setHeader('Content-Type', 'application/octet-stream');
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
  const { compress = false, convert = false, formatType } = req.query;

  // Ensure at least one operation is specified
  if (!compress && !convert) {
    return res.status(400).send({
      error: 'At least one of "compress" or "convert" operations must be specified.',
    });
  }

  // Parse multiple formats if provided
  const formatTypes = convert ? formatType?.split(',').map(f => f.trim()) : [];

  try {
    // Initialize the conversion record in the database
    await dbService.createConversionRecord({
      id: conversionId,
      originalFileName: '',
      originalFileSize: 0,
      conversionType:
        compress && convert
          ? 'multi_step'
          : compress
          ? 'compression'
          : 'format_conversion',
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

    // Update videoManager properties
    videoManager.updateProperties({
      id: uploadService.videoId,
      extension: uploadService.videoExtension,
      inputFile: uploadService.videoFile,
    });

    // Perform compression if requested
    if (compress) {
      const isCompressed = await videoManager.compress();
      if (!isCompressed) {
        throw new Error('Compression failed');
      }
      // Update the input file for further processing
      videoManager.updateProperties({
        inputFile: videoManager.outputFile,
      });
    }

    // Store converted files information
    const convertedFiles = [];

    // Perform conversion if requested
    if (convert) {
      if (formatTypes.length === 0) {
        throw new Error('No format types specified for conversion.');
      }

      for (const format of formatTypes) {
        const tempVideoManager = new VideoManager({
          id: `${uploadService.videoId}-${format}`,
          extension: format,
          inputFile: videoManager.inputFile,
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
      }
    }

    // Clean up temporary files
    await fileService.cleanFolder(uploadService.videoPath);

    // Update the conversion record as completed with multiple files
    await dbService.updateConversionStatus(conversionId, 'completed', {
      convertedFiles,
    });

    logger.info(`Processing job completed with ID: ${conversionId}`);

    // Prepare the response
    const response = {
      initialSize: formatBytes(uploadService.originalFileSize),
      finalSize: compress
        ? formatBytes(videoManager.fileSize)
        : formatBytes(uploadService.originalFileSize),
      convertedFiles: convertedFiles.map((file) => ({
        format: file.format,
        size: formatBytes(file.fileSize),
        link: file.fileLink,
      })),
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
