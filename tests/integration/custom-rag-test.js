/**
 * Custom RAG Pipeline Test with Real Document
 */

const RAGPipeline = require('../../src/core/rag-pipeline');
const fs = require('fs');
const path = require('path');

async function testCustomQuery() {
  console.log('=== CUSTOM RAG TEST ===');
  
  try {
    // Initialize the RAG pipeline
    console.log('Initializing RAG pipeline...');
    const pipeline = new RAGPipeline({
      maxResults: 3,
      maxTokens: 1000,
      temperature: 0.7
    });
    
    // Load a sample document
    const filePath = path.join(__dirname, '../../sample_documents/docs/diet_nutrition.txt');
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Create document object
    const document = {
      id: 'diet_nutrition',
      text: content,
      name: 'Diet and Nutrition Guide',
      metadata: {
        source: 'sample_documents',
        filename: 'diet_nutrition.txt'
      }
    };
    
    // Index the document
    console.log('Indexing document...');
    await pipeline.indexDocument(document.id, document);
    
    // Process a custom query
    const query = 'What is a balanced meal according to this document?';
    console.log(`\nProcessing query: "${query}"`);
    
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
    
    // Clean up
    console.log('\nCleaning up...');
    await pipeline.cleanup();
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testCustomQuery();