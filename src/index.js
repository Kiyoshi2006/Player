const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const TRACKS_OFFSET = 4388;
const TRACKS_END = 21859;

const IDS = {
  TRACK_ENTRY: 0xae,
  TRACK_NUMBER: 0xd7,
  TRACK_TYPE: 0x83,
  CODEC_ID: 0x86,
  CODEC_PRIVATE: 0x63a2,
  VIDEO: 0xe0,
  PIXEL_WIDTH: 0xb0,
  PIXEL_HEIGHT: 0xba,
};

function readVint(bytes, offset) {
  const first = bytes[offset];

  if (first === undefined) {
    return null;
  }

  let mask = 0x80;
  let length = 1;

  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length++;
  }

  if (length > 8 || offset + length > bytes.length) {
    return null;
  }

  let value = first & (mask - 1);

  for (let i = 1; i < length; i++) {
    value = value * 256 + bytes[offset + i];
  }

  return {
    length,
    value,
    unknown: value === Math.pow(2, 7 * length) - 1,
  };
}

function readElement(bytes, offset, limit) {
  if (offset >= limit) {
    return null;
  }

  const first = bytes[offset];

  let mask = 0x80;
  let idLength = 1;

  while (idLength <= 4 && (first & mask) === 0) {
    mask >>= 1;
    idLength++;
  }

  if (
    idLength > 4 ||
    offset + idLength > limit
  ) {
    return null;
  }

  let id = 0;

  for (let i = 0; i < idLength; i++) {
    id = id * 256 + bytes[offset + i];
  }

  const size = readVint(
    bytes,
    offset + idLength
  );

  if (!size) {
    return null;
  }

  const dataStart =
    offset + idLength + size.length;

  const dataEnd = size.unknown
    ? limit
    : Math.min(
        dataStart + size.value,
        limit
      );

  if (dataStart > limit) {
    return null;
  }

  return {
    id,
    dataStart,
    dataEnd,
    size: size.value,
  };
}

function readUInt(bytes, start, end) {
  let value = 0;

  for (let i = start; i < end; i++) {
    value = value * 256 + bytes[i];
  }

  return value;
}

function readText(bytes, start, end) {
  return new TextDecoder().decode(
    bytes.subarray(start, end)
  );
}

function toHex(bytes) {
  return Array.from(bytes)
    .map((byte) =>
      byte.toString(16).padStart(2, "0")
    )
    .join(" ");
}

function parseVideo(bytes, start, end) {
  const video = {};

  let offset = start;

  while (offset < end) {
    const element = readElement(
      bytes,
      offset,
      end
    );

    if (!element) {
      break;
    }

    if (element.id === IDS.PIXEL_WIDTH) {
      video.width = readUInt(
        bytes,
        element.dataStart,
        element.dataEnd
      );
    }

    if (element.id === IDS.PIXEL_HEIGHT) {
      video.height = readUInt(
        bytes,
        element.dataStart,
        element.dataEnd
      );
    }

    offset = element.dataEnd;
  }

  return video;
}

function parseTrack(bytes, start, end) {
  const track = {};

  let offset = start;

  while (offset < end) {
    const element = readElement(
      bytes,
      offset,
      end
    );

    if (!element) {
      break;
    }

    if (element.id === IDS.TRACK_NUMBER) {
      track.number = readUInt(
        bytes,
        element.dataStart,
        element.dataEnd
      );
    }

    if (element.id === IDS.TRACK_TYPE) {
      track.type = readUInt(
        bytes,
        element.dataStart,
        element.dataEnd
      );
    }

    if (element.id === IDS.CODEC_ID) {
      track.codecId = readText(
        bytes,
        element.dataStart,
        element.dataEnd
      );
    }

    if (element.id === IDS.CODEC_PRIVATE) {
      track.codecPrivate =
        bytes.slice(
          element.dataStart,
          element.dataEnd
        );
    }

    if (element.id === IDS.VIDEO) {
      track.video = parseVideo(
        bytes,
        element.dataStart,
        element.dataEnd
      );
    }

    offset = element.dataEnd;
  }

  return track;
}

function parseTracks(bytes) {
  const tracksElement = readElement(
    bytes,
    0,
    bytes.length
  );

  if (
    !tracksElement ||
    tracksElement.id !== 0x1654ae6b
  ) {
    throw new Error(
      "Không đọc được Tracks"
    );
  }

  const tracks = [];

  let offset = tracksElement.dataStart;

  while (
    offset < tracksElement.dataEnd
  ) {
    const element = readElement(
      bytes,
      offset,
      tracksElement.dataEnd
    );

    if (!element) {
      break;
    }

    if (element.id === IDS.TRACK_ENTRY) {
      tracks.push(
        parseTrack(
          bytes,
          element.dataStart,
          element.dataEnd
        )
      );
    }

    offset = element.dataEnd;
  }

  return tracks;
}

function parseHvcC(bytes) {
  if (bytes.length < 23) {
    throw new Error(
      `hvcC quá ngắn: ${bytes.length} bytes`
    );
  }

  const profileByte = bytes[1];

  const profileSpace =
    (profileByte >> 6) & 0x03;

  const tierFlag =
    (profileByte >> 5) & 0x01;

  const profileIdc =
    profileByte & 0x1f;

  const compatibilityFlags =
    (
      bytes[2] * 0x1000000 +
      bytes[3] * 0x10000 +
      bytes[4] * 0x100 +
      bytes[5]
    ) >>> 0;

  const levelIdc = bytes[12];

  const constraintBytes =
    bytes.slice(6, 12);

  const chromaFormat =
    bytes[16] & 0x03;

  const bitDepthLuma =
    (bytes[17] & 0x07) + 8;

  const bitDepthChroma =
    (bytes[18] & 0x07) + 8;

  const profileSpaceString =
    ["", "A", "B", "C"][profileSpace];

  const tier =
    tierFlag ? "H" : "L";

  const constraintHex =
    Array.from(constraintBytes)
      .map((byte) =>
        byte.toString(16).padStart(2, "0")
      )
      .join("")
      .replace(/0+$/, "")
      .toUpperCase();

  const codec =
    `hvc1.${profileSpaceString}${profileIdc}` +
    `.${compatibilityFlags}` +
    `.${tier}${levelIdc}` +
    (constraintHex
      ? `.${constraintHex}`
      : "");

  return {
    codec,
    profileSpace,
    profileIdc,
    tierFlag,
    levelIdc,
    compatibilityFlags,
    constraintHex,
    chromaFormat,
    bitDepthLuma,
    bitDepthChroma,
  };
}

async function inspect(env) {
  const response =
    await env.LOLI.fetch(
      new Request(SOURCE_URL, {
        headers: {
          Range:
            `bytes=${TRACKS_OFFSET}-${TRACKS_END}`,
        },
      })
    );

  if (response.status !== 206) {
    throw new Error(
      `Loli HTTP ${response.status}`
    );
  }

  const buffer =
    await response.arrayBuffer();

  const bytes =
    new Uint8Array(buffer);

  const tracks =
    parseTracks(bytes);

  const videoTrack =
    tracks.find(
      (track) =>
        track.type === 1 &&
        track.codecId ===
          "V_MPEGH/ISO/HEVC"
    );

  if (!videoTrack) {
    throw new Error(
      "Không tìm thấy video HEVC"
    );
  }

  if (!videoTrack.codecPrivate) {
    throw new Error(
      "Không có CodecPrivate"
    );
  }

  const hvcC =
    parseHvcC(
      videoTrack.codecPrivate
    );

  return {
    ok: true,
    tracksFound: tracks.length,
    video: {
      number: videoTrack.number,
      codecId: videoTrack.codecId,
      width: videoTrack.video?.width,
      height: videoTrack.video?.height,
      codecPrivateSize:
        videoTrack.codecPrivate.length,
      codecPrivate:
        Array.from(
          videoTrack.codecPrivate
        ),
    },
    hvcC,
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
<title>HEVC Hardware Test</title>
<style>
body {
  margin: 0;
  padding: 24px;
  background: #111;
  color: #fff;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
}

#status {
  padding: 18px;
  border-radius: 14px;
  background: #222;
  font-size: 20px;
  font-weight: 700;
}

pre {
  margin-top: 18px;
  padding: 16px;
  border-radius: 14px;
  background: #1c1c1c;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.5;
}
</style>
</head>

<body>

<div id="status">
Đang kiểm tra...
</div>

<pre id="output"></pre>

<script>
async function run() {
  const status =
    document.getElementById("status");

  const output =
    document.getElementById("output");

  try {
    if (!window.VideoDecoder) {
      throw new Error(
        "Safari không có VideoDecoder"
      );
    }

    const response =
      await fetch("/api/hevc");

    const data =
      await response.json();

    if (!data.ok) {
      throw new Error(
        data.error || "Worker error"
      );
    }

    const codec =
      data.hvcC.codec;

    const config = {
      codec,
      codedWidth:
        data.video.width,
      codedHeight:
        data.video.height,
      description:
        new Uint8Array(
          data.video.codecPrivate
        ).buffer,
      hardwareAcceleration:
        "prefer-hardware"
    };

    let supported;

    try {
      const result =
        await VideoDecoder
          .isConfigSupported(config);

      supported = result.supported;

      output.textContent =
        JSON.stringify(
          {
            result:
              supported
                ? "SUPPORTED"
                : "NOT_SUPPORTED",
            config: {
              codec,
              codedWidth:
                config.codedWidth,
              codedHeight:
                config.codedHeight,
              hardwareAcceleration:
                config.hardwareAcceleration
            },
            hvcC:
              data.hvcC
          },
          null,
          2
        );
    } catch (error) {
      output.textContent =
        JSON.stringify(
          {
            result:
              "EXCEPTION",
            error:
              error.message,
            codec,
            hvcC:
              data.hvcC
          },
          null,
          2
        );

      throw error;
    }

    status.textContent =
      supported
        ? "✅ HARDWARE CONFIG SUPPORTED"
        : "❌ HARDWARE CONFIG NOT SUPPORTED";

    status.style.color =
      supported
        ? "#5cff8d"
        : "#ff6b6b";

  } catch (error) {
    status.textContent =
      "❌ TEST ERROR";

    status.style.color =
      "#ff6b6b";

    if (
      !output.textContent
    ) {
      output.textContent =
        error.stack ||
        error.message;
    }
  }
}

run();
</script>

</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);

    if (
      url.pathname === "/api/hevc"
    ) {
      try {
        return Response.json(
          await inspect(env),
          {
            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : String(error)
          },
          {
            status: 500
          }
        );
      }
    }

    return new Response(
      page(),
      {
        headers: {
          "Content-Type":
            "text/html; charset=UTF-8",
          "Cache-Control":
            "no-store"
        }
      }
    );
  }
};
