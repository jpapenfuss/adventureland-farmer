const VERSION = "25.44"; // Adventure Land farmer. Source: src/ — manifest.json lists the files per role (overview at the bottom of main.js).
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
	compound_min_chance_wanted: 0.10, // v25.32 (owner): was 0.40
	compound_min_chance_rebuyable: 0.6, // ...or >= 60% when an NPC sells the item (failure only costs gold)
	compound_per_run: 6,       // compounds per town run at most
	// v25.32 (owner: "items that can be combined that are clogging up the bank should just be combined — that's their
	// purpose"): with the bank nearly full (free slots under merchant.purge_below of its size), spare sets of three
	// are compounded at any odds, past the ceilings odds set (still up to compound_max_level): a success frees two
	// slots, a failure three.
	compound_bank_full: true,
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
	// +7 ≈ 1.4M. Steps are then taken down to the floors below (10% since v25.32; past +7, upgrade_high.min_chance).
	// v25.38 (owner: "We cannot progress in this game without equipment upgrades. It must happen."): 300k (was 40k). At 40k
	// nothing past +3 paid for itself and 17M sat idle; at 300k frankypants/vgloves +3 for Torlis (~280k/pt) qualify,
	// gphelmet +3 (~460k/pt) doesn't. The party earns ~2M/h.
	upgrade_gold_per_pt: 300_000,
	// v24.86 (owner: weapon upgrades are sorely needed): a shop weapon a fighter would hold is taken to +weapon_to with
	// no budget — no gold-per-point test, no spending cap, no give-up after failures — and weapons come before every
	// other project. Steps still need the server's odds over min_chance_rebuyable (10%; +7 is 25%).
	upgrade_weapon: { enabled: true, to: 7 },
	// v25.39: a fighter's worn piece is a project when we hold no spare copy — only steps at upgrade_worn.min_chance or
	// better (base odds, and the server's preview), handed over in town, given up after wait_ms without it
	upgrade_worn: { enabled: true, min_chance: 0.9, wait_ms: 1_800_000 },
	upgrade_spend: 0.5,        // a project may cost at most 50% of the gold it may draw on (v25.38: was 20%; the expected cost)
	upgrade_abort_x: 2.5,      // ...and is abandoned once failures push actual spending past 2.5x that estimate
	upgrade_steps_per_run: 8,  // upgrade steps per town run (a fighter's)
	merchant_upgrade_steps: 60, // v24.92: the merchant's — it lives in town; 8 a run made it start a run every minute
	// High upgrades: weapon-slot projects may go past the scroll0/1 levels with scroll2 (1.6M each), up to max_level.
	// A failure destroys the copy, so each such step needs the server's preview >= min_chance (a Primling offering in
	// the bags is used when it lifts the odds over it), and a project may cost at most spend of the party's spare gold.
	// (v25.38: scroll2 levels for every slot, judged like any other level — slots and spend no longer used)
	upgrade_high: { enabled: true, max_level: 9, min_chance: 0.55, offerings: ["offeringp"] },
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
	// v25.44 (owner: 9999 Pumpkin Spice Lattes on the merchant — "enable the party using them"): drunk before any other
	// elixir held (crit +5, reflection +2, max MP -400, 8 h); the merchant hands each fighter a stack (merchant.elixir_supply)
	elixir_prefer: ["pumpkinspice"],
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
	secondhand_every_ms: 600_000, // v25.18: was 30 min (owner: watch Ponty more closely)
	// v25.18: also buy a piece that wins for a fighter once upgraded, when that's cheaper than building it (merchant/3_ponty.js)
	secondhand_upgrade_starts: true,
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
	secondhand_gold_per_pt: 100_000, // v25.38: was 15k    // ...and an upgrade may cost at most this per gear point it adds
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
	// v25.38: stock_keep — the merchant's gold above this counts as room too (17M sat idle while the 6-hour earnings
	// rule allowed ~1M a project)
	spend: { enabled: true, window_h: 6, share: 0.9, min_data_h: 1, stock_keep: 3_000_000 },
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
	// v25.22: the Cave of Many Dreams (fighter/9_cave.js): once a day the tank takes the party in (Dorr, main 816,1200)
	cave: { enabled: true, info_every_ms: 600_000, engage_px: 260, arrive_px: 120, max_deaths_per_room: 2,
		stuck_ms: 45_000, camp_max_ms: 300_000, wait_party_ms: 120_000, // progress watchdog; a camp at most 5 min; the party at Dorr 2 min
		// v25.29: give_up_deaths deaths in a visit (v25.40: any member's — they were the tank's only) → the party leaves, and doesn't go back until it's
		// stronger: average level + retry_levels or gear points x retry_gear (the first visit: 4 deaths in 2 min to the
		// first camp's 6 rats + 2 spiders, no XP)
		give_up_deaths: 3, retry_levels: 2, retry_gear: 1.1,
		rejoin_hp: 0.7 },          // v25.41: a revived follower stays out of the fight until this share of its HP
	ui: { enabled: false, log_w: 560, log_h: 360, log_font: 15, status_w: 340, status_h: 90, status_font: 14,
		// v25.21: only the status box under CODE (the game's 128x60 cut set_message's text): taller (it grows up) and its
		// text wraps. v25.23 w: "log" — its left edge lined up with the log's (owner); a number: that width (wider than the
		// log's line would widen the corner and shift the bars and log); 0: the game's
		status_box: { enabled: true, w: "log", h: 90 } },
	town_soft_gap_ms: 3_600_000, // a trip only for deferrable work (guide, fetches, upgrades, crafting...) waits 60 min (v24.71: was 20 — the party sits at its camp)
	                           //   after the last run FINISHED, and never turns a walk to the pack around (v18.2)
	town_topup: 0.6,           // v18.2: in town anyway → top potions up to pot_buy once below 60% of it, and bank
	                           //   everything bankable, so the next trip isn't a potion/bag one 10 min later
	walk_timeout_ms: 120_000,  // a smart_move that hasn't arrived in 2 min is cancelled (locked doors, unreachable spots)
	town_hp: 0.7,              // start a town run only above 70% HP...
	town_hp_critical: 0.5,     // ...or above 50% when bags are nearly full (<= 3 free)
	errand_timeout_ms: 300_000, // an errand still running after 5 min is assumed hung; its lock is released
	gold_reserve: 50_000,      // guide steps never spend below this much gold (potions may dip into it)
	// v25.32 (owner: "that floor really sucks since it completely blocks us from actually trying to upgrade"; low-tier
	// copies are often on Ponty): the odds floors are down to 10%. Which level a project aims for is the expected-cost
	// test (upgrade_gold_per_pt against the copies and scrolls lost to failed steps at the server's odds); the floor
	// only stops hopeless rolls. Projects never use worn gear: a failure costs a spare copy.
	min_upgrade_chance: 0.10,  // (was 0.80) the server's preview at least this; failure destroys the item
	min_compound_chance: 0.80, // same for compounding (failure destroys all three inputs)
	min_chance_rebuyable: 0.10, // (was 0.2) items NPCs sell: failure only costs gold
	rebuy_loss_max: 100_000,   // compounds of NPC-sold items take compound_min_chance_rebuyable odds only when the three
	                           //   copies are worth at most this (a +L copy = 3^L base copies; v23.1)
	min_chance_spare: 0.10,    // (was 0.6) another copy held (bags/bank/worn): a failure costs a spare
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
		worn_wait_ms: 120_000,
		elixir_supply: { name: "pumpkinspice", give: 3333 }, // v25.44 (owner): 3,333 to each fighter that holds none, when we meet // v25.43: ...or up to this long for the worn piece our project came for (a lull between fights)
		trip_gap_ms: 120_000,  // at most one trip every 2 min
		float: 1_000_000,      // fighters top the merchant's gold up to this (the richest near fighter, every 30 min at most)
		fighter_min_free: 3,   // while the merchant is online, fighters walk to town themselves only below this many free
		fighter_pot_min: 10,   //   slots / potions of either kind (the merchant brings potions and takes loot)
		guide_gap_ms: 1_800_000, // ...and walk to town for guide steps alone at most every 30 min
		// v24.75 (owner): the merchant holding a piece that's an upgrade for a fighter brings the party to town for it —
		// checked from the first tick after loading and on every tick after (a party trip, ahead of work that can wait;
		// one try per piece per collect_retry_min). The merchant then stays in town with it instead of walking out.
		// v25.43 (owner: "If items can be sent between party members while they're out of town, is there any point in
		// making town trips for upgrades at all?"): no — off. The merchant walks out and hands the piece over at the camp
		// (gear_target → serve), as it does potions; the fighters keep farming. (7 party trips an hour, one per upgraded
		// piece, had them away from the camp 57% of the time — 12:50 AM report.)
		collect: false, collect_retry_min: 30, collect_wait_s: 30,
		// v24.86 (owner: feed the merchant down to each fighter's minimum reserve): was 2M. A fighter keeps this much —
		// an elixir (240k) and its potion bills — and sends the merchant the rest a project asks for, whatever the
		// richest one near can give (it used to send all of it or nothing).
		fund_keep: 500_000,
		// v24.90 (owner): every fighter near the merchant hands it ALL its gold above fund_keep — the
		// merchant runs the upgrades. (It used to top the merchant up to `float` only, from the richest fighter.)
		dump_gold: true,
		mluck_range: 250,      // px; mluck (merchant level 40+) on every fighter in range lacking ours
		// Stand: while idle at home the merchant opens its stand (16 trade slots) and lists only the item names in
		// stand.list (owner's rule: nothing is sold unless the owner lists it; empty by default) — plus Merrit's decoy,
		// one health potion at an absurd price (stand.decoy). Listed items go up at markup x item value, cutting the
		// price by cut every cut_every_h unsold, never below floor x value. A
		// listed copy must also be worth listing: value >= min_value, gear at +3 or more, a higher grade, or titled.
		// The stand is closed before every walk (speed 10 while open).
		// Bank housekeeping (only with sell_junk, off): when the bank's free slots drop below purge_below of its size,
		// each merchant bank visit pulls up to purge_n of the least valuable items nobody needs, to sell. Never recipe
		// materials (anyone's quests), exchangeables, tokens, gear a member would wear, compound-set copies, keep or
		// locked items.
		purge_below: 0.1, purge_n: 10,
		// v25.33 (owner): gear the party has no use for, and duplicates past what it could use, are sold to an NPC
		// while the bank is nearly full (purge_below) — sell_junk stays off for everything else (materials, stacks).
		// Per item name: useful (a fighter would wear it over what it wears, at some level up to +7 or the best copy
		// held) → keep the best `ring_earring` copies of a ring or earring (two slots x three fighters) or `other` of
		// any other piece, plus `failure_stock` more when no NPC sells it (an upgrade failure destroys the copy; an
		// NPC-sold one is rebought); not useful → keep none. Never sold: titled, locked or bound copies, keep-list
		// items, exchangeables, quest inputs, recipe inputs at the level the recipe takes, compound-set copies, anything a fighter would wear now, and
		// the current upgrade project's piece. Up to purge_n copies per bank visit, each sale logged.
		gear_purge: { enabled: true, ring_earring: 6, other: 3, failure_stock: 3 },
		// Merrit (Market Parcels): an open stand with a listing, in Mainland's square (x -240..240, y -120..144) or
		// southern aisle (x -88..88, y 144..360), on pavement she can reach, held still for 2 minutes, gets one parcel
		// per account per hour when she walks by. Spacing: > npc_gap px from fixed NPCs, > stand_gap px from other
		// stands, > stand_vgap px vertically from a stand within stand_gap px sideways. A routine supply trip waits
		// until the stand has stood min_stay_ms (urgent ones don't: a fighter under urgent_free slots / urgent_pots).
		merrit: { enabled: true, square: [-240, -120, 240, 144], aisle: [-88, 144, 88, 360], npc_gap: 40, stand_gap: 10,
			stand_vgap: 15, step: 16, min_stay_ms: 150_000, urgent_free: 4, urgent_pots: 30,
			// v25.28 (owner): a spot is chosen 80 px from other players' stands (the server only needs 10) and kept until one
			// comes within 40; in a crowded square, the farthest valid spot, re-checked for a clear one every 2.5 min
			keep_px: 80, keep_hold_px: 40, rescan_ms: 150_000 },
		// v25.15: the stand lists only item names in `list` (owner: nothing is sold unless the owner lists it). Empty: the
		// stand opens, lists none of our gear and holds no bag slots. Merrit wants a listing (market_patron.js hasListing; a
		// parcel is worth 1 Shell): that's the decoy below (v25.26). Before, any piece worth min_value, gear at +3 or
		// better, high-grade or titled went up at 3x value — 16 slots held (mace+7, frankypants...) with 7 bag slots free.
		stand: { enabled: true, list: [], min_value: 20_000, markup: 3, floor: 1.5, cut: 0.1, cut_every_h: 12, item: "stand0",
			// v25.26 (owner): one common item always listed at an absurd price (the server's maximum), so Merrit — who
			// needs a listing — gives her parcels (1 Shell each). null: no decoy.
			decoy: { name: "hpot0", price: 99_999_999_999 } },
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
		// every online fighter is within engage_px of it. Nobody else touches a monster that has no target — except
		// (v25.20) the free-for-all: where the tank kills a type in one hit, at its camp, within ffa_pad of the box.
		tank_first: true,
		ffa_pad: 100, // v25.20: px around the camp box where the free-for-all applies (the tank one-shoots its type)
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
	camp_deaths: {},         // v25.29: pack_key -> death times in the last 24h (the rest after a death grows with them) (saved)
	cave_block: null,        // v25.29: { at, lv, gs, n, deaths } — the cave beat us: not again until the party is stronger (saved)
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
