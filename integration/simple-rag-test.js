/**
 * Simple RAG Pipeline Test - S3 Vector Store with Real Documents
 * 
 * This script provides a straightforward way to test the S3-based RAG pipeline
 * with actual documents from the sample_documents directory.
 * 
 * Run with: node simple-rag-test.js
 * 
 * Requirements:
 * - AWS credentials configured with S3 and Bedrock access
 * - S3_BUCKET environment variable set
 * - BEDROCK_MODEL_ID environment variable (optional, defaults to Claude 3 Sonnet)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const RAGPipeline = require('./rag-pipeline');

// Configurable test parameters
const TEST_CONFIG = {
  // Set to true to keep documents in S3 after test, false to delete them
  keepDocuments: false,
  
  // Test queries to run against the indexed documents
  queries: [
    "What are some strategies for athlete goal setting?",
    "How should I structure my diet as an athlete?",
    "What are the key components of sports injury recovery?",
    "How can mental health affect athletic performance?"
  ],
  
  // Custom documents to test (leave empty for sample documents only)
  customDocuments: [
    {
      id: 'moms-name',
      name: 'Personal Information',
      text: 'My mom\'s name is Mary. She is a wonderful person who has always been supportive and caring.'
    }
    // Add more custom documents here if needed
  ]
};

/**
 * Load sample documents from the sample_documents/docs directory
 */
function loadSampleDocuments() {
  console.log('\n=== LOADING SAMPLE DOCUMENTS ===');
  
  try {
    // Get text files from sample directory
    const sampleDocsDir = path.join(__dirname, 'sample_documents', 'docs');
    const files = fs.readdirSync(sampleDocsDir)
      .filter(file => file.endsWith('.txt'));
    
    console.log(`Found ${files.length} text files in sample directory`);
    
    const documents = [];
    
    // Load each document
    for (const file of files) {
      const filePath = path.join(sampleDocsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Extract title from filename
      const name = file
        .replace('.txt', '')
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      documents.push({
        id: file.replace('.txt', ''),
        name,
        text: content
      });
      
      console.log(`Loaded: ${name} (${content.length} characters)`);
    }
    
    return documents;
  } catch (error) {
    console.error('Error loading documents:', error);
    throw error;
  }
}

/**
 * Run the RAG pipeline test
 */
async function runRAGTest() {
  console.log('===== S3 VECTOR STORE RAG PIPELINE TEST =====');
  console.log('\nThis test will index sample documents to S3 and run test queries');
  
  try {
    // Initialize RAG pipeline
    console.log('\n=== INITIALIZING RAG PIPELINE ===');
    const pipeline = new RAGPipeline({
      maxResults: 3,
      maxTokens: 1000,
      temperature: 0.7
    });
    
    console.log(`Vector store using S3 bucket: ${pipeline.vectorStore.bucketName}`);
    console.log(`LLM model: ${pipeline.modelId}`);
    
    // Load sample documents
    const sampleDocuments = loadSampleDocuments();
    
    // Combine with any custom documents
    const allDocuments = [
      ...sampleDocuments,
      ...TEST_CONFIG.customDocuments
    ];
    
    // Index all documents
    console.log('\n=== INDEXING DOCUMENTS ===');
    console.log(`Indexing ${allDocuments.length} documents...`);
    
    for (const doc of allDocuments) {
      console.log(`Indexing: ${doc.name}`);
      await pipeline.indexDocument(doc.id, {
        text: doc.text,
        name: doc.name,
        metadata: { source: doc.id }
      });
    }
    
    console.log('All documents indexed successfully');
    
    // Process test queries
    console.log('\n=== TESTING QUERIES ===');
    
    for (const [index, query] of TEST_CONFIG.queries.entries()) {
      console.log(`\n----- Query ${index + 1}: "${query}" -----`);
      
      const result = await pipeline.process(query);
      
      if (result.success) {
        console.log('\nTop matching documents:');
        result.documents.forEach((doc, i) => {
          console.log(`${i + 1}. ${doc.name} (Score: ${doc.score.toFixed(4)})`);
        });
        
        console.log('\nGenerated Answer:');
        console.log(result.answer);
      } else {
        console.error(`Query failed: ${result.error}`);
      }
      
      console.log('-'.repeat(70));
    }
    
    // Cleanup if configured
    if (!TEST_CONFIG.keepDocuments) {
      console.log('\n=== CLEANING UP ===');
      await pipeline.cleanup();
      console.log('All documents removed from S3');
    } else {
      console.log('\n=== KEEPING DOCUMENTS IN S3 ===');
      console.log(`Documents are stored in: s3://${pipeline.vectorStore.bucketName}/${pipeline.vectorStore.prefix}`);
      console.log('You can view them in the AWS S3 Console');
    }
    
    console.log('\n===== TEST COMPLETED SUCCESSFULLY =====');
    console.log('The S3-based RAG pipeline is working correctly with real documents!');
    
    return true;
  } catch (error) {
    console.error('\n===== TEST FAILED =====');
    console.error('Error:', error.message);
    
    console.log('\nTROUBLESHOOTING TIPS:');
    console.log('1. Check S3 bucket access and permissions');
    console.log('2. Verify AWS credentials and region');
    console.log('3. Ensure Bedrock model access is enabled in AWS console');
    console.log('4. Check environment variables in .env file');
    
    return false;
  }
}

// Run the test
runRAGTest()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });