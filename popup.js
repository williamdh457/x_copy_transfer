(() => {
  const ARTICLES_URL = "https://x.com/compose/articles";
  const ARTICLES_RE = /^https:\/\/(?:x|twitter)\.com\/compose\/articles(?:$|[/?#])/;

  const TEXTS = {
    zh: {
      langBtn: "English",
      subtitle: "一键把 Markdown 导入为 X 文章草稿 — 自动渲染图片、代码、表格、推文嵌入。",
      notInEditor: "当前不在 X 文章编辑器",
      goCreate: "前往新建",
      inEditor: "已在 X 文章编辑页，可直接拖入或粘贴 Markdown",
      settingsTitle: "导入设置",
      coverLabel: "封面图设置",
      coverAsk: "每次上传前询问",
      coverFirst: "自动用第一张图",
      coverNone: "不自动设置封面",
      coverHint: "Frontmatter 里的 cover/封面 会优先使用。",
      tableLabel: "表格模式",
      tableImage: "图片表格",
      tableNative: "原生表格",
      tableHint: "原生表格可继续编辑；图片表格保持现有视觉样式。",
      quickImportBtn: "选择 Markdown 文件导入",
      quickImportHint: "也可以直接将 .md 文件拖入 X 文章页面，或直接在编辑器中粘贴。",
    },
    en: {
      langBtn: "中文",
      subtitle: "One-click Markdown import for X Articles — auto-renders images, code, tables & tweet embeds.",
      notInEditor: "Not in X Article editor",
      goCreate: "Open Editor",
      inEditor: "Ready on X Articles — drop or paste Markdown anytime",
      settingsTitle: "Import Settings",
      coverLabel: "Cover Image",
      coverAsk: "Ask before upload",
      coverFirst: "Use first image",
      coverNone: "Do not set cover",
      coverHint: "Frontmatter cover/封面 takes priority.",
      tableLabel: "Table Mode",
      tableImage: "Image Table",
      tableNative: "Native Table",
      tableHint: "Native tables stay editable; image tables preserve visual styling.",
      quickImportBtn: "Choose Markdown File to Import",
      quickImportHint: "Or drag & drop a .md file onto X Articles, or paste directly.",
    },
  };

  let lang = /^zh/i.test(navigator.language || "") ? "zh" : "en";
  let activeTabId = null;

  function renderTexts() {
    const t = TEXTS[lang] || TEXTS.zh;
    document.getElementById("lang-btn").textContent = t.langBtn;
    document.getElementById("subtitle").textContent = t.subtitle;
    document.getElementById("settings-title").textContent = t.settingsTitle;
    document.getElementById("cover-label").textContent = t.coverLabel;
    document.getElementById("cover-hint").textContent = t.coverHint;
    document.getElementById("table-label").textContent = t.tableLabel;
    document.getElementById("table-hint").textContent = t.tableHint;
    document.getElementById("quick-import-btn").textContent = t.quickImportBtn;
    document.getElementById("quick-import-hint").textContent = t.quickImportHint;

    const coverSelect = document.getElementById("cover-mode");
    coverSelect.options[0].textContent = t.coverAsk;
    coverSelect.options[1].textContent = t.coverFirst;
    coverSelect.options[2].textContent = t.coverNone;

    const tableSelect = document.getElementById("table-mode");
    tableSelect.options[0].textContent = t.tableImage;
    tableSelect.options[1].textContent = t.tableNative;
  }

  function updateBanner(onArticles) {
    const t = TEXTS[lang] || TEXTS.zh;
    const banner = document.getElementById("status-banner");
    const icon = banner.querySelector(".banner-icon");
    const text = document.getElementById("status-text");
    const action = document.getElementById("status-action");
    const quickCard = document.getElementById("quick-import-card");

    if (onArticles) {
      banner.className = "banner banner-ok";
      icon.textContent = "✓";
      text.textContent = t.inEditor;
      action.hidden = true;
      quickCard.hidden = false;
    } else {
      banner.className = "banner banner-warn";
      icon.textContent = "!";
      text.textContent = t.notInEditor;
      action.textContent = t.goCreate;
      action.hidden = false;
      quickCard.hidden = true;
    }
  }

  async function init() {
    const stored = await chrome.storage.local.get(["xmp_lang", "xmp_cover_mode", "xmp_table_mode"]);
    if (stored?.xmp_lang === "zh" || stored?.xmp_lang === "en") {
      lang = stored.xmp_lang;
    }

    const coverSelect = document.getElementById("cover-mode");
    const tableSelect = document.getElementById("table-mode");
    coverSelect.value = ["ask", "first", "none"].includes(stored?.xmp_cover_mode) ? stored.xmp_cover_mode : "ask";
    tableSelect.value = ["image", "native"].includes(stored?.xmp_table_mode) ? stored.xmp_table_mode : "image";

    renderTexts();

    let onArticles = false;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && tab?.url) {
        activeTabId = tab.id;
        onArticles = ARTICLES_RE.test(tab.url);
      }
    } catch {}
    updateBanner(onArticles);

    document.getElementById("lang-btn").addEventListener("click", async () => {
      lang = lang === "zh" ? "en" : "zh";
      await chrome.storage.local.set({ xmp_lang: lang });
      renderTexts();
      updateBanner(onArticles);
    });

    coverSelect.addEventListener("change", () => {
      chrome.storage.local.set({ xmp_cover_mode: coverSelect.value });
    });

    tableSelect.addEventListener("change", () => {
      chrome.storage.local.set({ xmp_table_mode: tableSelect.value });
    });

    document.getElementById("status-action").addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: ARTICLES_URL });
      window.close();
    });

    const fileInput = document.getElementById("md-file-input");
    document.getElementById("quick-import-btn").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file || !activeTabId) return;
      const text = await file.text();
      chrome.tabs.sendMessage(activeTabId, { type: "importMarkdownText", text }, () => {
        window.close();
      });
    });
  }

  init();
})();
