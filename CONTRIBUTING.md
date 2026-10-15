# Contributing

Bug reports, fixes and translations are welcome.

## Reporting a bug

Open an issue with the version, how you run it (browser, desktop app, Android), the interface
language, and the steps that show the problem. A small vault that reproduces it helps most.

## Sending a change

1. Read [`DESIGN.md`](DESIGN.md) and the contract for the area you are changing
   ([`CONTRACTS.md`](CONTRACTS.md) lists them).
2. Make the change. Every user-visible string goes through `client/i18n/en.ts` and
   `client/i18n/ar.ts`, and layouts use CSS logical properties so they work right to left.
3. Run the checks in [the done bar](docs/development.md#the-done-bar) that your change touches.
   At minimum: `npm run typecheck`, `node scripts/check-i18n.mjs` and `npm test`.
4. If users can see the change, update the manual page in `docs/` and its Arabic twin in
   `docs/ar/`, then run `npm run check-docs`.
5. Open a pull request that says what changed, why, and which checks you ran.

Keep a pull request to one change. For anything large, open an issue first.

## Setup

```sh
git clone https://github.com/ZahakJ/astrolabe.git && cd astrolabe && npm install
npm run dev     # server on 6801, Vite on 5801
```

[docs/development.md](docs/development.md) describes the code layout and every check script.

Contributions are released under the [MIT license](LICENSE).
