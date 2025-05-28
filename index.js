/**
 * Source code entry point
 * 
 * This file exports all the major components of the application
 * for easier imports in other files.
 */

// Core components
const S3VectorStore = require('./core/s3-vector-store');
const RAGPipeline = require('./core/rag-pipeline');

// Controllers
const authController = require('./controllers/authController');
const documentController = require('./controllers/documentController');
const generateController = require('./controllers/generateController');
const ragController = require('./controllers/ragController');

// Models
const lessonModel = require('./models/lessonModel');

// Services
const docProcessingQueue = require('./services/docProcessingQueue');
const s3Service = require('./services/s3Service');

// Main server
const server = require('./src/server');

// Export all components
module.exports = {
  // Core
  S3VectorStore,
  RAGPipeline,
  
  // Controllers
  authController,
  documentController,
  generateController,
  ragController,
  
  // Models
  lessonModel,
  
  // Services
  docProcessingQueue,
  s3Service,
  
  // Server
  server
};