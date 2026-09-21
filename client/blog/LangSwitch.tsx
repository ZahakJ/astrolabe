// The visitor's EN/ع switch — shown only when the instance opted in
// (settings.languageToggle; off by default, so nothing about the public site
// changes for anyone who leaves it alone).
//
// It shows the language it would switch TO, in that language's own script,
// the way a language picker reads to the person who needs it. The words go in
// title/aria-label, because two letters of gold in a nav is as loud as this
// should ever be.

import { otherLang } from "../langPref.ts";
import { t } from "../i18n.ts";
import { useStore } from "../state.ts";
import { go } from "./nav.ts";
import { notePathToUrl } from "../router.ts";
import type { TwinFaceRef } from "../../shared/types.ts";

/** `swapTo` is the other FACE of the post the reader is on (shared/twins.ts),
 *  when this post has one in the other language. The shell resolves it,
 *  because only the shell knows which post is on screen. */
export default function LangSwitch({ swapTo }: { swapTo?: TwinFaceRef | null }) {
  const enabled = useStore((s) => s.languageToggle);
  const language = useStore((s) => s.language);
  if (!enabled) return null;
  const target = otherLang(language);
  return (
    <button
      type="button"
      className="s-blog-lang"
      lang={target}
      // The target label is always in the target's script, so it keeps its
      // own direction regardless of which way the shell is facing.
      dir={target === "ar" ? "rtl" : "ltr"}
      title={t("blogSwitchLanguage")}
      aria-label={t("blogSwitchLanguage")}
      onClick={() => {
        useStore.getState().setVisitorLang(target);
        // THE SWITCH IS ABOUT THIS PIECE, NOT ABOUT THE SITE. A reader on an
        // English post who taps ع means "give me this in Arabic" — and when
        // the post has an Arabic face, that is a place we can actually take
        // them. Without this they stayed on an English address the filter had
        // just stopped serving them, or were dropped at the home page.
        //
        // Only towards the face that IS in the target language: a pair of two
        // English faces is two posts, and turning one into the other would be
        // the switch answering a question nobody asked.
        if (swapTo && swapTo.lang === target) go(notePathToUrl(swapTo.path));
      }}
    >
      {/* The label is its own box so the naskh ain can be nudged up off its
          overshooting baseline without moving the button around it. */}
      <span className="s-blog-lang__label" aria-hidden="true">
        {target === "ar" ? "ع" : "EN"}
      </span>
    </button>
  );
}
