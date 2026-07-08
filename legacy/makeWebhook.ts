// Make.com Webhook Helper
//
// Original Replit version used many duplicate auth params as a workaround:
// apiKey/key/api_key/token as query params, in the body, and in six different
// header names — because X-Make-ApiKey alone wasn't being picked up during testing.
// This version uses only the officially documented header.

export async function callMakeWebhook(url: string, apiKey: string, payload: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Make-ApiKey": apiKey,
    },
    body: JSON.stringify(payload ?? {}),
  });

  const text = await r.text();
  if (!r.ok) throw new Error(`Make webhook failed (${r.status}): ${text.slice(0, 200)}`);

  // Make.com sometimes returns structurally invalid JSON:
  //   1. {"setups": {obj1}, {obj2}}  — objects instead of array
  //   2. {obj1}, {obj2}              — multiple root objects
  //   3. double-stringified JSON     — string containing JSON
  // The block below normalises all three cases before the final parse.
  let clean = text.trim();
  try { return JSON.parse(clean); } catch {}

  if (clean.match(/"setups":\s*\{/) && !clean.includes('"setups": [')) {
    const i = clean.indexOf('"setups":'), j = clean.indexOf("{", i);
    const k = clean.lastIndexOf("}", clean.lastIndexOf("}") - 1);
    if (j !== -1 && k > j)
      clean = clean.slice(0, j) + "[" + clean.slice(j, k + 1).replace(/}\s*{/g, "},{") + "]" + clean.slice(k + 1);
  }
  if (/}\s*{/.test(clean)) clean = `[${clean.replace(/}\s*{/g, "},{")}]`;

  try {
    const d = JSON.parse(clean);
    return typeof d === "string" && (d.trimStart().startsWith("{") || d.trimStart().startsWith("["))
      ? JSON.parse(d)
      : d;
  } catch {
    throw new Error(`Make returned non-JSON: ${text.slice(0, 300)}`);
  }
}
