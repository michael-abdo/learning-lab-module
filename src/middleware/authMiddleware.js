/**
 * authMiddleware.js
 * -----------------------------------------------------------------------------
 * Authentication middleware for JWT token validation.
 * Adds authenticated user data to the request object.
 * -----------------------------------------------------------------------------
 */

const jwt = require('jsonwebtoken');

/**
 * Authenticates requests by validating the JWT token in the Authorization header
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} - Calls next() if authenticated or returns error response
 */
function authenticateToken(req, res, next) {
  // Skip authentication for auth routes
  if (req.path.startsWith('/auth') && req.path !== '/auth/validate') {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // No token provided
  if (!token) {
    // Use dummy user in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: Using test user ID');
      req.user = { _id: 'test-user-id' };
      return next();
    }
    console.log('Authentication failed: No token provided', req.path);
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Authentication token is required'
    });
  }

  // Verify token
  try {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
      if (err) {
        console.log('Token verification failed:', err.message);
        
        // Handle different JWT errors with appropriate responses
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({ 
            error: 'Token expired',
            message: 'Your session has expired. Please log in again.'
          });
        }
        
        if (err.name === 'JsonWebTokenError') {
          return res.status(403).json({ 
            error: 'Invalid token',
            message: 'Authentication failed. Please log in again.'
          });
        }
        
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'Authentication failed'
        });
      }
      
      // Ensure user has required fields
      if (!user || !user.userId) {
        console.log('Token does not contain required user data');
        return res.status(403).json({ 
          error: 'Invalid token',
          message: 'Token does not contain required user data'
        });
      }
      
      // Token is valid, set user on request
      req.user = user;
      next();
    });
  } catch (error) {
    console.error('Unexpected error in authentication middleware:', error);
    return res.status(500).json({ 
      error: 'Authentication error',
      message: 'An unexpected error occurred during authentication'
    });
  }
}

module.exports = authenticateToken;
