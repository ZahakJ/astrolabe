// THE FOLDER GLYPH CATALOG — every mark a folder may wear, named in both
// languages and shelved by subject.
//
// This is the SOURCE the generator reads (scripts/gen-folder-icons.mjs): it
// emits `folderIconNames.ts` (the closed enum, tiny, in every bundle that
// validates an icon) and `folderIconPaths.ts` (the drawings and the search
// keys, lazy, in the chunks that draw or choose one). The catalog itself is
// imported by the picker and by the label module only, which is why the
// Arabic names live here and not in i18n.ts: two hundred and fifty dictionary
// rows that only an admin's popover ever reads would ride into the entry
// closure every blog reader downloads.
//
// TWO KINDS OF ENTRY. The first twenty were drawn by hand for this app
// (shared/folderIconsHand.ts) and keep their names, so a settings.json written
// under 2.6 still draws. Everything after is Lucide (ISC), on the same 24-grid,
// same round caps, redrawn by the generator into plain `d` strings — chosen
// one by one for what survives 14px beside a folder name. The rule from
// shared/folderIcons.ts stands: silhouette, never a letter or a symbol, and
// no two confusable in the same tree.
//
// ORDER IS THE PICKER'S ORDER. Groups read the way a reader thinks about what
// a folder is for: what you make, what you study, what you build, what you
// play, where you go, what grows, how you live, what you owe, and the marks
// that mean "everything else".

export type FolderIconGroupId =
  | "make"
  | "study"
  | "tech"
  | "play"
  | "go"
  | "nature"
  | "life"
  | "work"
  | "marks";

export interface FolderIconEntry {
  /** The stored name — the enum member. */
  name: string;
  /** English name, as the picker's tooltip and the settings select print it. */
  en: string;
  /** Arabic name, same duty. */
  ar: string;
  /** The Lucide icon the drawing comes from; absent for a hand-drawn glyph. */
  lucide?: string;
  /** Extra search words beyond the two names and Lucide's own tags. */
  keys?: string;
}

export interface FolderIconGroup {
  id: FolderIconGroupId;
  icons: FolderIconEntry[];
}

const i = (name: string, en: string, ar: string, keys?: string, lucide = name): FolderIconEntry =>
  keys ? { name, en, ar, lucide, keys } : { name, en, ar, lucide };
/** A hand-drawn glyph: its own paths, no Lucide source. */
const h = (name: string, en: string, ar: string, keys: string): FolderIconEntry => ({ name, en, ar, keys });

export const FOLDER_ICON_GROUPS: readonly FolderIconGroup[] = [
  {
    id: "make",
    icons: [
      h("book", "Book", "كتاب", "reading library read novel"),
      h("quill", "Quill", "ريشة", "writing pen feather write draft"),
      h("scroll", "Scroll", "مخطوطة", "manuscript parchment history"),
      i("notebook", "Notebook", "دفتر", "journal diary", "notebook-pen"),
      i("pen", "Pen", "قلم", "write draft ink", "pen-line"),
      i("pencil", "Pencil", "قلم رصاص", "sketch draft edit"),
      i("highlighter", "Highlighter", "قلم تظليل", "mark"),
      i("library", "Library", "مكتبة", "shelf books", "library-big"),
      i("bookmark", "Bookmark", "علامة", "saved later"),
      i("newspaper", "Newspaper", "صحيفة", "news press"),
      i("letter", "Letter", "رسالة", "mail envelope post", "mail"),
      i("document", "Document", "مستند", "file page paper", "file-text"),
      i("files", "Files", "ملفات", "papers pages"),
      i("sticky", "Sticky note", "ملاحظة", "memo reminder", "sticky-note"),
      i("checklist", "Checklist", "قائمة مهام", "todo tasks", "list-checks"),
      i("quote", "Quote", "اقتباس", "citation saying"),
      i("languages", "Languages", "لغات", "translate arabic english"),
      i("type", "Typography", "طباعة", "font letters"),
      i("signature", "Signature", "توقيع", "sign name"),
      i("stamp", "Stamp", "ختم", "seal"),
      i("printer", "Printer", "طابعة", "print"),
    ],
  },
  {
    id: "study",
    icons: [
      h("flask", "Flask", "دورق", "chemistry lab science experiment"),
      h("telescope", "Telescope", "تلسكوب", "astronomy stars space observe"),
      i("atom", "Atom", "ذرة", "physics"),
      i("microscope", "Microscope", "مجهر", "biology lab"),
      i("dna", "DNA", "حمض نووي", "genetics biology"),
      i("brain", "Brain", "دماغ", "mind thinking psychology"),
      i("calculator", "Calculator", "آلة حاسبة", "math numbers"),
      i("graduation", "Graduation", "تخرج", "school university degree", "graduation-cap"),
      i("school", "School", "مدرسة", "class"),
      i("test-tube", "Test tube", "أنبوب اختبار", "chemistry sample"),
      i("beaker", "Beaker", "كأس مخبري", "chemistry lab"),
      i("magnet", "Magnet", "مغناطيس", "physics attract"),
      i("orbit", "Orbit", "مدار", "planet space"),
      i("satellite", "Satellite", "قمر صناعي", "space signal"),
      i("sigma", "Sigma", "سيغما", "sum math"),
      i("pi", "Pi", "باي", "math constant"),
      i("infinity", "Infinity", "لانهاية", "endless"),
      i("radical", "Radical", "جذر", "square root math", "square-radical"),
      i("variable", "Variable", "متغير", "algebra"),
      i("ruler", "Ruler", "مسطرة", "measure geometry"),
      i("drafting", "Drafting compass", "فرجار", "geometry drawing", "drafting-compass"),
      i("idea", "Idea", "فكرة", "lightbulb insight", "lightbulb"),
      i("radiation", "Radiation", "إشعاع", "nuclear"),
      i("thermometer", "Thermometer", "ميزان حرارة", "temperature"),
      i("scale", "Balance", "ميزان", "justice law weigh"),
      i("hourglass", "Hourglass", "ساعة رملية", "time waiting"),
      i("binoculars", "Binoculars", "منظار", "observe watch"),
      i("chart", "Chart", "رسم بياني", "graph statistics", "chart-line"),
      i("pie", "Pie chart", "مخطط دائري", "statistics share", "chart-pie"),
      i("eclipse", "Eclipse", "كسوف", "sun moon"),
      i("earth", "Earth", "الأرض", "planet world"),
    ],
  },
  {
    id: "tech",
    icons: [
      h("code", "Code", "شيفرة", "programming software dev"),
      i("terminal", "Terminal", "طرفية", "shell command line"),
      i("chip", "Chip", "معالج", "cpu hardware", "cpu"),
      i("database", "Database", "قاعدة بيانات", "sql storage"),
      i("server", "Server", "خادم", "backend hosting"),
      i("network", "Network", "شبكة", "nodes graph"),
      i("wifi", "Wi‑Fi", "واي فاي", "wireless signal"),
      i("robot", "Robot", "روبوت", "ai bot machine", "bot"),
      i("circuit", "Circuit", "دارة", "electronics board", "circuit-board"),
      i("drive", "Drive", "قرص", "disk storage", "hard-drive"),
      i("monitor", "Monitor", "شاشة", "screen display"),
      i("laptop", "Laptop", "حاسوب محمول", "computer"),
      i("smartphone", "Phone", "هاتف ذكي", "mobile"),
      i("keyboard", "Keyboard", "لوحة مفاتيح", "typing"),
      i("mouse", "Mouse", "فأرة", "pointer"),
      i("usb", "USB", "يو إس بي", "port"),
      i("plug", "Plug", "قابس", "power socket"),
      i("cable", "Cable", "كابل", "wire"),
      i("binary", "Binary", "ثنائي", "bits"),
      i("braces", "Braces", "أقواس", "json object"),
      i("branch", "Branch", "فرع", "git version", "git-branch"),
      i("bug", "Bug", "خلل", "debug error"),
      i("gear", "Gear", "ترس", "settings config", "settings"),
      i("wrench", "Wrench", "مفتاح ربط", "fix tools"),
      i("hammer", "Hammer", "مطرقة", "build tools"),
      i("pickaxe", "Pickaxe", "معول", "mine dig"),
      i("drill", "Drill", "مثقاب", "tools"),
      i("anvil", "Anvil", "سندان", "forge smith"),
      i("axe", "Axe", "فأس", "chop wood"),
      i("scissors", "Scissors", "مقص", "cut"),
      i("package", "Package", "حزمة", "box module"),
      i("boxes", "Boxes", "صناديق", "storage"),
      i("layers", "Layers", "طبقات", "stack"),
      i("workflow", "Workflow", "سير عمل", "process pipeline"),
      i("webhook", "Webhook", "خطاف", "api"),
      i("fingerprint", "Fingerprint", "بصمة", "identity", "fingerprint-pattern"),
      i("gauge", "Gauge", "عداد", "speed performance"),
      i("rocket", "Rocket", "صاروخ", "launch space"),
      i("wand", "Magic wand", "عصا سحرية", "magic", "wand-sparkles"),
    ],
  },
  {
    id: "play",
    icons: [
      h("music", "Music", "موسيقى", "song note audio"),
      h("camera", "Camera", "كاميرا", "photo photography"),
      h("film", "Film", "فيلم", "movie cinema"),
      h("gamepad", "Games", "ألعاب", "gaming controller play"),
      h("chess", "Chess", "شطرنج", "pawn strategy board"),
      i("palette", "Palette", "لوحة ألوان", "art paint colours"),
      i("brush", "Brush", "فرشاة", "paint art", "paintbrush"),
      i("pen-tool", "Pen tool", "أداة القلم", "vector design"),
      i("shapes", "Shapes", "أشكال", "design geometry"),
      i("frame", "Frame", "إطار", "layout"),
      i("picture", "Picture", "صورة", "image photo", "image"),
      i("aperture", "Aperture", "فتحة عدسة", "lens photo"),
      i("video", "Video", "فيديو", "record"),
      i("clapperboard", "Clapperboard", "كلاكيت", "film scene"),
      i("tv", "Television", "تلفاز", "screen show"),
      i("radio", "Radio", "راديو", "podcast broadcast audio show"),
      i("mic", "Microphone", "ميكروفون", "voice record"),
      i("headphones", "Headphones", "سماعات", "listen audio"),
      i("record", "Record", "أسطوانة", "vinyl disc", "disc-3"),
      i("guitar", "Guitar", "غيتار", "instrument"),
      i("piano", "Piano", "بيانو", "keys instrument"),
      i("drum", "Drum", "طبل", "rhythm"),
      i("theatre", "Theatre", "مسرح", "drama masks", "drama"),
      i("ticket", "Ticket", "تذكرة", "event show"),
      i("party", "Party", "حفلة", "celebration", "party-popper"),
      i("dice", "Dice", "نرد", "game chance", "dices"),
      i("puzzle", "Puzzle", "أحجية", "piece riddle"),
      i("joystick", "Joystick", "عصا تحكم", "arcade"),
      i("swords", "Swords", "سيوف", "battle fantasy"),
      i("trophy", "Trophy", "كأس", "win prize"),
      i("medal", "Medal", "ميدالية", "award"),
      i("origami", "Origami", "أوريغامي", "paper craft"),
      i("spade", "Spade", "بستوني", "cards"),
      i("club", "Club", "سباتي", "cards"),
    ],
  },
  {
    id: "go",
    icons: [
      h("compass", "Compass", "بوصلة", "direction navigate explore"),
      h("map", "Map", "خريطة", "geography travel"),
      h("globe", "Globe", "كرة أرضية", "world international"),
      i("pin", "Pin", "دبوس", "location place", "map-pin"),
      i("navigation", "Navigation", "ملاحة", "direction gps"),
      i("route", "Route", "مسار", "path journey"),
      i("signpost", "Signpost", "لافتة", "directions"),
      i("milestone", "Milestone", "معلم طريق", "progress"),
      i("plane", "Plane", "طائرة", "flight travel"),
      i("train", "Train", "قطار", "rail", "train-front"),
      i("bus", "Bus", "حافلة", "transit"),
      i("car", "Car", "سيارة", "drive"),
      i("bike", "Bicycle", "دراجة", "cycling"),
      i("ship", "Ship", "سفينة", "boat sea"),
      i("sailboat", "Sailboat", "مركب شراعي", "sailing"),
      i("anchor", "Anchor", "مرساة", "harbour"),
      i("luggage", "Luggage", "حقيبة سفر", "travel trip"),
      i("tent", "Tent", "خيمة", "camping"),
      i("mountain", "Mountain", "جبل", "hiking peak"),
      i("home", "Home", "بيت", "house", "house"),
      i("building", "Building", "مبنى", "city office", "building-2"),
      i("landmark", "Landmark", "معلم", "monument museum"),
      i("castle", "Castle", "قلعة", "fort medieval"),
      i("store", "Shop", "متجر", "market"),
      i("factory", "Factory", "مصنع", "industry"),
      i("warehouse", "Warehouse", "مستودع", "storage"),
      i("hospital", "Hospital", "مستشفى", "clinic"),
      i("fence", "Fence", "سياج", "garden"),
      i("tractor", "Tractor", "جرار", "farm"),
      i("footprints", "Footprints", "آثار أقدام", "walk trail"),
      i("fuel", "Fuel", "وقود", "petrol station"),
    ],
  },
  {
    id: "nature",
    icons: [
      h("leaf", "Leaf", "ورقة شجر", "plant green nature"),
      h("moon", "Moon", "هلال", "night crescent"),
      h("star", "Star", "نجمة", "favourite rating"),
      h("sparkle", "Sparkle", "بريق", "magic new shine"),
      i("crescent", "Crescent and star", "هلال ونجمة", "night islam", "moon-star"),
      i("sun", "Sun", "شمس", "day light"),
      i("sunrise", "Sunrise", "شروق", "morning dawn"),
      i("sunset", "Sunset", "غروب", "evening dusk"),
      i("cloud", "Cloud", "سحابة", "weather sky"),
      i("rain", "Rain", "مطر", "weather", "cloud-rain"),
      i("storm", "Storm", "عاصفة", "lightning thunder", "cloud-lightning"),
      i("snowflake", "Snowflake", "ندفة ثلج", "winter cold"),
      i("wind", "Wind", "ريح", "breeze air"),
      i("tornado", "Tornado", "إعصار", "twister"),
      i("rainbow", "Rainbow", "قوس قزح", "colours"),
      i("waves", "Waves", "أمواج", "sea ocean water", "waves-horizontal"),
      i("droplet", "Drop", "قطرة", "water"),
      i("flame", "Flame", "لهب", "fire hot"),
      i("flower", "Flower", "زهرة", "bloom garden"),
      i("sprout", "Sprout", "برعم", "seedling growth"),
      i("tree", "Tree", "شجرة", "wood", "tree-deciduous"),
      i("pine", "Pine", "صنوبر", "evergreen", "tree-pine"),
      i("forest", "Forest", "غابة", "trees woods", "trees"),
      i("palm", "Palm", "نخلة", "tropical date", "tree-palm"),
      i("shrub", "Shrub", "شجيرة", "bush"),
      i("clover", "Clover", "برسيم", "luck"),
      i("wheat", "Wheat", "قمح", "grain harvest"),
      i("feather", "Feather", "ريشة طائر", "light bird"),
      i("bird", "Bird", "طائر", "wings"),
      i("fish", "Fish", "سمكة", "sea"),
      i("cat", "Cat", "قطة", "pet"),
      i("dog", "Dog", "كلب", "pet"),
      i("rabbit", "Rabbit", "أرنب", "bunny"),
      i("turtle", "Turtle", "سلحفاة", "slow"),
      i("squirrel", "Squirrel", "سنجاب", "nuts"),
      i("snail", "Snail", "حلزون", "slow"),
      i("paw", "Paw", "كف حيوان", "animal pet", "paw-print"),
      i("shell", "Shell", "صدفة", "beach sea"),
      i("egg", "Egg", "بيضة", "nest"),
      i("bone", "Bone", "عظم", "skeleton"),
    ],
  },
  {
    id: "life",
    icons: [
      h("heart", "Heart", "قلب", "love favourite"),
      i("coffee", "Coffee", "قهوة", "cup cafe tea"),
      i("soda", "Drink", "مشروب", "cup juice", "cup-soda"),
      i("utensils", "Utensils", "أدوات المائدة", "food restaurant"),
      i("pot", "Cooking pot", "قدر", "cook recipe", "cooking-pot"),
      i("chef", "Chef", "طاهٍ", "cooking hat", "chef-hat"),
      i("soup", "Soup", "حساء", "bowl"),
      i("salad", "Salad", "سلطة", "healthy"),
      i("pizza", "Pizza", "بيتزا", "slice"),
      i("croissant", "Croissant", "كرواسون", "bakery"),
      i("cake", "Cake", "كعكة", "birthday dessert"),
      i("ice-cream", "Ice cream", "مثلجات", "dessert", "ice-cream-cone"),
      i("candy", "Candy", "حلوى", "sweet"),
      i("apple", "Apple", "تفاحة", "fruit"),
      i("cherry", "Cherry", "كرز", "fruit"),
      i("grapes", "Grapes", "عنب", "fruit", "grape"),
      i("citrus", "Citrus", "حمضيات", "lemon orange"),
      i("banana", "Banana", "موز", "fruit"),
      i("carrot", "Carrot", "جزر", "vegetable"),
      i("meat", "Meat", "لحم", "steak", "beef"),
      i("dumbbell", "Dumbbell", "أثقال", "gym fitness"),
      i("pulse", "Pulse", "نبض", "health activity", "activity"),
      i("heartbeat", "Heartbeat", "نبض القلب", "health", "heart-pulse"),
      i("stethoscope", "Stethoscope", "سماعة طبية", "doctor medical"),
      i("pill", "Pill", "حبة دواء", "medicine"),
      i("syringe", "Syringe", "حقنة", "vaccine"),
      i("bandage", "Bandage", "ضمادة", "injury"),
      i("bed", "Bed", "سرير", "sleep"),
      i("sofa", "Sofa", "أريكة", "living room"),
      i("lamp", "Lamp", "مصباح", "light"),
      i("bath", "Bath", "حمام", "tub"),
      i("shirt", "Shirt", "قميص", "clothes"),
      i("glasses", "Glasses", "نظارة", "spectacles"),
      i("watch", "Watch", "ساعة يد", "time"),
      i("alarm", "Alarm", "منبه", "wake", "alarm-clock"),
      i("baby", "Baby", "رضيع", "child"),
      i("eye", "Eye", "عين", "see watch"),
      i("ear", "Ear", "أذن", "hear"),
      i("hand", "Hand", "يد", "touch"),
      i("care", "Care", "عناية", "charity giving", "hand-heart"),
      i("person", "Person", "شخص", "human", "person-standing"),
      i("gift", "Gift", "هدية", "present"),
      i("shopping", "Shopping", "تسوق", "bag", "shopping-bag"),
      i("cart", "Cart", "عربة", "shop", "shopping-cart"),
    ],
  },
  {
    id: "work",
    icons: [
      i("briefcase", "Briefcase", "حقيبة عمل", "job business"),
      i("calendar", "Calendar", "تقويم", "date schedule"),
      i("clock", "Clock", "ساعة", "time"),
      i("timer", "Timer", "مؤقت", "stopwatch"),
      i("history", "History", "سجل", "past log", "clock-arrow-left"),
      i("target", "Target", "هدف", "goal aim"),
      i("goal", "Goal", "مرمى", "aim"),
      i("flag", "Flag", "راية", "milestone"),
      i("trend", "Trend", "اتجاه", "growth up", "trending-up"),
      i("bars", "Bar chart", "أعمدة بيانية", "statistics", "chart-column"),
      i("presentation", "Presentation", "عرض", "slides talk"),
      i("kanban", "Kanban", "كانبان", "board tasks"),
      i("todo", "To‑do", "مهام", "tasks list", "list-todo"),
      i("clipboard", "Clipboard", "حافظة", "notes"),
      i("pushpin", "Pushpin", "دبوس تثبيت", "pinned", "pin"),
      i("inbox", "Inbox", "وارد", "mail"),
      i("send", "Send", "إرسال", "message"),
      i("phone", "Phone", "هاتف", "call"),
      i("megaphone", "Megaphone", "مكبر صوت", "announce"),
      i("people", "People", "أشخاص", "team group", "users"),
      i("user", "User", "مستخدم", "account profile"),
      i("contact", "Contact", "جهة اتصال", "address"),
      i("id-card", "ID card", "بطاقة هوية", "identity"),
      i("handshake", "Handshake", "مصافحة", "deal agreement"),
      i("vote", "Vote", "تصويت", "ballot"),
      i("gavel", "Gavel", "مطرقة القاضي", "law court"),
      i("coins", "Coins", "عملات", "money"),
      i("wallet", "Wallet", "محفظة", "money"),
      i("banknote", "Banknote", "ورقة نقدية", "cash money"),
      i("card", "Card", "بطاقة", "credit payment", "credit-card"),
      i("receipt", "Receipt", "إيصال", "invoice"),
      i("percent", "Percent", "نسبة", "discount"),
      i("savings", "Savings", "ادخار", "piggy bank", "piggy-bank"),
      i("truck", "Truck", "شاحنة", "delivery"),
      i("award", "Award", "جائزة", "ribbon"),
      i("verified", "Verified", "موثق", "check badge", "badge-check"),
    ],
  },
  {
    id: "marks",
    icons: [
      h("archive", "Archive", "أرشيف", "old box storage"),
      i("tag", "Tag", "وسم", "label"),
      i("hash", "Hash", "علامة #", "number tag"),
      i("at", "At sign", "علامة @", "mention", "at-sign"),
      i("asterisk", "Asterisk", "نجمة ثمانية", "footnote"),
      i("link", "Link", "رابط", "chain url"),
      i("paperclip", "Paperclip", "مشبك", "attachment"),
      i("key", "Key", "مفتاح", "secret access"),
      i("lock", "Lock", "قفل", "private secure"),
      i("shield", "Shield", "درع", "security protect"),
      i("crown", "Crown", "تاج", "king royal"),
      i("gem", "Gem", "جوهرة", "diamond precious"),
      i("bell", "Bell", "جرس", "notification"),
      i("bolt", "Bolt", "برق", "lightning energy", "zap"),
      i("power", "Power", "طاقة", "on off"),
      i("recycle", "Recycle", "إعادة تدوير", "reuse"),
      i("check", "Check", "صح", "done yes"),
      i("done", "Done", "تم", "complete", "circle-check"),
      i("question", "Question", "سؤال", "help", "circle-question-mark"),
      i("alert", "Alert", "تنبيه", "warning", "circle-alert"),
      i("info", "Info", "معلومة", "about"),
      i("dot", "Dot", "نقطة", "point", "circle-dot"),
      i("circle", "Circle", "دائرة", "round"),
      i("square", "Square", "مربع", "box"),
      i("triangle", "Triangle", "مثلث", "delta"),
      i("hexagon", "Hexagon", "سداسي", "polygon"),
      i("diamond", "Diamond", "معيّن", "rhombus"),
      i("box", "Box", "صندوق", "cube"),
      i("blocks", "Blocks", "مكعبات", "lego pieces"),
      i("brick", "Brick", "لبنة", "toy", "toy-brick"),
      i("component", "Component", "مكوّن", "part"),
      i("badge", "Badge", "شارة", "seal"),
      i("ribbon", "Ribbon", "شريط", "award"),
      i("skull", "Skull", "جمجمة", "danger death"),
      i("ghost", "Ghost", "شبح", "spooky"),
    ],
  },
];

/** Every entry, in picker order. */
export const FOLDER_ICON_ENTRIES: readonly FolderIconEntry[] = FOLDER_ICON_GROUPS.flatMap((g) => g.icons);

/** Entry by name — the label module's lookup. */
export const FOLDER_ICON_BY_NAME: ReadonlyMap<string, FolderIconEntry> = new Map(
  FOLDER_ICON_ENTRIES.map((entry) => [entry.name, entry]),
);
