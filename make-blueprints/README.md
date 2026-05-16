# Make.com Blueprints

Dieses Verzeichnis enthält die sechs Make.com Szenarien als exportierte JSON-Blueprints.

## Reihenfolge & Abhängigkeiten

```
[Nutzer] → Start Search (03) → URL Importer (02) → [Airtable: Sightings]
                                                          ↓
                                              AI Worker V1.2.2 (06)  ← aktiv
                                              AI Worker V1.2.1 (05)  ← Fallback (ScrapingBee)
                                                          ↓
                                              [Airtable: KI-Ergebnis]
                                                          ↑
                              Get Results (04) ←──────────┘
[Nutzer] ← Get Results (04)
[Web App] → Airtable Get Options (01) → [Airtable: Search Setup Keywords]
```

## Import-Anleitung

1. **Make.com öffnen** → [make.com](https://make.com) → Login
2. **Scenarios** → **Create a new scenario**
3. Unten links: **Import Blueprint** klicken
4. JSON-Datei auswählen und bestätigen
5. Webhooks und Verbindungen (Airtable, SerpAPI, Gemini) neu verknüpfen

**Reihenfolge beim Import:**
1. `01-airtable-get-options.json` — liefert Keyword-Setups ans Web-App-Backend
2. `02-url-importer.json` — führt Google-Suche via SerpAPI durch, schreibt URLs nach Airtable
3. `03-start-search.json` — generiert runId (UUID), triggert URL Importer
4. `04-get-results.json` — liest Sightings aus Airtable nach runId
5. `06-ai-worker-v1.2.2-scraping-alt.json` — **aktiver AI Worker**: direkter HTTP-Scrape + /api/extract + Gemini 2.5 Flash
6. `05-ai-worker-v1.2.1-scrapingbee.json` — ältere Version mit ScrapingBee (Fallback)

## Wichtige Webhooks verknüpfen

Nach dem Import musst du folgende Webhook-URLs in die `.env` der Web App eintragen:

| Blueprint | Webhook-Variable in .env |
|---|---|
| 03-start-search | `START_SEARCH_URL` + `MAKE_START_SEARCH_URL` |
| 04-get-results | `GET_RESULTS_URL` + `MAKE_GET_RESULTS_URL` |
| 01-airtable-get-options | Hardcoded in `server/routes.ts` → `api.search.options` |

## API-Key in Make.com

Der `MAKE_API_KEY` wird vom Web-App-Backend als `X-Make-ApiKey` Header gesetzt.  
In Make.com: **Organization Settings** → **API** → API Key kopieren.
