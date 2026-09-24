# Webmentions & the fediverse

*Other sites telling yours they linked to a post, your posts telling the sites they link to, and the blog as one account that Mastodon and its neighbours can follow. Three switches, all off until you turn them on.*

← [Back to the README](../README.md) · [All docs](README.md)

---

A published post can be part of a conversation that happens elsewhere: someone writes a reply on their own blog, likes it from Mastodon, or links to it in a weekly roundup. Astrolabe can hear about those, keep the ones you approve under the post, and tell other sites when your posts talk about them. It does this with two open standards: **webmentions** (a site POSTs "my page links to yours" to an address yours advertises) and **ActivityPub** (the protocol Mastodon, Pixelfed and the rest of the fediverse speak).

Each part is network access, so each is its own switch in **Settings → Publishing & comments**, and a new instance has all three **off**:

| Row | What it does while on |
| --- | --- |
| **Accept webmentions** | Every public page advertises `/webmention`; mentions sent there are checked and wait in moderation. |
| **Send webmentions** | Publishing a post (or republishing one that changed) tells every other site it links to. |
| **Fediverse** | The blog is one ActivityPub account: people can find it, follow it, like, boost and reply. |
| **Fediverse name** | The name before the `@` in the account's address. |

Set `SITE_URL` (see [Configuration](configuration.md)). Other servers remember your site by its address, and the fediverse account *is* its address: without `SITE_URL` the server uses the address you last opened Settings → Publishing & comments at, which is fine on a laptop and fragile behind a proxy. The rows say so when it matters.

## What counts as public

Everything this page describes talks to other servers about your posts, so all of it follows one rule. A post may be mentioned, may send a mention, may appear in the fediverse outbox, and may be delivered to followers only when **all** of these hold:

- the site is readable by visitors (not `PUBLIC=false`, see [Publishing & access](publishing.md));
- the note is published (`publish: true`);
- it is **listed**: in the posts your RSS feed is made of. A template, a lesson of a [library](library.md) path and a designed site's static page have addresses but are not listed, so they are left out;
- the [language filter](arabic-and-rtl.md) does not hide it **as the site speaks with no particular reader**, which is the site's own language. With the filter on "follow" and the reader switch on, the other language's posts are visible to readers who choose that language, but a follower's timeline has no reader to choose; those posts stay home.

A post that stops meeting the rule (you unpublish it, move it into a template folder, or change the filter) is deleted from followers' timelines within a minute, sends nothing more, and cannot be the target of a new mention. This is tested for each kind of hidden note, for every door this feature has.

## Receiving webmentions

With **Accept webmentions** on, every page carries `<link rel="webmention" href="…/webmention">` in its head and the same address in a `Link:` header. A site that links to one of your posts can then POST `source` (its page) and `target` (your post) to that address, form-encoded, the way the [W3C recommendation](https://www.w3.org/TR/webmention/) says.

What happens next:

1. **The target is checked at once.** It must be a public post of this site (the rule above). A target on a host the site used to have (`LEGACY_HOSTS`) counts as the post it now redirects to. Anything else is refused with a 400, and nothing is fetched.
2. **The rest waits its turn.** Accepted mentions go into a queue (`ASTROLABE_DATA/webmentions.db`) and are handled one at a time. A second mention of the same pair while the first is waiting replaces it.
3. **The source is fetched, carefully.** Only public internet addresses are fetched: loopback, private networks, link-local and the like are refused *at the connection*, so a name that resolves somewhere private is refused too. At most a megabyte, ten seconds, three redirects. A source that fails for a reason that might pass (a timeout, a 5xx) is tried three more times, waiting longer each time.
4. **It must really link to your post.** A link in the page (`<a href>`, an image, a citation) counts; the address written out as words does not.
5. **It is read as microformats2.** The first `h-entry` gives the author (an `h-card` with name, photo and home page), the text (`e-content`, shortened to plain text), and the kind: `u-like-of` your post is a **like**, `u-repost-of` a **repost**, `u-in-reply-to` a **reply**, anything else a **mention**. A page with no `h-entry` is a mention named by its title.
6. **It waits for you.** The mention is filed with your [comments](publishing.md#comments), hidden, and appears in **Moderate comments** with its kind and where it came from. Nothing shows under the post until you unhide it.

A source that later stops linking to your post, or answers "gone", has its mention **withdrawn**: when the site sends the mention again, or when you press **Verify again** on the row in the moderation panel, which fetches the source there and then.

The endpoint allows 20 mentions a minute from one address and 500 waiting in the queue; past that it answers 429.

## Sending webmentions

With **Send webmentions** on, publishing a post, or saving a published post so that it changes, sends a webmention for each link in it to another site. The links are the ones a reader sees as links: `[text](https://…)`, `<https://…>`, a bare `https://…` and a raw `<a href>`. `[[Wikilinks]]` are your vault's own and are never sent; neither are pictures or anything inside code.

For each link the server fetches the page, finds its endpoint (the `Link:` header first, then the first `<link>` or `<a>` with `rel="webmention"`), and posts `source=<your post's address>&target=<the link>`. It remembers what it sent with a fingerprint of your post, so:

- saving a post that did not change sends nothing again;
- a post that changed sends again, including to a link you **removed**, so that site learns it is gone;
- a page that advertises no endpoint is noted, not retried.

The last fifty sends, with how each went (sent, no endpoint, failed, waiting), are the **Sent** list under the row. Nothing is ever sent from a page that is not public, and never to your own site.

Turning the switch on for the first time sends nothing for the posts you already have: it takes note of them, and sends from the next publish on.

## The fediverse

With **Fediverse** on, the blog is one account: `@name@your.host`, where the name is **Fediverse name** (by default your site's name in plain letters: "Kitāb al-Ḥikma" becomes `kitab_al_hikma`). Searching for that address on Mastodon finds it, because the site now answers:

- **WebFinger** at `/.well-known/webfinger`, which turns the address into the account;
- **NodeInfo** at `/.well-known/nodeinfo`, which says what software this is;
- the **account** itself at `/actor`: your site name, tagline, logo and home banner, and a public key. The private half is generated once into `ASTROLABE_DATA/activitypub-key.pem` (readable only by the server) and never leaves the machine; every request the server makes to another server is signed with it, and every activity it accepts must be signed by the account it claims to come from;
- an **outbox** with your public posts, newest first. A short post arrives as a whole note in a timeline; a longer one as an article with its title, the start of the text and a link. Each carries its language, its tags and its banner.

Opening a post's own address from Mastodon's search shows the post, too: the same address answers the fediverse with the post and a browser with the page.

**Followers** are accepted at once and kept in `ASTROLABE_DATA/activitypub.db`. From then on, publishing a post delivers it to them, changing a published post sends the change, and unpublishing it deletes it from their timelines. Deliveries go to each server's shared inbox when it has one (a thousand followers on one server are one request), one at a time, with three retries. A server whose inbox is gone for good takes its followers with it. The followers' count is under the row; the list itself is never published.

What comes back:

- **likes** and **boosts** of a post appear under it at once, as faces;
- **replies** to a post are filed with your comments and wait in moderation, like a webmention;
- an **undo** removes the like or boost, and a **delete** removes the reply. Only the account that sent something can take it back.

## Under the post

A published post with approved mentions grows a small **Mentions** section under its comments: likes and reposts as rows of faces (each links to the person's own site), replies and mentions as entries with where they were written. A post with none shows nothing at all. The section is the same in blog mode, in the app's reading view and on a phone.

## What stays on the machine

`webmentions.db`, `activitypub.db` and `activitypub-key.pem` live in the server's data directory, **never in the vault**, and are never copied into it by [Backup & sync](backup-and-sync.md): they are this server's conversations with other servers, and a private key in a git history is a private key published. Approved mentions live with your comments in `comments.db`.

A [pocket vault](mobile.md) has no public address, so none of this exists there: it has no Publishing tab, and the routes answer that they need a server.
