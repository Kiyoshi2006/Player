/**
 * Cloudflare Worker
 * libmedia UMD MKV player + Loli Service Binding.
 */

const LIBMEDIA_VERSION = "1.3.1";

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

function invalidPath(message) {
  return new Response(message, {
    status: 400,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...securityHeaders(),
    },
  });
}

function errorResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...securityHeaders(),
    },
  });
}

async function proxyJavascript(request, path) {
  const cleanPath = path.replace(/^\/+/, "");

  if (!cleanPath || cleanPath.includes("..")) {
    return invalidPath("Invalid libmedia path");
  }

  const isMainFile =
    cleanPath === "avplayer.js";

  const isDynamicChunk =
    /^[0-9]+\.avplayer\.js$/.test(cleanPath);

  if (!isMainFile && !isDynamicChunk) {
    return invalidPath("Invalid libmedia JavaScript path");
  }

  const response = await fetch(
    `${LIBMEDIA_PLAYER_CDN}/dist/umd/${cleanPath}`,
    {
      method: request.method,
      headers: request.headers,
    },
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
    "public, max-age=31536000, immutable",
  );

  headers.set(
    "Cross-Origin-Resource-Policy",
    "same-origin",
  );

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
    return invalidPath("Invalid WASM path");
  }

  const response = await fetch(
    `${LIBMEDIA_ROOT_CDN}/dist/${cleanPath}`,
    {
      method: request.method,
      headers: request.headers,
    },
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
    "public, max-age=31536000, immutable",
  );

  headers.set(
    "Cross-Origin-Resource-Policy",
    "same-origin",
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function proxyMedia(request, env) {
  const headers = new Headers(request.headers);

  headers.delete("host");

  const response = await env.LOLI.fetch(
    SOURCE_URL,
    {
      method: request.method,
      headers,
    },
  );

  const outputHeaders = new Headers(
    response.headers,
  );

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

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outputHeaders,
  });
}

async function checkLoli(env) {
  const response = await env.LOLI.fetch(
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
      statusText: response.statusText,
      contentType:
        response.headers.get("content-type"),
      contentLength:
        response.headers.get("content-length"),
      contentRange:
        response.headers.get("content-range"),
      acceptRanges:
        response.headers.get("accept-ranges"),
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

  <title>libmedia MKV Player</title>

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
      z-index: 100;
      left: 12px;
      right: 12px;
      bottom: 12px;
      max-height: 50vh;
      overflow: auto;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>

<body>
  <div id="player"></div>
  <div id="status">Loading libmedia...</div>

  <script src="/libmedia/avplayer.js"></script>

  <script>
    const statusElement =
      document.getElementById("status");

    const container =
      document.getElementById("player");

    function setStatus(message) {
      statusElement.textContent = message;
      console.log(message);
    }

    function describeError(error) {
      if (!error) {
        return "Unknown error";
      }

      const parts = [];

      if (error.name) {
        parts.push("name: " + error.name);
      }

      if (error.message) {
        parts.push("message: " + error.message);
      }

      if (error.stack) {
        parts.push("\\nstack:\\n" + error.stack);
      }

      return parts.join("\\n");
    }

    async function createPlayer() {
      setStatus(
        "Checking libmedia...\\n" +
        "crossOriginIsolated: " +
        window.crossOriginIsolated + "\\n" +
        "SharedArrayBuffer: " +
        ("SharedArrayBuffer" in window) + "\\n" +
        "VideoDecoder: " +
        ("VideoDecoder" in window) + "\\n" +
        "AVPlayer: " +
        typeof window.AVPlayer,
      );

      if (typeof window.AVPlayer !== "function") {
        throw new Error(
          "window.AVPlayer is unavailable.",
        );
      }

      setStatus(
        "AVPlayer loaded successfully.\\n" +
        "Creating player...",
      );

      const player = new window.AVPlayer({
        container,

        getWasm(type, codecId, mediaType) {
          console.log(
            "getWasm:",
            type,
            codecId,
            mediaType,
          );

          if (type === "decoder") {
            if (codecId === 173) {
              return "/libmedia-wasm/decode/hevc-simd.wasm";
            }

            if (codecId === 86076) {
              return "/libmedia-wasm/decode/opus-simd.wasm";
            }

            if (codecId === 86018) {
              return "/libmedia-wasm/decode/aac-simd.wasm";
            }

            if (codecId === 86017) {
              return "/libmedia-wasm/decode/mp3-simd.wasm";
            }

            if (codecId === 86028) {
              return "/libmedia-wasm/decode/flac-simd.wasm";
            }

            if (codecId === 27) {
              return "/libmedia-wasm/decode/h264-simd.wasm";
            }

            return undefined;
          }

          if (type === "resampler") {
            return "/libmedia-wasm/resample/resample-simd.wasm";
          }

          if (type === "stretchpitcher") {
            return "/libmedia-wasm/stretchpitch/stretchpitch-simd.wasm";
          }

          return undefined;
        },
      });

      setStatus(
        "AVPlayer created.\\n" +
        "Loading MKV...",
      );

      await player.load("/media");

      setStatus(
        "MKV loaded.\\n" +
        "Starting playback...",
      );

      await player.play();

      setStatus("PLAYING");
    }

    createPlayer().catch((error) => {
      console.error(error);

      setStatus(
        "ERROR\\n\\n" +
        describeError(error),
      );
    });
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
        return new Response(playerHtml(), {
          headers: htmlHeaders(),
        });
      }

      if (url.pathname === "/api/check") {
        return checkLoli(env);
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

      return new Response("Not Found", {
        status: 404,
        headers: securityHeaders(),
      });
    } catch (error) {
      console.error(error);

      return new Response(
        error instanceof Error
          ? error.stack || error.message
          : String(error),
        {
          status: 500,
          headers: {
            "Content-Type":
              "text/plain; charset=utf-8",
            ...securityHeaders(),
          },
        },
      );
    }
  },
};
