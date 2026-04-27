// Use file database when PostgreSQL is not available
const express = require('express');
const database = require('../models/database');
const Joi = require('joi');

// Validation schemas
const commentSchema = Joi.object({
    articleUrl: Joi.string().min(1).required(), // 改為更寬鬆的字串驗證
    content: Joi.string().min(1).max(2000).required(),
    tag: Joi.string().valid(
        '疑美論', '國防安全', '公共衛生', '經濟貿易', '無論據佐證', '中國用語',
        '可信', '不可信', '部分可信', '待查證', '其他'
    ).required()
});

class CommentsController {
    /**
     * Get comments for a specific article
     */
    async getComments(req, res) {
        try {
            const { articleUrl } = req.params;
            const { limit = 50 } = req.query;

            if (!articleUrl) {
                return res.status(400).json({
                    error: 'Missing article URL',
                    message: 'Article URL is required'
                });
            }

            const decodedUrl = decodeURIComponent(articleUrl);
            const comments = await database.getCommentsByArticleUrl(decodedUrl, parseInt(limit));

            // Format comments for response
            const formattedComments = comments.map(comment => ({
                id: comment.id,
                content: comment.content,
                tag: comment.tag,
                createdAt: comment.created_at,
                author: {
                    name: comment.user_name,
                    // Don't expose email for privacy
                    isOwner: req.user ? req.user.id === comment.user_id : false
                }
            }));

            res.status(200).json({
                success: true,
                comments: formattedComments,
                total: comments.length,
                articleUrl: decodedUrl
            });

        } catch (error) {
            console.error('Get comments error:', error);
            res.status(500).json({
                error: 'Failed to get comments',
                message: error.message
            });
        }
    }

    /**
     * Create a new comment
     */
    async createComment(req, res) {
        try {
            const { error, value } = commentSchema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    error: 'Validation failed',
                    message: error.details[0].message
                });
            }

            const { articleUrl, content, tag } = value;
            const userId = req.user.id;

            // Decode URL to ensure consistent storage format
            const decodedUrl = decodeURIComponent(articleUrl);

            // Check for duplicate comments (same user, same article, similar content)
            const recentComments = await database.query(
                `SELECT content FROM comments 
                 WHERE user_id = $1 AND article_url = $2 
                 AND created_at > NOW() - INTERVAL '5 minutes'
                 ORDER BY created_at DESC LIMIT 5`,
                [userId, decodedUrl]
            );

            // Simple duplicate detection
            const isDuplicate = recentComments.rows.some(comment => 
                comment.content.toLowerCase().trim() === content.toLowerCase().trim()
            );

            if (isDuplicate) {
                return res.status(409).json({
                    error: 'Duplicate comment',
                    message: 'You recently posted a similar comment'
                });
            }

            // Create the comment
            const newComment = await database.createComment(userId, decodedUrl, content, tag);

            res.status(201).json({
                success: true,
                comment: {
                    id: newComment.id,
                    content: newComment.content,
                    tag: newComment.tag,
                    createdAt: newComment.created_at,
                    articleUrl: newComment.article_url
                }
            });

        } catch (error) {
            console.error('Create comment error:', error);
            res.status(500).json({
                error: 'Failed to create comment',
                message: error.message
            });
        }
    }

    /**
     * Get user's own comments
     */
    async getUserComments(req, res) {
        try {
            const { limit = 50 } = req.query;
            const userId = req.user.id;

            const userComments = await database.getUserComments(userId, parseInt(limit));

            const formattedComments = userComments.map(comment => ({
                id: comment.id,
                content: comment.content,
                tag: comment.tag,
                articleUrl: comment.article_url,
                createdAt: comment.created_at
            }));

            res.status(200).json({
                success: true,
                comments: formattedComments,
                total: userComments.length
            });

        } catch (error) {
            console.error('Get user comments error:', error);
            res.status(500).json({
                error: 'Failed to get user comments',
                message: error.message
            });
        }
    }

    /**
     * Update a comment (user can only update their own comments)
     */
    async updateComment(req, res) {
        try {
            const { commentId } = req.params;
            const { content, tag } = req.body;
            const userId = req.user.id;

            if (!content || !tag) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    message: 'Content and tag are required'
                });
            }

            // Validate content and tag
            const validation = Joi.object({
                content: Joi.string().min(1).max(2000).required(),
                tag: Joi.string().valid(
                    '疑美論', '國防安全', '公共衛生', '經濟貿易', '無論據佐證',
                    '可信', '不可信', '部分可信', '待查證', '其他'
                ).required()
            }).validate({ content, tag });

            if (validation.error) {
                return res.status(400).json({
                    error: 'Validation failed',
                    message: validation.error.details[0].message
                });
            }

            // Check if comment exists and belongs to user
            const existingComment = await database.query(
                'SELECT * FROM comments WHERE id = $1 AND user_id = $2',
                [commentId, userId]
            );

            if (existingComment.rows.length === 0) {
                return res.status(404).json({
                    error: 'Comment not found',
                    message: 'Comment does not exist or you do not have permission to edit it'
                });
            }

            // Update the comment
            const updatedComment = await database.query(
                `UPDATE comments 
                 SET content = $1, tag = $2, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = $3 AND user_id = $4 
                 RETURNING *`,
                [content, tag, commentId, userId]
            );

            res.status(200).json({
                success: true,
                comment: {
                    id: updatedComment.rows[0].id,
                    content: updatedComment.rows[0].content,
                    tag: updatedComment.rows[0].tag,
                    updatedAt: updatedComment.rows[0].updated_at
                }
            });

        } catch (error) {
            console.error('Update comment error:', error);
            res.status(500).json({
                error: 'Failed to update comment',
                message: error.message
            });
        }
    }

    /**
     * Create a simple comment without authentication
     * Used for email-based simple authentication
     */
    async createSimpleComment(req, res) {
        try {
            const { articleId, text, tag, userId, userName } = req.body;

            // Validate required fields
            if (!articleId || !text || !tag || !userId) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    message: 'articleId, text, tag, and userId are required'
                });
            }

            // Validate tag
            const validTags = ['疑美論', '國防安全', '公共衛生', '經濟貿易', '無論據佐證', '中國用語'];
            if (!validTags.includes(tag)) {
                return res.status(400).json({
                    error: 'Invalid tag',
                    message: `Tag must be one of: ${validTags.join(', ')}`
                });
            }

            // Validate text length
            if (text.length > 2000) {
                return res.status(400).json({
                    error: 'Text too long',
                    message: 'Comment text must be under 2000 characters'
                });
            }

            // Convert articleId to proper URL format (reverse the encoding from extension)
            const articleUrl = articleId.replaceAll('\\', '/');

            // Try to create/find user first (simple user management)
            try {
                // Check if user exists
                let user = await database.getUserByGoogleId(userId);
                
                if (!user) {
                    // Create simple user record
                    const userData = {
                        googleId: userId,
                        email: `${userId}@local.extension`, // Simple email for local users
                        name: userName || `User ${userId}`,
                        picture: null
                    };
                    
                    user = await database.createOrUpdateUser(userData);
                }

                // Create the comment
                const newComment = await database.createComment(user.id, articleUrl, text, tag);

                res.status(201).json({
                    success: true,
                    comment: {
                        id: newComment.id,
                        text: newComment.content,
                        tag: newComment.tag,
                        user: { uid: userId, name: userName || user.name },
                        createdAt: { seconds: Math.floor(new Date(newComment.created_at).getTime() / 1000) },
                        articleId: articleId
                    }
                });

            } catch (dbError) {
                console.error('Database error in simple comment:', dbError);
                res.status(500).json({
                    error: 'Database error',
                    message: 'Failed to create comment in database'
                });
            }

        } catch (error) {
            console.error('Create simple comment error:', error);
            res.status(500).json({
                error: 'Failed to create comment',
                message: error.message
            });
        }
    }

    /**
     * Delete a comment (user can only delete their own comments)
     */
    async deleteComment(req, res) {
        try {
            const { commentId } = req.params;
            const userId = req.user.id;

            // Check if comment exists and belongs to user
            const result = await database.query(
                'DELETE FROM comments WHERE id = $1 AND user_id = $2 RETURNING id',
                [commentId, userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Comment not found',
                    message: 'Comment does not exist or you do not have permission to delete it'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Comment deleted successfully',
                deletedId: result.rows[0].id
            });

        } catch (error) {
            console.error('Delete comment error:', error);
            res.status(500).json({
                error: 'Failed to delete comment',
                message: error.message
            });
        }
    }
}

const commentsController = new CommentsController();

module.exports = commentsController;