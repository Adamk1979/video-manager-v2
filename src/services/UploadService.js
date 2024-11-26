import fs from 'fs/promises';
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

  async uploadFile() {
    try {
      const fileType = await fileTypeFromBuffer(this.videoBuffer);

      if (!fileType?.ext) {
        return;
      }

      this.videoExtension = fileType.ext;
      this.videoFile = `${this.videoPath}/${this.videoId}.${this.videoExtension}`;
      this.originalFileName = `${this.videoId}.${this.videoExtension}`; // Store original file name
      this.originalFileSize = this.bytesReceived; // Store original file size

      await fs.writeFile(this.videoFile, this.videoBuffer);

      return true;
    } catch (err) {
      const errorMessage = 'Something went wrong while writing the file ' + err;
      throw Error(errorMessage);
    }
  }

  async handleChunks(chunk) {
    this.bytesReceived += chunk.length;

    if (this.bytesReceived > this.fileSizeLimit) {
      throw Error('File too large');
    }

    this.videoBuffer = Buffer.concat([this.videoBuffer, chunk]);
  }
}
