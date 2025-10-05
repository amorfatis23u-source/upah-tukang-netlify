const NORMALIZED_ENV_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  process.env.DEPLOY_URL,
  process.env.DEPLOY_PRIME_URL,
  process.env.URL,
  process.env.NETLIFY_DEV_SERVER_URL,
]
  .map((value) => (typeof value === "string" ? value.trim() : ""))
  .filter(Boolean);

const ALLOWED_ORIGIN = NORMALIZED_ENV_ORIGINS[0] || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  Vary: "Origin",
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function withCors(init = {}) {
  const headers = new Headers(init.headers || {});
  if (ALLOWED_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  }

  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  return headers;
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

function isOriginAllowed(origin) {
  if (!origin) {
    return true;
  }

  if (!ALLOWED_ORIGIN) {
    return false;
  }

  return origin === ALLOWED_ORIGIN;
}

function buildErrorBody(error, details) {
  return {
    ok: false,
    error,
    ...(details === undefined ? {} : { details }),
  };
}

export default async (req) => {
  const requestOrigin = req.headers.get("origin");

  if (!isOriginAllowed(requestOrigin)) {
    console.error("save-function: blocked origin", { origin: requestOrigin });
    return jsonResponse(buildErrorBody("Origin Not Allowed"), { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withCors(),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(buildErrorBody("Method Not Allowed"), { status: 405 });
  }

  const targetUrl = process.env.SAVE_TARGET_URL;
  if (!targetUrl) {
    console.error("Missing SAVE_TARGET_URL environment variable");
    return jsonResponse(buildErrorBody("SAVE_TARGET_URL is not configured"), { status: 500 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch (error) {
    console.error("save-function: failed to parse JSON body", {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(
      buildErrorBody("Invalid JSON body", {
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 400 },
    );
  }

  const isPayloadValid =
    payload &&
    typeof payload === "object" &&
    typeof payload.html === "string" &&
    payload.html.trim().length > 0 &&
    payload.meta &&
    typeof payload.meta === "object";

  if (!isPayloadValid) {
    console.error("save-function: invalid payload", {
      hasHtml: Boolean(payload && typeof payload.html === "string"),
      hasMeta: Boolean(payload && typeof payload.meta === "object"),
    });
    return jsonResponse(buildErrorBody("Invalid payload", { field: "html/meta" }), {
      status: 400,
    });
  }

  console.info("save-function: received payload", {
    meta: payload.meta,
    htmlLength: payload.html.length,
  });

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error("save-function: failed to reach SAVE_TARGET_URL", {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(
      buildErrorBody("Failed to reach upstream service", {
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: /timeout/i.test(String(error)) ? 504 : 502 },
    );
  }

  let parsedBody = null;
  let rawBody = "";
  try {
    rawBody = await upstreamResponse.text();
  } catch (error) {
    console.error("save-function: failed to read upstream response body", {
      message: error instanceof Error ? error.message : String(error),
    });
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

  console.info("save-function: upstream response", {
    status,
    ok: upstreamResponse.ok,
    body: responseBody,
  });

  if (!upstreamResponse.ok) {
    const errorMessage =
      (responseBody && (responseBody.error || responseBody.message)) ||
      upstreamResponse.statusText ||
      `HTTP ${status}`;
    return jsonResponse(buildErrorBody(errorMessage, responseBody), { status });
  }

  return new Response(JSON.stringify(responseBody), {
    status,
    headers: withCors({ headers: JSON_HEADERS }),
  });
};
