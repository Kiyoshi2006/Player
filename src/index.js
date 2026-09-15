// src/index.js
const DEFAULT_SOURCE =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const PLAYER_CDN =
  "https://cdn.jsdelivr.net/npm/movi-player@0.4.0/dist/element.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const RESPONSE_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "content-encoding",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "expires",
  "last-modified",
  "vary",
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/proxy") {
      return handleProxy(request, env);
    }

    if (url.pathname === "/api/check") {
      return handleCheck(request, env);
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "mkv-cloudflare-player-v2" });
    }

    return new Response(renderPage(DEFAULT_SOURCE), {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store",
      },
    });
  },
};

async function handleProxy(request, env) {
  if (request.method === "OPTIONS") {
    return cors(new Response(null, { status: 204 }));
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return cors(new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD, OPTIONS" },
    }));
  }

  const source = getSource(new URL(request.url));

  if (!source) {
    return cors(new Response("Missing or invalid source URL", { status: 400 }));
  }

  if (!isAllowedHost(source, env)) {
    return cors(new Response(
      `Host not allowed: ${source.hostname}. Set ALLOWED_HOSTS in Worker Variables.`,
      { status: 403 },
    ));
  }

  let upstream;
  try {
    upstream = await fetch(buildUpstreamRequest(request, source), {
      redirect: "follow",
    });
  } catch (error) {
    return cors(new Response(`Upstream fetch failed: ${error.message}`, {
      status: 502,
    }));
  }

  const headers = copyResponseHeaders(upstream.headers);
  addCors(headers);

  return new Response(
    request.method === "HEAD" ? null : upstream.body,
    {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    },
  );
}

async function handleCheck(request, env) {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }

  const source = getSource(new URL(request.url));

  if (!source) {
    return json({ ok: false, error: "Missing or invalid source URL" }, 400);
  }

  if (!isAllowedHost(source, env)) {
    return json({
      ok: false,
      error: `Host not allowed: ${source.hostname}`,
    }, 403);
  }

  const result = await inspectUpstream(source);

  return json({
    ok: result.ok,
    source: source.toString(),
    ...result,
  });
}

async function inspectUpstream(source) {
  let head = null;

  try {
    head = await fetch(new Request(source, {
      method: "HEAD",
      headers: {
        Accept: "*/*",
        "Accept-Encoding": "identity",
      },
      redirect: "follow",
    }), {
      redirect: "follow",
    });
  } catch {
    head = null;
  }

  if (head && head.ok) {
    return {
      method: "HEAD",
      status: head.status,
      contentType: head.headers.get("content-type"),
      contentLength: head.headers.get("content-length"),
      acceptRanges: head.headers.get("accept-ranges"),
      contentRange: head.headers.get("content-range"),
      finalUrl: head.url,
    };
  }

  try {
    const ranged = await fetch(new Request(source, {
      method: "GET",
      headers: {
        Range: "bytes=0-0",
        Accept: "*/*",
        "Accept-Encoding": "identity",
      },
      redirect: "follow",
    }), {
      redirect: "follow",
    });

    return {
      method: "GET Range",
      status: ranged.status,
      contentType: ranged.headers.get("content-type"),
      contentLength: ranged.headers.get("content-length"),
      acceptRanges: ranged.headers.get("accept-ranges"),
      contentRange: ranged.headers.get("content-range"),
      finalUrl: ranged.url,
    };
  } catch (error) {
    return {
      method: "GET Range",
      status: 0,
      error: error.message,
    };
  }
}

function buildUpstreamRequest(request, source) {
  const headers = new Headers();

  for (const [name, value] of request.headers) {
    if (!HOP_BY_HOP.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  }

  headers.set("Accept", "*/*");
  headers.set("Accept-Encoding", "identity");

  return new Request(source, {
    method: request.method,
    headers,
    redirect: "follow",
  });
}

function getSource(requestUrl) {
  const encoded = requestUrl.searchParams.get("src");

  if (encoded) {
    try {
      return new URL(decodeBase64Url(encoded));
    } catch {
      return null;
    }
  }

  const raw = requestUrl.searchParams.get("url");

  if (!raw) {
    return null;
  }

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isAllowedHost(source, env) {
  const configured = String(env.ALLOWED_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const hosts = configured.length
    ? configured
    : ["loli.nvnyep.workers.dev"];

  const hostname = source.hostname.toLowerCase();

  return hosts.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

function copyResponseHeaders(upstream) {
  const headers = new Headers();

  for (const name of RESPONSE_HEADERS) {
    const value = upstream.get(name);

    if (value !== null) {
      headers.set(name, value);
    }
  }

  return headers;
}

function addCors(headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, HEAD, OPTIONS",
  );
  headers.set(
    "Access-Control-Allow-Headers",
    "Range, Content-Type, Accept",
  );
  headers.set(
    "Access-Control-Expose-Headers",
    [
      "Accept-Ranges",
      "Content-Length",
      "Content-Range",
      "Content-Type",
      "ETag",
      "Last-Modified",
    ].join(", "),
  );
}

function cors(response) {
  const headers = new Headers(response.headers);
  addCors(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function renderPage(defaultSource) {
  const sourceJson = JSON.stringify(defaultSource);
  const playerCdnJson = JSON.stringify(PLAYER_CDN);

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b0d12">
<title>MKV Player</title>
<style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif}
*{box-sizing:border-box}
body{margin:0;background:#090b10;color:#f4f6fb}
main{width:min(1100px,100%);margin:auto;padding:20px 14px 60px}
h1{font-size:30px;margin:4px 0 6px}
p{color:#9da6b8;margin:0 0 18px}
.card{background:#12151d;border:1px solid #252b38;border-radius:20px;padding:16px;margin-bottom:14px}
label{display:block;font-weight:700;margin-bottom:8px}
textarea,input{width:100%;border:1px solid #303747;background:#0c0f15;color:#fff;border-radius:14px;padding:14px;font-size:15px;outline:none}
textarea{min-height:92px;resize:vertical}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
button{border:0;border-radius:14px;padding:14px 16px;background:#2563eb;color:white;font-size:16px;font-weight:750}
button.secondary{background:#1b202b;border:1px solid #303747}
button.danger{background:#32181c;color:#ffadb4}
button:disabled{opacity:.5}
#status{margin-top:12px;line-height:1.45;color:#b7c0d0}
#status.ok{color:#8de0a7}
#status.error{color:#ff9da5}
.player{overflow:hidden;border-radius:18px;background:#000;min-height:220px}
movi-player{display:block;width:100%;height:min(70vh,650px);background:#000}
details{margin-top:12px}
summary{cursor:pointer;font-weight:700}
pre{white-space:pre-wrap;overflow:auto;color:#b9c2d3;font-size:12px}
.small{font-size:13px;color:#8f98aa}
@media(max-width:600px){main{padding:12px 10px 40px}.row{grid-template-columns:1fr}h1{font-size:26px}.card{border-radius:16px;padding:13px}}
</style>
</head>
<body>
<main>
  <section class="card">
    <h1>MKV Player</h1>
    <p>MKV / HEVC / OPUS · tự động lấy toàn bộ audio & soft-sub trong container.</p>
    <label for="source">URL MKV</label>
    <textarea id="source" autocomplete="off" spellcheck="false"></textarea>
    <div class="row">
      <button id="play">Phát</button>
      <button id="check" class="secondary">Kiểm tra nguồn</button>
    </div>
    <div class="row">
      <button id="copy" class="secondary">Copy link player</button>
      <button id="clear" class="danger">Xóa</button>
    </div>
    <div id="status">Sẵn sàng.</div>
    <details>
      <summary>Chẩn đoán</summary>
      <pre id="diagnostic">Chưa kiểm tra.</pre>
    </details>
  </section>

  <section class="card player">
    <movi-player id="player"
      controls
      playsinline
      persist="volume speed audiolang subtitlelang"
      persistkey="mkv-cloudflare-player-v2"
      resume
      fastseek="buttons gestures"
      nohotkeys>
    </movi-player>
  </section>

  <section class="card">
    <strong>Audio / Subtitle</strong>
    <p class="small">
      Danh sách track được đọc trực tiếp từ MKV. Không hard-code ngôn ngữ;
      file có bao nhiêu track thì player hiển thị bấy nhiêu.
      Mở menu ⚙/CC của player để chọn.
    </p>
  </section>
</main>

<script>
const DEFAULT_SOURCE = ${sourceJson};
const PLAYER_CDN = ${playerCdnJson};

const sourceEl = document.getElementById("source");
const statusEl = document.getElementById("status");
const diagnosticEl = document.getElementById("diagnostic");
const player = document.getElementById("player");

sourceEl.value = DEFAULT_SOURCE;

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type;
}

function encodeSource(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function proxyUrl(source) {
  return new URL("/proxy?src=" + encodeURIComponent(encodeSource(source)), location.origin).toString();
}

function shareUrl(source) {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("url", source);
  return url.toString();
}

function loadSource() {
  const source = sourceEl.value.trim();

  if (!source) {
    setStatus("Hãy nhập URL MKV.", "error");
    return;
  }

  try {
    new URL(source);
  } catch {
    setStatus("URL không hợp lệ.", "error");
    return;
  }

  const target = proxyUrl(source);
  player.src = target;
  history.replaceState(null, "", shareUrl(source));
  setStatus("Đang mở MKV…");
}

async function checkSource() {
  const source = sourceEl.value.trim();

  if (!source) {
    setStatus("Hãy nhập URL MKV.", "error");
    return;
  }

  setStatus("Đang kiểm tra nguồn…");

  try {
    new URL(source);

    const endpoint = new URL("/api/check", location.origin);
    endpoint.searchParams.set("src", encodeSource(source));

    const response = await fetch(endpoint);
    const data = await response.json();

    diagnosticEl.textContent = JSON.stringify(data, null, 2);

    if (data.status >= 200 && data.status < 300) {
      setStatus(
        "Nguồn OK: " + (data.contentType || "không có Content-Type"),
        "ok",
      );
    } else {
      setStatus(
        "Origin trả HTTP " + data.status + ". Xem Chẩn đoán bên dưới.",
        "error",
      );
    }
  } catch (error) {
    diagnosticEl.textContent = String(error);
    setStatus("Không kiểm tra được nguồn.", "error");
  }
}

async function copyPlayerLink() {
  const source = sourceEl.value.trim();

  if (!source) {
    setStatus("Hãy nhập URL MKV.", "error");
    return;
  }

  const url = shareUrl(source);

  try {
    await navigator.clipboard.writeText(url);
    setStatus("Đã copy link player.", "ok");
  } catch {
    setStatus(url);
  }
}

document.getElementById("play").addEventListener("click", loadSource);
document.getElementById("check").addEventListener("click", checkSource);
document.getElementById("copy").addEventListener("click", copyPlayerLink);
document.getElementById("clear").addEventListener("click", () => {
  sourceEl.value = "";
  player.removeAttribute("src");
  history.replaceState(null, "", location.pathname);
  diagnosticEl.textContent = "Chưa kiểm tra.";
  setStatus("Đã xóa.");
});

player.addEventListener("loadedmetadata", () => {
  setStatus("Đã đọc metadata MKV. Audio/subtitle nằm trong menu player.", "ok");
});

player.addEventListener("linearmode", () => {
  setStatus("Nguồn không hỗ trợ Range; player chuyển sang linear mode.", "ok");
});

player.addEventListener("errordisplay", (event) => {
  const message = event?.detail?.message || "Player không thể mở nguồn.";
  setStatus(message, "error");
});

const querySource = new URL(location.href).searchParams.get("url");
if (querySource) sourceEl.value = querySource;

const script = document.createElement("script");
script.type = "module";
script.src = PLAYER_CDN;
script.onload = () => {
  if (querySource) loadSource();
};
script.onerror = () => {
  setStatus("Không tải được Movi Player CDN.", "error");
};
document.head.appendChild(script);
</script>
</body>
</html>`;
}
