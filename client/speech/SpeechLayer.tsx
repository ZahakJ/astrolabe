// Read aloud's one mount (docs/read-aloud.md): the chip under a reading
// selection and the floating player, lazy in every shell so neither is in a
// first paint. The owner always gets the chip — with nothing installed the
// player reads with the device's voices and says so. A visitor gets it only
// when the owner turned on "Readers may listen" (Settings → Publishing),
// which the server answers in one boolean.

import { useEffect, useState } from "react";
import { speakStatus } from "../api.ts";
import SpeakChip from "./SpeakChip.tsx";
import SpeechPlayer from "./SpeechPlayer.tsx";

/** `phone`: the phone shell, where the chip also answers an editor
 *  selection (the desktop editor has its selection menu). */
export default function SpeechLayer({ owner, phone = false }: { owner: boolean; phone?: boolean }) {
  const [visitorMay, setVisitorMay] = useState(false);
  useEffect(() => {
    if (owner) return;
    let live = true;
    speakStatus().then(
      (s) => {
        if (live) setVisitorMay("public" in s && s.public === true);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [owner]);
  return (
    <>
      <SpeakChip enabled={owner || visitorMay} editor={phone && owner} />
      <SpeechPlayer />
    </>
  );
}
