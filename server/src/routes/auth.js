const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateUser } = require('../middleware/auth');

// Store encrypted Gemini API key for authenticated user
router.post('/store-api-key', authenticateUser, authController.storeApiKey);

// Verify user authentication and return user info
router.post('/verify-user', authenticateUser, authController.verifyUser);

// Get user profile information
router.get('/profile', authenticateUser, authController.getProfile);

// Simple API key storage without OAuth (for direct user submission)
router.post('/store-encrypted-key', authController.storeEncryptedKey);

// Simple user verification without OAuth
router.post('/verify-encrypted-user', authController.verifyEncryptedUser);

module.exports = router;