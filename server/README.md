# Backend API

Express.js + PostgreSQL backend for the fact-checking tool. See the project root `README.md` for setup. This file is the API reference.

## Endpoints

Base URL: `http://localhost:4999/api` (or your deployed host).

Auth: Bearer token (Google OAuth access token). Endpoints marked `auth` require it; the server will look up the user's encrypted Gemini API key from the database.

### Analysis

| Method | Path                              | Auth | Notes                                                       |
| ------ | --------------------------------- | ---- | ----------------------------------------------------------- |
| POST   | `/analysis/analyze`               | yes  | Stage 1 — extract arguments / opinions, jieba check, domain check |
| POST   | `/analysis/re-analyze`            | yes  | Stage 2 — tag arguments and opinions                        |
| POST   | `/analysis/stage3-analyze`        | yes  | Stage 3 — deeper 疑美論 classification                       |
| POST   | `/analysis/verify-domain`         | yes  | LLM-based domain credibility check                          |
| GET    | `/analysis/domains`               | opt  | Cached domain info                                          |
| GET    | `/analysis/cached/:articleUrl`    | opt  | Return cached analysis if present                           |

Each stage above has a sibling `/test-*` endpoint that uses `process.env.GEMINI_API_KEY_DEV` and skips authentication. Test endpoints return 403 when `NODE_ENV=production`.

### Auth

| Method | Path                       | Notes                                       |
| ------ | -------------------------- | ------------------------------------------- |
| POST   | `/auth/store-api-key`      | Store the user's encrypted Gemini API key   |
| POST   | `/auth/verify-user`        | Verify Google token, return user record     |
| GET    | `/auth/profile`            | Return the authenticated user's profile     |

### Comments

| Method | Path                       | Auth | Notes                                |
| ------ | -------------------------- | ---- | ------------------------------------ |
| GET    | `/comments/:articleUrl`    | opt  | Comments for an article              |
| POST   | `/comments`                | yes  | Add a comment                        |

## Stage 1 request / response

```bash
POST /analysis/analyze
Authorization: Bearer <google-token>
Content-Type: application/json

{
  "content": "<article body>",
  "url": "https://example.com/article",
  "userEncryptionKey": "<client-side passphrase>"
}
```

```json
{
  "success": true,
  "analysis": {
    "arguments": [{ "argument": "...", "tag": "正確|錯誤|未認證", "keyword": "..." }],
    "opinions":  [{ "opinion":  "...", "related_arguments": [...], "tag": "...", "keyword": "..." }],
    "chinese_terms": ["..."],
    "verified_domain": true,
    "summary": "..."
  },
  "cached": false
}
```

## Stage 3 tags

- General: `資訊操作`, `來源:中國`, `事實有誤`, `事實不完整`, `情緒化`
- Logical fallacies: `謬誤:滑坡`, `謬誤:假兩難`, `謬誤:偷換概念`, `謬誤:不當類比`
- 疑美論 categories: `棄子論`, `衰弱論`, `亂源論`, `假朋友`, `共謀論`, `假民主`, `反世界`, `毀台論`

## Standard error format

```json
{
  "error": "Brief error category",
  "message": "Human-readable detail"
}
```

| Status | Meaning                  |
| ------ | ------------------------ |
| 400    | Bad request              |
| 401    | Unauthenticated          |
| 403    | Forbidden (e.g. test endpoint in production) |
| 429    | Rate limited             |
| 500    | Server error             |
