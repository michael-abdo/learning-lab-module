# S3 Vector Store - Complete Guide

This document provides a comprehensive guide to the S3-based vector store and RAG pipeline implementation.

## Overview

The S3 Vector Store is a lightweight alternative to OpenSearch for implementing Retrieval-Augmented Generation (RAG). It uses Amazon S3 to store documents and their vector embeddings, enabling efficient similarity search and retrieval.

## Core Components

1. **S3 Vector Store** (`src/core/s3-vector-store.js`)
   - Implements vector storage using S3
   - Handles document indexing with embeddings
   - Performs vector similarity search using cosine similarity

2. **RAG Pipeline** (`src/core/rag-pipeline.js`)
   - Orchestrates the entire RAG process
   - Manages document indexing and retrieval
   - Generates answers using AWS Bedrock

## Setup Instructions

### Prerequisites

- AWS account with access to:
  - S3 bucket
  - AWS Bedrock
- Node.js environment
- npm package manager

### Environment Variables

Create a `.env` file with:

```
# AWS Configuration
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name

# Bedrock Model
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
```

### Installation

```bash
# Install AWS SDK packages
npm install @aws-sdk/client-s3 @aws-sdk/client-bedrock-runtime

# Install other dependencies
npm install dotenv express
```

## Testing

For comprehensive testing instructions, see [RAG Testing Guide](./RAG_TESTING_GUIDE.md).

### Basic Testing

Run all RAG tests with one command:

```bash
npm run test:rag
```

### Advanced Testing

For more specific tests:

```bash
# Test S3 Vector Store functionality
node tests/integration/test-s3-vector-store.js

# Test full RAG pipeline with real documents
node tests/integration/test-rag-pipeline-real-data.js

# Test AWS Bedrock connectivity
node tests/bedrock/test-bedrock-connectivity.js
```

## API Usage

The S3 Vector Store and RAG Pipeline can be used directly in your code:

```javascript
const { S3VectorStore, RAGPipeline } = require('../../src');

// Initialize vector store
const vectorStore = new S3VectorStore({
  bucketName: 'your-bucket-name',
  prefix: 'vector-store/'
});

// Index a document
await vectorStore.indexDocument('doc-1', {
  text: 'Document content here...',
  name: 'Document Title',
  metadata: { source: 'manual' }
});

// Search for similar documents
const results = await vectorStore.search('query text', 5);

// Use the full RAG pipeline
const pipeline = new RAGPipeline();
const answer = await pipeline.process('What does this document say about X?');
console.log(answer.answer);
```

## Implementation Details

### Vector Embedding

The system supports two embedding approaches:

1. **Simple Embedding** (testing): Generates a basic embedding using text characteristics
2. **Bedrock Embedding** (production): Uses AWS Bedrock Titan model for high-quality embeddings

### Document Storage

Documents are stored in S3 as JSON files with:
- Original text content
- Document metadata (name, source, etc.)
- Vector embedding for similarity search
- Timestamp

### Vector Search

Search uses cosine similarity between query and document vectors to find the most relevant documents.

## Production Considerations

1. **Embedding Quality**: For production, enable Bedrock embeddings:
   ```javascript
   const pipeline = new RAGPipeline({ useBedrock: true });
   ```

2. **S3 Lifecycle Management**: Implement S3 lifecycle rules to manage storage costs

3. **Error Handling**: Implement robust error handling for network failures and API rate limits

4. **Monitoring**: Add CloudWatch metrics and alarms for production monitoring

5. **Caching**: Consider adding response caching for common queries

## Troubleshooting

Common issues:

1. **AWS Credentials**: Ensure credentials have appropriate permissions for S3 and Bedrock
2. **S3 Bucket**: Verify bucket existence and accessibility
3. **Vector Dimensions**: Make sure query and document vectors have matching dimensions
4. **Request Size**: Large documents may hit AWS request size limits

## Maintenance

To clean up the vector store:

```javascript
// Delete individual document
await vectorStore.deleteDocument('doc-id');

// Delete all documents
await vectorStore.deleteAllDocuments();
```