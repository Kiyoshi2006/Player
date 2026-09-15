// src/index.js

const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_PREFETCH_BYTES = 512 * 1024 * 1024;

const CACHE_NAME = "mkv-range-cache-v1";

function corsHeaders(headers = {}) {
  const result = new Headers(headers);

  result.set("Access-Control-Allow-Origin", "*");
  result.set(
    "Access-Control-Allow-Headers",
    "Range, Content-Type, Accept, Origin, User-Agent"
  );
  result.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  result.set("Access-Control-Expose-Headers", [
    "Accept-Ranges",
    "Content-Length",
    "Content-Range",
    "Content-Type",
    "ETag",
    "Last-Modified",
  ].join(", "));

  return result;
}

function htmlHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  };
}

function parseRange(range, totalSize) {
  if (!range || !range.startsWith("bytes=")) {
    return null;
  }

  const value = range.slice(6).split(",")[0].trim();

  if (value.includes("-")) {
    const [startText, endText] = value.split("-");

    if (startText === "") {
      const suffixLength = Number(endText);

      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        return null;
      }

      const start = Math.max(0, totalSize - suffixLength);
      return {
        start,
        end: totalSize - 1,
      };
    }

    const start = Number(startText);

    if (!Number.isFinite(start) || start < 0 || start >= totalSize) {
      return null;
    }

    let end = endText === "" ? totalSize - 1 : Number(endText);

    if (!Number.isFinite(end)) {
      return null;
    }

    end = Math.min(end, totalSize - 1);

    if (end < start) {
      return null;
    }

    return { start, end };
  }

  return null;
}

function chunkKey(index) {
  return new Request(
    `https://mkv-cache.internal/chunk/${index}`,
    {
      method: "GET",
    }
  );
}

async function getSourceMetadata(env) {
  const response = await env.LOLI.fetch(
    new Request(SOURCE_URL, {
      method: "GET",
      headers: {
        Range: "bytes=0-0",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      },
    })
  );

  if (!response.ok && response.status !== 206) {
    throw new Error(`Source metadata request failed: ${response.status}`);
  }

  const contentRange = response.headers.get("Content-Range");
  const totalSize = parseTotalSize(contentRange);

  if (!totalSize) {
    throw new Error("Source did not provide Content-Range.");
  }

  return {
    totalSize,
    contentType:
      response.headers.get("Content-Type") || "video/x-matroska",
  };
}

function parseTotalSize(contentRange) {
  if (!contentRange) {
    return null;
  }

  const match = contentRange.match(/\/(\d+)$/);

  if (!match) {
    return null;
  }

  const size = Number(match[1]);

  return Number.isSafeInteger(size) && size > 0 ? size : null;
}

async function fetchChunk(env, index, totalSize, cache) {
  const cached = await cache.match(chunkKey(index));

  if (cached) {
    return cached;
  }

  const start = index * CHUNK_SIZE;
  const end = Math.min(
    totalSize - 1,
    start + CHUNK_SIZE - 1
  );

  const response = await env.LOLI.fetch(
    new Request(SOURCE_URL, {
      method: "GET",
      headers: {
        Range: `bytes=${start}-${end}`,
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      },
    })
  );

  if (!response.ok && response.status !== 206) {
    throw new Error(
      `Chunk ${index} failed: ${response.status}`
    );
  }

  const body = await response.arrayBuffer();

  const cachedResponse = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=86400",
    },
  });

  await cache.put(chunkKey(index), cachedResponse.clone());

  return cachedResponse;
}

async function serveRange(env, request) {
  const cache = caches.default;

  const metadata = await getSourceMetadata(env);

  const range = parseRange(
    request.headers.get("Range"),
    metadata.totalSize
  );

  if (!range) {
    return new Response("Range header required.", {
      status: 416,
      headers: corsHeaders({
        "Content-Range": `bytes */${metadata.totalSize}`,
      }),
    });
  }

  const requestedStart = range.start;
  const requestedEnd = range.end;

  const firstChunk = Math.floor(
    requestedStart / CHUNK_SIZE
  );

  const lastChunk = Math.floor(
    requestedEnd / CHUNK_SIZE
  );

  const chunks = [];

  for (
    let index = firstChunk;
    index <= lastChunk;
    index += 1
  ) {
    chunks.push(
      await fetchChunk(
        env,
        index,
        metadata.totalSize,
        cache
      )
    );
  }

  const buffers = await Promise.all(
    chunks.map((chunk) => chunk.arrayBuffer())
  );

  const outputParts = [];

  for (let i = 0; i < buffers.length; i += 1) {
    const chunkIndex = firstChunk + i;
    const chunkStart = chunkIndex * CHUNK_SIZE;
    const chunkEnd =
      chunkStart + buffers[i].byteLength - 1;

    const sliceStart = Math.max(
      requestedStart - chunkStart,
      0
    );

    const sliceEnd = Math.min(
      requestedEnd - chunkStart + 1,
      buffers[i].byteLength
    );

    if (sliceStart < sliceEnd) {
      outputParts.push(
        new Uint8Array(
          buffers[i],
          sliceStart,
          sliceEnd - sliceStart
        )
      );
    }
  }

  const totalLength = outputParts.reduce(
    (sum, part) => sum + part.byteLength,
    0
  );

  const output = new Uint8Array(totalLength);

  let offset = 0;

  for (const part of outputParts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return new Response(output, {
    status: 206,
    headers: corsHeaders({
      "Content-Type": metadata.contentType,
      "Content-Length": String(output.byteLength),
      "Content-Range":
        `bytes ${requestedStart}-${requestedStart + output.byteLength - 1}/${metadata.totalSize}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    }),
  });
}

async function prefetch(env, request) {
  const cache = caches.default;

  const metadata = await getSourceMetadata(env);

  const requestedBytes = Math.min(
    MAX_PREFETCH_BYTES,
    Number(
      new URL(request.url).searchParams.get("bytes") ||
        MAX_PREFETCH_BYTES
    )
  );

  const bytes = Math.max(
    CHUNK_SIZE,
    Math.min(requestedBytes, MAX_PREFETCH_BYTES)
  );

  const chunkCount = Math.min(
    Math.ceil(bytes / CHUNK_SIZE),
    Math.ceil(metadata.totalSize / CHUNK_SIZE)
  );

  const concurrency = 3;

  for (
    let offset = 0;
    offset < chunkCount;
    offset += concurrency
  ) {
    const batch = [];

    for (
      let i = offset;
      i < Math.min(offset + concurrency, chunkCount);
      i += 1
    ) {
      batch.push(
        fetchChunk(
          env,
          i,
          metadata.totalSize,
          cache
        )
      );
    }

    await Promise.all(batch);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      cachedBytes: Math.min(
        bytes,
        metadata.totalSize
      ),
      chunkSize: CHUNK_SIZE,
      chunks: chunkCount,
      totalSize: metadata.totalSize,
    }),
    {
      headers: corsHeaders({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      }),
    }
  );
}

function playerPage() {
  const source = "/media";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1,viewport-fit=cover"
  >

  <title>MKV Player</title>

  <script
    type="module"
    src="https://cdn.jsdelivr.net/npm/movi-player@0.4.0/dist/element.js"
  ></script>

  <style>
    :root {
      color-scheme: dark;
      background: #000;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      width: 100%;
      min-height: 100%;
      background: #000;
    }

    body {
      overflow-x: hidden;
      font-family: system-ui, -apple-system, BlinkMacSystemFont,
        "Segoe UI", sans-serif;
    }

    main {
      width: 100%;
      min-height: 100vh;
      background: #000;
    }

    movi-player {
      display: block;
      width: 100%;
      height: 100vh;
      min-height: 240px;
      background: #000;
    }

    #status {
      position: fixed;
      z-index: 1000;
      left: 10px;
      right: 10px;
      bottom: calc(10px + env(safe-area-inset-bottom));
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(0, 0, 0, .72);
      color: #fff;
      font-size: 12px;
      pointer-events: none;
    }
  </style>
</head>

<body>
  <main>
    <movi-player
      id="player"
      src="${source}"
      controls
      preload="auto"
      buffersize="512"
      probesize="2mb"
      probeduration="5000"
    ></movi-player>
  </main>

  <div id="status">Preparing cache…</div>

  <script>
    const player = document.getElementById("player");
    const status = document.getElementById("status");

    async function startPrefetch() {
      try {
        status.textContent = "Loading first 512 MB…";

        const response = await fetch(
          "/prefetch?bytes=${MAX_PREFETCH_BYTES}",
          {
            cache: "no-store"
          }
        );

        if (!response.ok) {
          throw new Error(
            "Prefetch failed: " + response.status
          );
        }

        const data = await response.json();

        status.textContent =
          "Cached " +
          Math.round(data.cachedBytes / 1024 / 1024) +
          " MB";

        setTimeout(() => {
          status.remove();
        }, 3000);
      } catch (error) {
        console.error(error);

        status.textContent =
          "Prefetch error: " + error.message;

        setTimeout(() => {
          status.remove();
        }, 5000);
      }
    }

    player.addEventListener("error", (event) => {
      console.error("Movi error:", event);
    });

    startPrefetch();
  </script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (url.pathname === "/") {
      return new Response(playerPage(), {
        headers: htmlHeaders(),
      });
    }

    if (url.pathname === "/media") {
      if (
        request.method !== "GET" &&
        request.method !== "HEAD"
      ) {
        return new Response("Method Not Allowed", {
          status: 405,
        });
      }

      if (request.method === "HEAD") {
        const metadata = await getSourceMetadata(env);

        return new Response(null, {
          status: 200,
          headers: corsHeaders({
            "Content-Type": metadata.contentType,
            "Content-Length": String(metadata.totalSize),
            "Accept-Ranges": "bytes",
          }),
        });
      }

      try {
        return await serveRange(env, request);
      } catch (error) {
        console.error(error);

        return new Response(
          JSON.stringify({
            ok: false,
            error: error.message,
          }),
          {
            status: 502,
            headers: corsHeaders({
              "Content-Type": "application/json",
            }),
          }
        );
      }
    }

    if (url.pathname === "/prefetch") {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", {
          status: 405,
        });
      }

      try {
        return await prefetch(env, request);
      } catch (error) {
        console.error(error);

        return new Response(
          JSON.stringify({
            ok: false,
            error: error.message,
          }),
          {
            status: 502,
            headers: corsHeaders({
              "Content-Type": "application/json",
            }),
          }
        );
      }
    }

    if (url.pathname === "/api/check") {
      try {
        const response = await env.LOLI.fetch(
          new Request(SOURCE_URL, {
            method: "GET",
            headers: {
              Range: "bytes=0-1023",
            },
          })
        );

        return new Response(
          JSON.stringify({
            ok: response.ok,
            status: response.status,
            contentType:
              response.headers.get("Content-Type"),
            contentLength:
              response.headers.get("Content-Length"),
            contentRange:
              response.headers.get("Content-Range"),
            acceptRanges:
              response.headers.get("Accept-Ranges"),
          }),
          {
            headers: corsHeaders({
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            }),
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: error.message,
          }),
          {
            status: 502,
            headers: corsHeaders({
              "Content-Type": "application/json",
            }),
          }
        );
      }
    }

    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders(),
    });
  },
};
