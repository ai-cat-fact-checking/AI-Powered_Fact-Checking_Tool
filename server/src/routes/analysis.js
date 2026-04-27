const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysisController');
const analysisStage3Controller = require('../controllers/analysisStage3Controller');
const { authenticateWithApiKey, optionalAuth } = require('../middleware/auth');
const database = require('../models/database');
const crypto = require('crypto');

// Main analysis endpoint - requires authentication and API key
router.post('/analyze', authenticateWithApiKey, (req, res) => analysisController.analyze(req, res));

// Test endpoint without authentication (only available in development)
router.post('/test-analyze', async (req, res) => {
    // Security check: only allow in development environment
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Test endpoint is not available in production'
        });
    }
    const startTime = Date.now();
    try {
        console.log('🧪 [TEST-STAGE1] Starting test Stage 1 analysis request');
        console.log('📨 [TEST-STAGE1] Request data:', {
            hasContent: !!req.body?.content,
            hasUrl: !!req.body?.url,
            content: req.body?.content,
            url: req.body?.url,
            requestBodyKeys: Object.keys(req.body || {}),
            timestamp: new Date().toISOString()
        });

        const { content, url } = req.body;

        if (!content || !url) {
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            const response = {
                error: 'Missing required fields',
                message: 'Content and URL are required'
            };
            console.log('📤 [TEST-STAGE1] Complete response body (400):', JSON.stringify(response, null, 2));
            console.log('📤 [TEST-STAGE1] Response (400):', {
                ...response,
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString()
            });
            return res.status(400).json(response);
        }

        console.log('🧪 [TEST] Starting test analysis with dev API key');

        // Use development API key from environment
        const devApiKey = process.env.GEMINI_API_KEY_DEV;

        if (!devApiKey) {
            console.log('⚠️ [TEST] No GEMINI_API_KEY_DEV found in environment, running partial analysis');

            // Run basic analysis without API key
            const chineseTerms = analysisController.findChineseTerms(content);
            const domainVerified = analysisController.checkDomainVerification(url);

            const analysis = {
                arguments: [],
                opinions: [],
                chinese_terms: chineseTerms,
                verified_domain: domainVerified,
                summary: 'API key not available - partial analysis only',
                analysisType: 'partial-test',
                timestamp: new Date().toISOString(),
                url: url
            };

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            const response = {
                success: true,
                analysis,
                cached: false,
                isTestMode: true
            };

            console.log('📤 [TEST-STAGE1] Complete response body (partial):', JSON.stringify(response, null, 2));
            console.log('📤 [TEST-STAGE1] Response (200 - Partial):', {
                success: response.success,
                cached: response.cached,
                isTestMode: response.isTestMode,
                argumentsCount: analysis.arguments?.length || 0,
                opinionsCount: analysis.opinions?.length || 0,
                chineseTermsCount: analysis.chinese_terms?.length || 0,
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString()
            });

            return res.status(200).json(response);
        }

        // Run full analysis with dev API key
        console.log('✅ [TEST] Dev API key found, running full analysis');

        const chineseTerms = analysisController.findChineseTerms(content);
        const domainVerified = analysisController.checkDomainVerification(url);

        // Run arguments/opinions analysis with dev API key
        const argumentsOpinionsResult = await analysisController.findArgumentsOpinions(devApiKey, content);

        if (argumentsOpinionsResult.error) {
            console.error('❌ [TEST] Gemini API error:', argumentsOpinionsResult.error);
            const analysis = {
                arguments: [],
                opinions: [],
                chinese_terms: chineseTerms,
                verified_domain: domainVerified,
                summary: `Gemini API error: ${argumentsOpinionsResult.error}`,
                analysisType: 'test-with-api-error',
                timestamp: new Date().toISOString(),
                url: url,
                apiError: argumentsOpinionsResult.error
            };

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            const response = {
                success: true,
                analysis,
                cached: false,
                isTestMode: true
            };

            console.log('📤 [TEST-STAGE1] Complete response body (error):', JSON.stringify(response, null, 2));
            console.log('📤 [TEST-STAGE1] Response (200 - API Error):', {
                success: response.success,
                cached: response.cached,
                isTestMode: response.isTestMode,
                hasApiError: !!analysis.apiError,
                analysisType: analysis.analysisType,
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString()
            });

            return res.status(200).json(response);
        }

        // Construct full analysis result
        const analysis = {
            arguments: argumentsOpinionsResult.arguments || [],
            opinions: argumentsOpinionsResult.opinions || [],
            chinese_terms: chineseTerms,
            verified_domain: domainVerified,
            summary: argumentsOpinionsResult.summary || '',
            analysisType: 'full-test',
            timestamp: new Date().toISOString(),
            url: url
        };

        console.log('🎉 [TEST] Full test analysis completed:', {
            argumentsCount: analysis.arguments.length,
            opinionsCount: analysis.opinions.length,
            chineseTermsCount: analysis.chinese_terms.length,
            verifiedDomain: analysis.verified_domain,
            hasSummary: !!analysis.summary
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        const response = {
            success: true,
            analysis,
            cached: false,
            isTestMode: true
        };

        console.log('📤 [TEST-STAGE1] Complete response body (full):', JSON.stringify(response, null, 2));
        console.log('📤 [TEST-STAGE1] Response (200 - Full):', {
            success: response.success,
            cached: response.cached,
            isTestMode: response.isTestMode,
            argumentsCount: analysis.arguments.length,
            opinionsCount: analysis.opinions.length,
            chineseTermsCount: analysis.chinese_terms.length,
            verifiedDomain: analysis.verified_domain,
            analysisType: analysis.analysisType,
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString()
        });

        res.status(200).json(response);

    } catch (error) {
        console.error('❌ [TEST] Test analysis failed:', error);
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        const response = {
            error: 'Test analysis failed',
            message: error.message
        };

        console.log('📤 [TEST-STAGE1] Complete response body (500):', JSON.stringify(response, null, 2));
        console.log('📤 [TEST-STAGE1] Response (500):', {
            ...response,
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString()
        });

        res.status(500).json(response);
    }
});

// Test Chinese terms detection only
router.post('/test-chinese-terms', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Test endpoint is not available in production'
        });
    }
    try {
        const { content } = req.body;
        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }

        const terms = analysisController.findChineseTerms(content);
        res.json({
            success: true,
            chineseTerms: terms,
            count: terms.length
        });
    } catch (error) {
        res.status(500).json({
            error: 'Chinese terms detection failed',
            message: error.message
        });
    }
});

// Test domain verification
router.post('/test-domain', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Test endpoint is not available in production'
        });
    }
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const verified = analysisController.checkDomainVerification(url);
        res.json({
            success: true,
            domainVerified: verified,
            url: url
        });
    } catch (error) {
        res.status(500).json({
            error: 'Domain verification failed',
            message: error.message
        });
    }
});

// Domain verification with AI analysis (test endpoint)
router.post('/test-domain-ai', async (req, res) => {
    // Security check: only allow in development environment
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Test endpoint is not available in production'
        });
    }

    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const devApiKey = process.env.GEMINI_API_KEY_DEV;
        if (!devApiKey) {
            return res.status(400).json({ 
                error: 'No API key',
                message: 'GEMINI_API_KEY_DEV not configured'
            });
        }

        console.log('🔍 [TEST-DOMAIN-AI] Starting AI domain verification for:', url);
        const result = await analysisController.verifyDomainWithAI(url, devApiKey);
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('❌ [TEST-DOMAIN-AI] Error:', error);
        res.status(500).json({
            error: 'Domain AI verification failed',
            message: error.message
        });
    }
});

// Domain verification with AI - authenticated endpoint
router.post('/verify-domain', authenticateWithApiKey, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        console.log('🔍 [VERIFY-DOMAIN] Starting domain verification for:', url);
        const apiKey = req.decryptedApiKey;
        const result = await analysisController.verifyDomainWithAI(url, apiKey);
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('❌ [VERIFY-DOMAIN] Error:', error);
        res.status(500).json({
            error: 'Domain verification failed',
            message: error.message
        });
    }
});

// Get all cached domain info
router.get('/domains', optionalAuth, async (req, res) => {
    try {
        console.log('📋 [DOMAINS] Fetching all domain info');
        const domains = await database.getAllDomainInfo();
        res.json({
            success: true,
            count: domains.length,
            domains: domains
        });
    } catch (error) {
        console.error('❌ [DOMAINS] Error:', error);
        res.status(500).json({
            error: 'Failed to fetch domain info',
            message: error.message
        });
    }
});

// Advanced re-analysis endpoint - requires authentication and API key  
router.post('/re-analyze', authenticateWithApiKey, (req, res) => analysisController.reAnalyze(req, res));

// Stage 3 analysis endpoint - requires authentication and API key
router.post('/stage3-analyze', authenticateWithApiKey, async (req, res) => {
    const startTime = Date.now();
    try {
        console.log('🔍 [STAGE3] Starting Stage 3 analysis request');
        console.log('📨 [STAGE3] Request data (sensitive info masked):', {
            hasData: !!req.body?.data,
            hasUserEncryptionKey: !!req.body?.userEncryptionKey,
            requestBodyKeys: Object.keys(req.body || {}),
            dataType: typeof req.body?.data,
            userEmail: req.user?.email || 'Unknown',
            timestamp: new Date().toISOString()
        });

        const { data, userEncryptionKey } = req.body;

        if (!data || !userEncryptionKey) {
            const response = {
                error: 'Missing required fields',
                message: 'Analysis data and encryption key are required for Stage 3 analysis'
            };
            console.log('📤 [STAGE3] Response (400):', response);
            return res.status(400).json(response);
        }

        // Get URL for caching
        const articleUrl = data.url || req.body.url;
        
        if (!articleUrl) {
            const response = {
                error: 'Missing URL',
                message: 'URL is required for Stage 3 analysis'
            };
            console.log('📤 [STAGE3] Response (400):', response);
            return res.status(400).json(response);
        }

        // Check for cached results first (by URL only)
        try {
            const cached = await database.getCachedAnalysis(articleUrl, 'stage3');
            if (cached) {
                const endTime = Date.now();
                const responseTime = endTime - startTime;

                const response = {
                    success: true,
                    ...cached.result_data,
                    cached: true,
                    timestamp: cached.created_at
                };

                console.log('📤 [STAGE3] Complete response body (cached):', JSON.stringify(response, null, 2));
                console.log('📤 [STAGE3] Response (200 - Cached):', {
                    success: response.success,
                    cached: response.cached,
                    classification: cached.result_data?.classification || 'Unknown',
                    responseTime: `${responseTime}ms`,
                    timestamp: response.timestamp
                });
                return res.status(200).json(response);
            }
        } catch (cacheError) {
            console.warn('⚠️ [STAGE3] Cache lookup failed:', cacheError.message);
            // Continue with analysis if cache lookup fails
        }

        let apiKey = null;

        try {
            // Only use user's encrypted API key - no fallback to dev key
            if (userEncryptionKey && req.encryptedApiKey) {
                try {
                    const encryptionService = require('../utils/encryption');
                    apiKey = await encryptionService.decrypt(req.encryptedApiKey, userEncryptionKey);
                } catch (decryptError) {
                    console.error('❌ [STAGE3] Failed to decrypt user API key:', decryptError.message);
                    const response = {
                        error: 'Failed to decrypt API key',
                        message: 'Invalid encryption key provided. Please reconfigure your API key in extension options.'
                    };
                    console.log('📤 [STAGE3] Response (400):', response);
                    return res.status(400).json(response);
                }
            } else {
                console.log('❌ [STAGE3] No user API key or encryption key provided');
                const response = {
                    error: 'API key required',
                    message: 'Please configure your Gemini API key in the extension options to use Stage 3 analysis.'
                };
                console.log('📤 [STAGE3] Response (400):', response);
                return res.status(400).json(response);
            }

            // Perform Stage 3 analysis with AI
            const result = await analysisStage3Controller.performStage3Analysis(apiKey, data);

            // Save the result to database
            try {
                await database.saveCachedAnalysis(articleUrl, 'stage3', result);
                console.log('💾 [STAGE3] Analysis result saved to database');
            } catch (dbError) {
                console.error('⚠️ [STAGE3] Failed to save analysis result:', dbError);
                // Don't fail the request if saving fails
            }

            // Return the same format as test-stage3-analyze endpoint
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            const response = {
                success: true,
                ...result,  // Spread the analysis result directly
                timestamp: new Date().toISOString()
            };

            console.log('📤 [STAGE3] Complete response body:', JSON.stringify(response, null, 2));
            console.log('📤 [STAGE3] Response (200):', {
                success: response.success,
                classification: result?.classification || 'Unknown',
                tagsCount: result?.tags?.length || 0,
                hasAnalysisSteps: !!result?.analysis_steps,
                hasReasoning: !!result?.reasoning,
                responseTime: `${responseTime}ms`,
                timestamp: response.timestamp
            });

            res.status(200).json(response);

        } catch (error) {
            console.error('❌ [STAGE3] Analysis failed:', error);
            const response = {
                error: 'Stage 3 analysis failed',
                message: error.message
            };
            console.log('📤 [STAGE3] Response (500):', response);
            res.status(500).json(response);
        } finally {
            // Clear sensitive data from memory
            if (apiKey) {
                // Clear API key (it's declared with let, so we can reassign)
                apiKey = null;
            }
            // userEncryptionKey is const from destructuring, can't reassign
            // It will be garbage collected when function ends
        }
    } catch (outerError) {
        // Outer catch for any uncaught errors
        console.error('❌ [STAGE3] Unexpected error:', outerError);
        const response = {
            error: 'Unexpected error in Stage 3 analysis',
            message: outerError.message
        };
        console.log('📤 [STAGE3] Response (500):', response);
        if (!res.headersSent) {
            res.status(500).json(response);
        }
    }
});

// Test Stage 3 analysis endpoint without authentication (temporary for debugging)
router.post('/test-stage3-analyze', async (req, res) => {
    const startTime = Date.now();
    try {
        console.log('🧪 [TEST-STAGE3] Starting test Stage 3 analysis request');
        console.log('📨 [TEST-STAGE3] Request data:', {
            hasData: !!req.body?.data,
            dataType: typeof req.body?.data,
            requestBodyKeys: Object.keys(req.body || {}),
            timestamp: new Date().toISOString()
        });

        const { data } = req.body;

        if (!data) {
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            const response = {
                error: 'Missing required fields',
                message: 'Data is required for Stage 3 analysis'
            };
            console.log('📤 [TEST-STAGE3] Complete response body (400):', JSON.stringify(response, null, 2));
            console.log('📤 [TEST-STAGE3] Response (400):', {
                ...response,
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString()
            });
            return res.status(400).json(response);
        }

        console.log('🧪 [TEST] Starting Stage 3 test analysis with dev API key');

        // Use development API key from environment
        const devApiKey = process.env.GEMINI_API_KEY_DEV;

        if (!devApiKey) {
            return res.status(400).json({
                error: 'Development API key not available',
                message: 'GEMINI_API_KEY_DEV not found in environment'
            });
        }

        // Run Stage 3 analysis with dev API key
        console.log('✅ [TEST] Dev API key found, running Stage 3 AI analysis');

        const result = await analysisStage3Controller.performStage3Analysis(devApiKey, data);

        console.log('🎉 [TEST-STAGE3] Stage 3 analysis completed');

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        const response = {
            success: true,
            ...result,
            isTestMode: true,
            timestamp: new Date().toISOString()
        };

        console.log('📤 [TEST-STAGE3] Complete response body:', JSON.stringify(response, null, 2));
        console.log('📤 [TEST-STAGE3] Response (200):', {
            success: response.success,
            classification: result?.classification || 'Unknown',
            tagsCount: result?.tags?.length || 0,
            hasAnalysisSteps: !!result?.analysis_steps,
            hasReasoning: !!result?.reasoning,
            isTestMode: response.isTestMode,
            responseTime: `${responseTime}ms`,
            timestamp: response.timestamp
        });

        res.status(200).json(response);

    } catch (error) {
        console.error('❌ [TEST-STAGE3] Stage 3 test analysis failed:', error);
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        const response = {
            error: 'Stage 3 test analysis failed',
            message: error.message
        };
        console.log('📤 [TEST-STAGE3] Complete response body (500):', JSON.stringify(response, null, 2));
        console.log('📤 [TEST-STAGE3] Response (500):', {
            ...response,
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString()
        });
        res.status(500).json(response);
    }
});

// Test re-analysis endpoint without authentication (temporary for debugging)
router.post('/test-re-analyze', async (req, res) => {
    try {
        const { data } = req.body;

        if (!data) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Data is required for Stage 2 analysis'
            });
        }

        console.log('🧪 [TEST] Starting Stage 2 test analysis with dev API key');

        // Use development API key from environment
        const devApiKey = process.env.GEMINI_API_KEY_DEV;

        if (!devApiKey) {
            return res.status(400).json({
                error: 'Development API key not available',
                message: 'GEMINI_API_KEY_DEV not found in environment'
            });
        }

        // Run Stage 2 analysis with dev API key
        console.log('✅ [TEST] Dev API key found, running Stage 2 analysis');

        const result = await analysisController.addTags(devApiKey, data);

        console.log('🎉 [TEST] Stage 2 analysis completed');

        res.status(200).json({
            success: true,
            ...result,
            isTestMode: true,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ [TEST] Stage 2 test analysis failed:', error);
        res.status(500).json({
            error: 'Stage 2 test analysis failed',
            message: error.message
        });
    }
});

// Get cached analysis results - optional auth for public access
router.get('/cached/:articleUrl', optionalAuth, (req, res) => analysisController.getCached(req, res));

module.exports = router;