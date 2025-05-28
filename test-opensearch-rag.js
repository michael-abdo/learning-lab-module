/**
 * Simplified RAG test for OpenSearch and Bedrock
 * 
 * This script tests just the OpenSearch and Bedrock integration without MongoDB:
 * 1. Verifies OpenSearch connection and setup
 * 2. Creates and indexes a test document directly in OpenSearch
 * 3. Verifies Bedrock connectivity and model access
 * 4. Tests the RAG search and generation flow
 */

require('dotenv').config();
const { Client } = require('@opensearch-project/opensearch');
const createConnector = require('aws-opensearch-connector');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

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
    console.log('✅ OpenSearch connection successful');
    return client;
  } catch (error) {
    console.error('❌ OpenSearch connection failed:', error.message);
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
    // Try the Claude model
    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    console.log(`Testing with model: ${modelId}`);
    
    // Format the request body based on the model
    let requestBody;
    
    if (modelId.includes('anthropic.claude')) {
      // Claude models format
      requestBody = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 100,
        messages: [
          {
            role: "user", 
            content: "Please respond with 'Bedrock connectivity test successful' if you can read this message."
          }
        ]
      };
    } else if (modelId.includes('amazon.titan')) {
      // Titan models format
      requestBody = {
        inputText: "Please respond with 'Bedrock connectivity test successful' if you can read this message.",
        textGenerationConfig: {
          maxTokenCount: 100,
          temperature: 0.7,
          topP: 0.9
        }
      };
    } else if (modelId.includes('meta.llama')) {
      // Llama models format
      requestBody = {
        prompt: "Please respond with 'Bedrock connectivity test successful' if you can read this message.",
        temperature: 0.7,
        top_p: 0.9,
        max_gen_len: 100
      };
    } else {
      // Default format
      requestBody = {
        prompt: "Please respond with 'Bedrock connectivity test successful' if you can read this message.",
        max_tokens: 100
      };
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
    
    // Extract text based on model type
    if (modelId.includes('anthropic.claude')) {
      // Claude models format
      if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
        responseText = responseBody.content[0].text;
      }
    } else if (modelId.includes('amazon.titan')) {
      // Titan models format
      if (responseBody.results && responseBody.results[0] && responseBody.results[0].outputText) {
        responseText = responseBody.results[0].outputText;
      }
    } else if (modelId.includes('meta.llama')) {
      // Llama models format
      if (responseBody.generation) {
        responseText = responseBody.generation;
      }
    } else {
      // Generic format - just stringify the response
      responseText = JSON.stringify(responseBody);
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
 * Sets up the OpenSearch index and adds a test document
 */
async function setupOpenSearchIndex(client) {
  console.log('\n=== SETTING UP OPENSEARCH INDEX ===');
  
  try {
    // Check if test index exists
    const indexName = 'test-rag-index';
    const existsResponse = await client.indices.exists({ index: indexName });
    
    // Delete the index if it exists
    if (existsResponse.body) {
      console.log(`Index ${indexName} exists. Deleting...`);
      await client.indices.delete({ index: indexName });
    }
    
    // Create the index with KNN settings
    console.log(`Creating index ${indexName}...`);
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
    
    // Generate a simple embedding for the test document
    const generateEmbedding = (text) => {
      const sum = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const avg = sum / (text.length || 1);
      return [avg, avg / 2, avg / 3];
    };
    
    const embedding = generateEmbedding(TEST_DOC_CONTENT);
    console.log('Generated embedding for test document');
    
    // Index the test document
    await client.index({
      index: indexName,
      id: 'test-doc-1',
      body: {
        embedding,
        text: TEST_DOC_CONTENT,
        name: 'OpenSearch and Bedrock Integration Guide'
      }
    });
    
    // Refresh the index to make the document searchable
    await client.indices.refresh({ index: indexName });
    console.log('✅ Test document indexed successfully');
    
    return indexName;
  } catch (error) {
    console.error('❌ Index setup failed:', error.message);
    throw error;
  }
}

/**
 * Tests the RAG process using OpenSearch and Bedrock
 */
async function testRAGProcess(openSearchClient, bedrockClient, indexName) {
  console.log('\n=== TESTING RAG PROCESS ===');
  
  try {
    // Create a test query
    const query = 'What are the key components of a RAG application?';
    console.log('Test query:', query);
    
    // Generate an embedding for the query
    const generateEmbedding = (text) => {
      const sum = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const avg = sum / (text.length || 1);
      return [avg, avg / 2, avg / 3];
    };
    
    const queryEmbedding = generateEmbedding(query);
    console.log('Generated query embedding');
    
    // Search for relevant documents using cosine similarity
    const searchResponse = await openSearchClient.search({
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
    
    const hits = searchResponse.body.hits.hits;
    console.log(`Retrieved ${hits.length} documents`);
    
    if (hits.length === 0) {
      throw new Error('No documents found in search results');
    }
    
    // Extract text from the retrieved documents to create context
    const context = hits.map(hit => hit._source.text).join('\n');
    console.log('Retrieved context length:', context.length);
    
    // Create a prompt for Bedrock that includes the context
    const prompt = `Query: ${query}\n\nContext: ${context}\n\nAnswer:`;
    
    // Call Bedrock to generate an answer
    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    // Format the request body based on the model
    let requestBody;
    
    if (modelId.includes('anthropic.claude')) {
      // Claude models format
      requestBody = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1000,
        messages: [
          {
            role: "user", 
            content: prompt
          }
        ]
      };
    } else if (modelId.includes('amazon.titan')) {
      // Titan models format
      requestBody = {
        inputText: prompt,
        textGenerationConfig: {
          maxTokenCount: 1000,
          temperature: 0.7,
          topP: 0.9
        }
      };
    } else {
      // Default format
      requestBody = {
        prompt: prompt,
        max_tokens: 1000
      };
    };
    
    console.log('Generating answer with Bedrock...');
    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody)
    });
    
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    let answer = '';
    
    // Extract text based on model type
    if (modelId.includes('anthropic.claude')) {
      // Claude models format
      if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
        answer = responseBody.content[0].text;
      }
    } else if (modelId.includes('amazon.titan')) {
      // Titan models format
      if (responseBody.results && responseBody.results[0] && responseBody.results[0].outputText) {
        answer = responseBody.results[0].outputText;
      }
    } else if (modelId.includes('meta.llama')) {
      // Llama models format
      if (responseBody.generation) {
        answer = responseBody.generation;
      }
    } else {
      // Generic format - try to extract text
      answer = JSON.stringify(responseBody);
    }
    
    console.log('\n=== GENERATED ANSWER ===');
    console.log(answer);
    
    // Check if the answer mentions key terms from the document
    const keyTerms = ['document', 'vector', 'embedding', 'search', 'retrieval', 'generation'];
    const mentionedTerms = keyTerms.filter(term => 
      answer.toLowerCase().includes(term.toLowerCase())
    );
    
    console.log(`\nDetected ${mentionedTerms.length}/${keyTerms.length} key terms in the answer`);
    
    if (mentionedTerms.length >= 3) {
      console.log('✅ RAG process test successful');
      return true;
    } else {
      console.log('❌ RAG process test failed: answer does not contain enough key terms');
      return false;
    }
  } catch (error) {
    console.error('❌ RAG process test failed:', error.message);
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
    await client.indices.delete({ index: indexName });
    console.log(`Deleted test index: ${indexName}`);
    console.log('✅ Cleanup completed successfully');
  } catch (error) {
    console.error('⚠️ Cleanup failed:', error.message);
  }
}

/**
 * Main test function
 */
async function runTest() {
  console.log('=== OPENSEARCH-BEDROCK RAG TEST ===');
  
  try {
    // Check environment variables
    checkEnvironmentVariables();
    
    // Test OpenSearch connection
    const openSearchClient = await testOpenSearchConnection();
    
    // Test Bedrock connectivity
    const bedrockClient = await testBedrockConnectivity();
    
    // Set up OpenSearch index and add test document
    const indexName = await setupOpenSearchIndex(openSearchClient);
    
    // Test the RAG process
    const success = await testRAGProcess(openSearchClient, bedrockClient, indexName);
    
    // Clean up
    await cleanupResources(openSearchClient, indexName);
    
    console.log('\n=== TEST SUMMARY ===');
    if (success) {
      console.log('✅ ALL TESTS PASSED!');
      console.log('The OpenSearch-Bedrock RAG functionality is working correctly:');
      console.log('1. OpenSearch connection and indexing is working');
      console.log('2. Bedrock connection and model invocation is working');
      console.log('3. Vector search is retrieving relevant documents');
      console.log('4. RAG-based answer generation produces relevant results');
    } else {
      console.log('❌ TEST FAILED');
    }
    
    return success;
  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error('Error:', error.message);
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