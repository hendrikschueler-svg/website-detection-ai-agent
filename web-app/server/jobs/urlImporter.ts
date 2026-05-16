// URL Importer Job — replaces Make.com Scenarios 02 + 03
// Searches Google for a keyword setup and writes found URLs to Airtable as pending sightings.

import { getKeywordById, createSighting, getSightingsByRunId } from "../airtable";
import { searchGoogle } from "../serpapi";

export async function runUrlImport(setupId: string, runId: string): Promise<void> {
  console.log(`[urlImporter] Starting import — setupId=${setupId} runId=${runId}`);

  const setup = await getKeywordById(setupId);
  console.log(`[urlImporter] Loaded setup: "${setup.Keyword}" (${setup.Client})`);

  const results = await searchGoogle({
    keyword: setup.Keyword,
    geolocation: setup.Geolocation,
    languageCode: setup.LanguageCode,
    googleDomain: setup.GoogleDomain,
    numResults: 10,
  });

  console.log(`[urlImporter] SerpAPI returned ${results.length} results`);

  // Skip URLs already imported for this run to avoid duplicates on retry
  const existing = await getSightingsByRunId(runId);
  const existingUrls = new Set(existing.map(s => s.URL).filter(Boolean));

  let created = 0;
  for (const r of results) {
    if (!r.link || existingUrls.has(r.link)) continue;
    await createSighting({
      URL: r.link,
      Status: "pending",
      Client: setup.Client,
      ProductName: setup.ProductName,
      Keyword: setup.Keyword,
      RunId: runId,
      Position: r.position,
      Snippet: r.snippet,
    });
    created++;
  }

  console.log(`[urlImporter] Created ${created} new sightings for runId=${runId}`);
}
