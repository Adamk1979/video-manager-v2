import fs from 'fs';
import { PATHS } from '../utils/constants.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import path from 'path';
import logger from '../logger/logger.js';

// Log the paths from static packages
logger.info(`FFmpeg static path: ${ffmpegStatic}`);

// Find ffprobe binary - check both possible locations
let ffprobePath = '';
const possiblePaths = [
  ffprobeStatic.path,
  path.resolve('./node_modules/@ffprobe-installer/linux-x64/ffprobe'),
  path.resolve('./node_modules/@ffprobe-installer/ffprobe')
];

for (const probePath of possiblePaths) {
  try {
    if (probePath && fs.existsSync(probePath)) {
      ffprobePath = probePath;
      logger.info(`Found valid ffprobe at: ${ffprobePath}`);
      break;
    }
  } catch (err) {
    logger.warn(`Error checking ffprobe path ${probePath}: ${err.message}`);
  }
}

if (!ffprobePath) {
  logger.error('No valid ffprobe binary found in any of the expected locations');
}

// Check if the files exist and have execute permissions
try {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    const ffmpegStats = fs.statSync(ffmpegStatic);
    const isExecutable = !!(ffmpegStats.mode & 0o111);
    logger.info(`FFmpeg binary exists at: ${ffmpegStatic} (executable: ${isExecutable})`);
    
    if (!isExecutable) {
      logger.warn('FFmpeg binary is not executable, attempting to add execute permission');
      try {
        fs.chmodSync(ffmpegStatic, '755');
        logger.info('Execute permission added to FFmpeg binary');
      } catch (chmodErr) {
        logger.error(`Failed to add execute permission to FFmpeg: ${chmodErr.message}`);
      }
    }
  } else {
    logger.error(`FFmpeg binary NOT found at: ${ffmpegStatic}`);
  }
  
  if (ffprobePath && fs.existsSync(ffprobePath)) {
    const ffprobeStats = fs.statSync(ffprobePath);
    const isExecutable = !!(ffprobeStats.mode & 0o111);
    logger.info(`FFprobe binary exists at: ${ffprobePath} (executable: ${isExecutable})`);
    
    if (!isExecutable) {
      logger.warn('FFprobe binary is not executable, attempting to add execute permission');
      try {
        fs.chmodSync(ffprobePath, '755');
        logger.info('Execute permission added to FFprobe binary');
      } catch (chmodErr) {
        logger.error(`Failed to add execute permission to FFprobe: ${chmodErr.message}`);
      }
    }
  } else {
    logger.error(`FFprobe binary NOT found at: ${ffprobePath || 'undefined'}`);
  }
} catch (err) {
  logger.error(`Error checking binaries: ${err.message}`);
}

// Set ffmpeg and ffprobe paths
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobePath);

export class VideoManager {
  constructor({ id, extension, inputFile, outputPath = PATHS.MEDIA }) {
    this.id = id;
    this.extension = extension;
    this.inputFile = inputFile;
    this.outputPath = outputPath;
    this.outputFile = '';
    this.fileName = '';
    this.fileSize = 0;

    this.posterFileName = '';
    this.posterOutputFile = '';
    this.posterFileSize = 0;
  }

  updateProperties({ id, extension, inputFile }) {
    if (id !== undefined) this.id = id;
    if (extension !== undefined) this.extension = extension;
    if (inputFile !== undefined) this.inputFile = inputFile;
  }
  
  async compress(resolution, customWidth) {
    logger.info(`Compress Method - ID: ${this.id}, Extension: ${this.extension}, InputFile: ${this.inputFile}`);
    logger.info(`Compression parameters received:`, {
      resolution,
      customWidth,
      resolutionType: typeof resolution,
      customWidthType: typeof customWidth
    });

    this.fileName = `${this.id}.${this.extension}`;
    this.outputFile = `${this.outputPath}/${this.fileName}`;
    logger.info(`Compressing to file: ${this.outputFile}`);

    const resolutionMap = {
      '1080p': '1920x1080',
      '720p': '1280x720',
      '480p': '854x480',
    };

    let sizeOption;

    if (resolution === 'custom' && customWidth) {
      logger.info(`Processing custom resolution with width: ${customWidth}`);
      try {
        let aspectRatio = 16/9; // Default fallback
        
        try {
          aspectRatio = await this.getAspectRatio();
          logger.info(`Calculated aspect ratio: ${aspectRatio}`);
        } catch (aspectRatioError) {
          logger.error(`Error getting aspect ratio, using default 16:9: ${aspectRatioError.message}`);
        }
        
        const numericWidth = parseInt(customWidth, 10);
        logger.info(`Parsed numeric width: ${numericWidth}`);
        if (isNaN(numericWidth) || numericWidth <= 0) {
          throw new Error(`Invalid width value: ${customWidth}`);
        }
        const customHeight = Math.round(numericWidth / aspectRatio);
        sizeOption = `${numericWidth}x${customHeight}`;
        logger.info(`Final size option for custom resolution: ${sizeOption}`);
      } catch (error) {
        logger.error(`Error calculating custom resolution:`, error);
        throw error;
      }
    } else if (resolutionMap[resolution]) {
      sizeOption = resolutionMap[resolution];
      logger.info(`Using predefined resolution: ${sizeOption}`);
    } else {
      logger.warn(`No valid resolution option found. Resolution: ${resolution}, CustomWidth: ${customWidth}`);
      sizeOption = null;
    }

    return await new Promise((resolve, reject) => {
      let command = ffmpeg(this.inputFile);

      // Event handler for ffmpeg process stderr output
      command.on('stderr', (stderrLine) => {
        logger.info(`FFmpeg output: ${stderrLine}`);
      });

      if (sizeOption) {
        command = command.size(sizeOption);
        logger.info(`Applying size option to ffmpeg command: ${sizeOption}`);
      } else {
        logger.info('No size option applied to ffmpeg command');
      }

      command
        .videoCodec('libx264')
        .output(this.outputFile)
        .on('start', (commandLine) => {
          logger.info(`FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          logger.info(`FFmpeg progress: ${JSON.stringify(progress)}`);
        })
        .on('end', () => {
          try {
            // Check if file was actually created
            if (!fs.existsSync(this.outputFile)) {
              return reject(new Error(`Output file was not created: ${this.outputFile}`));
            }

            const stats = fs.statSync(this.outputFile);
            this.fileSize = stats.size;
            
            // Check if file is empty/too small
            if (stats.size < 1000) {
              return reject(new Error(`Output file is too small (${stats.size} bytes): ${this.outputFile}`));
            }
            
            logger.info(`Compression successful. Output file: ${this.outputFile}, Size: ${this.fileSize} bytes`);
            resolve(true);
          } catch (statErr) {
            logger.error(`Error getting stats for compressed file: ${statErr.message}`);
            reject(new Error(`Error getting stats for compressed file: ${statErr.message}`));
          }
        })
        .on('error', (err) => {
          logger.error(`Compression error: ${err.message}`);
          logger.error(`Error details:`, err);
          reject(new Error(`Error occurred during compression: ${err.message}`));
        })
        .run();
    });
  }

  async getAspectRatio() {
    logger.info(`Getting aspect ratio for file: ${this.inputFile}`);
    
    // Check if file exists before processing
    try {
      await fs.promises.access(this.inputFile, fs.constants.R_OK);
      logger.info(`File exists and is readable: ${this.inputFile}`);
    } catch (err) {
      logger.error(`File access error: ${err.message}`);
      throw new Error(`Cannot access input file: ${err.message}`);
    }
    
    return await new Promise((resolve) => {
      logger.info(`Starting ffprobe process for file: ${this.inputFile}`);
      
      try {
        ffmpeg.ffprobe(this.inputFile, (err, metadata) => {
          if (err) {
            logger.error(`FFProbe error: ${err.message}`, err);
            
            // Fall back to default aspect ratio of 16:9
            logger.info('Falling back to default 16:9 aspect ratio');
            resolve(16/9);
          } else {
            logger.info(`FFProbe metadata received`);
            
            if (!metadata || !metadata.streams) {
              logger.error('No metadata or streams found in file');
              // Fallback to default aspect ratio
              logger.info('Falling back to default 16:9 aspect ratio (no streams)');
              return resolve(16/9);
            }
            
            const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
            if (videoStream) {
              const { width, height } = videoStream;
              logger.info(`Found video dimensions: ${width}x${height}`);
              
              if (!width || !height || width <= 0 || height <= 0) {
                logger.error(`Invalid dimensions: ${width}x${height}`);
                // Fallback to default aspect ratio
                logger.info('Falling back to default 16:9 aspect ratio (invalid dimensions)');
                return resolve(16/9);
              }
              
              const aspectRatio = width / height;
              logger.info(`Calculated aspect ratio: ${aspectRatio}`);
              resolve(aspectRatio);
            } else {
              logger.error('No video stream found in file');
              // Fallback to default aspect ratio
              logger.info('Falling back to default 16:9 aspect ratio (no video stream)');
              resolve(16/9);
            }
          }
        });
      } catch (ffprobeError) {
        logger.error(`Exception in ffprobe: ${ffprobeError.message}`, ffprobeError);
        // Fallback to default aspect ratio
        logger.info('Falling back to default 16:9 aspect ratio (exception)');
        resolve(16/9);
      }
    });
  }
  
  async convert(formatType) {
    this.fileName = `${this.id}-${Date.now()}.${formatType}`;
    this.outputFile = `${this.outputPath}/${this.fileName}`;
  
    logger.info(`Starting conversion to format: ${formatType} on file: ${this.inputFile}`);
  
    return await new Promise((resolve, reject) => {
      ffmpeg(this.inputFile)
        .format(formatType)
        .save(this.outputFile)
        .on('end', () => {
          try {
            const stats = fs.statSync(this.outputFile);
            this.fileSize = stats.size;
            this.inputFile = this.outputFile;
            logger.info(`Conversion to ${formatType} completed. Output file: ${this.outputFile}, Size: ${this.fileSize} bytes`);
            resolve(true);
          } catch (statErr) {
            logger.error(`Error getting stats for converted file: ${statErr.message}`);
            reject(`Error getting stats for converted file: ${statErr.message}`);
          }
        })
        .on('error', (err) => {
          logger.error(`Conversion error: ${err.message}`);
          reject(new Error(`Error occurred during conversion: ${err.message}`));
        });
    });
  }
  
  readFile({ filePath, fileType }) {
    return fs.createReadStream(`${filePath}/${fileType}`);
  }

  async removeAudio() {
    this.fileName = `${this.id}-noaudio.${this.extension}`;
    this.outputFile = `${this.outputPath}/${this.fileName}`;

    logger.info(`Starting audio removal on file: ${this.inputFile}`);

    return await new Promise((resolve, reject) => {
      ffmpeg(this.inputFile)
        .noAudio()
        .videoCodec('copy')
        .output(this.outputFile)
        .on('end', () => {
          try {
            const stats = fs.statSync(this.outputFile);
            this.fileSize = stats.size;
            this.inputFile = this.outputFile;
            logger.info(`Audio removal completed. Output file: ${this.outputFile}, Size: ${this.fileSize} bytes`);
            resolve(true);
          } catch (err) {
            logger.error(`Error getting file stats after audio removal: ${err.message}`);
            reject(`Error getting file stats after audio removal: ${err.message}`);
          }
        })
        .on('error', (err) => {
          logger.error(`Audio removal error: ${err.message}`);
          reject(`Error removing audio: ${err.message}`);
        })
        .run();
    });
  }

  async generatePosterImage(timeInSeconds = 1, format = 'png') {
    this.posterFileName = `${this.id}-poster.${format}`;
    this.posterOutputFile = `${this.outputPath}/${this.posterFileName}`;

    return await new Promise((resolve, reject) => {
      ffmpeg(this.inputFile)
        .screenshots({
          timestamps: [timeInSeconds],
          filename: this.posterFileName,
          folder: this.outputPath,
          size: '1920x1080'
        })
        .on('end', () => {
          try {
            const stats = fs.statSync(this.posterOutputFile);
            this.posterFileSize = stats.size;
            resolve(true);
          } catch (err) {
            reject(`Error getting stats for poster image: ${err.message}`);
          }
        })
        .on('error', (err) => {
          reject(`Error generating poster image: ${err.message}`);
        });
    });
  }
}
