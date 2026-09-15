const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

function findPattern(bytes, pattern) {
  const positions = [];

  for (let i = 0; i <= bytes.length - pattern.length; i++) {
    let matched = true;

    for (let j = 0; j < pattern.length; j++) {
      if (bytes[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      positions.push(i);

      if (positions.length >= 20) {
        break;
      }
    }
  }

  return positions;
}

async function inspect(env) {
  const response = await env.LOLI.fetch(
    new Request(SOURCE_URL, {
      method: "GET",
      headers: {
        Range: "bytes=0-4194303",
      },
    })
  );

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const tracks = findPattern(
    bytes,
    [0x16, 0x54, 0xae, 0x6b]
  );

  const segment = findPattern(
    bytes,
    [0x18, 0x53, 0x80, 0x67]
  );

  const ebml = findPattern(
    bytes,
    [0x1a, 0x45, 0xdf, 0xa3]
  );

  return {
    ok: true,
    httpStatus: response.status,
    bytesRead: bytes.length,
    contentRange: response.headers.get("content-range"),
    ebmlPositions: ebml,
    segmentPositions: segment,
    tracksPositions: tracks,
  };
}

function page() {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <title>MKV Structure Test</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #111;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }

    pre {
      background: #1d1d1d;
      padding: 16px;
      border-radius: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <h2>MKV Structure Test</h2>
  <pre id="result">Đang kiểm tra...</pre>

  <script>
    fetch("/api/inspect")
      .then(async response => {
        const data = await response.json();
        document.getElementById("result").textContent =
          JSON.stringify(data, null, 2);
      })
      .catch(error => {
        document.getElementById("result").textContent =
          "ERROR\\n" + error.message;
      });
  </script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/inspect") {
      try {
        return Response.json(await inspect(env), {
          headers: {
            "Cache-Control": "no-store",
          },
        });
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: error instanceof Error
              ? error.message
              : String(error),
          },
          {
            status: 500,
          }
        );
      }
    }

    return new Response(page(), {
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
