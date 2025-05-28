/**
 * Test script to verify OpenSearch connection and functionality
 */
require('dotenv').config();
const { Client } = require('@opensearch-project/opensearch');
const createConnector = require('aws-opensearch-connector');

async function testOpenSearchConnection() {
  try {
    console.log('=== TESTING OPENSEARCH CONNECTION ===');
    
    // Verify environment variables
    if (!process.env.OPENSEARCH_URL) {
      throw new Error('OPENSEARCH_URL environment variable is not defined');
    }
    
    if (!process.env.AWS_REGION) {
      throw new Error('AWS_REGION environment variable is not defined');
    }
    
    console.log(`Using OpenSearch URL: ${process.env.OPENSEARCH_URL}`);
    console.log(`Using AWS region: ${process.env.AWS_REGION}`);
    
    // Create the OpenSearch client
    const nodeUrl = process.env.OPENSEARCH_URL.trim();
    console.log('Connecting to OpenSearch...');
    
    const connector = createConnector({
      node: nodeUrl,
      region: process.env.AWS_REGION,
    });
    
    const client = new Client({
      node: nodeUrl,
      Connection: connector.Connection,
    });
    
    // Test the connection by making a simple request
    console.log('Testing connection...');
    const response = await client.cluster.health();
    
    console.log('\n=== OpenSearch Cluster Health ===');
    console.log(JSON.stringify(response.body, null, 2));
    
    // Test index existence
    console.log('\nChecking for "documents" index...');
    const indexExists = await client.indices.exists({ index: 'documents' });
    
    if (indexExists.body) {
      console.log('Index "documents" exists!');
      
      // Get index mapping
      const mapping = await client.indices.getMapping({ index: 'documents' });
      console.log('\n=== Index Mapping ===');
      console.log(JSON.stringify(mapping.body.documents.mappings, null, 2));
    } else {
      console.log('Index "documents" does not exist. Creating test index...');
      
      // Create test index
      const createResponse = await client.indices.create({
        index: 'documents-test',
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
      
      console.log('Test index creation response:', createResponse.body);
      
      // Test document creation
      console.log('\nIndexing a test document...');
      const indexResponse = await client.index({
        index: 'documents-test',
        id: 'test-1',
        body: {
          embedding: [0.5, 0.25, 0.125],
          text: 'This is a test document for OpenSearch vector search',
          name: 'Test Document'
        }
      });
      
      console.log('Document indexed:', indexResponse.body);
      
      // Test search
      console.log('\nPerforming a test search...');
      await client.indices.refresh({ index: 'documents-test' });
      
      const searchResponse = await client.search({
        index: 'documents-test',
        body: {
          size: 1,
          query: {
            script_score: {
              query: { match_all: {} },
              script: {
                source: "cosineSimilarity(params.queryVector, doc['embedding']) + 1.0",
                params: { queryVector: [0.5, 0.25, 0.125] }
              }
            }
          }
        }
      });
      
      console.log('\n=== Search Results ===');
      console.log(JSON.stringify(searchResponse.body.hits.hits, null, 2));
      
      // Clean up test index
      console.log('\nCleaning up test index...');
      await client.indices.delete({ index: 'documents-test' });
    }
    
    console.log('\n✅ OPENSEARCH CONNECTION TEST SUCCESSFUL!');
    return true;
  } catch (error) {
    console.error('\n❌ OPENSEARCH CONNECTION TEST FAILED');
    console.error('Error details:', error);
    
    // Provide troubleshooting guidance based on error type
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.error('\nTROUBLESHOOTING TIPS:');
      console.error('- Check that your OPENSEARCH_URL environment variable is correct');
      console.error('- Verify that your OpenSearch domain is active in the AWS console');
      console.error('- Ensure your VPC/security groups allow connections from your IP');
    } else if (error.message.includes('403 Forbidden') || error.message.includes('401 Unauthorized')) {
      console.error('\nTROUBLESHOOTING TIPS:');
      console.error('- Check your AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)');
      console.error('- Verify your IAM permissions for OpenSearch');
      console.error('- Check your OpenSearch access policies');
    } else if (error.name === 'ResponseError') {
      console.error('\nTROUBLESHOOTING TIPS:');
      console.error('- Your connection to OpenSearch works, but the request failed');
      console.error('- Check the error details above for specific OpenSearch errors');
    }
    
    return false;
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testOpenSearchConnection()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testOpenSearchConnection };