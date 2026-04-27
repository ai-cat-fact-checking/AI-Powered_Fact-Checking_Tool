#!/bin/bash

# PostgreSQL 資料庫檢視工具
echo "🗄️ PostgreSQL 資料庫檢視工具"
echo "=================================="

# 檢查 Docker 容器狀態
echo "📋 檢查容器狀態："
docker ps | grep postgres

echo ""
echo "🔍 連接到 PostgreSQL..."

# 進入 PostgreSQL 命令列
echo "💡 可用指令："
echo "  \\l          - 顯示所有資料庫"
echo "  \\c factcheck - 切換到 factcheck 資料庫" 
echo "  \\dt         - 顯示所有表格"
echo "  \\d users    - 顯示 users 表格結構"
echo "  SELECT * FROM users; - 查詢所有用戶"
echo "  SELECT * FROM analysis_results LIMIT 5; - 查詢分析結果"
echo "  SELECT * FROM comments; - 查詢評論"
echo "  \\q          - 退出"
echo ""

# 連接到資料庫
docker exec -it fact-check-postgres psql -U fact_check_user -d fact_check
