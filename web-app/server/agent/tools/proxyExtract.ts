// ScrapingBee-based proxy extract — retries a URL through a residential
// proxy when the direct axios scrape was blocked or returned empty content.
// Requires SCRAPINGBEE_API_KEY in .env.

import axios from "axios";
import * as cheerio from "cheerio";
import type { ExtractResult } from "../../extract";

export type ProxyExtractResult = ExtractResult & { proxyUsed: boolean };

export async function proxyExtract(url: string): Promise<ProxyExtractResult> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;

  const noKeyResult = (): ProxyExtractResult => ({
    finalUrl: url,
    pageTitle: "",
    h1: "",
    priceSnippets: "",
    visibleTextExcerpt: "",
    htmlSnippet: "",
    diagnostics: {
      requestedUrl: url,
      finalUrl: url,
      httpStatus: null,
      contentType: "",
      htmlLength: 0,
      visibleTextLength: 0,
      priceCount: 0,
      titleFound: false,
      h1Found: false,
      suspectedBlocking: false,
      suspectedJsRendering: false,
      blockingIndicators: [],
      jsIndicators: [],
      notes: ["SCRAPINGBEE_API_KEY not set — proxy extract unavailable"],
    },
    proxyUsed: false,
    error: "SCRAPINGBEE_API_KEY not set",
  });

  if (!apiKey) return noKeyResult();

  try {
    const response = await axios.get("https://app.scrapingbee.com/api/v1/", {
      params: {
        api_key: apiKey,
        url,
        render_js: "false",
        premium_proxy: "true",
        block_ads: "true",
        return_page_source: "true",
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    const html: string =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

    const $ = cheerio.load(html);
    const pageTitle = $("title").text().trim();
    const h1 = $("h1").first().text().trim();

    $("body").find("script, style, noscript, nav, header, footer").remove();
    const rawText = ($("body").text() ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 1500);

    const priceRegex =
      /(?:\$|£|€|¥)\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b|\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\s?(?:USD|EUR|GBP|JPY)/gi;
    const priceMatches = rawText.match(priceRegex) ?? [];
    const priceSnippets = Array.from(new Set(priceMatches)).slice(0, 20).join(", ");

    console.log(
      `[proxyExtract] ${url} → HTTP ${response.status}, text=${rawText.length}ch`
    );

    return {
      finalUrl: url,
      pageTitle,
      h1,
      priceSnippets,
      visibleTextExcerpt: rawText,
      htmlSnippet: html.substring(0, 5000),
      diagnostics: {
        requestedUrl: url,
        finalUrl: url,
        httpStatus: response.status,
        contentType: String(response.headers?.["content-type"] ?? ""),
        htmlLength: html.length,
        visibleTextLength: rawText.length,
        priceCount: priceMatches.length,
        titleFound: !!pageTitle,
        h1Found: !!h1,
        suspectedBlocking: false,
        suspectedJsRendering: false,
        blockingIndicators: [],
        jsIndicators: [],
        notes: ["fetched via ScrapingBee premium proxy"],
      },
      proxyUsed: true,
    };
  } catch (err: any) {
    console.error(`[proxyExtract] Failed for ${url}:`, err.message);
    return {
      finalUrl: url,
      pageTitle: "",
      h1: "",
      priceSnippets: "",
      visibleTextExcerpt: "",
      htmlSnippet: "",
      diagnostics: {
        requestedUrl: url,
        finalUrl: url,
        httpStatus: null,
        contentType: "",
        htmlLength: 0,
        visibleTextLength: 0,
        priceCount: 0,
        titleFound: false,
        h1Found: false,
        suspectedBlocking: false,
        suspectedJsRendering: false,
        blockingIndicators: [],
        jsIndicators: [],
        notes: [`ScrapingBee error: ${err.message}`],
      },
      proxyUsed: true,
      error: err.message,
    };
  }
}
