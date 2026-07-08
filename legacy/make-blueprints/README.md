# Make.com Blueprints — Archived

> **These blueprints are no longer used.**  
> The logic from all 6 scenarios has been migrated to native Node.js jobs in `web-app/server/`.  
> Make.com is no longer required to run this system.

The JSON files are kept here as historical reference and documentation.

---

## What replaced what

| Make.com Scenario | Replaced by |
|---|---|
| 01 Airtable Get Options | `server/routes.ts` → `getActiveKeywords()` in `server/airtable.ts` |
| 02 URL Importer | `server/jobs/urlImporter.ts` → `searchGoogle()` + `createSighting()` |
| 03 Start Search | `POST /api/search/start` in `server/routes.ts` — generates UUID, fires background job |
| 04 Get Results | `GET /api/search/results/:runId` in `server/routes.ts` → `getSightingsByRunId()` |
| 05 AI Worker V1.2.1 (ScrapingBee) | `server/jobs/aiWorker.ts` — direct HTTP scrape via `extractUrl()` |
| 06 AI Worker V1.2.2 (active) | `server/jobs/aiWorker.ts` + `server/gemini.ts` |

## New architecture

```
Web App → Airtable REST API  (direct, no middleman)
Web App → SerpAPI REST API   (direct)
Web App → Gemini API         (via @google/generative-ai SDK)
```

## Required environment variables

```
AIRTABLE_TOKEN=your_airtable_personal_access_token
AIRTABLE_BASE_ID=appgyHtu4tSQxWCvz
SERPAPI_KEY=your_serpapi_key
GEMINI_API_KEY=your_gemini_api_key
```

See `.env.example` in the repo root.

---

## Original blueprint files (for reference)

- `01-airtable-get-options.json`
- `02-url-importer.json`
- `03-start-search.json`
- `04-get-results.json`
- `05-ai-worker-v1.2.1-scrapingbee.json`
- `06-ai-worker-v1.2.2-scraping-alt.json`
