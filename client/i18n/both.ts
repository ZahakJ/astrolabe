// BOTH LANGUAGES, INSTALLED AT IMPORT — for code that runs outside a page.
//
// A page fetches one dictionary at a time (client/i18n.ts, loadDictionary).
// The desktop's native menu, the test suite and the scripts that print the
// settings index run under Node, where there is no chunk to fetch and where
// both languages are wanted at once, so they import this file first:
//
//   import "../client/i18n/both.ts";
//
// Never from client code: it would put both dictionaries back in whatever
// chunk imported it (check-bundle refuses it in every first paint).

import { installDictionary } from "../i18n.ts";
import ar from "./ar.ts";
import en from "./en.ts";

installDictionary("en", en);
installDictionary("ar", ar);
