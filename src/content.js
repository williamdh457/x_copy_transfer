(() => {
  const ARTICLES_URL_RE = /^https:\/\/(?:x|twitter)\.com\/compose\/articles(?:$|[/?#])/;
  const EDIT_URL_RE = /^https:\/\/(?:x|twitter)\.com\/compose\/articles\/edit\/\d+/;

  const I18N = () => window.__XMP_I18N__;
  const MD = () => window.__XMP_MD__;
  const TABLE = () => window.__XMP_TABLE__;
  const API = () => window.__XMP_API__;
  const UI = () => window.__XMP_UI__;
  const t = (key, vars) => (I18N() ? I18N().t(key, vars) : key);

  let isBusy = false;
  let activeAbort = null;
  let mainNonce = null;
  let dragDepth = 0;

  // Handshake with MAIN world injector
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (msg?.source === "xmp-main" && msg.kind === "ready" && msg.nonce) {
      mainNonce = msg.nonce;
    }
  });
  window.postMessage({ source: "xmp", kind: "ready?" }, "*");

  async function ensureMainReady(timeoutMs = 3000) {
    if (mainNonce) return mainNonce;
    const deadline = Date.now() + timeoutMs;
    window.postMessage({ source: "xmp", kind: "ready?" }, "*");
    while (!mainNonce && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!mainNonce) throw new Error("Editor bridge not ready — reload x.com and try again");
    return mainNonce;
  }

  async function loadSettings() {
    try {
      const res = await chrome.storage.local.get(["xmp_cover_mode", "xmp_table_mode"]);
      return {
        coverMode: ["ask", "first", "none"].includes(res?.xmp_cover_mode) ? res.xmp_cover_mode : "ask",
        tableMode: ["image", "native"].includes(res?.xmp_table_mode) ? res.xmp_table_mode : "image",
      };
    } catch {
      return { coverMode: "ask", tableMode: "image" };
    }
  }

  async function saveCoverMode(mode) {
    try {
      await chrome.storage.local.set({ xmp_cover_mode: mode });
    } catch {}
  }

  function hasFilesTransfer(dt) {
    if (!dt) return false;
    return (dt.types ? Array.from(dt.types) : []).includes("Files");
  }

  function isMarkdownFile(file) {
    if (!file) return false;
    if (file.type === "text/markdown") return true;
    return /\.(md|markdown|mdown|mkd)$/i.test(file.name || "");
  }

  function isRemoteOrDataUrl(src) {
    return /^(?:https?:\/\/|data:)/i.test(String(src || "").trim());
  }

  function normalizeRelPath(raw) {
    let s = String(raw || "").trim().split(/[?#]/)[0].replace(/\\/g, "/");
    try {
      s = decodeURIComponent(s);
    } catch {}
    const parts = [];
    for (const seg of s.split("/")) {
      if (!seg || seg === ".") continue;
      if (seg === "..") {
        if (parts.length) parts.pop();
        continue;
      }
      parts.push(seg);
    }
    return parts.join("/").normalize("NFC");
  }

  function inferMimeFromName(name) {
    const match = String(name || "")
      .toLowerCase()
      .match(/\.(png|jpe?g|gif|webp|bmp|avif|mp4|m4v|mov|webm)$/);
    if (!match) return "";
    const ext = match[1];
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "mp4" || ext === "m4v") return "video/mp4";
    if (ext === "mov") return "video/quicktime";
    if (ext === "webm") return "video/webm";
    return `image/${ext}`;
  }

  function readLocalFileAsMedia(file, kind = "image") {
    const isVideo = kind === "video";
    const maxBytes = isVideo ? 48 * 1024 * 1024 : 16 * 1024 * 1024;
    if (!file) return Promise.resolve({ ok: false, error: t("img_err_local_unmatched") });
    if (file.size > maxBytes) {
      return Promise.resolve({ ok: false, error: `too large (${file.size} bytes)` });
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        const base64 = dataUrl.split(",")[1] || "";
        const rawType = String(file.type || "").trim();
        const mime =
          (/^(?:image|video)\//i.test(rawType) ? rawType : "") ||
          inferMimeFromName(file.name) ||
          (isVideo ? "video/mp4" : "image/png");
        resolve({
          ok: true,
          mime,
          base64,
          bytes: file.size,
          fileName: file.name || "image.png",
        });
      };
      reader.onerror = () => resolve({ ok: false, error: String(reader.error?.message || "Failed to read file") });
      reader.readAsDataURL(file);
    });
  }

  function createLocalFileRegistry(initialEntries = []) {
    const items = [];

    const addEntries = (entries) => {
      for (const entry of entries || []) {
        const file = entry?.file;
        if (!file) continue;
        const normPath = normalizeRelPath(entry.relPath || file.webkitRelativePath || file.name);
        if (!normPath) continue;
        const baseName = normPath.split("/").pop() || normPath;
        items.push({
          file,
          normPath,
          normPathLower: normPath.toLowerCase(),
          baseName,
          baseNameLower: baseName.toLowerCase(),
        });
      }
    };

    const resolve = (source) => {
      const normSrc = normalizeRelPath(source);
      if (!normSrc) return null;
      const normSrcLower = normSrc.toLowerCase();
      const baseSrc = normSrc.split("/").pop() || normSrc;
      const baseSrcLower = baseSrc.toLowerCase();

      return (
        items.find((it) => it.normPath === normSrc)?.file ||
        items.find((it) => it.normPath.endsWith("/" + normSrc))?.file ||
        items.find((it) => it.normPathLower === normSrcLower)?.file ||
        items.find((it) => it.normPathLower.endsWith("/" + normSrcLower))?.file ||
        items.find((it) => it.baseName === baseSrc)?.file ||
        items.find((it) => it.baseNameLower === baseSrcLower)?.file ||
        null
      );
    };

    addEntries(initialEntries);
    return { addEntries, resolve };
  }

  async function fetchMedia(source, kind, localRegistry, previewCache, inflightMap) {
    if (previewCache.has(source)) {
      return previewCache.get(source);
    }
    if (inflightMap.has(source)) {
      return inflightMap.get(source);
    }
    const promise = (async () => {
      let res;
      if (!isRemoteOrDataUrl(source)) {
        const file = localRegistry.resolve(source);
        res = file
          ? await readLocalFileAsMedia(file, kind)
          : { ok: false, error: t("img_err_local_unmatched") };
      } else {
        res = await API().fetchImageViaBackground(source, kind);
      }
      if (res?.ok) previewCache.set(source, res);
      return res;
    })();
    inflightMap.set(source, promise);
    try {
      return await promise;
    } finally {
      inflightMap.delete(source);
    }
  }

  function findEditorDom() {
    const el = document.querySelector(".public-DraftEditor-content");
    return el && el.getBoundingClientRect().width > 200 ? el : null;
  }

  async function ensureEditorOpen() {
    if (findEditorDom()) return true;
    if (!ARTICLES_URL_RE.test(location.href)) return false;

    // On /compose/articles list page, try clicking Create / Write button
    if (!EDIT_URL_RE.test(location.href)) {
      UI().showHud(t("opening_editor"), "work");
      const labels = ["create", "write", "new article", "创建", "撰写", "新建文章", "写文章"];
      const findCreateBtn = () => {
        for (const el of document.querySelectorAll("button, a[role='button'], [role='button']")) {
          const text = (el.textContent || el.getAttribute("aria-label") || "").toLowerCase().trim();
          if (text && labels.some((l) => text === l || text.includes(l))) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 20 && rect.height > 20) return el;
          }
        }
        return null;
      };

      let clicked = false;
      for (let i = 0; i < 20; i += 1) {
        const btn = findCreateBtn();
        if (btn) {
          btn.click();
          clicked = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!clicked) {
        throw new Error(t("create_not_found"));
      }
    }

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (findEditorDom()) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(t("need_editor_desc"));
  }

  async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIdx = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIdx < items.length) {
        const idx = nextIdx++;
        results[idx] = await worker(items[idx], idx);
      }
    });
    await Promise.all(runners);
    return results;
  }

  function runInMainWorld(payload, signal) {
    return new Promise(async (resolve, reject) => {
      let nonce;
      try {
        nonce = await ensureMainReady();
      } catch (err) {
        reject(err);
        return;
      }

      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        signal?.removeEventListener("abort", onAbort);
      };

      const onAbort = () => {
        window.postMessage({ source: "xmp", kind: "cancel", nonce }, "*");
        cleanup();
        reject(new DOMException("Upload stopped", "AbortError"));
      };

      const onMessage = (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.source !== "xmp-main" || msg.nonce !== nonce) return;
        if (msg.kind === "progress") {
          UI().showHud(t(msg.textKey, msg.vars), msg.level || "work", {
            onCancel: () => activeAbort?.abort(),
          });
        } else if (msg.kind === "done") {
          cleanup();
          resolve({ ok: true, summary: msg.summary });
        } else if (msg.kind === "error") {
          cleanup();
          reject(new Error(msg.error || "Unknown editor error"));
        }
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      window.addEventListener("message", onMessage);
      window.postMessage({ source: "xmp", kind: "run", nonce, payload }, "*");
    });
  }

  async function importMarkdownText(rawMarkdown, initialEntries = []) {
    if (isBusy) return { ok: false, error: "busy" };
    isBusy = true;
    activeAbort = new AbortController();
    const signal = activeAbort.signal;
    const startTime = performance.now();

    const setHud = (msg, level = "work") => {
      UI().showHud(msg, level, level === "work" ? { onCancel: () => activeAbort?.abort() } : {});
    };

    try {
      await ensureEditorOpen();
      const settings = await loadSettings();
      setHud(t("detected"), "work");

      const parsed = MD().parseMarkdown(rawMarkdown);
      let segments = parsed.segments || [];
      if (!segments.length && !parsed.title) {
        UI().hideHud();
        return { ok: true, skipped: true };
      }

      // Enforce X's 25-image body limit
      let mediaCount = 0;
      segments = segments.map((seg) => {
        const isVisual =
          seg.type === "image" ||
          seg.type === "video" ||
          (seg.type === "table" && settings.tableMode === "image");
        if (!isVisual) return seg;
        mediaCount += 1;
        if (mediaCount <= MD().MAX_BODY_IMAGES) return seg;
        const text =
          seg.type === "table"
            ? MD().tableToMarkdown(seg)
            : seg.type === "video"
            ? `[video](${seg.source})`
            : `![${seg.alt || ""}](${seg.source})`;
        return { type: "text", kind: "unstyled", text, inlineStyleRanges: [], links: [] };
      });
      const droppedCount = Math.max(0, mediaCount - MD().MAX_BODY_IMAGES);

      // Resolve any local relative image/video paths before cover selection and upload
      const localRegistry = createLocalFileRegistry(initialEntries);
      const localSourceSet = new Set();
      for (const seg of segments) {
        if ((seg.type === "image" || seg.type === "video") && seg.source && !isRemoteOrDataUrl(seg.source)) {
          localSourceSet.add(seg.source);
        }
      }
      if (parsed.coverFromFrontmatter && parsed.cover && !isRemoteOrDataUrl(parsed.cover)) {
        localSourceSet.add(parsed.cover);
      }
      const missingLocal = [...localSourceSet].filter((src) => !localRegistry.resolve(src));
      if (missingLocal.length > 0) {
        setHud(t("preparing"), "work");
        await UI().promptLocalAssets(missingLocal, (entries) => {
          localRegistry.addEntries(entries);
          const matchedSet = new Set(missingLocal.filter((s) => Boolean(localRegistry.resolve(s))));
          return { matched: matchedSet.size, total: missingLocal.length, matchedSet };
        });
        if (signal.aborted) throw new DOMException("Upload stopped", "AbortError");
      }

      const previewCache = new Map();
      const inflightMap = new Map();

      // Start cover selection prompt in parallel if needed
      let coverChoicePromise = null;
      const imageCandidates = segments.filter((s) => s.type === "image" && s.source);
      if (parsed.coverFromFrontmatter) {
        coverChoicePromise = Promise.resolve({ cover: parsed.cover, customData: null });
      } else if (settings.coverMode === "none") {
        coverChoicePromise = Promise.resolve({ cover: "", customData: null });
      } else if (settings.coverMode === "first") {
        coverChoicePromise = Promise.resolve({ cover: parsed.cover || "", customData: null });
      } else {
        coverChoicePromise = UI()
          .promptCoverChoice(
            imageCandidates,
            (url) => fetchMedia(url, "image", localRegistry, previewCache, inflightMap),
            {
              onAttachLocalEntries: (entries) => {
                localRegistry.addEntries(entries);
              },
            }
          )
          .then(async (choice) => {
            if (choice.remember) {
              if (!choice.cover) await saveCoverMode("none");
              else if (choice.cover === imageCandidates[0]?.source) await saveCoverMode("first");
            }
            return choice;
          });
      }

      // Upload body images & videos
      const imageSegments = segments.filter((s) => s.type === "image" || s.type === "video");
      const imageMap = new Map();

      if (imageSegments.length) {
        let done = 0;
        setHud(t("uploading_images", { done: 0, total: imageSegments.length }));
        await runWithConcurrency(imageSegments, 3, async (seg) => {
          if (signal.aborted) return;
          const fetched = await fetchMedia(seg.source, seg.type, localRegistry, previewCache, inflightMap);
          if (!fetched?.ok) {
            imageMap.set(seg, { ok: false, error: fetched?.error || t("img_err_fetch_failed") });
          } else {
            try {
              const uploaded = await API().uploadMedia(fetched, signal);
              imageMap.set(seg, uploaded);
            } catch (err) {
              if (err?.name === "AbortError") throw err;
              imageMap.set(seg, { ok: false, error: String(err?.message || err) });
            }
          }
          done += 1;
          setHud(t("uploading_images", { done, total: imageSegments.length }));
        });
      }

      if (signal.aborted) throw new DOMException("Upload stopped", "AbortError");

      // Render & upload image tables
      const tableSegments = settings.tableMode === "image" ? segments.filter((s) => s.type === "table") : [];
      const tableMap = new Map();
      if (tableSegments.length) {
        let done = 0;
        setHud(t("rendering_tables", { done: 0, total: tableSegments.length }));
        await runWithConcurrency(tableSegments, 2, async (seg, idx) => {
          if (signal.aborted) return;
          try {
            const png = await TABLE().renderTableToPng(seg, { fileName: `table-${idx + 1}.png` });
            const uploaded = await API().uploadMedia(png, signal);
            tableMap.set(seg, uploaded);
          } catch (err) {
            if (err?.name === "AbortError") throw err;
            tableMap.set(seg, { ok: false, error: String(err?.message || err) });
          }
          done += 1;
          setHud(t("rendering_tables", { done, total: tableSegments.length }));
        });
      }

      if (signal.aborted) throw new DOMException("Upload stopped", "AbortError");

      // Await cover selection
      setHud(t("waiting_cover"), "work");
      const coverChoice = await coverChoicePromise;
      if (signal.aborted) throw new DOMException("Upload stopped", "AbortError");

      // Retry any previously unmatched local body images if user attached a folder inside the cover modal
      const retrySegments = imageSegments.filter(
        (seg) => !imageMap.get(seg)?.ok && !isRemoteOrDataUrl(seg.source) && localRegistry.resolve(seg.source)
      );
      if (retrySegments.length) {
        let done = 0;
        setHud(t("uploading_images", { done: 0, total: retrySegments.length }));
        await runWithConcurrency(retrySegments, 3, async (seg) => {
          if (signal.aborted) return;
          const fetched = await fetchMedia(seg.source, seg.type, localRegistry, previewCache, inflightMap);
          if (fetched?.ok) {
            try {
              const uploaded = await API().uploadMedia(fetched, signal);
              imageMap.set(seg, uploaded);
            } catch (err) {
              if (err?.name === "AbortError") throw err;
              imageMap.set(seg, { ok: false, error: String(err?.message || err) });
            }
          }
          done += 1;
          setHud(t("uploading_images", { done, total: retrySegments.length }));
        });
        if (signal.aborted) throw new DOMException("Upload stopped", "AbortError");
      }

      let coverMediaId = "";
      let dedupeCoverSource = "";

      if (coverChoice?.customData) {
        setHud(t("uploading_cover"), "work");
        const uploadedCover = await API().uploadMedia(coverChoice.customData, signal);
        coverMediaId = uploadedCover.mediaId;
      } else if (coverChoice?.cover) {
        const matchedSeg = imageSegments.find((s) => s.type === "image" && s.source === coverChoice.cover);
        const existingUpload = matchedSeg ? imageMap.get(matchedSeg) : null;
        if (existingUpload?.ok) {
          coverMediaId = existingUpload.mediaId;
          dedupeCoverSource = coverChoice.cover;
        } else {
          setHud(t("uploading_cover"), "work");
          const fetched = await fetchMedia(coverChoice.cover, "image", localRegistry, previewCache, inflightMap);
          if (fetched?.ok) {
            const uploadedCover = await API().uploadMedia(fetched, signal);
            coverMediaId = uploadedCover.mediaId;
          }
        }
      }

      const sessionId = Math.random().toString(36).slice(2, 6);
      const pastePayload = MD().buildPastePayload(segments, {
        imageMap,
        tableMap,
        tableMode: settings.tableMode,
        sessionId,
        coverSource: dedupeCoverSource,
      });
      const contentStatePayload = MD().buildContentState(segments, {
        imageMap,
        tableMap,
        tableMode: settings.tableMode,
        coverSource: dedupeCoverSource,
      });

      const articleId = API().getArticleIdFromUrl();
      let serverSaved = false;
      let mediaEntities = [];

      if (articleId) {
        setHud(t("saving_to_x"), "work");
        const writeRes = await API().updateArticleContent(articleId, contentStatePayload.content_state, signal);
        serverSaved = Boolean(writeRes?.ok);
        if (serverSaved) {
          for (let i = 0; i < 6; i += 1) {
            mediaEntities = await API().fetchArticleMediaEntities(articleId, signal);
            if (mediaEntities.length && mediaEntities.some((m) => m?.media_key)) break;
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }

      const mainRes = await runInMainWorld(
        {
          ...pastePayload,
          title: parsed.title || "",
          coverMediaId,
          serverSaved,
          articleId,
          mediaEntities,
        },
        signal
      );

      const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
      const summary = mainRes?.summary || {};
      const imgFetchFail =
        [...imageMap.values()].filter((v) => !v?.ok).length +
        [...tableMap.values()].filter((v) => !v?.ok).length;
      const totalImgFail = (summary.imgFail || 0) + imgFetchFail;

      const notes = [];
      if (summary.atomicFail) notes.push(t("issue_atomics", { n: summary.atomicFail }));
      if (totalImgFail) notes.push(t("issue_images", { n: totalImgFail }));
      if (droppedCount) {
        notes.push(t("issue_dropped_images_platform", { n: droppedCount, max: MD().MAX_BODY_IMAGES }));
      }

      const finalMsg = notes.length
        ? `${t("done", { seconds: elapsedSec })} · ${notes.join("、")}`
        : t("done", { seconds: elapsedSec });
      UI().showHud(finalMsg, "done", { autoHideMs: 5000 });
      return { ok: true, summary };
    } catch (err) {
      if (err?.name === "AbortError") {
        UI().showHud(t("upload_cancelled"), "warn", { autoHideMs: 3000 });
        return { ok: false, cancelled: true };
      }
      const msg = String(err?.message || err).slice(0, 160);
      UI().showHud(t("failed", { msg }), "warn", { dismissible: true });
      return { ok: false, error: msg };
    } finally {
      isBusy = false;
      activeAbort = null;
    }
  }

  async function importMarkdownFile(file) {
    if (!file) return;
    const text = await file.text();
    return importMarkdownText(text);
  }

  // --- Drag & Drop Handlers ---
  function isInsideExtensionModal(e) {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    return path.some(
      (node) => node?.id === "__xmp_ui_local_assets_modal" || node?.id === "__xmp_ui_cover_modal"
    );
  }

  document.addEventListener(
    "dragenter",
    (e) => {
      if (isBusy || isInsideExtensionModal(e)) return;
      if (!ARTICLES_URL_RE.test(location.href) || !hasFilesTransfer(e.dataTransfer)) return;
      dragDepth += 1;
      if (dragDepth === 1) UI().showDragHint();
    },
    true
  );

  document.addEventListener(
    "dragleave",
    (e) => {
      if (isBusy || isInsideExtensionModal(e)) return;
      if (!ARTICLES_URL_RE.test(location.href) || !hasFilesTransfer(e.dataTransfer)) return;
      dragDepth -= 1;
      if (dragDepth <= 0) {
        dragDepth = 0;
        UI().hideDragHint();
      }
    },
    true
  );

  document.addEventListener(
    "dragover",
    (e) => {
      if (isBusy || isInsideExtensionModal(e)) return;
      if (!ARTICLES_URL_RE.test(location.href) || !hasFilesTransfer(e.dataTransfer)) return;
      e.preventDefault();
    },
    true
  );

  document.addEventListener(
    "drop",
    async (e) => {
      if (isBusy || isInsideExtensionModal(e)) return;
      if (!ARTICLES_URL_RE.test(location.href) || !hasFilesTransfer(e.dataTransfer)) return;
      const dt = e.dataTransfer;
      const files = Array.from(dt?.files || []);
      const hasMdFile = files.some(isMarkdownFile);
      const capturedEntries = [];
      for (const it of Array.from(dt?.items || [])) {
        if (it.kind !== "file") continue;
        const entry = it.webkitGetAsEntry?.();
        if (entry) capturedEntries.push(entry);
      }
      const hasDir = capturedEntries.some((entry) => Boolean(entry?.isDirectory));
      dragDepth = 0;
      UI().hideDragHint();
      if (!hasMdFile && !hasDir) return;
      e.preventDefault();
      e.stopPropagation();

      const entries = await UI().collectFilesFromDataTransfer(dt, capturedEntries);
      const mdEntries = entries.filter((item) => isMarkdownFile(item.file));
      if (!mdEntries.length) return;
      mdEntries.sort((a, b) => a.relPath.split("/").length - b.relPath.split("/").length);
      const text = await mdEntries[0].file.text();
      await importMarkdownText(text, entries);
    },
    true
  );

  window.addEventListener("blur", () => {
    dragDepth = 0;
    UI().hideDragHint();
  });

  // --- Paste Interception ---
  document.addEventListener(
    "paste",
    async (e) => {
      if (!ARTICLES_URL_RE.test(location.href) || isBusy) return;
      const editorEl = e.target?.closest?.(".public-DraftEditor-content");
      if (!editorEl || editorEl.getBoundingClientRect().width < 200) return;
      const plain = e.clipboardData?.getData("text/plain") || "";
      if (!MD().isMarkdown(plain)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      await importMarkdownText(plain);
    },
    { capture: true }
  );

  // --- Floating Button Lifecycle (SPA route tracking) ---
  function syncButtonVisibility() {
    if (ARTICLES_URL_RE.test(location.href)) {
      UI().mountImportButton((file) => importMarkdownFile(file));
    } else {
      UI().unmountImportButton();
    }
  }

  syncButtonVisibility();
  setInterval(syncButtonVisibility, 1200);

  // --- Popup Message Bridge ---
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "getStatus") {
      sendResponse({
        onArticlesPage: ARTICLES_URL_RE.test(location.href),
        hasEditor: Boolean(findEditorDom()),
        busy: isBusy,
      });
      return false;
    }
    if (msg?.type === "importMarkdownText" && typeof msg.text === "string") {
      importMarkdownText(msg.text)
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
      return true;
    }
    return false;
  });
})();
