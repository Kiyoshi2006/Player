// src/index.js

const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const MOVI_VERSION = "0.4.0";

function playerPage() {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,
           initial-scale=1,
           maximum-scale=1,
           viewport-fit=cover"
>

<meta name="apple-mobile-web-app-capable" content="yes">

<title>MKV Hardware Player</title>

<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/movi-player@${MOVI_VERSION}/dist/element.js"
></script>

<style>
html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  min-height: 100%;
  background: #000;
  color: #fff;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

body {
  overflow-x: hidden;
}

main {
  width: 100%;
  min-height: 100vh;
  background: #000;
}

header {
  box-sizing: border-box;
  padding:
    max(12px, env(safe-area-inset-top))
    14px
    10px;
  background: #111;
}

h1 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.status {
  margin-top: 5px;
  color: #aaa;
  font-size: 12px;
}

.player {
  width: 100%;
  background: #000;
}

movi-player {
  display: block;
  width: 100%;
  height: auto;
  min-height: 220px;
  background: #000;
}

.info {
  box-sizing: border-box;
  padding: 12px 14px;
  background: #111;
  color: #aaa;
  font-size: 12px;
  line-height: 1.5;
}

.info strong {
  color: #fff;
}

.error {
  color: #ff6b6b;
}
</style>
</head>

<body>

<main>

<header>
  <h1>MKV Hardware Player</h1>
  <div id="status" class="status">
    Đang khởi tạo hardware decoder...
  </div>
</header>

<section class="player">
  <movi-player
    id="player"
    controls
    src="/media"
  ></movi-player>
</section>

<div class="info">
  <div>
    <strong>Decoder:</strong>
    WebCodecs hardware-first
  </div>

  <div>
    <strong>Container:</strong>
    Matroska / MKV
  </div>

  <div>
    <strong>Video:</strong>
    HEVC 3840×2160
  </div>

  <div>
    <strong>Audio:</strong>
    Opus 48 kHz / 2ch
  </div>

  <div id="result"></div>
</div>

</main>

<script>
const player = document.getElementById("player");
const status = document.getElementById("status");
const result = document.getElementById("result");

function setStatus(text, error = false) {
  status.textContent = text;
  status.className = error
    ? "status error"
    : "status";
}

player.addEventListener("loadstart", () => {
  setStatus("Đang đọc MKV...");
});

player.addEventListener("loadedmetadata", () => {
  setStatus("Đã đọc metadata. Đang khởi động decoder...");
});

player.addEventListener("canplay", () => {
  setStatus(
    "Hardware decoder đã bắt đầu phát."
  );
});

player.addEventListener("playing", () => {
  setStatus(
    "Đang phát bằng hardware-first path."
  );
});

player.addEventListener("waiting", () => {
  setStatus(
    "Hardware decoder đang chờ dữ liệu..."
  );
});

player.addEventListener("error", (event) => {
  console.error(event);

  setStatus(
    "Hardware decoder không phát được MKV.",
    true
  );

  result.innerHTML =
    "<strong>Hardware test: FAILED</strong>";
});

player.addEventListener("ended", () => {
  setStatus("Phát xong.");
});

window.addEventListener("error", (event) => {
  console.error(event);

  setStatus(
    "JavaScript/WebCodecs error.",
    true
  );
});
</script>

</body>
</html>`;
}

async function proxyMedia(request, env) {
  const requestHeaders = new Headers();

  const range = request.headers.get("Range");

  if (range) {
    requestHeaders.set("Range", range);
  }

  requestHeaders.set(
    "Accept",
    "video/x-matroska,video/*,*/*"
  );

  const response = await env.LOLI.fetch(
    new Request(SOURCE_URL, {
      method: "GET",
      headers: requestHeaders,
    })
  );

  const headers = new Headers(response.headers);

  headers.set(
    "Content-Type",
    "video/x-matroska"
  );

  headers.set(
    "Accept-Ranges",
    "bytes"
  );

  headers.set(
    "Access-Control-Allow-Origin",
    "*"
  );

  headers.set(
    "Access-Control-Allow-Headers",
    "Range, Content-Type"
  );

  headers.set(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges"
  );

  headers.set(
    "Cache-Control",
    "no-store"
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods":
            "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers":
            "Range, Content-Type",
          "Access-Control-Expose-Headers":
            "Content-Length, Content-Range, Accept-Ranges",
        },
      });
    }

    if (url.pathname === "/media") {
      return proxyMedia(request, env);
    }

    return new Response(playerPage(), {
      headers: {
        "Content-Type":
          "text/html; charset=UTF-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
