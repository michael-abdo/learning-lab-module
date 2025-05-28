/**
 * controllers/authController.js
 * -----------------------------------------------------------------------------
 * Controller for authentication-related functionality.
 * Handles login, token generation, and validation.
 * -----------------------------------------------------------------------------
 */

/**
 * Validates if the current token is still valid
 * 
 * @param {object} req - Express request object with user from middleware
 * @param {object} res - Express response object
 */
const validateToken = (req, res) => {
  // If middleware passes, token is valid
  // We check if all required user properties are present
  if (!req.user || !req.user.userId) {
    return res.status(401).json({ 
      valid: false,
      error: 'Invalid token or missing user information'
    });
  }

  res.json({ 
    valid: true,
    user: {
      _id: req.user.userId,
      username: req.user.username || 'user', // Provide fallback
      role: req.user.role || 'user' // Provide fallback
    },
    tokenExpiresIn: req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null
  });
};

module.exports = {
  login,
  validateToken
};