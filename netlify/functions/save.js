const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function withCors(init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Headers(headers);
}

function jsonResponse(body, init = {}) {
  const headers = withCors({
    headers: {
      ...JSON_HEADERS,
      ...(init.headers || {}),
    },
  });

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withCors(),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method Not Allowed" }, { status: 405 });
  }

  const targetUrl = process.env.SAVE_TARGET_URL;
  if (!targetUrl) {
    console.error("Missing SAVE_TARGET_URL environment variable");
    return jsonResponse({ ok: false, error: "SAVE_TARGET_URL is not configured" }, { status: 500 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch (error) {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error("Failed to reach SAVE_TARGET_URL", error);
    return jsonResponse({ ok: false, error: "Failed to reach upstream service" }, { status: 504 });
  }

  let parsedBody = null;
  let rawBody = "";
  try {
    rawBody = await upstreamResponse.text();
  } catch (error) {
    console.error("Failed to read upstream response body", error);
  }

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      parsedBody = { message: rawBody };
    }
  }

  const responseBody = parsedBody ?? {};
  const status = upstreamResponse.status || 200;

  if (!upstreamResponse.ok) {
    const errorMessage =
      (responseBody && (responseBody.error || responseBody.message)) ||
      upstreamResponse.statusText ||
      `HTTP ${status}`;
    return jsonResponse({ ok: false, error: errorMessage, details: responseBody }, { status });
  }

  return new Response(JSON.stringify(responseBody), {
    status,
    headers: withCors({ headers: JSON_HEADERS }),
  });
};
