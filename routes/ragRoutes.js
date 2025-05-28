/**
 * RAG API Routes
 * 
 * API endpoints for the RAG Pipeline functionality
 */

const express = require('express');
const ragController = require('../controllers/ragController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all routes with authentication middleware
router.use(authMiddleware);

// Document indexing routes
router.post('/index', ragController.indexDocument);
router.post('/batch-index', ragController.batchIndexDocuments);
router.post('/index-samples', ragController.indexSampleDocuments);

// Query route
router.post('/query', ragController.query);

// Maintenance routes
router.post('/cleanup', ragController.cleanup);

module.exports = router;