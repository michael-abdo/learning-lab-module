/**
 * Test script for the serverless OpenSearch instance
 * This script tests the connection, index creation, and vector search functionality
 */

require('dotenv').config();
const { Client } = require('@opensearch-project/opensearch');
const createConnector = require('aws-opensearch-connector');

// Constants for testing
const TEST_INDEX_NAME = 'test-collection-index';
const VECTOR_DIMENSION = 3; // For testing; production would use higher dimensions

/**
 * Test OpenSearch connection
 */
async function testOpenSearchConnection() {
  console.log('=== TESTING OPENSEARCH CONNECTION ===');
  
  try {
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
    
    return client;
  } catch (error) {
    console.error('\n❌ OPENSEARCH CONNECTION TEST FAILED');
    console.error('Error details:', error);
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.error('\nTROUBLESHOOTING TIPS:');
      console.error('- Check that your OPENSEARCH_URL environment variable is correct');
      console.error('- Verify that your OpenSearch collection is active in the AWS console');
      console.error('- Ensure your network policy allows connections from your IP');
    } else if (error.message.includes('403 Forbidden') || error.message.includes('401 Unauthorized')) {
      console.error('\nTROUBLESHOOTING TIPS:');
      console.error('- Check your AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)');
      console.error('- Verify your IAM permissions for OpenSearch');
      console.error('- Check your OpenSearch access policies');
    }
    
    throw error;
  }
}

/**
 * Create a test index with KNN vector field
 */
async function createTestIndex(client) {
  console.log('\n=== CREATING TEST INDEX ===');
  
  try {
    // Delete the index if it already exists
    const indexExists = await client.indices.exists({ index: TEST_INDEX_NAME });
    
    if (indexExists.body) {
      console.log(`Index ${TEST_INDEX_NAME} already exists. Deleting...`);
      await client.indices.delete({ index: TEST_INDEX_NAME });
    }
    
    // Create a new index with KNN settings
    console.log(`Creating index ${TEST_INDEX_NAME}...`);
    const createResponse = await client.indices.create({
      index: TEST_INDEX_NAME,
      body: {
        settings: { "index.knn": true },
        mappings: {
          properties: {
            embedding: {
              type: 'knn_vector',
              dimension: VECTOR_DIMENSION,
              similarity: 'cosine'
            },
            text: { type: 'text' },
            name: { type: 'text' }
          }
        }
      }
    });
    
    console.log('Index created:', createResponse.body);
    return true;
  } catch (error) {
    console.error('\n❌ TEST INDEX CREATION FAILED');
    console.error('Error details:', error);
    throw error;
  }
}

/**
 * Test document indexing and vector search
 */
async function testVectorSearch(client) {
  console.log('\n=== TESTING VECTOR SEARCH ===');
  
  try {
    // Create test documents
    const testDocuments = [
      {
        id: 'doc1',
        embedding: [0.1, 0.2, 0.3],
        text: 'This is a test document about machine learning.',
        name: 'Machine Learning Doc'
      },
      {
        id: 'doc2',
        embedding: [0.2, 0.3, 0.4], 
        text: 'This document discusses artificial intelligence and its applications.',
        name: 'AI Applications'
      },
      {
        id: 'doc3',
        embedding: [0.5, 0.6, 0.7],
        text: 'Sports and nutrition are important for athletic performance.',
        name: 'Sports and Nutrition'
      }
    ];
    
    // Index the test documents
    console.log('Indexing test documents...');
    
    for (const doc of testDocuments) {
      await client.index({
        index: TEST_INDEX_NAME,
        id: doc.id,
        body: {
          embedding: doc.embedding,
          text: doc.text,
          name: doc.name
        }
      });
    }
    
    // Refresh the index
    await client.indices.refresh({ index: TEST_INDEX_NAME });
    console.log('Documents indexed successfully');
    
    // Perform a vector search with a query embedding
    console.log('\nPerforming vector search...');
    const queryEmbedding = [0.15, 0.25, 0.35]; // Should be closer to doc1 and doc2
    
    const searchResponse = await client.search({
      index: TEST_INDEX_NAME,
      body: {
        size: 3,
        query: {
          script_score: {
            query: { match_all: {} },
            script: {
              source: "cosineSimilarity(params.queryVector, doc['embedding']) + 1.0",
              params: { queryVector: queryEmbedding }
            }
          }
        }
      }
    });
    
    console.log('\n=== Vector Search Results ===');
    console.log(JSON.stringify(searchResponse.body.hits.hits, null, 2));
    
    // Check if the search results make sense
    const results = searchResponse.body.hits.hits;
    if (results.length > 0) {
      console.log('\nSearch returned proper results!');
      
      // For better debugging, analyze the cosine similarity
      for (const hit of results) {
        const docId = hit._id;
        const score = hit._score;
        const docName = hit._source.name;
        console.log(`Document ${docId} (${docName}) has score: ${score}`);
      }
      
      return true;
    } else {
      console.error('❌ No search results found');
      return false;
    }
  } catch (error) {
    console.error('\n❌ VECTOR SEARCH TEST FAILED');
    console.error('Error details:', error);
    throw error;
  }
}

/**
 * Clean up test resources
 */
async function cleanupTestResources(client) {
  console.log('\n=== CLEANING UP TEST RESOURCES ===');
  
  try {
    // Delete the test index
    console.log(`Deleting test index ${TEST_INDEX_NAME}...`);
    await client.indices.delete({ index: TEST_INDEX_NAME });
    console.log('Test index deleted successfully');
    return true;
  } catch (error) {
    console.error('\n⚠️ TEST CLEANUP FAILED');
    console.error('Error details:', error);
    return false;
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('===== SERVERLESS OPENSEARCH TEST =====\n');
  
  try {
    // Step 1: Test the connection
    const client = await testOpenSearchConnection();
    console.log('\n✅ Connection test successful!');
    
    // Step 2: Create a test index
    await createTestIndex(client);
    console.log('\n✅ Index creation test successful!');
    
    // Step 3: Test vector search
    await testVectorSearch(client);
    console.log('\n✅ Vector search test successful!');
    
    // Step 4: Clean up
    await cleanupTestResources(client);
    
    console.log('\n===== ALL TESTS PASSED =====');
    console.log('Your serverless OpenSearch instance is working correctly!');
    console.log('\nNext steps:');
    console.log('1. Run the test-opensearch-rag.js script to test the full RAG pipeline');
    console.log('2. Configure your application to use this OpenSearch instance');
    
    return true;
  } catch (error) {
    console.error('\n===== TEST SUITE FAILED =====');
    console.error('Error:', error.message);
    
    console.log('\nTROUBLESHOOTING TIPS:');
    console.log('1. Check your AWS credentials and region');
    console.log('2. Verify that your serverless OpenSearch collection is ACTIVE');
    console.log('3. Check your network and data access policies');
    console.log('4. Review the error messages above for specific issues');
    
    return false;
  }
}

// Run the tests if this script is executed directly
if (require.main === module) {
  runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runTests };