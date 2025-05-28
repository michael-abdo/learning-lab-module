/**
 * S3-based Vector Store for RAG Pipeline
 * 
 * This module implements a vector store using Amazon S3 for storage
 * instead of OpenSearch, allowing the RAG pipeline to work without 
 * OpenSearch/Elasticsearch permissions.
 */

const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
require('dotenv').config();

class S3VectorStore {
  constructor(config = {}) {
    this.bucketName = config.bucketName || process.env.S3_BUCKET;
    this.prefix = config.prefix || 'vector-store/';
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    
    if (!this.bucketName) {
      throw new Error('S3 bucket name is required. Set S3_BUCKET in .env or pass bucketName in config.');
    }
    
    this.s3Client = new S3Client({
      region: this.region
    });
    
    this.bedrockClient = new BedrockRuntimeClient({
      region: this.region
    });
    
    this.embeddingModelId = config.embeddingModelId || 'amazon.titan-embed-text-v1';
  }

  /**
   * Generate embeddings using Amazon Bedrock
   * Note: For testing, we use a simple function if Bedrock permissions are not available
   */
  async generateEmbedding(text, useBedrock = false) {
    if (useBedrock) {
      try {
        const params = {
          modelId: this.embeddingModelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            inputText: text
          })
        };
        
        const command = new InvokeModelCommand(params);
        const response = await this.bedrockClient.send(command);
        const embeddings = JSON.parse(new TextDecoder().decode(response.body)).embedding;
        
        return embeddings;
      } catch (error) {
        console.warn('Error generating embeddings with Bedrock:', error.message);
        console.warn('Falling back to simple embedding function');
        return this.generateSimpleEmbedding(text);
      }
    } else {
      return this.generateSimpleEmbedding(text);
    }
  }
  
  /**
   * Generate a simple embedding for text (for testing)
   * This improved version extracts key terms to create more meaningful embeddings
   * and ensures all embeddings have the same dimension
   */
  generateSimpleEmbedding(text) {
    // List of potential key terms to detect in the text
    const keyTerms = [
      'athlete', 'goal', 'training', 'performance', 'exercise',
      'diet', 'nutrition', 'food', 'protein', 'carbohydrate',
      'injury', 'recovery', 'rehabilitation', 'therapy', 'treatment',
      'mental', 'health', 'psychology', 'mindset', 'stress'
    ];
    
    // Always create an embedding with consistent dimensions
    const embedding = new Array(22).fill(0.1); // Initialize with default values
    
    // Skip detailed embedding for very short texts
    if (text.length >= 50) {
      // Create a "term frequency" vector
      keyTerms.forEach((term, index) => {
        // Count occurrences (case insensitive)
        const regex = new RegExp(term, 'gi');
        const count = (text.match(regex) || []).length;
        
        // Normalize by text length to get frequency
        embedding[index] = count / (text.length / 100);
      });
      
      // Add some text length characteristics to the embedding
      embedding[20] = text.length / 10000; // Document length
      embedding[21] = text.split(/\s+/).length / 1000; // Word count
    }
    
    return embedding;
  }

  /**
   * Standardize a vector to a specific dimension
   */
  standardizeVector(vector, targetDimension) {
    if (vector.length === targetDimension) {
      return vector;
    }
    
    const standardized = new Array(targetDimension).fill(0.1);
    
    // Copy existing values
    for (let i = 0; i < Math.min(vector.length, targetDimension); i++) {
      standardized[i] = vector[i];
    }
    
    return standardized;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    try {
      // Handle dimension mismatch by standardizing vectors to 22 dimensions
      const vecAStandardized = this.standardizeVector(vecA, 22);
      const vecBStandardized = this.standardizeVector(vecB, 22);
      
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      
      for (let i = 0; i < vecAStandardized.length; i++) {
        dotProduct += vecAStandardized[i] * vecBStandardized[i];
        normA += vecAStandardized[i] * vecAStandardized[i];
        normB += vecBStandardized[i] * vecBStandardized[i];
      }
      
      normA = Math.sqrt(normA);
      normB = Math.sqrt(normB);
      
      if (normA === 0 || normB === 0) {
        return 0;
      }
      
      return dotProduct / (normA * normB);
    } catch (error) {
      console.error(`Error calculating similarity: ${error.message}`);
      return 0; // Return 0 similarity on error
    }
  }

  /**
   * Store a document with its embedding in S3
   */
  async storeDocument(document, embedding) {
    // Generate document ID if not provided
    const id = document.id || Math.random().toString(36).substring(2, 15);
    const key = `${this.prefix}${id}.json`;
    
    // Prepare document with embedding
    const docWithEmbedding = {
      ...document,
      embedding
    };
    
    // Store in S3
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(docWithEmbedding),
      ContentType: 'application/json'
    };
    
    try {
      const command = new PutObjectCommand(params);
      await this.s3Client.send(command);
      return id;
    } catch (error) {
      console.error('Error storing document:', error);
      throw error;
    }
  }
  
  /**
   * Index a document by generating its embedding and storing it
   */
  async indexDocument(document, useBedrock = false) {
    try {
      // Generate embedding for document
      const embedding = await this.generateEmbedding(document.text, useBedrock);
      
      // Store document with embedding
      const id = await this.storeDocument(document, embedding);
      
      return {
        success: true,
        id
      };
    } catch (error) {
      console.error(`Failed to index document ${document.id || 'unknown'}:`, error);
      return {
        success: false,
        id: document.id,
        error: error.message
      };
    }
  }
  
  /**
   * Index multiple documents in batch
   */
  async batchIndexDocuments(documents, useBedrock = false) {
    const results = {
      success: [],
      failed: []
    };
    
    for (const document of documents) {
      const result = await this.indexDocument(document, useBedrock);
      
      if (result.success) {
        results.success.push({
          id: result.id,
          name: document.name || document.id
        });
      } else {
        results.failed.push({
          id: document.id,
          error: result.error
        });
      }
    }
    
    return results;
  }
  
  /**
   * Search for documents similar to the query text
   */
  async search(queryText, maxResults = 5, useBedrock = false) {
    try {
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(queryText, useBedrock);
      
      // Get all documents from S3
      const params = {
        Bucket: this.bucketName,
        Prefix: this.prefix
      };
      
      const command = new ListObjectsV2Command(params);
      const response = await this.s3Client.send(command);
      
      if (!response.Contents) {
        return [];
      }
      
      const documents = [];
      
      // Get each document and calculate similarity
      for (const object of response.Contents) {
        const key = object.Key;
        
        try {
          const getCommand = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key
          });
          
          const data = await this.s3Client.send(getCommand);
          const docString = await data.Body.transformToString();
          const doc = JSON.parse(docString);
          
          // Calculate similarity between query and document
          const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
          
          documents.push({
            id: doc.id,
            text: doc.text,
            name: doc.name || doc.id,
            metadata: doc.metadata || {},
            score: similarity
          });
        } catch (err) {
          console.error(`Error processing document ${key}:`, err.message);
        }
      }
      
      // Sort by similarity and get top results
      const results = documents
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
      
      return results;
    } catch (error) {
      console.error('Error searching documents:', error);
      throw error;
    }
  }
  
  /**
   * Get all stored documents (for debugging)
   */
  async getAllDocuments() {
    try {
      const params = {
        Bucket: this.bucketName,
        Prefix: this.prefix
      };
      
      const command = new ListObjectsV2Command(params);
      const response = await this.s3Client.send(command);
      
      if (!response.Contents) {
        return [];
      }
      
      const documents = [];
      
      for (const object of response.Contents) {
        const key = object.Key;
        
        try {
          const getCommand = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key
          });
          
          const data = await this.s3Client.send(getCommand);
          const docString = await data.Body.transformToString();
          const doc = JSON.parse(docString);
          
          // Remove embedding to save bandwidth
          const { embedding, ...docWithoutEmbedding } = doc;
          
          documents.push(docWithoutEmbedding);
        } catch (err) {
          console.error(`Error getting document ${key}:`, err);
        }
      }
      
      return documents;
    } catch (error) {
      console.error('Error getting all documents:', error);
      throw error;
    }
  }
  
  /**
   * Delete documents from the store
   */
  async deleteDocuments(ids) {
    const results = {
      deleted: [],
      failed: []
    };
    
    for (const id of ids) {
      const key = `${this.prefix}${id}.json`;
      
      try {
        const command = new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key
        });
        
        await this.s3Client.send(command);
        results.deleted.push(id);
      } catch (error) {
        console.error(`Error deleting document ${id}:`, error);
        results.failed.push({
          id,
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  /**
   * Delete all documents with the current prefix
   */
  async deleteAll() {
    try {
      const params = {
        Bucket: this.bucketName,
        Prefix: this.prefix
      };
      
      const command = new ListObjectsV2Command(params);
      const response = await this.s3Client.send(command);
      
      if (!response.Contents || response.Contents.length === 0) {
        return { deleted: 0 };
      }
      
      const keys = response.Contents.map(object => object.Key);
      let deleted = 0;
      
      for (const key of keys) {
        try {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: key
          });
          
          await this.s3Client.send(deleteCommand);
          deleted++;
        } catch (error) {
          console.error(`Error deleting ${key}:`, error);
        }
      }
      
      return { deleted };
    } catch (error) {
      console.error('Error deleting all documents:', error);
      throw error;
    }
  }
}

module.exports = S3VectorStore;