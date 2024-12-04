// src/services/FileService.js

import * as fs from 'fs/promises'; // Corrected import

export class FileService {
  constructor() {}

  async createFolder(paths) {
    for (const path of Object.values(paths)) {
      try {
        await fs.access(path);
      } catch {
        await fs.mkdir(path, { recursive: true }); // Ensure parent directories are created
      }
    }
  }

  async cleanFolder(path) {
    for (const file of await fs.readdir(path)) {
      await fs.unlink(`${path}/${file}`);
    }
  }

  async getAllFromFolder(path) {
    const files = [];
    for (const file of await fs.readdir(path)) {
      console.log(file);
      files.push(file);
    }

    return files;
  }
}

const fileService = new FileService();

export { fileService };
