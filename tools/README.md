# tools

Diagnostic scripts used while developing `farmer.js`. None of them is loaded by the bot.

Three of them read the game's own data file. Save it once (it is not kept in this repo):

```bash
curl -sL https://adventure.land/data.js -o /tmp/al-data.js
```

It is parsed as JSON, never executed.

| Script | What it does |
|---|---|
| `route_sim.js <data.js>` | Loads `farmer.js` in the smoke test's mocked client with the live maps and prints the bot's route plans for the cases at the bottom of the file. Found the desertland door loop. |
| `walkable.js <data.js>` | Flood fill over a map's wall lines: reachable ground from a point, and the walkable ground nearest an NPC. |
| `grid_path.js <data.js>` | Shortest grid path between two points on a map and how close it passes to a box. |
| `build.js` | Builds `farmer.js` from `src/` in `src/manifest.json`'s order (`--check`: is it current?). Run after every edit of `src/`. |
| `split_check.js` | Static check of the role split: no role uses a name only the other role's file declares. |
| `smoke_all.sh` | Runs `test/smoke.js` without stopping at the first failure and lists every failing assertion. |

The cases in the three `.js` scripts are hard-coded from the investigations they were written for; edit them for a
new question.
