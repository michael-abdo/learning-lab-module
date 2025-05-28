// Simple JWT token generator for testing
const jwt = require('jsonwebtoken');

// Secret key for JWT (should match what's in authMiddleware.js)
// For testing only - normally this would be in environment variables
const JWT_SECRET = 'test-secret-key';

// Create a test user payload
const testUser = {
  _id: '123456789012345678901234', // 24-character MongoDB-style ID
  name: 'Test User',
  email: 'test@example.com',
  role: 'admin' // Admin role to access protected endpoints
};

// Generate token
const token = jwt.sign(testUser, JWT_SECRET, { expiresIn: '1h' });

console.log('Test JWT Token:');
console.log(token);
console.log('\nUse this token in the Authorization header:');
console.log(`Authorization: Bearer ${token}`);
