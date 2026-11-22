# adventureland-farmer

Automation script for [Adventure Land](https://adventure.land): a party of three fighters (paladin tank, priest,
mage) plus a merchant. The tank decides where the party fights and starts every fight; the merchant supplies the
fighters, runs every upgrade and compound, and watches Ponty. Once a day the party runs the Cave of Many Dreams.

## Install
Paste `loader.js` into each character's CODE slot once and run it. Loader v4 asks GitHub for the newest commit,
reads `src/manifest.json` there and runs only that character's files (`shared/` + its role + `main.js`), falling
back to `farmer.js` and then to a cached copy if GitHub is unreachable. A new release arrives when a character's
code restarts: `reload_farmer()` in its code console, or remotely through the game's MCP API
(`browser_code_reload`). The load line shows the version and commit (`farmer v25.24 @f90a157`). Loaders v1–v3
still work (they run `farmer.js`). Click each character's tab once after a reload: the bot plays the game's silent
loop so the browser doesn't throttle a background tab, and browsers only allow sound after a click.

## Use
In the CODE console: `report()` (the whole party in one box; `report(6)` adds 6h history, `report("solo")` just this
character), `history(6)` (`history(6, "solo")`), `deaths()`, `selftest()`, `why_not("monster")`, `gear_check()`,
`park()` / `resume()`, `unpause()`. Settings are the `CFG` block in `src/shared/00_config.js`; the overview of what the
bot does is at the bottom of `src/main.js`.

## Tests
`node test/smoke.js`, `node test/loader.js` and `node test/roles.js` (a mocked game client; no game connection).
`roles.js` checks that `farmer.js` is the current build, that no role uses a name only the other role declares
(`tools/split_check.js`), and that each role's file set loads, ticks and reports on its own.

## Changes
Every change goes on a branch with a pull request, bumps `VERSION`, passes the three test suites, and is reviewed
before it's merged (a Claude Haiku review; it may approve merges). After a merge the characters are restarted once
GitHub serves the new version.

## Layout
- `src/` — the bot's source. `manifest.json` lists the load order per role:
  - `shared/` (every character), numbered files by subject: config, infrastructure, fight model, history, combat,
    gear, travel gear (off), upgrade runs, upgrade choice, crafting, bags, quests, guide (off), town, recovery,
    persistence, report, party, the fighters' view of the merchant;
  - `fighter/`: loop, party, camp, combat, goals, town, gear, report, its answers to the merchant's functions, the cave;
  - `merchant/`: loop, serve, stand, Ponty, bank, report, its answers to the fighters' functions;
  - `main.js`: death handling, the main loop, start-up, and the overview.

  A function both roles need is declared in both role folders (a role function). A character's own file set has
  just its role's version; `farmer.js` renames the two and calls the running character's, so it behaves as each
  character's own file set does.
- `farmer.js` — GENERATED: every file in one (`node tools/build.js`; `--check` verifies it). Loaders v1–v3 and the
  tests run it. Edit `src/`, never `farmer.js`.
- `loader.js` — the paste-once loader (v4).
- `test/` — `smoke.js` (the bot against a mocked game client), `loader.js`, `roles.js`, `fixtures/`.
- `tools/` — the build, the split check and diagnostic scripts. See `tools/README.md`.
- `REFACTOR.md` — the design the code follows (the tank decides; the party stays together) and its history.
