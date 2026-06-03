// Headless screenshot tool — uses puppeteer to capture a full page PNG.
// Puppeteer is optional: if it's not installed the tool returns an error
// that Gemini can handle gracefully by skipping visual analysis.

export interface ScreenshotResult {
  success: boolean;
  base64?: string;
  mimeType: "image/png";
  width?: number;
  height?: number;
  pageTitle?: string;
  error?: string;
}

export async function takeScreenshot(url: string): Promise<ScreenshotResult> {
  // Dynamic import — puppeteer is optional. If not installed the tool
  // returns an error that the agent can handle gracefully.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let puppeteer: any;
  try {
    // @ts-ignore — optional dependency, may not be installed
    puppeteer = await import("puppeteer");
  } catch {
    return {
      success: false,
      mimeType: "image/png",
      error: "puppeteer not installed — screenshot unavailable. Install with: npm install puppeteer",
    };
  }

  let browser: any;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    const pageTitle: string = await page.title();
    const screenshot: Buffer = await page.screenshot({ type: "png", fullPage: false });
    const base64 = Buffer.from(screenshot).toString("base64");

    console.log(`[screenshot] Captured ${url} (${base64.length} base64 chars)`);

    return {
      success: true,
      base64,
      mimeType: "image/png",
      width: 1280,
      height: 800,
      pageTitle,
    };
  } catch (err: any) {
    console.error(`[screenshot] Failed for ${url}:`, err.message);
    return { success: false, mimeType: "image/png", error: err.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
