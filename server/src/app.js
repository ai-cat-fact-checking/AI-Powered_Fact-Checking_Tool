const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const analysisRoutes = require('./routes/analysis');
const commentsRoutes = require('./routes/comments');

const app = express();
const PORT = process.env.PORT || 4999;

// Request ID middleware - adds unique ID to each request for tracking
app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    
    // Log request start with ID
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const userId = req.user?.userId || 'anonymous';
        const logLevel = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
        console.log(`[${logLevel}] [${req.requestId}] [${userId}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    
    next();
});

// Security middleware
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// CORS configuration for Chrome extension
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests from Chrome extensions and localhost
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
        const isExtension = origin && origin.startsWith('chrome-extension://');
        const isLocalhost = origin && origin.includes('localhost');

        if (!origin || isExtension || isLocalhost || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            console.warn('CORS rejected origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting - Use token-based identification instead of IP for authenticated users
// This prevents issues when multiple users share the same IP (e.g., through Cloudflare)
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
    message: {
        error: 'Too many requests, please try again later.',
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Use Authorization token for authenticated users, fallback to IP for anonymous.
    // Hash the FULL token (not a prefix) so collisions across users in the same OAuth
    // project don't share a bucket, and the bucket isn't trivially predictable.
    keyGenerator: (req) => {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const tokenHash = crypto
                .createHash('sha256')
                .update(token)
                .digest('hex')
                .substring(0, 32);
            return `user:${tokenHash}`;
        }
        return req.ip;
    },
    // Skip rate limiting for health checks
    skip: (req) => req.path === '/health',
});

app.use('/api', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/comments', commentsRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(`[ERROR] [${req.requestId}] ${err.name}: ${err.message}`);
    if (err.stack && process.env.NODE_ENV !== 'production') {
        console.error(err.stack);
    }
    
    // CORS error
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
            error: 'CORS policy violation',
            message: 'Origin not allowed'
        });
    }
    
    // Rate limit error
    if (err.status === 429) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            message: err.message
        });
    }
    
    // Validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation failed',
            details: err.details || err.message
        });
    }
    
    // Database errors
    if (err.code && err.code.startsWith('23')) { // PostgreSQL constraint errors
        return res.status(409).json({
            error: 'Database constraint violation',
            message: 'Operation conflicts with existing data'
        });
    }
    
    // Default server error
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Start server
const server = app.listen(PORT, async () => {
    console.log(`🚀 Fact-check API server running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    
    // Log database connection status
    try {
        const db = require('./models/database');
        await db.healthCheck();
        console.log(`✅ Database connected successfully`);
    } catch (err) {
        console.error(`❌ Database connection failed: ${err.message}`);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

module.exports = app;