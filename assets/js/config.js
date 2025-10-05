const ENV_KEYS = ["DATA_BACKEND", "WEBAPP_URL", "API_KEY", "SHEET_ID"];

function normalizeValue(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return value;
}

function readGlobalEnv() {
  if (typeof window === "undefined") return {};
  const source = window.__ENV__;
  if (source && typeof source === "object") {
    return { ...source };
  }
  return {};
}

function parseScriptJSON(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn("config: gagal parsing JSON inline", error);
    return null;
  }
}

function readInlineEnv() {
  if (typeof document === "undefined") return {};
  const scripts = Array.from(
    document.querySelectorAll(
      "script[data-env], script[type='application/json'][id='__ENV__'], script[id='env-config']",
    ),
  );

  for (const script of scripts) {
    const text = script.textContent || script.innerText || "";
    const dataAttr = script.getAttribute("data-env") || script.getAttribute("data-inline-env");

    if (script.type === "application/json" || dataAttr === "json") {
      const parsed = parseScriptJSON(text.trim());
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
      continue;
    }

    const match = text.match(/__ENV__\s*=\s*({[\s\S]*?})\s*;?\s*$/m);
    if (match) {
      const parsed = parseScriptJSON(match[1]);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }
  }

  return {};
}

function mergeEnv(...sources) {
  const merged = {};
  sources
    .filter((source) => source && typeof source === "object")
    .forEach((source) => {
      ENV_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          merged[key] = source[key];
        }
      });
    });
  return merged;
}

function resolveBackend(value) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "APPS_SCRIPT") return "APPS_SCRIPT";
  if (normalized === "NETLIFY_FN") return "NETLIFY_FN";
  return normalized || "NETLIFY_FN";
}

let cachedConfig = null;

function computeConfig() {
  const sources = [readGlobalEnv(), readInlineEnv()];
  const merged = mergeEnv(...sources);
  const normalized = {};

  ENV_KEYS.forEach((key) => {
    normalized[key] = normalizeValue(merged[key]);
  });

  const backend = resolveBackend(normalized.DATA_BACKEND);

  return {
    DATA_BACKEND: backend,
    WEBAPP_URL: normalized.WEBAPP_URL,
    API_KEY: normalized.API_KEY,
    SHEET_ID: normalized.SHEET_ID,
  };
}

export function getEnvConfig({ forceReload = false } = {}) {
  if (!cachedConfig || forceReload) {
    cachedConfig = computeConfig();
  }
  return { ...cachedConfig };
}

function ensureOrigin() {
  if (typeof window !== "undefined" && window.location) {
    return window.location.origin;
  }
  return "http://localhost";
}

function toQueryValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

function mergePath(basePath, endpoint) {
  const base = (basePath || "/").replace(/\/+$/, "");
  const child = (endpoint || "").replace(/^\/+/, "");
  if (!child) return base || "/";
  if (!base || base === "/") return `/${child}`;
  return `${base}/${child}`;
}

export function createApiClient(overrides = {}) {
  const env = { ...getEnvConfig(), ...(overrides || {}) };
  const backend = resolveBackend(env.DATA_BACKEND);

  const defaultHeaders = new Headers();
  defaultHeaders.set("Accept", "application/json, text/plain, */*");

  if (backend === "APPS_SCRIPT" || backend === "NETLIFY_FN") {
    defaultHeaders.set("Content-Type", "application/json; charset=utf-8");
  }
  defaultHeaders.set("Cache-Control", "no-store");

  if (env.API_KEY) {
    defaultHeaders.set("X-API-KEY", env.API_KEY);
  }
  if (env.SHEET_ID) {
    defaultHeaders.set("X-SHEET-ID", env.SHEET_ID);
  }

  const baseUrl = env.WEBAPP_URL && typeof env.WEBAPP_URL === "string" ? env.WEBAPP_URL.trim() : "";

  function buildUrl(endpoint, query) {
    if (backend === "APPS_SCRIPT") {
      if (!baseUrl) {
        throw new Error("WEBAPP_URL wajib diisi untuk backend Apps Script");
      }
      const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      const url = new URL(endpoint ? endpoint.replace(/^\/+/, "") : "", normalizedBase);
      if (query && typeof query === "object") {
        Object.entries(query).forEach(([key, value]) => {
          const normalizedValue = toQueryValue(value);
          if (normalizedValue !== null) {
            url.searchParams.set(key, normalizedValue);
          }
        });
      }
      return url.toString();
    }

    const origin = ensureOrigin();
    const basePath = baseUrl ? baseUrl : "/api";
    const baseAbsolute = new URL(basePath, origin);
    const finalPath = mergePath(baseAbsolute.pathname, endpoint);
    baseAbsolute.pathname = finalPath;

    if (query && typeof query === "object") {
      Object.entries(query).forEach(([key, value]) => {
        const normalizedValue = toQueryValue(value);
        if (normalizedValue !== null) {
          baseAbsolute.searchParams.set(key, normalizedValue);
        }
      });
    }

    return baseAbsolute.toString();
  }

  function createRequest(endpoint, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    let urlString;

    try {
      urlString = buildUrl(endpoint, options.query || null);
    } catch (error) {
      throw error;
    }

    const headers = new Headers(defaultHeaders);
    if (options.headers && typeof options.headers === "object") {
      Object.entries(options.headers).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          headers.set(key, value);
        }
      });
    }

    const init = {
      method,
      headers: Object.fromEntries(headers.entries()),
    };

    if (options.body !== undefined && options.body !== null) {
      init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    } else if (method === "GET" || method === "HEAD") {
      const hdrs = new Headers(init.headers);
      if (hdrs.get("Content-Type")) {
        hdrs.delete("Content-Type");
        init.headers = Object.fromEntries(hdrs.entries());
      }
    }

    if (backend === "APPS_SCRIPT") {
      init.mode = "cors";
    } else if (backend === "NETLIFY_FN") {
      init.mode = "same-origin";
    }

    if (options.credentials) {
      init.credentials = options.credentials;
    }

    return { url: urlString, init };
  }

  return {
    backend,
    env,
    createRequest,
  };
}

export default {
  getEnvConfig,
  createApiClient,
};
