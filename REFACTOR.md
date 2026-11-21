# farmer.js refactor

Why: on 2026-11-21 one evening produced a door loop, a spot ping-pong (76 changes of spot in an hour), followers
stuck on a corner and a party walking past its targets. Each took several reports to find, because the rules
behind each decision are spread over many functions and none of them records why it decided what it did.

Rule for every step: behaviour stays the same unless the step says otherwise; tests pass; VERSION is bumped.

## Rules that were simplified (owner's instruction, v24.46)

- **Town:** together, a town trip is everyone's. One rule; the "could the rest keep farming" judgement is gone.
- **Tank first:** with the tank within `tank_near`, nobody else touches a monster that has no target. No time
  limit, no exceptions; enforced in `fire()`.
- **Hopeless monsters** (v24.44): never attacked; enforced in `fire()`.

## What the published bots do instead (read 2026-11-21)

Read: earthiverse/adventureland-bots (`source/strategy_pattern/`), Spadar/AdventureLand (`Movement/`).

- **No fight model, no spot picker.** earthiverse has a hand-written table: monster → ordered party configs
  (which classes, which attack flags, which move strategy, what gear/level is required). The first config the
  available characters satisfy is used. Which monster to farm is chosen by hand.
- **One slot per kind of action.** Each character has exactly one `move` loop and one `attack` loop. A single
  1-second if-chain (event → bags full → potions low → farm) decides which strategy fills each slot, so two
  pieces of code can never both move a character.
- **Tank-first is a flag.** Only the tank's config may hit a monster that has no target (`enableGreedyAggro`,
  capped by `maximumTargets`); everyone else has `targetingPartyMember: true`.
- **A whitelist per spot** (`typeList`) instead of "is this safe?". Anything else that targets a character
  triggers an escape.
- **One panic rule:** summed maximum incoming hit >= current HP → leave. No prediction.
- **Fixed positions** (hold a point, or a spawn centre with a per-character offset) instead of re-picking.
- **The merchant supplies the fighters**, so they rarely go to town.
- They do **not** avoid monsters while travelling, and they do not travel as a group; their characters are much
  stronger than ours. Spadar's avoidance (push away from listed monsters, layered on the path) is ~100 lines.

Direction taken from this (owner, 2026-11-21): **not** their hand-written spot table — this bot keeps choosing
spots, targets and routes itself. What is taken is the structure: one owner per kind of action, one short priority
chain deciding who that owner is, and each rule enforced in exactly one place (as `fire()` now does for tank-first
and hopeless monsters). Step 4 below.

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
4. **One owner of movement per tick** (earthiverse's model).
   - [x] 4a (v24.48): every step, walk and stop goes through `move_to_as` / `travel_as` / `halt` with the name of
     the code asking; the report's `movement` line shows the last minute and counts clashes between owners.
     Behaviour unchanged.
   - [ ] 4b: the callers return what they want (a point, a walk, hold still) with a priority instead of moving;
     one function picks the winner each tick and is the only caller of the three wrappers. One `move` slot and one `attack` slot per character,
   filled by a single if-chain: dead → flee → town trip → travel with the party → fight at the spot. Today walking
   is started and stopped from errands, pack travel, following, approach, kiting, keep-away, patrol, group holds
   and travel gear, each with its own guards.
5. **Game rules in one place.** Server formulas (stats, aggro, channels, doors, transporter, sets) as one
   section, each with its source line in the game repo, instead of restated in comments where they're used.
6. **Prune.** Features that are switched off (the guide, split mode's A/B) and version-history comments.
