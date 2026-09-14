// ONE ELEMENT BUILDER for the imperative renderers (the tracker card, the
// routine card, the query and tasks fences). Each of them grew its own copy;
// the review counted five. A tag, a class, optional text — nothing more,
// because the renderers build DOM by hand precisely to hold live references.
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
