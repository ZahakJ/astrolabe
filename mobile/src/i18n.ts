/**
 * The shell's whole vocabulary, in the two languages the web client speaks.
 *
 * It is a flat map rather than a framework because the shell is two screens
 * long and gains nothing from a loader, a namespace or a plural engine. What it
 * DOES share with the app is tone: no exclamation marks, no "Oops", no blame.
 * An error here names what was tried, what happened, and what to do next.
 */
export type Lang = "en" | "ar";

const en = {
  wordmark: "Astrolabe",
  connectLede: "Point this at your vault.",
  serverLabel: "Server address",
  serverHint: "A bare name is assumed to be https. Addresses on your own network are assumed to be http.",
  serverPlaceholder: "astrolabe.example.com",
  connect: "Connect",
  connecting: "Connecting…",
  connectingTo: (host: string) => `Connecting to ${host}…`,
  chooseAnother: "Choose another server",
  savedTitle: "Saved servers",
  forget: "Forget",
  forgetOne: (host: string) => `Forget ${host}`,
  signInNote: "This vault asks for a password. You will be asked for it there.",

  errEmpty: "Type the address of your Astrolabe server.",
  errScheme: "Only http and https addresses can be opened.",
  errUrl: "That is not an address this can open.",
  errUnreachable: (host: string) => `Could not reach ${host}. Check the address, and that the server is running.`,
  errTimeout: (host: string) => `${host} did not answer in time. It may be asleep, or on a network this phone cannot see.`,
  errNotAstrolabe: (host: string) => `${host} answered, but not as an Astrolabe server.`,
  errStatus: (host: string, status: number) => `${host} answered with ${status}.`,

  captureTitle: "Capture",
  captureLede: (host: string) => `To ${host}`,
  captureNoteLabel: "Note",
  captureBody: "Text",
  captureSave: "Save to inbox",
  captureSaving: "Saving…",
  captureSaved: "Saved.",
  captureCancel: "Cancel",
  captureEmpty: "Nothing was shared.",
  captureNoServer: "No server yet. Open Astrolabe and connect first.",
  captureFailed: "The server refused the write. Nothing was saved.",
  captureUnauthorized: (host: string) => `${host} did not recognise this session. Open Astrolabe, sign in, and share again.`,
  captureTargetIs: (path: string) => `Appending to ${path}`,

  // ── The pocket vault: a repository from GitHub, opened on the phone ───────
  pocketTitle: "A vault from GitHub",
  pocketLede: "No server of your own? Open a private repository instead.",
  pocketStart: "Sign in with GitHub",
  pocketSigningIn: "Asking GitHub…",
  pocketCodeLede: "Open this page on any device and type the code:",
  pocketCodeWaiting: "Waiting for you to approve it on github.com…",
  pocketCodeExpired: "That code ran out. Ask for another.",
  pocketCodeDenied: "The sign-in was refused on github.com.",
  pocketScopeNote: "Astrolabe asks for one permission: read and write your repositories. Nothing else.",
  pocketNoClientId: "This build has no GitHub app id. See mobile/README.md — 'A vault from GitHub'.",
  pocketPickRepo: "Which repository is your vault?",
  pocketPickBranch: "Branch",
  pocketSearchRepos: "Search your repositories",
  pocketNoRepos: "No repositories on this account.",
  pocketPrivate: "Private",
  pocketClone: "Open this vault",
  pocketCloning: (phase: string) => `Copying the vault… ${phase}`,
  pocketCloneFailed: "The vault could not be copied. Check the network and try again.",
  pocketOpen: (name: string) => `Open ${name}`,
  pocketSignedInAs: (login: string) => `Signed in as ${login}`,
  pocketSignOut: "Sign out of GitHub",
  pocketForget: "Forget this vault",
  pocketForgetNote: "The copy on this phone is deleted. Your repository is untouched.",
  pocketOrInstance: "or connect to your own server",
  pocketOrGithub: "or open a vault from GitHub",
  pocketStartOver: "Start again",
  pocketAnotherRepo: "Choose another repository",

  // The one line the vault ever says about itself. Never optimistic: see
  // src/pocket/sync.ts for the order these are decided in.
  syncing: "Checking GitHub…",
  pushing: "Sending your changes…",
  offline: "Offline. Your changes are safe on this phone.",
  never: "Not sent yet.",
  syncedJustNow: "Synced just now.",
  syncFailed: "Could not reach GitHub. Tap to try again.",
  syncConflicts: (n: number) => `${n} note${n === 1 ? "" : "s"} changed in both places. Both versions are kept.`,
  syncToPush: (n: number) => `${n} change${n === 1 ? "" : "s"} to send. Tap to send now.`,
  syncedAgo: (n: number) => `Synced ${n} minute${n === 1 ? "" : "s"} ago.`,
};

type Copy = typeof en;

const ar: Copy = {
  wordmark: "أسطرلاب",
  connectLede: "وجّه هذا إلى خزانتك.",
  serverLabel: "عنوان الخادم",
  serverHint: "الاسم المجرّد يُفترض https. وعناوين شبكتك المحليّة تُفترض http.",
  serverPlaceholder: "astrolabe.example.com",
  connect: "اتّصل",
  connecting: "…جارٍ الاتّصال",
  connectingTo: (host: string) => `…جارٍ الاتّصال بـ ${host}`,
  chooseAnother: "اختر خادمًا آخر",
  savedTitle: "الخوادم المحفوظة",
  forget: "انسَ",
  forgetOne: (host: string) => `انسَ ${host}`,
  signInNote: "هذه الخزانة تطلب كلمة مرور. ستُسأل عنها هناك.",

  errEmpty: "اكتب عنوان خادم أسطرلاب.",
  errScheme: "لا يمكن فتح غير عناوين http و https.",
  errUrl: "هذا ليس عنوانًا يمكن فتحه.",
  errUnreachable: (host: string) => `تعذّر الوصول إلى ${host}. تحقّق من العنوان ومن أنّ الخادم يعمل.`,
  errTimeout: (host: string) => `لم يُجب ${host} في الوقت المتاح. قد يكون نائمًا أو على شبكة لا يراها هذا الهاتف.`,
  errNotAstrolabe: (host: string) => `أجاب ${host}، لكن ليس بوصفه خادم أسطرلاب.`,
  errStatus: (host: string, status: number) => `أجاب ${host} بالرمز ${status}.`,

  captureTitle: "التقاط",
  captureLede: (host: string) => `إلى ${host}`,
  captureNoteLabel: "ملاحظة",
  captureBody: "النص",
  captureSave: "احفظ في الوارد",
  captureSaving: "…جارٍ الحفظ",
  captureSaved: "حُفظ.",
  captureCancel: "ألغِ",
  captureEmpty: "لم تُشارَك أيّ مادّة.",
  captureNoServer: "لا خادم بعد. افتح أسطرلاب واتّصل أوّلًا.",
  captureFailed: "رفض الخادم الكتابة. لم يُحفظ شيء.",
  captureUnauthorized: (host: string) => `لم يتعرّف ${host} على هذه الجلسة. افتح أسطرلاب وسجّل الدخول ثمّ شارك مجدّدًا.`,
  captureTargetIs: (path: string) => `يُلحق بـ ${path}`,

  // ── الخزانة في الجيب: مستودع من GitHub يُفتح على الهاتف ───────────────────
  pocketTitle: "خزانة من GitHub",
  pocketLede: "لا خادم لك؟ افتح مستودعًا خاصًّا بدلًا من ذلك.",
  pocketStart: "سجّل الدخول بـ GitHub",
  pocketSigningIn: "…نسأل GitHub",
  pocketCodeLede: "افتح هذه الصفحة على أيّ جهاز واكتب الرمز:",
  pocketCodeWaiting: "…ننتظر موافقتك على github.com",
  pocketCodeExpired: "انتهت صلاحيّة الرمز. اطلب رمزًا آخر.",
  pocketCodeDenied: "رُفض تسجيل الدخول على github.com.",
  pocketScopeNote: "يطلب أسطرلاب إذنًا واحدًا: قراءة مستودعاتك والكتابة فيها. لا غير.",
  pocketNoClientId: "لا معرّف تطبيق GitHub في هذا البناء. انظر mobile/README.md قسم «A vault from GitHub».",
  pocketPickRepo: "أيّ مستودع هو خزانتك؟",
  pocketPickBranch: "الفرع",
  pocketSearchRepos: "ابحث في مستودعاتك",
  pocketNoRepos: "لا مستودعات في هذا الحساب.",
  pocketPrivate: "خاصّ",
  pocketClone: "افتح هذه الخزانة",
  pocketCloning: (phase: string) => `…نسخ الخزانة ${phase}`,
  pocketCloneFailed: "تعذّر نسخ الخزانة. تحقّق من الشبكة وحاول مرّة أخرى.",
  pocketOpen: (name: string) => `افتح ${name}`,
  pocketSignedInAs: (login: string) => `مسجَّل الدخول باسم ${login}`,
  pocketSignOut: "اخرج من GitHub",
  pocketForget: "انسَ هذه الخزانة",
  pocketForgetNote: "تُحذف النسخة التي على الهاتف. ولا يُمسّ مستودعك.",
  pocketOrInstance: "أو اتّصل بخادمك أنت",
  pocketOrGithub: "أو افتح خزانة من GitHub",
  pocketStartOver: "ابدأ من جديد",
  pocketAnotherRepo: "اختر مستودعًا آخر",

  syncing: "…نتحقّق من GitHub",
  pushing: "…نرسل تغييراتك",
  offline: "لا اتّصال. تغييراتك محفوظة على هذا الهاتف.",
  never: "لم تُرسَل بعد.",
  syncedJustNow: "تمّت المزامنة الآن.",
  syncFailed: "تعذّر الوصول إلى GitHub. انقر لإعادة المحاولة.",
  syncConflicts: (n: number) => `${n} من الملاحظات تغيّرت في المكانين. النسختان محفوظتان.`,
  syncToPush: (n: number) => `${n} من التغييرات لم تُرسَل. انقر للإرسال الآن.`,
  syncedAgo: (n: number) => `تمّت المزامنة قبل ${n} من الدقائق.`,
};

/** The phone's language, narrowed to the two the app has words for. */
export function pickLang(): Lang {
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    if (typeof tag === "string" && tag.toLowerCase().startsWith("ar")) return "ar";
  }
  return "en";
}

export const lang: Lang = pickLang();
export const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";
export const t: Copy = lang === "ar" ? ar : en;

/** The sync line's words, as a function so the pocket page can ask for them
 *  after `lang` has settled — the page boots before the client does, and the
 *  line it paints is the shell's, in the shell's language. */
export function pocketWords(): Copy {
  return t;
}
