# Website Detection AI Agent

An AI-powered tool for automatically detecting IP infringements on websites. The system crawls Google search results based on configurable keywords and analyzes each found URL with Gemini 2.5 Flash for potential trademark or product piracy — fully automated via Make.com, Airtable, and a Node.js/React backend.

---

## System Architecture

```
┌──────────────────┐     HTTP      ┌──────────────────────────┐
│  React Frontend  │ ────────────► │  Node.js/Express Backend │
│  (search + results)              │  /api/search/*           │
└──────────────────┘               │  /api/extract            │
                                   └──────────┬───────────────┘
                                              │ Webhook
                                              ▼
                                   ┌──────────────────────────┐
                                   │       Make.com           │
                                   │  6 Scenarios             │
                                   └──────────┬───────────────┘
                                              │ Read/Write
                                              ▼
                                   ┌──────────────────────────┐
                                   │        Airtable          │
                                   │  Keywords / Sightings /  │
                                   │  AI Prompt Config        │
                                   └──────────────────────────┘
```

Full architecture and data flow documentation: [`docs/architecture.md`](docs/architecture.md)

---

## Prerequisites

- **Node.js** 18+
- **Make.com** account (free tier is sufficient for testing)
- **Airtable** account + base (Base ID: `appgyHtu4tSQxWCvz`)
- **SerpAPI** key (for URL Importer / AI Worker V1.2.1)
- **Google AI API key** (Gemini 2.5 Flash) — configured as a Make.com connection

---

## Setup Guide

### 1. Clone the repository

```bash
git clone https://github.com/hendrikschueler-svg/website-detection-ai-agent.git
cd website-detection-ai-agent
```

### 2. Start the web app locally

```bash
cd web-app
cp ../.env.example .env
# Fill in your values (see Step 5)

npm install
npm run dev
# App runs on http://localhost:5000
```

### 3. Import Make.com blueprints

1. Open [make.com](https://make.com) → Login
2. **Scenarios** → **Create a new scenario**
3. Bottom left: click **Import Blueprint**
4. Import blueprints in this order (from `make-blueprints/`):
   - `01-airtable-get-options.json`
   - `02-url-importer.json`
   - `03-start-search.json`
   - `04-get-results.json`
   - `06-ai-worker-v1.2.2-scraping-alt.json` ← **active AI Worker**
5. In each scenario: select your Airtable connection and base
6. Copy the webhook URLs from scenarios 01, 03, and 04

Detailed import instructions: [`make-blueprints/README.md`](make-blueprints/README.md)

### 4. Set up Airtable

The base must contain three tables:

| Table | Table ID | Contents |
|---|---|---|
| Search Setup Keywords | `tblR4mgEXIUJFiTbL` | Client + Product + Keyword |
| Sightings Overview | `tblux7nvqO6Yg9t88` | Found URLs + AI results |
| AI Prompt Config | `tblEdFKZi1o0kYuTR` | Gemini prompts |

All fields and types: [`docs/airtable-schema.md`](docs/airtable-schema.md)

### 5. Set environment variables

```bash
# web-app/.env
MAKE_API_KEY=your_make_api_key

# Webhook URLs from Step 3:
MAKE_START_SEARCH_URL=https://hook.eu2.make.com/...   # Scenario 03 (root route)
MAKE_GET_RESULTS_URL=https://hook.eu2.make.com/...    # Scenario 04 (root route)
START_SEARCH_URL=https://hook.eu2.make.com/...        # Scenario 03 (/api/search/start)
GET_RESULTS_URL=https://hook.eu2.make.com/...         # Scenario 04 (/api/search/results)
```

Find your `MAKE_API_KEY` in Make.com under **Organization Settings → API**.

### 6. Deploy (Railway / Render / Replit)

```bash
# Build
cd web-app && npm run build

# Start (production)
npm run start
```

The app reads `PORT` from the environment (default: `5000`).  
For AI Worker V1.2.2, the `/api/extract` endpoint URL in Make.com scenario 06 must point to your deployment URL.

---

## Local Development / Demo Mode

The app ships with a **Mock Mode** that runs entirely without a Make.com subscription, SerpAPI key, or Airtable account — useful for local development, demos, or UI testing.

**Enable it:**

```bash
# web-app/.env
MOCK_MODE=true
```

When `MOCK_MODE=true`:
- `/api/search/options` returns two pre-configured clients (*Acme Sports*, *LuxBrand*) with realistic products and keywords
- `/api/search/start` returns a mock `runId` instantly without calling Make.com
- `/api/search/results/:runId` returns a set of realistic sightings with mixed Risk Scores, Infringement Types, and Reasoning Summaries

All other environment variables (`MAKE_API_KEY`, webhook URLs) are ignored in mock mode and do not need to be set.

---

## API Reference

### `GET /api/search/options`
Returns available clients, products, and keywords from Airtable.

**Response:**
```json
{
  "clients": ["Vitra", "Herman Miller"],
  "products": ["Lounge Chair", "Aeron"],
  "keywords": ["Eames Replica buy"],
  "setups": [{ "id": "recXXX", "Client": "Vitra", "Product Name": "Lounge Chair", "Keyword": "..." }]
}
```

### `POST /api/search/start`
Starts a new scan run. Triggers Make.com scenario 03.

**Body:** `{ "setupRecordId": "recXXX" }`  
**Response:** `{ "runId": "uuid-v4" }`

### `GET /api/search/results/:runId`
Returns the current state of all sightings for a given run.

**Response:**
```json
{
  "results": [{
    "id": "recXXX",
    "URL": "https://...",
    "Status": "Takedown Recommended",
    "Risk Score": 0.9,
    "Infringement Type": "counterfeit",
    "Reasoning Summary": "...",
    "Recommended Action": "escalate"
  }]
}
```

### `POST /api/extract`
Scrapes a URL and returns visible text + diagnostics (used by Make.com AI Worker V1.2.2).

**Body:** `{ "url": "https://..." }`  
**Response:** `{ "visibleTextExcerpt": "...", "pageTitle": "...", "diagnostics": { ... } }`

### `GET /api/health`
Health check. **Response:** `{ "ok": true }`

---

## Troubleshooting

**401 from Make.com**  
→ Check `MAKE_API_KEY`. Make.com expects the key as an `X-Make-ApiKey` header — no "Bearer" prefix.

**Bot-blocking on `/api/extract`**  
→ The target website is blocking direct HTTP requests. Switch to AI Worker V1.2.1 (ScrapingBee).  
Indicated by `suspectedBlocking: true` in the diagnostics response.

**JS-only pages — empty `visibleTextExcerpt`**  
→ `/api/extract` cannot execute JavaScript. Indicated by `suspectedJsRendering: true`.  
AI Worker V1.2.1 (ScrapingBee) supports JavaScript rendering.

**Make.com returns invalid JSON / parse error**  
→ Make.com occasionally returns multiple JSON objects instead of an array. The `callMakeWebhook` helper in `server/makeWebhook.ts` normalizes these cases automatically.

**`runId` not found after scan start**  
→ Make.com scenario 03 did not return a `runId`. Check the Make.com scenario history logs.
