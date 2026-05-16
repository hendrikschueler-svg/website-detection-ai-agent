// Gemini 2.5 Flash integration — replaces Make.com AI Worker scenarios

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface AnalysisResult {
  status: "violation" | "clean" | "uncertain";
  riskScore: number;
  confidenceScore: number;
  infringementType: string;
  reasoningSummary: string;
  recommendedAction: string;
  autoCloseRisk: boolean;
}

function buildUserMessage(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

export async function analyzeWebsite(params: {
  url: string;
  pageTitle: string;
  h1: string;
  visibleText: string;
  keyword: string;
  productName: string;
  officialDomain: string;
  systemPrompt: string;
  userPromptTemplate: string;
}): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  // Model name as of 2025 — update if Gemini releases a stable alias
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const userMessage = buildUserMessage(params.userPromptTemplate, {
    url: params.url,
    pageTitle: params.pageTitle,
    h1: params.h1,
    visibleText: params.visibleText.slice(0, 1200),
    keyword: params.keyword,
    productName: params.productName,
    officialDomain: params.officialDomain,
  });

  const chat = model.startChat({
    systemInstruction: params.systemPrompt,
    generationConfig: { responseMimeType: "application/json" },
  });

  const result = await chat.sendMessage(userMessage);
  const raw = result.response.text().trim();

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Strip markdown fences if model ignores responseMimeType
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    parsed = JSON.parse(fenced ? fenced[1] : raw);
  }

  return {
    status: parsed.status ?? "uncertain",
    riskScore: Number(parsed.riskScore ?? 50),
    confidenceScore: Number(parsed.confidenceScore ?? 50),
    infringementType: parsed.infringementType ?? "unclear",
    reasoningSummary: parsed.reasoningSummary ?? "",
    recommendedAction: parsed.recommendedAction ?? "human_review",
    autoCloseRisk: !!parsed.autoCloseRisk,
  };
}
