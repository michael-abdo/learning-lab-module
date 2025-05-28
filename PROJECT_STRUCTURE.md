# Project Structure

This document provides an overview of the codebase organization for the Learning Lab Module.

## Root Directory

```
.
├── Procfile                    # Heroku deployment configuration
├── README.md                   # Main project documentation
├── index.js                    # Application entry point
├── jest.config.js              # Jest testing configuration
├── package.json                # NPM dependencies and scripts
├── package-lock.json           # NPM dependency lock file
├── alfred_brain_001/           # Alfred Brain AI fitness module
├── archive/                    # Archived OpenSearch implementation files
├── docs/                       # Project documentation
├── sample_documents/           # Sample documents for testing
├── scripts/                    # Utility scripts
├── src/                        # Main application source code
└── tests/                      # Test suites
```

## Key Directories

### `/src` - Main Application Code
```
src/
├── controllers/                # Request handlers
│   ├── authController.js       # Authentication logic
│   ├── documentController.js   # Document upload/management
│   ├── generateController.js   # LLM answer generation
│   ├── ragController.js        # RAG pipeline controller
│   └── systemPromptAgent.js    # System prompt management
├── core/                       # Core functionality
│   ├── rag-pipeline.js         # RAG pipeline implementation
│   └── s3-vector-store.js      # S3 vector storage (legacy)
├── lib/                        # External integrations
│   └── llm/                    # LLM service integrations
│       ├── claude.js           # Anthropic Claude
│       ├── gemini.js           # Google Gemini
│       ├── gpt.js              # OpenAI GPT
│       └── index.js            # LLM factory
├── middleware/                 # Express middleware
│   └── authMiddleware.js       # JWT authentication
├── models/                     # MongoDB models
│   └── lessonModel.js          # Document/lesson schema
├── routes/                     # API route definitions
│   ├── authRoutes.js           # Authentication endpoints
│   ├── documentRoutes.js       # Document management endpoints
│   ├── generateRoutes.js       # Answer generation endpoints
│   └── ragRoutes.js            # RAG pipeline endpoints
├── services/                   # Business logic services
│   ├── docProcessingQueue.js   # Async document processing
│   └── s3Service.js            # AWS S3 operations
├── index.js                    # Module exports
└── server.js                   # Express server setup
```

### `/tests` - Test Suites
```
tests/
├── LearningLab.test.js         # Main integration tests
├── auth/                       # Authentication tests
├── bedrock/                    # AWS Bedrock tests
├── controllers/                # Controller unit tests
├── integration/                # Integration test suite
├── unit/                       # Unit test suite
├── utils/                      # Test utilities
└── run-tests.js                # Test runner script
```

### `/alfred_brain_001` - AI Fitness Module
```
alfred_brain_001/
├── backend/                    # Backend services
│   ├── api/                    # API controllers and routes
│   ├── middleware/             # Authentication middleware
│   ├── models/                 # Data models
│   ├── services/               # Business logic
│   └── utils/                  # Utility functions
├── deploy/                     # Deployment scripts
├── docs/                       # Module documentation
├── infrastructure/             # AWS infrastructure
│   ├── cloudformation/         # CloudFormation templates
│   ├── glue/                   # AWS Glue scripts
│   ├── lambda/                 # Lambda functions
│   └── utils/                  # Infrastructure utilities
├── scripts/                    # Utility scripts
└── tests/                      # Module test suite
```

### `/docs` - Documentation
```
docs/
├── PROJECT_STRUCTURE.md        # This file
├── api/                        # API documentation
│   └── API_DOCUMENTATION.md
├── deployment/                 # Deployment guides
│   └── AWS_DEPLOYMENT_GUIDE.md
├── guides/                     # Feature guides
│   ├── RAG_TESTING_GUIDE.md
│   └── S3_VECTOR_STORE_GUIDE.md
└── project_structure.txt       # File listing
```

### `/scripts` - Utility Scripts
```
scripts/
├── delete-aws-resources.sh     # AWS cleanup script
├── mongo-setup.sh              # MongoDB setup script
└── test-auth-api.sh            # API authentication test
```

### `/sample_documents` - Test Documents
```
sample_documents/
├── audio/                      # Audio samples
├── docs/                       # Document samples
├── images/                     # Image samples
├── video/                      # Video samples
└── upload_all.sh               # Batch upload script
```

### `/archive` - Archived Code
Contains previous OpenSearch implementation files that have been replaced by MongoDB Vector Search.

## Configuration Files

- `.env` - Environment variables (not in repository)
- `Procfile` - Heroku deployment configuration
- `jest.config.js` - Jest testing framework configuration
- `package.json` - Node.js project configuration

## Key Technologies

- **Node.js & Express** - Server framework
- **MongoDB Atlas** - Database with vector search
- **AWS Services** - S3, Textract, Transcribe, Rekognition
- **Redis & Bull** - Job queue for async processing
- **Jest** - Testing framework
- **JWT** - Authentication