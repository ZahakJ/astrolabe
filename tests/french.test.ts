// French auto-correction (shared/french.ts): the table's rules, the line
// detector's threshold, and the two planners the editor dispatches from.
//
// The table's one promise is that it never guesses, so the tests are mostly
// about what it must NOT contain: a source that is itself a French word, a
// target that changes nothing, a duplicate that would make the object literal
// lie about its own size.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BOUNDARIES,
  FRENCH_TABLE,
  NARROW_NBSP,
  NBSP,
  frenchCorrection,
  frenchScore,
  lineFixes,
  looksFrench,
  noteIsFrench,
  typographyFix,
  wordFix,
} from "../shared/french.ts";

/** Real French words that a naive accent table would list as sources — each
 *  is a word in its own right, with or without the mark, and the table must
 *  hold none of them. The doc comment on the table names the same set; this
 *  is the same list as an assertion. */
const REAL_WORDS = [
  "a", "ou", "la", "sur", "du", "cote", "tache", "mur", "pres", "gene", "peche", "foret", "mais",
  "pate", "traite", "fatigue", "varie", "eleve", "notre", "votre", "the", "des", "les", "de", "en", "on",
  "mat", "pale", "male", "aine", "cru", "jeune", "hale", "bailler", "chasse", "tache",
];

/** Sources with two everyday readings — `cree` is `crée` as often as `créé`,
 *  `reserve` is `réserve` or `réservé` — which a table that never guesses
 *  cannot hold either. */
const TWO_WAYS = [
  "cree", "enonce", "prefere", "resume", "reserve", "controle", "regle", "celebre", "age", "equipe", "diplome",
  "reve", "depense", "echange", "melange", "prete", "epouse", "lache", "fete", "revolte", "epice", "reforme",
  "coute", "equilibre",
];

describe("the correction table", () => {
  it("has no source that is a real French word", () => {
    for (const w of REAL_WORDS) assert.equal(FRENCH_TABLE[w], undefined, `${w} must not be a source`);
  });

  it("has no source that reads two ways", () => {
    for (const w of TWO_WAYS) assert.equal(FRENCH_TABLE[w], undefined, `${w} must not be a source`);
  });

  it("has no duplicate sources", () => {
    // An object literal silently keeps the LAST of two equal keys, so the
    // check is on the source text: every `key:` before a quoted value.
    const src = readFileSync(new URL("../shared/french.ts", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("const TABLE"), src.indexOf("};", src.indexOf("const TABLE")));
    const keys = [...body.matchAll(/(?:^|[\s{,])([a-z]+):\s*"/g)].map((m) => m[1]);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const k of keys) {
      if (seen.has(k)) dupes.push(k);
      seen.add(k);
    }
    assert.deepEqual(dupes, []);
    assert.equal(keys.length, Object.keys(FRENCH_TABLE).length);
  });

  it("is at least the size the feature promised", () => {
    // 150 was the floor asked for; the table is a few hundred past it, and
    // every entry above the floor passed the same rules as the ones below.
    const n = Object.keys(FRENCH_TABLE).length;
    assert.ok(n >= 150, `${n} entries`);
  });

  it("only maps ASCII sources to a target that actually adds something", () => {
    for (const [source, target] of Object.entries(FRENCH_TABLE)) {
      assert.match(source, /^[a-z]+$/, `${source} is not lowercase ASCII`);
      assert.notEqual(source, target, `${source} corrects to itself`);
      // Every target carries a mark the source lacked — an accent, a cedilla,
      // a ligature — which is the only kind of correction this table makes.
      assert.match(target, /[^\x00-\x7f]/, `${source} → ${target} adds no accent`);
      // …and is otherwise the same word: strip the marks and the letters agree.
      const stripped = target.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe");
      assert.equal(stripped, source, `${source} → ${target} changes more than the marks`);
    }
  });

  it("answers the owner's examples", () => {
    assert.equal(frenchCorrection("tres"), "très");
    assert.equal(frenchCorrection("etre"), "être");
    assert.equal(frenchCorrection("deja"), "déjà");
    assert.equal(frenchCorrection("francais"), "français");
    assert.equal(frenchCorrection("coeur"), "cœur");
    assert.equal(frenchCorrection("oeuvre"), "œuvre");
    assert.equal(frenchCorrection("soeur"), "sœur");
    assert.equal(frenchCorrection("ecole"), "école");
    assert.equal(frenchCorrection("etudiant"), "étudiant");
    assert.equal(frenchCorrection("hopital"), "hôpital");
    assert.equal(frenchCorrection("meme"), "même");
  });

  it("never touches the words that go both ways", () => {
    for (const w of ["a", "ou", "la", "sur", "du", "eleve", "cote", "the"]) assert.equal(frenchCorrection(w), null);
  });

  it("follows the writer's capital, and leaves capitals alone", () => {
    assert.equal(frenchCorrection("Ecole"), "École");
    assert.equal(frenchCorrection("Etat"), "État");
    assert.equal(frenchCorrection("Tres"), "Très");
    assert.equal(frenchCorrection("ETAT"), null);
    assert.equal(frenchCorrection("eTat"), null);
  });

  it("ignores anything that is not a bare word", () => {
    assert.equal(frenchCorrection("très"), null);
    assert.equal(frenchCorrection("tres2"), null);
    assert.equal(frenchCorrection(""), null);
    assert.equal(frenchCorrection("t-res"), null);
  });
});

describe("looksFrench", () => {
  it("takes three French sentences", () => {
    assert.ok(looksFrench("Je suis tres content de vous voir."));
    assert.ok(looksFrench("Elle a un coeur d'or et une patience infinie."));
    assert.ok(looksFrench("Nous avons visité l'école du village hier."));
  });

  it("counts the accents as one marker, not one per word", () => {
    // An English line quoting two accented loanwords is still English; the
    // accents alone never make a line French, and `é` — the one English
    // borrows most (café, résumé, fiancé) — is not a marker at all.
    assert.equal(frenchScore("Très bientôt"), 1);
    assert.equal(frenchScore("a naïve café résumé"), 0);
    assert.ok(looksFrench("Très bientôt, je pense"));
    assert.ok(!looksFrench("The crème brûlée was perfect"));
  });

  it("counts the elisions", () => {
    assert.equal(frenchScore("j'ai"), 1);
    assert.equal(frenchScore("c'est"), 2);
    assert.equal(frenchScore("qu’il"), 2);
    // A bare `l` is nothing, and English `don't` never yields a bare `n`.
    assert.equal(frenchScore("I don't know l"), 0);
  });

  it("refuses English, even English about a car and its son", () => {
    assert.ok(!looksFrench("This is tres chic"));
    assert.ok(!looksFrench("I put it on the car, plus a son and me"));
    assert.ok(!looksFrench("The quick brown fox jumps over the lazy dog"));
    assert.ok(!looksFrench("Beyoncé played the café"));
    assert.ok(!looksFrench("Zoë's fiancé opened a crêperie"));
  });

  it("does not count a word in capitals", () => {
    // `UN`, `LA`, `EST`, `ET` are an organisation, a city, a time zone and
    // a studio; an English meeting note carrying two of them was French.
    assert.equal(frenchScore("Meeting at 5pm EST with the UN about the hotel"), 0);
    assert.ok(!looksFrench("LA and the UN"));
    // A capital at the head of a sentence still counts.
    assert.equal(frenchScore("Je suis"), 2);
    assert.ok(looksFrench("Il est"));
  });

  it("refuses the Romance languages that share its function words, and Latin", () => {
    // `la`, `de`, `un`, `que`, `il`, `les` are Spanish, Italian, Portuguese
    // and Catalan too; one word French does not use settles the line.
    assert.ok(!looksFrench("la casa de mi madre es un hotel"));
    assert.ok(!looksFrench("il libro e la casa dei nonni"));
    assert.ok(!looksFrench("a casa da minha mãe não é um hotel"));
    assert.ok(!looksFrench("els amics de la casa"));
    assert.ok(!looksFrench("Deus est qui non est, ergo sunt"));
    // …but `tu es` is French, and `con` and `dos` are French words too.
    assert.ok(looksFrench("tu es la seule"));
    assert.ok(looksFrench("le con et le dos"));
  });

  it("refuses Arabic, Hebrew and CJK lines whatever they also carry", () => {
    assert.ok(!looksFrench("الحمد لله je suis très content"));
    assert.ok(!looksFrench("שלום et bonjour à tous"));
    assert.ok(!looksFrench("日本語 et la France"));
  });

  it("refuses code", () => {
    // A line of identifiers that happen to spell `le`, `les`, `un`, `de`
    // WOULD score — which is why the editor asks the syntax tree before it
    // asks this function. What this function promises is only that ordinary
    // code does not read as French:
    assert.ok(!looksFrench("for (let i = 0; i < n; i++) total += rows[i].value;"));
    assert.ok(!looksFrench("SELECT id, name FROM users WHERE active = 1;"));
    assert.ok(!looksFrench("git commit -m 'fix the thing'"));
  });

  it("reads the note's own frontmatter", () => {
    assert.ok(noteIsFrench("title: Notes\nlang: fr\n"));
    assert.ok(noteIsFrench("language: fr-CA"));
    assert.ok(noteIsFrench('lang: "FR"'));
    assert.ok(!noteIsFrench("lang: en"));
    assert.ok(!noteIsFrench("title: fr\n"));
    assert.ok(!noteIsFrench(""));
  });
});

describe("wordFix", () => {
  it("corrects the word ending at the caret, relative to it", () => {
    assert.deepEqual(wordFix("Je suis tres"), { from: -4, to: 0, insert: "très", word: "tres" });
    assert.deepEqual(wordFix("l'ecole"), { from: -5, to: 0, insert: "école", word: "ecole" });
  });

  it("has nothing to say when there is no word, or no correction", () => {
    assert.equal(wordFix(""), null);
    assert.equal(wordFix("Je suis "), null);
    assert.equal(wordFix("Je suis content"), null);
  });

  it("leaves TeX commands, tags, paths and addresses alone", () => {
    assert.equal(wordFix("\\etat"), null);
    assert.equal(wordFix("#etat"), null);
    assert.equal(wordFix("example.com/etat"), null);
    assert.equal(wordFix("voir https://fr.wikipedia.org/wiki/etat"), null);
    assert.equal(wordFix("www.etat"), null);
    assert.equal(wordFix("moi@etat"), null);
    assert.equal(wordFix("un_etat"), null);
    assert.equal(wordFix("3etat"), null);
    // …but an address earlier on the line, separated by a space, is over.
    assert.equal(wordFix("https://x.y/z tres")?.insert, "très");
  });

  it("names the boundaries the editor listens for", () => {
    for (const c of [" ", ".", ",", "?", ")", "»", "-", "*"]) assert.ok(BOUNDARIES.has(c), c);
    assert.ok(!BOUNDARIES.has("_"));
    assert.ok(!BOUNDARIES.has("/"));
  });
});

describe("lineFixes", () => {
  it("corrects a whole line at once, words and typography, in order", () => {
    const line = "Tres bien, je dis « tres » et alors... vraiment ?";
    assert.deepEqual(lineFixes(line), [
      { from: 0, to: 4, insert: "Très", word: "Tres" },
      { from: 19, to: 20, insert: NBSP },
      { from: 20, to: 24, insert: "très", word: "tres" },
      { from: 24, to: 25, insert: NBSP },
      { from: 35, to: 38, insert: "…" },
      { from: 47, to: 48, insert: NARROW_NBSP },
    ]);
  });

  it("keeps the per-word rules", () => {
    const fixes = lineFixes("\\etat #etat 3etat etat_x etat2 https://x.y/etat www.etat - : etat");
    assert.deepEqual(fixes, [{ from: 61, to: 65, insert: "état", word: "etat" }]);
    assert.deepEqual(lineFixes("Je suis très content"), []);
    assert.deepEqual(lineFixes(""), []);
  });
});

describe("typographyFix", () => {
  it("narrows the space before tall punctuation, after a word only", () => {
    assert.deepEqual(typographyFix("Vraiment ", "?"), { from: -1, to: 0, insert: NARROW_NBSP });
    assert.deepEqual(typographyFix("Non ", "!"), { from: -1, to: 0, insert: NARROW_NBSP });
    assert.deepEqual(typographyFix("Note ", ":"), { from: -1, to: 0, insert: NARROW_NBSP });
    assert.deepEqual(typographyFix("(oui) ", ";"), { from: -1, to: 0, insert: NARROW_NBSP });
    // A list marker's or a table pipe's space is markdown's, not prose.
    assert.equal(typographyFix("- ", ":"), null);
    assert.equal(typographyFix("| ", ":"), null);
    assert.equal(typographyFix(" ", "?"), null);
    // No space, no change: the rule converts a space, it never adds one.
    assert.equal(typographyFix("Vraiment", "?"), null);
    // Already narrow: nothing to do.
    assert.equal(typographyFix(`Vraiment${NARROW_NBSP}`, "?"), null);
  });

  it("puts no-break spaces inside guillemets", () => {
    assert.deepEqual(typographyFix("«", " "), { from: 0, to: 1, insert: NBSP });
    assert.deepEqual(typographyFix("« bonjour ", "»"), { from: -1, to: 0, insert: NBSP });
    assert.equal(typographyFix("bonjour", "»"), null);
  });

  it("turns three dots into an ellipsis, once", () => {
    assert.deepEqual(typographyFix("Alors..", "."), { from: -2, to: 1, insert: "…" });
    assert.equal(typographyFix("Alors.", "."), null);
    assert.equal(typographyFix("Alors...", "."), null);
  });
});
