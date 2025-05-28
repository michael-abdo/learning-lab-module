/**
 * routes/authRoutes.js
 * -----------------------------------------------------------------------------
 * Express Router for handling authentication endpoints:
 * - POST /login  -> Authenticate user and generate JWT token
 * - GET /validate -> Validate existing token
 * -----------------------------------------------------------------------------
 */

const express = require('express');
const { login, validateToken } = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

// Public route for login
router.post('/login', login);

// Protected route for token validation (authentication handled by global middleware)
router.get('/validate', validateToken);

module.exports = router;