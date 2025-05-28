/**
 * Test Setup
 * 
 * This file configures the test environment for Jest.
 */

// Set environment variables for testing
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/alfred-brain-test';
process.env.TRYTERRA_API_KEY_1 = 'runtheons-testing-zbnGQ364kw';
process.env.TRYTERRA_API_KEY_2 = 'LUgN_p9G8krf97q5Et3UHxBXetnDGFpx';
process.env.OPENAI_API_KEY = 'sk-testkey123';

// Set to false to use real MongoDB
process.env.MOCK_DB = 'false';

// Set test timeout
jest.setTimeout(30000);

// MongoDB in-memory server
// Commenting out for local testing
// const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Mock User model to define calculateAge for tests
process.env.MOCK_USER_MODEL = 'true';

// Mock mongoose completely when needed
// Always mocking for tests to avoid actual database connections
{
  console.log('USING MOCK DATABASE MODE');
  
  // Create a mock Schema class with Types.Mixed
  const Schema = function() {
    return { pre: jest.fn() };
  };
  
  // Add Types property to Schema constructor
  Schema.Types = { Mixed: {} };
  
  // Create a mock document
  const mockDocument = {
    _id: new mongoose.Types.ObjectId(),
    save: jest.fn().mockResolvedValue({ _id: 'mockId' }),
    toObject: jest.fn().mockReturnThis,
    toJSON: jest.fn().mockReturnThis
  };
  
  // Override mongoose methods with mocks
  mongoose.connect = jest.fn().mockResolvedValue({});
  mongoose.disconnect = jest.fn().mockResolvedValue({});
  mongoose.Schema = Schema;
  mongoose.model = jest.fn().mockReturnValue(() => mockDocument);
  mongoose.models = {};
  
  // Simulate connection status
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1 });
  
  // Skip actual MongoDB server setup
  beforeAll(async () => {
    console.log('Mock MongoDB setup complete');
  });
  
  afterAll(async () => {
    console.log('Mock MongoDB teardown complete');
  });
}

// Mock axios for API calls
jest.mock('axios', () => ({
  create: jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} })
  }),
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ 
    data: { 
      choices: [{ message: { content: JSON.stringify({ result: 'success' }) } }] 
    } 
  })
}));