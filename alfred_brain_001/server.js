/**
 * Alfred Brain Server
 * 
 * Main application server for Alfred Brain with TryTerra integration
 * and LLM-based performance plan generation.
 */

const express = require('express');
let mongoose = require('mongoose'); // Changed to 'let' to allow reassignment
const bodyParser = require('body-parser');
require('dotenv').config();

// Import mock MongoDB service for fallback
const { MockMongoose, enableMock } = require('./services/mockMongoService');
// Use mock MongoDB immediately for this demonstration
let useMockMongo = true;

// Import routes
const terraRoutes = require('./api/terraRoutes');
const llmAnalysisRoutes = require('./api/llmAnalysisRoutes');
const expertAdvisorRoutes = require('./api/expertAdvisorRoutes');

// Import services
const terraScheduler = require('./services/terraSchedulerService');
const wearableDataProcessor = require('./services/wearableDataProcessor');
const expertAdvisorService = require('./services/expertAdvisorService');

// Initialize express app
const app = express();
// Using environment variable PORT with fallback to 3000 (not 8080 which is often in use)
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Add CORS headers for development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
      return res.status(200).json({});
    }
    next();
  });
}

// Connect to MongoDB with retries or use mock
if (useMockMongo) {
  console.log('Using Mock MongoDB for demonstration');
  mongoose = enableMock();
  mongoose.connect(process.env.MONGODB_URI, {});
} else {
  // Real MongoDB connection with retries
  let connectionAttempts = 0;
  const MAX_REAL_ATTEMPTS = 3;

  const connectWithRetry = () => {
    connectionAttempts++;
    console.log(`Attempting to connect to MongoDB... (Attempt ${connectionAttempts}/${MAX_REAL_ATTEMPTS})`);
    console.log(`MongoDB URI: ${process.env.MONGODB_URI.replace(/\/\/(.+?):.+?@/, '//\\1:****@')}`);
    
    mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000 // Timeout after 10 seconds instead of 30
    })
    .then(() => {
      console.log('Connected to MongoDB successfully!');
      console.log('MongoDB connection state:', mongoose.connection.readyState);
      connectionAttempts = 0; // Reset counter on success
    })
    .catch(err => {
      console.error('MongoDB connection error:', err.message);
      console.log('MongoDB Atlas requires your IP to be whitelisted.');
      console.log('Please add your IP or 0.0.0.0/0 (for testing) in MongoDB Atlas Network Access settings.');
      
      if (connectionAttempts >= MAX_REAL_ATTEMPTS) {
        console.log('Maximum connection attempts reached. Switching to Mock MongoDB mode for demonstration.');
        useMockMongo = true;
        mongoose = enableMock();
        // Ensure connection is established with mock
        mongoose.connect(process.env.MONGODB_URI, {});
      } else {
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
      }
    });
  };

  // Initial connection attempt
  connectWithRetry();
}

// API Routes
app.use('/api/terra', terraRoutes);
app.use('/api/analysis', llmAnalysisRoutes);
app.use('/api/advisor', expertAdvisorRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const expertAdvisorEnabled = await expertAdvisorService.isExpertAdvisorEnabled();
  
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: {
      status: mongoStatus,
      mode: useMockMongo ? 'mock' : 'real',
      uri: process.env.MONGODB_URI.replace(/\/\/(.+?):.+?@/, '//\\1:****@'), // Hide password in logs
      note: useMockMongo ? 'Using mock MongoDB for demonstration. In production, you must whitelist your IP in MongoDB Atlas.' : undefined
    },
    features: {
      expertAdvisor: expertAdvisorEnabled
    },
    environment: process.env.NODE_ENV,
    port: PORT,
    api: {
      terra: '/api/terra',
      analysis: '/api/analysis',
      advisor: '/api/advisor'
    }
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initialize services
  (async () => {
    try {
      // Initialize TryTerra scheduler
      await terraScheduler.init({ 
        startScheduler: true,
        initialFetch: false // Set to true in production to fetch data on startup
      });
      console.log('TryTerra data fetching scheduler initialized');
      
      // Initialize wearable data processor
      await wearableDataProcessor.init({
        processOnStartup: false // Set to true in production to process pending data on startup
      });
      console.log('Wearable data processor service initialized');
      
      // Initialize expert advisor service
      await expertAdvisorService.init();
      console.log('Expert advisor service initialized');
    } catch (error) {
      console.error('Error initializing services:', error);
    }
  })();
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Get all scheduler jobs and stop them
  const activeJobs = terraScheduler.getActiveJobs();
  for (const jobId in activeJobs) {
    terraScheduler.stopScheduledJob(jobId);
    console.log(`Stopped scheduler job: ${jobId}`);
  }
  
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Get all scheduler jobs and stop them
  const activeJobs = terraScheduler.getActiveJobs();
  for (const jobId in activeJobs) {
    terraScheduler.stopScheduledJob(jobId);
    console.log(`Stopped scheduler job: ${jobId}`);
  }
  
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

module.exports = app;