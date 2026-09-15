function testPage() {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  >
  <title>HEVC Hardware Test</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: #111;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }

    h1 {
      font-size: 22px;
    }

    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #222;
      padding: 16px;
      border-radius: 12px;
      line-height: 1.6;
    }

    .ok {
      color: #4ade80;
    }

    .warn {
      color: #facc15;
    }

    .bad {
      color: #f87171;
    }
  </style>
</head>
<body>
  <h1>iPhone HEVC Hardware Decode Test</h1>
  <pre id="result">Đang kiểm tra...</pre>

  <script>
    async function runTest() {
      const result = document.getElementById("result");
      const lines = [];

      const hevcTypes = [
        "video/mp4; codecs=\\"hvc1.1.6.L123.B0\\"",
        "video/mp4; codecs=\\"hev1.1.6.L123.B0\\"",
        "video/mp4; codecs=\\"hvc1.2.4.L153.B0\\""
      ];

      lines.push(
        "Safari: " +
        (/Safari/i.test(navigator.userAgent) ? "YES" : "NO")
      );

      lines.push(
        "MediaCapabilities: " +
        (navigator.mediaCapabilities ? "YES" : "NO")
      );

      lines.push("");

      for (const type of hevcTypes) {
        const supported = document.createElement("video")
          .canPlayType(type);

        lines.push("canPlayType:");
        lines.push(type);
        lines.push("  → " + (supported || "NO"));
        lines.push("");
      }

      if (navigator.mediaCapabilities) {
        for (const type of hevcTypes) {
          try {
            const info = await navigator.mediaCapabilities.decodingInfo({
              type: "media-source",
              video: {
                contentType: type,
                width: 3840,
                height: 2160,
                bitrate: 20000000,
                framerate: 24
              }
            });

            lines.push("MediaCapabilities:");
            lines.push(type);
            lines.push("  supported: " + info.supported);
            lines.push("  smooth: " + info.smooth);
            lines.push("  powerEfficient: " + info.powerEfficient);
            lines.push("");
          } catch (error) {
            lines.push("MediaCapabilities ERROR:");
            lines.push("  " + error.message);
            lines.push("");
          }
        }
      }

      const hevcSupported =
        hevcTypes.some(type =>
          document.createElement("video").canPlayType(type)
        );

      lines.push("================================");
      lines.push(
        hevcSupported
          ? "HEVC: BROWSER HỖ TRỢ"
          : "HEVC: BROWSER KHÔNG HỖ TRỢ"
      );

      result.textContent = lines.join("\\n");
    }

    runTest();
  </script>
</body>
</html>`;
}

export default {
  async fetch(request) {
    return new Response(testPage(), {
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store"
      }
    });
  }
};
