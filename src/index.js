const DEFAULT_ALLOWED_HOSTS = [
  "loli.nvnyep.workers.dev",
];

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const FORWARDED_RESPONSE_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "expires",
  "last-modified",
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/proxy") {
      return proxyMedia(request, env);
    }

    if (url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        service: "mkv-cloudflare-player",
        player: "movi-player",
      });
    }

    if (url.pathname === "/api/probe") {
      return probeMedia(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function proxyMedia(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        Allow: "GET, HEAD, OPTIONS",
      },
    });
  }

  if (request.method === "OPTIONS") {
    return corsResponse(null, 204);
  }

  const sourceUrl = parseSourceUrl(new URL(request.url).searchParams.get("url"));
  if (!sourceUrl) {
    return corsResponse("Missing or invalid ?url=...", 400);
  }

  if (!isAllowedHost(sourceUrl, env)) {
    return corsResponse(
      `Source host is not allowed. Add "${sourceUrl.hostname}" to ALLOWED_HOSTS.`,
      403,
    );
  }

  const upstreamRequest = buildUpstreamRequest(request, sourceUrl);
  let upstream;

  try {
    upstream = await fetch(upstreamRequest, {
      redirect: "follow",
    });
  } catch (error) {
    return corsResponse(`Upstream request failed: ${error.message}`, 502);
  }

  const headers = copyResponseHeaders(upstream.headers);
  addCorsHeaders(headers);

  if (!headers.has("content-type")) {
    headers.set("Content-Type", "application/octet-stream");
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function probeMedia(request, env) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  const sourceUrl = parseSourceUrl(new URL(request.url).searchParams.get("url"));
  if (!sourceUrl) {
    return jsonResponse({ ok: false, error: "Missing or invalid ?url=..." }, 400);
  }

  if (!isAllowedHost(sourceUrl, env)) {
    return jsonResponse(
      {
        ok: false,
        error: `Source host is not allowed: ${sourceUrl.hostname}`,
      },
      403,
    );
  }

  const headers = new Headers({
    Range: "bytes=0-0",
    Accept: "*/*",
    "Accept-Encoding": "identity",
  });

  let upstream;
  try {
    upstream = await fetch(new Request(sourceUrl, { method: "GET", headers }), {
      redirect: "follow",
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: `Upstream request failed: ${error.message}`,
      },
      502,
    );
  }

  return jsonResponse({
    ok: upstream.ok || upstream.status === 206,
    status: upstream.status,
    contentType: upstream.headers.get("content-type"),
    contentLength: upstream.headers.get("content-length"),
    contentRange: upstream.headers.get("content-range"),
    acceptRanges: upstream.headers.get("accept-ranges"),
    finalUrl: upstream.url,
  });
}

function buildUpstreamRequest(request, sourceUrl) {
  const headers = new Headers();

  for (const [name, value] of request.headers) {
    if (!HOP_BY_HOP_REQUEST_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  }

  headers.set("Accept-Encoding", "identity");

  return new Request(sourceUrl, {
    method: request.method,
    headers,
    redirect: "follow",
  });
}

function parseSourceUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const sourceUrl = new URL(value);

    if (sourceUrl.protocol !== "https:" && sourceUrl.protocol !== "http:") {
      return null;
    }

    return sourceUrl;
  } catch {
    return null;
  }
}

function isAllowedHost(sourceUrl, env) {
  const configured = String(env.ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  const allowedHosts = configured.length > 0 ? configured : DEFAULT_ALLOWED_HOSTS;
  const hostname = sourceUrl.hostname.toLowerCase();

  return allowedHosts.some(
    (allowedHost) =>
      hostname === allowedHost ||
      hostname.endsWith(`.${allowedHost}`),
  );
}

function copyResponseHeaders(upstreamHeaders) {
  const headers = new Headers();

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstreamHeaders.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }

  return headers;
}

function addCorsHeaders(headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", [
    "Accept-Ranges",
    "Content-Length",
    "Content-Range",
    "Content-Type",
    "ETag",
    "Last-Modified",
  ].join(", "));
}

function corsResponse(body, status) {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": [
      "Accept-Ranges",
      "Content-Length",
      "Content-Range",
      "Content-Type",
      "ETag",
      "Last-Modified",
    ].join(", "),
    "Cache-Control": "no-store",
  });

  return new Response(body, { status, headers });
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
