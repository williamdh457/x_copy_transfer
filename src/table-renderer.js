(() => {
  const SANS_FONT =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const MONO_FONT = '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';

  const HEADER_FONT_SIZE = 14;
  const BODY_FONT_SIZE = 14;
  const CODE_FONT_SIZE = 12.5;
  const LINE_HEIGHT = 21;
  const CELL_PAD_X = 14;
  const HEAD_PAD_Y = 12;
  const BODY_PAD_Y = 10;
  const MIN_COL_WIDTH = 72;
  const MAX_CANVAS_WIDTH = 760;
  const MIN_TWO_COL_WIDTH = 420;
  const OUTER_PAD = 1;

  function parseTableInline(raw) {
    const md = window.__XMP_MD__;
    if (!md) return [{ text: String(raw || "") }];
    const parsed = md.parseInline(String(raw || ""));
    const text = parsed.text || "";
    if (!text) return [{ text: "" }];

    const spans = [];
    let cur = null;
    for (let i = 0; i < text.length; i += 1) {
      const styleFlags = { bold: false, italic: false, strike: false, code: false, href: "" };
      for (const r of parsed.inlineStyleRanges) {
        if (i >= r.offset && i < r.offset + r.length) {
          if (r.style === "Bold") styleFlags.bold = true;
          if (r.style === "Italic") styleFlags.italic = true;
          if (r.style === "Strikethrough") styleFlags.strike = true;
          if (r.style === "Code") styleFlags.code = true;
        }
      }
      for (const l of parsed.links) {
        if (i >= l.offset && i < l.offset + l.length) {
          styleFlags.href = l.url || "";
        }
      }
      if (
        cur &&
        cur.bold === styleFlags.bold &&
        cur.italic === styleFlags.italic &&
        cur.strike === styleFlags.strike &&
        cur.code === styleFlags.code &&
        cur.href === styleFlags.href
      ) {
        cur.text += text[i];
      } else {
        cur = { text: text[i], ...styleFlags };
        spans.push(cur);
      }
    }
    return spans.length ? spans : [{ text: "" }];
  }

  function fontForSpan(span, isHeader) {
    if (span.code) return `${CODE_FONT_SIZE}px ${MONO_FONT}`;
    const size = isHeader ? HEADER_FONT_SIZE : BODY_FONT_SIZE;
    const weight = isHeader || span.bold ? "600 " : "";
    const italic = span.italic ? "italic " : "";
    return `${italic}${weight}${size}px ${SANS_FONT}`;
  }

  function wrapCell(ctx, rawText, maxWidth, isHeader) {
    const paragraphs = String(rawText ?? "").split(/\r?\n|<br\s*\/?\s*>/i);
    const lines = [];

    const measure = (txt, font) => {
      ctx.font = font;
      return ctx.measureText(txt).width;
    };

    for (const para of paragraphs) {
      if (!para) {
        lines.push({ spans: [{ text: "" }], width: 0 });
        continue;
      }
      const spans = parseTableInline(para);
      const totalWidth = spans.reduce((acc, s) => acc + measure(s.text, fontForSpan(s, isHeader)), 0);
      if (totalWidth <= maxWidth) {
        lines.push({ spans, width: totalWidth });
        continue;
      }
      let currentLine = { spans: [], width: 0 };
      lines.push(currentLine);
      for (const span of spans) {
        const font = fontForSpan(span, isHeader);
        for (const ch of span.text) {
          const w = measure(ch, font);
          if (currentLine.width + w > maxWidth && currentLine.spans.length > 0) {
            currentLine = { spans: [], width: 0 };
            lines.push(currentLine);
          }
          const last = currentLine.spans[currentLine.spans.length - 1];
          if (
            last &&
            !!last.bold === !!span.bold &&
            !!last.italic === !!span.italic &&
            !!last.strike === !!span.strike &&
            !!last.code === !!span.code &&
            (last.href || "") === (span.href || "")
          ) {
            last.text += ch;
          } else {
            currentLine.spans.push({ ...span, text: ch });
          }
          currentLine.width += w;
        }
      }
    }
    return lines.length ? lines : [{ spans: [{ text: "" }], width: 0 }];
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  async function renderTableToPng(table, opts = {}) {
    const dpr = opts.dpr || 2;
    const fileName = opts.fileName || `table-${Date.now()}.png`;
    const measureCanvas = document.createElement("canvas");
    const mCtx = measureCanvas.getContext("2d");

    const colCount = table.headers.length;
    const naturalWidths = new Array(colCount).fill(0);

    const updateNatural = (text, colIdx, isHeader) => {
      for (const para of String(text ?? "").split(/\r?\n|<br\s*\/?\s*>/i)) {
        const spans = parseTableInline(para);
        const w = spans.reduce((sum, s) => {
          mCtx.font = fontForSpan(s, isHeader);
          return sum + mCtx.measureText(s.text).width;
        }, 0);
        if (w > naturalWidths[colIdx]) naturalWidths[colIdx] = w;
      }
    };

    table.headers.forEach((h, i) => updateNatural(h, i, true));
    for (const row of table.rows) {
      for (let i = 0; i < colCount; i += 1) {
        updateNatural(row[i] || "", i, false);
      }
    }

    const totalPadX = colCount * CELL_PAD_X * 2;
    const availContentWidth = MAX_CANVAS_WIDTH - totalPadX - OUTER_PAD * 2;
    const minWidths = naturalWidths.map((w) => Math.max(MIN_COL_WIDTH, Math.ceil(w)));
    const sumNatural = minWidths.reduce((a, b) => a + b, 0);

    let contentWidths;
    if (sumNatural <= availContentWidth) {
      contentWidths = minWidths;
    } else {
      const scale = availContentWidth / sumNatural;
      contentWidths = minWidths.map((w) => Math.max(MIN_COL_WIDTH, Math.floor(w * scale)));
      let diff = availContentWidth - contentWidths.reduce((a, b) => a + b, 0);
      const order = contentWidths.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
      let guard = 0;
      while (diff !== 0 && guard < 10000) {
        const idx = order[guard % order.length];
        if (diff > 0) {
          contentWidths[idx] += 1;
          diff -= 1;
        } else if (contentWidths[idx] > MIN_COL_WIDTH) {
          contentWidths[idx] -= 1;
          diff += 1;
        }
        guard += 1;
      }
    }

    let colWidths = contentWidths.map((w) => w + CELL_PAD_X * 2);
    let tableWidth = colWidths.reduce((a, b) => a + b, 0);
    if (colCount === 2 && tableWidth + OUTER_PAD * 2 < MIN_TWO_COL_WIDTH) {
      const extra = MIN_TWO_COL_WIDTH - (tableWidth + OUTER_PAD * 2);
      colWidths[0] += Math.floor(extra / 2);
      colWidths[1] += Math.ceil(extra / 2);
      tableWidth = colWidths.reduce((a, b) => a + b, 0);
    }

    const rowHeight = (cells, padY) =>
      cells.reduce((maxLines, lines) => Math.max(maxLines, lines.length), 1) * LINE_HEIGHT + padY * 2;

    const headCells = table.headers.map((h, i) => wrapCell(mCtx, h, colWidths[i] - CELL_PAD_X * 2, true));
    const rowsData = [{ kind: "head", cells: headCells, height: rowHeight(headCells, HEAD_PAD_Y) }];

    for (const row of table.rows) {
      const padded = row
        .slice(0, colCount)
        .concat(new Array(Math.max(0, colCount - row.length)).fill(""));
      const bodyCells = padded.map((cell, i) => wrapCell(mCtx, cell, colWidths[i] - CELL_PAD_X * 2, false));
      rowsData.push({ kind: "body", cells: bodyCells, height: rowHeight(bodyCells, BODY_PAD_Y) });
    }

    const totalHeight = rowsData.reduce((a, r) => a + r.height, 0);
    const canvasW = tableWidth + OUTER_PAD * 2;
    const canvasH = totalHeight + OUTER_PAD * 2;

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(canvasW * dpr);
    canvas.height = Math.ceil(canvasH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // Background & outer rounded border
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.save();
    drawRoundedRect(ctx, OUTER_PAD, OUTER_PAD, tableWidth, totalHeight, 10);
    ctx.clip();

    let y = OUTER_PAD;
    rowsData.forEach((row, rowIdx) => {
      if (row.kind === "head") {
        ctx.fillStyle = "#f7f9f9";
        ctx.fillRect(OUTER_PAD, y, tableWidth, row.height);
      } else if (rowIdx % 2 === 0) {
        ctx.fillStyle = "#fbfcfd";
        ctx.fillRect(OUTER_PAD, y, tableWidth, row.height);
      }

      if (rowIdx > 0) {
        ctx.strokeStyle = rowIdx === 1 ? "#d5dce0" : "#ebeff2";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(OUTER_PAD, y + 0.5);
        ctx.lineTo(OUTER_PAD + tableWidth, y + 0.5);
        ctx.stroke();
      }

      const padY = row.kind === "head" ? HEAD_PAD_Y : BODY_PAD_Y;
      let x = OUTER_PAD;
      row.cells.forEach((lines, colIdx) => {
        const cw = colWidths[colIdx];
        if (colIdx > 0) {
          ctx.strokeStyle = "#ebeff2";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 0.5, y);
          ctx.lineTo(x + 0.5, y + row.height);
          ctx.stroke();
        }

        const align = table.alignments?.[colIdx] || "left";
        const contentW = cw - CELL_PAD_X * 2;
        lines.forEach((line, lineIdx) => {
          let drawX = x + CELL_PAD_X;
          if (align === "center") drawX += Math.max(0, (contentW - line.width) / 2);
          else if (align === "right") drawX += Math.max(0, contentW - line.width);

          const baselineY = y + padY + lineIdx * LINE_HEIGHT + 15;
          for (const span of line.spans) {
            const font = fontForSpan(span, row.kind === "head");
            ctx.font = font;
            const sw = ctx.measureText(span.text).width;

            if (span.code) {
              ctx.fillStyle = "#eff3f4";
              ctx.fillRect(drawX - 2, baselineY - 12, sw + 4, 16);
              ctx.fillStyle = "#0f1419";
            } else if (span.href) {
              ctx.fillStyle = "#1d9bf0";
            } else {
              ctx.fillStyle = row.kind === "head" ? "#0f1419" : "#272c30";
            }

            ctx.fillText(span.text, drawX, baselineY);

            if (span.strike) {
              ctx.strokeStyle = ctx.fillStyle;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(drawX, baselineY - 4);
              ctx.lineTo(drawX + sw, baselineY - 4);
              ctx.stroke();
            }
            drawX += sw;
          }
        });
        x += cw;
      });
      y += row.height;
    });

    ctx.restore();

    ctx.strokeStyle = "#cfd9de";
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, OUTER_PAD + 0.5, OUTER_PAD + 0.5, tableWidth - 1, totalHeight - 1, 10);
    ctx.stroke();

    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1] || "";
    return { mime: "image/png", base64, fileName };
  }

  window.__XMP_TABLE__ = { renderTableToPng };
})();
