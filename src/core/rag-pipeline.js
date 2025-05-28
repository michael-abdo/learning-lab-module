/**
 * Production-ready RAG Pipeline Implementation
 * 
 * This module provides a complete implementation of the RAG pipeline
 * using S3 for vector storage and Bedrock for LLM generation.
 */

const S3VectorStore = require('./s3-vector-store');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
require('dotenv').config();

class RAGPipeline {
  constructor(config = {}) {
    // Initialize vector store
    this.vectorStore = new S3VectorStore(config.vectorStore);
    
    // Initialize Bedrock client
    const region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.bedrockClient = new BedrockRuntimeClient({ region });
    
    // Configure LLM settings
    this.modelId = config.modelId || process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    this.maxTokens = config.maxTokens || 1000;
    this.temperature = config.temperature || 0.7;
    
    // Configure RAG settings
    this.maxResults = config.maxResults || 5;
    this.useBedrock = config.useBedrock || false; // For embeddings
    
    // Initialize the pipeline
    console.log(`RAG Pipeline initialized with model: ${this.modelId}`);
    console.log(`Vector store using S3 bucket: ${this.vectorStore.bucketName}`);
  }

  /**
   * Index a document into the vector store
   */
  async indexDocument(id, document) {
    try {
      // Make sure document has necessary properties
      if (!document || !document.text) {
        throw new Error('Document must have a text property');
      }
      
      // Create a document object with the required properties
      const docToIndex = {
        id: id,
        text: document.text,
        name: document.name || `Document ${id}`,
        metadata: document.metadata || {}
      };
      
      // Index the document using vectorStore's method
      const result = await this.vectorStore.indexDocument(docToIndex, this.useBedrock);
      
      return {
        success: true,
        id: result.id
      };
    } catch (error) {
      console.error('Error indexing document:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Batch index multiple documents
   */
  async batchIndexDocuments(documents) {
    const results = {
      success: [],
      failed: []
    };
    
    for (const doc of documents) {
      try {
        const result = await this.indexDocument(doc.id, {
          text: doc.text,
          name: doc.name || `Document ${doc.id}`,
          metadata: doc.metadata || {}
        });
        
        if (result.success) {
          results.success.push(result);
        } else {
          results.failed.push({
            id: doc.id,
            error: result.error
          });
        }
      } catch (error) {
        results.failed.push({
          id: doc.id,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Generate embedding for a text
   */
  async generateEmbedding(text) {
    return this.vectorStore.generateEmbedding(text, this.useBedrock);
  }

  /**
   * Search for relevant documents
   */
  async search(query, maxResults = this.maxResults) {
    return this.vectorStore.search(query, maxResults);
  }

  /**
   * Generate a prompt for the LLM using query and context
   */
  generatePrompt(query, context, systemPrompt = '') {
    let basePrompt = '';
    
    if (systemPrompt) {
      basePrompt = `${systemPrompt}\n\n`;
    }
    
    basePrompt += `Question: ${query}\n\nContext:\n${context}\n\n`;
    basePrompt += `Please answer the question based on the context provided. If the answer isn't in the context, say "I don't have enough information to answer this question."`;
    
    return basePrompt;
  }

  /**
   * Generate an answer using Bedrock
   */
  async generateAnswer(prompt) {
    try {
      // Format the request based on the model
      let requestBody;
      
      if (this.modelId.includes('anthropic.claude')) {
        // Claude models format
        requestBody = {
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          messages: [
            {
              role: "user", 
              content: prompt
            }
          ]
        };
      } else if (this.modelId.includes('amazon.titan')) {
        // Titan models format
        requestBody = {
          inputText: prompt,
          textGenerationConfig: {
            maxTokenCount: this.maxTokens,
            temperature: this.temperature,
            topP: 0.9
          }
        };
      } else if (this.modelId.includes('meta.llama')) {
        // Llama models format
        requestBody = {
          prompt: prompt,
          temperature: this.temperature,
          top_p: 0.9,
          max_gen_len: this.maxTokens
        };
      } else {
        // Default format
        requestBody = {
          prompt: prompt,
          max_tokens: this.maxTokens,
          temperature: this.temperature
        };
      }
      
      // Call Bedrock
      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(requestBody)
      });
      
      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      // Extract the generated answer based on model
      let answer = '';
      
      if (this.modelId.includes('anthropic.claude')) {
        // Claude models
        if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
          answer = responseBody.content[0].text;
        }
      } else if (this.modelId.includes('amazon.titan')) {
        // Titan models
        if (responseBody.results && responseBody.results[0] && responseBody.results[0].outputText) {
          answer = responseBody.results[0].outputText;
        }
      } else if (this.modelId.includes('meta.llama')) {
        // Llama models
        if (responseBody.generation) {
          answer = responseBody.generation;
        }
      } else {
        // Generic format - try to extract or use the full response
        answer = JSON.stringify(responseBody);
      }
      
      return {
        success: true,
        answer: answer,
        model: this.modelId
      };
    } catch (error) {
      console.error('Error generating answer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Run the complete RAG process
   */
  async process(query, options = {}) {
    try {
      console.log(`Processing query: "${query}"`);
      
      // Set options with defaults
      const maxResults = options.maxResults || this.maxResults;
      const systemPrompt = options.systemPrompt || '';
      
      // Step 1: Search for relevant documents
      console.log(`Searching for relevant documents (max: ${maxResults})...`);
      const searchResults = await this.search(query, maxResults);
      
      if (searchResults.length === 0) {
        return {
          success: false,
          error: 'No relevant documents found'
        };
      }
      
      // Step 2: Extract and combine context
      const context = searchResults.map(result => result.text).join('\n\n');
      console.log(`Retrieved ${searchResults.length} documents, total context length: ${context.length} characters`);
      
      // Step 3: Generate prompt
      const prompt = this.generatePrompt(query, context, systemPrompt);
      
      // Step 4: Generate answer
      console.log(`Generating answer using ${this.modelId}...`);
      const response = await this.generateAnswer(prompt);
      
      if (!response.success) {
        return response;
      }
      
      // Step 5: Return results
      return {
        success: true,
        answer: response.answer,
        documents: searchResults.map(result => ({
          id: result.id,
          name: result.name,
          score: result.score
        })),
        model: this.modelId
      };
    } catch (error) {
      console.error('Error in RAG process:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up the vector store
   */
  async cleanup() {
    return this.vectorStore.deleteAll();
  }
}

module.exports = RAGPipeline;