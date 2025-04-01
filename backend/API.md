# Video Manager API Documentation

This document outlines all available endpoints in the Video Manager API.

## Base URL

```
http://localhost:3000
```

## Rate Limiting

The API implements two types of rate limiting:

- Standard Rate Limit: 100 requests per 15 minutes
- Heavy Operations Rate Limit: 50 requests per 15 minutes (applies to file processing)

## Endpoints


GET /view/:file
```

#### Parameters

| Parameter | Type   | Description           |
|-----------|--------|-----------------------|
| file      | string | Name of file to view |

#### Response

Returns the file stream if found, or an error if not found.

### Get Conversion Status

Get the current status of a file conversion process.

```http
GET /status/:uuid
```

#### Parameters

| Parameter | Type   | Description                        |
|-----------|--------|------------------------------------|
| uuid      | string | Unique identifier of the conversion|

#### Response

```json
{
  "status": "processing",
  "progress": 45,
  "result": {
    // Additional conversion details when completed
  }
}
```

### Upload and Process Media

Upload and process a new media file for conversion.

```http
POST /process
```

#### Headers

| Name         | Value            |
|--------------|------------------|
| Content-Type | multipart/form-data |

#### Parameters

| Parameter | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| file      | File   | Yes      | Media file to process (max: 1GB) |
| format    | string | No       | Desired output format         |
| quality   | string | No       | Desired output quality        |

#### Response

```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "message": "File upload successful",
  "status": "processing"
}
```

## Error Responses

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
| 429  | Too Many Requests - Rate limit exceeded              |
| 500  | Internal Server Error - Something went wrong         |

## Example Usage

### Uploading a File

```bash
curl -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "file=@video.mp4" \
  http://localhost:3000/process
```

### Checking Conversion Status

```bash
curl http://localhost:3000/status/550e8400-e29b-41d4-a716-446655440000
```

### Streaming a Converted File

```bash
curl http://localhost:3000/view/converted_video_720p.mp4
``` 