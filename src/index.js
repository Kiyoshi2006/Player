// src/index.js

const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const CHUNK_SIZE = 8 * 1024 * 1024;
const PREFETCH_MIN = 128 * 1024 * 1024;
const PREFETCH_TARGET = 512 * 1024 * 1024;
const PREFETCH_CONCURRENCY = 3;

const CACHE_NAME = "mkv-range-cache-v3";
const STATS_KEY = "mkv-stats-v3";

const stats = {
  cacheHits: 0,
  cacheMisses: 0,
  bytesFromCache: 0,
  bytesFromLoli: 0,
  chunksLoaded: 0,
  chunksFailed: 0,
  prefetchRequests: 0,
  prefetchBytes: 0,
  loliLatencyMs: 0,
  cacheLatencyMs: 0,
  lastError: null,
  startedAt: Date.now(),
};

function corsHeaders(headers = {}) {
  const result = new Headers(headers);

  result.set("Access-Control-Allow-Origin", "*");
  result.set(
    "Access-Control-Allow-Headers",
    "Range, Content-Type, Accept, Origin, User-Agent"
  );
  result.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  result.set(
    "Access-Control-Expose-Headers",
    [
      "Accept-Ranges",
      "Content-Length",
      "Content-Range",
      "Content-Type",
      "ETag",
      "Last-Modified",
      "X-Cache",
      "X-Cache-Chunk",
      "X-Loli-Latency",
    ].join(", ")
  );

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

function sourceHeaders(range) {
  const headers = {
    Range: range,
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
      "AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  };

  return headers;
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

  if (!Number.isSafeInteger(size) || size <= 0) {
    return null;
  }

  return size;
}

function parseRange(range, totalSize) {
  if (!range || !range.startsWith("bytes=")) {
    return null;
  }

  const value = range.slice(6).split(",")[0].trim();
  const separator = value.indexOf("-");

  if (separator === -1) {
    return null;
  }

  const startText = value.slice(0, separator);
  const endText = value.slice(separator + 1);

  if (startText === "") {
    const suffixLength = Number(endText);

    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }

    return {
      start: Math.max(0, totalSize - suffixLength),
      end: totalSize - 1,
    };
  }

  const start = Number(startText);

  if (!Number.isSafeInteger(start) || start < 0) {
    return null;
  }

  if (start >= totalSize) {
    return null;
  }

  let end =
    endText === ""
      ? totalSize - 1
      : Number(endText);

  if (!Number.isSafeInteger(end)) {
    return null;
  }

  end = Math.min(end, totalSize - 1);

  if (end < start) {
    return null;
  }

  return {
    start,
    end,
  };
}

function chunkCacheKey(index) {
  return new Request(
    `https://mkv-cache.internal/${CACHE_NAME}/chunk/${index}`,
    {
      method: "GET",
    }
  );
}

function addStat(name, value) {
  if (!(name in stats)) {
    return;
  }

  stats[name] += value;
}

async function getSourceMetadata(env) {
  const response = await env.LOLI.fetch(
    new Request(SOURCE_URL, {
      method: "GET",
      headers: sourceHeaders("bytes=0-0"),
    })
  );

  if (!response.ok && response.status !== 206) {
    throw new Error(
      `Source metadata failed: ${response.status}`
    );
  }

  const contentRange =
    response.headers.get("Content-Range");

  const totalSize = parseTotalSize(contentRange);

  if (!totalSize) {
    throw new Error(
      "LOLI did not return a valid Content-Range."
    );
  }

  return {
    totalSize,
    contentType:
      response.headers.get("Content-Type") ||
      "video/x-matroska",
  };
}

async function readCachedChunk(cache, index) {
  const started = performance.now();

  const response = await cache.match(
    chunkCacheKey(index)
  );

  const latency = performance.now() - started;

  addStat("cacheLatencyMs", latency);

  if (!response) {
    stats.cacheMisses += 1;
    return null;
  }

  const body = await response.arrayBuffer();

  stats.cacheHits += 1;
  stats.bytesFromCache += body.byteLength;

  return {
    body,
    latency,
  };
}

async function fetchChunkFromLoli(
  env,
  index,
  totalSize,
  cache
) {
  const cached = await readCachedChunk(cache, index);

  if (cached) {
    return {
      body: cached.body,
      cacheStatus: "HIT",
      latency: cached.latency,
    };
  }

  const start = index * CHUNK_SIZE;
  const end = Math.min(
    totalSize - 1,
    start + CHUNK_SIZE - 1
  );

  const range = `bytes=${start}-${end}`;
  const started = performance.now();

  let response;

  try {
    response = await env.LOLI.fetch(
      new Request(SOURCE_URL, {
        method: "GET",
        headers: sourceHeaders(range),
      })
    );
  } catch (error) {
    stats.chunksFailed += 1;
    stats.lastError = error.message;
    throw error;
  }

  const latency = performance.now() - started;

  addStat("loliLatencyMs", latency);

  if (!response.ok && response.status !== 206) {
    stats.chunksFailed += 1;
    stats.lastError =
      `Chunk ${index}: HTTP ${response.status}`;

    throw new Error(
      `Chunk ${index} failed: ${response.status}`
    );
  }

  const body = await response.arrayBuffer();

  stats.bytesFromLoli += body.byteLength;
  stats.chunksLoaded += 1;

  const cacheResponse = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.byteLength),
      "Cache-Control":
        "public, max-age=86400, immutable",
      "X-Cache-Chunk": String(index),
    },
  });

  await cache.put(
    chunkCacheKey(index),
    cacheResponse.clone()
  );

  return {
    body,
    cacheStatus: "MISS",
    latency,
  };
}

async function loadChunk(
  env,
  index,
  totalSize,
  cache
) {
  return fetchChunkFromLoli(
    env,
    index,
    totalSize,
    cache
  );
}

function buildRangeBody(
  buffers,
  firstChunk,
  requestedStart,
  requestedEnd
) {
  const parts = [];

  for (let i = 0; i < buffers.length; i += 1) {
    const chunkIndex = firstChunk + i;
    const chunkStart = chunkIndex * CHUNK_SIZE;

    const buffer = buffers[i];

    const chunkEnd =
      chunkStart + buffer.byteLength - 1;

    const sliceStart = Math.max(
      requestedStart - chunkStart,
      0
    );

    const sliceEnd = Math.min(
      requestedEnd - chunkStart + 1,
      buffer.byteLength
    );

    if (
      sliceStart >= sliceEnd ||
      sliceStart > chunkEnd
    ) {
      continue;
    }

    parts.push(
      new Uint8Array(
        buffer,
        sliceStart,
        sliceEnd - sliceStart
      )
    );
  }

  const length = parts.reduce(
    (total, part) => total + part.byteLength,
    0
  );

  const output = new Uint8Array(length);

  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

async function serveRange(env, request) {
  const cache = caches.default;
  const metadata = await getSourceMetadata(env);

  const parsedRange = parseRange(
    request.headers.get("Range"),
    metadata.totalSize
  );

  if (!parsedRange) {
    return new Response("Range Required", {
      status: 416,
      headers: corsHeaders({
        "Content-Range":
          `bytes */${metadata.totalSize}`,
        "Accept-Ranges": "bytes",
      }),
    });
  }

  const requestedStart = parsedRange.start;
  const requestedEnd = parsedRange.end;

  const firstChunk = Math.floor(
    requestedStart / CHUNK_SIZE
  );

  const lastChunk = Math.floor(
    requestedEnd / CHUNK_SIZE
  );

  const chunkResults = [];

  for (
    let index = firstChunk;
    index <= lastChunk;
    index += 1
  ) {
    chunkResults.push(
      await loadChunk(
        env,
        index,
        metadata.totalSize,
        cache
      )
    );
  }

  const buffers = chunkResults.map(
    (result) => result.body
  );

  const output = buildRangeBody(
    buffers,
    firstChunk,
    requestedStart,
    requestedEnd
  );

  const actualEnd =
    requestedStart + output.byteLength - 1;

  const cacheStatuses = chunkResults.map(
    (result) => result.cacheStatus
  );

  const hasMiss = cacheStatuses.includes("MISS");

  return new Response(output, {
    status: 206,
    headers: corsHeaders({
      "Content-Type": metadata.contentType,
      "Content-Length": String(output.byteLength),
      "Content-Range":
        `bytes ${requestedStart}-${actualEnd}/${metadata.totalSize}`,
      "Accept-Ranges": "bytes",
      "Cache-Control":
        "public, max-age=86400",
      "X-Cache":
        hasMiss ? "MISS" : "HIT",
      "X-Cache-Chunk":
        `${firstChunk}-${lastChunk}`,
      "X-Loli-Latency":
        chunkResults
          .map((result) =>
            Math.round(result.latency)
          )
          .join(","),
    }),
  });
}

async function prefetchChunks(
  env,
  startChunk,
  count,
  totalSize
) {
  const cache = caches.default;

  const endChunk = Math.min(
    startChunk + count,
    Math.ceil(totalSize / CHUNK_SIZE)
  );

  let loadedBytes = 0;
  let loadedChunks = 0;

  for (
    let offset = startChunk;
    offset < endChunk;
    offset += PREFETCH_CONCURRENCY
  ) {
    const batch = [];

    for (
      let i = offset;
      i < endChunk &&
      i < offset + PREFETCH_CONCURRENCY;
      i += 1
    ) {
      batch.push(
        loadChunk(
          env,
          i,
          totalSize,
          cache
        )
      );
    }

    const results = await Promise.all(batch);

    for (const result of results) {
      loadedBytes += result.body.byteLength;
      loadedChunks += 1;
    }

    stats.prefetchRequests += batch.length;
    stats.prefetchBytes += results.reduce(
      (sum, result) =>
        sum + result.body.byteLength,
      0
    );
  }

  return {
    startChunk,
    endChunk,
    loadedChunks,
    loadedBytes,
  };
}

async function prefetch(
  env,
  request
) {
  const url = new URL(request.url);
  const metadata = await getSourceMetadata(env);

  const startByte = Math.max(
    0,
    Number(
      url.searchParams.get("start") || "0"
    )
  );

  const requestedBytes = Math.min(
    PREFETCH_TARGET,
    Math.max(
      PREFETCH_MIN,
      Number(
        url.searchParams.get("bytes") ||
          PREFETCH_TARGET
      )
    )
  );

  const startChunk = Math.floor(
    startByte / CHUNK_SIZE
  );

  const chunkCount = Math.ceil(
    requestedBytes / CHUNK_SIZE
  );

  const result = await prefetchChunks(
    env,
    startChunk,
    chunkCount,
    metadata.totalSize
  );

  return new Response(
    JSON.stringify({
      ok: true,
      totalSize: metadata.totalSize,
      requestedBytes,
      chunkSize: CHUNK_SIZE,
      ...result,
    }),
    {
      headers: corsHeaders({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      }),
    }
  );
}

function statsPage() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport"
 content="width=device-width,initial-scale=1">
<title>Player Stats</title>
<style>
body {
  margin: 0;
  padding: 16px;
  background: #111;
  color: #eee;
  font-family: system-ui, sans-serif;
}
pre {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
}
</style>
</head>
<body>
<h3>MKV Player Diagnostics</h3>
<pre id="stats">Loading…</pre>
<script>
async function update() {
  try {
    const response = await fetch(
      "/api/stats",
      { cache: "no-store" }
    );

    const data = await response.json();

    document.getElementById("stats").textContent =
      JSON.stringify(data, null, 2);
  } catch (error) {
    document.getElementById("stats").textContent =
      error.message;
  }
}

update();
setInterval(update, 2000);
</script>
</body>
</html>`;
}

function playerPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport"
 content="width=device-width,initial-scale=1,
 viewport-fit=cover">

<title>MKV Player</title>

<script type="module"
 src="https://cdn.jsdelivr.net/npm/
 movi-player@0.4.0/dist/element.js">
</script>

<style>
html,
body {
  margin: 0;
  width: 100%;
  height: 100%;
  background: #000;
}

body {
  overflow: hidden;
  font-family: system-ui, sans-serif;
}

movi-player {
  display: block;
  width: 100%;
  height: 100vh;
  background: #000;
}

#status {
  position: fixed;
  z-index: 9999;
  left: 10px;
  right: 10px;
  bottom: calc(
    10px + env(safe-area-inset-bottom)
  );
  padding: 9px 11px;
  border-radius: 8px;
  background: rgba(0, 0, 0, .78);
  color: #fff;
  font-size: 12px;
  pointer-events: none;
}
</style>
</head>

<body>

<movi-player
 id="player"
 src="/media"
 controls
 preload="auto"
 buffersize="512"
 probesize="2mb"
 probeduration="5000">
</movi-player>

<div id="status">
Preparing buffer…
</div>

<script>
const player =
  document.getElementById("player");

const status =
  document.getElementById("status");

let prefetchBusy = false;
let lastPrefetchStart = -1;

const CHUNK_SIZE =
  ${CHUNK_SIZE};

const MIN_AHEAD =
  ${PREFETCH_MIN};

const TARGET_AHEAD =
  ${PREFETCH_TARGET};

function getBufferedEnd() {
  if (!player.buffered ||
      player.buffered.length === 0) {
    return null;
  }

  const time = player.currentTime;

  for (
    let i = 0;
    i < player.buffered.length;
    i += 1
  ) {
    const start =
      player.buffered.start(i);

    const end =
      player.buffered.end(i);

    if (time >= start && time <= end) {
      return end;
    }
  }

  return player.buffered.end(
    player.buffered.length - 1
  );
}

function collectPlayerStats() {
  let dropped = null;

  try {
    if (
      typeof player.getVideoPlaybackQuality ===
      "function"
    ) {
      const quality =
        player.getVideoPlaybackQuality();

      dropped = quality.droppedVideoFrames;
    }
  } catch (_) {
  }

  return {
    currentTime:
      Number(player.currentTime || 0),

    duration:
      Number(player.duration || 0),

    bufferedEnd:
      getBufferedEnd(),

    readyState:
      player.readyState,

    networkState:
      player.networkState,

    paused:
      player.paused,

    videoWidth:
      player.videoWidth || 0,

    videoHeight:
      player.videoHeight || 0,

    droppedVideoFrames:
      dropped,

    timestamp:
      Date.now(),
  };
}

async function sendPlayerStats() {
  try {
    await fetch(
      "/api/player-stats",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(
          collectPlayerStats()
        ),
        keepalive: true,
      }
    );
  } catch (_) {
  }
}

async function prefetchAhead() {
  if (prefetchBusy) {
    return;
  }

  const bufferedEnd =
    getBufferedEnd();

  const currentTime =
    Number(player.currentTime || 0);

  if (
    bufferedEnd !== null &&
    bufferedEnd - currentTime > 60
  ) {
    return;
  }

  const mediaPosition =
    Number(
      player.dataset.bytePosition || 0
    );

  const start =
    Math.max(
      0,
      mediaPosition
    );

  if (
    lastPrefetchStart ===
    Math.floor(start / CHUNK_SIZE)
  ) {
    return;
  }

  prefetchBusy = true;

  lastPrefetchStart =
    Math.floor(start / CHUNK_SIZE);

  try {
    status.textContent =
      "Prefetching 128 MB…";

    const response =
      await fetch(
        "/prefetch?start=" +
        encodeURIComponent(start) +
        "&bytes=" +
        MIN_AHEAD,
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        "Prefetch HTTP " +
        response.status
      );
    }

    const result =
      await response.json();

    status.textContent =
      "Cache: " +
      Math.round(
        result.loadedBytes /
        1024 /
        1024
      ) +
      " MB";

    setTimeout(() => {
      status.remove();
    }, 2500);
  } catch (error) {
    console.error(error);

    status.textContent =
      "Prefetch: " +
      error.message;
  } finally {
    prefetchBusy = false;
  }
}

player.addEventListener(
  "timeupdate",
  () => {
    prefetchAhead();
    sendPlayerStats();
  }
);

player.addEventListener(
  "playing",
  () => {
    prefetchAhead();
    sendPlayerStats();
  }
);

player.addEventListener(
  "waiting",
  () => {
    prefetchAhead();
    sendPlayerStats();
  }
);

player.addEventListener(
  "progress",
  () => {
    prefetchAhead();
  }
);

player.addEventListener(
  "error",
  () => {
    sendPlayerStats();
  }
);

setInterval(
  sendPlayerStats,
  3000
);

setTimeout(
  prefetchAhead,
  300
);
</script>

</body>
</html>`;
}

const playerStats = {
  currentTime: 0,
  duration: 0,
  bufferedEnd: null,
  readyState: 0,
  networkState: 0,
  paused: true,
  videoWidth: 0,
  videoHeight: 0,
  droppedVideoFrames: null,
  timestamp: 0,
  updatedAt: 0,
};

function handlePlayerStats(request) {
  return request
    .json()
    .then((data) => {
      Object.assign(
        playerStats,
        data,
        {
          updatedAt: Date.now(),
        }
      );

      return new Response(
        JSON.stringify({
          ok: true,
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
    })
    .catch((error) => {
      return new Response(
        JSON.stringify({
          ok: false,
          error: error.message,
        }),
        {
          status: 400,
          headers: corsHeaders({
            "Content-Type":
              "application/json",
          }),
        }
      );
    });
}

function getStats() {
  const elapsed =
    Math.max(
      1,
      Date.now() - stats.startedAt
    ) / 1000;

  const bytesDownloaded =
    stats.bytesFromLoli +
    stats.bytesFromCache;

  const averageDownloadMbps =
    (
      bytesDownloaded * 8 / 1000000
    ) / elapsed;

  const cacheHitRatio =
    stats.cacheHits +
    stats.cacheMisses === 0
      ? 0
      : stats.cacheHits /
        (
          stats.cacheHits +
          stats.cacheMisses
        );

  return {
    server: {
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
      cacheHitRatio,
      bytesFromCache:
        stats.bytesFromCache,
      bytesFromLoli:
        stats.bytesFromLoli,
      chunksLoaded:
        stats.chunksLoaded,
      chunksFailed:
        stats.chunksFailed,
      prefetchRequests:
        stats.prefetchRequests,
      prefetchBytes:
        stats.prefetchBytes,
      averageDownloadMbps,
      averageCacheLatencyMs:
        stats.cacheHits === 0
          ? 0
          : stats.cacheLatencyMs /
            stats.cacheHits,
      averageLoliLatencyMs:
        stats.chunksLoaded === 0
          ? 0
          : stats.loliLatencyMs /
            stats.chunksLoaded,
      lastError:
        stats.lastError,
      uptimeSeconds:
        elapsed,
    },

    player: {
      ...playerStats,
      bufferAheadSeconds:
        playerStats.bufferedEnd === null
          ? null
          : Math.max(
              0,
              playerStats.bufferedEnd -
              playerStats.currentTime
            ),
    },

    configuration: {
      chunkSize: CHUNK_SIZE,
      minimumPrefetchBytes:
        PREFETCH_MIN,
      targetCacheBytes:
        PREFETCH_TARGET,
      prefetchConcurrency:
        PREFETCH_CONCURRENCY,
    },
  };
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
      return new Response(
        playerPage(),
        {
          headers: htmlHeaders(),
        }
      );
    }

    if (url.pathname === "/stats") {
      return new Response(
        statsPage(),
        {
          headers: htmlHeaders(),
        }
      );
    }

    if (url.pathname === "/media") {
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
        if (request.method === "HEAD") {
          const metadata =
            await getSourceMetadata(env);

          return new Response(null, {
            status: 200,
            headers: corsHeaders({
              "Content-Type":
                metadata.contentType,
              "Content-Length":
                String(
                  metadata.totalSize
                ),
              "Accept-Ranges":
                "bytes",
            }),
          });
        }

        return await serveRange(
          env,
          request
        );
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
              "Content-Type":
                "application/json",
            }),
          }
        );
      }
    }

    if (url.pathname === "/prefetch") {
      if (request.method !== "GET") {
        return new Response(
          "Method Not Allowed",
          {
            status: 405,
          }
        );
      }

      try {
        return await prefetch(
          env,
          request
        );
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
              "Content-Type":
                "application/json",
            }),
          }
        );
      }
    }

    if (url.pathname === "/api/stats") {
      return new Response(
        JSON.stringify(
          getStats()
        ),
        {
          headers: corsHeaders({
            "Content-Type":
              "application/json",
            "Cache-Control":
              "no-store",
          }),
        }
      );
    }

    if (url.pathname === "/api/player-stats") {
      if (request.method !== "POST") {
        return new Response(
          "Method Not Allowed",
          {
            status: 405,
          }
        );
      }

      return handlePlayerStats(
        request
      );
    }

    if (url.pathname === "/api/check") {
      try {
        const response =
          await env.LOLI.fetch(
            new Request(
              SOURCE_URL,
              {
                method: "GET",
                headers: sourceHeaders(
                  "bytes=0-1023"
                ),
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
            error: error.message,
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
