/**
 * Standalone agent test — runs the evidence loop for any URL.
 * No Airtable, SerpAPI, or ScrapingBee needed.
 *
 * Usage:
 *   PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" \
 *   GEMINI_API_KEY=your_key \
 *   npx tsx test-agent.ts https://example.com "Nike Air Max" "Nike" nike.com
 *
 * Arguments:
 *   1. URL to analyze
 *   2. Product name
 *   3. Client / brand name
 *   4. Official domain
 *
 * The script patches the Gemini client to print every tool call and
 * response as they happen, so you can follow the agent's reasoning live.
 */

import "dotenv/config";
import { extractUrl } from "./server/extract";
import { runEvidenceLoop } from "./server/agent/evidenceLoop";

const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const CYAN   = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const DIM    = "\x1b[2m";

function banner(text: string, color = CYAN) {
  const line = "─".repeat(60);
  console.log(`\n${color}${BOLD}${line}${RESET}`);
  console.log(`${color}${BOLD}  ${text}${RESET}`);
  console.log(`${color}${BOLD}${line}${RESET}`);
}

function section(label: string) {
  console.log(`\n${YELLOW}${BOLD}▶ ${label}${RESET}`);
}

// ── Patch console.log to highlight agent log lines ─────────────────────────
const _log = console.log.bind(console);
console.log = (...args: any[]) => {
  const msg = args.map(String).join(" ");
  if (msg.includes("[evidenceLoop]")) {
    _log(`${CYAN}${msg}${RESET}`);
  } else if (msg.includes("[screenshot]") || msg.includes("[whois]") || msg.includes("[proxyExtract]") || msg.includes("[EXTRACT]")) {
    _log(`${DIM}${msg}${RESET}`);
  } else {
    _log(...args);
  }
};

// ── Main ───────────────────────────────────────────────────────────────────
const [,, url, productName = "Test Product", client = "Test Brand", officialDomain = ""] = process.argv;

if (!url) {
  console.error(`\nUsage: npx tsx test-agent.ts <url> [productName] [client] [officialDomain]\n`);
  console.error(`Example:`);
  console.error(`  npx tsx test-agent.ts https://www.aliexpress.com/item/fake-nike.html "Air Max" "Nike" nike.com\n`);
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.error(`\n${RED}${BOLD}Error: GEMINI_API_KEY is not set.${RESET}`);
  console.error(`Set it inline or in web-app/.env:\n`);
  console.error(`  GEMINI_API_KEY=your_key npx tsx test-agent.ts ${url}\n`);
  process.exit(1);
}

banner("WEBSITE DETECTION — AGENT TEST RUN");
console.log(`\n  URL:            ${BOLD}${url}${RESET}`);
console.log(`  Product:        ${productName}`);
console.log(`  Brand / Client: ${client}`);
console.log(`  Official domain: ${officialDomain || "(not set)"}`);

// ── Step 1: Initial scrape ─────────────────────────────────────────────────
section("Step 1 / 2 — Initial scrape");
console.log(`  Fetching ${url} directly...`);

let extracted;
try {
  extracted = await extractUrl(url);
  console.log(`  ${GREEN}✓${RESET} HTTP status:     ${extracted.diagnostics.httpStatus}`);
  console.log(`  ${GREEN}✓${RESET} Page title:      ${extracted.pageTitle || "(empty)"}`);
  console.log(`  ${GREEN}✓${RESET} H1:              ${extracted.h1 || "(empty)"}`);
  console.log(`  ${GREEN}✓${RESET} Visible text:    ${extracted.visibleTextExcerpt.length} chars`);
  console.log(`  ${GREEN}✓${RESET} Suspected blocking: ${extracted.diagnostics.suspectedBlocking}`);
  console.log(`  ${GREEN}✓${RESET} Suspected JS-only:  ${extracted.diagnostics.suspectedJsRendering}`);
  if (extracted.diagnostics.notes.length) {
    console.log(`  ${DIM}  Notes: ${extracted.diagnostics.notes.join(", ")}${RESET}`);
  }
} catch (err: any) {
  console.error(`  ${RED}✗ Scrape failed: ${err.message}${RESET}`);
  console.error(`  The agent will receive empty initial data and should call tools to compensate.`);
  extracted = {
    pageTitle: "", h1: "", visibleTextExcerpt: "", priceSnippets: "",
    diagnostics: { suspectedBlocking: true, suspectedJsRendering: false, notes: [`fetch error: ${err.message}`] },
  } as any;
}

// ── Step 2: Agent loop ─────────────────────────────────────────────────────
section("Step 2 / 2 — Evidence-gathering agent loop");
console.log(`  ${DIM}(watch [evidenceLoop] lines to follow the agent's decisions)${RESET}\n`);

const startMs = Date.now();

let result;
try {
  result = await runEvidenceLoop({
    url,
    keyword: productName,
    productName,
    officialDomain,
    client,
    initialExtract: {
      pageTitle: extracted.pageTitle,
      h1: extracted.h1,
      visibleText: extracted.visibleTextExcerpt,
      diagnostics: {
        suspectedBlocking: extracted.diagnostics.suspectedBlocking,
        suspectedJsRendering: extracted.diagnostics.suspectedJsRendering,
        notes: extracted.diagnostics.notes,
      },
    },
  });
} catch (err: any) {
  console.error(`\n${RED}${BOLD}Agent loop failed: ${err.message}${RESET}`);
  process.exit(1);
}

const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

// ── Results ────────────────────────────────────────────────────────────────
const actionColor =
  result.recommendedAction === "escalate"   ? RED :
  result.recommendedAction === "auto_close" ? GREEN : YELLOW;

banner("AGENT VERDICT", actionColor);

console.log(`\n  ${BOLD}Recommended Action:${RESET}  ${actionColor}${BOLD}${result.recommendedAction.toUpperCase()}${RESET}`);
console.log(`  ${BOLD}Status:${RESET}             ${result.status}`);
console.log(`  ${BOLD}Risk Score:${RESET}          ${result.riskScore} / 100`);
console.log(`  ${BOLD}Confidence Score:${RESET}    ${result.confidenceScore} / 100`);
console.log(`  ${BOLD}Infringement Type:${RESET}   ${result.infringementType}`);
console.log(`  ${BOLD}Auto-close safe:${RESET}     ${result.autoCloseRisk}`);
console.log(`\n  ${BOLD}Reasoning:${RESET}`);
console.log(`  ${result.reasoningSummary}`);
console.log(`\n  ${DIM}Completed in ${elapsedSec}s${RESET}\n`);
