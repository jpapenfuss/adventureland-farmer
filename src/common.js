const VERSION = "25.1"; // Adventure Land farmer: src/common.js (every character) + src/fighter.js or src/merchant.js + src/main.js (overview at its bottom).
// Every tunable lives here. Units are in the name (_ms, _s, _min, _h) or the comment; fractions are 0..1 of max.
const CFG = {
	// --- fighting -------------------------------------------------------------------------------------------------
	safety: 0.35,              // a fight may cost at most this fraction of max HP (expected damage taken over one kill).
	// v23.5: the limit tunes itself: every step_h with no death or flee it rises x up (to at most max); a flee lowers it
	// x down; a death resets it to safety. It used to be fixed, so days without a scratch never moved the party up.
	safety_tune: { enabled: true, step_h: 2, up: 1.15, down: 0.85, max: 0.6 },
	                           //   0.35 leaves room for a second mob joining in or an unlucky streak before flee_hp.
	kite_margin: 25,           // px kept beyond a monster's attack range when kiting (covers latency and its step size)
	kite_slack: 4,             // a mob we can kite still counts 1/kite_slack of its damage: kiting isn't perfect
	                           //   (other mobs, walls, missed steps), so it lowers the risk 4x rather than to zero
	max_ttk_s: 20,             // a monster that isn't the pack's type is only attacked if it dies within this many s
	model_distrust: 2,         // v24.47: a monster we have no fights against is assumed to deal this many times the predicted damage
	grown_over: 1.5,           // v24.59: levelled-up monsters of the camp's type are taken up to this x the party's limit
	hopeless_ttk_s: 180,       // v24.44: a monster the party couldn't kill in 3 min is never attacked at all (ents)
	                           //   (long fights block the pack's respawns and hunt progress)
	max_respawn: 120,          // s; packs whose monster respawns slower than this aren't farmed (too much idle time)
	min_count: 3,              // packs with fewer monsters than this aren't farmed, unless they "grow" (refill instantly)
	walk_overhead: 1.5,        // s added to every kill in estimates for walking to the next target and aggro time
	idle_giveup_ms: 25_000,    // nothing to fight at the pack for this long while patrolling → put the pack on cooldown
	pack_cooldown_ms: 600_000, // 10 min: an idle pack is skipped this long (someone else is probably farming it)
	death_pack_cooldown_ms: 1_800_000, // 30 min: a pack we died at is skipped this long
	repick_ms: 120_000,        // re-evaluate where to fight every 2 min (levels, gear and measurements change)
	switch_margin: 1.15,       // change packs only if the new one scores 15% better (walking there isn't free)
	near_pad: 450,             // px around the pack area a target may be picked from (and chased to)
	danger_px: 400,            // v24.10: spots this close to a spawn of an aggressive monster we can't take on aren't farmed
	keep_px: 220,              // v24.14: step away from a monster we can't take on that may attack, once it's this close
	keep_close_px: 120,        // v24.25: ...and coming our way, or already this close (was 300, whatever its direction)
	measure_min_s: 90,         // s at a pack before its measured xp/s is trusted over the estimate
	// v24.84 (owner: explore camps for the best return; re-evaluate them as gear and levels improve): the tank reviews
	// its camp every camp_review_min, or after camp_review_early_min once the party has grown stronger (an average level
	// up, or gear points +camp_review_gear) — measured camps by their measurement, untried ones by the estimate, moving
	// only past switch_margin. So an untried camp gets a 30-min trial and the party returns if it measures worse; at
	// most two moves an hour. Never while a monster is on a member.
	camp_review_min: 30, camp_review_early_min: 10, camp_review_gear: 0.05,
	// A measurement also loses weight as the party grows: half per meas_level_half average levels gained since it was
	// taken, and half per meas_gear_half (as a fraction) more gear points — a camp measured weaker is judged again
	meas_level_half: 2, meas_gear_half: 0.15,
	meas_half_h: 12,           // a measured spot rate's weight halves every 12h (the rest goes to the estimate); 0 = never ages
	force_type: null,          // monster id to farm exclusively (testing/debugging); null = choose automatically
	flee_hp: 0.25,             // the merchant, below 25% HP: teleport to town (use_town) and recover (fighters never flee)
	flee_quiet_ms: 1200,       // ...channelling only once nothing has hit us for 1.2s (a hit cancels the 3s channel)
	smash_mp_floor: 0.6,       // paladin: smash only with MP above 60% of max (+ its 380 cost): regen funds it, never potions
	// Probing: the safety model only picks monsters it already calls safe, so it never learns about harder ones. Every
	// every_min the leader may try the best-xp spot whose risk is just over the limit (up to max_over x) and that beats
	// the best normal xp/s by min_gain, for `minutes`. A member dying or dropping below abort_hp ends it as a failure
	// (fail_cooldown_h before that monster is tried again);
	// lasting the time is a success (win_cooldown_h). Calibration learns from the fights either way.
	probe: { enabled: false, every_min: 45, minutes: 10, max_over: 2.0, min_gain: 1.25, abort_hp: 0.4, fail_cooldown_h: 6, win_cooldown_h: 2 },
	recover_hp: 0.85,          // ...and stay out until HP is back to 85%
	recover_mp: 0.4,           //    and MP to 40% (enough for heals/skills on the way back)
	loot_range: 400,           // px; the server pays a chest's gold multiplier only within 400px of the opener
	loot_wait_ms: 45_000,      // a chest farther than loot_range is opened anyway after 45s (we usually walk past it)
	// --- potions ---------------------------------------------------------------------------------------------------
	hp_pot: "hpot1",           // HP potion bought and used (hpot1 = the 400 HP potion)
	mp_pot: "mpot1",           // MP potion bought and used (mpot1 = the 500 MP potion)
	pot_min: 30,               // restock when either potion drops below this many
	pot_buy: 1000,             // ...back up to this many (as far as gold allows). v24.12: was 200 — potions stack to 9999
	                           // in one slot, so carrying more costs no bag space, and every restock is a trip saved
	// --- bags ------------------------------------------------------------------------------------------------------
	bag_min_free: 10,          // town run (sell + bank) when free bag slots drop below this (bags hold 42)
	// v24.77 (owner): worn pieces with an empty Stat line get the class's main stat by stat scroll (int/str...; 8k each
	// at the scroll seller; the server takes 1 scroll for a normal-grade piece, 10 for high, 100 for rare; it can't
	// fail). Done on town trips, never a reason for one. max_gold_per_pt: the most a point of gear score may cost —
	// 100k covers normal and high grade pieces; a rare one (800k for +3 of a stat) needs it raised.
	// v24.78 (owner): only pieces at +min_level or higher (ones we'll keep), and never more than max_cost for one piece.
	// Note the server counts scrolls by the piece's grade AT ITS LEVEL: most gear turns a grade higher at +7 (10x the
	// scrolls of +6), and a piece that's rare by then takes 100 (800k) — over max_cost, so it's left.
	stat_scroll: { enabled: true, min_level: 7, max_cost: 100_000, max_gold_per_pt: 100_000, per_run: 3 },
	sell: [],                  // item names to always sell
	// v24.72 (owner): false = nothing is sold as "junk" — not plain +0 gear when the bank is full, not the merchant's
	// bank purge, not compound pieces at their ceiling. Only the names in `sell` are sold. (What we own can still be
	// upgraded into something worth wearing.) With the bank full, things then stay in the bags.
	sell_junk: false,
	// Names whose plain copies (+0, untitled, unlocked) are sold to an NPC, also out of the bank (the merchant pulls them
	// on its bank visits). EMPTY by default (v24.76): v24.74 shipped it as ["staff"] without the owner asking — after
	// the owner had said to stop selling junk — and 22 staffs were sold. Only the owner puts names here.
	sell_plain: [],
	auto_sell_gear: false,     // true: sell +0 normal-grade untitled gear (worth <= sell_max_value) instead of banking it
	sell_max_value: 20_000,    // never auto-sell gear the NPC values above this much gold
	sell_batch: 4,             // with a computer (sells from anywhere): sell as soon as this many junk items pile up
	bank: true,                // store everything not needed in bags in the bank
	need_copies_upgrade: 2,    // copies of an item the guide is upgrading kept in bags (the one in work + a spare)
	need_copies_compound: 4,   // copies of a compoundable item the guide is working on (3 per compound + 1)
	keep: ["computer", "supercomputer", "tracker", "elixirluck", "lostearring"], // never sold or banked
	// Items every character should carry (one each), re-acquired when missing: fetched from the bank if one is there,
	// else bought with the named token at its shop (the Tracktrix: 4 monster tokens at Daisy). The merchant never earns
	// tokens, so one fighter buys its copy and hands it over on a supply run.
	hold: { tracker: "monstertoken" },
	hold_buy_for_merchant: false, // v18.0: the merchant doesn't fight; nobody buys it a Tracktrix
	// --- own gear (scored by stats, independent of the guide) ---------------------------------------------------------
	// Watchdog (v15.5): every 30s, catch silent stalls the timeouts miss. frozen: moved < 20px and gained no xp for
	// frozen_min → stop the walk, cool the pack, re-pick. noprog: leader/solo with a pack but no xp for noprog_min →
	// cool the pack and re-pick (3rd time in an hour: teleport to town first). lost: a follower out of reach of the
	// leader (other map / > follow_far) for lost_min → teleport to town, then walk to the leader.
	watchdog: { enabled: true, frozen_min: 3, noprog_min: 10, lost_min: 5 }, // v23.0: "no xp" now means no hits / no kills of our own
	history_max: 1500,         // events kept in the persistent log (history(), deaths()); ~300KB per character
	history_hours: 48,         // hourly time/xp/gold buckets kept
	gear_auto: true,           // equip bag/bank items that score higher than what's worn; hand spares to party members
	gear_min_gain: 3,          // an item must beat the worn one by this many points...
	gear_margin: 0.05,         // ...and by 5% (avoids swapping for noise)
	gear_guide_respect_h: 12,  // after the guide equips a slot it owns it this long — but only while it still has a
	                           //   live step (not paused) for that slot; an idle guide doesn't block the slot
	gear_guide_override: 0,    // extra margin a guide-owned slot demands (v19.7: 0 — the best-scoring item is worn; a
	                           //   guide equip step that would lower a slot's score is skipped instead)
	gear_input_gain: 0.15,     // v20.0: a copy the guide holds as an upgrade input is still worn if it beats the slot by 15%+
	gear_swap_loss: 0.5,       // v20.0: a swap may cost the giver up to this share of what the receiver gains (party total up)
	gear_share_range: 300,     // px; hand a spare to a party member this close (server limit: same map, 400px)
	// Points per unit of each stat (gear evaluation, v24.26). main_stat: one point of the class's main stat; its other
	// primary stats (str dex int vit for) scale by the class's own lstats (G.classes, the game's data docs) — not
	// listed here. Defensive stats count x gear_tank_mult for tank classes. xp: xp_weight (gear_xp_value).
	gear_w: { attack: 1, main_stat: 1.2, hp: 0.05, mp: 0.02, armor: 0.3, resistance: 0.3,
		frequency: 2.5, crit: 2, critdamage: 0.3, apiercing: 0.4, rpiercing: 0.4, evasion: 1.5, avoidance: 1.5,
		reflection: 1, lifesteal: 2, manasteal: 1, dreturn: 0.5, speed: 0.5, range: 0.1, luck: 0.15, gold: 0.15, output: 3 },
	// v24.80: attack and attack speed on a piece are valued together, as the damage per second they add for the wearer
	// (server: attack += item attack x main stat / 20; frequency adds; damage = attack x frequency) — not by the two
	// flat weights above. With those, +0.40 attacks/s on a wand outscored a staff with three times its damage plus an
	// offhand: Aspernari ended up holding a +1 wand and nothing else. false: the flat weights.
	gear_dps: true,
	gear_tank: ["paladin", "warrior"],
	// v23.4: the xp stat (+1% of the wearer's kill xp per point; server: xpm) is worth what that much more damage would
	// earn: each fighter gets 1/n of every party kill, so +1% damage adds ~1/n % xp while +1 xp adds 1%. One point counts
	// as gear_xp_value x attack (attack = 1 point; v24.7: not x fighters). Merchants get no kill xp: 0.
	gear_xp_value: 0.01,
	// Own compounding (rings, earrings, amulets, belts, orbs...): three spare copies at one level → one a level higher.
	// Spares = bags + bank, never worn, locked, titled, guide-needed, or wanted by a member as an upgrade.
	compound_auto: true,
	compound_max_level: 3,     // stop at +3 results (scroll cost rises and odds fall fast after that)
	compound_min_chance: 0.75, // the server's preview must say >= 75% (failure destroys all three)...
	// v24.87: ...or >= this when a fighter would wear the result. +2 → +3 is 40% at the server for every common
	// accessory; three spare +2s (7 Belts of HP +2 lay in the bank) are worth more as a 40% shot at a worn +3.
	compound_min_chance_wanted: 0.40,
	compound_min_chance_rebuyable: 0.6, // ...or >= 60% when an NPC sells the item (failure only costs gold)
	compound_per_run: 6,       // compounds per town run at most
	gear_tank_mult: 2,
	// v24.27: travel gear. Worn pieces that slow us come off for long walks and go back on when the walk ends. "Slow" counts
	// the piece's own speed and the class's modifier for its type (priest staff -4, shield -5; paladin sword -7, shield -3).
	// A long walk is one to another map or farther than min_px; a follower uses its leader's.
	// They go back on at once: at the spot, when an errand arrives (before any NPC work), when a monster near targets
	// one of us (danger_px), or below half HP. Otherwise they go back on settle_ms after the long walk ends.
	// Pieces whose removal would cut current HP or MP by more than max_hp_loss / max_mp_loss of max stay on
	// (the server clamps HP/MP to the lower max, so that much is lost).
	// .b pieces always stay on (the server deletes them on unequip). Not the merchant.
	travel_gear: { enabled: false, min_px: 700, min_speed: 1, settle_ms: 10_000, danger_px: 400, keep_free: 2, max_hp_loss: 0.1, max_mp_loss: 0.25, cooldown_ms: 30_000 },
	// Own upgrading (upgrade_auto): one project at a time: an NPC-sold piece, upgraded (spare copies only, never worn
	// gear) to the level where it beats what a member wears by the most per gold. Each step is gated by the server's
	// preview (min_chance_rebuyable: a failure only costs gold); at low odds the project stops at the level reached.
	upgrade_auto: true,
	upgrade_max_level: 7,      // target at most +7, and only levels that take scroll0/scroll1 (scroll2 costs ~1.6M)
	// v24.82 (owner: lower odds have to be accepted for meaningful upgrades): a shop piece's target level is the one
	// where gain x upgrade_gold_per_pt most exceeds its EXPECTED cost — the copy and scrolls, counting the copies lost
	// to failed steps at the server's base odds (+4 70%, +5 60%, +6 40%, +7 25%). A wand: +5 ≈ 136k, +6 ≈ 340k,
	// +7 ≈ 1.4M. Steps on shop pieces are then taken down to min_chance_rebuyable (20%).
	upgrade_gold_per_pt: 40_000,
	// v24.86 (owner: weapon upgrades are sorely needed): a shop weapon a fighter would hold is taken to +weapon_to with
	// no budget — no gold-per-point test, no spending cap, no give-up after failures — and weapons come before every
	// other project. Steps still need the server's odds over min_chance_rebuyable (+7 is 25%).
	upgrade_weapon: { enabled: true, to: 7 },
	upgrade_spend: 0.2,        // a project may cost at most 20% of the gold above gold_reserve (estimate without failures)
	upgrade_abort_x: 2.5,      // ...and is abandoned once failures push actual spending past 2.5x that estimate
	upgrade_steps_per_run: 8,  // upgrade steps per town run (a fighter's)
	merchant_upgrade_steps: 60, // v24.92: the merchant's — it lives in town; 8 a run made it start a run every minute
	// High upgrades: weapon-slot projects may go past the scroll0/1 levels with scroll2 (1.6M each), up to max_level.
	// A failure destroys the copy, so each such step needs the server's preview >= min_chance (a Primling offering in
	// the bags is used when it lifts the odds over it), and a project may cost at most spend of the party's spare gold.
	upgrade_high: { enabled: true, max_level: 9, slots: ["mainhand", "offhand"], min_chance: 0.55, spend: 0.25, offerings: ["offeringp"] },
	// Crafting for power (craft_power): craft a non-quest recipe whose output a member would wear as an upgrade, when
	// its inputs are plain materials we have (bags + bank; never quest/guide materials) and its gold cost fits
	// craft_spend of the spare gold. Done by the merchant while it's online.
	craft_power: true,
	craft_spend: 0.2,
	// Elixirs (elixir_auto): keep the elixir slot filled with the best one owned (bags, then bank; elixirs with a
	// withdrawal effect are skipped). None owned and gold >= elixir_buy_min_gold → buy elixir_buy. Lost on death.
	elixir_auto: true,
	elixir_buy: "elixirluck",  // Liquid Luck: 240k for 12h of +16 luck (the only elixir an NPC sells)
	elixir_buy_min_gold: 500_000, // v24.86: was 5M — fighters now keep only merchant.fund_keep; the rest funds upgrades
	// World bosses / events on this server (parent.S: snowman, pinkgoo, wabbit, dragold, mrpumpkin, franky...). They're
	// "cooperative" (every attacker shares xp and loot by damage), so they're judged on survival, not kill time: the
	// party (tank first) must take tank_s seconds of the boss's damage within the safety budget, and one hit may not
	// exceed one_hit of the squishiest member near. In practice: snowman, pinkgoo, wabbit yes; dragold, franky no.
	boss: { enabled: false, tank_s: 10, one_hit: 0.4, skip: [] },
	// Server events joined with join(name) while parent.S lists them (fighters only; merchants can't join):
	//   goobrawl (daily, 9 min): Brawl Goos (100k hp, 100k xp, attack 5, xp shared by damage) on Goo Island; the rare
	//     Rainbow Goo (48M xp, attack 320) only if it passes the boss survival check.
	//   crabxx (40 min): clear the Huge Crabs (4.2k hp, attack 240) so the Giga Crab can be hurt; joined only when
	//     the fight model calls Huge Crabs safe for us. Ice Golem / A/B testing aren't joined (too strong / PvP).
	events: {
		goobrawl: { on: true, map: "goobrawl", targets: ["bgoo"], extra: "rgoo" },
		crabxx: { on: true, targets: ["crabx"], extra: "crabxx", safe_from: "crabx" },
	},
	// Monster tokens (Daisy): spend on the shop's class gear that a member would wear, best points per token first
	token_auto: true,
	// Secondhands (Ponty, main): items players sold to NPCs, resold at 2x item value (3x cash-shop items). The merchant
	// checks every secondhand_every_ms and buys anything a fighter would wear as an upgrade, or that completes a compound
	// set, within secondhand_max_price and never below gold_reserve.
	secondhand_auto: true,
	secondhand_every_ms: 1_800_000,
	secondhand_max_price: 500_000,     // v18.6: was 2M (it paid 936k for +0 pants)
	// v24.81: Ponty routes — copies bought there (with ours) to compound into a piece a fighter would wear, up to +2 (the
	// server's base odds: +1 99%, +2 75%, +3 40%); a route may cost this per gear point, weighed by its odds
	ponty_routes: true,
	// v24.89: the merchant buys at Ponty the quest materials the fighters are short of (their heartbeats' qshort, less
	// what the bank and its bags hold) — a listing at most ponty_material_max gold (Ponty sells a whole listing)
	ponty_materials: true, ponty_material_max: 250_000,
	// v24.81: an upgrade step under the odds floor is tried with the next scroll up (the server: x1.2 + 1%, so +4 goes
	// 70% → 85%, +5 60% → 73%) when that scroll costs at most this — scroll1 (40k), never scroll2. Only for pieces an
	// NPC doesn't sell (a shop piece is cheaper to rebuy than to protect).
	upgrade_boost_max: 50_000,
	secondhand_gold_per_pt: 15_000,    // ...and an upgrade may cost at most this per gear point it adds
	// Exchange (exchange_auto): items the exchange NPC (or a quest NPC) opens, once the bags hold G.items[].e of them:
	// boxes, gems, candies, seashells... Copies the guide/quests need and CFG.keep are never exchanged.
	exchange_auto: true,
	exchange_skip: [],         // item names never exchanged
	// --- town / Progression Guide ------------------------------------------------------------------------------------
	// v22.0: the Progression Guide is ignored entirely (false): no guide steps (buys, upgrades, compounds, equips), no
	// guide farm rows or guide quests as goals, nothing held in the bags for it. It chased +7 upgrades of cheap gear
	// and kept the party on low-level farm rows. true restores all of it.
	guide_enabled: false,
	gear: true,                // (guide_enabled) execute Progression Guide steps (upgrade, equip, craft, ...); false = only read it
	guide_interval_ms: 15_000, // re-read the guide every 15s (cheap: no walking)
	guide_steps_per_run: 5,    // guide steps that need walking, per town run (steps done in place don't count)
	town_min_gap_ms: 20_000,   // at least 20s between town runs
	town_hop: true,            // v24.28: start a town run with the town teleport (to this map's spawn) when that cuts the walk
	town_hop_px: 600,          //   by more than this (main from poisio: ~1450px of walking for a 3s channel)
	// v18.7 gold budget: optional spending (upgrade projects, guide buys/upgrades, compounds, crafting, Ponty, elixirs,
	// donations) only while the party's spending over the last window_h stays under share × what it earned (loot,
	// sales). Potions and other necessities are never held back, but they count as spending.
	spend: { enabled: true, window_h: 6, share: 0.9, min_data_h: 1 },
	// a monster hunt is chased only if its monster gives at least this share of the best xp/s we know. 0 = off (v18.8:
	// measured rates include time lost to town trips, so the comparison misjudged fast-killing monsters like bees)
	hunt_min_xp: 0,            // v24.88 (owner: pivot to hunts and quests for upgrades): any hunt is chased (was 0.7 of the best xp/s)          // v23.5: 70% (was off since v18.8, when measured rates still included time lost to town
	                           //   trips; they're kills at the spot now). A hunt's tokens aren't worth a third of our xp.
	report_history_h: 1,       // v22.2: report() includes every character's history() of this many hours (0 = none)
	// game-log lines hidden: heartbeats' "Received a code message from" (v18.4), smart_move's path chatter (v18.5)
	quiet_logs: [/code message from/i, /Searching for a path\.\.\./i, /Path found[!~]/i],
	// v24.20: bigger game panels. log_*: the game log (#gamelog; drag its corner to resize — the size is remembered);
	// status_*: the code runner's box under CODE (our set_message text; the game draws it 128x60 with no drag handle).
	// ui(w, h, font) in the console sets the log's size and font.
	// v24.21: off — enlarging the log in place pushed it under the DOCS panel and moved the tutorial/level bars
	ui: { enabled: false, log_w: 560, log_h: 360, log_font: 15, status_w: 340, status_h: 90, status_font: 14 },
	town_soft_gap_ms: 3_600_000, // a trip only for deferrable work (guide, fetches, upgrades, crafting...) waits 60 min (v24.71: was 20 — the party sits at its camp)
	                           //   after the last run FINISHED, and never turns a walk to the pack around (v18.2)
	town_topup: 0.6,           // v18.2: in town anyway → top potions up to pot_buy once below 60% of it, and bank
	                           //   everything bankable, so the next trip isn't a potion/bag one 10 min later
	walk_timeout_ms: 120_000,  // a smart_move that hasn't arrived in 2 min is cancelled (locked doors, unreachable spots)
	town_hp: 0.7,              // start a town run only above 70% HP...
	town_hp_critical: 0.5,     // ...or above 50% when bags are nearly full (<= 3 free)
	errand_timeout_ms: 300_000, // an errand still running after 5 min is assumed hung; its lock is released
	gold_reserve: 50_000,      // guide steps never spend below this much gold (potions may dip into it)
	min_upgrade_chance: 0.80,  // upgrade only at >= 80% success (the server's own preview); failure destroys the item
	min_compound_chance: 0.80, // same for compounding (failure destroys all three inputs)
	min_chance_rebuyable: 0.2, // items NPCs sell: failure only costs gold, accept the guide's odds down to this
	rebuy_loss_max: 100_000,   // compounds of NPC-sold items take compound_min_chance_rebuyable odds only when the three
	                           //   copies are worth at most this (a +L copy = 3^L base copies; v23.1)
	min_chance_spare: 0.6,     // you hold another copy at that level or higher (bags/worn): a failure costs a spare
	gear_actions: ["equip", "buy", "upgrade", "develop", "compound", "craft", "stat", "exchange", "token", "dismantle", "retrieve", "supplies", "hunt"],
	                           // guide row kinds the bot executes; other kinds are logged once and left to you
	follow_farm_reasons: null, // null = every guide farm row; or e.g. ["material","bees","hunt_farm"]
	guide_farm_max_min: 90,    // a guide farm row naming no material: pause it after 90 min in a row (no way to see
	                           //   progress; longer than quest_stall_min so a row with a material gets checked first)
	guide_farm_min_xp: 0.25,   // skip the guide's farm row while its pack gives < 25% of the best pack's xp/s (outlevelled:
	                           //   e.g. the low-level "bees" row the guide keeps showing a level-50 party)
	// Goal priorities, used solo (highest first) and by a party leader merging everyone's goals (summed per monster).
	// Guide goals rank lowest: the guide is a newbie path and its rows can repeat forever.
	goal_w: { hunt: 4, quest: 3, guide_quest: 2, guide_farm: 1 },
	// --- quests (Cole = "mcollector", witch, ...) ----------------------------------------------------------------------
	quest_crafts: "materials", // own quests: "materials" (recipes made only of materials) | "all" | [recipe ids by priority].
	                           //   Recipes the guide asks for are always included.
	quest_npcs: ["mcollector"], // own (non-guide) quests only from these NPCs (Cole); guide quests from anyone
	quest_craft_max: 1,        // craft each quest recipe at most this many times (remembered across reloads)
	quest_craft_skip: [],      // recipe ids never to craft
	quest_farm: true,          // v24.88 (owner): on again — a quest's materials are farmed (quest_park_h still parks one that would take longer)
	// v24.89 (owner: the farm-time estimates are old and unreliable): no quest is skipped or parked on them any more —
	// quest_farm_max_h / quest_park_h / quest_farm_min_xp off. A material that doesn't drop in quest_stall_min of
	// actual farming still pauses its quest for quest_shelve_h.
	quest_farm_max_h: Infinity,
	quest_park_h: 0,          // v18.1: a quest (guide ones too) that would take > 12h to farm is parked: its materials
	quest_unpark_h: 8,         //   stop being held (they're banked, never sold) until the estimate drops under 8h
	quest_farm_min_xp: 0,    // own quests: skip while that pack gives < 70% of the best pack's xp/s (v23.5: was 25% —
	                           //   the party farmed minimush for Cole's newbie gloves at a fraction of croc's xp)
	quest_stall_min: 60,       // a material that hasn't dropped in 60 min of farming pauses its recipe/row...
	quest_shelve_h: 2,         // ...for 2h, then it's retried (nothing the guide asks for is dropped for good)
	guide_quest_keep_h: 24,    // keep working a guide quest for 24h after the guide last listed it (its HUD shows
	                           //   only a few rows at a time, so a quest can scroll out of view and back)
	// v24.67: hunts are still taken and turned in at Daisy on town trips made for something else — never chased. One
	// whose monster is the camp's completes by itself; monster tokens (the Monster Hunter set pieces) only come this way.
	hunt_passive: true,
	auto_monster_hunt: true,   // v24.88 (owner): on again — hunts are taken and chased (tokens: Hunter set pieces, Concord Mace). The camp
	                           //   moves for a goal only at a camp review, which now also comes a minute after the goal changes
	park_key: null,            // e.g. "P": key toggling park()/resume() (replaces that key's game binding)
	// --- merchant (same script; a merchant-class character named here works for the party instead of fighting) ---------
	merchant: {
		name: "DoWhatNow",
		wear_gear: false,      // v24.7: the merchant doesn't fight: gear it wore (spare jewellery) broke compound sets and did nothing
		sell_dead_compounds: true, // v24.15: sell compound pieces at their ceiling (odds under the floor) that no member wants
		serve_free: 12,        // visit a fighter with fewer free bag slots than this...
		serve_pots: 500,       // ...or fewer potions of either kind than this (v24.12: half of pot_buy; was 80 — fighters
		                       // ran low, walked to town, and the merchant stayed idle)
		pot_carry: 3000,       // most potions of each kind taken out per trip (v24.12: it takes what the fighters are short of
		                       // to reach pot_buy, so one trip tops everyone up; was a fixed 400)
		self_pots: 20,         // potions of each kind the merchant keeps for itself
		wait_ms: 15_000,       // stay with the fighters this long for their items to arrive
		trip_gap_ms: 120_000,  // at most one trip every 2 min
		float: 1_000_000,      // fighters top the merchant's gold up to this (the richest near fighter, every 30 min at most)
		fighter_min_free: 3,   // while the merchant is online, fighters walk to town themselves only below this many free
		fighter_pot_min: 10,   //   slots / potions of either kind (the merchant brings potions and takes loot)
		guide_gap_ms: 1_800_000, // ...and walk to town for guide steps alone at most every 30 min
		// v24.75 (owner): the merchant holding a piece that's an upgrade for a fighter brings the party to town for it —
		// checked from the first tick after loading and on every tick after (a party trip, ahead of work that can wait;
		// one try per piece per collect_retry_min). The merchant then stays in town with it instead of walking out.
		collect: true, collect_retry_min: 30, collect_wait_s: 30,
		// v24.86 (owner: feed the merchant down to each fighter's minimum reserve): was 2M. A fighter keeps this much —
		// an elixir (240k) and its potion bills — and sends the merchant the rest a project asks for, whatever the
		// richest one near can give (it used to send all of it or nothing).
		fund_keep: 500_000,
		// v24.90 (owner): every fighter near the merchant hands it ALL its gold above fund_keep — the
		// merchant runs the upgrades. (It used to top the merchant up to `float` only, from the richest fighter.)
		dump_gold: true,
		mluck_range: 250,      // px; mluck (merchant level 40+) on every fighter in range lacking ours
		// Stand: while idle at home the merchant lists spare valuables for other players (16 trade slots) at
		// markup x item value, cutting the price by cut every cut_every_h unsold, never below floor x value
		// (above the NPC's 0.6x). Worth listing: value >= min_value, gear at +3 or more, a higher grade, or titled.
		// Stand trades also give merchant XP. The stand is closed before every walk (speed 10 while open).
		// Bank housekeeping: when the bank's free slots drop below purge_below of its size, each merchant bank visit
		// pulls up to purge_n of the least valuable items nobody needs; worth >= stand.min_value goes on the stand,
		// the rest is sold to an NPC. Never recipe materials (anyone's quests), exchangeables, tokens, gear a member
		// would wear, compound-set copies, keep or locked items.
		purge_below: 0.1, purge_n: 10,
		// Merrit (Market Parcels): an open stand with a listing, in Mainland's square (x -240..240, y -120..144) or
		// southern aisle (x -88..88, y 144..360), on pavement she can reach, held still for 2 minutes, gets one parcel
		// per account per hour when she walks by. Spacing: > npc_gap px from fixed NPCs, > stand_gap px from other
		// stands, > stand_vgap px vertically from a stand within stand_gap px sideways. A routine supply trip waits
		// until the stand has stood min_stay_ms (urgent ones don't: a fighter under urgent_free slots / urgent_pots).
		merrit: { enabled: true, square: [-240, -120, 240, 144], aisle: [-88, 144, 88, 360], npc_gap: 40, stand_gap: 10,
			stand_vgap: 15, step: 16, min_stay_ms: 150_000, urgent_free: 4, urgent_pots: 30 },
		stand: { enabled: true, min_value: 20_000, markup: 3, floor: 1.5, cut: 0.1, cut_every_h: 12, item: "stand0" },
		// Merchants get no XP from kills; the server's donation handler gives them 3.2-4.8 XP per gold donated (an open
		// stand gives 1% of a level per 3h, negligible). Levels 1→40 take ~3M XP, i.e. ~0.7-1M gold.
		donate: {
			to_level: 40,        // donate until this level (40 = mluck; 30 = massproduction)
			keep: 300_000,       // never below this (potions for the fighters)
			chunk: 1_000_000,    // per donation at most
			per_day: 3_000_000,  // at most this much per 24h
		},
	},
	// --- party (the same script runs on every member) -----------------------------------------------------------------
	// commit_min (v19.3): once the leader heads for a target it keeps it for the walk there + this many minutes of
	// fighting (a boss, an unsafe target or a finished goal still switch at once)
	travel: { cross_map_s: 60, weight_h: 4, turn_walk_max_min: 10, commit_min: 10, stay_min: 20, door_px: 150, safe_routes: true }, // v18.1: walk-time estimates for goal choice;
	// stay_min (v24.9): the stay a spot pick is judged over — its xp/s x stay / (stay + walk)
	party: {
		members: ["Aspernari", "Torlis", "Sanala"], // character names (any number; the game allows up to 9)
		follow: 90,            // px; followers stay within this of the leader (close enough to heal, not in its way)
		follow_far: 500,       // px; farther than this (or another map) → path-find to the leader instead of stepping
		heal_at: 0.75,         // priests heal any member below 75% HP
		heal_bonus: 2.5,       // safety allowance × 2.5 while a priest partner is near (its heals offset damage)
		// The tank decides (v24.50): with a tank (CFG.gear_tank) in the party, only it starts a fight, and only once
		// every online fighter is within engage_px of it. Nobody else touches a monster that has no target.
		tank_first: true,
		// v24.51: one party or nothing. Every member of `members` must be online and alive. If one is offline or dead,
		// the others use the suicide command (free: no XP loss) and wait at the respawn in town, so the party is
		// together again. Low HP changes nothing: a fighter neither flees nor suicides. town_px: how close to
		// main's spawn counts as "in town" (the respawn points are within 700px of it).
		town_px: 1000,
		engage_px: 400,        // v24.50: px; the tank starts a fight only with every online fighter this close to it
		// v24.11: travel as a group. The leader doesn't set off (and stops mid-walk) while a member is over radius px
		// behind, and at the spot doesn't pull until everyone is there (it still fights what attacks it) — members
		// trickled in one by one, the leader first. Members on their own errand,
		// recovering, or already waiting at our spot don't count. A straggler is waited for wait_s at most, then the
		// party goes on for go_s before waiting again.
		group: { enabled: true, radius: 450, wait_s: 45, go_s: 60 },
		wait_radius: 300,      // px; a follower stays on a target within this radius of the leader
		beat_ms: 2000,         // ms between status messages (free in one browser; a small call cost via the server)
		sync_factor: 2,        // partner in town → go too at bag_min_free×2 free slots / pot_min×2 potions (share the trip)
		// Party town trips (v24.28; v24.46: one rule). Together, a fighter going to town tells the others and they all go:
		// each does whatever town work it has, all wait in town for each other (town_wait_s at most) and walk back
		// together. false: off (each goes alone).
		town_together: true, town_join_s: 90, town_wait_s: 240,
		turn_min: 15,          // with no mutual goal, the leader alternates 15-min turns between its goal and its partner's
		mutual_max_h: 6,       // a goal counts toward "mutual" only if it would finish within 6h
		// gold balance: if the poorer member has < min_ratio of the richer's gold, the richer sends give × its gold.
		// Only when the richer has >= min_rich; at most once per every_h hours in either direction (shared, persisted).
		// After one transfer the poorer has ~20% of the richer's gold, so the 10% trigger can't fire back.
		gold: { enabled: true, min_ratio: 0.10, give: 0.15, min_rich: 1_000_000, every_h: 3 },
	},
};
code_settings.show_smart_move_text = false; // hide smart_move's "Path found!" chatter in the game log

const RANGED = ["ranger", "mage", "priest"].includes(character.ctype); // classes that can kite (attack from range)
// Item types that are equipment (sellable as junk, bankable as spares)
const GEAR = new Set(["weapon", "shield", "helmet", "chest", "pants", "gloves", "shoes", "cape", "ring", "earring", "amulet", "belt", "orb", "source", "quiver", "misc_offhand"]);
// Item types the exchange task may open (boxes, chests, gems); quest items with an exchange are left to the player
const EXCHANGE_TYPES = new Set(["box", "chest", "gem"]);
let recipe_input_set = null; // every item any recipe uses (anyone's quests and crafts)
function recipe_input(name) {
	if (!recipe_input_set) { recipe_input_set = new Set(); for (const id in G.craft || {}) for (const [, n] of G.craft[id].items || []) recipe_input_set.add(n); }
	return recipe_input_set.has(name);
}
// Failures that say nothing about the item or goal (walks, distance, timing, bank, money): retry soon instead of
// pausing for hours. Everything else (low odds, not combinable, invalid...) is a real verdict.
const TRANSIENT = new Set(["interrupted", "walk_timeout", "timeout", "distance", "bank_not_loaded", "no_space", "gold_reserve",
	"buy_cost", "scroll_missing", "no_scroll", "inputs_not_ready", "player_gone", "cant_in_bank", "no_mp", "not_found", "failed", "fleeing", "bank_busy"]);
const pause_ms = (e, long) => (TRANSIENT.has(why(e)) ? 600_000 : long);
const BAG_TYPES = new Set(["pot", "elixir", "uscroll", "cscroll", "pscroll", "offering", "stand", "tool", "tracker", "token", "misc", "throw",
	"booster", "skill_item", "bank_key", "spawner", "placeholder", "computer"]);

// Log colours (game_log's second argument)
const C = {
	info: "#67A464", // green: decisions (where to fight, quests, party)
	ok: "#58D685",   // bright green: something succeeded (craft, upgrade OK, banked)
	bad: "#E25C5C",  // red: failures and problems needing attention
	warn: "#E2A05C", // orange: waiting/blocked
	gold: "#FFD700", // gold transfers
	note: "#9BD",    // report()/why_not() output
	dim: "gray",     // routine detail
	title: "#FFF",   // report() heading
};
// The server disconnects a client whose call cost exceeds 200 per rolling 4s (BUDGET below keeps us under 110).
// Each kind of call may only use the budget while at least this much headroom would remain, so routine work can
// never crowd out what matters: attacks need none, potions/regen 10, skills 15, moves and errand calls 30,
// chests and bulk bank/sell calls 40.
const RESERVE = { attack: 0, potion: 10, skill: 15, move: 30, errand: 30, loot: 40, bulk: 40, chat: 30 };
const NPC_STAND_Y = 30; // walk to 30px below an NPC: its own tile is often blocked, and every NPC action allows 400px
const PACE_MS = 150;    // pause between consecutive bulk calls (selling, banking) so their acks don't pile up

// Runtime state. Fields marked (saved) persist across code reloads via save_state()/load_state().
const state = {
	pack: null,              // where we fight: { mtype, map, boundary, count, est, score, directive? }
	travel_off: [],          // v24.27: worn pieces taken off for a long walk: [{ slot, name, level, p, stat_type, speed, fails? }]
	safe: {},                // monster id -> { ttk, xp } for every type that passed the safety check at the last pick
	waypoints: [], wp: 0,    // patrol route through the pack (3x3 grid) and the current index
	last_pick: 0,            // when pick_pack last ran (0 forces a re-pick)
	last_target_at: Date.now(), // last time we had something to fight (idle detection)
	best_score: 0,           // best free-choice pack's xp/s (reference for quest opportunity cost)
	cooldown: {},            // pack key -> until (saved)
	measured: {},            // pack key -> measured xp/s with the party there (together), averaged (saved)
	meas_at: {},             // "p:" + pack key -> when that measurement was last updated (v24.3, saved)
	realism: 1,              // measured ÷ estimated xp/s, averaged; scales estimates of unvisited packs (saved)
	danger: {},              // monster id -> incident multiplier: × 0.6 per death, × 0.8 per flee; fades back to 1 (saved)
	danger_at: {},           // monster id -> last death/flee (fading pauses for an hour after one) (saved)
	calib: {},               // monster id -> { ratio, n, act, pred }: actual ÷ predicted damage per fight (EMA) (saved)
	calib_all: { ratio: 1, n: 0 }, // the same over every monster: the default for monsters with few fights (saved)
	session: null,           // current xp measurement: { key, est, xp, start }
	bad_ids: {},             // entity id -> until: targets that took no damage (immune/healing)
	prog: null,              // { id, hp, t }: damage progress on the current target
	errand: null, errand_at: 0, errand_token: null, // running errand name, start time, and identity token
	last_town: 0,            // when the last town run started (saved)
	town_end_at: Date.now(), // when the last town run finished (saved); a fresh start counts as one, so deferrable
	                         //   work waits town_soft_gap_ms after loading instead of triggering a trip at once
	recovering: false, fled: false, // low-HP recovery in progress; use_town sent
	parked: false, park_home: false, // park() active; the trip to town has been started
	directive: null,         // farm instruction overriding the xp/s choice: { monster, map, boundary, count, reason, until }
	guide: null,             // last get_progression() result
	guide_farm: null,        // the guide's current farm row, normalised
	last_guide: 0,           // when the guide was last read
	needs: new Map(),        // item name -> copies to keep in bags (guide steps + open quests)
	gear_skip: {},           // key -> until: paused guide rows ("upgrade:..."), quests ("qc:id"), town tasks (saved)
	crafted: {},             // recipe id -> times crafted (saved)
	fetched: {},             // item -> when it was last taken out of the bank; not banked again for 1h (saved)
	fetch_try: {},           // item -> last fetch attempt; at most one per 2h (saved)
	bank_seen: {},           // item -> quantity at the last bank visit (bank contents are only visible inside) (saved)
	guide_ignore: {},        // "monster:map" -> until: paused guide farm rows (saved)
	bank_gear: [],           // gear seen in the bank at the last visit: [{ name, level, p, stat_type }] (saved, max 400)
	guide_equip: {},         // slot -> when the guide last equipped it (gear_guide_respect_h) (saved)
	gear_sent: {},           // "name:level>member" -> when we last tried to hand it over (retry after 10 min)
	bank_free: null,         // { free, total, at }: bank slots at the last visit (saved)
	hold_for: {},            // must-hold item -> bought for the merchant (hand it over), when (saved)
	row_fails: {},           // guide row id -> consecutive failures (pause backoff) (saved)
	purge: {},               // "name:level" -> when the merchant pulled it from the bank to sell/list (saved)
	mspot: null,             // merchant: the stand spot for Merrit { x, y } (saved)
	stand_since: 0,          // merchant: when the stand was last opened and left still (Merrit's 2-minute timer)
	parcel_at: 0,            // merchant: when the last Market Parcel arrived (saved)
	stand: {},               // merchant listings: trade slot -> { name, level, q, price, value, at, cut_at } (saved)
	upg: null,               // upgrade project { name, to, for, slot, gain, cost, spent_from } (saved)
	upg_caps: {},            // item -> { level, at }: the level a project reached before odds/failures stopped it (v24.5, saved)
	cmp_caps: {},            // item -> { level, at }: copies at this level won't be compounded (odds under the floor; v24.15, saved)
	probe: null,             // running probe { mtype, start, until, ratio, prof }
	probe_at: 0,             // last time a probe was considered (every_min)
	probe_ok: {},            // mtype -> { mult, at }: a probe held; the party verdict for it is widened by mult for 24h (v24.6, saved)
	pick_skips: {},          // pack key -> why the last pick skipped it as dangerous (v24.10; why_not)
	upg_pick_at: 0,          // last time a project was looked for (every 10 min)
	fund_need: 0,            // merchant: gold its current project step needs from the fighters
	guide_quests: {},        // recipe id -> { first, last } seen in the guide (saved)
	quest_park: {},          // recipe id -> { at, eta }: quests too slow to farm (quest_parked)
	fetch_res: {},           // bank fetch key -> { at, ok | why }: the last attempt (report: why a bank upgrade isn't worn)
	qprog: null, gprog: null, // stall watch for quest materials / guide farm rows: { key, have, t } (saved)
	partners: {},            // party member name -> its last heartbeat + t (when received)
};

// =====================================================================
// Infrastructure: timing, call budget, game-call timeouts, errands
// =====================================================================
const sleep_ms = (ms) => new Promise((r) => setTimeout(r, ms));
// Poll cond every 200ms until it's true (→ true) or ms pass (→ false). Used to wait for server state (bank loaded,
// item arrived) that has no promise of its own.
const until = async (cond, ms) => {
	const end = Date.now() + ms;
	while (!cond()) { if (Date.now() > end) return false; await sleep_ms(200); }
	return true;
};
// The client's promises (push_deferred) never time out: an unanswered call would hang an errand forever. T() rejects
// with {reason: "timeout"} after ms (10s default: a normal reply takes well under 1s). The real call may still land
// later; callers re-resolve inventory slots by name/level, so a late reply is harmless.
function T(p, ms = 10_000) {
	let timer;
	const timeout = new Promise((_, rej) => (timer = setTimeout(() => rej({ reason: "timeout" }), ms)));
	return Promise.race([Promise.resolve(p), timeout]).finally(() => clearTimeout(timer));
}
const why = (e) => e?.reason || e?.response || (typeof e === "string" ? e : JSON.stringify(e)); // error → short text

// Call budget. The server sums each client's call cost over a rolling 4s window and disconnects past 200.
// We meter every packet ourselves and stay under 110 ("soft"), leaving 90 for costs we can't see (server resends).
const BUDGET = { window_ms: 4000, soft: 110 };
// Cost per event as the server charges it: 1 base + its CC table (move +1.5, equip +3, unequip +6) + ~1 for the
// player update it sends back. Anything not listed costs 1.
const EMIT_COST = { move: 2.5, equip: 5, unequip: 8, equip_batch: 6 };
const sent = []; // [timestamp, cost] of every packet in the current window
// Wrap the socket's emit so every packet (ours and the game UI's) is counted. tick() calls this every time: a reconnect
// creates a new socket, and a code reload leaves the previous script's wrapper counting into ITS array (v23.0: before,
// a flag stopped the new script from wrapping, so after any reload only the server's lagging character.cc was seen).
// The wrapper is rebuilt over the original emit whenever it isn't ours. The same hook keeps our kill_credit listener on
// the live socket, replacing the previous script's.
function meter_socket() {
	const s = parent.socket;
	if (!s) return;
	if (s.__xp_meter !== sent) {
		const orig = s.__xp_orig_emit || s.emit;
		s.__xp_orig_emit = orig;
		s.emit = function (ev, ...args) { sent.push([Date.now(), EMIT_COST[ev] || 1]); return orig.call(this, ev, ...args); };
		s.__xp_meter = sent;
	}
	if (typeof s.on === "function" && s.__farmer_kc !== on_kill_credit) {
		if (s.__farmer_kc && typeof s.off === "function") try { s.off("kill_credit", s.__farmer_kc); } catch (e) {}
		s.on("kill_credit", on_kill_credit);
		s.__farmer_kc = on_kill_credit;
	}
}
// Server "kill_credit" { mtype }: sent to every party member for every party kill, wherever they are (and to a solo
// player for its own). Counts the party's kills for pack measurements (together) and the watchdog (v23.0).
function on_kill_credit(d) {
	seen.kc = (seen.kc || 0) + 1;
	const xp = (d?.mtype && G.monsters[d.mtype]?.xp) || 0;
	if (state.session) { state.session.kc = (state.session.kc || 0) + xp; state.session.kc_n = (state.session.kc_n || 0) + 1; }
}
function spent() {
	const cut = Date.now() - BUDGET.window_ms;
	while (sent.length && sent[0][0] < cut) sent.shift();
	let c = 0;
	for (const x of sent) c += x[1];
	return Math.max(c, +character.cc || 0); // character.cc = the server's own running total (lags one update)
}
// May a call of this cost go out now, keeping `reserve` (see RESERVE) free for higher-priority calls?
const can_spend = (cost, reserve) => spent() + cost <= BUDGET.soft - reserve;
// Errands await budget instead of skipping: re-check every 250ms (the window slides continuously)
async function wait_budget(cost, reserve) { while (!can_spend(cost, reserve)) await sleep_ms(250); }

// Every walk has a deadline: the game's pathfinder retries a locked door ("The door is locked!" → "Lost the path"
// → "Path found!") forever, which would hang an errand (e.g. in front of the locked bank_b door).
let smart_depth = 0; // number of go() walks in flight; > 0 means "walking" (nothing else may steer)
// v24.27: the walk in flight, for travel gear: long = another map, a named place we can't place, or > travel_gear.min_px
const trip = { long: false, end: 0 };
// Where smart_move would take a destination (its own table for named places), or null if we can't tell
function dest_point(dest) {
	if (dest && typeof dest === "object" && Number.isFinite(dest.x)) return { map: dest.map || character.map, x: dest.x, y: dest.y };
	let name = typeof dest === "string" ? dest : dest?.to || dest?.map;
	if (!name || G.monsters[name]) return null;
	if (name === "town") name = "main";
	if (G.maps[name]?.spawns?.[0]) return { map: name, x: G.maps[name].spawns[0][0], y: G.maps[name].spawns[0][1] };
	if (name === "upgrade" || name === "compound") return { map: "main", x: -204, y: -129 };
	if (name === "exchange") return { map: "main", x: -26, y: -432 };
	if (name === "potions") return character.map === "halloween" ? { map: "halloween", x: 149, y: -182 }
		: ["winterland", "winter_inn", "winter_cave"].includes(character.map) ? { map: "winter_inn", x: -84, y: -173 } : { map: "main", x: 56, y: -122 };
	if (name === "scrolls") return { map: "main", x: -465, y: -71 };
	const n = typeof find_npc === "function" ? find_npc(name) : null;
	return n && n.map ? { map: n.map, x: n.x, y: n.y } : null;
}
// v24.17: every walk (pack travel, town and bank trips, merchant deliveries, followers) goes the safe way: if smart_move's
// way crosses a map with an aggressive monster we can't take on or outrun (vampire rats in level1), walk the shortest
// way around it leg by leg — through doors, and the transporter where it's on that way; no way around: don't go
async function go(dest, ms = CFG.walk_timeout_ms) {
	{
		// v24.39: the whole walk decides, not each leg. A trip to town by the transporter is three short legs (to the
		// transporter, through it, to the NPC): judged leg by leg none was "long", and the gear stayed on all the way.
		const dp = dest_point(dest);
		trip.long = !dp || dp.map !== character.map || Math.hypot(dp.x - character.x, dp.y - character.y) > CFG.travel_gear.min_px;
	}
	try { return await go_route(dest, ms); }
	finally { if (errand_busy() && state.travel_off.length) await travel_restore("arrived").catch(() => {}); } // v24.27
}
async function go_route(dest, ms, tele_tried = false) {
	if (state.recovering) throw { reason: "fleeing" };
	const T_ = CFG.travel.safe_routes && G.maps[character.map]?.doors ? dest_point(dest) : null;
	if (T_ && T_.map !== character.map) {
		// v24.59: a follower doesn't judge the way (its own verdict made it detour, refuse, or teleport while the tank
		// walked on): it takes the shortest way, the transporter where that uses one
		let pl = is_follower() ? route_plain(T_.map, T_.x, T_.y) : route_plan(T_.map, T_.x, T_.y);
		if (pl?.danger) {
			if (Date.now() - (state.deadly_log_at || 0) > 60_000) { state.deadly_log_at = Date.now(); game_log(`walk to ${T_.map}: every way passes ${pl.danger} — not going`, C.warn); }
			state.walk_refused = { to: T_.map, why: pl.danger, at: Date.now() };
			throw { reason: "deadly_route", why: pl.danger };
		}
		if (pl?.legs?.length) {
			game_log(`walk to ${T_.map}: ${pl.around ? "around " + pl.around : "by the transporter"} (${pl.legs.map((l) => (l.kind === "tp" ? "transporter → " : "") + l.to).join(", ")})`, C.dim);
			for (const L of pl.legs) {
				if (character.map !== L.map) break; // moved some other way meanwhile: the last walk below finishes it
				if (L.kind === "tp") {
					await go_transporter(L, ms);
					if (typeof transport === "function") await T(transport(L.to, L.s), 25_000);
				} else await go_raw({ map: L.to, x: L.tx, y: L.ty }, ms);
			}
		}
	}
	return go_raw(dest, ms);
}
// v24.41: walk to a transporter. The ground nearest one can be 50-60px from the NPC (desertland: nothing walkable within
// 55px; winterland 48px — measured on the map geometry), so the pathfinder finds no way to the NPC's own point or just
// below it ("Path not found!", twice, and the party stood at desertland's door). The server lets us use it from 160px
// (B.transporter_dist): try points 65px out — below, right, left, the diagonals — then the old ones; the one that
// worked on a map is tried first next time.
const TP_SPOTS = [[0, 65], [65, 0], [-65, 0], [46, 46], [-46, 46], [0, -65], [0, 30], [0, 0]];
const tp_spot = {}; // map -> index into TP_SPOTS that worked
async function go_transporter(L, ms) {
	const order = [...new Set([tp_spot[L.map] ?? 0, ...TP_SPOTS.keys()])];
	let err = null;
	for (const i of order) {
		// in reach already (160px on the server; 120 leaves room for lag)
		if (character.map === L.map && Math.hypot(character.x - L.x, character.y - L.y) < 120) return;
		try { await go_raw({ map: L.map, x: L.x + TP_SPOTS[i][0], y: L.y + TP_SPOTS[i][1] }, ms); tp_spot[L.map] = i; return; }
		catch (e) { err = e; if (e?.reason !== "failed") throw e; } // "failed" = no path to that point: try the next
	}
	throw err || { reason: "failed" };
}
async function go_raw(dest, ms = CFG.walk_timeout_ms) {
	// v24.8: no walks while fleeing — an errand's next step started one each time recover() stopped the last, and moving
	// cancelled the town channel until the errand ran out of steps
	if (state.recovering) throw { reason: "fleeing" };
	smart_depth++;
	let timer, timed_out = false;
	try {
		return await Promise.race([smart_move(dest), new Promise((_, rej) => (timer = setTimeout(() => {
			timed_out = true;
			halt("go_raw");
			rej({ reason: "walk_timeout", dest: typeof dest === "string" ? dest : dest.map });
		}, ms)))]);
	} catch (e) {
		// v24.8: stop("smart") rejects the walk with "interrupted" first, which won the race: a timeout looked like an interruption
		if (timed_out) throw { reason: "walk_timeout", dest: typeof dest === "string" ? dest : dest.map };
		throw e;
	} finally { clearTimeout(timer); smart_depth--; if (!smart_depth) trip.end = Date.now(); }
}
const walking = () => smart_depth > 0;
// An errand (town run, park) owns NPC visits and pack travel while it runs. A hung one stops counting as busy after
// errand_timeout_ms; its token keeps a late finish from clearing a newer errand's lock.
const errand_busy = () => !!state.errand && Date.now() - state.errand_at < CFG.errand_timeout_ms;
function errand(name, fn) {
	if (errand_busy()) return false;
	const token = {};
	Object.assign(state, { errand: name, errand_at: Date.now(), errand_token: token });
	// v24.27: pieces off for travel go back on before the errand touches the bags
	Promise.resolve().then(() => state.travel_off.length && travel_restore("errand").catch(() => {})).then(() => fn()).catch((e) => game_log(`${name}: ${why(e)}`))
		.finally(() => {
			if (state.errand_token !== token) return;
			state.errand = null;
			state.last_target_at = Date.now();
		});
	return true;
}
// Pauses: skip(key, ms, reason) pauses a guide row / quest / town task for ms; skipped(key) tells whether it's paused
const skipped = (key) => (state.gear_skip[key] || 0) > Date.now();
const skip_why = {}; // key -> last reason (shown by report())
const skip = (key, ms, reason) => { if (reason) skip_why[key] = reason; return (state.gear_skip[key] = Date.now() + ms); };

// =====================================================================
// Monster data & the fight model
// =====================================================================
const pack_key = (p) => `${p.map}:${p.boundary.join(",")}`; // identifies a spawn area across reloads
// A spawn area is [x1, y1, x2, y2] with finite numbers and positive size (bad data would crash everything using it)
function valid_boundary(b) {
	return Array.isArray(b) && b.length >= 4 && b.slice(0, 4).every(Number.isFinite) && b[2] > b[0] && b[3] > b[1];
}
// Are we inside the area, allowing `pad` px around it (monsters wander a bit past their spawn box)?
function in_boundary([x1, y1, x2, y2], pad = 150) {
	return character.x > x1 - pad && character.x < x2 + pad && character.y > y1 - pad && character.y < y2 + pad;
}
// Maps we may farm on: not ignored, not an instance (dungeons need keys/parties), not PvP
const map_ok = (name) => { const m = G.maps[name]; return !!m && !m.ignore && !m.instance && !m.pvp && name !== "jail"; }; // v24.20: not jail

// Normal respawning XP mobs only: no dummies, pets, bosses, events, immune/passive specials
function farmable_type(mtype) {
	const m = G.monsters[mtype];
	return !!m && m.xp > 0 && m.hp > 0 && m.attack > 0 && m.respawn > 0 &&
		!(m.special || m.cooperative || m.global || m.unlist || m.immune || m.passive || m.peaceful || m.stationary || m.cute);
}
function farmable_entity(e) {
	return e && e.type === "monster" && e.visible && !e.dead && !e.npc && !e.immune && !e.peaceful &&
		farmable_type(e.mtype) && !((state.bad_ids[e.id] || 0) > Date.now());
}

// Server complete_attack(): hit = attack · damage_multiplier(defense − pierce); 1hp targets take 1;
// evasion (physical) / avoidance miss; reflection bounces magic; dreturn hits melee; lifesteal/self_healing heal.
// team: who the fight is judged with. "party" (v24.35, the default): the members travelling with us wherever they are
// right now (not on an errand) — nobody fights alone. "all" (v23.1): every online member wherever it is — planning
// something the whole party gathers for (a boss). Outside a party (the merchant): whoever is near.
const fight_mates = (team = "party") => (team === "all" ? partners() : in_party_cfg() ? partners().filter((p) => !p.errand && !p.recovering) : partners_near());
function fight_math(m, use_tank = true, team = "party") {
	const mates = fight_mates(team);
	// defence → damage fraction: the game's own curve if available, else ~0.1% less per point, floored at 5%
	const dm = (d) => (typeof damage_multiplier === "function" ? damage_multiplier(d) : Math.max(0.05, 1 - d / 1000));
	const our_magic = (character.damage_type || G.classes[character.ctype].damage_type) === "magical";
	const pct = (v) => Math.min(1, Math.max(0, (v || 0) / 100)); // game percentages (evasion 25 = 25%) → 0..1
	let hit = character.attack * dm(((our_magic ? m.resistance : m.armor) || 0) - ((our_magic ? character.rpiercing : character.apiercing) || 0));
	hit *= 1 + (m.incdmgamp || 0) / 100;
	if (m["1hp"]) hit = 1; // "1hp" monsters take exactly 1 damage per hit whatever the attack
	const land = (1 - (our_magic ? 0 : pct(m.evasion))) * (1 - pct(m.avoidance));
	const theirs_magic = m.damage_type === "magical";
	const tank = use_tank && !(m.aggro > 0.3) && tank_cover(mates);
	// v24.25: we're the tank (leading, picking for everyone) and it's aggressive: it goes for whoever is near, so judge it
	// on the squishiest member counted, not on our armour
	const squish = !tank && m.aggro > 0.3 && CFG.gear_tank.includes(character.ctype) && mates.length
		? mates.filter((p) => p.max_hp > 0).sort((a, b) => a.max_hp - b.max_hp)[0] : null;
	const D = tank || (squish && squish.max_hp < character.max_hp ? squish : null) || character; // who the monster will be hitting
	const their_hit = (m.attack || 0) * dm(((theirs_magic ? D.resistance : D.armor) || 0) - ((theirs_magic ? m.rpiercing : m.apiercing) || 0));
	const their_dps = their_hit * (m.frequency || 1);
	const heal_dps = their_dps * (m.lifesteal || 0) / 100 +
		(m.abilities?.self_healing ? m.abilities.self_healing.heal / Math.max(1, m.abilities.self_healing.cooldown / 1000) : 0); // heal per s
	let our_dps = hit * land * character.frequency - heal_dps;
	for (const P of mates) if (P.attack && P.frequency) { // every member counted shoots the same target
		const pmring = P.damage_type === "magical";
		our_dps += P.attack * dm(((pmring ? m.resistance : m.armor) || 0) - ((pmring ? P.rpiercing : P.apiercing) || 0)) * (pmring ? 1 : 1 - pct(m.evasion)) * P.frequency;
	}
	if (!(our_dps > 0)) return null;
	const ttk = (m.hp || m.max_hp) / our_dps;
	const self_dps = (our_magic ? character.attack * character.frequency * pct(m.reflection) : 0) +
		(!our_magic && character.range < 75 ? character.attack * character.frequency * (m.dreturn || 0) / 100 : 0); // the server
		// returns dreturn % of each physical hit to attackers with range < 75 (melee)
	const chase = m.charge || m.speed || 0; // targeted monsters move at charge speed
	const kiteable = RANGED && character.range > (m.range || 0) + CFG.kite_margin && character.speed > chase;
	return { ttk, xp: m.xp, their_dps, self_dps, kiteable: kiteable && !tank, hp_pool: tank ? tank.max_hp : D !== character ? D.max_hp : character.max_hp,
		team, tank: tank ? tank.name : null, mates: mates.length, priest: mates.some((p) => p.ctype === "priest") };
}
const fight_risk = (f) => (f.their_dps / (f.kiteable ? CFG.kite_slack : 1) + f.self_dps) * f.ttk;
// Safety multiplier for a monster: calibration (how its fights went vs the model) × incidents (deaths/flees, fading)
// Calibrated after 20 fights: 1 / ratio, clamped 0.4-1.5 (a monster that hits half as hard as predicted earns ×1.5).
// Fewer fights: the all-monster ratio, more cautiously (0.6-1.2).
// One entry per monster, keyed mtype + "@p" (v24.6 kept party fights apart from solo ones under that suffix; saved
// calibration still applies). A verdict under tank cover uses the tank's own calibration (its heartbeat `calp`): it's
// the one taking the hits — our own fights under cover say nothing and aren't recorded.
const calib_key = (mt) => mt + "@p";
// v24.47: measured damage decides, from the third fight on; the fight model alone is never trusted. The model has
// under-predicted every monster this party fought (actual / predicted: gscorpion 1.3, cgoo 1.8, croc 2.7 — and it
// counts one monster hitting one member, when a spot has several). Before, a monster got no correction until 20
// fights, the correction was clamped, and a new monster was judged on the raw model: that is where the deaths at new
// spots came from.
//  - 3+ fights against it (ours, or under our tank: its own): 1 / (actual / predicted), down to 0.1, up to 1.5
//  - fewer: as bad as the worst monster we have measured, and never better than model_distrust (2x the prediction)
const CALIB_MIN_N = 3;
function calib_factor(mtype, f) {
	const own = (r) => Math.min(1.5, Math.max(0.1, 1 / Math.max(r, 0.1)));
	const tr = f && f.tank ? state.partners[f.tank]?.calp?.[mtype] : 0;
	if (tr > 0) return own(tr);
	const c = state.calib[calib_key(mtype)];
	if (c && c.n >= CALIB_MIN_N) return own(c.ratio);
	let worst = CFG.model_distrust;
	for (const k in state.calib) if (k.endsWith("@p") && state.calib[k].n >= CALIB_MIN_N) worst = Math.max(worst, state.calib[k].ratio);
	return 1 / Math.min(worst, 4);
}
// v24.6: a probe that held (probe_ok, 24h, shared) widens the party verdict for that monster by the risk it held at
const probe_ok_mult = (mtype) => { const o = state.probe_ok[mtype]; return o && Date.now() - o.at < 24 * 3600_000 ? o.mult : 1; };
const danger_of = (mtype, f) => calib_factor(mtype, f) * (state.danger[mtype] || 1) * probe_ok_mult(mtype);
// A priest among the members the verdict counted heals us through it
const heal_mult = (f) => (f.priest ? CFG.party.heal_bonus : 1); // a priest among the members counted (fight_math)
// The safety fraction in force: CFG.safety x the self-tuned multiplier (v23.5), capped at safety_tune.max. The leader
// picks for everyone, so the party's lowest multiplier counts (v23.6: a follower's death reset only its own, and the
// leader kept choosing the spot that killed it).
const safety_now = () => {
	let m = state.safety_mult || 1;
	if (in_party_cfg()) for (const p of partners_any()) if (p.safety_mult > 0) m = Math.min(m, p.safety_mult);
	return Math.min(CFG.safety * m, CFG.safety_tune?.enabled ? CFG.safety_tune.max : CFG.safety);
};
const safe_enough = (f, mtype) => !!f && fight_risk(f) <= (f.hp_pool || character.max_hp) * safety_now() * danger_of(mtype, f) * heal_mult(f);
const tank_hold = { id: null, at: 0 }; // the monster we last told the tank about
// v24.50: the tank decides. Together, with a tank in the party:
//  - only the tank starts a fight: nobody else touches a monster that has no target, wherever the tank is (v24.46 had
//    this only with the tank within reach) — no time limit, no exceptions;
//  - the tank starts one only when the whole party is with it: every online fighter alive, not in town, not fleeing,
//    on its map and within CFG.party.engage_px.
// A monster that already targets one of us may be hit by anyone. fire() enforces both for every attack and skill.
const is_tank_class = (ct) => CFG.gear_tank.includes(ct);
const together_now = () => CFG.party.tank_first && in_party_cfg();
let suicide_at = 0;
// The suicide command: dead at once, no XP loss (server: "harakiri" skips defeated_by_a_monster's 1% of the level),
// respawn in main town after 12s. At most once per 15s.
function suicide(why_) {
	if (character.rip || Date.now() - suicide_at < 15_000 || !parent.socket) return;
	suicide_at = Date.now();
	halt("suicide");
	game_log(`Suicide to regroup in town: ${why_}`, C.warn);
	log_ev("suicide", { why: why_, at: `${state.pack?.mtype || "?"}@${character.map}` });
	parent.socket.emit("harakiri");
}
// The party's tank (the first in the order warrior, paladin; alive and online), or null — never ourselves
function party_tank() {
	if (!together_now() || is_tank_class(character.ctype)) return null;
	return partners_any().find((p) => is_tank_class(p.ctype) && !p.rip) || null;
}
// Who the tank is still waiting for before it may start a fight (names), [] when the party is gathered
function party_missing() {
	// v24.62: a member not heard from (just loaded, or offline) is missing too — the tank used to start fights and
	// pick its camp alone in the seconds before the first heartbeats
	// v24.63: for starting a fight, three missed beats is enough (a disconnected member counted as present for 20s)
	const unheard = in_party_cfg() ? others().filter((n) => !fresh(state.partners[n]) || Date.now() - state.partners[n].t > 3 * CFG.party.beat_ms) : [];
	return unheard.concat(partners_any().filter((q) => q.rip || q.errand || q.recovering || q.map !== character.map ||
		Math.hypot(partner_pos(q).x - character.x, partner_pos(q).y - character.y) > CFG.party.engage_px).map((q) => q.name));
}
function tank_first(t) {
	if (!t || t.type !== "monster" || t.target) return false;
	if (!together_now()) return false;
	if (!is_tank_class(character.ctype)) return true; // not the tank: never the first hit (v24.51: tank alive or not)
	return party_missing().length > 0; // the tank: not before everyone's here
}
function hold_for_tank(t) {
	const tank = party_tank();
	if (!tank || !tank_first(t)) return false;
	if (tank_hold.id !== t.id) {
		tank_hold.id = t.id; tank_hold.at = Date.now();
		if (typeof send_cm === "function") Promise.resolve(send_cm([tank.name], { k: "tgt", id: t.id })).catch(() => {});
	}
	return true;
}
function fight_profile(mtype) {
	if (!farmable_type(mtype)) return null;
	// v24.35: a monster type is judged for the party, not for whoever is within 400px this second. The leader stepped
	// through a door ahead of the others, was "alone" on the far side, found its target unsafe, picked another spot and
	// walked back — at every door.
	const f = fight_math(G.monsters[mtype]);
	return safe_enough(f, mtype) ? { ttk: f.ttk, xp: f.xp } : null;
}
// Live-stat check per entity: monsters level up when left alive, and an elite can be several times stronger than its
// G.monsters entry. Verdicts are cached per entity id and recomputed when its level/HP/attack changes.
const live_cache = new Map(); // entity id -> { key, ok, ttk, xp }; trimmed to 500 entries (oldest first)
function entity_profile(e) {
	const key = `${fight_mates().map((p) => p.name).join()}:${e.level || 1}:${e.max_hp}:${e.attack}`; // re-judged when who counts changes
	const c = live_cache.get(e.id);
	if (c && c.key === key) return c.ok ? c : null;
	const def = G.monsters[e.mtype];
	const live = {};
	for (const k of ["hp", "max_hp", "attack", "frequency", "armor", "resistance", "speed", "xp", "1hp", "level"]) if (e[k] !== undefined) live[k] = e[k];
	const f = def && fight_math({ ...def, ...live, hp: e.max_hp || def.hp, charge: Math.max(def.charge || 0, e.speed || 0) });
	const ok = safe_enough(f, e.mtype);
	const out = { key, ok, ttk: f ? f.ttk : Infinity, xp: e.xp || def?.xp || 0 };
	live_cache.set(e.id, out);
	if (live_cache.size > 500) live_cache.delete(live_cache.keys().next().value);
	return ok ? out : null;
}
function live_ok(e) {
	const f = state.safe[e.mtype];
	if (!f) return null;
	if (f.trusted && !((e.level || 1) > 1)) return f; // guide-judged safe and not levelled up: trust it
	if (f.probe) return f; // probing this monster on purpose
	const lf = entity_profile(e);
	return lf ? { ttk: lf.ttk, xp: lf.xp } : null;
}

// Seconds between respawns, as the server schedules them: respawn + 0..0.9s random (mean +0.45); respawns over 200s
// are instead scaled by 0.72..1.2 (mean ×0.96). "grow" packs refill almost instantly (0.1s here).
function expected_respawn(mtype, pack) {
	if (pack.grow) return 0.1;
	const r = G.monsters[mtype].respawn || 1;
	return r > 200 ? r * 0.96 : r + 0.45;
}
// A map's spawn entry as areas: one boundary, or several ("boundaries", each [map, x1, y1, x2, y2]) with the
// monster count split evenly between them
function pack_areas(name, pack) {
	let areas = [];
	if (pack.boundary) areas = [{ map: name, boundary: pack.boundary, count: pack.count }];
	else if (pack.boundaries) areas = pack.boundaries.map((b) => ({ map: b[0], boundary: b.slice(1, 5), count: pack.count / pack.boundaries.length }));
	return areas.filter((a) => valid_boundary(a.boundary) && map_ok(a.map));
}
function each_area(fn) {
	for (const name in G.maps) {
		if (!map_ok(name)) continue;
		for (const pack of G.maps[name].monsters || []) for (const area of pack_areas(name, pack)) fn(pack, area);
	}
}
// Where to farm a monster: the given boundary if usable; else its spawn area on the requested map (rank +1e6 makes
// any same-map area beat any other), else the area with the most monsters anywhere
// Seconds to walk from here to an area's centre (v18.1): same map → straight line ÷ speed × 1.3 (paths aren't straight);
// another map → CFG.travel.cross_map_s for the transfers + the walk from that map's spawn
// v24.9: maps between two maps (doors, and the town transporter's places as one hop), BFS, cached per start map. A
// flat 60s for any other map made level4 look as near as the next room; unreachable → Infinity
const hops_cache = {}, hops_prev = {};
function map_hops(from, to) {
	if (from === to) return 0;
	let c = hops_cache[from];
	if (!c) {
		c = hops_cache[from] = { [from]: 0 };
		const prev = (hops_prev[from] = {});
		const tp = G.npcs?.transporter?.places ? Object.keys(G.npcs.transporter.places) : [];
		const q = [from];
		while (q.length) {
			const m = q.shift(), d = c[m], M = G.maps[m];
			const next = (M?.doors || []).map((dr) => dr && dr[4]).filter((n) => typeof n === "string");
			if (tp.includes(m)) next.push(...tp);
			for (const n of next) if (G.maps[n] && c[n] === undefined) { c[n] = d + 1; prev[n] = m; q.push(n); }
		}
	}
	return c[to] ?? (G.maps[from]?.doors ? Infinity : 1); // no door data at all (tests, old clients): one hop
}
// v24.16: routes as smart_move walks them — shortest walking distance, doors free (+door_px), the town transporter only
// where its NPC stands — Dijkstra over map spawns, cached per start (map, 200px cell) for 60s. The hop count (v24.9-v24.15)
// predicted other paths than smart_move took: it walked through level1's vampire rats, which killed all three.
const rt_cache = new Map();
function route_graph(map, x, y, safe = false) {
	const key = `${map}:${Math.round(x / 200)}:${Math.round(y / 200)}|${safe ? 1 : 0}`, now = Date.now(), c = rt_cache.get(key);
	if (c && now - c.at < 60_000) return c;
	const dist = { "@": 0 }, prev = {}, via = {}, pos = { "@": { map, x, y } }, done = new Set(), open = ["@"];
	const tp = G.npcs?.transporter?.places || {}, DP = CFG.travel.door_px;
	const in_danger_here = safe && deadly_areas(map).some((z) => Math.hypot(Math.max(0, z.b[0] - x, x - z.b[2]), Math.max(0, z.b[1] - y, y - z.b[3])) < CFG.danger_px);
	const edges = (u) => {
		const p = pos[u], M = G.maps[p.map], out = [];
		const add = (m2, s2, cost, how) => {
			const sp = G.maps[m2]?.spawns?.[s2];
			if (!sp) return;
			// v24.19: safe mode — not along a stretch that passes deadly spawns. Our own first stretch is excepted only when
			// we already stand inside such a spawn's reach (v24.43: it was always excepted — from desertland's transporter the
			// "safe" way to level2s was the walk past the ents)
			if (safe && !(u === "@" && in_danger_here) && seg_danger(p.map, p.x, p.y, how.x, how.y)) return;
			const n = `${m2}#${s2}`;
			pos[n] = pos[n] || { map: m2, x: sp[0], y: sp[1] };
			out.push([n, cost, how]);
		};
		for (const dr of M?.doors || []) {
			if (!dr || typeof dr[4] !== "string" || !map_ok(dr[4]) || /^bank/.test(dr[4]) || dr[7] === "key" || dr[8] === "complicated") continue;
			add(dr[4], dr[5] || 0, Math.hypot(dr[0] - p.x, dr[1] - p.y) + DP, { kind: "door", map: p.map, fx: p.x, fy: p.y, x: dr[0], y: dr[1], to: dr[4], s: dr[5] || 0 });
		}
		for (const npc of M?.npcs || []) if (npc?.id === "transporter" && npc.position)
			for (const pl in tp) if (pl !== p.map && map_ok(pl))
				add(pl, tp[pl], Math.hypot(npc.position[0] - p.x, npc.position[1] - p.y) + DP, { kind: "tp", map: p.map, fx: p.x, fy: p.y, x: npc.position[0], y: npc.position[1], to: pl, s: tp[pl] });
		return out;
	};
	while (open.length) {
		let bi = 0;
		for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
		const u = open.splice(bi, 1)[0];
		if (done.has(u)) continue;
		done.add(u);
		for (const [v, w, how] of edges(u)) if (dist[v] === undefined || dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; via[v] = how; open.push(v); }
	}
	const r = { at: now, dist, prev, via, pos };
	rt_cache.set(key, r);
	if (rt_cache.size > 40) rt_cache.delete(rt_cache.keys().next().value);
	return r;
}
// { d: px, maps: the maps entered (the destination last), doors } or null (unreachable); from defaults to us
function route_to(to_map, tx, ty, from = { map: character.map, x: character.x, y: character.y }, safe = false) {
	if (to_map === from.map) return { d: Math.hypot(tx - from.x, ty - from.y), maps: [], doors: 0, legs: [] };
	const g = route_graph(from.map, from.x, from.y, safe);
	let best = null;
	for (const n in g.dist) {
		const p = g.pos[n];
		if (p.map !== to_map || (safe && seg_danger(to_map, p.x, p.y, tx, ty))) continue;
		const d = g.dist[n] + Math.hypot(tx - p.x, ty - p.y);
		if (!best || d < best.d) best = { d, n };
	}
	if (!best) return null;
	const maps = [], legs = [];
	let doors = 0;
	for (let n = best.n; n && n !== "@"; n = g.prev[n]) { if (maps[0] !== g.pos[n].map) maps.unshift(g.pos[n].map); legs.unshift({ ...g.via[n], tx: g.pos[n].x, ty: g.pos[n].y }); doors++; }
	return { d: best.d, maps, doors, legs, last: g.pos[best.n] };
}
// v24.19: spawns of aggressive monsters we can't take on and can't outrun, per map (cached 60s). v24.17 judged whole maps:
// main's hawks (charge 52, faster than the priest) made all of main deadly for her — the bank's only door leads into main,
// so she stood in the bank. Now a route is judged by the stretches it walks (straight lines between doors, a little off
// smart_move's own) and how close they come to those spawns.
const dz_cache = new Map();
function deadly_areas(map) {
	const v = character.speed || 55, now = Date.now(), c = dz_cache.get(map);
	if (c && now - c.at < 60_000 && c.v === v) return c.list;
	const list = [];
	for (const [pk, a] of map_areas(map)) { const t = pk.type; if (valid_boundary(a.boundary) && no_go(t, v)) list.push({ t, b: a.boundary }); }
	dz_cache.set(map, { at: now, v, list });
	return list;
}
// v24.43: the way a walk really goes on a map: the shortest path over its walkable ground (G.geometry: wall lines),
// on a 16px grid — [[x, y], ...] or null (no geometry, or no way). One flood fill per start point (to 32px) is kept and
// serves every target: the walls don't change. Measured on desertland: from its transporter to the level2s door the straight line stays 507px from the
// ents' spawn, the walk passes at 288px — five deaths to ents in ten minutes on a way the straight line called safe.
const walk_trees = new Map(); // "map:x,y" (start, to 32px) -> Map of "x,y" -> the cell before it: one flood fill serves every target
function walk_tree(map, x1, y1) {
	const g = G.geometry?.[map];
	if (!g?.x_lines || !g.y_lines) return null;
	const S = 16, sx = Math.round(x1 / 32) * 32, sy = Math.round(y1 / 32) * 32, key = `${map}:${sx},${sy}`;
	if (walk_trees.has(key)) return walk_trees.get(key);
	// a step along one axis from a to b at the other coordinate `at`: does it cross a wall line? (lines are sorted)
	const cut = (lines, a, b, at) => {
		const lo = Math.min(a, b), hi = Math.max(a, b);
		let i = 0, j = lines.length;
		while (i < j) { const m = (i + j) >> 1; if (lines[m][0] < lo) i = m + 1; else j = m; } // first line at or past lo
		for (; i < lines.length && lines[i][0] <= hi; i++) if (at >= lines[i][1] && at <= lines[i][2]) return true;
		return false;
	};
	const prev = new Map([[sx + "," + sy, null]]), queue = [[sx, sy]];
	for (let i = 0; i < queue.length && queue.length < 60_000; i++) {
		const [x, y] = queue[i];
		for (const [dx, dy] of [[S, 0], [-S, 0], [0, S], [0, -S]]) {
			const nx = x + dx, ny = y + dy, k = nx + "," + ny;
			if (nx < g.min_x || nx > g.max_x || ny < g.min_y || ny > g.max_y || prev.has(k)) continue;
			if (dx ? cut(g.x_lines, x, nx, y) : cut(g.y_lines, y, ny, x)) continue;
			prev.set(k, [x, y]); queue.push([nx, ny]);
		}
	}
	if (walk_trees.size >= 24) walk_trees.delete(walk_trees.keys().next().value);
	walk_trees.set(key, prev);
	return prev;
}
function walk_path(map, x1, y1, x2, y2) {
	const prev = walk_tree(map, x1, y1);
	if (!prev) return null;
	// the reached cell nearest the target (cells sit on the start's 16px grid), within 96px of it (a transporter can
	// stand 55px from the nearest walkable ground)
	const S = 16, sx = Math.round(x1 / 32) * 32, sy = Math.round(y1 / 32) * 32;
	const tx = sx + Math.round((x2 - sx) / S) * S, ty = sy + Math.round((y2 - sy) / S) * S;
	let end = null;
	for (let r = 0; r <= 6 && !end; r++) for (let dx = -r; dx <= r && !end; dx++) for (let dy = -r; dy <= r && !end; dy++)
		if (Math.max(Math.abs(dx), Math.abs(dy)) === r && prev.has(`${tx + dx * S},${ty + dy * S}`)) end = [tx + dx * S, ty + dy * S];
	if (!end) return null;
	const out = [];
	for (let c = end; c; c = prev.get(c[0] + "," + c[1])) out.push(c);
	return out.reverse();
}
// "mt @ map" if the walk from (x1,y1) to (x2,y2) on a map passes within danger_px of such a spawn: along the real path
// (walk_path), or the straight line sampled every 40px where the map has no geometry
function seg_danger(map, x1, y1, x2, y2) {
	const zs = deadly_areas(map);
	if (!zs.length) return null;
	// only where a detour could matter: a spawn within danger_px of the stretch's box grown by 500px (the walk bends
	// round cliffs and water, but not across the map); elsewhere the straight line will do, and costs nothing
	const lo_x = Math.min(x1, x2) - 500, hi_x = Math.max(x1, x2) + 500, lo_y = Math.min(y1, y2) - 500, hi_y = Math.max(y1, y2) + 500;
	const close = zs.some((z) => Math.hypot(Math.max(0, z.b[0] - hi_x, lo_x - z.b[2]), Math.max(0, z.b[1] - hi_y, lo_y - z.b[3])) < CFG.danger_px);
	let pts = close ? walk_path(map, x1, y1, x2, y2) : null;
	if (!pts) {
		const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 40));
		pts = Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
	}
	for (const z of zs) for (const [x, y] of pts)
		if (Math.hypot(Math.max(0, z.b[0] - x, x - z.b[2]), Math.max(0, z.b[1] - y, y - z.b[3])) < CFG.danger_px) return `${z.t} @ ${map}`;
	return null;
}
// The way smart_move would walk, or if that passes deadly spawns, the shortest way around them: { d, legs, danger,
// around } — danger set only when there's no safe way at all
function route_plain(to_map, tx, ty) {
	const r = route_to(to_map, tx, ty);
	return r ? { d: r.d, legs: r.legs.some((l) => l.kind === "tp") ? r.legs : null, danger: null, around: null } : null;
}
function route_plan(to_map, tx, ty, from = { map: character.map, x: character.x, y: character.y }) {
	const r = route_to(to_map, tx, ty, from);
	if (!r) return null;
	let why = null;
	for (const L of r.legs) if (L.fx !== undefined && (why = seg_danger(L.map, L.fx, L.fy, L.x, L.y))) break;
	if (!why && r.last) why = seg_danger(to_map, r.last.x, r.last.y, tx, ty);
	// v24.34: a safe shortest way that uses the transporter is walked leg by leg too. smart_move only takes the
	// transporter when its own path passes the NPC, so from desertland it went by the door instead (level2s → level2 →
	// level1's prats); in level2s the plan said "back to desertland, transporter", and in desertland smart_move left by
	// the door again — the party walked in and out of that door.
	if (!why) return { d: r.d, legs: r.legs.some((l) => l.kind === "tp") ? r.legs : null, danger: null, around: null };
	const s = route_to(to_map, tx, ty, from, true);
	return s ? { d: s.d, legs: s.legs, danger: null, around: why } : { d: r.d, legs: null, danger: why, around: null };
}
// ---- Dangerous neighbours (v24.10) ----
// Aggressive monsters (aggro or rage >= 0.5: they come at anyone near) that we can't take on. In the first v24.9 run,
// boars and dark hounds next to winterland's iceroamers and vampire rats on the way through level1 killed Torlis 4 times
// and Sanala once in an hour: the picker only judged the monster it farmed.
// v24.43: a monster that tangles (ent: "mtangle"; server: a tangled player moves at 24 at most) chases at its charge
// speed against our 24 — an ent's 48 looked outrunnable against our 50, and it killed five of us in ten minutes
const chase_speed = (mt) => { const m = G.monsters[mt]; if (!m) return 0; const c = m.charge || m.speed || 0; return m.abilities?.mtangle && c > 24 ? Infinity : c; };
// Its spawn is no place to walk: an aggressive monster (aggro or rage >= 0.5: it comes at anyone near) that we can't
// take on and can't outrun. v24.55: not ents. v24.43 added tanglers with any aggro after five deaths to ents — but
// those began with the party hitting the ent (it was "a monster on a party member", so everyone shot it). Since
// v24.44 nobody attacks a monster the party can't kill, and an ent left alone leaves room to walk past (owner).
// Listing it closed the only way to level2s and the walk from its door.
const no_go = (t, v) => !!G.monsters[t] && aggressive(t) && !state.safe[t] && chase_speed(t) >= v;
const aggressive = (mt) => { const m = G.monsters[mt]; return !!m && ((m.aggro || 0) >= 0.5 || (m.rage || 0) >= 0.5); };
const can_take = (e) => !!(state.safe[e.mtype] ? live_ok(e) : fight_profile(e.mtype));
function map_areas(name) { const out = []; for (const pk of G.maps[name]?.monsters || []) for (const a of pack_areas(name, pk)) out.push([pk, a]); return out; }
// Step away from a monster (it's slower than us): ~120px straight away, or sideways if that's blocked
function step_away(e) {
	if (!e || !Number.isFinite(e.x)) return false;
	const p = best_escape(e, 140);
	return p ? move_to_as("step_away", p.x, p.y, 300) : false;
}
// v24.23: where to move away from a monster: of 12 directions around us, the ones we can walk (and keep walking another
// `step` beyond — not into a dead end), the one ending farthest from it. Straight away and ±45/90° only, a party backed
// against a cliff stood still and face-tanked with open ground beside it; this also slips out sideways or past it.
function best_escape(t, step) {
	const cm = typeof can_move === "function" ? can_move : null;
	let best = null;
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
		const x = character.x + dx * step, y = character.y + dy * step;
		if (!can_move_to(x, y)) continue;
		const open = !cm || cm({ map: character.map, x, y, going_x: x + dx * step, going_y: y + dy * step, base: character.base });
		const v = Math.hypot(x - t.x, y - t.y) + (open ? step : 0);
		if (!best || v > best.v) best = { x, y, v };
	}
	return best;
}
function travel_s(map, boundary) {
	if (!map || !valid_boundary(boundary)) return 0;
	const cx = (boundary[0] + boundary[2]) / 2, cy = (boundary[1] + boundary[3]) / 2, v = Math.max(character.speed || 55, 10);
	if (map === character.map) return (Math.hypot(cx - character.x, cy - character.y) / v) * 1.3;
	if (G.maps[character.map]?.doors) { const r = route_plan(map, cx, cy); return r ? (r.d / v) * 1.3 : Infinity; } // v24.16; v24.17: the way actually walked
	const sp = G.maps[map]?.spawns?.[0] || [0, 0];
	return CFG.travel.cross_map_s * map_hops(character.map, map) + (Math.hypot(cx - sp[0], cy - sp[1]) / v) * 1.3;
}
function resolve_area(monster, map, boundary, count) {
	if (map && G.maps[map] && valid_boundary(boundary)) return { map, boundary: boundary.slice(0, 4), count: count || 1 };
	// v19.1: already at a spawn of this monster → stay (a hunt for the snakes we were farming on main sent the party
	// across maps to halloween's bigger spawn)
	const cur = state.pack;
	if (cur && cur.mtype === monster && (!map || cur.map === map) && valid_boundary(cur.boundary) && G.maps[cur.map])
		return { map: cur.map, boundary: cur.boundary.slice(0, 4), count: cur.count || 1 };
	let best = null;
	each_area((pack, area) => {
		if (pack.type !== monster) return;
		// more monsters, but a minute of walking costs as much as halving the pack
		const rank = (area.map === map ? 1e6 : 0) + area.count / (1 + travel_s(area.map, area.boundary) / 60);
		if (!best || rank > best.rank) best = { ...area, rank };
	});
	return best && { map: best.map, boundary: best.boundary, count: best.count };
}
// Estimated xp/s at an area: xp per kill × kills/s, where kills/s is the lower of how fast we kill (ttk + walking)
// and how fast the area refills (count / respawn). A measured rate replaces the estimate; unmeasured estimates are
// scaled by `realism` (how far off estimates have been elsewhere).
function score_area(t, pack, area) {
	const f = state.safe[t];
	const est = f.xp * Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(t, pack));
	return { est, score: meas_aged(pack_key(area), est * state.realism) };
}
// v24.3: a measurement's weight halves every CFG.meas_half_h hours since it was taken, the rest going to the estimate.
// Rates had no age: one measured in a bad hour (a fighter offline, other players there, several levels ago) kept the
// spot out of every pick for good, since it was never visited again to re-measure it.
function meas_aged(key, est) {
	const v = meas()[key];
	if (v === undefined) return est;
	const at = state.meas_at["p:" + key];
	let w = at && CFG.meas_half_h > 0 ? Math.pow(0.5, Math.max(0, Date.now() - at) / (CFG.meas_half_h * 3600_000)) : 1;
	// v24.84: and as the party has grown stronger since it was measured
	const p0 = state.meas_at["w:" + key];
	if (p0 && p0.lv > 0) {
		const pw = party_power();
		if (pw && CFG.meas_level_half > 0) w *= Math.pow(0.5, Math.max(0, pw.lv - p0.lv) / CFG.meas_level_half);
		if (pw && p0.gs > 0 && CFG.meas_gear_half > 0) w *= Math.pow(0.5, Math.max(0, pw.gs / p0.gs - 1) / CFG.meas_gear_half);
	}
	return v * w + est * (1 - w);
}
// v24.84: the fighters' average level and gear points (us and the partners online; 10s cache)
let pw_cache = null;
function party_power() {
	if (pw_cache && Date.now() - pw_cache.at < 10_000) return pw_cache.v;
	let lv = 0, gs = 0, n = 0;
	const add = (level, w) => { n++; lv += level || 0; for (const x of Object.values(w || {})) if (x > 0 && x < 1e9) gs += x; };
	if (!is_merchant()) add(character.level, my_gear().w);
	for (const p of partners()) if (p.ctype !== "merchant" && p.gear?.w) add(p.level, p.gear.w);
	const v = n ? { lv: +(lv / n).toFixed(2), gs: Math.round(gs / n), n } : null;
	pw_cache = { at: Date.now(), v };
	return v;
}
// Measured xp/s per spot with the party there: base xp of the party's kills at it (kill_credit)
const meas = () => state.measured;

// Best normal spot's xp/s, without being there (for a member that doesn't pick)
function best_score() {
	const prof = {};
	let best = 0;
	each_area((pack, area) => {
		const t = pack.type;
		if (!(t in prof)) { const f = farmable_type(t) && fight_math(G.monsters[t]); prof[t] = f && safe_enough(f, t) ? f : null; }
		const f = prof[t];
		if (!f || (!pack.grow && (expected_respawn(t, pack) > CFG.max_respawn || pack.count < CFG.min_count))) return;
		const est = f.xp * Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(t, pack));
		best = Math.max(best, meas_aged(pack_key(area), est * state.realism));
	});
	return best;
}
// xp/s measurement per pack (feeds the picker)
let xp_prev = { level: character.level, xp: character.xp };
// XP gained since the last call; across a level-up: what was left of the old level + xp into the new one
function xp_delta() {
	let d;
	if (character.level > xp_prev.level) d = G.levels[xp_prev.level] - xp_prev.xp + character.xp;
	else if (character.level < xp_prev.level) d = 0;
	else d = character.xp - xp_prev.xp;
	xp_prev = { level: character.level, xp: character.xp };
	return Math.max(0, d);
}
function end_session() {
	const s = state.session;
	state.session = null;
	if (!s) return;
	const secs = ((s.end || Date.now()) - s.start) / 1000;
	if (secs < CFG.measure_min_s) return;
	// v23.0: the unit score_area estimates in: base xp of the kills made at this spot. The xp we receive is a share of
	// every party kill anywhere (server), so it can't be used: every party kill counts (kill_credit, sent to each
	// member; the party is here). No kill_credit seen at all (an older client?) → spots aren't measured; estimates stand.
	let rate;
	if (s.kc_n > 0) rate = s.kc / secs;
	else { if (s.kx > 0 && !seen.kc) log_error("no kill_credit events: together-mode xp/s not measured"); return; }
	const tab = meas(), prev = tab[s.key];
	// average with the previous measurement — aged (v24.7): averaged raw, a 3-day-old bad rate came back at full weight
	tab[s.key] = prev === undefined ? rate : meas_aged(s.key, rate) * 0.5 + rate * 0.5;
	state.meas_at["p:" + s.key] = Date.now();
	{ const pw = party_power(); if (pw) state.meas_at["w:" + s.key] = { lv: pw.lv, gs: pw.gs }; } // v24.84
	log_ev("rate", { pack: `${s.mtype || "?"}@${s.key.split(":")[0]}`, key: s.key, xp_s: Math.round(rate), secs: Math.round(secs) });
	// slow-moving average of measured ÷ estimate; one sample counts between 0.2x and 5x, the average stays in 0.1-3
	if (s.est > 0) state.realism = Math.min(3, Math.max(0.1, state.realism * 0.7 + Math.min(5, Math.max(0.2, rate / s.est)) * 0.3));
	game_log(`${s.key}: ${rate.toFixed(1)} xp/s over ${secs.toFixed(0)}s`, C.dim);
}
// Every second: count xp toward the current pack's measurement while we're there (300px slack) and not walking or on
// an errand. A measurement closes after 2 × measure_min_s so the picker keeps getting fresh numbers.
// =====================================================================
// History (v15): a persistent event log + hourly buckets, and death/flee post-mortems. Saved under its own key with
// save_state (every 60s and on_destroy). history(h) / deaths(n) print it as copyable text.
// =====================================================================
const LOG_KEY = "farmer_log:" + character.name;
const hist = { ev: [], buckets: {}, dirty: false };
(() => {
	const d = typeof get === "function" ? get(LOG_KEY) : null;
	if (d && d.v === 1) { hist.ev = Array.isArray(d.ev) ? d.ev : []; hist.buckets = d.buckets || {}; }
})();
function log_ev(type, data = {}) {
	hist.ev.push({ t: Date.now(), type, ...data });
	if (hist.ev.length > CFG.history_max) hist.ev.splice(0, hist.ev.length - CFG.history_max);
	hist.dirty = true;
}
log_ev("loaded", { v: VERSION }); // trip/time stats per version count from here
function save_hist() {
	if (!hist.dirty || typeof set !== "function") return;
	const keep = Date.now() - CFG.history_hours * 3600_000;
	for (const k in hist.buckets) if (+k < keep) delete hist.buckets[k];
	if (set(LOG_KEY, { v: 1, ev: hist.ev, buckets: hist.buckets })) hist.dirty = false;
}
const hour_of = (t) => Math.floor(t / 3600_000) * 3600_000;
function bucket(t = Date.now()) {
	const k = hour_of(t);
	return (hist.buckets[k] = hist.buckets[k] || { time: {}, xp: 0, gold: 0, earn: 0, spend: 0, ls: 0, kills: 0, deaths: 0, flees: 0 });
}
// Last 20s, one sample per second (filled by the 1s interval), and hits taken with the attacker's type
const pmring = { ring: [], hits: [] };
const seen = { hit: 0, target_hit: 0, kill: 0, kc: 0, cm: {}, since: Date.now() }; // event counts since load (selftest, watchdog)
if (typeof character.on === "function") {
	character.on("hit", (d) => {
		seen.hit++;
		if (!d || !(d.damage > 0)) return;
		const a = parent.entities?.[d.actor];
		pmring.hits.push({ t: Date.now(), mtype: a?.mtype || (a ? a.ctype || "player" : "?"), dmg: d.damage });
		if (a?.mtype && G.monsters[a.mtype]) cal.cur[a.mtype] = (cal.cur[a.mtype] || 0) + d.damage;
		if (pmring.hits.length > 200) pmring.hits.shift();
	});
	character.on("target_hit", (d) => {
		seen.target_hit++;
		if (!d?.kill) return;
		seen.kill++; bucket().kills++;
		// own kills, valued at the monster's base xp (end_session: kills but no kill_credit events → an error is logged)
		const mt = parent.entities?.[d.target]?.mtype || state.session?.mtype;
		if (state.session && mt && G.monsters[mt]) state.session.kx = (state.session.kx || 0) + (G.monsters[mt].xp || 0);
	});
}
function pm_sample() {
	const t = get_targeted_monster();
	const attackers = Object.values(parent.entities || {}).filter((e) => e.type === "monster" && e.target === character.name)
		.slice(0, 6).map((e) => ({ mtype: e.mtype, hp: e.hp }));
	pmring.ring.push({ t: Date.now(), hp: character.hp, mp: character.mp, target: t ? `${t.mtype}:${t.hp}` : null, attackers });
	if (pmring.ring.length > 20) pmring.ring.shift();
}
// What killed / nearly killed us: damage by attacker type over the last 10s, HP over the last 20s, and what the fight
// model predicted for the main culprit (risk over one kill vs the HP it was judged against)
function postmortem() {
	const now = Date.now(), by = {};
	for (const h of pmring.hits) if (now - h.t < 10_000) by[h.mtype] = (by[h.mtype] || 0) + h.dmg;
	const killer = Object.entries(by).sort((a, b) => b[1] - a[1])[0]?.[0] || state.pack?.mtype || null;
	const f = killer && G.monsters[killer] ? fight_math(G.monsters[killer]) : null;
	return { killer, dmg10: by, hp: pmring.ring.map((r) => r.hp), max_hp: character.max_hp, pack: state.pack?.mtype || null,
		map: character.map, x: Math.round(character.x), y: Math.round(character.y), tank: !!tank_cover(),
		priest: partners_near().some((p) => p.ctype === "priest"), pots: { hp: pot_count("hp"), mp: pot_count("mp") },
		predicted: f ? Math.round(fight_risk(f)) : null, pool: f ? Math.round(f.hp_pool) : null,
		danger: killer ? +danger_of(killer).toFixed(2) : null, last: pmring.ring.slice(-6) };
}
function calib_text(mt) {
	const c = state.calib[calib_key(mt)];
	return c ? `calibration x${calib_factor(mt).toFixed(2)} (predicted ${Math.round(c.pred)}, actual ${Math.round(c.act)} dmg per fight over ${c.n}${c.n < CALIB_MIN_N ? `, needs ${CALIB_MIN_N}: judged as an unknown monster` : ""})`
		: `calibration x${calib_factor(mt).toFixed(2)} (no fights yet: judged as the worst we've measured, at least x${CFG.model_distrust} the prediction)`;
}
// ---- Calibration (v15.1): damage actually taken per fight vs the model's prediction ----
// Hits are summed per attacker type; a fight with type M ends when our target of type M dies or we switch away from
// it, and its damage is compared with fight_risk for M (expected damage over one kill).
const cal = { cur: {}, tgt: null };
function calib_record(mt) {
	const m = G.monsters[mt], f = m && fight_math(m);
	const pred = f ? fight_risk(f) : 0, act = cal.cur[mt] || 0;
	cal.cur[mt] = 0;
	// under tank cover we take little damage by design: such fights say nothing about fighting it without the tank
	if (!(pred > 1) || f.tank) return;
	const r = Math.min(act / pred, 5); // one freak fight can't swing it more than 5x
	const ck = calib_key(mt);
	const c = (state.calib[ck] = state.calib[ck] || { ratio: 1, n: 0, act: 0, pred: 0 });
	const a = c.n < 10 ? 1 / (c.n + 1) : 0.1; // plain average for the first 10, then EMA
	c.ratio += (r - c.ratio) * a; c.act += (act - c.act) * a; c.pred += (pred - c.pred) * a; c.n++;
	const g = state.calib_all, ga = g.n < 50 ? 1 / (g.n + 1) : 0.02;
	g.ratio += (r - g.ratio) * ga; g.n++;
}
function calib_tick() {
	const t = get_targeted_monster(), e = cal.tgt && parent.entities?.[cal.tgt.id];
	if (cal.tgt && (!e || e.dead || !t || t.id !== cal.tgt.id)) { calib_record(cal.tgt.mtype); cal.tgt = null; }
	if (t && t.type === "monster" && G.monsters[t.mtype] && !cal.tgt) cal.tgt = { id: t.id, mtype: t.mtype };
}
// Incidents fade: 10% of the way back to 1 per hour, starting an hour after the last one
setInterval(() => {
	const now = Date.now(), k = 1 - Math.pow(0.9, 1 / 60); // per minute
	for (const mt in state.danger) {
		if (now - (state.danger_at[mt] || 0) < 3600_000) continue;
		state.danger[mt] += (1 - state.danger[mt]) * k;
		if (Math.abs(1 - state.danger[mt]) < 0.01) delete state.danger[mt];
	}
}, 60_000);
function incident(mt, mult) {
	if (!mt || !G.monsters[mt]) return;
	state.danger[mt] = (state.danger[mt] || 1) * mult;
	state.danger_at[mt] = Date.now();
}
// ---- Watchdog (CFG.watchdog) ----
const wd = { pos: [], lost_since: null, acts: [], here_since: null };
function wd_act(kind, note) {
	const now = Date.now();
	wd.acts = wd.acts.filter((t) => now - t.t < 3600_000);
	wd.acts.push({ t: now, kind });
	log_ev("stuck", { kind, note, map: character.map, x: Math.round(character.x), y: Math.round(character.y), pack: state.pack?.mtype || null });
	game_log(`watchdog: ${kind} — ${note}`, C.warn);
}
function watchdog() {
	const W = CFG.watchdog, now = Date.now();
	if (!W?.enabled) return;
	wd.pos.push({ t: now, map: character.map, x: character.x, y: character.y, hits: seen.target_hit, kills: seen.kill, kc: seen.kc || 0 });
	wd.pos = wd.pos.filter((p) => now - p.t <= 15 * 60_000);
	if (character.rip || state.recovering || state.parked || character.map === "bank" || errand_busy() || state.pack?.boss || is_merchant()) {
		wd.lost_since = null;
		wd.pos = wd.pos.slice(-1); // v24.4: the clocks restart after; a town trip + walk back used to count as 10 min without a kill
		return;
	}
	const since = (min) => wd.pos.filter((p) => now - p.t >= min * 60_000).pop(); // the sample ~min minutes ago
	// v23.0: progress is our own fighting, not xp. In a party every member receives xp from every party kill wherever it
	// is (server), so a stuck fighter kept "gaining xp" and frozen/noprog never fired for party members.
	// frozen: no hit landed; noprog: no kill (together: any party kill — kill_credit — since the party shares targets)
	const no_hits = (p) => !!p && seen.target_hit - p.hits <= 0;
	const no_kills = (p) => !!p && (!seen.kc ? seen.kill - p.kills : seen.kc - p.kc) <= 0;
	const still = (p) => !!p && wd.pos.filter((q) => q.t >= p.t).every((q) => q.map === character.map && Math.hypot(q.x - character.x, q.y - character.y) < 20);
	const reset = (p) => { wd.pos = wd.pos.filter((q) => q.t > now - 1000); return p; };
	if (is_follower()) {
		const L = leader_hb(), pos = L && partner_pos(L);
		const away = !!pos && !L.rip && !L.errand && (pos.map !== character.map || Math.hypot(pos.x - character.x, pos.y - character.y) > CFG.party.follow_far) &&
			!(state.follow_block && now - state.follow_block.at < 60_000); // v24.16: held back on purpose (a deadly way), not lost
		wd.lost_since = away ? wd.lost_since || now : null;
		const f = since(W.frozen_min);
		if (still(f) && no_hits(f) && !away) { // a follower glued in place while the leader is near: walk back to it
			reset();
			wd_act("frozen", `follower stuck ${W.frozen_min} min; walking to ${L?.name}`);
			halt("watchdog");
			state.travel_block_until = 0;
		}
		return;
	}
	const f = since(W.frozen_min);
	if (state.pack && still(f) && no_hits(f)) { // no pack = nothing safe to fight: waiting is correct, not a stall
		reset();
		wd_act("frozen", `no movement and no hits for ${W.frozen_min} min${state.pack ? " at " + state.pack.mtype : ""}`);
		halt("watchdog");
		state.travel_block_until = 0;
		if (state.pack) state.cooldown[pack_key(state.pack)] = now + CFG.pack_cooldown_ms;
		state.last_pick = 0;
		return;
	}
	// v24.9: only time at the pack counts — a walk there longer than noprog_min put it on cooldown before we arrived, and
	// the next pick (often as far) went the same way: Torlis walked 93% of an hour, three noprogs at three spots
	const P_ = state.pack, at_pack = !!P_ && character.map === P_.map && in_boundary(P_.boundary, 300);
	if (!at_pack) wd.here_since = null; else if (!wd.here_since) wd.here_since = now;
	const n = since(W.noprog_min);
	if (state.pack && at_pack && n && n.t >= wd.here_since - 31_000 && no_kills(n)) {
		reset();
		const repeat = wd.acts.filter((a) => a.kind === "noprog").length >= 2;
		wd_act("noprog", `no kills for ${W.noprog_min} min at ${state.pack.mtype}${repeat ? "; 3rd time this hour: town first" : ""}`);
		state.cooldown[pack_key(state.pack)] = now + CFG.pack_cooldown_ms;
		state.last_pick = 0;
		if (repeat) halt("watchdog"); // v24.60: no town teleport of the tank's own (it left the party behind)
	}
}
setInterval(() => { try { watchdog(); } catch (e) { log_error("watchdog: " + e); } }, 30_000);
// Where this second went
function time_class() {
	if (character.rip) return "dead";
	if (state.recovering) return "recover";
	if (errand_busy()) return state.errand === "town" ? "town" : "errand";
	if (walking()) return "walk"; // a smart_move: travelling between places
	const t = get_targeted_monster();
	// stepping toward / around a live target (melee approach, kiting, a follower keeping up mid-fight) is fighting
	if (t && !t.dead && Date.now() - (state.last_target_at || 0) < 3000) return "fight";
	if (character.moving) return "walk";
	return "idle";
}
let err_seen = {};
function log_error(msg) {
	const k = String(msg).slice(0, 80);
	if (Date.now() - (err_seen[k] || 0) < 60_000) return;
	err_seen[k] = Date.now();
	log_ev("error", { msg: k });
}
const ago = (t) => { const m = Math.round((Date.now() - t) / 60_000); return m < 60 ? `${m}m` : `${(m / 60).toFixed(1)}h`; };
const sum_obj = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
function last_hour() {
	const now = Date.now(), ev = hist.ev.filter((e) => now - e.t < 3600_000);
	const b = hist.buckets[hour_of(now)] || {}, pb = hist.buckets[hour_of(now) - 3600_000] || {};
	const frac = (now % 3600_000) / 3600_000; // blend the current and previous hour into a trailing 60 min
	return { dead: ev.filter((e) => e.type === "death").length, fled: ev.filter((e) => e.type === "flee").length,
		xph: Math.round((b.xp || 0) + (pb.xp || 0) * (1 - frac)), town: ev.filter((e) => e.type === "town").length };
}
// history(hours): in a party, every character's history in one window (like report()); history(hours, "solo") only ours
function history(hours = 6, solo) {
	const targets = party_names_all().filter((n) => n !== character.name);
	if (solo === "solo" || hours === "solo" || !targets.length || typeof send_cm !== "function")
		return share_text(`history ${character.name}`, history_lines(+hours || 6));
	return party_gather("history", targets, hours, history_lines(hours));
}
function history_lines(hours = 6) {
	const now = Date.now(), from = now - hours * 3600_000, ev = hist.ev.filter((e) => e.t >= from);
	const L = [`— history ${character.name} v${VERSION}, last ${hours}h (${ev.length} events) —`];
	const tot = {};
	const hrs = Object.keys(hist.buckets).map(Number).filter((k) => k + 3600_000 > from).sort((a, b) => b - a);
	// v23.2: a bucket only partly inside the window counts for that part (history(1) used to sum up to 2 hours)
	for (const k of hrs) {
		const end = Math.min(k + 3600_000, now), frac = Math.max(0, end - Math.max(k, from)) / Math.max(1, end - k);
		for (const [c, n] of Object.entries(hist.buckets[k].time)) tot[c] = (tot[c] || 0) + n * frac;
	}
	const T_ = sum_obj(tot) || 1;
	L.push(`time: ${Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${Math.round((n / T_) * 100)}%`).join(", ") || "no data yet"}`);
	L.push("hour   xp      gold    kills deaths flees");
	for (const k of hrs) {
		const b = hist.buckets[k];
		L.push(`${new Date(k).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}  ${fmt_k(Math.round(b.xp)).padEnd(7)} ${fmt_k(Math.round(b.gold)).padEnd(7)} ${String(b.kills).padEnd(5)} ${String(b.deaths).padEnd(6)} ${b.flees}`);
	}
	const rates = {};
	for (const e of ev) if (e.type === "rate") (rates[e.pack] = rates[e.pack] || []).push(e.xp_s);
	const top = Object.entries(rates).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length, v.length]).sort((a, b) => b[1] - a[1]).slice(0, 6);
	L.push(`packs (measured xp/s): ${top.map(([k, r, n]) => `${k} ${r.toFixed(0)} (${n}x)`).join(", ") || "none measured"}`);
	for (const e of ev.filter((x) => x.type === "death" || x.type === "flee").slice(-10))
		L.push(`${e.type.toUpperCase()}${e.unexplained ? " (unexplained: no damage seen" + (e.watched_s !== undefined ? `, script up ${e.watched_s}s` : "") + ")" : ""} ${ago(e.t)} ago: ${e.killer || "?"} @ ${e.map} | hp ${e.hp?.[0] ?? "?"}→${e.hp?.[e.hp.length - 1] ?? "?"}/${e.max_hp} | ` +
			`10s dmg ${Object.entries(e.dmg10 || {}).map(([m, d]) => `${m} ${Math.round(d)}`).join(", ") || "none seen"} | predicted ${e.predicted ?? "?"} of ${e.pool ?? "?"} hp` +
			`${e.tank ? " | tank near" : ""}${e.priest ? " | priest near" : ""} | pots ${e.pots?.hp}/${e.pots?.mp}`);
	const towns = ev.filter((e) => e.type === "town"), why_t = {};
	for (const e of towns) for (const w of (e.due || "").split("+").filter(Boolean)) why_t[w] = (why_t[w] || 0) + 1;
	L.push(`town trips: ${towns.length}${towns.length ? ` (${Object.entries(why_t).map(([w, n]) => `${w} ${n}`).join(", ")}; avg ${Math.round(towns.reduce((a, e) => a + (e.secs || 0), 0) / towns.length)}s)` : ""}`);
	for (const kind of ["upgrade", "compound"]) {
		const xs = ev.filter((e) => e.type === kind);
		if (xs.length) L.push(`${kind}s: ${xs.filter((e) => e.ok).length} ok / ${xs.filter((e) => !e.ok).length} failed — ${xs.slice(-4).map((e) => `${e.item}+${e.from}${e.ok ? "✓" : "✗"}`).join(" ")}`);
	}
	const buys = ev.filter((e) => e.type === "buy");
	if (buys.length) L.push(`buys: ${buys.slice(-6).map((e) => `${e.item} (${e.src}${e.price ? " " + fmt_k(e.price) : ""})`).join(", ")}`);
	const serves = ev.filter((e) => e.type === "serve");
	if (serves.length) L.push(`merchant trips: ${serves.length} — ${serves.slice(-4).map((e) => `${e.who} ${e.secs}s`).join(", ")}`);
	const bosses = ev.filter((e) => e.type === "boss");
	if (bosses.length) L.push(`bosses: ${bosses.slice(-4).map((e) => `${e.name} ${ago(e.t)} ago`).join(", ")}`);
	{ const lg = my_ledger(Math.max(1, Math.ceil(hours))); L.push(`gold ${Math.ceil(hours)}h: earned ${fmt_k(lg.earn)}, spent ${fmt_k(lg.spend)} — ${cats_text(lg.cats)}`); }
	const gold = ev.filter((e) => e.type === "gold");
	if (gold.length) L.push(`gold transfers: ${gold.slice(-4).map((e) => (e.to ? `→${e.to} ` : `←${e.from} `) + fmt_k(e.g)).join(", ")}`);
	const probes = ev.filter((e) => e.type === "probe");
	// v24.51: regroups — the times we used the suicide command, and why
	const sui = ev.filter((e) => e.type === "suicide");
	if (sui.length) L.push(`regroups by suicide: ${sui.length} — ${sui.slice(-5).map((e) => `${ago(e.t)} ago at ${e.at} (${e.why})`).join(" | ")}`);
	// v24.33: where the leader sent us, and why (the last 12 changes of spot, oldest first)
	const spots = ev.filter((e) => e.type === "pack" || e.type === "boss");
	if (spots.length) L.push(`spots (${spots.length} changes): ${spots.slice(-12).map((e) => `${ago(e.t)} ago → ${e.to || e.name} (${e.why || "?"})`).join(" | ")}`);
	if (probes.length) L.push(`probes: ${probes.slice(-6).map((e) => `${e.mtype} ${e.result === "ok" ? "✓" : "✗ " + e.why} (x${e.over} over; calibration ${e.ratio ?? "?"} over ${e.n} fights)`).join(" | ")}`);
	const stuck = ev.filter((e) => e.type === "stuck");
	if (stuck.length) L.push(`watchdog: ${stuck.length} — ${stuck.slice(-5).map((e) => `${e.kind} ${ago(e.t)} ago (${e.note})`).join(" | ")}`);
	const errs = ev.filter((e) => e.type === "error");
	if (errs.length) L.push(`errors: ${errs.slice(-3).map((e) => `${ago(e.t)}: ${e.msg}`).join(" | ")}`);
	return L;
}
function deaths(n = 5) {
	const xs = hist.ev.filter((e) => e.type === "death" || e.type === "flee").slice(-n);
	const L = [`— last ${xs.length} deaths/flees, ${character.name} —`];
	for (const e of xs) {
		L.push(`${e.type.toUpperCase()} ${new Date(e.t).toLocaleString()} @ ${e.map} ${e.x},${e.y} fighting ${e.pack || "?"}; main damage: ${e.killer || "?"}`);
		L.push(`  predicted ${e.predicted ?? "?"} dmg per kill vs ${e.pool ?? "?"} hp (danger x${e.danger ?? 1}); tank ${e.tank ? "yes" : "no"}, priest ${e.priest ? "yes" : "no"}, pots ${e.pots?.hp}/${e.pots?.mp}`);
		L.push(`  damage last 10s: ${Object.entries(e.dmg10 || {}).map(([m, d]) => `${m} ${Math.round(d)}`).join(", ") || "none seen"}`);
		L.push(`  hp, 1/s: ${(e.hp || []).join(" ")}`);
		for (const r of e.last || []) L.push(`  ${new Date(r.t).toLocaleTimeString()} hp ${r.hp} mp ${r.mp} target ${r.target || "-"} attackers ${r.attackers.map((a) => `${a.mtype}(${a.hp})`).join(" ") || "-"}`);
	}
	return share_text(`deaths ${character.name}`, L);
}
// ---- Gold budget (CFG.spend) ----
// Our gross earned/spent over the last window_h (hour buckets), and the party's (heartbeats carry each member's)
// Spending categories (v20.0): a purchase tags the gold that leaves in the next few seconds. Upgrades and compounds
// cost no gold on the server (only their scrolls, tagged "scrolls"), so they aren't tagged (v20.1)
let spend_tag = null; // { cat, until }
const tag_spend = (cat) => (spend_tag = { cat, until: Date.now() + 5000 });
function spend_cat_of(name) {
	const d = G.items[name] || {};
	if (name === CFG.hp_pot || name === CFG.mp_pot || d.type === "pot") return "potions";
	if (["uscroll", "cscroll", "offering", "pscroll"].includes(d.type) || /scroll|offering/.test(name)) return "scrolls";
	if (d.type === "elixir") return "elixirs";
	if (GEAR.has(d.type)) return "gear buys";
	return "other buys";
}
function my_ledger(h = CFG.spend.window_h) {
	const from = hour_of(Date.now()) - (h - 1) * 3600_000, out = { earn: 0, spend: 0, s: 0, cats: {} };
	for (const k in hist.buckets) if (+k >= from) {
		const b = hist.buckets[k];
		out.earn += b.earn || 0; out.spend += b.spend || 0; out.s += b.ls || 0;
		for (const c in b.cats || {}) out.cats[c] = (out.cats[c] || 0) + b.cats[c];
	}
	return out;
}
const cats_text = (cats) => Object.entries(cats || {}).sort((a, b) => b[1] - a[1]).map(([c, g]) => `${c} ${fmt_k(g)}`).join(", ") || "no breakdown: spent before v20.0 recorded categories";
function party_ledger() {
	const L = my_ledger(), out = { ...L, cats: { ...L.cats }, who: [character.name] };
	const seen = new Set([character.name]);
	for (const p of [...partners_any(), ...(merchant_hb() ? [merchant_hb()] : [])]) {
		if (!p || seen.has(p.name) || !p.ledger) continue;
		seen.add(p.name);
		out.earn += p.ledger.earn || 0; out.spend += p.ledger.spend || 0; out.s += p.ledger.s || 0; out.who.push(p.name);
		for (const c in p.ledger.cats || {}) out.cats[c] = (out.cats[c] || 0) + p.ledger.cats[c];
	}
	return out;
}
// Gold optional spending may still use now (Infinity: budget off, or under min_data_h of records)
function gold_room() {
	if (!CFG.spend?.enabled) return Infinity;
	const L = party_ledger();
	if (L.s < CFG.spend.min_data_h * 3600 * L.who.length) return Infinity;
	// v24.82: "other" (gold that left with no tag: the owner's own purchases, trades) isn't the script's spending —
	// 4.5M of it had the budget at zero for six hours and every upgrade waiting
	return Math.floor(CFG.spend.share * L.earn - (L.spend - (L.cats?.other || 0)));
}
// The merchant's optional spending (Ponty, compound scrolls, crafting, upgrade steps) also has to leave it
// merchant.donate.keep (its potion float); nobody refills it, so when it's below that it simply stops buying extras
const gold_ok = (cost) => (cost || 0) <= gold_room() && (!is_merchant() || character.gold - (cost || 0) >= CFG.merchant.donate.keep);
// v18.9: gear names in our bags (heartbeats share them) and whether anyone in the party already holds a piece —
// so tokens/Ponty never buy a copy another character is already carrying (Sanala bought mparmor for Aspernari while
// the merchant held two)
const bag_gear_names = () => [...new Set(character.items.filter((i) => i && GEAR.has(G.items[i.name]?.type)).map((i) => i.name))].slice(0, 40);
// gear name -> highest level in our bags (heartbeats; v23.2: upgrade projects skip pieces someone already has at the target)
const bag_gear_levels = () => { const o = {}; for (const i of character.items) if (i && GEAR.has(G.items[i.name]?.type)) o[i.name] = Math.max(o[i.name] ?? -1, i.level || 0); return o; };
function party_holds_level(name, level, spare_only = false) {
	const M = state.merchant && fresh(state.merchant) ? [state.merchant] : [];
	return [...partners_any(), ...M].some((p) => (p.bag_lv?.[name] ?? -1) >= level || (!spare_only && Object.values(p.worn || {}).some((w) => w?.name === name && (w.level || 0) >= level)));
}
function budget_text() {
	const L = party_ledger(), room = gold_room();
	return `gold budget (${CFG.spend.window_h}h, ${L.who.length} chars): earned ${fmt_k(L.earn)}, spent ${fmt_k(L.spend)} (${cats_text(L.cats)})` +
		(room === Infinity ? " — under an hour of records, no limit yet" : room > 0 ? ` — ${fmt_k(room)} left for upgrades/guide buys/compounds/Ponty` : " — optional spending paused (the script's own spending ≥ 90% of income; \"other\" isn't counted)");
}
// Per-hour rates over the last hour (report, heartbeat): a sample of cumulative xp and gold every minute
// adj = gold moved between our own characters (sent: +, received: −), so transfers don't count as earnings/spending
const stats = { xp: 0, adj: 0, samples: [] };
function rates() {
	const a = stats.samples[0], now = Date.now();
	if (!a || now - a.t < 900_000) return null; // under 15 minutes of data: one sale or purchase would swamp the rate
	const h = (now - a.t) / 3600_000;
	return { xph: Math.round((stats.xp - a.xp) / h), gph: Math.round((character.gold + stats.adj - a.gold) / h), mins: Math.round(h * 60) };
}
const fmt_k = (n) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + "k" : String(n));
let gold_prev = null;
setInterval(() => {
	const d = xp_delta(), p = state.pack;
	stats.xp += d;
	const b = bucket(), cls = time_class();
	b.time[cls] = (b.time[cls] || 0) + 1;
	b.xp += d;
	const g = character.gold + stats.adj;
	if (gold_prev !== null) {
		const dg = g - gold_prev;
		b.gold += dg;
		// gross ledger (transfers between our characters are already out via stats.adj); ls = seconds recorded
		if (dg > 0) b.earn = (b.earn || 0) + dg;
		else if (dg < 0) {
			b.spend = (b.spend || 0) - dg;
			// v20.0: what it went on (the purchase just made tags it; untagged losses count as "other")
			const cat = spend_tag && Date.now() < spend_tag.until ? spend_tag.cat : "other";
			b.cats = b.cats || {};
			b.cats[cat] = (b.cats[cat] || 0) - dg;
		}
		b.ls = (b.ls || 0) + 1;
	}
	gold_prev = g;
	hist.dirty = true;
	if (!character.rip) { pm_sample(); calib_tick(); }
	if (!p || character.rip) return;
	// v24.49: together, a spot's xp/s is only measured while the whole party is at it. Time spent there with a member in
	// town, dead, a map behind or wandering was booked as the spot's rate, and those rates then steered the next pick.
	const all_here = !in_party_cfg() || partners_any().every((q) => !q.rip && !q.errand && !q.recovering && q.map === p.map &&
		Math.hypot(partner_pos(q).x - character.x, partner_pos(q).y - character.y) <= 700);
	const here = character.map === p.map && in_boundary(p.boundary, 300) && all_here;
	if (!state.session && here && !walking() && !errand_busy() && !state.recovering)
		state.session = { key: pack_key(p), mtype: p.mtype, est: p.est, xp: 0, kx: 0, kc: 0, kc_n: 0, start: Date.now() };
	// v24.6: a session ends the moment we leave its spot (town run, event, errand, recovery, a follower's leader moving
	// on): it used to run on, booking the time away (no kills: the rate fell) and kill credits from elsewhere (an event
	// goo's full xp: one put realism at 42), until the 180s close
	const S = state.session;
	if (S) {
		if (!here || walking() || errand_busy() || state.recovering || event_live() || pack_key(p) !== S.key) { S.end = S.last_here || S.start; end_session(); }
		else {
			S.xp += d; S.last_here = Date.now();
			if ((Date.now() - S.start) / 1000 > CFG.measure_min_s * 2) end_session();
		}
	}
}, 1000);

// =====================================================================
// Combat: actions, targeting, movement
// =====================================================================
// One request per skill (or shared cooldown group) at a time: the client's cooldown only updates when the server
// replies, so firing again before that would waste calls. Cleared 100ms after the reply (cooldown display lag),
// or after 3s if the reply never comes.
const inflight = {};
// v24.44: a monster the whole party couldn't kill in hopeless_ttk_s (an ent: 8M HP) is never attacked — not in
// self-defence, not because it's on a partner, not by any skill. Every attack and skill goes through fire(), so the rule
// lives here and nowhere else. Hitting it gains nothing and keeps us there.
const hopeless_c = {};
let boss_type = null; // the boss boss_tick is on (a long fight the party chose)
function hopeless(t) {
	// not what we came for (the spot's own type, a boss), nor an event monster everyone hits together (cooperative)
	if (!t || t.type !== "monster" || !G.monsters[t.mtype] || state.pack?.mtype === t.mtype || boss_type === t.mtype || G.monsters[t.mtype].cooperative) return false;
	const c = hopeless_c[t.mtype], now = Date.now();
	if (c && now - c.at < 30_000) return c.v;
	const f = fight_math(G.monsters[t.mtype]);
	const v = !f || f.ttk > CFG.hopeless_ttk_s;
	hopeless_c[t.mtype] = { at: now, v };
	return v;
}
function fire(skill, target, extra) {
	if (hopeless(target) || tank_first(target)) return false;
	const key = G.skills[skill]?.share || skill;
	if (inflight[key] || is_on_cooldown(skill)) return false;
	const reserve = skill === "attack" ? RESERVE.attack : skill.startsWith("use_") || skill.startsWith("regen_") ? RESERVE.potion : RESERVE.skill;
	if (!can_spend(1, reserve)) return false;
	inflight[key] = true;
	const fallback = setTimeout(() => (inflight[key] = false), 3000);
	const p = skill === "attack" ? attack(target) : skill === "heal" ? heal(target) : use_skill(skill, target, extra);
	Promise.resolve(p).catch(() => {}).finally(() => { clearTimeout(fallback); setTimeout(() => (inflight[key] = false), 100); });
	return true;
}
let last_move = 0;
// Every move costs 2.5 call units: at most one per min_gap ms, and none if we're already heading within 30px of there
// ---- Who moved us (v24.48, refactor step 4a) ----
// Every step (move_to_as), walk (travel_as) and stop of a walk (halt) names the piece of code asking for it. Nothing is
// decided here yet: it is the one place all movement passes through, with a short record of who asked for what — so a
// report can show two owners pulling the character different ways, and so one arbiter can replace them here later.
const mv = { log: [], clash: 0 }; // log: [{ t, who, kind }] of the last minute
function mv_note(who, kind) {
	const now = Date.now(), last = mv.log[mv.log.length - 1];
	// a clash: a different owner steps or stops within 1.5s of another's step or walk
	if (last && last.who !== who && now - last.t < 1500 && !(last.kind === "halt" && kind !== "halt")) mv.clash++;
	if (last && last.who === who && last.kind === kind) { last.t = now; last.n++; } else mv.log.push({ t: now, who, kind, n: 1 });
	while (mv.log.length && now - mv.log[0].t > 60_000) mv.log.shift();
}
function move_to_as(who, x, y, min_gap) { const ok = move_to(x, y, min_gap); if (ok) mv_note(who, "step"); return ok; }
function travel_as(who, dest) { if (!walking() && Date.now() >= (state.travel_block_until || 0)) mv_note(who, "walk"); return travel(dest); }
function halt(who) { mv_note(who, "halt"); try { stop("smart"); } catch (e) {} }
function move_to(x, y, min_gap = 300) {
	if (Date.now() - last_move < min_gap) return false;
	if (character.moving && Math.hypot(character.going_x - x, character.going_y - y) < 30) return false;
	if (!can_spend(EMIT_COST.move, RESERVE.move)) return false;
	last_move = Date.now();
	move(x, y);
	return true;
}
const valid = (e) => e && e.visible && !e.dead && parent.entities[e.id] === e; // still the live, visible entity
function party_names() {
	const n = new Set([character.name]);
	for (const k in get_party() || {}) n.add(k);
	return n;
}
// Self-defence first (monsters hitting us, then a party member); then the pack's own monster type; others only if
// none of the pack's type is in view and they die within max_ttk_s.
// v24.8: the nearest monster attacking us (not one ignored as immune): self-defence comes before the tank's call —
// a mage kept shooting the tank's target, and stepped toward it, while another monster hit it unkited
function hit_on_me() {
	let best = null, bd = Infinity;
	for (const id in parent.entities || {}) {
		const e = parent.entities[id];
		if (!e || e.type !== "monster" || !e.visible || e.dead || e.target !== character.name || (state.bad_ids[e.id] || 0) > Date.now()) continue;
		const d = distance(character, e);
		if (d < bd) (bd = d), (best = e);
	}
	return best;
}
// v24.59: a levelled-up monster of the camp's type is taken as a last resort only if the fight model, on its live
// stats and without the calibration and penalty factors, puts it within grown_over x the party's limit. Eight level-10
// cgoo (the type's level-1 stats had passed) were far beyond that and killed the party.
function grown_ok(e) {
	const def = G.monsters[e.mtype];
	if (!def) return false;
	const live = {};
	for (const k of ["hp", "max_hp", "attack", "frequency", "armor", "resistance", "speed", "level"]) if (e[k] !== undefined) live[k] = e[k];
	const f = fight_math({ ...def, ...live, hp: e.max_hp || def.hp });
	return !!f && fight_risk(f) <= (f.hp_pool || character.max_hp) * CFG.safety * heal_mult(f) * CFG.grown_over; // (v24.64: v24.63's kill-time limit here is gone)
}
// ---- Where the time at the camp goes (v24.65; report line "camp time") ----
// Sampled 4x a second, kept per minute for 10 min. It answers "why is a member idle": nothing alive (respawn), monsters
// alive but the tank's first hit hasn't landed (its walk, its swing, or holding for the party), or a fight is on.
const gaps = { t: 0, min: [] }; // min: [{ m: minute number, by: { kind: ms } }], newest first
function gap_tick() {
	const now = Date.now(), dt = Math.min(now - (gaps.t || now), 1000);
	gaps.t = now;
	const k = dt > 0 ? gap_kind() : null;
	if (!k) return;
	const m = Math.floor(now / 60_000);
	if (gaps.min[0]?.m !== m) { gaps.min.unshift({ m, by: {} }); gaps.min.length = Math.min(gaps.min.length, 10); }
	gaps.min[0].by[k] = (gaps.min[0].by[k] || 0) + dt;
}
function gaps_text() {
	const by = {};
	for (const b of gaps.min) for (const k in b.by) by[k] = (by[k] || 0) + b.by[k];
	const tot = sum_obj(by);
	if (tot < 30_000) return null;
	const pk = state.pack, spawn = pk && (G.maps[pk.map]?.monsters || []).filter((x) => x.type === pk.mtype).reduce((a, x) => a + (x.count || 0), 0), rs = pk && G.monsters[pk.mtype]?.respawn;
	const cap = spawn && rs > 0 ? ` | the map has ${spawn} ${pk.mtype}, respawn ${rs}s: at most ${Math.round(spawn * 3600 / rs)} kills/h for the party` : "";
	return `camp time (${Math.round(tot / 60_000)} min): ` + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / tot * 100)}%`).join(" | ") + cap;
}
function choose_target(local_ok, keep_cur = false) {
	const party = party_names();
	let hitting = null, hd = Infinity;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || !e.visible || e.dead || !e.target || !party.has(e.target)) continue;
		if ((state.bad_ids[e.id] || 0) > Date.now() || hopeless(e)) continue; // v24.44: nothing to gain from an ent
		const d = distance(character, e) - (e.target === character.name ? 10_000 : 0); // ours always before a partner's
		if (d < hd) (hd = d), (hitting = e);
	}
	if (hitting) return hitting;
	// v24.4: targets come from the pack area plus near_pad px only. Anything visible (700px) used to qualify inside the
	// area, but once the chase crossed the 250px margin only attackers did: the leader walked out toward a monster, lost
	// it, walked back, picked it again — without end. keep_cur: outside the margin, a target picked under this rule stays
	const box = state.pack && character.map === state.pack.map && valid_boundary(state.pack.boundary) ? state.pack.boundary : null, P_ = CFG.near_pad;
	const near_box = (e) => !box || in_rect(e.x, e.y, [box[0] - P_, box[1] - P_, box[2] + P_, box[3] + P_]);
	const cur = get_targeted_monster();
	if (!local_ok) return keep_cur && cur && near_box(cur) && farmable_entity(cur) && valid(cur) && !(cur.target && !party.has(cur.target)) && live_ok(cur) ? cur : null;
	const want = state.pack?.mtype;
	let best = null, best_v = 0, best_tier = 2, best_clear = false; // tier 0 = the pack's own monster, 1 = anything else
	let grown = null; // v24.56: the camp's own type, over the per-monster limit (levelled up): the last resort
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (!farmable_entity(e) || !valid(e) || (e.target && !party.has(e.target)) || !near_box(e)) continue;
		const f = live_ok(e);
		if (!f) {
			// lowest level first, then nearest; never one the party couldn't kill at all
			if (e.mtype === want && !hopeless(e) && grown_ok(e) && (!grown || (e.level || 1) < (grown.level || 1) ||
				((e.level || 1) === (grown.level || 1) && distance(character, e) < distance(character, grown)))) grown = e;
			continue;
		}
		// v24.64: the tank starts a fight on its camp's monster only. Another type nearby used to be taken on a
		// projected kill time (max_ttk_s); what attacks a member is fought above, whatever it is.
		if (want && e.mtype !== want) continue;
		const tier = e.mtype === want ? 0 : 1;
		if (tier === 1 && f.ttk * (e.hp / e.max_hp) > CFG.max_ttk_s) continue;
		if (tier > best_tier) continue;
		const walk_s = Math.max(0, distance(character, e) - character.range) / Math.max(character.speed, 1);
		// xp per second of effort (remaining fight + walk + 0.2s turnaround); the current target gets ×1.5 so we
		// finish it instead of flipping between similar targets
		const v = (e.xp || f.xp || 1) / (f.ttk * (e.hp / e.max_hp) + walk_s + 0.2) * (e === cur ? 1.5 : 1);
		// v24.37: a monster with no straight walking line (water, a ledge: level2s' cgoo pool) used to be skipped — with
		// targets all around, the leader found "nothing" and patrolled. In reach already, or with a clear line: first
		// choice; the others are taken when there's none of those (approach path-finds round to them).
		const clear = distance(character, e) <= character.range || can_move_to(e);
		if (tier < best_tier || (clear && !best_clear) || (clear === best_clear && v > best_v)) (best = e), (best_v = v), (best_tier = tier), (best_clear = clear);
	}
	// v24.56 (owner): a camp whose monsters have all levelled up past the limit isn't stood at — the tank works them
	// down, lowest level first, when nothing that passes is there. (The camp was chosen on the type's level-1 stats;
	// Torlis stood among five level 8-9 poisio, "0 attackable".)
	return best || grown;
}
// One distance used by both approach and kite, so they can't push against each other:
//   keep  = the monster's reach + kite_margin (closer than this, it can hit us)
//   reach = 90% of our range (a little inside it, so position jitter doesn't take us out of range)
//   want  = halfway between the two when we can kite (needs a 10px gap and at least its speed), else 80% of our range
function standoff(t) {
	const keep = (G.monsters[t.mtype]?.range || t.range || 0) + CFG.kite_margin;
	const reach = character.range * 0.9;
	const can_kite = RANGED && keep < reach - 10 && character.speed >= (t.speed || 0);
	return { keep, reach, can_kite, want: can_kite ? (keep + reach) / 2 : character.range * 0.8 };
}
// The point `dist` from t on the line t → us, rotated by ang_off radians
function point_at(t, dist, ang_off = 0) {
	const ang = Math.atan2(character.y - t.y, character.x - t.x) + ang_off;
	return { x: t.x + Math.cos(ang) * dist, y: t.y + Math.sin(ang) * dist };
}
function kite(t) {
	const so = standoff(t);
	if (!so.can_kite || t.target !== character.name || distance(character, t) >= so.keep) return false;
	// v24.23: the open direction that ends farthest from it (best_escape), far enough to get back to `want`
	const p = best_escape(t, Math.max(80, so.want - distance(character, t) + 40));
	if (p) { move_to_as("kite", p.x, p.y, 250); return true; } // kiting may re-steer every 250ms
	return false;
}
function approach(t) {
	const so = standoff(t);
	if (distance(character, t) <= so.reach) return;
	const p = point_at(t, so.want);
	if (can_move_to(p.x, p.y)) { approach_path = null; move_to_as("approach", p.x, p.y, 400); } // re-steer at most every 400ms while closing in
	else if (can_move_to(t.x, t.y)) { approach_path = null; move_to_as("approach", t.x, t.y, 400); } // only the standoff point is blocked: straight at it
	// v24.32: a wall between us (a ledge above the monster's pool): walking straight at it ran us into the corner, where we
	// stood for good. Path-find to it; break_walk_for leaves that walk alone until we can reach it or see a clear line.
	else {
		// v24.37: no way round within 10s (an island, the far bank): leave it alone for 2 min
		const now = Date.now(), d = distance(character, t);
		if (approach_try.id !== t.id || d < approach_try.d - 30) approach_try = { id: t.id, at: now, d };
		else if (now - approach_try.at > 10_000) {
			state.bad_ids[t.id] = now + 120_000; approach_path = null;
			return void game_log(`can't get to that ${t.mtype}; leaving it for 2 min`, C.dim);
		}
		approach_path = t.id; travel_as("approach", { map: character.map, x: t.x, y: t.y });
	}
}
let approach_try = { id: null, at: 0, d: 0 };
let approach_path = null; // id of the target we're path-finding around a wall to
async function travel(dest) {
	if (walking() || Date.now() < (state.travel_block_until || 0)) return;
	try { await go(dest); } catch (e) {
		// a failing path must not be retried every tick; an interrupted one (we stopped it to fight, or the watchdog did) isn't
		// failing (v24.4: it was blocked 5s too, standing idle after the kill and undoing the watchdog's reset)
		if (!e || e.reason !== "interrupted") {
			game_log("travel: " + why(e)); state.travel_block_until = Date.now() + 5000;
			// v24.54: no safe way to our own camp — whoever chose it: rest it 30 min and pick again, don't stand and retry
			const P_ = state.pack;
			if (e?.reason === "deadly_route" && P_ && !is_follower() && dest?.map === P_.map) {
				state.cooldown[pack_key(P_)] = Date.now() + 1_800_000;
				if (state.probe?.mtype === P_.mtype) { skip("probe:" + P_.mtype, 6 * 3600_000, "no safe way there"); state.probe = null; }
				game_log(`${P_.mtype} @ ${P_.map}: no safe way there (${e.why || "?"}) — resting it 30 min, picking again`, C.warn);
				state.pack = null; state.last_pick = 0;
			}
			// v24.8: an unreachable waypoint is skipped (it was retried forever, and each failure counted as activity, so
			// the idle give-up never fired)
			const W = state.waypoints, w = W.length ? W[state.wp % W.length] : null;
			if (w && dest && dest.x === w.x && dest.y === w.y) state.wp = (state.wp + 1) % W.length;
			return;
		}
	}
	state.last_target_at = Date.now();
}
function can_use(skill) {
	const s = G.skills[skill];
	return s && character.level >= (s.level || 0) && !is_on_cooldown(skill) && character.mp >= (s.mp || 0);
}
// v24.8: in range for a skill (the server refuses "too_far" without a cooldown, so out of range it was re-sent every reply)
const in_reach = (t, skill) => (typeof is_in_range === "function" ? is_in_range(t, skill) : distance(character, t) <= (G.skills[skill]?.range || character.range));
// Class skills, used alongside attacks. Returns true when the skill replaces this tick's attack (priest heals share
// the attack cooldown). Thresholds: ranger marks targets worth >3 of its attacks; paladin self-heals below 50% HP
// and smashes targets worth >2 attacks; mage energizes below 50% MP.
function class_skills(t) {
	switch (character.ctype) {
		case "ranger":
			if (t.hp > character.attack * 3 && !t.s?.marked && can_use("huntersmark")) fire("huntersmark", t);
			else if (can_use("supershot")) fire("supershot", t);
			break;
		case "priest":
			if (party_heal()) return true; // heal shares the attack cooldown
			// dark blessing (level 70): +25% damage for every member within 600px for 8s, 60s cooldown: on a target
			// worth it (5+ of our hits) with someone else near
			if (G.skills.darkblessing && can_use("darkblessing") && !character.s?.darkblessing && t.hp > character.attack * 5 &&
				partners_near(G.skills.darkblessing.range || 600).length) fire("darkblessing");
			// absorb: pull every monster on a squishy member (not the tank) below 70% HP onto us, while we're healthy
			if (can_use("absorb") && character.hp > character.max_hp * 0.6) {
				const ents = Object.values(parent.entities || {});
				const victim = others().map((n) => parent.entities?.[n]).find((e) => e && !e.rip && valid(e) &&
					!CFG.gear_tank.includes(e.ctype) && e.hp < e.max_hp * 0.7 && distance(character, e) < (G.skills.absorb?.range || 240) &&
					ents.some((m) => m.type === "monster" && m.target === e.name));
				if (victim) fire("absorb", victim);
			}
			// curse (400 MP, +20% damage taken for 5s): only on a target with 5+ of our party's hits left, and MP above half
			if (!t.s?.cursed && t.hp > character.attack * 5 && character.mp > character.max_mp * 0.5 && can_use("curse") && in_reach(t, "curse")) fire("curse", t);
			break;
		case "paladin": {
			// mana shield: below 50% HP with MP to spare, damage comes out of MP (1.5 dmg per MP until 200 MP left);
			// off again once HP is back or MP runs low (smash/selfheal need it)
			const ms = !!character.s?.mshield;
			if (G.skills.mshield && can_use("mshield") && (ms ? character.mp < 250 || character.hp > character.max_hp * 0.85
				: character.hp < character.max_hp * 0.5 && character.mp > 400)) fire("mshield");
			if (character.hp < character.max_hp * 0.5 && can_use("selfheal")) fire("selfheal");
			else if (G.skills.purify && t.hp >= 1500 && character.mp > (G.skills.purify.mp || 360) + 200 && can_use("purify")) fire("purify", t);
			// purify (level 60): 2000 pure damage (ignores armour) every 24s, on targets with that much HP left
			// v24.4: smash is 0.36 x attack for 380 MP every 320ms (and needs a mace): unchecked, it emptied the bar in a
			// second and sustain() refilled it with MP potions (~30/min). Only from MP above smash_mp_floor of max, so it
			// spends natural regen and never potions, and keeps MP for mshield/selfheal/purify
			else if (t.hp > character.attack * 2 && character.mp > character.max_mp * CFG.smash_mp_floor + (G.skills.smash?.mp || 380) &&
				G.items[character.slots?.mainhand?.name]?.wtype === "mace" && can_use("smash") && in_reach(t, "smash")) fire("smash", t);
			break;
		}
		case "warrior":
			if (!character.s.warcry && can_use("warcry")) fire("warcry");
			break;
		case "mage": {
			// burst: all MP as one hit (MP × ratio, 6s cooldown) on a target that can soak most of it, when we're nearly
			// full and carry MP potions to refill
			const ratio = G.skills.burst?.ratio || 0.555;
			if (G.skills.burst && can_use("burst") && character.mp >= character.max_mp * 0.9 && t.hp >= character.mp * ratio * 0.6 &&
				pot_count("mp") >= CFG.pot_min && in_reach(t, "burst")) return fire("burst", t), true;
			if (cburst()) return true;
			if (!can_use("energize")) break;
			// the party member lowest on mana (below 40%) within range, else ourselves below 50%. A priest's heals run
			// on mana, so in a party this mostly keeps the healer going.
			const range = G.skills.energize?.range || 320;
			const low = others().map((n) => parent.entities?.[n]).filter((e) => e && !e.rip && valid(e) && e.max_mp &&
				e.mp < e.max_mp * 0.4 && distance(character, e) < range).sort((a, b) => a.mp / a.max_mp - b.mp / b.max_mp)[0];
			// v24.4: with no amount the server moves up to 10000 MP — all of ours. Give what they're missing, keeping 40%
			const give = low ? Math.min(low.max_mp - low.mp, Math.floor(character.mp - character.max_mp * 0.4)) : 0;
			if (low && give >= 100) fire("energize", low, give);
			// v24.8: on ourselves it moves no MP (server: same object) — the old "refill below 50%" did nothing but spend
			// the cooldown; its side effect, high attack speed, is the point: whenever no partner needs mana
			else if (!low) fire("energize", character);
			break;
		}
		case "rogue":
			if (!character.s.rspeed && can_use("rspeed")) fire("rspeed", character);
			break;
	}
	return false;
}
// Mage 75+: cburst splits MP across up to 12 monsters in range (damage = MP x ratio each). Only monsters already in our
// fight: hitting a party member, or the pack's type and safe for us (it aggroes everything it hits). Each target gets
// what it needs to die (lowest HP first) until the MP above 25% is spent; worth it from 3 targets.
function cburst() {
	const sk = G.skills.cburst;
	if (!sk || !can_use("cburst") || character.mp < character.max_mp * 0.5) return false;
	const party = party_names(), want = state.pack?.mtype;
	const dm = (d) => (typeof damage_multiplier === "function" ? damage_multiplier(d) : Math.max(0.05, 1 - d / 1000));
	const hits = Object.values(parent.entities || {}).filter((e) => e.type === "monster" && valid(e) && distance(character, e) < character.range &&
		!hopeless(e) && ((e.target && party.has(e.target)) || (e.mtype === want && !e.target && live_ok(e) && !tank_first(e)))).sort((a, b) => a.hp - b.hp);
	if (hits.length < 3) return false;
	let budget = character.mp - character.max_mp * 0.25;
	const targets = [];
	for (const e of hits.slice(0, 12)) {
		const need = Math.ceil(e.hp / ((sk.ratio || 0.5) * dm((e.resistance || 0) - (character.rpiercing || 0))) * 1.1);
		const mp = Math.min(need, Math.floor(budget));
		if (mp < 50) break;
		targets.push([e.id, mp]);
		budget -= mp;
	}
	if (targets.length < 3 || !can_spend(1, RESERVE.skill)) return false;
	return fire("cburst", targets);
}
// A walk (smart_move) in progress blocks approach(): stop it when a fight is right here — a target within 300px (on the
// way to a boss: only one attacking one of us). Never during errands.
// travel() treats the resulting "interrupted" as normal (no retry block).
function break_walk_for(t) {
	if (!walking() || !t || distance(character, t) > 300) return false;
	if (errand_busy() && !state.lead_walk) return false; // a town walk interrupted would fail (and pause) that errand step
	if (approach_path === t.id && distance(character, t) > standoff(t).reach && !can_move_to(t.x, t.y)) return false; // v24.32: the way round to it
	const attacking_us = !!t.target && party_names().has(t.target);
	if (!attacking_us && state.pack?.boss) return false; // on the way to a boss: only stop for attackers
	if (t.target === character.name && !can_take(t)) return false; // v24.10: outrun it; v24.16: keep walking whatever its speed
	halt("break_walk_for");
	return true;
}
function fight(t, steer = true) {
	// v24.10: attacked by something we can't take on and slower than us: get away (keep walking, or step away), shooting
	// if we can; stopping to trade hits with it was a death (a dark hound on the way through winterland)
	// v24.16: walking, never stop for it — whatever its speed: the walk goes on (through a door, it's left behind). Stopped,
	// a hawk (charge 52) cornered the party at desertland's cave door and killed Sanala while they face-tanked it
	// v24.59: only from a monster the party can't kill at all (an ent). It used to apply to anything that failed the
	// per-monster check — so the tank, having started on a levelled-up cgoo, stepped away from it 194 times in a minute
	// while the others fought it, and everyone died.
	if (t && t.target === character.name && hopeless(t) && (walking() || (character.speed || 0) > chase_speed(t.mtype))) {
		if (!walking()) step_away(t);
		return;
	}
	if (get_targeted_monster() !== t) change_target(t);
	if (steer) break_walk_for(t);
	if (steer && !walking() && !kite(t) && (!errand_busy() || state.lead_walk)) approach(t);
	else if (!steer && !walking()) kite(t);
	if (hold_for_tank(t)) { if (character.ctype === "priest") party_heal(); return; }
	if (!class_skills(t) && can_attack(t)) fire("attack", t);
}
// Potions of any tier: the game's use_hp/use_mp drink the last bag item that gives hp/mp, whatever its name
const pot_count = (kind) => character.items.reduce((n, i) => {
	const d = i && G.items[i.name];
	return n + (d && d.type === "pot" && (d.gives || []).some(([k, v]) => k === kind && v > 0) ? i.q || 1 : 0);
}, 0);
// Drink below 55% HP / 35% MP; otherwise use the free (slow) regen when topped up enough elsewhere
// v24.4: no potion while channelling a town teleport (a drink cancels it); and the free regen only when nothing is on
// us — it puts every potion on a 4s cooldown (server), twice a potion's own, which a hit at 60% HP can't afford
function sustain() {
	if (character.rip) return;
	const hp = character.hp / character.max_hp, mp = character.mp / character.max_mp;
	const calm = !get_nearest_monster({ target: character.name }) && hurt_ms() > 3000;
	if (channeling()) return calm && hp < 0.9 ? fire("regen_hp") : undefined;
	if (hp < 0.55 && pot_count("hp")) return fire("use_hp");
	if (mp < 0.35 && pot_count("mp")) return fire("use_mp");
	// v24.7: calm matters only with potions of that kind to protect — with none, the regen is all there is
	const ok_hp = calm || !pot_count("hp"), ok_mp = calm || (!pot_count("mp") && !pot_count("hp"));
	if (mp < 0.9 && hp > 0.8 && ok_mp) return fire("regen_mp");
	if (hp < 0.9 && ok_hp) return fire("regen_hp");
}
const chest_tries = {}; // chest id -> { n: attempts, t: last attempt, seen: first seen }; forgotten once the chest is gone
function loot_chests() {
	// A full bag still opens chests: gold-only chests succeed; item chests fail with loot_no_space, so each is tried
	// once at 0 free slots (gold would otherwise be left on the ground while the bag is full)
	if (character.rip) return;
	const now = Date.now();
	let best = null, best_d = Infinity;
	for (const id in parent.chests || {}) {
		const tr = (chest_tries[id] = chest_tries[id] || { n: 0, t: 0, seen: now });
		if (tr.n >= (character.esize === 0 ? 1 : 3) || now - tr.t < 3000) continue; // ≤3 tries (1 with a full bag), 3s apart
		const d = distance(character, parent.chests[id]);
		if (d > CFG.loot_range && now - tr.seen < CFG.loot_wait_ms) continue;
		if (d < best_d) (best = id), (best_d = d);
	}
	if (!best || !can_spend(1, RESERVE.loot)) return;
	chest_tries[best].n++;
	chest_tries[best].t = now;
	parent.open_chest(best); // one chest per call; the tick runs every ~200ms, so a pile still empties quickly
}
setInterval(() => { for (const id in chest_tries) if (!(id in (parent.chests || {}))) delete chest_tries[id]; }, 60_000);

// =====================================================================
// NPCs, shopping, upgrades
// =====================================================================
// Class weapon/offhand rules (G.classes[ctype].mainhand/offhand list the allowed weapon types / offhand types):
// a priest can't use a quiver or a bow even though the item itself carries no class tag
function can_wear(name) {
	const def = G.items[name], cls = G.classes[character.ctype] || {};
	if (!def) return false;
	if (def.class && !def.class.includes(character.ctype)) return false;
	if (def.type === "weapon" && def.wtype && (cls.mainhand || cls.offhand))
		return !!((cls.mainhand || {})[def.wtype] || (cls.offhand || {})[def.wtype]);
	if (["quiver", "source", "shield", "misc_offhand"].includes(def.type) && cls.offhand) return !!cls.offhand[def.type];
	return true;
}
// =====================================================================
// Own gear: score items per class (gear evaluation below), wear upgrades from the bags or the account-wide bank,
// and hand spares to party members who'd wear them. Worn scores travel in the heartbeat, so every member can judge
// an item for any other (same formula, same version).
// =====================================================================
const GEAR_SLOTS = ["mainhand", "offhand", "helmet", "chest", "pants", "shoes", "gloves", "amulet", "belt", "cape", "orb",
	"ring1", "ring2", "earring1", "earring2"];
const SLOT_OF = { helmet: ["helmet"], chest: ["chest"], pants: ["pants"], shoes: ["shoes"], gloves: ["gloves"], amulet: ["amulet"],
	belt: ["belt"], cape: ["cape"], orb: ["orb"], ring: ["ring1", "ring2"], earring: ["earring1", "earring2"] };
const OFFHAND_TYPES = new Set(["shield", "quiver", "source", "misc_offhand"]);
// ---- Gear evaluation (v24.26) ----
// Points per unit of each item stat, per class (1 attack = 1 point):
//  - primary stats (str dex int vit for): the class's per-level growth, G.classes[c].lstats — the stat weighting in
//    the game's data docs (/docs/code/data/classes) — relative to its main_stat, which counts CFG.gear_w.main_stat.
//    Mage: int 1.2, str/dex 0.24, vit 0.36; paladin: str and its side_stat int 1.2 each; warrior: dex/int 0.3.
//  - every other stat: CFG.gear_w; xp: xp_weight (from the wearer's live attack).
//  - tanks (CFG.gear_tank): defence (DEF_STATS) x CFG.gear_tank_mult. Not fortitude: the server applies it only
//    against players (server.js: attacker.is_player && target.for).
// What a piece is worth in a slot also counts the class's modifiers for its weapon/offhand type (server: applied on
// equip — a mage's wand +60 frequency, a priest's shield -5 speed) and what it adds to set bonuses for that wearer.
const PRIMARY_STATS = ["str", "dex", "int", "vit", "for"];
const STAT_KEYS = [...new Set([...PRIMARY_STATS, ...Object.keys(CFG.gear_w), "xp"])].filter((k) => k !== "main_stat"); // every stat that can score
const DEF_STATS = new Set(["armor", "resistance", "hp", "vit", "evasion", "avoidance", "reflection"]);
// The docs' values (design/classes.py), used only when the client's G.classes lacks lstats (an old client, a test)
const CLASS_DOC = {
	warrior: ["str", { str: 1, dex: 0.25, int: 0.25, vit: 0.4, for: 0.025 }],
	paladin: ["str", { str: 1, dex: 0.05, int: 1, vit: 0.4, for: 0.2 }, "int"],
	rogue: ["dex", { str: 0.2, dex: 1, int: 0.2, vit: 0.3, for: 0.025 }],
	ranger: ["dex", { str: 0.2, dex: 1, int: 0.25, vit: 0.3, for: 0.02 }],
	mage: ["int", { str: 0.2, dex: 0.2, int: 1, vit: 0.3, for: 0.02 }],
	priest: ["int", { str: 0.2, dex: 0.2, int: 1, vit: 0.4, for: 0.025 }],
	merchant: ["int", { str: 0.1, dex: 0.4, int: 1, vit: 0.25, for: 0 }],
};
// { main, side, l (lstats), src: "G" | "doc" } or null for an unknown class
function class_stats(ctype) {
	const c = G.classes?.[ctype], d = CLASS_DOC[ctype], live = c?.lstats && typeof c.lstats === "object";
	const l = live ? c.lstats : d?.[1], main = c?.main_stat || d?.[0];
	return l && main && l[main] > 0 ? { main, side: c?.side_stat || d?.[2] || null, l, src: live ? "G" : "doc" } : null;
}
function stat_weight(k, ctype) {
	let w;
	if (PRIMARY_STATS.includes(k)) { const cs = class_stats(ctype); w = cs ? CFG.gear_w.main_stat * (cs.l[k] || 0) / cs.l[cs.main] : 0; }
	else if (k === "xp") w = xp_weight(ctype);
	else w = k === "main_stat" ? 0 : CFG.gear_w[k] || 0;
	if (w && CFG.gear_tank.includes(ctype) && DEF_STATS.has(k)) w *= CFG.gear_tank_mult;
	return w;
}
// The full table for a class (gear_check, report)
function gear_weights(ctype) {
	const out = {};
	for (const k of STAT_KEYS) { const w = stat_weight(k, ctype); if (w) out[k] = Math.round(w * 1000) / 1000; }
	return out;
}
// Item stats at its level: the game's own calculator when the runner exposes it, else base + per-level increments
function item_props(item, ctype) {
	const f = typeof calculate_item_properties === "function" ? calculate_item_properties
		: typeof parent !== "undefined" && typeof parent.calculate_item_properties === "function" ? parent.calculate_item_properties : null;
	if (f) try { return f(item, { class: ctype }); } catch (e) {}
	const def = G.items[item.name] || {}, out = {}, lv = item.level || 0, inc = def.upgrade || def.compound || {};
	for (const k of STAT_KEYS) if (typeof def[k] === "number") out[k] = def[k];
	for (const k in inc) if (typeof inc[k] === "number") out[k] = (out[k] || 0) + inc[k] * lv;
	return out;
}
// What wearing it adds: its stats plus the class's modifiers for its weapon type (mainhand) or offhand type
function gear_stats(item, ctype) {
	const p = { ...item_props(item, ctype) }, d = G.items[item.name], cls = G.classes[ctype];
	const mod = !cls || !d ? null : d.type === "weapon" ? cls.doublehand?.[d.wtype] || cls.mainhand?.[d.wtype]
		: OFFHAND_TYPES.has(d.type) ? cls.offhand?.[d.wtype] || cls.offhand?.[d.type] : null;
	for (const [k, v] of Object.entries(mod || {})) if (typeof v === "number") p[k] = (p[k] || 0) + v;
	return p;
}
// Points per xp stat point for a class (v23.4): its attack (ours, or a partner's from its heartbeat) x value
function xp_weight(ctype) {
	if (ctype === "merchant") return 0;
	const atk = ctype === character.ctype ? character.attack : partners().find((p) => p.ctype === ctype)?.attack;
	// v24.7: not x party size — +1% xp on one fighter is 1/n of the party's xp, the same as +1% of its own damage (which
	// speeds every member's share); x n made xp gear outscore real armour, and differ on the merchant (party_n 1)
	return CFG.gear_xp_value * (atk || character.attack || 100);
}
// Points of a stat bag for a class, and each stat's share (largest first)
function stat_terms(p, ctype) {
	const out = [];
	for (const k in p) {
		if (!p[k] || typeof p[k] !== "number") continue;
		const w = stat_weight(k, ctype);
		if (w) out.push({ k, v: p[k], w, pts: p[k] * w });
	}
	return out.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
}
const round1 = (x) => Math.round(x * 10) / 10;
function stat_points(p, ctype) {
	let s = 0;
	for (const k in p) if (p[k] && typeof p[k] === "number") s += p[k] * stat_weight(k, ctype);
	return s;
}
// A piece on its own (no set bonus): the same for every slot it fits
function gear_score(item, ctype = character.ctype) {
	if (!item || !G.items[item.name]) return 0;
	return round1(stat_points(gear_stats(item, ctype), ctype));
}
// Set bonus with n pieces worn: the server adds up the levels 1..n of G.sets[set] (server_functions.js, at boot; the
// client's G holds them per level)
function set_bonus(set, n) {
	const S = G.sets?.[set], out = {};
	if (!S) return out;
	for (let i = 1; i <= n; i++) for (const [k, v] of Object.entries(S[i] || {})) if (typeof v === "number") out[k] = (out[k] || 0) + v;
	return out;
}
// Points the piece adds to its set's bonus in this slot: the set as worn in the other slots, plus this one
function set_gain(item, ctype, g, slot) {
	const set = G.items[item?.name]?.set;
	if (!set || !G.sets?.[set]) return 0;
	const others = Math.max(0, (g?.sets?.[set] || 0) - (g?.sset?.[slot] === set ? 1 : 0));
	return stat_points(set_bonus(set, others + 1), ctype) - stat_points(set_bonus(set, others), ctype);
}
// What a piece is worth to a member (g: its my_gear, or a partner's heartbeat gear) in a slot: alone + set bonus
// (a partner on an older version sends off: true/false — the offhand flag that field used to be)
const dps_ctx = (g) => (CFG.gear_dps && g && typeof g.off === "object" && g.off && g.off.mult > 0 && g.off.A > 0 && g.off.F > 0 ? g.off : null);
function slot_value(item, ctype, g, slot) {
	let v = gear_score(item, ctype);
	const O = dps_ctx(g);
	if (O && slot && item && G.items[item.name]) {
		const p = gear_stats(item, ctype), lin = (p.attack || 0) * stat_weight("attack", ctype) + (p.frequency || 0) * stat_weight("frequency", ctype);
		if (lin) v += offense_points(p, O, slot) - lin; // its attack and speed as damage, instead of the flat weights
	}
	return round1(v + set_gain(item, ctype, g, slot));
}
// What a wearer's damage depends on (my_gear → heartbeat gear.off): its attack A and frequency F as worn, mult = attack
// per point of item attack (server calculate_player_stats: main stat / 20; paladin str/20 + int/40; priest x1.6), and
// each worn slot's item attack (ia) and frequency points (fr)
function offense_ctx(sl) {
	const cs = class_stats(character.ctype);
	if (!cs || !(character.attack > 0) || !(character.frequency > 0)) return null;
	let mult = character.ctype === "paladin" ? (character.str || 0) / 20 + (character.int || 0) / 40 : (character[cs.main] || 0) / 20;
	if (character.ctype === "priest") mult *= 1.6;
	if (!(mult > 0)) return null;
	const ia = {}, fr = {};
	for (const s of GEAR_SLOTS) if (sl[s]) { const p = gear_stats(sl[s], character.ctype); if (p.attack) ia[s] = p.attack; if (p.frequency) fr[s] = p.frequency; }
	return { A: Math.round(character.attack), F: +character.frequency.toFixed(3), mult: +mult.toFixed(3), ia, fr };
}
// Points a piece's attack and frequency are worth in a slot: the damage per second it adds over that slot EMPTY (so
// the worn piece and a candidate are measured from the same base — no flip-flop), in units of one point of item attack
function offense_points(p, O, slot) {
	const A0 = Math.max(1, O.A - (O.ia?.[slot] || 0) * O.mult), F0 = Math.max(0.1, O.F - (O.fr?.[slot] || 0) / 100);
	const A1 = Math.max(1, A0 + (p.attack || 0) * O.mult), F1 = Math.max(0.05, F0 + (p.frequency || 0) / 100);
	return (A1 * F1 - A0 * F0) / (F0 * O.mult);
}
// Sets worn: set -> pieces, slot -> set (my_gear, heartbeat)
function worn_sets(sl) {
	const sets = {}, sset = {};
	for (const s of GEAR_SLOTS) { const set = sl[s] && G.items[sl[s].name]?.set; if (set) { sets[set] = (sets[set] || 0) + 1; sset[s] = set; } }
	return { sets, sset };
}
// "int 10×1.2=12, vit 4×0.48=1.9 (+set wanderers 2pc 20)": why a piece scores what it does
function gear_why(item, ctype = character.ctype, g = null, slot = null) {
	if (!item || !G.items[item.name]) return "";
	const t = stat_terms(gear_stats(item, ctype), ctype).slice(0, 4).map((x) => `${x.k} ${round1(x.v)}×${+x.w.toFixed(2)}=${round1(x.pts)}`);
	const sg = g && slot ? round1(set_gain(item, ctype, g, slot)) : 0;
	const p_ = gear_stats(item, ctype), dps = dps_ctx(g) && slot && (p_.attack || p_.frequency) ? ` [attack+speed as damage: ${round1(offense_points(p_, g.off, slot))} pts, not the two weights]` : "";
	return t.join(", ") + (sg ? ` (+set ${G.items[item.name].set} ${sg})` : "") + dps;
}
// "weights paladin (G.classes lstats, main str, side int): str 1.2 int 1.2 vit 0.96 ... | attack 1 armor 0.6 ..."
function gear_weights_text(ctype) {
	const cs = class_stats(ctype), w = gear_weights(ctype);
	const prim = PRIMARY_STATS.filter((k) => w[k]).map((k) => `${k} ${w[k]}`).join(" ");
	const rest = Object.entries(w).filter(([k]) => !PRIMARY_STATS.includes(k)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" ");
	return `weights ${ctype}${cs ? ` (${cs.src === "G" ? "G.classes" : "docs copy"} lstats, main ${cs.main}${cs.side ? `, side ${cs.side}` : ""})` : " (unknown class)"}` +
		`${CFG.gear_tank.includes(ctype) ? `, defence x${CFG.gear_tank_mult}` : ""}: ${prim} | ${rest}`;
}
// What a member (us, or a partner from its heartbeat) wears: slot -> score; slots the guide owns right now count as
// unbeatable (1e9); dh = mainhand is two-handed, off = offhand occupied; sets/sset = sets worn (worn_sets)
let my_gear_cache = null; // { at, key, g }: bag_plan judges every bag item against it, so memo it for 1s
// Does the guide have a live (not paused) gear step for this slot? Row ids are "kind:slot:item:level:stat".
function guide_plans_slot(slot) {
	return (state.guide?.rows || []).some((r) => CFG.gear_actions.includes(r.kind) && !skipped(r.id) &&
		(r.action?.slot || String(r.id || "").split(":")[1]) === slot);
}
// Worn pieces, plus those off for a long walk (v24.27: still ours — judged, reported and protected as worn)
function gear_slots_v() {
	const sl = { ...(character.slots || {}) };
	for (const r of state.travel_off) if (!sl[r.slot]) sl[r.slot] = { name: r.name, level: r.level, p: r.p || undefined, stat_type: r.stat_type || undefined };
	return sl;
}
function my_gear() {
	const now = Date.now(), sl = gear_slots_v();
	const owned = (s) => now - (state.guide_equip[s] || 0) < CFG.gear_guide_respect_h * 3600_000 && guide_plans_slot(s);
	const key = GEAR_SLOTS.map((s) => (sl[s] ? sl[s].name + (sl[s].level || 0) : "") + (owned(s) ? "!" : "")).join();
	if (my_gear_cache && now - my_gear_cache.at < 1000 && my_gear_cache.key === key) return my_gear_cache.g;
	const w = {}, own = {}, ws = worn_sets(sl), off = CFG.gear_dps ? offense_ctx(sl) : null;
	if (off) ws.off = off;
	// v24.26: a worn piece's score includes what it adds to its set's bonus (taking it off loses that)
	for (const s of GEAR_SLOTS) { w[s] = slot_value(sl[s], character.ctype, ws, s); if (owned(s)) own[s] = true; }
	const mh = sl.mainhand && G.items[sl.mainhand.name];
	const g = { w, own, dh: !!(mh && G.classes[character.ctype]?.doublehand?.[mh.wtype]), has_off: !!sl.offhand, sets: ws.sets, sset: ws.sset, off };
	my_gear_cache = { at: now, key, g };
	return g;
}
// Slots an item could go in for a class (main-hand weapons only; two-handers only with the offhand free)
function slots_for(name, ctype, g) {
	const def = G.items[name], cls = G.classes[ctype] || {};
	if (!def || !GEAR.has(def.type) || (def.class && !def.class.includes(ctype))) return [];
	if (def.type === "weapon") {
		// v19.7: a two-hander is judged even with an offhand worn (it then has to beat mainhand + offhand together)
		return cls.mainhand?.[def.wtype] || cls.doublehand?.[def.wtype] ? ["mainhand"] : [];
	}
	if (OFFHAND_TYPES.has(def.type)) return cls.offhand?.[def.type] && !g.dh ? ["offhand"] : [];
	return SLOT_OF[def.type] || [];
}
// Best slot for an item and how much it beats what's there; null unless it clears gear_min_gain and gear_margin
const is_2h = (name, ctype) => { const d = G.items[name]; return d?.type === "weapon" && !!G.classes[ctype]?.doublehand?.[d.wtype] && !G.classes[ctype]?.mainhand?.[d.wtype]; };
function gear_gain(item, ctype, g) {
	if (!item || !g?.w) return null;
	let best = null;
	for (const s of slots_for(item.name, ctype, g)) {
		// v24.26: valued in that slot for that member: alone + what it adds to a set it'd complete there
		const score = slot_value(item, ctype, g, s);
		// a two-hander replaces the offhand too: it must beat both
		const cur = (g.w[s] ?? 0) + (s === "mainhand" && is_2h(item.name, ctype) && !g.dh ? g.w.offhand ?? 0 : 0), gain = score - cur;
		// a slot the guide is actively working on only takes a clearly better item (gear_guide_override)
		const margin = g.own?.[s] ? Math.max(CFG.gear_margin, CFG.gear_guide_override) : CFG.gear_margin;
		if (gain >= CFG.gear_min_gain && gain >= cur * margin && (!best || gain > best.gain)) best = { slot: s, gain, score };
	}
	return best;
}
// Members that could use an item more than what they wear (us first); version-matched partners only
function gear_takers() {
	const out = [{ name: character.name, ctype: character.ctype, g: my_gear() }];
	for (const p of partners()) if (p.gear?.w) out.push({ name: p.name, ctype: p.ctype, g: p.gear, esize: p.esize, p });
	return out;
}
// (a merchant that doesn't wear gear isn't a taker for itself: v24.7)
const self_taker_ok = () => !is_merchant() || CFG.merchant.wear_gear;
const gear_wanted_by = (item) => CFG.gear_auto && gear_takers().find((m, i) => (i > 0 || self_taker_ok()) && gear_gain(item, m.ctype, m.g));
// An upgrade for us (not refused by the server) or for a fighter: such a piece is never banked, sold or listed
const wanted_by_member = (item) => CFG.gear_auto && gear_takers().some((m, i) => (i > 0 || (!equip_paused(item) && self_taker_ok())) && gear_gain(item, m.ctype, m.g));
// Gear in the bank that beats what we wear: one per slot (the best), as task_bank fetch entries
function bank_upgrades() {
	if (!CFG.gear_auto || !CFG.bank) return [];
	const g = my_gear(), offers = [];
	// the merchant fetches fighters' upgrades and delivers them; with no merchant online, fighters fetch each other's
	// (share_gear hands them over when near)
	const takers = is_merchant() || !merchant_recent() ? gear_takers().slice(1) : [];
	(state.bank_gear || []).forEach((it, i) => {
		const own = !equip_paused(it) && gear_gain(it, character.ctype, g);
		const theirs = () => takers.map((m) => [m.name, gear_gain(it, m.ctype, m.g)]).filter(([, r]) => r);
		// v24.5: a fighter keeps first claim; the merchant takes a piece only if no fighter would
		const cands = is_merchant() ? (theirs().length ? theirs() : own && CFG.merchant.wear_gear ? [[character.name, own]] : []) : own ? [[character.name, own]] : theirs();
		for (const [who, r] of cands) offers.push({ ms: `${who}:${r.slot}`, i, gain: r.gain, it });
	});
	// v23.2: one piece per (member, slot); v24.5: and each bank copy to one (member, slot), biggest gains first — a
	// piece best for two members went to one, and the other's next-best piece was never fetched
	const used_ms = new Set(), used_i = new Set(), out = [];
	for (const o of offers.sort((a, b) => b.gain - a.gain)) {
		if (used_ms.has(o.ms) || used_i.has(o.i)) continue;
		used_ms.add(o.ms); used_i.add(o.i);
		const it = o.it;
		out.push({ name: it.name, level: it.level, p: it.p, stat_type: it.stat_type, exact: true, gain: o.gain,
			key: `gear:${it.name}:${it.level}${it.p ? ":" + it.p : ""}${it.stat_type ? ":" + it.stat_type : ""}` });
	}
	return out;
}
// A piece the server refused to equip (level, class...) isn't tried, fetched or held for 6h
const equip_paused = (it) => skipped(`equip:${it.name}:${it.level || 0}`);
// Wear the best upgrade in the bags (one equip per call; the replaced piece drops into the bags and is judged again)
let gear_busy = false;
// v24.5: the merchant wears only what no fighter would (and never a project or guide copy): it equipped fighter pieces
// the moment it held them — deliveries, Ponty buys, a project's in-progress copy (whose loss restarted the project) —
// and nothing ever took them off again. What it wears that a fighter now wants comes off, for gear_target to deliver.
let m_release_at = 0;
async function equip_upgrades() {
	if (!CFG.gear_auto || gear_busy || character.rip || errand_busy()) return false;
	const needed = needed_slots(), g = my_gear(), M_ = is_merchant(), off_s = travel_off_slots();
	const fighters = M_ ? gear_takers().slice(1).filter((m) => m.ctype !== "merchant") : [];
	const for_fighter = (it) => fighters.some((m) => gear_gain(it, m.ctype, m.g));
	let best = null;
	character.items.forEach((it, k) => {
		if (!it || equip_paused(it) || (M_ && (!CFG.merchant.wear_gear || needed.has(k) || for_fighter(it)))) return;
		const r = gear_gain(it, character.ctype, g);
		if (r && off_s.has(r.slot)) return; // v24.27: its piece is off for a walk and goes back on after it
		// a copy the guide holds as an upgrade/compound input is worn only when clearly better (v20.0)
		if (r && needed.has(k) && r.gain < (g.w[r.slot] || 0) * CFG.gear_input_gain) return;
		if (r && (!best || r.gain > best.gain)) best = { ...r, k, it };
	});
	// (c) wearing a two-hander: a one-hander + offhand from the bags may beat it together (the offhand goes on next)
	if (!best && g.dh && !off_s.has("mainhand") && !off_s.has("offhand")) {
		let one = null, off = null;
		character.items.forEach((it, k) => {
			if (!it || equip_paused(it) || needed.has(k) || (M_ && (!CFG.merchant.wear_gear || for_fighter(it)))) return;
			const d = G.items[it.name], cls = G.classes[character.ctype] || {};
			if (!d) return;
			if (d.type === "weapon" && cls.mainhand?.[d.wtype] && !is_2h(it.name, character.ctype)) { const sc = slot_value(it, character.ctype, g, "mainhand"); if (!one || sc > one.sc) one = { k, it, sc }; }
			if (OFFHAND_TYPES.has(d.type) && cls.offhand?.[d.type]) { const sc = slot_value(it, character.ctype, g, "offhand"); if (!off || sc > off.sc) off = { k, it, sc }; }
		});
		const cur = g.w.mainhand || 0, sum = (one?.sc || 0) + (off?.sc || 0);
		if (one && off && character.esize >= 1 && sum - cur >= CFG.gear_min_gain && sum - cur >= cur * CFG.gear_margin)
			best = { slot: "mainhand", gain: sum - cur, score: one.sc, k: one.k, it: one.it };
	}
	if (!best && M_ && fighters.length && character.esize >= 2 && Date.now() - m_release_at > 60_000 && typeof unequip === "function") {
		const s_ = GEAR_SLOTS.find((s) => { const X = character.slots?.[s]; return X && !X.l && !X.b && for_fighter(X); });
		if (s_ && can_spend(EMIT_COST.equip, RESERVE.errand)) {
			const X = character.slots[s_];
			m_release_at = Date.now();
			gear_busy = true;
			try { await T(unequip(s_)); game_log(`gear: took off ${X.name}+${X.level || 0} — an upgrade for a fighter`, C.ok); return true; }
			catch (e) { game_log(`gear: unequip ${s_}: ${why(e)}`, C.dim); return false; } finally { gear_busy = false; }
		}
	}
	if (!best || !can_spend(EMIT_COST.equip, RESERVE.errand)) return false;
	gear_busy = true;
	try {
		// a two-hander over an offhand: take the offhand off first (needs a free bag slot)
		if (best.slot === "mainhand" && is_2h(best.it.name, character.ctype) && character.slots?.offhand) {
			if (character.esize < 1) return false;
			await T(unequip("offhand"));
		}
		await T(equip(best.k, best.slot));
		game_log(`gear: ${best.it.name}+${best.it.level || 0} → ${best.slot} (+${best.gain.toFixed(0)} pts)`, C.ok);
		return true;
	} catch (e) {
		skip(`equip:${best.it.name}:${best.it.level || 0}`, 6 * 3600_000, why(e));
		game_log(`gear: equip ${best.it.name}+${best.it.level || 0}: ${why(e)} — not trying it for 6h`, C.dim);
		return false;
	} finally { gear_busy = false; }
}
// Hand a bag spare to a nearby member it's an upgrade for (one item per call). Items that are upgrades for us stay;
// locked/bound items and copies the guide needs are never sent.
async function share_gear() {
	if (!CFG.gear_auto || !(in_party_cfg() || is_merchant()) || gear_busy || character.rip || typeof send_item !== "function") return false;
	const near = new Set(partners_near(CFG.gear_share_range).map((p) => p.name));
	const takers = gear_takers().slice(1).filter((m) => near.has(m.name) && (m.esize ?? 1) > 0), now = Date.now();
	// v20.0: the merchant (near, from its heartbeat) takes what no fighter would wear
	const M = !is_merchant() && merchant_hb();
	const Mt = M && M.gear?.w && (M.esize ?? 0) > 2 && M.map === character.map && Math.hypot((parent.entities?.[M.name] || M).x - character.x, (parent.entities?.[M.name] || M).y - character.y) <= CFG.gear_share_range
		? { name: M.name, ctype: "merchant", g: M.gear } : null;
	if (!takers.length && !Mt) return false;
	const needed = needed_slots(), mine = my_gear();
	for (let k = 0; k < character.items.length; k++) {
		const it = character.items[k];
		if (!it || it.l || it.b || needed.has(k) || !GEAR.has(G.items[it.name]?.type) || (!is_merchant() && !equip_paused(it) && gear_gain(it, character.ctype, mine))) continue;
		let to = null;
		for (const m of takers) {
			const r = gear_gain(it, m.ctype, m.g);
			if (r && (!to || r.gain > to.gain)) to = { ...r, m };
		}
		// v24.7: the merchant hands a piece only to the fighter it helps most (gear_target walks to that one), not to
		// whoever is near when it serves someone
		if (to && is_merchant() && best_fighter_for(it)?.name !== to.m.name) to = null;
		if (!to && Mt && CFG.merchant.wear_gear) { const r = gear_gain(it, "merchant", Mt.g); if (r) to = { ...r, m: Mt }; }
		const key = `${it.name}:${it.level || 0}>${to?.m.name}`;
		if (!to || now - (state.gear_sent[key] || 0) < 600_000 || !can_spend(1, RESERVE.errand)) continue;
		state.gear_sent[key] = now;
		gear_busy = true;
		try {
			await T(send_item(to.m.name, k, 1));
			game_log(`gear: gave ${it.name}+${it.level || 0} to ${to.m.name} for its ${to.slot} (+${to.gain.toFixed(0)} pts)`, C.ok);
			return true;
		} catch (e) { game_log(`gear: giving ${it.name} to ${to.m.name}: ${why(e)}`, C.dim); } finally { gear_busy = false; }
	}
	return false;
}
// Worn pieces per slot (heartbeat), so members can spot swaps that help both
function worn_items() {
	const out = {}, sl = character.slots || {};
	for (const s of GEAR_SLOTS) if (sl[s]) out[s] = { name: sl[s].name, level: sl[s].level || 0, p: sl[s].p, stat_type: sl[s].stat_type, l: !!(sl[s].l || sl[s].b) };
	return out;
}
// ---- Travel gear (v24.27): pieces that slow us come off for long walks, and go back on when they end ----
// Our own long walk (go_raw's trip), or the walk just ended a moment ago (between a route's legs, a group hold)
// v24.31: ...or we're the leader holding for stragglers on the way (group_hold): still the same trip — the followers'
// gear went on and off with every hold
const own_long_walk = () => !!trip.long && (walking() || Date.now() - trip.end < CFG.travel_gear.settle_ms || !!state.group_wait);
// Are we on a long walk now? A follower walks with its leader (heartbeat lw), not through go()
function travel_long() {
	if (state.pack && character.map === state.pack.map && in_boundary(state.pack.boundary, 250)) return false; // at the spot
	if (own_long_walk() && !(errand_busy() && !walking())) return true; // an errand at its NPC isn't travelling
	if (errand_busy() || !is_follower()) return false;
	const L = leader_hb();
	// walking with it: same map, within reach of it (a member holding somewhere else isn't travelling)
	return !!L?.lw && partners_near(2 * CFG.party.follow_far).includes(L);
}
// Why the travel gear must go back on now (null: no reason)
function travel_danger() {
	if (character.hp < character.max_hp * 0.5) return "low HP";
	const party = party_names();
	for (const id in parent.entities || {}) {
		const e = parent.entities[id];
		if (e && e.type === "monster" && e.visible && !e.dead && e.target && party.has(e.target) && distance(character, e) <= CFG.travel_gear.danger_px)
			return `${e.mtype} on ${e.target === character.name ? "us" : e.target}`;
	}
	if (character.ctype === "priest" && partners_near(400).some((p) => p.max_hp && p.hp < p.max_hp * 0.6)) return "a member needs heals";
	return null;
}
// Worn pieces worth taking off: speed they cost us (own speed + class modifier, and the dex/str speed they give),
// the HP/MP the server would clamp away, biggest speed first
function travel_candidates() {
	const T_ = CFG.travel_gear, out = [], sl = character.slots || {};
	for (const s of GEAR_SLOTS) {
		const it = sl[s];
		if (!it || it.b || !G.items[it.name] || skipped(`tgear:${s}`)) continue;
		const p = gear_stats(it, character.ctype);
		const speed = -(p.speed || 0) - Math.max(0, p.dex || 0) / 32 - Math.max(0, p.str || 0) / 64;
		if (speed < T_.min_speed) continue;
		const dhp = (p.hp || 0) + (p.str || 0) * 21 + (p.vit || 0) * (48 + character.level / 3), dmp = (p.mp || 0) + (p.int || 0) * 15;
		const hp_loss = Math.max(0, character.hp - (character.max_hp - dhp)), mp_loss = Math.max(0, character.mp - (character.max_mp - dmp));
		if (hp_loss > character.max_hp * T_.max_hp_loss || mp_loss > character.max_mp * T_.max_mp_loss) continue;
		out.push({ slot: s, it, speed: round1(speed), hp_loss: Math.round(hp_loss), mp_loss: Math.round(mp_loss) });
	}
	return out.sort((a, b) => b.speed - a.speed);
}
// Bag slot of a piece we took off (exact copy), -1 if it's gone
const travel_bag_slot = (r) => character.items.findIndex((i) => i && i.name === r.name && (i.level || 0) === (r.level || 0) &&
	(i.p || null) === (r.p || null) && (i.stat_type || null) === (r.stat_type || null));
const travel_slots_held = () => new Set(state.travel_off.map(travel_bag_slot).filter((k) => k >= 0));
const travel_off_slots = () => new Set(state.travel_off.map((r) => r.slot));
// v24.31: a swap changes our speed mid-step; the client keeps walking its old step and drifts off the server's position
// (the pathfinder then clips a corner and stands there). Stop the step: the walk in flight re-plans from where we are.
const travel_resync = () => { if (character.moving) try { stop("move"); } catch (e) {} };
// v24.31: our combat stats with everything on (taken as the pieces come off): the heartbeat keeps sending these, so the
// leader doesn't judge spots on a priest without its staff
// v24.36: kept in state and saved with travel_off — after a reload mid-walk the pieces were still off but these were
// gone, so the heartbeat sent the stripped stats again and the leader's verdicts flipped with every swap
const HB_COMBAT = ["attack", "frequency", "max_hp", "armor", "resistance", "range", "apiercing", "rpiercing", "max_mp"];
const travel_stats = { off: 0, on: 0, last: null, at: 0 }; // report: pieces taken off / put back since load, the last action
let travel_restored_at = 0;
async function travel_strip() {
	const T_ = CFG.travel_gear;
	const cands = travel_candidates().slice(0, Math.max(0, character.esize - T_.keep_free)); // each needs a free bag slot
	let n = 0;
	if (cands.length && !state.travel_off.length) state.travel_full = Object.fromEntries(HB_COMBAT.map((k) => [k, character[k] || 0]));
	for (const c of cands) {
		if (gear_busy || !can_spend(EMIT_COST.unequip, RESERVE.errand)) break;
		gear_busy = true;
		try { await T(unequip(c.slot)); } catch (e) { game_log(`travel gear: unequip ${c.slot}: ${why(e)}`, C.dim); } finally { gear_busy = false; }
		if (character.slots?.[c.slot]) { skip(`tgear:${c.slot}`, 600_000, "unequip failed"); continue; }
		state.travel_off.push({ slot: c.slot, name: c.it.name, level: c.it.level || 0, p: c.it.p || null, stat_type: c.it.stat_type || null, speed: c.speed });
		n++;
	}
	if (n) {
		my_gear_cache = null; travel_resync();
		const txt = state.travel_off.map((r) => `${r.name}+${r.level} (${r.speed} speed)`).join(", ");
		travel_stats.off += n; travel_stats.last = `took off ${txt}`; travel_stats.at = Date.now();
		game_log(`travel gear: took off ${txt} for the walk`, C.dim);
		save_state(); // a reload mid-walk must still know to put them back on
	}
	return n > 0;
}
// Put everything back on (mainhand first: a two-hander needs the offhand free, as it was). A slot something else went
// into meanwhile, or a piece no longer in the bags, is dropped from the list (the piece is judged as any bag item).
let restore_p = null; // one restore at a time (the tick, an errand's start and its walk's end can all ask)
function travel_restore(why_) {
	if (!restore_p) restore_p = travel_restore_run(why_).finally(() => { restore_p = null; });
	return restore_p;
}
async function travel_restore_run(why_) {
	if (!state.travel_off.length || character.rip) return false;
	if (channeling() && why_ !== "errand" && why_ !== "arrived") return false; // equip would cancel the town channel
	const list = [...state.travel_off].sort((a, b) => (b.slot === "mainhand") - (a.slot === "mainhand"));
	let n = 0;
	for (const r of list) {
		const drop = () => { state.travel_off = state.travel_off.filter((x) => x !== r); };
		await wait_budget(EMIT_COST.equip, RESERVE.skill);
		while (gear_busy) await sleep_ms(100);
		if (character.slots?.[r.slot]) { drop(); continue; }
		const k = travel_bag_slot(r);
		if (k < 0) { drop(); game_log(`travel gear: ${r.name}+${r.level} is no longer in the bags`, C.warn); continue; }
		gear_busy = true;
		try { await T(equip(k, r.slot)); } catch (e) { game_log(`travel gear: equip ${r.name}: ${why(e)}`, C.dim); } finally { gear_busy = false; }
		if (character.slots?.[r.slot]?.name === r.name) { drop(); n++; }
		else if (!character.items[k] || character.items[k].name !== r.name) drop(); // moved/consumed: stop chasing it
		else if ((r.fails = (r.fails || 0) + 1) >= 3) { // refused 3 times: leave it to the gear loop (it's the slot's best piece)
			drop(); skip(`tgear:${r.slot}`, 3600_000, "re-equip refused");
			game_log(`travel gear: ${r.name}+${r.level} wouldn't go back on — left to the gear loop; not taking ${r.slot} off for 1h`, C.warn);
		}
	}
	if (n) {
		my_gear_cache = null; travel_restored_at = Date.now(); travel_resync();
		travel_stats.on += n; travel_stats.last = `put ${n} back on (${why_})`; travel_stats.at = Date.now();
		game_log(`travel gear: back on (${why_})`, C.dim);
		save_state();
	}
	return n > 0;
}
let travel_busy = false;
async function travel_gear_tick() {
	const T_ = CFG.travel_gear;
	if (travel_busy || character.rip || typeof equip !== "function" || typeof unequip !== "function") return;
	if (!T_.enabled || is_merchant()) { if (state.travel_off.length && !channeling()) { travel_busy = true; try { await travel_restore("disabled"); } finally { travel_busy = false; } } return; }
	if (channeling()) return; // equip/unequip cancel the town channel (server: player.c = {})
	travel_busy = true;
	try {
		// pieces off but no full-gear stats to report for them (saved by a version before v24.36): back on first
		if (state.travel_off.length && !state.travel_full) return void (await travel_restore("no full-gear stats"));
		const long = travel_long();
		if (!long && !state.travel_off.length) return; // nothing off, no long walk: nothing to judge
		const danger = travel_danger();
		if (state.travel_off.length) { if (!long || danger) await travel_restore(danger || "walk over"); }
		else if (long && !danger && !gear_busy && Date.now() - travel_restored_at > T_.cooldown_ms) await travel_strip();
	} finally { travel_busy = false; }
}
setInterval(() => { travel_gear_tick().catch(() => {}); }, 500);
setInterval(() => { equip_upgrades().then((did) => did || drink_elixir()).then((did) => did || share_gear()).then((did) => did || swap_worn()).catch(() => {}); }, 5_000);
// A computer (or supercomputer) in the bags lets shop/upgrade/compound/craft/exchange work from anywhere
const has_computer = () => character.items.some((i) => i && (i.name === "computer" || i.name === "supercomputer"));
// First unlocked bag slot holding name at exactly this upgrade level (-1 if none); find_slots: n of them or null
function find_slot(name, level) {
	return character.items.findIndex((i) => i && i.name === name && (i.level || 0) === (level || 0) && !i.l);
}
function find_slots(name, level, n) {
	const out = [];
	character.items.forEach((i, k) => { if (out.length < n && i && i.name === name && (i.level || 0) === level && !i.l) out.push(k); });
	return out.length === n ? out : null;
}
// Quantity in the bags: any level / exactly this level (stacks count their q)
const held_any = (name) => character.items.reduce((n, i) => n + (i && i.name === name ? i.q || 1 : 0), 0);
const held = (name, level) => character.items.reduce((n, i) => n + (i && i.name === name && (i.level || 0) === (level || 0) ? i.q || 1 : 0), 0);
// An NPC that sells this item and is somewhere we can walk to (null if none)
function shop_for(name) {
	for (const id in G.npcs) if (!G.npcs[id].ignore && (G.npcs[id].items || []).includes(name) && find_npc(id)) return id;
	return null;
}
// Walk to an NPC unless we're already within 150px (NPC actions allow 400px). A computer makes the walk unnecessary,
// except for Daisy (monsterhunter), whose hunt counter checks distance regardless.
async function go_npc(npc) {
	if (has_computer() && npc !== "monsterhunter") return;
	const loc = find_npc(npc);
	if (!loc) throw { reason: "no_npc", npc };
	if (character.map === loc.map && Math.hypot(character.x - loc.x, character.y - loc.y) < 150) return;
	await go({ map: loc.map, x: loc.x, y: loc.y + NPC_STAND_Y });
}
async function buy_from_npc(name, qty, npc) {
	const cost = (G.items[name].g || 0) * qty;
	if (G.items[name].cash || character.gold - cost < CFG.gold_reserve) throw { reason: "gold_reserve" };
	npc = npc || shop_for(name);
	if (!npc) throw { reason: "no_shop", name };
	await go_npc(npc);
	await wait_budget(1, RESERVE.errand);
	tag_spend(spend_cat_of(name));
	return T(buy(name, qty));
}
// Make sure one upgrade/compound scroll is in the bags (buy one; wait up to 3s for it to arrive)
async function ensure_scroll(scroll) {
	if (find_slot(scroll, 0) >= 0) return;
	await buy_from_npc(scroll, 1);
	if (!(await until(() => find_slot(scroll, 0) >= 0, 3000))) throw { reason: "scroll_missing", scroll };
}
// Guide rows: action.level = INPUT level; request.level = target
function input_level(a, row) {
	if (row?.request?.name === a.name && Number.isFinite(row.request.level)) return row.request.level - 1;
	return a.level || 0;
}
// Bag slots for n copies of a.name at level `from`: the slots the guide named (resources[].num) if they still hold
// the right item, else any matching unlocked copies
function input_slots(a, from, n) {
	const hinted = (a.resources || []).map((r) => r.num).filter((k) => {
		const i = character.items[k];
		return i && i.name === a.name && (i.level || 0) === from && !i.l;
	});
	if (hinted.length >= n) return hinted.slice(0, n);
	if (n === 1) { const k = find_slot(a.name, from); return k >= 0 ? [k] : null; }
	return find_slots(a.name, from, n);
}
// Merchant 30+: massproduction halves the next upgrade/compound (a one-use buff that lasts 10s): cast it right before
async function mass_production() {
	if (character.ctype !== "merchant" || character.s?.massproduction || !G.skills.massproduction || !can_use("massproduction")) return;
	await T(use_skill("massproduction"), 3000).catch(() => {});
	await until(() => !!character.s?.massproduction, 1500);
}
// Lower odds are accepted when a failure can't cost anything irreplaceable:
//  - NPCs sell the item (failure costs gold): min_chance_rebuyable;
//  - another copy at the same level or higher remains (bags or worn): min_chance_spare.
function chance_floor(name, base, k, level) {
	if (shop_for(name) && !G.items[name]?.cash) return Math.min(base, CFG.min_chance_rebuyable);
	if (k !== undefined) {
		const lv = level ?? (character.items[k]?.level || 0);
		const spares = character.items.filter((i, n) => n !== k && i && i.name === name && (i.level || 0) >= lv).length +
			Object.values(character.slots || {}).filter((i) => i && i.name === name && (i.level || 0) >= lv).length;
		if (spares > 0) return Math.min(base, CFG.min_chance_spare);
	}
	return base;
}
// Develop: the highest-level spare in the bags (never worn gear) still below the target; -1 if none
function develop_pick(name, target) {
	let k = -1;
	character.items.forEach((i, n) => { if (i && i.name === name && !i.l && (i.level || 0) < target && (k < 0 || (i.level || 0) > (character.items[k].level || 0))) k = n; });
	return k;
}
// Upgrade scroll for an item at a level: scroll0/1/2 for the item's grade at that level (normal/high/rare)
const upgrade_scroll = (name, level) => "scroll" + Math.max(0, item_grade({ name, level }));
// One upgrade step from a guide row. If the exact input isn't owned (a "develop" step), take the best spare below
// the target (or buy a +0) and upgrade it one level. Gated by the server's own success preview and chance_floor().
async function run_upgrade(a, row) {
	let from = input_level(a, row), scroll = a.scroll || upgrade_scroll(a.name, from);
	const target = row?.request?.name === a.name && row.request.level ? row.request.level : from + 1;
	let ks = input_slots(a, from, 1);
	if (!ks) {
		let k = develop_pick(a.name, target);
		if (k < 0 && shop_for(a.name)) {
			await buy_from_npc(a.name, 1);
			await until(() => develop_pick(a.name, target) >= 0, 3000); // the bought item arrives with the next update
			k = develop_pick(a.name, target);
		}
		if (k < 0) throw { reason: "input_missing", want: `${a.name} below +${target}` };
		from = character.items[k].level || 0;
		scroll = upgrade_scroll(a.name, from);
		ks = [k];
		game_log(`develop ${a.name}: +${from} → +${from + 1} (toward +${target})`, C.info);
	}
	if (!has_computer()) await go("upgrade");
	await ensure_scroll(scroll);
	if (!has_computer()) await go("upgrade"); // buying the scroll may have walked us to another NPC
	const k = character.items[ks[0]]?.name === a.name ? ks[0] : develop_pick(a.name, from + 1);
	if (k < 0) throw { reason: "input_missing", want: `${a.name}+${from}` };
	await wait_budget(1, RESERVE.errand);
	let preview = await T(upgrade(k, find_slot(scroll, 0), null, true)); // last arg true = preview only: {chance}
	let floor = chance_floor(a.name, CFG.min_upgrade_chance, k, from);
	if (scroll === "scroll2") floor = Math.max(floor, CFG.upgrade_high.min_chance); // expensive copies: never a coin flip
	let off = null;
	if (preview && !(preview.chance >= floor)) { // v24.81: the next scroll up may lift it over (cheaper than an offering)
		const hs = "scroll" + (Math.max(0, item_grade({ name: a.name, level: from })) + 1), hc = G.items[hs]?.g;
		if (hs !== scroll && hc && hc <= (CFG.upgrade_boost_max || 0) && !(shop_for(a.name) && !G.items[a.name]?.cash) && gold_ok(hc) && character.gold - hc >= CFG.gold_reserve) {
			await ensure_scroll(hs);
			if (!has_computer()) await go("upgrade");
			await wait_budget(1, RESERVE.errand);
			const p3 = await T(upgrade(k, find_slot(hs, 0), null, true)).catch(() => null);
			if (p3?.chance >= floor) { game_log(`upgrade ${a.name}: ${hs} lifts +${from + 1} from ${Math.round(preview.chance * 100)}% to ${Math.round(p3.chance * 100)}%`, C.info); preview = p3; scroll = hs; }
		}
	}
	if (preview && !(preview.chance >= floor)) { // a Primling (or other allowed offering) in the bags may lift it over
		const ok_ = character.items.findIndex((i) => i && (CFG.upgrade_high.offerings || []).includes(i.name) && !i.l);
		if (ok_ >= 0) {
			await wait_budget(1, RESERVE.errand);
			const p2 = await T(upgrade(k, find_slot(scroll, 0), ok_, true)).catch(() => null);
			if (p2?.chance >= floor) { preview = p2; off = ok_; game_log(`upgrade ${a.name}: using ${character.items[ok_].name} (${Math.round(p2.chance * 100)}%)`, C.info); }
		}
	}
	if (!preview || !(preview.chance >= floor)) throw { reason: "low_chance", chance: preview?.chance };
	await mass_production();
	await wait_budget(1, RESERVE.errand);
	const r = await T(upgrade(k, find_slot(scroll, 0), off), 60_000); // the server takes 500·L·√L ms (+7: ~9s, +9: 13.5s)
	game_log(`upgrade ${a.name} +${from}→+${from + 1} (${(preview.chance * 100).toFixed(0)}%): ${r?.success ? "OK" : "FAILED"}`, r?.success ? C.ok : C.bad);
	log_ev("upgrade", { item: a.name, from, chance: +preview.chance.toFixed(3), ok: !!r?.success });
	return r;
}
// One compound step: three copies at level `from` + a compound scroll (cscroll0/1/2 by grade) → one at from+1.
// Failure destroys all three, hence the same success gate as upgrades.
async function run_compound(a, row, floor) {
	const from = input_level(a, row);
	const scroll = a.scroll || "cscroll" + Math.max(0, item_grade({ name: a.name, level: from }));
	if (!input_slots(a, from, 3)) throw { reason: "input_missing", want: `3x ${a.name}+${from}` }; // before walking anywhere
	if (!has_computer()) await go("compound");
	await ensure_scroll(scroll);
	if (!has_computer()) await go("compound");
	const ks = input_slots(a, from, 3);
	if (!ks) throw { reason: "input_missing", want: `3x ${a.name}+${from}` };
	await wait_budget(1, RESERVE.errand);
	const preview = await T(compound(ks[0], ks[1], ks[2], find_slot(scroll, 0), null, true));
	if (!preview || !(preview.chance >= (floor ?? chance_floor(a.name, CFG.min_compound_chance)))) throw { reason: "low_chance", chance: preview?.chance };
	await mass_production();
	await wait_budget(1, RESERVE.errand);
	const r = await T(compound(ks[0], ks[1], ks[2], find_slot(scroll, 0)), 40_000); // the server takes 10s to combine
	game_log(`compound ${a.name} +${from}→+${from + 1} (${(preview.chance * 100).toFixed(0)}%): ${r?.success ? "OK" : "FAILED"}`, r?.success ? C.ok : C.bad);
	log_ev("compound", { item: a.name, from, chance: +preview.chance.toFixed(3), ok: !!r?.success });
	return r;
}

// Own compounding (CFG.compound_auto). A group = one item name at one level with >= 3 spare copies across bags and
// bank. Bank copies are fetched on the next bank visit (bag_plan) and kept in the bags until compounded.
const compound_key = (name, level) => `cmp:${name}:${level}`;
function compound_spare(it, k, needed) {
	const def = it && G.items[it.name];
	// v24.73: a copy a member would wear is no longer left out. Three skull amulets sat in the merchant's bags, each
	// "wanted" for one empty amulet slot, so there was never a set of three; the +1 goes to whoever wanted the +0.
	// (v24.87: titled copies too — the server doesn't check titles; the result is the first copy, so a titled one goes first)
	return !!def?.compound && !it.l && !it.b && !needed.has(k) && (it.level || 0) < cmp_top(it.name) &&
		!CFG.keep.includes(it.name);
}
// Report: three or more equal copies in the bags that aren't being compounded, and why
function compound_why() {
	const by = {}, needed = needed_slots(), groups = compound_groups();
	character.items.forEach((it, k) => { if (it && G.items[it.name]?.compound) (by[compound_key(it.name, it.level || 0)] = by[compound_key(it.name, it.level || 0)] || []).push([it, k]); });
	const out = [];
	for (const key in by) {
		const L = by[key], [it] = L[0];
		if (L.length < 3 || groups.some((g) => g.key === key)) continue;
		const lv = it.level || 0;
		const why_ = skipped(key) ? `paused ${mins(state.gear_skip[key])} (${skip_why[key] || "?"})` : lv >= cmp_top(it.name) ? `+${lv} is its ceiling here (max +${CFG.compound_max_level}, or the odds were under ${Math.round(CFG.compound_min_chance * 100)}%)`
			: CFG.keep.includes(it.name) ? "on the keep list" : L.some(([i]) => i.l || i.b) ? "locked or bound copies" : L.some(([i]) => i.p) ? "titled copies" : L.some(([, k]) => needed.has(k)) ? "copies held for a quest or project"
			: !CFG.compound_auto ? "compound_auto is off" : !is_merchant() && merchant_does_it() ? "the merchant compounds" : "?";
		out.push(`${it.name}+${lv} x${L.length}: ${why_}`);
	}
	return out;
}
// Compound ceilings (v24.15): item -> { level, at } where the server's odds were under our floor; 7 days (saved)
const cmp_cap = (name, level) => { state.cmp_caps[name] = { level, at: Date.now() }; cmp_cache = null; };
const cmp_top = (name) => {
	const c = state.cmp_caps[name];
	let top = Math.min(CFG.compound_max_level, c && Date.now() - c.at < 7 * 86400_000 ? c.level : Infinity);
	// a refusal for its odds paused before v24.15 (a 6h skip, no ceiling recorded) counts too
	for (let L = 0; L < top; L++) if (skipped(compound_key(name, L)) && /low_chance/.test(skip_why[compound_key(name, L)] || "")) { top = L; break; }
	return top;
};
// A compound piece at its ceiling that no member wants: it can't go further and nobody wears it (v24.15). The merchant
// sells it (an NPC pays its value: ~134k for an Amulet of HP +2) — it held 12 of those, refetched every 6h.
function dead_compound(it) {
	const def = it && G.items[it.name];
	return !!def?.compound && !it.l && !it.b && !it.p && (it.level || 0) > 0 && (it.level || 0) >= cmp_top(it.name) &&
		!CFG.keep.includes(it.name) && !wanted_by_member(it);
}
let cmp_cache = null; // { key, at, list }: keyed by bags + bank snapshot + pauses; bag_class asks once per item
function compound_groups(needed) {
	// while the merchant is online it compounds for everyone (shared bank); fighters hand it their spares instead
	if (!CFG.compound_auto || (!is_merchant() && merchant_does_it())) return [];
	const key = character.items.map((i) => (i ? `${i.name}${i.level || 0}${i.l ? "l" : ""}` : "")).join() + "|" +
		(state.bank_gear || []).length + "|" + Object.keys(state.gear_skip).filter((k) => k.startsWith("cmp:") && skipped(k)).join();
	if (cmp_cache && cmp_cache.key === key && Date.now() - cmp_cache.at < 2000) return cmp_cache.list;
	needed = needed || needed_slots();
	const by = {};
	const add = (it, where, k) => {
		const key = compound_key(it.name, it.level || 0);
		const g = (by[key] = by[key] || { name: it.name, level: it.level || 0, key, bags: [], bank: 0 });
		if (where === "bags") g.bags.push(k); else g.bank++;
	};
	character.items.forEach((it, k) => { if (compound_spare(it, k, needed)) add(it, "bags", k); });
	for (const it of state.bank_gear || []) if (compound_spare(it, -1, needed)) add(it, "bank");
	for (const g of Object.values(by)) g.bags.sort((a, b) => (character.items[b]?.p ? 1 : 0) - (character.items[a]?.p ? 1 : 0));
	const list = Object.values(by).filter((g) => g.bags.length + g.bank >= 3 && !skipped(g.key))
		.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)); // cheapest scrolls / best odds first
	cmp_cache = { key, at: Date.now(), list };
	return list;
}
// Bank copies to fetch so a group reaches 3 in the bags (task_bank entries; one attempt per copy per 2h)
// Bank copies to fetch for up to compound_per_run whole sets in one bank visit (cheapest level first), within the free
// bag slots minus 6 for loot. Keys get a 10-min retry guard (bag_plan), not the 2h one: a successful fetch lowers the
// bank count anyway.
function compound_fetches(groups) {
	const out = [];
	let room = Math.max(0, character.esize - 6), sets = CFG.compound_per_run;
	for (const g of groups) {
		if (sets <= 0 || room <= 0) break;
		const n_sets = Math.min(sets, Math.floor((g.bags.length + g.bank) / 3));
		const copies = Math.min(g.bank, room, Math.max(0, n_sets * 3 - g.bags.length));
		for (let i = 0; i < copies; i++) out.push({ name: g.name, level: g.level, key: `${g.key}:${i}` });
		room -= copies;
		sets -= Math.floor((g.bags.length + copies) / 3);
	}
	return out;
}
// Bag slots held for a group: the copies that, with the bank's, make up complete sets of three
function compound_slots(needed) {
	const keep = new Set();
	for (const g of compound_groups()) g.bags.slice(0, Math.floor((g.bags.length + g.bank) / 3) * 3).forEach((k) => keep.add(k));
	return keep;
}
// Compound every complete group in the bags (up to compound_per_run). A failed preview pauses that group 6h; a
// result that's a member's upgrade is picked up by equip_upgrades/share_gear.
async function task_compound() {
	let n = 0;
	for (let guard = 0; guard < CFG.compound_per_run * 2 && n < CFG.compound_per_run; guard++) {
		if (state.errand) state.errand_at = Date.now(); // progress keeps the errand lock
		const g = compound_groups().find((x) => x.bags.length >= 3);
		if (!g) break;
		// rebuyable odds only when the three copies are cheap: a +L copy embodies 3^L base copies (v23.1)
		const wanted = gear_takers().filter((m) => m.ctype !== "merchant").some((m) => gear_gain({ name: g.name, level: g.level + 1 }, m.ctype, m.g));
		const floor = Math.min(shop_for(g.name) && !G.items[g.name]?.cash && 3 * (G.items[g.name]?.g || 0) * Math.pow(3, g.level) <= CFG.rebuy_loss_max
			? CFG.compound_min_chance_rebuyable : CFG.compound_min_chance, wanted ? CFG.compound_min_chance_wanted : 1);
		const sc_cost = G.items["cscroll" + Math.max(0, item_grade({ name: g.name, level: g.level }))]?.g || 0;
		if (!gold_ok(sc_cost)) { town_reason.compound = `gold budget (${g.name}+${g.level} needs a ${fmt_k(sc_cost)} scroll)`; break; }
		try {
			// resources: the exact spare slots, so run_compound never grabs a guide-needed copy of the same item
			const before = g.bags.slice(0, 3).map((k) => character.items[k]);
			const r = await run_compound({ name: g.name, level: g.level, resources: g.bags.map((num) => ({ num })) }, null, floor);
			n++;
			if (!r?.success) {
				await sleep_ms(500); // let the bag update arrive
				// inputs still there = the server refused without rolling (not a real failure): don't retry soon, or
				// each retry would cost a town trip
				const untouched = before.every((it, i) => character.items[g.bags[i]] === it);
				skip(g.key, untouched ? 6 * 3600_000 : 600_000, untouched ? `refused: ${why(r)}` : "last compound failed");
			}
		} catch (e) {
			// only verdicts about the items themselves are worth a 6h pause; walking/transient failures retry in 10 min
			const item_verdict = ["low_chance", "not_combinable", "mismatch"].includes(why(e));
			// v24.15: odds don't change — that level is this item's compound ceiling (7 days): no more fetching the copies
			// out of the bank every 6h to be refused again
			if (why(e) === "low_chance") cmp_cap(g.name, g.level);
			if (item_verdict) n++; // v24.74: a verdict on one set is a result — it used to pause all compounding 15 min ("achieved nothing")
			skip(g.key, item_verdict ? 6 * 3600_000 : 600_000, `${why(e)}${e?.chance !== undefined ? ` (${Math.round(e.chance * 100)}%)` : ""}`); // no gold: retry in 10 min
			town_reason.compound = `${g.name}+${g.level}: ${why(e)}`;
			game_log(`compound ${g.name}+${g.level}: ${why(e)}; retrying in ${item_verdict ? "6h" : "10 min"}`, C.dim);
		}
	}
	return n;
}

// ---- Own upgrading (CFG.upgrade_auto) ----
// Highest level ≤ upgrade_max_level reachable with scroll0/scroll1 (0 = none)
// high: also scroll2 levels, up to upgrade_high.max_level (weapon slots only, decided by the caller)
function upgrade_target(name, high = false) {
	let to = 0;
	const max = high ? CFG.upgrade_high.max_level : CFG.upgrade_max_level;
	for (let l = 1; l <= max; l++) {
		const sc = upgrade_scroll(name, l - 1);
		if ((sc === "scroll2" && !high) || sc === "scroll3" || !G.items[sc]) break;
		to = l;
	}
	return to;
}
// Gold a project may draw on: our own above the reserve; the merchant also counts fighters' gold above fund_keep
// (they send it on supply runs when a step needs it)
function upgrade_gold() {
	let g = character.gold - (is_merchant() ? CFG.merchant.donate.keep : CFG.gold_reserve);
	if (is_merchant()) for (const p of partners()) g += Math.max(0, (p.gold || 0) - CFG.merchant.fund_keep);
	return Math.max(0, g);
}
// Gold for a +0 copy and the scrolls up to `to` (no failures counted)
function upgrade_cost(name, to) {
	let c = G.items[name]?.g || 0;
	for (let l = 0; l < to; l++) c += G.items[upgrade_scroll(name, l)]?.g || 1e9;
	return c;
}
// Upgrade ceilings (v24.5): item -> { level, at } where a project of it was stopped by its odds or its failures.
// Kept 7 days (saved). A re-pick aims no higher, and is skipped while a copy at that level exists anywhere.
const upg_cap = (name, level) => { state.upg_caps[name] = { level, at: Date.now() }; };
const upg_cap_level = (name) => { const c = state.upg_caps[name]; return c && Date.now() - c.at < 7 * 86400_000 ? c.level : Infinity; };
const best_level_held = (name) => character.items.reduce((m, i) => (i && i.name === name && !i.l ? Math.max(m, i.level || 0) : m), -1);
// Best project: the NPC-sold piece whose upgraded copy beats a member's worn piece by the most points per gold
// v24.82: the server's base upgrade odds by the item's starting grade (design/upgrades.py), result level 1..10
const UPG_ODDS = { 0: [0.9999999, 0.98, 0.95, 0.70, 0.60, 0.40, 0.25, 0.15, 0.07, 0.024], 1: [0.99998, 0.97, 0.94, 0.68, 0.58, 0.38, 0.24, 0.14, 0.066, 0.018],
	2: [0.97, 0.94, 0.92, 0.64, 0.52, 0.32, 0.232, 0.13, 0.062, 0.015] };
const upg_odds = (name, to) => (UPG_ODDS[Math.min(2, Math.max(0, item_grade({ name, level: 0 })))] || UPG_ODDS[0])[to - 1] || 0;
// Expected gold for one copy at +to, buying again after each failure: C(l) = (C(l-1) + scroll) / odds(l)
function upgrade_expected(name, to) {
	let c = G.items[name]?.g || 0;
	for (let l = 1; l <= to; l++) c = (c + (G.items[upgrade_scroll(name, l - 1)]?.g || 1e9)) / Math.max(0.01, upg_odds(name, l));
	return Math.round(c);
}
// The most one step of a project can cost: the scroll (the next one up when the boost is used) and a copy if none is held
const upg_step_cost = (name, top) => {
	const lv = Math.max(0, top), g = Math.max(0, item_grade({ name, level: lv }));
	return (G.items["scroll" + (g + 1)]?.g <= (CFG.upgrade_boost_max || 0) ? G.items["scroll" + (g + 1)].g : G.items["scroll" + g]?.g || 0) + (top < 0 ? G.items[name]?.g || 0 : 0);
};
// Is it sold by an NPC we can find? (cached: G doesn't change)
const sold_c = new Map();
const sold_by_npc = (name) => { if (!sold_c.has(name)) sold_c.set(name, !!shop_for(name)); return sold_c.get(name); };
function pick_upgrade() {
	const room = gold_room(), gold = Math.min(upgrade_gold(), room), budget = gold * CFG.upgrade_spend, H = CFG.upgrade_high;
	if (!CFG.upgrade_auto) return null; // (v24.86: a budget at 0 still lets weapon projects through; the rest fail cost > cap)
	const takers = gear_takers().filter((m) => m.ctype !== "merchant");
	let best = null;
	for (const name in G.items) {
		const def = G.items[name];
		if (!def.upgrade || !GEAR.has(def.type) || def.cash || skipped("upg:" + name) || CFG.quest_craft_skip.includes(name)) continue;
		// v24.71: only what an NPC sells. The check used to come after the winner was chosen — over every item in the
		// game: when a piece nobody sells scored best (pyjamas, for Torlis), there was no project at all, ever.
		if (!sold_by_npc(name)) continue;
		// normal target (scroll0/1 levels) and, for weapon slots, the high target (scroll2 levels too)
		const targets = [];
		const WP = CFG.upgrade_weapon?.enabled && def.type === "weapon" ? Math.min(CFG.upgrade_weapon.to, upgrade_target(name)) : 0;
		if (WP) targets.push([WP, Infinity, false, true]); // v24.86: a weapon goes straight to +7, no budget
		else for (let L = 1, T = upgrade_target(name); L <= T; L++) targets.push([L, budget, false]); // v24.82: every level, by expected cost
		if (H?.enabled) targets.push([upgrade_target(name, true), gold * H.spend, true]);
		const capL = upg_cap_level(name);
		for (let [to, cap, high, weapon] of targets) {
			if (to > capL) to = capL; // v24.5: no higher than a past project of it reached before its odds/failures stopped it
			if (!to) continue;
			const cost = high ? upgrade_cost(name, to) : upgrade_expected(name, to);
			if (cost > cap) continue;
			// a copy at the target level already exists: ours, the bank's, or (v23.2) in another member's bags or worn
			// (v24.74: a copy another member WEARS no longer counts — a wand+7 on one caster blocked the other's for good)
			if (best_level_held(name) >= to || (state.bank_gear || []).some((i) => i.name === name && (i.level || 0) >= to) || party_holds_level(name, to, true)) continue;
			// v24.7: a lower copy that's already an upgrade for a fighter is delivered first (then judged against): a project
			// held it as its input, undelivered, and rolled it at 50% odds
			const ready = (i) => i && i.name === name && !i.l && (i.level || 0) < to && takers.some((m) => gear_gain(i, m.ctype, m.g));
			if (character.items.some(ready) || (state.bank_gear || []).some(ready)) continue;
			for (const m of takers) {
				const r = gear_gain({ name, level: to }, m.ctype, m.g);
				if (!r || (high && !H.slots.includes(r.slot))) continue;
				// worth (gain x gold per point) less the expected cost; a scroll2 project only when nothing else is worth doing
				const v = weapon ? 1e12 + r.gain : high ? -1e12 + r.gain / cost : r.gain * CFG.upgrade_gold_per_pt - cost;
				if (!high && !weapon && v <= 0) continue;
				if (!best || v > best.v) best = { name, to, for: m.name, slot: r.slot, gain: Math.round(r.gain), cost, v, high, weapon: !!weapon };
			}
		}
	}
	return best;
}
// Why there's no project (report): our own pieces that would win once upgraded, and the best shop pieces with what
// stops each
function upgrade_why() {
	const out = [];
	if (!is_merchant()) {
		const own = [...character.items.filter((i) => i && !i.l && GEAR.has(G.items[i.name]?.type)).map((i) => [i, "bags"]), ...(state.bank_gear || []).map((i) => [i, "bank"])]
			.map(([i, w]) => [i, w, set_piece_plan(i.name, i.level || 0)]).filter(([, , pl]) => pl).sort((a, b) => b[2].gain - a[2].gain)[0];
		out.push(own ? `ours next: ${own[0].name}+${own[0].level || 0} (${own[1]}) → +${own[2].to} (+${own[2].gain} pts)` : "nothing we own would win once upgraded");
	}
	if (is_merchant() || !merchant_does_it()) {
		const gold = Math.min(upgrade_gold(), gold_room()), budget = gold * CFG.upgrade_spend, takers = gear_takers().filter((m) => m.ctype !== "merchant"), rows = [];
		for (const name in G.items) {
			const def = G.items[name];
			if (!def.upgrade || !GEAR.has(def.type) || def.cash || !sold_by_npc(name)) continue;
			let g = null, to = 0, cost = 0;
			for (let L = 1, T = Math.min(upgrade_target(name), upg_cap_level(name)); L <= T; L++) for (const m of takers) {
				const r = gear_gain({ name, level: L }, m.ctype, m.g), c = upgrade_expected(name, L);
				if (r && r.gain * CFG.upgrade_gold_per_pt - c > 0 && (!g || r.gain * CFG.upgrade_gold_per_pt - c > g.net)) { g = { gain: r.gain, who: m.name, net: r.gain * CFG.upgrade_gold_per_pt - c }; to = L; cost = c; }
			}
			if (!g) continue;
			const stop = skipped("upg:" + name) ? "paused" : cost > budget ? `expected cost ${fmt_k(cost)}, budget ${fmt_k(Math.max(0, budget))}`
				: best_level_held(name) >= to || (state.bank_gear || []).some((i) => i.name === name && (i.level || 0) >= to) || party_holds_level(name, to, true) ? "a spare copy at that level exists already"
				: "eligible";
			rows.push({ name, to, g, stop });
		}
		rows.sort((a, b) => b.g.gain - a.g.gain);
		out.push(rows.length ? `shop: ${rows.slice(0, 4).map((r) => `${r.name}+${r.to} for ${r.g.who} +${Math.round(r.g.gain)} pts — ${r.stop}`).join("; ")}` : "shop: no upgradable piece at its reachable level beats what anyone wears");
	}
	return out.length ? ` | ${out.join(" | ")}` : "";
}
// v24.91: is the project still worth finishing — would its target still beat what its member wears? (Sanala kept
// building a wand to +3, a project from when she held a +5 staff, after she had been handed a +7 wand.)
function upg_still_wanted(P) {
	if (!P) return false;
	const m = gear_takers().find((x) => x.name === P.for);
	if (!m || !m.g?.w) return true; // its member isn't heard from: keep it for now
	return !!gear_gain({ name: P.name, level: P.to }, m.ctype, m.g);
}
function upg_drop_if_stale() {
	const P = state.upg;
	if (!P || upg_still_wanted(P)) return false;
	game_log(`upgrade project dropped: ${P.name} +${P.to} would no longer beat what ${P.for} wears`, C.dim);
	log_ev("upgrade_drop", { item: P.name, to: P.to, for: P.for });
	state.upg = null; state.upg_pick_at = 0;
	return true;
}
// Is there upgrade work for a town run? Picks a project (every 10 min at most) when there's none.
function upgrade_due() {
	if (!CFG.upgrade_auto) return false;
	upg_drop_if_stale(); // v24.91
	set_piece_start(); // v24.69: a set piece in our bags that wins once upgraded
	if (merchant_does_it()) {
		// v21.2: the merchant runs projects now; a fighter's own one would sit forever, holding its copies in the bags
		// (v24.67: except our own project on a token piece — the copy is ours, and the merchant can't buy one)
		if (state.upg && !is_merchant() && !state.upg.own) { game_log(`upgrade project ${state.upg.name} handed to the merchant`, C.dim); state.upg = null; }
		if (!state.upg?.own) return false;
	}
	const now = Date.now();
	if (!state.upg && now - (state.upg_pick_at || 0) > 600_000) {
		state.upg_pick_at = now;
		state.upg = pick_upgrade();
		if (state.upg) game_log(`upgrade project: ${state.upg.name} → +${state.upg.to} for ${state.upg.for}'s ${state.upg.slot} (+${state.upg.gain} pts, ~${Math.round(state.upg.cost / 1000)}k)`, C.info);
	}
	if (is_merchant() && state.fund_need > 0 && character.gold - CFG.merchant.donate.keep < state.fund_need) return false; // wait for funding
	return !!state.upg && !skipped("upg:" + state.upg.name) && best_level_held(state.upg.name) < state.upg.to;
}
async function task_upgrade() {
	let n = 0;
	for (let i = 0; i < (is_merchant() ? CFG.merchant_upgrade_steps : CFG.upgrade_steps_per_run); i++) {
		if (state.errand) state.errand_at = Date.now();
		if (upg_drop_if_stale()) break; // v24.91: something better is worn now
		const P = state.upg;
		if (!P) break;
		const top = best_level_held(P.name);
		if (top >= P.to) {
			game_log(`upgrade project done: ${P.name}+${top} for ${P.for}`, C.ok);
			state.upg = null;
			state.upg_pick_at = 0; // v24.85: the next project is picked at once (there was a 10-min gap per project)
			break;
		}
		const step = (G.items[upgrade_scroll(P.name, Math.max(0, top))]?.g || 0) + (top < 0 ? G.items[P.name]?.g || 0 : 0);
		// over the party's gold budget: don't ask the fighters for gold we then couldn't spend (v19.6)
		if (!P.weapon && step > gold_room()) { town_reason.upgrade = `gold budget: next step ${fmt_k(step)}, room ${fmt_k(Math.max(0, gold_room()))}`; break; }
		// the merchant asks for funding when the next step (scroll, and a copy if none is held) is beyond its gold
		if (is_merchant() && character.gold - CFG.merchant.donate.keep < step) {
			state.fund_need = P.weapon ? Math.max(step * 3, (P.cost || 0) - (P.spent || 0)) : Math.min(P.cost, step * 3); // v24.86: a weapon asks for what's left
			game_log(`upgrade ${P.name}: waiting for ${fmt_k(state.fund_need)} gold from the fighters`, C.dim);
			break;
		}
		if (!(P.weapon ? character.gold - step >= (is_merchant() ? CFG.merchant.donate.keep : CFG.gold_reserve) : gold_ok(step))) { town_reason.upgrade = `gold budget: next step ${fmt_k(step)}, room ${fmt_k(Math.max(0, gold_room()))}`; break; }
		state.fund_need = 0;
		// v23.1: the gold the project's steps cost (copy + scrolls), counted per step — measuring from total gold let loot,
		// sales, potion buys and the fighters' funding move it
		if (P.spent === undefined) P.spent = 0;
		P.max = Math.max(P.max ?? -1, top); // v24.7: the highest level this project reached (a failure destroys the copy)
		// (v24.85: against the expected cost with failures, not the cost if every step succeeds)
		if (!P.weapon && P.spent > Math.max(P.cost || 0, upgrade_expected(P.name, P.to) - (P.own ? G.items[P.name]?.g || 0 : 0)) * CFG.upgrade_abort_x) {
			upg_cap(P.name, Math.max(0, P.max));
			skip("upg:" + P.name, 24 * 3600_000, "over budget");
			game_log(`upgrade ${P.name}: failures pushed the cost past ${CFG.upgrade_abort_x}x the estimate; stopped${top >= 1 ? ` at +${top}` : ""}`, C.bad);
			state.upg = null;
			break;
		}
		const g0 = character.gold;
		try {
			await run_upgrade({ name: P.name }, { request: { name: P.name, level: P.to } });
			// v24.85: at most what the step can cost (a scroll, a copy if one was bought). The gold delta alone counted a
			// transfer to the merchant made meanwhile: Torlis's shoes1 project "cost 2.5x its estimate" at +1 and stopped.
			P.spent += Math.min(Math.max(0, g0 - character.gold), upg_step_cost(P.name, top));
			n++;
		} catch (e) {
			P.spent += Math.min(Math.max(0, g0 - character.gold), upg_step_cost(P.name, top));
			// v24.7: a transient error (walk/call timeout, distance...) pauses the project, it doesn't end it: ending it freed the
			// copy (banked, never a project input again), and the re-pick rebought from +0 with the abort budget reset
			if (TRANSIENT.has(why(e))) { skip("upg:" + P.name, pause_ms(e, 600_000), why(e)); game_log(`upgrade ${P.name}: ${why(e)}; retrying in 10 min`, C.dim); break; }
			// v24.5: refused for its odds, the next step will be refused again: remember the level reached, so the project
			// isn't re-picked a day later to rebuild a copy at that level from +0 (and stopped there again, every day)
			if (e?.chance !== undefined) upg_cap(P.name, Math.max(0, P.max ?? top));
			skip("upg:" + P.name, pause_ms(e, 24 * 3600_000), why(e) + (e?.chance !== undefined ? ` (${Math.round(e.chance * 100)}%)` : ""));
			game_log(`upgrade ${P.name}: ${why(e)}; project stopped${top >= 1 ? ` at +${top}` : ""}`, C.dim);
			state.upg = null; // the copy reached so far is free again (equip/share judge it)
			break;
		}
	}
	return n;
}
// ---- Crafting for power (CFG.craft_power) ----
let quest_inputs = null; // every input of a quest recipe (Cole etc.): never spent on other crafts
let craft_cache = null; // { at, v }: bag_plan/town_due ask often; recipes scan is ~1000 entries
function craft_pick() {
	if (craft_cache && Date.now() - craft_cache.at < 10_000) return craft_cache.v;
	const v = craft_pick_raw();
	craft_cache = { at: Date.now(), v };
	return v;
}
function craft_pick_raw() {
	if (!CFG.craft_power || (!is_merchant() && merchant_does_it())) return null;
	if (!quest_inputs) { quest_inputs = new Set(); for (const id in G.craft || {}) if (G.craft[id].quest) for (const [, n] of G.craft[id].items || []) quest_inputs.add(n); }
	const gold = upgrade_gold(), takers = gear_takers().filter((m) => m.ctype !== "merchant");
	let best = null;
	for (const id in G.craft || {}) {
		const r = G.craft[id], d = G.items[id];
		if (!d || !GEAR.has(d.type) || r.quest || skipped("craft:" + id) || CFG.quest_craft_skip.includes(id) || (r.cost || 0) > gold * CFG.craft_spend) continue;
		if (held_any(id) || (state.bank_gear || []).some((i) => i.name === id)) continue;
		const inputs_ok = (r.items || []).every(([q, n, l]) => {
			const dn = G.items[n];
			return dn && !GEAR.has(dn.type) && !l && !quest_inputs.has(n) && !state.needs.has(n) && owned_in_bags_or_bank(n, 0) >= q;
		});
		if (!inputs_ok) continue;
		for (const m of takers) {
			const g = gear_gain({ name: id, level: 0 }, m.ctype, m.g);
			if (g && (!best || g.gain > best.gain)) best = { id, for: m.name, slot: g.slot, gain: Math.round(g.gain), cost: r.cost || 0 };
		}
	}
	return best;
}
const craft_inputs_in_bags = (id) => (G.craft[id]?.items || []).every(([q, n]) => held_any(n) >= q);
async function task_craft_power() {
	const c = craft_pick();
	if (!c || !craft_inputs_in_bags(c.id)) return 0;
	const r = G.craft[c.id];
	if (!gold_ok(r.cost)) return (town_reason.forge = "gold budget"), 0;
	if ((r.cost || 0) > character.gold - (is_merchant() ? CFG.merchant.donate.keep : CFG.gold_reserve)) {
		if (is_merchant()) state.fund_need = r.cost;
		return 0;
	}
	if (character.esize < 1) return 0;
	await go_npc(r.npc || "craftsman");
	await wait_budget(1, RESERVE.errand);
	tag_spend("crafting");
	const res = await T(auto_craft(c.id)).catch((e) => ({ failed: true, reason: why(e) }));
	const ok = res && !res.failed;
	game_log(`craft ${c.id} for ${c.for}'s ${c.slot} (+${c.gain} pts): ${ok ? "OK" : "FAILED " + (res?.reason || "")}`, ok ? C.ok : C.bad);
	log_ev("craft", { item: c.id, for: c.for, ok });
	craft_cache = null;
	if (!ok) skip("craft:" + c.id, pause_ms({ reason: res?.reason || "invalid" }, 6 * 3600_000), res?.reason || "failed");
	return ok ? 1 : 0;
}
// ---- Elixirs (CFG.elixir_auto) ----
const elixir_active = () => { const e = character.slots?.elixir; return !!e && !(e.expires && Date.parse(e.expires) <= Date.now()); };
const elixir_ok = (name) => { const d = G.items[name]; return !!d && d.type === "elixir" && !!d.duration && !d.withdrawal; };
function best_elixir() {
	let best = null;
	character.items.forEach((it, k) => {
		if (!it || it.l || !elixir_ok(it.name)) return;
		const sc = gear_score({ name: it.name, level: 0 });
		if (!best || sc > best.score) best = { k, name: it.name, score: sc };
	});
	return best;
}
const bank_elixir = () => (state.bank_gear || []).filter((i) => elixir_ok(i.name))
	.sort((a, b) => gear_score({ name: b.name }) - gear_score({ name: a.name }))[0] || null;
const elixir_buy_due = () => CFG.elixir_auto && character.ctype !== "merchant" && !elixir_active() && !best_elixir() && !bank_elixir() &&
	gold_ok(G.items[CFG.elixir_buy]?.g) &&
	character.gold >= CFG.elixir_buy_min_gold && !!G.items[CFG.elixir_buy] && !skipped("town:elixir");
async function drink_elixir() {
	if (!CFG.elixir_auto || character.ctype === "merchant" || character.rip || elixir_active()) return false;
	const b = best_elixir();
	if (!b || !can_spend(EMIT_COST.equip, RESERVE.errand)) return false;
	await T(equip(b.k)).then(() => game_log(`elixir: drank ${b.name}`, C.ok)).catch((e) => game_log(`elixir ${b.name}: ${why(e)}`, C.dim));
	return true;
}
async function task_elixir() {
	await buy_from_npc(CFG.elixir_buy, 1);
	await until(() => !!best_elixir(), 3000);
	return (await drink_elixir()) ? 1 : 0;
}
// ---- Exchange (CFG.exchange_auto) ----
function exchange_pick(needed = needed_slots()) {
	if (!CFG.exchange_auto || character.esize < 2) return -1;
	return character.items.findIndex((it, k) => {
		const d = it && G.items[it.name];
		return !!d?.e && EXCHANGE_TYPES.has(d.type) && !recipe_input(it.name) && (it.q || 1) >= d.e && !it.l && !needed.has(k) &&
			!CFG.keep.includes(it.name) && !CFG.exchange_skip.includes(it.name) && !skipped("exch:" + it.name);
	});
}
async function task_exchange() {
	let n = 0;
	for (let i = 0; i < 20; i++) {
		if (state.errand) state.errand_at = Date.now();
		const k = exchange_pick();
		if (k < 0) break;
		const it = character.items[k];
		try {
			await go_exchange({ name: it.name });
			const k2 = find_slot(it.name, it.level || 0);
			if (k2 < 0) break;
			await wait_budget(1, RESERVE.errand);
			const r = await T(exchange(k2), 30_000); // the exchange roll takes several seconds
			n++;
			game_log(`exchange ${it.name} → ${r?.reward || "?"}`, C.ok);
			log_ev("exchange", { item: it.name, reward: r?.reward || null });
		} catch (e) {
			skip("exch:" + it.name, pause_ms(e, 6 * 3600_000), why(e));
			game_log(`exchange ${it.name}: ${why(e)}; retrying in ${TRANSIENT.has(why(e)) ? "10 min" : "6h"}`, C.dim);
		}
	}
	return n;
}

// =====================================================================
// Bags: keep / sell / bank
// =====================================================================
// Junk: CFG.sell names, or (if auto_sell_gear, or while the bank is full) plain gear: +0, no title (.p), normal grade
// (item_grade 0), NPC value <= sell_max_value. Never locked/bound/kept/needed items.
const sell_plain_item = (it) => !!it && (CFG.sell_plain || []).includes(it.name) && !(it.level > 0) && !it.p && !it.l && !it.b;
function is_junk(item) {
	if (!item || item.l || item.b || CFG.keep.includes(item.name) || needed_slots().has(character.items.indexOf(item))) return false;
	if (CFG.sell.includes(item.name) || sell_plain_item(item)) return true;
	const def = G.items[item.name];
	if (!CFG.sell_junk) return false;
	if (!(CFG.auto_sell_gear || bank_is_full()) || !def || !GEAR.has(def.type)) return false; // bank full: selling is the only way to make room
	if (gear_wanted_by(item)) return false; // an upgrade for us or a party member
	return !(item.level > 0) && !item.p && item_grade(item) === 0 && item_value(item) <= CFG.sell_max_value;
}
// KEEP / SELL / BANK for one bag item (see the header). `needed` = slots holding copies the guide/quests need.
const purge_key = (it) => `${it.name}:${it.level || 0}${it.p ? ":" + it.p : ""}${it.stat_type ? ":" + it.stat_type : ""}`;
function bag_class(item, needed = needed_slots(), held_cmp) {
	if (!item) return "empty";
	if ((held_cmp || compound_slots(needed)).has(character.items.indexOf(item))) return "keep"; // waiting to be compounded
	if (is_merchant() && stand_hold().has(character.items.indexOf(item))) return "keep"; // stock for the stand
	const def = G.items[item.name];
	if (sell_plain_item(item) && !needed.has(character.items.indexOf(item)) && !CFG.keep.includes(item.name)) return "sell"; // before "fetched within the hour → keep"
	if (item.l || item.b || !def || CFG.keep.includes(item.name) || BAG_TYPES.has(def.type) ||
		item.name === CFG.hp_pot || item.name === CFG.mp_pot || needed.has(character.items.indexOf(item)) ||
		(Date.now() - (state.fetched[item.name] || 0) < 3600_000 && !(def.compound && (merchant_does_it() || is_merchant()))) ||
		(Date.now() - (state.fetched[item.name] || 0) < 7200_000 && GEAR.has(def.type) && !equip_paused(item) && self_taker_ok() && gear_gain(item, character.ctype, my_gear())) ||
		(GEAR.has(def.type) && !is_merchant() && !state.upg && set_piece_plan(item.name, item.level || 0)) ||
		(GEAR.has(def.type) && wanted_by_member(item))) return "keep"; // fetched within the hour (except compound copies the merchant handles), or an upgrade for one of us (v19.7)
	// bank purge (v24.7: after the keep rules, by the exact copy — a purge of a plain helmet+3 sold the project's helmet+3,
	// and a titled copy fetched for a fighter)
	if (CFG.sell_junk && is_merchant() && Date.now() - (state.purge[purge_key(item)] || 0) < 86_400_000) return "sell";
	if (CFG.sell_junk && is_merchant() && CFG.merchant.sell_dead_compounds && dead_compound(item)) return "sell"; // v24.15
	if (is_junk(item)) return "sell";
	return CFG.bank ? "bank" : "keep";
}
// Why bag_class says "keep" (report only; mirrors bag_class's keep branches in order)
function keep_reason(item, k, needed, cmp) {
	const def = G.items[item.name];
	if (cmp.has(k)) return "compound";
	if (is_merchant() && stand_hold().has(k)) return "stand";
	if (item.l || item.b) return "locked";
	if (!def) return "unknown";
	if (CFG.keep.includes(item.name)) return "keep-list";
	if (BAG_TYPES.has(def.type) || item.name === CFG.hp_pot || item.name === CFG.mp_pot) return "supplies";
	if (needed.has(k)) return travel_slots_held().has(k) ? "travel gear (worn)" : state.upg && item.name === state.upg.name ? "upgrade" : "guide/quest";
	if (Date.now() - (state.fetched[item.name] || 0) < 3600_000) return "fetched";
	if (Date.now() - (state.fetched[item.name] || 0) < 7200_000 && self_taker_ok()) return "fetched (for us)";
	if (GEAR.has(def.type) && wanted_by_member(item)) return "for party";
	return CFG.bank ? "other" : "no-bank";
}
// Bag slot indices whose item matches f
const slots_where = (f) => character.items.map((it, i) => (f(it) ? i : -1)).filter((i) => i >= 0);
// What a bank/sell visit would do now: slots to sell, slots to bank, item names to fetch from the bank, free slots
function bag_plan() {
	const needed = needed_slots();
	const cmp = compound_slots(needed);
	const sell = slots_where((i) => bag_class(i, needed, cmp) === "sell"), bank = slots_where((i) => bag_class(i, needed, cmp) === "bank");
	// Fetch a needed item when the bags are short of it and the bank has some, at most one attempt per item name every
	// 2 hours (persisted), whatever happens to the fetched copy. Gear: only when no copy at any level is in the bags or
	// worn (counting only +0 copies, or not counting worn ones, lets a fetched copy look missing again — a fetch/bank
	// loop). Stackables (quest materials): when the bags hold fewer than needed (v23.0: before, any copy in the bags
	// blocked the fetch, while quest progress counted bags + bank — "spores 12(+8 bank)/20" never farmed, fetched or
	// crafted). A fetched stack merges into the bag stack (the server's add_item), so the craft's one-stack rule is met.
	const worn = (n) => Object.values(character.slots || {}).filter((i) => i && i.name === n).length;
	const short_of = (n) => (G.items[n]?.s ? held_any(n) < (state.needs.get(n) || 1) && bank_share(n) > 0 : held_any(n) + worn(n) === 0);
	const fetch = [...state.needs.keys()].filter((n) => (state.bank_seen[n] || 0) > 0 && short_of(n) &&
		!BAG_TYPES.has(G.items[n]?.type) && Date.now() - (state.fetch_try[n] || 0) > 2 * 3600_000);
	{
		const c = craft_pick();
		if (c) for (const [q, n] of G.craft[c.id].items || []) if (held_any(n) < q && (state.bank_seen[n] || 0) > 0 &&
			Date.now() - (state.fetch_try["craft:" + n] || 0) > 1_800_000) fetch.push({ name: n, key: "craft:" + n });
	}
	merchant_fetch_give(fetch); // v25.0: merchant.js
	for (const n of hold_missing()) if (state.bank_seen[n] > 0 && Date.now() - (state.fetch_try["hold:" + n] || 0) > 1_800_000) fetch.push({ name: n, key: "hold:" + n });
	const bx = CFG.elixir_auto && character.ctype !== "merchant" && !elixir_active() && !best_elixir() && bank_elixir();
	if (bx) fetch.push({ name: bx.name, key: "elixir:" + bx.name });
	merchant_fetch_stand(fetch); // v25.0: merchant.js
	// v24.85: an upgrade project starts from the best copy we own below its target — the bank's too. It bought a +0 and
	// upgraded it from scratch while a +5 of the same piece lay in the bank (Torlis's mace+7 project: mace+5 banked).
	{
		const P = state.upg;
		if (P && !skipped("upg:" + P.name)) {
			const have = best_level_held(P.name);
			const b = (state.bank_gear || []).filter((i) => i.name === P.name && !i.p && (i.level || 0) < P.to && (i.level || 0) > have).sort((x, y) => (y.level || 0) - (x.level || 0))[0];
			if (b && Date.now() - (state.fetch_try[`upgin:${P.name}`] || 0) > 1_800_000) fetch.push({ name: P.name, level: b.level || 0, exact: true, key: `upgin:${P.name}` });
		}
	}
	const bu_ = bank_upgrades(); // a piece that wins as it is comes first: nothing is fetched to be upgraded meanwhile
	for (const u of [...bu_, ...(bu_.length ? [] : set_piece_fetch()), ...compound_fetches(compound_groups())])
		if (Date.now() - (state.fetch_try[u.key] || 0) > (u.key.startsWith("cmp:") ? 600_000 : 2 * 3600_000)) fetch.push(u);
	merchant_fetch_sale(fetch); // v25.0: merchant.js
	return { sell, bank, fetch, free: character.esize };
}
// Nearest NPC with a shop on this map (any shop buys anything), else one on main
function nearest_shop() {
	const search = (mapname) => {
		let best = null, bd = Infinity;
		for (const npc of G.maps[mapname]?.npcs || []) {
			if (!npc.position || !G.npcs[npc.id]?.items) continue;
			const d = mapname === character.map ? Math.hypot(npc.position[0] - character.x, npc.position[1] - character.y) : 0;
			if (d < bd) (bd = d), (best = { map: mapname, x: npc.position[0], y: npc.position[1] + NPC_STAND_Y });
		}
		return best;
	};
	return search(character.map) || search("main");
}
async function task_sell() {
	const slots = slots_where((i) => bag_class(i) === "sell");
	if (!slots.length) return 0;
	if (!has_computer()) { const shop = nearest_shop(); if (shop) await go(shop); }
	let n = 0;
	for (const k of slots) {
		const it = character.items[k];
		if (bag_class(it) !== "sell") continue;
		await wait_budget(1, RESERVE.bulk);
		await T(sell(k, it.q || 1)).then(() => n++).catch((e) => game_log("sell: " + why(e)));
		await sleep_ms(PACE_MS);
	}
	if (n) game_log(`Sold ${n} junk item${n === 1 ? "" : "s"}`, C.ok);
	return n;
}
// bank pack id -> [floor map, unlock gold, unlock shells] (game data; the code iframe may only have it on parent)
const bank_packs_list = () => (typeof bank_packs !== "undefined" && bank_packs) || parent.bank_packs || {};
// Bank contents are only visible inside the bank: snapshot item counts every 2s while there (state.bank_seen)
// v20.0: only while standing on a bank floor (character.bank lingers after leaving, so a stale copy used to overwrite
// a fresher one). A changed snapshot is shared with the other characters (at most once a minute), who adopt it when
// it's newer than theirs: the merchant banks most often, so fighters stop chasing pieces someone already took.
let bank_hash = "", bank_sent_at = 0;
// Items as { "name": qty, "name+3": qty, "name*": qty (locked) } — the report's JSON dumps (v24.68)
function items_dump(items) {
	const d = {};
	for (const i of items || []) if (i) { const k = i.name + (i.level ? "+" + i.level : "") + (i.l ? "*" : ""); d[k] = (d[k] || 0) + (i.q || 1); }
	return Object.fromEntries(Object.entries(d).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}
function remember_bank() {
	if (!character.bank || !on_bank_floor()) return;
	const seen = {};
	const gear = [];
	let free = 0, total = 0;
	for (const k in character.bank) if (k.startsWith("items")) for (const i of character.bank[k] || []) { total++; if (!i) free++; }
	if (total) state.bank_free = { free, total, at: Date.now() };
	// v24.5: locked items (the owner's) are left out — fetched, nothing would use them, and they never went back
	for (const k in character.bank) if (k.startsWith("items")) for (const i of character.bank[k] || []) if (i && !i.l) {
		seen[i.name] = (seen[i.name] || 0) + (i.q || 1);
		if ((GEAR.has(G.items[i.name]?.type) || G.items[i.name]?.type === "elixir") && gear.length < 400) gear.push({ name: i.name, level: i.level || 0, p: i.p, stat_type: i.stat_type });
	}
	state.bank_seen = seen;
	state.bank_dump = items_dump(Object.keys(character.bank).filter((k) => k.startsWith("items")).flatMap((k) => character.bank[k] || [])); // v24.68: everything, for report()
	state.bank_gear = gear;
	state.bank_at = Date.now();
	state.bank_by = character.name;
	const h = JSON.stringify([seen, gear.map((i) => i.name + i.level)]);
	if (h !== bank_hash && Date.now() - bank_sent_at > 60_000 && typeof send_cm === "function") {
		bank_hash = h; bank_sent_at = Date.now();
		const to = party_names_all().filter((n) => n !== character.name);
		if (to.length) Promise.resolve(send_cm(to, { k: "bank", at: state.bank_at, seen, gear, free: state.bank_free, dump: state.bank_dump })).catch(() => {});
	}
}
// Another character's bank snapshot: adopt it if it's newer than ours
function adopt_bank(m) {
	const b = m.message;
	if (!(b.at > (state.bank_at || 0)) || !b.seen || !Array.isArray(b.gear)) return;
	Object.assign(state, { bank_seen: b.seen, bank_gear: b.gear, bank_at: b.at, bank_by: m.name });
	if (b.free) state.bank_free = b.free;
	if (b.dump && typeof b.dump === "object") state.bank_dump = b.dump;
	cmp_cache = null;
}
setInterval(remember_bank, 2000);
const town_reason = {}; // task -> why it achieved nothing (shown by report())
// After every usable pack was found full, sell junk for 6h (bank space doesn't free itself; this re-checks it later)
const bank_is_full = () => Date.now() - (state.bank_full_at || 0) < 6 * 3600_000;
// Store bankable items into packs on the current floor; stops at the first bank_full
async function store_here() {
	let stored = 0, full = false;
	for (let k = character.items.length - 1; k >= 0; k--) { // from the end: storing never shifts earlier slots
		if (bag_class(character.items[k]) !== "bank") continue;
		await wait_budget(1, RESERVE.bulk);
		const r = await T(bank_store(k)).catch((e) => e);
		if (r?.reason === "bank_full") { full = true; break; }
		if (!r?.failed && !r?.reason) stored++;
		else game_log(`bank: ${character.items[k]?.name}: ${why(r)}`, C.dim);
		await sleep_ms(PACE_MS);
	}
	return { stored, full };
}
// Wait (up to 10s) until we're on this bank floor and its pack contents have arrived
const floor_loaded = (map) => until(() => character.map === map && character.bank && Object.keys(character.bank).some((k) => k.startsWith("items")), 20_000);
// Bank visit: store everything classed BANK (overflowing to other unlocked floors), then fetch needed items
async function task_bank(fetch_names) {
	const store = slots_where((i) => bag_class(i) === "bank");
	if (!store.length && !fetch_names.length) return (town_reason.bank = "nothing to store or fetch"), 0;
	// v24.22: one character of an account in the bank at a time (server: "X is in the bank"); walking at its door with
	// another inside retried the door until the walk timed out, flooding the log
	if (character.map !== "bank") {
		const inside = [...partners_any(), ...(is_merchant() ? [] : [merchant_hb()].filter(Boolean))].filter((p) => fresh(p) && /^bank/.test(p.map || "")).map((p) => p.name);
		if (inside.length) { town_reason.bank = `${inside.join(", ")} in the bank: waiting`; throw { reason: "bank_busy" }; }
	}
	try { if (character.map !== "bank") await go({ map: "bank" }); } catch (e) { town_reason.bank = "can't reach the bank: " + why(e); throw e; }
	// the bank's contents arrive separately after entering; if they haven't after 20s, walk out and back in once
	if (!(await floor_loaded("bank"))) {
		log_error("bank didn't load (retrying once)");
		try { await go({ map: "main" }); await go({ map: "bank" }); } catch (e) {}
		if (!(await floor_loaded("bank"))) {
			const seen_b = `map ${character.map}, bank ${character.bank ? Object.keys(character.bank).join("/") || "empty" : "none"}`;
			town_reason.bank = `bank didn't load (twice; ${seen_b})`;
			log_error(`bank didn't load: ${seen_b}`);
			throw { reason: "bank_not_loaded" };
		}
	}
	let { stored, full } = await store_here();
	// main floor full → other floors you've unlocked. bank_b/bank_u sit behind doors the server keeps locked until a
	// bkey/ukey is used; an unlocked floor's packs show up in character.bank (items8 for bank_b, items24 for bank_u).
	const packs = bank_packs_list();
	const unlocked_floors = [...new Set(Object.keys(character.bank || {}).filter((k) => packs[k]).map((k) => packs[k][0]))];
	if (full) for (const floor of unlocked_floors.filter((f) => f !== "bank")) {
		if (!slots_where((i) => bag_class(i) === "bank").length) break;
		try { await go({ map: floor }); } catch (e) { game_log(`bank: can't reach ${floor}: ${why(e)}`, C.dim); continue; }
		if (!(await floor_loaded(floor))) continue;
		const r = await store_here();
		stored += r.stored;
		full = r.full;
		if (!full) break;
	}
	if (full) {
		state.bank_full_at = Date.now();
		town_reason.bank = "every bank pack you can use is full";
		const has_key = character.items.some((i) => i && (i.name === "bkey" || i.name === "ukey"));
		game_log(`Bank full (floors: ${unlocked_floors.join(", ")}): ${CFG.sell_junk ? "selling plain +0 junk until there's room" : "nothing is sold (sell_junk is off) — what doesn't fit stays in the bags"}.` +
			(has_key ? " You hold a bank key: use it in the bank to unlock another floor." : " A Bank Key (bkey) unlocks the bank_b floor."), C.bad);
	} else if (!stored && store.length) town_reason.bank = "store calls failed (see gray bank: lines)";
	// pull back what bags need: packs on this floor first, then other unlocked floors that hold what's left (v18.1:
	// before, a piece on bank_b/bank_u was listed as a bank upgrade forever and never fetched)
	let got = 0;
	// v24.5: never a locked copy; a gear piece (bank_upgrades) by its title and stat type too — the first copy at that
	// name/level could be a worse one, which went back after 1-2h and was fetched again every 2h
	const match = (want) => (i) => i && !i.l && i.name === (want.name || want) && (want.level === undefined || (i.level || 0) === want.level) &&
		(!want.exact || ((i.p || null) === (want.p || null) && (i.stat_type || null) === (want.stat_type || null)));
	const fetch_here = async (wants) => {
		const left = [];
		for (const want of wants) {
			if (character.esize < 2) break; // keep a slot free for loot
			// a name (any copy), or { name, level, key } for one exact gear piece (bank_upgrades)
			const name = want.name || want, key = want.key || name;
			state.fetch_try[key] = Date.now();
			let found = false;
			for (const p in character.bank) {
				if (!p.startsWith("items") || (packs[p] && packs[p][0] !== character.map)) continue;
				const n = (character.bank[p] || []).findIndex(match(want));
				if (n < 0) continue;
				await wait_budget(1, RESERVE.bulk);
				found = true;
				await T(bank_retrieve(p, n)).then(() => { got++; state.fetched[name] = Date.now(); state.fetch_res[key] = { at: Date.now(), ok: true }; game_log(`bank: fetched ${name} from ${p}`, C.dim); })
					.catch((e) => { state.fetch_res[key] = { at: Date.now(), why: why(e) }; game_log(`bank: fetching ${name} failed: ${why(e)}`, C.dim); });
				await sleep_ms(PACE_MS);
				break;
			}
			if (!found) { left.push(want); state.fetch_res[key] = { at: Date.now(), why: `not on ${character.map}` }; }
		}
		return left;
	};
	let left = await fetch_here(fetch_names);
	for (const floor of unlocked_floors.filter((f) => f !== character.map)) {
		if (!left.length || character.esize < 2) break;
		const there = left.filter((w) => Object.keys(character.bank || {}).some((p) => p.startsWith("items") && packs[p]?.[0] === floor && (character.bank[p] || []).some(match(w))));
		if (!there.length) continue;
		try { await go({ map: floor }); } catch (e) { game_log(`bank: can't reach ${floor}: ${why(e)}`, C.dim); continue; }
		if (!(await floor_loaded(floor))) continue;
		const still = await fetch_here(there);
		left = left.filter((w) => !there.includes(w) || still.includes(w));
	}
	for (const w of left) game_log(`bank: ${w.name || w} not found in the bank; not trying again for 2h`, C.dim);
	if (is_merchant()) got += await bank_purge();
	remember_bank();
	game_log(`Bank: stored ${stored}, retrieved ${got}; ${character.esize} slots free`, C.ok);
	return stored + got;
}
// Buy potions back up to pot_buy when either kind drops below pot_min. Each kind gets half the gold: the configured
// potion if that half covers the full refill, else the cheap tier (hpot0/mpot0, 20g instead of 100g) — so a new,
// poor character still gets potions. May dip into gold_reserve (potions are what it's for).
const CHEAP_POT = { hp: "hpot0", mp: "mpot0" };
async function task_restock(pot_min = CFG.pot_min, pot_buy = CFG.pot_buy) {
	if (pot_count("hp") >= pot_min && pot_count("mp") >= pot_min) return 0;
	if (!has_computer()) await go("potions");
	let n = 0;
	for (const [kind, best] of [["hp", CFG.hp_pot], ["mp", CFG.mp_pot]]) {
		const want = pot_buy - pot_count(kind);
		if (want <= 0) continue;
		const budget = character.gold / (kind === "hp" ? 2 : 1); // hp first takes up to half; mp gets what's left
		const p = budget >= want * (G.items[best].g || 1) ? best : CHEAP_POT[kind];
		const q = Math.min(want, Math.floor(budget / (G.items[p].g || 1)));
		if (q <= 0) { town_reason.restock = `can't afford ${kind} potions (${character.gold} gold)`; continue; }
		await wait_budget(1, RESERVE.errand);
		tag_spend("potions");
		await T(buy(p, q)).then(() => n++).catch((e) => game_log(`restock ${p}: ${why(e)}`));
	}
	return n;
}

// =====================================================================
// Quests (Cole & other quest NPCs), monster hunts
// =====================================================================
// Drop rates (chance per kill) for Cole's materials from the game's drop tables (design/drops.py), used only if
// the client's G.drops is missing. E.g. bees drop Bee Wings 1 in 100, goos Gooey Slime 1 in 1000.
const DROP_FALLBACK = { beewings: [["bee", 0.01]], gslime: [["goo", 0.001]], spores: [["minimush", 1 / 60]],
	crabclaw: [["crab", 0.001]], frogt: [["squigtoad", 1 / 400]], ascale: [["armadillo", 0.0008]], feather0: [["bigbird", 0.05]],
	dstones: [["stoneworm", 1 / 300]], pleather: [["porcupine", 0.001]], bfur: [["arcticbee", 0.001]], cscale: [["croc", 0.0009]] };
// [[monster, chance per kill], ...] for an item, from G.drops.monsters (entries are [chance, item, ...])
function drop_sources(item) {
	const out = [], mons = G.drops?.monsters;
	if (mons) for (const mt in mons) for (const d of mons[mt] || []) if (Array.isArray(d) && d[1] === item && typeof d[0] === "number") out.push([mt, d[0]]);
	return out.length ? out : DROP_FALLBACK[item] || [];
}
// Fighters sharing loot: the server gives each chest item to a random party member wherever it is, weighted by its xp
// share (equal among one account's fighters; the merchant's is 0). Our expected cut of any drop is 1 / party_n().
const party_n = () => 1 + (in_party_cfg() ? partners().length : 0);
// Best place to farm an item: the safe monster/area with the most items per second (chance × kills/s) — counted as
// the items that reach US (v23.1: ÷ party_n; quest times were ~n x too optimistic and stall checks fired early)
function best_source(item) {
	let best = null;
	for (const [mt, rate] of drop_sources(item)) {
		const f = fight_profile(mt);
		if (!f) continue;
		each_area((pack, area) => {
			if (pack.type !== mt) return;
			const est = Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack)) * state.realism;
			const kps = meas_aged(pack_key(area), est * Math.max(1, f.xp)) / Math.max(1, f.xp); // measured (aged) xp/s ÷ xp per kill
			const ips = (rate * kps) / party_n();
			if (!best || ips > best.ips) best = { monster: mt, ...area, ips };
		});
	}
	return best;
}
// Copies we have anywhere: bags + worn + last seen in the bank
const owned = (name) =>
	character.items.reduce((n, i) => n + (i && i.name === name ? i.q || 1 : 0), 0) +
	Object.values(character.slots || {}).filter((i) => i && i.name === name).length + (state.bank_seen[name] || 0);
// Has the guide asked for this recipe within guide_quest_keep_h?
const is_guide_quest = (id) => CFG.guide_enabled && !!state.guide_quests[id] && Date.now() - (state.guide_quests[id].last || 0) < CFG.guide_quest_keep_h * 3600_000;
// Quest recipes to work on, in order: guide quests (in the order the guide asked), then own quests (quest_crafts /
// quest_npcs). Skips outputs our class can't wear.
function quest_recipes() {
	const mode = CFG.quest_crafts;
	// v24.7: the merchant can't farm, so it never parked a quest and "wanted" every one: it fetched and kept the fighters'
	// materials from the bank (a slot each, its serving needs free slots) and they farmed them again
	if (!mode || is_merchant()) return [];
	const guide = [], own = [];
	for (const id in G.craft) {
		const r = G.craft[id];
		if (!r.quest || CFG.quest_craft_skip.includes(id)) continue;
		const out = r.output?.name || id;
		if (GEAR.has(G.items[out]?.type) && !can_wear(out)) continue; // e.g. quiver for a priest
		if (is_guide_quest(id)) { guide.push(id); continue; }
		if (Array.isArray(mode) ? !mode.includes(id)
			: !CFG.quest_npcs.includes(r.quest) || (mode === "materials" && r.items.some(([, n]) => GEAR.has(G.items[n]?.type)))) continue;
		own.push(id);
	}
	guide.sort((a, b) => state.guide_quests[a].first - state.guide_quests[b].first);
	if (Array.isArray(mode)) own.sort((a, b) => mode.indexOf(a) - mode.indexOf(b));
	return [...guide, ...own];
}
// wanted: not yet crafted quest_craft_max times and not owned (inputs stay in bags while wanted);
// open: wanted and actionable right now (not shelved, affordable)
function recipe_wanted(id) {
	const r = G.craft[id];
	return (state.crafted[id] || 0) < CFG.quest_craft_max && owned(r.output?.name || id) < CFG.quest_craft_max && !quest_parked(id);
}
// Hours to farm a quest's missing materials at our kill rates. Materials with no drop source (bought, crafted) and
// ones we can't fight for right now don't count: only a finite, slow estimate parks a quest (no churn on a bad minute)
function quest_eta_h(id) {
	let s = 0;
	for (const [q, n, l] of G.craft[id]?.items || []) {
		const have = owned_in_bags_or_bank(n, l);
		if (have >= q) continue;
		if (l || GEAR.has(G.items[n]?.type)) continue; // gear inputs come from upgrades/buys, not drops
		const src = best_source(n);
		if (!src || !(src.ips > 0)) continue;
		s += (q - have) / src.ips;
	}
	return s / 3600;
}
// Parked: farming it would take > quest_park_h (until it drops under quest_unpark_h); re-estimated every 10 min
const quest_park_cache = new Map(); // id -> { at, parked, eta }
function quest_parked(id) {
	if (!CFG.quest_park_h) return false;
	const c = quest_park_cache.get(id), now = Date.now();
	if (c && now - c.at < 600_000) return c.parked;
	quest_park_cache.set(id, { at: now, parked: c?.parked || false, eta: c?.eta }); // guards re-entry (best_source → needs)
	const eta = quest_eta_h(id), was = c?.parked || state.quest_park?.[id];
	const parked = was ? eta > CFG.quest_unpark_h : eta > CFG.quest_park_h;
	state.quest_park = state.quest_park || {};
	if (parked && !state.quest_park[id]) { game_log(`quest ${id}: ~${Number.isFinite(eta) ? Math.round(eta) + "h" : "no source"} to farm — parked, materials banked`, C.dim); log_ev("quest_park", { id, eta: Number.isFinite(eta) ? Math.round(eta) : null }); }
	if (parked) state.quest_park[id] = { at: state.quest_park[id]?.at || now, eta: Number.isFinite(eta) ? +eta.toFixed(1) : null };
	else if (state.quest_park[id]) { delete state.quest_park[id]; game_log(`quest ${id}: ~${Math.round(eta)}h now — unparked`, C.info); }
	quest_park_cache.set(id, { at: now, parked, eta });
	return parked;
}
function recipe_open(id) {
	return recipe_wanted(id) && !skipped("qc:" + id) && (G.craft[id].cost || 0) <= character.gold - CFG.gold_reserve;
}
// auto_craft needs ONE unlocked stack per input holding the full amount at the exact level
const has_inputs = (r) => r.items.every(([q, name, level]) =>
	character.items.some((i) => i && i.name === name && (i.level || 0) === (level || 0) && !i.l && (i.q || 1) >= q));
function next_quest_craft() {
	for (const id of quest_recipes()) if (recipe_open(id) && has_inputs(G.craft[id])) return id;
	return null;
}
// Craft every quest recipe whose inputs we hold, at its NPC (up to 10 per run), then wear the result if its slot is
// empty. A failure pauses that recipe 5 min (10 if its NPC can't be found).
async function quest_crafts() {
	let n = 0, id;
	while ((id = next_quest_craft()) && n < 10) {
		if (character.esize < 1) { game_log(`craft ${id}: no free slot`, C.dim); break; }
		const r = G.craft[id];
		if (!has_computer()) {
			const loc = find_npc(r.quest);
			if (!loc) { skip("qc:" + id, 600_000); break; }
			if (character.map !== loc.map || Math.hypot(character.x - loc.x, character.y - loc.y) > 250) await go({ map: loc.map, x: loc.x, y: loc.y + NPC_STAND_Y }); // walk if > 250px away
		}
		await wait_budget(1, RESERVE.errand);
		tag_spend("crafting");
		const res = await T(auto_craft(id)).catch((e) => e);
		const ok = res && !res.failed && !res.reason;
		game_log(`craft ${id} at ${G.npcs[r.quest]?.name || r.quest}: ${ok ? "OK" : "FAILED " + why(res)}`, ok ? C.ok : C.bad);
		if (!ok) { skip("qc:" + id, 300_000); break; }
		n++;
		state.crafted[id] = (state.crafted[id] || 0) + 1;
		save_state();
		await sleep_ms(400); // let the crafted item arrive in the bags
		await equip_if_empty(r.output?.name || id);
	}
	return n;
}
// Equipment type → slots it can go in
const SLOT_FOR = { helmet: ["helmet"], chest: ["chest"], pants: ["pants"], gloves: ["gloves"], shoes: ["shoes"],
	cape: ["cape"], belt: ["belt"], amulet: ["amulet"], orb: ["orb"], ring: ["ring1", "ring2"], earring: ["earring1", "earring2"],
	quiver: ["offhand"], shield: ["offhand"], source: ["offhand"], misc_offhand: ["offhand"] };
// Wear a freshly crafted piece only if its slot is empty (never replaces gear you or the guide chose)
async function equip_if_empty(name) {
	const def = G.items[name];
	if (!def || !can_wear(name) || character.ctype === "merchant") return;
	const slot = (SLOT_FOR[def.type] || []).find((sl) => sl in (character.slots || {}) && !character.slots[sl]);
	const k = character.items.findIndex((i) => i && i.name === name);
	if (!slot || k < 0) return;
	const main = character.slots.mainhand && G.items[character.slots.mainhand.name];
	if (slot === "offhand" && main?.wtype && (G.classes[character.ctype]?.doublehand || {})[main.wtype]) return; // two-hander
	await wait_budget(EMIT_COST.equip, RESERVE.errand);
	await T(equip(k, slot)).then(() => game_log(`equipped ${name} → ${slot}`, C.ok)).catch((e) => game_log(`equip ${name}: ${why(e)}`, C.dim));
}
// Material count for a recipe: bags at that level, plus the bank's last-seen count for +0 materials
const owned_in_bags_or_bank = (n, l) => held(n, l) + (l ? 0 : bank_share(n));
function bank_share(n) {
	const pool = state.bank_seen[n] || 0;
	if (!pool || is_merchant() || !in_party_cfg()) return pool;
	const mine = Math.max(0, (state.needs.get(n) || 0) - held_any(n));
	const claims = [...(mine > 0 ? [{ name: character.name, s: mine }] : []),
		...partners().filter((p) => p.qshort?.[n] > 0).map((p) => ({ name: p.name, s: p.qshort[n] }))].sort((a, b) => (a.name < b.name ? -1 : 1));
	let left = pool;
	for (const c of claims) { const take = Math.min(left, c.s); if (c.name === character.name) return take; left -= take; }
	return left; // not short of it ourselves (crafting materials...): what the members short of it leave
}
// Farm our own monster hunt's target if we can fight it safely
// A hunt that can't be finished before it expires (h.ms left) isn't worth chasing: let it lapse and take a new one
// (v18.6: a 417-bee hunt pulled the party onto bees at half the xp/s of croc for hours). Party kills count, so the
// party's rate is estimated as ours × (1 + 0.6 per member near).
// xp/s we'd get at a monster's best area (measured if we've been there, else estimated)
function mt_xps(mt) {
	let best = 0;
	const tab = meas();
	const fa = fight_profile(mt);
	// v24.6: aged like spot picks (meas_aged)
	each_area((pack, area) => {
		if (pack.type !== mt || tab[pack_key(area)] === undefined) return;
		const est = fa ? fa.xp * Math.min(1 / (fa.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack)) * state.realism : tab[pack_key(area)];
		best = Math.max(best, meas_aged(pack_key(area), est));
	});
	if (best) return best;
	const f = fa;
	return f ? kills_per_s(mt) * (f.xp || G.monsters[mt]?.xp || 0) : 0;
}
// The best xp/s we know of: this pick's best, or the best measured pack
// v23.6: this pick's best (safe and not cooling down now); only a member that doesn't pick (a follower) falls back to the
// best rate measured — the max over every measured spot included ones now unsafe or on cooldown and raised the bar
// v24.3: our own pick's best counts only if it was made in the last 10 min (a follower never picks). Otherwise: the
// best spot, computed (cached 60s).
const best_known_xps = () => {
	const now = Date.now();
	if (state.best_score > 0 && now - (state.best_at || 0) < 600_000) return state.best_score;
	const c = state.best_ref;
	if (c && now - c.at < 60_000) return c.v;
	const v = best_score() || Math.max(0, ...Object.values(meas() || {}).filter(Number.isFinite));
	state.best_ref = { at: now, v };
	return v;
};
function hunt_feasible(h) {
	if (!h || !(h.c > 0)) return false;
	// v18.7: a low-end monster (under hunt_min_xp of the best we know) doesn't trap the party; kills there still count
	const best = best_known_xps();
	if (CFG.hunt_min_xp > 0 && best > 0 && mt_xps(h.id) < CFG.hunt_min_xp * best) return false;
	if (!(h.ms > 0)) return true; // no expiry known
	// v24.3: kills_per_s is already the party's rate (party table, or an estimate with the members counted); adding
	// 0.6 per member near counted them twice and kept hunts that needed twice the real kill rate
	const kps = kills_per_s(h.id);
	return kps > 0 && h.c / kps * 1000 <= h.ms * 0.9;
}
// Kills per second we'd manage at the best spawn area of a monster (measured if we've been there); 0 if unsafe
function kills_per_s(mt) {
	const f = fight_profile(mt);
	if (!f) return 0;
	let best = 0;
	each_area((pack, area) => {
		if (pack.type !== mt) return;
		const est = Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack)) * state.realism;
		const kps = meas_aged(pack_key(area), est * Math.max(1, f.xp)) / Math.max(1, f.xp); // v24.6: aged
		best = Math.max(best, kps);
	});
	return best;
}
// Every monster worth farming for this character, weighted by CFG.goal_w (monster hunt, own-quest material,
// guide-quest material, guide farm row). eta_h = estimated hours to finish at our
// kill rate. Shared with the partner in the heartbeat; recomputed at most every 10s (it scans every map).
function goals_list() {
	const out = [], now = Date.now();
	if (state.goals_cache && now - state.goals_cache.at < 10_000) return state.goals_cache.list;
	const W = CFG.goal_w, g = live_guide_farm();
	if (g) out.push({ monster: g.monster, w: W.guide_farm, reason: g.reason, map: g.map, boundary: g.boundary, count: g.count, guide_safe: !!g.guide_safe });
	const h = character.s.monsterhunt;
	const eta = (n, per_kill, mt) => { const k = kills_per_s(mt) * per_kill; return k > 0 ? +(n / k / 3600).toFixed(2) : Infinity; };
	if (CFG.auto_monster_hunt && h?.c > 0 && hunt_feasible(h)) out.push({ monster: h.id, w: W.hunt, reason: `monster hunt ${h.c} left`, eta_h: eta(h.c, 1, h.id) });
	// v24.3: own-quest goals get quest_directive's rules here too (at least quest_farm_min_xp of the best xp/s, done within
	// quest_farm_max_h): this list goes to the leader, whose shared pick (mutual goals, turns) used it unfiltered and
	// took the party to low-xp quest monsters the floor was meant to keep it off
	const bk = best_known_xps();
	if (CFG.quest_farm && CFG.quest_crafts) for (const id of quest_recipes()) {
		if (!recipe_open(id)) continue;
		const guided = is_guide_quest(id);
		for (const [q, n, l] of G.craft[id].items) {
			const have = owned_in_bags_or_bank(n, l);
			if (l || GEAR.has(G.items[n]?.type) || have >= q) continue;
			for (const [mt, rate] of drop_sources(n)) if (farmable_type(mt)) {
				const eh = eta(q - have, rate / party_n(), mt); // v24.6: drops go to a random member (as best_source counts)
				if (!guided && (eh > CFG.quest_farm_max_h || (bk > 0 && mt_xps(mt) < CFG.quest_farm_min_xp * bk))) continue;
				out.push({ monster: mt, w: guided ? W.guide_quest : W.quest, reason: `${id}: ${n} ${have}/${q}`, eta_h: eh });
			}
		}
	}
	state.goals_cache = { at: now, list: out };
	return out;
}
// Visit Daisy when we have no hunt or a finished one (h.c = kills left)
const hunt_due = () => {
	const h = character.s.monsterhunt;
	return (CFG.auto_monster_hunt || CFG.hunt_passive) && character.ctype !== "merchant" && (!h || h.c === 0) && !skipped("hunt:auto");
};
// Daisy: one call turns in a finished hunt ({completed}) or starts a new one ({started}); after a turn-in we call again
// right away so the next hunt starts on the same visit (at most 2 calls)
async function run_hunt() {
	await go_npc("monsterhunter");
	let r;
	for (let i = 0; i < 2; i++) {
		await wait_budget(1, RESERVE.errand);
		r = await T(interact("monsterhunt"));
		if (r?.completed) { game_log("Monster hunt turned in (+monstertoken)", C.info); await sleep_ms(300); continue; } // 300ms: let
// the turn-in's player update arrive before asking again
		break;
	}
	const h = character.s.monsterhunt;
	if (r?.started) game_log(`Monster hunt: ${h?.c ?? "?"}x ${h?.id ?? "?"}`, C.info);
	return r;
}
// ---- World bosses (CFG.boss) ----
// team "all" (v23.1, the default): every online member counts wherever it is — a boss target gathers the party.
// boss_tick only engages once everyone is there and it's safe with them (team "party").
function boss_safe(name, team = "all") {
	const m = G.monsters[name];
	const f = m && fight_math({ ...m, hp: 1, "1hp": false }, true, team); // their side of the fight only
	if (!f) return false;
	if ((f.their_dps + f.self_dps) * CFG.boss.tank_s > f.hp_pool * safety_now() * heal_mult(f)) return false;
	const squish = Math.min(character.max_hp, ...fight_mates(team).map((p) => p.max_hp || Infinity));
	return f.their_dps / (m.frequency || 1) <= squish * CFG.boss.one_hit;
}
// ---- Server events (CFG.events) ----
// parent.S comes in two shapes: one key per live event/boss ({ goobrawl: {...}, snowman: { live, map, x, y } }), or
// (current live servers) { schedule, event_flags, event_ends, ... }. ev_info(name) reads either.
function ev_info(name) {
	const S_ = (typeof parent !== "undefined" && parent.S) || {};
	if (S_[name]) return S_[name];
	const flag = S_.event_flags?.[name], end = S_.event_ends?.[name];
	if (flag || (end && Date.parse(end) > Date.now())) return { live: true, end };
	return null;
}
// Are we at the event? goobrawl: on its map; others: within 800px of the event's reported position
function event_here(name) {
	const ev = CFG.events[name], e = ev_info(name);
	if (ev.map) return character.map === ev.map;
	return !!e && e.map === character.map && Number.isFinite(e.x) && Math.hypot(e.x - character.x, e.y - character.y) < 800;
}
// The guide's farm row if it's current, not paused and not outlevelled (guide_farm_min_xp; a row we can't measure,
// e.g. a monster we can't fight but the guide calls safe, is kept)
function live_guide_farm() {
	const g = state.guide_farm, now = Date.now();
	if (!g || !(g.until > now) || (state.guide_ignore[`${g.monster}:${g.map}`] || 0) > now) return null;
	const f = fight_profile(g.monster), gxp = f ? kills_per_s(g.monster) * f.xp : null;
	if (gxp !== null && best_known_xps() > 0 && gxp < CFG.guide_farm_min_xp * best_known_xps()) return null;
	return g;
}
// =====================================================================
// Progression Guide adapter
// =====================================================================
// Guide text carries display names ("Bee Wings"); map them back to item ids (lookup table built on first use)
let item_by_name = null;
function item_id(n) {
	if (!n) return null;
	if (G.items[n]) return n;
	if (!item_by_name) { item_by_name = {}; for (const id in G.items) if (G.items[id].name) item_by_name[G.items[id].name] = id; }
	return item_by_name[n] || null;
}
// Walk each plan's chosen path (node.next, plus "develop" inputs), not every alternative: plan trees list long shots
// (glitch boxes, event drops) the guide isn't pursuing. Depth capped at 12 (real plans are ~6 deep; guards cycles).
function chosen_path(node, visit, depth = 0) {
	if (!node || depth > 12) return;
	visit(node);
	const nx = node.next;
	if (nx) { visit(nx); for (const i of nx.inputs || []) chosen_path(i, visit, depth + 1); }
	for (const alt of node.alternatives || []) if (alt.kind === "develop") for (const i of alt.inputs || []) chosen_path(i, visit, depth + 1);
}
// Quest recipes the guide is working toward: craft rows and craft nodes on plans' chosen paths; rows naming a quest
// output; farm rows for drops a quest needs ("bees" = save Bee Wings for Cole; "material"); a "set" goal's pieces
function guide_quest_ids(prog) {
	const by_output = {};
	for (const id in G.craft) if (G.craft[id].quest) by_output[G.craft[id].output?.name || id] = id;
	const quest = (id) => (G.craft[id]?.quest ? id : null);
	const out = new Set(), add = (id) => id && out.add(id);
	for (const plan of prog.plans || []) chosen_path(plan.tree, (n) => { if (n.kind === "craft") add(quest(n.recipe) || by_output[n.name]); });
	const drops_of = (mt) => new Set((G.drops?.monsters?.[mt] || []).filter((d) => Array.isArray(d) && typeof d[0] === "number").map((d) => d[1])
		.concat(Object.keys(DROP_FALLBACK).filter((it) => DROP_FALLBACK[it].some(([m]) => m === mt))));
	for (const r of prog.rows || []) {
		if (r.kind === "craft" || r.action?.kind === "craft") add(quest(r.action?.recipe) || by_output[r.action?.name]);
		for (const n of [r.request?.name, r.target?.name, r.action?.name]) add(by_output[n]);
		const reason = (r.reason?.id || "").replace("progression.reason.", "");
		const mt = (r.action?.route || r.route)?.monster;
		if (r.kind === "farm" && mt && ["bees", "material", "try_material"].includes(reason)) {
			const drops = drops_of(mt);
			for (const id in G.craft) if (G.craft[id].quest && G.craft[id].items.some(([, n]) => drops.has(n))) add(id);
		}
	}
	if (prog.goal?.kind === "set" && prog.goal.name) {
		const pieces = new Set(G.sets?.[prog.goal.name]?.items || Object.keys(G.items).filter((n) => G.items[n].set === prog.goal.name));
		for (const id in G.craft) if (G.craft[id].quest && pieces.has(G.craft[id].output?.name || id)) add(id);
	}
	return out;
}
// What bags must hold: name -> copies. The guide's steps touch a few copies at a time (one item to upgrade plus a
// spare, three to compound), so only that many of the best copies stay; the rest is banked. Keeping every copy of
// a mentioned name would make every dropped helmet/shoes "needed" whenever the guide plans gear upgrades
// (its equipment lesson does), leaving nothing bankable.
// Stackable items (materials, scrolls) are one slot no matter how many, so they're kept whole.
function compute_needs(prog) {
	const needs = new Map();
	const add = (n, k) => {
		const def = n && G.items[n];
		if (!def) return;
		k = k || (def.compound ? CFG.need_copies_compound : CFG.need_copies_upgrade);
		needs.set(n, Math.max(needs.get(n) || 0, k));
	};
	for (const r of prog?.rows || []) {
		const a = r.action || {};
		add(a.name); add(a.scroll); add(r.request?.name);
		for (const i of a.inputs || []) add(i.name, i.quantity);
		for (const res of a.resources || []) add(character.items[res.num]?.name);
	}
	for (const plan of prog?.plans || []) chosen_path(plan.tree, (n) => { add(n.next?.name); add(n.next?.scroll); });
	for (const id of quest_recipes()) if (recipe_wanted(id)) for (const [q, n] of G.craft[id].items) add(n, q);
	return needs;
}
// Bag slots holding needed copies: per needed name, the best `count` copies by level (all stacks of stackables)
// Recomputed on each call (cheap: one pass over 42 slots); bag_plan() computes it once and passes it down
function needed_slots() {
	const keep = new Set(), by = {};
	const P = state.upg; // the upgrade project's copies below its target stay put (not equipped/sent/banked/compounded)
	if (P) character.items.forEach((i, k) => { if (i && i.name === P.name && (i.level || 0) < P.to) keep.add(k); });
	if (state.travel_off.length) for (const k of travel_slots_held()) keep.add(k); // v24.27: worn pieces off for a walk
	character.items.forEach((i, k) => { if (i && state.needs.has(i.name)) (by[i.name] = by[i.name] || []).push(k); });
	for (const n in by) {
		if (G.items[n]?.s) { by[n].forEach((k) => keep.add(k)); continue; }
		by[n].sort((a, b) => (character.items[b].level || 0) - (character.items[a].level || 0))
			.slice(0, state.needs.get(n)).forEach((k) => keep.add(k));
	}
	return keep;
}
// Read the Progression Guide: remember the quests it asks for and normalise its first farm row (state.guide_farm).
// spendLimit tells the guide how much gold it may plan to spend (everything above gold_reserve).
function read_guide() {
	if (!CFG.guide_enabled) { state.guide = null; state.guide_farm = null; return null; }
	if (typeof get_progression !== "function") return null;
	let prog;
	try { prog = get_progression({ spendLimit: Math.max(0, Math.min(character.gold - CFG.gold_reserve, gold_room())) }); } catch (e) { game_log("progression: " + e); return null; }
	if (!prog || !prog.ready) return null;
	state.guide = prog;
	for (const id of guide_quest_ids(prog)) {
		const r = G.craft[id], g = (state.guide_quests[id] = state.guide_quests[id] || { first: Date.now() });
		if (!g.last) game_log(`guide quest: ${id} (${G.npcs[r.quest]?.name || r.quest})`, C.info);
		g.last = Date.now();
	}
	const farm = (prog.rows || []).find((r) => {
		if (r.kind !== "farm") return false;
		const reason = (r.reason?.id || "").replace("progression.reason.", "");
		return (!CFG.follow_farm_reasons || CFG.follow_farm_reasons.includes(reason)) && (r.action?.route || r.route);
	});
	const route = farm && (farm.action?.route || farm.route);
	const area = route && G.monsters[route.monster] && resolve_area(route.monster, route.map, route.boundary, route.count);
	const mat = [farm?.title?.args?.item, farm?.reason?.args?.item, farm?.target?.name, farm?.action?.item, farm?.action?.name, route?.item, route?.drop].map(item_id).find(Boolean);
	state.guide_farm = area ? { monster: route.monster, ...area, item: mat, guide_safe: route.safe !== false, seconds: route.seconds,
		reason: "guide " + (farm.reason?.id || "").replace("progression.reason.", "") + (mat ? ` (${mat} ${held(mat)})` : ""),
		until: Date.now() + CFG.guide_interval_ms * 4 } : null; // valid for 4 reads (60s): survives a read or two failing
	return prog;
}
// Read the guide, recompute what bags must hold, re-decide the farm directive (every guide_interval_ms, and after steps)
function guide_refresh() {
	state.last_guide = Date.now();
	const prog = read_guide();
	state.needs = compute_needs(prog);
	refresh_directive();
	return prog;
}
const unsupported_seen = new Set(); // row kinds already reported as not automated (logged once each)
// The top guide row we can act on now: an automated kind, not paused, affordable
const next_guide_row = (prog) => {
	for (const r of prog?.rows || []) if (r.kind !== "farm" && !CFG.gear_actions.includes(r.kind) && !unsupported_seen.has(r.kind)) {
		unsupported_seen.add(r.kind);
		game_log(`guide: rows of kind "${r.kind}" aren't automated (e.g. ${r.id})`, C.dim);
	}
	return CFG.gear && (prog?.rows || []).find((r) => CFG.gear_actions.includes(r.kind) && !skipped(r.id) && r.affordable !== false);
};

// ---- Guide row executors: each runs one row's action or throws {reason} (the row is then paused, see guide_step) ----
// Craft row: only once the guide says every input is owned (a.ready); at the recipe's NPC
async function run_craft(a) {
	if (!a.ready) throw { reason: "inputs_not_ready" };
	const recipe = G.craft[a.recipe];
	if (!recipe) throw { reason: "recipe" };
	if ((recipe.cost || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" };
	if (character.esize < 1) throw { reason: "no_space" };
	await go_npc(a.npc || recipe.quest || "craftsman");
	await wait_budget(1, RESERVE.errand);
	tag_spend("crafting");
	const r = await T(auto_craft(a.recipe));
	const ok = r && !r.failed;
	game_log(`craft ${a.recipe}: ${ok ? "OK" : "FAILED"}`, ok ? C.ok : C.bad);
	if (ok) { state.crafted[a.recipe] = (state.crafted[a.recipe] || 0) + 1; save_state(); }
	return r;
}
async function task_stat() {
	let n = 0;
	for (const r of stat_scroll_list().filter((x) => x.ok).slice(0, CFG.stat_scroll.per_run)) {
		if (state.errand) state.errand_at = Date.now();
		try {
			const res = await run_stat({ name: r.name, slot: r.slot, scroll: r.scroll, quantity: r.q });
			await sleep_ms(400);
			if (character.slots?.[r.slot]?.stat_type === r.stat) { n++; log_ev("stat", { item: r.name, stat: r.stat, q: r.q, cost: r.cost }); }
			else { skip(r.key, 6 * 3600_000, why(res) || "not applied"); game_log(`stat scroll on ${r.name}: not applied (${why(res) || "?"}); again in 6h`, C.warn); }
		} catch (e) { skip(r.key, pause_ms(e, 6 * 3600_000), why(e)); game_log(`stat scroll on ${r.name}: ${why(e)}`, C.dim); }
	}
	return n;
}
// Stat-scroll row: apply a stat scroll (e.g. int) to an item. Worn items must come off first; every check runs
// before unequipping, and the finally block always puts the item back on (the scrolled copy if it worked).
async function run_stat(a) {
	if (character.esize < 1) throw { reason: "no_space" };
	const stat = G.items[a.scroll]?.stat, want_q = a.quantity || 1;
	const raw = (i) => i && i.name === a.name && !i.l && i.stat_type !== stat;
	const worn = !!a.slot && raw(character.slots[a.slot]);
	if (!worn && character.items.findIndex(raw) < 0) throw { reason: "input_missing" };
	const need = want_q - quantity(a.scroll);
	if (need > 0) {
		await buy_from_npc(a.scroll, need);
		if (!(await until(() => quantity(a.scroll) >= want_q, 3000))) throw { reason: "scroll_missing" }; // purchase lands
	}
	if (!has_computer()) await go("upgrade"); // stat scrolls are applied at the upgrade NPC
	let unequipped = false;
	try {
		if (worn) {
			await wait_budget(EMIT_COST.unequip, RESERVE.errand);
			await T(unequip(a.slot));
			unequipped = true;
			if (!(await until(() => !character.slots[a.slot], 3000))) throw { reason: "unequip_failed" }; // up to 3s for the update
		}
		const k = character.items.findIndex(raw), sk = find_slot(a.scroll, 0);
		if (k < 0) throw { reason: "input_missing" };
		if (sk < 0) throw { reason: "scroll_missing" };
		await wait_budget(1, RESERVE.errand);
		const r = await T(upgrade(k, sk), 30_000);
		game_log(`stat ${a.scroll} → ${a.name}: ${r?.stat || r?.success ? "OK" : why(r)}`, C.ok);
		return r;
	} finally {
		if (unequipped && !character.slots[a.slot]) {
			await sleep_ms(300); // let the scrolled item's update arrive
			let back = character.items.findIndex((i) => i && i.name === a.name && i.stat_type === stat);
			if (back < 0) back = character.items.findIndex((i) => i && i.name === a.name);
			if (back >= 0) { await wait_budget(EMIT_COST.equip, RESERVE.errand); await T(equip(back, a.slot)).catch((e) => game_log("stat re-equip: " + why(e), C.bad)); }
			else game_log(`stat: ${a.name} not in bags; ${a.slot} left empty`, C.bad);
		}
	}
}
// Exchange location: quest items (e.g. seashells) at their quest's NPC, everything else at Xyn ("exchange")
async function go_exchange(a) {
	if (has_computer()) return;
	if (a.npc) return go_npc(a.npc);
	const quest = G.items[a.name]?.quest, q = quest && G.quests?.[quest];
	if (q && q.map && Number.isFinite(q.x)) return go({ map: q.map, x: q.x, y: q.y + NPC_STAND_Y });
	if (quest && find_npc(quest)) return go_npc(quest);
	return go_npc("exchange");
}
// Execute one guide row by kind. Throws {reason, want?, chance?} when it can't (guide_step pauses the row).
async function run_row(row) {
	const a = row.action || {};
	const gold_ok = () => { if ((row.cost || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" }; };
	switch (row.kind) {
		case "equip": {
			const k = a.num !== undefined && character.items[a.num]?.name === a.name ? a.num : find_slot(a.name, a.level);
			if (k < 0) throw { reason: "input_missing" };
			// v19.7: never wear something that scores lower than what's in the slot (the guide doesn't own the slot)
			const sv = a.slot && slot_value(character.items[k], character.ctype, my_gear(), a.slot);
			if (CFG.gear_auto && a.slot && character.slots?.[a.slot] && sv < (my_gear().w[a.slot] || 0))
				throw { reason: "worse_than_worn", want: `${a.name}+${a.level || 0} ${Math.round(sv)} < ${Math.round(my_gear().w[a.slot])} pts` };
			await wait_budget(EMIT_COST.equip, RESERVE.errand);
			game_log(`equip ${a.name} +${a.level || 0} → ${a.slot}`, C.ok);
			if (a.slot) state.guide_equip[a.slot] = Date.now();
			return T(equip(k, a.slot));
		}
		case "buy":
			if (a.kind === "purchase") throw { reason: "player_stand_skip" };
			gold_ok();
			return buy_from_npc(a.name, a.quantity || 1, a.npc);
		case "upgrade":
		case "develop": {
			gold_ok();
			const name = a.name || row.request?.name || row.target?.name;
			if (!name || !G.items[name]) throw { reason: "unsupported", want: JSON.stringify(a).slice(0, 80) };
			if (row.kind === "develop" && !(row.request?.level > 0) && row.target?.level) row = { ...row, request: { name, level: row.target.level } };
			const aa = { ...a, name, scroll: a.scroll || upgrade_scroll(name, a.level || 0) };
			return G.items[name].compound ? run_compound(aa, row) : run_upgrade(aa, row);
		}
		case "compound": gold_ok(); return run_compound(a, row);
		case "craft": return run_craft(a);
		case "stat": return run_stat(a);
		case "exchange": {
			if (!a.ready) throw { reason: "inputs_not_ready" };
			if (character.esize < 1) throw { reason: "no_space" };
			await go_exchange(a);
			const k = find_slot(a.name, a.level || 0);
			if (k < 0 || (character.items[k].q || 1) < (a.quantity || 1)) throw { reason: "input_missing" };
			await wait_budget(1, RESERVE.errand);
			const r = await T(exchange(k), 30_000); // exchange() waits out the roll animation (several seconds)
			game_log(`exchange ${a.name} → ${r?.reward || "?"}`, C.ok);
			return r;
		}
		case "token":
			if (!a.ready) throw { reason: "inputs_not_ready" };
			await go_npc(a.npc);
			await wait_budget(1, RESERVE.errand);
			return T(exchange_buy(a.token, row.target?.name || row.request?.name || a.name));
		case "dismantle": {
			if (!a.ready) throw { reason: "inputs_not_ready" };
			if ((a.fee || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" };
			const k = a.resources?.[0] && character.items[a.resources[0].num]?.name === a.name ? a.resources[0].num : find_slot(a.name, a.level || 0);
			if (k < 0) throw { reason: "input_missing" };
			await go_npc(a.npc || "craftsman");
			await wait_budget(1, RESERVE.errand);
			return T(dismantle(k));
		}
		case "retrieve": {
			const t = a.target, packs = bank_packs_list();
			if (!t || !packs[t.pack]) throw { reason: "bank_target" };
			if (character.esize < 1) throw { reason: "no_space" };
			if (character.map !== packs[t.pack][0]) await go({ map: packs[t.pack][0] });
			if (!(await until(() => character.bank && character.bank[t.pack], 10_000))) throw { reason: "bank_not_loaded" }; // ≤10s
			const pack = character.bank[t.pack];
			const n = pack[t.bankNum]?.name === a.name ? t.bankNum : pack.findIndex((i) => i && i.name === a.name && (i.level || 0) === (a.level || 0));
			if (n < 0) throw { reason: "not_in_bank" };
			await wait_budget(1, RESERVE.errand);
			state.fetched[a.name] = Date.now(); // don't bank it straight back
			return T(bank_retrieve(t.pack, n));
		}
		case "supplies":
			if (a.unlock) throw { reason: "locked_potions_user_choice" };
			return buy_from_npc(a.name, a.quantity, a.npc || "fancypots");
		case "hunt": return run_hunt();
	}
	throw { reason: "unsupported" };
}
// One guide step: re-read, run the top actionable row; failures back off (low odds 30 min, else 5 min)
// A row we can do without walking anywhere from here: equips, retrieves from the bank floor we're standing on,
// and NPC steps a computer covers. Those don't count toward guide_steps_per_run, so a bank visit keeps going
// while the guide keeps asking for items from the bank (it reveals them one retrieve+equip at a time).
const bank_floors = () => new Set(Object.values(bank_packs_list()).map((p) => p[0]));
const on_bank_floor = () => bank_floors().has(character.map);
function row_is_local(row) {
	const a = row.action || {};
	if (row.kind === "equip") return true;
	if (row.kind === "retrieve") return bank_packs_list()[a.target?.pack]?.[0] === character.map;
	return has_computer() && ["buy", "upgrade", "develop", "compound", "craft", "exchange", "supplies"].includes(row.kind) && !G.craft[a.recipe]?.quest;
}
// Run one guide row (the given one, or the top actionable). On failure pause it: 30 min if the odds were too low
// (they change slowly), 5 min otherwise. Returns true if the row ran.
async function guide_step(row) {
	row = row || next_guide_row(guide_refresh());
	if (!row) return false;
	if (["buy", "upgrade", "compound", "stat", "craft"].includes(row.kind) && gold_room() <= 0) {
		skip(row.id, 1_800_000, "gold budget: party spending ≥ income");
		return false;
	}
	try {
		await run_row(row);
		await sleep_ms(500); // let the result's update arrive before the guide is re-read
		delete state.row_fails[row.id];
		return true;
	} catch (e) {
		// repeated failures back off: 5, 15, 45 min ... up to 6h (low odds: at least 30 min)
		const n = (state.row_fails[row.id] = (state.row_fails[row.id] || 0) + 1);
		const ms = Math.min(6 * 3600_000, 300_000 * Math.pow(3, n - 1));
		skip(row.id, e?.reason === "low_chance" ? Math.max(1_800_000, ms) : ms, why(e) + (e?.chance !== undefined ? ` ${(e.chance * 100).toFixed(0)}%` : "") + (e?.want ? ` ${e.want}` : "") + (n > 1 ? ` (failure #${n})` : ""));
		game_log(`guide: skip ${row.id} (${why(e)}${e?.chance !== undefined ? " " + (e.chance * 100).toFixed(0) + "%" : ""}${e?.want ? " " + e.want : ""})`, C.dim);
		return false;
	}
}

// =====================================================================
// Town run: one errand doing everything due, in walking order
// =====================================================================
let bags_warned = 0; // last "bags full and nothing to bank" warning (repeated at most every 10 min)
// The tasks a town run can do. town_due() also returns plan/min_free/pot_min/relaxed — never derive "what's due" from
// its truthy keys: the numeric fields would make a town run permanently due.
const TOWN_TASKS = ["hunt", "tokens", "craft", "guide", "compound", "upgrade", "stat", "forge", "exchange", "elixir", "sell", "restock", "bank"];
const due_tasks = (due) => TOWN_TASKS.filter((k) => due[k]);
// A trip that can't wait: nearly full bags, bags short with something to sell/bank, potions low, a hunt to turn in
// v18.8: a hunt to turn in / take is no longer urgent: it rides on the next trip (Daisy is in town)
const town_urgent = (due) => character.esize <= 3 ? `bags ${character.esize} free` : due.restock ? "potions" :
	(due.plan.free < due.min_free && (due.sell || (due.bank && due.plan.bank.length > 0))) ? `bags short (${due.plan.free} free)` : "";
// Town trips in the last hour on this version: what triggered each (v18.6) and what was due on them.
// span: minutes covered (less than 60 right after an update)
function town_causes(ms = 3600_000) {
	const all = hist.ev.filter((e) => e.type === "town" && Date.now() - e.t < ms);
	const ev = all.filter((e) => e.v === VERSION), by = {}, trig = {};
	for (const e of ev) {
		for (const w of (e.due || "").split("+").filter(Boolean)) by[w] = (by[w] || 0) + 1;
		const t = e.trig || "?"; trig[t] = (trig[t] || 0) + 1;
	}
	const first = hist.ev.find((e) => e.v === VERSION && e.type === "loaded")?.t;
	const span = Math.round(Math.min(ms, Date.now() - (first && first > Date.now() - ms ? first : Date.now() - ms)) / 60_000);
	const sort = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
	return { n: ev.length, older: all.length - ev.length, span, by: sort(by), trig: sort(trig) };
}
// relaxed: the partner is already in town, so use the trip — bank at < bag_min_free × sync_factor free slots,
// restock potions below pot_min × sync_factor
// What a town run would do now (see TOWN_TASKS). sell/bank only when bags are short (or, with a computer, once
// sell_batch junk items pile up); bank also when needed items wait in the bank.
// Town tasks that came due but achieved nothing pause 15 min (town:<task>), so one stuck task can't drive the loop brake
const compound_town_due = () => !skipped("town:compound") && compound_groups().some((g) => g.bags.length >= 3);
const forge_town_due = () => { if (skipped("town:forge")) return false; const c = craft_pick(); return !!c && craft_inputs_in_bags(c.id); };
function town_due(relaxed = false) {
	const plan = bag_plan();
	let min_free = relaxed ? CFG.bag_min_free * CFG.party.sync_factor : CFG.bag_min_free;
	let pot_min = relaxed ? CFG.pot_min * CFG.party.sync_factor : CFG.pot_min;
	if (merchant_recent()) { min_free = Math.min(min_free, CFG.merchant.fighter_min_free); pot_min = Math.min(pot_min, CFG.merchant.fighter_pot_min); }
	const short = plan.free < min_free;
	if (plan.free === 0 && !plan.sell.length && !plan.bank.length && Date.now() - bags_warned > 600_000) {
		bags_warned = Date.now();
		game_log("Bags full and everything in them is marked keep — run report() to see why", C.bad);
	}
	const due = {
		hunt: hunt_due(),
		craft: !!next_quest_craft(),
		compound: compound_town_due(),
		upgrade: !skipped("town:upgrade") && upgrade_due(),
		forge: forge_town_due(),
		stat: !skipped("town:stat") && !!stat_scroll_list().find((r) => r.ok),
		tokens: !skipped("town:tokens") && !!token_pick(),
		exchange: !skipped("town:exchange") && exchange_pick() >= 0,
		elixir: elixir_buy_due(),
		guide: !!next_guide_row(state.guide),
		sell: !skipped("town:sell") && plan.sell.length > 0 && (short || (has_computer() && plan.sell.length >= CFG.sell_batch) ||
			(is_merchant() && plan.sell.some((k) => character.items[k] && (state.purge[purge_key(character.items[k])] || sell_plain_item(character.items[k]))))),
		restock: !skipped("town:restock") && (pot_count("hp") < pot_min || pot_count("mp") < pot_min),
		// fetches of our bank upgrades alone don't send us while the merchant is online: it fetches and delivers them
		bank: !skipped("town:bank") && CFG.bank && ((short && plan.free + plan.sell.length < min_free && plan.bank.length > 0) ||
			plan.fetch.some((f) => !(merchant_recent() && !is_merchant() && String(f.key || "").startsWith("gear:")))),
		plan, min_free, pot_min, relaxed,
	};
	// merchant online: a fighter doesn't walk to town for guide steps alone more than once per guide_gap_ms; they're
	// done on the next trip that happens for another reason
	if (merchant_recent() && due.guide && !due_tasks(due).some((k) => k !== "guide") &&
		Date.now() - (state.last_town || 0) < CFG.merchant.guide_gap_ms) due.guide = false;
	return due;
}
// state.town_end_at: when the last run finished (the soft gap counts from there, not from leaving)
function town_run(due) {
	return errand("town", async () => {
		try { await town_body(due); } finally {
			state.town_end_at = Date.now();
			await ptown_wait().catch(() => {}); // v24.28: everyone on the trip walks back together
		}
	});
}
async function town_body(due) {
	{
		await stand_close(); // a stand slows us to speed 10
		// v24.61: a party fighter never teleports to town (the others walk); the tank walks there with the party behind it
		if (ptown_on()) { if (!is_follower()) await ptown_lead(); } else await town_hop().catch(() => 0);
		// each step refreshes the errand lock: a long run that keeps making progress is never taken for a hung one (other
		// code would then start a walk and interrupt this run's smart_move)
		const step = async (label, fn) => { state.errand_at = Date.now(); try { return await fn(); } catch (e) { town_reason[label] = town_reason[label] || why(e); game_log(`${label}: ${why(e)}`, C.dim); } };
		// step: run one task, record why it failed (for report()), never let one failure end the run.
		// A task that achieves nothing (bank full, item on another bank floor, no gold) pauses 15 min,
		// so an unfixable condition can't send us to town every town_min_gap_ms
		const bag_step = async (key, fn) => {
			delete town_reason[key];
			const n = (await step(key, fn)) || 0;
			if (!n) skip("town:" + key, 900_000, town_reason[key] || "achieved nothing");
			return n;
		};
		let did = 0;
		const town_t0 = Date.now();
		if (!is_merchant() && collect_list(true).length) did += (await step("collect", task_collect)) || 0; // v24.75
		if (due.hunt) did += (await step("hunt", run_hunt)) ? 1 : (skip("hunt:auto", 300_000), 0);
		if (!skipped("town:tokens") && token_pick()) did += await bag_step("tokens", task_tokens); // Daisy: next to the hunt
		if (due.craft) did += (await step("craft", quest_crafts)) || 0;
		// Guide steps: keep going while the next row is local (no walking); rows that walk count toward the cap;
		// a failed row is paused and we move on to the next one instead of ending the run
		if (due.guide) for (let i = 0, far = 0, fails = 0; i < 60; i++) {
			if (character.rip || state.recovering || character.hp < character.max_hp * 0.5) break;
			const row = next_guide_row(guide_refresh());
			if (!row) break;
			const local = row_is_local(row);
			if (!local && far >= CFG.guide_steps_per_run) break;
			if (!local) far++;
			if (await step("guide", () => guide_step(row))) did++;
			else if (++fails >= 5) break;
		}
		guide_refresh(); // needs may have changed (crafted, upgraded) before deciding what to bank
		if (compound_town_due()) did += await bag_step("compound", task_compound);
		if (!skipped("town:upgrade") && upgrade_due()) did += await bag_step("upgrade", task_upgrade);
		if (!skipped("town:stat") && stat_scroll_list().some((r) => r.ok)) did += await bag_step("stat", task_stat);
		if (forge_town_due()) did += await bag_step("forge", task_craft_power);
		if (!skipped("town:exchange") && exchange_pick() >= 0) did += await bag_step("exchange", task_exchange);
		if (elixir_buy_due()) did += await bag_step("elixir", task_elixir);
		// Still in the bank after the guide's retrieves: store/fetch now, before walking anywhere else
		let banked = false;
		if (CFG.bank && on_bank_floor() && !skipped("town:bank")) {
			const here = bag_plan();
			if (here.bank.length || here.fetch.length) { did += await bag_step("bank", () => task_bank(here.fetch)); banked = true; }
		}
		const plan = bag_plan();
		const short = plan.free < (due.min_free || CFG.bag_min_free);
		if (due.sell || (short && plan.sell.length && !skipped("town:sell"))) did += await bag_step("sell", task_sell);
		// in town anyway: top potions up well before they'd run low (else a potion trip follows this one)
		const topup = Math.ceil(CFG.pot_buy * CFG.town_topup);
		if (due.restock) did += await bag_step("restock", () => task_restock(due.pot_min));
		else if (!is_merchant() && !skipped("town:restock") && (pot_count("hp") < topup || pot_count("mp") < topup)) did += (await step("restock", () => task_restock(topup))) || 0;
		const after = bag_plan();
		// standing in the bank anyway (guide retrieves): store what's bankable now, short on space or not
		// in town anyway: store everything bankable (not only when short), so a bag trip doesn't follow this one
		if (CFG.bank && !banked && !skipped("town:bank") && ((after.free < 2 * Math.max(due.min_free || 0, CFG.bag_min_free) || on_bank_floor()) && after.bank.length || after.fetch.length))
			did += await bag_step("bank", () => task_bank(after.fetch));
		// the bank visit may have fetched the missing copies of a group: compound now, while still in town
		if (compound_town_due()) did += await bag_step("compound", task_compound);
		// ...or a set piece to upgrade (v24.69)
		if (!skipped("town:upgrade") && upgrade_due()) did += await bag_step("upgrade", task_upgrade);
		state.last_pick = 0; // re-evaluate where to fight
		state.last_town_did = did; // v24.92: the loop brake spares a merchant whose runs get work done
		log_ev("town", { due: due_tasks(due).join("+"), did, secs: Math.round((Date.now() - town_t0) / 1000), trig: state.town_trig || "?", v: VERSION });
		return did;
	}
}

// ---- Party town trips (v24.28, CFG.party.town_together) ----
// state.ptown: { id, by (who started it), at, leavers (members known to be going), pending (we'll go once free),
// joined (we went: our heartbeat pt), done (our work's finished: waiting in town), why (why we went / stayed) }
const ptown_on = () => !!CFG.party.town_together && !is_merchant() && in_party_cfg();
// The town teleport (to this map's spawn: server transport_player_to(player, player.in)) when it cuts the walk to
// main's town by town_hop_px. 3s channel; a hit or a move cancels it, and it fails with more than 5 monsters on us.
// Channel the town teleport (3s) to this map's spawn: true if we arrived
async function town_teleport() {
	if (walking()) { halt("town_teleport"); }
	state.town_at = Date.now();
	await T(use_skill("use_town"), 8000).catch(() => {});
	await until(() => !character.c?.town && Date.now() - state.town_at > 1500, 6000);
	return at_town_spot();
}
async function town_hop() {
	if (!CFG.town_hop || character.rip || typeof use_skill !== "function" || hit_on_me()) return 0;
	const town = dest_point("main"), sp = dest_point(character.map);
	if (!town || !sp) return 0;
	const here = route_to(town.map, town.x, town.y), there = route_to(town.map, town.x, town.y, sp);
	if (!here || !there || here.d - there.d < CFG.town_hop_px) return 0;
	const ok = await town_teleport();
	game_log(ok ? `town: teleported (~${Math.round(here.d - there.d)}px less walking)` : "town: the teleport didn't happen; walking", C.dim);
	return ok ? 1 : 0;
}
// Starts a town run when something is due. Blockers are recorded (report() shows them; with a nearly full bag the
// log says so every 5 min). Nearly full bags lower the HP floor and ignore attackers, and a patrol walk yields to
// town — otherwise a priest hovering at 60-70% HP, or a patrol between waypoints, can farm with a full bag for hours.
let town_block_logged = 0; // last "town needed but waiting" log (at most every 5 min)
function town_check() {
	if (ptown_join_tick()) return; // v24.28: a member's trip we're going on
	if (Date.now() - state.last_town < CFG.town_min_gap_ms) return;
	if (skipped("town:loop") && character.esize > 3) return;
	const townies = partners().filter((p) => p.errand === "town").map((p) => p.name);
	const due = town_due(townies.length > 0); // a member in town → share the trip
	const what = due_tasks(due);
	if (party_trip_check(due, what)) return; // v24.99: the tank's party trips (fighter.js)
	if (!what.length) return void (state.town_block = null);
	// v23.6: a hunt to take or turn in never starts a trip by itself (with hunt_min_xp most hunts lapse unchased, so a
	// trip just for Daisy mostly fetched another one to ignore); it's done on the next trip made for anything else
	// (v24.77: nor do stat scrolls)
	if (what.every((k) => k === "hunt" || k === "stat")) return void (state.town_block = { what: what.join("+"), blockers: ["a hunt or stat scrolls alone wait for the next trip"], at: Date.now() });
	const critical = character.esize <= 3; // nearly full bags: go even when attacked or lower on HP
	// deferrable-only work (no bag/potion shortage, no hunt) waits town_soft_gap_ms; the next trip does it anyway
	if (!is_merchant() && !town_urgent(due)) {
		const since = Date.now() - Math.max(state.last_town || 0, state.town_end_at || 0);
		if (since < CFG.town_soft_gap_ms) {
			state.town_block = { what: what.join("+"), blockers: [`deferrable: next trip in ${Math.ceil((CFG.town_soft_gap_ms - since) / 60_000)}m`], at: Date.now() };
			return;
		}
		if (walking() && !errand_busy()) { // on the way to the pack: arrive first; deferrable work never turns us around
			state.town_block = { what: what.join("+"), blockers: ["deferrable: walking to the pack"], at: Date.now() };
			return;
		}
	}
	const attacked = !!get_nearest_monster({ target: character.name });
	const floor = critical ? CFG.town_hp_critical : CFG.town_hp;
	const blockers = [];
	if (errand_busy()) blockers.push(`errand ${state.errand}`);
	if (attacked && !critical) blockers.push("under attack");
	if (character.hp < character.max_hp * floor) blockers.push(`HP ${Math.round((character.hp / character.max_hp) * 100)}% < ${floor * 100}%`);
	// a patrol/pack walk yields to town — only when nothing else holds the trip (v24.4: stopped every tick otherwise, and
	// with HP under the floor the walk to the pack froze until regen)
	if (!blockers.length && walking() && !errand_busy()) { halt("town_check"); blockers.push("stopping a pack walk"); }
	state.town_block = { what: what.join("+"), blockers, at: Date.now() };
	if (blockers.length) {
		if (critical && Date.now() - town_block_logged > 300_000) {
			town_block_logged = Date.now();
			game_log(`Town needed (${what.join("+")}, ${due.plan.free} free) but waiting: ${blockers.join(", ")}`, C.warn);
		}
		return;
	}
	// Loop brake: more than 6 runs in 10 minutes means something keeps coming back due — pause non-critical runs
	state.town_runs = (state.town_runs || []).filter((t) => Date.now() - t < 600_000);
	// (v24.92: not the merchant while its runs get work done — 6 runs of upgrades in 10 min paused it 15 min, idle with 12M)
	if (state.town_runs.length >= 6 && !critical && !(is_merchant() && (state.last_town_did || 0) > 0)) {
		if (!skipped("town:loop")) {
			skip("town:loop", 900_000, `${state.town_runs.length} runs in 10 min; last due: ${what.join("+")}`);
			game_log(`Town: ${state.town_runs.length} trips in 10 min (${what.join("+")} keeps coming back) — pausing town trips 15 min. Send report().`, C.bad);
		}
		return;
	}
	state.town_runs.push(Date.now());
	state.last_town = Date.now();
	state.town_trig = town_urgent(due) || (due.relaxed ? "joined a member's trip" : "deferrable");
	game_log(`Town: ${what.join("+")} (${due.plan.free} free${due.relaxed ? ", with " + townies.join(", ") : ""})`, C.dim);
	if (town_run(due)) ptown_start(what);
}

// =====================================================================
// Recovery, death, parking
// =====================================================================
// Low-HP recovery — the merchant only: fighters never flee. Cancel any walk (it would block the channel), teleport to
// town (3s channel), fight back only if hit, and stay out until recover_hp/recover_mp. use_town has no cooldown and fails while > 5 monsters target us, so
// retries are spaced 1.5s apart; it's re-channelled only if something followed us below flee_hp.
// v24.4: the 3s town channel is cancelled by every hit we take, every attack, heal or skill we cast and every potion
// (drinking is an "equip" packet; server: player.c = {}). The old flee channelled and fought back in the same tick, and
// sustain() drank within 2s, so the teleport almost never landed; and it only re-channelled below flee_hp, so one potion
// above 25% left us "recovering" in place — a melee fighter shot from range stood still until it died. Now: while
// anything is on us (or hit us in the last quiet_ms), fight it (walking to it if melee) and drink; once it's quiet,
// channel, and do nothing that would cancel it until it lands; retry until we're home.
const hurt_ms = () => { const h = pmring.hits[pmring.hits.length - 1]; return h ? Date.now() - h.t : Infinity; };
const channeling = () => !!character.c?.town || Date.now() - (state.town_at || 0) < 700; // the server's update can lag our send
const at_town_spot = () => { const sp = G.maps[character.map]?.spawns?.[0]; return !!sp && Math.hypot(character.x - sp[0], character.y - sp[1]) < 150; };
// park(): finish the current errand, go to town and stand there (still fighting back). resume(): carry on.
function park() { state.parked = true; state.park_home = false; game_log("Parking after the current errand", C.info); }
// v24.93: unpause() in the CODE console lifts paused tasks — all town ones by default, or those starting with `prefix`
// ("town:loop", "upg:", "cmp:"...). The script's own variables (state...) aren't reachable from the console.
function unpause(prefix = "town:") {
	const gone = Object.keys(state.gear_skip).filter((k) => k.startsWith(prefix));
	for (const k of gone) delete state.gear_skip[k];
	save_state();
	game_log(gone.length ? `unpaused: ${gone.join(", ")}` : `nothing paused under "${prefix}"`, C.info);
	return gone;
}
function resume() { state.parked = false; state.last_pick = 0; state.last_target_at = Date.now(); game_log("Resuming", C.info); }
// While parked: one trip to town, then stand and defend
function park_tick() {
	if (!errand_busy() && !state.park_home) {
		if (walking()) halt("park_tick");
		state.park_home = errand("park", async () => { await go("town"); });
	}
	const t = choose_target(false);
	if (t && !character.c.town) fight(t, false);
	set_message(errand_busy() ? `Parking (${state.errand})` : "Parked");
}
if (CFG.park_key && typeof map_key === "function") map_key(CFG.park_key, "snippet", "state.parked ? resume() : park()");

// =====================================================================
// Persistence
// =====================================================================
const SAVE_KEY = "farmer_v9:" + character.name; // historical name — don't change it, or saved state is lost
// Saved every 60s, after crafts and gold transfers, and in on_destroy (just before the code stops). Expired pauses and
// cooldowns are dropped on load; stall timers resume where they were (time offline doesn't count against them).
const DATA_V = 2; // bump to clear everything learned, once per character (load_state)
function save_state() {
	if (typeof set !== "function") return;
	// v: format version (load_state ignores anything else); at: save time (offline time is excluded from stall timers)
	set(SAVE_KEY, { v: 1, at: Date.now(), data_v: DATA_V, upg_v: 3, cmp_v: 2, meas_v: 3, measured: state.measured, meas_at: state.meas_at, realism: state.realism, danger: state.danger,
		danger_at: state.danger_at, calib: state.calib, calib_all: state.calib_all,
		cooldown: state.cooldown, gear_skip: state.gear_skip, crafted: state.crafted, bank_seen: state.bank_seen,
		guide_ignore: state.guide_ignore, guide_quests: state.guide_quests, qprog: state.qprog, gprog: state.gprog, bank_full_at: state.bank_full_at,
		fetched: state.fetched, fetch_try: state.fetch_try, gold_xfer_at: state.gold_xfer_at || 0,
		last_town: state.last_town || 0, town_end_at: state.town_end_at || 0, town_runs: state.town_runs || [], probe_at: state.probe_at || 0,
		bank_gear: state.bank_gear, bank_dump: state.bank_dump || null, bank_at: state.bank_at || 0, bank_by: state.bank_by || null, guide_equip: state.guide_equip, upg: state.upg, upg_caps: state.upg_caps, cmp_caps: state.cmp_caps, probe_ok: state.probe_ok, donated: state.donated, stand: state.stand,
		bank_free: state.bank_free, purge: state.purge, row_fails: state.row_fails, hold_for: state.hold_for,
		mspot: state.mspot, parcel_at: state.parcel_at, travel_off: state.travel_off, travel_full: state.travel_full || null, owe: state.owe || 0, safety_mult: state.safety_mult || 1, safety_at: state.safety_at || 0,
		skip_why: Object.fromEntries(Object.entries(skip_why).filter(([k]) => skipped(k))) });
}
function load_state() {
	const d = typeof get === "function" ? get(SAVE_KEY) : null;
	if (!d || d.v !== 1) return;
	// v24.50: one-time clear-out of everything learned so far (owner's instruction). Spot xp/s, the model's realism,
	// damage calibration, flee/death penalties, spot rests, probe verdicts, the safety self-tuning
	// were all gathered while the party wandered, fought with members missing or without their gear, and walked
	// into fights one by one — none of it describes this party farming a camp together. Each character drops it once,
	// the first time it loads this version; quests, bank, gear and town state are kept.
	if (d.data_v !== DATA_V) {
		for (const k of ["measured", "meas_at", "realism", "danger", "danger_at", "calib", "calib_all", "cooldown", "probe_ok", "probe_at", "safety_mult", "safety_at"]) delete d[k];
		game_log(`farmer v${VERSION}: learned data cleared once (spot rates, damage calibration, penalties, probe verdicts) — starting clean`, C.warn);
	}
	const now = Date.now(), live = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, t]) => t > now));
	// v23.0: measurements are now in one unit (base xp of kills at the spot); older ones mixed received xp (a share of
	// every party kill) with own kills, so they're dropped once and re-measured
	if (d.meas_v === 3) {
		Object.assign(state.measured, d.measured || {});
		// measurements saved before v24.3 have no time: they start ageing now
		const t0 = Date.now();
		for (const k in state.measured) { state.meas_at["p:" + k] = d.meas_at?.["p:" + k] || t0; if (d.meas_at?.["w:" + k]) state.meas_at["w:" + k] = d.meas_at["w:" + k]; }
		if (d.realism > 0) state.realism = d.realism;
	} else if (Object.keys(d.measured || {}).length) game_log(`farmer v${VERSION}: pack measurements reset (new unit); re-measuring`, C.dim);
	Object.assign(state.danger, d.danger || {});
	Object.assign(state.danger_at, d.danger_at || {});
	Object.assign(state.calib, d.calib || {});
	if (d.calib_all?.n) state.calib_all = d.calib_all;
	Object.assign(state.cooldown, live(d.cooldown));
	Object.assign(state.gear_skip, live(d.gear_skip));
	Object.assign(state.crafted, d.crafted || {});
	Object.assign(state.bank_seen, d.bank_seen || {});
	Object.assign(state.guide_ignore, live(d.guide_ignore));
	Object.assign(state.guide_quests, d.guide_quests || {});
	Object.assign(skip_why, d.skip_why || {});
	if (d.bank_full_at) state.bank_full_at = d.bank_full_at;
	Object.assign(state.fetched, d.fetched || {});
	Object.assign(state.fetch_try, d.fetch_try || {});
	if (Array.isArray(d.travel_off)) state.travel_off = d.travel_off;
	if (d.travel_full) state.travel_full = d.travel_full; // v24.27: a reload mid-walk still puts them back on
	if (d.gold_xfer_at) state.gold_xfer_at = d.gold_xfer_at;
	// v19.0: trip timers survive a reload (before, every reload sent everyone to town for deferrable work at once)
	if (d.last_town) state.last_town = d.last_town;
	if (d.town_end_at) state.town_end_at = d.town_end_at;
	if (d.probe_at) state.probe_at = d.probe_at; // v23.1: a reload no longer makes a probe due at once
	if (Array.isArray(d.town_runs)) state.town_runs = d.town_runs.filter((t) => now - t < 600_000);
	if (Array.isArray(d.bank_gear)) state.bank_gear = d.bank_gear;
	if (d.bank_dump && typeof d.bank_dump === "object") state.bank_dump = d.bank_dump;
	if (d.bank_at) { state.bank_at = d.bank_at; state.bank_by = d.bank_by || null; }
	if (d.upg?.name) state.upg = d.upg;
	if (d.upg_caps && typeof d.upg_caps === "object") state.upg_caps = d.upg_caps;
	if (d.cmp_caps && typeof d.cmp_caps === "object") state.cmp_caps = d.cmp_caps;
	if (d.probe_ok && typeof d.probe_ok === "object") state.probe_ok = d.probe_ok;
	if (d.donated) state.donated = d.donated;
	if (d.stand) state.stand = d.stand;
	if (d.bank_free) state.bank_free = d.bank_free;
	Object.assign(state.purge, d.purge || {});
	Object.assign(state.row_fails, d.row_fails || {});
	Object.assign(state.hold_for, d.hold_for || {});
	if (d.mspot) state.mspot = d.mspot;
	if (d.parcel_at) state.parcel_at = d.parcel_at;
	if (d.owe > 0) state.owe = d.owe; // potion bills not paid yet (v23.0)
	if (d.safety_mult > 0) { state.safety_mult = d.safety_mult; state.safety_at = d.safety_at || 0; } // v23.5
	Object.assign(state.guide_equip, d.guide_equip || {});
	// guide-row pauses from older versions have no recorded reason and were judged by older rules: retry them now
	if (!d.skip_why) for (const k in state.gear_skip) if (!k.includes(":") || k.startsWith("upgrade:") || k.startsWith("compound:")) delete state.gear_skip[k];
	// v14.1: compounds/upgrades that took longer than 10s were reported as "timeout" and paused 6-24h: retry them
	for (const k in state.gear_skip) if (/timeout|gold_reserve|buy_cost|interrupted/.test(skip_why[k] || "") && /^(cmp:|upg:|upgrade:|compound:)/.test(k)) delete state.gear_skip[k];
	const off = now - (d.at || now);
	if (d.qprog) state.qprog = { ...d.qprog, t: d.qprog.t + off };
	if (d.gprog) state.gprog = { ...d.gprog, t: d.gprog.t + off };
	// v24.82: upgrade ceilings and pauses recorded under the 50%/80% rules go once (a wand "capped at +4" would stay there)
	delete state.gear_skip["town:loop"]; // v24.93: a loop brake from before a reload (usually a new build) doesn't carry over
	if (d.cmp_v !== 2) { state.cmp_caps = {}; for (const k in state.gear_skip) if (k.startsWith("cmp:")) delete state.gear_skip[k]; } // v24.87: caps from the 75% rule
	if (d.upg_v !== 3) { state.upg_caps = {}; for (const k in state.gear_skip) if (k.startsWith("upg:")) delete state.gear_skip[k]; }
	game_log(`farmer v${VERSION}: loaded ${Object.keys(state.measured).length} measured packs, ${Object.keys(state.crafted).length} crafts`, C.dim);
}
load_state();
// v24.2: the commit this build came from (loader v2 passes it on); a version number alone can't tell two builds apart
const BUILD = (() => { const s = typeof window !== "undefined" ? window.farmer_loaded?.sha : null; return typeof s === "string" ? s.slice(0, 7) : null; })();
const build_txt = (v, b) => `v${v || "?"}${b ? "@" + b : ""}`;
// Another member runs different code: another version, or the same version from another commit (when both know theirs)
const other_build = (v, b) => v !== VERSION || (!!b && !!BUILD && b !== BUILD);
// v19.2: say which version just started, how it was loaded, and what ran before (per character, in browser storage)
(() => {
	const key = "farmer_ver:" + character.name, prev = typeof get === "function" ? get(key) : null;
	const fl = typeof window !== "undefined" ? window.farmer_loaded : null;
	const how = fl ? (fl.how || "loaded") : "pasted";
	const was = prev?.v ? (prev.v === VERSION ? `same as before` : `was v${prev.v}`) : "first run here";
	game_log(`★ farmer ${build_txt(VERSION, BUILD)} running — ${how}; ${was}`, prev?.v && prev.v !== VERSION ? "#7f7" : fl?.how?.includes("cache") ? "#fa0" : "#8cf");
	if (typeof set === "function") set(key, { v: VERSION, at: Date.now() });
})();
setInterval(() => { save_state(); save_hist(); }, 60_000);
function on_destroy() { save_state(); save_hist(); store_report(); } // the game calls this just before the code is stopped or reloaded
// forget(): clear learned farming data (measurements, danger notes, cooldowns, pauses); craft history is kept
function forget() { Object.assign(state, { measured: {}, meas_at: {}, danger: {}, danger_at: {}, calib: {}, calib_all: { ratio: 1, n: 0 }, cooldown: {}, gear_skip: {}, realism: 1 }); save_state(); game_log("Learned state cleared"); }

// =====================================================================
// Diagnostics (call from the CODE console): report(), why_not("bee")
// =====================================================================
const mins = (t) => `${Math.max(0, Math.ceil((t - Date.now()) / 60_000))}m`; // minutes until timestamp t, as "12m"
// The game's log can't be copied; report() also opens a selectable text box and tries the clipboard
function share_text(title, lines) {
	const text = lines.join("\n");
	try { parent.navigator?.clipboard?.writeText(text).catch(() => {}); } catch (e) {}
	const esc = (x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
	if (typeof parent.show_modal === "function")
		// a read-only text box in the game's modal window (420px tall fits a full report); clicking selects everything
		parent.show_modal(`<div style="color:#fff;margin-bottom:6px">${esc(title)} — select all and copy (Ctrl+A, Ctrl+C)</div>` +
			`<textarea readonly style="width:100%;height:420px;background:#111;color:#cfe;font-size:13px" onclick="this.select()">${esc(text)}</textarea>`);
	return text;
}
// Hide game-log lines matching CFG.quiet_logs: wraps the game page's add_log (the client's log function). A reload
// re-wraps the original, never a wrapper; [] turns it off.
// Characters started as bots log via parent.parent with a "Name: " prefix, so both windows are wrapped (unanchored patterns).
function quiet_logs() {
	const pats = CFG.quiet_logs || [];
	let n = 0;
	for (const P of new Set([typeof parent !== "undefined" ? parent : null, typeof parent !== "undefined" ? parent?.parent : null])) {
		try {
			if (!P || typeof P.add_log !== "function") continue;
			const orig = P.add_log.farmer_orig || P.add_log;
			const f = function (message, color) {
				if (typeof message === "string" && pats.some((re) => re.test(message))) return;
				return orig.apply(this, arguments);
			};
			f.farmer_orig = orig;
			P.add_log = pats.length ? f : orig;
			n++;
		} catch (e) {} // another origin's window: leave it
	}
	return n > 0;
}
quiet_logs();
// ---- Bigger panels (CFG.ui, v24.20) ----
// A style rule in the game page for the log (size, font, a resize handle) and our own iframe's size for the status box.
// A size dragged with the log's handle is saved (shared by every character in this browser) and reapplied on reload.
function apply_ui() {
	const U = CFG.ui;
	if (typeof parent === "undefined" || !parent.document) return false;
	if (!U?.enabled) { // v24.21: take back the rule an earlier version left in the game page (it lasts until the page reloads)
		try { const st = parent.document.getElementById("farmer-ui"); if (st && st.parentNode) st.parentNode.removeChild(st); } catch (e) {}
		return false;
	}
	try {
		const pd = parent.document, saved = (typeof get === "function" && get("farmer_ui")) || {};
		let st = pd.getElementById("farmer-ui");
		if (!st) { st = pd.createElement("style"); st.id = "farmer-ui"; (pd.head || pd.documentElement).appendChild(st); }
		const w = saved.log_w || U.log_w, h = saved.log_h || U.log_h, f = saved.log_font || U.log_font;
		st.textContent = `#gamelog{width:${w}px !important;height:${h}px !important;max-height:none !important;max-width:none !important;` +
			`font-size:${f}px !important;line-height:1.25 !important;resize:both !important;overflow:auto !important}` +
			`#gamelog .gameentry{font-size:inherit !important}`;
		const fe = typeof window !== "undefined" ? window.frameElement : null; // our iframe: the status box under CODE
		if (fe && fe.style && fe.offsetWidth > 2) { fe.style.width = U.status_w + "px"; fe.style.height = U.status_h + "px"; }
		const gg = typeof document !== "undefined" && document.getElementById ? document.getElementById("gg") : null;
		if (gg) { gg.style.fontSize = U.status_font + "px"; gg.style.lineHeight = "1.25"; gg.style.whiteSpace = "normal"; }
		const gl = pd.getElementById("gamelog");
		const W_ = typeof window !== "undefined" ? window : globalThis;
		if (gl && gl.__farmer_ro_win !== W_ && typeof ResizeObserver === "function") {
			let tmr = null;
			const ro = new ResizeObserver(() => {
				clearTimeout(tmr);
				tmr = setTimeout(() => {
					const cw = Math.round(gl.offsetWidth), ch = Math.round(gl.offsetHeight);
					const cur = (typeof get === "function" && get("farmer_ui")) || {};
					if (cw > 100 && ch > 60 && (cw !== cur.log_w || ch !== cur.log_h) && typeof set === "function") set("farmer_ui", { ...cur, log_w: cw, log_h: ch });
				}, 800);
			});
			ro.observe(gl);
			gl.__farmer_ro_win = W_;
		}
		return true;
	} catch (e) { return false; } // another origin, or no such panel: leave the game's own layout
}
// Console: ui(560, 360, 15) — the log's width, height and font size (saved); ui() — back to CFG.ui. Needs CFG.ui.enabled.
function ui(w, h, font) {
	const cur = (typeof get === "function" && get("farmer_ui")) || {};
	const next = w === undefined ? {} : { ...cur, log_w: w || cur.log_w, log_h: h || cur.log_h, log_font: font || cur.log_font };
	if (typeof set === "function") set("farmer_ui", next);
	apply_ui();
	return next;
}
apply_ui();
// report(): one-screen summary of what the bot is doing and why (also as copyable text)
// ---- Report (v17): facts once, two renderers ----
// report_facts(): this character's state as { key, scope, text, quiet } in display order.
//   scope "party": the party header shows it once for everyone (roster, leader/directive, goals merge, gold, hunts,
//   last hour, rates, bosses, merchant) — only the solo report prints these from here.
//   quiet: nothing worth reading right now (done quests, farm rows, idle features, normal safety); solo shows them.
// Things that look wrong right now (v23.3): one "checks:" line per character, so a report shows at a glance whether the
// latest fixes work in the game. Each check names what it saw.
function health_checks() {
	const W = [], now = Date.now(), hr = hist.ev.filter((e) => now - e.t < 3600_000), M_ = is_merchant();
	const up_min = (now - seen.since) / 60_000;
	if (!M_ && in_party_cfg() && seen.kill >= 20 && !seen.kc) W.push(`no kill_credit events after ${seen.kill} kills (together-mode spot rates not measured)`);
	if (!M_ && up_min > 20 && seen.target_hit === 0 && !state.parked) W.push(`no hits landed in ${Math.round(up_min)} min`);
	const deaths = hr.filter((e) => e.type === "death").length, flees = hr.filter((e) => e.type === "flee").length;
	if (deaths) W.push(`${deaths} death${deaths > 1 ? "s" : ""} in the last hour`);
	if (flees >= 3) W.push(`${flees} flees in the last hour`);
	const stuck = hr.filter((e) => e.type === "stuck").length;
	if (stuck >= 2) W.push(`watchdog acted ${stuck}x in the last hour`);
	const trips = town_causes();
	if (!M_ && trips.span >= 30 && trips.n * 60 / Math.max(trips.span, 1) > 8) W.push(`${trips.n} town trips in ${trips.span} min`);
	if ((state.owe || 0) > 500_000) W.push(`owes the merchant ${fmt_k(state.owe)} (not near it to pay?)`);
	if (M_ && character.gold < CFG.merchant.donate.keep) W.push(`merchant gold ${fmt_k(character.gold)} < its ${fmt_k(CFG.merchant.donate.keep)} potion float`);
	if (spent() > BUDGET.soft) W.push(`call budget over (${Math.round(spent())}/${BUDGET.soft})`);
	// a quest that has everything (bags + our bank share) but hasn't been crafted
	for (const id of quest_recipes()) {
		const r = G.craft[id];
		if (!recipe_wanted(id) || skipped("qc:" + id)) continue;
		if (r.items.every(([q, n, l]) => owned_in_bags_or_bank(n, l) >= q) && !has_inputs(r) && !bag_plan().fetch.some((f) => r.items.some(([, n]) => (f.name || f) === n)))
			W.push(`quest ${id}: materials complete (bags + bank) but no fetch planned`);
	}
	const errs = hr.filter((e) => e.type === "error");
	if (errs.length) W.push(`${errs.length} error${errs.length > 1 ? "s" : ""} logged in the last hour (history())`);
	return W;
}
function report_facts() {
	const out = [], F = (key, scope, text, quiet = false) => out.push({ key, scope, text, quiet });
	const p = state.pack, d = state.directive, M_ = is_merchant(), now = Date.now();
	const c = { p, d, now }; // v24.96: for the role sections (facts_* in fighter.js / merchant.js)
	{ const W = health_checks(); F("checks", "self", W.length ? `checks: ⚠ ${W.join(" | ")}` : "checks: ok"); }
	// what we're doing (fight target and reason merged into one line; say so when we're not there yet)
	if (M_) F("doing", "self", `merchant: doesn't fight; serves ${(CFG.party.members || []).join(", ")}`);
	else facts_doing(F, c);
	if (!M_) facts_party(F, c);
	{
		const ev = event_live();
		if (ev) F("event", "self", `event: ${ev} — ${event_here(ev) ? "at it" : "joining"}`);
	}
	if (CFG.gear_auto) {
		// v24.79: the pieces' own points plus each set's whole bonus. It used to add up the per-slot values, and each of
		// those carries only what the LAST piece of its set adds: Sanala's fifth Monster Hunter piece showed 486 → 442
		// (five pieces x the 5th-piece bonus instead of four x the 4th), though every stat went up.
		const g = my_gear(), sl_ = gear_slots_v();
		const total = GEAR_SLOTS.map((s) => (sl_[s] ? slot_value(sl_[s], character.ctype, { off: g.off }, s) : 0)).filter((v) => v < 1e9).reduce((a, b) => a + b, 0) +
			Object.entries(g.sets || {}).reduce((a, [set, n]) => a + stat_points(set_bonus(set, n), character.ctype), 0);
		const owns = Object.keys(g.own || {});
		const takers = gear_takers().slice(1);
		const held_for = character.items.map((it) => { const m = it && takers.find((x) => gear_gain(it, x.ctype, x.g)); return m && `${it.name}→${m.name}`; }).filter(Boolean);
		const fr = (u) => { const r = state.fetch_res[u.key], t = state.fetch_try[u.key]; return r ? ` (fetch ${ago(r.at)} ago: ${r.ok ? "ok" : r.why})` : t ? ` (tried ${ago(t)} ago)` : ""; };
		const locked = owns, bu = bank_upgrades().map((u) => u.name + "+" + u.level + fr(u));
		F("xpm", "self", xp_mult_text());
		// v24.19: why a member isn't moving (a refused walk, a follower holding back)
		if (state.walk_refused && Date.now() - state.walk_refused.at < 600_000) F("walk", "self", `walk refused ${ago(state.walk_refused.at)} ago: to ${state.walk_refused.to}, every way passes ${state.walk_refused.why}`, true);
		if (state.follow_block && Date.now() - state.follow_block.at < 600_000) F("follow", "self", `not following the leader (${ago(state.follow_block.at)} ago): the way passes ${state.follow_block.rd}`, true);
		const sets_txt = Object.entries(g.sets || {}).map(([k, n]) => `${k} ${n}pc`).join(", ");
		// v24.27: travel gear — what's off now, the last swap, and what would come off on a long walk
		{
			const off = state.travel_off.map((r) => `${r.name}+${r.level}`), tc = travel_candidates().map((c) => `${c.it.name} ${c.speed}`);
			if (CFG.travel_gear.enabled && !is_merchant() && (off.length || travel_stats.at || tc.length))
				F("tgear", "self", `travel gear: ${off.length ? `OFF for the walk: ${off.join(", ")}` : "all on"}${tc.length ? ` | comes off on long walks: ${tc.join(", ")} speed` : ""}` +
					`${travel_stats.at ? ` | ${travel_stats.off} off / ${travel_stats.on} on since load, last ${ago(travel_stats.at)} ago: ${travel_stats.last}` : ""}`);
		}
		F("gear", "self", `gear: ${total.toFixed(0)} pts worn${sets_txt ? ` (sets: ${sets_txt})` : ""}${locked.length ? ` (guide working on ${locked.join(", ")})` : ""}${bu.length ? ` | bank upgrades: ${bu.join(", ")}` : ""}${held_for.length ? ` | for party: ${held_for.join(", ")}` : ""}`);
	}
	{
		const acts = wd.acts.filter((a) => now - a.t < 3600_000);
		if (acts.length) F("watchdog", "self", `watchdog: ${acts.length} intervention(s) in 1h (last: ${acts[acts.length - 1].kind} ${ago(acts[acts.length - 1].t)} ago)`);
	}
	{
		const h = last_hour(), r = rates();
		F("hour", "party", `last hour: ${h.dead} deaths, ${h.fled} flees, ${h.town} town trips | ${r ? `${fmt_k(r.xph)} xp/h, ${fmt_k(r.gph)} gold/h (${r.mins} min)` : "rates after 15 min"} — history() / deaths()`);
	}
	if (M_) facts_merchant(F, c); else if (CFG.merchant?.name) {
		const M = merchant_hb();
		F("merchant", "party", `merchant ${CFG.merchant.name}: ${M ? `online, ${M.serving ? "serving " + M.serving : "in " + M.map}, ${M.esize} free, ${fmt_k(M.gold)} gold` : "offline (fighters do their own town runs)"}`);
	}
	if (!M_) facts_bosses(F, c);
	{
		// must-hold items and tokens in one line
		const miss = hold_missing(), names = Object.keys(CFG.hold || {}).filter((n) => G.items[n]), tok = held_any("monstertoken"), b = !M_ && CFG.token_auto ? token_pick() : null;
		const parts = names.map((n) => {
			if (!miss.includes(n)) return `${n} ✓`;
			if (state.bank_seen[n] > 0) return `${n} missing — fetching from the bank`;
			const pr = hold_price(n);
			return M_ ? `${n} missing — a fighter buys it (${pr} tokens)` : `${n} missing — ${tok >= pr ? `buying (${pr} tokens)` : `${tok}/${pr} tokens`}`;
		});
		if (!M_ && tok > 0 && b && !b.hold) parts.push(`tokens ${tok} → next: ${b.name} (${b.price}) for ${b.for}${b.to ? ` (to upgrade to +${b.to})` : ""}`);
		else parts.push(`monster tokens: ${tok}`); // v24.68: always shown
		if (Object.keys(state.hold_for).length) parts.push(`for the merchant: ${Object.keys(state.hold_for).join(", ")}`);
		if (parts.length) F("hold", "self", `hold: ${parts.join(" | ")}`, !miss.length && !(b && !b.hold) && !Object.keys(state.hold_for).length && !(tok > 0));
	}
	{
		const c = CFG.craft_power && craft_pick();
		if (c) F("craft", "self", `craft: ${c.id} for ${c.for}'s ${c.slot} (+${c.gain} pts${c.cost ? `, ${fmt_k(c.cost)} gold` : ""})${craft_inputs_in_bags(c.id) ? " — ready" : " — fetching inputs"}`);
	}
	// v24.81: the character's own numbers (the server's totals, as the client shows them)
	{
		const c = character, pick = ["level", "int", "str", "dex", "vit", "for", "attack", "frequency", "range", "speed", "armor", "resistance", "max_hp", "max_mp", "mp_cost", "crit", "critdamage",
			"evasion", "reflection", "lifesteal", "manasteal", "apiercing", "rpiercing", "xpm", "goldm", "luckm"];
		F("stats_json", "self", `stats JSON: ${JSON.stringify(Object.fromEntries(pick.filter((k) => typeof c[k] === "number" && c[k] !== 0).map((k) => [k, +c[k].toFixed(3)])))}`);
	}
	if (M_ && state.ponty) {
		F("ponty_json", "self", `ponty JSON (seen ${ago(state.ponty.at)} ago; name+level → [count, price each, listings, smallest listing]): ${JSON.stringify(state.ponty.items)}`);
		F("ponty_routes", "self", `ponty routes: ${state.ponty.routes?.length ? state.ponty.routes.join(" | ") : "none — nothing there compounds (at 75% or better) into a piece a fighter would wear within the price per point"}`);
	}
	// v24.70: what's worn, as JSON (slot → name+level, :stat for a stat scroll) — with the bank dump, enough to judge gear
	F("worn_json", "self", `worn JSON: ${JSON.stringify(Object.fromEntries(Object.entries(character.slots || {}).filter(([k, v]) => v && !/^trade/.test(k)).map(([k, v]) => [k, v.name + (v.level ? "+" + v.level : "") + (v.stat_type ? ":" + v.stat_type : "") + (v.p ? ":" + v.p : "")])))}`);
	if (CFG.stat_scroll?.enabled && !M_) {
		const L = stat_scroll_list();
		if (L.length) F("stat", "self", `stat scrolls: ${L.map((r) => `${r.name}${r.level ? "+" + r.level : ""} → ${r.stat} (${r.q} scroll${r.q === 1 ? "" : "s"}, ${fmt_k(r.cost)}, +${r.pts.toFixed(1)} pts)${r.ok ? " — on the next town trip" : " — not done: " + r.why}`).join("; ")}`);
	}
	if (CFG.upgrade_auto) {
		const P = state.upg;
		F("upgrade", "self", `upgrade: ${P ? `${P.name} +${Math.max(0, best_level_held(P.name))}/+${P.to}${P.high ? " (high)" : ""} for ${P.for}'s ${P.slot} (+${P.gain} pts, ~${fmt_k(P.cost)})${state.fund_need > 0 ? ` | waiting for ${fmt_k(state.fund_need)} gold` : ""}` : (merchant_does_it() ? "shop projects are the merchant's" : "no project") + upgrade_why()}`);
	}
	if (CFG.elixir_auto && !M_) {
		const e = character.slots?.elixir;
		const t = elixir_active() ? `${e.name}${e.expires ? ` until ${new Date(e.expires).toLocaleTimeString()}` : ""}` : best_elixir() ? "about to drink " + best_elixir().name
			: bank_elixir() ? "fetching " + bank_elixir().name + " from the bank" : character.gold >= CFG.elixir_buy_min_gold ? "buying " + CFG.elixir_buy : `none (buys ${CFG.elixir_buy} at ${fmt_k(CFG.elixir_buy_min_gold)} gold)`;
		F("elixir", "self", `elixir: ${t}`, !elixir_active() && !best_elixir() && !bank_elixir() && character.gold < CFG.elixir_buy_min_gold);
	}
	if (CFG.compound_auto) {
		const gs = compound_groups(), paused = Object.keys(state.gear_skip).filter((k) => k.startsWith("cmp:") && skipped(k));
		const cw = compound_why();
		F("compound", "self", `compound: ${gs.map((g) => `${g.name}+${g.level} ${g.bags.length}${g.bank ? `(+${g.bank} bank)` : ""}`).join(", ") || "no sets of 3 spares"}` +
			(paused.length ? ` | paused: ${paused.map((k) => `${k.slice(4)} ${mins(state.gear_skip[k])} (${skip_why[k] || "?"})`).join(", ")}` : "") +
			(cw.length ? ` | not compounded: ${cw.join("; ")}` : "") + (town_reason.compound ? ` | last: ${town_reason.compound}` : ""), !gs.length && !paused.length && !cw.length);
	}
	if (!M_) facts_probe(F, c);
	if (p && !p.boss && !M_) F("safety", "self", `safety limit ${Math.round(safety_now() * 100)}% of HP per kill${(state.safety_mult || 1) > 1 ? ` (raised from ${Math.round(CFG.safety * 100)}%; next step ${mins((state.safety_at || Date.now()) + CFG.safety_tune.step_h * 3600_000)})` : ""} | at ${p.mtype}: x${danger_of(p.mtype).toFixed(2)} — ${calib_text(p.mtype)}${state.danger[p.mtype] ? `, incidents x${state.danger[p.mtype].toFixed(2)}` : ""}`, danger_of(p.mtype) >= 1);
	if (state.guide_farm && !M_) F("guide_farm", "self", `guide farm row: ${state.guide_farm.monster} (${state.guide_farm.reason})`, true);
	if (CFG.spend?.enabled) F("budget", "party", budget_text());
	const golds = partners().filter((x) => Number.isFinite(x.gold));
	if (golds.length && CFG.party.gold?.enabled) {
		const next = (state.gold_xfer_at || 0) + CFG.party.gold.every_h * 3600_000;
		F("gold", "party", `gold: us ${character.gold.toLocaleString()} / ${golds.map((x) => `${x.name} ${x.gold.toLocaleString()}`).join(" / ")} | last transfer ${state.gold_xfer_at ? Math.round((now - state.gold_xfer_at) / 60_000) + "m ago" : "never"}${next > now ? `, next allowed in ${mins(next)}` : ""}`);
	}
	if (state.dir_held && state.dir_lock && !M_) F("dir_held", "self", `committed to ${state.directive?.monster} for ${mins(state.dir_lock.until)} more; then: ${state.dir_held.monster} (${state.dir_held.reason})`);
	if (!is_follower() && partners().length && !M_) {
		if (state.shared?.mutual.length) F("mutual", "party", `mutual goals: ${state.shared.mutual.slice(0, 3).join(" | ")}`);
		else if (state.turn) F("turn", "party", `no mutual goal; turn: ${state.turn.who}'s for ${mins(state.turn.end)}${state.turn.arrived ? "" : " (walking there; the clock starts on arrival)"}`);
		if (state.shared?.too_slow.length) F("too_slow", "party", `too slow to share (> ${CFG.party.mutual_max_h}h): ${state.shared.too_slow.slice(0, 4).join(" | ")}`);
	}
	if (is_follower() && !M_) F("goals", "self", `my goals (shared with ${leader_name() || "nobody"}): ${goals_list().sort((a, b) => b.w - a.w).slice(0, 4).map((g) => g.monster + " (" + g.reason + ")").join(", ") || "none"}`);
	const h = character.s.monsterhunt;
	for (const P of partners()) if (P.hunt?.c > 0) F("hunt:" + P.name, "party", `${P.name}'s hunt: ${P.hunt.c}x ${P.hunt.id} left`);
	if (!M_) F("hunt", "party", `hunt: ${h ? (h.c > 0 ? `${h.c}x ${h.id} left${hunt_feasible(h) ? "" : CFG.hunt_min_xp > 0 && mt_xps(h.id) < CFG.hunt_min_xp * best_known_xps() ? ` — ${h.id} pays ${Math.round(mt_xps(h.id))} xp/s vs best ${Math.round(best_known_xps())}: not chased` : ` — can't finish in ${Math.round((h.ms || 0) / 60_000)}m left: ignored until it lapses`}` : `${h.id} done, turn in`) : "none"}${skipped("hunt:auto") ? ` (Daisy paused ${mins(state.gear_skip["hunt:auto"])})` : ""}`);
	const due = town_due();
	const tc = town_causes();
	F("town", "self", `town due: ${due_tasks(due).join(", ") || "nothing"} | errand: ${state.errand || "none"} | last run ${state.last_town ? Math.round((now - state.last_town) / 60_000) + "m ago" : "never"}`);
	F("trips", "self", `trips v${VERSION} (last ${tc.span}m): ${tc.n}${tc.n ? ` — triggered by ${tc.trig.map(([w, n]) => `${w} ${n}`).join(", ")}; work due on them: ${tc.by.map(([w, n]) => `${w} ${n}`).join(", ")}` : ""}` +
		`${tc.older ? ` | ${tc.older} more on older versions` : ""}`);
	if ((state.owe || 0) >= 1 && !M_) F("owe", "self", `owes ${CFG.merchant?.name || "the merchant"} ${fmt_k(state.owe)} for potions (paid when it's within reach, from gold above ${fmt_k(CFG.gold_reserve)})`);
	if (state.town_block?.blockers.length) F("town_block", "self", `town blocked (${Math.round((now - state.town_block.at) / 1000)}s ago): ${state.town_block.blockers.join(", ")}`);
	// v24.50: is the party gathered (may the tank start a fight)?
	if (!M_) facts_engage(F, c);
	if (!M_) { const g = gaps_text(); if (g) F("camp_time", "self", g); }
	// v24.48: who moved us in the last minute, in order, and how often two owners overlapped since load
	if (mv.log.length) F("moves", "self", `movement (1 min): ${mv.log.slice(-10).map((m) => `${m.who} ${m.kind}${m.n > 1 ? " x" + m.n : ""}`).join(" → ")} | clashes since load: ${mv.clash}`);
	// v24.38: the spots the last pick weighed, best first: xp/s (measured or estimated), after the walk, and what ruled it out
	if (!M_) facts_picks(F, c);
	// v24.37: why the monsters in view are or aren't targets (the spot's type): attackable, or skipped and why
	if (!M_) facts_targets(F, c);
	// v24.28: party town trips — the one on now, else the last (1h)
	{
		const P = state.ptown, L = state.ptown_last;
		if (P && !is_merchant()) F("ptown", "self", `party trip (${P.by}, ${ago(P.at)} ago; going: ${P.leavers.join(", ")}): ` +
			(P.done ? "done, waiting in town for the others" : P.joined ? `in town — ${P.why}` : P.pending ? `joining — ${P.why}` : P.why));
		else if (L && now - L.at < 3600_000) F("ptown", "self", `last party trip ${ago(L.at)} ago (${L.by}; ${L.leavers.join(", ")}): ${L.why}; waited ${L.waited}s in town` +
			(L.left_without.length ? `, went back without ${L.left_without.join(", ")}` : ", all back together"));
	}
	for (const r of state.guide?.rows || []) {
		const st = r.kind === "farm" ? "farm row" : !CFG.gear_actions.includes(r.kind) ? "not automated" : skipped(r.id) ? `paused ${mins(state.gear_skip[r.id])}: ${skip_why[r.id] || "reason not recorded"}` : r.affordable === false ? "unaffordable" : "next";
		F("guide:" + r.id, "self", `guide ${r.id}: ${st}`, r.kind === "farm" || !CFG.gear_actions.includes(r.kind));
	}
	if (!M_) facts_quests(F, c);
	const plan = bag_plan(), kept = {}, why_k = {}, fetched_n = {}, nd = needed_slots(), cm = compound_slots(nd);
	character.items.forEach((i, k) => {
		if (!i) return;
		const c = bag_class(i, nd, cm);
		kept[c] = (kept[c] || 0) + 1;
		if (c === "keep") {
			const r = keep_reason(i, k, nd, cm);
			why_k[r] = (why_k[r] || 0) + 1;
			if (r === "fetched") fetched_n[i.name] = (fetched_n[i.name] || 0) + 1;
		}
	});
	const fetch_names = {};
	for (const f of plan.fetch) { const n = f.name ? `${f.name}${f.level ? "+" + f.level : ""}` : f; fetch_names[n] = (fetch_names[n] || 0) + 1; }
	F("bags", "self", `bags: ${plan.free} free (min ${CFG.bag_min_free}) | keep ${kept.keep || 0}${kept.keep ? ` (${Object.entries(why_k).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(", ")})` : ""}, bank ${kept.bank || 0}, sell ${kept.sell || 0}` +
		`${plan.fetch.length ? ` | to fetch: ${Object.entries(fetch_names).map(([n, c]) => (c > 1 ? `${n} x${c}` : n)).join(", ")}` : ""}`);
	if (Object.keys(fetched_n).length) F("fetched", "self", `  fetched (kept 1h): ${Object.entries(fetched_n).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} x${c}`).join(", ")}`);
	for (const k of Object.keys(state.gear_skip).filter((x) => x.startsWith("town:")).sort()) if (skipped(k)) F("pause:" + k, "self", `${k} paused ${mins(state.gear_skip[k])}: ${skip_why[k] || "?"}`);
	if (bank_is_full()) F("bank_full", "self", `bank marked full ${Math.round((now - state.bank_full_at) / 60_000)}m ago: ${CFG.sell_junk ? "selling +0 junk meanwhile" : "nothing is sold (sell_junk off); it stays in the bags"}`);
	F("footer", "self", `level ${character.level} ${character.ctype} | ${fmt_k(character.gold)} gold | at ${character.map} ${Math.round(character.x)},${Math.round(character.y)} | calls ${spent().toFixed(0)}/${BUDGET.soft} per 4s`);
	return out;
}
// Lines for one character. compact (party sections): only "self" facts that say something; full (solo): everything.
function report_lines(log = true, compact = false) {
	const facts = report_facts().filter((f) => !compact || (f.scope === "self" && !f.quiet));
	const lines = [...(compact ? [] : [`— report v${VERSION} ${new Date().toLocaleTimeString()} —`]), ...facts.map((f) => f.text)];
	if (log) lines.forEach((l, i) => game_log(l, i === 0 && !compact ? C.title : C.note));
	return lines;
}
// why_not("bee"): is this monster farmable and safe for us, with the numbers behind the verdict
// gear_check(): every slot — what's worn (score), the best piece in the bags or the bank (from the last visit) and
// whether it would go on. Answers "is this item worth anything to me?".
// gear_check(): every character's slots in one window (like report()); gear_check("solo") only ours
function gear_check(solo) {
	const targets = party_names_all().filter((n) => n !== character.name);
	if (solo === "solo" || !targets.length || typeof send_cm !== "function") return share_text(`gear_check ${character.name}`, gear_check_lines());
	return party_gather("gear", targets, 0, gear_check_lines());
}
function gear_check_lines() {
	const g = my_gear(), sl = gear_slots_v(), L = [`— gear_check ${character.name} (${character.ctype} ${character.level}) —`];
	L.push(gear_weights_text(character.ctype));
	const cand = {}; // slot -> best { it, name, level, score, where }
	const look = (it, where) => {
		if (!it || !G.items[it.name] || !GEAR.has(G.items[it.name].type)) return;
		for (const s of slots_for(it.name, character.ctype, g)) {
			const sc = slot_value(it, character.ctype, g, s);
			if (!cand[s] || sc > cand[s].score) cand[s] = { it, name: it.name, level: it.level || 0, score: sc, where };
		}
	};
	const held = travel_slots_held(); // a piece off for the walk is the worn one, not a candidate
	character.items.forEach((it, k) => held.has(k) || look(it, "bags"));
	for (const it of state.bank_gear || []) look(it, "bank");
	const off_s = travel_off_slots();
	for (const s of GEAR_SLOTS) {
		const w = sl[s], c = cand[s], cur = g.w[s] || 0;
		const verdict = !c ? "nothing better owned" : gear_gain(c, character.ctype, g) ? `UPGRADE +${Math.round(gear_gain(c, character.ctype, g).gain)} pts → equips${c.where === "bank" ? " once fetched" : ""}` :
			c.score > cur ? `+${Math.round(c.score - cur)} pts, below the ${g.own?.[s] ? Math.round(CFG.gear_guide_override * 100) + "% guide" : Math.round(CFG.gear_margin * 100) + "%"} margin` : "worse";
		L.push(`${s.padEnd(9)} ${w ? `${w.name}+${w.level || 0}` : "(empty)"} ${Math.round(cur)} pts${g.own?.[s] ? " [guide working on it]" : ""}${off_s.has(s) ? " [off for the walk]" : ""}` +
			`${c ? ` | best owned: ${c.name}+${c.level} ${Math.round(c.score)} pts (${c.where})` : ""} — ${verdict}`);
		// v24.26: where the points come from (worn, and a better piece owned)
		if (w && cur < 1e9) L.push(`          worn: ${gear_why(w, character.ctype, g, s) || "no weighted stats"}`);
		if (c && c.score > cur) L.push(`          best: ${gear_why(c.it, character.ctype, g, s)}`);
	}
	if (!state.bank_gear?.length) L.push("(no bank snapshot yet: it's taken on the next bank visit)");
	// pieces in our bags that are upgrades for another member (handed over when near, merchant delivers)
	const takers = gear_takers().slice(1);
	for (const it of character.items) {
		const m = it && GEAR.has(G.items[it.name]?.type) && takers.find((x) => gear_gain(it, x.ctype, x.g));
		if (m) L.push(`holding ${it.name}+${it.level || 0} for ${m.name} (+${Math.round(gear_gain(it, m.ctype, m.g).gain)} pts its ${gear_gain(it, m.ctype, m.g).slot})`);
	}
	for (const k in state.gear_skip) if (k.startsWith("equip:") && skipped(k)) L.push(`refused by the server: ${k.slice(6)} — ${skip_why[k] || "?"} (retry in ${mins(state.gear_skip[k])})`);
	return L;
}
// ---- selftest(): checks the assumptions the script makes about the live game client ----
// Functions it calls, data it reads, events it listens to, storage, and a cm round trip to every other character
// (results after 4s). Run it after loading a new version; anything ✗ is a feature that can't work in this client.
const st_runs = {}; // run id -> { at, pong }: each selftest() keeps its own (two quick runs used to share one)
function selftest() {
	const R = [], now = Date.now(), mins_up = Math.max(1, Math.round((now - seen.since) / 60_000));
	const ok = (c, m, warn) => R.push(`${c ? "✓" : warn ? "!" : "✗"} ${m}`);
	const g = typeof globalThis !== "undefined" ? globalThis : {};
	const fns = ["smart_move", "move", "stop", "attack", "heal", "use_skill", "change_target", "respawn", "equip", "unequip", "buy", "sell",
		"upgrade", "compound", "exchange", "exchange_buy", "auto_craft", "bank_store", "bank_retrieve", "send_item", "send_gold", "send_cm",
		"send_party_invite", "accept_party_invite", "join", "trade", "open_stand", "close_stand", "get_progression", "set", "get", "interact"];
	const miss = fns.filter((f) => typeof g[f] !== "function");
	ok(!miss.length, `game functions: ${miss.length ? "MISSING " + miss.join(", ") : fns.length + " present"}`);
	ok(typeof character.on === "function", "character.on (events)");
	ok(typeof calculate_item_properties === "function" || typeof parent.calculate_item_properties === "function", "item stat calculator (exact gear scores)", true);
	ok(typeof calculate_item_value === "function" || typeof parent.calculate_item_value === "function", "item value calculator (stand / secondhands prices)", true);
	ok(class_stats(character.ctype)?.src === "G", `G.classes.${character.ctype}.lstats + main_stat (gear stat weights${class_stats(character.ctype) ? "" : ": missing"}${class_stats(character.ctype)?.src === "doc" ? ": using the built-in docs copy" : ""})`, true);
	ok(!!G.sets && typeof G.sets === "object", `G.sets (set bonuses in gear scores: ${Object.keys(G.sets || {}).length} sets)`, true);
	ok(typeof damage_multiplier === "function", "damage_multiplier (fight model)", true);
	ok(!!parent.S && typeof parent.S === "object", `server event list parent.S (${Object.keys(parent.S || {}).join(", ") || "no events now"})`);
	ok(!!G.tokens?.monstertoken?.tracker, `Tracktrix price (${G.tokens?.monstertoken?.tracker ?? "?"} tokens)`);
	ok(!!G.maps.main?.ref?.secondhands, "Ponty (secondhands) location");
	ok(!!G.events?.goobrawl, "Goo Brawl in G.events");
	ok(seen.hit > 0 || is_merchant(), `"hit" events: ${seen.hit} in ${mins_up} min${seen.hit ? "" : " (none: post-mortems and calibration get no damage data)"}`, true);
	ok(seen.kill > 0 || is_merchant(), `kills seen: ${seen.kill} in ${mins_up} min`, true);
	ok(stats.xp > 0 || is_merchant(), `xp gained since load: ${fmt_k(Math.round(stats.xp))}`, true);
	ok((seen.kc || 0) > 0 || is_merchant() || !in_party_cfg(), `kill_credit events since load: ${seen.kc || 0} (party kills: together-mode xp/s measurement and the watchdog use them)`, true);
	try {
		const tok = { t: now };
		set("farmer_selftest:" + character.name, tok);
		ok(get("farmer_selftest:" + character.name)?.t === now, "storage write/read (set/get)");
	} catch (e) { ok(false, "storage: " + e); }
	const size = (k) => { try { return JSON.stringify(get(k) || "").length; } catch (e) { return 0; } };
	const kb = Math.round((size(SAVE_KEY) + size(LOG_KEY) + size("farmer_report:" + character.name)) / 1024);
	ok(kb < 1500, `saved data: ${kb} KB (state + history + stored report)`, true);
	ok(Number.isFinite(character.cc), `call meter character.cc (${character.cc})`, true);
	const fl = typeof window !== "undefined" ? window.farmer_loaded : null;
	ok(true, fl ? `loaded via loader v${fl.loader} (${fl.how}) from ${fl.url}${fl.sha ? "" : " — commit unknown: loader v1 or the branch copy"}` : "pasted directly (no loader)");
	for (const n of party_names_all().filter((x) => x !== character.name)) {
		const P = n === CFG.merchant?.name ? state.merchant : state.partners[n];
		ok(fresh(P), `${n}: ${fresh(P) ? `heartbeat ${Math.round((now - P.t) / 1000)}s ago, ${build_txt(P.v, P.b)}${other_build(P.v, P.b) ? " ≠ ours" : ""}` : "no heartbeat in 10s"}`, true);
	}
	ok(true, `cm received: ${Object.entries(seen.cm).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
	const others_ = party_names_all().filter((x) => x !== character.name);
	if (!others_.length || typeof send_cm !== "function") return share_text("selftest", [`— selftest ${character.name} v${VERSION} —`, ...R]);
	const id = `${now}:${character.name}`;
	st_runs[id] = { at: now, pong: {} };
	Promise.resolve(send_cm(others_, { k: "ping", id })).catch(() => {});
	game_log("selftest: pinging " + others_.join(", ") + " (4s)…", C.info);
	setTimeout(() => selftest_finish(R, others_, id), 4000);
	return R.join("\n");
}
function selftest_finish(R, others_, id) {
	const run = st_runs[id];
	delete st_runs[id];
	for (const n of others_) {
		const p = run?.pong[n];
		R.push(`${p ? "✓" : "✗"} cm round trip ${n}: ${p ? `${p.ms} ms, v${p.v}` : "no reply in 4s (other server, offline, or older version)"}`);
	}
	const bad = R.filter((l) => l.startsWith("✗")).length, warn = R.filter((l) => l.startsWith("!")).length;
	return share_text("selftest", [`— selftest ${character.name} v${VERSION}: ${bad} failed, ${warn} warnings —`, ...R]);
}
// ---- Party report (v15.9): report() here asks every other character (same server, via cm) for its report ----
// report(hours): own report at once; then one text box with every character's section once all replied or after 6s.
// hours > 0 adds each character's history(hours). Non-repliers show their stored copy (saved every 5 min to browser
// storage, shared by characters running in the same browser) or "no reply". party_report() re-opens the last one.
const gathers = new Map(); // id -> a report/history/gear_check being collected (v23.2: several at once)
let last_party_report = null;
const report_reply_at = {}; // "requester:kind" -> last reply (one per 5s per kind: report() then history() both answer)
const party_names_all = () => [...new Set([...(CFG.party.members || []), CFG.merchant?.name].filter(Boolean))];
// report(): one window. In a party: the combined report (after every reply or 6s). Solo, or report("solo"): this
// character's full report. Each character's history of the last CFG.report_history_h hours (1) comes with it
// (v22.2); report(6) widens that to 6h, report(0) leaves it out.
function report(hours = CFG.report_history_h) {
	const solo = hours === "solo";
	if (solo) hours = CFG.report_history_h;
	const targets = party_names_all().filter((n) => n !== character.name);
	if (solo || !targets.length || typeof send_cm !== "function") return share_text("report()", [...report_lines(false), ...(hours > 0 ? history_lines(hours) : [])]);
	const own = report_lines(false, true);
	return party_gather("report", targets, hours, hours > 0 ? [...own, ...history_lines(hours)] : own);
}
// Ask every other character for its report or history; one window once all replied or after 6s
function party_gather(kind, targets, hours, own) {
	const id = `${Date.now()}:${character.name}`;
	gathers.set(id, { id, kind, hours, want: new Set(targets), got: { [character.name]: { v: VERSION, lines: own } }, at: Date.now() });
	Promise.resolve(send_cm(targets, { k: "rreq", id, hours, kind })).catch(() => {});
	game_log(`${kind}: collecting from ${targets.join(", ")} (up to 6s)…`, C.info);
	setTimeout(() => report_finish(id), 6000);
	return `collecting ${kind} from ${targets.join(", ")}…`;
}
function report_reply(m) {
	const from = m.name, now = Date.now(), rk = `${from}:${m.message.kind || "report"}`;
	if (now - (report_reply_at[rk] || 0) < 5000) return;
	report_reply_at[rk] = now;
	const h = +m.message.hours || 0;
	const lines = m.message.kind === "history" ? history_lines(h || 6) : m.message.kind === "gear" ? gear_check_lines() : [...report_lines(false, true), ...(h > 0 ? history_lines(h) : [])];
	Promise.resolve(send_cm([from], { k: "rrep", id: m.message.id, v: VERSION, b: BUILD, lines })).catch(() => {});
}
function report_collect(m) {
	const g = gathers.get(m.message.id);
	if (!g || !g.want.has(m.name)) return;
	g.got[m.name] = { v: m.message.v, b: m.message.b || null, lines: Array.isArray(m.message.lines) ? m.message.lines : [] };
	if ([...g.want].every((n) => g.got[n])) report_finish(g.id);
}
function report_finish(id) {
	const g = gathers.get(id);
	if (!g) return null;
	gathers.delete(id);
	const members = (CFG.party.members || []).filter((n) => n !== character.name).sort();
	const order = [character.name, ...members, ...(CFG.merchant?.name && CFG.merchant.name !== character.name ? [CFG.merchant.name] : [])];
	const replied = [...g.want].filter((n) => g.got[n]).length;
	const hist_k = g.kind === "history" || g.kind === "gear";
	const out = [`══ party ${g.kind === "history" ? `history (${g.hours || 6}h)` : g.kind === "gear" ? "gear_check" : "report"} ${build_txt(VERSION, BUILD)} ${new Date(g.at).toLocaleTimeString()} — ${replied}/${g.want.size} replied (from ${character.name}) ══`, ...(hist_k ? [] : party_header_lines())];
	for (const n of order) {
		const v = g.got[n]?.v, b = g.got[n]?.b;
		out.push("", `▌ ${n}${v && other_build(v, b) ? ` (${build_txt(v, b)} ≠ ${build_txt(VERSION, BUILD)}: update it)` : ""}`);
		if (g.got[n]) { out.push(...g.got[n].lines); continue; }
		const stored = !hist_k && typeof get === "function" ? get("farmer_report:" + n) : null;
		if (stored && Array.isArray(stored.lines)) out.push(`(no reply — stored copy, ${ago(stored.at)} old, v${stored.v})`, ...stored.lines);
		else out.push("(no reply: offline, on another server, or running an older version)");
	}
	if (!hist_k) last_party_report = out;
	return share_text(g.kind === "gear" ? "party gear_check" : hist_k ? "party history" : "party report", out);
}
// Everything shared, once: roster, leader and its pack, gold, hunts, last hour per member, bosses, merchant, mutual goals
function party_header_lines() {
	const out = [], me_f = in_party_cfg();
	const fighters = [...(me_f ? [{ name: character.name, ctype: character.ctype, level: character.level, map: character.map, errand: errand_busy() ? state.errand : null,
		rip: !!character.rip, gold: character.gold, hunt: character.s?.monsterhunt?.c > 0 ? { id: character.s.monsterhunt.id, c: character.s.monsterhunt.c } : null,
		h1: last_hour(), rates: rates(), xpm: xp_mult(), pack: state.pack ? { mtype: state.pack.mtype, map: state.pack.map, directive: state.pack.directive } : null }] : []),
		...partners_any()].sort((a, b) => (a.name < b.name ? -1 : 1));
	if (!fighters.length) return out;
	out.push(`roster: ${fighters.map((f) => `${f.name} ${f.ctype} ${f.level} @${f.map}${f.errand ? " (" + f.errand + ")" : ""}${f.rip ? " DEAD" : ""}`).join(" | ")}`);
	const lead = pick_leader(fighters);
	const lp = fighters.find((f) => f.name === lead)?.pack;
	out.push(`leader: ${lead || "none (no tank online)"}${lp ? ` @ ${lp.mtype} (${lp.map})${lp.directive ? " — " + lp.directive : ""}` : " — no pack"}`);
	const gw = lead === character.name ? state.group_wait?.who && !(state.group_wait.go_until > Date.now()) ? state.group_wait.who : null : state.partners[lead]?.grp_wait;
	if (gw) out.push(`party: waiting for ${gw}`);
	const M = is_merchant() ? { name: character.name, gold: character.gold, map: character.map, esize: character.esize, serving: state.serving } : merchant_hb();
	out.push(`gold: ${[...fighters, ...(M ? [M] : [])].map((f) => `${f.name} ${fmt_k(f.gold || 0)}`).join(" / ")}`);
	const hunts = {};
	for (const f of fighters) if (f.hunt?.c > 0) (hunts[`${f.hunt.id}`] = hunts[f.hunt.id] || []).push(`${f.name} ${f.hunt.c}`);
	if (Object.keys(hunts).length) out.push(`hunts: ${Object.entries(hunts).map(([id, xs]) => `${id} (${xs.join(", ")})`).join(" | ")}`);
	out.push(`last hour: ${fighters.map((f) => `${f.name} ${f.h1 ? `${f.h1.dead}d/${f.h1.fled}f/${f.h1.town}town` : "?"}${f.rates ? ` ${fmt_k(f.rates.xph)}xp/h` : ""}${f.xpm ? ` (x${(+f.xpm).toFixed(2)})` : ""}`).join(" | ")}`);
	const S_ = parent.S || {}, live = Object.keys(S_).filter((k) => S_[k]?.live === true && G.monsters[k]);
	if (live.length) out.push(`bosses: ${live.map((k) => `${k}@${S_[k].map} ${boss_safe(k) ? "JOIN" : "too strong"}`).join(", ")}`);
	const lack = [...fighters.map((f) => [f.name, f.name === character.name ? hold_missing() : f.need]), ...(M ? [[M.name, M.name === character.name ? hold_missing() : M.need]] : [])]
		.filter(([, nd]) => Array.isArray(nd) && nd.length);
	if (lack.length) out.push(`missing must-hold items: ${lack.map(([n, nd]) => `${n} (${nd.join(", ")})`).join(", ")}`);
	if (CFG.spend?.enabled) out.push(budget_text());
	if (CFG.merchant?.name) out.push(`merchant ${CFG.merchant.name}: ${M ? `${M.serving ? "serving " + M.serving : "in " + M.map}, ${M.esize} free` : "offline (fighters do their own town runs)"}`);
	if (lead === character.name && state.shared?.mutual.length) out.push(`mutual goals: ${state.shared.mutual.slice(0, 3).join(" | ")}`);
	return out;
}
const party_report = () => (last_party_report ? share_text("party report", last_party_report) : "no party report yet: run report()");
// Stored copy for party reports when cm can't reach us (other server, same browser)
function store_report() {
	if (typeof set === "function") try { set("farmer_report:" + character.name, { at: Date.now(), v: VERSION, lines: report_lines(false) }); } catch (e) {}
}
setInterval(store_report, 300_000);
// =====================================================================
// Party: the tank leads (packs, directives); the others follow it, assist its target, priests heal.
// Members talk with send_cm every beat_ms (free when they run in one browser: localStorage; else a small call cost).
// =====================================================================
// Is this character configured into a party of 2+? / the other configured members
const in_party_cfg = () => (CFG.party.members || []).includes(character.name) && CFG.party.members.length > 1;
const others = () => (CFG.party.members || []).filter((n) => n !== character.name);
// Party members are known only through their heartbeats (state.partners: name -> last message + t).
// "Fresh" = heard from in the last 20s (10 missed heartbeats → treat as offline).
const fresh = (p) => !!p && Date.now() - p.t < 20_000; // 10 missed beats: a busy member skips some (budget)
const partners_any = () => others().map((n) => state.partners[n]).filter(fresh);   // online, dead or alive
const partners = () => partners_any().filter((p) => !p.rip);                        // online and alive
// Position: live from its entity when it's in view on our map, else from its last heartbeat
function partner_pos(p) {
	const e = parent.entities?.[p.name];
	return e && character.map === p.map ? { map: p.map, x: e.x, y: e.y } : { map: p.map, x: p.x, y: p.y };
}
// Alive members on our map within maxd px (400 ≈ in view and in heal range). Only these count in the fight model.
function partners_near(maxd = 400) {
	return partners().filter((p) => {
		if (p.map !== character.map) return false;
		const pos = partner_pos(p);
		return Math.hypot(pos.x - character.x, pos.y - character.y) <= maxd;
	});
}
// Leader: the party's tank (CFG.gear_tank: a warrior before a paladin, then by name), dead or alive — a dead leader is
// still the leader. Everyone picks the same one from the heartbeats. With no tank online nobody leads: the name is
// then the tank's from its last heartbeat if we ever had one, else null. A character outside a party leads itself.
function leader_name() {
	if (!in_party_cfg()) return character.name;
	return pick_leader([{ name: character.name, ctype: character.ctype }, ...partners_any()]) ||
		pick_leader(others().map((n) => state.partners[n]).filter(Boolean));
}
const TANK_ORDER = ["warrior", "paladin"];
function pick_leader(all) {
	const tk = all.filter((m) => CFG.gear_tank.includes(m.ctype))
		.sort((a, b) => TANK_ORDER.indexOf(a.ctype) - TANK_ORDER.indexOf(b.ctype) || (a.name < b.name ? -1 : 1));
	return tk.length ? tk[0].name : null;
}
const leader_name_any = leader_name;
const leader_hb = () => state.partners[leader_name()];
// In a party, everyone but the leader follows — with no tank online too (nobody leads, nobody picks a spot)
const is_follower = () => in_party_cfg() && leader_name() !== character.name;
// v24.13: the server's xp multiplier (1 + gear/party/other xp% / 100): party kill xp is split equally among an account's
// characters, so a member earning less in the same fights has a lower one. Breakdown: worn gear's xp, the party bonus.
const xp_mult = () => (Number.isFinite(character.xpm) ? +character.xpm.toFixed(3) : null);
function xp_mult_text() {
	const m = xp_mult();
	if (m === null) return "xp multiplier: not reported by the client";
	let gear = 0;
	for (const s of GEAR_SLOTS) { const it = character.slots?.[s]; if (it) gear += item_props(it, character.ctype).xp || 0; }
	const pn = Object.keys(get_party() || {}).filter((n) => n !== CFG.merchant?.name).length, party = [0, 0, 10, 16, 20, 24, 25, 30, 36, 40][pn] || 0;
	const other = Math.round(m * 100 - 100 - gear - party);
	return `xp multiplier x${m.toFixed(2)} = 100% + gear ${Math.round(gear)}% + party ${party}%${other ? ` + other ${other}%` : ""}`;
}
// ---- Verdicts shared with the party (v24.6) ----
// Deaths and flees (incident + the pack's cooldown) and probe results used to stay in the state of whoever had them;
// together, only the leader picks, from its own tables — so a follower's death changed nothing and the party walked
// back to the spot that killed it. Each is sent to the other fighters, who apply it to theirs.
// A message to the other fighters (fire and forget)
function tell_party(msg) {
	if (typeof send_cm === "function" && others().length) Promise.resolve(send_cm(others(), msg)).catch(() => {});
}
function share_verdict(v) {
	if (in_party_cfg()) tell_party({ k: "verdict", ...v });
}
// Code messages from the other characters (v25.1: a named function; the fighters' own kinds are fighter_cm in fighter.js)
function on_cm_message(m) {
	if (m?.message?.k) seen.cm[m.message.k] = (seen.cm[m.message.k] || 0) + 1;
	if (m && (m.message?.k === "ping" || m.message?.k === "pong") && party_names_all().includes(m.name)) {
		if (m.message.k === "ping") Promise.resolve(send_cm([m.name], { k: "pong", id: m.message.id, v: VERSION })).catch(() => {});
		else if (st_runs[m.message.id]) st_runs[m.message.id].pong[m.name] = { v: m.message.v, ms: Date.now() - st_runs[m.message.id].at };
		return;
	}
	if (fighter_cm(m)) return; // v25.1: tgt, mhb, verdict, ptown, ptown_off, bill (fighter.js)
	if (m && m.message?.k === "bank" && party_names_all().includes(m.name)) return void adopt_bank(m);
	if (m && (m.message?.k === "rreq" || m.message?.k === "rrep") && party_names_all().includes(m.name)) {
		if (m.message.k === "rreq") report_reply(m); else report_collect(m);
		return;
	}
	if (m && m.message?.k === "gold" && ((CFG.party.members || []).includes(m.name) || m.name === CFG.merchant?.name)) {
		stats.adj -= +m.message.g || 0; // a transfer from one of ours: not income
		log_ev("gold", { from: m.name, g: +m.message.g || 0 });
		return;
	}
	if (!m || !(CFG.party.members || []).includes(m.name) || m.message?.k !== "hb") return;
	const first = !fresh(state.partners[m.name]);
	state.partners[m.name] = { ...m.message, name: m.name, t: Date.now() };
	if (m.message.gold_xfer_at > (state.gold_xfer_at || 0)) state.gold_xfer_at = m.message.gold_xfer_at; // one party-wide clock
	if (first) game_log(`party: ${m.name} (${m.message.ctype} ${m.message.level}) online; ${leader_name() || "nobody"} leads`, C.info);
	if (first && other_build(m.message.v, m.message.b)) game_log(`party: ${m.name} runs ${build_txt(m.message.v, m.message.b)}, we run ${build_txt(VERSION, BUILD)} - load the same version on every character`, C.warn);
}
if (typeof character.on === "function") character.on("cm", on_cm_message);
setInterval(() => { if (spent() < BUDGET.soft - RESERVE.chat) heartbeat(); }, CFG.party.beat_ms);
// Game party membership. Accepting an invite (or having your join request accepted) makes the server pull you out of
// your current party, so:
//  - a member already partied with another configured member never accepts (that would split the party);
//  - every member partied with another member invites the missing ones (duplicates are harmless: the server answers
//    "already_in_party"), and the missing member also asks to join (request) - so no single member, possibly idle or on
//    an old script version that doesn't know the newcomer, can block it;
//  - only when no configured member is partied with another does the leader start a party by inviting everyone.
const members_cfg = () => CFG.party.members || [];
const in_member_party = () => Object.keys(get_party() || {}).some((n) => n !== character.name && members_cfg().includes(n));
const party_said = {}; // log key -> last time, so the 10s tick logs each fact at most once a minute
function party_log(key, msg) {
	if (Date.now() - (party_said[key] || 0) < 60_000) return;
	party_said[key] = Date.now();
	game_log(msg, C.info);
}
function on_party_invite(name) {
	if (!members_cfg().includes(name)) return;
	if (in_member_party()) return party_log("ignore:" + name, `party: ignoring ${name}'s invite (already partied with a member)`);
	party_log("accept:" + name, `party: accepting ${name}'s invite`);
	accept_party_invite(name);
}
function on_party_request(name) {
	if (!members_cfg().includes(name)) return;
	party_log("raccept:" + name, `party: letting ${name} join`);
	accept_party_request(name);
}
// =====================================================================
// Merchant (CFG.merchant). Not a party member: it never leads, fights or joins the game party. Fighters send it their
// heartbeats; it sends "mhb" back (position, free slots, gold). It carries potions out to fighters running low or
// short on bag space, collects their bankable/sellable items, casts mluck, and does the town work (sell, bank,
// compound, upgrade projects, exchange) for everyone, so fighters rarely leave the pack.
// =====================================================================
const is_merchant = () => character.ctype === "merchant" && CFG.merchant?.name === character.name;
const merchant_hb = () => (!is_merchant() && fresh(state.merchant) && state.merchant.name === CFG.merchant?.name ? state.merchant : null);
// Upgrade projects: the merchant does them while it's online (fighters keep fighting)
// Who does the shared work (compounding, upgrade/craft projects, town thresholds) must not flip with a single missed
// heartbeat (the merchant skips beats when its call budget is tight): "merchant online" = heard within 10 minutes
const merchant_recent = () => !is_merchant() && !!state.merchant && state.merchant.name === CFG.merchant?.name &&
	Date.now() - state.merchant.t < 600_000 && !state.merchant.rip;
const merchant_does_it = () => merchant_recent();
// The online fighter a piece helps most: { name, ctype, g, p, gain } or null
function best_fighter_for(it) {
	let best = null;
	for (const m of gear_takers().slice(1)) {
		if (m.ctype === "merchant" || !fresh(m.p) || m.p.rip) continue;
		const r = gear_gain(it, m.ctype, m.g);
		if (r && (!best || r.gain > best.gain)) best = { ...m, gain: r.gain };
	}
	return best;
}
// ---- Monster tokens (CFG.token_auto) ----
// Best shop piece by points per token: class gear a member would wear (+0), not already owned (bags or bank)
// ---- Must-hold items (CFG.hold) ----
const hold_price = (n) => G.tokens?.[CFG.hold?.[n]]?.[n];
const hold_missing = () => Object.keys(CFG.hold || {}).filter((n) => G.items[n] && held_any(n) === 0);
// ---- Merrit: a stand spot that earns Market Parcels ----
const in_rect = (x, y, r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
function why_not(mtype) {
	const lines = [];
	const L = (s) => { lines.push(s); game_log(s, C.note); };
	const out = (r) => (share_text(`why_not("${mtype}")`, lines), r);
	const m = G.monsters[mtype];
	if (!m) return out(L(`${mtype}: no such monster`));
	const flags = ["special", "cooperative", "global", "unlist", "immune", "passive", "peaceful", "stationary", "cute"].filter((f) => m[f]);
	if (!farmable_type(mtype)) return out(L(`${mtype}: not farmable (${flags.join(", ") || "no xp/attack/respawn"})`));
	const f = fight_math(m);
	if (!f) return out(L(`${mtype}: we can't out-damage its healing`));
	const limit = (f.hp_pool || character.max_hp) * safety_now() * danger_of(mtype, f) * heal_mult(f);
	L(`${mtype}: ${f.ttk.toFixed(1)}s per kill, takes ~${fight_risk(f).toFixed(0)} dmg/kill vs limit ${limit.toFixed(0)} → ${safe_enough(f, mtype) ? "SAFE" : "UNSAFE"}` +
		`${f.kiteable ? " (kiteable)" : ""}${f.hp_pool > character.max_hp ? " (tank's HP)" : ""}`);
	L(`  safety x${danger_of(mtype).toFixed(2)} = ${calib_text(mtype)} × incidents x${(state.danger[mtype] || 1).toFixed(2)}`);
	const sk = Object.entries(state.pick_skips || {}).filter(([k, w]) => (G.maps[k.split(":")[0]]?.monsters || []).some((pk) => pk.type === mtype) || w.includes(mtype));
	if (sk.length) L(`  skipped as dangerous at the last pick: ${sk.slice(0, 6).map(([k, w]) => `${k.split(":")[0]} (${w})`).join("; ")}`);
	const areas = [];
	each_area((pack, area) => { if (pack.type === mtype) areas.push(`${area.map} x${Math.round(area.count)}${(state.cooldown[pack_key(area)] || 0) > Date.now() ? ` (cooldown ${mins(state.cooldown[pack_key(area)])})` : ""}`); });
	L(`${mtype} packs: ${areas.join(", ") || "none on open maps"}; respawn ${m.respawn}s${m.respawn > CFG.max_respawn ? " (> max_respawn: only via directive)" : ""}`);
	return out();
}

// xp and gold samples every minute, for rates() (every character; v25.1: back from fighter.js, where v24.95 had carried it
// with send_own_gold — the merchant stopped sampling)
setInterval(() => {
	stats.samples.push({ t: Date.now(), xp: stats.xp, gold: character.gold + stats.adj });
	if (stats.samples.length > 61) stats.samples.shift();
}, 60_000);
// =====================================================================
// Role hooks (v24.94): functions that live in one role's file, called from code every character runs. Each default
// here is what that function returns for the OTHER role; the role's own file declares the real one, later in the
// load order (common, then fighter.js or merchant.js, then main.js), and a later function declaration replaces an
// earlier one. Every call site is reached by one role only (is_merchant() and the like decide), so a default never
// stands in for real work. tools/split_check.js lists any use of a role-only name that has no default here.
// =====================================================================
// merchant.js
function merchant_tick() {}
function merchant_fetch_give() {}
function merchant_fetch_stand() {}
function merchant_fetch_sale() {}
function recover() {}
function facts_merchant() {}
function merchant_job() { return null; }
function bank_purge() { return 0; }
function stand_hold() { return new Set(); }
function stand_worthy() { return false; }
async function stand_close() {}
function merrit_on() { return false; }
function parcel_count() { return 0; }
// fighter.js
function fighter_tick() { return 250; }
function heartbeat() {}
function party_invite_tick() {}
function tank_cover() { return null; }
function fighter_cm() { return false; }
function event_tick() { return false; }
function party_trip_check() { return false; }
function safety_tune() {}
async function swap_worn() { return false; }
function stat_scroll_list() { return []; }
function event_live() { return null; }
function refresh_directive() {}
function ptown_start() {}
function ptown_recv() {}
async function ptown_lead() {}
async function ptown_wait() {}
function facts_doing() {}
function facts_party() {}
function facts_bosses() {}
function facts_probe() {}
function facts_engage() {}
function facts_picks() {}
function facts_targets() {}
function facts_quests() {}
function party_break_tick() { return false; }
function ptown_join_tick() { return false; }
function probe_check() {}
function gap_kind() { return null; }
function follower_tick() {}
function party_heal() { return false; }
function token_pick() { return null; }
function task_tokens() { return 0; }
function collect_list() { return []; }
function collect_due() { return []; }
function collect_key() { return ""; }
async function task_collect() { return 0; }
function set_piece_plan() { return null; }
function set_piece_fetch() { return []; }
function set_piece_start() {}
