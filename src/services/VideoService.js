// src/services/VideoService.js

import * as fs from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { PATHS } from '../utils/constants.js';

ffmpeg.setFfmpegPath(ffmpegStatic);

export class VideoService {
  constructor({ id, inputFile, outputPath = PATHS.MEDIA }) {
    this.id = id;
    this.inputFile = inputFile;
    this.outputPath = outputPath;
  }

  async convert({ formats, removeAudio, resolution }) {
    const tasks = formats.map((format) =>
      this._processFormat({ format, removeAudio, resolution })
    );

    const results = await Promise.all(tasks);

    // Clean up the input file
    await fs.unlink(this.inputFile);

    return results;
  }

  _processFormat({ format, removeAudio, resolution }) {
    return new Promise((resolve, reject) => {
      const outputFileName = `${this.id}.${format}`;
      const outputFilePath = `${this.outputPath}/${outputFileName}`;

      let command = ffmpeg(this.inputFile).format(format);

      if (removeAudio) {
        command = command.noAudio();
      }

      if (resolution) {
        command = command.size(resolution);
      }

      command
        .save(outputFilePath)
        .on('end', async () => {
          const stats = await fs.stat(outputFilePath);
          resolve({
            format,
            fileName: outputFileName,
            size: stats.size,
          });
        })
        .on('error', (err) => {
          reject(new Error(`Error converting to ${format}: ${err.message}`));
        });
    });
  }
}
