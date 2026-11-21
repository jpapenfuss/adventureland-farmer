# adventureland-farmer

Automation script for [Adventure Land](https://adventure.land): a party of fighters (priest, paladin, mage) plus a
merchant, all running the same `farmer.js`.

## Install
Paste `loader.js` into each character's CODE slot once and run it. It fetches the latest `farmer.js` from this repo
(falling back to a cached copy if GitHub is unreachable). New releases arrive when a character's code restarts, or
via `reload_farmer()` in its code console. Loader v2 fetches the file at the branch's newest commit (asked from the
GitHub API), so a reload right after a push gets that push; the load line shows the commit (`farmer v24.2 @3f57324`).
Loader v1 fetched the branch copy, which GitHub caches for up to 5 minutes: re-paste the loader once to upgrade.
Loader v3 (v24.94) runs only the character's own role files; v1/v2 keep working (they run `farmer.js`).

## Use
In the CODE console: `report()` (whole party), `report("solo")` (report() includes everyone's last-hour history), `history(6)` (whole party), `history(6, "solo")`, `deaths()`, `selftest()`,
`why_not("monster")`, `park()` / `resume()`. Settings are the `CFG` block at the top of `farmer.js`; the overview
of what it does is at the bottom.

## Tests
`node test/smoke.js`, `node test/loader.js` and `node test/roles.js` (mocked game client; no game connection needed).
`roles.js` checks that `farmer.js` is the current build, that no role uses a name only the other role declares
(`tools/split_check.js`), and that each role's file set loads, ticks and reports on its own.

## Layout
- `src/` — the bot's source, split by role (v24.94): `common.js` (everything every character runs), `fighter.js`,
  `merchant.js`, `main.js` (death handling, the main loop, start-up). `common.js` ends with "Role hooks": defaults
  for the functions that live in one role's file, which that file's own declaration replaces.
- `farmer.js` — GENERATED: every file in one (`node tools/build.js`; `--check` verifies it). Loaders v1/v2 and the
  tests run it. Edit `src/`, never `farmer.js`.
- `loader.js` — the paste-once loader. v3 fetches only the character's own files from `src/` (common + its role +
  main) at the newest commit, falling back to `farmer.js`.
- `test/` — `smoke.js` (the bot against a mocked game client), `loader.js`, `fixtures/`.
- `tools/` — diagnostic scripts (route simulator on the live map data, map geometry checks, a test runner that
  lists every failure). See `tools/README.md`.
- `REFACTOR.md` — the design the code is being brought to (the tank decides; the party stays together) and its status.
