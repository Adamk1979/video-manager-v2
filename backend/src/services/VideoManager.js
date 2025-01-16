import fs from 'fs';
import { PATHS } from '../utils/constants.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import logger from '../logger/logger.js';
import { EventEmitter } from 'events';
import path from 'path';
import { formatBytes } from '../utils/formatBytes.js';

ffmpeg.setFfmpegPath(ffmpegStatic);

export class VideoManager extends EventEmitter {
  constructor({ id, extension, inputFile, outputPath = PATHS.MEDIA }) {
    super();
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

    this.fileName = `${this.id}.${this.extension}`;
    this.outputFile = path.join(this.outputPath, this.fileName);
    logger.info(`Compressing to file: ${this.outputFile}`);

    const resolutionMap = {
      '1080p': '1920x1080',
      '720p': '1280x720',
      '480p': '854x480',
    };

    let sizeOption;

    if (resolution === 'custom' && customWidth) {
      const aspectRatio = await this.getAspectRatio();
      const numericWidth = parseInt(customWidth, 10);
      const customHeight = Math.round(numericWidth / aspectRatio);
      sizeOption = `${numericWidth}x${customHeight}`;
    } else if (resolutionMap[resolution]) {
      sizeOption = resolutionMap[resolution];
    } else {
      sizeOption = null;
    }

    return new Promise((resolve, reject) => {
      let totalDuration = 0;

      ffmpeg.ffprobe(this.inputFile, (err, metadata) => {
        if (err) {
          logger.error(`FFProbe error: ${err.message}`);
          return reject(`FFProbe error: ${err.message}`);
        }
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (videoStream && videoStream.duration) {
          totalDuration = videoStream.duration;
        } else {
          logger.warn('Unable to determine video duration for progress tracking.');
        }

        let command = ffmpeg(this.inputFile);

        if (sizeOption) {
          command = command.size(sizeOption);
        }

        command
          .videoCodec('libx264')
          .output(this.outputFile)
          .on('start', (commandLine) => {
            logger.info(`FFmpeg process started: ${commandLine}`);
          })
          .on('progress', (progress) => {
            if (totalDuration) {
              const percent = Math.min((progress.timemark / totalDuration) * 100, 100);
              const roundedPercent = Math.round(percent);
              logger.info(`Progress: ${roundedPercent}%`);
              this.emit('progress', roundedPercent);
            }
          })
          .on('end', () => {
            try {
              const stats = fs.statSync(this.outputFile);
              this.fileSize = stats.size;
              logger.info(`Compression successful. Output file: ${this.outputFile}, Size: ${formatBytes(this.fileSize)}`);
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
    });
  }

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
