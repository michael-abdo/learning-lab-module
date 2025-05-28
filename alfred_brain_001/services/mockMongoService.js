/**
 * Mock MongoDB Service
 * 
 * This service provides a mock implementation of MongoDB functionality
 * for use when the real MongoDB connection is not available.
 * In a production environment, you would never use this - it's ONLY for
 * demonstration and testing when MongoDB Atlas IP whitelisting is not possible.
 */

const EventEmitter = require('events');
const mockData = {
  users: [],
  wearableData: []
};

class MockMongoose extends EventEmitter {
  constructor() {
    super();
    this.connection = new MockConnection();
    this.models = {};
  }

  connect(uri, options) {
    console.log(`[MOCK] MongoDB connecting to: ${uri.replace(/\/\/(.+?):.+?@/, '//\\1:****@')}`);
    // Simulate successful connection
    setTimeout(() => {
      this.connection.readyState = 1;
      this.emit('connected');
      console.log('[MOCK] MongoDB connected successfully!');
    }, 1000);
    return Promise.resolve();
  }

  model(name, schema) {
    if (!this.models[name]) {
      this.models[name] = new MockModel(name, schema);
    }
    return this.models[name];
  }
}

class MockConnection extends EventEmitter {
  constructor() {
    super();
    this.readyState = 0; // 0 = disconnected, 1 = connected
  }

  close() {
    this.readyState = 0;
    return Promise.resolve();
  }
}

class MockModel {
  constructor(name, schema) {
    this.name = name;
    this.schema = schema;
    this.data = mockData[name.toLowerCase()] || [];
    this.collection = {
      name: name.toLowerCase()
    };
  }

  async create(doc) {
    const newDoc = { ...doc, _id: `mock_id_${Date.now()}` };
    this.data.push(newDoc);
    console.log(`[MOCK] Created document in ${this.name}`);
    return newDoc;
  }

  async find(query) {
    console.log(`[MOCK] Finding documents in ${this.name}`);
    return this.data.filter(doc => {
      return Object.keys(query).every(key => {
        if (typeof query[key] === 'object' && query[key].$exists) {
          return (doc[key] !== undefined) === query[key].$exists;
        }
        return doc[key] === query[key];
      });
    });
  }

  async findOne(query) {
    const results = await this.find(query);
    return results[0] || null;
  }

  async findById(id) {
    return this.findOne({ _id: id });
  }

  static fromTerraData(terraData, userId, referenceId) {
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
  }

  static async getDailySummary(userId, date) {
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
  }

  async countDocuments() {
    return this.data.length;
  }
}

// Export mock mongoose if real connection fails
module.exports = {
  MockMongoose,
  isMockEnabled: false, // Set to true to enable mock MongoDB
  enableMock: function() {
    this.isMockEnabled = true;
    console.log('[MOCK] Mock MongoDB service enabled');
    return new MockMongoose();
  }
};