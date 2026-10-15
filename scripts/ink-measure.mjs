// The in-page half of check-ink: every Arabic line's INK box — measured from
// the glyphs themselves (canvas `measureText` on the same font), not from the
// layout box, which is the font's content area and says nothing about where
// a shadda or a kasra lands — checked three ways:
//
//   clipped  an ancestor's overflow edge cuts it, and no scroll can bring the
//            cut part into view (a line hidden on purpose by a clamp, whose
//            own middle is past the edge, is not a cut);
//   rule     the border a block draws under or over it (the h1 hairline)
//            comes within 2px of the ink;
//   collide  two lines of one block overlap by more than 1px.
//
// Self-contained on purpose: Playwright serialises it into the page. Returns
// one row per (kind, element, clipper), with a count.
export function measureInk() {
  const AR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const T = 0.75;
  const ctx = document.createElement("canvas").getContext("2d");
  const out = [];
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (typeof el.className === "string" && el.className) s += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    return s;
  };
  const clipCache = new Map();
  function clippers(el) {
    if (clipCache.has(el)) return clipCache.get(el);
    const list = [];
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === "visible" && cs.overflowY === "visible" && !/paint/.test(cs.contain)) continue;
      // overflow does not apply to an inline box: it clips nothing
      if (cs.display === "inline") continue;
      const r = a.getBoundingClientRect();
      const bl = parseFloat(cs.borderLeftWidth), bt = parseFloat(cs.borderTopWidth);
      const box = { left: r.left + bl, top: r.top + bt, right: r.left + bl + a.clientWidth, bottom: r.top + bt + a.clientHeight };
      // overflow: clip honours overflow-clip-margin ("content-box 4px", "6px")
      if (cs.overflowX === "clip" || cs.overflowY === "clip") {
        const m = cs.overflowClipMargin || "";
        const px = parseFloat((m.match(/-?[\d.]+px/) || ["0"])[0]);
        const pad = (side) => (/content-box/.test(m) ? parseFloat(cs["padding" + side]) : /border-box/.test(m) ? -parseFloat(cs["border" + side + "Width"]) : 0);
        if (cs.overflowX === "clip") { box.left += pad("Left") - px; box.right -= pad("Right") - px; }
        if (cs.overflowY === "clip") { box.top += pad("Top") - px; box.bottom -= pad("Bottom") - px; }
      }
      list.push({ el: a, ox: cs.overflowX, oy: cs.overflowY, box, clamp: (cs.webkitLineClamp || "none") !== "none" });
    }
    clipCache.set(el, list);
    return list;
  }
  const blockOf = (el) => {
    for (let a = el; a; a = a.parentElement) {
      const d = getComputedStyle(a).display;
      if (!d.startsWith("inline") && d !== "contents") return a;
    }
    return document.body;
  };
  const blocks = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.data;
    if (!AR.test(text)) continue;
    const el = n.parentElement;
    if (!el || el.closest("svg,canvas,script,style,.katex-mathml,[data-ink-exempt]")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const lines = [];
    let cur = null;
    for (let i = 0; i < text.length; i++) {
      range.setStart(n, i); range.setEnd(n, i + 1);
      const r = range.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (!cur || Math.abs(r.top - cur.top) > 1 || Math.abs(r.bottom - cur.bottom) > 1) {
        cur = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, start: i, end: i + 1 };
        lines.push(cur);
      } else {
        cur.left = Math.min(cur.left, r.left); cur.right = Math.max(cur.right, r.right); cur.end = i + 1;
      }
    }
    const block = blockOf(el);
    for (const ln of lines) {
      const s = text.slice(ln.start, ln.end);
      if (!AR.test(s)) continue;
      const m = ctx.measureText(s);
      const k = (ln.bottom - ln.top) / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent || 1);
      const baseline = ln.top + m.fontBoundingBoxAscent * k;
      const ink = { top: baseline - m.actualBoundingBoxAscent, bottom: baseline + m.actualBoundingBoxDescent, left: ln.left, right: ln.right };
      if (!blocks.has(block)) blocks.set(block, []);
      blocks.get(block).push({ ...ink, baseline, text: s.trim().slice(0, 30) });
      for (const c of clippers(el)) {
        const b = c.box;
        if (ink.bottom <= b.top || ink.top >= b.bottom || ink.right <= b.left || ink.left >= b.right) break;
        // A clamp hides its later lines on purpose: one whose middle is past
        // the edge is not a cut (a glyph rect is the font's content area,
        // taller than the line box in a tall-marked face, so the line is
        // judged by its middle). Anywhere else a line past the edge IS the
        // defect — an outline row squeezed to a sliver looks exactly like it.
        const mid = (ln.top + ln.bottom) / 2;
        if (c.clamp && (mid >= b.bottom || mid <= b.top)) break;
        const a = c.el;
        const scrollsY = c.oy === "auto" || c.oy === "scroll";
        const canUp = scrollsY && a.scrollTop > 0;
        const canDown = scrollsY && a.scrollTop + a.clientHeight < a.scrollHeight - 1;
        if ((ink.top < b.top - T && canUp) || (ink.bottom > b.bottom + T && canDown)) break;
        const cut = [];
        if (c.oy !== "visible") {
          if (ink.top < b.top - T) cut.push(`top ${(b.top - ink.top).toFixed(1)}`);
          if (ink.bottom > b.bottom + T) cut.push(`bottom ${(ink.bottom - b.bottom).toFixed(1)}`);
        }
        if (cut.length) {
          out.push({ kind: "clipped", where: describe(el), by: describe(a), detail: cut.join(", "), text: s.trim().slice(0, 30), fs: cs.fontSize, lh: cs.lineHeight });
          break;
        }
      }
    }
  }
  for (const [block, inks] of blocks) {
    const bcs = getComputedStyle(block);
    const br = block.getBoundingClientRect();
    const bb = parseFloat(bcs.borderBottomWidth), bt = parseFloat(bcs.borderTopWidth);
    if (bb > 0 && bcs.borderBottomStyle !== "none") {
      const low = Math.max(...inks.map((i) => i.bottom));
      const gap = br.bottom - bb - low;
      if (gap < 2) out.push({ kind: "rule", where: describe(block), by: "border-bottom", detail: `gap ${gap.toFixed(1)}`, text: inks.at(-1).text, fs: bcs.fontSize, lh: bcs.lineHeight });
    }
    if (bt > 0 && bcs.borderTopStyle !== "none") {
      const high = Math.min(...inks.map((i) => i.top));
      const gap = high - (br.top + bt);
      if (gap < 2) out.push({ kind: "rule", where: describe(block), by: "border-top", detail: `gap ${gap.toFixed(1)}`, text: inks[0].text, fs: bcs.fontSize, lh: bcs.lineHeight });
    }
    const rows = [];
    for (const i of inks.sort((a, b) => a.baseline - b.baseline)) {
      const r = rows.at(-1);
      if (r && Math.abs(r.baseline - i.baseline) < 2) { r.top = Math.min(r.top, i.top); r.bottom = Math.max(r.bottom, i.bottom); }
      else rows.push({ ...i });
    }
    for (let j = 1; j < rows.length; j++) {
      const overlap = rows[j - 1].bottom - rows[j].top;
      if (overlap > 1) {
        out.push({ kind: "collide", where: describe(block), by: "next line", detail: `overlap ${overlap.toFixed(1)}`, text: rows[j].text, fs: bcs.fontSize, lh: bcs.lineHeight });
        break;
      }
    }
  }
  const seen = new Map();
  for (const o of out) {
    const k = o.kind + "|" + o.where + "|" + o.by;
    if (!seen.has(k)) seen.set(k, { ...o, count: 1 });
    else seen.get(k).count++;
  }
  return [...seen.values()];
}
