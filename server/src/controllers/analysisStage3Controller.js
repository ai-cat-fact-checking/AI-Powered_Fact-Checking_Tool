const { GoogleGenAI, Type } = require('@google/genai');

class AnalysisStage3Controller {
    constructor() {
        this.systemPrompt = `你是一個專業的資訊操作檢測系統。請按照以下步驟分析台美關係相關文章：

**Step 1: 檢查台美關係**
- 檢查文章是否提及台美關係相關內容
- 如果沒有提及，直接標註為「非判斷對象」

**Step 2: 情緒傾向分析**
- 如果Step 1通過，檢查文章對台美關係的情緒傾向
- 如果非負面，標註為「非判斷對象」

**Step 3: 事實與觀點檢查**
- 資訊來源分析：是否來自中國媒體
- 事實檢查：是否有事實錯誤或不完整
- 邏輯謬誤檢測：滑坡謬誤、假兩難謬誤、偷換概念、不當類比
- 情緒化用詞檢測

**Step 4: 資訊操作判斷**
- 如果Step 3中有任何問題，判定為「資訊操作」

**Step 5: 疑美論分類**
如果是資訊操作，檢查是否符合以下模式：
- 棄子論：聲稱美國把台灣當棋子，最終會拋棄
- 衰弱論：聲稱美國實力衰弱，無法保護台灣
- 亂源論：聲稱美國是戰亂根源
- 假朋友：聲稱美國支持台灣無實質幫助，反而有害
- 共謀論：聲稱美國和台灣菁英共謀剝削人民
- 假民主：聲稱美國內部腐敗、假民主
- 反世界：聲稱美國霸權遭受反對
- 毀台論：聲稱美國把台灣變成戰場

請以JSON格式回傳結果，包含詳細的分析過程和推理。`;
    }

    /**
     * 主要分析函數，使用AI進行完整分析
     */
    async performStage3Analysis(apiKey, inputData) {
        console.log('🔍 [STAGE3-AI] Starting AI-powered Stage 3 analysis');
        
        try {
            const { content, url, title, arguments: args, opinions } = inputData;
            
            const ai = new GoogleGenAI({
                apiKey: apiKey,
            });

            const config = {
                thinkingConfig: {
                    thinkingBudget: 4096,
                },
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    required: ["classification", "analysis_steps", "tags", "reasoning"],
                    properties: {
                        classification: {
                            type: Type.STRING,
                            enum: ["可能為資訊操作", "應該為一般文章"], // "非判斷對象"
                            description: "分類結果"
                        },
                        analysis_steps: {
                            type: Type.OBJECT,
                            required: ["step1_taiwan_relation", "step2_sentiment"],
                            properties: {
                                step1_taiwan_relation: {
                                    type: Type.OBJECT,
                                    required: ["detected", "evidence"],
                                    properties: {
                                        detected: { type: Type.BOOLEAN },
                                        evidence: { 
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING },
                                            description: "提及台美關係的具體文字證據"
                                        }
                                    }
                                },
                                step2_sentiment: {
                                    type: Type.OBJECT,
                                    required: ["negative_detected", "evidence"],
                                    properties: {
                                        negative_detected: { type: Type.BOOLEAN },
                                        evidence: { 
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING },
                                            description: "負面語句的具體文字證據"
                                        }
                                    }
                                }
                            }
                        },
                        tags: { 
                            type: Type.ARRAY,
                            items: { 
                                type: Type.STRING,
                                enum: [
                                    "資訊操作",
                                    "來源:中國",
                                    "事實有誤", 
                                    "事實不完整",
                                    "謬誤:滑坡",
                                    "謬誤:假兩難", 
                                    "謬誤:偷換概念",
                                    "謬誤:不當類比",
                                    "情緒化",
                                    "棄子論",
                                    "衰弱論",
                                    "亂源論",
                                    "假朋友",
                                    "共謀論",
                                    "假民主",
                                    "反世界",
                                    "毀台論"
                                ]
                            }
                        },
                        reasoning: {
                            type: Type.STRING,
                            description: "簡要的分析理由，300字以內"
                        }
                    }
                },
                generationConfig: {
                    temperature: 0.1, // 低溫度確保一致性
                    topP: 0.8,
                    topK: 1,
                    maxOutputTokens: 8192
                }
            };

            const model = 'gemini-2.5-flash-lite';
            
            const analysisPrompt = `${this.systemPrompt}

請分析以下文章內容並進行疑美論分類：

**文章網址：** ${url || '未提供'}
**文章標題：** ${title || '無標題'}
**文章內容：**
${content}

**已識別的論點（Stage 1 結果）：**
${args && args.length > 0 ? JSON.stringify(args, null, 2) : '無'}

**已識別的觀點（Stage 2 結果）：**
${opinions && opinions.length > 0 ? JSON.stringify(opinions, null, 2) : '無'}

請按照步驟進行分析：
1. **Step 1**: 檢查文章是否提及台美關係，提供具體的文字證據
2. **Step 2**: 如果Step 1通過，分析負面情緒傾向，提供負面語句的具體證據
3. **Step 3**: 直接使用已傳入的論點和觀點進行分析，不需要重新提取
4. **Step 4**: 根據以上步驟判斷是否為資訊操作
5. **Step 5**: 如果是資訊操作，標註相關的疑美論分類標籤

要求：
- analysis_steps 中要包含各步驟的具體證據
- 提供簡潔的分析（reasoning 限制在 600 字以內）
- 根據內容選擇適當的標籤`;

            const contents = [
                {
                    role: 'user',
                    parts: [
                        {
                            text: analysisPrompt,
                        },
                    ],
                },
            ];

            console.log('🤖 [STAGE3-AI] Sending structured request to Gemini...');
            
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

            console.log('📝 [STAGE3-AI] Received structured response from AI');
            
            // 由於使用了 structured output，這裡直接解析 JSON
            const result = JSON.parse(fullResponse);
            
            // 添加元數據
            result.meta = {
                content_hash: this.generateContentHash(content),
                analysis_timestamp: new Date().toISOString(),
                model_version: 'gemini-2.5-flash-lite',
                analysis_type: 'ai-structured-output'
            };

            console.log('✅ [STAGE3-AI] Analysis completed successfully');
            return result;

        } catch (error) {
            console.error('❌ [STAGE3-AI] Structured analysis failed:', error);
            
            // 即使結構化輸出失敗，也要提供有意義的錯誤響應
            throw new Error(`Stage 3 AI analysis failed: ${error.message}. Please check API key and network connection.`);
        }
    }

    /**
     * 生成內容哈希
     */
    generateContentHash(content) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }

    /**
     * 使用AI進行批量測試
     */
    async runBatchTest(apiKey, testCases) {
        console.log('🧪 [STAGE3-AI] Running batch test with AI');
        
        const results = [];
        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            console.log(`📝 [TEST ${i + 1}/${testCases.length}] Analyzing: ${testCase.title}`);
            
            try {
                const result = await this.performStage3Analysis(apiKey, testCase.data);
                results.push({
                    title: testCase.title,
                    expected: testCase.expected,
                    actual: result.classification,
                    success: result.classification === testCase.expected,
                    full_result: result
                });
            } catch (error) {
                results.push({
                    title: testCase.title,
                    expected: testCase.expected,
                    actual: 'ERROR',
                    success: false,
                    error: error.message
                });
            }
            
            // 避免API頻率限制
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('📊 [BATCH-TEST] Results:', results);
        return results;
    }
}

module.exports = new AnalysisStage3Controller();
