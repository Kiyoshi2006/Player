/**
 * Cloudflare Worker
 * iPhone MKV player using libmedia 1.3.1.
 */

const LIBMEDIA_VERSION = "1.3.1";

const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const LIBMEDIA_CDN =
  `https://cdn.jsdelivr.net/gh/zhaohappy/libmedia@${LIBMEDIA_VERSION}`;

/*
 * FFmpeg/libavcodec codec IDs.
 *
 * These are used instead of AVCodecID because the UMD build does not
 * expose AVCodecID as a browser global.
 */
const CODEC = {
  H264: 27,
  HEVC: 173,
  MP3: 86017,
  AAC: 86018,
  FLAC: 86028,
  OPUS: 86076,
};

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

function jsHeaders() {
  return {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=31536000, immutable",
    ...securityHeaders(),
  };
}

function wasmHeaders() {
  return {
    "Content-Type": "application/wasm",
    "Cache-Control": "public, max-age=31536000, immutable",
    ...securityHeaders(),
  };
}

async function proxyLibmedia(request, path) {
  const cleanPath = path.replace(/^\/+/, "");

  if (!cleanPath || cleanPath.includes("..")) {
    return new Response("Invalid libmedia path", {
      status: 400,
      headers: securityHeaders(),
    });
  }

  const response = await fetch(
    `${LIBMEDIA_CDN}/dist/umd/${cleanPath}`,
    {
      method: request.method,
      headers: request.headers,
    },
  );

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

  const allowedDirectories = [
    "decode/",
    "resample/",
    "stretchpitch/",
  ];

  if (!allowedDirectories.some((prefix) => cleanPath.startsWith(prefix))) {
    return new Response("Invalid WASM directory", {
      status: 400,
      headers: securityHeaders(),
    });
  }

  const response = await fetch(
    `${LIBMEDIA_CDN}/dist/${cleanPath}`,
    {
      method: request.method,
      headers: request.headers,
    },
  );

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

  const outputHeaders = new Headers(response.headers);

  outputHeaders.set(
    "Access-Control-Allow-Origin",
    request.headers.get("Origin") || "*",
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

      max-height: 45vh;
      overflow: auto;

      padding: 10px 12px;
      border-radius: 10px;

      background: rgba(0, 0, 0, 0.78);
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
    const SOURCE = "/media";

    const container = document.getElementById("player");
    const statusElement = document.getElementById("status");

    function setStatus(message) {
      statusElement.textContent = message;
      console.log(message);
    }

    function codecName(codecId) {
      const names = {
        27: "H.264",
        173: "HEVC",
        86017: "MP3",
        86018: "AAC",
        86028: "FLAC",
        86076: "Opus",
      };

      return names[codecId] || String(codecId);
    }

    function wasmForCodec(codecId) {
      switch (codecId) {
        case 173:
          return "/libmedia-wasm/decode/hevc-simd.wasm";

        case 27:
          return "/libmedia-wasm/decode/h264-simd.wasm";

        case 86076:
          return "/libmedia-wasm/decode/opus-simd.wasm";

        case 86018:
          return "/libmedia-wasm/decode/aac-simd.wasm";

        case 86017:
          return "/libmedia-wasm/decode/mp3-simd.wasm";

        case 86028:
          return "/libmedia-wasm/decode/flac-simd.wasm";

        default:
          return undefined;
      }
    }

    async function createPlayer() {
      if (typeof AVPlayer === "undefined") {
        throw new Error(
          "AVPlayer global is unavailable.",
        );
      }

      setStatus(
        "libmedia loaded\\n" +
        "crossOriginIsolated: " +
        crossOriginIsolated +
        "\\n" +
        "SharedArrayBuffer: " +
        ("SharedArrayBuffer" in window) +
        "\\n" +
        "WebCodecs: " +
        ("VideoDecoder" in window),
      );

      const player = new AVPlayer({
        container,

        getWasm(type, codecId, mediaType) {
          console.log(
            "getWasm",
            "type=" + type,
            "codec=" + codecName(codecId),
            "codecId=" + codecId,
            "mediaType=" + mediaType,
          );

          if (type === "decoder") {
            const wasm = wasmForCodec(codecId);

            if (wasm) {
              return wasm;
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

      const message =
        error && error.stack
          ? error.stack
          : error && error.message
            ? error.message
            : String(error);

      setStatus(
        "ERROR\\n\\n" +
        message,
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
