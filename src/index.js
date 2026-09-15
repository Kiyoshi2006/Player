const TEST_VIDEO =
  "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/v10/main.mp4";

function page() {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1,viewport-fit=cover"
  >
  <title>Native HEVC Test</title>

  <style>
    html,
    body {
      margin: 0;
      padding: 0;
      background: #000;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }

    body {
      padding: 16px;
      box-sizing: border-box;
    }

    video {
      display: block;
      width: 100%;
      max-height: 60vh;
      background: #000;
    }

    pre {
      margin-top: 16px;
      padding: 14px;
      border-radius: 12px;
      background: #181818;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
      font-size: 14px;
    }
  </style>
</head>

<body>
  <video
    id="video"
    controls
    playsinline
    preload="auto"
  ></video>

  <pre id="info">Đang kiểm tra...</pre>

  <script>
    const video = document.getElementById("video");
    const info = document.getElementById("info");

    const codec = 'video/mp4; codecs="hvc1"';

    const canPlay = video.canPlayType(codec);

    let capability = null;

    async function checkCapability() {
      if (!navigator.mediaCapabilities) {
        return null;
      }

      try {
        return await navigator.mediaCapabilities.decodingInfo({
          type: "file",
          video: {
            contentType: codec,
            width: 1920,
            height: 1080,
            bitrate: 12000000,
            framerate: 30
          }
        });
      } catch (error) {
        return {
          error: error instanceof Error
            ? error.message
            : String(error)
        };
      }
    }

    function updateInfo() {
      const lines = [
        "Native Safari HEVC",
        "====================",
        "",
        "canPlayType: " + (canPlay || "NO"),
        "readyState: " + video.readyState,
        "networkState: " + video.networkState,
        "paused: " + video.paused,
        "currentTime: " + video.currentTime.toFixed(2),
        "videoWidth: " + video.videoWidth,
        "videoHeight: " + video.videoHeight
      ];

      if (capability) {
        lines.push("");
        lines.push("MediaCapabilities:");
        lines.push(
          "supported: " +
          (capability.supported ?? "unknown")
        );
        lines.push(
          "smooth: " +
          (capability.smooth ?? "unknown")
        );
        lines.push(
          "powerEfficient: " +
          (capability.powerEfficient ?? "unknown")
        );

        if (capability.error) {
          lines.push("error: " + capability.error);
        }
      }

      if (video.getVideoPlaybackQuality) {
        const quality = video.getVideoPlaybackQuality();

        lines.push("");
        lines.push("Playback:");
        lines.push(
          "totalFrames: " +
          quality.totalVideoFrames
        );
        lines.push(
          "droppedFrames: " +
          quality.droppedVideoFrames
        );
      }

      info.textContent = lines.join("\\n");
    }

    async function start() {
      capability = await checkCapability();

      video.src = "${TEST_VIDEO}";
      video.load();

      updateInfo();

      setInterval(updateInfo, 1000);
    }

    [
      "loadedmetadata",
      "canplay",
      "playing",
      "pause",
      "waiting",
      "stalled",
      "error"
    ].forEach(eventName => {
      video.addEventListener(eventName, updateInfo);
    });

    start();
  </script>
</body>
</html>`;
}

export default {
  async fetch() {
    return new Response(page(), {
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store"
      }
    });
  }
};
