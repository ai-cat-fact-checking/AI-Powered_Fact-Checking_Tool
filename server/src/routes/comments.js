const express = require('express');
const router = express.Router();
const commentsController = require('../controllers/commentsController');
const { authenticateUser, optionalAuth } = require('../middleware/auth');

// Get comments for a specific article (public access)
router.get('/:articleUrl', optionalAuth, commentsController.getComments);

// Create a new comment (requires authentication)
router.post('/', authenticateUser, commentsController.createComment);

// Create a new comment without authentication (simple email-based)
router.post('/simple', commentsController.createSimpleComment);

// Get user's own comments (requires authentication)
router.get('/user/my-comments', authenticateUser, commentsController.getUserComments);

// Update a comment (requires authentication and ownership)
router.put('/:commentId', authenticateUser, commentsController.updateComment);

// Delete a comment (requires authentication and ownership)
router.delete('/:commentId', authenticateUser, commentsController.deleteComment);

module.exports = router;