# In the terminal

*Astrolabe CLI: the same vault from a terminal, as plain files, with no server — a reader, a Vim-style editor, and shell verbs for capture and search.*

← [Back to the README](../README.md) · [All docs](README.md)

---

[Astrolabe CLI](https://github.com/ZahakJ/astrolabe-cli) is Astrolabe's terminal companion, a separate program in its own repository. It is one static binary for Linux and macOS, and it needs nothing else: no Node, no server, no Astrolabe running anywhere. The command is `astrolabe`, and the installer also adds the short alias `ast`.

## What it is

It opens your vault directly as the folder of Markdown files it is. It keeps no database and no index on disk, adds no files to the vault, and never writes to `.obsidian/`; a note it changes is changed in place, by the smallest edit that will do (ticking a task rewrites one character, a capture appends one line). So it can sit beside the app on the same folder: the server watches the vault, so a note saved from the terminal shows up in the app, and the CLI refuses to save over a note that changed on disk after it read it.

What you get is a reader that typesets notes in the terminal (headings, tables, callouts, tasks with due dates), a small Vim-style editor (or your own `$EDITOR`, one key away), and shell verbs that print plain, pipeable output. Arabic is shaped and laid out right to left, even in terminals that cannot do that themselves, and search folds Arabic diacritics and letter forms. It has no graph, no images and no publishing; those stay in the app.

## Installing it

```sh
curl -fsSL https://raw.githubusercontent.com/ZahakJ/astrolabe-cli/main/install.sh | sh
```

The installer needs no root and puts the binary in `~/.local/bin`. You can also download one release binary from the [releases page](https://github.com/ZahakJ/astrolabe-cli/releases), `chmod +x` it, and put it on your `PATH`.

Run it from inside your vault, or point it at the vault once with `export ASTROLABE_DIR=~/notes`. A folder with `.astrolabe/` or `.obsidian/` above the current directory counts as a vault, so an Astrolabe vault is found from anywhere inside it. `astrolabe doctor` says which vault it chose and why.

## First commands

```sh
astrolabe                         # open the reader: today's daily note, else the last note you read
astrolabe add "call the plumber"  # append one timestamped line to today's daily note
astrolabe find boiler             # full-text search, path:line:text when piped
astrolabe today                   # open today's daily note, creating it if needed
```

Daily notes go to a `daily/` folder by default, which is also the app's default; if you moved yours in the app, set the same folder in the CLI with `daily_dir` in its config file. In the reader, `?` lists every key and `q` quits.

The rest — every verb, the keymap, themes, the config file, tmux and Neovim snippets — is in the [Astrolabe CLI README](https://github.com/ZahakJ/astrolabe-cli#readme).

## Related

- [Capture](capture.md) — the app's own ways of getting a line into today's note
- [The desktop app](desktop.md) and [the Android app](mobile.md) — the other ways onto the same vault
- [Arabic & RTL](arabic-and-rtl.md) — right-to-left text in the app
