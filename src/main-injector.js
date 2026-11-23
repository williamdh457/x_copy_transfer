(() => {
  const SOURCE = "xmp-main";
  const SOURCE_IN = "xmp";
  const NONCE =
    globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const DEFAULT_BEARER =
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const FALLBACK_OPS = {
    ArticleEntityUpdateContent: "P5Nc3DYs9D4XqVthNrig8w",
    ArticleEntityUpdateTitle: "z_xdvTUbZjSVjt232b4D4A",
    ArticleEntityUpdateCoverMedia: "BXQicEDA0v2F5SmsjObjDQ",
  };
  const GQL_FEATURES = {
    profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_profile_redirect_enabled: false,
    rweb_tipjar_consumption_enabled: false,
    verified_phone_label_enabled: false,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
  };

  let cancelled = false;
  let sniffedBearer = "";
  const sniffedOps = Object.create(null);
  let authTimer = null;
  const saveListeners = new Set();

  function post(kind, data = {}) {
    window.postMessage({ source: SOURCE, kind, nonce: NONCE, ...data }, "*");
  }

  function postProgress(textKey, vars = null, level = "work") {
    post("progress", { textKey, vars: vars || undefined, level });
  }

  function checkAborted() {
    if (cancelled) throw new DOMException("Upload stopped", "AbortError");
  }

  function scheduleAuthBroadcast() {
    if (authTimer !== null) return;
    authTimer = setTimeout(() => {
      authTimer = null;
      window.postMessage(
        { source: SOURCE, kind: "auth", bearer: sniffedBearer, ops: { ...sniffedOps } },
        "*"
      );
    }, 300);
  }

  function extractBearer(val) {
    const m = String(val || "").match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : "";
  }

  function recordBearer(token) {
    if (!token || token === sniffedBearer) return;
    sniffedBearer = token;
    scheduleAuthBroadcast();
  }

  function inspectHeaders(headers) {
    if (!headers) return;
    try {
      if (headers instanceof Headers) {
        recordBearer(extractBearer(headers.get("authorization")));
        return;
      }
      if (Array.isArray(headers)) {
        for (const [k, v] of headers) {
          if (/^authorization$/i.test(k)) {
            recordBearer(extractBearer(v));
            return;
          }
        }
        return;
      }
      for (const k of Object.keys(headers)) {
        if (/^authorization$/i.test(k)) {
          recordBearer(extractBearer(headers[k]));
        }
      }
    } catch {
      // ignore header inspection errors
    }
  }

  const GQL_URL_RE = /\/i\/api\/graphql\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_]+)/;
  const SAVE_OP_RE = /Article(Entity)?Update.*Content/i;

  function recordOpFromUrl(url) {
    const m = String(url || "").match(GQL_URL_RE);
    if (!m) return;
    const [, queryId, opName] = m;
    if (sniffedOps[opName] !== queryId) {
      sniffedOps[opName] = queryId;
      scheduleAuthBroadcast();
    }
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    recordOpFromUrl(url);
    if (input instanceof Request) {
      recordBearer(extractBearer(input.headers.get("authorization")));
    }
    inspectHeaders(init?.headers);

    const isSaveOp = SAVE_OP_RE.test(url);
    const promise = origFetch.apply(this, arguments);
    if (isSaveOp) {
      promise
        .then((res) => {
          if (res && res.ok) {
            saveListeners.forEach((cb) => {
              try {
                cb({ url, status: res.status });
              } catch {}
            });
          }
        })
        .catch(() => {});
    }
    return promise;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__xmpUrl = url;
    recordOpFromUrl(url);
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (/^authorization$/i.test(name)) {
      recordBearer(extractBearer(value));
    }
    return origSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (this.__xmpUrl && SAVE_OP_RE.test(this.__xmpUrl)) {
      this.addEventListener("load", () => {
        if (this.status >= 200 && this.status < 300) {
          saveListeners.forEach((cb) => {
            try {
              cb({ url: this.__xmpUrl, status: this.status });
            } catch {}
          });
        }
      });
    }
    return origSend.apply(this, arguments);
  };

  function waitForSaveResponse(timeoutMs = 8000) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (res) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        saveListeners.delete(onSave);
        resolve(res);
      };
      const onSave = (info) => finish({ ok: true, ...info });
      const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);
      saveListeners.add(onSave);
    });
  }

  const EDITOR_SELECTOR =
    "[data-contents='true'] [contenteditable='true'], [contenteditable='true'][role='textbox'], [contenteditable='true'].public-DraftEditor-content, [contenteditable='true']";

  function findEditorElement() {
    for (const el of document.querySelectorAll(EDITOR_SELECTOR)) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 100) return el;
    }
    return null;
  }

  function findDraftStateNode() {
    const el = findEditorElement();
    if (!el) return null;
    const fiberKey = Object.keys(el).find(
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
    );
    if (!fiberKey) return null;
    let fiber = el[fiberKey];
    for (let i = 0; i < 60 && fiber; i++) {
      const sn = fiber.stateNode;
      if (sn?.props?.editorState && typeof sn.props.onChange === "function") {
        return sn;
      }
      fiber = fiber.return;
    }
    return null;
  }

  function findReduxStore() {
    const root = findEditorElement() || document.getElementById("react-root");
    if (!root) return null;
    const key = Object.keys(root).find(
      (k) =>
        k.startsWith("__reactFiber$") ||
        k.startsWith("__reactContainer$") ||
        k.startsWith("__reactInternalInstance$")
    );
    if (!key) return null;
    let fallback = null;
    let fiber = root[key];
    for (let i = 0; i < 1000 && fiber; i++) {
      const store = fiber.memoizedProps?.store;
      if (store && typeof store.dispatch === "function" && typeof store.getState === "function") {
        let state = null;
        try {
          state = store.getState();
        } catch {
          state = null;
        }
        if (state && typeof state === "object" && state.entities) return store;
        if (!fallback) fallback = store;
      }
      fiber = fiber.return;
    }
    return fallback;
  }

  function getStoredMediaCount(store, articleId) {
    let ae;
    try {
      ae = store.getState()?.entities?.articleEntities;
    } catch {
      return null;
    }
    if (!ae || typeof ae !== "object") return null;
    const key = String(articleId);
    for (const container of [ae, ae.entities]) {
      if (!container || typeof container !== "object") continue;
      const entity = container[key];
      if (entity && typeof entity === "object") {
        return Array.isArray(entity.media_entities) ? entity.media_entities.length : 0;
      }
    }
    return null;
  }

  async function hydrateMediaEntities(articleId, mediaEntities) {
    if (!articleId || !mediaEntities?.length) return null;
    const store = findReduxStore();
    if (!store) return { ok: false, error: "redux store not reachable" };

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      try {
        store.dispatch({
          type: "rweb/entities/articleEntities/UPDATE_ONE",
          meta: { entityId: String(articleId), entityNamespace: "articleEntities" },
          payload: { media_entities: mediaEntities },
        });
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
      const stored = getStoredMediaCount(store, articleId);
      if (stored >= mediaEntities.length) {
        return { ok: true, count: mediaEntities.length, attempts: attempt };
      }
      if (attempt === 8) break;
      await sleep(400);
      checkAborted();
    }
    return {
      ok: false,
      error: "article entity did not keep media_entities",
      count: mediaEntities.length,
    };
  }

  function dispatchSyntheticPaste(html, plain) {
    const el = findEditorElement();
    if (!el) return false;
    if (typeof el.focus === "function") el.focus();
    const dt = new DataTransfer();
    dt.setData("text/html", html);
    dt.setData("text/plain", plain || html.replace(/<[^>]*>/g, ""));
    const ev = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    if (ev.clipboardData !== dt) {
      Object.defineProperty(ev, "clipboardData", { value: dt });
    }
    el.dispatchEvent(ev);
    return true;
  }

  function hasMarkerBlock(contentState, marker) {
    let found = false;
    contentState.getBlockMap().forEach((block) => {
      if (block.getType() !== "atomic" && (block.getText() || "").trim() === marker) {
        found = true;
        return false;
      }
    });
    return found;
  }

  async function waitForMarkers(plan, { timeoutMs = 4000, pollMs = 50 } = {}) {
    const start = Date.now();
    let best = { sn: null, present: 0 };
    for (;;) {
      const sn = findDraftStateNode();
      const cs = sn?.props?.editorState?.getCurrentContent?.();
      const present = cs ? plan.filter((item) => hasMarkerBlock(cs, item.marker)).length : 0;
      if (sn && present >= best.present) {
        best = { sn, present };
      }
      if ((sn && present === plan.length) || Date.now() - start >= timeoutMs) {
        break;
      }
      await sleep(pollMs);
    }
    return best;
  }

  function replaceMarkerWithAtomic(contentState, marker, entityType, data, mutability, sampleBlock, ListCtor) {
    const blockMap = contentState.getBlockMap();
    let targetKey = null;
    blockMap.forEach((block, key) => {
      if (block.getType() !== "atomic" && (block.getText() || "").trim() === marker) {
        targetKey = key;
        return false;
      }
    });
    if (!targetKey) return { ok: false, err: `marker not found: ${marker}`, cs: contentState };

    const targetBlock = blockMap.get(targetKey);
    const atomicSample = blockMap.find((b) => b.getType() === "atomic") || sampleBlock;
    const charSample = (atomicSample ? atomicSample.getCharacterList() : targetBlock.getCharacterList()).get(0);
    if (!charSample?.set) return { ok: false, err: "no charSample", cs: contentState };

    const withEntity = contentState.createEntity(entityType, mutability, data);
    const entityKey = withEntity.getLastCreatedEntityKey();
    const charWithEntity = charSample.set("entity", entityKey);
    const charList = ListCtor([charWithEntity]);
    const atomicBlock = (atomicSample || targetBlock).merge({
      key: targetKey,
      type: "atomic",
      text: " ",
      characterList: charList,
      depth: 0,
    });
    const newBlockMap = withEntity.getBlockMap().set(targetKey, atomicBlock);
    let nextCs = withEntity.set("blockMap", newBlockMap);
    if (entityType === "MEDIA") {
      nextCs = nextCs.mergeEntityData(entityKey, { entityKey });
    }
    return { ok: true, entityKey, cs: nextCs };
  }

  function applyAtomicPlan(stateNode, plan) {
    const editorState = stateNode.props.editorState;
    const EditorStateCtor = editorState.constructor;
    const SelectionCtor = editorState.getSelection().constructor;
    let contentState = editorState.getCurrentContent();
    const blockMap = contentState.getBlockMap();
    const sampleBlock =
      blockMap.find((b) => b.getType() === "atomic") ||
      blockMap.find((b) => b.getCharacterList().get(0));
    if (!sampleBlock) {
      return { okCount: 0, failCount: plan.length, errs: [{ err: "no sample character block" }] };
    }
    const ListCtor = sampleBlock.getCharacterList().constructor;
    let okCount = 0;
    const errs = [];

    for (const item of plan) {
      const res = replaceMarkerWithAtomic(
        contentState,
        item.marker,
        item.op.entityType,
        item.op.data || {},
        item.op.mutability || "IMMUTABLE",
        sampleBlock,
        ListCtor
      );
      if (res.ok) {
        contentState = res.cs;
        okCount += 1;
      } else {
        errs.push({ marker: item.marker, err: res.err });
      }
    }

    if (okCount === 0) return { okCount: 0, failCount: errs.length, errs };

    const lastKey = contentState.getBlockMap().last().getKey();
    const sel = SelectionCtor.createEmpty(lastKey);
    const prepared = contentState.set("selectionBefore", sel).set("selectionAfter", sel);
    let nextEs = EditorStateCtor.push(editorState, prepared, "insert-fragment");
    nextEs = EditorStateCtor.moveSelectionToEnd(nextEs);
    stateNode.props.onChange(nextEs);
    return { okCount, failCount: errs.length, errs };
  }

  function replaceMarkerWithText(stateNode, marker, text) {
    const es = stateNode.props.editorState;
    const EditorStateCtor = es.constructor;
    const SelectionCtor = es.getSelection().constructor;
    const cs = es.getCurrentContent();
    const blockMap = cs.getBlockMap();
    let targetKey = null;
    blockMap.forEach((block, key) => {
      if (block.getType() !== "atomic" && (block.getText() || "").trim() === marker) {
        targetKey = key;
        return false;
      }
    });
    if (!targetKey) return false;

    const block = blockMap.get(targetKey);
    const charMetaCtor = block.getCharacterList().get(0)?.constructor;
    const emptyChar = charMetaCtor ? charMetaCtor.create({}) : null;
    const baseList = block.getCharacterList().clear();
    const newChars = emptyChar
      ? baseList.toArray().concat(new Array(text.length).fill(emptyChar))
      : new Array(text.length).fill(undefined);
    const updatedBlock = block.merge({ text, characterList: newChars });
    const newBlockMap = blockMap.set(targetKey, updatedBlock);
    const sel = SelectionCtor.createEmpty(targetKey);
    const newCs = cs.set("blockMap", newBlockMap).set("selectionBefore", sel).set("selectionAfter", sel);
    stateNode.props.onChange(EditorStateCtor.push(es, newCs, "change-block-data"));
    return true;
  }

  function removeLeftoverMarkers(stateNode, prefix) {
    if (!prefix) return 0;
    const es = stateNode.props.editorState;
    const EditorStateCtor = es.constructor;
    const SelectionCtor = es.getSelection().constructor;
    const cs = es.getCurrentContent();
    let blockMap = cs.getBlockMap();
    const toDelete = [];
    blockMap.forEach((block, key) => {
      if (block.getType() === "atomic") return;
      if ((block.getText() || "").trim().startsWith(prefix)) {
        toDelete.push(key);
      }
    });
    if (!toDelete.length) return 0;
    for (const key of toDelete) {
      blockMap = blockMap.delete(key);
    }
    const lastKey = blockMap.last() ? blockMap.last().getKey() : null;
    const sel = lastKey ? SelectionCtor.createEmpty(lastKey) : es.getSelection();
    const newCs = cs.set("blockMap", blockMap).set("selectionBefore", sel).set("selectionAfter", sel);
    let nextEs = EditorStateCtor.push(es, newCs, "remove-range");
    nextEs = EditorStateCtor.moveSelectionToEnd(nextEs);
    stateNode.props.onChange(nextEs);
    return toDelete.length;
  }

  async function waitForStateChange(stateNode, prevEditorState, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (stateNode.props.editorState !== prevEditorState) return true;
      await sleep(30);
    }
    return false;
  }

  function getArticleIdFromUrl() {
    return location.href.match(/\/articles\/edit\/(\d+)/)?.[1] || null;
  }

  function getCsrfToken() {
    return document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1] || "";
  }

  function getOpId(opName) {
    return sniffedOps[opName] || FALLBACK_OPS[opName] || "";
  }

  async function postGraphQL(opName, body) {
    const queryId = getOpId(opName);
    if (!queryId) return { status: 0, ok: false, body: `no queryId for ${opName}` };
    const res = await fetch(`https://x.com/i/api/graphql/${queryId}/${opName}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sniffedBearer || DEFAULT_BEARER}`,
        "x-csrf-token": getCsrfToken(),
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");
    return { status: res.status, ok: res.ok, body: res.ok ? "" : text.slice(0, 240) };
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect || rect.width < 4 || rect.height < 4) return false;
    const style = getComputedStyle?.(el);
    return !(style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0"));
  }

  function findTitleField() {
    const editorEl = findEditorElement();
    const candidates = Array.from(
      document.querySelectorAll("input[type='text'], textarea, [contenteditable='true']")
    ).filter((el) => el !== editorEl && isVisible(el));
    const hints = ["title", "标题", "add title", "输入标题"];
    let best = null;
    let bestScore = -1;
    for (const el of candidates) {
      const label = (
        (el.getAttribute?.("aria-label") || "") +
        " " +
        (el.getAttribute?.("placeholder") || "") +
        " " +
        (el.getAttribute?.("data-testid") || "")
      ).toLowerCase();
      const rect = el.getBoundingClientRect();
      let score = 0;
      if (hints.some((h) => label.includes(h))) score += 10;
      if (rect.top < 420) score += 4;
      if (rect.width > 240) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return bestScore > 0 ? best : null;
  }

  async function setTitleInDom(title) {
    const el = findTitleField();
    if (!el) return { ok: false, err: "title field not found" };
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const proto =
        el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, String(title));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      el.focus();
      await sleep(80);
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, String(title));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await sleep(250);
    return { ok: true };
  }

  async function runImport(payload) {
    cancelled = false;
    const { html, plain, plan = [], markerPrefix } = payload;
    let stateNode = findDraftStateNode();
    if (!stateNode) {
      post("error", { error: "Draft stateNode not reachable in MAIN world" });
      return;
    }

    const articleId = getArticleIdFromUrl();
    postProgress("main_paste_html");
    dispatchSyntheticPaste(html, plain);
    checkAborted();

    const summary = { atomicOk: 0, atomicFail: 0, imgOk: 0, imgFail: 0 };
    const totalImages = plan.filter((item) => item.op.entityType === "MEDIA").length;
    let failedItems = plan;

    if (plan.length) {
      checkAborted();
      postProgress("main_inserting_atomics", { n: plan.length });
      const waited = await waitForMarkers(plan);
      if (waited.sn) stateNode = waited.sn;

      const prevEs = stateNode.props.editorState;
      const result = applyAtomicPlan(stateNode, plan);
      summary.atomicOk = result.okCount;
      if (result.okCount) {
        await waitForStateChange(stateNode, prevEs);
      }
      const failedSet = new Set((result.errs || []).map((e) => e?.marker).filter(Boolean));
      failedItems = plan.filter((item) => failedSet.has(item.marker));
    }

    summary.atomicFail = failedItems.length;
    summary.imgFail = failedItems.filter((item) => item.op.entityType === "MEDIA").length;
    summary.imgOk = totalImages - summary.imgFail;

    for (const item of failedItems) {
      if (!item.op.fallbackText) continue;
      const prevEs = stateNode.props.editorState;
      if (replaceMarkerWithText(stateNode, item.marker, item.op.fallbackText)) {
        await waitForStateChange(stateNode, prevEs);
      }
    }

    const prevEsCleanup = stateNode.props.editorState;
    const cleaned = removeLeftoverMarkers(stateNode, markerPrefix);
    if (cleaned) {
      await waitForStateChange(stateNode, prevEsCleanup);
      try {
        const es = stateNode.props.editorState;
        stateNode.props.onChange(es.constructor.moveSelectionToEnd(es));
      } catch {}
    }
    summary.markersCleaned = cleaned;

    const saveWait = payload.serverSaved || !plan.length ? null : waitForSaveResponse(8000);

    if (payload.title) {
      checkAborted();
      postProgress("main_setting_title");
      try {
        await setTitleInDom(payload.title);
        if (articleId) {
          await postGraphQL("ArticleEntityUpdateTitle", {
            variables: { articleEntityId: articleId, title: String(payload.title) },
            features: GQL_FEATURES,
            queryId: getOpId("ArticleEntityUpdateTitle"),
          });
        }
      } catch {}
    }

    if (payload.coverMediaId && articleId) {
      checkAborted();
      postProgress("main_setting_cover");
      try {
        await postGraphQL("ArticleEntityUpdateCoverMedia", {
          variables: {
            articleEntityId: articleId,
            coverMedia: {
              media_id: String(payload.coverMediaId),
              media_category: "DraftTweetImage",
            },
          },
          features: GQL_FEATURES,
          queryId: getOpId("ArticleEntityUpdateCoverMedia"),
        });
      } catch {}
    }

    if (saveWait) {
      checkAborted();
      postProgress("waiting_save");
      const saveRes = await saveWait;
      summary.saveConfirmed = saveRes.ok === true;
    }

    const hydrated = await hydrateMediaEntities(articleId, payload.mediaEntities);
    if (hydrated) {
      summary.mediaHydrated = hydrated.ok ? hydrated.count : 0;
    }

    post("done", { summary });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== SOURCE_IN) return;

    if (msg.kind === "ready?") {
      post("ready");
      return;
    }
    if (msg.nonce !== NONCE) return;

    if (msg.kind === "cancel") {
      cancelled = true;
      return;
    }
    if (msg.kind === "run") {
      runImport(msg.payload).catch((err) => {
        post("error", { error: String(err?.message || err) });
      });
    }
  });

  post("ready");
})();
