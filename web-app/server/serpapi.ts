// SerpAPI client — replaces Make.com URL Importer scenario's Google search step

export interface SearchResult {
  position: number;
  link: string;
  title: string;
  snippet: string;
}

export async function searchGoogle(params: {
  keyword: string;
  geolocation: string;
  languageCode: string;
  googleDomain: string;
  numResults?: number;
}): Promise<SearchResult[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("SERPAPI_KEY is not set");

  const query = new URLSearchParams({
    engine: "google",
    q: params.keyword,
    gl: params.geolocation.toLowerCase(),
    hl: params.languageCode.toLowerCase(),
    google_domain: params.googleDomain,
    num: String(params.numResults ?? 10),
    api_key: apiKey,
  });

  const res = await fetch(`https://serpapi.com/search.json?${query}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SerpAPI error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as any;
  const organic: any[] = data.organic_results ?? [];

  return organic.map(r => ({
    position: r.position ?? 0,
    link: r.link ?? "",
    title: r.title ?? "",
    snippet: r.snippet ?? "",
  }));
}
