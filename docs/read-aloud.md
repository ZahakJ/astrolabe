# Read aloud

*Select a word or a paragraph in French, Japanese, Arabic or English and hear it, spoken by voices that run on your own machine's processor — no cloud, no graphics card.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Select some words and choose **Read aloud**. A single word is spoken at once; a paragraph is read a sentence at a time, with the sentence being read lit in the page, and a small player at the foot of the window to pause, start again, change the speed or stop. The voices are installed on the machine that runs your Astrolabe — your laptop, your home server, the desktop app — and they run on its **processor, by design**: nothing is sent anywhere, and no graphics card is needed or used.

## Where to find it

| Where | How |
| --- | --- |
| The editor | Select, right-click (or `Shift F10`), **Read aloud** — the last row of the [selection menu](editor.md#writing) |
| Anywhere | Select, then `Ctrl/Cmd Shift .` — in the editor, the reading view, a book, a feed item ([Keymap](keymap.md)) |
| The reading view, a book, an EPUB | Select, and press the **Read aloud** chip that appears under the selection |
| The whole note | The command palette's **Read this note aloud** (`Ctrl/Cmd P`): from the caret in the editor, from the top in the reading view |
| The phone | Select, and press the chip — in the reading view *and* the editor, since the phone has no right-click menu; or the note's **⋯** sheet → **Actions** → **Read this note aloud** |
| The public blog | Visitors get the chip only when you turn on **Readers may listen** (below) |

The player stays at the foot of the window while you scroll. Its buttons: **pause / play**, **from the start** (free the second time: everything spoken is kept), the **speed** (0.75× to 1.5×, applied at once without re-synthesising), and **stop**.

## Which language

A selection is spoken in the language it is written in, decided the way the rest of the app decides it:

1. **Script first.** Arabic letters are Arabic; kana and kanji are Japanese — by count, so an English sentence quoting one kanji stays English.
2. **French, when the words are French** — the same test [French, corrected as you type](editor.md#french-corrected-as-you-type) uses: two French function words. A French quotation in an English note is read in French.
3. **The note's own `lang:`** in its frontmatter (`lang: fr`, `lang: es`), for Latin text the test cannot place.
4. **The sentence around a single word.** One selected word has nothing to count; the paragraph it was selected from does, so *grenouille* selected in a French paragraph is French.
5. The site's language, then English.

**Furigana** are read once, as the word: `{図書館|としょかん}` is spoken 図書館, never the word and then its reading ([Japanese & furigana](japanese.md)).

## The two engines

Both are free software, both run on the processor, and both run inside one Python environment the app makes for you.

| | **Light** (the default) | **Natural** |
| --- | --- | --- |
| Engine | [Piper](https://github.com/rhasspy/piper) (MIT) | [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0) through kokoro-onnx |
| Languages | English, French, Arabic | English, French, Japanese, Spanish, Italian, Portuguese |
| Download | 190 MB (63 MB a voice) | 354 MB once, every language and voice |
| A word, measured (8 / 2 / 1 cores) | 60 / 60 / 90 ms | 270 / 460 / 700 ms |
| A 4-second sentence | 0.3 s — about 15× faster than speech | 0.9 s on 8 cores, 2.3 s on one — faster than speech even then |
| Sounds | clear, a little flat | closer to a person, especially English and Japanese |

Arabic is always read by Light's voice, and Japanese always by Natural's, whichever you choose; the choice decides English and French. The numbers are from an AMD Ryzen 7 7800X3D; the "2 cores" and "1 core" columns were measured with the engine pinned to that many cores, to stand in for an ordinary laptop or a small home server. On an older or low-power processor Natural can come close to real time on long sentences, which is why **Light is the default** and Natural is the choice for a machine that can afford it.

**A machine with no graphics card gets exactly this.** Nothing here uses one, on any machine.

### How the engines were chosen

By listening, not by reading. Kokoro, Piper and MeloTTS each spoke the same ten lines — a French word, a French sentence with liaisons, a Japanese word and sentence, an Arabic word with and without its vowels, an English sentence, a line that mixes English into French, a number and a proper noun — on the processor, and the samples were kept for the owner to hear. Two judges stood beside the ear: every sample was transcribed back by whisper (a voice it cannot understand, a learner cannot either), and scored by UTMOS, a model trained to predict how natural listeners find a voice.

- **Japanese → Kokoro.** MeloTTS sounds comparable but needs about 2 GB of dependencies for one language; Piper has no Japanese. Kokoro misread three short kanji words in ten when they were sent alone, and none once each was closed with 「。」, so the app closes a lone word with its language's full stop before it reaches the engine.
- **English → Kokoro** when Natural is chosen: the best-scoring line of the whole trial.
- **French → either.** Kokoro's only French voice and Piper's were trained on the same recordings and scored within a tenth of each other; both take their liaisons from espeak-ng's phonemes. Piper is five times faster.
- **Arabic → Piper's Jordanian voice (ar_JO-kareem)**, the only offline Arabic voice of the three. Honestly: it is fully intelligible (whisper wrote both lines back exactly) but audibly synthetic, flatter than Google Translate's. Unvowelled text is not left to guesswork: Piper carries a small diacritiser (libtashkeel) that points the text first, keeping any harakat you already wrote.
- Kokoro's smaller int8 model was four to six times *slower* on the processor, not faster, so the full-precision model is the one installed.

Against Google Translate: for English and Japanese, Natural is in the same class; French is good; Arabic is behind. It is all offline, on your own machine.

## Installing

**Settings → Language & dates → Read aloud** shows what is installed and an **Install** button. Choose **Light** or **Natural** and press it; the row says what it is doing — making the Python environment, installing the engine, downloading the voices with a percentage — and the voices are ready when it says so. Install the other engine the same way at any time; Japanese needs Natural, and the row says so.

**The machine needs nothing installed first.** The Install button uses, in this order:

- **[uv](https://docs.astral.sh/uv/)** on the `PATH`, when it is there (it fetches its own Python 3.12);
- a **Python 3.10 to 3.13** already on the machine (`python3`; `python` or `py` on Windows);
- otherwise it **fetches Python itself**: a standalone CPython 3.12 from [python-build-standalone](https://github.com/astral-sh/python-build-standalone) for your system and processor (Linux, Windows or macOS; 21–34 MB), checked against its exact size and checksum before it is used, into the data folder. The row says *Fetching Python for this machine* with a percentage while it arrives.

The last one is what makes the **desktop app** read on a machine that has never had Python — the usual Windows or Linux laptop. Nothing needs a compiler: the compiled packages arrive as prebuilt wheels (the processor build of onnxruntime; no torch, no CUDA). Only when Python can be neither found nor fetched (offline, or a system with no standalone build, such as Alpine Linux) does the row say so, and the device's own voices read in the meantime.

The same row has a speed (slower, normal, faster) and a **voice picker for every language that has a choice**: English and Japanese when Natural is installed (five and four voices), and any language you have [your own voices](#your-own-voices) for. Each picker lists the built-in voices first and then **Your voices**; the choice is the language's voice everywhere, and the player's **▾** changes the same setting.

### Where it lives

Everything is in the data folder (`ASTROLABE_DATA`), never in the vault:

| | |
| --- | --- |
| `tts/venv/` | the Python environment |
| `tts/python/` | the fetched Python, only on a machine that had none |
| `models/tts/piper/`, `models/tts/kokoro/` | the voices |
| `tts/cache/` | everything spoken, kept by what was said (text, language, voice, speed); at most 500 MB, the longest-unheard first to go |

The **desktop app** installs into its own data folder in the same way, and the Install button works there unchanged: the bundled server makes the environment and starts the engine as a child process, like the voice-note transcriber. Removing the voices is deleting those folders.

The engine starts on the first request, stays up while you listen, and stops after ten idle minutes to give its memory back (about 600 MB with both engines loaded).

## This device's voices

If the app's own voices are not installed for the language — nothing installed at all, or Japanese before Natural is — the player reads with **this device's voices** instead (the operating system's, through the browser), and the player always says which of three things is true:

| | The player says |
| --- | --- |
| The app's voices speak | nothing — this is the normal case |
| They are not installed; a device voice speaks the language | *The app's own voices for French are not installed — reading with this device's voice:* **Microsoft Paul ▾**, and a button, **Install the app's voices**, that opens the row above |
| No voice on this device speaks the language | *No voice on this device speaks Japanese. Install the app's voices (Settings → Language & dates → Read aloud), or add a system voice.* |

**Which device voice.** The one you chose for that language, on this device: the **▾** beside the voice's name in the player lists every voice the device has for the language, by name and locale, and your choice is remembered (in this browser, for this device — another computer keeps its own). The same choice is in **Settings → Language & dates → Read aloud**, under *This device's voices*: one picker per language the device speaks, and a line naming the languages it has none for. Until you choose:

- in the **desktop app on Windows**, the voice you chose in Windows' own speech settings (**Time & language → Speech**) — the app reads it from Windows. A web page cannot: Chromium marks the first voice of the list as the "default" whatever Windows says, which is why a browser on Windows may read with another voice until you pick one with ▾;
- on macOS and Android, the system's default voice for the language;
- otherwise a voice in your own locale (French of France before French of Canada), one on the device before one that sends the words to a network service.

How it sounds depends on the device: Windows' Microsoft voices and Android's Google voices are good. **The desktop app on Linux has no device voices at all** (Electron has no speech engine there), so it reads once the app's own voices are installed — the Install button works there with nothing else on the machine — and says *No voice on this device speaks …* until then rather than staying silent. A **pocket vault** on the phone has no server, so its voices are always the phone's; its Read aloud row is just the phone's voices.

## Your own voices

If you already have Piper voices on your computer — because LibreOffice's **Read Text** extension installed them, or because you downloaded them yourself — Astrolabe can use them. **Settings → Language & dates → Your own voices** takes a folder; the server looks through it and every folder inside it, and every voice it finds joins the pickers under **Your voices**, per language, to be chosen exactly like a built-in one. Nothing is copied or downloaded: the voice is read from where it is.

**Pointing it at the folder.** Type the folder's full path (on the desktop app, **Browse…** opens the system's folder picker) and save. The row then says what it found — *French: 3 voices · Arabic: 1 voice · 2 files skipped: no .json beside the model* — and **Which files, and why** lists anything it could not use. **Rescan** reads the folder again after you add a voice; it is also read when the server starts. The folder must be a full path on the computer the server runs on, and **outside the vault** (the vault is synced and published; a 60 MB voice belongs to this computer). It is kept on this computer only, in the data folder — it does not travel with the vault to your other machines.

**Where Piper voices usually are.** A Piper voice is always **two files side by side**: `name.onnx` (the voice, 20–120 MB) and `name.onnx.json` (its settings, a few kilobytes). Common places:

| | |
| --- | --- |
| `~/.local/share/piper-voices/` | where many Piper tools, and scripts like Read Text's, keep downloaded voices on Linux |
| `~/piper/` or `~/piper-voices/` | a hand install |
| `…/piper-voices/fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx` | the [piper-voices catalogue](https://huggingface.co/rhasspy/piper-voices)'s own layout — `language/locale/name/quality/` — read as it is; point at the top folder |

Not sure where yours are? The Read Text dialog shows the command it runs, and a voice's `.onnx` path is in it or in the script it names; or search your home folder for `*.onnx.json`.

**A man's or a woman's voice is a different voice file.** Piper has no "male/female" switch: each voice is one person, and choosing another voice is choosing another file. Some files hold several people — `fr_FR-upmc-medium` has two speakers, **jessica** and **pierre** — and those appear as two voices, *Upmc · Jessica* and *Upmc · Pierre*. Kokoro packs (`voices-*.bin` beside a `kokoro-*.onnx`) are read too, one voice per entry in the pack.

**What they need.** Your Piper voices run on the **Light** engine (its runtime: onnxruntime and piper); a Kokoro pack on **Natural**'s. Until that engine is installed the row says so, with its Install button: installing Light downloads Light's own built-in voices once (about 190 MB) — **your voice files are not downloaded again**. A voice in a language Read aloud does not detect yet (German, say) is listed as skipped, with its language.

**Get more voices** from the [Piper voices catalogue](https://huggingface.co/rhasspy/piper-voices) (listen first on the [samples page](https://rhasspy.github.io/piper-samples/)): download a voice's `.onnx` and `.onnx.json` into your folder and press **Rescan**.

### An external speaker

For anything else, **Your own voices** has a folded **An external speaker (advanced)**: a command the server runs **once per sentence**, for the languages you tick. The sentence arrives on the program's standard input; `{lang}` becomes the language (`fr`) and `{out}` a file the program must write a WAV or Ogg to, within 20 seconds. Two examples:

```
piper --model /home/you/voices/fr_FR-upmc-medium.onnx --speaker 1 --output_file {out}
python3 /home/you/my_speaker.py --language {lang} --out {out}
```

The command is split like a shell line (quotes work) but **not run through a shell**: no pipes, no `$VARIABLES`, and the sentence is never part of the command line. If the program exits with an error, takes longer than 20 seconds, or writes no file, the sentence is **not** read in another voice: the player says *Your external speaker failed*, and the program's own message is in the server's log. It is **never run for visitors** — Readers may listen always uses the app's voices.

> **It runs as the server.** The program runs with the same user and permissions as the Astrolabe server: whatever that user may do, the command may do. Only name a program you trust, and on a shared or hosted server think twice. Like the folder, the command is kept on this computer only and never travels with the vault — a command that arrived by sync and was then run would be anybody's.

The pocket vault on a phone has neither: it has no server to scan a folder or run a program, and says so.

## Readers may listen

**Settings → Publishing & comments → Readers may listen** gives visitors of your blog the same chip over their selection. It is off unless you turn it on, because every new sentence a visitor asks for is your machine's processor. The server then speaks only words that are on a published page (a visitor cannot send it anything else to read), at most sixty new sentences per address every ten minutes; a sentence someone has already heard is served from the cache and costs nothing.

## For developers

- `POST /api/speak` `{ text, lang?, path?, context?, format? }` → one sentence as Ogg Opus (or WAV), with `X-Speak-Lang` and `X-Speak-Engine`. `409 speakNotInstalled` names the engine the language `needs`. One request speaks at most 1,000 characters; the client sends a sentence at a time and fetches the next while one plays.
- `GET /api/speak/status` — what is installed, the install's progress (`fetch-python` with a `progress` percentage, `python`, `packages`, `models`), the settings in force, and `own`: the voices folder, what its last scan found (`voices`, by language) and what it skipped (`skipped`, with a `reason`). `POST /api/speak/install` `{ engine }` starts an install; `POST /api/speak/voices/rescan` reads the folder again.
- `PATCH /api/settings` `{ speak: { voicesDir, external: { command, langs } } }` — both are checked (an absolute path outside the vault that the server can read; a command naming `{out}`) and written to `ASTROLABE_DATA/speak-local.json`, never to `settings.json`, which the config mirror carries into the vault. A found voice is stored in `speak.voices` as `own:<path inside the folder>` (`#speaker` for one speaker of a model); the worker loads it by absolute path and keeps it loaded by path and modification time, so a replaced file is loaded again. `X-Speak-Voice` names the voice that spoke.

- The fetched Python is pinned to one python-build-standalone release by size and SHA-256 (`server/standalonePython.ts`); programs are looked up on the `PATH` in-process, never through `which` or `where`.
- `ASTROLABE_TTS_THREADS` pins the engine's thread count (default: half the cores, at most eight).
- `ASTROLABE_SPEAK_FAKE=1` makes a scratch server answer with a tone, for the browser gates; the row says *Test engine* while it is on.
