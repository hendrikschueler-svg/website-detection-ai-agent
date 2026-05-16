# System-Architektur

## Überblick

Das Website Detection System erkennt automatisch potenzielle IP-Verletzungen auf Websites. Es kombiniert drei Schichten: eine No-Code-Automatisierung in Make.com, eine Airtable-Datenbank und ein Node.js/React-Web-App-Backend.

## Systemdiagramm

```
┌─────────────────────────────────────────────────────────────────┐
│                         NUTZER (Browser)                        │
│                    React Frontend (Web App)                      │
│   [Client wählen] → [Produkt wählen] → [Scan starten]          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Node.js/Express Backend                        │
│                       (web-app/server/)                          │
│                                                                  │
│  GET /api/search/options  →  Make.com Webhook 01                │
│  POST /api/search/start   →  Make.com Webhook 03                │
│  GET /api/search/results  →  Make.com Webhook 04                │
│  POST /api/extract        →  scrape + Cheerio (intern)          │
└──────────┬────────────────────────────────────────┬─────────────┘
           │ Webhook                                │ HTTP-Scrape
           ▼                                        ▼
┌──────────────────────┐               ┌────────────────────────┐
│   Make.com           │               │   Ziel-Website         │
│                      │               │   (zu prüfende URL)    │
│ 01 Get Options  ←────┤               └────────────────────────┘
│ 02 URL Importer      │
│ 03 Start Search ←────┤
│ 04 Get Results  ←────┤
│ 05 AI Worker V1.2.1  │  ← ScrapingBee + Gemini
│ 06 AI Worker V1.2.2  │  ← direkter HTTP + /api/extract + Gemini
└──────────┬───────────┘
           │ Read/Write
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Airtable                                 │
│                                                                  │
│  Search Setup Keywords  →  Keyword-Konfigurationen pro Client   │
│  Sightings Overview     →  gefundene URLs + KI-Ergebnisse       │
│  AI Prompt Config       →  Gemini-Prompts + Scoring-Regeln      │
└─────────────────────────────────────────────────────────────────┘
```

## Datenfluss: Vollständiger Scan

```
1. Nutzer öffnet Web App
   └─► GET /api/search/options
       └─► Make.com Szenario 01 liest Search Setup Keywords aus Airtable
           └─► Gibt Liste: Clients / Produkte / Keywords zurück

2. Nutzer wählt Client + Produkt → klickt "Start AI Scan"
   └─► POST /api/search/start {setupRecordId}
       └─► Make.com Szenario 03:
           ├─ Generiert runId (UUID)
           ├─ Triggert Szenario 02 (URL Importer)
           │   └─ SerpAPI: Google-Suche nach Keyword
           │       └─ Schreibt gefundene URLs als neue Records in Sightings Overview
           └─ Gibt runId zurück → Browser navigiert zu /results?runId=...

3. Browser pollt alle 5 Sekunden
   └─► GET /api/search/results/:runId
       └─► Make.com Szenario 04 liest Sightings mit dieser runId aus Airtable
           └─► Gibt aktuelle Status-Felder zurück

4. Parallel: Make.com AI Worker (Szenario 06 — aktiv)
   ├─ Airtable-Trigger: neue Sighting-Records
   ├─ HTTP POST → /api/extract {url}
   │   └─ Backend scrapet die URL, gibt visibleText + HTML-Snippet zurück
   ├─ Gemini 2.5 Flash analysiert Text gegen AI Prompt Config
   │   └─ Risk Score / Infringement Type / Recommended Action / Reasoning
   └─ Schreibt Ergebnis zurück in Airtable (Status: "Done" oder "Takedown Recommended")

5. Sobald alle Records Status ≠ "processing" → Polling stoppt
```

## Komponentenübersicht

### Web App — Server (`web-app/server/`)

| Datei | Funktion |
|---|---|
| `index.ts` | Express-Setup, Env-Validierung, Vite-Dev-Server |
| `routes.ts` | Alle API-Endpunkte registrieren |
| `makeWebhook.ts` | Make.com HTTP-Helper mit JSON-Workaround |
| `extract.ts` | `/api/extract` — HTTP-Scrape + Cheerio-Parsing |
| `storage.ts` | Stub (In-Memory, keine DB) |
| `static.ts` | Production Static File Serving |
| `vite.ts` | Dev-Server HMR-Integration |

### Web App — Client (`web-app/client/src/`)

| Datei | Funktion |
|---|---|
| `pages/search.tsx` | Stepper: Client → Produkt → Scan starten |
| `pages/results.tsx` | Ergebnisliste mit Risk Score + Takedown-Actions |
| `hooks/use-search.ts` | React Query Hooks für alle 3 API-Calls |
| `hooks/use-mobile.ts` | Responsive Breakpoint-Detection |
| `components/app-sidebar.tsx` | Navigation Sidebar |
| `components/layout/app-layout.tsx` | Shell mit Sidebar + Footer-Disclaimer |

### Make.com Szenarien

| Szenario | Trigger | Funktion |
|---|---|---|
| 01 Airtable Get Options | Webhook | Liest aktive Keyword-Setups, gibt Client/Keyword/Product zurück |
| 02 URL Importer | Webhook | SerpAPI Google-Suche → schreibt URLs nach Airtable |
| 03 Start Search | Webhook | Generiert runId (UUID) → triggert Szenario 02 |
| 04 Get Results | Webhook | Liest Sightings nach runId → gibt JSON zurück |
| 05 AI Worker V1.2.1 | Airtable-Trigger | ScrapingBee + Gemini 2.5 Flash |
| 06 AI Worker V1.2.2 | Airtable-Trigger | direkter HTTP + /api/extract + Gemini 2.5 Flash (**aktiv**) |

## Warum zwei AI Worker?

V1.2.1 nutzt ScrapingBee als Scraping-Proxy (kostenpflichtig, bessere Bot-Umgehung).  
V1.2.2 nutzt den `/api/extract` Endpunkt des eigenen Backends — kostenlos, aber anfällig für Bot-Protection.  
Beide Versionen rufen denselben Gemini 2.5 Flash Prompt auf.
