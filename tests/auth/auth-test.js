/**
 * auth-test.js
 * -----------------------------------------------------------------------------
 * Simple script to test authentication functionality
 * -----------------------------------------------------------------------------
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');

// Test valid token generation and verification
function testValidToken() {
  console.log('--- Testing Valid Token Generation and Verification ---');
  const user = {
    _id: 'test-user-id',
    username: 'testuser',
    role: 'user'
  };
  
  try {
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
    console.log('✓ Token generated successfully');
    
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    console.log('✓ Token verification successful');
    console.log('Decoded token payload:', decoded);
    return token;
  } catch (error) {
    console.error('✗ Token test failed:', error);
    return null;
  }
}

// Test token with invalid signature
function testInvalidSignature(validToken) {
  console.log('\n--- Testing Invalid Token Signature ---');
  try {
    // Generate a different secret to test invalid signature
    const fakeSecret = 'fake-secret-key-that-does-not-match';
    const decoded = jwt.verify(validToken, fakeSecret);
    console.error('✗ Test failed: Invalid signature was accepted');
  } catch (error) {
    if (error.name === 'JsonWebTokenError' && error.message === 'invalid signature') {
      console.log('✓ Test passed: Invalid signature was correctly rejected');
    } else {
      console.error('✗ Test failed with unexpected error:', error);
    }
  }
}

// Test expired token
function testExpiredToken() {
  console.log('\n--- Testing Expired Token ---');
  const user = {
    _id: 'test-user-id',
    username: 'testuser',
    role: 'user'
  };
  
  try {
    // Generate token that expired 1 second ago
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '-1s' });
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    console.error('✗ Test failed: Expired token was accepted');
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.log('✓ Test passed: Expired token was correctly rejected');
      console.log('Error details:', error.message, 'Expiration:', error.expiredAt);
    } else {
      console.error('✗ Test failed with unexpected error:', error);
    }
  }
}

// Run all tests
function runAllTests() {
  console.log('AUTH MIDDLEWARE TEST SUITE');
  console.log('=========================');
  console.log('Using ACCESS_TOKEN_SECRET:', process.env.ACCESS_TOKEN_SECRET);
  
  // Run tests
  const validToken = testValidToken();
  if (validToken) {
    testInvalidSignature(validToken);
  }
  testExpiredToken();
  
  console.log('\nTESTS COMPLETED');
}

runAllTests();