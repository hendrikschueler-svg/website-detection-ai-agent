import type { Express } from "express";
import type { Server } from "http";
import type { Request, Response, NextFunction } from "express";
import { api } from "@shared/routes";
import { z } from "zod";
import { callMakeWebhook } from "./makeWebhook";
import { handleExtract } from "./extract";
import { mockSetups, mockSightings, mockRunStore } from "./mockData";

const MOCK = process.env.MOCK_MODE === "true";

const resultsCache = new Map<string, any>();

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // Root-level routes (used by Make.com AI Worker V1.2.2 directly)
  app.post("/start-search", async (req, res) => {
    const { setupRecordId } = req.body;
    if (!setupRecordId) return res.status(400).json({ message: "setupRecordId is required" });

    try {
      const url = process.env.MAKE_START_SEARCH_URL!;
      const apiKey = process.env.MAKE_API_KEY!;
      const result = await callMakeWebhook(url, apiKey, { setupRecordId });
      res.status(200).json(typeof result === "string" ? { message: result } : result);
    } catch (err: any) {
      res.status(502).json({ error: err.message });
    }
  });

  app.post("/results", async (req, res) => {
    const { runId } = req.body;
    if (!runId) return res.status(400).json({ message: "runId is required" });

    try {
      const url = process.env.MAKE_GET_RESULTS_URL!;
      const apiKey = process.env.MAKE_API_KEY!;
      const result = await callMakeWebhook(url, apiKey, { runId });
      res.status(200).json(typeof result === "string" ? { message: result } : result);
    } catch (err: any) {
      res.status(502).json({ error: err.message });
    }
  });

  // GET /api/search/options — fetches available client/product/keyword setups from Make.com
  app.get(api.search.options.path, async (req, res) => {
    if (MOCK) {
      const clients = [...new Set(mockSetups.map(s => s.Client))].sort();
      const products = [...new Set(mockSetups.map(s => s["Product Name"]))].sort();
      const keywords = [...new Set(mockSetups.map(s => s.Keyword))].sort();
      res.set("Cache-Control", "no-store");
      return res.json({ clients, products, keywords, setups: mockSetups });
    }

    try {
      const webhookUrl = "https://hook.eu2.make.com/sqiybon7alox68feu70fdiiulb4fsuvq";
      const apiKey = process.env.MAKE_API_KEY!;
      const data = await callMakeWebhook(webhookUrl, apiKey, {});

      let setups: any[] = [];
      if (Array.isArray(data)) {
        setups = data.map(b => b.setups).filter(Boolean).flatMap(s => Array.isArray(s) ? s : [s]);
      } else if (data?.setups) {
        setups = Array.isArray(data.setups) ? data.setups : [data.setups];
      }

      const clients = [...new Set(setups.map((s: any) => s.Client).filter(Boolean))].sort();
      const products = [...new Set(setups.map((s: any) => s["Product Name"]).filter(Boolean))].sort();
      const keywords = [...new Set(setups.map((s: any) => s.Keyword).filter(Boolean))].sort();

      res.set("Cache-Control", "no-store");
      return res.json({ clients, products, keywords, setups });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/search/start — triggers Make.com Start Search scenario, returns runId
  app.post(api.search.start.path, async (req, res) => {
    if (MOCK) {
      const { setupRecordId } = req.body;
      const runId = `mock-run-${Date.now()}`;
      mockRunStore.set(runId, setupRecordId ?? "");
      return res.json({ runId });
    }

    try {
      const input = api.search.start.input.parse(req.body);
      const webhookUrl = process.env.START_SEARCH_URL!;
      const apiKey = process.env.MAKE_API_KEY!;

      const result = await callMakeWebhook(webhookUrl, apiKey, input);
      const finalResult = typeof result === "string" ? JSON.parse(result) : result;

      if (typeof finalResult === "object" && finalResult !== null) {
        return res.json(finalResult);
      }
      res.status(500).json({ message: "Make returned invalid response format", body: result });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/search/results/:runId — polls Make.com for AI analysis results
  app.get(api.search.results.path, async (req, res) => {
    if (MOCK) {
      const { runId } = req.params;
      const setupRecordId = mockRunStore.get(runId);
      const results = setupRecordId && mockSightings[setupRecordId]
        ? mockSightings[setupRecordId]
        : Object.values(mockSightings).flat();
      return res.json({ results });
    }

    try {
      const { runId } = req.params;
      const webhookUrl = process.env.GET_RESULTS_URL!;
      const apiKey = process.env.MAKE_API_KEY!;

      let response: any;
      try {
        response = await callMakeWebhook(webhookUrl, apiKey, { runId });
        resultsCache.set(runId, response);
      } catch (err: any) {
        if (err.status === 429 && resultsCache.has(runId)) {
          response = resultsCache.get(runId);
        } else if (err.status === 429) {
          return res.json({ results: [], rateLimited: true });
        } else {
          throw err;
        }
      }

      function extractResults(payload: any): any[] {
        if (!payload) return [];
        if (!Array.isArray(payload) && typeof payload === "object" && "results" in payload) {
          const r = (payload as any).results;
          return Array.isArray(r) ? r : r ? [r] : [];
        }
        if (Array.isArray(payload)) {
          return payload.flatMap(item =>
            item && "results" in item
              ? Array.isArray(item.results) ? item.results : item.results ? [item.results] : []
              : []
          );
        }
        return [];
      }

      const records = extractResults(response);

      const rootClient = (response as any).Client ?? (Array.isArray(response) ? response[0]?.Client : null) ?? null;
      const rootProduct = (response as any)["Product Name"] ?? (Array.isArray(response) ? response[0]?.["Product Name"] : null) ?? null;
      const rootKeyword = (response as any).Keyword ?? (Array.isArray(response) ? response[0]?.Keyword : null) ?? null;

      const mappedResults = records.map((r: any) => ({
        id: r.id,
        URL: r.URL ?? r.fldkBNYiJ6n6Ydo91 ?? null,
        Status: r.Status ?? r.fldrPXMzV82Du1Usp ?? null,
        "Risk Score": r["Risk Score"] ?? r.fld7RwVPnWNNdTOWe ?? null,
        "Confidence Score": r["Confidence Score"] ?? r.fldkxi92Pb3YM9NmM ?? null,
        "Infringement Type": r["Infringement Type"] ?? r.flddP2LuFx4CZW2Ne ?? null,
        "Reasoning Summary": r["Reasoning Summary"] ?? r.fldawLOToq7h3dNcA ?? null,
        "Recommended Action": r["Recommended Action"] ?? r.fldLJOCv8NGLISkPo ?? null,
        Client: r.Client ?? rootClient ?? null,
        "Product Name": r["Product Name"] ?? rootProduct ?? null,
        Keyword: r.Keyword ?? rootKeyword ?? null,
      }));

      return res.json({ results: mappedResults });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true, mock: MOCK }));

  // POST /api/extract — scrapes a URL and returns visible text + diagnostics for Gemini
  app.post("/api/extract", handleExtract);

  // Central error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("[routes] Unhandled error:", err);
    if (!res.headersSent) res.status(status).json({ message });
  });

  return httpServer;
}
