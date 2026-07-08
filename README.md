# Website Detection AI Agent

An AI-powered tool for automatically detecting IP infringements on websites. The system searches Google for configurable keywords, scrapes each result, and analyzes it with Gemini 2.5 Flash for potential trademark or product piracy — fully automated, no third-party automation tools required.

---

## System Architecture

```
┌──────────────────┐     HTTP      ┌──────────────────────────┐
│  React Frontend  │ ────────────► │  Node.js/Express Backend │
│  (search + results)              │  /api/search/*           │
└──────────────────┘               │  /api/extract            │
                                   └──────┬──────┬────────────┘
                                          │      │
                              ┌───────────┘      └───────────┐
                              ▼                              ▼
                   ┌──────────────────┐         ┌──────────────────┐
                   │    Airtable      │         │    SerpAPI       │
                   │  Keywords /      │         │  Google Search   │
                   │  Sightings /     │         └──────────────────┘
                   │  AI Prompts      │
                   └──────────────────┘
                              ▲
                              │
                   ┌──────────────────┐
                   │  Gemini 2.5 Flash│
                   │  (AI Agent)      │
                   └──────────────────┘
```

**Make.com is no longer required.** All logic runs natively in Node.js.

---

## Previous Architecture

This project originally ran on Make.com scenarios (no-code orchestration of Airtable, SerpAPI, and Gemini). Migrated to native Node.js integration in July 2026 for direct control over agent logic and tool calling. The original blueprints are kept for reference in [`legacy/`](legacy/).

---

## Prerequisites

- **Node.js** 18+
- **Airtable** account + base (Base ID: `appgyHtu4tSQxWCvz`)
- **SerpAPI** key ([serpapi.com](https://serpapi.com))
- **Google Gemini API key** ([aistudio.google.com](https://aistudio.google.com))

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/hendrikschueler-svg/website-detection-ai-agent.git
cd website-detection-ai-agent/web-app
```

### 2. Configure environment variables

```bash
cp ../.env.example .env
```

Edit `web-app/.env`:

```env
MOCK_MODE=false

AIRTABLE_TOKEN=your_airtable_personal_access_token
AIRTABLE_BASE_ID=appgyHtu4tSQxWCvz

SERPAPI_KEY=your_serpapi_key
GEMINI_API_KEY=your_gemini_api_key

# Optional — enables the evidence-gathering agent loop (recommended)
AGENT_MODE=true

# Optional — required for proxy-based scraping when sites block direct requests
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key
```

### 3. Install dependencies and start

```bash
npm install
npm run dev
# App runs on http://localhost:5000
```

---

## Mock Mode (no API keys required)

The app ships with a **Mock Mode** for local development and demos — no Airtable, SerpAPI, or Gemini account needed.

```env
# web-app/.env
MOCK_MODE=true
```

When `MOCK_MODE=true`:
- `/api/search/options` returns two pre-configured clients (*Acme Sports*, *LuxBrand*) with realistic products and keywords
- `/api/search/start` returns a mock `runId` instantly
- `/api/search/results/:runId` returns realistic sightings with mixed Risk Scores, Infringement Types, and Reasoning Summaries

All other environment variables are ignored in mock mode.

---

## Airtable Setup

The base must contain three tables:

| Table | Table ID | Contents |
|---|---|---|
| Search Setup Keywords | `tblR4mgEXIUJFiTbL` | Client + Product + Keyword |
| Sightings Overview | `tblux7nvqO6Yg9t88` | Found URLs + AI results |
| AI Prompt Config | `tblEdFKZi1o0kYuTR` | Gemini prompts + per-client risk configuration |

All fields and types: [`docs/airtable-schema.md`](docs/airtable-schema.md)

---

## How It Works

1. **Search** — User selects a keyword setup (Client + Product + Keyword) and starts a scan
2. **URL Import** — Backend calls SerpAPI to fetch Google results and creates a "pending" sighting in Airtable for each URL
3. **AI Analysis** — Each URL is scraped and passed to the Gemini agent, which autonomously gathers evidence and reaches a verdict
4. **Results** — The agent writes a structured result (Risk Score, Infringement Type, Reasoning, Recommended Action) back to Airtable
5. **Polling** — The frontend polls `/api/search/results/:runId` every few seconds until all sightings are processed

The scan runs as a **background job** — the API returns a `runId` immediately and the client polls for results.

---

## Agent Mode

When `AGENT_MODE=true`, the system uses an **evidence-gathering agent loop** instead of a single-shot prompt.

### How the agent works

The agent receives the URL and initial page data (title, H1, visible text excerpt) and decides autonomously which tools to call to gather enough evidence for a confident verdict. It loops until either confidence is sufficient or the maximum iteration limit is reached.

```
URL + initial page data
        │
        ▼
┌───────────────────┐
│  Gemini reviews   │
│  available data   │
└────────┬──────────┘
         │
    confidence ≥ 80?
    ┌────┴────┐
   YES       NO
    │         │
    │    ┌────▼─────────────────────────────┐
    │    │ Which tool do I need?            │
    │    │  • retry_with_proxy  (blocked)   │
    │    │  • get_screenshot    (visual)    │
    │    │  • whois_lookup      (domain)    │
    │    │  • extract_url       (recheck)   │
    │    └────┬─────────────────────────────┘
    │         │
    │    tool executes → result back to Gemini
    │         │
    │    loop (max 5 iterations)
    │         │
    └────►submit_verdict
              │
              ▼
     escalate / auto_close / human_review
```

The agent will not call tools it doesn't need. If the initial data is already sufficient for a confident verdict, it terminates immediately without further requests.

### Available tools

| Tool | When the agent uses it |
|---|---|
| `extract_url` | Initial data looks incomplete or stale |
| `get_screenshot` | Visual verification needed (logos, product images, layout) |
| `whois_lookup` | Domain age or jurisdiction is relevant (newly registered = suspicious) |
| `retry_with_proxy` | Direct scrape was blocked (`suspectedBlocking=true`) or returned empty text |

`get_screenshot` requires `puppeteer` (`npm install puppeteer`). If not installed, the agent skips visual analysis and continues with available text evidence.

`retry_with_proxy` requires `SCRAPINGBEE_API_KEY`. If not set, the tool returns an error the agent handles gracefully.

---

## Decision Logic

Every analyzed URL results in one of three outcomes:

| Outcome | Airtable Status | Condition |
|---|---|---|
| **Escalate** | `Takedown Recommended` | Risk Score ≥ 80, status = `violation` |
| **Auto Close** | `Auto Closed` | Risk Score ≤ 20, status = `clean` |
| **Human Review** | `Human Review` | Everything in between, or insufficient confidence |

### Infringement types

The agent classifies violations into four categories:

| Type | Description |
|---|---|
| `counterfeit` | Fake product sold as genuine |
| `unauthorized_reseller` | Real product sold without authorization |
| `trademark_misuse` | Brand name or logo used without rights |
| `domain_squatting` | Domain registered to mislead or profit from brand name |
| `none` | No infringement detected |
| `unclear` | Insufficient evidence to classify |

### Per-client risk configuration

Different clients have different risk tolerances. A luxury brand may want human review for anything above Risk Score 50. A high-volume marketplace client may accept auto-close up to Risk Score 30.

Risk thresholds are currently defined in the agent's system prompt via the `AI Prompt Config` table in Airtable. Add brand-specific instructions to the client's prompt record to override the defaults — for example:

> "For this client, only recommend escalation when Risk Score is above 70. Never auto-close without human confirmation."

**Planned:** Dedicated numeric fields `escalate_threshold` and `auto_close_threshold` in `AI Prompt Config` will replace free-text threshold instructions in a future version, enabling cleaner per-client configuration without prompt editing.

---

## API Reference

### `GET /api/search/options`
Returns available clients, products, and keywords from Airtable.

**Response:**
```json
{
  "clients": ["Acme Sports"],
  "products": ["ProRunner X1"],
  "keywords": ["ProRunner X1 buy cheap"],
  "setups": [{ "id": "recXXX", "Client": "Acme Sports", "Product Name": "ProRunner X1", "Keyword": "..." }]
}
```

### `POST /api/search/start`
Starts a new scan. Runs URL import + AI analysis as a background job.

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
    "Confidence Score": 0.85,
    "Infringement Type": "counterfeit",
    "Reasoning Summary": "...",
    "Recommended Action": "escalate"
  }]
}
```

### `POST /api/extract`
Scrapes a URL and returns visible text + metadata.

**Body:** `{ "url": "https://..." }`
**Response:** `{ "visibleTextExcerpt": "...", "pageTitle": "...", "h1": "...", "diagnostics": { ... } }`

### `GET /api/health`
Health check. **Response:** `{ "ok": true, "mock": false }`

---

## Deployment

```bash
cd web-app
npm run build
npm run start
```

The app reads `PORT` from the environment (default: `5000`).

---

## Troubleshooting

**Bot-blocking / empty page content**
→ The target website blocks direct HTTP requests. Indicated by `suspectedBlocking: true` in the `/api/extract` diagnostics. Enable `AGENT_MODE=true` and set `SCRAPINGBEE_API_KEY` — the agent will automatically retry via proxy.

**JS-rendered pages — empty `visibleTextExcerpt`**
→ `/api/extract` does not execute JavaScript. Indicated by `suspectedJsRendering: true`. Install `puppeteer` (`npm install puppeteer`) — the agent will request a screenshot and analyze the page visually.

**Gemini returns invalid JSON**
→ The server falls back to stripping markdown code fences and retrying the parse. Check server logs for `[gemini] JSON parse error`.

**`runId` results always empty**
→ Check that the background job completed without errors. Server logs show `[aiWorker]` and `[urlImporter]` progress per sighting.

**Agent always returns `human_review`**
→ Check server logs for `[evidenceLoop]` entries. If the agent hits the 5-iteration safety cap without a confident verdict, it returns `human_review` by design. Consider adjusting the client's system prompt in `AI Prompt Config` to provide clearer brand context.
