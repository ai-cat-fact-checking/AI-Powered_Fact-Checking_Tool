#!/bin/bash

curl -X POST http://localhost:4999/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "content": "視頻最新网络热议中，“一个萝卜两头切”的说法引起广泛关注。网友们认为，这句话真实反映了当前社会现象。报告显示，相关讨论次数急剧上升。",
    "domain": "ncku.edu.tw"
}'
