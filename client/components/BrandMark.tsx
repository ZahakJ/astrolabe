// The product's mark, for React surfaces. A constant SVG string from
// shared/brandMark.ts, set once per size; nothing in it comes from a user.
import { useMemo } from "react";
import { brandMarkSvg, type BrandMarkOptions } from "../../shared/brandMark.ts";

export default function BrandMark(props: BrandMarkOptions & { style?: React.CSSProperties }) {
  const { style, ...opts } = props;
  const html = useMemo(() => brandMarkSvg(opts), [opts.size, opts.detail, opts.color, opts.className, opts.title]);
  return <span className="s-brandmark" style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}
