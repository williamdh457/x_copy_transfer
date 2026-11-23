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

  // --- Cover Picker Modal ---
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  function promptCoverChoice(imageSegments, resolvePreview) {
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
          <input id="xmp-cover-file" type="file" accept="image/*" hidden>
          <div id="xmp-cover-drop" class="drop" role="button" tabindex="0">
            <p class="drop-title">${escapeHtml(t("cover_prompt_upload"))}</p>
            <p id="xmp-cover-drop-msg" class="muted">${escapeHtml(t("cover_prompt_drop"))}</p>
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

      const fileInput = shadow.getElementById("xmp-cover-file");
      const dropZone = shadow.getElementById("xmp-cover-drop");
      const dropMsg = shadow.getElementById("xmp-cover-drop-msg");
      const customRow = shadow.getElementById("xmp-cover-custom-row");
      const customImg = shadow.getElementById("xmp-cover-custom-img");
      const customName = shadow.getElementById("xmp-cover-custom-name");
      const customRadio = customRow.querySelector("input");

      let customData = null;

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

      dropZone.addEventListener("click", () => fileInput.click());
      dropZone.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInput.click();
        }
      });
      fileInput.addEventListener("change", () => {
        if (fileInput.files?.[0]) handleLocalFile(fileInput.files[0]);
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
        delete dropZone.dataset.over;
        if (e.dataTransfer?.files?.[0]) handleLocalFile(e.dataTransfer.files[0]);
      });

      const finish = (choice) => {
        const remember = Boolean(shadow.getElementById("xmp-cover-remember")?.checked);
        removeHost("cover_modal");
        resolve({ ...choice, remember });
      };

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

      // Load previews asynchronously
      candidates.forEach(async (seg, idx) => {
        const imgEl = shadow.querySelector(`[data-preview-idx="${idx}"]`);
        const emptyEl = shadow.querySelector(`[data-empty-idx="${idx}"]`);
        if (!imgEl) return;
        let src = /^data:image\//i.test(seg.source) ? seg.source : "";
        if (!src && typeof resolvePreview === "function") {
          const fetched = await resolvePreview(seg.source).catch(() => null);
          if (fetched?.ok) src = `data:${fetched.mime || "image/png"};base64,${fetched.base64}`;
        }
        if (!src) {
          if (emptyEl) emptyEl.textContent = t("cover_prompt_none_img");
          return;
        }
        imgEl.onload = () => {
          imgEl.hidden = false;
          if (emptyEl) emptyEl.hidden = true;
        };
        imgEl.onerror = () => {
          if (emptyEl) emptyEl.textContent = t("cover_prompt_none_img");
        };
        imgEl.src = src;
      });
    });
  }

  // --- Floating Import Button on X Articles ---
  function mountImportButton(onFileSelected) {
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
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain";
      input.style.display = "none";
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        input.remove();
        if (file) onFileSelected(file);
      });
      document.body.appendChild(input);
      input.click();
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
    promptCoverChoice,
    mountImportButton,
    unmountImportButton,
  };
})();
