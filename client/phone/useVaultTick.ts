// A number that moves when the vault does: the server's `astrolabe:vault`
// event (a note written here, in another window, or by a sync), a beat after
// a burst settles. A phone screen that reads a list from the server — Today,
// the decks, the sigils, the trackers — puts it in its fetch's dependencies,
// so a tick taken on the desktop shows on the phone without a pull.

import { useEffect, useState } from "react";

const VAULT_EVENT = "astrolabe:vault";

export function useVaultTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const on = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setTick((n) => n + 1), 400);
    };
    window.addEventListener(VAULT_EVENT, on);
    return () => {
      window.removeEventListener(VAULT_EVENT, on);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return tick;
}
