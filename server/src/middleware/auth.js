const jwt = require('jsonwebtoken');
// Use PostgreSQL database
const database = require('../models/database');

// Token cache to reduce Google API calls
// Structure: Map<token, { userInfo, expiresAt }>
const tokenCache = new Map();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_CACHE_MAX_SIZE = 1000; // Maximum cached tokens

/**
 * Clean up expired tokens from cache
 */
function cleanupTokenCache() {
    const now = Date.now();
    for (const [token, data] of tokenCache.entries()) {
        if (data.expiresAt < now) {
            tokenCache.delete(token);
        }
    }
}

// Run cleanup every 5 minutes
setInterval(cleanupTokenCache, TOKEN_CACHE_TTL_MS);

/**
 * Verify Google OAuth token and extract user information
 * Uses caching to reduce API calls to Google
 * @param {string} token - Google OAuth token
 * @returns {object} User information from Google
 */
async function verifyGoogleToken(token) {
    // Check cache first
    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
        console.log('✅ [AUTH] Token found in cache');
        return cached.userInfo;
    }
    
    try {
        // In production, use Google's OAuth2 library to verify the token
        // For development, we'll use a simpler approach with Google's userinfo endpoint
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Invalid Google token');
        }

        const userInfo = await response.json();
        const result = {
            googleId: userInfo.id,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture
        };
        
        // Cache the result
        // Evict oldest entries if cache is full
        if (tokenCache.size >= TOKEN_CACHE_MAX_SIZE) {
            const oldestKey = tokenCache.keys().next().value;
            tokenCache.delete(oldestKey);
        }
        
        tokenCache.set(token, {
            userInfo: result,
            expiresAt: Date.now() + TOKEN_CACHE_TTL_MS
        });
        console.log('✅ [AUTH] Token verified and cached');
        
        return result;
    } catch (error) {
        console.error('Google token verification failed:', error);
        throw new Error('Failed to verify Google token');
    }
}

/**
 * Middleware to authenticate requests using Google OAuth token
 */
async function authenticateUser(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Authorization header missing'
            });
        }

        const token = authHeader.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Token missing from authorization header'
            });
        }

        // Verify Google token
        const googleUser = await verifyGoogleToken(token);
        
        // Find or create user in database
        let user = await database.findUserByGoogleId(googleUser.googleId);
        if (!user) {
            user = await database.createUser(
                googleUser.googleId,
                googleUser.email,
                googleUser.name
            );
            console.log(`Created new user: ${user.email}`);
        }

        // Attach user info to request
        req.user = {
            id: user.id,
            googleId: user.google_id,
            email: user.email,
            name: user.name
        };

        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({
            error: 'Authentication failed',
            message: error.message
        });
    }
}

/**
 * Middleware to authenticate requests with API key access
 * This middleware also retrieves and decrypts the user's API key
 */
async function authenticateWithApiKey(req, res, next) {
    console.log('🔐 [AUTH] Starting authentication with API key');

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('❌ [AUTH] Missing or invalid authorization header');
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Authorization header with Bearer token required'
            });
        }

        const token = authHeader.replace('Bearer ', '');
        
        // Verify Google token and get user info
        const googleUser = await verifyGoogleToken(token);
        console.log('✅ [AUTH] Google token verified for user:', googleUser.email);
        
        // Find user in database
        const user = await database.findUserByGoogleId(googleUser.googleId);
        if (!user) {
            console.log('❌ [AUTH] User not found in database');
            return res.status(401).json({
                error: 'User not found',
                message: 'Please register first'
            });
        }

        // Attach user info to request
        req.user = {
            id: user.id,
            googleId: user.google_id,
            email: user.email,
            name: user.name
        };

        // Verify token expiration (optional enhancement)
        await new Promise((resolve, reject) => {
            // Google token verification already done above
            resolve();
        });

        // Get user's encrypted API key
        const encryptedApiKey = await database.getUserApiKey(req.user.googleId);
        console.log('🔑 [AUTH] User API key status:', !!encryptedApiKey);
        
        if (!encryptedApiKey) {
            console.log('❌ [AUTH] No API key found for user');
            return res.status(400).json({
                error: 'API key required',
                message: 'Please configure your Gemini API key in the extension options'
            });
        }

        // Store encrypted API key for the controller to decrypt
        try {
            if (typeof encryptedApiKey === 'string') {
                req.encryptedApiKey = JSON.parse(encryptedApiKey);
            } else {
                req.encryptedApiKey = encryptedApiKey;
            }
            console.log('✅ [AUTH] API key loaded for controller');
        } catch (parseError) {
            console.error('❌ [AUTH] Error parsing encrypted API key:', parseError);
            return res.status(400).json({
                error: 'Invalid API key format',
                message: 'Please reconfigure your API key in the extension options'
            });
        }
        
        next();
    } catch (error) {
        console.error('❌ [AUTH] Authentication with API key error:', error);
        res.status(401).json({
            error: 'Authentication failed',
            message: error.message
        });
    }
}

/**
 * Middleware for optional authentication
 * Continues even if authentication fails
 */
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader) {
            await new Promise((resolve, reject) => {
                authenticateUser(req, res, (err) => {
                    if (err) {
                        console.log('Optional auth failed:', err.message);
                    }
                    resolve();
                });
            });
        }
        next();
    } catch (error) {
        // Continue without authentication
        console.log('Optional authentication skipped:', error.message);
        next();
    }
}

module.exports = {
    authenticateUser,
    authenticateWithApiKey,
    optionalAuth,
    verifyGoogleToken
};