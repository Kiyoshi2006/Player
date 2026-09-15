const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const TRACKS_ID = 0x1654ae6b;
const TRACK_ENTRY_ID = 0xae;
const TRACK_NUMBER_ID = 0xd7;
const TRACK_TYPE_ID = 0x83;
const CODEC_ID = 0x86;
const CODEC_PRIVATE_ID = 0x63a2;
const NAME_ID = 0x536e;
const LANGUAGE_ID = 0x22b59c;
const VIDEO_ID = 0xe0;
const AUDIO_ID = 0xe1;
const PIXEL_WIDTH_ID = 0xb0;
const PIXEL_HEIGHT_ID = 0xba;

function readVint(bytes, offset, forSize = false) {
  if (offset >= bytes.length) return null;

  const first = bytes[offset];

  let length = 1;
  let mask = 0x80;

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

  if (
    forSize &&
    value === Math.pow(2, 7 * length) - 1
  ) {
    return {
      length,
      value: -1,
      unknown: true,
    };
  }

  return {
    length,
    value,
    unknown: false,
  };
}

function readElementId(bytes, offset) {
  const vint = readVint(bytes, offset);

  if (!vint) return null;

  let value = 0;

  for (let i = 0; i < vint.length; i++) {
    value = value * 256 + bytes[offset + i];
  }

  return {
    id: value,
    length: vint.length,
  };
}

function readElement(bytes, offset) {
  const id = readElementId(bytes, offset);

  if (!id) return null;

  const size = readVint(
    bytes,
    offset + id.length,
    true
  );

  if (!size) return null;

  const dataStart =
    offset + id.length + size.length;

  if (dataStart > bytes.length) {
    return null;
  }

  const dataEnd = size.unknown
    ? bytes.length
    : Math.min(
        dataStart + size.value,
        bytes.length
      );

  return {
    id: id.id,
    dataStart,
    dataEnd,
    size: size.value,
    unknown: size.unknown,
  };
}

function readUnsigned(bytes, start, end) {
  let value = 0;

  for (let i = start; i < end; i++) {
    value = value * 256 + bytes[i];
  }

  return value;
}

function readString(bytes, start, end) {
  return new TextDecoder("utf-8").decode(
    bytes.subarray(start, end)
  );
}

function findTracks(bytes) {
  let offset = 0;

  while (offset < bytes.length) {
    const element = readElement(bytes, offset);

    if (!element) break;

    if (element.id === TRACKS_ID) {
      return element;
    }

    if (element.dataEnd <= offset) break;

    offset = element.dataEnd;
  }

  return null;
}

function parseCodecPrivate(bytes, start, end) {
  const privateBytes = bytes.slice(start, end);

  const result = {
    size: privateBytes.length,
    firstBytes: Array.from(
      privateBytes.slice(0, 32)
    )
      .map(byte =>
        byte.toString(16).padStart(2, "0")
      )
      .join(" "),
  };

  if (privateBytes.length < 23) {
    result.error =
      "CodecPrivate quá ngắn để là HEVCDecoderConfigurationRecord";
    return result;
  }

  const configurationVersion = privateBytes[0];

  const profileSpace =
    (privateBytes[1] >> 6) & 0x03;

  const tierFlag =
    (privateBytes[1] >> 5) & 0x01;

  const profileIdc =
    privateBytes[1] & 0x1f;

  const compatibilityFlags =
    (
      privateBytes[2] * 0x1000000 +
      privateBytes[3] * 0x10000 +
      privateBytes[4] * 0x100 +
      privateBytes[5]
    ) >>> 0;

  const constraint48 =
    Number(
      (
        BigInt(privateBytes[6]) << 40n |
        BigInt(privateBytes[7]) << 32n |
        BigInt(privateBytes[8]) << 24n |
        BigInt(privateBytes[9]) << 16n |
        BigInt(privateBytes[10]) << 8n |
        BigInt(privateBytes[11])
      )
    );

  const levelIdc = privateBytes[12];

  const minSpatialSegmentation =
    ((privateBytes[13] & 0x0f) << 8) |
    privateBytes[14];

  const parallelismType =
    privateBytes[15] & 0x03;

  const chromaFormat =
    privateBytes[16] & 0x03;

  const bitDepthLumaMinus8 =
    privateBytes[17] & 0x07;

  const bitDepthChromaMinus8 =
    privateBytes[18] & 0x07;

  const avgFrameRate =
    (privateBytes[19] << 8) |
    privateBytes[20];

  const constantFrameRate =
    (privateBytes[21] >> 6) & 0x03;

  const numTemporalLayers =
    (privateBytes[21] >> 3) & 0x07;

  const temporalIdNested =
    (privateBytes[21] >> 2) & 0x01;

  const lengthSizeMinusOne =
    privateBytes[21] & 0x03;

  const numOfArrays = privateBytes[22];

  let profileName = "Unknown";

  if (profileIdc === 1) {
    profileName = "Main";
  } else if (profileIdc === 2) {
    profileName = "Main 10";
  } else if (profileIdc === 3) {
    profileName = "Main Still Picture";
  }

  result.configurationVersion = configurationVersion;
  result.profileSpace = profileSpace;
  result.profileIdc = profileIdc;
  result.profileName = profileName;
  result.tierFlag = tierFlag;
  result.tier = tierFlag ? "High" : "Main";
  result.levelIdc = levelIdc;
  result.level = (levelIdc / 30).toFixed(1);
  result.chromaFormat = chromaFormat;
  result.bitDepthLuma = 8 + bitDepthLumaMinus8;
  result.bitDepthChroma = 8 + bitDepthChromaMinus8;
  result.avgFrameRate = avgFrameRate
    ? avgFrameRate / 256
    : null;
  result.numTemporalLayers = numTemporalLayers;
  result.temporalIdNested = Boolean(
    temporalIdNested
  );
  result.naluLengthSize =
    lengthSizeMinusOne + 1;
  result.numOfArrays = numOfArrays;

  result.compatibilityFlags =
    "0x" +
    compatibilityFlags
      .toString(16)
      .padStart(8, "0");

  result.constraintFlags =
    constraint48
      .toString(16)
      .padStart(12, "0");

  return result;
}

function parseTrackEntry(bytes, start, end) {
  const track = {
    number: null,
    type: null,
    codecId: null,
    name: null,
    language: null,
    codecPrivate: null,
    video: {},
  };

  let offset = start;

  while (offset < end) {
    const element = readElement(bytes, offset);

    if (!element) break;

    const dataEnd =
      Math.min(element.dataEnd, end);

    switch (element.id) {
      case TRACK_NUMBER_ID:
        track.number = readUnsigned(
          bytes,
          element.dataStart,
          dataEnd
        );
        break;

      case TRACK_TYPE_ID:
        track.type = readUnsigned(
          bytes,
          element.dataStart,
          dataEnd
        );
        break;

      case CODEC_ID:
        track.codecId = readString(
          bytes,
          element.dataStart,
          dataEnd
        );
        break;

      case CODEC_PRIVATE_ID:
        track.codecPrivate =
          parseCodecPrivate(
            bytes,
            element.dataStart,
            dataEnd
          );
        break;

      case NAME_ID:
        track.name = readString(
          bytes,
          element.dataStart,
          dataEnd
        );
        break;

      case LANGUAGE_ID:
        track.language = readString(
          bytes,
          element.dataStart,
          dataEnd
        );
        break;

      case VIDEO_ID:
        parseVideo(
          bytes,
          element.dataStart,
          dataEnd,
          track.video
        );
        break;
    }

    if (dataEnd <= offset) break;

    offset = dataEnd;
  }

  return track;
}

function parseVideo(bytes, start, end, video) {
  let offset = start;

  while (offset < end) {
    const element = readElement(bytes, offset);

    if (!element) break;

    const dataEnd =
      Math.min(element.dataEnd, end);

    if (element.id === PIXEL_WIDTH_ID) {
      video.width = readUnsigned(
        bytes,
        element.dataStart,
        dataEnd
      );
    }

    if (element.id === PIXEL_HEIGHT_ID) {
      video.height = readUnsigned(
        bytes,
        element.dataStart,
        dataEnd
      );
    }

    if (dataEnd <= offset) break;

    offset = dataEnd;
  }
}

function parseTracks(bytes, start, end) {
  const tracks = [];
  let offset = start;

  while (offset < end) {
    const element = readElement(bytes, offset);

    if (!element) break;

    const dataEnd =
      Math.min(element.dataEnd, end);

    if (element.id === TRACK_ENTRY_ID) {
      tracks.push(
        parseTrackEntry(
          bytes,
          element.dataStart,
          dataEnd
        )
      );
    }

    if (dataEnd <= offset) break;

    offset = dataEnd;
  }

  return tracks;
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

  if (response.status !== 206) {
    throw new Error(
      `Expected 206, got ${response.status}`
    );
  }

  const buffer =
    await response.arrayBuffer();

  const bytes = new Uint8Array(buffer);

  const tracksElement =
    findTracks(bytes);

  if (!tracksElement) {
    throw new Error(
      "Không tìm thấy Tracks"
    );
  }

  const tracks = parseTracks(
    bytes,
    tracksElement.dataStart,
    tracksElement.dataEnd
  );

  return {
    ok: true,
    httpStatus: response.status,
    bytesRead: bytes.length,
    contentRange:
      response.headers.get("content-range"),
    tracks,
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
  <title>HEVC Codec Test</title>

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

    pre {
      background: #1d1d1d;
      padding: 16px;
      border-radius: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
      font-size: 13px;
    }
  </style>
</head>

<body>
  <h2>HEVC Codec Information</h2>
  <pre id="result">Đang đọc...</pre>

  <script>
    fetch("/api/codec")
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

    if (url.pathname === "/api/codec") {
      try {
        return Response.json(
          await inspect(env),
          {
            headers: {
              "Cache-Control": "no-store",
            },
          }
        );
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
        "Content-Type":
          "text/html; charset=UTF-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
