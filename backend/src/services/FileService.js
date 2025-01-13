import * as fs from 'fs/promises';
import path from 'path';

export class FileService {
  constructor() {}

  async createFolder(paths) {
    for (const folderPath of Object.values(paths)) {
      try {
        await fs.access(folderPath);
      } catch {
        await fs.mkdir(folderPath, { recursive: true });
      }
    }
  }

  async cleanFolder(folderPath) {
    // Removes all files in a folder but not the folder itself
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        await this.deleteFolder(fullPath); // recursively delete subfolders
      } else {
        await fs.unlink(fullPath);
      }
    }
  }

  async deleteFolder(folderPath) {
    // Recursively delete a folder and all its contents
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        await this.deleteFolder(fullPath);
      } else {
        await fs.unlink(fullPath);
      }
    }
    await fs.rmdir(folderPath);
  }

  async getAllFromFolder(folderPath) {
    const files = [];
    for (const file of await fs.readdir(folderPath)) {
      console.log(file);
      files.push(file);
    }
    return files;
  }
}

const fileService = new FileService();
export { fileService };
