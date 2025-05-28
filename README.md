<div align="center">
  <img src="logos/runtheons.png" alt="RunTheOns Logo" width="400" />
  
  # Learning Lab Module
  
  <p align="center">
    <strong>Developed by <a href="https://www.runtheons.com/">RunTheOns</a></strong>
  </p>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2014.0.0-brightgreen)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green)](https://www.mongodb.com/atlas)
[![AWS](https://img.shields.io/badge/AWS-S3%20%7C%20Textract%20%7C%20Transcribe-orange)](https://aws.amazon.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/runtheons/learning-lab-module/pulls)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/runtheons/learning-lab-module/graphs/commit-activity)

</div>

## Overview

The Learning Lab Module is a RESTful API service that allows users to upload a variety of document types (up to 1GB), process them (text extraction, conversion, indexing, summarization, and moderation), and generate answers using MongoDB Vector Search and LLM integration. It stores document metadata, text, and vector embeddings in MongoDB Atlas and original files in AWS S3.

## Pipeline Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Document Upload│     │ Text Extraction │     │ Vector Embedding│
│                 │     │                 │     │                 │
│ ┌─────────────┐ │     │ ┌─────────────┐ │     │ ┌─────────────┐ │
│ │ Client      │ │     │ │ AWS Textract│ │     │ │ LLM Service │ │
│ │ HTTP Request│─┼────►│ │ Transcribe  │─┼────►│ │ Embedding   │ │
│ │ Multipart   │ │     │ │ PDF/Office  │ │     │ │ Generation  │ │
│ └─────────────┘ │     │ └─────────────┘ │     │ └─────────────┘ │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Answer         │     │  Vector Search  │     │ MongoDB Atlas   │
│  Generation     │     │                 │     │                 │
│ ┌─────────────┐ │     │ ┌─────────────┐ │     │ ┌─────────────┐ │
│ │ LLM         │ │     │ │ MongoDB     │ │     │ │ Documents   │ │
│ │ Context     │◄┼──── │ │ vectorSearch│◄┼──── │ │ Embeddings  │ │
│ │ Integration │ │     │ │ Aggregation │ │     │ │ Vector Index│ │
│ └─────────────┘ │     │ └─────────────┘ │     │ └─────────────┘ │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Documentation

### Guides
- [Project Structure](./docs/PROJECT_STRUCTURE.md) - Overview of the codebase organization
- [S3 Vector Store Guide](./docs/guides/S3_VECTOR_STORE_GUIDE.md) - Guide to the S3-based vector store (legacy)
- [RAG Testing Guide](./docs/guides/RAG_TESTING_GUIDE.md) - How to test the RAG pipeline with real documents
- [AWS Deployment Guide](./docs/deployment/AWS_DEPLOYMENT_GUIDE.md) - Guide for deploying to AWS

### Reference
- [API Documentation](./docs/api/API_DOCUMENTATION.md) - Comprehensive API documentation
- [Code Refactoring](./docs/REFACTORING.md) - Details about the code reorganization

## Features

- **Document Upload & Storage**: Securely upload files and store them in AWS S3.
- **Processing Pipeline**: Extract text using AWS Textract (images), AWS Transcribe (audio/video), PDF parsing (pdf-parse), Excel (xlsx), Word (mammoth), and CSV processing.
- **Metadata & Tagging**: Store and manage document metadata and tags in MongoDB.
- **Asynchronous Processing**: Utilize Bull and Redis for handling asynchronous processing with advanced error recovery.
- **Content Moderation**: Uses AWS Rekognition to detect inappropriate content in images and videos before storing them.
- **API Endpoints**: Endpoints for uploading, checking status, tagging, searching, and deleting documents.
- **MongoDB Vector Search**: Uses MongoDB Atlas vector search capabilities for semantic similarity matching.
- **LLM Integration**: Generate answers to queries using LLM models with document context.
- **Error Recovery**: Advanced retry mechanism for failed processing jobs with exponential backoff.
- **Performance Tests**: Comprehensive performance testing suite to ensure system scalability.

## MongoDB Vector Search Integration

The system leverages MongoDB Atlas Vector Search for efficient similarity searches:

### How It Works

1. **Document Processing**
   - Documents are uploaded to S3 (original files)
   - Text is extracted and stored in MongoDB
   - Embeddings are generated using the LLM service
   - Both text and embeddings are stored in the MongoDB document

2. **Vector Indexing**
   - MongoDB Atlas creates and maintains the vector index
   - The index is configured for efficient similarity searches
   - Document embeddings are indexed automatically

3. **Similarity Search**
   - User queries are converted to embeddings
   - MongoDB's `$vectorSearch` aggregation finds similar documents
   - Results are ranked by similarity score

4. **Answer Generation**
   - Most relevant documents form the context for the LLM
   - The LLM generates a response using this context
   - References to source documents are included in the response

### Vector Search Query Example

```javascript
const searchResults = await documentsCollection.aggregate([
  {
    $vectorSearch: {
      index: 'vector_index',
      queryVector: queryEmbedding,
      path: "embedding",
      numCandidates: 100,
      limit: 5
    }
  },
  {
    $match: {
      "userId": userId,
      "status": "processed"
    }
  },
  {
    $project: {
      "_id": 1,
      "textS3Key": 1,
      "name": 1,
      "cleanedText": 1,
      "score": { $meta: "vectorSearchScore" }
    }
  }
]).toArray();
```

## How It Works

### File Upload & S3 Key
The document is uploaded to S3 under the `docs/` folder (e.g., `docs/sample.pdf`).

### Text Extraction & Moderation
- AWS Textract extracts text from images.
- AWS Transcribe processes audio/video files into text.
- Rekognition moderates image and video content for inappropriate materials before allowing storage.

### MongoDB Processing
- Extracted text is cleaned and stored in MongoDB
- LLM service generates embeddings for the text
- Embeddings and cleaned text are stored in the document record
- MongoDB Atlas vector index makes the embeddings searchable

### Answer Generation
- User query is converted to embedding vector
- Vector search finds relevant documents
- Document text is combined to form context
- LLM generates answer using context and user query

## Setup

### MongoDB Atlas Setup

Before running the application, you must set up MongoDB Atlas with vector search capability:

1. **Create an Atlas Cluster**
   - Sign up for MongoDB Atlas (https://www.mongodb.com/cloud/atlas)
   - Create a new cluster (M10 or higher for vector search)
   - Enable vector search capability in cluster settings

2. **Create a Vector Index**
   - Go to "Atlas Search" in your cluster
   - Create a new index on your lessons collection
   - Index name: `vector_index`
   - Configuration:
   ```json
   {
     "fields": [
       {
         "path": "embedding",
         "type": "vector",
         "dimensions": 1536,
         "similarity": "cosine"
       }
     ]
   }
   ```

3. **Set Connection String**
   - Get your MongoDB Atlas connection string
   - Update your `.env` file with the connection string
   
### AWS Configuration

Configure your AWS credentials and set up an IAM user with the necessary policies.

```sh
# Configure AWS CLI (replace placeholders with your actual credentials)
aws configure set aws_access_key_id YOUR_ACCESS_KEY_ID
aws configure set aws_secret_access_key YOUR_SECRET_ACCESS_KEY
aws configure set default.region YOUR_DEFAULT_REGION
```

### Required AWS Services

This application requires several AWS services to be properly configured:

1. **AWS S3** - For document storage
2. **AWS Textract** - For OCR and document text extraction
3. **AWS Transcribe** - For audio/video transcription
4. **AWS Rekognition** - For content moderation

```sh
# Verify AWS credentials
aws sts get-caller-identity

# Create a new IAM user (replace testUser with your desired username)
aws iam create-user --user-name testUser

# Attach AWS managed policies to the new user
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AdministratorAccess-AWSElasticBeanstalk
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AmazonEC2FullAccess
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AmazonRekognitionFullAccess
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AmazonTextractFullAccess
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AmazonTranscribeFullAccess
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier
```

### Prerequisites

- **Node.js** (v14+)
- **MongoDB Atlas** (M10 or higher cluster with vector search)
- **Redis**
- **AWS S3 Account** and corresponding credentials

### Installation

1. **Clone the Repository:**
   ```sh
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Install Dependencies:**
   ```sh
   npm install
   ```

3. **Create a .env File:**
   ```env
   PORT=3000
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/learninglab
   AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
   AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
   AWS_REGION=us-east-1
   S3_BUCKET=YOUR_S3_BUCKET_NAME
   REDIS_HOST=127.0.0.1
   REDIS_PORT=6379
   ACCESS_TOKEN_SECRET=test-secret
   LLM_API_KEY=your-api-key-for-embedding-generation
   ```

4. **Start Redis:**
   ```sh
   redis-server
   ```

5. **Run the Application:**
   ```sh
   # Production mode
   npm start
   
   # Development mode with auto-reload
   npm run dev
   ```

## Testing

### Unit and Integration Tests

Run the Jest test suite:
```sh
npm test
```

### Manual Testing with cURL

#### Upload Document:
```sh
curl -X POST http://localhost:3000/documents/upload \
   -F "file=@/path/to/your/file.pdf" \
   -F "name=My Document" \
   -F "tags=tag1,tag2" \
   -H "Authorization: Bearer <your-jwt-token>"
```

#### Generate Answer:
```sh
curl -X POST http://localhost:3000/generate \
   -H "Content-Type: application/json" \
   -H "Authorization: Bearer <your-jwt-token>" \
   -d '{"prompt": "What information is in my documents about space exploration?"}'
```

#### Authentication:
```sh
curl -X POST http://localhost:3000/auth/login \
   -H "Content-Type: application/json" \
   -d '{"username": "admin", "password": "admin123"}'
```

For more API details and examples, see the [API Documentation](./docs/api/API_DOCUMENTATION.md).