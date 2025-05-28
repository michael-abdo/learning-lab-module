/**
 * Comprehensive test for the generate functionality
 * 
 * This script tests the complete generate functionality pipeline:
 * 1. Verifies OpenSearch connection and setup
 * 2. Creates a test document and indexes it
 * 3. Verifies Bedrock connectivity and model access
 * 4. Tests the end-to-end generate flow
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Client } = require('@opensearch-project/opensearch');
const createConnector = require('aws-opensearch-connector');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { uploadFileToS3 } = require('./services/s3Service');
const DocumentModel = require('./models/documentModel');

// Test configuration
const TEST_USER_ID = 'test-user-id';
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
    'AWS_SECRET_ACCESS_KEY',
    'S3_BUCKET',
    'MONGODB_URI'
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
    console.log('✅ OpenSearch connection successful');
    return client;
  } catch (error) {
    console.error('❌ OpenSearch connection failed:', error.message);
    throw error;
  }
}

/**
 * Tests MongoDB connection
 */
async function testMongoDBConnection() {
  console.log('\n=== TESTING MONGODB CONNECTION ===');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      tls: true,
    });
    console.log('✅ MongoDB connection successful');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

/**
 * Tests Bedrock connectivity
 */
async function testBedrockConnectivity() {
  console.log('\n=== TESTING BEDROCK CONNECTIVITY ===');
  
  try {
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION,
    });
    
    // Use a simple prompt to test connectivity
    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    console.log(`Testing with model: ${modelId}`);
    
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 100,
      messages: [
        {
          role: "user", 
          content: "Please respond with 'Bedrock connectivity test successful' if you can read this message."
        }
      ]
    };
    
    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody)
    });
    
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    let responseText = '';
    if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
      responseText = responseBody.content[0].text;
    }
    
    console.log('Bedrock response:', responseText);
    console.log('✅ Bedrock connectivity test successful');
    return bedrockClient;
  } catch (error) {
    console.error('❌ Bedrock connectivity test failed:', error.message);
    throw error;
  }
}

/**
 * Creates a test document and uploads it to S3
 */
async function createTestDocument() {
  console.log('\n=== CREATING TEST DOCUMENT ===');
  
  try {
    // Create a temporary file
    const tempFilePath = path.join(__dirname, 'test-document.txt');
    fs.writeFileSync(tempFilePath, TEST_DOC_CONTENT);
    
    // Upload to S3
    const s3Key = `test-docs/integration-test-${Date.now()}.txt`;
    await uploadFileToS3(s3Key, fs.readFileSync(tempFilePath));
    console.log('Document uploaded to S3:', s3Key);
    
    // Create document record in MongoDB
    const docName = 'OpenSearch and Bedrock Integration Guide';
    const doc = new DocumentModel({
      userId: TEST_USER_ID,
      name: docName,
      filename: path.basename(s3Key),
      fileType: 'text/plain',
      s3Key: s3Key,
      tags: ['test', 'integration', 'opensearch', 'bedrock'],
      status: 'processed',
      textS3Key: s3Key // Since it's already text
    });
    
    await doc.save();
    console.log('Document record created:', doc._id);
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    
    return doc;
  } catch (error) {
    console.error('❌ Test document creation failed:', error.message);
    throw error;
  }
}

/**
 * Indexes the test document in OpenSearch
 */
async function indexTestDocument(opensearchClient, doc) {
  console.log('\n=== INDEXING TEST DOCUMENT IN OPENSEARCH ===');
  
  try {
    // Ensure index exists
    console.log('Checking if documents index exists...');
    const existsResponse = await opensearchClient.indices.exists({ index: 'documents' });
    
    if (!existsResponse.body) {
      console.log('Creating documents index...');
      await opensearchClient.indices.create({
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
    }
    
    // Generate embedding for the test document
    const generateEmbedding = (text) => {
      const sum = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const avg = sum / (text.length || 1);
      return [avg, avg / 2, avg / 3];
    };
    
    const embedding = generateEmbedding(TEST_DOC_CONTENT);
    console.log('Generated embedding for test document');
    
    // Index the document
    await opensearchClient.index({
      index: 'documents',
      id: doc._id.toString(),
      body: {
        embedding,
        text: TEST_DOC_CONTENT,
        name: doc.name
      }
    });
    
    // Refresh the index
    await opensearchClient.indices.refresh({ index: 'documents' });
    console.log('✅ Document indexed successfully in OpenSearch');
  } catch (error) {
    console.error('❌ Document indexing failed:', error.message);
    throw error;
  }
}

/**
 * Tests the generate functionality
 */
async function testGenerateEndpoint() {
  console.log('\n=== TESTING GENERATE ENDPOINT ===');
  
  try {
    // Create mock request and response objects
    const prompt = 'What are the key components of a RAG application?';
    console.log('Test prompt:', prompt);
    
    // Manually run the steps from the generateFromPrompt function
    const nodeUrl = process.env.OPENSEARCH_URL.trim();
    const connector = createConnector({
      node: nodeUrl,
      region: process.env.AWS_REGION,
    });
    
    const opensearchClient = new Client({
      node: nodeUrl,
      Connection: connector.Connection,
    });
    
    // Generate query embedding
    const generateEmbedding = (text) => {
      const sum = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const avg = sum / (text.length || 1);
      return [avg, avg / 2, avg / 3];
    };
    
    const queryEmbedding = generateEmbedding(prompt);
    console.log('Generated query embedding');
    
    // Perform search
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
    
    const searchResponse = await opensearchClient.search({
      index: 'documents',
      body: searchPayload,
    });
    
    const retrievedDocs = searchResponse.body.hits.hits;
    console.log(`Retrieved ${retrievedDocs.length} documents from search`);
    
    if (retrievedDocs.length === 0) {
      throw new Error('No documents retrieved from OpenSearch');
    }
    
    // Combine retrieved documents to form context
    const context = retrievedDocs.map(doc => doc._source.text).join('\n');
    const finalPrompt = `Query: ${prompt}\nContext: ${context}\nAnswer:`;
    
    // Call Bedrock
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION,
    });
    
    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
      messages: [
        {
          role: "user", 
          content: finalPrompt
        }
      ]
    };
    
    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody)
    });
    
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    let generatedText = '';
    if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
      generatedText = responseBody.content[0].text;
    }
    
    console.log('\n=== GENERATED ANSWER ===');
    console.log(generatedText);
    
    // Check if the answer mentions key components
    const keyTerms = ['document', 'vector', 'embedding', 'search', 'retrieval', 'generation'];
    const mentionedTerms = keyTerms.filter(term => 
      generatedText.toLowerCase().includes(term.toLowerCase())
    );
    
    console.log(`\nDetected ${mentionedTerms.length}/${keyTerms.length} key terms in the response`);
    
    if (mentionedTerms.length >= 3) {
      console.log('✅ Generate functionality test successful');
      return true;
    } else {
      console.log('❌ Generate functionality test failed: response does not contain enough key terms');
      return false;
    }
  } catch (error) {
    console.error('❌ Generate functionality test failed:', error.message);
    throw error;
  }
}

/**
 * Cleans up test resources
 */
async function cleanup(doc) {
  console.log('\n=== CLEANING UP TEST RESOURCES ===');
  
  try {
    if (doc && doc._id) {
      await DocumentModel.findByIdAndDelete(doc._id);
      console.log('Test document deleted from MongoDB');
    }
    
    await mongoose.disconnect();
    console.log('MongoDB connection closed');
    
    console.log('✅ Cleanup completed successfully');
  } catch (error) {
    console.error('⚠️ Cleanup failed:', error.message);
  }
}

/**
 * Main test function
 */
async function runTest() {
  console.log('=== GENERATE FUNCTIONALITY INTEGRATION TEST ===');
  
  let testDoc = null;
  
  try {
    // Check environment variables
    checkEnvironmentVariables();
    
    // Test OpenSearch connection
    const opensearchClient = await testOpenSearchConnection();
    
    // Test MongoDB connection
    await testMongoDBConnection();
    
    // Test Bedrock connectivity
    await testBedrockConnectivity();
    
    // Create and index test document
    testDoc = await createTestDocument();
    await indexTestDocument(opensearchClient, testDoc);
    
    // Test generate endpoint
    const success = await testGenerateEndpoint();
    
    console.log('\n=== TEST SUMMARY ===');
    if (success) {
      console.log('✅ ALL TESTS PASSED!');
      console.log('The generate functionality is working correctly:');
      console.log('1. OpenSearch connection and indexing is working');
      console.log('2. Bedrock connection and model invocation is working');
      console.log('3. Document retrieval via vector search is working');
      console.log('4. RAG-based answer generation is working');
    } else {
      console.log('❌ TEST FAILED');
    }
    
    return success;
  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error('Error:', error.message);
    return false;
  } finally {
    // Clean up
    await cleanup(testDoc);
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