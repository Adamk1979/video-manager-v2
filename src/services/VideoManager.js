//src/services/VideoManager.js


import fs from 'fs';

import { PATHS } from '../utils/constants.js';

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

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
  }

  updateProperties({ id, extension, inputFile }) {
    this.id = id;
    this.extension = extension;
    this.inputFile = inputFile;
  }
  
  async compress(resolution, customWidth) {
    this.fileName = `${this.id}.${this.extension}`;
    this.outputFile = `${this.outputPath}/${this.fileName}`;

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
          const stats = fs.statSync(this.outputFile);
          this.fileSize = stats.size;
          resolve(true);
        })
        .on('error', (err) => {
          reject(`Error occurred: ${err.message}`);
        })
        .run();
    });
  }

  // Helper method to get the aspect ratio of the input video
  async getAspectRatio() {
    return await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(this.inputFile, (err, metadata) => {
        if (err) {
          reject(err);
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
    this.fileName = `${this.id}-${Date.now()}.${formatType}`; // Use timestamp to ensure unique file names
    this.outputFile = `${this.outputPath}/${this.fileName}`;
  
    return await new Promise((resolve, reject) => {
      ffmpeg(this.inputFile)
        .format(formatType)
        .save(this.outputFile)
        .on('end', () => {
          const stats = fs.statSync(this.outputFile);
          this.fileSize = stats.size;
  
          // Update inputFile to the output of conversion for further processing
          this.inputFile = this.outputFile;
  
          resolve(true);
        })
        .on('error', (err) => {
          reject(new Error(`Error occurred during conversion: ${err.message}`));
        });
    });
  }
  
  readFile({ filePath, fileType }) {
    return fs.createReadStream(`${filePath}/${fileType}`);
  }
}
