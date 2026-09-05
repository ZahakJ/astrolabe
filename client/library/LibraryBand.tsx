// The shelf's band on a home page — up to six covers and the door to the
// rest. Off by default (settings.library.home): the blog is for writing and
// stays quiet, and the navigation's door is the way in. On, it sits where
// the collections band sits, for the reason that band gives: a structure the
// owner declared goes above the list it leads.
import { libraryUrl } from "../../shared/library.ts";
import { t } from "../i18n.ts";
import { useStore } from "../state.ts";
import { NavLink } from "../blog/util.tsx";
import LibraryCover from "./LibraryCover.tsx";
import { useLibrary } from "./libraryData.ts";
import "../styles/library-band.css";

const BAND_MAX = 6;

export default function LibraryBand() {
  const door = useStore((s) => s.library);
  useStore((s) => s.language);
  const shelf = useLibrary();
  if (!door || !door.home) return null;
  if (!shelf || shelf.length === 0) return null;
  const title = door.title || t("libraryTitle");
  return (
    <section className="s-lib-band" aria-label={title}>
      <h2 className="s-blog-heading s-blog-heading--library">
        <span>{title}</span>
      </h2>
      <div className="s-lib-band__row">
        {shelf.slice(0, BAND_MAX).map((path) => (
          <NavLink key={path.id} url={libraryUrl(path.slug)} className="s-lib-band__item">
            <LibraryCover title={path.title} kind={path.kind} cover={path.cover} size="band" />
            <span className="s-lib-band__title" dir="auto">
              {path.title}
            </span>
          </NavLink>
        ))}
        {shelf.length > BAND_MAX && (
          <NavLink url={libraryUrl()} className="s-lib-band__item s-lib-band__item--more">
            <span className="s-lib-band__more">{t("libraryAll")}</span>
          </NavLink>
        )}
      </div>
    </section>
  );
}
