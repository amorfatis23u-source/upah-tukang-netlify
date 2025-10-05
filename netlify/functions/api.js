import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const NORMALIZED_ENV_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  process.env.DEPLOY_URL,
  process.env.DEPLOY_PRIME_URL,
  process.env.URL,
  process.env.NETLIFY_DEV_SERVER_URL,
]
  .map((value) => (typeof value === "string" ? value.trim() : ""))
  .filter(Boolean);

const ALLOWED_ORIGINS = NORMALIZED_ENV_ORIGINS;

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-KEY, X-SHEET-ID",
  Vary: "Origin",
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
};

function withCors(init = {}, origin) {
  const headers = new Headers(init.headers || {});
  let allowedOriginHeader = "";

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    allowedOriginHeader = origin;
  } else if (!origin && ALLOWED_ORIGINS.length > 0) {
    allowedOriginHeader = ALLOWED_ORIGINS[0];
  }

  if (allowedOriginHeader) {
    headers.set("Access-Control-Allow-Origin", allowedOriginHeader);
  }

  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  });

  return headers;
}

function jsonResponse(body, init = {}, origin) {
  const headers = withCors({ headers: { ...JSON_HEADERS, ...(init.headers || {}) } }, origin);
  return new Response(JSON.stringify(body), { ...init, headers });
}

function textResponse(body, init = {}, origin) {
  const headers = withCors({ headers: { ...TEXT_HEADERS, ...(init.headers || {}) } }, origin);
  return new Response(body, { ...init, headers });
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  const allowed = ALLOWED_ORIGINS.includes(origin);
  if (!allowed) {
    console.error("api-function: blocked origin", { origin, allowedOrigins: ALLOWED_ORIGINS });
  }
  return allowed;
}

function buildErrorBody(error, details) {
  return { ok: false, error, ...(details === undefined ? {} : { details }) };
}

function safeMeta(meta) {
  if (!meta || typeof meta !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(meta));
  } catch (error) {
    const result = {};
    Object.entries(meta).forEach(([key, value]) => {
      if (value === undefined) return;
      if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
        result[key] = value;
      }
    });
    return result;
  }
}

function createId() {
  try {
    return randomUUID();
  } catch (error) {
    return Math.random().toString(36).slice(2);
  }
}

function extractIdFromSnapshotKey(key) {
  if (typeof key !== "string") return null;
  const match = key.match(/^snapshot:(.+)\.html$/);
  return match ? match[1] : null;
}

function buildRecordKeyFromId(id) {
  return `record:${id}.json`;
}

function buildSnapshotKeyFromId(id) {
  return `snapshot:${id}.html`;
}

async function getRecord(store, snapshotKey) {
  const id = extractIdFromSnapshotKey(snapshotKey);
  if (!id) return null;
  const recordKey = buildRecordKeyFromId(id);
  try {
    const record = await store.get(recordKey, { type: "json" });
    if (!record || typeof record !== "object") return null;
    return {
      id,
      recordKey,
      snapshotKey,
      createdAt: record.createdAt ?? null,
      updatedAt: record.updatedAt ?? record.createdAt ?? null,
      meta: record.meta && typeof record.meta === "object" ? record.meta : {},
    };
  } catch (error) {
    console.error("api-function: gagal membaca record", { snapshotKey, error });
    return null;
  }
}

async function listRecords(store) {
  const { blobs } = await store.list({ prefix: "record:" });
  const items = [];
  for (const blob of blobs) {
    const raw = await store.get(blob.key, { type: "json" }).catch((error) => {
      console.error("api-function: gagal parsing record", { key: blob.key, error });
      return null;
    });
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" ? raw.id : extractIdFromSnapshotKey(raw.snapshotKey);
    const snapshotKey = typeof raw.snapshotKey === "string" ? raw.snapshotKey : id ? buildSnapshotKeyFromId(id) : null;
    if (!snapshotKey) continue;
    items.push({
      id: id || extractIdFromSnapshotKey(snapshotKey) || null,
      recordKey: blob.key,
      snapshotKey,
      createdAt: raw.createdAt ?? null,
      updatedAt: raw.updatedAt ?? raw.createdAt ?? null,
      meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {},
    });
  }
  items.sort((a, b) => {
    const aTime = a.updatedAt || a.createdAt || "";
    const bTime = b.updatedAt || b.createdAt || "";
    return String(bTime).localeCompare(String(aTime));
  });
  return items;
}

async function handleList(store, origin) {
  const items = await listRecords(store);
  return jsonResponse({ ok: true, items, count: items.length }, { status: 200 }, origin);
}

async function handleItem(store, url, origin) {
  const key = url.searchParams.get("key");
  if (!key) {
    return jsonResponse(buildErrorBody("Missing key"), { status: 400 }, origin);
  }
  const record = await getRecord(store, key);
  if (!record) {
    return jsonResponse(buildErrorBody("Snapshot not found"), { status: 404 }, origin);
  }
  const html = await store.get(record.snapshotKey, { type: "text" }).catch(() => null);
  return jsonResponse({ ok: true, item: { ...record, html } }, { status: 200 }, origin);
}

async function handleSave(store, request, origin) {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse(buildErrorBody("Invalid JSON body", { message: error.message }), { status: 400 }, origin);
  }
  const html = payload && typeof payload.html === "string" ? payload.html : "";
  if (!html.trim()) {
    return jsonResponse(buildErrorBody("Missing HTML payload"), { status: 400 }, origin);
  }
  const meta = safeMeta(payload.meta);
  const id = `${Date.now()}-${createId()}`;
  const snapshotKey = buildSnapshotKeyFromId(id);
  const recordKey = buildRecordKeyFromId(id);
  const createdAt = new Date().toISOString();
  const record = {
    id,
    snapshotKey,
    createdAt,
    updatedAt: createdAt,
    meta,
  };
  try {
    await store.set(snapshotKey, html, { metadata: { createdAt, updatedAt: createdAt } });
    await store.setJSON(recordKey, record, { metadata: { snapshotKey, createdAt, updatedAt: createdAt } });
    return jsonResponse(
      { ok: true, key: snapshotKey, snapshotKey, recordKey, createdAt, updatedAt: createdAt, meta },
      { status: 201 },
      origin,
    );
  } catch (error) {
    console.error("api-function: gagal menyimpan snapshot", { error });
    return jsonResponse(buildErrorBody("Failed to persist snapshot", { message: error.message }), { status: 500 }, origin);
  }
}

async function handleUpdate(store, request, origin) {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse(buildErrorBody("Invalid JSON body", { message: error.message }), { status: 400 }, origin);
  }
  const key = payload && typeof payload.key === "string" ? payload.key.trim() : "";
  if (!key) {
    return jsonResponse(buildErrorBody("Missing key"), { status: 400 }, origin);
  }
  const record = await getRecord(store, key);
  if (!record) {
    return jsonResponse(buildErrorBody("Snapshot not found"), { status: 404 }, origin);
  }
  const html = payload && typeof payload.html === "string" ? payload.html : "";
  if (!html.trim()) {
    return jsonResponse(buildErrorBody("Missing HTML payload"), { status: 400 }, origin);
  }
  const meta = safeMeta(payload.meta ?? record.meta ?? {});
  const updatedAt = new Date().toISOString();
  try {
    await store.set(record.snapshotKey, html, { metadata: { createdAt: record.createdAt ?? updatedAt, updatedAt } });
    await store.setJSON(record.recordKey, { ...record, meta, updatedAt }, {
      metadata: { snapshotKey: record.snapshotKey, createdAt: record.createdAt ?? updatedAt, updatedAt },
    });
    return jsonResponse(
      {
        ok: true,
        key: record.snapshotKey,
        snapshotKey: record.snapshotKey,
        recordKey: record.recordKey,
        createdAt: record.createdAt,
        updatedAt,
        meta,
      },
      { status: 200 },
      origin,
    );
  } catch (error) {
    console.error("api-function: gagal memperbarui snapshot", { key: record.snapshotKey, error });
    return jsonResponse(buildErrorBody("Failed to update snapshot", { message: error.message }), { status: 500 }, origin);
  }
}

async function handleRemove(store, request, url, origin) {
  let key = url.searchParams.get("key");
  if (!key) {
    try {
      const body = await request.json();
      if (body && typeof body.key === "string") {
        key = body.key.trim();
      }
    } catch (_error) {
      // ignore JSON parse errors for DELETE without body
    }
  }
  if (!key) {
    return jsonResponse(buildErrorBody("Missing key"), { status: 400 }, origin);
  }
  const record = await getRecord(store, key);
  if (!record) {
    return jsonResponse(buildErrorBody("Snapshot not found"), { status: 404 }, origin);
  }
  try {
    await store.delete(record.snapshotKey);
    await store.delete(record.recordKey);
    return jsonResponse(
      { ok: true, key: record.snapshotKey, snapshotKey: record.snapshotKey, removed: true },
      { status: 200 },
      origin,
    );
  } catch (error) {
    console.error("api-function: gagal menghapus snapshot", { key: record.snapshotKey, error });
    return jsonResponse(buildErrorBody("Failed to remove snapshot", { message: error.message }), { status: 500 }, origin);
  }
}

function resolveAction(url) {
  const segments = url.pathname.split("/").filter(Boolean);
  const idx = segments.lastIndexOf("api");
  const actionSegment = idx >= 0 ? segments[idx + 1] : segments[0];
  return (actionSegment || "").toLowerCase();
}

export default async (request) => {
  const origin = request.headers.get("origin");

  if (!isOriginAllowed(origin)) {
    return jsonResponse(buildErrorBody("Origin Not Allowed"), { status: 403 }, origin);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withCors({}, origin) });
  }

  const url = new URL(request.url);
  const action = resolveAction(url);
  const store = getStore("upah20");

  try {
    if (!action) {
      if (request.method === "GET") {
        return jsonResponse({ ok: true, message: "Upah Tukang API" }, { status: 200 }, origin);
      }
      return jsonResponse(buildErrorBody("Not Found"), { status: 404 }, origin);
    }

    if (action === "list" && request.method === "GET") {
      return await handleList(store, origin);
    }

    if (action === "item" && request.method === "GET") {
      return await handleItem(store, url, origin);
    }

    if (action === "save" && request.method === "POST") {
      return await handleSave(store, request, origin);
    }

    if (action === "update" && request.method === "PUT") {
      return await handleUpdate(store, request, origin);
    }

    if (action === "remove" && request.method === "DELETE") {
      return await handleRemove(store, request, url, origin);
    }

    return jsonResponse(buildErrorBody("Method Not Allowed"), { status: 405 }, origin);
  } catch (error) {
    console.error("api-function: unhandled error", { action, method: request.method, error });
    return jsonResponse(buildErrorBody("Internal Server Error", { message: error.message }), { status: 500 }, origin);
  }
};
