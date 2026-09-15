// src/index.js

const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

function corsHeaders(headers = {}) {
  const result = new Headers(headers);

  result.set("Access-Control-Allow-Origin", "*");
  result.set(
    "Access-Control-Allow-Headers",
    "Range, Content-Type, Accept, Origin, User-Agent"
  );
  result.set(
    "Access-Control-Allow-Methods",
    "GET, HEAD, OPTIONS"
  );
  result.set(
    "Access-Control-Expose-Headers",
    [
      "Accept-Ranges",
      "Content-Length",
      "Content-Range",
      "Content-Type",
      "X-Cache",
    ].join(", ")
  );

  return result;
}

function pageHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",

    // Required for SharedArrayBuffer / libmedia
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  };
}

async function sourceRequest(env, request) {
  const headers = new Headers();

  const range = request.headers.get("Range");

  if (range) {
    headers.set("Range", range);
  }

  headers.set("User-Agent", SAFARI_UA);

  return env.LOLI.fetch(
    new Request(SOURCE_URL, {
      method: request.method,
      headers,
    })
  );
}

function playerPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width,
    initial-scale=1,
    viewport-fit=cover"
  >

  <title>libmedia MKV Test</title>

  <style>
    :root {
      color-scheme: dark;
    }

    html,
    body {
      margin: 0;
      width: 100%;
      min-height: 100%;
      background: #000;
      color: #fff;
      font-family:
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    body {
      min-height: 100vh;
    }

    #player {
      width: 100%;
      height: 70vh;
      min-height: 240px;
      background: #000;
    }

    #info {
      padding: 12px;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    #video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }

    .ok {
      color: #7cff9b;
    }

    .bad {
      color: #ff7474;
    }
  </style>
</head>

<body>

<div id="player"></div>

<pre id="info">Loading libmedia…</pre>

<script
  src="https://cdn.jsdelivr.net/gh/zhaohappy/libmedia@latest/dist/umd/avplayer.js">
</script>

<script type="module">
const SOURCE = "/media";

const info =
  document.getElementById("info");

const container =
  document.getElementById("player");

function write(message) {
  info.textContent += "\\n" + message;
}

function setInfo(message) {
  info.textContent = message;
}

function testBrowser() {
  const result = {
    userAgent: navigator.userAgent,
    crossOriginIsolated:
      window.crossOriginIsolated,
    sharedArrayBuffer:
      typeof SharedArrayBuffer !== "undefined",
    webCodecs:
      typeof VideoDecoder !== "undefined",
    videoDecoder:
      typeof VideoDecoder !== "undefined",
    audioDecoder:
      typeof AudioDecoder !== "undefined",
    hardwareConcurrency:
      navigator.hardwareConcurrency || null,
  };

  setInfo(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}

function resolveCodecName(codecId) {
  if (
    typeof AVCodecID === "undefined"
  ) {
    return "unknown";
  }

  const names = {
    [AVCodecID.AV_CODEC_ID_HEVC]:
      "HEVC",
    [AVCodecID.AV_CODEC_ID_OPUS]:
      "Opus",
  };

  return names[codecId] || "unknown";
}

async function createPlayer() {
  if (
    typeof AVPlayer === "undefined"
  ) {
    throw new Error(
      "libmedia AVPlayer failed to load."
    );
  }

  write("");
  write(
    "libmedia AVPlayer loaded."
  );

  const player =
    new AVPlayer({
      container,

      getWasm(
        type,
        codecId,
        mediaType
      ) {
        if (
          type === "decoder"
        ) {
          if (
            codecId ===
            AVCodecID.AV_CODEC_ID_HEVC
          ) {
            write(
              "HEVC WASM requested: SIMD"
            );

            return (
              "https://cdn.jsdelivr.net/gh/" +
              "zhaohappy/libmedia@latest/" +
              "dist/decode/hevc-simd.wasm"
            );
          }

          if (
            codecId ===
            AVCodecID.AV_CODEC_ID_OPUS
          ) {
            write(
              "Opus WASM requested: SIMD"
            );

            return (
              "https://cdn.jsdelivr.net/gh/" +
              "zhaohappy/libmedia@latest/" +
              "dist/decode/opus-simd.wasm"
            );
          }

          write(
            "WASM requested for codec: " +
            resolveCodecName(
              codecId
            )
          );
        }

        if (
          type === "resampler"
        ) {
          return (
            "https://cdn.jsdelivr.net/gh/" +
            "zhaohappy/libmedia@latest/" +
            "dist/resample/resample-simd.wasm"
          );
        }

        return undefined;
      },
    });

  write(
    "Loading MKV…"
  );

  await player.load(SOURCE);

  write(
    "MKV loaded."
  );

  write(
    "Starting playback…"
  );

  await player.play();

  write(
    "PLAYING"
  );

  return player;
}

async function main() {
  testBrowser();

  try {
    await createPlayer();
  } catch (error) {
    console.error(error);

    write("");
    write(
      "ERROR: " +
      (
        error?.stack ||
        error?.message ||
        String(error)
      )
    );
  }
}

main();
</script>

</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (url.pathname === "/") {
      return new Response(
        playerPage(),
        {
          headers: pageHeaders(),
        }
      );
    }

    if (
      url.pathname === "/media"
    ) {
      if (
        request.method !== "GET" &&
        request.method !== "HEAD"
      ) {
        return new Response(
          "Method Not Allowed",
          {
            status: 405,
          }
        );
      }

      try {
        const response =
          await sourceRequest(
            env,
            request
          );

        const headers =
          corsHeaders(
            response.headers
          );

        headers.set(
          "Accept-Ranges",
          "bytes"
        );

        headers.set(
          "Cache-Control",
          "no-store"
        );

        return new Response(
          response.body,
          {
            status: response.status,
            statusText:
              response.statusText,
            headers,
          }
        );
      } catch (error) {
        console.error(error);

        return new Response(
          JSON.stringify({
            ok: false,
            error:
              error?.message ||
              String(error),
          }),
          {
            status: 502,
            headers: corsHeaders({
              "Content-Type":
                "application/json",
            }),
          }
        );
      }
    }

    if (
      url.pathname === "/api/check"
    ) {
      try {
        const response =
          await env.LOLI.fetch(
            new Request(
              SOURCE_URL,
              {
                method: "GET",
                headers: {
                  Range:
                    "bytes=0-1023",
                  "User-Agent":
                    SAFARI_UA,
                },
              }
            )
          );

        return new Response(
          JSON.stringify({
            ok: response.ok,
            status:
              response.status,
            contentType:
              response.headers.get(
                "Content-Type"
              ),
            contentLength:
              response.headers.get(
                "Content-Length"
              ),
            contentRange:
              response.headers.get(
                "Content-Range"
              ),
            acceptRanges:
              response.headers.get(
                "Accept-Ranges"
              ),
          }),
          {
            headers: corsHeaders({
              "Content-Type":
                "application/json",
              "Cache-Control":
                "no-store",
            }),
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            ok: false,
            error:
              error?.message ||
              String(error),
          }),
          {
            status: 502,
            headers: corsHeaders({
              "Content-Type":
                "application/json",
            }),
          }
        );
      }
    }

    return new Response(
      "Not Found",
      {
        status: 404,
        headers: corsHeaders(),
      }
    );
  },
};
