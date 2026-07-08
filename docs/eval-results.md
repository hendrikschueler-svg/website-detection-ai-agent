# Eval Results — Agent Evidence Loop

Datum: 2026-07-08
Getestete Komponente: `runEvidenceLoop()` (`web-app/server/agent/evidenceLoop.ts`), aufgerufen direkt (nicht über die volle Produktions-Pipeline mit Airtable/SerpAPI). Modell: `gemini-2.5-flash`.

## Testmethodik & Rahmenbedingungen

- Jeder Fall wurde **genau einmal** ausgeführt (kein Wiederholungslauf zur Prüfung von LLM-Nichtdeterminismus).
- `GEMINI_API_KEY`: vorhanden und funktionsfähig (per Smoke-Test verifiziert).
- `SCRAPINGBEE_API_KEY`: **nicht verfügbar**. Der ursprünglich in `make-blueprints/05-ai-worker-v1.2.1-scrapingbee.json` gefundene Key war bereits öffentlich exponiert (siehe Security-Hinweis unten) und beim Smoke-Test bereits mit HTTP 401 deaktiviert — vermutlich durch ScrapingBees eigene Leak-Erkennung. Der Key wurde daher nicht verwendet; `retry_with_proxy` läuft in allen Fällen auf den "not set"-Pfad.
- `puppeteer` ist nicht installiert (optionale Dependency) → `get_screenshot` schlägt in jedem Fall, in dem es aufgerufen wird, mit einer klaren Fehlermeldung fehl.
- `AGENT_MODE` in `.env` ist nicht gesetzt — das ist hier irrelevant, da dieses Flag nur von `aiWorker.ts` (der Produktions-Pipeline) ausgewertet wird, nicht von `runEvidenceLoop()` selbst, das hier direkt aufgerufen wurde.
- Die Erwartungen in der Tabelle unten wurden **vor** dem Testlauf festgelegt (siehe Konversationsverlauf) und danach nicht mehr verändert.

## Ergebnistabelle

| URL | Erwarteter Type | Erwarteter Risk | Tatsächlicher Type | Tatsächlicher Risk | Tatsächliche Empfehlung | Match | Anmerkung |
|---|---|---|---|---|---|---|---|
| [modecor.com](https://modecor.com/Eames-Lounge-Chair-Schwarz-mit-Eichenholz) Eames Lounge Chair | counterfeit/trademark_misuse, 75-95, escalate | — | counterfeit | 90 (conf. 95) | escalate | **Ja** | Verdict nach 1 Turn, kein Tool-Call nötig. Begründung zitiert korrekt "hochqualitative Reproduktionen" der Vitra-Produkte. |
| [decomica.com](https://decomica.com/de/product/classic-charles-eames-lounge-chair-and-ottoman-replica-tan-brown-leather-rose-wood-normal-base/) Eames Replika | counterfeit, 90-100, escalate | — | counterfeit | 95 (conf. 95) | escalate | **Ja** | Explizites "Replika" im Titel korrekt erkannt. `suspectedBlocking=true` (Cloudflare/Captcha-Strings im HTML), Agent hat trotzdem NICHT auf Proxy zurückgegriffen, weil der Text bereits ausreichte. |
| [gojersey.co](https://www.gojersey.co/productdetail/Liverpool-Home-Soccer-Jersey-2026-27/654322) Liverpool Jersey | counterfeit/unauthorized_reseller, 75-95, escalate | — | counterfeit | 90 (conf. 90) | escalate | **Ja** | Agent hat `retry_with_proxy` versucht (schlug wie erwartet ohne Key fehl), dann trotzdem korrekt anhand von Rabattaktionen ("Over $75 Get a $8.9 Jersey") entschieden. |
| [rolexexpert.io](https://rolexexpert.io/product/rolex-submariner-41mm-black-dial-126610ln/) Rolex Submariner | counterfeit, 95-100, escalate | — | counterfeit | 100 (conf. 95) | escalate | **Ja** | Explizites "Replica" + untypische Domain korrekt als Doppelsignal erkannt. |
| [perfectrolex.io](https://perfectrolex.io/de/produkt/super-clone-rolex-gmt-master-ii-126710grnr-bruce-wayne-jubilee-2024/) Rolex GMT-Master | counterfeit, 95-100, escalate | — | counterfeit | 100 (conf. 95) | escalate | **Ja** | "Super Clone" / "nachgemachte Rolex Uhren" korrekt erkannt. |
| [footkorner.com](https://www.footkorner.com/products/maillot-domicile-liverpool-2026-2027-bordeaux-ka6852) Liverpool Trikot | unauthorized_reseller/trademark_misuse, 40-70, human_review | — | unauthorized_reseller | **85** (conf. 75) | human_review | **Teilweise** | Type & Empfehlung korrekt, aber Risk-Score deutlich über meiner Erwartung — siehe Finding 1. |
| [smow.de](https://www.smow.de/vitra/lounge-sessel/lounge-chair-mit-ottoman.html) Vitra (Original) | none, 0-15, auto_close | — | none | 10 (conf. 95) | auto_close | **Ja** | Korrekt als legitimer autorisierter Händler erkannt ("Original von smow"), `autoCloseRisk: true`. |

**6 von 7 Fällen: vollständiger Match. 1 von 7 (footkorner): Type und Empfehlung korrekt, Risk-Score-Erwartung war falsch kalibriert.**

## Findings

### 1. Meine Erwartung bei footkorner.com war falsch kalibriert — nicht der Agent
Ich hatte einen niedrigeren Risk-Score (40-70) erwartet, weil der Preis (99,90€) marktüblich ist und keine offensichtliche Preis-Anomalie liefert. Der Agent hat stattdessen der **falschen "official"-Behauptung auf einer Nicht-Marken-Domain** deutlich mehr Gewicht gegeben als ich erwartet hatte ("explicitly states it is selling an 'official Liverpool FC 2026/27 jersey'" — von einer Domain, die weder Liverpool FC noch Adidas gehört). Das ist inhaltlich nachvollziehbar und eher ein Kalibrierungsfehler meinerseits als ein Fehler des Agents.

### 2. Widerspruch in der eigenen Entscheidungslogik des Prompts (footkorner-Fall)
Der System-Prompt sagt explizit: *"riskScore 80-100 + status 'violation' → recommendedAction 'escalate'"*. Bei footkorner.com lag riskScore=85 und status=violation vor — nach der wörtlichen Regel hätte das `escalate` sein müssen. Der Agent hat aber `human_review` zurückgegeben, vermutlich weil confidenceScore=75 unter der an anderer Stelle im Prompt genannten 80%-Schwelle für "sofort entscheiden" liegt. Der Prompt verknüpft diese beiden Schwellenwerte (Risk-Regel vs. Confidence-Gate) nirgends explizit — das Modell hat implizit einen Confidence-Gate vor die Risk-Regel gesetzt. **Empfehlung:** Im System-Prompt explizit klären, ob eine niedrige Confidence eine sonst geltende Risk-basierte Escalate-Regel überschreiben darf.

### 3. `extract.ts`s Blocking-Heuristik hat eine hohe False-Positive-Rate
5 von 7 Seiten wurden mit `suspectedBlocking=true` markiert ("possible bot challenge") — aber **alle 7 Seiten lieferten HTTP 200 und vollständigen Text** (1500 Zeichen visibleText in jedem Fall). Ursache: Die Keyword-Liste in `extract.ts` matcht bereits auf bloße Erwähnungen von "cloudflare", "captcha", "denied" — die auf modernen Shop-Systemen praktisch immer vorkommen (eingebettete Cloudflare-Turnstile-Widgets, Anti-Spam-Captchas in Kontaktformularen), unabhängig davon, ob die Seite tatsächlich blockiert. Das ist kein Scraper-Fehler, sondern ein **Diagnose-Fehlalarm**, der in Produktion dazu führen könnte, dass unnötig auf ScrapingBee zurückgegriffen wird (Kosten) oder — schlimmer — dass echte Blockaden nicht mehr von diesem Rauschen unterscheidbar sind.

### 4. `extract.ts`s JS-Rendering-Heuristik ist zu empfindlich
6 von 7 Seiten wurden mit `suspectedJsRendering=true` markiert, ausgelöst allein durch das Vorhandensein eines `<noscript>`-Tags — ein extrem verbreitetes, meist bedeutungsloses Artefakt auf server-gerenderten Seiten. Bei allen 6 Fällen wurde der sichtbare Text trotzdem vollständig extrahiert. Nur `gojersey.co` löste zusätzlich über `__NEXT_DATA__` aus (auch hier: Next.js-SSR, Text war trotzdem vollständig vorhanden). **Empfehlung:** `<noscript>` allein aus der `jsPatterns`-Liste entfernen oder nur in Kombination mit dem bereits vorhandenen `lowTextRatio`-Check werten.

### 5. Fallback-Pfade (`retry_with_proxy`, `get_screenshot`) sind aktuell nicht produktiv nutzbar — nicht verschwiegen, sondern hier dokumentiert
- `retry_with_proxy` schlug in beiden Fällen, in denen der Agent es aufrief (gojersey.co, footkorner.com), mit `"SCRAPINGBEE_API_KEY not set"` fehl, weil kein funktionsfähiger Key verfügbar war (der geleakte Key war zum Testzeitpunkt bereits durch ScrapingBee selbst deaktiviert, siehe Security-Hinweis).
- `get_screenshot` schlug im footkorner-Fall mit `"puppeteer not installed"` fehl.
- Beide Fallback-Pfade konnten damit in diesem Lauf **nicht auf tatsächliche Funktionsfähigkeit getestet werden** — nur auf ihr Fehlerverhalten bei fehlenden Voraussetzungen. Das reicht nicht aus, um zu sagen, dass diese Pfade in Produktion funktionieren.
- Zusätzlich beim Prüfen des (mittlerweile toten) ScrapingBee-Keys entdeckt: `proxyExtract.ts` prüft `response.status` **nicht** vor der Weiterverarbeitung. Ein 401 von ScrapingBee würde aktuell fälschlich als `"fetched via ScrapingBee premium proxy"` (proxyUsed: true, keine Fehlermeldung sichtbar für den Agenten) durchgereicht, mit leerem Text statt einer klaren Fehlermeldung. Das ist ein eigenständiger, noch ungefixter Bug — unabhängig vom Key-Leak.

### 6. Security-Nebenbefund (bereits behoben, hier der Vollständigkeit halber dokumentiert)
Ein Gemini-API-Key und ein ScrapingBee-API-Key waren im Klartext in `make-blueprints/05-ai-worker-v1.2.1-scrapingbee.json` (und der Gemini-Key zusätzlich in `06-ai-worker-v1.2.2-scraping-alt.json`) committet — in einem **öffentlichen** Repo. Beide Keys wurden in Commit `e639552` durch Platzhalter ersetzt. Der Gemini-Key wurde vom Nutzer rotiert; der alte ScrapingBee-Key war beim Testzeitpunkt bereits extern deaktiviert (HTTP 401). Die Git-Historie selbst enthält den alten Key weiterhin (Redaction im aktuellen Stand entfernt keine alten Commits) — eine History-Bereinigung wurde besprochen, aber noch nicht durchgeführt.

## Fazit

Die Kernklassifikation (counterfeit vs. legitim) funktioniert bei allen 7 realen, unangekündigten Testfällen zuverlässig — auch bei den Fällen ohne explizites "Replica"-Wort im Text (modecor.com, gojersey.co), wo der Agent auf Preis-/Kontext-Signale statt auf reines Keyword-Matching angewiesen war. Die eigentlichen Schwachstellen liegen nicht in der Kernentscheidung, sondern in (a) einer nicht ganz konsistenten Schwellenwert-Logik im Prompt (Finding 2), (b) einer zu geräuschempfindlichen Scraper-Diagnostik (Findings 3+4), und (c) zwei Fallback-Pfaden, die aktuell mangels Key/Dependency gar nicht funktionsfähig sind und daher ungetestet bleiben (Finding 5).
