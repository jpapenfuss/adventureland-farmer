# farmer.js refactor

Why: on 2026-11-21 one evening produced a door loop, a spot ping-pong (76 changes of spot in an hour), followers
stuck on a corner and a party walking past its targets. Each took several reports to find, because the rules
behind each decision are spread over many functions and none of them records why it decided what it did.

Rule for every step: behaviour stays the same unless the step says otherwise; tests pass; VERSION is bumped.

## The design (owner, 2026-11-21)

**The tank owns everything.** One point of decision: the tank picks the camp, leads the walk, and starts every
fight. The party sits at a camp and farms. Moving camp to find a better one is fine; everyone follows the tank
there. Nobody engages until every member is with the tank. The aim of every change is fewer features, fewer
exceptions, more stability.

In the code as of v24.50:
- Only the tank hits a monster that has no target (`tank_first`, enforced in `fire()`), wherever the tank is.
- The tank does so only when every online fighter is within `CFG.party.engage_px` (`party_missing`).
- A death triggers a party town trip: everyone meets in town and leaves together.
- Everything learned before v24.50 was cleared once (`DATA_V`).
- Off by default: travel gear, spread targets. Removed: the "can the rest keep farming" town judgement.

**Plan approved 2026-11-21** (four stages; the full text is in the session's plan file):
- [x] Stage 1 (v24.51, corrected v24.52 and v24.56): one party or nothing. **If a party member dies, the others
  use the suicide command** (`harakiri`) and the party is together again at the respawn in town. That is the only
  reason anyone suicides — not low HP, not "trouble", not a member being offline (then: walk to town and wait).
  Without a live tank nobody starts a fight. A suicide blames no camp.
- [x] Stage 2 (v24.53): deleted the solo and split code (split mode, A/B, `duo_check`, `hold_grind`, spread, convoy, solo
  judging in the fight model, leadership other than the tank).
- [x] Stage 3 (v24.56–v24.58): followers execute. A follower never picks or approaches an untouched monster, never
  walks to the camp alone, never starts a town trip (it reports `tn` in its heartbeat and the tank takes the party),
  never joins an event by itself, has no keep-away steps, kiting or route refusal of its own, and the watchdog no
  longer sends it to town. What a follower still does by itself: heal, hit what already targets the party (closing
  in on it), stay beside the tank, loot, drink potions, wear its gear.
- [x] v24.60–v24.63 (v24.62–v24.63: the second audit's findings): the camp is sticky (no periodic re-pick; hunts and quest farming off). The tank never goes on
  without a member: no group-hold timeout, no join window or wait limit on town trips, no teleports. On a town trip
  the tank walks to town with the party behind it; a follower follows it in and starts its town work on arrival. A
  camp where every monster has levelled past the limit is rested at once.
- [x] v24.84 (owner: explore camps for the best return, re-evaluate as gear and levels improve): the camp is
  reviewed every 30 min, or after 10 min once the party is stronger (an average level, or +5% gear points) —
  measured camps by measurement, untried ones by estimate, past switch_margin; a measurement loses weight as the
  party grows. This replaces v24.60's "no re-pick" (the 2-minute re-pick it removed had moved the party 18 times an
  hour).
- [~] v24.94–v25.3: split by role (owner, 2026-11-21: "start the work"). src/common.js, fighter.js, merchant.js, main.js;
  farmer.js is their build. First cut: the merchant's supply runs, stand, Merrit, Ponty, bank purge and donations
  went to merchant.js; following, healing, the hand-off to the merchant, token buys, own projects and collecting
  went to fighter.js. v24.95–v24.98: the fighter's part of tick() (fighter_tick), camp choice and review, danger
  checks, the party break, party town trips, goals and directives, report()'s role sections (facts_*), safety tuning,
  worn-gear swaps, stat scrolls, events. Still in common.js: combat (the merchant fights back when hit), gear
  scoring, bags, town runs, quests' crafting, and ~65 is_merchant() branches inside shared functions.
- [ ] Stage 4: delete the guide, travel gear and probes; a camp is kept on measured results only.

Still to bring under the tank: followers choose their own approach, kiting and step-away movement, and the
watchdog, convoy and group-hold code paths each steer on their own (step 4b).

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
