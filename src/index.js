/**
 * src/index.js
 *
 * Cloudflare Worker:
 * - iPhone-friendly MKV player
 * - Service Binding: LOLI -> loli
 * - HTTP Range proxy
 * - Dynamic audio/subtitle tracks through Movi Player
 */

const DEFAULT_SOURCE =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const MOVI_CDN =
  "https://cdn.jsdelivr.net/npm/movi-player@0.4.0/dist/element.js";

const ALLOWED_HOSTS = new Set([
  "loli.nvnyep.workers.dev",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers":
    "Range, Content-Type, Origin, Accept, User-Agent, Referer",
  "Access-Control-Expose-Headers":
    "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS,
        });
      }

      if (url.pathname === "/api/health") {
        return jsonResponse({
          ok: true,
          serviceBinding: Boolean(env.LOLI),
          binding: "LOLI",
          targetWorker: "loli",
          movi: MOVI_CDN,
        });
      }

      if (url.pathname === "/api/check") {
        return await handleCheck(request, env);
      }

      if (url.pathname === "/proxy") {
        return await handleProxy(request, env);
      }

      return htmlResponse(renderPage());
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function validateSource(rawSource) {
  const source = rawSource || DEFAULT_SOURCE;

  let parsed;

  try {
    parsed = new URL(source);
  } catch {
    throw new Error("URL MKV không hợp lệ.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Chỉ cho phép HTTPS.");
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Host không được phép: ${parsed.hostname}.`,
    );
  }

  return parsed;
}

function getSourceFromRequest(url) {
  const rawSource = url.searchParams.get("src");

  if (!rawSource) {
    return DEFAULT_SOURCE;
  }

  return rawSource;
}

function buildBindingRequest(sourceUrl, request, method = "GET") {
  const headers = new Headers();

  const copyHeaders = [
    "Accept",
    "Accept-Encoding",
    "Cache-Control",
    "If-None-Match",
    "If-Modified-Since",
    "Range",
    "Referer",
    "User-Agent",
  ];

  for (const name of copyHeaders) {
    const value = request.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  if (!headers.has("Accept")) {
    headers.set(
      "Accept",
      "*/*",
    );
  }

  if (!headers.has("User-Agent")) {
    headers.set(
      "User-Agent",
      "Mozilla/5.0",
    );
  }

  return new Request(sourceUrl.toString(), {
    method,
    headers,
  });
}

async function fetchThroughLoli(
  env,
  sourceUrl,
  request,
  method = "GET",
) {
  if (!env.LOLI) {
    throw new Error(
      "Chưa cấu hình Service Binding LOLI. " +
      "Vào Settings → Bindings → Add Service Binding → " +
      "Variable name: LOLI → Service: loli.",
    );
  }

  const bindingRequest = buildBindingRequest(
    sourceUrl,
    request,
    method,
  );

  return await env.LOLI.fetch(bindingRequest);
}

async function handleCheck(request, env) {
  const requestUrl = new URL(request.url);
  const rawSource = getSourceFromRequest(requestUrl);
  const sourceUrl = validateSource(rawSource);

  if (!env.LOLI) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Service Binding LOLI chưa được cấu hình.",
        source: sourceUrl.toString(),
        setup: {
          variableName: "LOLI",
          service: "loli",
        },
      },
      503,
    );
  }

  const headers = new Headers(request.headers);

  headers.set("Range", "bytes=0-0");
  headers.set("Accept", "*/*");

  const probeRequest = new Request(
    sourceUrl.toString(),
    {
      method: "GET",
      headers,
    },
  );

  let response;

  try {
    response = await env.LOLI.fetch(probeRequest);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        source: sourceUrl.toString(),
        error:
          error instanceof Error
            ? error.message
            : String(error),
        recommendation:
          "Service Binding LOLI không gọi được Worker loli.",
      },
      502,
    );
  }

  const result = {
    ok: response.ok || response.status === 206,
    status: response.status,
    statusText: response.statusText,
    contentType:
      response.headers.get("Content-Type"),
    contentLength:
      response.headers.get("Content-Length"),
    contentRange:
      response.headers.get("Content-Range"),
    acceptRanges:
      response.headers.get("Accept-Ranges"),
    source: sourceUrl.toString(),
    via: "Service Binding LOLI → loli",
  };

  if (!result.ok) {
    result.recommendation =
      "Worker loli đã nhận request nhưng không trả file thành công. " +
      "Kiểm tra route/path của Worker loli.";
  } else {
    result.recommendation =
      "Nguồn MKV hoạt động qua Service Binding. " +
      "Có thể mở player.";
  }

  return jsonResponse(result);
}

async function handleProxy(request, env) {
  const requestUrl = new URL(request.url);
  const rawSource = getSourceFromRequest(requestUrl);
  const sourceUrl = validateSource(rawSource);

  if (!env.LOLI) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Service Binding LOLI chưa được cấu hình.",
      },
      503,
    );
  }

  let upstream;

  if (request.method === "HEAD") {
    upstream = await fetchThroughLoli(
      env,
      sourceUrl,
      request,
      "HEAD",
    );

    if (
      !upstream.ok &&
      upstream.status !== 206
    ) {
      const rangeHeaders = new Headers(
        request.headers,
      );

      rangeHeaders.set(
        "Range",
        "bytes=0-0",
      );

      const rangeRequest = new Request(
        sourceUrl.toString(),
        {
          method: "GET",
          headers: rangeHeaders,
        },
      );

      const rangeResponse =
        await env.LOLI.fetch(rangeRequest);

      return buildProxyResponse(
        rangeResponse,
        true,
      );
    }

    return buildProxyResponse(
      upstream,
      true,
    );
  }

  upstream = await fetchThroughLoli(
    env,
    sourceUrl,
    request,
    "GET",
  );

  return buildProxyResponse(
    upstream,
    false,
  );
}

function buildProxyResponse(upstream, headOnly) {
  const headers = new Headers();

  const responseHeaders = [
    "Accept-Ranges",
    "Cache-Control",
    "Content-Disposition",
    "Content-Length",
    "Content-Range",
    "Content-Type",
    "ETag",
    "Last-Modified",
    "Vary",
  ];

  for (const name of responseHeaders) {
    const value = upstream.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  if (!headers.has("Content-Type")) {
    headers.set(
      "Content-Type",
      "video/x-matroska",
    );
  }

  headers.set(
    "Cache-Control",
    "no-store",
  );

  for (const [name, value] of Object.entries(
    CORS_HEADERS,
  )) {
    headers.set(name, value);
  }

  return new Response(
    headOnly ? null : upstream.body,
    {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    },
  );
}

function renderPage() {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1,viewport-fit=cover"
  >
  <meta
    name="theme-color"
    content="#000000"
  >
  <title>MKV Player</title>

  <style>
    :root {
      color-scheme: dark;
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      min-height: 100%;
      background: #000;
      color: #fff;
    }

    body {
      padding:
        env(safe-area-inset-top)
        0
        env(safe-area-inset-bottom);
    }

    .app {
      width: 100%;
      max-width: 1100px;
      margin: 0 auto;
      padding: 14px;
    }

    h1 {
      margin: 4px 0 14px;
      font-size: 22px;
    }

    .panel {
      display: grid;
      gap: 10px;
      margin-bottom: 12px;
    }

    input {
      width: 100%;
      min-height: 46px;
      padding: 10px 12px;
      border: 1px solid #333;
      border-radius: 10px;
      background: #111;
      color: #fff;
      font-size: 14px;
      outline: none;
    }

    input:focus {
      border-color: #777;
    }

    .buttons {
      display: grid;
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    button {
      min-height: 44px;
      padding: 10px;
      border: 0;
      border-radius: 10px;
      background: #222;
      color: #fff;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
    }

    button:active {
      transform: scale(.98);
    }

    .primary {
      background: #fff;
      color: #000;
    }

    .status {
      min-height: 22px;
      color: #aaa;
      font-size: 13px;
      line-height: 1.4;
    }

    .player {
      width: 100%;
      min-height: 240px;
      overflow: hidden;
      border-radius: 12px;
      background: #000;
    }

    movi-player {
      display: block;
      width: 100%;
      min-height: 240px;
      background: #000;
    }

    pre {
      max-height: 260px;
      overflow: auto;
      margin: 12px 0 0;
      padding: 12px;
      border-radius: 10px;
      background: #0d0d0d;
      color: #bbb;
      font-size: 11px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .hint {
      margin-top: 10px;
      color: #777;
      font-size: 12px;
      line-height: 1.5;
    }

    @media (min-width: 700px) {
      .buttons {
        grid-template-columns:
          repeat(4, minmax(0, 1fr));
      }
    }
  </style>
</head>

<body>
  <main class="app">
    <h1>MKV Player</h1>

    <section class="panel">
      <input
        id="source"
        type="url"
        inputmode="url"
        autocomplete="off"
        spellcheck="false"
        placeholder="Dán URL MKV..."
      >

      <div class="buttons">
        <button
          id="play"
          class="primary"
        >
          Phát
        </button>

        <button id="check">
          Kiểm tra nguồn
        </button>

        <button id="copy">
          Copy link player
        </button>

        <button id="clear">
          Xóa
        </button>
      </div>

      <div
        id="status"
        class="status"
      >
        Đang khởi tạo...
      </div>
    </section>

    <section class="player">
      <movi-player
        id="player"
        controls
      ></movi-player>
    </section>

    <pre id="diagnostic"></pre>

    <div class="hint">
      Subtitle và audio được đọc trực tiếp từ MKV.
      Không hard-code ngôn ngữ.
    </div>
  </main>

  <script>
    (() => {
      const sourceInput =
        document.getElementById("source");

      const player =
        document.getElementById("player");

      const status =
        document.getElementById("status");

      const diagnostic =
        document.getElementById("diagnostic");

      const playButton =
        document.getElementById("play");

      const checkButton =
        document.getElementById("check");

      const copyButton =
        document.getElementById("copy");

      const clearButton =
        document.getElementById("clear");

      let moviReady = false;

      const defaultSource =
        ${JSON.stringify(DEFAULT_SOURCE)};

      sourceInput.value =
        getQuerySource() || defaultSource;

      function getQuerySource() {
        return new URLSearchParams(
          window.location.search,
        ).get("src") || "";
      }

      function setStatus(message) {
        status.textContent = message;
      }

      function showDiagnostic(value) {
        if (
          value === null ||
          value === undefined
        ) {
          diagnostic.textContent = "";
          return;
        }

        diagnostic.textContent =
          typeof value === "string"
            ? value
            : JSON.stringify(
                value,
                null,
                2,
              );
      }

      function getSource() {
        return sourceInput.value.trim();
      }

      function buildPlayerUrl(source) {
        const url =
          new URL(
            window.location.href,
          );

        url.search = "";

        url.searchParams.set(
          "src",
          source,
        );

        return url.toString();
      }

      function buildProxyUrl(source) {
        const url =
          new URL(
            "/proxy",
            window.location.origin,
          );

        url.searchParams.set(
          "src",
          source,
        );

        return url.toString();
      }

      async function loadMovi() {
        if (moviReady) {
          return;
        }

        setStatus(
          "Đang tải MKV player...",
        );

        await import(
          ${JSON.stringify(MOVI_CDN)}
        );

        moviReady = true;

        setStatus(
          "Player sẵn sàng.",
        );
      }

      async function play() {
        const source = getSource();

        if (!source) {
          setStatus(
            "Hãy nhập URL MKV.",
          );
          return;
        }

        try {
          new URL(source);
        } catch {
          setStatus(
            "URL không hợp lệ.",
          );
          return;
        }

        try {
          await loadMovi();

          const proxyUrl =
            buildProxyUrl(source);

          player.setAttribute(
            "src",
            proxyUrl,
          );

          player.setAttribute(
            "controls",
            "",
          );

          const playerUrl =
            buildPlayerUrl(source);

          window.history.replaceState(
            null,
            "",
            playerUrl,
          );

          setStatus(
            "Đang mở MKV. Subtitle/audio sẽ được đọc tự động...",
          );
        } catch (error) {
          setStatus(
            "Không tải được player: " +
            (
              error?.message ||
              String(error)
            ),
          );

          showDiagnostic({
            error:
              error?.message ||
              String(error),
          });
        }
      }

      async function checkSource() {
        const source = getSource();

        if (!source) {
          setStatus(
            "Hãy nhập URL MKV.",
          );
          return;
        }

        setStatus(
          "Đang kiểm tra qua Service Binding LOLI...",
        );

        try {
          const url =
            new URL(
              "/api/check",
              window.location.origin,
            );

          url.searchParams.set(
            "src",
            source,
          );

          const response =
            await fetch(url, {
              method: "GET",
              cache: "no-store",
            });

          const data =
            await response.json();

          showDiagnostic(data);

          if (data.ok) {
            setStatus(
              "OK: Worker loli trả được MKV.",
            );
          } else {
            setStatus(
              "Nguồn chưa trả MKV thành công.",
            );
          }
        } catch (error) {
          setStatus(
            "Lỗi kiểm tra nguồn.",
          );

          showDiagnostic({
            error:
              error?.message ||
              String(error),
          });
        }
      }

      async function copyPlayerUrl() {
        const source = getSource();

        if (!source) {
          setStatus(
            "Hãy nhập URL MKV.",
          );
          return;
        }

        const playerUrl =
          buildPlayerUrl(source);

        try {
          await navigator.clipboard.writeText(
            playerUrl,
          );

          setStatus(
            "Đã copy link player.",
          );
        } catch {
          sourceInput.value =
            playerUrl;

          sourceInput.select();

          setStatus(
            "Không thể tự copy. Link player đã được đưa vào ô trên.",
          );
        }
      }

      function clearPlayer() {
        player.removeAttribute("src");
        sourceInput.value = "";
        showDiagnostic("");

        setStatus(
          "Đã xóa.",
        );
      }

      playButton.addEventListener(
        "click",
        play,
      );

      checkButton.addEventListener(
        "click",
        checkSource,
      );

      copyButton.addEventListener(
        "click",
        copyPlayerUrl,
      );

      clearButton.addEventListener(
        "click",
        clearPlayer,
      );

      loadMovi().catch((error) => {
        setStatus(
          "Player CDN chưa tải được. Bạn vẫn có thể kiểm tra nguồn.",
        );

        showDiagnostic({
          moviError:
            error?.message ||
            String(error),
        });
      });
    })();
  </script>
</body>
</html>`;
}
