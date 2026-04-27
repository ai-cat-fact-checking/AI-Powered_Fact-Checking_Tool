#!/bin/bash

# 快速查詢 PostgreSQL 資料
DB_CONTAINER="fact-check-postgres"
DB_USER="fact_check_user"
DB_NAME="fact_check"

echo "🔍 快速查詢 PostgreSQL 資料"
echo "============================"

# 函數：執行 SQL 查詢
query() {
    docker exec -it $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "$1"
}

# 檢查資料庫連接
echo "📊 資料庫連接測試："
query "SELECT version();"

echo ""
echo "📋 所有表格："
query "\\dt"

echo ""
echo "👥 用戶資料（最近 5 筆）："
query "SELECT id, google_id, email, name, created_at FROM users ORDER BY created_at DESC LIMIT 5;"

echo ""
echo "📊 分析結果統計："
query "SELECT 
    analysis_type,
    COUNT(*) as count,
    MIN(created_at) as first_analysis,
    MAX(created_at) as last_analysis
FROM analysis_results 
GROUP BY analysis_type;"

echo ""
echo "💬 評論統計："
query "SELECT 
    COUNT(*) as total_comments,
    COUNT(DISTINCT article_url) as unique_articles,
    MIN(created_at) as first_comment,
    MAX(created_at) as last_comment
FROM comments;"

echo ""
echo "🎯 最近的分析結果（最近 3 筆）："
query "SELECT 
    article_url,
    analysis_type,
    LENGTH(result_data::text) as data_size,
    created_at
FROM analysis_results 
ORDER BY created_at DESC 
LIMIT 3;"
