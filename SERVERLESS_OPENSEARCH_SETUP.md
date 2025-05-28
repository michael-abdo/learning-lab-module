# Serverless OpenSearch Setup Guide

This guide will help you set up Amazon OpenSearch Serverless for your Learning Lab application to enable document search and generation functionalities.

## Current Environment Status

✅ **Bedrock Connectivity**: The Bedrock API is accessible and the Claude model is working.
❌ **OpenSearch Domain**: There is no existing OpenSearch domain working in the environment.

## Manual Setup through AWS Console

Since the IAM user doesn't have sufficient permissions to create resources programmatically, we'll set up the OpenSearch Serverless collection through the AWS Management Console.

### Step 1: Create an OpenSearch Serverless Collection

1. Go to the AWS Management Console and open the Amazon OpenSearch Service
2. In the left navigation pane, click on **Collections** under the **Serverless** section
3. Click **Create collection**
4. Configure collection details:
   - Collection name: `learning-lab-collection`
   - Collection type: **VectorSearch**
   - Description: `Serverless collection for Learning Lab RAG application`
   - Standby replicas: **Disabled** (to minimize costs)
5. Click **Next**

### Step 2: Configure Security Settings

1. For Encryption Settings, select **Use AWS owned key** (default)
2. For Network access settings:
   - Choose **Public**
   - Enable **Resource-based policy**
   - Add a rule that allows all access:
   ```json
   [
     {
       "Rules": [
         {
           "ResourceType": "collection",
           "Resource": ["collection/learning-lab-collection"]
         },
         {
           "ResourceType": "index",
           "Resource": ["index/learning-lab-collection/*"]
         }
       ],
       "AllowFromPublic": true
     }
   ]
   ```
3. Under Data access control, create a data access policy:
   - Policy name: `learning-lab-access-policy`
   - Grant the necessary permissions to your account:
   ```json
   [
     {
       "Rules": [
         {
           "ResourceType": "index",
           "Resource": ["index/learning-lab-collection/*"],
           "Permission": [
             "aoss:CreateIndex",
             "aoss:DeleteIndex",
             "aoss:UpdateIndex",
             "aoss:DescribeIndex",
             "aoss:ReadDocument",
             "aoss:WriteDocument"
           ]
         },
         {
           "ResourceType": "collection",
           "Resource": ["collection/learning-lab-collection"],
           "Permission": [
             "aoss:CreateCollectionItems",
             "aoss:DeleteCollectionItems",
             "aoss:UpdateCollectionItems",
             "aoss:DescribeCollectionItems"
           ]
         }
       ],
       "Principal": ["arn:aws:iam::<YOUR_ACCOUNT_ID>:user/<YOUR_USERNAME>"]
     }
   ]
   ```

4. Click **Next**
5. Review the collection details and click **Create**

### Step 3: Note Collection Endpoint

1. Wait until the collection status changes to **Active** (may take 5-15 minutes)
2. Copy the collection endpoint URL (e.g., `https://collection-id.us-east-1.aoss.amazonaws.com`)
3. You'll use this in your app configuration

## Application Configuration

### Step 1: Update Environment Variables

Add the OpenSearch Serverless URL to your `.env` file:

```
OPENSEARCH_URL=https://your-opensearch-serverless-endpoint.region.aoss.amazonaws.com
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region (e.g., us-east-1)
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
```

## Testing the Serverless OpenSearch Setup

Run the provided test scripts to validate your setup:

```bash
# Test basic OpenSearch connectivity and vector search
node test-serverless-opensearch.js

# Test the full RAG pipeline with Bedrock
node test-serverless-rag-pipeline.js
```

## Troubleshooting

### Common Issues:

1. **Connection Errors**:
   - Verify your OpenSearch collection is active
   - Check your AWS credentials and region
   - Ensure your network policy allows connections from your IP

2. **Permission Errors** (like 403 Forbidden responses):
   - Verify IAM policies for your AWS user
   - Check data access policy settings
   - Make sure your IAM user's credentials match what's in your .env file

3. **Index Creation Failures**:
   - Verify your OpenSearch version supports KNN
   - Check for proper mapping syntax

4. **Empty Search Results**:
   - Verify documents are properly indexed
   - Check your embedding generation logic

## Production Considerations

For production environments, consider:

1. **Security**: Use more restrictive access policies
2. **Monitoring**: Set up CloudWatch alarms for collection health
3. **Backups**: Configure automated snapshots
4. **Cost management**: Set up billing alerts to monitor usage

## Upgrading the Embedding Model

The current implementation uses a simple embedding function for testing:

```javascript
function generateEmbedding(text) {
  const sum = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const avg = sum / (text.length || 1);
  return [avg, avg / 2, avg / 3];
}
```

For production, use a more sophisticated embedding model:

1. AWS Bedrock Embeddings API (`amazon.titan-embed-text-v1` or `cohere.embed-english-v3`)
2. OpenAI's embedding models
3. Sentence-transformers or other open-source models

When upgrading, adjust the vector dimension in your OpenSearch index mapping:
- Titan Embeddings: 1,536 dimensions
- Cohere Embeddings: 1,024 dimensions