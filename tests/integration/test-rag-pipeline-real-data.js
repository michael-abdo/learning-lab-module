/**
 * Test script for RAG Pipeline with Real Documents
 * 
 * This script tests the complete RAG pipeline using real sample documents
 * from the sample_documents directory.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const RAGPipeline = require('../../src/core/rag-pipeline');

// Sample document directory
const SAMPLE_DOCS_DIR = path.join(__dirname, '../../sample_documents/docs');

// Test queries
const TEST_QUERIES = [
  "What are some strategies for athlete goal setting?",
  "How should I structure my diet as an athlete?",
  "What are the key components of sports injury recovery?",
  "How can mental health affect athletic performance?"
];

/**
 * Load sample documents
 */
async function loadSampleDocuments() {
  console.log('=== LOADING SAMPLE DOCUMENTS ===');
  
  try {
    // Get text files from sample directory
    const files = fs.readdirSync(SAMPLE_DOCS_DIR)
      .filter(file => file.endsWith('.txt'));
    
    console.log(`Found ${files.length} text files in sample directory`);
    
    const documents = [];
    
    // Load each document
    for (const file of files) {
      const filePath = path.join(SAMPLE_DOCS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Extract title from filename
      const name = file
        .replace('.txt', '')
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      documents.push({
        id: file.replace('.txt', ''),
        text: content,
        name,
        metadata: {
          source: 'sample_documents',
          filename: file
        }
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
 * Run the test with real documents
 */
async function runRealDataTest() {
  console.log('===== RAG PIPELINE TEST WITH REAL DOCUMENTS =====\n');
  
  try {
    // Step 1: Initialize the RAG pipeline
    console.log('Initializing RAG pipeline...');
    const pipeline = new RAGPipeline({
      maxResults: 3,
      maxTokens: 1000,
      temperature: 0.7
    });
    
    // Step 2: Load sample documents
    const documents = await loadSampleDocuments();
    
    // Step 3: Index the documents
    console.log('\n=== INDEXING DOCUMENTS ===');
    const indexResults = await pipeline.batchIndexDocuments(documents);
    
    console.log(`Successfully indexed ${indexResults.success.length} documents`);
    if (indexResults.failed.length > 0) {
      console.warn(`Failed to index ${indexResults.failed.length} documents`);
    }
    
    // Step 4: Process test queries
    console.log('\n=== TESTING QUERIES ===');
    
    for (const [index, query] of TEST_QUERIES.entries()) {
      console.log(`\n--- Query ${index + 1}: "${query}" ---`);
      
      const result = await pipeline.process(query);
      
      if (result.success) {
        console.log('\nRelevant Documents:');
        result.documents.forEach((doc, i) => {
          console.log(`${i + 1}. ${doc.name} (Score: ${doc.score.toFixed(4)})`);
        });
        
        console.log('\nGenerated Answer:');
        console.log(result.answer);
      } else {
        console.error(`Query failed: ${result.error}`);
      }
      
      console.log('-'.repeat(80));
    }
    
    // Step 5: Clean up
    console.log('\n=== CLEANING UP ===');
    const cleanupResult = await pipeline.cleanup();
    console.log('Cleanup complete!');
    
    console.log('\n===== TEST COMPLETED SUCCESSFULLY =====');
    console.log('The RAG pipeline is working correctly with real documents!');
    
    return true;
  } catch (error) {
    console.error('\n===== TEST FAILED =====');
    console.error('Error:', error.message);
    return false;
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  runRealDataTest()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runRealDataTest };