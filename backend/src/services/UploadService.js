// src/services/UploadService.js

import * as fs from 'fs/promises';
import path from 'path';
import { v4 as uuid4 } from 'uuid';
import { PATHS } from '../utils/constants.js';
import { fileTypeFromBuffer } from 'file-type';

export class UploadService {
  constructor({ path = PATHS.TMP }) {
    this.videoId = uuid4();
    this.videoExtension = '';
    this.originalFileName = '';
    this.originalFileSize = 0;
    this.videoPath = path;
    this.videoFile = '';
    this.uploadedFilePath = '';
  }

  setFile(file) {
    this.uploadedFilePath = file.path;
    this.originalFileName = file.originalname;
    this.originalFileSize = file.size;
  }
  async uploadFile() {
    const buffer = await fs.readFile(this.uploadedFilePath);
    const fileType = await fileTypeFromBuffer(buffer);

    if (!fileType || !fileType.ext) {
      throw new Error('Unsupported file type');
    }

    this.videoExtension = fileType.ext;
    this.videoFile = path.join(this.videoPath, `${this.videoId}.${this.videoExtension}`);

    await fs.rename(this.uploadedFilePath, this.videoFile);

    return true;
  }
}
