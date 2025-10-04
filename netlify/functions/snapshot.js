import { getStore } from "@netlify/blobs";

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
};

export default async (req) => {
  const store = getStore("upah20");
  const url = new URL(req.url);

  if (req.method === "GET") {
    const key = url.searchParams.get("key");
    if (!key) {
      return new Response("Missing snapshot key", { status: 400, headers: TEXT_HEADERS });
    }

    try {
      const html = await store.get(key);
      if (!html) {
        return new Response("Snapshot not found", { status: 404, headers: TEXT_HEADERS });
      }
      return new Response(html, { headers: HTML_HEADERS });
    } catch (error) {
      console.error("Failed to read snapshot", error);
      return new Response("Failed to read snapshot", { status: 500, headers: TEXT_HEADERS });
    }
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method Not Allowed" }),
      { status: 405, headers: JSON_HEADERS },
    );
  }

  let payload;
  try {
    payload = await req.json();
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON body" }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  const { html, meta } = payload ?? {};
  if (!html || typeof html !== "string" || !html.trim()) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing HTML payload" }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  const safeMeta = meta && typeof meta === "object" ? meta : {};
  const timestamp = Date.now();
  const key = `snapshot:${timestamp}.html`;
  const createdAt = new Date(timestamp).toISOString();
  const metaComment = `<!--snapshot-meta:${encodeURIComponent(
    JSON.stringify({ ...safeMeta, createdAt }),
  )}-->`;
  const content = `${metaComment}\n${html}`;

  try {
    await store.set(key, content, { metadata: { createdAt } });
    return new Response(
      JSON.stringify({ ok: true, key, createdAt }),
      { headers: JSON_HEADERS },
    );
  } catch (error) {
    console.error("Failed to save snapshot", error);
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to persist snapshot" }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
};
