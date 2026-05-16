# Website Detection AI Agent

Ein KI-gestütztes Tool zur automatischen Erkennung von IP-Verletzungen auf Websites. Das System crawlt Google-Suchergebnisse anhand konfigurierbarer Keywords und analysiert jede gefundene URL per Gemini 2.5 Flash auf potenzielle Marken- oder Produktpiraterie — vollständig automatisiert über Make.com, Airtable und ein Node.js/React-Backend.

---

## Systemarchitektur

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
                                   │  6 Szenarien             │
                                   └──────────┬───────────────┘
                                              │ Read/Write
                                              ▼
                                   ┌──────────────────────────┐
                                   │        Airtable          │
                                   │  Keywords / Sightings /  │
                                   │  AI Prompt Config        │
                                   └──────────────────────────┘
```

Vollständige Architektur- und Datenflussdokumentation: [`docs/architecture.md`](docs/architecture.md)

---

## Voraussetzungen

- **Node.js** 18+
- **Make.com** Account (Free-Tier reicht für Tests)
- **Airtable** Account + Base (Base ID: `appgyHtu4tSQxWCvz`)
- **SerpAPI** Key (für URL Importer / AI Worker V1.2.1)
- **Google AI API Key** (Gemini 2.5 Flash) — in Make.com Verbindung konfiguriert

---

## Setup-Anleitung

### 1. Repo klonen

```bash
git clone https://github.com/hendrikschueler-svg/website-detection-ai-agent.git
cd website-detection-ai-agent
```

### 2. Web App lokal starten

```bash
cd web-app
cp ../.env.example .env
# .env mit deinen Werten befüllen (siehe Schritt 5)

npm install
npm run dev
# App läuft auf http://localhost:5000
```

### 3. Make.com Blueprints importieren

1. [make.com](https://make.com) öffnen → Login
2. **Scenarios** → **Create a new scenario**
3. Unten links: **Import Blueprint** klicken
4. Blueprints in dieser Reihenfolge importieren (aus `make-blueprints/`):
   - `01-airtable-get-options.json`
   - `02-url-importer.json`
   - `03-start-search.json`
   - `04-get-results.json`
   - `06-ai-worker-v1.2.2-scraping-alt.json` ← **aktiver AI Worker**
5. In jedem Szenario: Airtable-Verbindung + Base auswählen
6. Webhook-URLs der Szenarien 01, 03 und 04 notieren

Detaillierte Import-Anleitung: [`make-blueprints/README.md`](make-blueprints/README.md)

### 4. Airtable einrichten

Die Base muss drei Tabellen enthalten:

| Tabelle | Table ID | Inhalt |
|---|---|---|
| Search Setup Keywords | `tblR4mgEXIUJFiTbL` | Client + Produkt + Keyword |
| Sightings Overview | `tblux7nvqO6Yg9t88` | Gefundene URLs + KI-Ergebnisse |
| AI Prompt Config | `tblEdFKZi1o0kYuTR` | Gemini-Prompts |

Alle Felder und Typen: [`docs/airtable-schema.md`](docs/airtable-schema.md)

### 5. Umgebungsvariablen setzen

```bash
# web-app/.env
MAKE_API_KEY=dein_make_api_key

# Webhook-URLs aus Schritt 3 eintragen:
MAKE_START_SEARCH_URL=https://hook.eu2.make.com/...   # Szenario 03 (Root-Route)
MAKE_GET_RESULTS_URL=https://hook.eu2.make.com/...    # Szenario 04 (Root-Route)
START_SEARCH_URL=https://hook.eu2.make.com/...        # Szenario 03 (/api/search/start)
GET_RESULTS_URL=https://hook.eu2.make.com/...         # Szenario 04 (/api/search/results)
```

Den `MAKE_API_KEY` findest du in Make.com unter **Organization Settings → API**.

### 6. Deployment (Replit / Railway / Render)

```bash
# Build
cd web-app && npm run build

# Start (Production)
npm run start
```

Die App erwartet `PORT` als Umgebungsvariable (Default: `5000`).  
Für den AI Worker V1.2.2 muss die `/api/extract` Endpunkt-URL in Make.com Szenario 06 auf deine deployment URL zeigen.

---

## API-Dokumentation

### `GET /api/search/options`
Gibt verfügbare Clients, Produkte und Keywords aus Airtable zurück.

**Response:**
```json
{
  "clients": ["Vitra", "Herman Miller"],
  "products": ["Lounge Chair", "Aeron"],
  "keywords": ["Eames Replica kaufen"],
  "setups": [{ "id": "recXXX", "Client": "Vitra", "Product Name": "Lounge Chair", "Keyword": "..." }]
}
```

### `POST /api/search/start`
Startet einen neuen Scan-Lauf. Triggert Make.com Szenario 03.

**Body:** `{ "setupRecordId": "recXXX" }`  
**Response:** `{ "runId": "uuid-v4" }`

### `GET /api/search/results/:runId`
Gibt den aktuellen Stand aller Sightings für einen Lauf zurück.

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
Scrapet eine URL und gibt sichtbaren Text + Diagnose zurück (genutzt von Make.com AI Worker V1.2.2).

**Body:** `{ "url": "https://..." }`  
**Response:** `{ "visibleTextExcerpt": "...", "pageTitle": "...", "diagnostics": { ... } }`

### `GET /api/health`
Health Check. **Response:** `{ "ok": true }`

---

## Troubleshooting

**401 von Make.com**  
→ `MAKE_API_KEY` prüfen. Make.com erwartet den Key als `X-Make-ApiKey` Header — kein "Bearer" Prefix.

**Bot-Blocking bei `/api/extract`**  
→ Die Ziel-Website blockiert direkte HTTP-Requests. Wechsel auf AI Worker V1.2.1 (ScrapingBee).  
Erkennbar an `suspectedBlocking: true` in der diagnostics-Antwort.

**JS-only Seiten — leerer `visibleTextExcerpt`**  
→ `/api/extract` kann kein JavaScript rendern. Erkennbar an `suspectedJsRendering: true`.  
AI Worker V1.2.1 (ScrapingBee) kann JavaScript-Rendering aktivieren.

**Make.com gibt kein JSON zurück / Parse-Fehler**  
→ Make.com sendet gelegentlich mehrere JSON-Objekte statt eines Arrays. Der `callMakeWebhook` Helper in `server/makeWebhook.ts` normalisiert diese Fälle automatisch.

**`runId` nicht gefunden nach Scan-Start**  
→ Make.com Szenario 03 gibt keinen `runId` zurück. Make.com Logs prüfen (Scenario → History).
