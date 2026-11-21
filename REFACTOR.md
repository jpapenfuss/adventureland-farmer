# farmer.js refactor

Why: on 2026-11-21 one evening produced a door loop, a spot ping-pong (76 changes of spot in an hour), followers
stuck on a corner and a party walking past its targets. Each took several reports to find, because the rules
behind each decision are spread over many functions and none of them records why it decided what it did.

Rule for every step: behaviour stays the same unless the step says otherwise; tests pass; VERSION is bumped.

## Steps

1. **Decisions explain themselves.** Each decision produces a table of what it considered and why each option
   was taken or ruled out; the report prints it.
   - [x] Spot choice: `state.pick_table`, report line `spot choice` (v24.38).
   - [x] Targets at the spot: report line `targets` (v24.37) — still its own copy of the rules.
   - [ ] Routes: the plan a walk follows (legs, what it goes around), in the report.
2. **One target judge.** `choose_target`, `spread_pick`, `follower_pick`, `hold_grind` and the report's
   `targets` line each repeat the same checks (farmable, ignored, someone else's, inside the spot, per-monster
   safety, walking line). One function returns a verdict with a reason per monster; all five use it.
3. **Offline simulator on live game data.** A harness that loads `adventure.land/data.js` (trimmed fixture in
   `test/`) and replays a situation: where is everyone, what does the leader pick, which route, which target.
   First scenarios, from this evening: desertland → croc (transporter), the leader through a door ahead of the
   party, a spot whose monsters have levelled up.
4. **One owner of movement per tick.** Walking is started and stopped from errands, pack travel, following,
   approach, kiting, keep-away, patrol, group holds and travel gear, each with its own guards. One arbiter takes
   requests with a priority and a reason, and is the only caller of `move` / `smart_move` / `stop`.
5. **Game rules in one place.** Server formulas (stats, aggro, channels, doors, transporter, sets) as one
   section, each with its source line in the game repo, instead of restated in comments where they're used.
6. **Prune.** Features that are switched off (the guide, split mode's A/B) and version-history comments.
