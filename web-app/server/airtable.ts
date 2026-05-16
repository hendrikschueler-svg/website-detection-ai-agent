// Airtable REST API client — direct integration, no Make.com middleman

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const TABLES = {
  keywords: "tblR4mgEXIUJFiTbL",
  sightings: "tblux7nvqO6Yg9t88",
  prompts: "tblEdFKZi1o0kYuTR",
} as const;

// ─── TypeScript Interfaces ────────────────────────────────────────────────────

export interface KeywordSetup {
  id: string;
  Keyword: string;
  Active: boolean;
  Client: string;
  ProductName: string;
  Engine: string;
  Geolocation: string;
  LanguageCode: string;
  GoogleDomain: string;
  OfficialDomain: string;
  Location: string;
  Market: string;
}

export interface Sighting {
  id: string;
  URL: string | null;
  Status: string | null;
  RiskScore: number | null;
  ConfidenceScore: number | null;
  InfringementType: string | null;
  ReasoningSummary: string | null;
  RecommendedAction: string | null;
  Client: string | null;
  ProductName: string | null;
  Keyword: string | null;
  RunId: string | null;
  Position: number | null;
  Snippet: string | null;
}

export interface NewSighting {
  URL: string;
  Status: string;
  Client: string;
  ProductName: string;
  Keyword: string;
  RunId: string;
  Position: number;
  Snippet: string;
}

export interface PromptConfig {
  systemPrompt: string;
  userPromptTemplate: string;
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

function baseHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function baseUrl(table: string) {
  return `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${table}`;
}

async function airtableFetch(url: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...options,
    headers: { ...baseHeaders(), ...(options.headers as any) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Airtable ${options.method ?? "GET"} ${url} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Fetch all records with automatic offset pagination (max 100 per page)
async function fetchAllRecords(tableId: string, params: URLSearchParams): Promise<any[]> {
  const all: any[] = [];
  let offset: string | undefined;

  do {
    if (offset) params.set("offset", offset);
    const url = `${baseUrl(tableId)}?${params}`;
    const data = await airtableFetch(url);
    all.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return all;
}

// ─── Field Mapper: Airtable record → TypeScript type ─────────────────────────

function toKeywordSetup(rec: any): KeywordSetup {
  const f = rec.fields ?? {};
  return {
    id: rec.id,
    Keyword: f["Keyword"] ?? "",
    Active: !!f["Active"],
    Client: f["Client"] ?? "",
    ProductName: f["Product Name"] ?? "",
    Engine: f["Engine"] ?? "google",
    Geolocation: f["Geolocation"] ?? "us",
    LanguageCode: f["Language Code"] ?? "en",
    GoogleDomain: f["Google Domain"] ?? "google.com",
    OfficialDomain: f["Official Domain"] ?? "",
    Location: f["Location"] ?? "",
    Market: f["Market"] ?? "",
  };
}

function toSighting(rec: any): Sighting {
  const f = rec.fields ?? {};
  return {
    id: rec.id,
    URL: f["URL"] ?? null,
    Status: f["Status"] ?? null,
    RiskScore: f["Risk Score"] ?? null,
    ConfidenceScore: f["Confidence Score"] ?? null,
    InfringementType: f["Infringement Type"] ?? null,
    ReasoningSummary: f["Reasoning Summary"] ?? null,
    RecommendedAction: f["Recommended Action"] ?? null,
    Client: f["Client"] ?? null,
    ProductName: f["Product Name"] ?? null,
    Keyword: f["Keyword"] ?? null,
    RunId: f["Run ID"] ?? null,
    Position: f["Position"] ?? null,
    Snippet: f["Snippet"] ?? null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Replaces Make.com Scenario 01 — loads all active keyword setups */
export async function getActiveKeywords(): Promise<KeywordSetup[]> {
  const params = new URLSearchParams({ filterByFormula: "{Active}=1" });
  const records = await fetchAllRecords(TABLES.keywords, params);
  return records.map(toKeywordSetup);
}

export async function getKeywordById(id: string): Promise<KeywordSetup> {
  const data = await airtableFetch(`${baseUrl(TABLES.keywords)}/${id}`);
  return toKeywordSetup(data);
}

/** Replaces Make.com Scenario 02 step — writes a new URL sighting */
export async function createSighting(data: NewSighting): Promise<string> {
  const body = {
    fields: {
      URL: data.URL,
      Status: data.Status,
      Client: data.Client,
      "Product Name": data.ProductName,
      Keyword: data.Keyword,
      "Run ID": data.RunId,
      Position: data.Position,
      Snippet: data.Snippet,
    },
  };
  const rec = await airtableFetch(baseUrl(TABLES.sightings), {
    method: "POST",
    body: JSON.stringify(body),
  });
  return rec.id as string;
}

export async function updateSighting(id: string, fields: Partial<{
  Status: string;
  "Risk Score": number;
  "Confidence Score": number;
  "Infringement Type": string;
  "Reasoning Summary": string;
  "Recommended Action": string;
}>): Promise<void> {
  await airtableFetch(`${baseUrl(TABLES.sightings)}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

/** Replaces Make.com Scenario 04 — reads results for a run */
export async function getSightingsByRunId(runId: string): Promise<Sighting[]> {
  const formula = `{Run ID}="${runId}"`;
  const params = new URLSearchParams({ filterByFormula: formula });
  const records = await fetchAllRecords(TABLES.sightings, params);
  return records.map(toSighting);
}

/** Loads the active AI prompt config, optionally filtered by client */
export async function getPromptConfig(client?: string): Promise<PromptConfig> {
  const formula = client
    ? `AND({Active}=1,{Client}="${client}")`
    : "{Active}=1";
  const params = new URLSearchParams({ filterByFormula: formula, maxRecords: "1" });
  const records = await fetchAllRecords(TABLES.prompts, params);

  if (records.length === 0) return getDefaultPromptConfig();

  const f = records[0].fields ?? {};
  return {
    systemPrompt: f["System Prompt"] ?? getDefaultPromptConfig().systemPrompt,
    userPromptTemplate: f["User Prompt Template"] ?? getDefaultPromptConfig().userPromptTemplate,
  };
}

function getDefaultPromptConfig(): PromptConfig {
  return {
    systemPrompt: `You are an IP enforcement specialist. Analyze websites for potential trademark infringement, counterfeiting, or unauthorized use of brand assets. Be precise and objective. Always return valid JSON.`,
    userPromptTemplate: `Analyze this website for IP infringement:

Keyword searched: {{keyword}}
Protected product: {{productName}}
Rights holder domain: {{officialDomain}}
URL analyzed: {{url}}
Page title: {{pageTitle}}
H1: {{h1}}

Visible text excerpt:
{{visibleText}}

Return ONLY this JSON (no markdown, no extra text):
{
  "status": "violation" | "clean" | "uncertain",
  "riskScore": <0-100>,
  "confidenceScore": <0-100>,
  "infringementType": "counterfeit" | "grey_market" | "design_copy" | "not_infringing" | "unclear",
  "reasoningSummary": "<one concise sentence>",
  "recommendedAction": "escalate" | "auto_close" | "human_review",
  "autoCloseRisk": <true|false>
}`,
  };
}
