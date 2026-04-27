#!/bin/bash

# 導出 PostgreSQL 資料到檔案
DB_CONTAINER="fact-check-postgres"
DB_USER="fact_check_user"
DB_NAME="fact_check"
EXPORT_DIR="./data-export"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "💾 導出 PostgreSQL 資料"
echo "======================"

# 建立導出目錄
mkdir -p $EXPORT_DIR

# 導出所有用戶資料
echo "📤 導出用戶資料..."
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
COPY (SELECT * FROM users) TO STDOUT WITH CSV HEADER
" > $EXPORT_DIR/users.csv

# 導出分析結果摘要（不包含大型 JSON 資料）
echo "📤 導出分析結果摘要..."
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
COPY (
    SELECT id, article_url, content_hash, analysis_type, created_at,
           LENGTH(result_data::text) as data_size
    FROM analysis_results 
    ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER
" > $EXPORT_DIR/analysis_results_summary.csv

# 導出完整分析結果（包含所有 JSON 資料）
echo "📤 導出完整分析結果..."
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
COPY (
    SELECT 
        id, 
        article_url, 
        content_hash, 
        analysis_type, 
        created_at,
        result_data::text as result_data_json
    FROM analysis_results 
    ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER
" > $EXPORT_DIR/analysis_results_full.csv

# 導出 Stage 1 分析結果（提取 arguments 和 opinions）
echo "📤 導出 Stage 1 詳細分析..."
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
COPY (
    SELECT 
        id,
        article_url,
        created_at,
        result_data->'summary' as summary,
        jsonb_array_length(COALESCE(result_data->'arguments', '[]'::jsonb)) as arguments_count,
        jsonb_array_length(COALESCE(result_data->'opinions', '[]'::jsonb)) as opinions_count,
        result_data->'arguments' as arguments_json,
        result_data->'opinions' as opinions_json
    FROM analysis_results 
    WHERE analysis_type = 'stage1'
    ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER
" > $EXPORT_DIR/stage1_analysis.csv

# 導出 Stage 2 分析結果（fact-check 結果）
echo "📤 導出 Stage 2 詳細分析..."
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
COPY (
    SELECT 
        id,
        article_url,
        created_at,
        result_data->'overallCredibility' as overall_credibility,
        result_data->'overallAnalysis' as overall_analysis,
        jsonb_array_length(COALESCE(result_data->'factCheckResults', '[]'::jsonb)) as fact_check_count,
        result_data->'factCheckResults' as fact_check_results_json
    FROM analysis_results 
    WHERE analysis_type = 'stage2'
    ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER
" > $EXPORT_DIR/stage2_analysis.csv

# 導出 Stage 3 分析結果（疑美論分類）
echo "📤 導出 Stage 3 詳細分析..."
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
COPY (
    SELECT 
        id,
        article_url,
        created_at,
        result_data->'classification' as classification,
        result_data->'confidence' as confidence,
        result_data->'reasoning' as reasoning,
        result_data->'detectedTerms' as detected_terms,
        result_data->'keyPhrases' as key_phrases
    FROM analysis_results 
    WHERE analysis_type = 'stage3'
    ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER
" > $EXPORT_DIR/stage3_analysis.csv

# 導出每則 argument 展開的詳細資料
echo "📤 導出 Arguments 詳細資料..."
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
COPY (
    SELECT 
        ar.id as analysis_id,
        ar.article_url,
        ar.created_at,
        (arg.value)::text as argument_text
    FROM analysis_results ar,
    LATERAL jsonb_array_elements(COALESCE(ar.result_data->'arguments', '[]'::jsonb)) AS arg(value)
    WHERE ar.analysis_type = 'stage1'
    ORDER BY ar.created_at DESC, ar.id
) TO STDOUT WITH CSV HEADER
" > $EXPORT_DIR/arguments_detailed.csv

# 導出每則 opinion 展開的詳細資料
echo "📤 導出 Opinions 詳細資料..."
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
COPY (
    SELECT 
        ar.id as analysis_id,
        ar.article_url,
        ar.created_at,
        (op.value->>'opinion')::text as opinion_text,
        (op.value->'related_arguments')::text as related_arguments
    FROM analysis_results ar,
    LATERAL jsonb_array_elements(COALESCE(ar.result_data->'opinions', '[]'::jsonb)) AS op(value)
    WHERE ar.analysis_type = 'stage1'
    ORDER BY ar.created_at DESC, ar.id
) TO STDOUT WITH CSV HEADER
" > $EXPORT_DIR/opinions_detailed.csv

# 導出 Fact Check 結果展開的詳細資料
echo "📤 導出 Fact Check 詳細資料..."
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
COPY (
    SELECT 
        ar.id as analysis_id,
        ar.article_url,
        ar.created_at,
        (fc.value->>'claim')::text as claim,
        (fc.value->>'verdict')::text as verdict,
        (fc.value->>'confidence')::text as confidence,
        (fc.value->>'explanation')::text as explanation,
        (fc.value->'sources')::text as sources
    FROM analysis_results ar,
    LATERAL jsonb_array_elements(COALESCE(ar.result_data->'factCheckResults', '[]'::jsonb)) AS fc(value)
    WHERE ar.analysis_type = 'stage2'
    ORDER BY ar.created_at DESC, ar.id
) TO STDOUT WITH CSV HEADER
" > $EXPORT_DIR/fact_checks_detailed.csv

# 導出評論資料
echo "📤 導出評論資料..."
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
COPY (SELECT * FROM comments ORDER BY created_at DESC) TO STDOUT WITH CSV HEADER
" > $EXPORT_DIR/comments.csv

# 導出網域驗證資料
echo "📤 導出網域驗證資料..."
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
COPY (
    SELECT 
        id,
        domain,
        is_authentic,
        organization_name,
        organization_name_zh,
        description,
        description_zh,
        category,
        country,
        political_stance,
        credibility_notes,
        ai_confidence,
        analysis_source,
        created_at,
        updated_at
    FROM domain_info 
    ORDER BY domain ASC
) TO STDOUT WITH CSV HEADER
" > $EXPORT_DIR/domain_info.csv 2>/dev/null || echo "⚠️ domain_info table not found (might need to run migration)"

# 統計資訊
echo "📊 計算統計資訊..."
STATS=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c "
SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM users),
    'total_analyses', (SELECT COUNT(*) FROM analysis_results),
    'stage1_count', (SELECT COUNT(*) FROM analysis_results WHERE analysis_type = 'stage1'),
    'stage2_count', (SELECT COUNT(*) FROM analysis_results WHERE analysis_type = 'stage2'),
    'stage3_count', (SELECT COUNT(*) FROM analysis_results WHERE analysis_type = 'stage3'),
    'total_comments', (SELECT COUNT(*) FROM comments),
    'total_domains', (SELECT COUNT(*) FROM domain_info),
    'authentic_domains', (SELECT COUNT(*) FROM domain_info WHERE is_authentic = true),
    'export_time', NOW()
);
")

echo "$STATS" > $EXPORT_DIR/stats.json

# 建立 HTML 報告
echo "📊 建立 HTML 報告..."
cat > $EXPORT_DIR/report.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Fact-Check Database Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .section { margin: 30px 0; }
        .highlight { background-color: #e7f3ff; padding: 10px; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>🔍 Fact-Check Database Report</h1>
    <div class="section highlight">
        <h2>📊 匯出統計</h2>
        <p>匯出時間: <span id="export-time"></span></p>
    </div>
    <div class="section">
        <h2>📁 摘要檔案</h2>
        <ul>
            <li><a href="users.csv">users.csv</a> - 用戶資料</li>
            <li><a href="analysis_results_summary.csv">analysis_results_summary.csv</a> - 分析結果摘要</li>
            <li><a href="comments.csv">comments.csv</a> - 評論資料</li>
        </ul>
    </div>
    <div class="section">
        <h2>📁 完整分析資料</h2>
        <ul>
            <li><a href="analysis_results_full.csv">analysis_results_full.csv</a> - 完整分析結果（含 JSON）</li>
            <li><a href="stage1_analysis.csv">stage1_analysis.csv</a> - Stage 1 分析（論點識別）</li>
            <li><a href="stage2_analysis.csv">stage2_analysis.csv</a> - Stage 2 分析（事實查核）</li>
            <li><a href="stage3_analysis.csv">stage3_analysis.csv</a> - Stage 3 分析（疑美論分類）</li>
            <li><a href="domain_info.csv">domain_info.csv</a> - 網域驗證資料（AI分析結果）</li>
        </ul>
    </div>
    <div class="section">
        <h2>📁 詳細展開資料</h2>
        <ul>
            <li><a href="arguments_detailed.csv">arguments_detailed.csv</a> - 每則論點詳細資料</li>
            <li><a href="opinions_detailed.csv">opinions_detailed.csv</a> - 每則觀點詳細資料</li>
            <li><a href="fact_checks_detailed.csv">fact_checks_detailed.csv</a> - 每則事實查核詳細資料</li>
        </ul>
    </div>
    <div class="section">
        <h2>🛠️ 資料庫工具</h2>
        <p>使用以下指令檢視資料庫：</p>
        <code>./view-database.sh</code> - 互動式查詢<br>
        <code>./query-database.sh</code> - 快速統計資訊
    </div>
</body>
</html>
EOF

echo "✅ 資料導出完成！"
echo "📂 檔案位置：$EXPORT_DIR/"
echo ""
echo "📊 匯出檔案清單："
ls -la $EXPORT_DIR/
echo ""
echo "📊 檢視報告：open $EXPORT_DIR/report.html"
