// AI Worker Job — replaces Make.com Scenarios 05 + 06
// Processes pending sightings: scrape URL → AI analysis → write result to Airtable.
//
// AGENT_MODE=true  → evidence-gathering loop (evidenceLoop.ts, Gemini function calling)
// AGENT_MODE=false → single-shot prompt (gemini.ts, backward-compatible)

import { getSightingsByRunId, updateSighting, getPromptConfig } from "../airtable";
import { extractUrl } from "../extract";
import { analyzeWebsite } from "../gemini";
import { runEvidenceLoop } from "../agent/evidenceLoop";

const DELAY_BETWEEN_CALLS_MS = 10_000;
const AGENT_MODE = process.env.AGENT_MODE === "true";

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

/** Process a single sighting record end-to-end */
export async function processSighting(sightingId: string, opts: {
  url: string;
  keyword: string;
  productName: string;
  officialDomain: string;
  client: string;
}): Promise<void> {
  await updateSighting(sightingId, { Status: "analyzing" });

  // Step 1: initial scrape (always required — agent uses it as starting context)
  let extracted;
  try {
    extracted = await extractUrl(opts.url);
  } catch (err: any) {
    console.error(`[aiWorker] extractUrl failed for ${opts.url}:`, err.message);
    await updateSighting(sightingId, { Status: "error" });
    return;
  }

  const { systemPrompt, userPromptTemplate } = await getPromptConfig(opts.client);

  // Step 2: AI analysis — agent loop or single-shot depending on AGENT_MODE
  let analysis;
  try {
    if (AGENT_MODE) {
      console.log(`[aiWorker] AGENT_MODE=true — running evidence loop for ${opts.url}`);
      analysis = await runEvidenceLoop({
        url: opts.url,
        keyword: opts.keyword,
        productName: opts.productName,
        officialDomain: opts.officialDomain,
        client: opts.client,
        systemPrompt,           // custom prompt from Airtable passed to agent
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
    } else {
      console.log(`[aiWorker] AGENT_MODE=false — single-shot analysis for ${opts.url}`);
      analysis = await analyzeWebsite({
        url: opts.url,
        pageTitle: extracted.pageTitle,
        h1: extracted.h1,
        visibleText: extracted.visibleTextExcerpt,
        keyword: opts.keyword,
        productName: opts.productName,
        officialDomain: opts.officialDomain,
        systemPrompt,
        userPromptTemplate,
      });
    }
  } catch (err: any) {
    console.error(`[aiWorker] Analysis failed for ${opts.url}:`, err.message);
    await updateSighting(sightingId, { Status: "error" });
    return;
  }

  // Step 3: map AnalysisResult → Airtable status label
  const airtableStatus =
    analysis.recommendedAction === "escalate"   ? "Takedown Recommended"
    : analysis.recommendedAction === "auto_close" ? "Auto Closed"
    : "Human Review";

  await updateSighting(sightingId, {
    Status: airtableStatus,
    "Risk Score": analysis.riskScore / 100,
    "Confidence Score": analysis.confidenceScore / 100,
    "Infringement Type": analysis.infringementType,
    "Reasoning Summary": analysis.reasoningSummary,
    "Recommended Action": analysis.recommendedAction,
  });

  console.log(
    `[aiWorker] ${opts.url} → ${airtableStatus} ` +
    `(risk=${analysis.riskScore}, confidence=${analysis.confidenceScore}, mode=${AGENT_MODE ? "agent" : "single-shot"})`
  );
}

/** Processes all pending sightings for a run sequentially */
export async function processAllPendingForRun(runId: string): Promise<void> {
  console.log(`[aiWorker] Starting processing for runId=${runId} (AGENT_MODE=${AGENT_MODE})`);

  const sightings = await getSightingsByRunId(runId);
  const pending = sightings.filter(s => s.Status === "pending");
  console.log(`[aiWorker] ${pending.length} pending sightings to process`);

  for (let i = 0; i < pending.length; i++) {
    const s = pending[i];
    if (!s.URL) continue;

    try {
      await processSighting(s.id, {
        url: s.URL,
        keyword: s.Keyword ?? "",
        productName: s.ProductName ?? "",
        officialDomain: "",
        client: s.Client ?? "",
      });
    } catch (err: any) {
      console.error(`[aiWorker] Unexpected error on sighting ${s.id}:`, err.message);
    }

    if (i < pending.length - 1) {
      await sleep(DELAY_BETWEEN_CALLS_MS);
    }
  }

  console.log(`[aiWorker] Finished processing run ${runId}`);
}
