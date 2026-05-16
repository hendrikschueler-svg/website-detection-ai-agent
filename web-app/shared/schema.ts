import { z } from 'zod';

export const searchOptionRecordSchema = z.object({
  id: z.string(),
  Client: z.string(),
  "Product Name": z.string(),
  Keyword: z.string().optional().nullable(),
});

export const searchOptionsResponseSchema = z.object({
  clients: z.array(z.string()),
  products: z.array(z.string()),
  keywords: z.array(z.string()),
  setups: z.array(searchOptionRecordSchema),
});

export const startSearchRequestSchema = z.object({
  setupRecordId: z.string(),
});

export const startSearchResponseSchema = z.object({
  runId: z.string(),
});

export const searchResultSchema = z.object({
  recordId: z.string().optional(),
  URL: z.string().optional().nullable(),
  Status: z.string().optional().nullable(),
  "Infringement Type": z.string().optional().nullable(),
  "Risk Score": z.number().optional().nullable(),
  "Confidence Score": z.number().optional().nullable(),
  "Recommended Action": z.string().optional().nullable(),
  "Reasoning Summary": z.string().optional().nullable(),
});

export const getResultsResponseSchema = z.object({
  status: z.string(),
  results: z.array(searchResultSchema),
});
