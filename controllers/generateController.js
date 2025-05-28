/**
 * controllers/generateController.js
 * -----------------------------------------------------------------------------
 * Controller functions for answer generation based on user prompts:
 * - Authenticates user with JWT token (via middleware)
 * - Establishes MongoDB Atlas connection
 * - Processes documents and creates/updates embeddings
 * - Performs vector similarity search using Atlas Search
 * - Generates context-aware responses using LLM integration
 * -----------------------------------------------------------------------------
 */

const { MongoClient } = require('mongodb');
const LessonModel = require('../models/lessonModel.js');
const { downloadFileFromS3 } = require('../services/s3Service');
const LLM = require('../lib/llm/index.js');

/**
 * Establishes and returns a connection to MongoDB Atlas.
 * 
 * @returns {Promise<MongoClient>} MongoDB client instance
 * @throws {Error} If connection fails
 */
async function connectToMongoDBAtlas() {
  const connectionUri = process.env.MONGODB_URI;
  
  if (!connectionUri) {
    throw new Error('MongoDB connection URI is not defined in environment variables');
  }
  
  const mongoClient = new MongoClient(connectionUri, {
    // Adding connection options for better reliability
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 10000,
    retryWrites: true,
    retryReads: true
  });
  
  try {
    await mongoClient.connect();
    console.log('Successfully connected to MongoDB Atlas');
    return mongoClient;
  } catch (connectionError) {
    console.error('MongoDB connection error:', connectionError);
    throw new Error(`Failed to connect to MongoDB: ${connectionError.message}`);
  }
}

/**
 * Processes a document: downloads text from S3 and generates embeddings if needed.
 * 
 * @param {Object} document - The document to process
 * @param {Object} llmInstance - LLM service instance for generating embeddings
 * @returns {Promise<void>} - Resolves when processing is complete
 */
async function processDocumentWithEmbeddings(document, llmInstance) {
  console.log(`Processing document ID: ${document._id} (${document.name})`);
  
  // Skip processing if document already has embeddings and cleaned text
  if (document.embedding && document.cleanedText) {
    console.log(`Document ${document._id} already has embeddings - skipping processing`);
    return;
  }
  
  // Download and clean document text
  let documentText = '';
  try {
    if (document.textS3Key) {
      const textBuffer = await downloadFileFromS3(document.textS3Key);
      documentText = textBuffer.toString('utf8');
      console.log(`Successfully downloaded text from S3 for document ${document._id}`);
    } else {
      console.warn(`No S3 key found for document ${document._id} - using empty text`);
    }
  } catch (downloadError) {
    console.error(`Error downloading text from S3 for document ${document._id}:`, downloadError);
    throw new Error(`Failed to download document text: ${downloadError.message}`);
  }
  
  // Clean text by removing excessive whitespace
  const cleanedDocumentText = documentText.replace(/\s+/g, ' ').trim();
  console.log(`Cleaned text sample for ${document._id}: "${cleanedDocumentText.substring(0, 50)}..."`);
  
  try {
    // Generate embedding for document text
    const documentEmbedding = await llmInstance.generateEmbedding(cleanedDocumentText || '');
    console.log(`Successfully generated embedding for document ${document._id}`);
    
    // Update document with embedding and cleaned text
    await LessonModel.updateOne(
      { _id: document._id },
      { 
        $set: { 
          embedding: documentEmbedding,
          cleanedText: cleanedDocumentText
        }
      }
    );
    
    console.log(`Successfully updated document ${document._id} with embedding and cleaned text`);
  } catch (embeddingError) {
    console.error(`Error generating or storing embedding for document ${document._id}:`, embeddingError);
    throw new Error(`Failed to process document embedding: ${embeddingError.message}`);
  }
}

/**
 * Performs vector similarity search against MongoDB Atlas using the query embedding.
 * 
 * @param {Object} documentsCollection - MongoDB collection to search
 * @param {Array<number>} queryEmbedding - Vector embedding of the user's query
 * @param {string} userId - ID of the authenticated user
 * @param {number} resultLimit - Maximum number of results to return
 * @returns {Promise<Array>} Array of search results
 */
async function performVectorSimilaritySearch(documentsCollection, queryEmbedding, userId, resultLimit = 5) {
  if (!queryEmbedding || !queryEmbedding.length) {
    throw new Error('Invalid query embedding for vector search');
  }
  
  try {
    const searchResults = await documentsCollection.aggregate([
      {
        $vectorSearch: {
          index: 'vector_index',
          queryVector: queryEmbedding,
          path: "embedding",
          numCandidates: 100,  // Higher number improves result quality
          limit: resultLimit
        }
      },
      {
        $match: {
          "userId": userId,
          "status": "processed"
        }
      },
      {
        $project: {
          "_id": 1,
          "textS3Key": 1,
          "name": 1,
          "cleanedText": 1,
          "score": { $meta: "vectorSearchScore" }
        }
      }
    ]).toArray();
    
    console.log(`Retrieved ${searchResults.length} relevant documents from vector search`);
    return searchResults;
  } catch (searchError) {
    console.error('Vector similarity search error:', searchError);
    throw new Error(`Failed to perform vector search: ${searchError.message}`);
  }
}

/**
 * Main controller function that generates an answer based on a user prompt.
 * Uses vector similarity search to find relevant documents and LLM to generate a response.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with generated answer or error details
 */
async function generateAnswerFromPrompt(req, res) {
  let mongoClient = null;
  
  try {
    // Extract prompt from request body and validate
    const { prompt } = req.body;
    
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ error: 'Invalid or missing prompt in request body' });
    }
    
    console.log("Received generation request with prompt:", prompt);
    
    // Validate user authentication (handled by middleware)
    if (!req.user || !req.user.userId) {
      console.log("User authentication information not found in request");
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.userId;
    const apiKey = process.env.LLM_API_KEY;
    
    if (!apiKey) {
      console.error("LLM API key not configured in environment variables");
      return res.status(500).json({ error: 'LLM service misconfigured' });
    }
    
    // Initialize LLM service
    const llmService = new LLM(apiKey);
    
    // Connect to MongoDB Atlas
    try {
      mongoClient = await connectToMongoDBAtlas();
    } catch (connectionError) {
      console.error("Database connection error:", connectionError);
      return res.status(503).json({ error: 'Database service unavailable', details: connectionError.message });
    }
    
    const database = mongoClient.db("Runtheons_Beta");
    console.log(`Connected to database: Runtheons_Beta`);
    
    // Retrieve processed documents for the authenticated user
    let userDocuments;
    try {
      userDocuments = await LessonModel.find({ 
        status: 'processed',
        userId: userId 
      });
      console.log(`Found ${userDocuments.length} processed documents for user ${userId}`);
    } catch (documentsError) {
      console.error("Error retrieving user documents:", documentsError);
      return res.status(500).json({ error: 'Failed to retrieve user documents', details: documentsError.message });
    }
    
    // Generate embedding for the user's prompt
    let queryEmbedding;
    try {
      queryEmbedding = await llmService.generateEmbedding(prompt);
      console.log("Successfully generated query embedding");
    } catch (embeddingError) {
      console.error("Error generating query embedding:", embeddingError);
      return res.status(500).json({ error: 'Failed to process query', details: embeddingError.message });
    }
    
    // Process each document to ensure embeddings exist
    try {
      for (const document of userDocuments) {
        await processDocumentWithEmbeddings(document, llmService);
      }
    } catch (processingError) {
      console.error("Error processing documents:", processingError);
      return res.status(500).json({ error: 'Failed to process documents', details: processingError.message });
    }
    
    // Perform vector similarity search to find relevant documents
    const documentsCollection = database.collection('lessons');
    let searchResults;
    
    try {
      searchResults = await performVectorSimilaritySearch(
        documentsCollection, 
        queryEmbedding, 
        userId
      );
    } catch (searchError) {
      console.error("Vector search error:", searchError);
      return res.status(500).json({ error: 'Failed to search for relevant content', details: searchError.message });
    }
    
    // Combine text from retrieved documents to form context for answer generation
    const contextText = searchResults.map(doc => doc.cleanedText).join('\n');
    
    // Generate response using LLM with context and prompt
    try {
      const systemPromptModule = require('./systemPromptAgent.js');
      const systemPrompt = systemPromptModule(contextText);
      console.log('Generated system prompt for LLM');
      
      const generatedResponse = await llmService.generateResponse(
        systemPrompt, 
        [{ isUser: true, message_text: prompt }]
      );
      
      console.log("Successfully generated response");
      
      // Return successful response with answer and document references
      return res.json({ 
        answer: generatedResponse, 
        documents: searchResults.map(result => ({
          id: result._id,
          name: result.name,
          score: result.score
        }))
      });
    } catch (generationError) {
      console.error('Error generating response:', generationError);
      return res.status(500).json({ 
        error: 'Failed to generate answer', 
        details: generationError.message 
      });
    }
  } catch (unexpectedError) {
    // Handle any unexpected errors
    console.error("Unexpected error in generateAnswerFromPrompt:", unexpectedError);
    return res.status(500).json({ 
      error: 'An unexpected error occurred', 
      details: unexpectedError.message 
    });
  } finally {
    // Ensure MongoDB connection is properly closed
    if (mongoClient) {
      try {
        await mongoClient.close();
        console.log('MongoDB connection closed');
      } catch (closingError) {
        console.error('Error closing MongoDB connection:', closingError);
      }
    }
  }
}

module.exports = { generateAnswerFromPrompt };