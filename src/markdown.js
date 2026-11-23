(() => {
  const MAX_BODY_IMAGES = 25;

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sanitizeUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return "";
  }

  function isVideoUrl(url) {
    return /\.(?:mp4|m4v|mov|webm)(?:\?|#|$)/i.test(String(url || ""));
  }

  function isMarkdown(text) {
    const s = String(text || "").trim();
    if (!s || s.length < 3) return false;
    const patterns = [
      /^---\r?\n[\s\S]*?\r?\n---/, // frontmatter
      /^#{1,6}\s+\S+/m, // headings
      /^```/m, // fenced code
      /!\[[^\]]*\]\([^)]+\)/, // images
      /\[[^\]]+\]\(https?:\/\/[^)]+\)/, // links
      /^\s*[-*+]\s+\S+/m, // unordered list
      /^\s*\d+\.\s+\S+/m, // ordered list
      /^\s*>\s+\S+/m, // blockquote
      /^\|.+\|\s*\r?\n\|[\s:|-]+\|/m, // GFM table
      /\*\*[^*\n]+\*\*/, // bold
      /(?:^|\n)(?:---|\*\*\*|___)\s*(?:\n|$)/, // hr
    ];
    let hits = 0;
    for (const re of patterns) {
      if (re.test(s)) hits += 1;
      if (hits >= 1 && (s.includes("\n") || /\*\*|!\[|\[[^\]]+\]\(/.test(s))) return true;
    }
    return hits >= 2;
  }

  function extractFrontmatter(raw) {
    const match = String(raw || "").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) return { title: "", cover: "", body: raw, titleFromFrontmatter: false, coverFromFrontmatter: false };

    const yaml = match[1];
    let title = "";
    let cover = "";
    for (const line of yaml.split(/\r?\n/)) {
      const m = line.match(/^\s*([^:#]+?)\s*:\s*(.+?)\s*$/);
      if (!m) continue;
      const key = m[1].trim().toLowerCase();
      let val = m[2].trim().replace(/^(['"])(.*)\1$/, "$2").trim();
      if ((key === "title" || key === "标题") && !title) {
        title = val;
      } else if ((key === "cover" || key === "封面" || key === "cover_image") && !cover) {
        const imgMd = val.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
        if (imgMd) val = imgMd[1].trim();
        cover = val;
      }
    }
    const body = String(raw).slice(match[0].length).trim();
    return {
      title,
      cover,
      body,
      titleFromFrontmatter: Boolean(title),
      coverFromFrontmatter: Boolean(cover),
    };
  }

  function extractReferenceLinks(text) {
    const references = new Map();
    const keptLines = [];
    for (const line of String(text || "").split(/\r?\n/)) {
      const m = line.match(/^\s{0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*$/);
      if (m) {
        references.set(m[1].trim().toLowerCase(), m[2].trim());
      } else {
        keptLines.push(line);
      }
    }
    return { body: keptLines.join("\n"), references };
  }

  function parseInline(rawText, references = new Map()) {
    let text = "";
    const inlineStyleRanges = [];
    const links = [];
    let i = 0;
    const src = String(rawText || "");

    const pushStyled = (str, style) => {
      if (!str) return;
      const offset = text.length;
      text += str;
      inlineStyleRanges.push({ offset, length: str.length, style });
    };

    while (i < src.length) {
      // Escaped char
      if (src[i] === "\\" && i + 1 < src.length && /[\\`*_{}[\]()#+\-.!~|]/.test(src[i + 1])) {
        text += src[i + 1];
        i += 2;
        continue;
      }

      // Inline code `...`
      if (src[i] === "`") {
        const end = src.indexOf("`", i + 1);
        if (end > i + 1) {
          pushStyled(src.slice(i + 1, end), "Code");
          i = end + 1;
          continue;
        }
      }

      // Bold **...** or __...__
      if ((src.startsWith("**", i) || src.startsWith("__", i))) {
        const delim = src.slice(i, i + 2);
        const end = src.indexOf(delim, i + 2);
        if (end > i + 2 && !src.slice(i + 2, end).includes("\n")) {
          const inner = parseInline(src.slice(i + 2, end), references);
          const baseOffset = text.length;
          text += inner.text;
          inlineStyleRanges.push({ offset: baseOffset, length: inner.text.length, style: "Bold" });
          for (const r of inner.inlineStyleRanges) {
            inlineStyleRanges.push({ offset: baseOffset + r.offset, length: r.length, style: r.style });
          }
          for (const l of inner.links) {
            links.push({ offset: baseOffset + l.offset, length: l.length, url: l.url });
          }
          i = end + 2;
          continue;
        }
      }

      // Strikethrough ~~...~~
      if (src.startsWith("~~", i)) {
        const end = src.indexOf("~~", i + 2);
        if (end > i + 2 && !src.slice(i + 2, end).includes("\n")) {
          pushStyled(src.slice(i + 2, end), "Strikethrough");
          i = end + 2;
          continue;
        }
      }

      // Italic *...* or _..._
      if ((src[i] === "*" || src[i] === "_") && src[i + 1] !== src[i]) {
        const delim = src[i];
        const prev = i > 0 ? src[i - 1] : " ";
        if (!(delim === "_" && /[a-zA-Z0-9]/.test(prev))) {
          const end = src.indexOf(delim, i + 1);
          if (
            end > i + 1 &&
            !src.slice(i + 1, end).includes("\n") &&
            !(delim === "_" && /[a-zA-Z0-9]/.test(src[end + 1] || ""))
          ) {
            const inner = parseInline(src.slice(i + 1, end), references);
            const baseOffset = text.length;
            text += inner.text;
            inlineStyleRanges.push({ offset: baseOffset, length: inner.text.length, style: "Italic" });
            for (const r of inner.inlineStyleRanges) {
              inlineStyleRanges.push({ offset: baseOffset + r.offset, length: r.length, style: r.style });
            }
            for (const l of inner.links) {
              links.push({ offset: baseOffset + l.offset, length: l.length, url: l.url });
            }
            i = end + 1;
            continue;
          }
        }
      }

      // Link [label](url) or [label][ref]
      if (src[i] === "[") {
        const closeBracket = src.indexOf("]", i + 1);
        if (closeBracket > i + 1) {
          const label = src.slice(i + 1, closeBracket);
          if (src[closeBracket + 1] === "(") {
            const closeParen = src.indexOf(")", closeBracket + 2);
            if (closeParen > closeBracket + 2) {
              const rawUrl = src
                .slice(closeBracket + 2, closeParen)
                .trim()
                .replace(/\s+(?:"[^"]*"|'[^']*')$/, "")
                .replace(/^<|>$/g, "");
              const url = sanitizeUrl(rawUrl);
              const offset = text.length;
              text += label;
              if (url) links.push({ offset, length: label.length, url });
              i = closeParen + 1;
              continue;
            }
          } else if (src[closeBracket + 1] === "[") {
            const closeRef = src.indexOf("]", closeBracket + 2);
            if (closeRef >= closeBracket + 2) {
              const refKey = (src.slice(closeBracket + 2, closeRef) || label).trim().toLowerCase();
              const refUrl = sanitizeUrl(references.get(refKey) || "");
              const offset = text.length;
              text += label;
              if (refUrl) links.push({ offset, length: label.length, url: refUrl });
              i = closeRef + 1;
              continue;
            }
          }
        }
      }

      text += src[i];
      i += 1;
    }

    return { text, inlineStyleRanges, links };
  }

  function makeTextSegment(kind, rawText, references) {
    const parsed = parseInline(rawText, references);
    return {
      type: "text",
      kind,
      text: parsed.text,
      inlineStyleRanges: parsed.inlineStyleRanges,
      links: parsed.links,
    };
  }

  function parseTableBlock(lines) {
    const splitRow = (line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split(/(?<!\\)\|/)
        .map((c) => c.replace(/\\\|/g, "|").trim());

    const headers = splitRow(lines[0]);
    const alignRaw = splitRow(lines[1]);
    const alignments = headers.map((_, idx) => {
      const cell = (alignRaw[idx] || "").trim();
      if (cell.startsWith(":") && cell.endsWith(":")) return "center";
      if (cell.endsWith(":")) return "right";
      return "left";
    });
    const rows = lines.slice(2).map((line) => {
      const cells = splitRow(line);
      while (cells.length < headers.length) cells.push("");
      return cells.slice(0, headers.length);
    });
    return { type: "table", headers, alignments, rows };
  }

  function parseMarkdown(rawMarkdown) {
    const fm = extractFrontmatter(rawMarkdown);
    const { body, references } = extractReferenceLinks(fm.body);
    const lines = body.split(/\r?\n/);
    const segments = [];
    let paraLines = [];

    const flushPara = () => {
      if (!paraLines.length) return;
      const joined = paraLines.join(" ").trim();
      if (joined) segments.push(makeTextSegment("unstyled", joined, references));
      paraLines = [];
    };

    const headingKinds = [
      "",
      "header-one",
      "header-two",
      "header-three",
      "header-four",
      "header-five",
      "header-six",
    ];

    let idx = 0;
    while (idx < lines.length) {
      const line = lines[idx];
      const trimmed = line.trim();

      if (!trimmed) {
        flushPara();
        idx += 1;
        continue;
      }

      // Fenced code block ```lang
      const fenceMatch = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
      if (fenceMatch) {
        flushPara();
        const fence = fenceMatch[1];
        const fenceChar = fence[0];
        const fenceLen = fence.length;
        const language = fenceMatch[2].trim().split(/\s+/)[0] || "";
        const codeLines = [];
        idx += 1;
        while (idx < lines.length) {
          const closeRe = new RegExp(`^\\s*${fenceChar}{${fenceLen},}\\s*$`);
          if (closeRe.test(lines[idx])) {
            idx += 1;
            break;
          }
          codeLines.push(lines[idx]);
          idx += 1;
        }
        segments.push({ type: "code", language, code: codeLines.join("\n") });
        continue;
      }

      // GFM Table
      if (
        trimmed.includes("|") &&
        idx + 1 < lines.length &&
        /^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/.test(lines[idx + 1])
      ) {
        flushPara();
        const tableLines = [lines[idx], lines[idx + 1]];
        idx += 2;
        while (idx < lines.length && lines[idx].trim() && lines[idx].includes("|")) {
          tableLines.push(lines[idx]);
          idx += 1;
        }
        segments.push(parseTableBlock(tableLines));
        continue;
      }

      // Horizontal rule
      if (/^(?:---+|___+|\*\*\*+)$/.test(trimmed)) {
        flushPara();
        segments.push({ type: "divider" });
        idx += 1;
        continue;
      }

      // Standalone Tweet URL
      const tweetMatch = trimmed.match(
        /^https?:\/\/(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/(\d+)(?:[/?#]\S*)?$/i
      );
      if (tweetMatch) {
        flushPara();
        segments.push({
          type: "tweet",
          tweetId: tweetMatch[1],
          url: `https://twitter.com/i/web/status/${tweetMatch[1]}`,
        });
        idx += 1;
        continue;
      }

      // Standalone Markdown image ![alt](url)
      const imgMatch = trimmed.match(
        /^!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)$/
      );
      if (imgMatch) {
        flushPara();
        const src = imgMatch[2].replace(/^<|>$/g, "").trim();
        segments.push({
          type: isVideoUrl(src) ? "video" : "image",
          alt: imgMatch[1] || "",
          source: src,
        });
        idx += 1;
        continue;
      }

      // Standalone HTML <img src="...">
      const htmlImgMatch = trimmed.match(/^<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>$/i);
      if (htmlImgMatch) {
        flushPara();
        const src = (htmlImgMatch[1] ?? htmlImgMatch[2] ?? htmlImgMatch[3] ?? "").trim();
        const altMatch = trimmed.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        segments.push({
          type: isVideoUrl(src) ? "video" : "image",
          alt: altMatch?.[1] ?? altMatch?.[2] ?? "",
          source: src,
        });
        idx += 1;
        continue;
      }

      // Heading # .. ######
      const hMatch = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
      if (hMatch) {
        flushPara();
        segments.push(makeTextSegment(headingKinds[hMatch[1].length], hMatch[2].trim(), references));
        idx += 1;
        continue;
      }

      // Blockquote >
      const qMatch = trimmed.match(/^>\s*(.+)$/);
      if (qMatch) {
        flushPara();
        segments.push(makeTextSegment("blockquote", qMatch[1].trim(), references));
        idx += 1;
        continue;
      }

      // Unordered list - / * / +
      const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
      if (ulMatch) {
        flushPara();
        segments.push(makeTextSegment("unordered-list-item", ulMatch[1].trim(), references));
        idx += 1;
        continue;
      }

      // Ordered list 1.
      const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        flushPara();
        segments.push(makeTextSegment("ordered-list-item", olMatch[1].trim(), references));
        idx += 1;
        continue;
      }

      paraLines.push(trimmed);
      idx += 1;
    }
    flushPara();

    // Title promotion if no frontmatter title
    let title = fm.title;
    let titleTaken = false;
    if (!title) {
      const h1s = segments.filter((s) => s.type === "text" && s.kind === "header-one" && s.text);
      if (segments[0]?.type === "text" && segments[0].kind === "header-one" && segments[0].text && h1s.length === 1) {
        title = segments[0].text;
        segments.splice(0, 1);
        titleTaken = true;
      }
    }

    // Normalize headings for X Articles (supports header-one and header-two in body)
    for (const seg of segments) {
      if (seg.type !== "text") continue;
      if (titleTaken && seg.kind === "header-two") {
        seg.kind = "header-one";
      } else if (
        seg.kind === "header-three" ||
        seg.kind === "header-four" ||
        seg.kind === "header-five" ||
        seg.kind === "header-six"
      ) {
        seg.kind = "header-two";
      }
    }

    let cover = fm.cover;
    if (!cover) {
      const firstImg = segments.find((s) => s.type === "image" && s.source);
      if (firstImg) cover = firstImg.source;
    }

    return {
      title,
      cover,
      segments,
      titleFromFrontmatter: fm.titleFromFrontmatter,
      coverFromFrontmatter: fm.coverFromFrontmatter,
    };
  }

  function tableToMarkdown(table) {
    const lines = [];
    lines.push("| " + table.headers.join(" | ") + " |");
    lines.push(
      "| " +
        table.alignments
          .map((a) => (a === "center" ? ":---:" : a === "right" ? "---:" : ":---"))
          .join(" | ") +
        " |"
    );
    for (const row of table.rows) {
      lines.push("| " + row.join(" | ") + " |");
    }
    return lines.join("\n");
  }

  function renderInlineHtml(seg) {
    const text = seg.text || "";
    if (!text) return "";

    const opens = new Array(text.length + 1).fill(null).map(() => []);
    const closes = new Array(text.length + 1).fill(null).map(() => []);

    const styleTags = {
      Bold: ["<strong>", "</strong>"],
      Italic: ["<em>", "</em>"],
      Strikethrough: ["<s>", "</s>"],
      Code: ["<code>", "</code>"],
    };

    for (const r of seg.inlineStyleRanges || []) {
      const pair = styleTags[r.style];
      if (!pair || r.length <= 0) continue;
      const start = Math.max(0, Math.min(r.offset, text.length));
      const end = Math.max(start, Math.min(r.offset + r.length, text.length));
      if (end > start) {
        opens[start].push(pair[0]);
        closes[end].unshift(pair[1]);
      }
    }

    for (const l of seg.links || []) {
      const url = sanitizeUrl(l.url);
      if (!url || l.length <= 0) continue;
      const start = Math.max(0, Math.min(l.offset, text.length));
      const end = Math.max(start, Math.min(l.offset + l.length, text.length));
      if (end > start) {
        opens[start].push(`<a href="${escapeHtml(url)}">`);
        closes[end].unshift("</a>");
      }
    }

    let out = "";
    for (let i = 0; i < text.length; i += 1) {
      if (closes[i].length) out += closes[i].join("");
      if (opens[i].length) out += opens[i].join("");
      out += escapeHtml(text[i]);
    }
    if (closes[text.length].length) out += closes[text.length].join("");
    return out;
  }

  function buildPlainText(segments) {
    const out = [];
    for (const seg of segments) {
      if (seg.type === "text") out.push(seg.text || "");
      else if (seg.type === "code") out.push("```" + (seg.language || "") + "\n" + (seg.code || "") + "\n```");
      else if (seg.type === "divider") out.push("---");
      else if (seg.type === "tweet") out.push(`https://twitter.com/i/web/status/${seg.tweetId}`);
      else if (seg.type === "image") out.push(`![${seg.alt || ""}](${seg.source})`);
      else if (seg.type === "video") out.push(`[video](${seg.source})`);
      else if (seg.type === "table") out.push(tableToMarkdown(seg));
    }
    return out.join("\n\n");
  }

  const TAG_FOR_KIND = {
    unstyled: "p",
    "header-one": "h1",
    "header-two": "h2",
    "header-three": "h3",
    "header-four": "h4",
    "header-five": "h5",
    "header-six": "h6",
    blockquote: "blockquote",
  };

  function makeMediaData(mediaId, localIdx, mediaCategory = "DraftTweetImage") {
    return {
      mediaItems: [
        {
          localMediaId: Number(localIdx) || 0,
          mediaId: String(mediaId),
          mediaCategory,
        },
      ],
    };
  }

  function buildPastePayload(segments, { imageMap, tableMap, tableMode = "image", sessionId, coverSource = "" } = {}) {
    const markerPrefix = `__XMP_${sessionId || Math.random().toString(36).slice(2, 6)}_`;
    const plan = [];
    const htmlParts = [];
    let skippedCover = false;
    let localMediaIdx = 0;
    let markerCounter = 0;
    let listType = null;
    let listItems = [];

    const nextMarker = (tag) => `${markerPrefix}${tag}_${markerCounter++}__`;
    const flushList = () => {
      if (!listType || !listItems.length) return;
      htmlParts.push(`<${listType}>${listItems.map((li) => `<li>${li}</li>`).join("")}</${listType}>`);
      listType = null;
      listItems = [];
    };

    for (const seg of segments) {
      if (seg.type === "text") {
        const inner = renderInlineHtml(seg) || "<br>";
        if (seg.kind === "unordered-list-item") {
          if (listType && listType !== "ul") flushList();
          listType = "ul";
          listItems.push(inner);
          continue;
        }
        if (seg.kind === "ordered-list-item") {
          if (listType && listType !== "ol") flushList();
          listType = "ol";
          listItems.push(inner);
          continue;
        }
        flushList();
        const tag = TAG_FOR_KIND[seg.kind] || "p";
        htmlParts.push(`<${tag}>${inner}</${tag}>`);
        continue;
      }

      flushList();

      if (seg.type === "divider") {
        const marker = nextMarker("DIV");
        htmlParts.push(`<p>${marker}</p>`);
        plan.push({
          marker,
          op: { type: "atomic", entityType: "DIVIDER", data: {}, mutability: "IMMUTABLE", fallbackText: "---" },
        });
        continue;
      }

      if (seg.type === "code") {
        const marker = nextMarker("CODE");
        const md = "```" + (seg.language || "") + "\n" + (seg.code || "") + "\n```";
        htmlParts.push(`<p>${marker}</p>`);
        plan.push({
          marker,
          op: { type: "atomic", entityType: "MARKDOWN", data: { markdown: md }, mutability: "MUTABLE", fallbackText: md },
        });
        continue;
      }

      if (seg.type === "tweet") {
        const marker = nextMarker("TWEET");
        const url = `https://twitter.com/i/web/status/${seg.tweetId}`;
        htmlParts.push(`<p>${marker}</p>`);
        plan.push({
          marker,
          op: {
            type: "atomic",
            entityType: "TWEET",
            data: { tweet_id: seg.tweetId, tweetId: seg.tweetId, url },
            mutability: "IMMUTABLE",
            fallbackText: url,
          },
        });
        continue;
      }

      if (seg.type === "image" || seg.type === "video") {
        const uploaded = imageMap?.get(seg);
        if (uploaded?.ok && coverSource && !skippedCover && seg.source === coverSource) {
          skippedCover = true;
          continue;
        }
        if (uploaded?.ok) {
          const marker = nextMarker("IMG");
          htmlParts.push(`<p>${marker}</p>`);
          const fallback = seg.type === "video" ? `[video](${seg.source})` : `![${seg.alt || ""}](${seg.source})`;
          plan.push({
            marker,
            op: {
              type: "atomic",
              entityType: "MEDIA",
              data: makeMediaData(uploaded.mediaId, localMediaIdx++, uploaded.mediaCategory),
              mutability: "IMMUTABLE",
              fallbackText: fallback,
              source: seg.source || null,
            },
          });
        } else {
          const fallback = seg.type === "video" ? `[video](${seg.source})` : `![${seg.alt || ""}](${seg.source})`;
          const errLabel = uploaded?.error || "failed";
          htmlParts.push(`<p>${escapeHtml(`${fallback} — ${errLabel}`)}</p>`);
        }
        continue;
      }

      if (seg.type === "table") {
        const md = tableToMarkdown(seg);
        if (tableMode === "native") {
          const marker = nextMarker("TABLE");
          htmlParts.push(`<p>${marker}</p>`);
          plan.push({
            marker,
            op: { type: "atomic", entityType: "MARKDOWN", data: { markdown: md }, mutability: "MUTABLE", fallbackText: md },
          });
          continue;
        }
        const uploaded = tableMap?.get(seg);
        if (uploaded?.ok) {
          const marker = nextMarker("IMG");
          htmlParts.push(`<p>${marker}</p>`);
          plan.push({
            marker,
            op: {
              type: "atomic",
              entityType: "MEDIA",
              data: makeMediaData(uploaded.mediaId, localMediaIdx++, uploaded.mediaCategory),
              mutability: "IMMUTABLE",
              fallbackText: md,
            },
          });
        } else {
          htmlParts.push(`<pre><code>${escapeHtml(md)}</code></pre>`);
        }
      }
    }

    flushList();
    return {
      html: htmlParts.join(""),
      plain: buildPlainText(segments),
      plan,
      markerPrefix,
    };
  }

  // Map UTF-16 code unit indices to Unicode code-point indices for Draft.js / X GraphQL
  function buildCodePointMap(str) {
    const map = new Array(str.length + 1).fill(0);
    let cp = 0;
    let i = 0;
    while (i < str.length) {
      map[i] = cp;
      const step = str.codePointAt(i) > 0xffff ? 2 : 1;
      if (step === 2) map[i + 1] = cp;
      i += step;
      cp += 1;
    }
    map[str.length] = cp;
    return map;
  }

  function mapRangeToCodePoints(cpMap, offset, length, strLen) {
    const start = Math.max(0, Math.min(offset, strLen));
    const end = Math.max(start, Math.min(offset + length, strLen));
    return {
      offset: cpMap[start],
      length: cpMap[end] - cpMap[start],
    };
  }

  const GQL_STYLE_MAP = {
    Bold: "Bold",
    Italic: "Italic",
    Strikethrough: "Strikethrough",
    Underline: "Underline",
    Code: "Bold",
  };

  const GQL_BLOCK_TYPE_MAP = {
    unstyled: "unstyled",
    "header-one": "header-one",
    "header-two": "header-two",
    blockquote: "blockquote",
    "unordered-list-item": "unordered-list-item",
    "ordered-list-item": "ordered-list-item",
  };

  function randomBlockKey() {
    return Math.random().toString(36).slice(2, 7).padEnd(5, "0");
  }

  function buildContentState(segments, { imageMap, tableMap, tableMode = "image", coverSource = "" } = {}) {
    const blocks = [];
    const entityMap = [];
    let skippedCover = false;
    let localMediaIdx = 0;

    const addEntity = (type, mutability, data) => {
      const key = entityMap.length;
      entityMap.push({ key, value: { type, mutability, data } });
      return key;
    };

    const addTextBlock = (text, type, entityRanges = [], inlineStyleRanges = []) => {
      blocks.push({
        key: randomBlockKey(),
        text,
        type,
        data: {},
        entity_ranges: entityRanges,
        inline_style_ranges: inlineStyleRanges,
      });
    };

    const addAtomicBlock = (entityKey) => {
      blocks.push({
        key: randomBlockKey(),
        text: " ",
        type: "atomic",
        data: {},
        entity_ranges: [{ key: entityKey, offset: 0, length: 1 }],
        inline_style_ranges: [],
      });
    };

    for (const seg of segments) {
      if (seg.type === "text") {
        const text = seg.text || "";
        const cpMap = buildCodePointMap(text);
        const styles = [];
        for (const r of seg.inlineStyleRanges || []) {
          const mapped = GQL_STYLE_MAP[r.style];
          if (!mapped) continue;
          const range = mapRangeToCodePoints(cpMap, r.offset, r.length, text.length);
          if (range.length > 0) styles.push({ ...range, style: mapped });
        }
        const entities = [];
        for (const l of seg.links || []) {
          const url = sanitizeUrl(l.url);
          if (!url) continue;
          const range = mapRangeToCodePoints(cpMap, l.offset, l.length, text.length);
          if (range.length > 0) {
            entities.push({ key: addEntity("LINK", "Mutable", { url }), ...range });
          }
        }
        addTextBlock(text, GQL_BLOCK_TYPE_MAP[seg.kind] || "unstyled", entities, styles);
        continue;
      }

      if (seg.type === "divider") {
        addAtomicBlock(addEntity("DIVIDER", "Immutable", {}));
        continue;
      }

      if (seg.type === "code") {
        const md = "```" + (seg.language || "") + "\n" + (seg.code || "") + "\n```";
        addAtomicBlock(addEntity("MARKDOWN", "Immutable", { markdown: md }));
        continue;
      }

      if (seg.type === "tweet") {
        addAtomicBlock(addEntity("TWEET", "Immutable", { tweet_id: String(seg.tweetId) }));
        continue;
      }

      if (seg.type === "image" || seg.type === "video") {
        const uploaded = imageMap?.get(seg);
        if (uploaded?.ok && coverSource && !skippedCover && seg.source === coverSource) {
          skippedCover = true;
          continue;
        }
        if (uploaded?.ok) {
          addAtomicBlock(
            addEntity("MEDIA", "Immutable", {
              media_items: [
                {
                  local_media_id: localMediaIdx++,
                  media_id: String(uploaded.mediaId),
                  media_category: uploaded.mediaCategory || "DraftTweetImage",
                },
              ],
            })
          );
        } else {
          const fallback = seg.type === "video" ? `[video](${seg.source})` : `![${seg.alt || ""}](${seg.source})`;
          addTextBlock(fallback, "unstyled");
        }
        continue;
      }

      if (seg.type === "table") {
        const md = tableToMarkdown(seg);
        if (tableMode === "native") {
          addAtomicBlock(addEntity("MARKDOWN", "Immutable", { markdown: md }));
          continue;
        }
        const uploaded = tableMap?.get(seg);
        if (uploaded?.ok) {
          addAtomicBlock(
            addEntity("MEDIA", "Immutable", {
              media_items: [
                {
                  local_media_id: localMediaIdx++,
                  media_id: String(uploaded.mediaId),
                  media_category: uploaded.mediaCategory || "DraftTweetImage",
                },
              ],
            })
          );
        } else {
          addTextBlock(md, "unstyled");
        }
      }
    }

    if (!blocks.length) addTextBlock("", "unstyled");
    return { content_state: { blocks, entity_map: entityMap } };
  }

  window.__XMP_MD__ = {
    MAX_BODY_IMAGES,
    isMarkdown,
    parseMarkdown,
    parseInline,
    tableToMarkdown,
    buildPastePayload,
    buildContentState,
    buildCodePointMap,
    mapRangeToCodePoints,
  };
})();
