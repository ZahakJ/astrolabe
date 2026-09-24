// THE WAY BACK, ON A PHONE: the chrome-language key for a screen's top bar.
//
// The desktop's lives on its status bar; the phone has none, so this sits in
// the top bar of the two screens a lost reader goes looking on — More, and
// Settings — before any list, in reach without a scroll. Same rule as the
// desktop's (client/chromeLangSwitch.ts): the face is the language a
// tap goes TO, in its own script (`ع` from English, `EN` from Arabic), and
// its name is both sentences, because only one dictionary is on the page.
// A 44px target around a key-shaped face; admin only — a visitor's language
// is the public site's own switch.

import { chromeLangSwitch } from "../chromeLangSwitch.ts";
import { useStore } from "../state.ts";

export default function LangPill() {
  const admin = useStore((s) => s.admin);
  const language = useStore((s) => s.language);
  if (!admin) return null;
  const sw = chromeLangSwitch(language);
  return (
    <button
      type="button"
      className="s-ph-lang"
      data-testid="chrome-lang"
      lang={sw.target}
      title={sw.title}
      aria-label={sw.title}
      onClick={() => useStore.getState().toggleChromeLang()}
    >
      <span className="s-ph-lang__key" dir={sw.target === "ar" ? "rtl" : "ltr"} aria-hidden="true">
        {sw.glyph}
      </span>
    </button>
  );
}
