# Video Manager Backend Integration Guide

This document outlines everything a frontend developer needs to know to integrate with the Video Manager backend.

## Base URL

```
http://localhost:3000
```

## Rate Limiting

The API implements two types of rate limiting:

- **Standard Rate Limit**: 100 requests per 15 minutes
- **Heavy Operations Rate Limit**: 50 requests per 15 minutes (applies to file processing)

When rate limits are exceeded, the API returns a `429` status code with an error message.

## Main Endpoints

### 1. Upload and Process Media

Upload and process a new media file for various operations (conversion, compression, audio removal, poster generation).

```http
POST /process
```

#### Headers

| Name         | Value            |
|--------------|------------------|
| Content-Type | multipart/form-data |

#### Request Parameters

**Form Data**:
- `file` (required): Media file to upload (max: 1GB)

**Query Parameters**:
- `compress` (boolean, optional): Whether to compress the video (default: false)
- `convert` (boolean, optional): Whether to convert the video to a different format (default: false)
- `removeAudio` (boolean, optional): Whether to remove audio from the video (default: false)
- `formatType` (string, optional): Desired output format (e.g., 'mp4', 'webm')
- `resolution` (string, optional): Desired output resolution (e.g., '720p')
- `width` (number, optional): Desired output width in pixels
- `generatePoster` (boolean, optional): Whether to generate a poster image (default: false)
- `posterFormat` (string, optional): Format for the poster image (default: 'png')
- `posterTime` (number, optional): Time in seconds for the poster image capture (default: 1)

#### Response (200 OK)

```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Error Responses

- `400 Bad Request`: Invalid parameters or file upload error
- `429 Too Many Requests`: Rate limit exceeded

### 2. Check Process Status

Poll this endpoint to get the current status of a file processing job.

```http
GET /status/:uuid
```

#### Parameters

| Parameter | Type   | Description                        |
|-----------|--------|------------------------------------|
| uuid      | string | Unique identifier of the conversion|

#### Response for Pending/Processing Status

```json
{
  "status": "processing",
  "progress": 45
}
```

#### Response for Completed Status

```json
{
  "status": "completed",
  "progress": 100,
  "files": [
    {
      "fileName": "550e8400-e29b-41d4-a716-446655440000-720p.mp4",
      "fileSize": 5242880,
      "resolution": "720p",
      "link": "http://localhost:3000/view/550e8400-e29b-41d4-a716-446655440000-720p.mp4"
    }
  ],
  "compressed": {
    "fileName": "550e8400-e29b-41d4-a716-446655440000-compressed.mp4",
    "fileSize": 3145728,
    "link": "http://localhost:3000/view/550e8400-e29b-41d4-a716-446655440000-compressed.mp4"
  },
  "poster": {
    "fileName": "550e8400-e29b-41d4-a716-446655440000-poster.png",
    "fileSize": 51200,
    "link": "http://localhost:3000/view/550e8400-e29b-41d4-a716-446655440000-poster.png"
  },
  "audioRemovedFile": {
    "fileName": "550e8400-e29b-41d4-a716-446655440000-noaudio.mp4",
    "fileSize": 4194304,
    "link": "http://localhost:3000/view/550e8400-e29b-41d4-a716-446655440000-noaudio.mp4"
  }
}
```

#### Response for Failed Status

```json
{
  "status": "failed",
  "error": "Detailed error message"
}
```

#### Error Responses

- `404 Not Found`: Job not found
- `500 Internal Server Error`: Server error during processing

### 3. View Media File

Stream/download a processed media file.

```http
GET /view/:file
```

#### Parameters

| Parameter | Type   | Description           |
|-----------|--------|-----------------------|
| file      | string | Name of file to view  |

#### Response

Returns the file stream with appropriate content type if found.

#### Headers in Response

- `Content-Type`: The MIME type of the file (e.g., 'video/mp4', 'image/png')
- `Content-Disposition`: Attachment with filename
- `X-Audio-Removed`: 'true' if audio was removed from the video (only present when applicable)

#### Error Responses

- `404 Not Found`: File not found
- `410 Gone`: File has expired and is no longer available

### 4. View All Media Files

Get a list of all media files in the system.

```http
GET /view/media
```

#### Response

```json
{
  "files": [
    "http://localhost:3000/view/file1.mp4",
    "http://localhost:3000/view/file2.mp4",
    "http://localhost:3000/view/poster1.png"
  ]
}
```

## File Expiration

Files have an expiration date set when they are processed. After expiration:

1. Files are automatically cleaned up by a daily cron job (runs at midnight)
2. Attempts to access expired files will return a `410 Gone` status code
3. Database records for expired files are removed

## Error Handling

The API uses conventional HTTP response codes to indicate the success or failure of requests.

### Error Response Format

```json
{
  "error": "Error message",
  "message": "Detailed error description" // Only for 500 errors
}
```

### Common Error Codes

| Code | Description                                          |
|------|------------------------------------------------------|
| 400  | Bad Request - Invalid parameters or file upload error|
| 404  | Not Found - Requested resource doesn't exist         |
| 410  | Gone - Resource has expired                          |
| 429  | Too Many Requests - Rate limit exceeded              |
| 500  | Internal Server Error - Something went wrong         |

## Frontend Implementation Tips

### File Upload Process

1. Create a form with `enctype="multipart/form-data"`
2. Get the file from an input field
3. Use FormData to prepare the request
4. Send the file to `/process` endpoint with desired processing options
5. Store the returned UUID
6. Poll the `/status/:uuid` endpoint to track processing progress
7. When status is "completed", use the provided links to display/download the processed files

### Example Implementation (JavaScript)

```javascript
// 1. Upload and process a file
async function uploadAndProcessFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  // Add query parameters for specific processing
  const queryParams = new URLSearchParams({
    convert: 'true',
    resolution: '720p',
    generatePoster: 'true'
  });
  
  const response = await fetch(`http://localhost:3000/process?${queryParams}`, {
    method: 'POST',
    body: formData
  });
  
  const data = await response.json();
  return data.uuid;
}

// 2. Check processing status
async function checkStatus(uuid) {
  const response = await fetch(`http://localhost:3000/status/${uuid}`);
  return await response.json();
}

// 3. Poll status until complete
async function pollUntilComplete(uuid, onProgress, onComplete, onError) {
  const poll = setInterval(async () => {
    try {
      const status = await checkStatus(uuid);
      
      if (status.status === 'processing') {
        onProgress(status.progress);
      } else if (status.status === 'completed') {
        clearInterval(poll);
        onComplete(status);
      } else if (status.status === 'failed') {
        clearInterval(poll);
        onError(status.error);
      }
    } catch (error) {
      clearInterval(poll);
      onError(error.message);
    }
  }, 2000); // Poll every 2 seconds
}

// Usage example
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const uuid = await uploadAndProcessFile(file);
  
  pollUntilComplete(
    uuid,
    (progress) => {
      console.log(`Processing: ${progress}%`);
      // Update progress bar
    },
    (result) => {
      console.log('Processing complete!', result);
      // Display video player with original + converted options
      // Show poster image
      // Provide download links
    },
    (error) => {
      console.error('Processing failed:', error);
      // Show error to user
    }
  );
});
``` 