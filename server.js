/**
 * server.js
 * -----------------------------------------------------------------------------
 * Entry point for the Learning Lab Module API.
 *
 * - Loads environment variables.
 * - Connects to MongoDB.
 * - Initializes the Express application.
 * - Sets up routes and asynchronous queue worker.
 * - Starts the server.
 * -----------------------------------------------------------------------------
 */

require('dotenv').config();
console.log("Mongo URI:", process.env.MONGODB_URI);
const express = require('express');
const mongoose = require('mongoose');
const { initQueueWorker } = require('./services/docProcessingQueue');
const documentRoutes = require('./routes/documentRoutes');
const generateRoutes = require('./routes/generateRoutes');
const authRoutes = require('./routes/authRoutes');
const ragRoutes = require('./routes/ragRoutes');
const authenticateToken = require('./middleware/authMiddleware');

async function initLearningLabModule() {
  // Connect to MongoDB using the URI from environment variables.
  await mongoose.connect(process.env.MONGODB_URI, {
    tls: true,
  });

  // Initialize Express and configure middleware.
  const app = express();
  app.use(express.json());

  // Configure CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Public routes (no authentication required)
  app.get('/', (req, res) => {
    res.send('Welcome to the Learning Lab Module API');
  });
  
  // Auth routes - these should remain public for login
  app.use('/auth', authRoutes);
  
  // Protected routes - require authentication middleware
  app.use(authenticateToken);

  // Attach document routes under the '/documents' endpoint.
  app.use('/api/learning-labs/documents', documentRoutes);

  // Attach generate route at '/generate'
  app.use('/api/learning-labs/generate-response', generateRoutes);
  
  // Attach RAG routes
  app.use('/api/learning-labs/rag', ragRoutes);

  // Initialize the asynchronous document processing queue worker.
  initQueueWorker();

  // Start the server on the defined PORT or default to 8080.
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Immediately start the module.
initLearningLabModule();

module.exports = { initLearningLabModule };