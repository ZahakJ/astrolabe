# LaTeX notes

*`.tex` and `.latex` files are notes, not imports — edited, published, searched and linked exactly as markdown is.*

← [Back to the README](../README.md) · [All docs](README.md)

---

LaTeX is the typesetting language scientists and mathematicians write papers in; a `.tex` file is
its source. In Astrolabe a `.tex` file is a **note**, not something imported and converted. It is in
the tree, in search, in the graph, in the backlinks panel, in the tag counts, in the post list and
in the RSS feed, and it publishes to the blog exactly as a `.md` note does: the same typography, the
same themes, the same visitor scoping, in both languages. And it still compiles with `pdflatex`,
because everything Astrolabe adds is either a LaTeX comment or a macro you can ship beside the file.

- **Live-preview editor.** CodeMirror's `stex` mode, themed to whichever of the forty-six themes you
  are in, with the same bargain the markdown editor makes: the line the caret is on shows raw TeX,
  and every other line reads as the thing it becomes. Section headings are set in serif;
  `\emph`, `\textbf` and `\texttt` render; `\item` becomes a bullet or its number; `$…$` and display
  environments are typeset by KaTeX; `\cite` is a chip; and `\begin{figure}` shows **the actual
  image from your vault** with its caption. (Section and equation *numbers* belong to the reading
  view. They are a property of the whole document, and a number that renumbered itself as you typed
  above it would be a distraction rather than a preview; the outline panel beside the editor prints
  them.) Fold any environment or section from the chevron beside it. Autocomplete covers
  `\note{`, `\ref{`, `\cite{` and `\begin{` (which writes the matching `\end` for you).
- **The formatting keys write LaTeX here.** `Ctrl/Cmd B` in a `.tex` note writes `\textbf{…}`, not
  `**…**`; `Ctrl/Cmd I` writes `\emph{…}`; inline code is `\texttt{…}`; "Heading 2" is
  `\subsection{…}`; a bulleted list is an `itemize` environment; and a wikilink is `\note{…}`.
  Strikethrough, highlight, the task list and the colour swatches are **absent** from the menu in a
  `.tex` note rather than approximated: LaTeX cannot spell them without a package your document may
  not load, and a key that quietly writes something neither Astrolabe nor `pdflatex` can render is
  worse than a key that does nothing.
- **Reading and publishing.** Rendered in the same visual language as markdown: numbered sections,
  numbered equations, "Figure 1" captions, theorem boxes, resolved cross-references, a `\bibitem`
  bibliography, footnotes. The outline panel follows the `\section` hierarchy.
- **Frontmatter that pdflatex ignores.** A comment block at the top of the file:
  ```latex
  %---
  % publish: true
  % tags: [physics, fourier]
  % banner: "Media/heat.png"
  %---%
  ```
  or, if you would rather write a macro, `\astrolabe{publish=true, citekey=fourier1822}`.
- **Links, three ways.** `\note{Fourier Transform}` and `\note[the transform]{Fourier Transform}`
  are Astrolabe's own macro (ship [`astrolabe.sty`](#astrolabesty) beside the file and it compiles
  anywhere). `%% [[Private Scratch]] %%` is a link the PDF never shows. And an existing project
  lights up **unmodified**, because `\input`, `\include`, `\cite`, `\ref` and `\eqref` already say
  what they mean: Astrolabe simply extends their search path to the vault, local definitions first,
  so importing a project can never change how it compiles.
- **One anchor space.** A markdown heading and a LaTeX `\label` are the same kind of thing, so
  `[[Heat Equation#eq:fourier]]` and `\note{Notes\#Derivation}` are one lookup in either direction,
  and `![[Heat Equation#eq:fourier]]` transcludes **just that equation**, rendered by KaTeX, into a
  markdown note.

A `.tex` note takes the site's [text direction](arabic-and-rtl.md#note-direction--alignment), so an
Arabic paper is written right to left, but it refuses the alignment setting: its source is markup
from end to end.

## `astrolabe.sty`

The dozen lines that make `\note{…}` compile outside Astrolabe. Download it from your own instance
at `/api/astrolabe.sty` (or "LaTeX: download astrolabe.sty" in the command palette), drop it beside
your document, and add `\usepackage{astrolabe}`. Without it the file still opens in Astrolabe; with
it, `pdflatex` renders the very same file.

## What renders, and what does not

An honest boundary beats a leaky claim of "full LaTeX". Anything not listed below is **passed
through as a quiet inline marker**, never as raw source and never as a crash, and a document that
cannot be parsed still opens, is listed, publishes and is searchable by its title.

| | |
| --- | --- |
| **Structure** | `\part` `\chapter` `\section` `\subsection` `\subsubsection` `\paragraph` `\subparagraph` (starred forms unnumbered), `\appendix`, `\maketitle` with `\title`/`\author`/`\date`, `abstract`, `\tableofcontents`, `\label` anywhere |
| **Text** | `\emph` `\textit` `\textbf` `\texttt` `\textsc` `\textsf` `\underline`, `\footnote`, `\\` breaks, `~`, `--`/`---`, ` ``…'' ` quotes, accents (`\'e` `\"o` `\c{c}` …), `\LaTeX` and the common symbol macros, `\url` and `\href` |
| **Lists** | `itemize`, `enumerate` (numbered), `description` |
| **Maths** | `$…$`, `\(…\)`, `\[…\]`, `$$…$$`, `equation` `align` `gather` `multline` `alignat` `flalign` `eqnarray` `displaymath` and their starred forms, `aligned` `gathered` `split` `cases` `array` and the matrix family — all through KaTeX, with **Astrolabe's own equation numbering** (KaTeX restarts its counter per block, which would print "(1)" for every equation in a paper) and `\nonumber`/`\notag` honoured |
| **Floats** | `figure` with `\includegraphics` (extension optional, resolved against your vault) and `\caption`; `table` with `tabular`/`tabularx`/`longtable`, `\multicolumn`, alignment from the column spec |
| **Blocks** | `quote` `quotation` `verse`, `center`, `verbatim` `lstlisting` `minted` (highlighted), `thebibliography` with `\bibitem` |
| **Theorems** | `theorem` `lemma` `proposition` `corollary` `definition` `remark` `example` `proof` and friends, numbered, with the optional `[title]` |
| **Macros** | `\newcommand`/`\renewcommand` with up to nine arguments and an optional default — expanded in text, and handed to KaTeX for maths |
| **Ignored** | preamble furniture (`\documentclass`, `\usepackage`, `\setlength`, `\hypersetup`, spacing commands, `\index`, `\nocite`) — consumed silently, never printed |

Known simplifications, stated up front rather than left for you to discover: numbering is
article-style (`1`, `1.1`, `1.1.1`) whatever the document class; `\ref` prints a number for a label
in the same note, and the target's *title* when the label is in another note, because a bare "1"
means nothing in someone else's paper; and BibTeX is not run, so `\cite` resolves against a
`\bibitem` in the document or a note carrying that `citekey:`, and is otherwise left alone.
