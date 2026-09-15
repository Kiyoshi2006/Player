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

function readUnsigned(bytes, start, end) {
  let value = 0;

  for (let i = start; i < end; i++) {
    value = value * 256 + bytes[i];
  }

  return value;
}

function readFloat(bytes, start, end) {
  const length = end - start;

  if (length === 4) {
    return new DataView(
      bytes.buffer,
      bytes.byteOffset + start,
      4
    ).getFloat32(0, false);
  }

  if (length === 8) {
    return new DataView(
      bytes.buffer,
      bytes.byteOffset + start,
      8
    ).getFloat64(0, false);
  }

  return null;
}

function readString(bytes, start, end) {
  return new TextDecoder("utf-8", {
    fatal: false,
  }).decode(bytes.subarray(start, end)).replace(/\0+$/, "");
}

function idLength(id) {
  if (id <= 0xff) return 1;
  if (id <= 0xffff) return 2;
  if (id <= 0xffffff) return 3;
  return 4;
}

function elementHeader(bytes, offset) {
  const id = readElementId(bytes, offset);

  if (!id) {
    return null;
  }

  const size = readVint(bytes, offset + id.length, true);

  if (!size) {
    return null;
  }

  return {
    id: id.id,
    idLength: id.length,
    sizeLength: size.length,
    dataStart: offset + id.length + size.length,
    size: size.value,
    unknown: size.unknown,
  };
}

function parseTrackEntry(bytes, start, end) {
  const track = {
    number: null,
    type: null,
    codecId: null,
    codecPrivateSize: null,
    name: null,
    language: null,
    video: {},
    audio: {},
  };

  let offset = start;

  while (offset < end) {
    const header = elementHeader(bytes, offset);

    if (!header || header.dataStart > end) {
      break;
    }

    const dataEnd = header.unknown
      ? end
      : Math.min(header.dataStart + header.size, end);

    switch (header.id) {
      case TRACK_NUMBER_ID:
        track.number = readUnsigned(
          bytes,
          header.dataStart,
          dataEnd
        );
        break;

      case TRACK_TYPE_ID:
        track.type = readUnsigned(
          bytes,
          header.dataStart,
          dataEnd
        );
        break;

      case CODEC_ID:
        track.codecId = readString(
          bytes,
          header.dataStart,
          dataEnd
        );
        break;

      case CODEC_PRIVATE_ID:
        track.codecPrivateSize = dataEnd - header.dataStart;
        break;

      case NAME_ID:
        track.name = readString(
          bytes,
          header.dataStart,
          dataEnd
        );
        break;

      case LANGUAGE_ID:
        track.language = readString(
          bytes,
          header.dataStart,
          dataEnd
        );
        break;

      case VIDEO_ID:
        parseVideo(
          bytes,
          header.dataStart,
          dataEnd,
          track.video
        );
        break;

      case AUDIO_ID:
        parseAudio(
          bytes,
          header.dataStart,
          dataEnd,
          track.audio
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

function parseVideo(bytes, start, end, video) {
  let offset = start;

  while (offset < end) {
    const header = elementHeader(bytes, offset);

    if (!header || header.dataStart > end) {
      break;
    }

    const dataEnd = header.unknown
      ? end
      : Math.min(header.dataStart + header.size, end);

    if (header.id === PIXEL_WIDTH_ID) {
      video.width = readUnsigned(
        bytes,
        header.dataStart,
        dataEnd
      );
    }

    if (header.id === PIXEL_HEIGHT_ID) {
      video.height = readUnsigned(
        bytes,
        header.dataStart,
        dataEnd
      );
    }

    if (header.id === BIT_DEPTH_ID) {
      video.bitDepth = readUnsigned(
        bytes,
        header.dataStart,
        dataEnd
      );
    }

    if (dataEnd <= offset) {
      break;
    }

    offset = dataEnd;
  }
}

function parseAudio(bytes, start, end, audio) {
  let offset = start;

  while (offset < end) {
    const header = elementHeader(bytes, offset);

    if (!header || header.dataStart > end) {
      break;
    }

    const dataEnd = header.unknown
      ? end
      : Math.min(header.dataStart + header.size, end);

    if (header.id === SAMPLING_FREQUENCY_ID) {
      audio.sampleRate = readFloat(
        bytes,
        header.dataStart,
        dataEnd
      );
    }

    if (header.id === CHANNELS_ID) {
      audio.channels = readUnsigned(
        bytes,
        header.dataStart,
        dataEnd
      );
    }

    if (dataEnd <= offset) {
      break;
    }

    offset = dataEnd;
  }
}

function parseTracks(bytes, start, end) {
  const tracks = [];
  let offset = start;

  while (offset < end) {
    const header = elementHeader(bytes, offset);

    if (!header || header.dataStart > end) {
      break;
    }

    const dataEnd = header.unknown
      ? end
      : Math.min(header.dataStart + header.size, end);

    if (header.id === TRACK_ENTRY_ID) {
      tracks.push(
        parseTrackEntry(
          bytes,
          header.dataStart,
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

function findTracks(bytes) {
  let offset = 0;

  while (offset < bytes.length) {
    const header = elementHeader(bytes, offset);

    if (!header) {
      break;
    }

    const dataEnd = header.unknown
      ? bytes.length
      : Math.min(
          header.dataStart + header.size,
          bytes.length
        );

    if (header.id === TRACKS_ID) {
      return parseTracks(
        bytes,
        header.dataStart,
        dataEnd
      );
    }

    if (dataEnd <= offset) {
      break;
    }

    offset = dataEnd;
  }

  return null;
}

function normalizeTrack(track) {
  const typeNames = {
    1: "video",
    2: "audio",
    3: "complex",
    16: "logo",
    17: "subtitle",
    18: "buttons",
    32: "control",
  };

  return {
    number: track.number,
    type: typeNames[track.type] || `unknown(${track.type})`,
    codecId: track.codecId,
    codecPrivateSize: track.codecPrivateSize,
    name: track.name,
    language: track.language,
    video: Object.keys(track.video).length
      ? track.video
      : undefined,
    audio: Object.keys(track.audio).length
      ? track.audio
      : undefined,
  };
}

async function getTracks(env) {
  const end = 4 * 1024 * 1024 - 1;

  const headers = new Headers({
    Range: `bytes=0-${end}`,
  });

  const response = await env.LOLI.fetch(
    new Request(SOURCE_URL, {
      method: "GET",
      headers,
    })
  );

  if (!response.ok && response.status !== 206) {
    throw new Error(
      `Loli returned HTTP ${response.status}`
    );
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const tracks = findTracks(bytes);

  if (!tracks) {
    throw new Error(
      "Không tìm thấy Matroska Tracks trong 4 MB đầu file."
    );
  }

  return {
    httpStatus: response.status,
    bytesRead: bytes.length,
    fileSize: response.headers.get("content-range"),
    tracks: tracks.map(normalizeTrack),
  };
}

function html() {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <title>MKV Track Test</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #111;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }

    pre {
      padding: 16px;
      border-radius: 12px;
      background: #1d1d1d;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <h2>MKV Tracks</h2>
  <pre id="result">Đang đọc MKV...</pre>

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
          {
            ok: true,
            ...(await getTracks(env)),
          },
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

    return new Response(html(), {
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
