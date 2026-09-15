export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/check") {
      const sourceUrl =
        "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

      const headers = new Headers();
      headers.set("Range", "bytes=0-1023");

      let response;

      try {
        response = await env.LOLI.fetch(
          new Request(sourceUrl, {
            method: "GET",
            headers,
          })
        );
      } catch (error) {
        return Response.json({
          ok: false,
          stage: "service-binding-fetch",
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return Response.json({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
        contentRange: response.headers.get("content-range"),
        acceptRanges: response.headers.get("accept-ranges"),
      });
    }

    return new Response("OK");
  },
};
