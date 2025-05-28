# OpenSearch Serverless RAG Pipeline Setup Guide

This guide provides comprehensive instructions for setting up an Amazon OpenSearch Serverless collection for a production Retrieval-Augmented Generation (RAG) system with AWS Bedrock integration.

## Current Environment Status

- ✅ **AWS Credentials**: Available and configured in `.env`
- ✅ **Bedrock Access**: Working and responding correctly
- ❌ **OpenSearch Domain**: Current domain is not responding (needs to be replaced)

## Prerequisites

- AWS account with access to:
  - Amazon OpenSearch Serverless
  - Amazon Bedrock with model access
  - IAM permissions for both services
- Node.js environment with required packages installed

## 1. Set Up an OpenSearch Serverless Collection

### Through AWS Console (Recommended)

1. **Log in to the AWS Management Console**
   - Navigate to Amazon OpenSearch Service
   - Click on "Collections" in the Serverless section

2. **Create a New Collection**
   - Click "Create collection"
   - Set collection name: `learning-lab-collection`
   - Collection type: **Search**
   - Description: `Serverless collection for Learning Lab RAG application`
   - Standby replicas: **Disabled** (for cost optimization)
   - Click **Next**

3. **Configure Security**
   - **Encryption**: Use AWS owned key (default)
   - **Network access**:
     - Choose **Public**
     - Enable "Resource-based policy"
     - Add rule allowing public access to your collection:
     ```json
     [
       {
         "Rules": [
           {
             "ResourceType": "collection",
             "Resource": ["collection/learning-lab-collection"]
           }
         ],
         "AllowFromPublic": true
       }
     ]
     ```
   - **Data access control**:
     - Create a policy with necessary permissions:
     ```json
     [
       {
         "Rules": [
           {
             "ResourceType": "index",
             "Resource": ["index/learning-lab-collection/*"],
             "Permission": [
               "aoss:CreateIndex", "aoss:DeleteIndex", "aoss:UpdateIndex",
               "aoss:DescribeIndex", "aoss:ReadDocument", "aoss:WriteDocument"
             ]
           }
         ],
         "Principal": ["*"]
       }
     ]
     ```
   - Click **Next**

4. **Review and Create**
   - Review your settings
   - Click **Create**

5. **Note Your Collection Endpoint**
   - Wait until the collection becomes Active (10-15 minutes)
   - Copy the collection endpoint URL (looks like `https://[collection-id].aoss.amazonaws.com`)

## 2. Update the Environment Variables

Edit the `.env` file with your new OpenSearch serverless endpoint:

```
# OpenSearch Configuration
OPENSEARCH_URL=https://your-collection-endpoint.aoss.amazonaws.com

# AWS Credentials - Already configured
AWS_ACCESS_KEY_ID=your-existing-access-key
AWS_SECRET_ACCESS_KEY=your-existing-secret-key
AWS_REGION=us-east-1
```

## 3. Test the OpenSearch Connection

Run the test script to verify connectivity and basic functionality:

```bash
node test-serverless-opensearch.js
```

This script will:
- Connect to your OpenSearch serverless collection
- Create a test index with vector search capability
- Index test documents
- Perform vector similarity search
- Verify results

## 4. Test the Full RAG Pipeline

Test the entire RAG pipeline including Bedrock integration:

```bash
node test-serverless-rag-pipeline.js
```

This script will:
- Connect to both OpenSearch and Bedrock
- Create a test index with vector search
- Index a test document with embeddings
- Perform vector similarity search with a test query
- Send the retrieved context to Bedrock
- Generate an answer based on the context
- Clean up test resources

## 5. Production Considerations

### Upgrading the Embedding Model

The example code uses a simple embedding function for testing:

```javascript
function generateEmbedding(text) {
  const sum = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const avg = sum / (text.length || 1);
  return [avg, avg / 2, avg / 3];
}
```

For production, implement a proper embedding model:

1. **AWS Bedrock Embeddings**:
   - Model: `amazon.titan-embed-text-v1` or `cohere.embed-english-v3`
   - Vector dimension: 1,536 (Titan) or 1,024 (Cohere)

2. **Update the index mapping**:
   - Change the dimension value to match your chosen embedding model
   - Update the similarity metric if needed (cosine is generally good)

### Security Best Practices

1. **Access Policies**:
   - Limit access to specific IAM roles/users
   - Use more restrictive network policies
   - Consider VPC endpoints for production

2. **Monitoring**:
   - Set up CloudWatch alarms for collection health and performance
   - Monitor usage and costs

3. **Backup**:
   - Implement a backup strategy for indexed data

### Performance Optimization

1. **Index Settings**:
   - Adjust sharding based on data volume
   - Configure replica settings for high availability

2. **Query Optimization**:
   - Use efficient filtering before vector search
   - Cache frequent queries if possible

## Troubleshooting

### Common Connection Issues:

1. **Cannot connect to OpenSearch**:
   - Verify collection status is Active
   - Check network policy allows your IP
   - Confirm AWS credentials are correct
   - Verify the URL format is correct

2. **Permission errors**:
   - Check IAM permissions
   - Verify data access policy configuration
   - Ensure AWS credentials in .env are correct

3. **Index creation fails**:
   - Check for proper JSON formatting in mapping
   - Verify KNN capability is supported
   - Check permissions for index creation

4. **Empty search results**:
   - Verify documents are properly indexed
   - Check embedding generation logic
   - Confirm search query format is correct

## Further Resources

- [Amazon OpenSearch Serverless Documentation](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless.html)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Vector Search in OpenSearch](https://opensearch.org/docs/latest/search-plugins/knn/index/)
- [RAG Pattern Best Practices](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-rag.html)