/**
 * Authentication Middleware
 * 
 * Middleware for authenticating API requests.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const logger = require('../utils/logger');

/**
 * Authenticate a user using JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Verify token
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    
    // Find user
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Attach user to request
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    logger.error('Authentication error:', { error: error.message });
    res.status(401).json({ 
      success: false, 
      message: 'Authentication failed', 
      error: error.message 
    });
  }
};

/**
 * Middleware to require specific roles
 * @param {Array} roles - Array of allowed roles
 * @returns {Function} - Express middleware function
 */
const requireRole = (roles) => {
  return async (req, res, next) => {
    try {
      // First authenticate the user
      await authenticate(req, res, () => {});
      
      if (!req.user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Authentication required' 
        });
      }
      
      if (!roles.includes(req.user.role)) {
        logger.warn('Role access denied', { 
          userId: req.user._id, 
          userRole: req.user.role, 
          requiredRoles: roles 
        });
        
        return res.status(403).json({ 
          success: false, 
          message: 'You do not have permission to access this resource' 
        });
      }
      
      next();
    } catch (error) {
      logger.error('Role authorization error:', { error: error.message });
      res.status(403).json({ 
        success: false, 
        message: 'Authorization failed', 
        error: error.message 
      });
    }
  };
};

// Special middleware for admin routes
const adminAuth = requireRole(['admin']);

// Special middleware for expert advisor routes
const expertAdvisorAuth = requireRole(['admin', 'expert_advisor']);

module.exports = authenticate;
module.exports.adminAuth = adminAuth;
module.exports.expertAdvisorAuth = expertAdvisorAuth;
module.exports.requireRole = requireRole;