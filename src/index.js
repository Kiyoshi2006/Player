export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};

const DEFAULT_SOURCE =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const PLAYER_CDN =
  "https://cdn.jsdelivr.net/npm/movi-player@0.4.0/dist/element.js";

const DEFAULT_ALLOWED_HOSTS = ["loli.nvnyep.workers.dev"];

async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return corsResponse(null, 204);
  }

  if (url.pathname === "/proxy") {
    return proxyMedia(request, env);
  }

  if (url.pathname === "/api/check") {
    return checkSource(request, env);
  }

  if (url.pathname === "/api/health") {
    return jsonResponse({
      ok: true,
      service: "mkv-player",
      player: "movi-player@0.4.0",
    });
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    return new Response(renderPage(), {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store",
      },
    });
  }

  return new Response("Not Found", { status: 404 });
}

async function proxyMedia(request, env) {
  const url = new URL(request.url);
  const source = url.searchParams.get("url");

  if (!source) {
    return corsResponse("Missing ?url=", 400);
  }

  let sourceUrl;
  try {
    sourceUrl = validateSource(source, env);
  } catch (error) {
    return corsResponse(error.message, 403);
  }

  if (request.method === "HEAD") {
    const result = await fetchSource(sourceUrl, request, { forceRange: true });
    return corsResponse(null, result.response.status, result.response.headers);
  }

  if (request.method !== "GET") {
    return corsResponse("Method Not Allowed", 405, {
      Allow: "GET, HEAD, OPTIONS",
    });
  }

  let result = await fetchSource(sourceUrl, request);

  if (
    result.response.status === 404 ||
    result.response.status === 416 ||
    result.response.status === 400
  ) {
    if (request.headers.has("Range")) {
      result = await fetchSource(sourceUrl, request, { stripRange: true });
    }
  }

  return corsMediaResponse(result.response);
}

async function checkSource(request, env) {
  const url = new URL(request.url);
  const source = url.searchParams.get("url");

  if (!source) {
    return jsonResponse({ ok: false, error: "Missing ?url=" }, 400);
  }

  let sourceUrl;
  try {
    sourceUrl = validateSource(source, env);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 403);
  }

  const normal = await probeSource(sourceUrl);
  const range = await probeSource(sourceUrl, "bytes=0-0");

  return jsonResponse({
    ok: normal.ok || range.ok,
    source: sourceUrl.toString(),
    normal: normal.data,
    range: range.data,
    recommendation: buildRecommendation(normal, range),
  });
}

async function probeSource(sourceUrl, range) {
  const headers = new Headers({
    Accept: "*/*",
    "Accept-Encoding": "identity",
  });

  if (range) {
    headers.set("Range", range);
  }

  try {
    const response = await fetch(sourceUrl.toString(), {
      method: "GET",
      headers,
      redirect: "follow",
    });

    const data = {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
      contentRange: response.headers.get("content-range"),
      acceptRanges: response.headers.get("accept-ranges"),
      finalUrl: response.url,
    };

    const ok = response.ok;

    if (response.body) {
      await response.body.cancel();
    }

    return { ok, data };
  } catch (error) {
    return {
      ok: false,
      data: {
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function fetchSource(sourceUrl, request, options = {}) {
  const headers = new Headers();
  const copyHeaders = [
    "Accept",
    "Accept-Encoding",
    "Cache-Control",
    "If-Modified-Since",
    "If-None-Match",
    "Range",
  ];

  for (const name of copyHeaders) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  headers.set("Accept", headers.get("Accept") || "*/*");
  headers.set("Accept-Encoding", "identity");

  if (options.forceRange) {
    headers.set("Range", "bytes=0-0");
  }

  if (options.stripRange) {
    headers.delete("Range");
  }

  const response = await fetch(sourceUrl.toString(), {
    method: "GET",
    headers,
    redirect: "follow",
  });

  return { response };
}

function validateSource(source, env) {
  let parsed;

  try {
    parsed = new URL(source);
  } catch {
    throw new Error("URL MKV không hợp lệ.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Chỉ cho phép HTTPS.");
  }

  const allowedHosts = getAllowedHosts(env);

  if (!allowedHosts.includes("*") && !allowedHosts.includes(parsed.hostname)) {
    throw new Error(
      `Host chưa được cho phép: ${parsed.hostname}. Hãy thêm host vào ALLOWED_HOSTS.`,
    );
  }

  return parsed;
}

function getAllowedHosts(env) {
  const configured = env?.ALLOWED_HOSTS;

  if (!configured) {
    return DEFAULT_ALLOWED_HOSTS;
  }

  return configured
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function buildRecommendation(normal, range) {
  if (normal.ok && range.ok) {
    return "Origin hoạt động và hỗ trợ Range. Có thể phát MKV trực tiếp qua proxy.";
  }

  if (normal.ok && !range.ok) {
    return "Origin trả file bình thường nhưng Range lỗi. Player sẽ thử chế độ linear; tua có thể hạn chế.";
  }

  if (!normal.ok && range.ok) {
    return "Origin chỉ hoạt động với Range. Proxy sẽ chuyển tiếp Range cho player.";
  }

  return "Origin không trả MKV thành công ở cả GET thường và Range. Kiểm tra lại URL hoặc Worker nguồn.";
}

function corsMediaResponse(response) {
  const headers = new Headers(response.headers);

  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Range, Content-Type, Accept, Origin",
  );
  headers.set(
    "Access-Control-Expose-Headers",
    "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag",
  );
  headers.set("Cache-Control", "no-store");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function corsResponse(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":
      "Range, Content-Type, Accept, Origin",
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });

  return new Response(body, { status, headers });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function renderPage() {
  const source = escapeHtml(DEFAULT_SOURCE);

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#09090b">
  <title>MKV Player</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #09090b;
      color: #f4f4f5;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: #09090b;
    }

    main {
      width: min(1100px, 100%);
      margin: 0 auto;
      padding: 14px;
    }

    h1 {
      margin: 4px 0 12px;
      font-size: 20px;
    }

    .panel {
      display: grid;
      gap: 10px;
      margin-bottom: 12px;
    }

    textarea {
      width: 100%;
      min-height: 92px;
      resize: vertical;
      border: 1px solid #27272a;
      border-radius: 12px;
      background: #18181b;
      color: #f4f4f5;
      padding: 12px;
      font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
      outline: none;
    }

    textarea:focus {
      border-color: #71717a;
    }

    .buttons {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }

    button {
      min-height: 44px;
      border: 0;
      border-radius: 10px;
      background: #27272a;
      color: #fff;
      font-weight: 600;
      padding: 10px;
      cursor: pointer;
      touch-action: manipulation;
    }

    button:active {
      transform: scale(.98);
    }

    button.primary {
      background: #2563eb;
    }

    button:disabled {
      opacity: .5;
      cursor: wait;
    }

    #status {
      min-height: 24px;
      color: #a1a1aa;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    #diagnostics {
      display: none;
      margin-top: 8px;
      padding: 10px;
      border-radius: 10px;
      background: #111113;
      border: 1px solid #27272a;
      white-space: pre-wrap;
      overflow: auto;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    #playerWrap {
      width: 100%;
      min-height: 240px;
      aspect-ratio: 16 / 9;
      background: #000;
      border-radius: 12px;
      overflow: hidden;
    }

    movi-player {
      display: block;
      width: 100%;
      height: 100%;
      background: #000;
    }

    .hint {
      color: #71717a;
      font-size: 12px;
      margin-top: 8px;
    }

    @media (max-width: 640px) {
      main {
        padding: 10px;
      }

      .buttons {
        grid-template-columns: repeat(2, 1fr);
      }

      #playerWrap {
        aspect-ratio: 16 / 9;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>MKV Player — iPhone</h1>

    <section class="panel">
      <textarea id="source" spellcheck="false">${source}</textarea>

      <div class="buttons">
        <button id="play" class="primary" type="button">Phát</button>
        <button id="check" type="button">Kiểm tra nguồn</button>
        <button id="copy" type="button">Copy link player</button>
        <button id="clear" type="button">Xóa</button>
      </div>

      <div id="status">Đang khởi tạo player…</div>
      <pre id="diagnostics"></pre>
    </section>

    <div id="playerWrap">
      <movi-player id="player" controls playsinline></movi-player>
    </div>

    <div class="hint">
      Subtitle/audio không hard-code. Movi Player đọc các track nhúng trong MKV.
    </div>
  </main>

  <script>
    (() => {
      "use strict";

      const MOVI_CDN = ${JSON.stringify(PLAYER_CDN)};
      const sourceInput = document.getElementById("source");
      const player = document.getElementById("player");
      const playButton = document.getElementById("play");
      const checkButton = document.getElementById("check");
      const copyButton = document.getElementById("copy");
      const clearButton = document.getElementById("clear");
      const status = document.getElementById("status");
      const diagnostics = document.getElementById("diagnostics");

      let moviReady = false;
      let loading = false;

      function setStatus(message) {
        status.textContent = message;
      }

      function setBusy(button, busy) {
        button.disabled = busy;
      }

      function getSource() {
        return sourceInput.value.trim();
      }

      function getPlayerUrl() {
        const source = getSource();

        if (!source) {
          throw new Error("Chưa nhập URL MKV.");
        }

        return location.origin + "/proxy?url=" + encodeURIComponent(source);
      }

      function showDiagnostics(data) {
        diagnostics.style.display = "block";
        diagnostics.textContent = JSON.stringify(data, null, 2);
      }

      async function loadMovi() {
        if (moviReady) {
          return;
        }

        setStatus("Đang tải Movi Player…");

        try {
          await import(MOVI_CDN);
          await customElements.whenDefined("movi-player");
          moviReady = true;
          setStatus("Player sẵn sàng.");
        } catch (error) {
          setStatus(
            "Không tải được Movi Player: " +
            (error instanceof Error ? error.message : String(error)),
          );
          throw error;
        }
      }

      async function play() {
        if (loading) {
          return;
        }

        loading = true;
        setBusy(playButton, true);
        diagnostics.style.display = "none";

        try {
          await loadMovi();

          const proxyUrl = getPlayerUrl();

          player.src = proxyUrl;
          setStatus("Đã gửi MKV vào player. Đang đọc container và track…");

          if (typeof player.play === "function") {
            try {
              await player.play();
            } catch {
              setStatus("MKV đã được nạp. Bấm Play trong player để bắt đầu.");
            }
          }
        } catch (error) {
          setStatus(
            "Lỗi: " +
            (error instanceof Error ? error.message : String(error)),
          );
        } finally {
          loading = false;
          setBusy(playButton, false);
        }
      }

      async function check() {
        const source = getSource();

        if (!source) {
          setStatus("Chưa nhập URL MKV.");
          return;
        }

        setBusy(checkButton, true);
        diagnostics.style.display = "none";
        setStatus("Đang kiểm tra GET thường + Range…");

        try {
          const response = await fetch(
            "/api/check?url=" + encodeURIComponent(source),
            {
              cache: "no-store",
            },
          );

          const data = await response.json();
          showDiagnostics(data);

          if (data.ok) {
            setStatus("Nguồn OK. Xem kết quả chi tiết bên dưới.");
          } else {
            setStatus("Nguồn chưa OK. Xem lỗi bên dưới.");
          }
        } catch (error) {
          setStatus(
            "Không gọi được API kiểm tra: " +
            (error instanceof Error ? error.message : String(error)),
          );
        } finally {
          setBusy(checkButton, false);
        }
      }

      async function copyPlayerLink() {
        try {
          const link = getPlayerUrl();

          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(link);
          } else {
            const area = document.createElement("textarea");
            area.value = link;
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.focus();
            area.select();
            document.execCommand("copy");
            area.remove();
          }

          setStatus("Đã copy link player.");
        } catch (error) {
          setStatus(
            "Không copy được: " +
            (error instanceof Error ? error.message : String(error)),
          );
        }
      }

      function clear() {
        sourceInput.value = "";
        player.src = null;
        diagnostics.style.display = "none";
        setStatus("Đã xóa.");
      }

      playButton.addEventListener("click", play);
      checkButton.addEventListener("click", check);
      copyButton.addEventListener("click", copyPlayerLink);
      clearButton.addEventListener("click", clear);

      const params = new URLSearchParams(location.search);
      const querySource = params.get("url");

      if (querySource) {
        sourceInput.value = querySource;
      }

      player.addEventListener("loadstart", () => {
        setStatus("Player bắt đầu đọc MKV…");
      });

      player.addEventListener("loadedmetadata", () => {
        setStatus("Đã đọc metadata. Các audio/subtitle track được lấy trực tiếp từ MKV.");
      });

      player.addEventListener("error", (event) => {
        const detail = event && event.detail ? event.detail : "";
        setStatus("Player báo lỗi." + (detail ? " " + String(detail) : ""));
      });

      loadMovi().catch(() => {});
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
