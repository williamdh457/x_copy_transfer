(() => {
  const UPLOAD_URL = "https://upload.x.com/i/media/upload.json";
  const DEFAULT_BEARER =
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const FALLBACK_OPS = {
    ArticleEntityUpdateContent: "P5Nc3DYs9D4XqVthNrig8w",
    ArticleEntityResultByRestId: "rPdndX2XxQoXIMUafLSSJQ",
    ArticleEntityUpdateTitle: "z_xdvTUbZjSVjt232b4D4A",
    ArticleEntityUpdateCoverMedia: "BXQicEDA0v2F5SmsjObjDQ",
  };
  const GQL_FEATURES = {
    profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_profile_redirect_enabled: true,
    rweb_tipjar_consumption_enabled: false,
    verified_phone_label_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
  };

  const CHUNK_SIZE = 5 * 1024 * 1024;
  let sniffedBearer = "";
  const sniffedOps = new Map();

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== "xmp-main" || msg.kind !== "auth") return;
    if (typeof msg.bearer === "string" && msg.bearer) sniffedBearer = msg.bearer;
    if (msg.ops && typeof msg.ops === "object") {
      for (const [op, id] of Object.entries(msg.ops)) {
        if (typeof id === "string" && id) sniffedOps.set(op, id);
      }
    }
  });

  function getCsrfToken() {
    return document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1] || "";
  }

  function authHeaders(extra = {}) {
    const ct0 = getCsrfToken();
    if (!ct0) throw new Error("not signed in to X (no ct0 cookie) — reload x.com and try again");
    return {
      Authorization: `Bearer ${sniffedBearer || DEFAULT_BEARER}`,
      "x-csrf-token": ct0,
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
      ...extra,
    };
  }

  function getOpId(opName) {
    return sniffedOps.get(opName) || FALLBACK_OPS[opName] || "";
  }

  function getArticleIdFromUrl(url) {
    const target = url ?? window.location?.href ?? "";
    return String(target).match(/\/compose\/articles\/edit\/(\d+)/)?.[1] || "";
  }

  function isVideoMime(mime) {
    return /^video\//i.test(String(mime || "").trim());
  }

  function uploadCategoryForMime(mime) {
    const m = String(mime || "").trim();
    if (isVideoMime(m)) return "amplify_video";
    if (/^image\/gif$/i.test(m)) return "tweet_gif";
    return "tweet_image";
  }

  function entityCategoryForMime(mime) {
    const m = String(mime || "").trim();
    if (isVideoMime(m)) return "AmplifyVideo";
    if (/^image\/gif$/i.test(m)) return "DraftTweetGif";
    return "DraftTweetImage";
  }

  function base64ToBlob(base64, mime) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime || "application/octet-stream" });
  }

  function uploadEndpoint(params) {
    const u = new URL(UPLOAD_URL);
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, String(v));
    }
    return u.toString();
  }

  async function readOkText(step, resp) {
    const txt = await resp.text().catch(() => "");
    if (!resp.ok) throw new Error(`${step} failed: ${resp.status} ${txt.slice(0, 200)}`);
    return txt;
  }

  function parseJsonSafe(step, txt) {
    if (!txt) return null;
    try {
      return JSON.parse(txt);
    } catch {
      throw new Error(`${step} returned non-JSON: ${txt.slice(0, 200)}`);
    }
  }

  function checkAborted(signal) {
    if (signal?.aborted) throw new DOMException("Upload stopped", "AbortError");
  }

  async function waitProcessing(mediaId, initialInfo, signal, isVideo) {
    let info = initialInfo;
    const maxPolls = isVideo ? 300 : 12;
    for (let i = 0; i < maxPolls; i += 1) {
      if (!info || info.state === "succeeded") return;
      if (info.state === "failed") {
        throw new Error(`media processing failed: ${JSON.stringify(info.error || {}).slice(0, 200)}`);
      }
      const waitSec = Math.max(1, Number(info.check_after_secs) || 1);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      checkAborted(signal);
      const res = await fetch(uploadEndpoint({ command: "STATUS", media_id: mediaId }), {
        method: "GET",
        credentials: "include",
        headers: authHeaders(),
        signal,
      });
      const json = parseJsonSafe("STATUS", await readOkText("STATUS", res));
      info = json?.processing_info;
    }
    throw new Error("media processing timed out");
  }

  async function uploadMediaOnce(mediaData, signal) {
    checkAborted(signal);
    const blob = base64ToBlob(mediaData.base64, mediaData.mime);
    const mime = /^(?:image|video)\//i.test(blob.type) ? blob.type : "image/jpeg";
    const category = uploadCategoryForMime(mime);

    const initRes = await fetch(
      uploadEndpoint({
        command: "INIT",
        total_bytes: blob.size,
        media_type: mime,
        media_category: category,
      }),
      {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        signal,
      }
    );
    const initJson = parseJsonSafe("INIT", await readOkText("INIT", initRes));
    const mediaId =
      initJson?.media_id_string || (initJson?.media_id !== undefined ? String(initJson.media_id) : "");
    if (!mediaId) throw new Error("INIT returned no media_id");

    const chunks = Math.max(1, Math.ceil(blob.size / CHUNK_SIZE));
    for (let idx = 0; idx < chunks; idx += 1) {
      checkAborted(signal);
      const slice = blob.slice(idx * CHUNK_SIZE, Math.min((idx + 1) * CHUNK_SIZE, blob.size));
      const form = new FormData();
      form.set("media", slice, mediaData.fileName || "image");
      const appRes = await fetch(
        uploadEndpoint({ command: "APPEND", media_id: mediaId, segment_index: idx }),
        {
          method: "POST",
          credentials: "include",
          headers: authHeaders(),
          body: form,
          signal,
        }
      );
      await readOkText("APPEND", appRes);
    }

    checkAborted(signal);
    const finRes = await fetch(uploadEndpoint({ command: "FINALIZE", media_id: mediaId }), {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      signal,
    });
    const finJson = parseJsonSafe("FINALIZE", await readOkText("FINALIZE", finRes));
    await waitProcessing(mediaId, finJson?.processing_info, signal, isVideoMime(mime));
    return {
      ok: true,
      mediaId,
      mediaCategory: entityCategoryForMime(mime),
    };
  }

  function isRetryableUploadErr(err) {
    const msg = String(err?.message || err);
    if (/timed out/i.test(msg)) return true;
    const m = /(?:INIT|APPEND|FINALIZE|STATUS) failed: (\d{3})/.exec(msg);
    if (!m) return false;
    const code = Number(m[1]);
    return code >= 500 || code === 429 || code === 408;
  }

  async function uploadMedia(mediaData, signal) {
    const maxAttempts = 3;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      checkAborted(signal);
      const timeoutMs = isVideoMime(mediaData.mime) ? 180000 : 45000;
      const ac = new AbortController();
      const onParentAbort = () => ac.abort(signal?.reason);
      if (signal?.aborted) onParentAbort();
      else signal?.addEventListener?.("abort", onParentAbort, { once: true });
      const timer = setTimeout(() => ac.abort(new Error("upload timed out")), timeoutMs);
      try {
        return await uploadMediaOnce(mediaData, ac.signal);
      } catch (err) {
        lastErr = err;
        if (err?.name === "AbortError" && signal?.aborted) throw err;
        if (attempt === maxAttempts || !isRetryableUploadErr(err)) throw err;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", onParentAbort);
      }
      await new Promise((r) => setTimeout(r, 600 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250)));
    }
    throw lastErr;
  }

  function findDeep(obj, pred, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 8) return null;
    if (pred(obj)) return obj;
    for (const val of Object.values(obj)) {
      const hit = findDeep(val, pred, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  async function fetchArticleResult(articleId, signal) {
    const opName = "ArticleEntityResultByRestId";
    const queryId = getOpId(opName);
    if (!queryId) return null;
    try {
      const url = `https://x.com/i/api/graphql/${queryId}/${opName}?variables=${encodeURIComponent(
        JSON.stringify({ articleEntityId: String(articleId) })
      )}&features=${encodeURIComponent(JSON.stringify(GQL_FEATURES))}`;
      const res = await fetch(url, { credentials: "include", headers: authHeaders(), signal });
      return res.ok ? await res.json() : null;
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      return null;
    }
  }

  async function fetchArticleMediaEntities(articleId, signal) {
    const data = await fetchArticleResult(articleId, signal);
    const hit = findDeep(data, (o) => Array.isArray(o.media_entities));
    return Array.isArray(hit?.media_entities) ? hit.media_entities : [];
  }

  async function updateArticleContent(articleId, contentState, signal) {
    const opName = "ArticleEntityUpdateContent";
    const queryId = getOpId(opName);
    if (!queryId) return { ok: false, error: `no queryId for ${opName}` };
    try {
      const res = await fetch(`https://x.com/i/api/graphql/${queryId}/${opName}`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          variables: { article_entity: String(articleId), content_state: contentState },
          features: GQL_FEATURES,
          queryId,
        }),
        signal,
      });
      const txt = await res.text().catch(() => "");
      if (!res.ok) return { ok: false, error: `${res.status} ${txt.slice(0, 300)}` };
      const json = JSON.parse(txt || "{}");
      if (!Array.isArray(json?.errors) || !json.errors.length) return { ok: true };
      const errMsg = json.errors.map((e) => e.message).filter(Boolean).join("; ");
      return { ok: false, error: errMsg || "GraphQL error" };
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      return { ok: false, error: String(err?.message || err) };
    }
  }

  async function fetchImageViaBackground(url, kind = "image") {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "fetchImage", url, kind }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(resp || { ok: false, error: "empty response" });
        });
      } catch (err) {
        resolve({ ok: false, error: String(err?.message || err) });
      }
    });
  }

  window.__XMP_API__ = {
    getArticleIdFromUrl,
    uploadMedia,
    updateArticleContent,
    fetchArticleMediaEntities,
    fetchImageViaBackground,
  };
})();
