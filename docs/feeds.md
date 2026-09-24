# Feeds

*Other people's writing, read here: a list of feeds kept in a note, fetched only when you say so, and the articles worth keeping written into the vault.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Feeds is the reading side of RSS. You keep a list of the blogs, journals and newsletters you follow; the server asks them for new articles on a schedule; the **Feeds** page lists what is unread, grouped by feed, with a reader beside it; and **Keep** turns an article you want into a note of your own.

It is **not** the blog's RSS. The feed your own site publishes (`/feed.xml`, see [Blog mode](blog-mode.md)) is the site speaking outward; Feeds is you listening. The two share nothing but a file format.

## The list is a note

The feeds you follow live in a note, `Feeds.md` at the vault root unless Settings → Vault → Feeds names another. Inside it, a `feeds` code block holds one address per line:

````markdown
# Feeds

```feeds
#reading
https://example.org/feed.xml → Reading/Essays
#essays #long-form
https://another.example/rss
https://a-blog.example/
// a line starting with two slashes is a comment
```
````

- **An address per line.** RSS 2.0, Atom and JSON Feed are all read. A blog's front page works too: the server reads the page's `<link rel="alternate">` and follows the feed it names, the way a browser's feed button does.
- **`→ Folder`** (or `->`) after an address says where an article kept from that feed is filed. Without it, kept articles go to `Reading/`.
- **A line of `#tags`** adds those tags to the feed above it. A tag line before the first address applies to every feed in the block.
- The first mention of an address wins; a second is listed as a problem, not merged. A line that is not an address, a folder that cannot be used, a tag line with no feed above it: each is shown at the top of the Feeds page with its line number, and the rest of the list still works.

Because the list is a note, it syncs, keeps its history and can be annotated like any note: write around the block as much as you like; only the block is read. If the note does not exist yet, the Feeds page offers to start it with an empty block.

## Fetching is yours to switch on

A new instance fetches **nothing**. Turn on **Fetch feeds** in Settings → Vault → Feeds, and the server starts asking. Turned off, no feed is asked for anything: the Feeds page still lists what was already fetched, and says why nothing new arrives.

With fetching on, the server asks every feed in the list:

- **on git sync's schedule** when [Backup & sync](backup-and-sync.md) runs on a timer (one interval for everything this instance does over the network), and **every hour** when it does not;
- **at once** for a feed you have just added to the list;
- **whenever you press Check now** on the Feeds page.

It asks politely: each request carries the feed's last `ETag` and `Last-Modified`, so an unchanged feed costs a "not modified" answer and no bytes. A feed that fails (a timeout, a 404, a page that names no feed) is shown with the reason, and asked again next time.

What was fetched, and which articles you have read, is kept in the server's data directory (`feeds.db`), **never in the vault**. A hundred articles an hour from somebody else's blog would be noise in your notes and your git history, and "I read this" is a fact about you on this machine. It does not travel with the vault (see [Backup & sync](backup-and-sync.md)); deleting it loses the read marks and nothing else.

## Reading

Open **Feeds** from the palette, from the feed icon beside the calendar at the top of the window, or at `/feeds`. Unread articles are listed by feed, newest first; pick one and it opens in the reader beside the list.

The article is shown as the feed carried it, cleaned first: scripts, styles, forms and embedded frames are taken out, links open in a new tab, and images load only as you scroll to them, from their own site, sending no referrer. When the feed carries only a summary, the reader says so.

| Keys | Action |
| ---- | ------ |
| `j` / `k` | The next / previous article |
| `o` | Open the original page in a new tab |
| `e` | Mark read, and go on to the next |

Marking an article read does not pull it out from under you: it dims in place, and is gone the next time the page loads. **Mark unread** puts it back.

## Keep

**Keep** writes the article into the vault as a note, through the same converter the [web clipper](capture.md#the-clipper) uses:

- when the feed carried the whole article, that is what is kept;
- when it carried only a teaser and fetching is on, the page itself is fetched and its article (not its menus and footer) is kept;
- when fetching is off, what the feed carried is kept.

The note is named by the article's title, in the feed's folder (`Reading/` unless the list says otherwise); a second article with the same title becomes `Title (2)`. Its frontmatter says where it came from:

```markdown
---
source: "https://example.org/essays/marginalia"
feed: "The Marginal Reader"
published: 2026-09-18
kept: 2026-09-24
tags: [reading, essays]
---

# Marginalia, Briefly
```

**Nothing kept is published.** The note has no `publish:` key; it is private until you publish it yourself (see [Publishing & access](publishing.md)).

From then on it is a note like any other: link to it, tag it, and highlight in it — a `==highlight==` you make in a kept article is a card in [Orbits](orbits.md)' implicit deck, like a highlight anywhere in the vault.

## On the phone and in the pocket

On a phone, **Feeds** is a row under **More**. The list is one row per article under its feed's name; tap one to read it, and **Keep**, **Mark read** and **Open the original** are in its **⋯** sheet. Back returns to the list.

A [pocket vault](mobile.md) fetches no feeds: a round of feeds is a server asking other servers on a timer, and the read marks live in that server's data directory. The notes you kept are notes, and a pocket vault has them like any others.
