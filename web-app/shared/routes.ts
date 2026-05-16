import { z } from 'zod';
import {
  searchOptionsResponseSchema,
  startSearchRequestSchema,
  startSearchResponseSchema,
  getResultsResponseSchema,
} from './schema';

export type StartSearchRequest = z.infer<typeof startSearchRequestSchema>;

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

export const api = {
  search: {
    options: {
      method: 'GET' as const,
      path: '/api/search/options' as const,
      responses: {
        200: searchOptionsResponseSchema,
        500: errorSchemas.internal,
      },
    },
    start: {
      method: 'POST' as const,
      path: '/api/search/start' as const,
      input: startSearchRequestSchema,
      responses: {
        200: startSearchResponseSchema,
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
    results: {
      method: 'GET' as const,
      path: '/api/search/results/:runId' as const,
      responses: {
        200: getResultsResponseSchema,
        500: errorSchemas.internal,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) url = url.replace(`:${key}`, String(value));
    });
  }
  return url;
}
