(() => {
  const LANG_KEY = "xmp_lang";

  const MESSAGES = {
    zh: {
      ext_name: "X Article Markdown Paste",
      ext_desc: "一键把 Markdown 导入为 X 文章草稿 — 自动渲染图片、代码、表格、推文嵌入。",
      drag_hint_title: "松开即可导入为 X 文章",
      drag_hint_md: "支持 .md 文件或包含图片的文件夹",
      drag_hint_media: "自动上传图片、表格与推文嵌入",
      import_btn_label: "导入 Markdown",
      detected: "检测到 Markdown，正在解析...",
      preparing: "正在准备导入...",
      uploading_images: "正在上传图片 ({done}/{total})...",
      rendering_tables: "正在渲染表格图片 ({done}/{total})...",
      uploading_cover: "正在上传封面图...",
      waiting_cover: "等待选择封面图...",
      saving_to_x: "正在保存草稿到 X...",
      main_paste_html: "正在写入正文...",
      main_inserting_atomics: "正在插入 {n} 个富媒体块...",
      main_setting_title: "正在设置文章标题...",
      main_setting_cover: "正在设置封面图...",
      waiting_save: "正在等待 X 自动保存...",
      done: "导入完成（用时 {seconds}s）",
      done_simple: "导入完成",
      upload_cancelled: "已取消导入",
      cancel: "取消",
      dismiss: "关闭",
      failed: "导入失败：{msg}",
      issue_atomics: "{n} 个块未插入",
      issue_images: "{n} 张图片失败",
      issue_dropped_images_platform: "X 最多支持 {max} 张正文图片，多余 {n} 张已保留为 Markdown",
      img_err_fetch_failed: "图片拉取失败",
      img_err_local_unmatched: "未关联本地文件",
      local_assets_title: "关联本地图片",
      local_assets_desc: "检测到 {n} 张本地路径图片，授权文章或图片文件夹（只需一次，后续自动记住并预览），或直接拖入文件夹。",
      local_assets_drop_title: "授权文章 / 图片文件夹（或将文件夹拖入此处）",
      local_assets_drop_sub: "授权一次后将自动记住，以后导入直接显示缩略图预览",
      local_assets_reconnect: "一键恢复已授权目录：{name}",
      local_assets_scanning: "正在扫描文件夹...",
      local_assets_security_hint: "浏览器限制直接授权系统根目录（如桌面），请进入桌面后选择具体的文章文件夹或 images 文件夹。",
      local_assets_matched: "已匹配 {matched}/{total} 张本地图片",
      local_assets_no_match_hint: "已扫描 {count} 个文件，未匹配到上述路径。请确认选择的是包含这些图片的文章目录或 images 文件夹。",
      local_assets_skip: "跳过本地图片",
      local_assets_continue: "继续导入",
      quick_import_title: "导入 Markdown 到 X 文章",
      quick_import_desc: "选择单个 .md 文件，或直接选择包含 .md 和 images/ 的整个文章文件夹（推荐，自动带图预览）。",
      quick_import_pick_folder: "选择文章文件夹（含图片）",
      quick_import_pick_md: "选择单个 .md 文件",
      quick_import_saved_folder: "从已授权目录选文章：{name}",
      md_picker_title: "选择要导入的 Markdown 文章",
      md_picker_desc: "检测到 {n} 篇 Markdown 文件，点击选择你要导入的那一篇（将自动关联对应目录的图片）：",
      no_md_in_folder: "该文件夹中未找到 .md 文件",
      cover_prompt_title: "选择文章封面图",
      cover_prompt_desc: "在正文前添加一张封面图，或留空跳过。",
      cover_prompt_upload: "点击或拖入本地图片作为封面",
      cover_prompt_drop: "支持 PNG / JPG / WEBP / GIF",
      cover_prompt_custom: "已选择自定义封面图",
      cover_prompt_custom_hint: "本地上传图片",
      cover_prompt_custom_ready: "已就绪：{name}",
      cover_prompt_none_img: "暂无预览",
      cover_attach_local_hint: "部分本地图片无法预览，请选择图片所在文件夹",
      cover_attach_local_btn: "选择本地文件夹",
      cover_prompt_remember: "记住我的选择，下次不再询问",
      cover_prompt_skip: "不使用封面",
      cover_prompt_use: "使用所选封面",
      need_editor_title: "未找到 X 文章编辑器",
      need_editor_desc: "请先进入 X 文章编辑页（x.com/compose/articles）后再试。",
      opening_editor: "正在打开文章编辑器...",
      create_not_found: "未找到新建文章按钮，请刷新 x.com 后重试。",
    },
    en: {
      ext_name: "X Article Markdown Paste",
      ext_desc: "Import Markdown into X Article drafts — auto-renders images, code blocks, tables, and tweet embeds.",
      drag_hint_title: "Drop to import as X Article",
      drag_hint_md: "Supports .md files or folders with images",
      drag_hint_media: "Auto-uploads images, tables & tweet embeds",
      import_btn_label: "Import Markdown",
      detected: "Markdown detected, parsing...",
      preparing: "Preparing import...",
      uploading_images: "Uploading media ({done}/{total})...",
      rendering_tables: "Rendering table images ({done}/{total})...",
      uploading_cover: "Uploading cover image...",
      waiting_cover: "Waiting for cover selection...",
      saving_to_x: "Saving draft to X...",
      main_paste_html: "Pasting article body...",
      main_inserting_atomics: "Inserting {n} rich media blocks...",
      main_setting_title: "Setting article title...",
      main_setting_cover: "Setting cover image...",
      waiting_save: "Waiting for X autosave...",
      done: "Imported in {seconds}s",
      done_simple: "Import complete",
      upload_cancelled: "Import cancelled",
      cancel: "Cancel",
      dismiss: "Dismiss",
      failed: "Import failed: {msg}",
      issue_atomics: "{n} block(s) failed",
      issue_images: "{n} image(s) failed",
      issue_dropped_images_platform: "X allows {max} body images; {n} kept as Markdown",
      img_err_fetch_failed: "Failed to fetch image",
      img_err_local_unmatched: "Local file not attached",
      local_assets_title: "Attach Local Images",
      local_assets_desc: "Found {n} local image path(s). Authorize the article or images folder once (remembered for future imports), or drop the folder here.",
      local_assets_drop_title: "Authorize article / images folder (or drop folder here)",
      local_assets_drop_sub: "Remembered after first grant — future imports auto-preview without asking",
      local_assets_reconnect: "Reconnect saved folder: {name}",
      local_assets_scanning: "Scanning folder...",
      local_assets_security_hint: "Chrome blocks authorizing system root folders (like Desktop). Please open it and pick your specific article or images/ folder.",
      local_assets_matched: "Matched {matched}/{total} local image(s)",
      local_assets_no_match_hint: "Scanned {count} file(s), none matched the paths above. Make sure you picked the article folder or images/ folder.",
      local_assets_skip: "Skip Local Images",
      local_assets_continue: "Continue Import",
      quick_import_title: "Import Markdown to X Article",
      quick_import_desc: "Pick a .md file, or select the entire article folder containing .md and images/ (recommended for instant image previews).",
      quick_import_pick_folder: "Choose Article Folder (with images)",
      quick_import_pick_md: "Choose Single .md File",
      quick_import_saved_folder: "Open saved folder: {name}",
      md_picker_title: "Choose Markdown Article to Import",
      md_picker_desc: "Found {n} Markdown files. Click one to import (images from its folder will auto-match):",
      no_md_in_folder: "No .md files found in this folder",
      cover_prompt_title: "Choose Article Cover Image",
      cover_prompt_desc: "Pick a cover image for this article, or skip.",
      cover_prompt_upload: "Click or drop a local image as cover",
      cover_prompt_drop: "Supports PNG / JPG / WEBP / GIF",
      cover_prompt_custom: "Custom cover image",
      cover_prompt_custom_hint: "Local upload",
      cover_prompt_custom_ready: "Ready: {name}",
      cover_prompt_none_img: "No preview",
      cover_attach_local_hint: "Some local images have no preview — attach their folder",
      cover_attach_local_btn: "Choose Folder",
      cover_prompt_remember: "Remember my choice for next time",
      cover_prompt_skip: "No Cover",
      cover_prompt_use: "Use Selected Cover",
      need_editor_title: "X Article editor not found",
      need_editor_desc: "Open an X Article draft at x.com/compose/articles and try again.",
      opening_editor: "Opening article editor...",
      create_not_found: "Could not find Create Article button. Reload x.com and try again.",
    },
  };

  let currentLang = "zh";
  const langListeners = new Set();

  function notifyLangChange() {
    for (const cb of langListeners) {
      try {
        cb(currentLang);
      } catch {}
    }
  }

  async function loadLang() {
    try {
      const res = await chrome.storage.local.get(LANG_KEY);
      if (res?.[LANG_KEY] === "zh" || res?.[LANG_KEY] === "en") {
        currentLang = res[LANG_KEY];
        notifyLangChange();
      }
    } catch {}
    return currentLang;
  }

  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== "local" || !changes?.[LANG_KEY]) return;
      const next = changes[LANG_KEY].newValue;
      if ((next === "zh" || next === "en") && next !== currentLang) {
        currentLang = next;
        notifyLangChange();
      }
    });
  } catch {}

  function t(key, vars) {
    const dict = MESSAGES[currentLang] || MESSAGES.zh;
    let text = dict[key] || MESSAGES.en[key] || key;
    if (vars && typeof vars === "object") {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }
    return text;
  }

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    if (lang === "zh" || lang === "en") {
      currentLang = lang;
      notifyLangChange();
    }
  }

  function onLangChange(cb) {
    if (typeof cb !== "function") return () => {};
    langListeners.add(cb);
    return () => langListeners.delete(cb);
  }

  loadLang();

  window.__XMP_I18N__ = { t, loadLang, getLang, setLang, onLangChange, MESSAGES };
})();
