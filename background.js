const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_VIDEO_BYTES = 48 * 1024 * 1024;

const IMAGE_MIME_RE = /^image\/(?:png|jpe?g|gif|webp|bmp|avif)$/i;
const VIDEO_MIME_RE = /^video\/(?:mp4|quicktime|webm|x-m4v)$/i;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ByteLength(b64) {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function guessMimeFromUrl(url) {
  const match = String(url || "")
    .toLowerCase()
    .match(/\.(png|jpe?g|gif|webp|bmp|avif|mp4|m4v|mov|webm)(?:\?|#|$)/);
  if (!match) return "image/png";
  const ext = match[1];
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  return `image/${ext}`;
}

function parseDataUri(uri) {
  const match = uri.match(/^data:([^;,]+)?(;base64)?,(.+)$/);
  if (!match) return null;
  const mime = match[1] || "image/png";
  const base64 = match[2] ? match[3] : btoa(decodeURIComponent(match[3]));
  return { mime, base64, bytes: base64ByteLength(base64) };
}

function isPrivateOrLoopbackHost(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd")
  ) {
    return true;
  }
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const parts = host.split(".").map(Number);
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isRetryableError(errMsg) {
  const msg = String(errMsg || "");
  if (msg === "timeout" || /network|failed to fetch|load failed/i.test(msg)) {
    return true;
  }
  const httpMatch = /^HTTP (\d{3})$/.exec(msg);
  if (!httpMatch) return false;
  const status = Number(httpMatch[1]);
  return status >= 500 || status === 429 || status === 408;
}

async function fetchMediaOnce(url, timeoutMs, isVideo) {
  const isAllowedMime = (m) =>
    isVideo ? VIDEO_MIME_RE.test(String(m || "").trim()) : IMAGE_MIME_RE.test(String(m || "").trim());
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

  if (!url || typeof url !== "string") {
    return { ok: false, error: "invalid url" };
  }

  if (url.startsWith("data:")) {
    const parsed = parseDataUri(url);
    if (!parsed) return { ok: false, error: "invalid data uri" };
    if (!isAllowedMime(parsed.mime)) return { ok: false, error: "unsupported media mime" };
    if (parsed.bytes > maxBytes) return { ok: false, error: `too large (${parsed.bytes} bytes)` };
    return { ok: true, ...parsed };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { ok: false, error: "invalid url" };
  }

  if (parsedUrl.protocol !== "https:") {
    return { ok: false, error: "unsupported scheme" };
  }
  if (isPrivateOrLoopbackHost(parsedUrl.hostname)) {
    return { ok: false, error: "blocked host" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      credentials: "omit",
      redirect: "follow",
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const contentType = (resp.headers.get("content-type") || "").split(";")[0].trim() || guessMimeFromUrl(url);
    if (!isAllowedMime(contentType)) {
      return { ok: false, error: "unsupported media mime" };
    }
    const contentLength = Number(resp.headers.get("content-length") || 0);
    if (contentLength > maxBytes) {
      return { ok: false, error: `too large (${contentLength} bytes)` };
    }
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      return { ok: false, error: `too large (${buf.byteLength} bytes)` };
    }
    return {
      ok: true,
      mime: contentType,
      base64: arrayBufferToBase64(buf),
      bytes: buf.byteLength,
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      return { ok: false, error: "timeout" };
    }
    return { ok: false, error: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMediaWithRetry(url, kind = "image") {
  const isVideo = kind === "video";
  const maxAttempts = isVideo ? 3 : 4;
  let lastResult = { ok: false, error: "unknown" };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const timeoutMs = isVideo ? (attempt === 1 ? 90000 : 60000) : attempt === 1 ? 20000 : 15000;
    lastResult = await fetchMediaOnce(url, timeoutMs, isVideo);
    if (lastResult.ok || !isRetryableError(lastResult.error) || attempt === maxAttempts) {
      return lastResult;
    }
    const delayMs = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return lastResult;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "fetchImage") {
    fetchMediaWithRetry(message.url, message.kind === "video" ? "video" : "image")
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  return false;
});
