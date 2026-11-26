# Gear Planner — Stage 1 (read-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A party gear planner that computes each fighter's target loadout, the cheapest measured route to every missing piece/level, and the ranked next steps — shown in report(), acting on nothing.

**Architecture:** One new shared file `src/shared/19_gear_plan.js` (pure functions over G, state, heartbeats), a hunt turn-in counter feeding tokens/h through the heartbeat, and report lines on the merchant and the tank. Live gear code (`gear_gain` and its callers) is untouched except one behaviour-neutral extraction in 05_gear.js.

**Tech Stack:** Plain JS built by tools/build.js into farmer.js; tests in test/smoke.js (vm harness), test/roles.js, test/loader.js.

**Spec:** docs/superpowers/specs/2026-11-26-gear-planner-design.md

## Global Constraints

- Read-only: no buy, craft, equip, upgrade, goal or sale may change because of this stage.
- No projection without evidence: kill rates only from `state.measured[camp]` (raw, not `meas_aged`), tokens/h only from logged turn-ins, gold/h from `party_ledger().earn` over `CFG.spend.window_h`; anything else is "unmeasured" (listed, not costed).
- Odds: upgrades `upg_odds(name,to)`, compounds `cmp_odds(name,to)` (move `CMP_ODDS`/`cmp_odds` from merchant/3_ponty.js to shared so both roles have them); a level is "reachable" only if every step's odds ≥ `CFG.upgrade_step.floor_spare` (0.2) for upgrades and ≥ `CFG.compound_min_chance_wanted` for compounds.
- Ranking: step value = Δloadout value ÷ that member's current loadout value; score = value ÷ party-hours.
- Farming cost = hours × (1 − camp measured xp/s ÷ best measured xp/s).
- Cost cap: planner runs at most once per 60 s per character (cache), ≤ 150 ms per run on the live data.
- Every change: VERSION bump (25.80), branch + PR, gates `node tools/build.js --check && node --check farmer.js && node tools/split_check.js && node test/smoke.js && node test/loader.js && node test/roles.js`.

## Review Focus

1. A fighter not heard from (no `worn` in heartbeat): its plan reads "no data", never a target built from nothing.
2. Two-handers: a target mainhand two-hander must account for the offhand it displaces.
3. Items no class may wear, cash items, and `G.items` without a slot type are never candidates.
4. Recursion cycles (craft A needs B whose route crafts A; exchange ladders): bounded depth 3, no infinite loop.
5. Empty `state.measured` / no ledger yet: everything "unmeasured", report still renders.

---

### Task 1: Hunt turn-in counter and tokens/h in the heartbeat

**Files:**
- Modify: `src/shared/11_quests.js` (`run_hunt`, the `r?.completed` branch)
- Modify: `src/fighter/1_party.js:268` (heartbeat msg)
- Create helper in: `src/shared/19_gear_plan.js` (new file; add to `src/manifest.json` "shared" after 18_merchant_view.js)
- Test: `test/smoke.js`

**Interfaces:**
- Produces: `log_ev("hunt_turnin", { tokens: n })`; `tokens_per_h()` → number|null (own, over `CFG.spend.window_h`, null under 1 h of history on this version); heartbeat field `tph`; `party_tokens_per_h()` → number|null (sum of own + fresh partners' `tph`; null when none measured).

- [ ] Step 1: Test — after `run_hunt` turns one in (stub `interact` → `{completed:true}` then `{started:true}`, monster tokens in bags 5 → 6), `hist.ev` has `{type:"hunt_turnin", tokens:1}`; with two such events 2 h apart in history, `tokens_per_h()` ≈ 2 ÷ window hours covered.
- [ ] Step 2: Run smoke; expect FAIL (`tokens_per_h is not defined`).
- [ ] Step 3: Implement: tokens = `held_any("monstertoken")` after − before the turn-in.
- [ ] Step 4: Run gates; expect pass.
- [ ] Step 5: Commit.

### Task 2: Loadout value with whole sets

**Files:**
- Modify: `src/shared/05_gear.js` — extract `piece_value(item, ctype, g, slot)` = `slot_value` minus `set_gain` (slot_value becomes `round1(piece_value + set_gain)`; behaviour identical).
- Modify: `src/shared/19_gear_plan.js`
- Test: `test/smoke.js`

**Interfaces:**
- Produces: `loadout_value(ctype, loadout, off)` → number, where `loadout` = `{ [slot]: {name, level, stat_type?} }`, `off` = the member's `gear.off` (dps context) or null; = Σ `piece_value` + Σ over sets `stat_points(set_bonus(set, n), ctype)` at real counts n (from `worn_sets(loadout)`).
- Produces: `member_loadout(name)` → loadout|null (self: `character.slots`; partner: heartbeat `worn`; null when absent).

- [ ] Step 1: Tests — (a) for a fixture loadout without sets, `loadout_value` equals Σ `slot_value` (regression guard of the extraction); (b) a 3-piece set fixture `{2:{armor:50},3:{hp:300}}`: value with 3 pieces = Σ pieces + `stat_points({armor:50,hp:300})`; with 1 piece no bonus; (c) all existing smoke tests still pass.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Gates pass.
- [ ] Step 5: Commit.

### Task 3: Candidates and reachable levels

**Files:** Modify `src/shared/19_gear_plan.js`; move `CMP_ODDS`/`cmp_odds` from `src/merchant/3_ponty.js` to `src/shared/08_upgrade_pick.js` (next to `UPG_ODDS`). Test: `test/smoke.js`.

**Interfaces:**
- Produces: `reach_level(name)` → highest level L (0..10) with every step 1..L passing the floors in Global Constraints; non-upgradable, non-compound items → 0.
- Produces: `gp_candidates(ctype, slot)` → `[{name, level}]`: every `G.items` entry with `slots_for(name, ctype, {w:{}})` including `slot`, not `cash`, at `reach_level(name)` only (the best reachable level; lower levels are route steps, not candidates).

- [ ] Step 1: Tests — fixture upgrade item with grade-0 odds: `reach_level` = 7 (step 8 is 0.15 < 0.2); compound grade-0 with `compound_min_chance_wanted` 0.10: 4; a warrior-only item is not a paladin candidate; a quiver is never a candidate for paladin/priest/mage.
- [ ] Step 2–5: fail, implement, gates, commit.

### Task 4: Target loadout search

**Files:** Modify `src/shared/19_gear_plan.js`. Test: `test/smoke.js`.

**Interfaces:**
- Produces: `gp_target(ctype, off)` → `{ loadout, value }`. Algorithm (not determined by the signature):

```
base = best candidate per slot by piece_value (ring1/ring2, earring1/earring2: best two distinct copies may be the same name)
best = base
for each set S with ≥2 items wearable by ctype:
  for k in 2..|S wearable|:
    choose the k S-pieces (distinct slots) maximizing Σ piece_value; fill other slots from base
    if two-hander chosen for mainhand: offhand empty
    v = loadout_value(...); keep if > best
return best
```

- [ ] Step 1: Tests — fixture: a 2-piece set whose pieces are each worse than base but whose 2pc bonus beats the difference → target uses both set pieces; a two-hander beating mainhand+offhand is chosen with offhand empty, otherwise not.
- [ ] Step 2–5: fail, implement, gates, commit.

### Task 5: Routes and costs in party-hours

**Files:** Modify `src/shared/19_gear_plan.js`. Test: `test/smoke.js`.

**Interfaces:**
- Consumes: `party_tokens_per_h()`, `cmp_odds`, `upg_odds`, `shop_for`, `state.ponty.items`, `state.bank_gear`, partners' `bag_gear`/`bag_lv`, merchant `give_lv`, `G.craft`, `G.tokens`, `G.drops` (exchangeables and `monsters`), `state.measured`.
- Produces: `gp_route(name, level, depth = 0)` → `{ kind, hours, measured, text }` | null — the cheapest of: `owned` (0 h), `npc`, `ponty`, `craft` (Σ inputs, recursive), `tokens` (monster / fun via 20 monster), `exchange` (input route hours ÷ probability), `drop` (1 ÷ (rate × measured kills/h) × (1 − xp_s ÷ best_xp_s)), `upgrade` from level−1 (route(level−1) + scroll gold/h-hours ÷ p + route(level−1)·(1−p)/p capped at one rebuild), `compound` from three of level−1 (÷ p). Unmeasured inputs → `measured:false, hours: Infinity` (kept for listing). Depth > 3 → null.
- Produces: `party_gold_per_h()` → `party_ledger().earn ÷ hours covered` | null.

- [ ] Step 1: Tests with fixtures — owned beats buy; craft cost = Σ inputs; a drop at a measured camp (xp/s 100, monster xp 10 → 36,000 kills/h; rate 0.01) = 1/360 h × opportunity factor; same drop at an unmeasured camp → `measured:false`; upgrade +3→+4 at p 0.5 doubles the step's scroll hours and adds one rebuild × 1; a craft cycle terminates.
- [ ] Step 2–5: fail, implement, gates, commit.

### Task 6: Party plan and report lines

**Files:** Modify `src/shared/19_gear_plan.js`, `src/merchant/5_report.js` (facts), `src/fighter/7_report.js` (tank facts). Test: `test/smoke.js`, `test/roles.js`.

**Interfaces:**
- Produces: `gear_plan()` → `{ at, members: [{ name, ctype, cur, target, steps: [{slot, item, level, gain, rel, route, score}] , note }], best: step|null }`, cached 60 s; members = `CFG.party.members` with a loadout (else `note: "no data"`). A set's missing pieces are one combined step (gain = full-set Δ, hours = Σ).
- Produces report facts `gear_plan` (one line per fighter): `gear plan Torlis: 1234 → 1890 pts | next: Oathplate (craft, 0.4 h), skullamulet+3 (ponty+compound, 6.1 h), … | unmeasured: dawnwardaegis (glitch drop)`.

- [ ] Step 1: Tests — with two fixture members, `gear_plan().best` is the higher `rel ÷ hours`; a member without heartbeat reads "no data"; the report fact renders on the merchant (roles.js) without throwing when `state.measured` is empty.
- [ ] Step 2: Measure on live data (scratchpad harness with data.js, the last report's worn/bank JSON): run time ≤ 150 ms; print the three fighters' lines for the owner.
- [ ] Step 3–5: implement, gates, commit; PR v25.80, Fable review, merge, reload.
