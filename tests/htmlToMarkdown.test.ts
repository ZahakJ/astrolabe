// The clipper's converter (shared/htmlToMarkdown.ts): the dozen tags an
// article is made of come through as Markdown, everything that is not
// content is dropped, and prose that happens to contain Markdown's own marks
// stays prose.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeEntities, htmlTitle, htmlToMarkdown } from "../shared/htmlToMarkdown.ts";

const md = (html: string, baseUrl?: string): string => htmlToMarkdown(html, { baseUrl });

describe("htmlToMarkdown", () => {
  it("headings, paragraphs and rules", () => {
    assert.equal(
      md("<h1>Title</h1><p>One.</p><p>Two\n  three.</p><hr><h3>Sub <em>head</em></h3>"),
      "# Title\n\nOne.\n\nTwo three.\n\n---\n\n### Sub *head*",
    );
  });

  it("bold, italic, code, strikethrough — with the page's own spacing kept outside the marks", () => {
    assert.equal(md("<p>a <b> bold </b> b <i>it</i> <code>x `y` z</code> <s>gone</s></p>"), "a **bold** b *it* `` x `y` z `` ~~gone~~");
    assert.equal(md("<p><strong></strong>empty</p>"), "empty");
  });

  it("links resolve against the page, and only to somewhere a reader can go", () => {
    assert.equal(md('<a href="/x?a=1">rel</a>', "https://ex.org/dir/page"), "[rel](https://ex.org/x?a=1)");
    assert.equal(md('<a href="javascript:alert(1)">js</a>'), "js");
    assert.equal(md('<a href="https://ex.org/"><img src="/i.png" alt="pic"></a>', "https://ex.org/p"), "[![pic](https://ex.org/i.png)](https://ex.org/)");
    assert.equal(md('<a href="https://ex.org/"></a>'), "[https://ex.org/](https://ex.org/)");
    // A <base href> outranks the caller's base.
    assert.equal(md('<html><head><base href="https://b.org/"></head><body><a href="q">q</a></body></html>', "https://a.org/"), "[q](https://b.org/q)");
  });

  it("images by URL, never inlined", () => {
    assert.equal(md('<img src="pic.jpg" alt="A [pic]">', "https://ex.org/a/"), "![A pic](https://ex.org/a/pic.jpg)");
    assert.equal(md('<img src="data:image/png;base64,AAAA" alt="x">'), "");
  });

  it("lists nest, number, and keep their start", () => {
    assert.equal(md("<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>"), "- a\n- b\n  - c");
    assert.equal(md('<ol start="3"><li>x</li><li>y</li></ol>'), "3. x\n4. y");
    // Unclosed <li>, as pages actually write them.
    assert.equal(md("<ul><li>a<li>b</ul>"), "- a\n- b");
    // A loose item keeps its paragraphs, hung under the marker.
    assert.equal(md("<ol><li><p>one</p><p>two</p></li></ol>"), "1. one\n\n   two");
  });

  it("block quotes and fenced code", () => {
    assert.equal(md("<blockquote><p>q1</p><p>q2</p></blockquote>"), "> q1\n>\n> q2");
    assert.equal(md('<pre><code class="language-ts">const a = 1;\n  if (a &lt; 2) {}</code></pre>'), "```ts\nconst a = 1;\n  if (a < 2) {}\n```");
    // Backticks inside the code lengthen the fence.
    assert.equal(md("<pre>```\nx\n```</pre>"), "````\n```\nx\n```\n````");
  });

  it("the simplest tables", () => {
    assert.equal(
      md("<table><tr><th>a</th><th>b|c</th></tr><tr><td>1</td><td>2</td></tr></table>"),
      "| a | b\\|c |\n| --- | --- |\n| 1 | 2 |",
    );
  });

  it("drops what is not content", () => {
    const page =
      "<html><head><title>T</title><style>p{}</style><script>var x = '<p>no</p>';</script></head>" +
      "<body><nav><a href='/'>home</a></nav><main><p>Real.</p><svg><text>no</text></svg>" +
      "<button>Click</button><form><input value='x'><textarea>no</textarea></form></main><footer>f</footer></body></html>";
    assert.equal(md(page), "Real.");
    assert.equal(md("<!-- c --><!DOCTYPE html><p>a</p>"), "a");
  });

  it("prefers <article>, then <main>, then the body; a fragment is itself", () => {
    assert.equal(md("<body><aside>side</aside><article><p>art</p></article></body>"), "art");
    assert.equal(md("<body><p>whole</p></body>"), "whole");
    assert.equal(md("<div>frag<p>ment</p></div>"), "frag\n\nment");
  });

  it("escapes Markdown's own marks in prose, but not mid-word underscores", () => {
    assert.equal(md("<p>2 * 3 [cite] snake_case _lead trail_ a&lt;b</p>"), "2 \\* 3 \\[cite\\] snake_case \\_lead trail\\_ a\\<b");
    assert.equal(md("<p># not a heading</p><p>&gt; not a quote</p><p>1. not a list</p><p>- nor this</p>"), "\\# not a heading\n\n\\> not a quote\n\n1\\. not a list\n\n\\- nor this");
    assert.equal(md("<p>a > b and #tag stay</p>"), "a > b and #tag stay");
  });

  it("decodes entities, keeps unknown ones visible, and honours <br>", () => {
    assert.equal(decodeEntities("&amp;&#65;&#x42;&mdash;&nbsp;&bogus;"), "&AB\u2014\u00a0&bogus;");
    assert.equal(md("<p>a<br>b</p>"), "a  \nb");
  });

  it("names the page", () => {
    assert.equal(htmlTitle("<html><head><title> A &amp;\n B </title></head></html>"), "A & B");
    assert.equal(htmlTitle("<p>none</p>"), null);
  });

  it("closes an unclosed row when the next one opens, so every row of an old-style table survives", () => {
    assert.equal(
      htmlToMarkdown("<table><tr><td>a<td>b<tr><td>c<td>d</table>"),
      "| a | b |\n| --- | --- |\n| c | d |",
    );
    assert.equal(htmlToMarkdown("<ul><li>one<ul><li>inner<li>inner2</ul><li>two</ul>"), "- one\n  - inner\n  - inner2\n- two");
  });

  it("caps the depth a crafted page can nest, and keeps the words", () => {
    const deep = `${"<div>".repeat(50_000)}deep${"</div>".repeat(50_000)}`;
    assert.equal(htmlToMarkdown(deep), "deep");
    const open = `${"<span>".repeat(50_000)}still here`;
    assert.equal(htmlToMarkdown(open), "still here");
  });

  it("never throws on rubbish", () => {
    for (const junk of ["<", "<<>>", "</p></div>", "<p", "<a href='x", "<pre>", "<ul><ol></li>", "\u0000"]) {
      assert.doesNotThrow(() => md(junk), junk);
    }
  });
});
