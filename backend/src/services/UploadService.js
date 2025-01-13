import * as fs from 'fs/promises';
import { v4 as uuid4 } from 'uuid';
import { PATHS } from '../utils/constants.js';
import { fileTypeFromBuffer } from 'file-type';
import { Buffer } from 'buffer';
import logger from '../logger/logger.js';
import path from 'path';

export class UploadService {
  constructor({ path = PATHS.TMP }) {
    this.videoId = uuid4();
    this.videoExtension = '';
    this.videoBuffer = Buffer.alloc(0);
    this.originalFileName = '';
    this.originalFileSize = 0;
    this.videoPath = path; // Base TMP path
    this.videoFile = '';
  }

  async createJobFolder() {
    this.videoPath = path.join(this.videoPath, this.videoId); 
    try {
      await fs.mkdir(this.videoPath, { recursive: true });
      logger.info(`Created job-specific folder: ${this.videoPath}`);
    } catch (err) {
      logger.error(`Error creating job folder: ${err.message}`);
      throw err;
    }
  }

  setFile(buffer, originalName) {
    this.videoBuffer = buffer;
    this.originalFileName = originalName;
  }

  async uploadFile() {
    // Ensure job folder is created first
    await this.createJobFolder();

    const fileType = await fileTypeFromBuffer(this.videoBuffer);
    if (!fileType || !fileType.ext) {
      throw new Error('Unsupported file type');
    }

    this.videoExtension = fileType.ext;
    this.videoFile = `${this.videoPath}/${this.videoId}.${this.videoExtension}`;
    this.originalFileSize = this.videoBuffer.length;

    logger.info(`Uploading file to: ${this.videoFile}`);
    await fs.writeFile(this.videoFile, this.videoBuffer);

    return true;
  }
}
