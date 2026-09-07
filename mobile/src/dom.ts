import { brandMarkSvg } from "../../shared/brandMark.ts";
/** Four lines of DOM plumbing, so the two screens below can be written as
 *  structure instead of as string concatenation. Text always arrives through
 *  `textContent`: a site name and a host both come off the network, and an
 *  `innerHTML` here would be an injection hole in the one screen that exists to
 *  be careful about which server it trusts. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: className, ...rest } = props;
  if (className) node.className = className;
  Object.assign(node, rest);
  for (const child of children) node.append(child);
  return node;
}

/** The one place raw markup is allowed: inline icons, authored here, never
 *  interpolated. */
export function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("aria-hidden", "true");
  const d = document.createElementNS("http://www.w3.org/2000/svg", "path");
  d.setAttribute("d", path);
  svg.append(d);
  return svg;
}


/** The astrolabe and the name, the one mark this app has — drawn from the
 *  same numbers as everywhere else (shared/brandMark.ts), never the old
 *  product's star. */
export function wordmark(name: string, extraClass = ""): HTMLElement {
  const holder = el("span", { class: "star" });
  holder.innerHTML = brandMarkSvg({ size: 24 });
  return el("h1", { class: `wordmark ${extraClass}`.trim() }, holder, el("span", { textContent: name }));
}
