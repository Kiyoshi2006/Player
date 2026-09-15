const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const TRACKS_OFFSET = 4388;
const TRACKS_SIZE = 17464;

const IDS = {
  TRACK_ENTRY: 0xae,
  TRACK_NUMBER: 0xd7,
  TRACK_TYPE: 0x83,
  CODEC_ID: 0x86,
  CODEC_PRIVATE: 0x63a2,
  NAME: 0x536e,
  VIDEO: 0xe0,
  PIXEL_WIDTH: 0xb0,
  PIXEL_HEIGHT: 0xba,
};

function readVint(bytes, offset) {
  if (offset >= bytes.length) {
    return null;
  }

  const first = bytes[offset];

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
    unknown:
      value === Math.pow(2, 7 * length) - 1,
  };
}

function readElement(bytes, offset, limit) {
  if (offset >= limit) {
    return null;
  }

  const first = bytes[offset];

  let mask = 0x80;
  let idLength = 1;

  while (
    idLength <= 4 &&
    (first & mask) === 0
  ) {
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

  if (dataStart > limit || dataEnd > limit) {
    return null;
  }

  return {
    id,
    offset,
    idLength,
    sizeLength: size.length,
    size: size.value,
    dataStart,
    dataEnd,
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

    if (element.dataEnd <= offset) {
      break;
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

    switch (element.id) {
      case IDS.TRACK_NUMBER:
        track.number = readUInt(
          bytes,
          element.dataStart,
          element.dataEnd
        );
        break;

      case IDS.TRACK_TYPE:
        track.type = readUInt(
          bytes,
          element.dataStart,
          element.dataEnd
        );
        break;

      case IDS.CODEC_ID:
        track.codecId = readText(
          bytes,
          element.dataStart,
          element.dataEnd
        );
        break;

      case IDS.CODEC_PRIVATE: {
        const privateBytes = bytes.slice(
          element.dataStart,
          element.dataEnd
        );

        track.codecPrivate = privateBytes;
        break;
      }

      case IDS.VIDEO:
        track.video = parseVideo(
          bytes,
          element.dataStart,
          element.dataEnd
        );
        break;
    }

    if (element.dataEnd <= offset) {
      break;
    }

    offset = element.dataEnd;
  }

  return track;
}

function parseTracks(bytes) {
  const tracks = [];

  const tracksElement = readElement(
    bytes,
    0,
    bytes.length
  );

  if (!tracksElement) {
    throw new Error(
      "Không đọc được Tracks element"
    );
  }

  if (tracksElement.id !== 0x1654ae6b) {
    throw new Error(
      `Sai Tracks ID: 0x${tracksElement.id.toString(16)}`
    );
  }

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

    if (element.dataEnd <= offset) {
      break;
    }

    offset = element.dataEnd;
  }

  return tracks;
}

function parseHvcC(codecPrivate) {
  if (!codecPrivate || codecPrivate.length < 23) {
    throw new Error(
      "CodecPrivate hvcC không hợp lệ"
    );
  }

  const configurationVersion =
    codecPrivate[0];

  const profileByte =
    codecPrivate[1];

  const profileSpace =
    (profileByte >> 6) & 0x03;

  const tierFlag =
    (profileByte >> 5) & 0x01;

  const profileIdc =
    profileByte & 0x1f;

  const compatibilityFlags =
    (
      codecPrivate[2] * 0x1000000 +
      codecPrivate[3] * 0x10000 +
      codecPrivate[4] * 0x100 +
      codecPrivate[5]
    ) >>> 0;

  const constraintBytes =
    codecPrivate.slice(6, 12);

  const levelIdc =
    codecPrivate[12];

  const chromaFormat =
    codecPrivate[16] & 0x03;

  const bitDepthLuma =
    (codecPrivate[17] & 0x07) + 8;

  const bitDepthChroma =
    (codecPrivate[18] & 0x07) + 8;

  const lengthSizeMinusOne =
    codecPrivate[21] & 0x03;

  const profilePrefix =
    ["", "A", "B", "C"][profileSpace];

  const tier =
    tierFlag ? "H" : "L";

  const constraintString =
    Array.from(constraintBytes)
      .map((byte) =>
        byte.toString(16).padStart(2, "0")
      )
      .join("")
      .replace(/0+$/, "")
      .toUpperCase();

  const codecString =
    `hvc1.${profilePrefix}${profileIdc}.${tier}${levelIdc}` +
    (constraintString
      ? `.${constraintString}`
      : "");

  return {
    configurationVersion,
    profileSpace,
    profileIdc,
    tierFlag,
    levelIdc,
    chromaFormat,
    bitDepthLuma,
    bitDepthChroma,
    lengthSizeMinusOne,
    compatibilityFlags,
    constraintBytes: toHex(
      constraintBytes
    ),
    codecString,
  };
}

async function inspect(env) {
  const end =
    TRACKS_OFFSET + TRACKS_SIZE - 1;

  const response =
    await env.LOLI.fetch(
      new Request(SOURCE_URL, {
        headers: {
          Range:
            `bytes=${TRACKS_OFFSET}-${end}`,
        },
      })
    );

  if (response.status !== 206) {
    throw new Error(
      `Loli trả HTTP ${response.status}`
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
      "Video HEVC không có CodecPrivate"
    );
  }

  const hvcC =
    parseHvcC(
      videoTrack.codecPrivate
    );

  return {
    ok: true,
    httpStatus: response.status,
    tracksFound: tracks.length,
    videoTrack: {
      number: videoTrack.number,
      type: videoTrack.type,
      codecId: videoTrack.codecId,
      video: videoTrack.video,
      codecPrivateSize:
        videoTrack.codecPrivate.length,
      codecPrivateHex:
        toHex(
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
  padding: 20px;
  background: #111;
  color: #fff;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
}

h1 {
  font-size: 21px;
}

#status {
  padding: 16px;
  border-radius: 12px;
  background: #222;
  font-size: 18px;
  font-weight: 600;
}

pre {
  margin-top: 16px;
  padding: 16px;
  border-radius: 12px;
  background: #1c1c1c;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.5;
}
</style>
</head>

<body>

<h1>HEVC WebCodecs Hardware Test</h1>

<div id="status">
Đang kiểm tra...
</div>

<pre id="output"></pre>

<script>
async function test() {
  const status =
    document.getElementById("status");

  const output =
    document.getElementById("output");

  try {
    if (!("VideoDecoder" in window)) {
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

    const config = {
      codec: data.hvcC.codecString,
      codedWidth:
        data.videoTrack.video.width,
      codedHeight:
        data.videoTrack.video.height,
      description:
        Uint8Array.from(
          data.videoTrack.codecPrivateBytes
        ).buffer,
      hardwareAcceleration:
        "prefer-hardware",
    };

    const result =
      await VideoDecoder.isConfigSupported(
        config
      );

    output.textContent =
      JSON.stringify(
        {
          browser: {
            userAgent:
              navigator.userAgent,
            webCodecs: true,
          },
          hevc: {
            codec:
              data.hvcC.codecString,
            width:
              data.videoTrack.video.width,
            height:
              data.videoTrack.video.height,
            profile:
              data.hvcC.profileIdc,
            level:
              data.hvcC.levelIdc,
            bitDepthLuma:
              data.hvcC.bitDepthLuma,
            bitDepthChroma:
              data.hvcC.bitDepthChroma,
          },
          webCodecs: {
            supported:
              result.supported,
            config:
              result.config,
          },
        },
        null,
        2
      );

    if (result.supported) {
      status.textContent =
        "✅ HEVC CONFIG SUPPORTED";

      status.style.color =
        "#5cff8d";
    } else {
      status.textContent =
        "❌ HEVC CONFIG NOT SUPPORTED";

      status.style.color =
        "#ff6b6b";
    }
  } catch (error) {
    status.textContent =
      "❌ TEST ERROR";

    status.style.color =
      "#ff6b6b";

    output.textContent =
      error.stack || error.message;
  }
}

test();
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
        const result =
          await inspect(env);

        const codecPrivate =
          result.videoTrack
            .codecPrivateHex
            .split(" ")
            .filter(Boolean)
            .map((hex) =>
              parseInt(hex, 16)
            );

        result.videoTrack
          .codecPrivateBytes =
          codecPrivate;

        delete result.videoTrack
          .codecPrivateHex;

        return Response.json(
          result,
          {
            headers: {
              "Cache-Control":
                "no-store",
            },
          }
        );
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
          {
            status: 500,
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
            "no-store",
        },
      }
    );
  },
};
