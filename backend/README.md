# Video Manager

## Overview

Video Manager is a tool designed to compress and convert videos into various formats, making them suitable for web use and other applications. Built with Node.js and utilizing the powerful `ffmpeg` library, this project allows users to perform video processing tasks such as removing audio, compressing videos, converting formats, and generating poster images.

## Features

- **Video Compression**: Reduce the size of your videos while maintaining quality.
- **Format Conversion**: Convert videos to multiple formats including MP4, WebM, MOV, and AVI.
- **Audio Removal**: Easily strip audio from video files.
- **Poster Image Generation**: Create thumbnail images from videos at specified timestamps.

## Prerequisites

- **Node.js**: Ensure you have Node.js installed on your system.
- **FFmpeg**: This project requires FFmpeg. You can download it from [here](https://ffmpeg.org/download.html).

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/video-manager.git
   cd video-manager
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Start the application:
   ```bash
   yarn start
   ```

## Usage

1. **Upload a Video**: Use the frontend interface to upload a video file.
2. **Select Options**: Choose from options like compressing, converting formats, removing audio, or generating a poster image.
3. **Process Video**: Click the "Process Video" button to start the processing.
4. **Download Results**: Once processing is complete, download the processed files from the provided links.

## API Endpoints

- **POST /process**: Upload and process a video file.
- **GET /view/:file**: View or download a processed video file.
- **GET /status/:uuid**: Check the status of a video processing job.

## Development

### Code Formatting and Linting

- **Prettier**: Code formatting is handled by Prettier. Ensure your code adheres to the style guide by running:
  ```bash
  yarn format
  ```

- **ESLint**: Lint your code with ESLint:
  ```bash
  yarn lint
  ```

### Environment Variables

Create a `.env` file in the root directory and configure the following variables:


Components:

Controllers
-VideoManager.js

Database
-index.js

models
-conversion.js
-video.js

Services
-FileService.js
-UploadServices.js
-VideoManager.js

Utils
-constants.js
-formatBytes.js
-linkToFiles.js

Index.js


mysql
