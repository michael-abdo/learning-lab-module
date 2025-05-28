/**
 * Basic Wearable Data Model Tests
 * 
 * Tests for the simplified wearable data MongoDB schema with real MongoDB connection.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const WearableData = require('../../backend/models/basicWearableDataModel');

// Set longer timeout for all tests
jest.setTimeout(60000);

// MongoDB in-memory server for isolated testing
let mongoServer;

describe('Basic Wearable Data Model', () => {
  // Before all tests, create a MongoDB in-memory server and connect
  beforeAll(async () => {
    console.log('Starting Basic Wearable Data tests with real MongoDB connection');
    
    try {
      // Create MongoDB in-memory server
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      
      // Connect to the in-memory server
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      
      console.log(`Connected to in-memory MongoDB at ${mongoUri}`);
    } catch (error) {
      console.error('Error setting up MongoDB:', error);
      throw error;
    }
  });

  // After each test, clean collections to ensure test isolation
  afterEach(async () => {
    try {
      await WearableData.deleteMany({});
      console.log('Cleaned wearable data collection');
    } catch (error) {
      console.error('Error cleaning collections:', error);
    }
  });

  // Clean up after tests
  afterAll(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
      }
      
      if (mongoServer) {
        await mongoServer.stop();
        console.log('Stopped MongoDB in-memory server');
      }
    } catch (error) {
      console.error('Error cleaning up:', error);
    }
  });

  // Test data creation
  describe('Data Creation', () => {
    it('should create a wearable data document with all fields', async () => {
      // Create test data
      const testData = {
        user_id: 'test-user-123',
        timestamp: new Date(),
        heart_rate: 72,
        steps: 10000,
        calories_burned: 500
      };
      
      // Create a document
      const wearableData = new WearableData(testData);
      
      // Save the document
      const savedData = await wearableData.save();
      
      // Verify it was saved correctly
      expect(savedData).toBeDefined();
      expect(savedData._id).toBeDefined();
      expect(savedData.user_id).toBe('test-user-123');
      expect(savedData.heart_rate).toBe(72);
      expect(savedData.steps).toBe(10000);
      expect(savedData.calories_burned).toBe(500);
      
      // Retrieve the document to confirm it's in the database
      const retrievedData = await WearableData.findById(savedData._id);
      expect(retrievedData).toBeDefined();
      expect(retrievedData.user_id).toBe('test-user-123');
    });

    it('should create a document with only required fields', async () => {
      // Create data with only user_id
      const wearableData = new WearableData({
        user_id: 'test-user-456'
      });
      
      // Save the document
      const savedData = await wearableData.save();
      
      // Verify it was saved correctly
      expect(savedData).toBeDefined();
      expect(savedData._id).toBeDefined();
      expect(savedData.user_id).toBe('test-user-456');
      expect(savedData.timestamp).toBeDefined(); // Should use default value
      
      // Optional fields should be undefined
      expect(savedData.heart_rate).toBeUndefined();
      expect(savedData.steps).toBeUndefined();
      expect(savedData.calories_burned).toBeUndefined();
    });
    
    it('should reject a document without required user_id', async () => {
      // Create data without user_id
      const wearableData = new WearableData({
        heart_rate: 75,
        steps: 8000
      });
      
      // Attempt to save should fail validation
      await expect(wearableData.save()).rejects.toThrow();
    });
    
    it('should validate numeric fields', async () => {
      // Create data with invalid negative values
      const wearableData = new WearableData({
        user_id: 'test-user-789',
        heart_rate: -10, // Should be rejected by min validator
        steps: -100       // Should be rejected by min validator
      });
      
      // Attempt to save should fail validation
      await expect(wearableData.save()).rejects.toThrow();
    });
  });

  // Test data retrieval
  describe('Data Retrieval', () => {
    beforeEach(async () => {
      // Create test data for each test
      const testData = [
        {
          user_id: 'test-user-789',
          timestamp: new Date('2023-01-01T12:00:00Z'),
          heart_rate: 65,
          steps: 5000,
          calories_burned: 250
        },
        {
          user_id: 'test-user-789',
          timestamp: new Date('2023-01-01T18:00:00Z'),
          heart_rate: 85,
          steps: 12000,
          calories_burned: 600
        },
        {
          user_id: 'test-user-101',
          timestamp: new Date('2023-01-01T12:00:00Z'),
          heart_rate: 70,
          steps: 8000,
          calories_burned: 400
        }
      ];
      
      // Insert test data
      await WearableData.insertMany(testData);
    });

    it('should retrieve data by user_id', async () => {
      // Find data for a specific user
      const userData = await WearableData.find({ user_id: 'test-user-789' });
      
      // Verify results
      expect(userData).toBeDefined();
      expect(userData.length).toBe(2);
      expect(userData[0].user_id).toBe('test-user-789');
      expect(userData[1].user_id).toBe('test-user-789');
    });
    
    it('should use static method to find by user_id', async () => {
      // Use the static method we defined
      const userData = await WearableData.findByUserId('test-user-789');
      
      // Verify results
      expect(userData).toBeDefined();
      expect(userData.length).toBe(2);
      expect(userData[0].user_id).toBe('test-user-789');
      
      // Should be sorted by timestamp desc
      expect(userData[0].timestamp > userData[1].timestamp).toBe(true);
    });

    it('should filter data by timestamp range', async () => {
      // Define a date range
      const startDate = new Date('2023-01-01T00:00:00Z');
      const endDate = new Date('2023-01-01T13:00:00Z');
      
      // Find data within the date range
      const rangeData = await WearableData.find({
        timestamp: { $gte: startDate, $lte: endDate }
      });
      
      // Verify results
      expect(rangeData).toBeDefined();
      expect(rangeData.length).toBe(2);
      
      // Check that timestamps are within range
      for (const data of rangeData) {
        expect(data.timestamp >= startDate).toBe(true);
        expect(data.timestamp <= endDate).toBe(true);
      }
    });
    
    it('should use static method to find in date range', async () => {
      // Define a date range
      const startDate = new Date('2023-01-01T00:00:00Z');
      const endDate = new Date('2023-01-01T20:00:00Z');
      
      // Use the static method we defined
      const rangeData = await WearableData.findInDateRange('test-user-789', startDate, endDate);
      
      // Verify results
      expect(rangeData).toBeDefined();
      expect(rangeData.length).toBe(2);
      
      // All data should be for the specified user
      for (const data of rangeData) {
        expect(data.user_id).toBe('test-user-789');
        expect(data.timestamp >= startDate).toBe(true);
        expect(data.timestamp <= endDate).toBe(true);
      }
      
      // Should be sorted by timestamp asc
      expect(rangeData[0].timestamp < rangeData[1].timestamp).toBe(true);
    });

    it('should combine user_id and timestamp filters', async () => {
      // Find data for a specific user within a date range
      const specificData = await WearableData.find({
        user_id: 'test-user-789',
        timestamp: { $gte: new Date('2023-01-01T13:00:00Z') }
      });
      
      // Verify results
      expect(specificData).toBeDefined();
      expect(specificData.length).toBe(1);
      expect(specificData[0].user_id).toBe('test-user-789');
      expect(specificData[0].heart_rate).toBe(85);
      expect(specificData[0].steps).toBe(12000);
    });
    
    it('should format data using instance method', async () => {
      // Get a document
      const data = await WearableData.findOne({ user_id: 'test-user-789' });
      
      // Use the formatting method
      const formatted = data.formatData();
      
      // Verify formatted output
      expect(formatted).toBeDefined();
      expect(formatted.user_id).toBe('test-user-789');
      expect(formatted.date).toBe('2023-01-01');
      expect(typeof formatted.heart_rate).toBe('number');
      expect(typeof formatted.steps).toBe('number');
    });
  });

  // Test data updates
  describe('Data Updates', () => {
    it('should update wearable data fields', async () => {
      // Create a test document
      const wearableData = new WearableData({
        user_id: 'test-user-update',
        heart_rate: 70,
        steps: 8000,
        calories_burned: 400
      });
      
      // Save initial document
      const savedData = await wearableData.save();
      
      // Update the document
      const updatedData = await WearableData.findByIdAndUpdate(
        savedData._id,
        { heart_rate: 75, steps: 10000 },
        { new: true }
      );
      
      // Verify updates
      expect(updatedData).toBeDefined();
      expect(updatedData.heart_rate).toBe(75);
      expect(updatedData.steps).toBe(10000);
      expect(updatedData.calories_burned).toBe(400); // Unchanged field
      
      // Fetch the document again to confirm updates were persisted
      const fetchedData = await WearableData.findById(savedData._id);
      expect(fetchedData.heart_rate).toBe(75);
      expect(fetchedData.steps).toBe(10000);
    });
    
    it('should update multiple documents with updateMany', async () => {
      // Create test data
      await WearableData.insertMany([
        {
          user_id: 'batch-update-user',
          timestamp: new Date('2023-01-01'),
          heart_rate: 70
        },
        {
          user_id: 'batch-update-user',
          timestamp: new Date('2023-01-02'),
          heart_rate: 72
        },
        {
          user_id: 'different-user',
          timestamp: new Date('2023-01-01'),
          heart_rate: 68
        }
      ]);
      
      // Update all documents for a specific user
      const updateResult = await WearableData.updateMany(
        { user_id: 'batch-update-user' },
        { $set: { calories_burned: 300 }}
      );
      
      // Verify update count
      expect(updateResult.matchedCount).toBe(2);
      expect(updateResult.modifiedCount).toBe(2);
      
      // Verify the updates were applied
      const updatedDocs = await WearableData.find({ user_id: 'batch-update-user' });
      expect(updatedDocs.length).toBe(2);
      updatedDocs.forEach(doc => {
        expect(doc.calories_burned).toBe(300);
      });
      
      // Verify other user's data wasn't affected
      const otherUserDoc = await WearableData.findOne({ user_id: 'different-user' });
      expect(otherUserDoc.calories_burned).toBeUndefined();
    });
  });

  // Test data aggregation
  describe('Data Aggregation', () => {
    beforeEach(async () => {
      // Create test data for aggregation tests
      const testData = [
        {
          user_id: 'agg-user',
          timestamp: new Date('2023-01-01T08:00:00Z'),
          heart_rate: 60,
          steps: 2000,
          calories_burned: 100
        },
        {
          user_id: 'agg-user',
          timestamp: new Date('2023-01-01T12:00:00Z'),
          heart_rate: 80,
          steps: 4000,
          calories_burned: 200
        },
        {
          user_id: 'agg-user',
          timestamp: new Date('2023-01-01T18:00:00Z'),
          heart_rate: 70,
          steps: 6000,
          calories_burned: 300
        },
        {
          user_id: 'agg-user',
          timestamp: new Date('2023-01-02T10:00:00Z'),
          heart_rate: 65,
          steps: 3000,
          calories_burned: 150
        },
        {
          user_id: 'other-user',
          timestamp: new Date('2023-01-01T12:00:00Z'),
          heart_rate: 75,
          steps: 5000,
          calories_burned: 250
        }
      ];
      
      await WearableData.insertMany(testData);
    });

    it('should calculate average heart rate for a user', async () => {
      // Calculate average heart rate using aggregation
      const result = await WearableData.aggregate([
        { $match: { user_id: 'agg-user' } },
        { $group: { 
          _id: '$user_id', 
          avgHeartRate: { $avg: '$heart_rate' } 
        }}
      ]);
      
      // Verify the calculation
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0]._id).toBe('agg-user');
      
      // Average of 60, 80, 70, 65 = 68.75
      expect(result[0].avgHeartRate).toBeCloseTo(68.75, 2);
    });

    it('should calculate total steps for a user by date', async () => {
      // Calculate total steps by date
      const result = await WearableData.aggregate([
        { $match: { user_id: 'agg-user' } },
        { $group: { 
          _id: { 
            user: '$user_id', 
            date: { 
              $dateToString: { 
                format: '%Y-%m-%d', 
                date: '$timestamp' 
              } 
            } 
          }, 
          totalSteps: { $sum: '$steps' } 
        }},
        { $sort: { '_id.date': 1 } }
      ]);
      
      // Verify the calculation
      expect(result).toBeDefined();
      expect(result.length).toBe(2); // Two distinct dates
      
      // Check Jan 1 total: 2000 + 4000 + 6000 = 12000
      expect(result[0]._id.date).toBe('2023-01-01');
      expect(result[0].totalSteps).toBe(12000);
      
      // Check Jan 2 total: 3000
      expect(result[1]._id.date).toBe('2023-01-02');
      expect(result[1].totalSteps).toBe(3000);
    });
    
    it('should calculate statistics across multiple metrics', async () => {
      // Calculate multiple statistics in a single aggregation
      const result = await WearableData.aggregate([
        { $match: { user_id: 'agg-user' } },
        { $group: { 
          _id: '$user_id',
          avgHeartRate: { $avg: '$heart_rate' },
          totalSteps: { $sum: '$steps' },
          totalCalories: { $sum: '$calories_burned' },
          dataPoints: { $count: {} },
          maxHeartRate: { $max: '$heart_rate' },
          minHeartRate: { $min: '$heart_rate' }
        }}
      ]);
      
      // Verify the calculation
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      
      const stats = result[0];
      expect(stats._id).toBe('agg-user');
      expect(stats.avgHeartRate).toBeCloseTo(68.75, 2);
      expect(stats.totalSteps).toBe(15000); // 2000 + 4000 + 6000 + 3000
      expect(stats.totalCalories).toBe(750); // 100 + 200 + 300 + 150
      expect(stats.dataPoints).toBe(4);
      expect(stats.maxHeartRate).toBe(80);
      expect(stats.minHeartRate).toBe(60);
    });
  });

  // Test data deletion
  describe('Data Deletion', () => {
    it('should delete a wearable data document', async () => {
      // Create a test document to delete
      const wearableData = new WearableData({
        user_id: 'test-user-delete',
        timestamp: new Date(),
        heart_rate: 68
      });
      
      // Save the document
      const savedData = await wearableData.save();
      
      // Confirm the document exists
      const foundData = await WearableData.findById(savedData._id);
      expect(foundData).not.toBeNull();
      
      // Delete the document
      await WearableData.findByIdAndDelete(savedData._id);
      
      // Try to find the deleted document
      const deletedData = await WearableData.findById(savedData._id);
      
      // Verify it's no longer found
      expect(deletedData).toBeNull();
    });
    
    it('should delete all data for a specific user', async () => {
      // Create multiple test documents for the same user
      const testData = [
        {
          user_id: 'test-user-bulk-delete',
          timestamp: new Date('2023-01-01'),
          heart_rate: 72
        },
        {
          user_id: 'test-user-bulk-delete',
          timestamp: new Date('2023-01-02'),
          heart_rate: 75
        },
        {
          user_id: 'keep-this-user',
          timestamp: new Date('2023-01-01'),
          heart_rate: 68
        }
      ];
      
      // Save the documents
      await WearableData.insertMany(testData);
      
      // Confirm the documents exist
      const beforeDeleteCount = await WearableData.countDocuments({ 
        user_id: 'test-user-bulk-delete' 
      });
      expect(beforeDeleteCount).toBe(2);
      
      // Delete all documents for this user
      const deleteResult = await WearableData.deleteMany({ 
        user_id: 'test-user-bulk-delete' 
      });
      
      // Verify deletion count
      expect(deleteResult).toBeDefined();
      expect(deleteResult.deletedCount).toBe(2);
      
      // Check if documents were actually deleted
      const remainingData = await WearableData.find({ 
        user_id: 'test-user-bulk-delete' 
      });
      expect(remainingData.length).toBe(0);
      
      // Verify other user's data wasn't affected
      const otherUserData = await WearableData.find({ 
        user_id: 'keep-this-user' 
      });
      expect(otherUserData.length).toBe(1);
    });
    
    it('should delete data within a specific date range', async () => {
      // Create documents with different dates
      const testData = [
        {
          user_id: 'date-range-user',
          timestamp: new Date('2023-01-01'),
          heart_rate: 70
        },
        {
          user_id: 'date-range-user',
          timestamp: new Date('2023-01-15'),
          heart_rate: 72
        },
        {
          user_id: 'date-range-user',
          timestamp: new Date('2023-01-30'),
          heart_rate: 68
        }
      ];
      
      // Save the documents
      await WearableData.insertMany(testData);
      
      // Delete data in a specific date range
      const deleteResult = await WearableData.deleteMany({
        user_id: 'date-range-user',
        timestamp: {
          $gte: new Date('2023-01-10'),
          $lte: new Date('2023-01-20')
        }
      });
      
      // Verify deletion count
      expect(deleteResult.deletedCount).toBe(1);
      
      // Check remaining documents
      const remainingData = await WearableData.find({ 
        user_id: 'date-range-user' 
      }).sort({ timestamp: 1 });
      
      // Should have 2 documents left (Jan 1 and Jan 30)
      expect(remainingData.length).toBe(2);
      expect(remainingData[0].timestamp.toISOString().split('T')[0]).toBe('2023-01-01');
      expect(remainingData[1].timestamp.toISOString().split('T')[0]).toBe('2023-01-30');
    });
  });
});