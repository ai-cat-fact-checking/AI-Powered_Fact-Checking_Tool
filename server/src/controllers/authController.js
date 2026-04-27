// Use PostgreSQL database
const database = require('../models/database');
const encryptionService = require('../utils/encryption');

class AuthController {
    /**
     * Store encrypted Gemini API key for the authenticated user
     */
    async storeApiKey(req, res) {
        try {
            const { apiKey, userEncryptionKey } = req.body;

            if (!apiKey || !userEncryptionKey) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    message: 'API key and encryption key are required'
                });
            }

            // Validate API key format (basic validation)
            if (!apiKey.startsWith('AI') || apiKey.length < 20) {
                return res.status(400).json({
                    error: 'Invalid API key',
                    message: 'Please provide a valid Gemini API key'
                });
            }

            // Encrypt the API key using the user's encryption key
            const encryptedData = encryptionService.encrypt(apiKey, userEncryptionKey);

            // Store encrypted API key in database
            await database.updateUserApiKey(req.user.googleId, encryptedData);

            // Clear sensitive data from memory
            encryptionService.clearSensitiveData({ apiKey, userEncryptionKey });

            console.log(`API key stored for user: ${req.user.email}`);

            res.status(200).json({
                success: true,
                message: 'API key stored securely'
            });

        } catch (error) {
            console.error('Store API key error:', error);
            res.status(500).json({
                error: 'Failed to store API key',
                message: error.message
            });
        }
    }

    /**
     * Verify user authentication and return user information
     */
    async verifyUser(req, res) {
        try {
            // User information is already attached by auth middleware
            const user = req.user;

            // Check if user has an API key configured
            const hasApiKey = await database.getUserApiKey(user.googleId);

            res.status(200).json({
                success: true,
                user: {
                    id: user.id,
                    googleId: user.googleId,
                    email: user.email,
                    name: user.name,
                    hasApiKey: !!hasApiKey
                }
            });

        } catch (error) {
            console.error('Verify user error:', error);
            res.status(500).json({
                error: 'Failed to verify user',
                message: error.message
            });
        }
    }

    /**
     * Get user profile information
     */
    async getProfile(req, res) {
        try {
            const user = req.user;

            // Get user's comment count
            const userComments = await database.getUserComments(user.id, 1000);
            const commentCount = userComments.length;

            // Check API key status
            const hasApiKey = await database.getUserApiKey(user.googleId);

            res.status(200).json({
                success: true,
                profile: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    commentCount,
                    hasApiKey: !!hasApiKey,
                    joinedAt: user.created_at
                }
            });

        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                error: 'Failed to get user profile',
                message: error.message
            });
        }
    }

    /**
     * Store encrypted API key directly (without OAuth authentication)
     * User provides: encryptedApiKey, encryptionKey, userId
     */
    async storeEncryptedKey(req, res) {
        try {
            const { encryptedApiKey, encryptionKey, userId, userEmail, userName } = req.body;

            console.log('Store encrypted key request:', { 
                userId, 
                userEmail, 
                userName, 
                hasEncryptedApiKey: !!encryptedApiKey, 
                hasEncryptionKey: !!encryptionKey 
            });

            if (!encryptedApiKey || !encryptionKey || !userId) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    message: 'encryptedApiKey, encryptionKey, and userId are required',
                    received: { 
                        hasEncryptedApiKey: !!encryptedApiKey, 
                        hasEncryptionKey: !!encryptionKey, 
                        userId: userId 
                    }
                });
            }

            // Validate that the encrypted data can be decrypted (verify encryption key is correct)
            try {
                const decryptedApiKey = encryptionService.decrypt(encryptedApiKey, encryptionKey);
                
                // Basic validation of decrypted API key
                if (!decryptedApiKey.startsWith('AI') || decryptedApiKey.length < 20) {
                    throw new Error('Invalid API key format after decryption');
                }

                console.log('API key validation successful for user:', userId);
            } catch (decryptError) {
                return res.status(400).json({
                    error: 'Invalid encryption',
                    message: 'Failed to decrypt API key with provided encryption key'
                });
            }

            // Create or update user record
            const userData = {
                googleId: userId, // Use provided userId as googleId (fix property name)
                email: userEmail || `user${userId}@local.extension`,
                name: userName || `User ${userId}`,
                picture: null
            };

            // Ensure user exists in database
            await database.createOrUpdateUser(userData);

            // Store the encrypted API key with hash for verification
            const keyHash = require('crypto').createHash('sha256').update(encryptionKey).digest('hex');
            await database.updateUserApiKey(userId, JSON.stringify(encryptedApiKey), keyHash);

            console.log(`Encrypted API key stored for user: ${userId}`);

            res.status(200).json({
                success: true,
                message: 'Encrypted API key stored successfully',
                userId: userId
            });

        } catch (error) {
            console.error('Store encrypted key error:', error);
            res.status(500).json({
                error: 'Failed to store encrypted API key',
                message: error.message
            });
        }
    }

    /**
     * Verify user by userId and return basic info (without OAuth)
     */
    async verifyEncryptedUser(req, res) {
        try {
            const { userId } = req.body;

            if (!userId) {
                return res.status(400).json({
                    error: 'Missing userId',
                    message: 'userId is required'
                });
            }

            // Get user from database
            const user = await database.getUserByGoogleId(userId);
            
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    message: 'No user found with provided userId'
                });
            }

            // Check if user has API key
            const hasApiKey = await database.getUserApiKey(userId);

            res.status(200).json({
                success: true,
                user: {
                    id: user.id,
                    userId: userId,
                    email: user.email,
                    name: user.name,
                    hasApiKey: !!hasApiKey
                }
            });

        } catch (error) {
            console.error('Verify encrypted user error:', error);
            res.status(500).json({
                error: 'Failed to verify user',
                message: error.message
            });
        }
    }

    /**
     * Test endpoint for development
     */
    async testAuth(req, res) {
        if (process.env.NODE_ENV !== 'development') {
            return res.status(404).json({ error: 'Not found' });
        }

        try {
            // Test encryption/decryption
            const testKey = encryptionService.generateKey('test-seed');
            const testData = 'test-api-key-12345';
            
            const encrypted = encryptionService.encrypt(testData, testKey);
            const decrypted = encryptionService.decrypt(encrypted, testKey);

            res.status(200).json({
                success: true,
                test: {
                    original: testData,
                    encrypted: encrypted,
                    decrypted: decrypted,
                    match: testData === decrypted
                }
            });

        } catch (error) {
            console.error('Test auth error:', error);
            res.status(500).json({
                error: 'Test failed',
                message: error.message
            });
        }
    }
}

const authController = new AuthController();

module.exports = authController;