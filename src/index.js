/**
 * Cloudflare Worker
 * Player + libmedia 1.3.1 + Loli Service Binding
 */

const LIBMEDIA_VERSION = "1.3.1";

const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const LIBMEDIA_CDN =
  `https://cdn.jsdelivr.net/gh/zhaohappy/libmedia@${LIBMEDIA_VERSION}`;

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
    ...securityHeaders(),
    "Cache-Control": "no-store",
  };
}

function wasmHeaders() {
  return {
    "Content-Type": "application/wasm",
    ...securityHeaders(),
    "Cache-Control": "public, max-age=31536000, immutable",
  };
}

function jsHeaders() {
  return {
    "Content-Type": "application/javascript; charset=utf-8",
    ...securityHeaders(),
    "Cache-Control": "public, max-age=31536000, immutable",
  };
}

function responseHeaders(response, contentType) {
  const headers = new Headers(response.headers);

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  headers.set("Cross-Origin-Resource-Policy", "same-origin");

  return headers;
}

async function proxyLibmedia(request, path) {
  const cleanPath = path.replace(/^\/+/, "");

  if (!cleanPath || cleanPath.includes("..")) {
    return new Response("Invalid libmedia path", {
      status: 400,
      headers: securityHeaders(),
    });
  }

  const url = `${LIBMEDIA_CDN}/dist/umd/${cleanPath}`;

  const response = await fetch(url, {
    method: request.method,
    headers: request.headers,
  });

  if (!response.ok) {
    return new Response(
      `libmedia CDN error: ${response.status} ${response.statusText}`,
      {
        status: response.status,
        headers: securityHeaders(),
      },
    );
  }

  return new Response(response.body, {
    status: response.status,
    headers: jsHeaders(),
  });
}

async function proxyWasm(request, path) {
  const cleanPath = path.replace(/^\/+/, "");

  if (!cleanPath || cleanPath.includes("..")) {
    return new Response("Invalid WASM path", {
      status: 400,
      headers: securityHeaders(),
    });
  }

  let cdnPath;

  if (cleanPath.startsWith("decode/")) {
    cdnPath = `/dist/${cleanPath}`;
  } else if (cleanPath.startsWith("resample/")) {
    cdnPath = `/dist/${cleanPath}`;
  } else if (cleanPath.startsWith("stretchpitch/")) {
    cdnPath = `/dist/${cleanPath}`;
  } else {
    return new Response("Invalid WASM path", {
      status: 400,
      headers: securityHeaders(),
    });
  }

  const response = await fetch(`${LIBMEDIA_CDN}${cdnPath}`, {
    method: request.method,
    headers: request.headers,
  });

  if (!response.ok) {
    return new Response(
      `WASM CDN error: ${response.status} ${response.statusText}`,
      {
        status: response.status,
        headers: securityHeaders(),
      },
    );
  }

  return new Response(response.body, {
    status: response.status,
    headers: wasmHeaders(),
  });
}

async function proxyMedia(request, env) {
  const headers = new Headers(request.headers);

  headers.delete("host");

  const response = await env.LOLI.fetch(SOURCE_URL, {
    method: request.method,
    headers,
  });

  const outputHeaders = responseHeaders(response);

  outputHeaders.set(
    "Access-Control-Allow-Origin",
    request.headers.get("Origin") || "*",
  );

  outputHeaders.set("Access-Control-Expose-Headers", [
    "Accept-Ranges",
    "Content-Length",
    "Content-Range",
    "Content-Type",
    "ETag",
  ].join(", "));

  outputHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outputHeaders,
  });
}

async function checkLoli(env) {
  const response = await env.LOLI.fetch(SOURCE_URL, {
    method: "GET",
    headers: {
      Range: "bytes=0-1023",
    },
  });

  return Response.json(
    {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
      contentRange: response.headers.get("content-range"),
      acceptRanges: response.headers.get("accept-ranges"),
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
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100%;
      background: #000;
      color: #fff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }

    body {
      min-height: 100vh;
    }

    #player {
      width: 100%;
      height: 100vh;
      min-height: 240px;
      background: #000;
    }

    #status {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: 12px;
      z-index: 10;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.75);
      color: #fff;
      font-size: 13px;
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
    const SOURCE = "/media";

    const statusElement = document.getElementById("status");
    const container = document.getElementById("player");

    function setStatus(message) {
      statusElement.textContent = message;
      console.log(message);
    }

    function getCodecName(codecId) {
      if (
        typeof AVCodecID !== "undefined" &&
        codecId === AVCodecID.AV_CODEC_ID_HEVC
      ) {
        return "HEVC";
      }

      if (
        typeof AVCodecID !== "undefined" &&
        codecId === AVCodecID.AV_CODEC_ID_OPUS
      ) {
        return "Opus";
      }

      return String(codecId);
    }

    async function createPlayer() {
      if (typeof AVPlayer === "undefined") {
        throw new Error(
          "AVPlayer global is unavailable. libmedia UMD did not load correctly.",
        );
      }

      setStatus(
        "libmedia loaded\\n" +
        "crossOriginIsolated: " + crossOriginIsolated + "\\n" +
        "SharedArrayBuffer: " + ("SharedArrayBuffer" in window),
      );

      const player = new AVPlayer({
        container,

        getWasm(type, codecId, mediaType) {
          console.log(
            "getWasm:",
            type,
            getCodecName(codecId),
            mediaType,
          );

          if (type === "decoder") {
            switch (codecId) {
              case AVCodecID.AV_CODEC_ID_HEVC:
                return "/libmedia-wasm/decode/hevc-simd.wasm";

              case AVCodecID.AV_CODEC_ID_H264:
                return "/libmedia-wasm/decode/h264-simd.wasm";

              case AVCodecID.AV_CODEC_ID_AAC:
                return "/libmedia-wasm/decode/aac-simd.wasm";

              case AVCodecID.AV_CODEC_ID_MP3:
                return "/libmedia-wasm/decode/mp3-simd.wasm";

              case AVCodecID.AV_CODEC_ID_FLAC:
                return "/libmedia-wasm/decode/flac-simd.wasm";
            }
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

      setStatus("Player created. Loading MKV...");

      await player.load(SOURCE);

      setStatus("MKV loaded. Starting playback...");

      await player.play();

      setStatus("Playing.");
    }

    createPlayer().catch((error) => {
      console.error(error);

      setStatus(
        "ERROR\\n\\n" +
        (error && error.stack
          ? error.stack
          : String(error)),
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
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
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

      if (url.pathname.startsWith("/libmedia/")) {
        return proxyLibmedia(
          request,
          url.pathname.substring("/libmedia/".length),
        );
      }

      if (url.pathname.startsWith("/libmedia-wasm/")) {
        return proxyWasm(
          request,
          url.pathname.substring("/libmedia-wasm/".length),
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
            "Content-Type": "text/plain; charset=utf-8",
            ...securityHeaders(),
          },
        },
      );
    }
  },
};
