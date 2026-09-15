/**
 * /src/index.js
 * Cloudflare Worker
 * libmedia UMD MKV player + Loli Service Binding + debug logging.
 */

const LIBMEDIA_VERSION = "1.3.1";
const DEBUG_VERSION = "4";

const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const LIBMEDIA_PLAYER_CDN =
  `https://cdn.jsdelivr.net/npm/@libmedia/avplayer@${LIBMEDIA_VERSION}`;

const LIBMEDIA_ROOT_CDN =
  `https://cdn.jsdelivr.net/gh/zhaohappy/libmedia@v${LIBMEDIA_VERSION}`;

function securityHeaders() {
  return {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

function htmlHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders(),
  };
}

function textHeaders() {
  return {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders(),
  };
}

function invalidPath(message) {
  return new Response(message, {
    status: 400,
    headers: textHeaders(),
  });
}

function errorResponse(message, status) {
  return new Response(message, {
    status,
    headers: textHeaders(),
  });
}

async function proxyJavascript(request, path) {
  const cleanPath = path.replace(/^\/+/, "");

  if (!cleanPath || cleanPath.includes("..")) {
    return invalidPath("Invalid libmedia path");
  }

  const isMainFile = cleanPath === "avplayer.js";

  const isDynamicChunk =
    /^[0-9]+\.avplayer\.js$/.test(cleanPath);

  if (!isMainFile && !isDynamicChunk) {
    return invalidPath(
      `Invalid libmedia JavaScript path: ${cleanPath}`,
    );
  }

  const cdnUrl =
    `${LIBMEDIA_PLAYER_CDN}/dist/umd/${cleanPath}`;

  console.log(
    JSON.stringify({
      event: "LIBMEDIA_JS_REQUEST",
      path: cleanPath,
      url: cdnUrl,
    }),
  );

  const response = await fetch(cdnUrl, {
    method: request.method,
    headers: request.headers,
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  });

  console.log(
    JSON.stringify({
      event: "LIBMEDIA_JS_RESPONSE",
      path: cleanPath,
      status: response.status,
      contentType:
        response.headers.get("content-type"),
      contentLength:
        response.headers.get("content-length"),
    }),
  );

  if (!response.ok) {
    return errorResponse(
      `libmedia AVPlayer error: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  const headers = new Headers(response.headers);

  headers.set(
    "Content-Type",
    "application/javascript; charset=utf-8",
  );

  headers.set(
    "Cache-Control",
    "no-store",
  );

  headers.set(
    "Cross-Origin-Resource-Policy",
    "same-origin",
  );

  headers.delete("Content-Length");
  headers.delete("ETag");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function proxyWasm(request, path) {
  const cleanPath = path.replace(/^\/+/, "");

  if (!cleanPath || cleanPath.includes("..")) {
    return invalidPath("Invalid WASM path");
  }

  const allowedPrefixes = [
    "decode/",
    "resample/",
    "stretchpitch/",
  ];

  if (
    !allowedPrefixes.some((prefix) =>
      cleanPath.startsWith(prefix),
    )
  ) {
    return invalidPath(
      `Invalid WASM path: ${cleanPath}`,
    );
  }

  const cdnUrl =
    `${LIBMEDIA_ROOT_CDN}/dist/${cleanPath}`;

  console.log(
    JSON.stringify({
      event: "WASM_REQUEST",
      path: cleanPath,
      url: cdnUrl,
    }),
  );

  const response = await fetch(cdnUrl, {
    method: request.method,
    headers: request.headers,
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  });

  console.log(
    JSON.stringify({
      event: "WASM_RESPONSE",
      path: cleanPath,
      status: response.status,
      contentType:
        response.headers.get("content-type"),
      contentLength:
        response.headers.get("content-length"),
    }),
  );

  if (!response.ok) {
    return errorResponse(
      `WASM error: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  const headers = new Headers(response.headers);

  headers.set(
    "Content-Type",
    "application/wasm",
  );

  headers.set(
    "Cache-Control",
    "no-store",
  );

  headers.set(
    "Cross-Origin-Resource-Policy",
    "same-origin",
  );

  headers.delete("Content-Length");
  headers.delete("ETag");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildUpstreamHeaders(request) {
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  return headers;
}

async function proxyMedia(request, env) {
  const requestHeaders =
    buildUpstreamHeaders(request);

  const range =
    requestHeaders.get("range");

  const accept =
    requestHeaders.get("accept");

  console.log(
    JSON.stringify({
      event: "MEDIA_REQUEST",
      method: request.method,
      range: range || null,
      accept: accept || null,
    }),
  );

  const upstreamRequest = new Request(
    SOURCE_URL,
    {
      method: request.method,
      headers: requestHeaders,
    },
  );

  const response =
    await env.LOLI.fetch(
      upstreamRequest,
    );

  const contentType =
    response.headers.get(
      "content-type",
    );

  const contentLength =
    response.headers.get(
      "content-length",
    );

  const contentRange =
    response.headers.get(
      "content-range",
    );

  const acceptRanges =
    response.headers.get(
      "accept-ranges",
    );

  console.log(
    JSON.stringify({
      event: "MEDIA_RESPONSE",
      method: request.method,
      requestRange: range || null,
      status: response.status,
      statusText: response.statusText,
      contentType,
      contentLength,
      contentRange,
      acceptRanges,
    }),
  );

  const outputHeaders =
    new Headers(response.headers);

  outputHeaders.set(
    "Access-Control-Allow-Origin",
    "*",
  );

  outputHeaders.set(
    "Access-Control-Allow-Methods",
    "GET, HEAD, OPTIONS",
  );

  outputHeaders.set(
    "Access-Control-Allow-Headers",
    "*",
  );

  outputHeaders.set(
    "Access-Control-Expose-Headers",
    [
      "Accept-Ranges",
      "Content-Length",
      "Content-Range",
      "Content-Type",
      "ETag",
    ].join(", "),
  );

  outputHeaders.set(
    "Cross-Origin-Resource-Policy",
    "cross-origin",
  );

  outputHeaders.set(
    "X-Debug-Media-Status",
    String(response.status),
  );

  outputHeaders.set(
    "X-Debug-Media-Request-Range",
    range || "none",
  );

  outputHeaders.set(
    "X-Debug-Media-Content-Range",
    contentRange || "none",
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outputHeaders,
  });
}

async function debugMedia(env) {
  const testRanges = [
    "bytes=0-1023",
    "bytes=40-4387",
    "bytes=4388-65535",
  ];

  const results = [];

  for (const range of testRanges) {
    const headers = new Headers();

    headers.set(
      "Range",
      range,
    );

    headers.set(
      "Accept",
      "*/*",
    );

    const upstreamRequest =
      new Request(
        SOURCE_URL,
        {
          method: "GET",
          headers,
        },
      );

    const response =
      await env.LOLI.fetch(
        upstreamRequest,
      );

    const result = {
      requestedRange: range,
      status: response.status,
      statusText:
        response.statusText,
      contentType:
        response.headers.get(
          "content-type",
        ),
      contentLength:
        response.headers.get(
          "content-length",
        ),
      contentRange:
        response.headers.get(
          "content-range",
        ),
      acceptRanges:
        response.headers.get(
          "accept-ranges",
        ),
    };

    console.log(
      JSON.stringify({
        event: "DEBUG_RANGE_TEST",
        ...result,
      }),
    );

    results.push(result);

    if (response.body) {
      await response.body.cancel();
    }
  }

  return Response.json(
    {
      ok: results.every(
        (result) =>
          result.status === 206 &&
          result.contentRange !== null,
      ),
      fileSize:
        "2578797592 bytes",
      results,
    },
    {
      headers: {
        ...securityHeaders(),
        "Cache-Control": "no-store",
      },
    },
  );
}

async function checkLoli(env) {
  const response =
    await env.LOLI.fetch(
      SOURCE_URL,
      {
        method: "GET",
        headers: {
          Range: "bytes=0-1023",
        },
      },
    );

  return Response.json(
    {
      ok: response.ok,
      status: response.status,
      statusText:
        response.statusText,
      contentType:
        response.headers.get(
          "content-type",
        ),
      contentLength:
        response.headers.get(
          "content-length",
        ),
      contentRange:
        response.headers.get(
          "content-range",
        ),
      acceptRanges:
        response.headers.get(
          "accept-ranges",
        ),
    },
    {
      headers: {
        ...securityHeaders(),
        "Cache-Control": "no-store",
      },
    },
  );
}

function playerHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  >

  <title>libmedia MKV Debug Player</title>

  <style>
    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #000;
      color: #fff;
      font-family:
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        sans-serif;
    }

    body {
      overflow: hidden;
    }

    #player {
      width: 100%;
      height: 100%;
      min-height: 240px;
      background: #000;
    }

    #status {
      position: fixed;
      z-index: 1000;
      left: 8px;
      right: 8px;
      bottom: 8px;
      max-height: 65vh;
      overflow: auto;
      box-sizing: border-box;
      padding: 12px;
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.92);
      color: #fff;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      font-family:
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;
    }
  </style>
</head>

<body>
  <div id="player"></div>
  <div id="status">Starting...</div>

  <script>
    const statusElement =
      document.getElementById("status");

    const container =
      document.getElementById("player");

    const debugLines = [];

    function log(message) {
      const line =
        "[" +
        new Date().toISOString().slice(11, 23) +
        "] " +
        message;

      debugLines.push(line);

      if (debugLines.length > 100) {
        debugLines.shift();
      }

      statusElement.textContent =
        debugLines.join("\\n");

      console.log(line);
    }

    function formatError(error) {
      if (!error) {
        return "Unknown error";
      }

      if (error instanceof Error) {
        return [
          "name: " +
            (error.name || "Error"),
          "message: " +
            (error.message || ""),
          error.stack
            ? "\\nstack:\\n" +
              error.stack
            : "",
        ].join("\\n");
      }

      return String(error);
    }

    window.addEventListener(
      "error",
      function (event) {
        if (event.error) {
          log(
            "WINDOW ERROR\\n" +
            formatError(event.error),
          );
          return;
        }

        log(
          "BROWSER ERROR\\n" +
          "message: " +
          event.message +
          "\\nfile: " +
          event.filename +
          "\\nline: " +
          event.lineno +
          "\\ncolumn: " +
          event.colno,
        );
      },
      true,
    );

    window.addEventListener(
      "unhandledrejection",
      function (event) {
        log(
          "UNHANDLED REJECTION\\n" +
          formatError(event.reason),
        );
      },
    );

    async function loadLibmedia() {
      log(
        "Loading libmedia UMD " +
        "${LIBMEDIA_VERSION}" +
        "...",
      );

      const script =
        document.createElement("script");

      script.src =
        "/libmedia/avplayer.js?v=${DEBUG_VERSION}";

      script.async = false;

      script.onload = function () {
        log(
          "avplayer.js onload",
        );

        log(
          "typeof window.AVPlayer = " +
          typeof window.AVPlayer,
        );
      };

      script.onerror = function () {
        log(
          "SCRIPT LOAD ERROR\\n" +
          script.src,
        );
      };

      document.head.appendChild(script);

      await new Promise(
        function (resolve, reject) {
          script.addEventListener(
            "load",
            resolve,
            { once: true },
          );

          script.addEventListener(
            "error",
            function () {
              reject(
                new Error(
                  "Failed to load avplayer.js",
                ),
              );
            },
            { once: true },
          );
        },
      );
    }

    async function createPlayer() {
      log(
        "crossOriginIsolated = " +
        window.crossOriginIsolated,
      );

      log(
        "SharedArrayBuffer = " +
        ("SharedArrayBuffer" in window),
      );

      log(
        "VideoDecoder = " +
        ("VideoDecoder" in window),
      );

      log(
        "AVPlayer = " +
        typeof window.AVPlayer,
      );

      if (
        typeof window.AVPlayer !==
        "function"
      ) {
        throw new Error(
          "window.AVPlayer was not exported by UMD.",
        );
      }

      log(
        "Creating AVPlayer...",
      );

      const player =
        new window.AVPlayer({
          container,

          getWasm(
            type,
            codecId,
            mediaType,
          ) {
            log(
              "getWasm: type=" +
              type +
              " codecId=" +
              codecId +
              " mediaType=" +
              mediaType,
            );

            if (type === "decoder") {
              if (codecId === 173) {
                log(
                  "HEVC WASM requested",
                );

                return (
                  "/libmedia-wasm/decode/hevc-simd.wasm"
                );
              }

              if (codecId === 86076) {
                log(
                  "Opus WASM requested",
                );

                return (
                  "/libmedia-wasm/decode/opus-simd.wasm"
                );
              }

              if (codecId === 86018) {
                return (
                  "/libmedia-wasm/decode/aac-simd.wasm"
                );
              }

              if (codecId === 86017) {
                return (
                  "/libmedia-wasm/decode/mp3-simd.wasm"
                );
              }

              if (codecId === 86028) {
                return (
                  "/libmedia-wasm/decode/flac-simd.wasm"
                );
              }

              if (codecId === 27) {
                return (
                  "/libmedia-wasm/decode/h264-simd.wasm"
                );
              }

              log(
                "No WASM mapping for codecId=" +
                codecId,
              );

              return undefined;
            }

            if (type === "resampler") {
              log(
                "Resampler WASM requested",
              );

              return (
                "/libmedia-wasm/resample/resample-simd.wasm"
              );
            }

            if (
              type === "stretchpitcher"
            ) {
              log(
                "StretchPitch WASM requested",
              );

              return (
                "/libmedia-wasm/stretchpitch/stretchpitch-simd.wasm"
              );
            }

            return undefined;
          },
        });

      log(
        "AVPlayer constructor completed.",
      );

      log(
        "Calling player.load('/media')...",
      );

      await player.load("/media");

      log(
        "player.load('/media') completed.",
      );

      log(
        "Calling player.play()...",
      );

      await player.play();

      log(
        "PLAYING",
      );
    }

    async function boot() {
      try {
        await loadLibmedia();

        log(
          "libmedia script loaded.",
        );

        await createPlayer();
      } catch (error) {
        log(
          "FATAL ERROR\\n\\n" +
          formatError(error),
        );
      }
    }

    boot();
  </script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods":
              "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            ...securityHeaders(),
          },
        });
      }

      if (url.pathname === "/") {
        return new Response(
          playerHtml(),
          {
            headers: htmlHeaders(),
          },
        );
      }

      if (url.pathname === "/api/check") {
        return checkLoli(env);
      }

      if (
        url.pathname ===
        "/api/debug-media"
      ) {
        return debugMedia(env);
      }

      if (url.pathname === "/media") {
        return proxyMedia(request, env);
      }

      if (
        url.pathname.startsWith(
          "/libmedia-wasm/",
        )
      ) {
        return proxyWasm(
          request,
          url.pathname.substring(
            "/libmedia-wasm/".length,
          ),
        );
      }

      if (
        url.pathname.startsWith(
          "/libmedia/",
        )
      ) {
        return proxyJavascript(
          request,
          url.pathname.substring(
            "/libmedia/".length,
          ),
        );
      }

      return new Response(
        "Not Found",
        {
          status: 404,
          headers: securityHeaders(),
        },
      );
    } catch (error) {
      console.error(error);

      return new Response(
        error instanceof Error
          ? error.stack || error.message
          : String(error),
        {
          status: 500,
          headers: textHeaders(),
        },
      );
    }
  },
};
