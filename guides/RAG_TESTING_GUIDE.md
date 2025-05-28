# Simple RAG Testing Guide

This guide provides instructions for testing the S3-based RAG (Retrieval Augmented Generation) pipeline with real documents.

## Prerequisites

1. **AWS Credentials**: Ensure you have AWS credentials configured with access to:
   - S3
   - Bedrock

2. **Environment Variables**: Set the following in your `.env` file:
   ```
   S3_BUCKET=your-bucket-name
   AWS_REGION=us-east-1
   BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
   ```

## Running the Tests

You can run all RAG tests with:

```bash
npm run test:rag
```

Or run the individual test scripts:

```bash
node tests/integration/simple-rag-test.js
```

This will:
1. Load sample documents from `sample_documents/docs/*.txt`
2. Index them to your S3 bucket
3. Run test queries against the indexed documents
4. Generate answers using Bedrock LLM
5. Clean up after itself (removing documents from S3)

## Customizing the Test

You can customize the test by editing `tests/integration/simple-rag-test.js`:

1. **Keep Documents in S3**: To keep documents in S3 after the test (for inspection), set:
   ```javascript
   keepDocuments: true
   ```

2. **Custom Queries**: Add your own test queries:
   ```javascript
   queries: [
     "What are some strategies for athlete goal setting?",
     "Your custom query here",
   ]
   ```

3. **Custom Documents**: Add your own test documents:
   ```javascript
   customDocuments: [
     {
       id: 'custom-doc-1',
       name: 'Custom Document',
       text: 'Your custom document text here'
     }
   ]
   ```

## Additional Testing Options

For more advanced testing options:

1. **Test Just the S3 Vector Store**:
   ```bash
   node tests/integration/test-s3-vector-store.js
   ```

2. **Test the Full RAG Pipeline with Real Documents**:
   ```bash
   node tests/integration/test-rag-pipeline-real-data.js
   ```

3. **Test AWS Bedrock Connectivity**:
   ```bash
   node tests/bedrock/test-bedrock-connectivity.js
   ```

4. **Run All Tests**:
   ```bash
   npm test
   ```

## Viewing Documents in S3

After running tests with the `keepDocuments: true` option, you can view the documents in S3:

1. Go to the AWS S3 Console
2. Navigate to your bucket (e.g., `learning-lab-demo--bucket`)
3. Look in the `vector-store/` folder
4. Click on any `.json` file to view its properties
5. Click "Download" to view the file contents, which includes:
   - The document text
   - Metadata
   - Vector embeddings used for similarity search

## Troubleshooting

If you encounter any issues:

1. **Check S3 Permissions**: Ensure your AWS credentials have full access to the S3 bucket
2. **Check Bedrock Access**: Ensure you have access to the Bedrock model specified
3. **Region Configuration**: Make sure all services are in the same AWS region
4. **IAM Roles**: If using IAM roles, ensure they have the necessary permissions
5. **Environment Variables**: Verify all required environment variables are set