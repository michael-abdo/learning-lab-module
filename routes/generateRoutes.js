//routes/generateRoutes.js

const express = require('express');
const { generateAnswerFromPrompt } = require('../controllers/generateController');
const authenticateToken = require('../middleware/authMiddleware');
const router = express.Router();

router.post('/', generateAnswerFromPrompt);

module.exports = router;