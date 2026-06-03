// Evidence-gathering agent loop — replaces the single-shot Gemini call in
// aiWorker.ts when AGENT_MODE=true.
//
// Flow:
//   1. Send URL + initial scrape data to Gemini with function-calling tools.
//   2. Gemini calls tools (extract_url / get_screenshot / whois_lookup /
//      retry_with_proxy) as many times as needed to build evidence.
//   3. When Gemini is ready, it calls submit_verdict → loop returns.
//   4. Safety cap: MAX_ITERATIONS turns. If reached, returns human_review.

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Part } from "@google/generative-ai";
import type { AnalysisResult } from "../gemini";
import { extractUrl } from "../extract";
import { takeScreenshot } from "./tools/screenshot";
import { whoisLookup } from "./tools/whois";
import { proxyExtract } from "./tools/proxyExtract";

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 5;

const BASE_SYSTEM_PROMPT = `You are an expert IP infringement analyst. Your task is to determine whether a given URL infringes on a brand's intellectual property rights — counterfeiting, unauthorised reselling, trademark misuse, or domain squatting.

EVIDENCE STRATEGY
• Review the initial page data already provided before calling any tools.
• Prefer early termination: if confidenceScore >= 80, call submit_verdict immediately.
• Only collect the evidence you actually need. Do not call tools you don't need.
• If the page was blocked or text was empty → try retry_with_proxy first.
• If you need to verify branding, logos, or visual product imagery → use get_screenshot.
• If domain age or jurisdiction matters → use whois_lookup.
• Do not call the same tool twice for the same URL.
• You have a maximum of ${MAX_ITERATIONS - 1} tool calls before you MUST call submit_verdict.

VERDICT GUIDELINES
• riskScore 80-100 + status "violation" → recommendedAction "escalate"
• riskScore 0-20 + status "clean"      → recommendedAction "auto_close", autoCloseRisk true
• Everything else                       → recommendedAction "human_review"
• infringementType options: counterfeit | unauthorized_reseller | trademark_misuse | domain_squatting | none | unclear`;

// ─── Function declarations (Gemini tool schema) ─────────────────────────────

const FUNCTION_DECLARATIONS: any[] = [
  {
    name: "extract_url",
    description:
      "Scrape a URL and return its visible text, page title, h1, price data, and structural diagnostics (bot-blocking and JS-rendering signals). Use when the initial data looks incomplete or stale.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to scrape" },
      },
      required: ["url"],
    },
  },
  {
    name: "get_screenshot",
    description:
      "Take a visual screenshot of a URL and return it as a PNG image. Use to verify product imagery, branding, logos, or page layout that text alone cannot capture.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to screenshot" },
      },
      required: ["url"],
    },
  },
  {
    name: "whois_lookup",
    description:
      "Look up domain registration data: registrar, creation date, expiry, registrant country. Use to assess domain age (newly registered = suspicious), jurisdiction, or anomalous registration patterns.",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Domain name without protocol, e.g. example.com",
        },
      },
      required: ["domain"],
    },
  },
  {
    name: "retry_with_proxy",
    description:
      "Re-fetch a URL via a residential proxy (ScrapingBee). Use when the direct extract was blocked (suspectedBlocking=true) or returned empty visible text.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to fetch via proxy" },
      },
      required: ["url"],
    },
  },
  {
    name: "submit_verdict",
    description:
      "Submit your final analysis verdict. Call this when confidenceScore >= 80 OR you have gathered all useful evidence. This ends the investigation.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Overall assessment: 'violation' | 'clean' | 'uncertain'",
        },
        riskScore: {
          type: "number",
          description: "0-100. How likely this is an IP violation.",
        },
        confidenceScore: {
          type: "number",
          description: "0-100. How confident you are based on evidence gathered.",
        },
        infringementType: {
          type: "string",
          description:
            "counterfeit | unauthorized_reseller | trademark_misuse | domain_squatting | none | unclear",
        },
        reasoningSummary: {
          type: "string",
          description: "1-3 sentences explaining the verdict with key evidence cited.",
        },
        recommendedAction: {
          type: "string",
          description: "escalate | auto_close | human_review",
        },
        autoCloseRisk: {
          type: "boolean",
          description: "true only if confidently clean with no infringement risk",
        },
      },
      required: [
        "status",
        "riskScore",
        "confidenceScore",
        "infringementType",
        "reasoningSummary",
        "recommendedAction",
        "autoCloseRisk",
      ],
    },
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EvidenceLoopParams {
  url: string;
  keyword: string;
  productName: string;
  officialDomain: string;
  client: string;
  /** Custom system prompt from Airtable — appended after the base prompt */
  systemPrompt?: string;
  initialExtract: {
    pageTitle: string;
    h1: string;
    visibleText: string;
    diagnostics: {
      suspectedBlocking: boolean;
      suspectedJsRendering: boolean;
      notes: string[];
    };
  };
}

// ─── Tool dispatcher ─────────────────────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, any>
): Promise<{ parts: Part[]; summary: string }> {
  console.log(`[evidenceLoop] → tool: ${name}`, JSON.stringify(args));

  switch (name) {
    case "extract_url": {
      try {
        const r = await extractUrl(args.url as string);
        return {
          parts: [
            {
              functionResponse: {
                name,
                response: {
                  pageTitle: r.pageTitle,
                  h1: r.h1,
                  visibleText: r.visibleTextExcerpt.slice(0, 1200),
                  priceSnippets: r.priceSnippets,
                  suspectedBlocking: r.diagnostics.suspectedBlocking,
                  suspectedJsRendering: r.diagnostics.suspectedJsRendering,
                  notes: r.diagnostics.notes,
                },
              },
            } as unknown as Part,
          ],
          summary: `text=${r.visibleTextExcerpt.length}ch, blocking=${r.diagnostics.suspectedBlocking}`,
        };
      } catch (err: any) {
        return {
          parts: [{ functionResponse: { name, response: { error: err.message } } } as unknown as Part],
          summary: `failed: ${err.message}`,
        };
      }
    }

    case "get_screenshot": {
      const r = await takeScreenshot(args.url as string);
      if (!r.success || !r.base64) {
        return {
          parts: [
            { functionResponse: { name, response: { success: false, error: r.error } } } as unknown as Part,
          ],
          summary: `failed: ${r.error}`,
        };
      }
      // Pass both the metadata response AND the actual image so Gemini can visually analyze it
      return {
        parts: [
          {
            functionResponse: {
              name,
              response: {
                success: true,
                pageTitle: r.pageTitle,
                dimensions: `${r.width}x${r.height}`,
              },
            },
          } as unknown as Part,
          {
            inlineData: {
              mimeType: r.mimeType,
              data: r.base64,
            },
          } as Part,
        ],
        summary: `captured ${r.width}x${r.height}`,
      };
    }

    case "whois_lookup": {
      const r = await whoisLookup(args.domain as string);
      return {
        parts: [
          {
            functionResponse: {
              name,
              response: {
                domain: r.domain,
                registrar: r.registrar ?? "unknown",
                creationDate: r.creationDate ?? "unknown",
                expiryDate: r.expiryDate ?? "unknown",
                country: r.country ?? "unknown",
                status: r.status ?? [],
                ...(r.error ? { error: r.error } : {}),
              },
            },
          } as unknown as Part,
        ],
        summary: r.error
          ? `error: ${r.error}`
          : `registrar=${r.registrar}, created=${r.creationDate}, country=${r.country}`,
      };
    }

    case "retry_with_proxy": {
      const r = await proxyExtract(args.url as string);
      return {
        parts: [
          {
            functionResponse: {
              name,
              response: {
                proxyUsed: r.proxyUsed,
                pageTitle: r.pageTitle,
                h1: r.h1,
                visibleText: r.visibleTextExcerpt.slice(0, 1200),
                priceSnippets: r.priceSnippets,
                notes: r.diagnostics.notes,
                ...(r.error ? { error: r.error } : {}),
              },
            },
          } as unknown as Part,
        ],
        summary: r.error
          ? `error: ${r.error}`
          : `text=${r.visibleTextExcerpt.length}ch via proxy`,
      };
    }

    default:
      return {
        parts: [
          { functionResponse: { name, response: { error: `Unknown tool: ${name}` } } } as unknown as Part,
        ],
        summary: `unknown tool`,
      };
  }
}

// ─── Verdict parser ───────────────────────────────────────────────────────────

function parseVerdict(args: Record<string, any>): AnalysisResult {
  return {
    status: (args.status as AnalysisResult["status"]) ?? "uncertain",
    riskScore: Number(args.riskScore ?? 50),
    confidenceScore: Number(args.confidenceScore ?? 50),
    infringementType: String(args.infringementType ?? "unclear"),
    reasoningSummary: String(args.reasoningSummary ?? ""),
    recommendedAction: String(args.recommendedAction ?? "human_review"),
    autoCloseRisk: Boolean(args.autoCloseRisk),
  };
}

const FALLBACK_VERDICT: AnalysisResult = {
  status: "uncertain",
  riskScore: 0,
  confidenceScore: 0,
  infringementType: "unclear",
  reasoningSummary:
    "Agent reached maximum iterations without a conclusive verdict. Manual review required.",
  recommendedAction: "human_review",
  autoCloseRisk: false,
};

// ─── Main loop ────────────────────────────────────────────────────────────────

export async function runEvidenceLoop(
  params: EvidenceLoopParams
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const genAI = new GoogleGenerativeAI(apiKey);

  const systemInstruction = params.systemPrompt
    ? `${BASE_SYSTEM_PROMPT}\n\n--- BRAND-SPECIFIC INSTRUCTIONS ---\n${params.systemPrompt}`
    : BASE_SYSTEM_PROMPT;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }] as any,
    systemInstruction,
  });

  const chat = model.startChat();

  // ── Initial message with all pre-gathered data ────────────────────────────
  const initialMessage = `Analyze this URL for IP infringement against the brand/product below.

URL: ${params.url}
Brand: ${params.client}
Product: ${params.productName}
Search keyword: ${params.keyword}
Official domain: ${params.officialDomain || "(not specified)"}

--- INITIAL PAGE DATA (already scraped) ---
Page Title: ${params.initialExtract.pageTitle || "(empty)"}
H1: ${params.initialExtract.h1 || "(empty)"}
Visible Text (first 1200 chars):
${params.initialExtract.visibleText.slice(0, 1200) || "(empty)"}

Diagnostics:
- Suspected bot-blocking: ${params.initialExtract.diagnostics.suspectedBlocking}
- Suspected JS-only rendering: ${params.initialExtract.diagnostics.suspectedJsRendering}
- Notes: ${params.initialExtract.diagnostics.notes.join(", ") || "none"}

Review this data. If confidence is already ≥ 80, call submit_verdict now. Otherwise call the most useful tool to gather more evidence.`;

  console.log(`[evidenceLoop] Starting loop for ${params.url}`);

  let response = await chat.sendMessage(initialMessage);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const parts: any[] =
      response.response.candidates?.[0]?.content?.parts ?? [];

    // ── Check for submit_verdict ────────────────────────────────────────────
    const verdictCall = parts.find(
      (p) => p.functionCall?.name === "submit_verdict"
    );
    if (verdictCall?.functionCall) {
      const verdict = parseVerdict(verdictCall.functionCall.args ?? {});
      console.log(
        `[evidenceLoop] Verdict after ${iter + 1} turn(s): ` +
          `${verdict.recommendedAction} (risk=${verdict.riskScore}, confidence=${verdict.confidenceScore})`
      );
      return verdict;
    }

    // ── Collect all other tool calls ────────────────────────────────────────
    const toolCalls = parts.filter(
      (p) =>
        p.functionCall && p.functionCall.name !== "submit_verdict"
    );

    if (toolCalls.length === 0) {
      // Model returned plain text — try to parse it as a JSON verdict (fallback)
      const textPart = parts.find((p) => p.text);
      if (textPart?.text) {
        const raw = String(textPart.text).trim();
        try {
          const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
          const parsed = JSON.parse(fenced ? fenced[1] : raw);
          if (parsed.status !== undefined && parsed.riskScore !== undefined) {
            console.log(`[evidenceLoop] Parsed text response as verdict at iter ${iter + 1}`);
            return parseVerdict(parsed);
          }
        } catch {
          // Not valid JSON — fall through
        }
      }
      console.warn(`[evidenceLoop] No tool calls and no parseable verdict at iter ${iter + 1}`);
      break;
    }

    // ── Execute tools (parallel) and collect response parts ─────────────────
    const allResponseParts: Part[] = [];
    await Promise.all(
      toolCalls.map(async (part) => {
        const fc = part.functionCall;
        const { parts: responseParts, summary } = await callTool(
          fc.name,
          fc.args ?? {}
        );
        console.log(`[evidenceLoop] iter=${iter + 1} ${fc.name} → ${summary}`);
        allResponseParts.push(...responseParts);
      })
    );

    response = await chat.sendMessage(allResponseParts);
  }

  // Safety fallback
  console.warn(
    `[evidenceLoop] Safety fallback triggered for ${params.url} — returning human_review`
  );
  return FALLBACK_VERDICT;
}
