const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":
      "Range, Content-Type, Accept, Origin, User-Agent",
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Length, Content-Range, Content-Type",
  };
}

async function proxyMedia(request, env) {
  const headers = new Headers();

  for (const name of ["Range", "Accept"]) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  const upstream = new Request(SOURCE_URL, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
  });

  const response = await env.LOLI.fetch(upstream);

  const responseHeaders = new Headers(corsHeaders());

  for (const name of [
    "Content-Type",
    "Content-Length",
    "Content-Range",
    "Accept-Ranges",
    "ETag",
    "Last-Modified",
  ]) {
    const value = response.headers.get(name);
    if (value !== null) {
      responseHeaders.set(name, value);
    }
  }

  return new Response(
    request.method === "HEAD" ? null : response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    }
  );
}

function playerHtml(request) {
  const playerUrl = new URL("/media", request.url).href;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1,viewport-fit=cover"
  >
  <title>MKV Test Player</title>

  <script type="module"
    src="https://cdn.jsdelivr.net/npm/movi-player@0.4.0/dist/element.js">
  </script>

  <style>
    html,
    body {
      margin: 0;
      padding: 0;
      background: #000;
      min-height: 100%;
    }

    body {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    movi-player {
      display: block;
      width: 100vw;
      height: 100vh;
    }
  </style>
</head>
<body>
  <movi-player
    src="${playerUrl}"
    controls
    autoplay="false">
  </movi-player>
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

    if (url.pathname === "/media") {
      try {
        return await proxyMedia(request, env);
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: error instanceof Error
              ? error.message
              : String(error),
          },
          {
            status: 502,
            headers: corsHeaders(),
          }
        );
      }
    }

    return new Response(playerHtml(request), {
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
