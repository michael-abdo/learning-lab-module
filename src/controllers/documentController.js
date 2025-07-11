/**
 * controllers/documentController.js
 * -----------------------------------------------------------------------------
 * Controller functions handling document-related operations:
 *   - Uploading documents with file, name, and tags.
 *   - Adding/updating document tags.
 *   - Retrieving processing status.
 *   - Searching documents by name and tags.
 *   - Deleting documents.
 * -----------------------------------------------------------------------------
 */

const DocumentModel = require('../models/lessonModel');
const { uploadFileToS3 } = require('../services/s3Service');
const { addDocumentToQueue } = require('../services/docProcessingQueue');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Upload Document: Handles file upload, validation, S3 storage, and DB record creation.
async function uploadDocument(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided.' });
    }
    
    // Validate file extension against disallowed executable types.
    const disallowedExtensions = ['.exe', '.bat', '.sh', '.msi', '.cmd'];
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (disallowedExtensions.includes(ext)) {
      return res.status(400).json({ error: 'Executable files are not allowed.' });
    }
    
    const file = req.file;
    const fileId = uuidv4();
    const fileKey = `docs/${fileId}_${file.originalname}`;

    // Upload file buffer to S3.
    await uploadFileToS3(fileKey, file.buffer);

    // Construct S3 URI using bucket name.
    const fileUrl = `${process.env.CLOUD_FRONT_URL}/${fileKey}`;
    const s3Uri = `s3://${process.env.S3_BUCKET}/${fileKey}`;

    // Use provided name or default to original file name.
    const name = req.body.name || file.originalname;

    // Parse tags from a comma-separated string or array.
    let tags = [];
    if (req.body.tags) {
      if (typeof req.body.tags === 'string') {
        tags = req.body.tags.split(',').map(tag => tag.trim());
      } else if (Array.isArray(req.body.tags)) {
        tags = req.body.tags;
      }
    }

    // Create a new document record in MongoDB.
    const newDoc = await DocumentModel.create({
      userId: req.user.userId,
      name: name,
      filename: file.originalname,
      fileType: file.mimetype,
      s3Key: fileKey,
      tags: tags,
    });

    // Enqueue job for asynchronous processing.
    addDocumentToQueue(newDoc._id);

    const responseMessage = {
      message: 'File uploaded successfully',
      documentId: newDoc._id,
      s3Uri: s3Uri,
    };
    console.log("Upload response:", responseMessage);
    return res.json(responseMessage);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Upload failed.', details: err.message });
  }
}

// Add or Update Tags: Updates the tags for an existing document.
async function addOrUpdateTags(req, res) {
  try {
    const { tags } = req.body;
    const docId = req.params.documentId;
    const doc = await DocumentModel.findById(docId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    if (doc.userId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }
    doc.tags = Array.isArray(tags) ? tags : [];
    await doc.save();
    return res.json({ message: 'Tags updated.', document: doc });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Tag update failed.' });
  }
}

// Get Document Status: Retrieves the document record and processing status.
async function getDocumentStatus(req, res) {
  try {
    const doc = await DocumentModel.findById(req.params.documentId).lean();
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    // Verify that the document belongs to the authenticated user.
    if (doc.userId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }
    return res.json(doc);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Status check failed.' });
  }
}

// Search Documents: Finds documents by name (case-insensitive) and matching tags.
async function searchDocuments(req, res) {
  try {
    const { name, tags } = req.query;
    let query = { userId: req.user.userId };
    if (name) {
      query.name = { $regex: name, $options: 'i' };
    }
    if (tags) {
      const tagList = typeof tags === 'string'
        ? tags.split(',').map(t => t.trim())
        : tags;
      query.tags = { $all: tagList };
    }
    const docs = await DocumentModel.find(query).lean();
    return res.json({ documents: docs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Search failed.' });
  }
}


// Delete Document: Removes a document record from MongoDB and optionally its S3 file.
async function deleteDocument(req, res) {
  try {
    const docId = req.params.documentId;
    const doc = await DocumentModel.findById(docId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    if (doc.userId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }
    await DocumentModel.findByIdAndDelete(docId);
    return res.json({ message: 'Document deleted successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Deletion failed.', details: err.message });
  }
}


module.exports = {
  uploadDocument,
  addOrUpdateTags,
  getDocumentStatus,
  searchDocuments,
  deleteDocument,
};
