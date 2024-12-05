//src/services/VideoManager.js


import fs from 'fs';

import { PATHS } from '../utils/constants.js';

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import logger from '../logger/logger.js';

ffmpeg.setFfmpegPath(ffmpegStatic);

export class VideoManager {
  constructor({ id, extension, inputFile, outputPath = PATHS.MEDIA }) {
    this.id = id;
    this.extension = extension;
    this.inputFile = inputFile;
    this.outputPath = outputPath;
    this.outputFile = '';
    this.fileName = '';
    this.fileSize = 0;

    // New properties for poster image
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

    this.fileName = `${this.id}.${this.extension}`;
    this.outputFile = `${this.outputPath}/${this.fileName}`;

    // Log the fileName and outputFile for debugging
    logger.info(`Compressing to file: ${this.outputFile}`);

    // Map resolution options to actual sizes
    const resolutionMap = {
      '1080p': '1920x1080',
      '720p': '1280x720',
      '480p': '854x480',
    };

    let sizeOption;

    if (resolution === 'custom' && customWidth) {
      // Calculate aspect ratio based on the input video
      const aspectRatio = await this.getAspectRatio();
      const numericWidth = parseInt(customWidth, 10);
      const customHeight = Math.round(numericWidth / aspectRatio);
      sizeOption = `${numericWidth}x${customHeight}`;
    } else if (resolutionMap[resolution]) {
      sizeOption = resolutionMap[resolution];
    } else {
      // Default to original size if resolution is not specified or invalid
      sizeOption = null;
    }

    return await new Promise((resolve, reject) => {
      let command = ffmpeg(this.inputFile);

      if (sizeOption) {
        command = command.size(sizeOption);
      }

      command
        .videoCodec('libx264') // Use H.264 codec for better compression
        .output(this.outputFile)
        .on('end', () => {
          try {
            const stats = fs.statSync(this.outputFile);
            this.fileSize = stats.size;
            logger.info(`Compression successful. Output file: ${this.outputFile}, Size: ${this.fileSize} bytes`);
            resolve(true);
          } catch (statErr) {
            logger.error(`Error getting stats for compressed file: ${statErr.message}`);
            reject(`Error getting stats for compressed file: ${statErr.message}`);
          }
        })
        .on('error', (err) => {
          logger.error(`Compression error: ${err.message}`);
          reject(`Error occurred during compression: ${err.message}`);
        })
        .run();
    });
  }

  // Helper method to get the aspect ratio of the input video
  async getAspectRatio() {
    return await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(this.inputFile, (err, metadata) => {
        if (err) {
          reject(`FFProbe error: ${err.message}`);
        } else {
          const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
          if (videoStream) {
            const { width, height } = videoStream;
            resolve(width / height);
          } else {
            reject('No video stream found');
          }
        }
      });
    });
  }
  

  async convert(formatType) {
    this.fileName = `${this.id}-${Date.now()}.${formatType}`; // Ensure unique filename
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
