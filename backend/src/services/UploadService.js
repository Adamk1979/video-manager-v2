// src/services/UploadService.js

import * as fs from 'fs/promises'; // Corrected import
import { v4 as uuid4 } from 'uuid';
import { PATHS } from '../utils/constants.js';
import { fileTypeFromBuffer } from 'file-type';
import { Buffer } from 'buffer';
import logger from '../logger/logger.js';

export class UploadService {
  constructor({ path = PATHS.TMP }) {
    this.videoId = uuid4();
    this.videoExtension = '';
    this.videoBuffer = Buffer.alloc(0);
    this.originalFileName = '';
    this.originalFileSize = 0;
    this.videoPath = path;
    this.videoFile = '';
  }

  setFile(buffer, originalName) {
    this.videoBuffer = buffer;
    this.originalFileName = originalName;
  }
  async uploadFile() {
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