# MKV Cloudflare Player v2

Cloudflare Worker + Movi Player for direct MKV playback in the browser.

## What this version fixes

- No hard-coded subtitle languages.
- No hard-coded audio languages.
- The player reads all embedded MKV tracks.
- Uses the same-origin `/proxy` endpoint so browser CORS does not block the source.
- Preserves HTTP Range requests.
- Does not download the whole MKV into Worker memory.
- Supports sources that do not implement Range through Movi's linear mode.
- Uses a base64url source token internally, avoiding nested-URL encoding problems.
- Includes `/api/check` diagnostics.
- Defaults to the user's supplied MKV source.
- Designed for iPhone Safari.

Movi Player 0.4.0 is loaded from jsDelivr at runtime. It performs MKV demuxing and playback in the browser instead of transcoding the video on Cloudflare.

## Deploy from the Cloudflare dashboard on iPhone

The easiest route is to create a Worker and paste the contents of `src/index.js` into **Edit code**, then **Deploy**.

No build step is required.

## Deploy with GitHub

1. Create a GitHub repository.
2. Upload this project.
3. In Cloudflare Workers & Pages, import the repository.
4. Build command: leave empty.
5. Deploy command: `npx wrangler deploy`.
6. The project uses `wrangler.jsonc`.

## Allowed hosts

The default source host is:

`loli.nvnyep.workers.dev`

To use another source host, change the `ALLOWED_HOSTS` Worker variable to a comma-separated list:

`example.com,cdn.example.com`

Do not expose an unrestricted public proxy unless you understand the abuse risk.

## Endpoints

- `/` player UI
- `/proxy?src=<base64url>` streaming proxy
- `/api/check?src=<base64url>` source diagnostics
- `/api/health` health check

## Important iPhone note

MKV/HEVC playback is not native HTML5 Safari playback. Movi Player uses WebCodecs and FFmpeg-WASM in the browser and provides MKV, HEVC, multi-audio and subtitle support.

A 2160p HEVC file can be demanding on older iPhones. This project does not transcode the 4K video on Cloudflare.
