// THE TAG TREE — nested tags (`zettel/seed`) as a tree with counts.
//
// The sidebar's shelf listed every tag as a flat pill sorted by count, so
// a vault filed under `book/fiction/…` and `book/history/…` showed forty
// pills that all began with "book/". A tree shows `book` once, with the
// count of everything under it, and opens to its children on a click —
// the way Obsidian's tag pane reads. Pure, tested; the sidebar only draws.

export interface TagNode {
  /** The last segment ("seed"). */
  name: string;
  /** The full tag ("zettel/seed") — what a click filters by. */
  tag: string;
  /** Notes carrying this exact tag. */
  own: number;
  /** Notes carrying this tag or any tag under it. */
  count: number;
  children: TagNode[];
}

export type TagSort = "count" | "name";

/** Build the tree from `{ tag, count }` rows; children sorted like the top. */
export function tagTree(rows: readonly { tag: string; count: number }[], sort: TagSort = "count"): TagNode[] {
  const roots = new Map<string, TagNode>();
  const nodeFor = (full: string): TagNode => {
    const parts = full.split("/").filter((p) => p !== "");
    let level = roots;
    let node: TagNode | undefined;
    let path = "";
    for (const part of parts) {
      path = path === "" ? part : `${path}/${part}`;
      node = level.get(part);
      if (!node) {
        node = { name: part, tag: path, own: 0, count: 0, children: [] };
        level.set(part, node);
      }
      level = childMap(node);
    }
    return node ?? { name: full, tag: full, own: 0, count: 0, children: [] };
  };
  for (const row of rows) {
    const node = nodeFor(row.tag);
    node.own += row.count;
  }
  const finish = (node: TagNode): number => {
    node.children = [...childMap(node).values()];
    let total = node.own;
    for (const child of node.children) total += finish(child);
    node.count = total;
    sortNodes(node.children, sort);
    return total;
  };
  const out = [...roots.values()];
  for (const n of out) finish(n);
  sortNodes(out, sort);
  return out;
}

const CHILDREN = new WeakMap<TagNode, Map<string, TagNode>>();
function childMap(node: TagNode): Map<string, TagNode> {
  let m = CHILDREN.get(node);
  if (!m) {
    m = new Map();
    CHILDREN.set(node, m);
  }
  return m;
}

function sortNodes(nodes: TagNode[], sort: TagSort): void {
  nodes.sort((a, b) => (sort === "count" ? b.count - a.count || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)));
}

/** Flatten the tree for a list with roving focus: the open branches only. */
export function flattenTagTree(nodes: TagNode[], open: ReadonlySet<string>, depth = 0): { node: TagNode; depth: number }[] {
  const out: { node: TagNode; depth: number }[] = [];
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children.length > 0 && open.has(node.tag)) out.push(...flattenTagTree(node.children, open, depth + 1));
  }
  return out;
}
