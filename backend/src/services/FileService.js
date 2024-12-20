import * as fs from 'fs/promises';
import path from 'path';

export class FileService {
  constructor() {}

  async createFolder(paths) {
    for (const p of Object.values(paths)) {
      try {
        await fs.access(p);
      } catch {
        await fs.mkdir(p, { recursive: true });
      }
    }
  }

  async cleanFolder(dirPath) {
    const items = await fs.readdir(dirPath);
    for (const item of items) {
      const itemPath = path.join(dirPath, item);

      let stats;
      try {
        stats = await fs.lstat(itemPath);
      } catch (error) {
        console.error(`Failed to lstat ${itemPath}:`, error);
        continue; // Skip items we can't stat
      }

      // Log item type for debugging
      console.log(`Cleaning item: ${itemPath}, isFile=${stats.isFile()}, isDirectory=${stats.isDirectory()}, isSymbolicLink=${stats.isSymbolicLink()}`);

      if (stats.isFile()) {
        try {
          await fs.unlink(itemPath);
        } catch (error) {
          console.error(`Failed to unlink ${itemPath}:`, error);
          // Try a forced removal if unlink fails
          await fs.rm(itemPath, { recursive: true, force: true });
        }
      } else {
        // If it's a directory, symlink, or anything else, try removing it recursively and forcefully
        try {
          await fs.rm(itemPath, { recursive: true, force: true });
        } catch (error) {
          console.error(`Failed to remove ${itemPath} with rm:`, error);
        }
      }
    }
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
