(() => {
  const HOST_PREFIX = "__xmp_ui_";

  function t(key, vars) {
    return window.__XMP_I18N__ ? window.__XMP_I18N__.t(key, vars) : key;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const BASE_CSS = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      color: #0f1419;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .card {
      background: #ffffff;
      color: #0f1419;
      border: 1px solid #e1e8ed;
      border-radius: 14px;
      box-shadow: 0 8px 30px rgba(15, 20, 25, 0.14);
      padding: 14px 16px;
      font-size: 13px;
      line-height: 1.45;
    }
    .title { font-weight: 700; font-size: 14px; margin: 0 0 6px; }
    .muted { color: #536471; font-size: 12px; margin: 0; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid transparent;
      border-radius: 9999px;
      padding: 7px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease, opacity 0.15s ease;
    }
    .btn-primary { background: #0f1419; color: #ffffff; }
    .btn-primary:hover { background: #272c30; }
    .btn-ghost { background: #eff3f4; color: #0f1419; }
    .btn-ghost:hover { background: #e1e8ed; }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  `;

  function createShadowHost(id) {
    removeHost(id);
    const host = document.createElement("div");
    host.id = HOST_PREFIX + id;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = BASE_CSS;
    shadow.appendChild(style);
    document.documentElement.appendChild(host);
    return { host, shadow };
  }

  function removeHost(id) {
    const existing = document.getElementById(HOST_PREFIX + id);
    if (existing) existing.remove();
  }

  // --- Drag Hint ---
  function showDragHint() {
    if (document.getElementById(HOST_PREFIX + "drag_hint")) return;
    const { shadow } = createShadowHost("drag_hint");
    const extraStyle = document.createElement("style");
    extraStyle.textContent = `
      .hint-wrap {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483645;
        width: 248px;
        pointer-events: none;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
        font-size: 12px;
        color: #536471;
      }
      svg { width: 15px; height: 15px; flex: none; stroke: currentColor; fill: none; stroke-width: 2; }
    `;
    shadow.appendChild(extraStyle);

    const wrap = document.createElement("div");
    wrap.className = "hint-wrap";
    wrap.innerHTML = `
      <div class="card">
        <p class="title">${escapeHtml(t("drag_hint_title"))}</p>
        <div class="row">
          <svg viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
          <span>${escapeHtml(t("drag_hint_md"))}</span>
        </div>
        <div class="row">
          <svg viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
          <span>${escapeHtml(t("drag_hint_media"))}</span>
        </div>
      </div>
    `;
    shadow.appendChild(wrap);
  }

  function hideDragHint() {
    removeHost("drag_hint");
  }

  // --- Progress HUD ---
  let hudTimer = null;

  function showHud(text, level = "work", opts = {}) {
    if (hudTimer) {
      clearTimeout(hudTimer);
      hudTimer = null;
    }

    let host = document.getElementById(HOST_PREFIX + "hud");
    let shadow;
    if (!host) {
      ({ host, shadow } = createShadowHost("hud"));
      const extraStyle = document.createElement("style");
      extraStyle.textContent = `
        .hud-wrap {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 2147483646;
          max-width: 360px;
        }
        .hud {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 9999px;
          background: #0f1419;
          color: #ffffff;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
          font-size: 13px;
          font-weight: 500;
        }
        .hud.warn { background: #b45309; }
        .hud.done { background: #007a5a; }
        .spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex: none;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .msg { flex: 1; word-break: break-word; }
        .act {
          background: rgba(255,255,255,0.18);
          color: #ffffff;
          border: none;
          border-radius: 9999px;
          padding: 3px 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          flex: none;
        }
        .act:hover { background: rgba(255,255,255,0.28); }
      `;
      shadow.appendChild(extraStyle);
      const wrap = document.createElement("div");
      wrap.className = "hud-wrap";
      wrap.innerHTML = `<div class="hud"><span class="spinner"></span><span class="msg"></span><button class="act" hidden></button></div>`;
      shadow.appendChild(wrap);
    } else {
      shadow = host.shadowRoot;
    }

    const hudEl = shadow.querySelector(".hud");
    const spinEl = shadow.querySelector(".spinner");
    const msgEl = shadow.querySelector(".msg");
    const actEl = shadow.querySelector(".act");

    hudEl.className = `hud ${level === "done" ? "done" : level === "warn" ? "warn" : ""}`;
    spinEl.style.display = level === "work" ? "block" : "none";
    msgEl.textContent = text;

    if (opts.onCancel) {
      actEl.hidden = false;
      actEl.textContent = t("cancel");
      actEl.onclick = () => opts.onCancel();
    } else if (opts.dismissible) {
      actEl.hidden = false;
      actEl.textContent = t("dismiss");
      actEl.onclick = () => hideHud();
    } else {
      actEl.hidden = true;
      actEl.onclick = null;
    }

    if (opts.autoHideMs) {
      hudTimer = setTimeout(() => hideHud(), opts.autoHideMs);
    }
  }

  function hideHud() {
    if (hudTimer) {
      clearTimeout(hudTimer);
      hudTimer = null;
    }
    removeHost("hud");
  }

  // --- DataTransfer Recursive File Reader ---
  function readAllDirectoryEntries(dirEntry) {
    return new Promise((resolve) => {
      const reader = dirEntry.createReader();
      const all = [];
      const readNext = () => {
        reader.readEntries(
          (batch) => {
            if (!batch || !batch.length) {
              resolve(all);
              return;
            }
            all.push(...batch);
            readNext();
          },
          () => resolve(all)
        );
      };
      readNext();
    });
  }

  async function traverseEntry(entry, out) {
    if (!entry) return;
    if (entry.isFile) {
      await new Promise((resolve) => {
        entry.file(
          (file) => {
            const relPath = String(entry.fullPath || file.name || "").replace(/^\/+/, "");
            out.push({ file, relPath });
            resolve();
          },
          () => resolve()
        );
      });
      return;
    }
    if (entry.isDirectory) {
      const children = await readAllDirectoryEntries(entry);
      for (const child of children) {
        await traverseEntry(child, out);
      }
    }
  }

  async function collectFilesFromDataTransfer(dataTransfer, preCapturedEntries = null) {
    if (!dataTransfer && !preCapturedEntries?.length) return [];
    // Synchronously capture FileSystemEntry objects before any await
    const entries = Array.isArray(preCapturedEntries) ? preCapturedEntries : [];
    if (!entries.length && dataTransfer?.items) {
      for (const item of Array.from(dataTransfer.items)) {
        if (item.kind !== "file") continue;
        const entry = item.webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
    }
    if (entries.length) {
      const out = [];
      for (const entry of entries) {
        await traverseEntry(entry, out);
      }
      return out;
    }
    return Array.from(dataTransfer?.files || []).map((file) => ({
      file,
      relPath: file.webkitRelativePath || file.name,
    }));
  }

  function captureDirHandlesFromDataTransfer(dataTransfer) {
    const promises = [];
    for (const item of Array.from(dataTransfer?.items || [])) {
      if (item.kind !== "file") continue;
      if (typeof item.getAsFileSystemHandle === "function") {
        try {
          promises.push(item.getAsFileSystemHandle().catch(() => null));
        } catch {}
      }
    }
    return promises;
  }

  async function resolveDirHandles(promises) {
    if (!promises?.length) return [];
    const handles = await Promise.all(promises);
    return handles.filter((h) => h && h.kind === "directory");
  }

  // --- Light-DOM File Picker Helper (avoids Shadow DOM / display:none click blocks) ---
  function openFilePicker({ directory = false, multiple = false, accept = "", tracker = null } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      if (directory) {
        input.webkitdirectory = true;
        input.setAttribute("webkitdirectory", "");
        input.setAttribute("directory", "");
      }
      if (multiple || directory) {
        input.multiple = true;
      }
      if (accept) {
        input.accept = accept;
      }
      input.style.cssText =
        "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";

      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        input.removeEventListener("change", onChange);
        input.removeEventListener("cancel", onCancel);
        input.remove();
      };
      const onChange = () => {
        const files = Array.from(input.files || []);
        cleanup();
        resolve(files);
      };
      const onCancel = () => {
        cleanup();
        resolve([]);
      };

      if (Array.isArray(tracker)) {
        tracker.push(() => {
          cleanup();
          resolve([]);
        });
      }

      input.addEventListener("change", onChange);
      input.addEventListener("cancel", onCancel);
      (document.body || document.documentElement).appendChild(input);

      try {
        if (typeof input.showPicker === "function") {
          input.showPicker();
        } else {
          input.click();
        }
      } catch {
        input.click();
      }
    });
  }

  // --- Local Assets Picker Modal ---
  function promptLocalAssets(missingSources, callbacks = {}) {
    return new Promise((resolve) => {
      const sources = Array.from(missingSources || []);
      const reconnectable = Array.isArray(callbacks?.reconnectableHandles) ? callbacks.reconnectableHandles : [];
      const { shadow } = createShadowHost("local_assets_modal");
      const extraStyle = document.createElement("style");
      extraStyle.textContent = `
        .backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          background: rgba(15, 20, 25, 0.52);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .modal {
          width: 100%;
          max-width: 480px;
          max-height: 86vh;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 18px 20px;
        }
        .reconnect-bar {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .reconnect-btn {
          width: 100%;
          justify-content: center;
        }
        .drop {
          border: 1.5px dashed #cfd9de;
          border-radius: 12px;
          padding: 16px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .drop:hover, .drop[data-over="true"] {
          border-color: #1d9bf0;
          background: rgba(29, 155, 240, 0.06);
        }
        .drop-title { font-weight: 600; font-size: 13px; margin: 0 0 4px; }
        .sub-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .status {
          font-size: 12px;
          font-weight: 600;
          color: #536471;
        }
        .status.ok { color: #007a5a; }
        .feedback {
          font-size: 12px;
          line-height: 1.4;
          padding: 8px 10px;
          border-radius: 8px;
          background: #fefce8;
          border: 1px solid #fde047;
          color: #854d0e;
        }
        .local-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 200px;
          overflow-y: auto;
        }
        .local-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border: 1px solid #e1e8ed;
          border-radius: 8px;
          font-size: 12px;
          cursor: default;
        }
        .badge {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          flex: none;
          background: #eff3f4;
          color: #536471;
        }
        .local-thumb {
          width: 36px;
          height: 24px;
          border-radius: 4px;
          background: #eff3f4;
          overflow: hidden;
          display: none;
          align-items: center;
          justify-content: center;
          flex: none;
        }
        .local-thumb.has-img { display: inline-flex; }
        .local-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .local-item.matched {
          border-color: #bbf7d0;
          background: #f0fdf4;
        }
        .local-item.matched .badge {
          background: #007a5a;
          color: #ffffff;
        }
        .path {
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #0f1419;
        }
        .footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 4px;
        }
      `;
      shadow.appendChild(extraStyle);

      const backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      backdrop.innerHTML = `
        <div class="card modal" role="dialog" aria-modal="true">
          <div>
            <h3 class="title">${escapeHtml(t("local_assets_title"))}</h3>
            <p class="muted">${escapeHtml(t("local_assets_desc", { n: sources.length }))}</p>
          </div>
          ${
            reconnectable.length
              ? `<div class="reconnect-bar">
                  ${reconnectable
                    .slice(0, 2)
                    .map(
                      (item, idx) =>
                        `<button class="btn btn-primary reconnect-btn" data-reconnect-idx="${idx}" type="button">${escapeHtml(
                          t("local_assets_reconnect", { name: item.name || "Folder" })
                        )}</button>`
                    )
                    .join("")}
                </div>`
              : ""
          }
          <div id="xmp-local-drop" class="drop" role="button" tabindex="0">
            <p class="drop-title">${escapeHtml(t("local_assets_drop_title"))}</p>
            <p class="muted">${escapeHtml(t("local_assets_drop_sub"))}</p>
          </div>
          <div class="sub-actions">
            <span id="xmp-local-status" class="status">${escapeHtml(t("local_assets_matched", { matched: 0, total: sources.length }))}</span>
          </div>
          <div id="xmp-local-feedback" class="feedback" hidden></div>
          <div class="local-list">
            ${sources
              .map(
                (src, idx) => `
              <div class="local-item" data-src-idx="${idx}">
                <span class="badge">○</span>
                <span class="local-thumb" data-thumb-idx="${idx}"></span>
                <span class="path" title="${escapeHtml(src)}">${escapeHtml(src)}</span>
              </div>
            `
              )
              .join("")}
          </div>
          <div class="footer">
            <button id="xmp-local-skip" class="btn btn-ghost" type="button">${escapeHtml(t("local_assets_skip"))}</button>
            <button id="xmp-local-continue" class="btn btn-primary" type="button" disabled>${escapeHtml(t("local_assets_continue"))}</button>
          </div>
        </div>
      `;
      shadow.appendChild(backdrop);

      const modalEl = shadow.querySelector(".modal");
      const dropZone = shadow.getElementById("xmp-local-drop");
      const statusEl = shadow.getElementById("xmp-local-status");
      const feedbackEl = shadow.getElementById("xmp-local-feedback");
      const continueBtn = shadow.getElementById("xmp-local-continue");

      let resolved = false;
      let autoTimer = null;
      const pendingPickers = [];
      const objectUrls = [];

      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        if (autoTimer) {
          clearTimeout(autoTimer);
          autoTimer = null;
        }
        for (const cancelPicker of pendingPickers) {
          try {
            cancelPicker();
          } catch {}
        }
        for (const url of objectUrls) {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }
        removeHost("local_assets_modal");
        resolve(result);
      };

      const updateMatchUi = (res, submittedCount = 0) => {
        const matched = Number(res?.matched) || 0;
        const total = Number(res?.total) || sources.length;
        const matchedSet = res?.matchedSet || new Set();
        const matchedFiles = res?.matchedFiles || new Map();

        statusEl.textContent = t("local_assets_matched", { matched, total });
        statusEl.className = matched > 0 && matched === total ? "status ok" : "status";
        continueBtn.disabled = matched === 0;

        if (matched > 0) {
          feedbackEl.hidden = true;
          feedbackEl.textContent = "";
        } else if (submittedCount > 0) {
          feedbackEl.hidden = false;
          feedbackEl.textContent = t("local_assets_no_match_hint", { count: submittedCount });
        }

        sources.forEach((src, idx) => {
          const itemEl = shadow.querySelector(`[data-src-idx="${idx}"]`);
          if (!itemEl) return;
          const ok = matchedSet.has(src);
          itemEl.classList.toggle("matched", ok);
          const badge = itemEl.querySelector(".badge");
          if (badge) badge.textContent = ok ? "✓" : "○";

          const thumbEl = itemEl.querySelector(`[data-thumb-idx="${idx}"]`);
          const file = matchedFiles.get(src);
          if (
            thumbEl &&
            ok &&
            file &&
            !thumbEl.dataset.bound &&
            (/^image\//i.test(file.type || "") || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name || ""))
          ) {
            const url = URL.createObjectURL(file);
            objectUrls.push(url);
            thumbEl.dataset.bound = "1";
            thumbEl.classList.add("has-img");
            const img = document.createElement("img");
            img.src = url;
            img.alt = "";
            thumbEl.appendChild(img);
          }
        });

        if (total > 0 && matched === total) {
          if (autoTimer) clearTimeout(autoTimer);
          autoTimer = setTimeout(() => finish({ skipped: false }), 500);
        }
      };

      const applyEntries = (entries) => {
        if (!entries?.length || typeof callbacks?.onEntriesAdded !== "function") return;
        const res = callbacks.onEntriesAdded(entries) || {};
        updateMatchUi(res, entries.length);
      };

      const fallbackFolderPicker = async () => {
        const files = await openFilePicker({ directory: true, multiple: true, tracker: pendingPickers });
        if (!files.length) return;
        applyEntries(
          files.map((file) => ({
            file,
            relPath: file.webkitRelativePath || file.name,
          }))
        );
      };

      const handleAuthorizeFolder = async () => {
        if (typeof callbacks?.onAuthorizeFolder === "function") {
          const prevStatus = statusEl.textContent;
          statusEl.textContent = t("local_assets_scanning");
          const res = await callbacks.onAuthorizeFolder();
          if (res?.cancelled) {
            statusEl.textContent = prevStatus;
            return;
          }
          if (res?.securityError) {
            statusEl.textContent = prevStatus;
            feedbackEl.hidden = false;
            feedbackEl.textContent = t("local_assets_security_hint");
            return;
          }
          if (res?.fallbackPicker) {
            statusEl.textContent = prevStatus;
            await fallbackFolderPicker();
            return;
          }
          updateMatchUi(res, res?.scannedCount ?? 1);
          return;
        }
        await fallbackFolderPicker();
      };

      modalEl.addEventListener("click", (e) => e.stopPropagation());

      shadow.querySelectorAll("[data-reconnect-idx]").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const idx = Number(btn.getAttribute("data-reconnect-idx"));
          const item = reconnectable[idx];
          if (!item || typeof callbacks?.onReconnectHandle !== "function") return;
          const prevStatus = statusEl.textContent;
          statusEl.textContent = t("local_assets_scanning");
          const res = await callbacks.onReconnectHandle(item);
          if (!res?.denied) {
            updateMatchUi(res, res?.scannedCount ?? 1);
          } else {
            statusEl.textContent = prevStatus;
          }
        });
      });

      dropZone.addEventListener("click", (e) => {
        e.stopPropagation();
        handleAuthorizeFolder();
      });
      dropZone.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleAuthorizeFolder();
        }
      });

      backdrop.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.dataset.over = "true";
      });
      backdrop.addEventListener("dragleave", (e) => {
        if (e.target === backdrop) {
          delete dropZone.dataset.over;
        }
      });
      backdrop.addEventListener("drop", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        delete dropZone.dataset.over;
        const handlePromises = captureDirHandlesFromDataTransfer(e.dataTransfer);
        const list = await collectFilesFromDataTransfer(e.dataTransfer);
        applyEntries(list);
        const dirHandles = await resolveDirHandles(handlePromises);
        if (dirHandles.length && typeof callbacks?.onDirHandlesDropped === "function") {
          callbacks.onDirHandlesDropped(dirHandles);
        }
      });

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) finish({ skipped: true });
      });
      shadow.getElementById("xmp-local-skip").addEventListener("click", () => {
        finish({ skipped: true });
      });
      shadow.getElementById("xmp-local-continue").addEventListener("click", () => {
        finish({ skipped: false });
      });
    });
  }

  // --- Cover Picker Modal ---
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  function promptCoverChoice(imageSegments, resolvePreview, opts = {}) {
    return new Promise((resolve) => {
      const { shadow } = createShadowHost("cover_modal");
      const extraStyle = document.createElement("style");
      extraStyle.textContent = `
        .backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          background: rgba(15, 20, 25, 0.52);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .modal {
          width: 100%;
          max-width: 460px;
          max-height: 86vh;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 18px 20px;
        }
        .drop {
          border: 1.5px dashed #cfd9de;
          border-radius: 12px;
          padding: 16px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .drop:hover, .drop[data-over="true"] {
          border-color: #1d9bf0;
          background: rgba(29, 155, 240, 0.06);
        }
        .drop-title { font-weight: 600; font-size: 13px; margin: 0 0 4px; }
        .local-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 12px;
          border-radius: 10px;
          background: #fefce8;
          border: 1px solid #fde047;
          font-size: 12px;
          color: #854d0e;
        }
        .local-bar[data-over="true"] {
          border-color: #1d9bf0;
          background: rgba(29, 155, 240, 0.08);
        }
        .local-bar span { flex: 1; }
        .choices {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 250px;
          overflow-y: auto;
        }
        .choice {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border: 1px solid #e1e8ed;
          border-radius: 10px;
          cursor: pointer;
        }
        .choice:has(input:checked) {
          border-color: #1d9bf0;
          background: rgba(29, 155, 240, 0.05);
        }
        .thumb {
          width: 56px;
          height: 36px;
          border-radius: 6px;
          background: #eff3f4;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          flex: none;
          font-size: 10px;
          color: #536471;
        }
        .thumb img { width: 100%; height: 100%; object-fit: cover; }
        .meta { flex: 1; min-width: 0; }
        .name {
          display: block;
          font-weight: 600;
          font-size: 12.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .src {
          display: block;
          font-size: 11px;
          color: #536471;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .remember {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #536471;
          cursor: pointer;
        }
        .footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 4px;
        }
      `;
      shadow.appendChild(extraStyle);

      const candidates = (imageSegments || []).slice(0, 12);
      const backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      backdrop.innerHTML = `
        <div class="card modal" role="dialog" aria-modal="true">
          <div>
            <h3 class="title">${escapeHtml(t("cover_prompt_title"))}</h3>
            <p class="muted">${escapeHtml(t("cover_prompt_desc"))}</p>
          </div>
          <div id="xmp-cover-drop" class="drop" role="button" tabindex="0">
            <p class="drop-title">${escapeHtml(t("cover_prompt_upload"))}</p>
            <p id="xmp-cover-drop-msg" class="muted">${escapeHtml(t("cover_prompt_drop"))}</p>
          </div>
          <div id="xmp-cover-local-bar" class="local-bar" hidden>
            <span>${escapeHtml(t("cover_attach_local_hint"))}</span>
            <button id="xmp-cover-local-btn" class="btn btn-primary btn-sm" type="button">${escapeHtml(t("cover_attach_local_btn"))}</button>
          </div>
          <div class="choices">
            <label id="xmp-cover-custom-row" class="choice" hidden>
              <input type="radio" name="xmp-cover" value="">
              <span class="thumb"><img id="xmp-cover-custom-img" alt=""></span>
              <span class="meta">
                <span id="xmp-cover-custom-name" class="name">${escapeHtml(t("cover_prompt_custom"))}</span>
                <span class="src">${escapeHtml(t("cover_prompt_custom_hint"))}</span>
              </span>
            </label>
            ${candidates
              .map(
                (seg, idx) => `
              <label class="choice">
                <input type="radio" name="xmp-cover" value="${escapeHtml(seg.source)}" ${idx === 0 ? "checked" : ""}>
                <span class="thumb">
                  <img data-preview-idx="${idx}" alt="" hidden>
                  <span data-empty-idx="${idx}">...</span>
                </span>
                <span class="meta">
                  <span class="name">${escapeHtml(seg.alt || `Image ${idx + 1}`)}</span>
                  <span class="src">${escapeHtml(seg.source)}</span>
                </span>
              </label>
            `
              )
              .join("")}
          </div>
          <label class="remember">
            <input id="xmp-cover-remember" type="checkbox">
            <span>${escapeHtml(t("cover_prompt_remember"))}</span>
          </label>
          <div class="footer">
            <button id="xmp-cover-skip" class="btn btn-ghost" type="button">${escapeHtml(t("cover_prompt_skip"))}</button>
            <button id="xmp-cover-use" class="btn btn-primary" type="button">${escapeHtml(t("cover_prompt_use"))}</button>
          </div>
        </div>
      `;
      shadow.appendChild(backdrop);

      const modalEl = shadow.querySelector(".modal");
      const localBar = shadow.getElementById("xmp-cover-local-bar");
      const localBarBtn = shadow.getElementById("xmp-cover-local-btn");
      const dropZone = shadow.getElementById("xmp-cover-drop");
      const dropMsg = shadow.getElementById("xmp-cover-drop-msg");
      const customRow = shadow.getElementById("xmp-cover-custom-row");
      const customImg = shadow.getElementById("xmp-cover-custom-img");
      const customName = shadow.getElementById("xmp-cover-custom-name");
      const customRadio = customRow.querySelector("input");

      let customData = null;
      const loadedSet = new Set();
      const pendingPickers = [];

      const handleLocalFile = async (file) => {
        if (!file || !file.type.startsWith("image/")) return;
        const dataUrl = await readFileAsDataUrl(file);
        const base64 = dataUrl.split(",")[1] || "";
        customData = { mime: file.type || "image/png", base64, fileName: file.name || "cover.png" };
        customRadio.value = "__CUSTOM_FILE__";
        customRadio.checked = true;
        customImg.src = dataUrl;
        customName.textContent = file.name || t("cover_prompt_custom");
        customRow.hidden = false;
        dropMsg.textContent = t("cover_prompt_custom_ready", { name: file.name || "cover" });
      };

      const pickCoverFile = async () => {
        const files = await openFilePicker({
          multiple: false,
          accept: "image/*",
          tracker: pendingPickers,
        });
        if (files?.[0]) handleLocalFile(files[0]);
      };

      modalEl.addEventListener("click", (e) => e.stopPropagation());

      dropZone.addEventListener("click", (e) => {
        e.stopPropagation();
        pickCoverFile();
      });
      dropZone.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pickCoverFile();
        }
      });
      dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.dataset.over = "true";
      });
      dropZone.addEventListener("dragleave", () => {
        delete dropZone.dataset.over;
      });
      dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        delete dropZone.dataset.over;
        if (e.dataTransfer?.files?.[0]) handleLocalFile(e.dataTransfer.files[0]);
      });

      const finish = (choice) => {
        const remember = Boolean(shadow.getElementById("xmp-cover-remember")?.checked);
        for (const cancelPicker of pendingPickers) {
          try {
            cancelPicker();
          } catch {}
        }
        removeHost("cover_modal");
        resolve({ ...choice, remember });
      };

      backdrop.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      backdrop.addEventListener("drop", (e) => {
        e.preventDefault();
      });

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) finish({ cover: "", customData: null });
      });
      shadow.getElementById("xmp-cover-skip").addEventListener("click", () => {
        finish({ cover: "", customData: null });
      });
      shadow.getElementById("xmp-cover-use").addEventListener("click", () => {
        const checked = shadow.querySelector('input[name="xmp-cover"]:checked')?.value || "";
        if (checked === "__CUSTOM_FILE__" && customData) {
          finish({ cover: "__CUSTOM_FILE__", customData });
        } else {
          finish({ cover: checked || candidates[0]?.source || "", customData: null });
        }
      });

      const syncLocalBarVisibility = () => {
        if (typeof opts.onAttachLocalEntries !== "function") {
          localBar.hidden = true;
          return;
        }
        const hasMissingLocal = candidates.some(
          (seg, idx) => !loadedSet.has(idx) && !/^(?:https?:\/\/|data:)/i.test(String(seg.source || "").trim())
        );
        localBar.hidden = !hasMissingLocal;
      };

      const loadCandidatePreview = async (seg, idx) => {
        if (loadedSet.has(idx)) return;
        const imgEl = shadow.querySelector(`[data-preview-idx="${idx}"]`);
        const emptyEl = shadow.querySelector(`[data-empty-idx="${idx}"]`);
        if (!imgEl) return;
        let src = /^data:image\//i.test(seg.source) ? seg.source : "";
        if (!src && typeof resolvePreview === "function") {
          const fetched = await resolvePreview(seg.source).catch(() => null);
          if (fetched?.ok && fetched.base64) {
            const safeMime = /^image\//i.test(String(fetched.mime || "")) ? fetched.mime : "image/png";
            src = `data:${safeMime};base64,${fetched.base64}`;
          }
        }
        if (!src) {
          if (emptyEl) emptyEl.textContent = t("cover_prompt_none_img");
          syncLocalBarVisibility();
          return;
        }
        imgEl.onload = () => {
          loadedSet.add(idx);
          imgEl.hidden = false;
          if (emptyEl) emptyEl.hidden = true;
          syncLocalBarVisibility();
        };
        imgEl.onerror = () => {
          if (emptyEl) emptyEl.textContent = t("cover_prompt_none_img");
          syncLocalBarVisibility();
        };
        imgEl.src = src;
      };

      const attachEntriesInCoverModal = async (entries) => {
        if (!entries?.length || typeof opts.onAttachLocalEntries !== "function") return;
        opts.onAttachLocalEntries(entries);
        await Promise.all(candidates.map((seg, idx) => loadCandidatePreview(seg, idx)));
      };

      if (typeof opts.onAttachLocalEntries === "function") {
        localBarBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const files = await openFilePicker({ directory: true, multiple: true, tracker: pendingPickers });
          if (!files.length) return;
          attachEntriesInCoverModal(
            files.map((file) => ({
              file,
              relPath: file.webkitRelativePath || file.name,
            }))
          );
        });
        localBar.addEventListener("dragover", (e) => {
          e.preventDefault();
          localBar.dataset.over = "true";
        });
        localBar.addEventListener("dragleave", () => {
          delete localBar.dataset.over;
        });
        localBar.addEventListener("drop", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          delete localBar.dataset.over;
          const list = await collectFilesFromDataTransfer(e.dataTransfer);
          attachEntriesInCoverModal(list);
        });
      }

      // Load previews asynchronously
      candidates.forEach((seg, idx) => {
        loadCandidatePreview(seg, idx);
      });
    });
  }

  // --- Multi-Markdown Article Picker Modal ---
  function promptMarkdownChoice(items = []) {
    return new Promise((resolve) => {
      const list = Array.from(items || []);
      const { shadow } = createShadowHost("md_picker_modal");
      const extraStyle = document.createElement("style");
      extraStyle.textContent = `
        .backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          background: rgba(15, 20, 25, 0.52);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .modal {
          width: 100%;
          max-width: 480px;
          max-height: 86vh;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 20px;
        }
        .md-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 320px;
          overflow-y: auto;
        }
        .md-item {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          width: 100%;
          text-align: left;
          padding: 10px 12px;
          border: 1px solid #e1e8ed;
          border-radius: 10px;
          background: #ffffff;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .md-item:hover {
          border-color: #1d9bf0;
          background: rgba(29, 155, 240, 0.05);
        }
        .md-name {
          font-size: 13px;
          font-weight: 700;
          color: #0f1419;
          word-break: break-all;
        }
        .md-dir {
          font-size: 11.5px;
          color: #536471;
          word-break: break-all;
        }
        .footer {
          display: flex;
          justify-content: flex-end;
        }
      `;
      shadow.appendChild(extraStyle);

      const backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      backdrop.innerHTML = `
        <div class="card modal" role="dialog" aria-modal="true">
          <div>
            <h3 class="title">${escapeHtml(t("md_picker_title"))}</h3>
            <p class="muted">${escapeHtml(t("md_picker_desc", { n: list.length }))}</p>
          </div>
          <div class="md-list">
            ${list
              .map(
                (item, idx) => `
              <button class="md-item" data-md-idx="${idx}" type="button">
                <span class="md-name">${escapeHtml(item.name || item.relPath || `Article ${idx + 1}`)}</span>
                <span class="md-dir">${escapeHtml(item.dirPrefix || "/")}</span>
              </button>
            `
              )
              .join("")}
          </div>
          <div class="footer">
            <button id="xmp-md-cancel" class="btn btn-ghost btn-sm" type="button">${escapeHtml(t("cancel"))}</button>
          </div>
        </div>
      `;
      shadow.appendChild(backdrop);

      const modalEl = shadow.querySelector(".modal");
      let settled = false;
      const finish = (idx) => {
        if (settled) return;
        settled = true;
        removeHost("md_picker_modal");
        resolve(idx);
      };

      modalEl.addEventListener("click", (e) => e.stopPropagation());
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) finish(null);
      });
      shadow.getElementById("xmp-md-cancel").addEventListener("click", () => finish(null));

      shadow.querySelectorAll("[data-md-idx]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = Number(btn.getAttribute("data-md-idx"));
          finish(Number.isInteger(idx) ? idx : null);
        });
      });
    });
  }

  // --- Quick Import Modal (launched from Popup or Floating Button) ---
  function promptQuickImport({ savedHandles = [], onOpenSavedHandle, onPickMdFile, onPickFolder, onDropEntries } = {}) {
    const { shadow } = createShadowHost("quick_import_modal");
    const extraStyle = document.createElement("style");
    extraStyle.textContent = `
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        background: rgba(15, 20, 25, 0.52);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .modal {
        width: 100%;
        max-width: 440px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 20px;
      }
      .drop {
        border: 1.5px dashed #cfd9de;
        border-radius: 12px;
        padding: 18px;
        text-align: center;
        transition: border-color 0.15s, background 0.15s;
      }
      .drop[data-over="true"] {
        border-color: #1d9bf0;
        background: rgba(29, 155, 240, 0.06);
      }
      .actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .full-btn {
        width: 100%;
        justify-content: center;
        padding: 10px 14px;
      }
      .footer {
        display: flex;
        justify-content: flex-end;
      }
    `;
    shadow.appendChild(extraStyle);

    const saved = Array.isArray(savedHandles) ? savedHandles.slice(0, 3) : [];
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.innerHTML = `
      <div class="card modal" role="dialog" aria-modal="true">
        <div>
          <h3 class="title">${escapeHtml(t("quick_import_title"))}</h3>
          <p class="muted">${escapeHtml(t("quick_import_desc"))}</p>
        </div>
        <div id="xmp-qi-drop" class="drop">
          <p class="muted">${escapeHtml(t("drag_hint_md"))}</p>
        </div>
        <div class="actions">
          ${saved
            .map(
              (item, idx) =>
                `<button class="btn btn-primary full-btn" data-qi-saved="${idx}" type="button">${escapeHtml(
                  t("quick_import_saved_folder", { name: item.name || "Folder" })
                )}</button>`
            )
            .join("")}
          <button id="xmp-qi-folder" class="btn ${saved.length ? "btn-ghost" : "btn-primary"} full-btn" type="button">${escapeHtml(
      t("quick_import_pick_folder")
    )}</button>
          <button id="xmp-qi-md" class="btn btn-ghost full-btn" type="button">${escapeHtml(t("quick_import_pick_md"))}</button>
        </div>
        <div class="footer">
          <button id="xmp-qi-cancel" class="btn btn-ghost btn-sm" type="button">${escapeHtml(t("cancel"))}</button>
        </div>
      </div>
    `;
    shadow.appendChild(backdrop);

    const modalEl = shadow.querySelector(".modal");
    const dropZone = shadow.getElementById("xmp-qi-drop");
    const pendingPickers = [];

    const close = () => {
      for (const cancelPicker of pendingPickers) {
        try {
          cancelPicker();
        } catch {}
      }
      removeHost("quick_import_modal");
    };

    modalEl.addEventListener("click", (e) => e.stopPropagation());
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    shadow.getElementById("xmp-qi-cancel").addEventListener("click", close);

    shadow.querySelectorAll("[data-qi-saved]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute("data-qi-saved"));
        const item = saved[idx];
        close();
        if (item && typeof onOpenSavedHandle === "function") {
          onOpenSavedHandle(item);
        }
      });
    });

    shadow.getElementById("xmp-qi-folder").addEventListener("click", async (e) => {
      e.stopPropagation();
      close();
      if (typeof onPickFolder === "function") {
        const res = await onPickFolder();
        if (res?.fallbackPicker) {
          const files = await openFilePicker({ directory: true, multiple: true });
          if (files.length && typeof onDropEntries === "function") {
            onDropEntries(files.map((file) => ({ file, relPath: file.webkitRelativePath || file.name })));
          }
        }
      }
    });

    shadow.getElementById("xmp-qi-md").addEventListener("click", async (e) => {
      e.stopPropagation();
      close();
      const files = await openFilePicker({
        multiple: false,
        accept: ".md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain",
      });
      if (files?.[0] && typeof onPickMdFile === "function") {
        onPickMdFile(files[0]);
      }
    });

    backdrop.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.dataset.over = "true";
    });
    backdrop.addEventListener("dragleave", (e) => {
      if (e.target === backdrop) delete dropZone.dataset.over;
    });
    backdrop.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      delete dropZone.dataset.over;
      const handlePromises = captureDirHandlesFromDataTransfer(e.dataTransfer);
      const list = await collectFilesFromDataTransfer(e.dataTransfer);
      const dirHandles = await resolveDirHandles(handlePromises);
      close();
      if (list.length && typeof onDropEntries === "function") {
        onDropEntries(list, dirHandles);
      }
    });
  }

  // --- Floating Import Button on X Articles ---
  function mountImportButton(onClickImport) {
    const id = HOST_PREFIX + "import_btn";
    if (document.getElementById(id)) return;
    const host = document.createElement("div");
    host.id = id;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      ${BASE_CSS}
      .fab {
        position: fixed;
        right: 20px;
        bottom: 72px;
        z-index: 2147483644;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 9px 14px;
        border-radius: 9999px;
        background: #ffffff;
        color: #0f1419;
        border: 1px solid #cfd9de;
        box-shadow: 0 4px 14px rgba(15, 20, 25, 0.12);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.12s ease, box-shadow 0.12s ease;
      }
      .fab:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(15, 20, 25, 0.16);
        background: #f7f9f9;
      }
      svg { width: 16px; height: 16px; fill: currentColor; }
    `;
    shadow.appendChild(style);

    const btn = document.createElement("button");
    btn.className = "fab";
    btn.type = "button";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM11 11h2v4.586l1.793-1.793 1.414 1.414L12 19.414l-4.207-4.207 1.414-1.414L11 15.586V11z"/></svg>
      <span>${escapeHtml(t("import_btn_label"))}</span>
    `;
    btn.addEventListener("click", () => {
      if (typeof onClickImport === "function") {
        onClickImport();
      }
    });
    shadow.appendChild(btn);
    document.documentElement.appendChild(host);
  }

  function unmountImportButton() {
    removeHost("import_btn");
  }

  window.__XMP_UI__ = {
    showDragHint,
    hideDragHint,
    showHud,
    hideHud,
    collectFilesFromDataTransfer,
    captureDirHandlesFromDataTransfer,
    promptLocalAssets,
    promptMarkdownChoice,
    promptQuickImport,
    promptCoverChoice,
    mountImportButton,
    unmountImportButton,
  };
})();
