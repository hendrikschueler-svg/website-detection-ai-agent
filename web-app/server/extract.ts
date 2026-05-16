import type { Request, Response } from "express";
import axios from "axios";
import * as cheerio from "cheerio";

export async function handleExtract(req: Request, res: Response) {
  try {
    const { url: requestedUrl } = req.body;
    if (!requestedUrl) {
      return res.status(400).json({ error: "URL is required" });
    }

    const response = await axios.get(requestedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: () => true,
    });

    const html: string = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
    const httpStatus: number = response.status;
    const contentType: string = response.headers["content-type"] || "";
    const finalUrl: string = response.request?.res?.responseUrl || requestedUrl;
    const htmlLength = html.length;

    const $ = cheerio.load(html);
    const pageTitle = $("title").text().trim();
    const h1 = $("h1").first().text().trim();

    const blockingKeywords = [
      "captcha", "access denied", "forbidden", "verify you are human",
      "blocked", "cloudflare", "cf-chl", "attention required",
      "bot detection", "unusual traffic", "request unsuccessful",
      "denied", "perimeterx", "akamai", "incapsula",
    ];
    const htmlLower = html.toLowerCase();
    const blockingIndicators = blockingKeywords.filter(kw => htmlLower.includes(kw));
    const suspectedBlocking = blockingIndicators.length > 0;

    const jsPatterns: { pattern: string; check: () => boolean }[] = [
      { pattern: '<div id="root">', check: () => htmlLower.includes('<div id="root">') },
      { pattern: '<div id="app">', check: () => htmlLower.includes('<div id="app">') },
      { pattern: "__NEXT_DATA__", check: () => html.includes("__NEXT_DATA__") },
      { pattern: "window.__INITIAL_STATE__", check: () => html.includes("window.__INITIAL_STATE__") },
      { pattern: "enable javascript", check: () => htmlLower.includes("enable javascript") },
      { pattern: "javascript is required", check: () => htmlLower.includes("javascript is required") },
      { pattern: "<noscript>", check: () => htmlLower.includes("<noscript>") },
    ];
    const jsIndicators = jsPatterns.filter(p => p.check()).map(p => p.pattern);

    const noiseSelectors = [
      "script", "style", "noscript", "iframe", "svg",
      "nav", "header", "footer", "form", "input", "button", "select", "option", "aside",
      "[role='alert']", "[role='navigation']", "[role='banner']", "[role='contentinfo']",
      ".messages", ".message", ".breadcrumbs", ".breadcrumb",
      ".toolbar", ".filter", ".filters", ".navigation", ".nav", ".menu", ".submenu",
      ".cookie", ".cookie-banner", ".cookie-notice", ".cookie-consent",
      ".newsletter", ".modal", ".popup", ".authenticationPopup",
      ".sidebar", ".widget", ".social", ".share",
      "[aria-hidden='true']", "[style*='display:none']", "[style*='display: none']",
      ".sr-only", ".visually-hidden", ".hidden",
    ].join(", ");

    $("body").find(noiseSelectors).remove();

    const containerSelectors = [
      "main", "article", ".product-info-main", ".product.attribute.description",
      ".category-description", ".category-view", ".column.main", "[role='main']",
      "#content", "#main-content", ".main-content", ".page-content", ".content",
    ];

    let contentContainer: any = null;
    for (const sel of containerSelectors) {
      const el = $(sel);
      if (el.length > 0 && (el.text() || "").trim().length > 50) {
        contentContainer = el.first();
        break;
      }
    }
    if (!contentContainer) contentContainer = $("body");

    const rawText = contentContainer.text() || "";
    const priceRegex = /(?:\$|£|€|¥)\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b|\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\s?(?:USD|EUR|GBP|JPY|AUD|CAD|CHF|CNY|SEK|NZD|€|£|\$|¥)/gi;
    const priceMatches = rawText.match(priceRegex) || [];
    const priceSnippets = [...new Set(priceMatches)].slice(0, 20).join(", ");

    const visibleText = rawText
      .replace(/\s+/g, " ")
      .replace(/(\b\w+(?:\s+\w+){0,3}\b)(?:\s+\1){2,}/gi, "$1")
      .trim()
      .substring(0, 1500);

    const cleanContainer = contentContainer.clone();
    cleanContainer.find(noiseSelectors).remove();
    cleanContainer.find("[data-bind], [data-mage-init], [data-role]").each(function (this: any) {
      $(this).removeAttr("data-bind").removeAttr("data-mage-init").removeAttr("data-role");
    });
    const htmlSnippet = (cleanContainer.html() || "").substring(0, 5000);

    const visibleTextLength = visibleText.length;
    const lowTextRatio = htmlLength > 5000 && visibleTextLength < 100;
    const allJsIndicators = lowTextRatio ? [...jsIndicators, "very low visible text"] : jsIndicators;
    const suspectedJsRendering = allJsIndicators.length > 0;

    const notes: string[] = [];
    if (finalUrl !== requestedUrl) notes.push("redirected away from requested URL");
    if (!pageTitle) notes.push("title missing");
    if (!h1) notes.push("h1 missing");
    if (suspectedBlocking) notes.push("possible bot challenge");
    if (lowTextRatio) notes.push("very low visible text");
    if (allJsIndicators.some(i => ['<div id="root">', '<div id="app">', "__NEXT_DATA__"].includes(i)))
      notes.push("app shell detected");
    if (httpStatus >= 400) notes.push(`upstream returned HTTP ${httpStatus}`);

    console.log("[EXTRACT]", JSON.stringify({
      requestedUrl, finalUrl, httpStatus,
      contentType: contentType.substring(0, 80),
      htmlLength, visibleTextLength, suspectedBlocking, suspectedJsRendering,
    }));

    return res.json({
      finalUrl, pageTitle, h1, priceSnippets, visibleTextExcerpt: visibleText, htmlSnippet,
      diagnostics: {
        requestedUrl, finalUrl, httpStatus, contentType, htmlLength, visibleTextLength,
        priceCount: priceMatches.length, titleFound: !!pageTitle, h1Found: !!h1,
        suspectedBlocking, suspectedJsRendering,
        blockingIndicators, jsIndicators: allJsIndicators, notes,
      },
    });
  } catch (error: any) {
    const requestedUrl = req.body?.url || "";
    const errCode = error.code || "";
    const errMessage = error.message || "Unknown error";

    const resetCodes = ["ECONNRESET", "ECONNABORTED", "ECONNREFUSED", "EPIPE", "ERR_SOCKET_CLOSED"];
    const tlsCodes = ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID", "DEPTH_ZERO_SELF_SIGNED_CERT"];
    const timeoutCodes = ["ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNTIMEDOUT"];
    const dnsCodes = ["ENOTFOUND", "EAI_AGAIN"];

    let suspectedBlocking = false;
    const notes: string[] = [];

    if (errMessage.includes("socket hang up") || resetCodes.includes(errCode)) {
      notes.push("connection terminated by upstream", "possible anti-bot blocking");
      suspectedBlocking = true;
    } else if (tlsCodes.includes(errCode) || errMessage.includes("SSL") || errMessage.includes("TLS")) {
      notes.push("network or TLS failure");
    } else if (timeoutCodes.includes(errCode) || errMessage.includes("timeout")) {
      notes.push("request timed out", "possible anti-bot blocking");
      suspectedBlocking = true;
    } else if (dnsCodes.includes(errCode)) {
      notes.push("DNS resolution failed");
    } else if (errMessage.includes("redirect") || errCode === "ERR_FR_TOO_MANY_REDIRECTS") {
      notes.push("redirect or handshake issue");
    } else {
      notes.push("network or fetch failure");
    }

    console.error("[EXTRACT ERROR]", JSON.stringify({
      requestedUrl, errorCode: errCode, errorMessage: errMessage,
      errorStack: (error.stack || "").substring(0, 500),
    }));

    return res.status(200).json({
      finalUrl: "", pageTitle: "", h1: "", priceSnippets: "",
      visibleTextExcerpt: "", htmlSnippet: "",
      diagnostics: {
        requestedUrl, finalUrl: "", httpStatus: null, contentType: "",
        htmlLength: 0, visibleTextLength: 0, priceCount: 0,
        titleFound: false, h1Found: false,
        suspectedBlocking, suspectedJsRendering: false,
        blockingIndicators: suspectedBlocking ? [errCode || errMessage] : [],
        jsIndicators: [], notes,
        fetchError: {
          name: error.name || "Error", message: errMessage, code: errCode,
          errno: error.errno || "", syscall: error.syscall || "",
          hostname: error.hostname || "", targetUrl: requestedUrl,
        },
      },
      error: errMessage,
    });
  }
}
