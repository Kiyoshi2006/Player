const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":
      "Range, Content-Type, Accept, Origin, User-Agent",
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified",
  };
}

async function proxyMedia(request, env) {
  const headers = new Headers();

  const range = request.headers.get("Range");
  if (range) {
    headers.set("Range", range);
  }

  const accept = request.headers.get("Accept");
  if (accept) {
    headers.set("Accept", accept);
  }

  const upstreamRequest = new Request(SOURCE_URL, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
  });

  const response = await env.LOLI.fetch(upstreamRequest);

  const responseHeaders = new Headers(corsHeaders());

  const headersToCopy = [
    "Content-Type",
    "Content-Length",
    "Content-Range",
    "Accept-Ranges",
    "ETag",
    "Last-Modified",
  ];

  for (const name of headersToCopy) {
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
            error: error instanceof Error ? error.message : String(error),
          },
          {
            status: 502,
            headers: corsHeaders(),
          }
        );
      }
    }

    return new Response(
      "Player Worker OK\n\nOpen /media to test MKV streaming.",
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      }
    );
  },
};
