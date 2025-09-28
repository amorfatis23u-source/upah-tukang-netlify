// netlify/functions/state.js
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("upah20");
  const url = new URL(req.url);

  const headers = {
    "content-type": "application/json",
    "cache-control": "no-store",
  };

  if (req.method === "GET") {
    const key = url.searchParams.get("key");
    if (!key) return new Response(JSON.stringify(null), { headers });
    const raw = await store.get(key);
    return new Response(raw ?? "null", { headers });
  }

  if (req.method === "POST") {
    const { key, data } = await req.json().catch(() => ({}));
    if (!key) return new Response(JSON.stringify({ ok:false, error:"Missing key" }), { status:400, headers });
    await store.set(key, JSON.stringify(data ?? null));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  return new Response(JSON.stringify({ error:"Method Not Allowed" }), { status: 405, headers });
};
