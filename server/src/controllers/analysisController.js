const crypto = require('crypto');
const database = require('../models/database');
const encryptionService = require('../utils/encryption');
const fs = require('fs');
const path = require('path');
const { cut } = require('@node-rs/jieba');
// Gemini AI client (Stage 1 & 2 reuse Stage 3 dependency style)
const { GoogleGenAI, Type } = require('@google/genai');

class AnalysisController {
    constructor() {
        // Load Chinese terms and verified domains
        this.loadResourceFiles();
    }

    loadResourceFiles() {
        try {
            const chineseTermsPath = path.join(__dirname, '../../config/chinese_terms.json');
            const verifiedDomainsPath = path.join(__dirname, '../../config/verified_domain.json');
            const promptPath = path.join(__dirname, '../../config/find_arguments_opinions_prompt.txt');

            console.log('Loading resource files from:', {
                chineseTermsPath,
                verifiedDomainsPath,
                promptPath
            });

            this.chineseTerms = new Set(JSON.parse(fs.readFileSync(chineseTermsPath, 'utf8')));
            this.verifiedDomains = JSON.parse(fs.readFileSync(verifiedDomainsPath, 'utf8'));

            if (fs.existsSync(promptPath)) {
                this.analysisPrompt = fs.readFileSync(promptPath, 'utf8');
            } else {
                this.analysisPrompt = this.getDefaultPrompt();
            }

            console.log('✅ [ANALYSIS] Resource files loaded:', {
                chineseTermsCount: this.chineseTerms.size,
                verifiedDomainsCount: this.verifiedDomains.length,
                hasPrompt: !!this.analysisPrompt
            });
        } catch (error) {
            console.error('❌ [ANALYSIS] Failed to load resource files:', error);
            // Fallback to basic values
            this.chineseTerms = new Set();
            this.verifiedDomains = ['edu.tw', 'gov.tw'];
            this.analysisPrompt = this.getDefaultPrompt();
        }
    }

    getDefaultPrompt() {
        return `請分析以下新聞內容，找出其中的論點、觀點，並檢測中國用詞。

請以JSON格式回傳結果，包含：
- arguments: 文中的主要論點陣列，每個論點為字符串
- opinions: 文中的觀點和立場陣列，每個觀點包含 opinion 和 related_arguments 字段
- summary: 內容摘要

格式範例：
{
  "arguments": ["論點1", "論點2"],
  "opinions": [
    {
      "opinion": "觀點內容",
      "related_arguments": ["相關論點1", "相關論點2"]
    }
  ],
  "summary": "內容摘要"
}

新聞內容：`;
    }

    /**
     * Extract domain from URL
     */
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (error) {
            console.error('Error parsing URL:', error);
            return null;
        }
    }

    /**
     * Check if domain is in the static verified list (quick check)
     */
    isInStaticVerifiedList(domain) {
        return this.verifiedDomains.some(verifiedDomain => {
            return domain === verifiedDomain || domain.endsWith('.' + verifiedDomain);
        });
    }

    /**
     * Check if domain is verified - now async with AI analysis
     * First checks database, then uses AI if not found
     */
    checkDomainVerification(url) {
        // Keep synchronous for backward compatibility
        // For full analysis, use verifyDomainWithAI
        try {
            const domain = this.extractDomain(url);
            if (!domain) return false;
            return this.isInStaticVerifiedList(domain);
        } catch (error) {
            console.error('Error parsing URL for domain verification:', error);
            return false;
        }
    }

    /**
     * Full domain verification with AI analysis (async)
     * Returns detailed domain information
     */
    async verifyDomainWithAI(url, apiKey) {
        const domain = this.extractDomain(url);
        if (!domain) {
            return {
                isAuthentic: false,
                domain: null,
                error: 'Invalid URL'
            };
        }

        console.log(`🔍 [DOMAIN] Verifying domain: ${domain}`);

        // Step 1: Check database cache first
        try {
            const cachedInfo = await database.getDomainInfo(domain);
            if (cachedInfo) {
                console.log(`✅ [DOMAIN] Found cached info for ${domain}`);
                return {
                    isAuthentic: cachedInfo.is_authentic,
                    domain: cachedInfo.domain,
                    organizationName: cachedInfo.organization_name,
                    organizationNameZh: cachedInfo.organization_name_zh,
                    description: cachedInfo.description,
                    descriptionZh: cachedInfo.description_zh,
                    category: cachedInfo.category,
                    country: cachedInfo.country,
                    politicalStance: cachedInfo.political_stance,
                    credibilityNotes: cachedInfo.credibility_notes,
                    aiConfidence: cachedInfo.ai_confidence,
                    cached: true
                };
            }
        } catch (dbError) {
            console.error('❌ [DOMAIN] Database error:', dbError);
            // Continue with AI analysis
        }

        // Step 2: Check static list for known trusted domains
        if (this.isInStaticVerifiedList(domain)) {
            const staticResult = {
                isAuthentic: true,
                domain,
                organizationName: domain.endsWith('.gov.tw') ? 'Taiwan Government' : 
                                  domain.endsWith('.edu.tw') ? 'Taiwan Educational Institution' : domain,
                organizationNameZh: domain.endsWith('.gov.tw') ? '台灣政府機關' : 
                                    domain.endsWith('.edu.tw') ? '台灣教育機構' : null,
                description: 'Verified official domain',
                descriptionZh: '已驗證的官方網域',
                category: domain.endsWith('.gov.tw') ? 'government' : 
                          domain.endsWith('.edu.tw') ? 'education' : 'official',
                country: 'Taiwan',
                politicalStance: 'N/A',
                credibilityNotes: 'Official domain from static verified list',
                aiConfidence: 1.0,
                cached: false
            };
            
            // Save to database for future queries
            try {
                await database.saveDomainInfo(staticResult);
            } catch (e) {
                console.warn('Failed to cache static domain info:', e);
            }
            
            return staticResult;
        }

        // Step 3: Use AI with Google Search to analyze the domain
        if (!apiKey) {
            console.warn('⚠️ [DOMAIN] No API key provided, skipping AI analysis');
            return {
                isAuthentic: null, // Unknown
                domain,
                error: 'No API key for AI analysis'
            };
        }

        try {
            const aiResult = await this.analyzeDomainWithGemini(domain, apiKey);
            
            // Save to database
            if (aiResult && !aiResult.error) {
                await database.saveDomainInfo({
                    domain,
                    isAuthentic: aiResult.isAuthentic,
                    organizationName: aiResult.organizationName,
                    organizationNameZh: aiResult.organizationNameZh,
                    description: aiResult.description,
                    descriptionZh: aiResult.descriptionZh,
                    category: aiResult.category,
                    country: aiResult.country,
                    politicalStance: aiResult.politicalStance,
                    credibilityNotes: aiResult.credibilityNotes,
                    aiConfidence: aiResult.confidence,
                    analysisSource: 'gemini'
                });
                console.log(`✅ [DOMAIN] Saved AI analysis for ${domain}`);
            }

            return {
                ...aiResult,
                domain,
                cached: false
            };
        } catch (aiError) {
            console.error('❌ [DOMAIN] AI analysis failed:', aiError);
            return {
                isAuthentic: null,
                domain,
                error: aiError.message
            };
        }
    }

    /**
     * Use Gemini with Google Search to analyze domain authenticity and background
     */
    async analyzeDomainWithGemini(domain, apiKey) {
        console.log(`🤖 [DOMAIN] Analyzing domain with Gemini: ${domain}`);

        const ai = new GoogleGenAI({ apiKey });

        // Check if this might be a Taiwan media domain
        const isTaiwanDomain = domain.endsWith('.tw') || 
            domain.includes('setn') || domain.includes('ettoday') ||
            domain.includes('tvbs') || domain.includes('chinatimes') ||
            domain.includes('ltn') || domain.includes('udn') ||
            domain.includes('cna') || domain.includes('storm') ||
            domain.includes('newtalk') || domain.includes('nextapple') ||
            domain.includes('ctitv') || domain.includes('ftv') ||
            domain.includes('mnews') || domain.includes('pts');

        const taiwanMediaNote = isTaiwanDomain ? `
重要：這可能是台灣媒體網站。請特別搜尋以下資訊：
- 在維基百科（Wikipedia）搜尋該媒體的條目，查看其「政治立場」或「編輯立場」章節
- 搜尋該媒體的所有權結構（屬於哪個集團？例如：旺旺中時媒體集團、三立電視、民視、TVBS等）
- 搜尋該媒體是否有被 NCC 或新聞自律委員會裁罰的紀錄
- 參考媒體觀察基金會或其他公正來源對該媒體的評價

台灣主要媒體的政治傾向參考：
- 偏泛藍/親中：中國時報、中天新聞、TVBS、聯合報
- 偏泛綠/本土：自由時報、三立新聞、民視
- 較中立：公視、中央社、鏡週刊
請根據搜尋結果客觀描述，而非僅依賴上述參考。
` : '';

        const prompt = `請分析以下網域的真實性和背景資訊。使用網路搜尋來確認這個網域是否真實存在，以及它所屬的組織。

網域: ${domain}
${taiwanMediaNote}
請回答以下問題：
1. 這個網域是真實的組織網站還是可能的釣魚/假冒網站？
2. 這個網域屬於哪個組織？（請提供中英文名稱）
3. 這個組織的背景是什麼？（請提供中英文描述，盡量中立客觀）
4. 這是什麼類型的網站？（news_mainstream/news_local/news_international/official_gov/official_org/educational/commercial/social_media/content_farm/personal_blog/suspicious/phishing/other）
5. 這個組織來自哪個國家/地區？
6. 如果是媒體，它的政治立場傾向是什麼？（請客觀描述，例如：偏泛藍/偏泛綠/中立/親中/親美/獨立等，並說明依據來源。若不是媒體則填 N/A）
7. 關於這個網域的可信度，有什麼需要注意的事項？

請以 JSON 格式回應（只回傳 JSON，不要其他文字）：
{
    "isAuthentic": true/false,
    "organizationName": "英文名稱",
    "organizationNameZh": "中文名稱",
    "description": "English description of the organization and background",
    "descriptionZh": "組織和背景的中文描述",
    "category": "news_mainstream/news_local/official_gov/etc",
    "country": "國家/地區",
    "politicalStance": "政治立場描述（含依據）或 N/A",
    "credibilityNotes": "可信度注意事項",
    "confidence": 0.0-1.0
}`;

        try {
            // Note: When using Google Search tool, we cannot use responseMimeType: 'application/json'
            // So we ask for JSON in the prompt and parse it manually
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }]
                }
            });

            const text = response.text;
            if (!text) {
                throw new Error('Empty response from Gemini');
            }

            // Parse the JSON response
            let result;
            try {
                // Clean up the response if needed
                let cleanText = text.trim();
                if (cleanText.startsWith('```json')) {
                    cleanText = cleanText.slice(7);
                }
                if (cleanText.startsWith('```')) {
                    cleanText = cleanText.slice(3);
                }
                if (cleanText.endsWith('```')) {
                    cleanText = cleanText.slice(0, -3);
                }
                cleanText = cleanText.trim();

                const jsonStart = cleanText.indexOf('{');
                const jsonEnd = cleanText.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1) {
                    cleanText = cleanText.substring(jsonStart, jsonEnd + 1);
                }

                result = JSON.parse(cleanText);
            } catch (parseError) {
                console.error('❌ [DOMAIN] Failed to parse Gemini response:', parseError);
                console.error('Raw response:', text);
                throw new Error('Failed to parse AI response');
            }

            console.log(`✅ [DOMAIN] AI analysis complete for ${domain}:`, {
                isAuthentic: result.isAuthentic,
                organization: result.organizationName,
                confidence: result.confidence
            });

            return result;
        } catch (error) {
            console.error('❌ [DOMAIN] Gemini API error:', error);
            throw error;
        }
    }

    /**
     * Find Chinese terms in content using the loaded terms list
     */
    findChineseTerms(content) {
        console.log('🔍 [ANALYSIS] Starting Chinese terms detection with node-jieba...');
        const foundTerms = new Set();

        const words = cut(content);

        words.forEach(word => {
            if (this.chineseTerms.has(word)) {
                foundTerms.add(word);
            }
        });

        // Check for simplified Chinese characters (basic implementation)
        const simplifiedTerms = this.detectSimplifiedChars(content);
        simplifiedTerms.forEach(term => foundTerms.add(term));

        const uniqueTerms = [...foundTerms];
        console.log('✅ [ANALYSIS] Chinese terms found:', uniqueTerms.length);
        return uniqueTerms;
    }

    /**
     * Detect simplified Chinese characters
     */
    detectSimplifiedChars(content) {
        const simplifiedTerms = new Set();
        const escapeWords = ['台', '布', '吃', '群', '霉', '里', '托'];

        // This is a simplified version - in production, you'd use OpenCC or similar
        const simplifiedPairs = {
            '国': '國', '经': '經', '发': '發', '时': '時',
            '实': '實', '体': '體', '说': '說', '对': '對',
            '这': '這', '个': '個', '关': '關', '问': '問'
        };

        const words = cut(content);
        words.forEach(word => {
            for (const [simplified, traditional] of Object.entries(simplifiedPairs)) {
                if (word.includes(simplified) && !escapeWords.includes(word)) {
                    simplifiedTerms.add(word);
                    break;
                }
            }
        });

        return [...simplifiedTerms];
    }

    /**
     * Call Gemini API with structured schema using @google/genai
     * Includes retry logic for transient errors
     */
    async callGeminiAPI(apiKey, prompt, content, retryCount = 0) {
        const MAX_RETRIES = 2;
        
        try {
            console.log(`🤖 [GEMINI] Calling Gemini API with structured schema...${retryCount > 0 ? ` (retry ${retryCount}/${MAX_RETRIES})` : ''}`);

            const fullPrompt = `${prompt}\n\n${content}`;

            const ai = new GoogleGenAI({
                apiKey: apiKey,
            });

            const model = 'gemini-2.5-flash-lite';
            const config = {
                responseMimeType: 'application/json',
                maxOutputTokens: 16384,
                responseSchema: {
                    type: Type.OBJECT,
                    required: ["arguments", "opinions", "summary"],
                    properties: {
                        arguments: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "List of sentences of arguments."
                        },
                        opinions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                required: ["opinion", "related_arguments"],
                                properties: {
                                    opinion: {
                                        type: Type.STRING,
                                        description: "The journalist/media opinion sentence."
                                    },
                                    related_arguments: {
                                        type: Type.ARRAY,
                                        items: { type: Type.STRING },
                                        description: "List of argument sentences related to this opinion. Empty list if none."
                                    }
                                }
                            },
                            description: "List of opinion objects, each containing the opinion sentence and related argument."
                        },
                        summary: {
                            type: Type.STRING,
                            description: "Summary of the content"
                        }
                    }
                }
            };

            const contents = [
                {
                    role: 'user',
                    parts: [
                        {
                            text: fullPrompt,
                        },
                    ],
                },
            ];

            console.log('🤖 [GEMINI] Generating content with structured output...');

            const response = await ai.models.generateContentStream({
                model,
                config,
                contents,
            });

            let fullResponse = '';
            for await (const chunk of response) {
                if (chunk.text) {
                    fullResponse += chunk.text;
                }
            }

            if (!fullResponse) {
                console.error('❌ [GEMINI] No text in API response');
                throw new Error('No content in Gemini API response');
            }

            console.log('✅ [GEMINI] API call successful, response length:', fullResponse.length);

            // Sanitize and parse the JSON response
            let parsedResult;
            try {
                // Try to sanitize common JSON issues from Gemini responses
                let sanitizedResponse = fullResponse.trim();
                
                // Remove potential markdown code blocks
                if (sanitizedResponse.startsWith('```json')) {
                    sanitizedResponse = sanitizedResponse.slice(7);
                }
                if (sanitizedResponse.startsWith('```')) {
                    sanitizedResponse = sanitizedResponse.slice(3);
                }
                if (sanitizedResponse.endsWith('```')) {
                    sanitizedResponse = sanitizedResponse.slice(0, -3);
                }
                sanitizedResponse = sanitizedResponse.trim();
                
                // Try to find valid JSON boundaries
                const jsonStart = sanitizedResponse.indexOf('{');
                const jsonEnd = sanitizedResponse.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                    sanitizedResponse = sanitizedResponse.substring(jsonStart, jsonEnd + 1);
                }
                
                parsedResult = JSON.parse(sanitizedResponse);
            } catch (parseError) {
                console.error('❌ [GEMINI] JSON parse failed:', parseError.message);
                console.error('❌ [GEMINI] Raw response (first 500 chars):', fullResponse.substring(0, 500));
                
                // Retry on JSON parse errors (likely truncation)
                if (retryCount < MAX_RETRIES) {
                    console.log(`🔄 [GEMINI] Retrying due to JSON parse error...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                    return this.callGeminiAPI(apiKey, prompt, content, retryCount + 1);
                }
                
                throw new Error('JSON_PARSE_ERROR: ' + parseError.message);
            }

            console.log('🔍 [GEMINI] Parsed result structure:', {
                hasArguments: Array.isArray(parsedResult.arguments),
                argumentsCount: parsedResult.arguments?.length || 0,
                hasOpinions: Array.isArray(parsedResult.opinions),
                opinionsCount: parsedResult.opinions?.length || 0,
                hasSummary: !!parsedResult.summary
            });

            return fullResponse;

        } catch (error) {
            console.error('❌ [GEMINI] API call failed:', error);
            
            // Retry on transient errors
            const errorStr = error.message || String(error);
            const isRetryable = errorStr.includes('JSON_PARSE_ERROR') || 
                               errorStr.includes('ECONNRESET') ||
                               errorStr.includes('timeout') ||
                               errorStr.includes('503') ||
                               errorStr.includes('500');
            
            if (isRetryable && retryCount < MAX_RETRIES) {
                console.log(`🔄 [GEMINI] Retrying due to transient error...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return this.callGeminiAPI(apiKey, prompt, content, retryCount + 1);
            }
            
            // Parse and provide user-friendly error messages
            const errorMessage = this.parseGeminiError(error);
            throw new Error(errorMessage);
        }
    }

    /**
     * Parse Gemini API error and return error code for frontend handling
     */
    parseGeminiError(error) {
        const errorStr = error.message || String(error);
        
        // Check for JSON parse error (from our sanitization)
        if (errorStr.includes('JSON_PARSE_ERROR') || errorStr.includes('Unexpected token')) {
            return 'JSON_PARSE_ERROR';
        }
        
        // Check for API key invalid error
        if (errorStr.includes('API_KEY_INVALID') || errorStr.includes('API key not valid')) {
            return 'API_KEY_INVALID';
        }
        
        // Check for quota exceeded
        if (errorStr.includes('RESOURCE_EXHAUSTED') || errorStr.includes('quota')) {
            return 'RESOURCE_EXHAUSTED';
        }
        
        // Check for rate limiting
        if (errorStr.includes('RATE_LIMIT') || errorStr.includes('rate limit')) {
            return 'RATE_LIMIT';
        }
        
        // Check for permission denied
        if (errorStr.includes('PERMISSION_DENIED')) {
            return 'PERMISSION_DENIED';
        }
        
        // Check for invalid argument (general)
        if (errorStr.includes('INVALID_ARGUMENT')) {
            return 'INVALID_ARGUMENT';
        }
        
        // Check for network errors
        if (errorStr.includes('ENOTFOUND') || errorStr.includes('ETIMEDOUT') || errorStr.includes('network')) {
            return 'NETWORK_ERROR';
        }
        
        // Default error code
        console.log('⚠️ [GEMINI] Unhandled error type:', errorStr);
        return 'UNKNOWN_ERROR';
    }

    /**
     * Main analysis function - equivalent to Python's analyze()
     */
    async analyze(req, res) {
        const startTime = Date.now();
        console.log('🔍 [STAGE1] Starting analysis request');
        console.log('📨 [STAGE1] Request POST data:', {
            hasContent: !!req.body?.content,
            contentLength: req.body?.content?.length,
            hasUrl: !!req.body?.url,
            hasUserEncryptionKey: !!req.body?.userEncryptionKey,
            url: req.body?.url,
            requestBodyKeys: Object.keys(req.body || {}),
            userEmail: req.user?.email || 'Unknown',
            timestamp: new Date().toISOString()
        });

        let apiKey = null;
        let userEncryptionKey = null;

        try {
            const { content, url, userEncryptionKey: reqUserKey } = req.body;

            // Add content length validation to prevent high memory usage
            if (content && content.length > 500000) { // 500KB limit
                return res.status(413).json({
                    error: 'Payload Too Large',
                    message: 'Content exceeds the 500KB limit.'
                });
            }

            if (!content || !url || !reqUserKey) {
                const endTime = Date.now();
                const responseTime = endTime - startTime;

                const response = {
                    error: 'Missing required fields',
                    message: 'Content, URL, and encryption key are required'
                };
                console.log('📤 [STAGE1] Complete response body (400):', JSON.stringify(response, null, 2));
                console.log('📤 [STAGE1] Response (400):', {
                    ...response,
                    responseTime: `${responseTime}ms`,
                    timestamp: new Date().toISOString()
                });
                return res.status(400).json(response);
            }

            userEncryptionKey = reqUserKey;

            // Check for cached results (by URL only)
            const cached = await database.getCachedAnalysis(url, 'initial');
            if (cached) {
                const endTime = Date.now();
                const responseTime = endTime - startTime;

                const response = {
                    success: true,
                    analysis: cached.result_data,
                    cached: true,
                    timestamp: cached.created_at
                };

                console.log('📤 [STAGE1] Complete response body (cached):', JSON.stringify(response, null, 2));
                console.log('📤 [STAGE1] Response (200 - Cached):', {
                    success: response.success,
                    cached: response.cached,
                    hasAnalysis: !!response.analysis,
                    responseTime: `${responseTime}ms`,
                    timestamp: response.timestamp
                });
                return res.status(200).json(response);
            }

            // Get and decrypt API key
            const encryptedApiKey = req.encryptedApiKey;

            if (!encryptedApiKey) {
                const response = {
                    error: 'API key not found',
                    message: 'Please configure your Gemini API key in the extension options'
                };
                console.log('📨 [STAGE1] Response (400):', response);
                return res.status(400).json(response);
            }

            try {
                apiKey = await encryptionService.decrypt(encryptedApiKey, userEncryptionKey);
            } catch (decryptError) {
                console.error('❌ [STAGE1] API key decryption failed:', decryptError.message);
                const endTime = Date.now();
                const responseTime = endTime - startTime;

                const response = {
                    error: 'API key decryption failed',
                    message: 'Invalid encryption key or corrupted API key. Please reconfigure your API key in extension options.'
                };
                console.log('📤 [STAGE1] Complete response body (400):', JSON.stringify(response, null, 2));
                console.log('📤 [STAGE1] Response (400):', {
                    ...response,
                    responseTime: `${responseTime}ms`,
                    timestamp: new Date().toISOString()
                });
                return res.status(400).json(response);
            }

            // Check domain verification (quick static check first)
            const domainVerified = this.checkDomainVerification(url);

            // Run analysis tasks in parallel (like Python version)
            // Include AI domain verification if we have an API key
            const [argumentsOpinionsResult, chineseTermsResult, domainInfoResult] = await Promise.all([
                this.findArgumentsOpinions(apiKey, content),
                Promise.resolve(this.findChineseTerms(content)),
                this.verifyDomainWithAI(url, apiKey).catch(err => {
                    console.warn('⚠️ [STAGE1] Domain AI verification failed:', err.message);
                    return null;
                })
            ]);

            // Check for errors in arguments/opinions analysis
            if (argumentsOpinionsResult.error) {
                console.error('❌ [STAGE1] Arguments/opinions analysis failed:', argumentsOpinionsResult.error);
                const endTime = Date.now();
                const responseTime = endTime - startTime;

                // Determine error code
                let errorCode = 'ANALYSIS_FAILED';
                if (argumentsOpinionsResult.error.includes('API_KEY_INVALID') || 
                    argumentsOpinionsResult.error.includes('API key')) {
                    errorCode = 'API_KEY_INVALID';
                } else if (argumentsOpinionsResult.error.includes('RESOURCE_EXHAUSTED') || 
                           argumentsOpinionsResult.error.includes('quota')) {
                    errorCode = 'RESOURCE_EXHAUSTED';
                } else if (argumentsOpinionsResult.error.includes('RATE_LIMIT')) {
                    errorCode = 'RATE_LIMIT';
                } else if (argumentsOpinionsResult.error.includes('NETWORK')) {
                    errorCode = 'NETWORK_ERROR';
                }

                const response = {
                    error: errorCode,
                    message: 'Analysis service encountered an error. Please try again later.'
                };
                console.log('📤 [STAGE1] Complete response body (500):', JSON.stringify(response, null, 2));
                console.log('📤 [STAGE1] Response (500):', {
                    ...response,
                    errorDetails: argumentsOpinionsResult.error,
                    responseTime: `${responseTime}ms`,
                    timestamp: new Date().toISOString()
                });
                return res.status(500).json(response);
            }

            // Construct final result
            const analysis = {
                arguments: argumentsOpinionsResult.arguments || [],
                opinions: argumentsOpinionsResult.opinions || [],
                chinese_terms: chineseTermsResult,
                verified_domain: domainInfoResult?.isAuthentic ?? domainVerified,
                domain_info: domainInfoResult ? {
                    isAuthentic: domainInfoResult.isAuthentic,
                    organizationName: domainInfoResult.organizationName,
                    organizationNameZh: domainInfoResult.organizationNameZh,
                    description: domainInfoResult.description,
                    descriptionZh: domainInfoResult.descriptionZh,
                    category: domainInfoResult.category,
                    country: domainInfoResult.country,
                    politicalStance: domainInfoResult.politicalStance,
                    credibilityNotes: domainInfoResult.credibilityNotes,
                    aiConfidence: domainInfoResult.aiConfidence || domainInfoResult.confidence,
                    cached: domainInfoResult.cached
                } : null,
                summary: argumentsOpinionsResult.summary || '',
                analysisType: 'initial',
                timestamp: new Date().toISOString(),
                url: url
            };

            // Cache the results
            await database.saveCachedAnalysis(url, 'initial', analysis);

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            const response = {
                success: true,
                analysis,
                cached: false
            };

            console.log('📤 [STAGE1] Complete response body:', JSON.stringify(response, null, 2));
            console.log('📤 [STAGE1] Response (200):', {
                success: response.success,
                cached: response.cached,
                argumentsCount: analysis.arguments.length,
                opinionsCount: analysis.opinions.length,
                chineseTermsCount: analysis.chinese_terms.length,
                verifiedDomain: analysis.verified_domain,
                hasSummary: !!analysis.summary,
                analysisType: analysis.analysisType,
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString()
            });

            res.status(200).json(response);

        } catch (error) {
            console.error('❌ [STAGE1] Analysis failed with error:', error.message);
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            // Determine error code
            let errorCode = 'ANALYSIS_FAILED';
            if (error.message.includes('API_KEY_INVALID')) {
                errorCode = 'API_KEY_INVALID';
            } else if (error.message.includes('RESOURCE_EXHAUSTED')) {
                errorCode = 'RESOURCE_EXHAUSTED';
            } else if (error.message.includes('RATE_LIMIT')) {
                errorCode = 'RATE_LIMIT';
            } else if (error.message.includes('NETWORK')) {
                errorCode = 'NETWORK_ERROR';
            }

            const response = {
                error: errorCode,
                message: 'Analysis service encountered an error. Please try again later.'
            };
            console.log('📤 [STAGE1] Complete response body (500):', JSON.stringify(response, null, 2));
            console.log('📤 [STAGE1] Response (500):', {
                ...response,
                errorDetails: error.message,
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString()
            });
            res.status(500).json(response);
        } finally {
            // Clear sensitive data from memory
            if (apiKey) {
                encryptionService.clearSensitiveData({ apiKey });
            }
            if (userEncryptionKey) {
                encryptionService.clearSensitiveData({ userEncryptionKey });
            }
        }
    }

    /**
     * Find arguments and opinions using Gemini API - equivalent to Python's find_arguments_opinions()
     */
    async findArgumentsOpinions(apiKey, content, tryTimes = 1) {
        console.log(`🔍 [GEMINI] findArgumentsOpinions called, try_times: ${tryTimes}`);
        const startTime = Date.now();

        try {
            const result = await this.callGeminiAPI(apiKey, this.analysisPrompt, content);

            // Parse the JSON result
            let parsedResult;
            try {
                parsedResult = JSON.parse(result);
            } catch (parseError) {
                console.warn('⚠️ [GEMINI] JSON parsing failed, raw response:', result);

                // Retry up to 5 times like the Python version
                if (tryTimes < 5) {
                    console.log(`🔄 [GEMINI] Retrying analysis, attempt ${tryTimes + 1}/5`);
                    return this.findArgumentsOpinions(apiKey, content, tryTimes + 1);
                }

                return {
                    error: 'Gemini API returned an invalid JSON response',
                    raw: result
                };
            }

            console.log(`✅ [GEMINI] Arguments and opinions found in ${Date.now() - startTime}ms`);
            return parsedResult;

        } catch (error) {
            return {
                error: `Gemini API request failed: ${error.message}`
            };
        }
    }

    /**
     * Re-analysis with user feedback - equivalent to Python's re_analyze()
     * Stage 2: Enhanced analysis with tagging and verification
     */
    async reAnalyze(req, res) {
        const startTime = Date.now();
        console.log('🔍 [STAGE2] Starting re-analysis request');
        console.log('📨 [STAGE2] Request data (sensitive info masked):', {
            hasData: !!req.body?.data,
            hasUserEncryptionKey: !!req.body?.userEncryptionKey,
            requestBodyKeys: Object.keys(req.body || {}),
            dataType: typeof req.body?.data,
            dataKeys: req.body?.data ? Object.keys(req.body.data) : 'N/A',
            userEmail: req.user?.email || 'Unknown',
            timestamp: new Date().toISOString()
        });

        let apiKey = null;
        let userEncryptionKey = null;

        try {
            const { data, userEncryptionKey: reqUserKey } = req.body;

            if (!data) {
                const endTime = Date.now();
                const responseTime = endTime - startTime;

                const response = {
                    error: 'Missing required fields',
                    message: 'Data is required for re-analysis'
                };
                console.log('📤 [STAGE2] Complete response body (400):', JSON.stringify(response, null, 2));
                console.log('📤 [STAGE2] Response (400):', {
                    ...response,
                    responseTime: `${responseTime}ms`,
                    timestamp: new Date().toISOString()
                });
                return res.status(400).json(response);
            }

            userEncryptionKey = reqUserKey;

            // Get URL for caching
            const articleUrl = data.url || req.body.url;
            
            if (!articleUrl) {
                const response = {
                    error: 'Missing URL',
                    message: 'URL is required for analysis'
                };
                console.log('📤 [STAGE2] Response (400):', response);
                return res.status(400).json(response);
            }

            // Check for cached results first (by URL only)
            const cached = await database.getCachedAnalysis(articleUrl, 'stage2');
            if (cached) {
                const endTime = Date.now();
                const responseTime = endTime - startTime;

                const response = {
                    success: true,
                    analysis: cached.result_data,
                    analysisType: 'reanalysis',
                    cached: true,
                    timestamp: cached.created_at
                };

                console.log('📤 [STAGE2] Complete response body (cached):', JSON.stringify(response, null, 2));
                console.log('📤 [STAGE2] Response (200 - Cached):', {
                    success: response.success,
                    cached: response.cached,
                    hasAnalysis: !!response.analysis,
                    responseTime: `${responseTime}ms`,
                    timestamp: response.timestamp
                });
                return res.status(200).json(response);
            }

            // Get API key - only use user's encrypted key
            const encryptedApiKey = req.encryptedApiKey;
            if (encryptedApiKey && userEncryptionKey) {
                try {
                    apiKey = await encryptionService.decrypt(encryptedApiKey, userEncryptionKey);
                } catch (decryptError) {
                    const response = {
                        error: 'API key decryption failed',
                        message: 'Invalid encryption key or corrupted API key. Please reconfigure your API key in extension options.'
                    };
                    console.log('📤 [STAGE2] Response (400):', response);
                    return res.status(400).json(response);
                }
            } else {
                const response = {
                    error: 'API key not available',
                    message: 'Please configure your Gemini API key in the extension options'
                };
                console.log('📤 [STAGE2] Response (400):', response);
                return res.status(400).json(response);
            }

            if (!apiKey) {
                const response = {
                    error: 'API key not available',
                    message: 'No valid API key found for re-analysis'
                };
                console.log('📤 [STAGE2] Response (400):', response);
                return res.status(400).json(response);
            }

            // Call the re-analysis function (equivalent to Python's add_tag)
            const result = await this.addTags(apiKey, data);

            if (result.error) {
                const response = {
                    error: 'Re-analysis failed',
                    message: result.error
                };
                console.log('📤 [STAGE2] Response (500):', response);
                return res.status(500).json(response);
            }

            // Save the result to database
            try {
                await database.saveCachedAnalysis(articleUrl, 'stage2', result);
                console.log('💾 [STAGE2] Analysis result saved to database');
            } catch (dbError) {
                console.error('⚠️ [STAGE2] Failed to save analysis result:', dbError);
                // Don't fail the request if saving fails
            }

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            const response = {
                success: true,
                analysis: result,
                analysisType: 'reanalysis',
                timestamp: new Date().toISOString()
            };

            console.log('📤 [STAGE2] Complete response body:', JSON.stringify(response, null, 2));
            console.log('📤 [STAGE2] Response (200):', {
                success: response.success,
                analysisType: response.analysisType,
                argumentsCount: result?.arguments?.length || 0,
                opinionsCount: result?.opinions?.length || 0,
                hasArgumentTags: result?.arguments?.some(arg => arg.tag) || false,
                hasOpinionCategories: result?.opinions?.some(op => op.category) || false,
                responseTime: `${responseTime}ms`,
                timestamp: response.timestamp
            });

            res.status(200).json(response);

        } catch (error) {
            console.error('❌ [STAGE2] Re-analysis failed:', error);
            const response = {
                error: 'Re-analysis failed',
                message: error.message
            };
            console.log('📤 [STAGE2] Response (500):', response);
            res.status(500).json(response);
        } finally {
            // Clear sensitive data from memory
            if (apiKey) {
                encryptionService.clearSensitiveData({ apiKey });
            }
            if (userEncryptionKey) {
                encryptionService.clearSensitiveData({ userEncryptionKey });
            }
        }
    }

    /**
     * Get cached analysis results
     */
    async getCached(req, res) {
        try {
            const { articleUrl } = req.params;

            if (!articleUrl) {
                return res.status(400).json({
                    error: 'Missing article URL'
                });
            }

            const decodedUrl = decodeURIComponent(articleUrl);
            const cached = await database.getCachedAnalysisByUrl(decodedUrl);

            if (!cached) {
                return res.status(404).json({
                    error: 'No cached analysis found'
                });
            }

            res.status(200).json({
                success: true,
                analysis: cached.result_data,
                cached: true,
                timestamp: cached.created_at
            });

        } catch (error) {
            console.error('Get cached analysis error:', error);
            res.status(500).json({
                error: 'Failed to get cached analysis',
                message: error.message
            });
        }
    }

    /**
     * Add tags function (for re-analysis) - equivalent to Python's add_tag()
     */
    /**
     * Add tags to arguments and opinions - equivalent to Python's add_tag()
     * Stage 2: Enhanced analysis with tagging and verification
     */
    async addTags(apiKey, data) {
        console.log('🏷️ [ANALYSIS] Stage 2 - Adding tags and verification');
        const startTime = Date.now();

        try {
            // First call: Get detailed analysis with search tools
            const stage1Response = await this.callGeminiWithSearch(apiKey, data);
            console.log('📊 [ANALYSIS] Stage 2.1 completed');

            // Second call: Format as structured JSON
            const stage2Response = await this.formatAnalysisAsJSON(apiKey, data, stage1Response);
            console.log('📊 [ANALYSIS] Stage 2.2 completed');

            const totalTime = Date.now() - startTime;
            console.log(`🏷️ [ANALYSIS] Stage 2 completed in ${totalTime}ms`);

            // Preserve original data fields that aren't modified by Stage 2
            return {
                ...stage2Response,
                domain: data.domain,
                verified_domain: data.verified_domain,
                domain_info: data.domain_info || null,
                chinese_terms: data.chinese_terms || [],
                summary: data.summary || '',
                url: data.url,
                stage2_completed: true,
                analysisType: 'reanalysis',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ [ANALYSIS] Stage 2 error:', error);
            throw new Error(`Stage 2 analysis failed: ${error.message}`);
        }
    }

    /**
     * Stage 2.1: Call Gemini with search tools for detailed analysis
     */
    async callGeminiWithSearch(apiKey, data) {
        const prompt1 = `請根據以下輸入數據，為論據和觀點添加適當的標籤，請以文字的方式輸出，不要寫在 code block 內，內文的部分請使用繁體中文台灣用字，需要有詳細的搜尋再給出結果：
1. 為每個論據添加標籤（正確/錯誤/無法驗證）(tag)；根據來源的可信度和內容判斷，或者你可以實際上網搜尋是否有相關可信的來源，須詳細引用那句你查到的原話還有詳細的來源名稱不要隨便斷定錯誤 (sources)；並在最後添加建議可在 google 上查詢的關鍵字 (keywords)
2. 為每個觀點添加各種標籤（疑美論/國防安全/公共衛生/經濟貿易/無論據佐證/有論據佐證） (只要有相關論據就算是有論據佐證，最少一定要有無論據佐證/有論據佐證其中一個)，根據內容主題分類 (tag)；實際查詢相關證據或論點判斷觀點是否正確，並提供論證敘述，或者你可以並呈兩方觀點 (verification)；在最後添加建議可在 google 上查詢的關鍵字 (keyword)
輸入數據：
${JSON.stringify(data, null, 2)}`;

        const ai = new GoogleGenAI({
            apiKey: apiKey,
        });

        const model = 'gemini-2.5-flash-lite';
        const config = {
            temperature: 1,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192
        };

        const contents = [
            {
                role: 'user',
                parts: [
                    {
                        text: prompt1,
                    },
                ],
            },
        ];

        // Use non-streaming for more stable responses
        const response = await ai.models.generateContent({
            model,
            config,
            contents,
        });

        const fullResponse = response.text || '';

        if (!fullResponse) {
            console.error('❌ [ANALYSIS] Invalid Stage 2.1 response: No text returned');
            throw new Error('Invalid Gemini API Stage 2.1 response structure');
        }

        return fullResponse;
    }

    /**
     * Stage 2.2: Format the analysis as structured JSON
     */
    async formatAnalysisAsJSON(apiKey, originalData, stage1Response) {
        // Define allowed tag values for opinions
        const opinionTags = ["疑美論", "國防安全", "公共衛生", "經濟貿易", "無論據佐證", "有論據佐證"];
        // Define allowed tag values for arguments
        const argumentTags = ["正確", "錯誤", "無法驗證"];
        
        const schema = {
            type: Type.OBJECT,
            required: ["arguments", "opinions"],
            properties: {
                arguments: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        required: ["argument", "sources", "tag"],
                        properties: {
                            argument: { type: Type.STRING },
                            sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                            tag: { 
                                type: Type.STRING,
                                enum: argumentTags,
                                description: "Tag must be one of: 正確, 錯誤, 無法驗證"
                            },
                            keyword: { type: Type.STRING }
                        }
                    }
                },
                opinions: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        required: ["opinion", "related_arguments", "tag", "verification", "keyword"],
                        properties: {
                            opinion: { type: Type.STRING },
                            related_arguments: { type: Type.ARRAY, items: { type: Type.STRING } },
                            tag: { 
                                type: Type.ARRAY, 
                                items: { 
                                    type: Type.STRING,
                                    enum: opinionTags
                                },
                                description: "Tags must be from: 疑美論, 國防安全, 公共衛生, 經濟貿易. Must include at least one of: 無論據佐證 or 有論據佐證"
                            },
                            verification: { type: Type.STRING },
                            keyword: { type: Type.STRING }
                        }
                    }
                }
            }
        };

        const ai = new GoogleGenAI({
            apiKey: apiKey,
        });

        const model = 'gemini-2.5-flash-lite';
        const config = {
            temperature: 0.3,
            topP: 0.9,
            maxOutputTokens: 16384,
            responseMimeType: 'application/json',
            responseSchema: schema
        };

        const combinedPrompt = `以下是第一階段的原始資料(JSON)與上一階段的文字分析，請依 schema 直接輸出 JSON（不要額外文字）：

[原始資料]
${JSON.stringify(originalData, null, 2)}

[上一階段分析]
${stage1Response}

請按照以下 JSON schema 格式返回結果，確保有把你剛剛講的來源放到 sources 中：
${JSON.stringify(schema, null, 2)}`;

        const contents = [
            {
                role: 'user',
                parts: [
                    {
                        text: combinedPrompt,
                    },
                ],
            },
        ];

        // Use non-streaming for JSON responses - more stable than streaming
        const response = await ai.models.generateContent({
            model,
            config,
            contents,
        });

        const fullResponse = response.text || '';

        if (!fullResponse) {
            throw new Error('Stage 2.2 empty response');
        }

        try {
            // Clean up the response - remove markdown code blocks if present
            let cleanResponse = fullResponse;
            // Remove markdown code blocks
            cleanResponse = cleanResponse.replace(/```json\n?|\n?```/g, '');
            // Find the first '{' and last '}' to extract just the JSON object
            const firstOpen = cleanResponse.indexOf('{');
            const lastClose = cleanResponse.lastIndexOf('}');
            if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
                cleanResponse = cleanResponse.substring(firstOpen, lastClose + 1);
            }

            return JSON.parse(cleanResponse);
        } catch (e) {
            console.error('Raw Stage 2.2 text (invalid JSON):', fullResponse.substring(0, 1000));
            throw new Error(`Failed to parse Stage 2.2 JSON response: ${e.message}`);
        }
    }
}

module.exports = new AnalysisController();
