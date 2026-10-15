# Adoption: next steps

Concrete steps that would make the app easier to start with, easier to keep using, and easier for
others to pick up. Roughly in order of effort against return.

## For the maintainer's own use

1. **Run one instance for real, on an always-on machine.** A small VPS or a home server behind a
   reverse proxy, with git backup on a timer. Point the phone app and the desktop app at it. Using
   it from every device every day is the quickest way to find the bugs a new user will hit.
2. **Publish the blog from that instance.** A live site built with the app is the best demo, and it
   exercises publishing, feeds, comments and webmentions under real traffic.
3. **Keep a "friction log" note in the vault.** One line each time something is slow, confusing or
   missing. Review it before planning each release, and turn the repeated items into issues.
4. **Use the review features on a schedule.** Today, the Calendar, Orbits and the year in review
   only show their value after weeks of use; a weekly review habit will show which ones earn their
   place and which should be simplified.

## For new users

5. **Docker image and compose file**, published to GitHub Container Registry from the release
   workflow. This is the default install path for most self-hosters.
6. **A public read-only demo.** A published site anyone can browse, plus a short screen recording
   of the editor in English and Arabic, linked from the README and the landing page.
7. **Shorter first run.** The seeded vault doubles as the manual, which is a lot to take in. Offer
   a choice on first launch: open the sample vault, or point at an existing folder. Show the
   `ASTROLABE_VAULT` line on the empty-vault screen.
8. **"Coming from Obsidian" page in the manual.** What carries over, what does not (plugins), and
   how to run both on the same folder safely. Link it from the comparison page and the import page.
9. **Signed releases and store listings.** A signed Windows installer avoids the SmartScreen
   warning; F-Droid or the Play Store removes the "install unknown apps" step on Android. Both
   remove a reason to give up at install time.
10. **macOS builds.** The desktop wrapper is Electron; adding a macOS target, even unsigned at first,
    opens the app to a large share of note-takers.

## For contributors

11. **CI on pull requests** running the no-browser gates, so a contributor gets an answer without
    reading the done bar first. See good-first issue 1 in [VISIBILITY.md](VISIBILITY.md).
12. **Keep 8–12 open `good first issue` items at all times**, each with the files to touch and the
    gate that proves it. Replace each one as it is taken.
13. **A short architecture page** in `docs/development.md`: the request path from a keystroke to a
    file write and back through the event stream, with the five or six modules that matter. The
    contracts are thorough but long for a first read.
14. **Arabic contributors.** Label translation and proofreading work separately (`arabic`,
    `translation`) so people who do not write TypeScript can help, and credit them in release
    notes.
15. **Discussions.** Turn on GitHub Discussions for questions and show-and-tell, so issues stay
    for bugs and concrete requests.

## For getting more out of it

16. **Templates for common workflows** shipped with the seed vault: a reading note, a lecture
    note, a weekly review, a book tracker. Users copy workflows more readily than features.
17. **Import from Joplin and Logseq** (good-first issues 7 and 8), the two tools in the comparison
    without an import path.
18. **Document the Ask setup on modest hardware.** Which Ollama models work on a laptop without a
    GPU, how long the first indexing takes, and what to expect from answers in Arabic.
19. **Measure, without telemetry.** The app sends nothing home and should stay that way. Use
    release download counts, GitHub traffic and issue volume instead, and ask in release notes
    which features people use.
