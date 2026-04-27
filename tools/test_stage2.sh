#!/bin/bash

curl -X POST http://localhost:4999/re-analyze \
  -H "Content-Type: application/json" \
  -d '{
    "arguments": [
        {
            "argument": "地球是圓的",
            "sources": ["NASA.gov", "ScienceDaily.com"]
        },
        {
            "argument": "5G會導致癌症",
            "sources": ["randomblog.com"]
        }
    ],
    "opinions": [
        {
            "opinion": "美國科技公司故意隱藏數據",
            "related_arguments": ["5G會導致癌症"]
        },
        {
            "opinion": "疫苗政策影響經濟發展",
            "related_arguments": []
        }
    ]
}'
