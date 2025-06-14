# Project Structure

This document provides an overview of the organized codebase structure for the Learning Lab Module.

## Root Directory

```
.
   CHANGELOG.md                # Version history and changes
   LICENSE                     # MIT License
   Procfile                    # Heroku deployment configuration
   README.md                   # Main project documentation
   index.js                    # Application entry point
   jest.config.js              # Jest testing configuration
   package.json                # NPM dependencies and scripts
   package-lock.json           # NPM dependency lock file
   alfred_brain_001/           # Alfred Brain AI fitness module
   archive/                    # Archived OpenSearch implementation files
   config/                     # Configuration files for different environments
   docs/                       # Project documentation
   logos/                      # Brand assets and logos
   sample_documents/           # Sample documents for testing
   scripts/                    # Utility scripts
   src/                        # Main application source code
   tests/                      # Test suites
```

## Organized Directory Structure

### `/src` - Main Application Source Code
```
src/
   controllers/                # Request handlers
      authController.js       # Authentication logic
      documentController.js   # Document upload/management
      generateController.js   # LLM answer generation
      ragController.js        # RAG pipeline controller
      systemPromptAgent.js    # System prompt management
   core/                       # Core functionality
      rag-pipeline.js         # RAG pipeline implementation
      s3-vector-store.js      # S3 vector storage (legacy)
   lib/                        # External integrations
      llm/                    # LLM service integrations
          claude.js           # Anthropic Claude
          gemini.js           # Google Gemini
          gpt.js              # OpenAI GPT
          index.js            # LLM factory
   middleware/                 # Express middleware
      authMiddleware.js       # JWT authentication
   models/                     # MongoDB models
      lessonModel.js          # Document/lesson schema
   routes/                     # API route definitions
      authRoutes.js           # Authentication endpoints
      documentRoutes.js       # Document management endpoints
      generateRoutes.js       # Answer generation endpoints
      ragRoutes.js            # RAG pipeline endpoints
   services/                   # Business logic services
      docProcessingQueue.js   # Async document processing
      s3Service.js            # AWS S3 operations
   server.js                   # Express server setup
```

This organized structure promotes maintainability, scalability, and developer productivity while following Node.js best practices.