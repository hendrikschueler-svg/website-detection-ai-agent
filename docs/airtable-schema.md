# Airtable Schema

**Base ID:** `appgyHtu4tSQxWCvz`

## Tabelle 1: Search Setup Keywords

**Table ID:** `tblR4mgEXIUJFiTbL`

Enthält die Konfigurationen: welcher Client, welches Produkt, welches Keyword durchsucht werden soll.

| Feldname | Typ | Beschreibung |
|---|---|---|
| `Client` | Single Line Text | Kundenname (z.B. "Vitra") |
| `Product Name` | Single Line Text | Produktname (z.B. "Lounge Chair") |
| `Keyword` | Single Line Text | Google-Suchbegriff (z.B. "Eames Lounge Chair Replica kaufen") |
| `Active` | Checkbox | Nur aktive Einträge werden von Szenario 01 zurückgegeben |

> Jeder Record entspricht einem Keyword-Setup. Eine Client + Produkt Kombination kann mehrere Keywords haben.

---

## Tabelle 2: Sightings Overview

**Table ID:** `tblux7nvqO6Yg9t88`

Jede gefundene URL aus der Google-Suche wird als Record angelegt. Der AI Worker befüllt die Analyse-Felder.

| Feldname | Airtable Field ID | Typ | Beschreibung |
|---|---|---|---|
| `URL` | `fldkBNYiJ6n6Ydo91` | URL | Gefundene Website-URL |
| `Status` | `fldrPXMzV82Du1Usp` | Single Select | `processing` → `Takedown Recommended` / `Auto Closed` / `Human Review` |
| `Risk Score` | `fld7RwVPnWNNdTOWe` | Number (0–1) | Risikobewertung durch Gemini |
| `Confidence Score` | `fldkxi92Pb3YM9NmM` | Number (0–1) | Konfidenz der KI-Analyse |
| `Infringement Type` | `flddP2LuFx4CZW2Ne` | Single Line Text | `counterfeit` / `not_infringing` / `grey_market` etc. |
| `Reasoning Summary` | `fldawLOToq7h3dNcA` | Long Text | Begründung der KI-Entscheidung |
| `Recommended Action` | `fldLJOCv8NGLISkPo` | Single Select | `escalate` / `auto_close` / `human_review` |
| `Client` | — | Lookup / Text | Aus verknüpftem Search Setup |
| `Product Name` | — | Lookup / Text | Aus verknüpftem Search Setup |
| `Keyword` | — | Lookup / Text | Aus verknüpftem Search Setup |
| `Run ID` | — | Single Line Text | UUID des Scan-Laufs (für Polling via Szenario 04) |

> **Hinweis:** Das Backend in `server/routes.ts` unterstützt beide Varianten — Feldnamen als String UND Airtable Field IDs (z.B. `fldkBNYiJ6n6Ydo91`) als Fallback, weil Make.com je nach Konfiguration beides zurückgeben kann.

---

## Tabelle 3: AI Prompt Config

**Table ID:** `tblEdFKZi1o0kYuTR`

Enthält die Gemini-Prompts und Scoring-Regeln für den AI Worker.

| Feldname | Typ | Beschreibung |
|---|---|---|
| `Prompt Name` | Single Line Text | Bezeichnung der Prompt-Version |
| `System Prompt` | Long Text | System-Instruktion für Gemini 2.5 Flash |
| `User Prompt Template` | Long Text | Template mit `{{visibleText}}`, `{{pageTitle}}` etc. |
| `Active` | Checkbox | Welcher Prompt aktuell vom AI Worker genutzt wird |
| `Client` | Single Line Text | Optional: client-spezifische Prompts |
| `Min Risk Score` | Number | Schwellwert ab dem "Takedown Recommended" gesetzt wird |

> Die Tabelle ermöglicht Prompt-Versionierung ohne Code-Änderungen.

### Planned fields — not yet implemented

The following fields are planned for a future version to enable cleaner per-client risk configuration without editing prompt text:

| Field | Type | Description |
|---|---|---|
| `escalate_threshold` | Number (0–100) | Risk Score above which the agent recommends escalation. Default: 80. |
| `auto_close_threshold` | Number (0–100) | Risk Score below which the agent auto-closes as clean. Default: 20. |

Once implemented, these will replace free-text threshold instructions in the `System Prompt` field.
