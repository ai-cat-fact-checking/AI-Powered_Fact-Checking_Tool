# Stage 3 AI 分析器使用說明

## 🎯 設計理念

這個新版本的Stage 3分析器完全依賴AI進行判斷，移除了所有硬編碼的關鍵詞映射，使用Google GenAI SDK和thinking mode提供更準確、更一致的分析結果。

## ✨ 主要特色

### 1. **結構化AI輸出**

- 使用Gemini 2.5 Flash Lite模型
- 啟用thinking mode，提供8192 token的思考預算
- **結構化輸出**確保AI必須返回有效的JSON格式
- 低溫度設定(0.1)確保結果一致性

### 2. **完全移除硬編碼規則**

- 不再使用預定義的關鍵詞列表
- AI自主判斷台美關係、情緒傾向、邏輯謬誤等
- 更靈活地處理語言變化和新興表達方式
- **移除備用分析**，確保AI分析成功

### 3. **結構化分析流程**

```text
Step 1: 台美關係檢測 → Step 2: 情緒傾向 → Step 3: 事實觀點分析
→ Step 4: 資訊操作判斷 → Step 5: 疑美論分類
```

### 4. **強健的錯誤處理**

- 結構化輸出確保JSON格式正確
- API失敗時直接拋出錯誤（不再降級）
- 詳細的錯誤信息和建議

## 📋 API 使用方式

### 正式端點

```javascript
POST /api/analysis/stage3-analyze
Authorization: Bearer <token>
Content-Type: application/json

{
  "data": {
    "content": "文章內容",
    "url": "文章網址",
    "arguments": ["論點1", "論點2"],
    "opinions": [
      {
        "opinion": "觀點內容",
        "related_arguments": ["相關論點"]
      }
    ]
  },
  "userEncryptionKey": "用戶加密密鑰"
}
```

### 測試端點

```javascript
POST /api/analysis/test-stage3-analyze
Content-Type: application/json

{
  "data": {
    "content": "文章內容",
    "url": "文章網址",
    "arguments": ["論點1", "論點2"],
    "opinions": [...]
  }
}
```

## 📊 響應格式

```json
{
  "success": true,
  "stage3_analysis": {
    "classification": "資訊操作/一般文章/非判斷對象",
    "analysis_steps": {
      "step1_taiwan_us_relation": {
        "detected": true,
        "evidence": ["台美關係", "美台軍售"],
        "reasoning": "詳細推理過程"
      },
      "step2_sentiment": {
        "negative_detected": true,
        "evidence": ["威脅", "危險"],
        "reasoning": "情緒分析說明"
      },
      "step3_fact_opinion": {
        "source_issues": [...],
        "fact_issues": [...],
        "logical_fallacies": [...],
        "emotional_language": {...}
      }
    },
    "final_assessment": {
      "is_information_operation": true,
      "detected_issues": ["來源可疑", "邏輯謬誤"],
      "tags": ["資訊操作", "來源:中國", "謬誤:滑坡"],
      "disinformation_categories": ["棄子論", "戰場論"],
      "reasoning": "綜合判斷說明",
      "risk_assessment": "風險評估描述",
      "recommendations": ["具體建議1", "具體建議2"]
    },
    "meta": {
      "content_hash": "abc123...",
      "analysis_timestamp": "2025-09-16T10:30:00Z",
      "model_version": "gemini-2.5-flash-lite",
      "analysis_type": "ai-powered"
    }
  }
}
```

## 🔧 技術優勢

### 1. **一致性保證**

- 使用內容哈希確保相同內容得到相同結果
- 低溫度設定減少隨機性
- Thinking mode提供更深度的分析

### 2. **可擴展性**

- 不需要維護關鍵詞庫
- AI自動適應新的語言模式
- 容易添加新的分析維度

### 3. **透明度**

- 每個判斷都有具體證據
- 詳細的推理過程
- 可追溯的分析步驟

## 🧪 測試和驗證

### 本地測試

```bash
# 基本功能測試（不需要API密鑰）
node test-stage3-ai-basic.js

# 完整AI測試（需要設置GEMINI_API_KEY_DEV）
node test-stage3-ai.js
```

### 批量測試

```javascript
const testCases = [
  {
    title: '測試名稱',
    data: { content: '...', url: '...', arguments: [...], opinions: [...] },
    expected: '預期結果'
  }
];

const results = await analysisStage3Controller.runBatchTest(apiKey, testCases);
```

## 🚀 部署建議

### 環境變數

```bash
GEMINI_API_KEY_DEV=your_development_api_key
NODE_ENV=development/production
```

### 性能優化

- 啟用響應緩存（基於內容哈希）
- 適當的API頻率限制
- 監控AI響應時間和準確率

## 🔍 監控和維護

### 關鍵指標

- AI分析成功率
- 響應時間
- 用戶反饋準確度
- API使用量

### 錯誤處理

- 記錄AI分析失敗案例
- 監控解析錯誤模式
- 定期優化系統提示詞

這個新的AI驅動設計讓分析更準確、更一致，同時大大減少了維護工作量。
