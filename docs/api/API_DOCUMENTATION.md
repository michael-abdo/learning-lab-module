# Learning Lab API Documentation

## Overview

The Learning Lab Module API enables users to upload, process, tag, and search documents of various file types. It also provides functionality to generate AI responses using a RAG (Retrieval-Augmented Generation) system integrated with AWS Bedrock.

## Base URL

```
https://api.runtheons.com/learning-lab
```

## Authentication

All API endpoints except `/auth/login` require authentication using JWT Bearer tokens.

### Request Headers

```
Authorization: Bearer <access_token>
```

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "error": "Error type",
  "message": "Detailed error message" 
}
```

Common HTTP status codes:

- `200 OK`: Request successful
- `400 Bad Request`: Invalid input or parameters
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

## API Endpoints

### Authentication

#### Login

Authenticates a user and returns an access token.

- **URL:** `/auth/login`
- **Method:** `POST`
- **Authentication:** None
- **Request Body:**

```json
{
  "username": "string",
  "password": "string"
}
```

- **Response:**

```json
{
  "token": "string",
  "user": {
    "_id": "string",
    "username": "string",
    "role": "string"
  }
}
```

#### Validate Token

Verifies if the current token is valid.

- **URL:** `/auth/validate`
- **Method:** `GET`
- **Authentication:** Required
- **Response:**

```json
{
  "valid": true,
  "user": {
    "_id": "string",
    "username": "string",
    "role": "string"
  },
  "tokenExpiresIn": "2023-05-24T12:34:56.789Z"
}
```

### Document Management

#### Upload Document

Uploads a document and initiates processing.

- **URL:** `/documents/upload`
- **Method:** `POST`
- **Authentication:** Required
- **Content-Type:** `multipart/form-data`
- **Request Body:**
  - `file`: File to upload (required, max size: 1GB)
  - `name`: Custom document name (optional)
  - `tags`: Document tags, comma-separated or array (optional)
- **Response:**

```json
{
  "message": "File uploaded successfully",
  "documentId": "string",
  "s3Uri": "string"
}
```

#### Get Document Status

Retrieves the processing status of a document.

- **URL:** `/documents/:id/status`
- **Method:** `GET`
- **Authentication:** Required
- **URL Parameters:**
  - `id`: Document ID
- **Response:**

```json
{
  "document": {
    "_id": "string",
    "userId": "string",
    "name": "string",
    "filename": "string",
    "fileType": "string",
    "s3Key": "string",
    "textS3Key": "string",
    "uploadDate": "2023-05-24T12:34:56.789Z",
    "tags": ["string"],
    "status": "string", // "uploaded", "processing", "processed", "failed", "retry_pending", "deleted due to content moderation"
    "summary": "string"
  }
}
```

#### Add or Update Tags

Adds or updates tags for a document.

- **URL:** `/documents/:id/tags`
- **Method:** `POST`
- **Authentication:** Required
- **URL Parameters:**
  - `id`: Document ID
- **Request Body:**

```json
{
  "tags": ["string"]
}
```

- **Response:**

```json
{
  "message": "Tags updated.",
  "document": {
    // Document object
  }
}
```

#### Search Documents

Searches for documents by name and/or tags.

- **URL:** `/documents`
- **Method:** `GET`
- **Authentication:** Required
- **Query Parameters:**
  - `name`: Document name (optional, case-insensitive search)
  - `tags`: Comma-separated list of tags to match (optional)
- **Response:**

```json
{
  "documents": [
    {
      // Document object 1
    },
    {
      // Document object 2
    }
  ]
}
```

#### Delete Document

Deletes a document.

- **URL:** `/documents/:id`
- **Method:** `DELETE`
- **Authentication:** Required
- **URL Parameters:**
  - `id`: Document ID
- **Response:**

```json
{
  "message": "Document deleted successfully."
}
```

### Generation

#### Generate Response

Generates a response based on a prompt using the RAG system with OpenSearch and AWS Bedrock.

- **URL:** `/generate`
- **Method:** `POST`
- **Authentication:** Required
- **Request Body:**

```json
{
  "prompt": "string"
}
```

- **Response:**

```json
{
  "answer": "string"
}
```

## Document Processing Pipeline

The document processing pipeline includes the following steps:

1. **Document Upload**:
   - File is uploaded via the API
   - File is stored in AWS S3
   - Metadata is stored in MongoDB
   - Processing job is added to the queue

2. **Processing Queue**:
   - Jobs are processed asynchronously
   - Includes retry mechanism (5 attempts with exponential backoff)
   - Status is updated in MongoDB throughout processing

3. **Content Moderation**:
   - Images and videos are checked using AWS Rekognition
   - Files with inappropriate content are deleted

4. **Text Extraction**:
   - PDFs: Extracted using pdf-parse
   - Images: OCR using AWS Textract
   - Audio/Video: Transcription using AWS Transcribe
   - MS Office: Extraction using dedicated libraries
   - Plain text: Direct reading

5. **Post-Processing**:
   - Text cleaning and normalization
   - Embedding generation
   - Document summarization
   - Storage of extracted text in S3
   - Status update to "processed"

## Supported File Types

- **Text**: TXT, CSV
- **Documents**: PDF, DOC, DOCX
- **Spreadsheets**: XLS, XLSX, CSV
- **Images**: JPG/JPEG, PNG, GIF, TIFF
- **Audio**: MP3, WAV
- **Video**: MP4, MOV

## Rate Limits

- Maximum file size: 1GB
- Maximum simultaneous uploads: 10 per minute per user
- Maximum generation requests: 60 per hour per user

## Error Recovery

The system includes robust error recovery mechanisms:

- Failed jobs are automatically retried up to 5 times with exponential backoff
- Document status is updated to reflect retry state
- Final failure updates document status to "failed"
- Detailed error logging for troubleshooting

## Performance Considerations

- Document processing is handled asynchronously
- Processing time varies based on file size and type
- Extracted text is stored for fast retrieval in subsequent queries
- Generation response time typically ranges from 2-10 seconds