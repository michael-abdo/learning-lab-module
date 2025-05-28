/**
 * routes/documentRoutes.js
 * -----------------------------------------------------------------------------
 * Express Router for handling document-related endpoints:
 *   - POST /upload           -> Upload a document.
 *   - POST /:id/tags         -> Add or update document tags.
 *   - GET /:id/status        -> Retrieve document processing status.
 *   - GET /                 -> Search documents by name and tags.
 *   - DELETE /:id            -> Delete a document.
 *   - POST /generate         -> Generate response from prompt.
 * -----------------------------------------------------------------------------
 */

const express = require('express');
const multer = require('multer');
const authenticateToken = require('../middleware/authMiddleware');
const {
  uploadDocument,
  addOrUpdateTags,
  getDocumentStatus,
  searchDocuments,
  deleteDocument,
} = require('../controllers/documentController');
const { generateFromPrompt } = require('../controllers/generateController');

const router = express.Router();

// Configure Multer for in-memory file storage with 1GB file size limit.
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB limit.
});

// Route definitions - authentication is handled by global middleware
router.post('/upload', upload.single('file'), uploadDocument);
router.post('/:documentId/tags', addOrUpdateTags);
router.get('/:documentId/status', getDocumentStatus);
router.get('/', searchDocuments);
router.delete('/:documentId', deleteDocument);
router.post('/generate-response', generateFromPrompt);

module.exports = router;
