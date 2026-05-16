import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl, type StartSearchRequest } from "@shared/routes";
import { z } from "zod";

function parseWithLogging<T>(schema: any, data: unknown, label: string): T {
  if (!data || typeof data !== "object") {
    console.error(`[Data] ${label} received non-object data:`, data);
    return (Array.isArray(schema) ? [] : {}) as T;
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    return data as T;
  }
  return result.data;
}

export function useSearchOptions() {
  return useQuery({
    queryKey: [api.search.options.path],
    queryFn: async () => {
      const res = await fetch(api.search.options.path, { credentials: "include" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to fetch search options");
      }
      const data = await res.json();
      return parseWithLogging<z.infer<typeof api.search.options.responses[200]>>(
        api.search.options.responses[200], data, "search.options"
      );
    },
  });
}

export function useStartSearch() {
  return useMutation({
    mutationFn: async (data: StartSearchRequest) => {
      const res = await fetch(api.search.start.path, {
        method: api.search.start.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || "Failed to start search");

      const validated = parseWithLogging<z.infer<typeof api.search.start.responses[200]>>(
        api.search.start.responses[200], resData, "search.start"
      );
      if (!validated?.runId) throw new Error("No runId returned from start search");
      return validated;
    },
  });
}

export function useSearchResults(runId: string | null) {
  return useQuery({
    queryKey: [api.search.results.path, runId],
    enabled: !!runId && runId !== "undefined",
    placeholderData: (previousData) => previousData,
    refetchInterval: (query) => {
      const data: any = query.state.data;
      const results = data?.results;
      if (Array.isArray(results) && results.length > 0) {
        const stillLoading = results.some((r: any) => {
          const status = r.Status?.toLowerCase();
          return !status || ["processing", "analyzing"].includes(status);
        });
        if (!stillLoading) return false;
      }
      if (data?.status === "done" || data?.status === "error") return false;
      return 5000;
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    queryFn: async () => {
      if (!runId || runId === "undefined") throw new Error("No runId provided");
      const url = buildUrl(api.search.results.path, { runId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to fetch results");
      }
      const data = await res.json();
      return parseWithLogging<z.infer<typeof api.search.results.responses[200]>>(
        api.search.results.responses[200], data, "search.results"
      );
    },
  });
}
