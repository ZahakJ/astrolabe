// CAPTURE — the text arithmetic behind the quick-capture sheet, the phone's
// share sheet and the web clipper (docs/capture.md).
//
// Three doors, one rule: a line captured lands under a `## Captured` heading
// in a note, stamped with the time; a page clipped becomes its own note under
// `Clips/`, with where it came from in the frontmatter. The functions here
// are pure so the server (server/clip.ts, `POST /api/capture`) and the tests
// (tests/capture.test.ts) read the same bytes-in, bytes-out contract — the
// note is the state, and the state is exactly what these return.

/** The heading a captured line goes under. English on purpose and in every
 *  language: it is a filename-grade address inside the note (a template can
 *  carry it, a query can find it), not chrome. */
export const CAPTURED_HEADING = "## Captured";

/** Where clipped pages are filed, relative to the vault root. */
export const CLIPS_FOLDER = "Clips";

const HEADING_LINE = /^##\s+Captured\s*$/i;
/** A heading that ENDS the captured section: level one or two. A `###` under
 *  it is part of it. */
const SECTION_END = /^#{1,2}\s/;

/** `content` with `- HH:MM text` appended under `## Captured` — at the end of
 *  that section when the note has one, else as a new section at the end of
 *  the note. A multi-line `text` keeps its lines, hung under the bullet. Line
 *  endings follow the note's own. */
export function appendCaptured(content: string, text: string, time: string): string {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const clean = text.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");
  const [first, ...rest] = clean.split("\n");
  const item = [`- ${time} ${first}`.replace(/\s+$/, ""), ...rest.map((l) => (l.trim() === "" ? "" : `  ${l}`))].join(eol);
  const lines = content.split(eol);
  const at = lines.findIndex((l) => HEADING_LINE.test(l));
  if (at === -1) {
    const body = content.replace(/\s+$/, "");
    const head = body === "" ? "" : `${body}${eol}${eol}`;
    return `${head}${CAPTURED_HEADING}${eol}${eol}${item}${eol}`;
  }
  // The section runs to the next heading of level ≤ 2, or the end. Insert
  // after its last non-blank line so a blank line the note keeps before the
  // next heading stays where it is.
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) {
    if (SECTION_END.test(lines[i])) {
      end = i;
      break;
    }
  }
  let last = end - 1;
  while (last > at && lines[last].trim() === "") last--;
  // A heading with nothing under it yet gets a blank line before the first
  // item, like the section this function writes from scratch.
  const insert = last === at ? ["", item] : [item];
  lines.splice(last + 1, 0, ...insert);
  let out = lines.join(eol);
  if (!out.endsWith(eol)) out += eol;
  return out;
}

/** `title` as a note filename: the filesystem's forbidden set plus the three
 *  the vault forbids (`[`, `]`, `#` — a `[[wikilink]]` could never spell
 *  them), control characters gone, whitespace collapsed, capped so a page
 *  with a paragraph for a title still fits a filesystem. */
export function clipFileName(title: string, fallback = "Clip"): string {
  const base = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/:*?"<>|[\]#]/g, " ")
    .replace(/\s+/g, " ")
    // Dots and spaces at either end, together: "../../etc" arrives as
    // ".. .. etc" once its slashes are spaces, and a name that still begins
    // with a dot is a dotfile the tree, the index and the watcher all
    // refuse to see — a clip nobody could find.
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120)
    .replace(/[.\s]+$/g, "");
  return `${base || fallback}.md`;
}

/** A YAML double-quoted scalar. Quoted always: a URL has a `:` in it, a title
 *  can start with anything, and an unquoted value that happens to parse as
 *  something else is the kind of bug nobody finds for a year. */
export function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}

export interface ClipInput {
  title: string;
  url: string | null;
  /** `YYYY-MM-DD`, the reader's day. */
  date: string;
  /** The converted page, already Markdown. */
  body: string;
}

/** The note a clip becomes: frontmatter naming the source and the day, the
 *  title as an H1, then the body. */
export function clipNote(input: ClipInput): string {
  const front = ["---"];
  if (input.url) front.push(`source: ${yamlQuote(input.url)}`);
  front.push(`clipped: ${input.date}`, "---", "");
  const title = input.title.replace(/\s+/g, " ").trim();
  let body = input.body.replace(/^\s+|\s+$/g, "");
  // A page whose article opens with its own title as an H1 would print it
  // twice; the note's heading is the title, so the page's copy goes.
  const firstLine = body.split("\n", 1)[0] ?? "";
  if (/^# /.test(firstLine) && firstLine.slice(2).trim().toLowerCase() === title.toLowerCase()) {
    body = body.slice(firstLine.length).replace(/^\s+/, "");
  }
  return `${front.join("\n")}\n# ${title}\n${body === "" ? "" : `\n${body}\n`}`;
}

const URL_RE = /https?:\/\/[^\s<>"'`]+/i;

/** What a phone shares is loose: the URL may arrive in `url`, or at the end
 *  of `text` after the page's title, or alone in `text`. This finds the one
 *  address in a shared text and hands back the words around it. */
export function splitSharedText(text: string): { url: string | null; rest: string } {
  const m = URL_RE.exec(text);
  if (!m) return { url: null, rest: text.trim() };
  // Trailing punctuation a sentence put after the link is not the link's.
  const url = m[0].replace(/[.,;:!?)\]]+$/, "");
  const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim();
  return { url, rest };
}

/** True for an address the clipper can fetch or file: http(s) and nothing else. */
export function isClippableUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ── The bookmarklet ─────────────────────────────────────────────────────────

export interface BookmarkletWords {
  /** "Clipped: {path}" — the alert after a clip lands. */
  clipped: string;
  /** "Clip failed" — the alert when the server said no. */
  failed: string;
}

/** The one line of JavaScript the reader drags to the bookmarks bar
 *  (Settings → Vault → Clipper). Run on any page it sends the selection (as
 *  HTML, so its links and headings survive) or, with nothing selected, the
 *  whole page, with the address and title, to `<origin>/api/clip` under the
 *  token. `text/plain` on purpose: it is the one content type a browser
 *  sends cross-origin without a preflight. When the page's own security
 *  policy refuses the fetch, it falls back to a form POST into a new tab —
 *  the server answers a form with a redirect to the note, so the tab lands
 *  on the clip. Strings are JSON-encoded into the source so a token, an
 *  origin or a translated word can never break out of their quotes. */
export function bookmarklet(origin: string, token: string, words: BookmarkletWords): string {
  const q = (v: string): string => JSON.stringify(v);
  const src =
    `(function(){var s=getSelection(),h='',t='';` +
    `if(s&&s.rangeCount&&!s.isCollapsed){var d=document.createElement('div');d.appendChild(s.getRangeAt(0).cloneContents());h=d.innerHTML;t=String(s)}` +
    `else{h=document.documentElement.outerHTML}` +
    `var p={token:${q(token)},url:location.href,title:document.title,html:h,selection:t};` +
    `var a=${q(`${origin}/api/clip`)};` +
    `fetch(a,{method:'POST',mode:'cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(p)})` +
    `.then(function(r){return r.json()})` +
    `.then(function(j){alert(j.path?${q(words.clipped)}.replace('{path}',j.path):${q(words.failed)}+(j.error?': '+j.error:''))})` +
    `.catch(function(){var f=document.createElement('form');f.method='POST';f.action=a;f.target='_blank';` +
    `for(var k in p){var i=document.createElement('input');i.type='hidden';i.name=k;i.value=p[k];f.appendChild(i)}` +
    `document.body.appendChild(f);f.submit();f.remove()})})();`;
  return `javascript:${encodeURIComponent(src)}`;
}
