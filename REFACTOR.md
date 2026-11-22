# farmer.js refactor (the design and its history)

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
- [x] v24.60–v24.63 (v24.62–v24.63: the second audit's findings): the camp is sticky (no periodic re-pick; hunts and quest farming off — both back on since v24.88, owner). The tank never goes on
  without a member: no group-hold timeout, no join window or wait limit on town trips, no teleports. On a town trip
  the tank walks to town with the party behind it; a follower follows it in and starts its town work on arrival. A
  camp where every monster has levelled past the limit is rested at once.
- [x] v24.84 (owner: explore camps for the best return, re-evaluate as gear and levels improve): the camp is
  reviewed every 30 min, or after 10 min once the party is stronger (an average level, or +5% gear points) —
  measured camps by measurement, untried ones by estimate, past switch_margin; a measurement loses weight as the
  party grows. This replaces v24.60's "no re-pick" (the 2-minute re-pick it removed had moved the party 18 times an
  hour).
- [x] v24.94–v25.12: split by role (owner, 2026-11-21: "start the work"). src/common.js, fighter.js, merchant.js, main.js;
  farmer.js is their build. First cut: the merchant's supply runs, stand, Merrit, Ponty, bank purge and donations
  went to merchant.js; following, healing, the hand-off to the merchant, token buys, own projects and collecting
  went to fighter.js. v24.95–v24.98: the fighter's part of tick() (fighter_tick), camp choice and review, danger
  checks, the party break, party town trips, goals and directives, report()'s role sections (facts_*), safety tuning,
  worn-gear swaps, stat scrolls, events. v25.1–v25.4: messages
  (fighter_cm), heartbeat, party invites, the rest of report()'s fighter lines, goals and hunts, why_not's answer,
  combat (fight, choose_target, approach, kite, class skills; the merchant has its own plain fight-back). Still in
  common.js: gear scoring, bags, town runs, upgrades/compounds (merchant, or a fighter when it's offline), the fight
  model's numbers, and ~45 one-line role conditions. v25.7: common.js became src/shared/ (16 files by subject) with
  src/manifest.json giving each role's load order; loader v4 reads it. v25.8: fighter.js became src/fighter/
  (8 files: loop, party, camp, combat, goals, town, gear, report). v25.9: merchant.js became src/merchant/
  (6 files: loop, serve, stand, ponty, bank, report). v25.10: shared/05_items.js (1,127 lines) became 05_gear,
  06_travel_gear, 07_upgrade_runs, 08_upgrade_pick, 09_craft; the later shared files renumbered 10–19 (19_hooks).
  v25.11: role functions — a function both roles declare; the build dispatches it by is_merchant(). tick()'s flee and
  role branches, fight_back, gold_keep, merchant_hb/merchant_recent, ptown_on, self_taker_ok became role functions.
  v25.12: shared/19_hooks.js is gone — each default became the other role's version (fighter/8_merchant_parts.js,
  merchant/6_fighter_parts.js), so farmer.js runs exactly each role's own code; is_merchant() guards made redundant
  by that (facts_* in report(), stand_hold, bank_purge, collect_list, merchant_hb/merchant_does_it) are removed;
  fund_pool, upgrade_steps, bank_cands are role functions. Done: the remaining ~24 is_merchant() checks in shared/
  are policy conditions inside code both roles run, left as they are.
- [ ] Stage 4 (proposed, **not approved by the owner** — don't do it unasked): delete the guide, travel gear and
  probes (all three are switched off in CFG); keep a camp on measured results only.

Still to bring under the tank: a follower still closes in on its target by itself (approach) and fight() can kite;
the watchdog and the tank's group hold each steer on their own (step 4b).

## Owner decisions since v25.13 (2026-11-22)

- **Every push** goes on a branch with a pull request; a Claude Haiku review may approve the merge. The characters
  are then restarted remotely (the game's MCP API) once GitHub serves the new version.
- **The merchant runs every upgrade and compound** (v25.17), the fighters' own pieces too; projects aim only as
  high as the run will go (v25.19). Nothing is sold unless the owner lists it: the stand lists only
  `CFG.merchant.stand.list` (v25.15). With that list empty, Merrit gives no parcels (she needs a listing).
- **Ponty** is checked every 10 min; head starts for upgrades and shiny copies are bought (v25.18).
- **Quests** only for outputs that are an upgrade and not already owned (v25.15).
- **Measured rates** count only time the party is all there and ready; learned rates were reset once (v25.16).
- **Tank first, one exception** (v25.20): where the tank kills its targets in one hit, followers pick their own
  random monsters of that type at its camp.
- **Cave of Many Dreams** once a day (v25.22–v25.24), unverified until its first real run.
- **Browser tabs**: keep_awake() (the game's performance_trick, v25.14); the status box under CODE is taller and
  lined up with the log (v25.21–v25.23). Mainframe isn't used (CODE slots are limited to 64 KB).

## Rules that were simplified (owner's instruction, v24.46)

- **Town:** together, a town trip is everyone's. One rule; the "could the rest keep farming" judgement is gone.
- **Tank first:** nobody but the tank touches a monster that has no target, and the tank only with every member
  within `engage_px`; enforced in `fire()` (`tank_first`). One exception since v25.20: the one-hit free-for-all.
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
