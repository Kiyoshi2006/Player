const player = document.querySelector("#player");
const sourceInput = document.querySelector("#source-url");
const playButton = document.querySelector("#play-button");
const checkButton = document.querySelector("#check-button");
const copyButton = document.querySelector("#copy-button");
const clearButton = document.querySelector("#clear-button");
const status = document.querySelector("#status");
const diagnostics = document.querySelector("#diagnostics");
const version = document.querySelector("#version");

const DEFAULT_SOURCE =
  "https://loli.nvnyep.workers.dev/13102006/Colab_Torrent_Uploads/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D/%5BFeibanyama%5D%20Mushoku%20Tensei%20Jobless%20Reincarnation%20S01E01%20%5BBILIBILI%20WebRip%202160p%20HEVC%20OPUS%20Multi-Subs%5D.mkv";

const params = new URLSearchParams(location.search);
const querySource = params.get("url");
const savedSource = localStorage.getItem("mkv-source-url");

sourceInput.value = querySource || savedSource || DEFAULT_SOURCE;

playButton.addEventListener("click", playSource);
checkButton.addEventListener("click", checkSource);
copyButton.addEventListener("click", copyPlayerLink);
clearButton.addEventListener("click", clearSource);

sourceInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    playSource();
  }
});

player.addEventListener("loadedmetadata", () => {
  setStatus("Đã đọc metadata MKV. Mở menu ⚙/subtitle/audio để chọn track.");
  writeDiagnostics();
});

player.addEventListener("playing", () => {
  setStatus("Đang phát.");
});

player.addEventListener("waiting", () => {
  setStatus("Đang buffer…");
});

player.addEventListener("stalled", () => {
  setStatus("Nguồn đang chậm hoặc thiếu Range response.");
});

player.addEventListener("error", () => {
  setStatus(
    "Không phát được. Xem Chẩn đoán; thường là CORS/Range, codec hoặc giới hạn thiết bị.",
    true,
  );
  writeDiagnostics();
});

player.addEventListener("errordisplay", (event) => {
  const message =
    event?.detail?.message ||
    event?.message ||
    "Player báo lỗi không xác định.";
  setStatus(message, true);
  writeDiagnostics(message);
});

async function playSource() {
  const source = validateSource(sourceInput.value);

  if (!source) {
    setStatus("URL không hợp lệ. Chỉ hỗ trợ http:// hoặc https://.", true);
    return;
  }

  localStorage.setItem("mkv-source-url", source);
  updateUrl(source);

  const proxiedUrl = buildProxyUrl(source);

  setStatus("Đang mở MKV và đọc tracks…");
  diagnostics.textContent = `Source:\n${source}\n\nProxy:\n${proxiedUrl}`;

  player.src = proxiedUrl;
}

async function checkSource() {
  const source = validateSource(sourceInput.value);

  if (!source) {
    setStatus("URL không hợp lệ.", true);
    return;
  }

  setStatus("Đang kiểm tra Range…");

  try {
    const response = await fetch(
      `/api/probe?url=${encodeURIComponent(source)}`,
      { cache: "no-store" },
    );

    const result = await response.json();
    diagnostics.textContent = JSON.stringify(result, null, 2);

    if (!response.ok || !result.ok) {
      setStatus(
        result.error || `Origin trả HTTP ${result.status}.`,
        true,
      );
      return;
    }

    const rangeOk = result.status === 206;
    setStatus(
      rangeOk
        ? "OK: origin hỗ trợ HTTP Range (206)."
        : `Origin trả HTTP ${result.status}; player vẫn sẽ thử linear mode.`,
      !rangeOk,
    );
  } catch (error) {
    setStatus(`Không kiểm tra được: ${error.message}`, true);
  }
}

async function copyPlayerLink() {
  const source = validateSource(sourceInput.value);

  if (!source) {
    setStatus("URL không hợp lệ.", true);
    return;
  }

  const link = `${location.origin}${location.pathname}?url=${encodeURIComponent(source)}`;

  try {
    await navigator.clipboard.writeText(link);
    setStatus("Đã copy link player.");
  } catch {
    setStatus("Safari không cho copy tự động. Hãy copy URL trên thanh địa chỉ.", true);
  }
}

function clearSource() {
  sourceInput.value = "";
  localStorage.removeItem("mkv-source-url");
  player.removeAttribute("src");
  history.replaceState(null, "", location.pathname);
  diagnostics.textContent = "Đã xóa.";
  setStatus("Đã xóa URL.");
}

function validateSource(value) {
  try {
    const url = new URL(value.trim());

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function buildProxyUrl(source) {
  return `/proxy?url=${encodeURIComponent(source)}`;
}

function updateUrl(source) {
  const url = new URL(location.href);
  url.searchParams.set("url", source);
  history.replaceState(null, "", url);
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.error = String(isError);
}

function writeDiagnostics(extraMessage = "") {
  const snapshot = {
    playerVersion: player.version ?? version.textContent,
    playerBuild: player.build ?? "unknown",
    source: sourceInput.value,
    proxiedSource: player.src || null,
    duration: Number.isFinite(player.duration) ? player.duration : null,
    currentTime: Number.isFinite(player.currentTime) ? player.currentTime : null,
    textTracks: player.textTracks?.length ?? null,
    audioTracks: player.audioTracks?.length ?? null,
    extraMessage,
  };

  diagnostics.textContent = JSON.stringify(snapshot, null, 2);
}
