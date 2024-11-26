import { UploadService } from '../services/UploadService.js';
import { VideoManager } from '../services/VideoManager.js';
import { linkToFile } from '../utils/linkToFile.js';
import { fileService } from '../services/FileService.js';
import { formatBytes } from '../utils/formatBytes.js';
import { PATHS } from '../utils/constants.js';
import { DatabaseService } from '../services/DatabaseService.js';
import { pool } from '../utils/dbConfig.js';
import logger from '../logger/logger.js';

/**
 * Controller function to stream a video file to the client.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
async function view(req, res) {
  try {
    const { file } = req.params;
    const dbService = new DatabaseService();

    // Fetch file information from the database
    const sql = `
      SELECT * FROM conversions WHERE converted_file_name = ?
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
      `attachment; filename="${fileRecord.converted_file_name}"`
    );
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
 * Controller function to handle video compression.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
async function compress(req, res) {
  const dbService = new DatabaseService();
  const uploadService = new UploadService({});
  const videoManager = new VideoManager({});
  const conversionId = uploadService.videoId;

  try {
    // Initialize the conversion record in the database
    await dbService.createConversionRecord({
      id: conversionId,
      originalFileName: '',
      originalFileSize: 0,
      conversionType: 'compression',
    });

    logger.info(`Started compression job with ID: ${conversionId}`);

    req.on('data', async (chunk) => {
      await uploadService.handleChunks(chunk);
    });

    req.on('end', async () => {
      try {
        const isUpload = await uploadService.uploadFile();

        if (!isUpload) {
          throw new Error('Upload failed');
        }

        // Update the original file name and size in the database
        await dbService.updateConversionStatus(conversionId, 'processing', {
          originalFileName: uploadService.originalFileName,
          originalFileSize: uploadService.originalFileSize,
        });

        videoManager.updateProperties({
          id: uploadService.videoId,
          extension: uploadService.videoExtension,
          inputFile: uploadService.videoFile,
        });

        const isCompressed = await videoManager.compress();
        if (!isCompressed) {
          throw new Error('Compression failed');
        }

        await fileService.cleanFolder(uploadService.videoPath);

        // Update the conversion record as completed
        await dbService.updateConversionStatus(conversionId, 'completed', {
          convertedFileName: videoManager.fileName,
          convertedFileSize: videoManager.fileSize,
        });

        logger.info(`Compression job completed with ID: ${conversionId}`);

        res.send({
          initialSize: formatBytes(uploadService.bytesReceived),
          compressedSize: formatBytes(videoManager.fileSize),
          compressedVideo: linkToFile({ req, file: videoManager.fileName }),
        });
      } catch (err) {
        // Handle errors during the upload and compression process
        await dbService.updateConversionStatus(conversionId, 'failed', {
          errorMessage: err.message,
        });
        logger.error(`Compression failed for ID: ${conversionId}`, err);
        res.status(500).send({ error: err.message });
      }
    });

    req.on('error', async (err) => {
      const message = `Error during upload: ${err.message}`;
      await dbService.updateConversionStatus(conversionId, 'failed', {
        errorMessage: message,
      });
      logger.error(`Upload error for conversion ID: ${conversionId}`, err);
      res.status(500).send({ error: message });
    });
  } catch (err) {
    await dbService.updateConversionStatus(conversionId, 'failed', {
      errorMessage: err.message,
    });
    logger.error(`Compression failed for ID: ${conversionId}`, err);
    res.status(500).send({ error: err.message });
  }
}

/**
 * Controller function to handle video format conversion.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
async function convert(req, res) {
  const dbService = new DatabaseService();
  const uploadService = new UploadService({});
  const { fileType } = req.query;
  const videoManager = new VideoManager({});
  const conversionId = uploadService.videoId;

  try {
    // Initialize the conversion record in the database
    await dbService.createConversionRecord({
      id: conversionId,
      originalFileName: '',
      originalFileSize: 0,
      conversionType: 'format_conversion',
    });

    logger.info(`Started format conversion job with ID: ${conversionId}`);

    req.on('data', async (chunk) => {
      await uploadService.handleChunks(chunk);
    });

    req.on('end', async () => {
      try {
        const isUploaded = await uploadService.uploadFile();
        if (!isUploaded) {
          throw new Error('Upload failed');
        }

        // Update the original file name and size in the database
        await dbService.updateConversionStatus(conversionId, 'processing', {
          originalFileName: uploadService.originalFileName,
          originalFileSize: uploadService.originalFileSize,
        });

        videoManager.updateProperties({
          id: uploadService.videoId,
          extension: uploadService.videoExtension,
          inputFile: uploadService.videoFile,
        });

        const isConverted = await videoManager.convert(fileType);
        if (!isConverted) {
          throw new Error('Conversion failed');
        }

        await fileService.cleanFolder(uploadService.videoPath);

        // Update the conversion record as completed
        await dbService.updateConversionStatus(conversionId, 'completed', {
          convertedFileName: videoManager.fileName,
          convertedFileSize: videoManager.fileSize,
        });

        logger.info(`Format conversion job completed with ID: ${conversionId}`);

        res.send({
          initialSize: formatBytes(uploadService.bytesReceived),
          convertedSize: formatBytes(videoManager.fileSize),
          convertedVideo: linkToFile({ req, file: videoManager.fileName }),
        });
      } catch (err) {
        // Handle errors during the upload and conversion process
        await dbService.updateConversionStatus(conversionId, 'failed', {
          errorMessage: err.message,
        });
        logger.error(`Conversion failed for ID: ${conversionId}`, err);
        res.status(500).send({ error: err.message });
      }
    });

    req.on('error', async (err) => {
      const message = `Error during upload: ${err.message}`;
      await dbService.updateConversionStatus(conversionId, 'failed', {
        errorMessage: message,
      });
      logger.error(`Upload error for conversion ID: ${conversionId}`, err);
      res.status(500).send({ error: message });
    });
  } catch (err) {
    await dbService.updateConversionStatus(conversionId, 'failed', {
      errorMessage: err.message,
    });
    logger.error(`Conversion failed for ID: ${conversionId}`, err);
    res.status(500).send({ error: err.message });
  }
}

export const VideoManageController = {
  view,
  viewMedia,
  compress,
  convert,
};
