# 🔍 真假 Meow 一下

A Taiwan-focused AI fact-checking tool. A Chrome extension scrapes the active page and sends content to a Node/Express backend that runs a multi-stage Gemini analysis pipeline; results (arguments, opinions, China-specific terms, source-credibility flags) are highlighted directly on the page.

> Self-hosting requires replacing the Google OAuth Client ID, the API domain, and (after publishing) the Chrome extension ID. See [Self-host checklist](#self-host-checklist) below.

---

## Architecture

```
┌─── Chrome Extension ─────┐    ┌──── Backend API ────┐    ┌─── Database ───┐
│  • Content Script       │    │  • Node.js/Express  │    │  • PostgreSQL  │
│  • Background SW        │ ←→ │  • Gemini AI API    │ ←→ │  • Cache       │
│  • Sidepanel / Popup    │    │  • JWT + AES-GCM    │    │  • Domain info │
│  • Options / OAuth      │    │  • Rate limit       │    │  • Comments    │
└──────────────────────────┘    └─────────────────────┘    └────────────────┘
```

The analysis pipeline has three stages, each cached in `analysis_cache` keyed by `(url, stage)`:

| Stage  | Endpoint                       | What it does                                                                                |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------- |
| 1      | `/api/analysis/analyze`        | Extract arguments / opinions / summary; jieba-based China-term match; verified-domain check |
| 2      | `/api/analysis/re-analyze`     | Label arguments as 正確 / 未認證 / 錯誤; tag opinions with 5 categories                     |
| 3      | `/api/analysis/stage3-analyze` | Deeper reasoning-based 疑美論 classification                                                |
| Domain | `/api/analysis/verify-domain`  | LLM-based source credibility assessment                                                     |

---

## Prerequisites

- Node.js 18+
- Docker (for the postgres container)
- Chrome
- A Google Cloud project (for OAuth)
- A Gemini API key

## Quick start

```bash
# 1. Backend env
cp server/.env.example server/.env
# Then edit server/.env:
# - JWT_SECRET     : openssl rand -base64 48
# - ENCRYPTION_KEY : openssl rand -base64 32
# - GOOGLE_CLIENT_ID

# 2. One-shot bring-up (deps check → docker → migrations → API)
./start-system.sh

# 3. Load the extension
# Chrome → chrome://extensions → enable Developer mode → Load unpacked → select extension/
# Open the options page, sign in with Google, paste your Gemini API key.
```

Health check: `curl http://localhost:4999/health`

## Development

```bash
# Backend
cd server
npm run dev          # nodemon
npm test             # full suite (api / auth / db / security)
npm run test:api     # individual suite
npm run db:migrate
npm run db:status

# Integration tests (API must be running)
./tools/test_stage1.sh
./tools/test_stage2.sh
./tools/view-database.sh

# Extension lint (run from repo root)
npm run lint
```

---

## Self-host checklist

The repo ships with placeholders. Replace them all before deploying:

| Location                                      | Replace with                                               |
| --------------------------------------------- | ---------------------------------------------------------- |
| `extension/manifest.json` `oauth2.client_id`  | Your Google OAuth Client ID                                |
| `extension/manifest.json` `host_permissions`  | Your API domain (defaults to `http://localhost:4999/*`)    |
| `extension/js/config.js` `DOMAINS.production` | Your production API URL                                    |
| `server/.env` `GOOGLE_CLIENT_ID`              | Same Client ID as above                                    |
| `server/.env` `ALLOWED_ORIGINS`               | `chrome-extension://<your-extension-id>`                   |
| `server/.env` `JWT_SECRET` / `ENCRYPTION_KEY` | Generate with `openssl rand -base64 …`                     |
| `server/tests/*` `YOUR_EXTENSION_ID`          | The ID shown in chrome://extensions after loading unpacked |

Also drop your own data into `server/config/` (see [Config files](#config-files) below) before running the full pipeline, otherwise stage 1 falls back to an empty term list and a default prompt.

After publishing on the Chrome Web Store you can paste Google's public key back into `manifest.json` `key`, so unpacked installs and the published version share the same extension ID (otherwise OAuth redirect URIs won't match).

---

## Config files

`server/config/` is gitignored — its contents depend on data sources you provide. The directory expects:

- `find_arguments_opinions_prompt.txt` — the stage 1 Gemini prompt. See `find_arguments_opinions_prompt.example.txt` for a starting point. The code falls back to a built-in default if missing.
- `chinese_terms.json` — JSON array of terms flagged as 中國用語. The reference dataset is [g0v/moedict-data-csld](https://github.com/g0v/moedict-data-csld); license / attribution requirements are your responsibility.
- `verified_domain.json` — JSON array of domain suffixes treated as verified (e.g. `gov.tw`, `edu.tw`).

---

## Detection categories

- **疑美論** — anti-US narratives
- **國防安全** — defense / military information
- **公共衛生** — health / medical / fake-expert claims
- **經濟貿易** — trade / market information
- **無論據佐證** — claims without supporting evidence
- **中國用語** — Simplified Chinese characters or PRC-specific phrasing

---

## Security notes

- The user's Gemini API key is encrypted client-side with a passphrase before being sent to the backend, then stored at rest with AES-256 + HMAC-SHA256 authenticated encryption (`server/src/utils/encryption.js`).
- Each analysis request decrypts the key on the fly; the plaintext is dropped before the response returns.
- Rate limiting is keyed by Authorization token (not IP), so users behind a shared CDN egress IP don't throttle each other.
- Each analysis stage has a sibling `/test-*` endpoint, gated behind `NODE_ENV !== 'production'`.

## License

Licensed under [Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](./LICENSE).

