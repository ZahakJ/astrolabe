// FRENCH, CORRECTED AS IT IS TYPED — the arithmetic, with no editor in it.
//
// The owner: "add auto-correction to French — don't want full French support,
// just auto correction if I write in French". So this is not a dictionary and
// not a grammar. It is two small, deliberately conservative answers that the
// editor (client/editor/frenchAutocorrect.ts) and the per-line spellcheck
// language (shared/script.ts) both ask:
//
//   1. `looksFrench(line)` — is this LINE French? A heuristic, and a cheap one:
//      French function words counted as whole words, plus the letters a
//      French keyboard puts under the fingers and an English one does not.
//      Two hits make a French line. That threshold is the whole design: a
//      single French word inside an English sentence ("this is tres chic")
//      is left exactly as it was typed, because the writer of an English
//      line did not ask for French, and a correction they did not ask for
//      is a silent edit to somebody's file. A note can also say `lang: fr`
//      in its frontmatter and be French on every line, threshold or not.
//
//   2. `frenchCorrection(word)` — the one spelling this word should have had,
//      or null. A curated TABLE, not a rule engine, and every entry passes
//      the same test: the source is not itself a French word. `tres` is not
//      a word, so `très` is what was meant; `a`, `ou`, `la`, `sur`, `du`,
//      `cote`, `tache`, `mur` are all real words with and without their
//      accent, so they are not here and must never be — the cost of a wrong
//      correction is a reader learning to distrust the editor, which is
//      worse than any number of missed ones. tests/french.test.ts holds the
//      table to that rule.
//
// What this file does NOT do is grammar, agreement, or anything that needs
// the sentence: `eleve` is left alone because `élève` (the pupil) and `élevé`
// (raised) are both common and only the sentence knows which was meant.

// ── Is this line French? ────────────────────────────────────────────────────

/** A line in a right-to-left or CJK script is not French whatever Latin words
 *  it also carries: those lines already have their own answer (script.ts). */
const NOT_LATIN_RE =
  /[\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb1d-\ufb4f\ufb50-\ufdff\ufe70-\ufeff\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

/** Letters a French text is full of and an English one borrows rarely. NOT
 *  `é`, `ï`, `ë`, `ü`: English writes café, résumé, fiancé, naïve, Zoë and
 *  Brontë with them and an English line about a café is not French. The
 *  words carrying these count as ONE marker between them, however many there
 *  are — a crème brûlée is two accents and still an English dessert — so the
 *  second marker always has to be a French word. */
const FRENCH_LETTER_RE = /[èêàçùœâîôûÈÊÀÇÙŒÂÎÔÛ]/;

/** Whole-word markers, chosen against English rather than for French: `on`,
 *  `a`, `en`, `plus`, `car`, `son`, `as`, `me`, `si` are all French function
 *  words, and all of them are English words too, so an English sentence about
 *  a car and its son would have counted as French. Every word here is one an
 *  English line does not use. */
const FRENCH_WORDS = new Set([
  "je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "lui", "eux", "moi", "toi", "te", "se",
  "le", "la", "les", "un", "une", "des", "de", "du", "au", "aux",
  "et", "ou", "mais", "donc", "ne", "pas", "jamais", "rien", "que", "qui", "quoi", "dont",
  "ce", "cet", "cette", "ces", "cela", "ceci", "mon", "mes", "tes", "ses", "notre", "votre", "leur", "leurs",
  "est", "sont", "suis", "sommes", "avons", "avez", "ont", "avoir", "fait", "faire", "peut", "veut", "doit",
  "pour", "dans", "sur", "sous", "avec", "sans", "chez", "vers", "entre", "depuis", "pendant", "avant", "contre",
  "bien", "tout", "tous", "toute", "toutes", "aussi", "comme", "oui", "alors", "puis", "quand", "parce",
  "encore", "toujours", "peu", "beaucoup", "trop", "assez", "autre", "autres", "chaque", "quel", "quelle", "quels", "quelles",
]);

/** Words that settle the question the other way. `la`, `de`, `un`, `que`,
 *  `il`, `les` are Spanish, Italian, Portuguese and Catalan too, and `est`,
 *  `et`, `qui` are Latin — so *la casa de mi madre es un hotel* scored as
 *  French and had its hotel given a circumflex. One of these on the line,
 *  as a whole word, and the line is not French, whatever else it scores;
 *  each is a function word of one of those languages that neither French
 *  nor English uses (`do`, `com`, `um`, `non`, `con`, `dos`, `es` are left
 *  out for exactly that reason — English has the first four, French `con`,
 *  `dos` and `tu es`). */
const NOT_FRENCH_WORDS = new Set([
  // Spanish
  "el", "los", "las", "del", "por", "para", "una", "pero", "muy", "esta", "este", "como", "yo", "mi", "su", "sus", "mis",
  "porque", "cuando", "donde", "hasta", "desde", "sin",
  // Italian
  "di", "gli", "della", "delle", "dei", "degli", "anche", "questo", "sono", "perché", "più",
  // Portuguese
  "uma", "das", "são", "não",
  // Catalan
  "els", "amb", "dels", "són",
  // Latin
  "quod", "sunt", "ergo", "quae", "enim", "atque",
]);

/** The elisions: `j'ai`, `qu'il`, `n'est`, `c'est`, `l'école`, `d'un`, `s'il`.
 *  The letter is a hit only when the apostrophe follows it — bare `l` or `d`
 *  is nothing, and English has no elision that leaves one of these letters
 *  standing on its own before an apostrophe (`don't` tokenises as `don`). */
const ELISIONS = new Set(["j", "qu", "n", "c", "l", "d", "s", "m", "t"]);

/** Word tokens with their trailing character, so an elision can see its
 *  apostrophe. Letters only — digits, `#tags`, `[[links]]` and URLs are not
 *  words of any language. */
const TOKEN_RE = /\p{L}+/gu;

/** How many French markers a line carries; `looksFrench` is `>= 2`. Exported
 *  for the tests, which are about the threshold as much as the words. */
export function frenchScore(line: string): number {
  if (NOT_LATIN_RE.test(line)) return 0;
  let score = 0;
  let accented = false;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(line); m; m = TOKEN_RE.exec(line)) {
    const word = m[0];
    if (FRENCH_LETTER_RE.test(word)) {
      accented = true;
      continue;
    }
    const lower = word.toLowerCase();
    if (NOT_FRENCH_WORDS.has(lower)) return 0;
    // A word in capitals is a name or an acronym, not a function word: `UN`,
    // `LA`, `EST`, `ET` are the United Nations, Los Angeles, a time zone and
    // a film studio, and an English meeting note carrying two of them was
    // French. (`Je`, `Il`, `Les` at the head of a sentence still count.)
    if (word.length > 1 && word === word.toUpperCase()) continue;
    if (FRENCH_WORDS.has(lower)) {
      score += 1;
      continue;
    }
    const next = line.charAt(m.index + word.length);
    if ((next === "'" || next === "’") && ELISIONS.has(lower)) score += 1;
  }
  return score + (accented ? 1 : 0);
}

/** True for a line written in French: two French markers, whole words. A
 *  line of English with one French word in it is not French, and a line of
 *  Arabic, Hebrew or CJK never is. */
export function looksFrench(line: string): boolean {
  return frenchScore(line) >= 2;
}

/** The note's own answer, from its frontmatter: `lang: fr` (or `language:
 *  fr`, the key the properties card already offers, or a regional `fr-CA`)
 *  makes every line of the note French without the per-line test. Reads the
 *  frontmatter TEXT — the caller has already cut it out with
 *  shared/textLayout.ts's `frontmatterText`. */
export function noteIsFrench(fmText: string): boolean {
  const m = /^[ \t]*(?:lang|language)[ \t]*:[ \t]*["']?([A-Za-z-]+)["']?[ \t]*$/m.exec(fmText);
  return m !== null && m[1].toLowerCase().split("-")[0] === "fr";
}

// ── The corrections ─────────────────────────────────────────────────────────

/** Source (as typed, lowercase, ASCII) → the spelling meant. Grouped by what
 *  the correction adds, so a reader of this file can see what is missing:
 *
 *  · NOT HERE, ON PURPOSE: `a/à`, `ou/où`, `la/là`, `sur/sûr`, `du/dû`,
 *    `cote/côte/côté`, `tache/tâche`, `mur/mûr`, `pres/près/prés`,
 *    `gene/gène/gêne`, `peche/pêche/péché`, `foret/forêt` (a `foret` is a
 *    drill bit), `mais/maïs`, `pate/pâte/pâté`, `traite/traité`,
 *    `fatigue/fatigué`, `varie/varié`, `eleve/élève/élevé`, `notre/nôtre`,
 *    `the/thé` (an English word a French line may quote). Each source is a
 *    real word, or the accent could go two ways, and the table's one promise
 *    is that it never guesses.
 *  · NOT HERE EITHER, for the second reason: a source whose two readings
 *    are both everyday words. `cree` is `crée` as often as `créé`; `resume`
 *    is `résume` as often as `résumé`; `prefere`, `enonce` likewise; and
 *    the nouns whose participle is common — `reserve/réserve/réservé`,
 *    `controle`, `regle`, `celebre`, `age/âge/âgé`, `equipe`, `diplome`,
 *    `reve`, `depense`, `echange`, `melange`, `prete`, `epouse`, `lache`,
 *    `fete`, `revolte`, `epice`, `reforme`, `coute`, `equilibre`. A noun
 *    whose participle is rare (`menage`, `modele`, `siege`, `hate`) stays.
 *  · `meme` → `même` IS here: the internet meme is spelled `mème` in French,
 *    so on a French line `meme` is wrong either way, and `même` is what the
 *    line meant a hundred times out of a hundred and one. */
const TABLE: Record<string, string> = {
  // ── the ones the owner named ──
  tres: "très", etre: "être", deja: "déjà", francais: "français", francaise: "française", francaises: "françaises",
  coeur: "cœur", coeurs: "cœurs", oeuvre: "œuvre", oeuvres: "œuvres", soeur: "sœur", soeurs: "sœurs",
  ecole: "école", ecoles: "écoles", etudiant: "étudiant", etudiants: "étudiants", etudiante: "étudiante", etudiantes: "étudiantes",
  hopital: "hôpital", hopitaux: "hôpitaux", meme: "même", memes: "mêmes",

  // ── ligatures ──
  oeuf: "œuf", oeufs: "œufs", oeil: "œil", boeuf: "bœuf", boeufs: "bœufs", voeu: "vœu", voeux: "vœux",
  noeud: "nœud", noeuds: "nœuds", manoeuvre: "manœuvre", moeurs: "mœurs",

  // ── the cedilla ──
  ca: "ça", facon: "façon", facons: "façons", lecon: "leçon", lecons: "leçons", garcon: "garçon", garcons: "garçons",
  recu: "reçu", recue: "reçue", recoit: "reçoit", recois: "reçois", apercu: "aperçu", concu: "conçu", decu: "déçu", percu: "perçu",
  facade: "façade", glacon: "glaçon", macon: "maçon", soupcon: "soupçon", rancon: "rançon", hamecon: "hameçon",
  calecon: "caleçon", troncon: "tronçon", provencal: "provençal", commencons: "commençons",

  // ── the diaeresis ──
  naif: "naïf", naive: "naïve", noel: "noël", coincidence: "coïncidence", egoiste: "égoïste", heroine: "héroïne",
  laique: "laïque", mosaique: "mosaïque", archaique: "archaïque", stoique: "stoïque", canoe: "canoë",
  ambigue: "ambiguë", ambiguite: "ambiguïté", aigue: "aiguë", inoui: "inouï", paien: "païen",

  // ── being, and its tenses ──
  ete: "été", etes: "êtes", etait: "était", etais: "étais", etaient: "étaient", etant: "étant", etiez: "étiez", etions: "étions",

  // ── the grave accent: -ès, -ère, -ème, -ène, -èce, -ège ──
  apres: "après", acces: "accès", succes: "succès", proces: "procès", progres: "progrès", congres: "congrès",
  exces: "excès", deces: "décès", expres: "exprès",
  mere: "mère", meres: "mères", pere: "père", peres: "pères", frere: "frère", freres: "frères",
  premiere: "première", premieres: "premières", derniere: "dernière", dernieres: "dernières",
  lumiere: "lumière", maniere: "manière", matiere: "matière", riviere: "rivière", carriere: "carrière",
  entiere: "entière", entierement: "entièrement", particuliere: "particulière", reguliere: "régulière",
  legere: "légère", misere: "misère", colere: "colère",
  probleme: "problème", problemes: "problèmes", systeme: "système", systemes: "systèmes", theme: "thème",
  poeme: "poème", deuxieme: "deuxième", troisieme: "troisième", quatrieme: "quatrième", cinquieme: "cinquième",
  sixieme: "sixième", septieme: "septième", huitieme: "huitième", neuvieme: "neuvième", dixieme: "dixième",
  onzieme: "onzième", douzieme: "douzième", vingtieme: "vingtième", centieme: "centième", enieme: "énième",
  scene: "scène", scenes: "scènes", phenomene: "phénomène", hygiene: "hygiène",
  piece: "pièce", pieces: "pièces", espece: "espèce", especes: "espèces", niece: "nièce",
  siege: "siège", college: "collège", privilege: "privilège", regles: "règles",
  modele: "modèle", modeles: "modèles", fidele: "fidèle", zele: "zèle", planete: "planète", poete: "poète",
  remede: "remède", critere: "critère", criteres: "critères", hypothese: "hypothèse", siecle: "siècle", siecles: "siècles",
  completement: "complètement", legende: "légende", cle: "clé", cles: "clés",

  // ── the acute accent, at the head of the word ──
  ecrit: "écrit", ecrits: "écrits", ecrite: "écrite", ecrire: "écrire", ecriture: "écriture", ecrivain: "écrivain",
  ecran: "écran", ecrans: "écrans", ecouter: "écouter", echec: "échec", echelle: "échelle",
  echapper: "échapper", eclair: "éclair", eclat: "éclat", eclairer: "éclairer",
  eglise: "église", eglises: "églises", edition: "édition", editeur: "éditeur", editorial: "éditorial", education: "éducation",
  egal: "égal", egalement: "également", egalite: "égalité", economie: "économie", economique: "économique",
  election: "élection", electrique: "électrique", electricite: "électricité", elephant: "éléphant", eliminer: "éliminer",
  elegant: "élégant", elegance: "élégance", element: "élément", elements: "éléments", elever: "élever", elire: "élire", elu: "élu",
  eloge: "éloge", eloigner: "éloigner", emission: "émission", emotion: "émotion", emergence: "émergence", emerger: "émerger",
  emettre: "émettre", emouvant: "émouvant", energie: "énergie", enerver: "énerver", enorme: "énorme", enormement: "énormément",
  epais: "épais", epaule: "épaule", epee: "épée", epicerie: "épicerie",
  episode: "épisode", eponge: "éponge", epoque: "époque", epoux: "époux", epreuve: "épreuve",
  equation: "équation", equipement: "équipement", equivalent: "équivalent",
  etablir: "établir", etablissement: "établissement", etage: "étage", etape: "étape", etapes: "étapes", etat: "état",
  etats: "états",
  etendre: "étendre", eternel: "éternel", eternite: "éternité", ethique: "éthique", etiquette: "étiquette", etoile: "étoile",
  etonnant: "étonnant", etonner: "étonner", etouffer: "étouffer", etrange: "étrange", etranger: "étranger", etrangere: "étrangère",
  etroit: "étroit", etude: "étude", etudes: "études", etudier: "étudier",
  evacuer: "évacuer", evaluer: "évaluer", evaluation: "évaluation", evangile: "évangile", eveil: "éveil", eveiller: "éveiller",
  evenement: "événement", evidemment: "évidemment", evidence: "évidence", evident: "évident", eviter: "éviter",
  evoluer: "évoluer", evolution: "évolution",

  // ── the acute accent, inside the word ──
  cafe: "café", cafes: "cafés", idee: "idée", idees: "idées", annee: "année", annees: "années", journee: "journée",
  soiree: "soirée", matinee: "matinée", musee: "musée", lycee: "lycée", armee: "armée", entree: "entrée",
  arrivee: "arrivée", pensee: "pensée", poesie: "poésie", video: "vidéo", zero: "zéro", numero: "numéro",
  tele: "télé", telephone: "téléphone", television: "télévision", telecharger: "télécharger",
  theatre: "théâtre", theorie: "théorie", therapie: "thérapie", universite: "université", verite: "vérité", veritable: "véritable",
  qualite: "qualité", quantite: "quantité", realite: "réalité", realiser: "réaliser", societe: "société",
  securite: "sécurité", sante: "santé", liberte: "liberté", identite: "identité", humanite: "humanité",
  unite: "unité", utilite: "utilité", variete: "variété", diversite: "diversité", difficulte: "difficulté",
  efficacite: "efficacité", fidelite: "fidélité", fierte: "fierté", publicite: "publicité", propriete: "propriété",
  proprietaire: "propriétaire", responsabilite: "responsabilité", specialite: "spécialité", necessite: "nécessité",
  generosite: "générosité", moitie: "moitié", medecin: "médecin", medecine: "médecine", memoire: "mémoire",
  methode: "méthode", metier: "métier", metro: "métro", meteo: "météo", menage: "ménage", melanger: "mélanger",
  mecanique: "mécanique", media: "média", medias: "médias", necessaire: "nécessaire", negatif: "négatif",
  negociation: "négociation",
  general: "général", generale: "générale", generaux: "généraux", generation: "génération", genereux: "généreux",
  genie: "génie", geographie: "géographie", heros: "héros", heritage: "héritage", heritier: "héritier",
  hesiter: "hésiter", hesitation: "hésitation", ideal: "idéal", ideologie: "idéologie", imbecile: "imbécile",
  immediat: "immédiat", immediatement: "immédiatement", implementer: "implémenter", independance: "indépendance",
  independant: "indépendant", inegalite: "inégalité", inquietude: "inquiétude", integrer: "intégrer", integration: "intégration",
  interesser: "intéresser", interessant: "intéressant", interieur: "intérieur", exterieur: "extérieur", superieur: "supérieur",
  superieure: "supérieure", interpreter: "interpréter", interpretation: "interprétation", irregulier: "irrégulier",
  itineraire: "itinéraire", leger: "léger", legume: "légume", liberer: "libérer", litterature: "littérature",
  litteraire: "littéraire", materiel: "matériel", obeir: "obéir", opera: "opéra", operation: "opération", operer: "opérer",
  pedagogie: "pédagogie", penible: "pénible", periode: "période", precis: "précis", precisement: "précisément",
  precision: "précision", preferer: "préférer", preference: "préférence", preparer: "préparer",
  preparation: "préparation", presence: "présence", present: "présent", presenter: "présenter", presentation: "présentation",
  president: "président", prevoir: "prévoir", prevu: "prévu", prevision: "prévision", procedure: "procédure",
  recemment: "récemment", recent: "récent", recente: "récente", reception: "réception", recuperer: "récupérer",
  reduire: "réduire", reduction: "réduction", reel: "réel", reelle: "réelle", reellement: "réellement",
  reference: "référence", reflechir: "réfléchir", reflexion: "réflexion", regime: "régime",
  region: "région", regional: "régional", regulier: "régulier", regulierement: "régulièrement",
  repondre: "répondre", reponse: "réponse", reponses: "réponses", reparer: "réparer", repeter: "répéter",
  repetition: "répétition", republique: "république", reputation: "réputation", reseau: "réseau", reseaux: "réseaux",
  reserver: "réserver", resistance: "résistance", resoudre: "résoudre", resolution: "résolution",
  resultat: "résultat", resultats: "résultats", resumer: "résumer", retablir: "rétablir",
  reunir: "réunir", reunion: "réunion", reussir: "réussir", reussi: "réussi", reussite: "réussite",
  reveil: "réveil", reveiller: "réveiller", reveler: "révéler", revelation: "révélation", revolution: "révolution",
  secretaire: "secrétaire", selection: "sélection", separer: "séparer", separation: "séparation",
  serie: "série", serieux: "sérieux", serieuse: "sérieuse", serieusement: "sérieusement", severe: "sévère",
  special: "spécial", speciale: "spéciale", specialement: "spécialement", specifique: "spécifique", strategie: "stratégie",
  temoin: "témoin", temoignage: "témoignage", vehicule: "véhicule", verifier: "vérifier", verification: "vérification",
  celebrer: "célébrer", ceremonie: "cérémonie", cereale: "céréale", comedie: "comédie", completer: "compléter",
  conference: "conférence", consequence: "conséquence", creer: "créer", creation: "création",
  creatif: "créatif", credit: "crédit", debat: "débat", debut: "début", debuter: "débuter", decembre: "décembre",
  decider: "décider", decision: "décision", declarer: "déclarer", declaration: "déclaration", decouvrir: "découvrir",
  decouverte: "découverte", decrire: "décrire", defaut: "défaut", defendre: "défendre", defense: "défense",
  definir: "définir", definition: "définition", definitif: "définitif", degre: "degré", delai: "délai",
  delicat: "délicat", delicieux: "délicieux", demarche: "démarche", demenager: "déménager", democratie: "démocratie",
  demontrer: "démontrer", depart: "départ", departement: "département", depasser: "dépasser", dependre: "dépendre",
  deplacer: "déplacer", deposer: "déposer", deranger: "déranger", desir: "désir",
  desirer: "désirer", desole: "désolé", desolee: "désolée", desordre: "désordre", detail: "détail", details: "détails",
  detester: "détester", detruire: "détruire", developper: "développer", developpement: "développement",
  difference: "différence", different: "différent", differente: "différente", differents: "différents",
  experience: "expérience", feminin: "féminin", federal: "fédéral", felicitations: "félicitations", fevrier: "février",
  guerir: "guérir", guerison: "guérison", chretien: "chrétien",

  // ── the circumflex ──
  hotel: "hôtel", hotels: "hôtels", bientot: "bientôt", plutot: "plutôt", tot: "tôt", aussitot: "aussitôt", sitot: "sitôt",
  tantot: "tantôt", role: "rôle", roles: "rôles", controler: "contrôler", drole: "drôle", fantome: "fantôme", chomage: "chômage",
  chomeur: "chômeur", depot: "dépôt", impot: "impôt",
  impots: "impôts", arome: "arôme", symptome: "symptôme", icone: "icône", trone: "trône", cone: "cône", pole: "pôle",
  ile: "île", iles: "îles", diner: "dîner", boite: "boîte", maitre: "maître", maitresse: "maîtresse",
  connaitre: "connaître", paraitre: "paraître", naitre: "naître", chaine: "chaîne", fraiche: "fraîche", plait: "plaît",
  surement: "sûrement", bruler: "brûler", flute: "flûte", piqure: "piqûre", cout: "coût", couts: "coûts",
  couter: "coûter", gout: "goût", gouts: "goûts", aout: "août",
  gateau: "gâteau", gateaux: "gâteaux", chateau: "château", chateaux: "châteaux", grace: "grâce", ame: "âme", ane: "âne",
  bati: "bâti", batiment: "bâtiment", crane: "crâne", hate: "hâte",
  fetes: "fêtes", tete: "tête", tetes: "têtes", bete: "bête", betes: "bêtes", fenetre: "fenêtre",
  fenetres: "fenêtres", enquete: "enquête", conquete: "conquête", requete: "requête", quete: "quête",
  pret: "prêt", pretre: "prêtre", arret: "arrêt", arrets: "arrêts", arreter: "arrêter",
  interet: "intérêt", interets: "intérêts", reves: "rêves", rever: "rêver", honnete: "honnête",
  extreme: "extrême", extremement: "extrêmement", supreme: "suprême", chene: "chêne", empecher: "empêcher",
  vetement: "vêtement", vetements: "vêtements", tempete: "tempête", crepe: "crêpe", guepe: "guêpe", bapteme: "baptême",

  // ── two words the accent decides ──
  voila: "voilà",
};

/** The word as the table knows it: letters only, so a `Tres` or a `TRES`
 *  can be looked up by its lowercase shape. */
const WORD_RE = /^[A-Za-z]+$/;

/** The correction for one typed word, or null when the table has nothing to
 *  say. Case follows the writer: `Ecole` → `École`, `etat` → `état`. An
 *  all-caps word (`ETAT`) is left alone — a heading in capitals, an acronym,
 *  a shout — because a table of lowercase words has not earned an opinion
 *  about it. Words with an accent already in them are never in the table's
 *  domain (`WORD_RE`), so they return null before any lookup. */
export function frenchCorrection(word: string): string | null {
  if (!WORD_RE.test(word)) return null;
  const lower = word.toLowerCase();
  const target = TABLE[lower];
  if (target === undefined) return null;
  if (word === lower) return target;
  const rest = word.slice(1);
  if (rest !== rest.toLowerCase()) return null; // ETAT, eTat: not a spelling
  return target.charAt(0).toUpperCase() + target.slice(1);
}

/** The table itself, for the tests that hold it to its rules. Readonly: the
 *  editor asks through `frenchCorrection`. */
export const FRENCH_TABLE: Readonly<Record<string, string>> = TABLE;

// ── Typography ──────────────────────────────────────────────────────────────
//
// French puts a space BEFORE `;` `:` `!` `?`, and inside its « guillemets »,
// and both spaces are ones a line must never break at — a question mark
// starting the next line is the classic French typesetting fault. The narrow
// no-break space (U+202F) is the one the Imprimerie nationale prescribes
// before the tall punctuation; the ordinary no-break space (U+00A0) sits
// inside the quotes.

export const NARROW_NBSP = "\u202f";
export const NBSP = "\u00a0";

/** The punctuation that takes a narrow no-break space before it. */
export const TALL_PUNCTUATION = new Set([";", ":", "!", "?"]);

/** One edit, in offsets RELATIVE TO THE INSERTION POINT of the character
 *  that triggered it: `from`/`to` are ≤ 0 for text before the caret, and `to`
 *  may reach past it by the typed character's length when that character is
 *  itself part of what is rewritten (`...` → `…`). The editor adds the caret
 *  position to both. */
export interface Fix {
  from: number;
  to: number;
  insert: string;
}

/** A letter of a French word, accents included. Digits, `_` and `-` end a
 *  word: `tres_bien` is an identifier, `peut-etre` is two words. */
const LETTER_RE = /\p{L}/u;

/** What may stand just before a word for it to be prose. A backslash is a
 *  TeX command (`\etat`), and the URL and path characters mean the "word" is
 *  a piece of an address — `example.com/etat`, `user@etat`, `#etat` a tag,
 *  `&etat` an entity. An apostrophe is fine: `l'ecole` is the school. */
const NOT_PROSE_BEFORE = new Set(["\\", "/", ".", "@", "#", "&", "_", "~", "$"]);

/** An address in progress anywhere before the word on its line: once a line
 *  has opened `https://` or `www.`, every unbroken run to the caret belongs
 *  to it, dots and slashes and all. */
const URL_RE = /(?:https?:\/\/|www\.)\S*$/;

/** The word ending at the caret, corrected — or null. `before` is the line's
 *  text up to the caret. Pure: the caller decides whether the position is
 *  prose at all (code, links, math, frontmatter) and whether the line is
 *  French. */
export function wordFix(before: string): (Fix & { word: string }) | null {
  let start = before.length;
  while (start > 0 && LETTER_RE.test(before.charAt(start - 1))) start -= 1;
  if (start === before.length) return null;
  const prev = start > 0 ? before.charAt(start - 1) : "";
  if (NOT_PROSE_BEFORE.has(prev) || /\p{N}/u.test(prev)) return null;
  if (URL_RE.test(before.slice(0, start))) return null;
  const word = before.slice(start);
  const insert = frenchCorrection(word);
  if (insert === null) return null;
  return { from: start - before.length, to: 0, insert, word };
}

/** Every correction a WHOLE line is owed, in offsets from the line's start:
 *  each table word on it, and each of the typographic fixes below. The
 *  editor asks this once, at the boundary where a line BECOMES French — a
 *  line's first words are finished before its second French word is, so
 *  `Tres bien, je` had its `Tres` left alone by `wordFix` at the space, and
 *  a line that was going to be corrected at all should be corrected whole.
 *  Same rules as the two per-keystroke planners (a word after a backslash,
 *  a path, a tag, an address, a digit is not a word; the space after a list
 *  marker is markdown's); the caller still asks, per fix, whether the spot
 *  is prose. Sorted by position, never overlapping. */
export function lineFixes(line: string): Array<Fix & { word?: string }> {
  const out: Array<Fix & { word?: string }> = [];
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(line); m; m = TOKEN_RE.exec(line)) {
    const word = m[0];
    const start = m.index;
    const end = start + word.length;
    const prev = start > 0 ? line.charAt(start - 1) : "";
    const next = line.charAt(end);
    if (NOT_PROSE_BEFORE.has(prev) || /\p{N}/u.test(prev)) continue;
    if (next === "_" || /\p{N}/u.test(next)) continue;
    if (URL_RE.test(line.slice(0, start))) continue;
    const insert = frenchCorrection(word);
    if (insert !== null) out.push({ from: start, to: end, insert, word });
  }
  // ` ?` after a word or a closing bracket; `« ` and ` »`; exactly three dots.
  const TALL_RE = /(?<=[\p{L}\p{N})»"”’\]]) (?=[;:!?])/gu;
  for (let m = TALL_RE.exec(line); m; m = TALL_RE.exec(line)) out.push({ from: m.index, to: m.index + 1, insert: NARROW_NBSP });
  const GUILLEMET_RE = /(?<=«) | (?=»)/g;
  for (let m = GUILLEMET_RE.exec(line); m; m = GUILLEMET_RE.exec(line)) out.push({ from: m.index, to: m.index + 1, insert: NBSP });
  const DOTS_RE = /(?<!\.)\.\.\.(?!\.)/g;
  for (let m = DOTS_RE.exec(line); m; m = DOTS_RE.exec(line)) out.push({ from: m.index, to: m.index + 3, insert: "…" });
  return out.sort((x, y) => x.from - y.from);
}

/** The characters after which a word is finished — what makes the editor
 *  look back at it. A newline is one (the caller tests `startsWith("\n")`,
 *  since Enter may bring an indent or a list marker with it). */
export const BOUNDARIES = new Set([
  " ", ".", ",", ";", ":", "!", "?", ")", "]", "}", '"', "»", "'", "’", "-", "…", "*",
]);

/** The typographic rules, each on the character that completes it:
 *
 *  · `word ?` — an ordinary space before `;` `:` `!` `?` becomes the narrow
 *    no-break space. Only a space after a WORD (or a closing bracket or
 *    quote): the space after a list marker or a table pipe is markdown's.
 *  · `« word` — the space typed after an opening guillemet, and the space
 *    before a closing one, become no-break spaces.
 *  · `...` — three dots become the one ellipsis character.
 *
 *  `before` is the line up to the caret, `typed` the character just typed
 *  (already in the document, at `before.length`). */
export function typographyFix(before: string, typed: string): Fix | null {
  const prev = before.charAt(before.length - 1);
  const prev2 = before.charAt(before.length - 2);
  if (TALL_PUNCTUATION.has(typed) && prev === " " && /[\p{L}\p{N})»"”’\]]/u.test(prev2)) {
    return { from: -1, to: 0, insert: NARROW_NBSP };
  }
  if (typed === "»" && prev === " " && before.length > 1) {
    return { from: -1, to: 0, insert: NBSP };
  }
  if (typed === " " && prev === "«") {
    return { from: 0, to: 1, insert: NBSP };
  }
  if (typed === "." && prev === "." && prev2 === "." && before.charAt(before.length - 3) !== ".") {
    return { from: -2, to: 1, insert: "…" };
  }
  return null;
}
