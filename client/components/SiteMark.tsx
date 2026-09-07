// THE ONE MARK EVERY EMPTY SURFACE WEARS.
//
// The site's own logo when the owner set one (Settings → Site), else the
// desktop app's own icon when the reader gave it one (Settings → Device →
// This app), else the product's astrolabe. The four-pointed star that used to
// stand in these places was the old product's wordmark, and a friend's vault
// wearing a star it had never chosen was the complaint (the owner: "I still
// see the star icon in some places as a leftover from vellum days"). The
// publish star (✦ on a published note) is a different thing — a glyph with a
// meaning, not a mark — and stays.
import BrandMark from "./BrandMark.tsx";
import { useBannerSrc } from "./BannerImg.tsx";
import { useStore } from "../state.ts";

export default function SiteMark({ size = 24, className }: { size?: number; className?: string }) {
  const logo = useStore((s) => s.logo);
  const desktopIcon = useStore((s) => s.desktopBrandIcon);
  const src = useBannerSrc(logo).src ?? desktopIcon;
  if (src) {
    return (
      <img
        className={`s-sitemark${className ? ` ${className}` : ""}`}
        src={src}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }
  return <BrandMark size={size} className={className} />;
}
