# Stage 3 前端展示建议

## 🎯 總體設計原則

### 1. **透明度優先**

- 顯示每個判斷步驟的具體過程
- 提供具體證據而非模糊分數
- 解釋AI的推理邏輯

### 2. **避免過度量化**

- 使用離散的置信度等級：`高`、`中`、`低`
- 用文字描述而非百分比
- 強調這是輔助判斷工具，非絕對結論

### 3. **教育性展示**

- 幫助用戶理解資訊操作的常見手法
- 提供媒體識讀的相關知識
- 鼓勵批判性思考

## 📱 前端UI建議

### 1. **分析流程視覺化**

```
台美關係檢測 ✅ → 情緒傾向分析 ⚠️ → 事實觀點檢查 ❌ → 最終分類 🚨
```

### 2. **階段性結果展示**

#### Stage 3.1 - 台美關係檢測

```text
✅ 檢測到台美關係內容
📋 發現關鍵詞：台美關係、美台軍售、美國對台政策
🔍 出現次數：5次
💡 推理：文章中提及台美關係相關詞彙5次，包含：台美關係、美台軍售、美國對台政策
```

#### Stage 3.2 - 情緒傾向分析

```text
⚠️ 檢測到負面情緒傾向
📋 負面詞彙：威脅、危險、背叛、拋棄
🔍 負面詞彙數量：8次
💡 推理：文章使用負面詞彙8次（威脅、危險、背叛、拋棄），顯示對台美關係的負面情緒傾向
```

#### Stage 3.3 - 事實觀點檢查

```
🔍 資訊來源分析
❌ 疑似中國媒體來源
📋 證據：檢測到"環球時報"相關標識

🔍 事實查核
❌ 發現潛在事實錯誤
📋 問題聲稱："美國從未真正支持台灣"
💡 說明：根據歷史記錄，美國多次提供台灣軍事援助

🔍 邏輯謬誤檢測
❌ 發現邏輯謬誤
📋 類型：滑坡謬誤
💡 證據："一旦美國撤軍，台灣必然被統一"
```

#### Stage 3.4 - 最終分類

```text
🚨 分類結果：疑似資訊操作
🏷️ 檢測標籤：來源:中國、事實有誤、謬誤:滑坡、棄子論
📊 風險等級：高風險：發現多項問題，強烈建議謹慎對待此資訊
💡 推理：檢測到來源可疑、事實錯誤、邏輯謬誤等問題。資訊來源可能帶有特定立場，內容存在事實性錯誤或不完整，推論過程存在邏輯缺陷，並且符合以下疑美論述模式：棄子論。這些特徵顯示文章可能具有資訊操作的意圖。
📋 建議：建議謹慎對待此資訊，避免直接轉發或引用；查證資訊來源的可信度和立場；針對文中聲稱進行事實查核
```

### 3. **互動式說明**

為每個標籤提供說明卡片：

```javascript
// 標籤說明範例
const tagExplanations = {
  棄子論: {
    title: '棄子論',
    description: '聲稱美國將台灣視為可拋棄的棋子',
    examples: ['美國把台灣當工具', '用完就丟'],
    background: '這是常見的資訊操作手法，意圖削弱民眾對台美關係的信心'
  },
  滑坡謬誤: {
    title: '滑坡謬誤',
    description: '過度誇大因果關係，認為一個事件必然導致極端後果',
    examples: ['A發生，必然導致B', '一定會造成...'],
    why_problematic: '忽略了中間的變數和可能性，是不當的推論方式'
  }
};
```

### 4. **用戶教育組件**

#### 媒體識讀小貼士

```
💡 如何判斷資訊可信度：
1. 查看資訊來源是否可信
2. 檢查是否有多方證實
3. 注意極端或情緒性用詞
4. 留意邏輯推論是否合理
```

#### 常見資訊操作手法

```
🎯 常見的疑美論述手法：
• 棄子論：聲稱美國會拋棄台灣
• 戰場論：誇大衝突風險，製造恐慌
• 實力論：貶低美國實力和承諾
```

## 🔧 技術實現建議

### 1. **確保分析一致性**

```javascript
// 使用內容哈希確保相同內容得到相同結果
const analysisCache = {
  generateKey: (content) => {
    return crypto.createHash('sha256').update(content).digest('hex');
  },

  store: (key, result) => {
    // 存儲分析結果
    localStorage.setItem(`analysis_${key}`, JSON.stringify(result));
  },

  retrieve: (key) => {
    // 檢索已有結果
    const cached = localStorage.getItem(`analysis_${key}`);
    return cached ? JSON.parse(cached) : null;
  }
};
```

### 2. **漸進式載入**

```javascript
// 分階段顯示結果，增加用戶參與感
const displayAnalysisProgressively = async (analysisData) => {
  // Step 1
  await showStep1Results(analysisData.step1_taiwan_us_relation);
  await delay(1000);

  // Step 2
  await showStep2Results(analysisData.step2_sentiment);
  await delay(1000);

  // Step 3
  await showStep3Results(analysisData.step3_fact_opinion);
  await delay(1000);

  // Final
  await showFinalClassification(analysisData.final_classification);
};
```

### 3. **結果置信度視覺化**

```css
/* 置信度顏色編碼 */
.confidence-high {
  border-left: 4px solid #e74c3c;
  background: #fdf2f2;
}

.confidence-medium {
  border-left: 4px solid #f39c12;
  background: #fef9f3;
}

.confidence-low {
  border-left: 4px solid #27ae60;
  background: #f2f8f4;
}
```

## 📊 輸出格式優化

### 建議的API響應格式：

```json
{
  "success": true,
  "stage3_analysis": {
    "classification": "資訊操作",
    "risk_level": "高風險",
    "confidence": "高",

    "analysis_steps": {
      "step1_taiwan_us_relation": {
        "passed": true,
        "evidence": ["台美關係", "美台軍售"],
        "match_count": 5,
        "reasoning": "文章中提及台美關係相關詞彙5次"
      },

      "step2_sentiment": {
        "passed": true,
        "negative_detected": true,
        "evidence": ["威脅", "危險", "背叛"],
        "reasoning": "文章使用負面詞彙描述台美關係"
      },

      "step3_fact_opinion": {
        "source_issues": [
          {
            "type": "來源:中國",
            "evidence": "檢測到環球時報相關標識",
            "confidence": "高"
          }
        ],
        "fact_issues": [
          {
            "type": "事實有誤",
            "claim": "美國從未真正支持台灣",
            "explanation": "根據歷史記錄，美國多次提供台灣軍事援助",
            "confidence": "高"
          }
        ],
        "logical_fallacies": [
          {
            "type": "謬誤:滑坡",
            "evidence": "一旦美國撤軍，台灣必然被統一",
            "explanation": "過度誇大因果關係",
            "confidence": "中"
          }
        ]
      }
    },

    "final_assessment": {
      "tags": ["資訊操作", "來源:中國", "事實有誤", "謬誤:滑坡", "棄子論"],
      "categories": ["棄子論"],
      "reasoning": "檢測到來源可疑、事實錯誤、邏輯謬誤等多項問題，符合資訊操作特徵",
      "recommendations": [
        "建議查證相關事實",
        "注意資訊來源可信度",
        "避免被情緒性用詞影響判斷"
      ]
    }
  },

  "meta": {
    "analysis_version": "3.0",
    "processed_at": "2025-09-16T10:30:00Z",
    "processing_time_ms": 2340
  }
}
```

## 🎨 UI/UX 最佳實踐

### 1. **色彩編碼系統**

- 🟢 綠色：正常/可信
- 🟡 黃色：需注意/中等風險
- 🔴 紅色：高風險/問題

### 2. **圖標使用**

- ✅ 通過檢查
- ⚠️ 需要注意
- ❌ 發現問題
- 🔍 詳細資訊
- 💡 說明建議

### 3. **漸進式揭露**

- 先顯示總結
- 點擊展開詳細分析
- 提供更多背景知識

這樣的設計既能保持透明度，又能避免過度量化的問題，同時具有教育價值，幫助用戶提升媒體識讀能力。
