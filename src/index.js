const SOURCE_URL =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const TRACKS_OFFSET = 4388;
const TRACKS_ID = [0x16, 0x54, 0xae, 0x6b];
const TRACK_ENTRY_ID = [0xae];

const TRACK_NUMBER_ID = [0xd7];
const TRACK_TYPE_ID = [0x83];
const CODEC_ID = [0x86];
const CODEC_PRIVATE_ID = [0x63, 0xa2];
const NAME_ID = [0x53, 0x6e];
const LANGUAGE_ID = [0x22, 0xb5, 0x9c];

const VIDEO_ID = [0xe0];
const PIXEL_WIDTH_ID = [0xb0];
const PIXEL_HEIGHT_ID = [0xba];

function sameBytes(bytes, offset, pattern) {
  if (offset + pattern.length > bytes.length) {
    return false;
  }

  for (let i = 0; i < pattern.length; i++) {
    if (bytes[offset + i] !== pattern[i]) {
      return false;
    }
  }

  return true;
}

function readVint(bytes, offset) {
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

  return {
    length,
    value,
    unknown: value === Math.pow(2, 7 * length) - 1,
  };
}

function readElement(bytes, offset) {
  if (offset >= bytes.length) {
    return null;
  }

  const first = bytes[offset];

  let idLength = 1;
  let mask = 0x80;

  while (
    idLength <= 4 &&
    (first & mask) === 0
  ) {
    mask >>= 1;
    idLength++;
  }

  if (
    idLength > 4 ||
    offset + idLength > bytes.length
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
    id,
    offset,
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

function findElement(bytes, start, end, id) {
  let offset = start;

  while (offset < end) {
    const element = readElement(bytes, offset);

    if (!element) {
      return null;
    }

    if (
      element.id === id ||
      sameBytes(
        bytes,
        offset,
        Array.isArray(id) ? id : []
      )
    ) {
      return element;
    }

    if (element.dataEnd <= offset) {
      return null;
    }

    offset = element.dataEnd;
  }

  return null;
}

function parseVideo(bytes, start, end) {
  const video = {};

  let offset = start;

  while (offset < end) {
    const element = readElement(bytes, offset);

    if (!element) {
      break;
    }

    const dataEnd = Math.min(
      element.dataEnd,
      end
    );

    if (
      element.id ===
      readId(PIXEL_WIDTH_ID)
    ) {
      video.width = readUInt(
        bytes,
        element.dataStart,
        dataEnd
      );
    }

    if (
      element.id ===
      readId(PIXEL_HEIGHT_ID)
    ) {
      video.height = readUInt(
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

function readId(bytes) {
  let value = 0;

  for (const byte of bytes) {
    value = value * 256 + byte;
  }

  return value;
}

function parseTrack(bytes, start, end) {
  const track = {};

  let offset = start;

  while (offset < end) {
    const element = readElement(bytes, offset);

    if (!element) {
      break;
    }

    const dataEnd = Math.min(
      element.dataEnd,
      end
    );

    if (
      element.id ===
      readId(TRACK_NUMBER_ID)
    ) {
      track.number = readUInt(
        bytes,
        element.dataStart,
        dataEnd
      );
    }

    if (
      element.id ===
      readId(TRACK_TYPE_ID)
    ) {
      track.type = readUInt(
        bytes,
        element.dataStart,
        dataEnd
      );
    }

    if (
      element.id ===
      readId(CODEC_ID)
    ) {
      track.codecId = readText(
        bytes,
        element.dataStart,
        dataEnd
      );
    }

    if (
      element.id ===
      readId(NAME_ID)
    ) {
      track.name = readText(
        bytes,
        element.dataStart,
        dataEnd
      );
    }

    if (
      element.id ===
      readId(LANGUAGE_ID)
    ) {
      track.language = readText(
        bytes,
        element.dataStart,
        dataEnd
      );
    }

    if (
      element.id ===
      readId(CODEC_PRIVATE_ID)
    ) {
      const privateBytes = bytes.slice(
        element.dataStart,
        dataEnd
      );

      track.codecPrivate = {
        size: privateBytes.length,
        hex: Array.from(privateBytes)
          .map(byte =>
            byte.toString(16).padStart(2, "0")
          )
          .join(" "),
      };
    }

    if (
      element.id ===
      readId(VIDEO_ID)
    ) {
      track.video = parseVideo(
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

  return track;
}

async function inspect(env) {
  const response = await env.LOLI.fetch(
    new Request(SOURCE_URL, {
      headers: {
        Range: "bytes=4388-21858",
      },
    })
  );

  if (response.status !== 206) {
    throw new Error(
      `Loli returned ${response.status}`
    );
  }

  const buffer =
    await response.arrayBuffer();

  const bytes = new Uint8Array(buffer);

  const tracks = [];

  let offset = 6;

  while (offset < bytes.length) {
    const element = readElement(
      bytes,
      offset
    );

    if (!element) {
      break;
    }

    if (element.id === readId(TRACK_ENTRY_ID)) {
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

  return {
    ok: true,
    httpStatus: response.status,
    bytesRead: bytes.length,
    firstBytes: Array.from(
      bytes.slice(0, 20)
    )
      .map(byte =>
        byte.toString(16).padStart(2, "0")
      )
      .join(" "),
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
<title>MKV HEVC Test</title>
<style>
body {
  margin: 0;
  padding: 20px;
  background: #111;
  color: #fff;
  font-family: -apple-system,
    BlinkMacSystemFont, sans-serif;
}
pre {
  padding: 16px;
  border-radius: 12px;
  background: #1d1d1d;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  font-size: 13px;
}
</style>
</head>
<body>
<h2>MKV HEVC Track</h2>
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
          await inspect(env)
        );
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: error instanceof Error
              ? error.message
              : String(error),
          },
          { status: 500 }
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
