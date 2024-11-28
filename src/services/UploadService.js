// src/services/UploadService.js

import * as fs from 'fs/promises'; // Corrected import
import { v4 as uuid4 } from 'uuid';
import { PATHS } from '../utils/constants.js';
import { fileTypeFromBuffer } from 'file-type';
import { Buffer } from 'buffer';

export class UploadService {
  constructor({ path = PATHS.TMP }) {
    this.videoId = uuid4();
    this.videoExtension = '';
    this.videoBuffer = Buffer.alloc(0);
    this.fileSizeLimit = process.env.FILE_SIZE_LIMIT || 2 * 1024 * 1024 * 1024; // Default to 2GB
    this.bytesReceived = 0;
    this.videoPath = path;
    this.videoFile = '';
    this.originalFileName = '';
    this.originalFileSize = 0;
  }


  setFile(buffer, originalName) {
    this.videoBuffer = buffer;
    this.bytesReceived = buffer.length;
    this.originalFileName = originalName;
  }


  async uploadFile() {
    try {
      const fileType = await fileTypeFromBuffer(this.videoBuffer);

      if (!fileType?.ext) {
        throw new Error('Unable to determine file type.');
      }

      this.videoExtension = fileType.ext;
      this.videoFile = `${this.videoPath}/${this.videoId}.${this.videoExtension}`;
      this.originalFileName = `${this.videoId}.${this.videoExtension}`;
      this.originalFileSize = this.bytesReceived;

      await fs.writeFile(this.videoFile, this.videoBuffer);

      return true;
    } catch (err) {
      const errorMessage = 'Something went wrong while writing the file: ' + err.message;
      throw new Error(errorMessage);
    }
  }

}
