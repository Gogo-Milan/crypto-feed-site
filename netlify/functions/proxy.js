const BACKEND_BASE = process.env.BACKEND_BASE;
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors, body: "ok" };

  if (!BACKEND_BASE) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "Missing env var BACKEND_BASE (your Apps Script /exec URL)" }) };
  }

  const qs = event.rawQuery ? ("&" + event.rawQuery) : "";
  const url = `${BACKEND_BASE}?${qs.replace(/^&/,'')}`;

  try {
    const resp = await fetch(url, { method: "GET", headers: { "Accept":"application/json" } });
    const text = await resp.text();
    return { statusCode: resp.status, headers: { "Content-Type":"application/json", ...cors }, body: text };
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: "Upstream error", detail: e.message }) };
  }
}