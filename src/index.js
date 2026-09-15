function playerHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  >
  <title>libmedia MKV Debug Player</title>
  <style>
    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #000;
      color: #fff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }

    body {
      overflow: hidden;
    }

    #player {
      width: 100%;
      height: 100%;
      min-height: 240px;
      background: #000;
    }

    #status {
      position: fixed;
      z-index: 1000;
      left: 8px;
      right: 8px;
      bottom: 8px;
      max-height: 70vh;
      overflow: auto;
      box-sizing: border-box;
      padding: 12px;
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.94);
      color: #fff;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
  </style>
</head>

<body>
  <div id="player"></div>
  <div id="status">Starting...</div>

  <script>
    const statusElement = document.getElementById("status");
    const container = document.getElementById("player");
    const debugLines = [];

    function log(message) {
      const line =
        "[" +
        new Date().toISOString().slice(11, 23) +
        "] " +
        message;

      debugLines.push(line);

      if (debugLines.length > 150) {
        debugLines.shift();
      }

      statusElement.textContent = debugLines.join("\\n");
      console.log(line);
    }

    function stringify(value) {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }

    function formatError(error) {
      if (!error) {
        return "Unknown error";
      }

      if (error instanceof Error) {
        return [
          "name: " + (error.name || "Error"),
          "message: " + (error.message || ""),
          error.stack ? "\\nstack:\\n" + error.stack : ""
        ].join("\\n");
      }

      return String(error);
    }

    window.addEventListener("error", function(event) {
      if (event.error) {
        log(
          "WINDOW ERROR\\n" +
          formatError(event.error)
        );
        return;
      }

      log(
        "BROWSER ERROR\\n" +
        "message: " + event.message +
        "\\nfile: " + event.filename +
        "\\nline: " + event.lineno +
        "\\ncolumn: " + event.colno
      );
    }, true);

    window.addEventListener("unhandledrejection", function(event) {
      log(
        "UNHANDLED REJECTION\\n" +
        formatError(event.reason)
      );
    });

    async function probeMedia() {
      const mediaUrl =
        new URL("/media", window.location.href).href;

      log("PROBE URL:");
      log(mediaUrl);

      const response = await fetch(mediaUrl, {
        method: "GET",
        headers: {
          Range: "bytes=0-1023"
        },
        cache: "no-store"
      });

      log(
        "BROWSER FETCH STATUS: " +
        response.status +
        " " +
        response.statusText
      );

      log(
        "BROWSER FETCH CONTENT-TYPE: " +
        (response.headers.get("content-type") || "null")
      );

      log(
        "BROWSER FETCH CONTENT-RANGE: " +
        (response.headers.get("content-range") || "null")
      );

      log(
        "BROWSER FETCH CONTENT-LENGTH: " +
        (response.headers.get("content-length") || "null")
      );

      log(
        "BROWSER FETCH ACCEPT-RANGES: " +
        (response.headers.get("accept-ranges") || "null")
      );

      if (response.body) {
        await response.body.cancel();
      }

      if (response.status !== 206) {
        throw new Error(
          "Browser /media probe did not return HTTP 206."
        );
      }

      log("BROWSER /media PROBE OK");
    }

    async function loadLibmedia() {
      log(
        "Loading libmedia UMD ${LIBMEDIA_VERSION}..."
      );

      await new Promise(function(resolve, reject) {
        const script = document.createElement("script");

        script.src =
          "/libmedia/avplayer.js?v=${Date.now()}";

        script.async = false;

        script.onload = function() {
          log("avplayer.js onload");
          log(
            "typeof window.AVPlayer = " +
            typeof window.AVPlayer
          );
          resolve();
        };

        script.onerror = function() {
          reject(
            new Error(
              "Failed to load " + script.src
            )
          );
        };

        document.head.appendChild(script);
      });
    }

    function dumpPlayerEvents(player) {
      const eventNames = [
        "loadstart",
        "loadedmetadata",
        "durationchange",
        "progress",
        "canplay",
        "canplaythrough",
        "play",
        "playing",
        "pause",
        "waiting",
        "stalled",
        "seeking",
        "seeked",
        "ended",
        "error",
        "abort"
      ];

      for (const eventName of eventNames) {
        try {
          player.on?.(eventName, function(event) {
            log(
              "PLAYER EVENT: " +
              eventName +
              (event ? " " + stringify(event) : "")
            );
          });
        } catch (error) {
          log(
            "Could not register event " +
            eventName +
            ": " +
            formatError(error)
          );
        }
      }
    }

    async function createPlayer() {
      log(
        "crossOriginIsolated = " +
        window.crossOriginIsolated
      );

      log(
        "SharedArrayBuffer = " +
        ("SharedArrayBuffer" in window)
      );

      log(
        "VideoDecoder = " +
        ("VideoDecoder" in window)
      );

      log(
        "AVPlayer = " +
        typeof window.AVPlayer
      );

      if (typeof window.AVPlayer !== "function") {
        throw new Error(
          "window.AVPlayer was not exported by UMD."
        );
      }

      log("Creating AVPlayer...");

      const player = new window.AVPlayer({
        container,

        getWasm(type, codecId, mediaType) {
          log(
            "getWasm: type=" +
            type +
            " codecId=" +
            codecId +
            " mediaType=" +
            mediaType
          );

          if (type === "decoder") {
            if (codecId === 173) {
              log("HEVC WASM requested");
              return "/libmedia-wasm/decode/hevc-simd.wasm";
            }

            if (codecId === 86076) {
              log("Opus WASM requested");
              return "/libmedia-wasm/decode/opus-simd.wasm";
            }

            if (codecId === 86018) {
              return "/libmedia-wasm/decode/aac-simd.wasm";
            }

            if (codecId === 86017) {
              return "/libmedia-wasm/decode/mp3-simd.wasm";
            }

            if (codecId === 86028) {
              return "/libmedia-wasm/decode/flac-simd.wasm";
            }

            if (codecId === 27) {
              return "/libmedia-wasm/decode/h264-simd.wasm";
            }

            log(
              "No WASM mapping for codecId=" +
              codecId
            );

            return undefined;
          }

          if (type === "resampler") {
            log("Resampler WASM requested");
            return "/libmedia-wasm/resample/resample-simd.wasm";
          }

          if (type === "stretchpitcher") {
            log("StretchPitch WASM requested");
            return "/libmedia-wasm/stretchpitch/stretchpitch-simd.wasm";
          }

          return undefined;
        }
      });

      log("AVPlayer constructor completed.");

      log(
        "Player object keys: " +
        Object.keys(player).join(", ")
      );

      dumpPlayerEvents(player);

      const mediaUrl =
        new URL("/media", window.location.href).href;

      log("Absolute media URL:");
      log(mediaUrl);

      log("Calling player.load(absolute URL)...");

      try {
        const result = await player.load(mediaUrl);

        log(
          "player.load() RESOLVED\\n" +
          stringify(result)
        );
      } catch (error) {
        log(
          "player.load() REJECTED\\n\\n" +
          formatError(error)
        );

        throw error;
      }

      log("Calling player.play()...");

      try {
        const result = await player.play();

        log(
          "player.play() RESOLVED\\n" +
          stringify(result)
        );
      } catch (error) {
        log(
          "player.play() REJECTED\\n\\n" +
          formatError(error)
        );

        throw error;
      }

      log("PLAYING");
    }

    async function boot() {
      try {
        await probeMedia();
        await loadLibmedia();
        log("libmedia script loaded.");
        await createPlayer();
      } catch (error) {
        log(
          "FATAL ERROR\\n\\n" +
          formatError(error)
        );
      }
    }

    boot();
  </script>
</body>
</html>`;
}
