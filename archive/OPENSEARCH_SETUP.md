# OpenSearch Setup Guide for Learning Lab

This guide will help you set up Amazon OpenSearch Service with your Learning Lab application to enable document search and generation functionalities.

## Overview

The Learning Lab application uses OpenSearch to:
1. Store document embeddings
2. Perform vector similarity search (for RAG)
3. Retrieve relevant documents for prompt context
4. Support the generate answers functionality

## Amazon OpenSearch Service Setup

### Step 1: Create an OpenSearch Domain

1. Go to the AWS Management Console and open the Amazon OpenSearch Service
2. Click **Create domain**
3. Choose a domain name (e.g., `learning-lab-search`)
4. Configure deployment options:
   - Deployment type: **Production** or **Development and testing** (for lower cost)
   - Version: Choose OpenSearch 2.5 or later (to support vector embeddings)
   - Instance type: Use `t3.small.search` for development or `r6g.large.search` for production
   - Number of nodes: 1 for development, 3+ for production
   - Storage: GP3 SSD, at least 100 GB

### Step 2: Network Configuration

For development:
- Select **Public access**
- Under Access policy, choose **Only use fine-grained access control**
- Create a master user

For production:
- Consider using **VPC access** for enhanced security
- Set up a VPC with proper security groups
- Configure fine-grained access control policies

### Step 3: Configure Access Policies

#### Option 1: Use AWS Managed Policy (Recommended for Development)

The simplest approach is to attach the AWS managed policy `AmazonOpenSearchServiceFullAccess` to your IAM user or role:

1. Go to IAM in the AWS Console
2. Select your user or role
3. Click "Add permissions"
4. Search for and attach the `AmazonOpenSearchServiceFullAccess` policy

This policy provides full access to all OpenSearch domains in your AWS account.

#### Option 2: Create a Custom IAM Policy (Recommended for Production)

For more granular control, create a custom IAM policy for your application to access OpenSearch:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "es:ESHttpGet",
        "es:ESHttpPost",
        "es:ESHttpPut",
        "es:ESHttpDelete",
        "es:ESHttpHead"
      ],
      "Resource": "arn:aws:es:REGION:ACCOUNT_ID:domain/DOMAIN_NAME/*"
    }
  ]
}
```

Replace `REGION`, `ACCOUNT_ID`, and `DOMAIN_NAME` with your specific values.

### Step 4: Verify Domain Creation

Wait until your domain status changes to **Active**. This may take 15-30 minutes.

### Step 5: Note Domain Endpoint

Once your domain is active, copy the domain endpoint URL (e.g., `https://search-learning-lab-abcdefghijk.us-east-1.es.amazonaws.com`). You'll use this in your app configuration.

## Application Configuration

### Step 1: Update Environment Variables

Add the OpenSearch URL to your `.env` file:

```
OPENSEARCH_URL=https://your-opensearch-domain-endpoint.region.es.amazonaws.com
```

### Step 2: Configure AWS Credentials

Ensure your AWS credentials have the proper permissions to access OpenSearch:

```
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region (e.g., us-east-1)
```

## Understanding the OpenSearch Integration in the Code

The application uses OpenSearch for vector search in the generate functionality:

1. **Index Creation**: The `ensureDocumentsIndex` function creates the `documents` index with a KNN vector field:
   ```javascript
   await client.indices.create({
     index: 'documents',
     body: {
       settings: { "index.knn": true },
       mappings: {
         properties: {
           embedding: {
             type: 'knn_vector',
             dimension: 3,
             similarity: 'cosine'
           },
           text: { type: 'text' },
           name: { type: 'text' }
         }
       }
     }
   });
   ```

2. **OpenSearch Client Initialization**: Uses AWS credentials to connect:
   ```javascript
   const connector = createConnector({
     node: nodeUrl,
     region: process.env.AWS_REGION,
   });
   const opensearchClient = new Client({
     node: nodeUrl,
     Connection: connector.Connection,
   });
   ```

3. **Document Indexing**: Converts documents to embeddings and stores them:
   ```javascript
   await opensearchClient.index({
     index: 'documents',
     id: doc._id.toString(),
     body: { embedding, text: doc.cleanedText, name: doc.name },
   });
   ```

4. **Vector Search**: Performs similarity search using a script_score query:
   ```javascript
   const searchPayload = {
     size: 5,
     query: {
       script_score: {
         query: { match_all: {} },
         script: {
           source: "cosineSimilarity(params.queryVector, doc['embedding']) + 1.0",
           params: { queryVector: queryEmbedding },
         },
       },
     },
   };
   ```

## Troubleshooting

### Common Issues:

1. **Connection Errors**:
   - Verify your OpenSearch domain is active
   - Check your AWS credentials and region
   - Ensure your security groups/access policies allow connections from your app

2. **Permission Errors** (like 403 Forbidden responses):
   - Verify IAM policies for your AWS user/role - ensure they have `AmazonOpenSearchServiceFullAccess` or the custom policy with es:ESHttp* permissions
   - Check fine-grained access control settings
   - Make sure your IAM user's credentials match what's in your .env file

3. **Index Creation Failures**:
   - Verify your OpenSearch version supports KNN
   - Check for proper mapping syntax

4. **Empty Search Results**:
   - Verify documents are properly indexed
   - Check your embedding generation logic

## Testing the OpenSearch Setup

You can test your OpenSearch setup using the provided test script:

```bash
node test-bedrock-pipeline.js
```

This script will:
1. Create a test document
2. Index it in OpenSearch
3. Perform a similarity search
4. Generate an answer using AWS Bedrock

If everything is configured correctly, you should see search results and a generated answer.

## Advanced Configuration

For production environments, consider:

1. **Scaling**: Increase node count and instance sizes
2. **Security**: Use VPC access, encryption at rest, and HTTPS
3. **Monitoring**: Set up CloudWatch alarms for cluster health
4. **Backup**: Configure automated snapshots

## Setting Up AWS Bedrock Access

To use Bedrock with your application for generating answers based on document retrieval, you'll need to:

1. Go to the AWS Console
2. Navigate to Amazon Bedrock
3. Click on "Model access" in the left sidebar
4. Request access to the models you want to use (e.g., Claude, Llama)
5. Once approved, update your `.env` file with the correct `BEDROCK_MODEL_ID`

Recommended models for RAG applications:
- `anthropic.claude-3-sonnet-20240229-v1:0` (best quality/performance balance)
- `anthropic.claude-3-haiku-20240229-v1:0` (faster, lower cost)
- `meta.llama3-70b-instruct-v1:0` (open source alternative)

Add the selected model ID to your `.env` file:
```
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
```

## Upgrading the Embedding Model

The current implementation uses a simple embedding function:

```javascript
function generateEmbedding(text) {
  const sum = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const avg = sum / (text.length || 1);
  return [avg, avg / 2, avg / 3];
}
```

For production, consider using a more sophisticated embedding model:

1. AWS Bedrock Embeddings API (`amazon.titan-embed-text-v1` or `cohere.embed-english-v3`)
2. OpenAI's embedding models
3. Sentence-transformers or other open-source models

When upgrading, remember to adjust the vector dimension in your OpenSearch index mapping. For example:
- Titan Embeddings: 1,536 dimensions
- Cohere Embeddings: 1,024 dimensions