/**
 * RAG Controller
 * 
 * Provides API endpoints for the RAG Pipeline functionality
 */

const RAGPipeline = require('../rag-pipeline');
const fs = require('fs');
const path = require('path');

// Initialize the RAG pipeline
const pipeline = new RAGPipeline({
  maxResults: 5,
  maxTokens: 1500,
  temperature: 0.7
});

/**
 * Index a document into the RAG system
 */
exports.indexDocument = async (req, res) => {
  try {
    const { id, text, name, metadata } = req.body;
    
    if (!id || !text) {
      return res.status(400).json({
        success: false,
        error: 'Document ID and text are required'
      });
    }
    
    const result = await pipeline.indexDocument(id, {
      text,
      name: name || `Document ${id}`,
      metadata: metadata || {}
    });
    
    return res.json(result);
  } catch (error) {
    console.error('Error indexing document:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Batch index multiple documents
 */
exports.batchIndexDocuments = async (req, res) => {
  try {
    const { documents } = req.body;
    
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid documents array is required'
      });
    }
    
    const result = await pipeline.batchIndexDocuments(documents);
    
    return res.json({
      success: true,
      indexed: result.success.length,
      failed: result.failed.length,
      details: result
    });
  } catch (error) {
    console.error('Error batch indexing documents:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Index sample documents for testing
 */
exports.indexSampleDocuments = async (req, res) => {
  try {
    const SAMPLE_DOCS_DIR = path.join(__dirname, '..', 'sample_documents', 'docs');
    
    // Get text files from sample directory
    const files = fs.readdirSync(SAMPLE_DOCS_DIR)
      .filter(file => file.endsWith('.txt'));
    
    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No sample documents found'
      });
    }
    
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
    }
    
    // Index the documents
    const result = await pipeline.batchIndexDocuments(documents);
    
    return res.json({
      success: true,
      indexed: result.success.length,
      failed: result.failed.length,
      documents: result.success.map(doc => ({
        id: doc.id,
        name: documents.find(d => d.id === doc.id)?.name
      }))
    });
  } catch (error) {
    console.error('Error indexing sample documents:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Query the RAG system
 */
exports.query = async (req, res) => {
  try {
    const { query, options } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }
    
    const result = await pipeline.process(query, options || {});
    
    return res.json(result);
  } catch (error) {
    console.error('Error processing query:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Clean up the RAG system
 */
exports.cleanup = async (req, res) => {
  try {
    const result = await pipeline.cleanup();
    
    return res.json({
      success: true,
      message: 'RAG system cleaned up successfully',
      details: result
    });
  } catch (error) {
    console.error('Error cleaning up RAG system:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};