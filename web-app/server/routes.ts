import type { Express } from "express";
import type { Server } from "http";
import type { Request, Response, NextFunction } from "express";
import { api } from "@shared/routes";
import { z } from "zod";
import { handleExtract } from "./extract";
import { mockSetups, mockSightings, mockRunStore } from "./mockData";
import { getActiveKeywords, getSightingsByRunId } from "./airtable";
import { runUrlImport } from "./jobs/urlImporter";
import { processAllPendingForRun } from "./jobs/aiWorker";

const MOCK = process.env.MOCK_MODE === "true";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // GET /api/search/options — loads active keyword setups
  app.get(api.search.options.path, async (req, res) => {
    if (MOCK) {
      const clients = [...new Set(mockSetups.map(s => s.Client))].sort();
      const products = [...new Set(mockSetups.map(s => s["Product Name"]))].sort();
      const keywords = [...new Set(mockSetups.map(s => s.Keyword))].sort();
      res.set("Cache-Control", "no-store");
      return res.json({ clients, products, keywords, setups: mockSetups });
    }

    try {
      const setups = await getActiveKeywords();
      const clients = [...new Set(setups.map(s => s.Client).filter(Boolean))].sort();
      const products = [...new Set(setups.map(s => s.ProductName).filter(Boolean))].sort();
      const keywords = [...new Set(setups.map(s => s.Keyword).filter(Boolean))].sort();

      // Reshape to the format the frontend expects
      const setupsForClient = setups.map(s => ({
        id: s.id,
        Client: s.Client,
        "Product Name": s.ProductName,
        Keyword: s.Keyword,
      }));

      res.set("Cache-Control", "no-store");
      return res.json({ clients, products, keywords, setups: setupsForClient });
    } catch (err: any) {
      console.error("[routes] /api/search/options error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/search/start — generates runId, kicks off URL import + AI processing in background
  app.post(api.search.start.path, async (req, res) => {
    if (MOCK) {
      const { setupRecordId } = req.body;
      const runId = `mock-run-${Date.now()}`;
      mockRunStore.set(runId, setupRecordId ?? "");
      return res.json({ runId });
    }

    try {
      const input = api.search.start.input.parse(req.body);
      const runId = crypto.randomUUID();

      // Fire and forget — client polls /api/search/results while jobs run
      (async () => {
        try {
          await runUrlImport(input.setupRecordId, runId);
          await processAllPendingForRun(runId);
        } catch (err: any) {
          console.error(`[routes] Background job failed for runId=${runId}:`, err.message);
        }
      })();

      return res.json({ runId });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      console.error("[routes] /api/search/start error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/search/results/:runId — returns current sightings for a run
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
      const sightings = await getSightingsByRunId(runId);

      const results = sightings.map(s => ({
        id: s.id,
        URL: s.URL,
        Status: s.Status,
        "Risk Score": s.RiskScore,
        "Confidence Score": s.ConfidenceScore,
        "Infringement Type": s.InfringementType,
        "Reasoning Summary": s.ReasoningSummary,
        "Recommended Action": s.RecommendedAction,
        Client: s.Client,
        "Product Name": s.ProductName,
        Keyword: s.Keyword,
      }));

      return res.json({ results });
    } catch (err: any) {
      console.error("[routes] /api/search/results error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true, mock: MOCK }));

  // POST /api/extract — scrapes a URL, used by external callers and aiWorker internally
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
