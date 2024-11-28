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
  
  async compress(outputFile = null) {
    this.fileName = outputFile || `${this.id}.${this.extension}`;
    this.outputFile = `${this.outputPath}/${this.fileName}`;
  
    return await new Promise((resolve, reject) => {
      ffmpeg(this.inputFile)
        // Add compression options here if needed
        .save(this.outputFile)
        .on('end', () => {
          const stats = fs.statSync(this.outputFile);
          this.fileSize = stats.size;
  
          // Update inputFile to the output of compression for further processing
          this.inputFile = this.outputFile;
  
          resolve(true);
        })
        .on('error', (err) => {
          reject(new Error(`Error occurred during compression: ${err.message}`));
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
