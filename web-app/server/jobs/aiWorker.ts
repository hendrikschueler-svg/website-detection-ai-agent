// AI Worker Job — replaces Make.com Scenarios 05 + 06
// Processes pending sightings: scrape URL → Gemini analysis → write result to Airtable.

import { getSightingsByRunId, updateSighting, getPromptConfig } from "../airtable";
import { extractUrl } from "../extract";
import { analyzeWebsite } from "../gemini";

const DELAY_BETWEEN_CALLS_MS = 10_000;

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

  let extracted;
  try {
    extracted = await extractUrl(opts.url);
  } catch (err: any) {
    console.error(`[aiWorker] extractUrl failed for ${opts.url}:`, err.message);
    await updateSighting(sightingId, { Status: "error" });
    return;
  }

  const { systemPrompt, userPromptTemplate } = await getPromptConfig(opts.client);

  let analysis;
  try {
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
  } catch (err: any) {
    console.error(`[aiWorker] Gemini analysis failed for ${opts.url}:`, err.message);
    await updateSighting(sightingId, { Status: "error" });
    return;
  }

  const airtableStatus =
    analysis.recommendedAction === "escalate" ? "Takedown Recommended"
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

  console.log(`[aiWorker] Processed ${opts.url} → ${airtableStatus} (risk=${analysis.riskScore})`);
}

/** Processes all pending sightings for a run sequentially */
export async function processAllPendingForRun(runId: string): Promise<void> {
  console.log(`[aiWorker] Starting AI processing for runId=${runId}`);

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
        officialDomain: "",       // loaded from keyword setup in airtable.ts if needed
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
