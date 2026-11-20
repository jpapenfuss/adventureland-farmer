# adventureland-farmer

Automation script for [Adventure Land](https://adventure.land): a party of fighters (priest, paladin, mage) plus a
merchant, all running the same `farmer.js`.

## Install
Paste `loader.js` into each character's CODE slot once and run it. It fetches the latest `farmer.js` from this repo
(falling back to a cached copy if GitHub is unreachable). New releases arrive when a character's code restarts, or
via `reload_farmer()` in its code console.

## Use
In the CODE console: `report()` (whole party), `report("solo")` (report() includes everyone's last-hour history), `history(6)` (whole party), `history(6, "solo")`, `deaths()`, `selftest()`,
`why_not("monster")`, `park()` / `resume()`. Settings are the `CFG` block at the top of `farmer.js`; the overview
of what it does is at the bottom.

## Tests
`node test/smoke.js` and `node test/loader.js` (mocked game client; no game connection needed).
