const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const TRACKS_ID = 0x1654ae6b;
const TRACK_ENTRY_ID = 0xae;

const TRACK_NUMBER_ID = 0xd7;
const TRACK_TYPE_ID = 0x83;
const CODEC_ID = 0x86;
const NAME_ID = 0x536e;
const LANGUAGE_ID = 0x22b59c;
const DEFAULT_FLAG_ID = 0x88;
const FORCED_FLAG_ID = 0x55aa;
const VIDEO_ID = 0xe0;
const AUDIO_ID = 0xe1;
const PIXEL_WIDTH_ID = 0xb0;
const PIXEL_HEIGHT_ID = 0xba;
const BIT_DEPTH_ID = 0x6264;
const SAMPLING_FREQUENCY_ID = 0xb5;
const CHANNELS_ID = 0x9f;

function readVint(bytes, offset, forSize = false) {
  if (offset >= bytes.length) {
    return null;
  }

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

  if (forSize && value === Math.pow(2, 7 * length) - 1) {
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

  if (!vint) {
    return null;
  }

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

  if (!id) {
    return null;
  }

  const size = readVint(bytes, offset + id.length, true);

  if (!size) {
    return null;
  }

  const dataStart = offset + id.length + size.length;

  if (dataStart > bytes.length) {
    return null;
  }

  let dataEnd;

  if (size.unknown) {
    dataEnd = bytes.length;
  } else {
    dataEnd = Math.min(
      dataStart + size.value,
      bytes.length
    );
  }

  return {
    id: id.id,
    offset,
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

function readFloat(bytes, start, end) {
  const length = end - start;

  if (length !== 4 && length !== 8) {
    return null;
  }

  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset + start,
    length
  );

  return length === 4
    ? view.getFloat32(0, false)
    : view.getFloat64(0, false);
}

function readString(bytes, start, end) {
  return new TextDecoder("utf-8").decode(
    bytes.subarray(start, end)
  );
}

function parseVideo(bytes, start, end) {
  const video = {};
  let offset = start;

  while (offset < end) {
    const element = readElement(bytes, offset);

    if (!element || element.dataStart > end) {
      break;
    }

    const dataEnd = Math.min(element.dataEnd, end);

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

    if (element.id === BIT_DEPTH_ID) {
      video.bitDepth = readUnsigned(
        bytes,
        element.dataStart,
        dataEnd
      );
    }

    if (dataEnd <= offset) {
      break;
    }

    offset = dataEnd;
  }

  return video;
}

function parseAudio(bytes, start, end) {
  const audio = {};
  let offset = start;

  while (offset < end) {
    const element = readElement(bytes, offset);

    if (!element || element.dataStart > end) {
      break;
    }

    const dataEnd = Math.min(element.dataEnd, end);

    if (element.id === SAMPLING_FREQUENCY_ID) {
      audio.sampleRate = readFloat(
        bytes,
        element.dataStart,
        dataEnd
      );
    }

    if (element.id === CHANNELS_ID) {
      audio.channels = readUnsigned(
        bytes,
        element.dataStart,
        dataEnd
      );
    }

    if (dataEnd <= offset) {
      break;
    }

    offset = dataEnd;
  }

  return audio;
}

function parseTrackEntry(bytes, start, end) {
  const track = {
    number: null,
    type: null,
    codecId: null,
    name: null,
    language: null,
    default: null,
    forced: null,
    video: {},
    audio: {},
  };

  let offset = start;

  while (offset < end) {
    const element = readElement(bytes, offset);

    if (!element || element.dataStart > end) {
      break;
    }

    const dataEnd = Math.min(element.dataEnd, end);

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

      case DEFAULT_FLAG_ID:
        track.default = Boolean(
          readUnsigned(
            bytes,
            element.dataStart,
            dataEnd
          )
        );
        break;

      case FORCED_FLAG_ID:
        track.forced = Boolean(
          readUnsigned(
            bytes,
            element.dataStart,
            dataEnd
          )
        );
        break;

      case VIDEO_ID:
        track.video = parseVideo(
          bytes,
          element.dataStart,
          dataEnd
        );
        break;

      case AUDIO_ID:
        track.audio = parseAudio(
          bytes,
          element.dataStart,
          dataEnd
        );
        break;
    }

    if (dataEnd <= offset) {
      break;
    }

    offset = dataEnd;
  }

  return track;
}

function parseTracks(bytes, start, end) {
  const tracks = [];
  let offset = start;

  while (offset < end) {
    const element = readElement(bytes, offset);

    if (!element || element.dataStart > end) {
      break;
    }

    const dataEnd = Math.min(element.dataEnd, end);

    if (element.id === TRACK_ENTRY_ID) {
      tracks.push(
        parseTrackEntry(
          bytes,
          element.dataStart,
          dataEnd
        )
      );
    }

    if (dataEnd <= offset) {
      break;
    }

    offset = dataEnd;
  }

  return tracks;
}

function findTracksElement(bytes) {
  let offset = 0;

  while (offset < bytes.length) {
    const element = readElement(bytes, offset);

    if (!element) {
      break;
    }

    if (element.id === TRACKS_ID) {
      return element;
    }

    if (element.dataEnd <= offset) {
      break;
    }

    offset = element.dataEnd;
  }

  return null;
}

function scanForTracks(bytes) {
  const positions = [];

  for (
    let i = 0;
    i <= bytes.length - 4;
    i++
  ) {
    if (
      bytes[i] === 0x16 &&
      bytes[i + 1] === 0x54 &&
      bytes[i + 2] === 0xae &&
      bytes[i + 3] === 0x6b
    ) {
      positions.push(i);
    }
  }

  return positions;
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

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const positions = scanForTracks(bytes);

  const results = [];

  for (const position of positions) {
    const element = readElement(bytes, position);

    if (!element) {
      results.push({
        position,
        error: "Cannot parse Tracks element",
      });
      continue;
    }

    const tracks = parseTracks(
      bytes,
      element.dataStart,
      element.dataEnd
    );

    results.push({
      position,
      size: element.size,
      dataStart: element.dataStart,
      dataEnd: element.dataEnd,
      tracks,
    });
  }

  return {
    ok: true,
    httpStatus: response.status,
    bytesRead: bytes.length,
    contentRange: response.headers.get("content-range"),
    tracksElements: results,
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
  <title>MKV Track Parser</title>

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
      overflow-x: auto;
    }
  </style>
</head>

<body>
  <h2>MKV Track Parser</h2>
  <pre id="result">Đang đọc...</pre>

  <script>
    fetch("/api/tracks")
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

    if (url.pathname === "/api/tracks") {
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
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
