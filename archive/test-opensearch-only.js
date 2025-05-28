/**
 * OpenSearch-only test script
 * 
 * This script tests only the OpenSearch integration:
 * 1. Verifies OpenSearch connection and setup
 * 2. Creates and indexes a test document
 * 3. Performs vector search
 */

require('dotenv').config();
const { Client } = require('@opensearch-project/opensearch');
const createConnector = require('aws-opensearch-connector');

// Test document content
const TEST_DOC_CONTENT = `
OpenSearch and Bedrock Integration Guide

OpenSearch is a powerful open-source search and analytics engine that supports 
vector search capabilities. When combined with AWS Bedrock's language models,
it provides a robust foundation for retrieval-augmented generation (RAG) applications.

Key components:
- Document storage and indexing
- Vector embeddings for semantic search
- Similarity matching using cosine distance
- Context retrieval for LLM prompting
- Answer generation using Bedrock models

This test document is designed to verify that the complete pipeline works correctly.
`;

/**
 * Helper function to verify environment variables
 */
function checkEnvironmentVariables() {
  const requiredVars = [
    'OPENSEARCH_URL',
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  console.log('✅ All required environment variables are present');
}

/**
 * Tests OpenSearch connection
 */
async function testOpenSearchConnection() {
  console.log('\n=== TESTING OPENSEARCH CONNECTION ===');
  
  const nodeUrl = process.env.OPENSEARCH_URL.trim();
  console.log(`Connecting to OpenSearch: ${nodeUrl}`);
  
  try {
    const connector = createConnector({
      node: nodeUrl,
      region: process.env.AWS_REGION,
    });
    
    const client = new Client({
      node: nodeUrl,
      Connection: connector.Connection,
    });
    
    const response = await client.cluster.health();
    console.log('OpenSearch cluster health:', response.body.status);
    
    // Show cluster stats
    const statsResponse = await client.cluster.stats();
    console.log('\nCluster Name:', statsResponse.body.cluster_name);
    console.log('Number of nodes:', statsResponse.body.nodes.count.total);
    console.log('Number of indices:', statsResponse.body.indices.count);
    
    console.log('✅ OpenSearch connection successful');
    return client;
  } catch (error) {
    console.error('❌ OpenSearch connection failed:', error.message);
    throw error;
  }
}

/**
 * Tests OpenSearch index operations
 */
async function testOpenSearchIndexing(client) {
  console.log('\n=== TESTING OPENSEARCH INDEXING ===');
  
  try {
    // List existing indices
    const indicesResponse = await client.cat.indices({ format: 'json' });
    console.log('Existing indices:');
    indicesResponse.body.forEach(index => {
      console.log(`- ${index.index} (docs: ${index.docs?.count || 'N/A'})`);
    });
    
    // Create a test index
    const indexName = 'test-opensearch-' + Date.now();
    console.log(`\nCreating test index: ${indexName}`);
    
    await client.indices.create({
      index: indexName,
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
    
    // Verify the index was created
    const existsResponse = await client.indices.exists({ index: indexName });
    if (!existsResponse.body) {
      throw new Error(`Failed to create index: ${indexName}`);
    }
    
    console.log('✅ Index created successfully');
    
    // Generate a simple embedding for test document
    const generateEmbedding = (text) => {
      const sum = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const avg = sum / (text.length || 1);
      return [avg, avg / 2, avg / 3];
    };
    
    const embedding = generateEmbedding(TEST_DOC_CONTENT);
    console.log('Generated test embedding:', embedding);
    
    // Index a test document
    console.log('\nIndexing test document...');
    const indexResponse = await client.index({
      index: indexName,
      id: 'test-doc-1',
      body: {
        embedding,
        text: TEST_DOC_CONTENT,
        name: 'OpenSearch Test Document'
      }
    });
    
    console.log('Document indexing response:', indexResponse.body.result);
    
    // Refresh the index
    await client.indices.refresh({ index: indexName });
    
    // Check document count
    const countResponse = await client.count({ index: indexName });
    console.log('Document count:', countResponse.body.count);
    
    if (countResponse.body.count !== 1) {
      throw new Error('Document count is not as expected');
    }
    
    console.log('✅ Document indexed successfully');
    
    return indexName;
  } catch (error) {
    console.error('❌ OpenSearch indexing test failed:', error.message);
    throw error;
  }
}

/**
 * Tests OpenSearch search functionality
 */
async function testOpenSearchSearch(client, indexName) {
  console.log('\n=== TESTING OPENSEARCH SEARCH ===');
  
  try {
    // Simple term query
    console.log('Performing text search...');
    const textSearchResponse = await client.search({
      index: indexName,
      body: {
        query: {
          match: {
            text: 'OpenSearch vector search'
          }
        }
      }
    });
    
    console.log('Text search hits:', textSearchResponse.body.hits.total.value);
    
    if (textSearchResponse.body.hits.total.value === 0) {
      throw new Error('Text search returned no results');
    }
    
    // Vector similarity search
    console.log('\nPerforming vector similarity search...');
    
    // Generate query embedding
    const generateEmbedding = (text) => {
      const sum = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const avg = sum / (text.length || 1);
      return [avg, avg / 2, avg / 3];
    };
    
    const queryText = 'What are the key components of search?';
    const queryEmbedding = generateEmbedding(queryText);
    console.log('Query text:', queryText);
    console.log('Query embedding:', queryEmbedding);
    
    const vectorSearchResponse = await client.search({
      index: indexName,
      body: {
        size: 5,
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
    
    console.log('Vector search hits:', vectorSearchResponse.body.hits.total.value);
    
    if (vectorSearchResponse.body.hits.total.value === 0) {
      throw new Error('Vector search returned no results');
    }
    
    // Display the results
    console.log('\nSearch results:');
    vectorSearchResponse.body.hits.hits.forEach((hit, i) => {
      console.log(`${i+1}. Score: ${hit._score.toFixed(4)}, Name: ${hit._source.name}`);
      console.log(`   Text: ${hit._source.text.substring(0, 100)}...`);
    });
    
    console.log('✅ OpenSearch search tests successful');
    return true;
  } catch (error) {
    console.error('❌ OpenSearch search test failed:', error.message);
    throw error;
  }
}

/**
 * Cleans up test resources
 */
async function cleanupResources(client, indexName) {
  console.log('\n=== CLEANING UP TEST RESOURCES ===');
  
  try {
    // Delete the test index
    console.log(`Deleting test index: ${indexName}`);
    await client.indices.delete({ index: indexName });
    
    // Verify the index was deleted
    const existsResponse = await client.indices.exists({ index: indexName });
    if (existsResponse.body) {
      console.error(`⚠️ Warning: Failed to delete index: ${indexName}`);
    } else {
      console.log('✅ Test index deleted successfully');
    }
  } catch (error) {
    console.error('⚠️ Cleanup failed:', error.message);
  }
}

/**
 * Main test function
 */
async function runTest() {
  console.log('=== OPENSEARCH FUNCTIONALITY TEST ===');
  
  let indexName = null;
  
  try {
    // Check environment variables
    checkEnvironmentVariables();
    
    // Test OpenSearch connection
    const client = await testOpenSearchConnection();
    
    // Test OpenSearch indexing
    indexName = await testOpenSearchIndexing(client);
    
    // Test OpenSearch search
    await testOpenSearchSearch(client, indexName);
    
    // Clean up
    await cleanupResources(client, indexName);
    
    console.log('\n=== TEST SUMMARY ===');
    console.log('✅ ALL OPENSEARCH TESTS PASSED!');
    console.log('The OpenSearch integration is working correctly:');
    console.log('1. Connection: Successfully connected to OpenSearch cluster');
    console.log('2. Indexing: Created index with KNN vector mapping and indexed documents');
    console.log('3. Search: Performed text and vector similarity searches successfully');
    
    return true;
  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error('Error:', error.message);
    
    // Try to clean up if there was an error
    if (indexName) {
      try {
        const connector = createConnector({
          node: process.env.OPENSEARCH_URL.trim(),
          region: process.env.AWS_REGION,
        });
        
        const client = new Client({
          node: process.env.OPENSEARCH_URL.trim(),
          Connection: connector.Connection,
        });
        
        await cleanupResources(client, indexName);
      } catch (cleanupError) {
        console.error('Failed to clean up resources after test failure:', cleanupError.message);
      }
    }
    
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  runTest()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runTest };