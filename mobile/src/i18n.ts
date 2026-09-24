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

  // ── Voice notes (3.24.0) ───────────────────────────────────────────────────
  voiceTitle: "Or say it",
  voiceRecord: "Record",
  voiceStopSend: "Stop and send",
  voiceTapOrHold: "Tap to record, or hold to talk and let go to send.",
  voiceStarting: "Opening the microphone…",
  voiceListening: "Listening",
  voiceSend: "Send",
  voiceDiscard: "Discard",
  voiceDone: "Done",
  voiceSending: "Sending the recording…",
  voiceTranscribing: (host: string) => `Transcribing on ${host}…`,
  voiceStillWorking: (host: string) => `${host} is still transcribing; the words will land on their own.`,
  voiceLanded: (path: string) => `In ${path}.`,
  voiceKept: (path: string) => `The recording is in ${path}; it has no words yet.`,
  voiceSendFailed: "The server refused the recording. Nothing was saved.",
  voiceUnsupported: "This phone's WebView cannot record audio.",
  voiceDenied: "The microphone was refused. Allow it for Astrolabe in the phone's settings.",
  voiceNoMic: "No microphone was found.",
  voiceMicFailed: "The microphone could not be opened.",

  // ── The pocket vault: a repository from GitHub, opened on the phone ───────
  pocketLede: "No server of your own? Open a private repository instead.",
  pocketStart: "Sign in with GitHub",
  pocketSigningIn: "Asking GitHub…",
  pocketCodeLede: "Open this page on any device and type the code:",
  pocketCodeWaiting: "Waiting for you to approve it on github.com…",
  pocketCodeExpired: "That code ran out. Ask for another.",
  pocketCodeDenied: "The sign-in was refused on github.com.",
  pocketScopeNote: "Astrolabe asks for one permission: read and write your repositories. Nothing else.",
  pocketNoClientId: "Signing in with a GitHub button needs an app id baked into the build (mobile/README.md — 'A vault from GitHub'); a pasted token works in every build.",
  pocketTokenLabel: "Personal access token",
  pocketTokenHint: "Made on github.com under your profile's Developer settings, Personal access tokens. Fine-grained: Contents, read and write, on the repository that is your vault. Classic: the repo scope. It stays on this phone.",
  pocketTokenUse: "Use this token",
  pocketTokenBad: "GitHub did not accept that token.",
  pocketOr: "— or —",
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
  // The service worker's two answers when the page that holds the vault is
  // not there to ask (src/pocket/sw.ts): the client shows them as errors.
  pocketNotOpenYet: "The pocket vault is not open yet. It will be in a moment.",
  pocketNoAnswer: "The pocket vault did not answer. Try again.",

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

  // ── What a pocket vault refuses, and why (src/pocket/server.ts) ───────────
  // A 501 code:"pocket" carries one of these as its `error`, in the reader's
  // language (the client's <html lang>), and the client shows it as it came.
  refusePublish: "Publishing needs a server with a public address; a pocket vault has no visitors.",
  refuseBlog: "The blog is the public half of an instance, and a pocket vault has no public half.",
  refuseMarginalia: "Marginalia are written by visitors to a public site; a pocket vault has none.",
  refuseVisibility: "There is nothing to be visible to: a pocket vault is read by its owner alone.",
  refusePublicFolders: "Public folders are a shape of the published site, which a pocket vault has not got.",
  refuseLibrary: "The library shelf is part of the published site, which a pocket vault has not got.",
  refuseClipToken: "The clipper's token authorises a browser to write to a server over the network.",
  refuseFontUpload: "Uploaded fonts are served from the instance's data directory, which lives on a server.",
  refuseSyncStatus: "There is no server-side git to ask about: the pocket vault IS the repository, and its state is the shell's own sync line.",
  refuseSyncDrive: "There is no server-side git to drive: in a pocket vault the pull and the push belong to the shell, not to the client.",
  refuseSyncInit: "There is no server-side git to set up: a pocket vault is a clone of the repository you already chose.",
  refuseSnapshot: "Every save in a pocket vault is already a commit in the repository, so there is no snapshot left to take.",
  refuseTravel: "Travel copies an instance's data directory; a pocket vault has no data directory.",
  refuseDesigner: "The site designer composes a public site, which a pocket vault has not got.",
  refuseExport: "An export is a ZIP built on a server; on a phone the vault is already a git clone.",
  refuseDeckImport: "Importing a deck reads an uploaded .apkg on a server's disk.",
  refuseBulk: "The bulk rewriter runs over the whole vault on a server, with an undo log behind it.",
  refuseAnnotations: "PDF annotations are kept in the instance's data directory, which lives on a server.",
  refuseBooks: "The book shelf reads PDFs page by page on a server; a pocket vault opens a book file directly.",
  refuseScripture: "Scripture lookup reads a corpus the server ships; the pocket carries only your vault.",
  refuseSeed: "The starter vault is copied by a server from its own installation.",
  refuseSiteTheme: "The public site's theme describes visitors, and a pocket vault has none.",
  refuseTranscriber: "Transcription runs on an Astrolabe server's own machine; a pocket vault keeps the recording and links it from the day's inbox.",
  refuseFeeds: "Feeds are fetched by an Astrolabe server on its own schedule; a pocket vault reads the notes you kept.",
  refuseFederation: "Webmentions and the fediverse talk to a site at its public address; a pocket vault has no visitors to be mentioned by.",
  refuseImport: "Importing a Notion, Evernote or Obsidian export runs on an Astrolabe server's own disk; a pocket vault opens the notes it made.",
  refuseNoShell: "The pull and the push belong to the phone's shell, and this page has none.",
  refuseSignIn: "A pocket vault is opened by its owner's phone; there is nobody else to sign in as.",
  refuseMentions: "Unlinked mentions scan the whole vault per note; the pocket does not run that on a phone.",
  refuseUpload: "Uploading needs a multipart parser and a place to put bytes; the pocket takes attachments through the repository instead.",

  // The settings a pocket vault cannot keep: a PATCH carrying one is a 501
  // with the first one's reason, and nothing is written.
  keepGitSync: "The vault IS the repository here, and the phone's own sync drives it — see Backup & sync.",
  keepGitToken: "The repository's token belongs to the phone, not to the vault: it is never written into the notes.",
  keepGitUser: "The repository's account belongs to the phone, not to the vault.",
  keepPublicLayout: "A pocket vault has no public half, so there is no visitor layout to choose.",
  keepLanguageFilter: "The language filter curates PUBLIC surfaces, and a pocket vault has none.",
  keepLanguageToggle: "The EN/ع switch is offered to visitors, and a pocket vault has none.",
  keepTopics: "Categories are a shape of the published site, which a pocket vault has not got.",
  keepExcludeTags: "Excluded tags hide notes from visitors, and a pocket vault has none.",
  keepAuthorSites: "The author's other sites are cards on a public blog, which a pocket vault has not got.",
  keepShareButtons: "The share row sits under a public article, which a pocket vault has not got.",
  keepAmbient: "The ambient masthead is the public site's, which a pocket vault has not got.",
  keepDefaultTheme: "The default theme is what VISITORS land on; your own theme is on This device.",
  keepFooter: "The footer line is printed on a public site, which a pocket vault has not got.",
  keepFavicon: "A favicon is served by a site at its own address; the phone shows the app's icon.",
  keepFonts: "Catalog faces are downloaded and served by an instance; a pocket vault ships no font directory.",
  keepNoteVersions: "Every save here is already a commit, so the history is the repository's and never off.",
  keepPdfSearch: "Reading the text of every PDF is work an instance does on its own disk.",
  keepVoice: "Transcription runs on an instance's own machine; a pocket vault keeps every recording and runs no model.",
  keepWebmentions: "Webmentions are sent and received by a site at its public address; a pocket vault has none.",
  keepFediverse: "The fediverse follows a site at its public address; a pocket vault has none.",

  // A path the pocket will not touch (src/pocket/vaultIo.ts): a 400.
  vaultPathRequired: "A path is required.",
  vaultPathNotPath: "That path is not a path.",
  vaultPathLeaves: (path: string) => `That path leaves the vault: ${path}`,
  vaultPathRepository: "The repository is not part of the vault.",
};

export type Copy = typeof en;

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

  // ── الملاحظات الصوتية (3.24.0) ─────────────────────────────────────────────
  voiceTitle: "أو قُلها",
  voiceRecord: "سجّل",
  voiceStopSend: "أوقف وأرسل",
  voiceTapOrHold: "انقر للتسجيل، أو اضغط مطوّلًا وتكلّم ثمّ أفلت للإرسال.",
  voiceStarting: "…يفتح الميكروفون",
  voiceListening: "يستمع",
  voiceSend: "أرسل",
  voiceDiscard: "تجاهل",
  voiceDone: "تمّ",
  voiceSending: "…يرسل التسجيل",
  voiceTranscribing: (host: string) => `…يفرّغ التسجيل على ${host}`,
  voiceStillWorking: (host: string) => `ما زال ${host} يفرّغ التسجيل؛ وستصل الكلمات وحدها.`,
  voiceLanded: (path: string) => `في ${path}.`,
  voiceKept: (path: string) => `التسجيل في ${path}؛ ولا كلمات له بعد.`,
  voiceSendFailed: "رفض الخادم التسجيل. لم يُحفظ شيء.",
  voiceUnsupported: "لا يستطيع WebView هذا الهاتف تسجيل الصوت.",
  voiceDenied: "رُفض الوصول إلى الميكروفون. اسمح به لأسطرلاب من إعدادات الهاتف.",
  voiceNoMic: "لم يُعثر على ميكروفون.",
  voiceMicFailed: "تعذّر فتح الميكروفون.",

  // ── الخزانة في الجيب: مستودع من GitHub يُفتح على الهاتف ───────────────────
  pocketLede: "لا خادم لك؟ افتح مستودعًا خاصًّا بدلًا من ذلك.",
  pocketStart: "سجّل الدخول بـ GitHub",
  pocketSigningIn: "…نسأل GitHub",
  pocketCodeLede: "افتح هذه الصفحة على أيّ جهاز واكتب الرمز:",
  pocketCodeWaiting: "…ننتظر موافقتك على github.com",
  pocketCodeExpired: "انتهت صلاحيّة الرمز. اطلب رمزًا آخر.",
  pocketCodeDenied: "رُفض تسجيل الدخول على github.com.",
  pocketScopeNote: "يطلب أسطرلاب إذنًا واحدًا: قراءة مستودعاتك والكتابة فيها. لا غير.",
  pocketNoClientId: "تسجيل الدخول بزرّ GitHub يحتاج إلى معرّف تطبيق مضمَّن في البناء (mobile/README.md قسم «A vault from GitHub»)؛ أما الرمز الملصوق فيعمل في كل بناء.",
  pocketTokenLabel: "رمز وصول شخصي",
  pocketTokenHint: "يُصنع في github.com من Developer settings في حسابك، ثم Personal access tokens. الدقيق: Contents قراءةً وكتابةً على المستودع الذي هو خزانتك. الكلاسيكي: نطاق repo. ويبقى على هذا الهاتف.",
  pocketTokenUse: "استعمل هذا الرمز",
  pocketTokenBad: "لم يقبل GitHub هذا الرمز.",
  pocketOr: "— أو —",
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
  pocketNotOpenYet: "لم تُفتح الخزانة في الجيب بعد. ستُفتح بعد لحظة.",
  pocketNoAnswer: "لم تُجب الخزانة في الجيب. حاول مرّة أخرى.",

  syncing: "…نتحقّق من GitHub",
  pushing: "…نرسل تغييراتك",
  offline: "لا اتّصال. تغييراتك محفوظة على هذا الهاتف.",
  never: "لم تُرسَل بعد.",
  syncedJustNow: "تمّت المزامنة الآن.",
  syncFailed: "تعذّر الوصول إلى GitHub. انقر لإعادة المحاولة.",
  syncConflicts: (n: number) => `${n} من الملاحظات تغيّرت في المكانين. النسختان محفوظتان.`,
  syncToPush: (n: number) => `${n} من التغييرات لم تُرسَل. انقر للإرسال الآن.`,
  syncedAgo: (n: number) => `تمّت المزامنة قبل ${n} من الدقائق.`,

  // ── ما ترفضه الخزانة في الجيب، ولماذا ─────────────────────────────────────
  refusePublish: "النشر يحتاج إلى خادم له عنوان عامّ؛ والخزانة في الجيب لا زوّار لها.",
  refuseBlog: "المدوّنة هي النصف العامّ من الخادم، والخزانة في الجيب لا نصف عامًّا لها.",
  refuseMarginalia: "الحواشي يكتبها زوّار موقع عامّ؛ والخزانة في الجيب لا زوّار لها.",
  refuseVisibility: "لا أحد تظهر له: الخزانة في الجيب لا يقرؤها إلا صاحبها.",
  refusePublicFolders: "المجلّدات العامّة هيئةٌ من هيئات الموقع المنشور، والخزانة في الجيب لا موقع لها.",
  refuseLibrary: "رفّ المكتبة جزء من الموقع المنشور، والخزانة في الجيب لا موقع لها.",
  refuseClipToken: "رمز القصّاصة يأذن لمتصفّح بأن يكتب إلى خادم عبر الشبكة.",
  refuseFontUpload: "الخطوط المرفوعة تُقدَّم من مجلّد بيانات الخادم، وهو على خادم.",
  refuseSyncStatus: "لا git على خادم لتسأله: الخزانة في الجيب هي المستودع نفسه، وحالها سطر المزامنة في التطبيق.",
  refuseSyncDrive: "لا git على خادم لتديره: في الخزانة في الجيب السحب والدفع للتطبيق، لا للواجهة.",
  refuseSyncInit: "لا git على خادم لتهيّئه: الخزانة في الجيب نسخة من المستودع الذي اخترته.",
  refuseSnapshot: "كلّ حفظ في الخزانة في الجيب إيداعٌ في المستودع أصلًا، فلا لقطة بقيت لتؤخذ.",
  refuseTravel: "النقل ينسخ مجلّد بيانات الخادم؛ والخزانة في الجيب لا مجلّد بيانات لها.",
  refuseDesigner: "مصمّم الموقع يؤلّف موقعًا عامًّا، والخزانة في الجيب لا موقع لها.",
  refuseExport: "التصدير ملفّ ZIP يُبنى على خادم؛ وعلى الهاتف الخزانة نسخة git أصلًا.",
  refuseDeckImport: "استيراد رزمة يقرأ ملفّ apkg مرفوعًا إلى قرص خادم.",
  refuseBulk: "المحرِّر الجماعيّ يمرّ على الخزانة كلّها على خادم، ومن ورائه سجلّ للتراجع.",
  refuseAnnotations: "تعليقات PDF تُحفظ في مجلّد بيانات الخادم، وهو على خادم.",
  refuseBooks: "رفّ الكتب يقرأ ملفّات PDF صفحةً صفحة على خادم؛ والخزانة في الجيب تفتح ملفّ الكتاب مباشرة.",
  refuseScripture: "البحث في النصوص يقرأ مدوّنة يحملها الخادم؛ والجيب لا يحمل إلا خزانتك.",
  refuseSeed: "خزانة البداية ينسخها خادم من تثبيته هو.",
  refuseSiteTheme: "سمة الموقع العامّ تخصّ الزوّار، والخزانة في الجيب لا زوّار لها.",
  refuseTranscriber: "التفريغ يعمل على جهاز خادم أسطرلاب نفسه؛ والخزانة في الجيب تحفظ التسجيل وتربطه من وارد اليوم.",
  refuseFeeds: "الخلاصات يجلبها خادم أسطرلاب في مواعيده؛ والخزانة في الجيب تقرأ الملاحظات التي احتفظت بها.",
  refuseFederation: "الإشارات والفيديفيرس تخاطب موقعًا على عنوانه العامّ؛ والخزانة في الجيب لا زوّار لها يُشار إليها منهم.",
  refuseImport: "استيراد تصدير من Notion أو Evernote أو Obsidian يعمل على قرص خادم أسطرلاب؛ والخزانة في الجيب تفتح الملاحظات التي صنعها.",
  refuseNoShell: "السحب والدفع لتطبيق الهاتف، وهذه الصفحة لا تطبيق لها.",
  refuseSignIn: "الخزانة في الجيب يفتحها هاتف صاحبها؛ فلا أحد غيره ليُسجَّل الدخول باسمه.",
  refuseMentions: "الإشارات غير المربوطة تمسح الخزانة كلّها لكلّ ملاحظة؛ والجيب لا يفعل ذلك على هاتف.",
  refuseUpload: "الرفع يحتاج إلى محلّل للأجزاء ومكان للبايتات؛ والجيب يأخذ المرفقات عبر المستودع بدلًا من ذلك.",

  keepGitSync: "الخزانة هنا هي المستودع، ومزامنة الهاتف هي التي تديره — انظر النسخ الاحتياطي والمزامنة.",
  keepGitToken: "رمز المستودع للهاتف لا للخزانة: لا يُكتب في الملاحظات أبدًا.",
  keepGitUser: "حساب المستودع للهاتف لا للخزانة.",
  keepPublicLayout: "الخزانة في الجيب لا نصف عامًّا لها، فلا تخطيط للزوّار لتختاره.",
  keepLanguageFilter: "مرشّح اللغة ينتقي الواجهات العامّة، والخزانة في الجيب لا واجهات عامّة لها.",
  keepLanguageToggle: "مفتاح EN/ع يُعرض على الزوّار، والخزانة في الجيب لا زوّار لها.",
  keepTopics: "الأبواب هيئةٌ من هيئات الموقع المنشور، والخزانة في الجيب لا موقع لها.",
  keepExcludeTags: "الوسوم المستبعدة تخفي ملاحظات عن الزوّار، والخزانة في الجيب لا زوّار لها.",
  keepAuthorSites: "مواقع المؤلّف الأخرى بطاقات في مدوّنة عامّة، والخزانة في الجيب لا مدوّنة لها.",
  keepShareButtons: "صفّ المشاركة يقع تحت مقالة عامّة، والخزانة في الجيب لا مقالات عامّة لها.",
  keepAmbient: "الترويسة المحيطة للموقع العامّ، والخزانة في الجيب لا موقع لها.",
  keepDefaultTheme: "السمة الافتراضية هي ما يراه الزوّار أوّلًا؛ وسمتك أنت في هذا الجهاز.",
  keepFooter: "سطر التذييل يُطبع على موقع عامّ، والخزانة في الجيب لا موقع لها.",
  keepFavicon: "أيقونة الموقع يقدّمها موقع على عنوانه؛ والهاتف يعرض أيقونة التطبيق.",
  keepFonts: "خطوط الفهرس ينزّلها الخادم ويقدّمها؛ والخزانة في الجيب لا مجلّد خطوط فيها.",
  keepNoteVersions: "كلّ حفظ هنا إيداعٌ أصلًا، فالسجلّ سجلّ المستودع ولا يُطفأ.",
  keepPdfSearch: "قراءة نصّ كلّ ملفّ PDF عملٌ يؤدّيه الخادم على قرصه.",
  keepVoice: "التفريغ يعمل على جهاز الخادم نفسه؛ والخزانة في الجيب تحفظ كلّ تسجيل ولا تشغّل نموذجًا.",
  keepWebmentions: "الإشارات يرسلها ويستقبلها موقع على عنوانه العامّ؛ والخزانة في الجيب لا عنوان لها.",
  keepFediverse: "الفيديفيرس يتابع موقعًا على عنوانه العامّ؛ والخزانة في الجيب لا عنوان لها.",

  vaultPathRequired: "المسار مطلوب.",
  vaultPathNotPath: "هذا المسار ليس مسارًا.",
  vaultPathLeaves: (path: string) => `هذا المسار يخرج من الخزانة: ${path}`,
  vaultPathRepository: "المستودع ليس جزءًا من الخزانة.",
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

/** The words in a language asked for by name, not the phone's: the pocket
 *  server answers in the CLIENT's chrome language (its `<html lang>`), which
 *  the reader chose and which need not be the phone's. */
export function wordsIn(language: Lang): Copy {
  return language === "ar" ? ar : en;
}

/** A dictionary key whose value is a plain sentence — what a pocket refusal
 *  names. */
export type Sentence = { [K in keyof Copy]: Copy[K] extends string ? K : never }[keyof Copy];

/** The sync line's words, as a function so the pocket page can ask for them
 *  after `lang` has settled — the page boots before the client does, and the
 *  line it paints is the shell's, in the shell's language. */
export function pocketWords(): Copy {
  return t;
}
