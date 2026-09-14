// Hadith references (shared/hadithRefs.ts): the callout's text and the corpus
// note's frontmatter must fold to ONE key, or a callout that names the right
// hadith renders as a quote with no way to tell why. Every claim here is
// about that agreement, plus the chain/matn split the card draws from.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectionKey,
  collectionLabel,
  hadithKey,
  hadithKeyOfFrontmatter,
  parseHadithRef,
  splitHadith,
} from "../shared/hadithRefs.ts";

describe("collectionKey", () => {
  it("files the six books and their Arabic names under one key each", () => {
    for (const spelling of ["Bukhari", "bukhari", "al-Bukhari", "Sahih al-Bukhari", "Sahih Bukhari", "البخاري", "صحيح البخاري", "بخاري"]) {
      assert.equal(collectionKey(spelling), "bukhari", spelling);
    }
    assert.equal(collectionKey("Muslim"), "muslim");
    assert.equal(collectionKey("صحيح مسلم"), "muslim");
    assert.equal(collectionKey("Abu Dawud"), "abudawud");
    assert.equal(collectionKey("سنن أبي داود"), "abudawud");
    assert.equal(collectionKey("Tirmidhi"), "tirmidhi");
    assert.equal(collectionKey("الترمذي"), "tirmidhi");
    assert.equal(collectionKey("Nasa'i"), "nasai");
    assert.equal(collectionKey("النسائي"), "nasai");
    assert.equal(collectionKey("Ibn Majah"), "ibnmajah");
    assert.equal(collectionKey("ابن ماجه"), "ibnmajah");
  });

  it("keeps a book it has never heard of, folded to itself", () => {
    assert.equal(collectionKey("Ibn Hibban"), "ibnhibban");
    assert.equal(collectionKey("ibn-hibban"), "ibnhibban");
    assert.equal(collectionKey("صحيح ابن حبان"), "ابنحبان");
    assert.equal(collectionKey(""), "");
    assert.equal(collectionKey("  ,  "), "");
  });
});

describe("parseHadithRef", () => {
  it("reads a collection and a number with any separator", () => {
    assert.deepEqual(parseHadithRef("Bukhari 1"), { collection: "bukhari", number: 1 });
    assert.deepEqual(parseHadithRef("Bukhari:1"), { collection: "bukhari", number: 1 });
    assert.deepEqual(parseHadithRef("Bukhari #1"), { collection: "bukhari", number: 1 });
    assert.deepEqual(parseHadithRef("Sahih Muslim 2564"), { collection: "muslim", number: 2564 });
    assert.deepEqual(parseHadithRef("البخاري ١"), { collection: "bukhari", number: 1 });
    assert.deepEqual(parseHadithRef("صحيح البخاري، ٥٢"), { collection: "bukhari", number: 52 });
    assert.deepEqual(parseHadithRef("Ibn Hibban 12"), { collection: "ibnhibban", number: 12 });
  });

  it("refuses text with no number or no collection", () => {
    assert.equal(parseHadithRef("Bukhari"), null);
    assert.equal(parseHadithRef("1"), null);
    assert.equal(parseHadithRef(""), null);
    assert.equal(parseHadithRef("Bukhari 0"), null);
  });
});

describe("the key, from both sides", () => {
  it("is the same string from the callout and from the frontmatter", () => {
    const fromCallout = parseHadithRef("Sahih al-Bukhari 52")!;
    assert.equal(hadithKey(fromCallout.collection, fromCallout.number), "bukhari#52");
    assert.equal(hadithKeyOfFrontmatter({ collection: "البخاري", number: 52 }), "bukhari#52");
    assert.equal(hadithKeyOfFrontmatter({ collection: "Bukhari", number: "52" }), "bukhari#52");
    assert.equal(hadithKeyOfFrontmatter({ collection: "Bukhari", number: "٥٢" }), "bukhari#52");
  });

  it("is null for a note that is not a corpus note", () => {
    assert.equal(hadithKeyOfFrontmatter({}), null);
    assert.equal(hadithKeyOfFrontmatter({ collection: "Bukhari" }), null);
    assert.equal(hadithKeyOfFrontmatter({ number: 1 }), null);
    // A tag page's `collection: true` is a different feature's key entirely.
    assert.equal(hadithKeyOfFrontmatter({ collection: true, number: 1 }), null);
    assert.equal(hadithKeyOfFrontmatter({ collection: "Bukhari", number: 1.5 }), null);
  });
});

describe("collectionLabel", () => {
  it("names a known book in the chrome's language and a custom one as written", () => {
    assert.equal(collectionLabel("bukhari", "ar", "Bukhari"), "صحيح البخاري");
    assert.equal(collectionLabel("bukhari", "en", "البخاري"), "Sahih al-Bukhari");
    assert.equal(collectionLabel("ibnhibban", "en", "Ibn Hibban"), "Ibn Hibban");
  });
});

describe("splitHadith", () => {
  it("takes a first paragraph that opens like an isnad for the chain", () => {
    const body = "حَدَّثَنَا الحُمَيْدِيُّ عَبْدُ اللَّهِ بْنُ الزُّبَيْرِ، قَالَ: حَدَّثَنَا سُفْيَانُ\n\nإِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ";
    const { chain, matn } = splitHadith(body);
    assert.ok(chain?.startsWith("حَدَّثَنَا"));
    assert.equal(matn, "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ");
  });

  it("is all matn when nothing opens like an isnad", () => {
    assert.deepEqual(splitHadith("The deeds are by intentions.\n\nSecond paragraph."), {
      chain: null,
      matn: "The deeds are by intentions.\n\nSecond paragraph.",
    });
  });

  it("lets the frontmatter's own chain win", () => {
    assert.deepEqual(splitHadith("إِنَّمَا الأَعْمَالُ", "عن عمر رضي الله عنه"), {
      chain: "عن عمر رضي الله عنه",
      matn: "إِنَّمَا الأَعْمَالُ",
    });
  });
});
