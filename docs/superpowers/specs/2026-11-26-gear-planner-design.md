# Gear planner — design

## Intent

The owner: "a broader, whole-game model of equipment and gearing. Right now it's short term, short-sighted, and
missing a great deal of possible routes to good gear. … considers upgrades, set bonuses, whole sets, ease of upgrades,
and how attainable and obtainable each item is." Gear upgrades are critically important. The party may be sent to farm
what a gear route needs.

Today (v25.77) each decision is separate and local:

- `gear_gain` (src/shared/05_gear.js) scores one item in one slot against what is worn, plus the marginal set bonus of
  that one piece. A set whose bonus needs 2+ pieces can never win (the Oathkeeper set for Torlis).
- `upgrade_step` / `pick_upgrade` (src/shared/08_upgrade_pick.js) look one +1 ahead on worn pieces only; a spare copy is
  never levelled to back a step.
- `token_pick` (src/fighter/6_gear.js), Ponty compound routes (src/merchant/3_ponty.js), quest crafts
  (src/shared/11_quests.js, "not an upgrade for us"), bank fetches and the gear purge each use their own thresholds.
- Exchange ladders (Gold Earring +0…+4 at Wynifreed), boxes, crafts from monster materials and drops are never routes.

## Goals

1. One planner per fighter that knows the best loadout it can reach and the cheapest way to each piece of it.
2. Whole loadouts are scored, set bonuses included at their real piece counts.
3. Every acquisition route is a candidate: already owned (bank, bags, merchant, other members), NPC buy, Ponty,
   craft (recursively, its inputs), token shops (monster tokens, and Fun Tokens bought with them), exchange ladders and
   boxes, monster drops (G.drops.monsters and the map tables), upgrade and compound with real odds.
4. Each route has a cost in **party-hours**, from evidence: gold via the measured party income per hour; monster tokens
   via measured hunt turn-ins per hour; drops via G.drops rates × the party's **measured** kill rate at that camp.
5. The plan picks what to do next by **power gained per party-hour**, and keeps a long-term target visible.
6. Gear work can steer the party: a farming need becomes a goal the tank weighs, below hunts.
7. The bank is classified against the plan (v25.78 started this in report()).

## Non-goals

- PvP token routes (the party doesn't PvP).
- Changing combat, movement, town errands, hunts' rules.
- A UI beyond report() lines.

## Anti-goals (a failure even if it "works")

- Swapping gear back and forth (each change must clear a margin and is held).
- Projections without evidence: an unmeasured kill rate is never invented. A route through a camp the party has not
  measured is listed as "unmeasured" and ranked after measured routes, never costed by a model guess.
- Risking a worn last copy below today's floors (`CFG.upgrade_step.floor_last`), or a weapon/offhand without a spare.
- Selling or banking away anything on the plan (set pieces, route inputs, spares being levelled).
- Spending more than the existing spend rules allow (`CFG.spend`, `upgrade_gold()`).

## Constraints

- Code lives in src/{shared,fighter,merchant}, built into farmer.js; split_check rules (merchant stubs for fighter-only
  names); VERSION bump per pushed change; each change on a branch with a PR, Fable review, squash-merge, reload.
- The merchant does buying, crafting, upgrades, compounds and bank work; fighters report worn gear in heartbeats.
- Planner cost must stay small: it runs on the merchant (and the tank for goals) at most every 60 s, cached.

## Approaches (owner picked A)

- **A. One planner** (picked): target loadouts + costed routes in one module; existing executors (buy, Ponty buy,
  craft, exchange, token buy, upgrade, compound, equip, goals) do the work it chooses. Biggest change; removes the
  disagreeing per-system rules.
- B. Bolt-ons: set-aware scorer consulted by today's systems. Keeps the split that causes today's misses.
- C. Offline plan pushed as config. Stale, manual.

## Design (the parts decided)

### 1. Value of a loadout

`loadout_value(member, slots→{name, level, stat_type})` = sum over pieces of the existing per-piece stat value (the
`stat_points` class weights in 05_gear.js, the class weapon/offhand modifiers, upgrade stats per level) **plus**
`stat_points(set_bonus(set, n))` for each set at its real worn count n. This replaces per-slot `gear_gain` as the
measure; `gear_gain` becomes "value of loadout with this piece swapped in − current".

### 2. Candidates

For each fighter and slot: every G.items entry the class can wear in that slot (`slots_for`), at each level from 0 to
its **reachable level**: the highest level whose chained success odds (from the existing odds tables, `upg_odds` /
compound odds) stay above `CFG.gear_plan.min_chain_odds` with the copies the route provides.

### 3. Target loadout (search)

Per fighter: start from the best piece per slot ignoring sets; then for each set the class can wear, evaluate the
loadout with that set's best k pieces (k = 2…n) forced in and the other slots at their best non-set piece; keep the
best. Two-handers replace mainhand+offhand. The result is the **target** (reported).

### 4. Routes and costs (party-hours)

For each candidate piece at a level, the cheapest route, recursively:

| Route | Cost |
|---|---|
| Owned (bank/bags/merchant/another member not wearing it better) | ~0 (a hand-over or fetch) |
| NPC buy (G.items.g at its shop) | gold ÷ measured party gold/h |
| Ponty (seen listing) | price ÷ gold/h |
| Craft (G.craft) | sum of input costs (each input recursively) + gold |
| Monster tokens (Daisy) | tokens ÷ measured tokens/h (hunt turn-ins) |
| Fun Tokens | 20 monster tokens each |
| Exchange ladder / box (G.drops of the exchangeable) | input cost ÷ probability of the wanted result |
| Drop | 1 ÷ (drop rate × measured party kills/h at the best measured camp of that monster); unmeasured → listed, not costed |
| Upgrade +L→+L+1 | expected scrolls + expected replacement cost on failure (odds) |
| Compound | 3 copies of the level below + scroll, by odds |

Gold/h and tokens/h are the party's measured rates over the last 6 h (existing ledgers); with no measurement the
route is "unmeasured".

### 5. Choosing the next project

From the current loadout toward the target: every **step** (a piece or a level that raises loadout value, including
the pieces of a set that only pays once complete — counted as one step for the whole set) gets value ÷ cost. The
best measured step is the project. A project is held until done or blocked (no thrash), re-planned on completion or
every `CFG.gear_plan.review_min`.

### 6. Executing

The merchant executes buy / Ponty / craft / exchange / token / upgrade / compound steps through the existing
executors; fighters equip whole sets at once (all pieces delivered first). A drop or material step becomes a **gear
goal**: `goals_list` gains `{ monster, w: CFG.goal_w.gear, reason: "gear: <item> for <member>" }` with weight below
hunts; the tank's existing goal rotation and camp pick take it from there.

### 7. Bank classes

v25.78's classes are re-derived from the plan: on-plan (input, spare being levelled, set piece), useful later,
surplus, no party class can use, unclassified.

### 8. Report

`gear plan` lines per fighter: target loadout and its value vs current; the current project with route and cost;
the next 3 steps; unmeasured routes skipped.

### 9. Decisions after the builder check

Owner's:
- **One party plan**, one project at a time. Steps from different fighters are ranked by **relative gain** (the step's
  value ÷ that fighter's current loadout value) per party-hour, so classes compare fairly (the tank's defence weight
  doesn't win every time). Two fighters wanting the same item: the higher-ranked step takes it.

Builder's calls (marked so the owner can overrule):
- **Upgrade risk:** today's floors stay (`floor_last` 0.8 for a worn last copy, `floor_spare` 0.5 with a spare). The
  planner may buy or level spare copies just to back a step; `min_chain_odds` for "reachable level" = the product of the
  per-step odds the executor will accept, so the plan never targets a level the executor refuses. Failure cost = the
  cost of re-reaching the destroyed copy's level (recursive, capped at one rebuild).
- **Stage 1 is strictly read-only:** `gear_gain` and every caller are untouched. Stage 2 makes `gear_gain` (and with it
  equip_upgrades, share_gear, bank_upgrades, wanted_by_member, the purge) the plan's loadout delta; equip/share/bank
  fetch then also refuse a swap that breaks a planned set before it's complete. ponty_stock and secondhand buys of a
  plain upgrade, craft_power and must-hold token buys stay, but each checks the plan (a step off the plan isn't taken
  if it spends what a plan step needs).
- **Tokens:** the token holder (the first configured member online) executes token steps, as today; the merchant never
  buys with tokens. Stage 1 adds a hunt turn-in counter (log_ev "hunt_turnin" with tokens gained) so tokens/h is
  measured; until 6 h of it exist, token routes are "unmeasured".
- **Measured kill rate:** `state.measured[camp]` (xp/s, the raw stored value, not `meas_aged`'s blend) ÷ the monster's
  base xp, shown with its age; a camp without one is unmeasured. No model kill rate is used.
- **Gold/h:** gross earnings (`earn`) over the last 6 h, all fighters + merchant.
- **Farming time cost:** hours × (1 − that camp's measured xp/s ÷ the best measured xp/s) — only the xp lost versus
  the best camp; hunts are never displaced (gear goals rank below them).
- **One value function:** `loadout_value` uses the same per-piece valuation as equipping (`slot_value`, including the
  damage model when `gear_dps` is on) plus set bonuses, so targets match what gets worn.
- **Merchant offline:** plan execution waits for the merchant (fighters keep today's own-project behaviour); gear
  goals still come from the tank's own planner run.

## Stages (each its own PR)

1. Planner module + report lines, read-only (nothing acts on it). The owner checks targets and routes in reports.
2. Merchant executes the plan's buy/craft/exchange/token/upgrade/compound steps; replaces token_pick, pick_upgrade,
   Ponty routes, quest-craft gating; whole-set equips.
3. Gear goals in the tank's goal choice.
4. Bank classes driven by the plan.

## Left to the builder

Module layout and names; caching; exact search pruning; test fixtures; report wording.
