import { getStore } from "@netlify/blobs";

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

export default async (req) => {
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
    const store = getStore("upah20");
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
