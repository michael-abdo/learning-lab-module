/**
 * Alfred Brain Server - MOCK MODE
 * 
 * Demo server with mock components for testing and demonstration.
 */

const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

// Import routes
const terraRoutes = require('./api/terraRoutes');
const llmAnalysisRoutes = require('./api/llmAnalysisRoutes');

// Import services
const terraScheduler = require('./services/terraSchedulerService');

// Initialize express app
const app = express();
// Use port 3000 instead of 8080 which is often in use
const PORT = 3000;

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Add CORS headers for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
    return res.status(200).json({});
  }
  next();
});

// Create mock MongoDB implementation
const EventEmitter = require('events');
const mockData = {
  users: [
    { _id: 'mock_user_1', name: 'Test User 1', email: 'user1@example.com', terra_user_id: 'terra_1234' },
    { _id: 'mock_user_2', name: 'Test User 2', email: 'user2@example.com', terra_user_id: 'terra_5678' }
  ],
  wearableData: []
};

class MockConnection extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1; // 0 = disconnected, 1 = connected
  }
}

class MockModel {
  constructor(name, schema) {
    this.name = name;
    this.data = mockData[name.toLowerCase()] || [];
    
    this.find = async (query = {}) => {
      console.log(`[MOCK] Finding documents in ${this.name}`, query);
      return this.data;
    };
    
    this.findById = async (id) => {
      console.log(`[MOCK] Finding document by ID in ${this.name}: ${id}`);
      return this.data.find(d => d._id === id);
    };
    
    this.create = async (doc) => {
      const newDoc = { ...doc, _id: `mock_id_${Date.now()}` };
      this.data.push(newDoc);
      console.log(`[MOCK] Created document in ${this.name}`);
      return newDoc;
    };
    
    this.save = async () => {
      console.log(`[MOCK] Saved document in ${this.name}`);
      return this;
    };
    
    // Add any other methods your application uses
  }
}

// Mock mongoose
const mongoose = {
  connection: new MockConnection(),
  models: {},
  Schema: function() { return {}; },
  model: function(name, schema) {
    if (!this.models[name]) {
      this.models[name] = new MockModel(name, schema);
    }
    return this.models[name];
  }
};

// Mock implementations for static methods
mongoose.model('WearableData', {}).fromTerraData = function(terraData, userId, referenceId) {
  return {
    user_id: userId,
    reference_id: referenceId,
    data_type: 'activity',
    source: 'tryterra',
    start_date: new Date(),
    end_date: new Date(),
    metadata: {
      device_type: 'mock_device',
      device_model: 'mock_model',
      provider: 'mock_provider'
    },
    data: terraData,
    save: async function() {
      console.log('[MOCK] Saved wearable data');
      return this;
    }
  };
};

mongoose.model('WearableData', {}).getDailySummary = async function(userId, date) {
  console.log(`[MOCK] Getting daily summary for user ${userId}`);
  return {
    user_id: userId,
    date: date,
    metrics: {
      steps: 8000,
      calories: 2500,
      distance_meters: 6000,
      sleep_duration_hours: 7.5
    },
    data_sources: ['mock_provider'],
    record_count: 1
  };
};

// Mock globals
global.mongoose = mongoose;

console.log('[MOCK] Using mock MongoDB for demonstration');

// API Routes
app.use('/api/terra', terraRoutes);
app.use('/api/analysis', llmAnalysisRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  const mongoStatus = 'connected'; // Always connected in mock mode
  
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: {
      status: mongoStatus,
      mode: 'mock',
      uri: '(mock connection)',
      note: 'Using mock MongoDB for demonstration. In production, you must whitelist your IP in MongoDB Atlas.'
    },
    environment: 'development',
    port: PORT,
    api: {
      terra: '/api/terra',
      analysis: '/api/analysis'
    },
    demo_users: [
      { id: 'mock_user_1', name: 'Test User 1', terra_id: 'terra_1234' },
      { id: 'mock_user_2', name: 'Test User 2', terra_id: 'terra_5678' }
    ]
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`[MOCK] Server running on port ${PORT}`);
  console.log('[MOCK] Visit http://localhost:3000/health to see server status');
  
  // Skip Terra scheduler initialization in mock mode
  console.log('[MOCK] TryTerra data fetching scheduler mocked');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[MOCK] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[MOCK] Server closed');
    process.exit(0);
  });
});

console.log('Alfred Brain Mock Server started successfully');
