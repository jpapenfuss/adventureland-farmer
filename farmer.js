const VERSION = "24.19"; // Adventure Land farmer: one file for every character. Overview at the bottom of this file.
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
	keep_px: 300,              // v24.14: step away from a monster we can't take on that may attack, once it's this close
	measure_min_s: 90,         // s at a pack before its measured xp/s is trusted over the estimate
	meas_half_h: 12,           // a measured spot rate's weight halves every 12h (the rest goes to the estimate); 0 = never ages
	force_type: null,          // monster id to farm exclusively (testing/debugging); null = choose automatically
	flee_hp: 0.25,             // below 25% HP: teleport to town (use_town) and recover
	flee_quiet_ms: 1200,       // ...channelling only once nothing has hit us for 1.2s (a hit cancels the 3s channel)
	smash_mp_floor: 0.6,       // paladin: smash only with MP above 60% of max (+ its 380 cost): regen funds it, never potions
	// Probing: the safety model only picks monsters it already calls safe, so it never learns about harder ones. Every
	// every_min the leader may try the best-xp spot whose risk is just over the limit (up to max_over x) and that beats
	// the best normal xp/s by min_gain, for `minutes`, with every member fleeing at flee_hp instead of 25%. A member
	// fleeing or dropping below abort_hp ends it as a failure (fail_cooldown_h before that monster is tried again);
	// lasting the time is a success (win_cooldown_h). Calibration learns from the fights either way.
	probe: { enabled: true, every_min: 45, minutes: 10, max_over: 2.0, min_gain: 1.25, flee_hp: 0.55, abort_hp: 0.4, fail_cooldown_h: 6, win_cooldown_h: 2 },
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
	sell: [],                  // item names to always sell
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
	// Points per unit of each stat. main_stat = the class's own (str/dex/int: each point is ~1 attack and some HP/MP);
	// the other two main stats count off_stat. Defensive stats count × tank_mult for tank classes.
	gear_w: { attack: 1, main_stat: 1.2, off_stat: 0.2, vit: 1, for: 0.6, hp: 0.05, mp: 0.02, armor: 0.3, resistance: 0.3,
		frequency: 2.5, crit: 2, critdamage: 0.3, apiercing: 0.4, rpiercing: 0.4, evasion: 1.5, avoidance: 1.5,
		reflection: 1, lifesteal: 2, manasteal: 1, dreturn: 0.5, speed: 0.5, range: 0.1, xp: 0.6, luck: 0.15, gold: 0.15, output: 3 },
	gear_tank: ["paladin", "warrior"],
	// v23.4: the xp stat (+1% of the wearer's kill xp per point; server: xpm) is worth what that much more damage would
	// earn: each fighter gets 1/n of every party kill, so +1% damage adds ~1/n % xp while +1 xp adds 1%. One point counts
	// as gear_xp_value x attack x fighters (attack = 1 point). Merchants get no kill xp: 0. Replaces gear_w.xp.
	gear_xp_value: 0.01,
	// Own compounding (rings, earrings, amulets, belts, orbs...): three spare copies at one level → one a level higher.
	// Spares = bags + bank, never worn, locked, titled, guide-needed, or wanted by a member as an upgrade.
	compound_auto: true,
	compound_max_level: 3,     // stop at +3 results (scroll cost rises and odds fall fast after that)
	compound_min_chance: 0.75, // the server's preview must say >= 75% (failure destroys all three)...
	compound_min_chance_rebuyable: 0.6, // ...or >= 60% when an NPC sells the item (failure only costs gold)
	compound_per_run: 6,       // compounds per town run at most
	gear_tank_mult: 2,
	// Own upgrading (upgrade_auto): one project at a time: an NPC-sold piece, upgraded (spare copies only, never worn
	// gear) to the level where it beats what a member wears by the most per gold. Each step is gated by the server's
	// preview (min_chance_rebuyable: a failure only costs gold); at low odds the project stops at the level reached.
	upgrade_auto: true,
	upgrade_max_level: 7,      // target at most +7, and only levels that take scroll0/scroll1 (scroll2 costs ~1.6M)
	upgrade_spend: 0.2,        // a project may cost at most 20% of the gold above gold_reserve (estimate without failures)
	upgrade_abort_x: 2.5,      // ...and is abandoned once failures push actual spending past 2.5x that estimate
	upgrade_steps_per_run: 8,  // upgrade steps per town run
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
	elixir_buy_min_gold: 5_000_000,
	// World bosses / events on this server (parent.S: snowman, pinkgoo, wabbit, dragold, mrpumpkin, franky...). They're
	// "cooperative" (every attacker shares xp and loot by damage), so they're judged on survival, not kill time: the
	// party (tank first) must take tank_s seconds of the boss's damage within the safety budget, and one hit may not
	// exceed one_hit of the squishiest member near. In practice: snowman, pinkgoo, wabbit yes; dragold, franky no.
	boss: { enabled: true, tank_s: 10, one_hit: 0.4, skip: [] },
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
	// v18.7 gold budget: optional spending (upgrade projects, guide buys/upgrades, compounds, crafting, Ponty, elixirs,
	// donations) only while the party's spending over the last window_h stays under share × what it earned (loot,
	// sales). Potions and other necessities are never held back, but they count as spending.
	spend: { enabled: true, window_h: 6, share: 0.9, min_data_h: 1 },
	// a monster hunt is chased only if its monster gives at least this share of the best xp/s we know. 0 = off (v18.8:
	// measured rates include time lost to town trips, so the comparison misjudged fast-killing monsters like bees)
	hunt_min_xp: 0.7,          // v23.5: 70% (was off since v18.8, when measured rates still included time lost to town
	                           //   trips; they're kills at the spot now). A hunt's tokens aren't worth a third of our xp.
	report_history_h: 1,       // v22.2: report() includes every character's history() of this many hours (0 = none)
	// game-log lines hidden: heartbeats' "Received a code message from" (v18.4), smart_move's path chatter (v18.5)
	quiet_logs: [/code message from/i, /Searching for a path\.\.\./i, /Path found[!~]/i],
	town_soft_gap_ms: 1_200_000, // a trip only for deferrable work (guide, fetches, upgrades, crafting...) waits 20 min
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
	min_chance_rebuyable: 0.5, // items NPCs sell: failure only costs gold, accept the guide's odds down to this
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
	quest_farm: true,          // farm the monsters that drop a quest's missing materials
	quest_farm_max_h: 3,       // own quests: skip if finishing would take longer than 3h at our kill rate
	quest_park_h: 12,          // v18.1: a quest (guide ones too) that would take > 12h to farm is parked: its materials
	quest_unpark_h: 8,         //   stop being held (they're banked, never sold) until the estimate drops under 8h
	quest_farm_min_xp: 0.7,    // own quests: skip while that pack gives < 70% of the best pack's xp/s (v23.5: was 25% —
	                           //   the party farmed minimush for Cole's newbie gloves at a fraction of croc's xp)
	quest_stall_min: 60,       // a material that hasn't dropped in 60 min of farming pauses its recipe/row...
	quest_shelve_h: 2,         // ...for 2h, then it's retried (nothing the guide asks for is dropped for good)
	guide_quest_keep_h: 24,    // keep working a guide quest for 24h after the guide last listed it (its HUD shows
	                           //   only a few rows at a time, so a quest can scroll out of view and back)
	auto_monster_hunt: true,   // take and turn in Daisy's monster hunts, and farm the hunt target when safe
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
		fund_keep: 2_000_000,  // the merchant's projects (upgrades, crafts) may count on fighters' gold above this each;
		                       //   the richest fighter near sends what the next steps need
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
		members: ["Aspernari", "Torlis", "Sanala"], // character names (any number; the game allows up to 9); [] = solo
		leader: null,          // null = the lowest-level member online leads (picks packs, others assist); or a name
		follow: 90,            // px; followers stay within this of the leader (close enough to heal, not in its way)
		follow_far: 500,       // px; farther than this (or another map) → path-find to the leader instead of stepping
		heal_at: 0.75,         // priests heal any member below 75% HP
		heal_bonus: 2.5,       // safety allowance × 2.5 while a priest partner is near (its heals offset damage)
		// Tank first: with a tank (CFG.gear_tank) near, the others hold fire on an untouched monster for up to
		// tank_hold_ms so the tank takes its aggro; risk is then judged against the tank's HP and armour, so the party
		// can take spots the leader couldn't survive alone. Not for aggressive monsters (G.monsters[].aggro > 0.3).
		tank_first: true,
		tank_hold_ms: 4000,    // how long the others hold fire on an untouched monster for the tank
		// v24.11: travel as a group. The leader doesn't set off (and stops mid-walk) while a member is over radius px
		// behind, and at the spot doesn't pull until everyone is there (it still fights what attacks it) — members
		// trickled in one by one, the leader (lowest level, often the mage) first. Members on their own errand,
		// recovering, or already waiting at our spot don't count. A straggler is waited for wait_s at most, then the
		// party goes on for go_s before waiting again.
		group: { enabled: true, radius: 450, wait_s: 45, go_s: 60, convoy: true },
		// convoy (v24.18): while the party travels to a spot, its slowest member (the priest, slowed by its weapons) walks
		// there and the rest — the leader too — follow it, so the group moves at its pace and arrives together
		wait_radius: 300,      // px; a follower whose leader is dead solo-grinds safe monsters within this radius
		// v20.0: kill xp is split equally among an account's fighters in the party (server: share by owner), so
		// focusing one weak monster wastes damage. On a monster we'd kill solo within spread_ttk seconds, followers take
		// their own (near the leader, not one a member is hitting) instead of the leader's target.
		spread: true, spread_ttk: 3,
		// v21.0: the server gives every online party member an equal share of every kill wherever it is (no distance
		// rule; hunts count party kills too), so on easy content the fighters farm separate spots. Each picks only what
		// it can kill alone; one that finds nothing follows the leader. The leader calls everyone back for probes,
		// bosses and events (regroup_max_min at most, then the probe is skipped this round).
		// v24.11: off — together by default. Measured split ~ together (990k vs 948k/h) while walking was 72-93% of the
		// time; together the fight model counts the tank's armour, the priest's heals and everyone's damage, so the party
		// can farm content no fighter can alone, and nobody dies alone. Set true to split (and measure) again.
		split: { enabled: false, regroup_max_min: 10, occupied_mult: 0.6, fallback_min: 5,
			// v24.0: split vs together is measured, not assumed. Every member receives a share of every party kill wherever
			// it is, so the leader's own xp intake measures the whole party in either mode. Each second of normal farming
			// is booked to the mode it was spent in (bosses, events, probes, regroups, death and recovery are left out);
			// samples fade with half_life_h so the comparison follows levels and gear. A mode with under sample_min
			// minutes of data is tried once the current mode has that much; otherwise the party switches only to a mode
			// earning margin x more, and holds any choice for hold_min. The first settle_min after each split/regroup
			// (walking) isn't booked. The losing mode's sample fades; under half of sample_min it is re-tried.
			ab: { enabled: true, sample_min: 40, hold_min: 30, margin: 1.1, half_life_h: 8, settle_min: 3 } },
		beat_ms: 2000,         // ms between status messages (free in one browser; a small call cost via the server)
		sync_factor: 2,        // partner in town → go too at bag_min_free×2 free slots / pot_min×2 potions (share the trip)
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
// Item types that always stay in the bags: consumables, scrolls, tools, keys
// Item types the bot may ever sell, list on the stand or purge from the bank: gear, plain materials, gems. Everything
// else (dungeon keys, licences, cosmetics, quest items, tomes, flutes, containers...) is only ever kept or banked.
const TRADE_TYPES = new Set(["material", "gem"]);
const tradeable = (name) => { const d = G.items[name]; return !!d && (GEAR.has(d.type) || TRADE_TYPES.has(d.type)) && !recipe_input(name); };
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
	"buy_cost", "scroll_missing", "no_scroll", "inputs_not_ready", "player_gone", "cant_in_bank", "no_mp", "not_found", "failed", "fleeing"]);
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
	safe: {},                // monster id -> { ttk, xp } for every type that passed the safety check at the last pick
	waypoints: [], wp: 0,    // patrol route through the pack (3x3 grid) and the current index
	last_pick: 0,            // when pick_pack last ran (0 forces a re-pick)
	last_target_at: Date.now(), // last time we had something to fight (idle detection)
	best_score: 0,           // best free-choice pack's xp/s (reference for quest opportunity cost)
	cooldown: {},            // pack key -> until (saved)
	measured: {},            // pack key -> measured xp/s with the party there (together), averaged (saved)
	measured_solo: {},       // pack key -> measured xp/s farming it alone (split) (saved)
	meas_at: {},             // "p:"/"s:" + pack key -> when that measurement was last updated (v24.3, saved)
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
	mode_ab: null,           // leader: split vs together xp measurements and the measured choice (v24.0, saved)
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
	if (state.recovering) throw { reason: "fleeing" };
	const T_ = CFG.travel.safe_routes && G.maps[character.map]?.doors ? dest_point(dest) : null;
	if (T_ && T_.map !== character.map) {
		const pl = route_plan(T_.map, T_.x, T_.y);
		if (pl?.danger) {
			if (Date.now() - (state.deadly_log_at || 0) > 60_000) { state.deadly_log_at = Date.now(); game_log(`walk to ${T_.map}: every way passes ${pl.danger} — not going`, C.warn); }
			state.walk_refused = { to: T_.map, why: pl.danger, at: Date.now() };
			throw { reason: "deadly_route", why: pl.danger };
		}
		if (pl?.legs?.length) {
			game_log(`walk to ${T_.map}: around ${pl.around} (${pl.legs.map((l) => (l.kind === "tp" ? "transporter → " : "") + l.to).join(", ")})`, C.dim);
			for (const L of pl.legs) {
				if (character.map !== L.map) break; // moved some other way meanwhile: the last walk below finishes it
				if (L.kind === "tp") {
					await go_raw({ map: L.map, x: L.x, y: L.y }, ms);
					if (typeof transport === "function") await T(transport(L.to, L.s), 25_000);
				} else await go_raw({ map: L.to, x: L.tx, y: L.ty }, ms);
			}
		}
	}
	return go_raw(dest, ms);
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
			try { stop("smart"); } catch (e) {}
			rej({ reason: "walk_timeout", dest: typeof dest === "string" ? dest : dest.map });
		}, ms)))]);
	} catch (e) {
		// v24.8: stop("smart") rejects the walk with "interrupted" first, which won the race: a timeout looked like an interruption
		if (timed_out) throw { reason: "walk_timeout", dest: typeof dest === "string" ? dest : dest.map };
		throw e;
	} finally { clearTimeout(timer); smart_depth--; }
}
const walking = () => smart_depth > 0;
// An errand (town run, park) owns NPC visits and pack travel while it runs. A hung one stops counting as busy after
// errand_timeout_ms; its token keeps a late finish from clearing a newer errand's lock.
const errand_busy = () => !!state.errand && Date.now() - state.errand_at < CFG.errand_timeout_ms;
function errand(name, fn) {
	if (errand_busy()) return false;
	const token = {};
	Object.assign(state, { errand: name, errand_at: Date.now(), errand_token: token });
	Promise.resolve().then(fn).catch((e) => game_log(`${name}: ${why(e)}`))
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
const map_ok = (name) => { const m = G.maps[name]; return !!m && !m.ignore && !m.instance && !m.pvp; };

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
// solo (v23.0): judge the fight with no partner damage, no tank cover and no priest heals. Default: whenever we farm
// alone (split mode) — partners passing by, or still near as a split starts, aren't there for the fight.
// solo = "all" (v23.1): every online member counts wherever it is — planning something that regroups the party
// (a boss, a probe); false: the members near now
function fight_math(m, use_tank = true, solo = solo_now()) {
	const mates = solo === true ? [] : solo === "all" ? partners() : partners_near();
	// defence → damage fraction: the game's own curve if available, else ~0.1% less per point, floored at 5%
	const dm = (d) => (typeof damage_multiplier === "function" ? damage_multiplier(d) : Math.max(0.05, 1 - d / 1000));
	const our_magic = (character.damage_type || G.classes[character.ctype].damage_type) === "magical";
	const pct = (v) => Math.min(1, Math.max(0, (v || 0) / 100)); // game percentages (evasion 25 = 25%) → 0..1
	let hit = character.attack * dm(((our_magic ? m.resistance : m.armor) || 0) - ((our_magic ? character.rpiercing : character.apiercing) || 0));
	hit *= 1 + (m.incdmgamp || 0) / 100;
	if (m["1hp"]) hit = 1; // "1hp" monsters take exactly 1 damage per hit whatever the attack
	const land = (1 - (our_magic ? 0 : pct(m.evasion))) * (1 - pct(m.avoidance));
	const theirs_magic = m.damage_type === "magical";
	const tank = solo !== true && use_tank && !(m.aggro > 0.3) && tank_cover(solo === "all" ? partners() : undefined), D = tank || character; // who the monster will be hitting
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
	return { ttk, xp: m.xp, their_dps, self_dps, kiteable: kiteable && !tank, hp_pool: tank ? tank.max_hp : character.max_hp,
		solo: solo === true, team: solo === true ? "solo" : solo === "all" ? "all" : "near", tank: tank ? tank.name : null, mates: mates.length };
}
const fight_risk = (f) => (f.their_dps / (f.kiteable ? CFG.kite_slack : 1) + f.self_dps) * f.ttk;
// Safety multiplier for a monster: calibration (how its fights went vs the model) × incidents (deaths/flees, fading)
// Calibrated after 20 fights: 1 / ratio, clamped 0.4-1.5 (a monster that hits half as hard as predicted earns ×1.5).
// Fewer fights: the all-monster ratio, more cautiously (0.6-1.2).
// v24.6: kept apart by how the fight is judged (calib_key): alone (kiting counts) or with the party. A kiting mage's
// solo fights (predicted with the kite slack, ~0 damage taken) earned x1.5, which loosened the tank-covered party
// verdict too. A verdict under tank cover uses the tank's own party calibration (its heartbeat `calp`): it's the one
// taking the hits — our own fights under cover say nothing and aren't recorded.
const calib_key = (mt, solo) => (solo ? mt : mt + "@p");
const fought_alone = (f) => (f ? f.solo || !f.mates : solo_now() || !partners_near().length); // nobody else counted: a solo fight
function calib_factor(mtype, f) {
	const solo = fought_alone(f);
	if (f && f.tank) { const r = state.partners[f.tank]?.calp?.[mtype]; return r > 0 ? Math.min(1.5, Math.max(0.4, 1 / Math.max(r, 0.3))) : 1; }
	const c = state.calib[calib_key(mtype, solo)], g = state.calib_all;
	if (c && c.n >= 20) return Math.min(1.5, Math.max(0.4, 1 / Math.max(c.ratio, 0.3)));
	if (g && g.n >= 20) return Math.min(1.2, Math.max(0.6, 1 / Math.max(g.ratio, 0.3)));
	return 1;
}
// v24.6: a probe that held (probe_ok, 24h, shared) widens the party verdict for that monster by the risk it held at
const probe_ok_mult = (mtype, f) => { const o = state.probe_ok[mtype]; return o && (f ? !f.solo : !solo_now()) && Date.now() - o.at < 24 * 3600_000 ? o.mult : 1; };
const danger_of = (mtype, f) => calib_factor(mtype, f) * (state.danger[mtype] || 1) * probe_ok_mult(mtype, f);
// A priest among the members the verdict counted heals us through it (none when judged alone)
const heal_mult = (f) => (!f.solo && (f.team === "all" ? partners() : partners_near()).some((p) => p.ctype === "priest") ? CFG.party.heal_bonus : 1);
// The safety fraction in force: CFG.safety x the self-tuned multiplier (v23.5), capped at safety_tune.max. Together, the
// leader picks for everyone, so the party's lowest multiplier counts (v23.6: a follower's death reset only its own, and
// the leader kept choosing the spot that killed it); split, each its own.
// v24.3: f (a fight_math result) says who the fight is judged with: alone → our own; with the party ("all" or the members
// near) → the party's lowest, whatever mode we're in now. A boss or probe judged for the regrouped party used the split
// fighter's own multiplier, then failed at the party's once regrouped, and the party flipped every 15s.
const safety_now = (f) => {
	let m = state.safety_mult || 1;
	if (in_party_cfg() && (f ? !f.solo : !split_now())) for (const p of partners_any()) if (p.safety_mult > 0) m = Math.min(m, p.safety_mult);
	return Math.min(CFG.safety * m, CFG.safety_tune?.enabled ? CFG.safety_tune.max : CFG.safety);
};
const safe_enough = (f, mtype) => !!f && fight_risk(f) <= (f.hp_pool || character.max_hp) * safety_now(f) * danger_of(mtype, f) * heal_mult(f);
// A party tank (paladin/warrior) near enough to take aggro: version-matched, alive, not on an errand, sturdier than us
function tank_cover(pool = partners_near(300)) {
	if (!CFG.party.tank_first || !in_party_cfg() || CFG.gear_tank.includes(character.ctype)) return null;
	return pool.find((p) => CFG.gear_tank.includes(p.ctype) && !p.errand && p.max_hp > character.max_hp &&
		Number.isFinite(p.armor) && p.v === VERSION) || null;
}
// Hold fire on an untouched monster while the tank engages it (tells the tank the target right away, not at the
// next heartbeat). Gives up after tank_hold_ms, so a tank that doesn't come can't stall us.
const tank_hold = { id: null, at: 0 };
function hold_for_tank(t) {
	if (!t || t.target) return false;
	const tank = tank_cover();
	if (!tank) return false;
	const solo = G.monsters[t.mtype] && fight_math({ ...G.monsters[t.mtype], hp: t.max_hp || G.monsters[t.mtype].hp, attack: t.attack ?? G.monsters[t.mtype].attack }, false);
	if (solo && safe_enough(solo, t.mtype)) return false; // safe without the tank: no reason to wait
	if (tank_hold.id !== t.id) { tank_hold.id = t.id; tank_hold.at = Date.now(); }
	return Date.now() - tank_hold.at < CFG.party.tank_hold_ms;
}
// ---- Assist the tank (v15.4): with a tank near, it picks the targets and everyone else hits its target ----
const i_am_tank = () => CFG.party.tank_first && in_party_cfg() && CFG.gear_tank.includes(character.ctype) && partners_near(400).length > 0;
// The tank's current target, as a live entity (its "tgt" broadcasts update state.partners[tank].target at once)
function caller_target() {
	const tank = tank_cover();
	const id = tank && state.partners[tank.name]?.target, e = id && parent.entities?.[id];
	return e && valid(e) && e.type === "monster" ? e : null;
}
// The tank tells everyone its new target right away (not at the next heartbeat)
let announced = null;
function announce_target(t) {
	if (!t || announced === t.id || !i_am_tank() || typeof send_cm !== "function") return;
	announced = t.id;
	Promise.resolve(send_cm(others(), { k: "tgt", id: t.id })).catch(() => {});
}
function fight_profile(mtype) {
	if (!farmable_type(mtype)) return null;
	const f = fight_math(G.monsters[mtype]);
	return safe_enough(f, mtype) ? { ttk: f.ttk, xp: f.xp } : null;
}
// Live-stat check per entity: monsters level up when left alive, and an elite can be several times stronger than its
// G.monsters entry. Verdicts are cached per entity id and recomputed when its level/HP/attack changes.
const live_cache = new Map(); // entity id -> { key, ok, ttk, xp }; trimmed to 500 entries (oldest first)
function entity_profile(e, solo = solo_now()) {
	const key = `${solo ? "solo" : "party"}:${e.level || 1}:${e.max_hp}:${e.attack}`;
	const c = live_cache.get(e.id);
	if (c && c.key === key) return c.ok ? c : null;
	const def = G.monsters[e.mtype];
	const live = {};
	for (const k of ["hp", "max_hp", "attack", "frequency", "armor", "resistance", "speed", "xp", "1hp", "level"]) if (e[k] !== undefined) live[k] = e[k];
	const f = def && fight_math({ ...def, ...live, hp: e.max_hp || def.hp, charge: Math.max(def.charge || 0, e.speed || 0) }, true, solo);
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
	if (f.probe) return f; // probing this monster on purpose (the flee threshold is raised instead)
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
// The maps a walk crosses after leaving `from`, ending with `to` (the BFS route; smart_move's may differ a little)
function map_route(from, to) {
	if (from === to || !Number.isFinite(map_hops(from, to))) return [];
	const prev = hops_prev[from] || {}, out = [];
	for (let m = to; m && m !== from && out.length < 30; m = prev[m]) out.unshift(m);
	return out;
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
	const edges = (u) => {
		const p = pos[u], M = G.maps[p.map], out = [];
		const add = (m2, s2, cost, how) => {
			const sp = G.maps[m2]?.spawns?.[s2];
			if (!sp) return;
			// v24.19: safe mode — not along a stretch that passes deadly spawns (our own first stretch excepted: we're there)
			if (safe && u !== "@" && seg_danger(p.map, p.x, p.y, how.x, how.y)) return;
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
	for (const [pk, a] of map_areas(map)) { const t = pk.type; if (valid_boundary(a.boundary) && aggressive(t) && !state.safe[t] && chase_speed(t) >= v) list.push({ t, b: a.boundary }); }
	dz_cache.set(map, { at: now, v, list });
	return list;
}
// "mt @ map" if the stretch (x1,y1)-(x2,y2) on a map passes within danger_px of such a spawn (sampled every 40px)
function seg_danger(map, x1, y1, x2, y2) {
	const zs = deadly_areas(map);
	if (!zs.length) return null;
	const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 40));
	for (const z of zs) for (let i = 0; i <= n; i++) {
		const x = x1 + ((x2 - x1) * i) / n, y = y1 + ((y2 - y1) * i) / n;
		if (Math.hypot(Math.max(0, z.b[0] - x, x - z.b[2]), Math.max(0, z.b[1] - y, y - z.b[3])) < CFG.danger_px) return `${z.t} @ ${map}`;
	}
	return null;
}
// The way smart_move would walk, or if that passes deadly spawns, the shortest way around them: { d, legs, danger,
// around } — danger set only when there's no safe way at all
function route_plan(to_map, tx, ty, from = { map: character.map, x: character.x, y: character.y }) {
	const r = route_to(to_map, tx, ty, from);
	if (!r) return null;
	let why = null;
	for (const L of r.legs) if (L.fx !== undefined && (why = seg_danger(L.map, L.fx, L.fy, L.x, L.y))) break;
	if (!why && r.last) why = seg_danger(to_map, r.last.x, r.last.y, tx, ty);
	if (!why) return { d: r.d, legs: null, danger: null, around: null };
	const s = route_to(to_map, tx, ty, from, true);
	return s ? { d: s.d, legs: s.legs, danger: null, around: why } : { d: r.d, legs: null, danger: why, around: null };
}
// ---- Dangerous neighbours (v24.10) ----
// Aggressive monsters (aggro or rage >= 0.5: they come at anyone near) that we can't take on. In the first v24.9 run,
// boars and dark hounds next to winterland's iceroamers and vampire rats on the way through level1 killed Torlis 4 times
// and Sanala once in an hour: the picker only judged the monster it farmed.
const chase_speed = (mt) => { const m = G.monsters[mt]; return m ? m.charge || m.speed || 0 : 0; };
const aggressive = (mt) => { const m = G.monsters[mt]; return !!m && ((m.aggro || 0) >= 0.5 || (m.rage || 0) >= 0.5); };
const can_take = (e) => !!(state.safe[e.mtype] ? live_ok(e) : fight_profile(e.mtype));
const rect_gap = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
function map_areas(name) { const out = []; for (const pk of G.maps[name]?.monsters || []) for (const a of pack_areas(name, pk)) out.push([pk, a]); return out; }
// A spot within danger_px of a spawn of such a monster: its name, else null
function area_danger(area, mt) {
	for (const [pk, a2] of map_areas(area.map)) {
		const t = pk.type;
		if (t === mt || !aggressive(t) || state.safe[t] || !valid_boundary(a2.boundary)) continue;
		if (rect_gap(area.boundary, a2.boundary) < CFG.danger_px) return t;
	}
	return null;
}
// A route through (or into) a map with such a monster that's also faster than us — it can't be outrun: "mt @ map", else null.
// v24.16: smart_move's route (route_to); from defaults to us (the leader also checks each member's way there)
function route_danger(to, tx, ty, from) {
	const v = character.speed || 55;
	const sp = G.maps[to]?.spawns?.[0] || [0, 0];
	// v24.17: with door data, the danger is only real if there's no way around it (go() walks the way around)
	if (G.maps[(from || character).map]?.doors) { const pl = route_plan(to, tx ?? sp[0], ty ?? sp[1], from || undefined); return pl ? pl.danger : null; }
	const r = { maps: map_route((from || character).map, to) };
	for (const m of r.maps) for (const [pk] of map_areas(m)) {
		const t = pk.type;
		if (aggressive(t) && !state.safe[t] && chase_speed(t) >= v) return `${t} @ ${m}`;
	}
	return null;
}
// ---- Keep away (v24.14) ----
// A monster we can't take on that may attack at all (any aggro or rage), within keep_px and not yet on one of us:
// step away before it picks someone. An ent (8M HP, 3600 a hit, aggro 0.2) wandering into the gscorpion spot killed
// Sanala and made Aspernari flee; with aggro under 0.5 it passed the spawn check, and it roams anyway.
const deadly_c = {};
function deadly_type(mt) {
	const c = deadly_c[mt], now = Date.now();
	if (c && now - c.at < 30_000) return c.v;
	const m = G.monsters[mt];
	const v = !!m && ((m.aggro || 0) > 0 || (m.rage || 0) > 0) && !state.safe[mt] && !fight_profile(mt);
	deadly_c[mt] = { at: now, v };
	return v;
}
function looming() {
	const party = party_names();
	let best = null, bd = CFG.keep_px;
	for (const id in parent.entities || {}) {
		const e = parent.entities[id];
		if (!e || e.type !== "monster" || !e.visible || e.dead || (e.target && party.has(e.target))) continue; // on us: fight()'s escape
		if (e.mtype === state.pack?.mtype) continue; // what the party came for (a boss, a probe): not something to avoid
		const d = distance(character, e);
		if (d < bd && deadly_type(e.mtype)) (best = e), (bd = d);
	}
	return best;
}
// Step away from a looming one; repeated at the same spot (3 times in 5 min), that spot cools down (it lives there)
function keep_away(e) {
	const now = Date.now(), P = state.pack, key = P && valid_boundary(P.boundary) ? pack_key(P) : null;
	step_away(e);
	set_message(`keeping away from ${e.mtype}`);
	if (now - (state.keep_at || 0) > 5000) { // one count per 5s episode
		state.keep_log = (state.keep_log || []).filter((k) => now - k.t < 300_000);
		state.keep_log.push({ t: now, key, mt: e.mtype });
		log_ev("keep_away", { mtype: e.mtype, pack: P?.mtype || null });
		if (key && !is_follower() && state.keep_log.filter((k) => k.key === key).length >= 4) {
			state.cooldown[key] = now + CFG.pack_cooldown_ms;
			state.keep_log = [];
			state.last_pick = 0;
			game_log(`${e.mtype} keeps coming to ${P.mtype}; cooling this spot down`, C.warn);
		}
	}
	state.keep_at = now;
}
// v24.16: together, a spot is only as safe as the way there for every member (one in another map walks its own route)
function party_route_danger(to) {
	const own = route_danger(to);
	if (own || split_now() || !in_party_cfg()) return own;
	for (const p of partners()) {
		if (p.map === character.map || p.errand) continue;
		const q = partner_pos(p), rd = route_danger(to, undefined, undefined, { map: q.map, x: q.x, y: q.y });
		if (rd) return `${rd} (${p.name}'s way)`;
	}
	return null;
}
// Step away from a monster (it's slower than us): ~120px straight away, or sideways if that's blocked
function step_away(e) {
	if (!e || !Number.isFinite(e.x)) return false;
	const a = Math.atan2(character.y - e.y, character.x - e.x);
	for (const da of [0, 0.8, -0.8, 1.6, -1.6]) {
		const x = character.x + Math.cos(a + da) * 120, y = character.y + Math.sin(a + da) * 120;
		if (can_move_to(x, y)) return move_to(x, y, 300);
	}
	return false;
}
function travel_s(map, boundary) {
	if (!map || !valid_boundary(boundary)) return 0;
	const cx = (boundary[0] + boundary[2]) / 2, cy = (boundary[1] + boundary[3]) / 2, v = Math.max(character.speed || 55, 10);
	if (map === character.map) return (Math.hypot(cx - character.x, cy - character.y) / v) * 1.3;
	if (G.maps[character.map]?.doors) { const r = route_plan(map, cx, cy); return r ? (r.d / v) * 1.3 : Infinity; } // v24.16; v24.17: the way actually walked
	const sp = G.maps[map]?.spawns?.[0] || [0, 0];
	return CFG.travel.cross_map_s * map_hops(character.map, map) + (Math.hypot(cx - sp[0], cy - sp[1]) / v) * 1.3;
}
// v24.9: a spot's xp/s counting the walk there: over an expected stay of stay_min, travel minutes earn nothing. Spots
// were picked by rate alone, so a slightly better one maps away beat the one at hand (walk was 72-93% of the time)
const walk_factor = (area) => { const st = CFG.travel.stay_min * 60, t = travel_s(area.map, area.boundary); return Number.isFinite(t) ? st / (st + t) : 0; };
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
function meas_aged(key, est, split = split_now()) {
	const v = meas(split)[key];
	if (v === undefined) return est;
	const at = state.meas_at[(split ? "s:" : "p:") + key];
	if (!at || !(CFG.meas_half_h > 0)) return v;
	const w = Math.pow(0.5, Math.max(0, Date.now() - at) / (CFG.meas_half_h * 3600_000));
	return v * w + est * (1 - w);
}
// Split: a partner with an earlier name farms this spot (v23.2)
// v24.3: a member that's following us (nothing it can farm alone) isn't on a spot of its own: it sends ours, and the
// leader scored its own spot x occupied_mult and dropped its own hunt as "theirs"
const occupied = (key) => split_now() && partners().some((m) => m.name < character.name && !m.follows && m.pack && valid_boundary(m.pack.boundary) && pack_key(m.pack) === key);
// Measured xp/s per spot, one table per mode (v23.1): a spot farmed by the whole party kills ~n times as fast as by one
// fighter alone, so the two can't share a table. Split = farming alone; together = the party's rate.
const meas = (split = split_now()) => (split ? state.measured_solo : state.measured);

// =====================================================================
// Where to fight
// =====================================================================
// Switch to a pack: new patrol route, close the running xp measurement, log the reason
function set_pack(p, label) {
	if (!state.pack || !p || pack_key(state.pack) !== pack_key(p)) {
		if (p) game_log(label, C.info);
		if (p) log_ev(p.boss ? "boss" : "pack", { name: p.mtype, to: `${p.mtype}@${p.map}`, from: state.pack ? `${state.pack.mtype}@${state.pack.map}` : null, why: p.directive || "best xp/s" });
		state.waypoints = p ? make_waypoints(p.boundary) : [];
		state.wp = 0;
		end_session();
		state.last_target_at = Date.now();
	}
	state.pack = p;
}
// Choose where to fight: best-scoring safe pack, unless a directive (guide/quest/hunt) names one we can fight.
// Stays at the current pack unless the best is switch_margin better (hysteresis).
// ---- Probing (CFG.probe) ----
// How far over the safety limit a monster is: fight_risk ÷ the same budget safe_enough uses (1 = exactly at it)
function risk_over(mt, team = solo_now()) {
	const m = G.monsters[mt], f = m && fight_math(m, true, team);
	if (!f) return Infinity;
	const limit = (f.hp_pool || character.max_hp) * safety_now(f) * danger_of(mt, f) * heal_mult(f);
	return fight_risk(f) / Math.max(1, limit);
}
const flee_at = () => (CFG.probe?.enabled && (state.pack?.probe || (is_follower() && leader_hb()?.pack?.probe)) ? CFG.probe.flee_hp : CFG.flee_hp);
// May the leader start a probe now? Everyone near, healthy and stocked; nothing else special going on
function probe_ready() {
	const P = CFG.probe, now = Date.now();
	if (!P?.enabled || is_follower() || is_merchant() || (in_party_cfg() && leader_name() !== character.name) || state.probe || now - (state.probe_at || 0) < P.every_min * 60_000) return false;
	if (state.directive?.boss || event_live() || errand_busy() || state.recovering || character.rip) return false;
	const all = partners();
	if (partners_near().length < all.length || character.hp < character.max_hp * 0.8) return false;
	if (pot_count("hp") < CFG.pot_min * 2 || pot_count("mp") < CFG.pot_min * 2) return false;
	return all.every((p) => p.max_hp && p.hp >= p.max_hp * 0.8 && (p.pots?.hp ?? 0) >= CFG.pot_min * 2 && (p.pots?.mp ?? 0) >= CFG.pot_min * 2);
}
// Why probe_ready() says no right now (report; v20.0 — the probe line used to be hidden until a first probe ran)
function probe_why() {
	const P = CFG.probe, now = Date.now();
	if (!P?.enabled) return "off";
	if (is_follower() || (in_party_cfg() && leader_name() !== character.name)) return "only the leader probes";
	if (state.probe) return null;
	if (now - (state.probe_at || 0) < P.every_min * 60_000) return `next check in ${mins((state.probe_at || 0) + P.every_min * 60_000)}`;
	if (state.directive?.boss) return "boss fight";
	if (event_live()) return "event running";
	if (errand_busy()) return `errand ${state.errand}`;
	if (state.recovering || character.rip) return "recovering";
	const all = partners(), near = partners_near();
	if (near.length < all.length) return `waiting for ${all.filter((p) => !near.includes(p)).map((p) => p.name).join(", ")} to be near`;
	if (character.hp < character.max_hp * 0.8) return "our HP under 80%";
	if (pot_count("hp") < CFG.pot_min * 2 || pot_count("mp") < CFG.pot_min * 2) return `our potions under ${CFG.pot_min * 2}`;
	const low = all.find((p) => !(p.max_hp && p.hp >= p.max_hp * 0.8));
	if (low) return `${low.name} HP under 80%`;
	const lp = all.find((p) => (p.pots?.hp ?? 0) < CFG.pot_min * 2 || (p.pots?.mp ?? 0) < CFG.pot_min * 2);
	if (lp) return `${lp.name} potions under ${CFG.pot_min * 2}`;
	return "ready (next pick)";
}
// Best-xp spot of a monster just past the limit that would beat the best normal spot by min_gain. team: who the fight
// is judged with (default: as now); ref: the best normal xp/s to beat (default: this pick's)
function probe_pick(team = solo_now(), ref = state.best_score) {
	const P = CFG.probe, now = Date.now();
	let best = null;
	for (const mt in G.monsters) {
		if (!farmable_type(mt) || skipped("probe:" + mt)) continue; // safe ones fail r > 1 below
		const r = risk_over(mt, team);
		if (!(r > 1 && r <= P.max_over)) continue;
		const m = G.monsters[mt], f = fight_math(m, true, team);
		each_area((pack, area) => {
			if (pack.type !== mt || (!pack.grow && (expected_respawn(mt, pack) > CFG.max_respawn || pack.count < CFG.min_count))) return;
			if ((state.cooldown[pack_key(area)] || 0) > now) return;
			// v24.3: a spot probed before is judged by what it measured (a probe that held far below its estimate was
			// re-probed every win_cooldown_h forever); raw = the unscaled estimate, the unit realism compares against
			const raw = m.xp * Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack));
			const est = meas_aged(pack_key(area), raw * state.realism, team === true); // v24.7: aged
			if (est >= P.min_gain * (ref || 0) && (!best || est > best.est)) best = { mt, area, est, raw, r, ttk: f.ttk, pred: Math.round(fight_risk(f)) };
		});
	}
	return best;
}
// Best normal spot's xp/s for a team, without being there (v23.1: the probe check before a regroup compares against
// the party's best, not the split fighter's solo best)
function best_score_for(team) {
	const prof = {}, tab = team === true ? state.measured_solo : state.measured;
	let best = 0;
	each_area((pack, area) => {
		const t = pack.type;
		if (!(t in prof)) { const f = farmable_type(t) && fight_math(G.monsters[t], true, team); prof[t] = f && safe_enough(f, t) ? f : null; }
		const f = prof[t];
		if (!f || (!pack.grow && (expected_respawn(t, pack) > CFG.max_respawn || pack.count < CFG.min_count))) return;
		const est = f.xp * Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(t, pack));
		best = Math.max(best, meas_aged(pack_key(area), est * state.realism, team === true));
	});
	return best;
}
// Leader: end a running probe on time (success) or on trouble (failure)
function probe_check() {
	const P = state.probe;
	if (!P) return;
	const now = Date.now(), members = [character, ...partners()];
	const fled = !!state.recovering || partners().some((p) => p.recovering);
	const low = members.some((p) => p.max_hp && p.hp < p.max_hp * CFG.probe.abort_hp);
	const dead = !!character.rip || partners_any().some((p) => p.rip);
	const result = fled || low || dead ? "fail" : now >= P.until ? "ok" : null;
	if (!result) return;
	const c = state.calib[P.mtype];
	log_ev("probe", { mtype: P.mtype, mins: Math.round((now - P.start) / 60_000), result, why: dead ? "death" : fled ? "flee" : low ? "low hp" : "time",
		ratio: c ? +c.ratio.toFixed(2) : null, n: c?.n || 0, over: +P.ratio.toFixed(2) });
	skip("probe:" + P.mtype, (result === "ok" ? CFG.probe.win_cooldown_h : CFG.probe.fail_cooldown_h) * 3600_000, result);
	// v24.6: a probe that held widens the party verdict for that monster by the risk it held at (24h), for every fighter:
	// before, nothing changed — calibration isn't recorded under tank cover — so it was re-probed every 2h, never adopted
	if (result === "ok") { const mult = +Math.min(P.ratio * 1.05, CFG.probe.max_over * 1.05).toFixed(3); state.probe_ok[P.mtype] = { mult, at: now }; share_verdict({ kind: "probe_ok", mtype: P.mtype, mult }); }
	else { delete state.probe_ok[P.mtype]; share_verdict({ kind: "probe_fail", mtype: P.mtype }); }
	if (result === "fail" && !fled && !dead) incident(P.mtype, 0.8); // a flee/death already recorded its own incident
	game_log(`probe ${P.mtype}: ${result === "ok" ? "held for " + CFG.probe.minutes + " min" : "aborted (" + (dead ? "death" : fled ? "flee" : "low hp") + ")"}`, result === "ok" ? C.ok : C.warn);
	state.probe = null;
	state.last_pick = 0;
}
function pick_pack() {
	state.safe = {};
	for (const t in G.monsters) { const f = fight_profile(t); if (f) state.safe[t] = f; }
	const now = Date.now();
	if (state.probe && now < state.probe.until) { // a probe holds the pack until probe_check ends it
		state.safe[state.probe.mtype] = state.probe.prof;
		state.last_pick = now;
		return;
	}
	let best = null;
	const seen = new Set(), route_cache = new Map();
	state.pick_skips = {};
	each_area((pack, area) => {
		const t = pack.type;
		if ((CFG.force_type && t !== CFG.force_type) || !state.safe[t]) return;
		if (!pack.grow && (expected_respawn(t, pack) > CFG.max_respawn || pack.count < CFG.min_count)) return;
		const key = pack_key(area);
		if (seen.has(key) || (state.cooldown[key] || 0) > now) return;
		seen.add(key);
		// v24.10: not next to aggressive monsters we can't take on, nor past ones we can't outrun
		const nb = area_danger(area, t), rd = nb ? null : route_cache.has(area.map) ? route_cache.get(area.map) : (route_cache.set(area.map, party_route_danger(area.map)), route_cache.get(area.map));
		if (nb || rd) { state.pick_skips[key] = nb ? `${nb} spawns within ${CFG.danger_px}px` : `the way there passes ${rd}`; return; }
		const p = { mtype: t, ...area, ...score_area(t, pack, area) };
		p.rate = p.score; // its xp/s there (the side-goal and probe reference)
		p.score *= walk_factor(area); // v24.9: counting the walk there
		// split: a spot a partner is already farming scores lower, so we spread over different spots. Only partners with an
		// earlier name count (v23.2), as for hunt/quest targets: the first keeps a spot, the rest move — counting everyone
		// made two fighters on one spot both look elsewhere
		if (occupied(key)) p.score *= CFG.party.split.occupied_mult;
		if (!best || p.score > best.score) best = p;
	});
	state.last_pick = now;
	state.best_score = best ? best.rate : 0;
	state.best_solo = solo_now(); state.best_at = now;
	if (probe_ready()) {
		state.probe_at = now;
		const pb = probe_pick();
		if (!pb) state.probe_none = { at: now, best: Math.round(state.best_score || 0) };
		if (pb) {
			const prof = { ttk: pb.ttk, xp: G.monsters[pb.mt].xp, probe: true };
			state.probe = { mtype: pb.mt, start: now, until: now + CFG.probe.minutes * 60_000, ratio: pb.r, pred: pb.pred, prof };
			state.safe[pb.mt] = prof;
			log_ev("probe_start", { mtype: pb.mt, over: +pb.r.toFixed(2), est: Math.round(pb.est) });
			state.probe_none = null;
			return set_pack({ mtype: pb.mt, ...pb.area, est: pb.raw, score: pb.est, probe: true, directive: `probe: ${pb.mt} (risk x${pb.r.toFixed(2)} of the limit)` },
				`→ PROBE ${pb.mt} @ ${pb.area.map}: risk x${pb.r.toFixed(2)} of the limit, ~${Math.round(pb.est)} xp/s (flee at ${CFG.probe.flee_hp * 100}%)`);
		}
	}

	const d = state.directive;
	if (d && d.until > now && farmable_type(d.monster) && !state.safe[d.monster] && d.guide_safe)
		state.safe[d.monster] = { ttk: d.seconds || 5, xp: G.monsters[d.monster].xp, trusted: true }; // guide's kill time,
		// or 5s if it gave none — the guide's own fight model judged this route safe for us
	if (d && d.until > now && d.boss)
		return set_pack({ mtype: d.monster, map: d.map, boundary: d.boundary, count: 1, boss: true, est: 0, score: 0, directive: d.reason }, `→ ${d.reason} @ ${d.map}`);
	if (d && d.until > now && state.safe[d.monster]) {
		const area = { map: d.map, boundary: d.boundary, count: d.count };
		// v24.10: a goal's spot gets the same danger check (not a boss: the party gathers for it)
		const dz = !d.boss && valid_boundary(area.boundary) && (area_danger(area, d.monster) || party_route_danger(area.map));
		if (dz) state.pick_skips[pack_key(area)] = `goal ${d.monster}: ${dz}`;
		if (!dz && !((state.cooldown[pack_key(area)] || 0) > now)) {
			const pack = (G.maps[d.map]?.monsters || []).find((pk) => pk.type === d.monster) || { count: d.count };
			return set_pack({ mtype: d.monster, ...area, ...score_area(d.monster, pack, area), directive: d.reason }, `→ ${d.monster} @ ${d.map} (${d.reason})`);
		}
	}
	const cur = state.pack;
	if (cur && state.safe[cur.mtype] && !((state.cooldown[pack_key(cur)] || 0) > now) && best && pack_key(best) !== pack_key(cur)) {
		const cur_v = (cur.est > 0 ? meas_aged(pack_key(cur), cur.est * state.realism) : meas()[pack_key(cur)] ?? cur.score) * walk_factor(cur); // v24.6: aged; v24.9: walk left
		if (best.score < cur_v * (occupied(pack_key(cur)) ? CFG.party.split.occupied_mult : 1) * CFG.switch_margin) best = cur;
	}
	set_pack(best, best && `→ ${best.mtype} x${Math.round(best.count)} @ ${best.map} (~${best.score.toFixed(0)} xp/s${meas()[pack_key(best)] ? " measured" : " est"})`);
	// split, nothing we can farm alone: follow the leader for a while (is_follower turns true until split_fallback)
	if (!best && split_now() && leader_name() !== character.name) state.split_fallback = now + CFG.party.split.fallback_min * 60_000;
}
// Patrol route: a 3x3 grid snaking through the area at 15%, 50% and 85% of its width/height, so the server shows us
// every part of the pack (it only sends entities near us) without hugging the edges
function make_waypoints([x1, y1, x2, y2]) {
	const pts = [];
	for (let r = 0; r < 3; r++) {
		const cols = r % 2 ? [2, 1, 0] : [0, 1, 2];
		for (const c of cols) pts.push({ x: x1 + (x2 - x1) * (0.15 + 0.35 * c), y: y1 + (y2 - y1) * (0.15 + 0.35 * r) });
	}
	return pts;
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
	if (s.split !== split_now()) return; // the mode changed mid-measurement: neither number is clean
	// v23.0: one unit in both modes, the one score_area estimates in: base xp of the kills made at this spot. The xp we
	// receive is a share of every party kill anywhere (server), so it can't be used. Split: our own kills (partners'
	// kills elsewhere aren't this spot's). Together: every party kill (kill_credit, sent to each member; the party is
	// here). No kill_credit seen at all (an older client?) → together-mode spots aren't measured; estimates stand.
	let rate;
	if (s.split) rate = s.kx / secs;
	else if (s.kc_n > 0) rate = s.kc / secs;
	else { if (s.kx > 0 && !seen.kc) log_error("no kill_credit events: together-mode xp/s not measured"); return; }
	const tab = meas(s.split), prev = tab[s.key];
	// average with the previous measurement — aged (v24.7): averaged raw, a 3-day-old bad rate came back at full weight
	tab[s.key] = prev === undefined ? rate : meas_aged(s.key, rate, s.split) * 0.5 + rate * 0.5;
	state.meas_at[(s.split ? "s:" : "p:") + s.key] = Date.now();
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
		// own kills, valued at the monster's base xp (what score_area estimates): the split-mode pack measurement
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
	const c = state.calib[calib_key(mt, fought_alone())]; // v24.6: the table for how we fight now (alone / with the party)
	return c ? `calibration x${calib_factor(mt).toFixed(2)} (predicted ${Math.round(c.pred)}, actual ${Math.round(c.act)} dmg per fight over ${c.n}${c.n < 20 ? ", needs 20" : ""})`
		: `calibration x${calib_factor(mt).toFixed(2)} (no fights yet${state.calib_all.n >= 20 ? `; all monsters: ratio ${state.calib_all.ratio.toFixed(2)}` : ""})`;
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
	const ck = calib_key(mt, fought_alone(f));
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
// Self-tuning safety (CFG.safety_tune): up a step after every step_h without a death or flee; down on a flee; reset on
// a death. Checked every minute; the clock restarts on every change.
function safety_tune(ev) {
	const T_ = CFG.safety_tune, now = Date.now();
	if (!T_?.enabled || is_merchant()) return;
	const own = () => Math.min(CFG.safety * (state.safety_mult || 1), T_.max), was = own();
	if (!state.safety_at) state.safety_at = now;
	if (ev === "death") state.safety_mult = 1;
	else if (ev === "flee") state.safety_mult = Math.max(1, (state.safety_mult || 1) * T_.down);
	else if (now - state.safety_at >= T_.step_h * 3600_000 && own() < T_.max) state.safety_mult = (state.safety_mult || 1) * T_.up;
	else return;
	state.safety_at = now;
	if (own() !== was) {
		log_ev("safety", { to: +own().toFixed(3), why: ev || "calm" });
		game_log(`safety limit ${Math.round(was * 100)}% → ${Math.round(own() * 100)}% of HP per kill (${ev || `no death or flee for ${T_.step_h}h`})`, ev ? C.warn : C.info);
		state.last_pick = 0;
	}
}
setInterval(() => { try { safety_tune(); } catch (e) {} }, 60_000);
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
	const no_kills = (p) => !!p && (split_now() || !seen.kc ? seen.kill - p.kills : seen.kc - p.kc) <= 0;
	const still = (p) => !!p && wd.pos.filter((q) => q.t >= p.t).every((q) => q.map === character.map && Math.hypot(q.x - character.x, q.y - character.y) < 20);
	const reset = (p) => { wd.pos = wd.pos.filter((q) => q.t > now - 1000); return p; };
	if (is_follower()) {
		const L = leader_hb(), pos = L && partner_pos(L);
		const away = !!pos && !L.rip && !L.errand && (pos.map !== character.map || Math.hypot(pos.x - character.x, pos.y - character.y) > CFG.party.follow_far) &&
			!(state.follow_block && now - state.follow_block.at < 60_000); // v24.16: held back on purpose (a deadly way), not lost
		wd.lost_since = away ? wd.lost_since || now : null;
		if (away && now - wd.lost_since > W.lost_min * 60_000) {
			wd.lost_since = null;
			wd_act("lost", `${Math.round(W.lost_min)} min away from ${L.name}; town, then back to it`);
			try { stop("smart"); } catch (e) {}
			state.travel_block_until = 0;
			errand("regroup", async () => { await T(use_skill("use_town"), 8000).catch(() => {}); await sleep_ms(4000); await go(partner_pos(leader_hb())).catch(() => {}); });
			return;
		}
		const f = since(W.frozen_min);
		if (still(f) && no_hits(f) && !away) { // a follower glued in place while the leader is near: walk back to it
			reset();
			wd_act("frozen", `follower stuck ${W.frozen_min} min; walking to ${L?.name}`);
			try { stop("smart"); } catch (e) {}
			state.travel_block_until = 0;
		}
		return;
	}
	const f = since(W.frozen_min);
	if (state.pack && still(f) && no_hits(f)) { // no pack = nothing safe to fight: waiting is correct, not a stall
		reset();
		wd_act("frozen", `no movement and no hits for ${W.frozen_min} min${state.pack ? " at " + state.pack.mtype : ""}`);
		try { stop("smart"); } catch (e) {}
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
		if (repeat) { try { stop("smart"); } catch (e) {} use_skill("use_town"); }
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
	if (probes.length) L.push(`probes: ${probes.slice(-6).map((e) => `${e.mtype} ${e.result === "ok" ? "✓" : "✗ " + e.why} (x${e.over} over; calibration ${e.ratio ?? "?"} over ${e.n} fights)`).join(" | ")}`);
	const modes = ev.filter((e) => e.type === "mode_ab");
	if (modes.length) L.push(`mode changes: ${modes.slice(-6).map((e) => `${ago(e.t)} ago → ${e.mode} (${e.why}; split ${fmt_k(e.split)}/h, together ${fmt_k(e.together)}/h)`).join(" | ")}`);
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
	return Math.floor(CFG.spend.share * L.earn - L.spend);
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
function party_holds_level(name, level) {
	const M = state.merchant && fresh(state.merchant) ? [state.merchant] : [];
	return [...partners_any(), ...M].some((p) => (p.bag_lv?.[name] ?? -1) >= level || Object.values(p.worn || {}).some((w) => w?.name === name && (w.level || 0) >= level));
}
function party_holds(name) {
	if (held_any(name) > 0 || (state.bank_gear || []).some((i) => i.name === name)) return true;
	const M = state.merchant && fresh(state.merchant) ? [state.merchant] : [];
	return [...partners_any(), ...M].some((p) => Array.isArray(p.bag_gear) && p.bag_gear.includes(name));
}
function budget_text() {
	const L = party_ledger(), room = gold_room();
	return `gold budget (${CFG.spend.window_h}h, ${L.who.length} chars): earned ${fmt_k(L.earn)}, spent ${fmt_k(L.spend)} (${cats_text(L.cats)})` +
		(room === Infinity ? " — under an hour of records, no limit yet" : room > 0 ? ` — ${fmt_k(room)} left for upgrades/guide buys/compounds/Ponty` : " — optional spending paused (spent ≥ 90% of income)");
}
// Per-hour rates over the last hour (report, heartbeat): a sample of cumulative xp and gold every minute
// adj = gold moved between our own characters (sent: +, received: −), so transfers don't count as earnings/spending
const stats = { xp: 0, adj: 0, samples: [] };
// Send gold to one of our characters and tell it, so both sides leave the transfer out of their gold/h
function send_own_gold(name, g) {
	return T(send_gold(name, g)).then((r) => {
		stats.adj += g;
		log_ev("gold", { to: name, g });
		if (typeof send_cm === "function") Promise.resolve(send_cm([name], { k: "gold", g })).catch(() => {});
		return r;
	});
}
setInterval(() => {
	stats.samples.push({ t: Date.now(), xp: stats.xp, gold: character.gold + stats.adj });
	if (stats.samples.length > 61) stats.samples.shift();
}, 60_000);
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
	mode_ab_tick(d);
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
	const here = character.map === p.map && in_boundary(p.boundary, 300);
	if (!state.session && here && !walking() && !errand_busy() && !state.recovering)
		state.session = { key: pack_key(p), mtype: p.mtype, est: p.est, xp: 0, kx: 0, kc: 0, kc_n: 0, split: split_now(), start: Date.now() };
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
function fire(skill, target, extra) {
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
function choose_target(local_ok, keep_cur = false) {
	const party = party_names();
	let hitting = null, hd = Infinity;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || !e.visible || e.dead || !e.target || !party.has(e.target)) continue;
		if ((state.bad_ids[e.id] || 0) > Date.now()) continue;
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
	let best = null, best_v = 0, best_tier = 2; // tier 0 = the pack's own monster, 1 = anything else
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (!farmable_entity(e) || !valid(e) || (e.target && !party.has(e.target)) || !near_box(e)) continue;
		const f = live_ok(e);
		if (!f) continue;
		const tier = e.mtype === want ? 0 : 1;
		if (tier === 1 && f.ttk * (e.hp / e.max_hp) > CFG.max_ttk_s) continue;
		if (tier > best_tier) continue;
		const walk_s = Math.max(0, distance(character, e) - character.range) / Math.max(character.speed, 1);
		// xp per second of effort (remaining fight + walk + 0.2s turnaround); the current target gets ×1.5 so we
		// finish it instead of flipping between similar targets
		const v = (e.xp || f.xp || 1) / (f.ttk * (e.hp / e.max_hp) + walk_s + 0.2) * (e === cur ? 1.5 : 1);
		if ((tier < best_tier || v > best_v) && can_move_to(e)) (best = e), (best_v = v), (best_tier = tier);
	}
	return best;
}
// A target that loses no HP for 8s in range is ignored for 5 min (immune, healing, invulnerable)
function watch_progress(t) {
	const now = Date.now();
	if (!is_in_range(t)) { if (state.prog && state.prog.id === t.id) state.prog.t = now; return false; }
	if (!state.prog || state.prog.id !== t.id) { state.prog = { id: t.id, hp: t.hp, t: now }; return false; }
	if (t.hp < state.prog.hp) { state.prog.hp = t.hp; state.prog.t = now; return false; }
	if (now - state.prog.t > 8000) {
		state.bad_ids[t.id] = now + 300_000;
		game_log(`No damage on ${t.mtype} in 8s; ignoring it for 5 min`, C.dim);
		state.prog = null;
		change_target(null);
		return true;
	}
	return false;
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
	// straight away from it first, then 30°, 60° and 90° to either side (radians) if walls are in the way
	for (const off of [0, 0.52, -0.52, 1.05, -1.05, 1.57, -1.57]) {
		const p = point_at(t, so.want, off);
		if (can_move_to(p.x, p.y)) { move_to(p.x, p.y, 250); return true; } // kiting may re-steer every 250ms
	}
	return false;
}
function approach(t) {
	const so = standoff(t);
	if (distance(character, t) <= so.reach) return;
	const p = point_at(t, so.want);
	if (can_move_to(p.x, p.y)) move_to(p.x, p.y, 400); // re-steer at most every 400ms while closing in
	else move_to(t.x, t.y, 400); // blocked line: walk straight at it; collision stops us short
}
async function travel(dest) {
	if (walking() || Date.now() < (state.travel_block_until || 0)) return;
	try { await go(dest); } catch (e) {
		// a failing path must not be retried every tick; an interrupted one (we stopped it to fight, or the watchdog did) isn't
		// failing (v24.4: it was blocked 5s too, standing idle after the kill and undoing the watchdog's reset)
		if (!e || e.reason !== "interrupted") {
			game_log("travel: " + why(e)); state.travel_block_until = Date.now() + 5000;
			// v24.8: an unreachable waypoint is skipped (it was retried forever, and each failure counted as activity, so
			// the idle give-up never fired)
			const W = state.waypoints, w = W.length ? W[state.wp % W.length] : null;
			if (w && dest && dest.x === w.x && dest.y === w.y) state.wp = (state.wp + 1) % W.length;
			return;
		}
	}
	state.last_target_at = Date.now();
}
function patrol() {
	if (is_moving(character) || walking() || !state.waypoints.length) return;
	if (distance(character, state.waypoints[state.wp]) < 30) state.wp = (state.wp + 1) % state.waypoints.length; // reached
	const next = state.waypoints[state.wp];
	if (can_move_to(next.x, next.y)) move_to(next.x, next.y, 500); // patrol is low priority: a move per 500ms at most
	else travel({ map: state.pack.map, x: next.x, y: next.y });
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
		((e.target && party.has(e.target)) || (e.mtype === want && !e.target && live_ok(e)))).sort((a, b) => a.hp - b.hp);
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
	if (errand_busy()) return false; // a town walk interrupted would fail (and pause) that errand step
	const attacking_us = !!t.target && party_names().has(t.target);
	if (!attacking_us && state.pack?.boss) return false; // on the way to a boss: only stop for attackers
	if (t.target === character.name && !can_take(t)) return false; // v24.10: outrun it; v24.16: keep walking whatever its speed
	try { stop("smart"); } catch (e) {}
	return true;
}
function fight(t, steer = true) {
	// v24.10: attacked by something we can't take on and slower than us: get away (keep walking, or step away), shooting
	// if we can; stopping to trade hits with it was a death (a dark hound on the way through winterland)
	// v24.16: walking, never stop for it — whatever its speed: the walk goes on (through a door, it's left behind). Stopped,
	// a hawk (charge 52) cornered the party at desertland's cave door and killed Sanala while they face-tanked it
	if (t && t.target === character.name && !can_take(t) && (walking() || (character.speed || 0) > chase_speed(t.mtype))) {
		if (!walking()) step_away(t);
		if (RANGED && can_attack(t)) fire("attack", t);
		return;
	}
	if (get_targeted_monster() !== t) change_target(t);
	if (steer) break_walk_for(t);
	if (steer && !walking() && !kite(t) && !errand_busy()) approach(t);
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
// Own gear: score items by class-weighted stats (CFG.gear_w), wear upgrades from the bags or the account-wide bank,
// and hand spares to party members who'd wear them. Worn scores travel in the heartbeat, so every member can judge
// an item for any other (same formula, same version).
// =====================================================================
const GEAR_SLOTS = ["mainhand", "offhand", "helmet", "chest", "pants", "shoes", "gloves", "amulet", "belt", "cape", "orb",
	"ring1", "ring2", "earring1", "earring2"];
const SLOT_OF = { helmet: ["helmet"], chest: ["chest"], pants: ["pants"], shoes: ["shoes"], gloves: ["gloves"], amulet: ["amulet"],
	belt: ["belt"], cape: ["cape"], orb: ["orb"], ring: ["ring1", "ring2"], earring: ["earring1", "earring2"] };
const OFFHAND_TYPES = new Set(["shield", "quiver", "source", "misc_offhand"]);
const DEF_STATS = new Set(["armor", "resistance", "hp", "vit", "evasion", "avoidance", "reflection", "for"]);
const MAIN_STATS = ["str", "dex", "int"];
// Item stats at its level: the game's own calculator when the runner exposes it, else base + per-level increments
function item_props(item, ctype) {
	const f = typeof calculate_item_properties === "function" ? calculate_item_properties
		: typeof parent !== "undefined" && typeof parent.calculate_item_properties === "function" ? parent.calculate_item_properties : null;
	if (f) try { return f(item, { class: ctype }); } catch (e) {}
	const def = G.items[item.name] || {}, out = {}, lv = item.level || 0, inc = def.upgrade || def.compound || {};
	for (const k in CFG.gear_w) if (typeof def[k] === "number") out[k] = def[k];
	for (const k of MAIN_STATS) if (typeof def[k] === "number") out[k] = def[k];
	for (const k in inc) if (typeof inc[k] === "number") out[k] = (out[k] || 0) + inc[k] * lv;
	return out;
}
// Points per xp stat point for a class (v23.4): its attack (ours, or a partner's from its heartbeat) x fighters x value
function xp_weight(ctype) {
	if (ctype === "merchant") return 0;
	const atk = ctype === character.ctype ? character.attack : partners().find((p) => p.ctype === ctype)?.attack;
	// v24.7: not x party size — +1% xp on one fighter is 1/n of the party's xp, the same as +1% of its own damage (which
	// speeds every member's share); x n made xp gear outscore real armour, and differ on the merchant (party_n 1)
	return CFG.gear_xp_value * (atk || character.attack || 100);
}
function gear_score(item, ctype = character.ctype) {
	if (!item || !G.items[item.name]) return 0;
	const p = { ...item_props(item, ctype) }, W = CFG.gear_w, main = G.classes[ctype]?.main_stat, tank = CFG.gear_tank.includes(ctype);
	// v24.7: the class's own modifiers for this weapon type (server: applied on equip) — a mage's wand +60 frequency,
	// a paladin's sword -5 output — weren't counted, so the staff scored above the faster wand
	const d = G.items[item.name], cls = G.classes[ctype];
	if (d?.type === "weapon" && cls) for (const [k, v] of Object.entries(cls.doublehand?.[d.wtype] || cls.mainhand?.[d.wtype] || {})) if (typeof v === "number") p[k] = (p[k] || 0) + v;
	let s = 0;
	for (const k in p) {
		if (!p[k] || typeof p[k] !== "number") continue;
		// paladin attack = item attack x (str/20 + int/40) (server): int is worth half of str to it, not an off-stat
		let w = MAIN_STATS.includes(k) ? (k === main ? W.main_stat : ctype === "paladin" && k === "int" ? W.main_stat / 2 : W.off_stat) : k === "xp" ? xp_weight(ctype) : W[k];
		if (!w) continue;
		if (tank && DEF_STATS.has(k)) w *= CFG.gear_tank_mult;
		s += p[k] * w;
	}
	return Math.round(s * 10) / 10;
}
// What a member (us, or a partner from its heartbeat) wears: slot -> score; slots the guide owns right now count as
// unbeatable (1e9); dh = mainhand is two-handed, off = offhand occupied
let my_gear_cache = null; // { at, key, g }: bag_plan judges every bag item against it, so memo it for 1s
// Does the guide have a live (not paused) gear step for this slot? Row ids are "kind:slot:item:level:stat".
function guide_plans_slot(slot) {
	return (state.guide?.rows || []).some((r) => CFG.gear_actions.includes(r.kind) && !skipped(r.id) &&
		(r.action?.slot || String(r.id || "").split(":")[1]) === slot);
}
function my_gear() {
	const now = Date.now(), sl = character.slots || {};
	const owned = (s) => now - (state.guide_equip[s] || 0) < CFG.gear_guide_respect_h * 3600_000 && guide_plans_slot(s);
	const key = GEAR_SLOTS.map((s) => (sl[s] ? sl[s].name + (sl[s].level || 0) : "") + (owned(s) ? "!" : "")).join();
	if (my_gear_cache && now - my_gear_cache.at < 1000 && my_gear_cache.key === key) return my_gear_cache.g;
	const w = {}, own = {};
	for (const s of GEAR_SLOTS) { w[s] = gear_score(sl[s]); if (owned(s)) own[s] = true; }
	const mh = sl.mainhand && G.items[sl.mainhand.name];
	const g = { w, own, dh: !!(mh && G.classes[character.ctype]?.doublehand?.[mh.wtype]), off: !!sl.offhand };
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
	const score = gear_score(item, ctype);
	let best = null;
	for (const s of slots_for(item.name, ctype, g)) {
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
	const needed = needed_slots(), g = my_gear(), M_ = is_merchant();
	const fighters = M_ ? gear_takers().slice(1).filter((m) => m.ctype !== "merchant") : [];
	const for_fighter = (it) => fighters.some((m) => gear_gain(it, m.ctype, m.g));
	let best = null;
	character.items.forEach((it, k) => {
		if (!it || equip_paused(it) || (M_ && (!CFG.merchant.wear_gear || needed.has(k) || for_fighter(it)))) return;
		const r = gear_gain(it, character.ctype, g);
		// a copy the guide holds as an upgrade/compound input is worn only when clearly better (v20.0)
		if (r && needed.has(k) && r.gain < (g.w[r.slot] || 0) * CFG.gear_input_gain) return;
		if (r && (!best || r.gain > best.gain)) best = { ...r, k, it };
	});
	// (c) wearing a two-hander: a one-hander + offhand from the bags may beat it together (the offhand goes on next)
	if (!best && g.dh) {
		let one = null, off = null;
		character.items.forEach((it, k) => {
			if (!it || equip_paused(it) || needed.has(k) || (M_ && (!CFG.merchant.wear_gear || for_fighter(it)))) return;
			const d = G.items[it.name], cls = G.classes[character.ctype] || {};
			if (!d) return;
			const sc = gear_score(it);
			if (d.type === "weapon" && cls.mainhand?.[d.wtype] && !is_2h(it.name, character.ctype) && (!one || sc > one.sc)) one = { k, it, sc };
			if (OFFHAND_TYPES.has(d.type) && cls.offhand?.[d.type] && (!off || sc > off.sc)) off = { k, it, sc };
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
// v19.7/v20.0: a worn piece of ours that's an upgrade for a member near: take it off and send it. The member wears it
// (equip_upgrades), its old piece drops into its bags and share_gear sends it back (our slot is empty), and we wear
// that. The receiver gains by the usual margins; we may lose up to gear_swap_loss of its gain (the party total goes
// up). The member with the alphabetically first name starts, so the two don't both send at once.
let swap_at = 0;
async function swap_worn() {
	if (!CFG.gear_auto || gear_busy || character.rip || is_merchant() || errand_busy() || typeof send_item !== "function" || typeof unequip !== "function") return false;
	if (Date.now() - swap_at < 60_000 || character.esize < 1) return false;
	const mine = my_gear(), sl = character.slots || {};
	for (const p of partners_near(CFG.gear_share_range)) {
		if (!p.worn || !p.gear?.w || (p.esize ?? 1) < 1) continue;
		for (const s of GEAR_SLOTS) {
			// v24.7: weapons/offhands too (priest and mage share staves, sources, misc offhands) — but no two-handers (the
			// offhand would have to come off first)
			const X = sl[s], Y = p.worn[s];
			if ((s === "mainhand" || s === "offhand") && X && Y && (is_2h(X.name, p.ctype) || is_2h(Y.name, character.ctype) || is_2h(X.name, character.ctype) || is_2h(Y.name, p.ctype))) continue;
			// v24.5: their piece must be free too (a locked one would stay in their bags and ours would be lost to them)
			if (!X || !Y || X.l || X.b || Y.l || (X.name === Y.name && (X.level || 0) === Y.level)) continue;
			if (!slots_for(Y.name, character.ctype, mine).includes(s) || !slots_for(X.name, p.ctype, p.gear).includes(s)) continue;
			const ours = gear_score(Y) - (mine.w[s] || 0), theirs = gear_score(X, p.ctype) - (p.gear.w[s] || 0);
			const ok = (gain, cur) => gain >= CFG.gear_min_gain && gain >= cur * CFG.gear_margin;
			// the receiver must gain by the usual margins; we may lose up to gear_swap_loss of that, so the party gains
			if (!ok(theirs, p.gear.w[s] || 0) || ours < -theirs * CFG.gear_swap_loss || !(ours + theirs >= 2 * CFG.gear_min_gain)) continue;
			// v24.7: the giver is whoever's partner gains (it equips what it's sent); when both gain, the earlier name gives.
			// Only the earlier name started before, checking only the other's gain: a swap where it should receive never ran
			if (character.name > p.name && ok(ours, mine.w[s] || 0)) continue;
			swap_at = Date.now();
			gear_busy = true;
			try {
				await T(unequip(s));
				const k = character.items.findIndex((i) => i && i.name === X.name && (i.level || 0) === (X.level || 0) && !i.l);
				if (k < 0) return false;
				await T(send_item(p.name, k, 1));
				game_log(`gear: swap — gave our ${s} ${X.name}+${X.level || 0} to ${p.name} (+${Math.round(theirs)} for it), its ${Y.name}+${Y.level} comes back (+${Math.round(ours)} for us)`, C.ok);
				log_ev("gear_swap", { with: p.name, slot: s, gave: `${X.name}+${X.level || 0}`, get: `${Y.name}+${Y.level}` });
				return true;
			} catch (e) { game_log(`gear: swap with ${p.name}: ${why(e)}`, C.dim); return false; } finally { gear_busy = false; }
		}
	}
	return false;
}
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
	return !!def?.compound && !it.l && !it.b && !it.p && !needed.has(k) && (it.level || 0) < cmp_top(it.name) &&
		!CFG.keep.includes(it.name) && !gear_wanted_by(it);
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
		const floor = shop_for(g.name) && !G.items[g.name]?.cash && 3 * (G.items[g.name]?.g || 0) * Math.pow(3, g.level) <= CFG.rebuy_loss_max
			? CFG.compound_min_chance_rebuyable : CFG.compound_min_chance;
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
function pick_upgrade() {
	const room = gold_room(), gold = Math.min(upgrade_gold(), room), budget = gold * CFG.upgrade_spend, H = CFG.upgrade_high;
	if (!CFG.upgrade_auto || budget <= 0) return null;
	const takers = gear_takers().filter((m) => m.ctype !== "merchant");
	let best = null;
	for (const name in G.items) {
		const def = G.items[name];
		if (!def.upgrade || !GEAR.has(def.type) || def.cash || skipped("upg:" + name) || CFG.quest_craft_skip.includes(name)) continue;
		// normal target (scroll0/1 levels) and, for weapon slots, the high target (scroll2 levels too)
		const targets = [[upgrade_target(name), budget, false]];
		if (H?.enabled) targets.push([upgrade_target(name, true), gold * H.spend, true]);
		const capL = upg_cap_level(name);
		for (let [to, cap, high] of targets) {
			if (to > capL) to = capL; // v24.5: no higher than a past project of it reached before its odds/failures stopped it
			if (!to) continue;
			const cost = upgrade_cost(name, to);
			if (cost > cap) continue;
			// a copy at the target level already exists: ours, the bank's, or (v23.2) in another member's bags or worn
			if (best_level_held(name) >= to || (state.bank_gear || []).some((i) => i.name === name && (i.level || 0) >= to) || party_holds_level(name, to)) continue;
			// v24.7: a lower copy that's already an upgrade for a fighter is delivered first (then judged against): a project
			// held it as its input, undelivered, and rolled it at 50% odds
			const ready = (i) => i && i.name === name && !i.l && (i.level || 0) < to && takers.some((m) => gear_gain(i, m.ctype, m.g));
			if (character.items.some(ready) || (state.bank_gear || []).some(ready)) continue;
			for (const m of takers) {
				const r = gear_gain({ name, level: to }, m.ctype, m.g);
				if (!r || (high && !H.slots.includes(r.slot))) continue;
				const v = r.gain / cost;
				if (!best || v > best.v) best = { name, to, for: m.name, slot: r.slot, gain: Math.round(r.gain), cost, v, high };
			}
		}
	}
	return best && shop_for(best.name) ? best : null; // shop_for is the slow check: only for the winner
}
// Is there upgrade work for a town run? Picks a project (every 10 min at most) when there's none.
function upgrade_due() {
	if (!CFG.upgrade_auto) return false;
	if (merchant_does_it()) {
		// v21.2: the merchant runs projects now; a fighter's own one would sit forever, holding its copies in the bags
		if (state.upg && !is_merchant()) { game_log(`upgrade project ${state.upg.name} handed to the merchant`, C.dim); state.upg = null; }
		return false;
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
	for (let i = 0; i < CFG.upgrade_steps_per_run; i++) {
		if (state.errand) state.errand_at = Date.now();
		const P = state.upg;
		if (!P) break;
		const top = best_level_held(P.name);
		if (top >= P.to) {
			game_log(`upgrade project done: ${P.name}+${top} for ${P.for}`, C.ok);
			state.upg = null;
			break;
		}
		const step = (G.items[upgrade_scroll(P.name, Math.max(0, top))]?.g || 0) + (top < 0 ? G.items[P.name]?.g || 0 : 0);
		// over the party's gold budget: don't ask the fighters for gold we then couldn't spend (v19.6)
		if (step > gold_room()) { town_reason.upgrade = `gold budget: next step ${fmt_k(step)}, room ${fmt_k(Math.max(0, gold_room()))}`; break; }
		// the merchant asks for funding when the next step (scroll, and a copy if none is held) is beyond its gold
		if (is_merchant() && character.gold - CFG.merchant.donate.keep < step) {
			state.fund_need = Math.min(P.cost, step * 3);
			game_log(`upgrade ${P.name}: waiting for ${fmt_k(state.fund_need)} gold from the fighters`, C.dim);
			break;
		}
		if (!gold_ok(step)) { town_reason.upgrade = `gold budget: next step ${fmt_k(step)}, room ${fmt_k(Math.max(0, gold_room()))}`; break; }
		state.fund_need = 0;
		// v23.1: the gold the project's steps cost (copy + scrolls), counted per step — measuring from total gold let loot,
		// sales, potion buys and the fighters' funding move it
		if (P.spent === undefined) P.spent = 0;
		P.max = Math.max(P.max ?? -1, top); // v24.7: the highest level this project reached (a failure destroys the copy)
		if (P.spent > P.cost * CFG.upgrade_abort_x) {
			upg_cap(P.name, Math.max(0, P.max));
			skip("upg:" + P.name, 24 * 3600_000, "over budget");
			game_log(`upgrade ${P.name}: failures pushed the cost past ${CFG.upgrade_abort_x}x the estimate; stopped${top >= 1 ? ` at +${top}` : ""}`, C.bad);
			state.upg = null;
			break;
		}
		const g0 = character.gold;
		try {
			await run_upgrade({ name: P.name }, { request: { name: P.name, level: P.to } });
			P.spent += Math.max(0, g0 - character.gold);
			n++;
		} catch (e) {
			P.spent += Math.max(0, g0 - character.gold);
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
function is_junk(item) {
	if (!item || item.l || item.b || CFG.keep.includes(item.name) || needed_slots().has(character.items.indexOf(item))) return false;
	if (CFG.sell.includes(item.name)) return true;
	const def = G.items[item.name];
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
	if (item.l || item.b || !def || CFG.keep.includes(item.name) || BAG_TYPES.has(def.type) ||
		item.name === CFG.hp_pot || item.name === CFG.mp_pot || needed.has(character.items.indexOf(item)) ||
		(Date.now() - (state.fetched[item.name] || 0) < 3600_000 && !(def.compound && (merchant_does_it() || is_merchant()))) ||
		(Date.now() - (state.fetched[item.name] || 0) < 7200_000 && GEAR.has(def.type) && !equip_paused(item) && self_taker_ok() && gear_gain(item, character.ctype, my_gear())) ||
		(GEAR.has(def.type) && wanted_by_member(item))) return "keep"; // fetched within the hour (except compound copies the merchant handles), or an upgrade for one of us (v19.7)
	// bank purge (v24.7: after the keep rules, by the exact copy — a purge of a plain helmet+3 sold the project's helmet+3,
	// and a titled copy fetched for a fighter)
	if (is_merchant() && Date.now() - (state.purge[purge_key(item)] || 0) < 86_400_000) return "sell";
	if (is_merchant() && CFG.merchant.sell_dead_compounds && dead_compound(item)) return "sell"; // v24.15
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
	if (needed.has(k)) return state.upg && item.name === state.upg.name ? "upgrade" : "guide/quest";
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
	if (is_merchant()) for (const n of Object.keys(CFG.hold || {})) {
		const cur = CFG.hold[n];
		if (partners().some((f) => (f.need || []).includes(n)) && (state.bank_seen[cur] || 0) > 0 && held_any(cur) === 0 &&
			Date.now() - (state.fetch_try["give:" + cur] || 0) > 1_800_000) fetch.push({ name: cur, key: "give:" + cur });
	}
	for (const n of hold_missing()) if (state.bank_seen[n] > 0 && Date.now() - (state.fetch_try["hold:" + n] || 0) > 1_800_000) fetch.push({ name: n, key: "hold:" + n });
	const bx = CFG.elixir_auto && character.ctype !== "merchant" && !elixir_active() && !best_elixir() && bank_elixir();
	if (bx) fetch.push({ name: bx.name, key: "elixir:" + bx.name });
	if (is_merchant() && CFG.merchant.stand?.enabled) {
		const free = TRADE_SLOTS.length - Object.keys(state.stand).length - stand_hold().size, nd = new Set(), cm = new Set();
		for (const it of (state.bank_gear || []).filter((i) => stand_worthy(i, -1, nd, cm)).slice(0, Math.max(0, Math.min(free, character.esize - 6))))
			fetch.push({ name: it.name, level: it.level, key: `stand:${it.name}:${it.level}` });
	}
	for (const u of [...bank_upgrades(), ...compound_fetches(compound_groups())])
		if (Date.now() - (state.fetch_try[u.key] || 0) > (u.key.startsWith("cmp:") ? 600_000 : 2 * 3600_000)) fetch.push(u);
	// v24.15: dead compound pieces in the bank come out to be sold (they'd sit there until a purge)
	if (is_merchant() && CFG.merchant.sell_dead_compounds) {
		let room = Math.max(0, character.esize - 8);
		for (const it of state.bank_gear || []) {
			if (room <= 0) break;
			const key = `dead:${it.name}:${it.level || 0}`;
			if (!dead_compound(it) || Date.now() - (state.fetch_try[key] || 0) < 600_000) continue;
			fetch.push({ name: it.name, level: it.level || 0, key }); room--;
		}
	}
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
	state.bank_gear = gear;
	state.bank_at = Date.now();
	state.bank_by = character.name;
	const h = JSON.stringify([seen, gear.map((i) => i.name + i.level)]);
	if (h !== bank_hash && Date.now() - bank_sent_at > 60_000 && typeof send_cm === "function") {
		bank_hash = h; bank_sent_at = Date.now();
		const to = party_names_all().filter((n) => n !== character.name);
		if (to.length) Promise.resolve(send_cm(to, { k: "bank", at: state.bank_at, seen, gear, free: state.bank_free })).catch(() => {});
	}
}
// Another character's bank snapshot: adopt it if it's newer than ours
function adopt_bank(m) {
	const b = m.message;
	if (!(b.at > (state.bank_at || 0)) || !b.seen || !Array.isArray(b.gear)) return;
	Object.assign(state, { bank_seen: b.seen, bank_gear: b.gear, bank_at: b.at, bank_by: m.name });
	if (b.free) state.bank_free = b.free;
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
		game_log(`Bank full (floors: ${unlocked_floors.join(", ")}): selling plain +0 junk until there's room.` +
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
const drop_rate = (mt, item) => (drop_sources(item).find(([m]) => m === mt) || [, 0])[1];
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
// Farm the quickest missing drop of the first open quest recipe (guide quests: no time/xp limits)
function quest_directive(guide_only) {
	if (!CFG.quest_farm || !CFG.quest_crafts) return null;
	for (const id of quest_recipes()) {
		const r = G.craft[id], guided = is_guide_quest(id);
		if (guided !== !!guide_only || !recipe_open(id)) continue;
		const missing = r.items.filter(([q, n, l]) => owned_in_bags_or_bank(n, l) < q);
		if (!missing.length || missing.some(([, n, l]) => l || GEAR.has(G.items[n]?.type))) continue;
		let total_s = 0, pickm = null;
		for (const [q, n, l] of missing) {
			const src = best_source(n);
			if (!src || !(src.ips > 0)) { total_s = Infinity; break; }
			const have = owned_in_bags_or_bank(n, l), secs = (q - have) / src.ips;
			total_s += secs;
			if (!pickm || secs < pickm.secs) pickm = { ...src, secs, item: n, have, need: q };
		}
		if (!pickm || (!guided && total_s > CFG.quest_farm_max_h * 3600)) continue;
		const f = fight_profile(pickm.monster);
		// xp/s at that pack (items/s ÷ chance per kill = kills/s; × xp per kill); 1e-9 avoids dividing by zero
		const qxp = meas_aged(pack_key(pickm), f ? f.xp * pickm.ips * party_n() / Math.max(1e-9, drop_rate(pickm.monster, pickm.item)) : 0);
		const bk = best_known_xps();
		if (!guided && bk > 0 && qxp < CFG.quest_farm_min_xp * bk) continue;
		const sk = id + ":" + pickm.item, now = Date.now();
		if (!state.qprog || state.qprog.key !== sk || pickm.have > state.qprog.have) state.qprog = { key: sk, have: pickm.have, t: now };
		else if (now - state.qprog.t > Math.max(CFG.quest_stall_min * 60_000, 3000 / Math.max(pickm.ips, 1e-9))) { // or 3 expected drops' time
			skip("qc:" + id, CFG.quest_shelve_h * 3600_000);
			game_log(`quest: no ${pickm.item} in ${CFG.quest_stall_min} min at ${pickm.monster}; retrying ${id} in ${CFG.quest_shelve_h}h`, C.bad);
			state.qprog = null;
			continue;
		}
		return { monster: pickm.monster, map: pickm.map, boundary: pickm.boundary, count: pickm.count, guide_safe: false,
			reason: `${guided ? "guide quest " : ""}${id}: ${pickm.item} ${pickm.have}/${pickm.need}, ~${Math.ceil(total_s / 60)} min` };
	}
	return null;
}
// Material count for a recipe: bags at that level, plus the bank's last-seen count for +0 materials
const owned_in_bags_or_bank = (n, l) => held(n, l) + (l ? 0 : bank_share(n));
// Our share of the bank's copies of a quest material (v23.1). The bank is account-wide and every fighter runs the same
// own quests, so each used to count all of it toward its own copy. Copies go to the fighters short of the item (bags
// vs what they need; each one's shortfall comes in its heartbeat) in name order, so all agree. The merchant counts all.
const qshort = () => { const o = {}; for (const [n, q] of state.needs) if (G.items[n]?.s) { const v = q - held_any(n); if (v > 0) o[n] = v; } return o; };
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
// v24.3: our own pick's best counts only if it was made in the mode we're in now, in the last 10 min. A follower never
// picks, so it kept the solo best of its last split-mode pick and judged party-rate side goals against it (a hunt at
// 28% of the party's best passed). Otherwise: the best spot for how we fight now, computed (cached 60s).
const best_known_xps = () => {
	const now = Date.now(), solo = solo_now();
	if (state.best_score > 0 && state.best_solo === solo && now - (state.best_at || 0) < 600_000) return state.best_score;
	const c = state.best_ref;
	if (c && c.solo === solo && now - c.at < 60_000) return c.v;
	const v = best_score_for(solo) || Math.max(0, ...Object.values(meas() || {}).filter(Number.isFinite));
	state.best_ref = { solo, at: now, v };
	return v;
};
function hunt_feasible(h) {
	if (!h || !(h.c > 0)) return false;
	// v18.7: a low-end monster (under hunt_min_xp of the best we know) doesn't trap the party; kills there still count
	const best = best_known_xps();
	if (CFG.hunt_min_xp > 0 && best > 0 && mt_xps(h.id) < CFG.hunt_min_xp * best) return false;
	if (!(h.ms > 0)) return true; // no expiry known
	// party kills count wherever they happen (server: monster_hunt_logic for every member): while split, the members
	// farming that monster anywhere; together, the members near
	// v24.3: together, kills_per_s is already the party's rate (party table, or an estimate with the members near); adding
	// 0.6 per member near counted them twice and kept hunts that needed twice the real kill rate
	const helpers = split_now() ? partners().filter((p) => p.pack?.mtype === h.id).length : 0;
	const kps = kills_per_s(h.id) * (1 + 0.6 * helpers);
	return kps > 0 && h.c / kps * 1000 <= h.ms * 0.9;
}
function hunt_directive() {
	const h = character.s.monsterhunt;
	if (!CFG.auto_monster_hunt || !h || !(h.c > 0) || !fight_profile(h.id) || !hunt_feasible(h)) return null;
	const best = resolve_area(h.id);
	return best && { monster: h.id, ...best, reason: `monster hunt ${h.c} left`, guide_safe: false };
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
// Leader: merge every online member's goal list. Mutual goals first: a monster on the lists of 2+ members, each with a
// goal there finishing within mutual_max_h; ranked by combined weight ÷ (1 + the slowest of those goals' hours), so
// goals shared by more members and quicker ones win. With nothing in common, members take turn_min-minute turns
// (us, then the others in name order) with their top goal. Only monsters the group can fight are considered.
function pick_shared(mine) {
	const now = Date.now(), me = character.name;
	const members = [{ name: me, goals: goals_list() }, ...partners().map((p) => ({ name: p.name, goals: [...(p.goals || [])] }))];
	const by = new Map(); // monster -> { w: {member: weight}, eta: {member: hours}, src, why, too_slow }
	for (const m of members) for (const g of m.goals) {
		const e = by.get(g.monster) || { monster: g.monster, w: {}, eta: {}, src: null, why: [], too_slow: [] };
		by.set(g.monster, e);
		const eh = g.eta_h ?? 0; // guide rows and older members: no estimate → treat as feasible
		if (eh > CFG.party.mutual_max_h) { e.too_slow.push(`${m.name}: ${g.reason} ~${Math.round(eh)}h`); continue; }
		e.w[m.name] = Math.max(e.w[m.name] || 0, g.w);
		e.eta[m.name] = Math.min(e.eta[m.name] ?? Infinity, eh);
		if (!e.src && valid_boundary(g.boundary)) e.src = g;
		e.why.push(`${m.name}: ${g.reason}${g.eta_h ? ` ~${g.eta_h}h` : ""}`);
	}
	const ok = (e) => G.monsters[e.monster] && (fight_profile(e.monster) || (e.src?.guide_safe && farmable_type(e.monster)));
	const names = (e) => Object.keys(e.w);
	const hours = (e) => Math.max(...names(e).map((n) => e.eta[n]));
	const weight = (e) => names(e).reduce((t, n) => t + e.w[n], 0);
	const to_dir = (e, label) => {
		const area = e.src ? resolve_area(e.monster, e.src.map, e.src.boundary, e.src.count) : resolve_area(e.monster);
		return area && { monster: e.monster, ...area, reason: label, guide_safe: !!e.src?.guide_safe, for_partner: !e.w[me], mutual: names(e).length > 1 };
	};
	const cands = [...by.values()].filter((e) => names(e).length && ok(e));
	// mutual only when the combined weight reaches a hunt's: two guide-farm rows (1+1) don't override members' hunts
	// an hour of walking counts as travel.weight_h hours of goal time: a near shared goal beats an equal far one
	const walk_h = (e) => { if (e.walk_h === undefined) { const a = e.src ? resolve_area(e.monster, e.src.map, e.src.boundary, e.src.count) : resolve_area(e.monster); e.walk_h = a ? travel_s(a.map, a.boundary) / 3600 : 0; } return e.walk_h; };
	const rank = (e) => weight(e) / (1 + hours(e) + walk_h(e) * CFG.travel.weight_h);
	const mutual = cands.filter((e) => names(e).length >= 2 && weight(e) >= CFG.goal_w.hunt).sort((a, b) => rank(b) - rank(a));
	state.shared = { mutual: mutual.map((e) => `${e.monster} ~${hours(e).toFixed(1)}h (${e.why.join("; ")})`),
		too_slow: [...by.values()].flatMap((e) => e.too_slow.map((w) => `${e.monster}: ${w}`)), at: now };
	if (mutual.length) return to_dir(mutual[0], `mutual: ${[...new Set(mutual[0].why)].slice(0, 3).join(" + ")}`);
	// nothing in common: turns, rotating through members that have a goal the group can fight
	const top = (n) => cands.filter((e) => e.w[n]).sort((a, b) => b.w[n] - a.w[n])[0];
	const order = [me, ...partners().map((p) => p.name).sort()].filter((n) => (n === me ? mine : top(n)));
	if (!order.length) return mine;
	// a turn's turn_min counts from arrival at its target (walking there isn't the turn), capped by turn_walk_max_min
	const d0 = state.directive;
	if (state.turn && !state.turn.arrived && d0 && d0.map === character.map && valid_boundary(d0.boundary) &&
		in_rect(character.x, character.y, [d0.boundary[0] - 200, d0.boundary[1] - 200, d0.boundary[2] + 200, d0.boundary[3] + 200])) {
		state.turn.arrived = now;
		state.turn.end = Math.min(state.turn.end, now + CFG.party.turn_min * 60_000);
	}
	if (!state.turn || now > state.turn.end || !order.includes(state.turn.who)) {
		const i = state.turn ? order.indexOf(state.turn.who) : -1;
		state.turn = { who: order[(i + 1) % order.length], end: now + (CFG.party.turn_min + CFG.travel.turn_walk_max_min) * 60_000 };
	}
	if (state.turn.who === me) return mine;
	const t = top(state.turn.who);
	return to_dir(t, `${state.turn.who}: ${t.why.find((w) => w.startsWith(state.turn.who + ":"))?.slice(state.turn.who.length + 2) || t.monster}`);
}
// Visit Daisy when we have no hunt or a finished one (h.c = kills left)
const hunt_due = () => {
	const h = character.s.monsterhunt;
	return CFG.auto_monster_hunt && character.ctype !== "merchant" && (!h || h.c === 0) && !skipped("hunt:auto");
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
// team "all" (v23.1, the default): every online member counts wherever it is — a boss target regroups the party
// (split_decide), so judging it only with whoever happens to be near (nobody, while split) skipped bosses the party
// could take. boss_tick only engages once it's safe with the members actually there (team false).
function boss_safe(name, team = "all") {
	const m = G.monsters[name];
	const f = m && fight_math({ ...m, hp: 1, "1hp": false }, true, team); // their side of the fight only
	if (!f) return false;
	if ((f.their_dps + f.self_dps) * CFG.boss.tank_s > f.hp_pool * safety_now(f) * heal_mult(f)) return false;
	const squish = Math.min(character.max_hp, ...(team === "all" ? partners() : partners_near()).map((p) => p.max_hp || Infinity));
	return f.their_dps / (m.frequency || 1) <= squish * CFG.boss.one_hit;
}
// The live boss we'd join (highest xp), from the server's event list
function live_boss() {
	if (!CFG.boss?.enabled || character.ctype === "merchant") return null;
	const S_ = (typeof parent !== "undefined" && parent.S) || {};
	let best = null;
	for (const name in S_) {
		const e = S_[name], m = G.monsters[name];
		if (!e || e.live !== true || !m || !e.map || !Number.isFinite(e.x) || !G.maps[e.map] || !map_ok(e.map) || CFG.boss.skip.includes(name)) continue;
		if (!boss_safe(name)) continue;
		if (!best || (m.xp || 0) > (G.monsters[best.name].xp || 0)) best = { name, map: e.map, x: e.x, y: e.y, hp: e.hp, max_hp: e.max_hp };
	}
	return best;
}
// Boundary on a 400px grid around the boss, so its wandering doesn't make a new "pack" every refresh
function boss_directive() {
	const b = live_boss();
	if (!b) return null;
	const gx = Math.round(b.x / 400) * 400, gy = Math.round(b.y / 400) * 400;
	return { monster: b.name, map: b.map, boundary: [gx - 300, gy - 300, gx + 300, gy + 300], count: 1, boss: true, guide_safe: false,
		reason: `event boss ${G.monsters[b.name].name || b.name} (${b.hp}/${b.max_hp})` };
}
// Leader/solo at a boss pack: fight it when in view, else walk to its last reported position
function boss_tick(pack) {
	const e = Object.values(parent.entities || {}).find((x) => x.type === "monster" && x.mtype === pack.mtype && x.visible && !x.dead);
	// v24.4: something else hitting us on the way (or while we wait for the party) gets fought; we used to walk or stand
	// there taking hits until flee HP
	const hit = !e || !e.target ? choose_target(false) : null;
	if (hit && hit.mtype !== pack.mtype && hit.target === character.name) { state.last_target_at = Date.now(); fight(hit, true); return true; }
	if (e && !e.target && !boss_safe(pack.mtype, false)) { // judged with the whole party: wait for it before engaging
		state.last_target_at = Date.now();
		set_message(`BOSS ${pack.mtype}: waiting for the party (${partners_near().length}/${partners().length} here)`);
		return true;
	}
	if (e) {
		state.last_target_at = Date.now();
		fight(e, true);
		set_message(`BOSS ${pack.mtype} ${e.hp}/${e.max_hp} | ${character.esize} free`);
		return true;
	}
	const b = parent.S?.[pack.mtype];
	if (!b || b.live !== true) { state.last_pick = 0; return false; }
	if (!walking() && !errand_busy()) travel({ map: b.map, x: b.x, y: b.y });
	set_message(`→ BOSS ${pack.mtype} @ ${b.map}`);
	return true;
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
// The event to be at: live in the server's event list, and safe for us (its safe_from monster passes fight_math)
function event_live() {
	if (is_merchant() || character.rip) return null;
	for (const name in CFG.events || {}) {
		const ev = CFG.events[name];
		if (!ev.on || !ev_info(name)) continue;
		const sf = ev.safe_from && G.monsters[ev.safe_from];
		if (sf && !safe_enough(fight_math(sf), ev.safe_from)) continue;
		return name;
	}
	return null;
}
// Are we at the event? goobrawl: on its map; others: within 800px of the event's reported position
function event_here(name) {
	const ev = CFG.events[name], e = ev_info(name);
	if (ev.map) return character.map === ev.map;
	return !!e && e.map === character.map && Number.isFinite(e.x) && Math.hypot(e.x - character.x, e.y - character.y) < 800;
}
let event_join_at = 0, event_logged = null;
// Leader and followers alike: join, then fight the event's monsters (they're cooperative, which normal targeting
// skips). Leaving: off the event map once it's over. Returns true when it took the tick.
function event_tick() {
	const name = event_live(), now = Date.now();
	if (!name) {
		event_logged = null;
		if (character.map === "goobrawl" && !walking() && !errand_busy()) { travel({ map: "main" }); return true; } // event over
		return false;
	}
	if (errand_busy() || state.recovering) return false;
	const ev = CFG.events[name];
	if (event_logged !== name) { event_logged = name; log_ev("event", { name }); game_log(`event: ${name} — joining`, C.info); }
	if (!event_here(name)) {
		if (now - event_join_at > 20_000 && typeof join === "function") {
			event_join_at = now;
			if (walking()) try { stop("smart"); } catch (e) {}
			Promise.resolve(join(name)).catch((e) => game_log(`event ${name}: ${why(e)}`, C.dim));
		}
		set_message(`→ event ${name}`);
		return true;
	}
	const party = party_names();
	const ok = (e) => e.type === "monster" && valid(e) && (ev.targets.includes(e.mtype) || (e.mtype === ev.extra && boss_safe(ev.extra)));
	const t = Object.values(parent.entities || {}).filter(ok)
		.sort((a, b) => (party.has(b.target) ? 1 : 0) - (party.has(a.target) ? 1 : 0) || distance(character, a) - distance(character, b))[0];
	if (t) {
		state.last_target_at = now;
		fight(t, true);
		set_message(`event ${name}: ${t.mtype} ${t.hp}/${t.max_hp}`);
	} else {
		const e = ev_info(name);
		if (!walking() && Number.isFinite(e?.x) && e.map === character.map) move_to(e.x, e.y, 1000);
		set_message(`event ${name}: waiting for spawns`);
	}
	return true;
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
// Decide the farm directive: hunt > own quests > guide quests > guide farm row (CFG.goal_w order).
// A guide farm row pauses (quest_shelve_h) when its material stops rising for quest_stall_min, or after
// guide_farm_max_min if it names no material. A party leader then merges both members' goals (pick_shared).
// The directive lasts 4 guide intervals (60s) unless refreshed, so a stale one expires on its own.
function refresh_directive() {
	const now = Date.now();
	let g = live_guide_farm();
	if (g) {
		const gk = `${g.monster}:${g.map}`, have = g.item ? held(g.item) : 0;
		if (!state.gprog || state.gprog.key !== gk || have > state.gprog.have) state.gprog = { key: gk, have, t: now };
		else {
			const limit = (g.item ? CFG.quest_stall_min : CFG.guide_farm_max_min) * 60_000;
			if (now - state.gprog.t > limit) {
				state.guide_ignore[gk] = now + CFG.quest_shelve_h * 3600_000;
				game_log(`guide: ${g.item ? "no " + g.item + " from" : "no end to"} ${g.monster} in ${Math.round(limit / 60_000)} min; pausing that row ${CFG.quest_shelve_h}h`, C.bad);
				state.gprog = null;
				g = null;
			}
		}
	}
	const gq = () => quest_directive(true), oq = () => quest_directive(false);
	let mine = null;
	// v21.3: farming alone while split, guide quest materials and guide farm rows (weights 2 and 1, below a hunt's 4)
	// don't pick the spot — the same rule that keeps them from being "mutual" when together
	const chain = split_now() ? [boss_directive, hunt_directive, oq] : [boss_directive, hunt_directive, oq, gq, () => g];
	for (const f of chain) if (!mine) mine = f();
	// v22.1: while split, one fighter per hunt/quest monster is enough — every party kill counts for every member's hunt
	// and chest items go to a random member wherever they are (server). The partner with the earlier name keeps it;
	// the rest pick the best-xp spot (a boss still gathers everyone).
	const dup = (p) => p.name < character.name && !p.follows && p.pack?.mtype === mine.monster;
	if (mine && !mine.boss && split_now() && partners().some(dup)) {
		state.dir_dup = { monster: mine.monster, by: partners().find(dup).name, at: now };
		mine = null;
	} else state.dir_dup = null;
	// A follower never picks where to fight, so the leader works both members' goals: mutual ones first, otherwise
	// turns (pick_shared).
	let d = mine;
	if (partners().length && in_party_cfg() && !is_follower() && !mine?.boss && !split_now()) d = pick_shared(mine) || mine; // a boss beats every goal; split: own goals
	// commitment: don't turn around on the way to (or right after reaching) a target because the goal ranking shifted
	const cur = state.directive, L = state.dir_lock;
	// a finished goal ends the commitment: the held monster must still be on someone's goal list
	const still_goal = (mt) => goals_list().some((g) => g.monster === mt) || partners().some((p) => (p.goals || []).some((g) => g.monster === mt));
	if (CFG.travel.commit_min > 0 && cur && d && !d.boss && !cur.boss && L && now < L.until && L.monster === cur.monster && (d.monster !== cur.monster || d.map !== cur.map) && still_goal(cur.monster) &&
		(state.safe[cur.monster] !== undefined ? !!state.safe[cur.monster] : !!fight_profile(cur.monster))) {
		if (!state.dir_held || state.dir_held.monster !== d.monster) state.dir_held = { monster: d.monster, reason: d.reason, at: now };
		d = cur;
	} else state.dir_held = null;
	if (d && (!cur || cur.monster !== d.monster || cur.map !== d.map)) {
		const a = valid_boundary(d.boundary) ? d : resolve_area(d.monster, d.map, d.boundary);
		state.dir_lock = { monster: d.monster, until: now + ((a ? travel_s(a.map, a.boundary) : 60) + CFG.travel.commit_min * 60) * 1000 };
	}
	if (d) {
		const changed = !state.directive || state.directive.monster !== d.monster || state.directive.map !== d.map;
		state.directive = { ...d, until: now + CFG.guide_interval_ms * 4 };
		if (changed) state.last_pick = 0;
	} else if (state.directive) {
		state.directive = null;
		state.last_pick = 0;
	}
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
			if (CFG.gear_auto && a.slot && character.slots?.[a.slot] && gear_score(character.items[k]) < (my_gear().w[a.slot] || 0))
				throw { reason: "worse_than_worn", want: `${a.name}+${a.level || 0} ${Math.round(gear_score(character.items[k]))} < ${Math.round(my_gear().w[a.slot])} pts` };
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
const TOWN_TASKS = ["hunt", "tokens", "craft", "guide", "compound", "upgrade", "forge", "exchange", "elixir", "sell", "restock", "bank"];
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
		tokens: !skipped("town:tokens") && !!token_pick(),
		exchange: !skipped("town:exchange") && exchange_pick() >= 0,
		elixir: elixir_buy_due(),
		guide: !!next_guide_row(state.guide),
		sell: !skipped("town:sell") && plan.sell.length > 0 && (short || (has_computer() && plan.sell.length >= CFG.sell_batch) ||
			(is_merchant() && plan.sell.some((k) => character.items[k] && state.purge[purge_key(character.items[k])]))),
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
	return errand("town", () => town_body(due).finally(() => { state.town_end_at = Date.now(); }));
}
async function town_body(due) {
	{
		await stand_close(); // a stand slows us to speed 10
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
		state.last_pick = 0; // re-evaluate where to fight
		log_ev("town", { due: due_tasks(due).join("+"), did, secs: Math.round((Date.now() - town_t0) / 1000), trig: state.town_trig || "?", v: VERSION });
		return did;
	}
}

// Starts a town run when something is due. Blockers are recorded (report() shows them; with a nearly full bag the
// log says so every 5 min). Nearly full bags lower the HP floor and ignore attackers, and a patrol walk yields to
// town — otherwise a priest hovering at 60-70% HP, or a patrol between waypoints, can farm with a full bag for hours.
let town_block_logged = 0; // last "town needed but waiting" log (at most every 5 min)
function town_check() {
	if (Date.now() - state.last_town < CFG.town_min_gap_ms) return;
	if (skipped("town:loop") && character.esize > 3) return;
	const in_town = partners().filter((p) => p.errand === "town").map((p) => p.name);
	const due = town_due(in_town.length > 0); // a member in town → share the trip
	const what = due_tasks(due);
	if (!what.length) return void (state.town_block = null);
	// v23.6: a hunt to take or turn in never starts a trip by itself (with hunt_min_xp most hunts lapse unchased, so a
	// trip just for Daisy mostly fetched another one to ignore); it's done on the next trip made for anything else
	if (what.every((k) => k === "hunt")) return void (state.town_block = { what: "hunt", blockers: ["a hunt alone waits for the next trip"], at: Date.now() });
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
	if (!blockers.length && walking() && !errand_busy()) { stop("smart"); blockers.push("stopping a pack walk"); }
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
	if (state.town_runs.length >= 6 && !critical) {
		if (!skipped("town:loop")) {
			skip("town:loop", 900_000, `${state.town_runs.length} runs in 10 min; last due: ${what.join("+")}`);
			game_log(`Town: ${state.town_runs.length} trips in 10 min (${what.join("+")} keeps coming back) — pausing town trips 15 min. Send report().`, C.bad);
		}
		return;
	}
	state.town_runs.push(Date.now());
	state.last_town = Date.now();
	state.town_trig = town_urgent(due) || (due.relaxed ? "joined a member's trip" : "deferrable");
	game_log(`Town: ${what.join("+")} (${due.plan.free} free${due.relaxed ? ", with " + in_town.join(", ") : ""})`, C.dim);
	town_run(due);
}

// =====================================================================
// Recovery, death, parking
// =====================================================================
// Low-HP recovery: cancel any walk (it would block the channel), teleport to town (3s channel), fight back only if
// hit, and stay out until recover_hp/recover_mp. use_town has no cooldown and fails while > 5 monsters target us, so
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
function recover() {
	if (!state.recovering) {
		const pmf = postmortem();
		log_ev("flee", pmf);
		bucket().flees++;
		const fk = pmf.killer && G.monsters[pmf.killer] ? pmf.killer : state.pack?.mtype;
		incident(fk, 0.8);
		share_verdict({ kind: "incident", mtype: fk, mult: 0.8 }); // v24.6: the leader picks for the party from its own tables
		if (!state.pack?.probe) safety_tune("flee"); // a probe's flee is the probe's verdict, not the everyday limit's
		// flee_pack: on_death reads the pack to cool it down and blame it; dying mid-flee used to find it already cleared
		Object.assign(state, { recovering: true, fled: false, session: null, flee_pack: state.pack, pack: null });
		game_log(`HP ${((character.hp / character.max_hp) * 100).toFixed(0)}%: retreating`, C.bad);
	}
	const threat = get_nearest_monster({ target: character.name });
	const done = character.hp >= character.max_hp * CFG.recover_hp && character.mp >= character.max_mp * CFG.recover_mp;
	if (done && !threat) {
		Object.assign(state, { recovering: false, fled_home: false, flee_pack: null, last_target_at: Date.now() });
		return void game_log("Recovered; resuming", C.ok);
	}
	if (channeling()) return void set_message("Teleporting to town…"); // nothing that would cancel it
	if (threat || hurt_ms() < CFG.flee_quiet_ms) {
		const t = choose_target(false); // what's hitting us (then a partner)
		if (t) fight(t, true); // steer: a melee fighter walks to a ranged attacker; a ranged one kites
		else if (threat && Number.isFinite(threat.x)) { // v24.8: one we ignore as immune: step away from it (stood still before)
			const a = Math.atan2(character.y - threat.y, character.x - threat.x), x = character.x + Math.cos(a) * 120, y = character.y + Math.sin(a) * 120;
			if (can_move_to(x, y)) move_to(x, y, 300);
		}
	} else if (!done && !state.fled_home && Date.now() - (state.town_at || 0) > 1500) {
		if (at_town_spot()) state.fled_home = true;
		else {
			if (walking() || is_moving(character)) stop("smart"), stop("move");
			if (fire("use_town")) (state.fled = true), (state.town_at = Date.now());
		}
	}
}
// park(): finish the current errand, go to town and stand there (still fighting back). resume(): carry on.
function park() { state.parked = true; state.park_home = false; game_log("Parking after the current errand", C.info); }
function resume() { state.parked = false; state.last_pick = 0; state.last_target_at = Date.now(); game_log("Resuming", C.info); }
// While parked: one trip to town, then stand and defend
function park_tick() {
	if (!errand_busy() && !state.park_home) {
		if (walking()) stop("smart");
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
function save_state() {
	if (typeof set !== "function") return;
	// v: format version (load_state ignores anything else); at: save time (offline time is excluded from stall timers)
	set(SAVE_KEY, { v: 1, at: Date.now(), meas_v: 3, measured: state.measured, measured_solo: state.measured_solo, meas_at: state.meas_at, realism: state.realism, danger: state.danger,
		danger_at: state.danger_at, calib: state.calib, calib_all: state.calib_all,
		cooldown: state.cooldown, gear_skip: state.gear_skip, crafted: state.crafted, bank_seen: state.bank_seen,
		guide_ignore: state.guide_ignore, guide_quests: state.guide_quests, qprog: state.qprog, gprog: state.gprog, bank_full_at: state.bank_full_at,
		fetched: state.fetched, fetch_try: state.fetch_try, gold_xfer_at: state.gold_xfer_at || 0,
		last_town: state.last_town || 0, town_end_at: state.town_end_at || 0, town_runs: state.town_runs || [], probe_at: state.probe_at || 0,
		bank_gear: state.bank_gear, bank_at: state.bank_at || 0, bank_by: state.bank_by || null, guide_equip: state.guide_equip, upg: state.upg, upg_caps: state.upg_caps, cmp_caps: state.cmp_caps, probe_ok: state.probe_ok, donated: state.donated, stand: state.stand,
		bank_free: state.bank_free, purge: state.purge, row_fails: state.row_fails, hold_for: state.hold_for,
		mspot: state.mspot, parcel_at: state.parcel_at, owe: state.owe || 0, safety_mult: state.safety_mult || 1, safety_at: state.safety_at || 0, mode_ab: state.mode_ab || null,
		skip_why: Object.fromEntries(Object.entries(skip_why).filter(([k]) => skipped(k))) });
}
function load_state() {
	const d = typeof get === "function" ? get(SAVE_KEY) : null;
	if (!d || d.v !== 1) return;
	const now = Date.now(), live = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, t]) => t > now));
	// v23.0: measurements are now in one unit (base xp of kills at the spot); older ones mixed received xp (a share of
	// every party kill) with own kills, so they're dropped once and re-measured
	// v23.1: party and solo rates are kept apart; v23.0's single table mixed them, so it's dropped too
	if (d.meas_v === 3) {
		Object.assign(state.measured, d.measured || {});
		Object.assign(state.measured_solo, d.measured_solo || {});
		// measurements saved before v24.3 have no time: they start ageing now
		const t0 = Date.now();
		for (const [pre, tab] of [["p:", state.measured], ["s:", state.measured_solo]]) for (const k in tab) state.meas_at[pre + k] = d.meas_at?.[pre + k] || t0;
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
	if (d.gold_xfer_at) state.gold_xfer_at = d.gold_xfer_at;
	// v19.0: trip timers survive a reload (before, every reload sent everyone to town for deferrable work at once)
	if (d.last_town) state.last_town = d.last_town;
	if (d.town_end_at) state.town_end_at = d.town_end_at;
	if (d.mode_ab?.split && d.mode_ab?.together) state.mode_ab = d.mode_ab; // v24.0
	if (d.probe_at) state.probe_at = d.probe_at; // v23.1: a reload no longer makes a probe due (and a regroup) at once
	if (Array.isArray(d.town_runs)) state.town_runs = d.town_runs.filter((t) => now - t < 600_000);
	if (Array.isArray(d.bank_gear)) state.bank_gear = d.bank_gear;
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
function forget() { Object.assign(state, { measured: {}, measured_solo: {}, meas_at: {}, danger: {}, danger_at: {}, calib: {}, calib_all: { ratio: 1, n: 0 }, cooldown: {}, gear_skip: {}, realism: 1 }); save_state(); game_log("Learned state cleared"); }

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
	if (!M_ && in_party_cfg() && !split_now() && seen.kill >= 20 && !seen.kc) W.push(`no kill_credit events after ${seen.kill} kills (together-mode spot rates not measured)`);
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
	{ const W = health_checks(); F("checks", "self", W.length ? `checks: ⚠ ${W.join(" | ")}` : "checks: ok"); }
	// what we're doing (fight target and reason merged into one line; say so when we're not there yet)
	if (M_) F("doing", "self", `merchant: doesn't fight; serves ${(CFG.party.members || []).join(", ")}`);
	else {
		const at_pack = !!p && character.map === p.map && in_boundary(p.boundary, 600);
		const why_ = p?.directive || (p ? `best xp/s (${p.score !== undefined ? p.score.toFixed(0) : "?"})` : "no safe pack");
		const where = p && !at_pack ? (character.map === p.map ? `${Math.round(Math.hypot(character.x - (p.boundary[0] + p.boundary[2]) / 2, character.y - (p.boundary[1] + p.boundary[3]) / 2))}px away` : `now at ${character.map}`) : "";
		const tgt = p ? `${at_pack ? "" : "→ "}${p.mtype} @ ${p.map}${where ? ` (${where})` : ""}` : "nothing";
		// a follower's reason is "following X"; the leader's directive is in the party header
		F("doing", "self", `fighting: ${tgt}${is_follower() ? ` — ${why_}` : ""}`);
		F("doing_why", "party", `  because ${why_}`, is_follower());
		if (d && !is_follower() && !state.safe[d.monster] && !d.boss) F("directive_unsafe", "self", `directive ${d.monster} is NOT safe → ignored (why_not("${d.monster}"))`);
	}
	if (!M_ && in_party_cfg()) {
		const near = partners_near().map((x) => x.name);
		F("near", "self", `near: ${near.join(", ") || "nobody (solo safety)"}${leader_name() === character.name ? " | LEADER" : ""}`);
		F("party", "party", `party: leader ${leader_name()} | in game party: ${Object.keys(get_party() || {}).join(", ") || "no"}`);
		for (const n of others()) {
			const P = state.partners[n];
			F("partner:" + n, "party", fresh(P) ? `  ${n} (${P.ctype} ${P.level}${P.rip ? ", DEAD" : ""}, ${build_txt(P.v, P.b)}${other_build(P.v, P.b) ? " ≠ ours: update it" : ""}) on ${P.map}${P.errand ? ", in " + P.errand : ""}`
				: `  ${n}: no message in 20s (not running the script, or offline)`);
		}
	}
	{
		const ev = event_live();
		if (ev) F("event", "self", `event: ${ev} — ${event_here(ev) ? "at it" : "joining"}`);
	}
	if (CFG.gear_auto) {
		const g = my_gear(), total = Object.values(g.w).filter((v) => v < 1e9).reduce((a, b) => a + b, 0);
		const owns = Object.keys(g.own || {});
		const takers = gear_takers().slice(1);
		const held_for = character.items.map((it) => { const m = it && takers.find((x) => gear_gain(it, x.ctype, x.g)); return m && `${it.name}→${m.name}`; }).filter(Boolean);
		const fr = (u) => { const r = state.fetch_res[u.key], t = state.fetch_try[u.key]; return r ? ` (fetch ${ago(r.at)} ago: ${r.ok ? "ok" : r.why})` : t ? ` (tried ${ago(t)} ago)` : ""; };
		const locked = owns, bu = bank_upgrades().map((u) => u.name + "+" + u.level + fr(u));
		F("xpm", "self", xp_mult_text());
		// v24.19: why a member isn't moving (a refused walk, a follower holding back)
		if (state.walk_refused && Date.now() - state.walk_refused.at < 600_000) F("walk", "self", `walk refused ${ago(state.walk_refused.at)} ago: to ${state.walk_refused.to}, every way passes ${state.walk_refused.why}`, true);
		if (state.follow_block && Date.now() - state.follow_block.at < 600_000) F("follow", "self", `not following the leader (${ago(state.follow_block.at)} ago): the way passes ${state.follow_block.rd}`, true);
		F("gear", "self", `gear: ${total.toFixed(0)} pts worn${locked.length ? ` (guide working on ${locked.join(", ")})` : ""}${bu.length ? ` | bank upgrades: ${bu.join(", ")}` : ""}${held_for.length ? ` | for party: ${held_for.join(", ")}` : ""}`);
	}
	{
		const acts = wd.acts.filter((a) => now - a.t < 3600_000);
		if (acts.length) F("watchdog", "self", `watchdog: ${acts.length} intervention(s) in 1h (last: ${acts[acts.length - 1].kind} ${ago(acts[acts.length - 1].t)} ago)`);
	}
	{
		const h = last_hour(), r = rates();
		F("hour", "party", `last hour: ${h.dead} deaths, ${h.fled} flees, ${h.town} town trips | ${r ? `${fmt_k(r.xph)} xp/h, ${fmt_k(r.gph)} gold/h (${r.mins} min)` : "rates after 15 min"} — history() / deaths()`);
	}
	if (M_) {
		const f = merchant_job(), D = CFG.merchant.donate;
		if (D && character.level < D.to_level) F("xp", "self", `xp: level ${character.level}, donating gold above ${fmt_k(D.keep)} until level ${D.to_level} (${fmt_k(state.donated && now - state.donated.since < 86_400_000 ? state.donated.g : 0)}/${fmt_k(D.per_day)} today)`);
		const bf = state.bank_free, pend = character.items.filter((i) => i && state.purge[purge_key(i)]).length;
		if (bf) F("bank", "self", `bank: ${bf.free} of ${bf.total} free (seen ${ago(state.bank_at || bf.at)} ago${state.bank_by && state.bank_by !== character.name ? " by " + state.bank_by : ""})${bf.free < bf.total * CFG.merchant.purge_below ? " — purging low-value items" : ""}${pend ? ` | purge: ${pend} pending` : ""}`);
		if (merrit_on()) {
			const sp = state.mspot, st = state.stand_since ? Math.round((now - state.stand_since) / 1000) : 0;
			const got = hist.ev.filter((e) => e.type === "parcel" && now - e.t < 86_400_000).reduce((a, e) => a + (e.n || 1), 0);
			F("merrit", "self", `merrit: ${sp ? `spot ${sp.x},${sp.y} (${in_rect(sp.x, sp.y, CFG.merchant.merrit.square) ? "square" : "aisle"})` : "no qualifying spot"} | ${character.stand ? `stand still ${Math.floor(st / 60)}m${st % 60}s${st >= 120 ? " — ready for her" : ""}` : "stand closed"} | parcels 24h: ${got}${state.parcel_at ? `, last ${ago(state.parcel_at)} ago` : ""}${parcel_count() ? ` | holding ${parcel_count()}` : ""}`);
		}
		const ls = Object.values(state.stand), sold = hist.ev.filter((e) => e.type === "sold" && now - e.t < 86_400_000);
		F("stand", "self", `stand: ${character.stand ? "open" : "closed"}, ${ls.length}/16 listed${ls.length ? ` (${fmt_k(ls.reduce((a, l) => a + l.price * (l.per_unit ? l.q || 1 : 1), 0))} asked)` : ""} | sold 24h: ${sold.length}${sold.length ? ` for ${fmt_k(sold.reduce((a, e) => a + (e.price || 0), 0))}` : ""}`);
		F("merchant", "self", `supply: ${state.serving ? "serving " + state.serving : f ? "next: " + f.name + ` (${f.esize} free, pots ${f.pots?.hp}/${f.pots?.mp})` : "idle"} | mluck ${G.skills.mluck && character.level >= (G.skills.mluck.level || 0) ? "on" : `at level ${G.skills.mluck?.level || 40}`}`);
	} else if (CFG.merchant?.name) {
		const M = merchant_hb();
		F("merchant", "party", `merchant ${CFG.merchant.name}: ${M ? `online, ${M.serving ? "serving " + M.serving : "in " + M.map}, ${M.esize} free, ${fmt_k(M.gold)} gold` : "offline (fighters do their own town runs)"}`);
	}
	if (CFG.boss?.enabled && !M_) {
		const S_ = parent.S || {}, live = Object.keys(S_).filter((k) => S_[k]?.live === true && G.monsters[k]);
		F("bosses", "party", `bosses: ${live.length ? live.map((k) => `${k}@${S_[k].map} ${boss_safe(k) ? "JOIN" : "too strong"}`).join(", ") : "none live on this server"}`, !live.length);
	}
	{
		// must-hold items and tokens in one line
		const miss = hold_missing(), names = Object.keys(CFG.hold || {}).filter((n) => G.items[n]), tok = held_any("monstertoken"), b = !M_ && CFG.token_auto ? token_pick() : null;
		const parts = names.map((n) => {
			if (!miss.includes(n)) return `${n} ✓`;
			if (state.bank_seen[n] > 0) return `${n} missing — fetching from the bank`;
			const pr = hold_price(n);
			return M_ ? `${n} missing — a fighter buys it (${pr} tokens)` : `${n} missing — ${tok >= pr ? `buying (${pr} tokens)` : `${tok}/${pr} tokens`}`;
		});
		if (!M_ && tok > 0 && b && !b.hold) parts.push(`tokens ${tok} → next: ${b.name} (${b.price}) for ${b.for}`);
		if (Object.keys(state.hold_for).length) parts.push(`for the merchant: ${Object.keys(state.hold_for).join(", ")}`);
		if (parts.length) F("hold", "self", `hold: ${parts.join(" | ")}`, !miss.length && !(b && !b.hold) && !Object.keys(state.hold_for).length);
	}
	{
		const c = CFG.craft_power && craft_pick();
		if (c) F("craft", "self", `craft: ${c.id} for ${c.for}'s ${c.slot} (+${c.gain} pts${c.cost ? `, ${fmt_k(c.cost)} gold` : ""})${craft_inputs_in_bags(c.id) ? " — ready" : " — fetching inputs"}`);
	}
	if (CFG.upgrade_auto) {
		const P = state.upg;
		F("upgrade", "self", `upgrade: ${P ? `${P.name} +${Math.max(0, best_level_held(P.name))}/+${P.to}${P.high ? " (high)" : ""} for ${P.for}'s ${P.slot} (+${P.gain} pts, ~${fmt_k(P.cost)})${state.fund_need > 0 ? ` | waiting for ${fmt_k(state.fund_need)} gold` : ""}` : merchant_does_it() ? "left to the merchant" : "no project"}`, !P);
	}
	if (CFG.elixir_auto && !M_) {
		const e = character.slots?.elixir;
		const t = elixir_active() ? `${e.name}${e.expires ? ` until ${new Date(e.expires).toLocaleTimeString()}` : ""}` : best_elixir() ? "about to drink " + best_elixir().name
			: bank_elixir() ? "fetching " + bank_elixir().name + " from the bank" : character.gold >= CFG.elixir_buy_min_gold ? "buying " + CFG.elixir_buy : `none (buys ${CFG.elixir_buy} at ${fmt_k(CFG.elixir_buy_min_gold)} gold)`;
		F("elixir", "self", `elixir: ${t}`, !elixir_active() && !best_elixir() && !bank_elixir() && character.gold < CFG.elixir_buy_min_gold);
	}
	if (CFG.compound_auto) {
		const gs = compound_groups(), paused = Object.keys(state.gear_skip).filter((k) => k.startsWith("cmp:") && skipped(k));
		F("compound", "self", `compound: ${gs.map((g) => `${g.name}+${g.level} ${g.bags.length}${g.bank ? `(+${g.bank} bank)` : ""}`).join(", ") || "no sets of 3 spares"}` +
			(paused.length ? ` | paused: ${paused.map((k) => `${k.slice(4)} ${mins(state.gear_skip[k])} (${skip_why[k] || "?"})`).join(", ")}` : ""), !gs.length && !paused.length);
	}
	if (CFG.probe?.enabled && !M_ && (!in_party_cfg() || leader_name() === character.name)) {
		const P = state.probe, last = [...hist.ev].reverse().find((e) => e.type === "probe");
		const next = (state.probe_at || 0) + CFG.probe.every_min * 60_000;
		const why_ = P ? null : probe_why(), none = state.probe_none && Date.now() - state.probe_none.at < 2 * 3600_000 ? state.probe_none : null;
		F("probe", "self", `probe: ${P ? `${P.mtype} running (${Math.max(0, Math.round((P.until - Date.now()) / 60_000))}m left, risk x${P.ratio.toFixed(2)})` : why_}` +
			(none && !P ? ` | last check ${ago(none.at)} ago${none.dry ? " (before regrouping)" : ""}: no monster within x${CFG.probe.max_over} of the limit beats ${CFG.probe.min_gain}x the best ${none.best} xp/s` : "") +
			(last ? ` | last probe: ${last.mtype} ${last.result === "ok" ? "✓" : "✗ " + last.why} ${ago(last.t)} ago` : ""));
	}
	if (p && !p.boss && !M_) F("safety", "self", `safety limit ${Math.round(safety_now() * 100)}% of HP per kill${(state.safety_mult || 1) > 1 ? ` (raised from ${Math.round(CFG.safety * 100)}%; next step ${mins((state.safety_at || Date.now()) + CFG.safety_tune.step_h * 3600_000)})` : ""} | at ${p.mtype}: x${danger_of(p.mtype).toFixed(2)} — ${calib_text(p.mtype)}${state.danger[p.mtype] ? `, incidents x${state.danger[p.mtype].toFixed(2)}` : ""}`, danger_of(p.mtype) >= 1);
	if (state.guide_farm && !M_) F("guide_farm", "self", `guide farm row: ${state.guide_farm.monster} (${state.guide_farm.reason})`, true);
	if (CFG.spend?.enabled) F("budget", "party", budget_text());
	const golds = partners().filter((x) => Number.isFinite(x.gold));
	if (golds.length && CFG.party.gold?.enabled) {
		const next = (state.gold_xfer_at || 0) + CFG.party.gold.every_h * 3600_000;
		F("gold", "party", `gold: us ${character.gold.toLocaleString()} / ${golds.map((x) => `${x.name} ${x.gold.toLocaleString()}`).join(" / ")} | last transfer ${state.gold_xfer_at ? Math.round((now - state.gold_xfer_at) / 60_000) + "m ago" : "never"}${next > now ? `, next allowed in ${mins(next)}` : ""}`);
	}
	if (state.dir_dup && split_now() && !M_) F("dir_dup", "self", `${state.dir_dup.monster} left to ${state.dir_dup.by} (party kills count for every hunt; loot is shared) — farming the best spot instead`);
	if (state.dir_held && state.dir_lock && !M_) F("dir_held", "self", `committed to ${state.directive?.monster} for ${mins(state.dir_lock.until)} more; then: ${state.dir_held.monster} (${state.dir_held.reason})`);
	if (!is_follower() && partners().length && !M_) {
		if (state.shared?.mutual.length) F("mutual", "party", `mutual goals: ${state.shared.mutual.slice(0, 3).join(" | ")}`);
		else if (state.turn) F("turn", "party", `no mutual goal; turn: ${state.turn.who}'s for ${mins(state.turn.end)}${state.turn.arrived ? "" : " (walking there; the clock starts on arrival)"}`);
		if (state.shared?.too_slow.length) F("too_slow", "party", `too slow to share (> ${CFG.party.mutual_max_h}h): ${state.shared.too_slow.slice(0, 4).join(" | ")}`);
	}
	if (is_follower() && !M_) F("goals", "self", `my goals (shared with ${leader_name()}): ${goals_list().sort((a, b) => b.w - a.w).slice(0, 4).map((g) => g.monster + " (" + g.reason + ")").join(", ") || "none"}`);
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
	for (const r of state.guide?.rows || []) {
		const st = r.kind === "farm" ? "farm row" : !CFG.gear_actions.includes(r.kind) ? "not automated" : skipped(r.id) ? `paused ${mins(state.gear_skip[r.id])}: ${skip_why[r.id] || "reason not recorded"}` : r.affordable === false ? "unaffordable" : "next";
		F("guide:" + r.id, "self", `guide ${r.id}: ${st}`, r.kind === "farm" || !CFG.gear_actions.includes(r.kind));
	}
	if (!M_) for (const id of quest_recipes()) {
		const r = G.craft[id];
		const inputs = r.items.map(([q, n, l]) => { const b = l ? 0 : bank_share(n), t = state.bank_seen[n] || 0;
			return `${n}${l ? "+" + l : ""} ${held(n, l)}${b ? `(+${b} bank${t > b ? ` of ${t}` : ""})` : t && !l ? `(bank ${t}: partners' share)` : ""}/${q}`; }).join(", ");
		const pk = quest_parked(id) && quest_park_cache.get(id);
		const st = pk ? `parked ~${Math.round(pk.eta)}h to farm (> ${CFG.quest_park_h}h; materials banked)` : !recipe_wanted(id) ? "done" : skipped("qc:" + id) ? `paused ${mins(state.gear_skip["qc:" + id])}` : has_inputs(r) ? "READY to craft" : "collecting";
		F("quest:" + id, "self", `quest ${id}${is_guide_quest(id) ? " [guide]" : ""} @ ${G.npcs[r.quest]?.name || r.quest}: ${st} — ${inputs}`, st === "done");
	}
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
	if (bank_is_full()) F("bank_full", "self", `bank marked full ${Math.round((now - state.bank_full_at) / 60_000)}m ago: selling +0 junk meanwhile`);
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
	const g = my_gear(), sl = character.slots || {}, L = [`— gear_check ${character.name} (${character.ctype} ${character.level}) —`];
	const cand = {}; // slot -> best { name, level, score, where }
	const look = (it, where) => {
		if (!it || !G.items[it.name] || !GEAR.has(G.items[it.name].type)) return;
		const sc = gear_score(it);
		for (const s of slots_for(it.name, character.ctype, g)) if (!cand[s] || sc > cand[s].score) cand[s] = { name: it.name, level: it.level || 0, score: sc, where };
	};
	character.items.forEach((it) => look(it, "bags"));
	for (const it of state.bank_gear || []) look(it, "bank");
	for (const s of GEAR_SLOTS) {
		const w = sl[s], c = cand[s], cur = g.w[s] || 0;
		const verdict = !c ? "nothing better owned" : gear_gain(c, character.ctype, g) ? `UPGRADE +${Math.round(gear_gain(c, character.ctype, g).gain)} pts → equips${c.where === "bank" ? " once fetched" : ""}` :
			c.score > cur ? `+${Math.round(c.score - cur)} pts, below the ${g.own?.[s] ? Math.round(CFG.gear_guide_override * 100) + "% guide" : Math.round(CFG.gear_margin * 100) + "%"} margin` : "worse";
		L.push(`${s.padEnd(9)} ${w ? `${w.name}+${w.level || 0}` : "(empty)"} ${Math.round(cur)} pts${g.own?.[s] ? " [guide working on it]" : ""}` +
			`${c ? ` | best owned: ${c.name}+${c.level} ${Math.round(c.score)} pts (${c.where})` : ""} — ${verdict}`);
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
	const lead = CFG.party.leader && fighters.some((f) => f.name === CFG.party.leader) ? CFG.party.leader
		: [...fighters].sort((a, b) => a.level - b.level || (a.name < b.name ? -1 : 1))[0].name;
	const lp = fighters.find((f) => f.name === lead)?.pack;
	out.push(`leader: ${lead}${lp ? ` @ ${lp.mtype} (${lp.map})${lp.directive ? " — " + lp.directive : ""}` : " — no pack"}`);
	const gw = lead === character.name ? state.group_wait?.who && !(state.group_wait.go_until > Date.now()) ? state.group_wait.who : null : state.partners[lead]?.grp_wait;
	if (!CFG.party.split?.enabled) out.push(`party: together (CFG.party.split off)${gw ? ` — waiting for ${gw}` : ""}`);
	if (CFG.party.split?.enabled) {
		const sp = lead === character.name ? !!state.split_on : !!state.partners[lead]?.split;
		const pa = lead === character.name ? state.probe_at : state.partners[lead]?.probe_at, due = (pa || 0) + (CFG.probe?.every_min || 0) * 60_000;
		out.push(sp ? `party: farming separately${CFG.probe?.enabled && pa ? ` (regroup for a probe in ${mins(due)})` : ""} — ${fighters.map((f) => `${f.name} @ ${f.pack ? f.pack.mtype : "?"}`).join(", ")}`
			: `party: together${lead === character.name && state.regroup_since ? ` (regrouping for a probe, ${ago(state.regroup_since)})` : ""}`);
		const ab = lead === character.name ? state.mode_ab : state.partners[lead]?.ab;
		if (CFG.party.split.ab?.enabled && ab?.split) out.push(`mode: ${ab.mode === "split" ? "separate" : "together"} by measurement since ${ago(ab.since)} — ${mode_why(ab)}`
			+ (fighters.length < (CFG.party.members || []).length ? " (measuring paused: not every fighter online)" : ""));
	}
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
	const limit = (f.hp_pool || character.max_hp) * safety_now(f) * danger_of(mtype, f) * heal_mult(f);
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

// =====================================================================
// Party: the lowest-level member leads (packs, directives); the others follow it, assist its target, priests heal.
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
// Leader: CFG.party.leader if set (and online), else the lowest level online (dead members count: a dead leader is
// still the leader, so followers hold position instead of wandering off). Ties: alphabetical, so all agree.
function leader_name() {
	if (!in_party_cfg()) return character.name;
	const all = [{ name: character.name, level: character.level }, ...partners_any()];
	if (CFG.party.leader && all.some((m) => m.name === CFG.party.leader)) return CFG.party.leader;
	all.sort((a, b) => a.level - b.level || (a.name < b.name ? -1 : 1));
	return all[0].name;
}
const leader_name_any = leader_name;
const leader_hb = () => state.partners[leader_name()];
// Split mode (CFG.party.split): the leader decides (state.split_on, sent in its heartbeat); others read its beat.
// While split, every fight is judged as if alone (fight_math solo): whoever happens to be near won't stay.
const solo_now = () => split_now();
const split_now = () => !!CFG.party.split?.enabled && in_party_cfg() && partners_any().length > 0 &&
	(leader_name() === character.name ? !!state.split_on : !!leader_hb()?.split);
// A follower stops following while split, unless it found nothing it can farm alone (then it follows for fallback_min)
const is_follower = () => in_party_cfg() && partners_any().length > 0 && leader_name() !== character.name &&
	!(split_now() && Date.now() >= (state.split_fallback || 0));
// Leader: split unless a probe is running or due, a boss or an event is on. A due probe waits regroup_max_min for
// everyone to arrive, then is skipped for this round.
function split_decide() {
	const S_ = CFG.party.split, P = CFG.probe, now = Date.now();
	if (!S_?.enabled || !in_party_cfg() || leader_name() !== character.name) return void lead_lost();
	// v23.2: just became the leader (levels crossed, the old one went offline): carry on its split decision and probe
	// clock from its heartbeat instead of starting over (a regroup and a probe check on every handover)
	if (!state.was_leader) {
		state.was_leader = true;
		const prev = partners_any().filter((p) => p.split !== undefined);
		state.probe_at = Math.max(state.probe_at || 0, ...prev.map((p) => p.probe_at || 0));
		if (prev.some((p) => p.split)) state.split_on = true;
		const ab = prev.map((p) => p.ab).filter((a) => a?.split && a?.together).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
		if (ab && (ab.at || 0) > (state.mode_ab?.at || 0)) state.mode_ab = JSON.parse(JSON.stringify(ab));
	}
	const forced = !!state.probe || !!state.directive?.boss || !!event_live();
	const pref = mode_pick(); // v24.0: the mode that has earned more (or needs data)
	let on = !forced && pref === "split", why_ = forced ? "a probe, boss or event" : on ? "" : mode_why();
	if (on && P?.enabled && now - (state.probe_at || 0) >= P.every_min * 60_000) {
		// v23.1: only call everyone back if a probe would find something — judged for the whole party (as it would be
		// once regrouped) against the party's best normal spot. Most checks find nothing; each regroup cost a walk.
		let regroup = true;
		if (!state.regroup_since) {
			const ref = best_score_for("all"), pb = probe_pick("all", ref);
			if (!pb) {
				state.probe_at = now;
				state.probe_none = { at: now, best: Math.round(ref), dry: true };
				log_ev("probe_dry", { best: Math.round(ref) });
				regroup = false;
			}
		}
		if (regroup) {
			state.regroup_since = state.regroup_since || now;
			if (now - state.regroup_since < S_.regroup_max_min * 60_000) { on = false; why_ = "for a probe"; }
			else { state.probe_at = now; state.regroup_since = 0; log_ev("regroup_timeout", {}); game_log(`party: not everyone made it back for the probe in ${S_.regroup_max_min} min; skipping it this round`, C.dim); }
		}
	} else if (on || pref !== "split") state.regroup_since = 0;
	if (on !== !!state.split_on) {
		state.split_on = on;
		if (state.mode_ab) state.mode_ab.flip_at = now;
		log_ev(on ? "split" : "regroup", { why: on ? mode_why() : why_ });
		game_log(on ? `party: farming separately${mode_why() ? ` (${mode_why()})` : ""}` : `party: together (${why_})`, C.info);
		state.last_pick = 0;
	}
}
// Not leading (now): the split flag is the leader's to send, and a probe we started is ours no more — it would later
// be closed as "held" (v24.3). Also called from the follower branch, which never reaches split_decide.
function lead_lost() {
	state.split_on = false; state.was_leader = false;
	if (state.probe && in_party_cfg() && leader_name() !== character.name) {
		const P = state.probe;
		log_ev("probe", { mtype: P.mtype, mins: Math.round((Date.now() - P.start) / 60_000), result: "dropped", why: "leader changed", ratio: null, n: 0, over: +(P.ratio || 0).toFixed(2) });
		state.probe = null;
	}
}
// Our party-fight calibration ratios (20+ fights), for the leader's verdicts under our cover (tanks only, v24.6)
function calp_share() {
	const o = {};
	for (const k in state.calib) if (k.endsWith("@p") && state.calib[k].n >= 20) o[k.slice(0, -2)] = +state.calib[k].ratio.toFixed(3);
	return o;
}
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
// ---- Convoy (CFG.party.group.convoy, v24.18) ----
// Together, travelling: the slowest online member (not on an errand, recovering or dead) leads the walk to the leader's
// spot and everyone follows it. The leader setting off at its own pace and holding when someone fell 450px behind made
// a stop-start string, the fast members arriving first. Ends once that member is at the spot. Everyone computes the same
// head from the heartbeats' speeds (ties: name order).
function convoy_head() {
	if (!CFG.party.group?.enabled || !CFG.party.group.convoy || !in_party_cfg() || split_now()) return null;
	const me_lead = leader_name() === character.name, L = me_lead ? null : leader_hb();
	const pk = me_lead ? state.pack : L?.pack;
	if (!pk || !valid_boundary(pk.boundary) || pk.boss || (!me_lead && (L.errand || L.recovering || L.rip))) return null;
	const members = [{ name: character.name, speed: character.speed, map: character.map, x: character.x, y: character.y, ok: !state.recovering && !errand_busy() && !character.rip },
		...partners().map((p) => { const q = partner_pos(p); return { name: p.name, speed: p.speed, map: q.map, x: q.x, y: q.y, ok: !p.errand && !p.recovering && !p.rip }; })]
		.filter((m) => m.ok && m.speed > 0);
	if (members.length < 2) return null;
	members.sort((a, b) => a.speed - b.speed || (a.name < b.name ? -1 : 1));
	const H = members[0], b = pk.boundary;
	if (H.map === pk.map && in_rect(H.x, H.y, [b[0] - 400, b[1] - 400, b[2] + 400, b[3] + 400])) return null; // it's there: convoy over
	return H.name;
}
// ---- Group travel (CFG.party.group, v24.11) ----
// Leader, together: the members we should wait for, as text — or null to go on (nothing to wait for, or waited enough)
function group_hold(pack, here) {
	const G_ = CFG.party.group, now = Date.now();
	if (!G_?.enabled || !in_party_cfg() || split_now() || !pack || pack.boss || is_follower() || leader_name() !== character.name || errand_busy())
		return void (state.group_wait = null), null;
	const key = pack_key(pack);
	if (here && state.group_ok === key) return null; // assembled at this spot already: fights move people around
	// v24.16: never stand and wait while something we can't take on is on one of us: keep going
	const party = party_names();
	for (const id in parent.entities || {}) { const e = parent.entities[id]; if (e?.type === "monster" && e.target && party.has(e.target) && !e.dead && !can_take(e)) return null; }
	const at_pack = (q, p) => p.pack && valid_boundary(p.pack.boundary) && pack_key(p.pack) === key && q.map === pack.map &&
		in_rect(q.x, q.y, [pack.boundary[0] - 300, pack.boundary[1] - 300, pack.boundary[2] + 300, pack.boundary[3] + 300]);
	const r = state.group_wait ? G_.radius * 0.6 : G_.radius; // once waiting, until they're well in
	const far = partners().filter((p) => {
		if (p.errand || p.recovering || p.rip) return false;
		const q = partner_pos(p);
		if (at_pack(q, p)) return false; // already there, waiting for us (our errand)
		return q.map !== character.map || Math.hypot(q.x - character.x, q.y - character.y) > r;
	});
	if (!far.length) { if (here) state.group_ok = key; state.group_wait = null; return null; }
	const W = state.group_wait || (state.group_wait = { since: now, go_until: 0 });
	if (W.go_until > now) return null;
	if (now - W.since > G_.wait_s * 1000) { // waited enough: carry on for a while
		W.go_until = now + G_.go_s * 1000; W.since = W.go_until;
		log_ev("group_timeout", { who: far.map((p) => p.name).join(",") });
		return null;
	}
	W.who = far.map((p) => p.name).join(", ");
	return W.who;
}
// ---- Verdicts shared with the party (v24.6) ----
// Deaths and flees (incident + the pack's cooldown) and probe results used to stay in the state of whoever had them;
// together, only the leader picks, from its own tables — so a follower's death changed nothing and the party walked
// back to the spot that killed it. Each is sent to the other fighters, who apply it to theirs.
function share_verdict(v) {
	if (!in_party_cfg() || typeof send_cm !== "function" || !others().length) return;
	Promise.resolve(send_cm(others(), { k: "verdict", ...v })).catch(() => {});
}
function apply_verdict(v, from) {
	if (!v || !G.monsters[v.mtype]) return;
	if (v.kind === "incident" && v.mult > 0 && v.mult < 1) {
		incident(v.mtype, v.mult);
		if (v.key && v.cd > Date.now()) state.cooldown[v.key] = Math.max(state.cooldown[v.key] || 0, Math.min(v.cd, Date.now() + 3600_000));
		if (v.death) delete state.probe_ok[v.mtype];
		log_ev("verdict", { from, kind: v.kind, mtype: v.mtype, mult: v.mult });
	} else if (v.kind === "probe_ok" && v.mult >= 1 && v.mult <= (CFG.probe?.max_over || 2) * 1.1) {
		state.probe_ok[v.mtype] = { mult: v.mult, at: Date.now() };
		log_ev("verdict", { from, kind: v.kind, mtype: v.mtype, mult: v.mult });
	} else if (v.kind === "probe_fail") delete state.probe_ok[v.mtype];
}
// ---- Split vs together, measured (CFG.party.split.ab, v24.0) ----
// state.mode_ab: { split: {xp, s}, together: {xp, s}, at (last fade), mode (the measured choice), since (when mode was
// chosen), flip_at (last actual split/regroup) }. mode is kept apart from split_on: probes, bosses and events override
// split_on for a while without changing the choice or its hold clock.
const ab_rate = (b) => (b && b.s > 0 ? b.xp / b.s : 0); // xp per second
// Every configured fighter online: with one missing, each kill is shared fewer ways and fewer fighters kill, so a rate
// measured then isn't comparable with one measured at full strength — neither booked nor acted on
const ab_full = () => partners_any().length >= (CFG.party.members || []).length - 1;
const ab_state = () => state.mode_ab || (state.mode_ab = { split: { xp: 0, s: 0 }, together: { xp: 0, s: 0 }, at: Date.now(), mode: "split", since: Date.now(), flip_at: 0 });
// Leader, every second: book this second's xp to the mode we're in, unless something else decides the mode right now
function mode_ab_tick(d) {
	const A = CFG.party.split?.ab, now = Date.now();
	if (!A?.enabled || !CFG.party.split.enabled || !in_party_cfg() || leader_name() !== character.name || !partners().length) return;
	const M = ab_state();
	if (now - (M.at || now) >= 60_000) { // fade both samples once a minute (and over any offline gap)
		const k = Math.pow(0.5, (now - M.at) / (A.half_life_h * 3600_000));
		for (const m of ["split", "together"]) { M[m].xp *= k; M[m].s *= k; }
		M.at = now;
	}
	if (!ab_full() || state.parked || state.probe || state.directive?.boss || state.regroup_since || character.rip || state.recovering || event_live()) return;
	const cur = state.split_on ? "split" : "together";
	if (cur !== M.mode || now - (M.flip_at || 0) < A.settle_min * 60_000) return;
	M[cur].xp += Math.max(0, d); M[cur].s += 1;
}
// The mode to be in (leader, each split_decide): finish measuring the current one, then try the other if its data is
// thin; else switch only to one earning margin x more. A choice holds hold_min.
function mode_pick() {
	const A = CFG.party.split?.ab, now = Date.now();
	if (!A?.enabled) return "split";
	const M = ab_state(), cur = M.mode, other = cur === "split" ? "together" : "split", need = A.sample_min * 60;
	if (!ab_full() || now - (M.since || 0) < A.hold_min * 60_000 || M[cur].s < need) return cur;
	// v24.6: a mode on re-trial (M.trial) has no margin to hold it once measured: the better rate wins. With the margin it
	// stayed whenever the gap was under 10%, and the mode in force came from trial timing, not from the data
	const bar = M.trial ? 1 : A.margin;
	const why = M[other].s < need / 2 ? "too little data on it" : ab_rate(M[other]) > ab_rate(M[cur]) * bar ? "it earns more" : "";
	M.trial = false;
	if (!why) return cur;
	M.mode = other; M.since = now; M.trial = why === "too little data on it";
	log_ev("mode_ab", { mode: other, why, split: Math.round(ab_rate(M.split) * 3600), together: Math.round(ab_rate(M.together) * 3600) });
	game_log(`party: trying ${other === "split" ? "separate spots" : "farming together"} — ${why} (${mode_why()})`, C.info);
	return other;
}
// The measurements, as text (report/log); M defaults to ours
function mode_why(M = state.mode_ab) {
	const A = CFG.party.split?.ab;
	if (!A?.enabled || !M?.split || !M?.together) return "";
	const f = (m) => `${m} ${fmt_k(Math.round(ab_rate(M[m]) * 3600))}/h${M[m].s < A.sample_min * 60 ? ` (${Math.round(M[m].s / 60)}m of data)` : ""}`;
	return `party xp ${f("split")} vs ${f("together")}`;
}
// Status message to the other members every beat_ms: position, HP, target, pack, errand, combat stats (for the
// fight model), hunt, goals and gold. Skipped while the call budget is tight.
function heartbeat() {
	if (!in_party_cfg() || typeof send_cm !== "function") return;
	const t = get_targeted_monster(), p = state.pack;
	const msg = { k: "hb", v: VERSION, b: BUILD, xpm: xp_mult(), speed: character.speed, follows: is_follower(), grp_wait: state.group_wait?.who && !(state.group_wait.go_until > Date.now()) ? state.group_wait.who : null, calp: CFG.gear_tank.includes(character.ctype) ? calp_share() : null, safety_mult: state.safety_mult || 1, split: !!state.split_on && leader_name() === character.name, probe_at: state.probe_at || 0, ab: leader_name() === character.name ? state.mode_ab || null : null, qshort: qshort(), bag_lv: bag_gear_levels(), ledger: my_ledger(), bag_gear: bag_gear_names(), level: character.level, ctype: character.ctype, map: character.map,
		x: Math.round(character.x), y: Math.round(character.y), hp: character.hp, max_hp: character.max_hp, rip: !!character.rip,
		target: t && !t.dead ? t.id : null, pack: p ? { mtype: p.mtype, map: p.map, boundary: p.boundary, directive: p.directive, probe: !!p.probe } : null, recovering: !!state.recovering,
		errand: errand_busy() ? state.errand : null, attack: character.attack, frequency: character.frequency,
		damage_type: character.damage_type || G.classes[character.ctype]?.damage_type, apiercing: character.apiercing || 0,
		rpiercing: character.rpiercing || 0, range: character.range,
		hunt: character.s.monsterhunt?.c > 0 ? { id: character.s.monsterhunt.id, c: character.s.monsterhunt.c } : null,
		// our own top goal (a follower's directive is always its own; a leader's may be the partner's, so skip those)
		goals: goals_list().sort((a, b) => b.w - a.w).slice(0, 12),
		gold: character.gold, gold_xfer_at: state.gold_xfer_at || 0,
		party: Object.keys(get_party() || {}), // who we're in a game party with (invites use it)
		gear: CFG.gear_auto ? my_gear() : null, esize: character.esize, // hand-me-downs (share_gear)
		worn: CFG.gear_auto ? worn_items() : null, // swap_worn: what's in each slot
		armor: character.armor, resistance: character.resistance, // tank_first fight model
		pots: { hp: pot_count("hp"), mp: pot_count("mp") }, rates: rates(), h1: last_hour(), // merchant service, report
		mp: character.mp, max_mp: character.max_mp, tokens: held_any("monstertoken"), need: hold_missing() };
	const to = CFG.merchant?.name && !others().includes(CFG.merchant.name) ? [...others(), CFG.merchant.name] : others();
	Promise.resolve(send_cm(to, msg)).catch(() => {});
}
if (typeof character.on === "function") character.on("cm", (m) => {
	if (m?.message?.k) seen.cm[m.message.k] = (seen.cm[m.message.k] || 0) + 1;
	if (m && (m.message?.k === "ping" || m.message?.k === "pong") && party_names_all().includes(m.name)) {
		if (m.message.k === "ping") Promise.resolve(send_cm([m.name], { k: "pong", id: m.message.id, v: VERSION })).catch(() => {});
		else if (st_runs[m.message.id]) st_runs[m.message.id].pong[m.name] = { v: m.message.v, ms: Date.now() - st_runs[m.message.id].at };
		return;
	}
	if (m && m.message?.k === "tgt" && (CFG.party.members || []).includes(m.name) && fresh(state.partners[m.name])) {
		state.partners[m.name].target = m.message.id; // a member holding fire for us: hit this one now
		return;
	}
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
	if (m && m.message?.k === "mhb" && m.name === CFG.merchant?.name) return void (state.merchant = { ...m.message, name: m.name, t: Date.now() });
	if (m && m.message?.k === "verdict" && (CFG.party.members || []).includes(m.name) && m.name !== character.name) return void apply_verdict(m.message, m.name);
	if (m && m.message?.k === "bill" && m.name === CFG.merchant?.name && !is_merchant()) { // potions it handed us (v23.0)
		const g = Math.max(0, Math.round(+m.message.g || 0));
		state.owe = (state.owe || 0) + g;
		log_ev("bill", { g, what: m.message.what || "" });
		return;
	}
	if (!m || !(CFG.party.members || []).includes(m.name) || m.message?.k !== "hb") return;
	const first = !fresh(state.partners[m.name]);
	state.partners[m.name] = { ...m.message, name: m.name, t: Date.now() };
	if (m.message.gold_xfer_at > (state.gold_xfer_at || 0)) state.gold_xfer_at = m.message.gold_xfer_at; // one party-wide clock
	// v24.3: every member keeps a copy of the leader's split/together measurements and probe clock, so a new leader
	// (levels crossed, or the old one went offline) carries on with them; the old leader's heartbeats stop carrying
	// them the moment it stops leading, so reading them at handover found nothing
	if (m.name === leader_name() && m.name !== character.name) {
		const ab = m.message.ab;
		if (ab?.split && ab?.together) state.mode_ab = JSON.parse(JSON.stringify(ab));
		if (m.message.probe_at > (state.probe_at || 0)) state.probe_at = m.message.probe_at;
	}
	if (first) game_log(`party: ${m.name} (${m.message.ctype} ${m.message.level}) online; ${leader_name()} leads`, C.info);
	if (first && other_build(m.message.v, m.message.b)) game_log(`party: ${m.name} runs ${build_txt(m.message.v, m.message.b)}, we run ${build_txt(VERSION, BUILD)} - load the same version on every character`, C.warn);
});
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
function party_invite_tick() {
	if (!in_party_cfg() || character.rip) return;
	const mine = Object.keys(get_party() || {});
	const missing = partners().filter((p) => !mine.includes(p.name));
	if (!missing.length) return;
	const call = (fn, name, key, msg) => { party_log(key, msg); Promise.resolve(fn(name)).catch(() => {}); };
	const partied = (p) => (p.party || []).some((n) => n !== p.name && members_cfg().includes(n));
	if (in_member_party()) {
		for (const p of missing) if (!partied(p)) call(send_party_invite, p.name, "inv:" + p.name, `party: inviting ${p.name}`);
		return;
	}
	const hosts = partners().filter(partied);
	if (hosts.length) {
		// ask one host per tick, rotating, in case one runs an old version that ignores us
		const h = hosts.sort((a, b) => (a.name < b.name ? -1 : 1))[Math.floor(Date.now() / 10_000) % hosts.length];
		call(send_party_request, h.name, "req:" + h.name, `party: asking to join ${h.name}'s party`);
	} else if (leader_name() === character.name) {
		for (const p of missing) call(send_party_invite, p.name, "inv:" + p.name, `party: inviting ${p.name}`);
	}
}
setInterval(party_invite_tick, 10_000); // every 10s until everyone online is in

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
function merchant_beat() {
	if (!is_merchant() || typeof send_cm !== "function") return;
	if (state.fund_need > 0 && character.gold - CFG.merchant.donate.keep >= state.fund_need && !state.upg) state.fund_need = 0;
	const msg = { k: "mhb", v: VERSION, b: BUILD, worn: CFG.gear_auto ? worn_items() : null, ledger: my_ledger(), bag_gear: bag_gear_names(), bag_lv: bag_gear_levels(), gear: CFG.gear_auto ? my_gear() : null, level: character.level, map: character.map, x: Math.round(character.x), y: Math.round(character.y),
		esize: character.esize, gold: character.gold, serving: state.serving || null, rip: !!character.rip, need: hold_missing(),
		fund: state.fund_need && character.gold - CFG.merchant.donate.keep < state.fund_need ? state.fund_need : 0 };
	Promise.resolve(send_cm(CFG.party.members || [], msg)).catch(() => {});
}
setInterval(() => { if (spent() < BUDGET.soft - RESERVE.chat) merchant_beat(); }, CFG.party.beat_ms);
// The fighter most in need of a visit: fewest free slots, then fewest potions
// We hold something that completes a fighter's missing must-hold item: the item itself, or its tokens
const can_supply_hold = (p) => (p.need || []).some((n) => held_any(n) > 0 || (hold_price(n) && held_any(CFG.hold[n]) > 0));
// Gear in the merchant's bags that's an upgrade for a fighter (bought at Ponty, fetched from the bank): deliver it
// (share_gear hands it over once near); one trip per piece per 20 min (v18.6)
const gear_trip_at = {};
function gear_target() {
	if (!is_merchant() || !CFG.gear_auto) return null;
	const needed = needed_slots(), now = Date.now();
	for (const it of character.items) {
		if (!it || it.l || it.b || !GEAR.has(G.items[it.name]?.type)) continue;
		const key = `${it.name}:${it.level || 0}`;
		if (now - (gear_trip_at[key] || 0) < 1_200_000 || needed.has(character.items.indexOf(it))) continue;
		const to = best_fighter_for(it); // v24.7: the fighter it helps most (was: the first in config order with any gain)
		if (to) return to.p; // serve() marks the pieces it carries
	}
	return null;
}
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
// Tokens the merchant holds go to the fighter with the fewest (merchant never spends them); one delivery per 30 min
let token_trip_at = 0;
const token_target = () => (is_merchant() && held_any("monstertoken") > 0 && Date.now() - token_trip_at > 1_800_000 ?
	partners().filter((p) => fresh(p) && p.ctype !== "merchant" && !p.rip).sort((a, b) => (a.tokens || 0) - (b.tokens || 0))[0] : null) || null;
function merchant_job() {
	const M = CFG.merchant;
	const need = (p) => (p.esize ?? 99) < M.serve_free || (p.pots && (p.pots.hp < M.serve_pots || p.pots.mp < M.serve_pots));
	const urgent = partners().filter(need).sort((a, b) => (a.esize ?? 99) - (b.esize ?? 99) ||
		Math.min(a.pots?.hp ?? 999, a.pots?.mp ?? 999) - Math.min(b.pots?.hp ?? 999, b.pots?.mp ?? 999))[0];
	// otherwise a delivery: a Tracktrix (or its tokens) we hold for a fighter that lacks one
	return urgent || (is_merchant() ? partners().find(can_supply_hold) : null) || token_target() || gear_target();
}
// Bag slot of a potion of this kind, preferring the configured tier, never the last self_pots
function pot_slot(kind) {
	let best = -1;
	character.items.forEach((it, k) => {
		const d = it && G.items[it.name];
		if (!d || d.type !== "pot" || !(d.gives || []).some(([g, v]) => g === kind && v > 0)) return;
		if (best < 0 || it.name === CFG[kind + "_pot"]) best = k;
	});
	return best;
}
async function give_pots(f) {
	for (const kind of ["hp", "mp"]) {
		const want = CFG.pot_buy - (f.pots?.[kind] ?? CFG.pot_buy);
		const spare = pot_count(kind) - CFG.merchant.self_pots;
		const k = pot_slot(kind);
		if (want < 20 || spare <= 0 || k < 0) continue;
		const q = Math.min(want, spare, character.items[k].q || 1), name = character.items[k].name, price = G.items[name]?.g || 0;
		await wait_budget(1, RESERVE.errand);
		await T(send_item(f.name, k, q)).then(() => {
			game_log(`merchant: ${q} ${name} → ${f.name}`, C.ok);
			// v23.0: the fighter pays for what it gets. The merchant used to buy every fighter's potions with its own
			// gold, and nothing refilled it once the fighters were under 3M, so it ran dry and stopped supplying. A bill
			// by cm; the fighter pays it from gold above its reserve the next time it's near us (merchant_handoff).
			if (price > 0 && typeof send_cm === "function") Promise.resolve(send_cm([f.name], { k: "bill", g: q * price, what: `${q} ${name}` })).catch(() => {});
		}).catch((e) => game_log(`merchant: potions to ${f.name}: ${why(e)}`, C.dim));
		if (f.pots) f.pots[kind] += q;
	}
}
// Tokens the merchant holds (fighters used to hand them over as loot) go to fighters still missing a must-hold item
// bought with them: the one closest to affording it first, just enough to complete it, the rest to the next
async function give_tokens() {
	// fighters first: our own copy of a must-hold item goes to a near fighter that lacks it (we're re-supplied later,
	// once every fighter has one)
	for (const n of Object.keys(CFG.hold || {})) {
		const f = partners_near(350).find((x) => Array.isArray(x.need) && x.need.includes(n));
		const k = character.items.findIndex((i) => i && i.name === n && !i.l);
		if (!f || k < 0) continue;
		await wait_budget(1, RESERVE.errand);
		await T(send_item(f.name, k, 1)).then(() => { f.need = f.need.filter((x) => x !== n); game_log(`merchant: gave our ${n} to ${f.name} (fighters first)`, C.ok); log_ev("give", { to: f.name, item: n }); })
			.catch((e) => game_log(`merchant: ${n} to ${f.name}: ${why(e)}`, C.dim));
	}
	for (const n of Object.keys(CFG.hold || {})) {
		const cur = CFG.hold[n], price = hold_price(n);
		if (!price) continue;
		const lacking = partners_near(350).filter((f) => Array.isArray(f.need) && f.need.includes(n)).sort((a, b) => (b.tokens || 0) - (a.tokens || 0));
		for (const f of lacking) {
			const have = held_any(cur), k = character.items.findIndex((i) => i && i.name === cur && !i.l);
			if (have <= 0 || k < 0) return;
			const q = Math.min(have, character.items[k].q || 1, Math.max(1, price - (f.tokens || 0)));
			await wait_budget(1, RESERVE.errand);
			await T(send_item(f.name, k, q)).then(() => { f.tokens = (f.tokens || 0) + q; game_log(`merchant: ${q} ${cur} → ${f.name} (for its ${n})`, C.ok); log_ev("give", { to: f.name, item: cur, q }); })
				.catch((e) => game_log(`merchant: tokens to ${f.name}: ${why(e)}`, C.dim));
		}
	}
	// the rest: the merchant never spends tokens; the near fighter holding the fewest gets them (it spends them on gear)
	for (const cur of new Set(["monstertoken", ...Object.values(CFG.hold || {})])) {
		const k = character.items.findIndex((i) => i && i.name === cur && !i.l);
		const f = partners_near(350).filter((x) => x.ctype !== "merchant").sort((a, b) => (a.tokens || 0) - (b.tokens || 0))[0];
		if (k < 0 || !f) continue;
		const q = character.items[k].q || 1;
		await wait_budget(1, RESERVE.errand);
		await T(send_item(f.name, k, q)).then(() => { f.tokens = (f.tokens || 0) + q; game_log(`merchant: ${q} ${cur} → ${f.name} (merchant doesn't spend tokens)`, C.ok); log_ev("give", { to: f.name, item: cur, q }); })
			.catch((e) => game_log(`merchant: tokens to ${f.name}: ${why(e)}`, C.dim));
	}
}
function mluck_near() {
	if (!G.skills.mluck || !can_use("mluck")) return;
	const ents = [character, ...others().map((n) => parent.entities?.[n])];
	const e = ents.find((x) => x && !x.rip && (x === character || (valid(x) && distance(character, x) < CFG.merchant.mluck_range)) &&
		!(x.s?.mluck && x.s.mluck.f === character.name && x.s.mluck.ms > 600_000)); // ours, with > 10 min left: fine
	if (e) fire("mluck", e);
}
// One service trip: stock potions, walk to the fighter (it moves: re-aim up to 4 times), hand potions to every fighter
// near, then wait for their items
async function serve(f) {
	await stand_close();
	const serve_t0 = Date.now();
	state.serving = f.name;
	// v24.7: only the pieces for this fighter (marking every piece paused deliveries to everyone else for 20 min)
	for (const it of character.items) if (it && GEAR.has(G.items[it.name]?.type) && best_fighter_for(it)?.name === f.name) gear_trip_at[`${it.name}:${it.level || 0}`] = Date.now();
	try {
		const M = CFG.merchant;
		// v24.12: enough for every fighter's shortfall to pot_buy (they're together: one trip tops all of them up)
		const short = (k) => partners().reduce((t, p) => t + Math.max(0, CFG.pot_buy - (p.pots?.[k] ?? CFG.pot_buy)), 0);
		const carry = Math.min(M.pot_carry, Math.max(short("hp"), short("mp"), 100)) + M.self_pots;
		await task_restock(carry, carry).catch((e) => game_log(`merchant: potions: ${why(e)}`, C.dim));
		for (let i = 0; i < 4; i++) {
			if (state.errand) state.errand_at = Date.now(); // each re-aimed walk is progress
			const q = state.partners[f.name];
			if (!fresh(q) || q.rip || q.errand === "town") return;
			const pos = partner_pos(q);
			if (pos.map === character.map && Math.hypot(pos.x - character.x, pos.y - character.y) < 150) break;
			await go({ map: pos.map, x: pos.x, y: pos.y });
		}
		for (const p of partners_near(350)) await give_pots(p);
		await give_tokens();
		token_trip_at = Date.now();
		const end = Date.now() + M.wait_ms;
		while (Date.now() < end && character.esize > 2 && !character.rip) {
			if (state.errand) state.errand_at = Date.now();
			mluck_near();
			const q = state.partners[f.name], pos = q && partner_pos(q);
			if (pos && pos.map === character.map && Math.hypot(pos.x - character.x, pos.y - character.y) > 200) move_to(pos.x, pos.y, 500);
			await sleep_ms(1000);
		}
		game_log(`merchant: served ${f.name} (${character.esize} slots free)`, C.dim);
		log_ev("serve", { who: f.name, secs: Math.round((Date.now() - serve_t0) / 1000), free: character.esize });
	} finally { state.serving = null; }
}
// ---- Monster tokens (CFG.token_auto) ----
// Best shop piece by points per token: class gear a member would wear (+0), not already owned (bags or bank)
// ---- Must-hold items (CFG.hold) ----
const hold_price = (n) => G.tokens?.[CFG.hold?.[n]]?.[n];
const hold_missing = () => Object.keys(CFG.hold || {}).filter((n) => G.items[n] && held_any(n) === 0);
// Tokens set aside for our own missing must-hold items that the bank can't supply
const token_reserve = () => hold_missing().filter((n) => !(state.bank_seen[n] > 0)).reduce((a, n) => a + (hold_price(n) || 0), 0);
// The merchant's missing must-hold item that we should buy: only the alphabetically first fighter that already holds
// its own copy and can afford another, so exactly one copy gets bought
function hold_for_merchant() {
	const M = merchant_hb();
	if (!CFG.hold_buy_for_merchant || !M || !Array.isArray(M.need) || is_merchant()) return null;
	for (const n of M.need) {
		const price = hold_price(n), cur = CFG.hold[n];
		if (hold_missing().includes(n) || partners().some((f) => (f.need || []).includes(n))) continue; // fighters first
		if (!price || state.bank_seen[n] > 0 || held_any(n) !== 1 || state.hold_for[n]) continue; // ours only, no extra yet
		const me = { name: character.name, tokens: held_any(cur), need: hold_missing() };
		const ok = [me, ...partners()].filter((f) => Array.isArray(f.need) && !f.need.includes(n) && (f.tokens || 0) >= price)
			.sort((a, b) => (a.name < b.name ? -1 : 1));
		if (ok[0]?.name === character.name) return { name: n, price, for: M.name, gain: 0, hold: true };
	}
	return null;
}
function token_pick() {
	const have = held_any("monstertoken"), shop = G.tokens?.monstertoken || {};
	if (!CFG.token_auto || have <= 0 || character.esize < 2 || is_merchant()) return null; // the merchant hands its tokens to fighters
	// must-hold items first: ours, then the merchant's
	for (const n of hold_missing()) {
		const price = hold_price(n);
		if (CFG.hold[n] === "monstertoken" && price && price <= have && !(state.bank_seen[n] > 0)) return { name: n, price, for: character.name, gain: 0, hold: true };
	}
	const mh = hold_for_merchant();
	if (mh) return mh;
	const budget = have - token_reserve(); // gear never spends tokens a missing must-hold item needs
	let best = null;
	for (const name in shop) {
		const price = shop[name];
		if (price > budget || !GEAR.has(G.items[name]?.type) || party_holds(name)) continue;
		for (const m of gear_takers().filter((x) => x.ctype !== "merchant")) {
			const r = gear_gain({ name, level: 0 }, m.ctype, m.g);
			if (r && (!best || r.gain / price > best.v)) best = { name, price, for: m.name, gain: Math.round(r.gain), v: r.gain / price };
		}
	}
	return best;
}
async function task_tokens() {
	let n = 0;
	for (let i = 0; i < 5; i++) {
		const b = token_pick();
		if (!b) break;
		await go_npc("monsterhunter");
		await wait_budget(1, RESERVE.errand);
		try {
			await T(exchange_buy("monstertoken", b.name));
			n++;
			if (b.hold && b.for !== character.name) state.hold_for[b.name] = { to: b.for, at: Date.now() };
			game_log(`tokens: bought ${b.name} (${b.price} tokens) for ${b.for} (+${b.gain} pts)`, C.ok);
			log_ev("buy", { item: b.name, src: "tokens", for: b.for });
			await until(() => held_any(b.name) > 0, 3000);
		} catch (e) { game_log(`tokens: ${b.name}: ${why(e)}`, C.dim); skip("town:tokens", pause_ms(e, 3600_000), why(e)); break; }
	}
	return n;
}
// ---- Secondhands (Ponty) ----
const shop_price = (it) => {
	const f = typeof calculate_item_value === "function" ? calculate_item_value : parent?.calculate_item_value;
	const v = f ? f(it) : (G.items[it.name]?.g || 0) * 0.6;
	return Math.ceil(v * (G.items[it.name]?.cash ? 3 : 2) * (it.q || 1));
};
// Worth buying: an upgrade for a fighter, or the last copy a compound set (bags + bank) is missing
function secondhand_reason(it, groups) {
	if (!it || !G.items[it.name]) return null;
	const price = shop_price(it);
	for (const x of gear_takers().slice(1).filter((x) => x.ctype !== "merchant")) {
		// someone already has one at this level or better: deliver that instead (v24.7: any copy of the name used to block it)
		const lv = it.level || 0;
		if (best_level_held(it.name) >= lv || (state.bank_gear || []).some((b) => b.name === it.name && (b.level || 0) >= lv) || party_holds_level(it.name, lv)) break;
		const r = gear_gain(it, x.ctype, x.g);
		if (r && price <= r.gain * CFG.secondhand_gold_per_pt) return `upgrade for ${x.name} (+${Math.round(r.gain)} pts)`;
	}
	const g = G.items[it.name].compound && !it.p && (it.level || 0) < CFG.compound_max_level &&
		groups[compound_key(it.name, it.level || 0)];
	// v24.15: only when the result would be worn — compounding for its own sake roughly breaks even at an NPC, and a Ponty
	// copy costs twice its value; the merchant's twelve unwanted Amulet of HP +2 were built partly this way
	const up = g && gear_takers().slice(1).filter((x) => x.ctype !== "merchant").some((x) => gear_gain({ name: it.name, level: (it.level || 0) + 1 }, x.ctype, x.g));
	if (g && up && (g.bags + g.bank) % 3 === 2) return "completes a compound set";
	return null;
}
let secondhand_at = 0;
async function task_secondhands() {
	const ref = G.maps.main?.ref?.secondhands;
	if (!ref) return 0;
	await stand_close();
	if (character.map !== "main" || Math.hypot(character.x - ref.x, character.y - ref.y) > 400) await go({ map: "main", x: ref.x, y: ref.y + 40 });
	parent.socket.emit("secondhands");
	await sleep_ms(1500); // the list arrives as a "secondhands" event; the client keeps it in parent.secondhands
	const list = [...(parent.secondhands || [])];
	// compound counts by name:level across bags + bank (spares only), to spot sets one copy short
	const groups = {}, needed = needed_slots();
	const count = (it, where) => { const k = compound_key(it.name, it.level || 0); (groups[k] = groups[k] || { bags: 0, bank: 0 })[where]++; };
	character.items.forEach((it, k) => { if (compound_spare(it, k, needed)) count(it, "bags"); });
	for (const it of state.bank_gear || []) if (compound_spare(it, -1, needed)) count(it, "bank");
	let n = 0;
	for (const it of list) {
		if (state.errand) state.errand_at = Date.now();
		const why_buy = secondhand_reason(it, groups), price = shop_price(it);
		if (!why_buy || price > CFG.secondhand_max_price || character.gold - price < CFG.gold_reserve || character.esize < 3 || !gold_ok(price)) continue;
		await wait_budget(1, RESERVE.errand);
		const before = character.esize;
		tag_spend("ponty");
		parent.socket.emit("sbuy", { rid: it.rid });
		await until(() => character.esize < before, 3000);
		if (character.esize < before) {
			n++;
			game_log(`secondhands: bought ${it.name}+${it.level || 0} for ${fmt_k(price)} (${why_buy})`, C.ok);
			log_ev("buy", { item: `${it.name}+${it.level || 0}`, src: "secondhands", price });
			if (why_buy.startsWith("completes")) count(it, "bags");
		}
	}
	try { if (typeof parent.hide_modal === "function") parent.hide_modal(); } catch (e) {} // the list opens Ponty's window: close it
	return n;
}
// ---- Bank housekeeping (merchant) ----
let recipe_inputs = null; // every item any crafting recipe uses (anyone's quests): never purged
function purge_ok(it) {
	const d = it && G.items[it.name];
	if (!recipe_inputs) { recipe_inputs = new Set(); for (const id in G.craft || {}) for (const [, n] of G.craft[id].items || []) recipe_inputs.add(n); }
	if (!d || it.l || it.b || d.e || !tradeable(it.name) || CFG.keep.includes(it.name) || state.needs.has(it.name) ||
		recipe_inputs.has(it.name) || gear_wanted_by(it)) return false;
	if (d.compound && compound_groups().some((g) => g.name === it.name && g.level === (it.level || 0))) return false;
	return true;
}
// In the bank with it nearly full: pull the least valuable purgeable items (this floor's packs)
async function bank_purge() {
	const M = CFG.merchant, bf = state.bank_free;
	if (!bf || bf.free >= bf.total * M.purge_below || character.esize < M.purge_n + 4) return 0;
	const packs = bank_packs_list(), cands = [];
	for (const p in character.bank) {
		if (!p.startsWith("items") || (packs[p] && packs[p][0] !== character.map)) continue;
		(character.bank[p] || []).forEach((it, n) => { if (it && purge_ok(it)) cands.push({ p, n, it, v: unit_value(it) * (it.q || 1) }); });
	}
	cands.sort((a, b) => a.v - b.v);
	let got = 0;
	for (const c of cands.slice(0, M.purge_n)) {
		await wait_budget(1, RESERVE.bulk);
		await T(bank_retrieve(c.p, c.n)).then(() => { got++; state.purge[purge_key(c.it)] = Date.now(); }).catch(() => {});
		await sleep_ms(PACE_MS);
	}
	if (got) { game_log(`bank: ${bf.free}/${bf.total} free — pulled ${got} low-value items to sell/list`, C.info); log_ev("purge", { n: got, free: bf.free, total: bf.total }); }
	return got;
}
// ---- Merrit: a stand spot that earns Market Parcels ----
const in_rect = (x, y, r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
// Fixed NPCs on Mainland (roamers — citizens, ones with a boundary or a loop — don't count)
function fixed_npcs() {
	const out = [];
	for (const n of G.maps.main?.npcs || []) {
		if (/^citizen/.test(n.id || "") || n.boundary || n.loop) continue;
		if (Array.isArray(n.position)) out.push(n.position);
		for (const p of n.positions || []) if (Array.isArray(p)) out.push(p);
	}
	return out;
}
// Can a stand stand here? Region, NPC and stand spacing, and walkable straight from (0,0) (Merrit's centre)
function spot_ok(x, y) {
	const M = CFG.merchant.merrit;
	if (!in_rect(x, y, M.square) && !in_rect(x, y, M.aisle)) return false;
	if (fixed_npcs().some(([nx, ny]) => Math.hypot(nx - x, ny - y) <= M.npc_gap)) return false;
	for (const e of Object.values(parent.entities || {})) {
		if (!e || e.type !== "character" || !e.stand || e.name === character.name || e.map && e.map !== "main") continue;
		const dx = Math.abs(e.x - x), dy = Math.abs(e.y - y);
		if (Math.hypot(dx, dy) <= M.stand_gap || (dx <= M.stand_gap && dy <= M.stand_vgap)) return false;
	}
	if (typeof can_move === "function") {
		try { if (!can_move({ map: "main", x: 0, y: 0, going_x: x, going_y: y, base: character.base || { h: 8, v: 7, vn: 2 } })) return false; } catch (e) {}
	}
	return true;
}
// Our spot: the saved one while it still qualifies, else the qualifying grid point nearest (0,0)
function merrit_spot() {
	const M = CFG.merchant.merrit;
	if (state.mspot && spot_ok(state.mspot.x, state.mspot.y)) return state.mspot;
	const pts = [];
	for (const r of [M.square, M.aisle]) for (let x = r[0]; x <= r[2]; x += M.step) for (let y = r[1]; y <= r[3]; y += M.step) pts.push([x, y]);
	pts.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
	const p = pts.find(([x, y]) => spot_ok(x, y));
	state.mspot = p ? { x: p[0], y: p[1] } : null;
	if (p) game_log(`merrit: stand spot ${p[0]},${p[1]}`, C.dim);
	return state.mspot;
}
const merrit_on = () => is_merchant() && !!CFG.merchant.merrit?.enabled;
// Parcel arrivals (any item named "Market Parcel"): counted every 30s on the merchant
let parcel_ids = null, parcels_prev = null;
const parcel_count = () => {
	if (!parcel_ids) parcel_ids = Object.keys(G.items).filter((n) => /market parcel/i.test(G.items[n]?.name || ""));
	return parcel_ids.reduce((a, n) => a + held_any(n), 0);
};
setInterval(() => {
	if (!merrit_on()) return;
	const n = parcel_count();
	if (parcels_prev !== null && n > parcels_prev) { state.parcel_at = Date.now(); log_ev("parcel", { n: n - parcels_prev }); game_log(`merrit: Market Parcel received`, C.ok); }
	parcels_prev = n;
	if (!character.stand || character.moving || walking()) state.stand_since = 0;
	else if (!state.stand_since) state.stand_since = Date.now();
}, 30_000);
// ---- Stand (CFG.merchant.stand) ----
const TRADE_SLOTS = Array.from({ length: 16 }, (_, i) => "trade" + (i + 1));
const unit_value = (it) => {
	const f = typeof calculate_item_value === "function" ? calculate_item_value : parent?.calculate_item_value;
	return Math.max(1, Math.round(f ? f({ ...it, q: 1 }) : (G.items[it.name]?.g || 0) * 0.6));
};
function stand_worthy(it, k, needed, cmp) {
	const d = it && G.items[it.name], S_ = CFG.merchant.stand;
	if (!d || it.l || it.b || needed.has(k) || cmp.has(k) || CFG.keep.includes(it.name) || !tradeable(it.name) || gear_wanted_by(it)) return false;
	return unit_value(it) >= S_.min_value || (GEAR.has(d.type) && (it.level || 0) >= 3) || item_grade(it) >= 1 || !!it.p;
}
// Bag slots held back for the stand: the most valuable candidates, as many as there are free trade slots
let stand_cache = null;
function stand_hold() {
	if (!CFG.merchant?.stand?.enabled || !is_merchant()) return new Set();
	const key = character.items.map((i) => (i ? i.name + (i.level || 0) + (i.q || 1) : "")).join() + Object.keys(state.stand).length;
	if (stand_cache && stand_cache.key === key && Date.now() - stand_cache.at < 2000) return stand_cache.set;
	const needed = needed_slots(), cmp = compound_slots(needed), free = TRADE_SLOTS.length - Object.keys(state.stand).length;
	const ks = character.items.map((it, k) => (stand_worthy(it, k, needed, cmp) ? k : -1)).filter((k) => k >= 0)
		.sort((a, b) => unit_value(character.items[b]) - unit_value(character.items[a])).slice(0, Math.max(0, free));
	stand_cache = { key, at: Date.now(), set: new Set(ks) };
	return stand_cache.set;
}
async function stand_close() {
	if (!character.stand || typeof close_stand !== "function") return;
	await T(close_stand(), 3000).catch(() => {});
	await until(() => !character.stand, 2000);
}
// Idle at home: open the stand, notice sales, cut stale prices, list new stock (one listing action per call)
let stand_busy = false;
async function stand_tick() {
	const S_ = CFG.merchant.stand;
	if (!S_?.enabled || stand_busy || walking() || errand_busy()) return;
	stand_busy = true;
	try {
		const now = Date.now(), sl = character.slots || {};
		// sales: a listing whose slot emptied (we only take items down by re-listing, which updates state first)
		if (character.stand) for (const slot in state.stand) { // trade slots are only reliable while the stand is open
			const L_ = state.stand[slot], cur = sl[slot];
			const unit = L_.per_unit ? L_.price : L_.price / Math.max(1, L_.q);
			// v24.7: with per-unit prices a buyer can take part of a stack: the slot keeps the item with a smaller q
			if (cur && cur.name === L_.name && (cur.q || 1) < (L_.q || 1)) {
				const q_s = (L_.q || 1) - (cur.q || 1);
				log_ev("sold", { item: `${L_.name}+${L_.level}`, q: q_s, price: Math.round(unit * q_s) });
				game_log(`stand: sold ${q_s} of ${L_.name} for ${fmt_k(Math.round(unit * q_s))}`, C.gold || C.ok);
				L_.q = cur.q || 1;
				continue;
			}
			if (cur && cur.name === L_.name) continue;
			{
				log_ev("sold", { item: `${L_.name}+${L_.level}`, q: L_.q, price: Math.round(unit * (L_.q || 1)) });
				game_log(`stand: sold ${L_.name}+${L_.level}${L_.q > 1 ? " x" + L_.q : ""} for ${fmt_k(Math.round(unit * (L_.q || 1)))}`, C.gold || C.ok);
				delete state.stand[slot];
			}
		}
		if (!character.stand) {
			let k = character.items.findIndex((i) => i && G.items[i.name]?.stand);
			if (k < 0) {
				if (skipped("stand:buy") || character.gold < (G.items[S_.item]?.g || 40000) + CFG.merchant.donate.keep) return;
				skip("stand:buy", 6 * 3600_000, "buying a stand");
				await buy_from_npc(S_.item, 1).catch((e) => game_log(`stand: buying ${S_.item}: ${why(e)}`, C.dim));
				return;
			}
			await T(open_stand(k), 3000).catch(() => {});
			return;
		}
		// v19.7: a listed piece that's now an upgrade for one of us comes off the stand
		for (const slot in state.stand) {
			const cur = sl[slot];
			if (!cur || !GEAR.has(G.items[cur.name]?.type) || !wanted_by_member(cur)) continue;
			await T(unequip(slot), 5000).then(() => game_log(`stand: took ${cur.name}+${cur.level || 0} down — an upgrade for the party`, C.ok)).catch(() => {});
			delete state.stand[slot];
			return;
		}
		// price cuts: re-list at the lower price
		for (const slot in state.stand) {
			const L_ = state.stand[slot];
			// v24.5: the server's price is per unit (a buyer pays price x q); stacks were listed at q times their value.
			// A stack listed before (no per_unit) is re-listed at once at the per-unit price.
			const old = L_.q > 1 && !L_.per_unit;
			if (!old && now - (L_.cut_at || L_.at) < S_.cut_every_h * 3600_000) continue;
			const min_price = Math.ceil(L_.value * S_.floor);
			const next = old ? Math.ceil(L_.value * S_.markup) : Math.max(min_price, Math.floor(L_.price * (1 - S_.cut)));
			L_.cut_at = now;
			if (next >= L_.price) { L_.per_unit = true; continue; }
			await T(unequip(slot), 5000).catch(() => {});
			const k = character.items.findIndex((i) => i && i.name === L_.name && (i.level || 0) === L_.level);
			if (k < 0) { delete state.stand[slot]; return; }
			await T(trade(k, slot, next, L_.q), 5000).then(() => { L_.price = next; L_.per_unit = true; game_log(`stand: ${L_.name} now ${fmt_k(next)}${L_.q > 1 ? " each" : ""}`, C.dim); })
				.catch(() => delete state.stand[slot]);
			return;
		}
		// new listing
		const slot = TRADE_SLOTS.find((t) => !sl[t] && !state.stand[t]);
		const k = [...stand_hold()][0];
		if (!slot || k === undefined) return;
		const it = character.items[k], q = it.q || 1, value = unit_value(it), price = Math.ceil(value * S_.markup); // per unit
		await wait_budget(1, RESERVE.errand);
		await T(trade(k, slot, price, q), 5000).then(() => {
			state.stand[slot] = { name: it.name, level: it.level || 0, q, price, value, at: now, per_unit: true };
			stand_cache = null;
			game_log(`stand: listed ${it.name}+${it.level || 0}${q > 1 ? " x" + q : ""} at ${fmt_k(price)}${q > 1 ? " each" : ""} (value ${fmt_k(value)}${q > 1 ? " each" : ""})`, C.dim);
		}).catch((e) => game_log(`stand: listing ${it.name}: ${why(e)}`, C.dim));
	} finally { stand_busy = false; }
}
// Donate gold above donate.keep for XP while below donate.to_level (once a minute, idle in town only)
let donate_at = 0;
function merchant_donate() {
	const D = CFG.merchant.donate, now = Date.now();
	if (!D || character.level >= D.to_level || now - donate_at < 60_000 || character.map === "bank") return false;
	donate_at = now;
	const day = state.donated && now - state.donated.since < 86_400_000 ? state.donated : (state.donated = { since: now, g: 0 });
	const g = Math.floor(Math.min(character.gold - D.keep, D.chunk, D.per_day - day.g, gold_room()));
	if (g < 100_000 || !can_spend(1, RESERVE.errand)) return false; // < 100k: the server's "low" donation, skip
	tag_spend("donations");
	parent.socket.emit("donate", { gold: g });
	day.g += g;
	save_state();
	game_log(`merchant: donated ${fmt_k(g)} gold for XP (${fmt_k(day.g)} today, level ${character.level} → ${D.to_level})`, C.info);
	return true;
}
let merchant_trip_at = 0;
function merchant_tick() {
	const f = merchant_job();
	set_message(`${errand_busy() ? state.errand + " | " : ""}merchant${f ? " → " + f.name : ""} | ${character.esize} free`);
	if (walking() || errand_busy()) return;
	mluck_near();
	const MM = CFG.merchant.merrit;
	const urgent = f && ((f.esize ?? 99) < MM.urgent_free || Math.min(f.pots?.hp ?? 999, f.pots?.mp ?? 999) < MM.urgent_pots);
	const settling = merrit_on() && character.stand && state.stand_since && Date.now() - state.stand_since < MM.min_stay_ms;
	if (f && character.esize >= 8 && Date.now() - merchant_trip_at > CFG.merchant.trip_gap_ms && (!settling || urgent)) {
		merchant_trip_at = Date.now();
		return void errand("serve", () => serve(f));
	}
	merchant_donate();
	if (CFG.secondhand_auto && Date.now() - secondhand_at > CFG.secondhand_every_ms && character.esize >= 5 && !settling) { // Ponty can wait for Merrit
		secondhand_at = Date.now();
		return void errand("secondhands", () => task_secondhands());
	}
	// idle: stand at the Merrit spot (or near the town spawn without it); standing still there is what earns parcels
	if (merrit_on()) {
		const sp = merrit_spot();
		if (sp) {
			const here = character.map === "main" && Math.hypot(character.x - sp.x, character.y - sp.y) <= 12;
			if (here && !character.moving) {
				// arrived (smart_move stops a few px short): keep where we are if that spot qualifies too
				if (Math.hypot(character.x - sp.x, character.y - sp.y) > 2 && spot_ok(character.x, character.y)) state.mspot = { x: Math.round(character.x), y: Math.round(character.y) };
				return void stand_tick().catch(() => {});
			}
			if (here) return;
			if (character.stand) return void stand_close();
			if (character.map === "main" && Math.hypot(character.x - sp.x, character.y - sp.y) < 150 && can_move_to(sp.x, sp.y)) return void move_to(sp.x, sp.y, 1000);
			return void travel({ map: "main", x: sp.x, y: sp.y });
		}
	}
	const home = G.maps.main?.spawns?.[0] || [0, 0];
	if (character.map !== "main" || Math.hypot(character.x - home[0], character.y - home[1]) > 250) {
		if (character.stand) return void stand_close();
		travel({ map: "main", x: home[0], y: home[1] });
	} else if (!character.moving) stand_tick().catch(() => {});
}
// Fighter side: with the merchant within 300px, hand it bankable/sellable items (one per 0.7s, never what a member
// would wear) and, if we're the richest fighter near, top its gold up to the float
let handoff_busy = false, merchant_gold_at = 0;
async function merchant_handoff() {
	const M = merchant_hb();
	if (!M || handoff_busy || character.rip || M.rip || M.map !== character.map || typeof send_item !== "function") return;
	const e = parent.entities?.[M.name], pos = e || M;
	if (Math.hypot(pos.x - character.x, pos.y - character.y) > 300) return;
	handoff_busy = true;
	try {
		// v23.0: pay the merchant's potion bills first, from gold above our reserve (the rest stays owed)
		if ((state.owe || 0) >= 1 && typeof send_gold === "function") {
			const pay = Math.floor(Math.min(state.owe, character.gold - CFG.gold_reserve));
			if (pay >= 1) await send_own_gold(M.name, pay).then(() => { state.owe = Math.max(0, state.owe - pay); save_state(); game_log(`merchant: paid ${fmt_k(pay)} for potions`, C.dim); }).catch(() => {});
		}
		const fighters = [{ name: character.name, gold: character.gold }, ...partners_near(400)];
		const richest = fighters.sort((a, b) => (b.gold || 0) - (a.gold || 0))[0];
		// project funding (upgrade/craft steps the merchant can't pay for), from the richest near, above fund_keep
		if (richest.name === character.name && M.fund > 0 && Date.now() - (state.fund_sent_at || 0) > 600_000 &&
			character.gold - M.fund >= CFG.merchant.fund_keep && typeof send_gold === "function") {
			state.fund_sent_at = Date.now();
			await send_own_gold(M.name, Math.round(M.fund)).then(() => game_log(`merchant: funded its project with ${fmt_k(M.fund)}`, C.ok)).catch(() => {});
		}
		if (richest.name === character.name && M.gold < CFG.merchant.float && character.gold > CFG.merchant.float * 3 &&
			Date.now() - merchant_gold_at > 1800_000 && typeof send_gold === "function") {
			merchant_gold_at = Date.now();
			const g = Math.round(CFG.merchant.float - M.gold);
			await send_own_gold(M.name, g).then(() => game_log(`merchant: sent ${M.name} ${g} gold`, C.ok)).catch(() => {});
		}
		if ((M.esize ?? 0) <= 2) return;
		// a must-hold item we bought for the merchant: hand it over (we keep our own copy)
		for (const n in state.hold_for) {
			if (!(M.need || []).includes(n)) { if (held_any(n) < 2 || Date.now() - state.hold_for[n].at > 86_400_000) delete state.hold_for[n]; continue; }
			const k = character.items.findIndex((it) => it && it.name === n && !it.l);
			if (k < 0 || held_any(n) < 2 || !can_spend(1, RESERVE.errand)) continue;
			await T(send_item(M.name, k, 1)).then(() => { delete state.hold_for[n]; game_log(`merchant: gave ${n} (its own copy)`, C.ok); log_ev("give", { to: M.name, item: n }); })
				.catch((er) => game_log(`merchant: giving ${n}: ${why(er)}`, C.dim));
			return;
		}
		const needed = needed_slots(), cmp = compound_slots(needed);
		// v23.1: a piece that's an upgrade for a partner who isn't near goes to the merchant, which delivers it
		// (gear_target → serve → share_gear). share_gear only reaches members within gear_share_range, which split
		// fighters rarely are, so such pieces used to sit in our bags. Not for pieces we'd wear ourselves.
		const near_n = new Set(partners_near(CFG.gear_share_range).map((p) => p.name)), mine = my_gear();
		const gk = character.items.findIndex((it, i) => {
			if (!it || it.l || it.b || needed.has(i) || !GEAR.has(G.items[it.name]?.type) || (!equip_paused(it) && gear_gain(it, character.ctype, mine))) return false;
			const want = gear_takers().slice(1).filter((m) => gear_gain(it, m.ctype, m.g));
			return want.length > 0 && !want.some((m) => near_n.has(m.name));
		});
		if (gk >= 0 && can_spend(1, RESERVE.errand)) {
			const it = character.items[gk];
			await T(send_item(M.name, gk, 1)).then(() => { M.esize--; game_log(`merchant: gave ${it.name}+${it.level || 0} to deliver (an upgrade for a partner away)`, C.dim); log_ev("give", { to: M.name, item: `${it.name}+${it.level || 0}`, deliver: true }); })
				.catch((er) => game_log(`merchant: giving ${it.name}: ${why(er)}`, C.dim));
			return;
		}
		const k = character.items.findIndex((it) => it && ["bank", "sell"].includes(bag_class(it, needed, cmp)) && !gear_wanted_by(it));
		if (k < 0 || !can_spend(1, RESERVE.errand)) return;
		const it = character.items[k];
		await T(send_item(M.name, k, it.q || 1)).then(() => { M.esize--; game_log(`merchant: gave ${it.name}${it.q > 1 ? " x" + it.q : ""}`, C.dim); })
			.catch((er) => game_log(`merchant: giving ${it.name}: ${why(er)}`, C.dim));
	} finally { handoff_busy = false; }
}
setInterval(() => { merchant_handoff().catch(() => {}); }, 700);

// Gold balance (see CFG.party.gold): only the richest member acts, toward the poorest. The every_h window is one
// party-wide clock (max of all members' last-transfer times, persisted), so a reload anywhere can't reset it.
// send_gold needs both on the same map within 400px and the sender not in the bank.
let gold_inflight = false;
function gold_balance() {
	const G_ = CFG.party.gold;
	if (!G_?.enabled || !in_party_cfg() || gold_inflight || character.rip || typeof send_gold !== "function") return null;
	const known = partners().filter((m) => Number.isFinite(m.gold)); // gold not heard yet (first beat) → skip them
	if (!known.length || known.some((m) => m.gold > character.gold)) return null; // not the richest: someone else acts
	const p = known.sort((a, b) => a.gold - b.gold)[0];              // the poorest
	const rich = character.gold, poor = p.gold;
	if (rich < G_.min_rich || poor >= rich * G_.min_ratio) return null;
	if (Date.now() - (state.gold_xfer_at || 0) < G_.every_h * 3600_000) return null;
	if (Date.now() < (state.gold_retry_at || 0)) return null;
	const pos = partner_pos(p);
	if (pos.map !== character.map || Math.hypot(pos.x - character.x, pos.y - character.y) > 350 || on_bank_floor() || p.map.startsWith("bank")) return "not together";
	const amount = Math.floor(rich * G_.give);
	gold_inflight = true;
	Promise.resolve(send_own_gold(p.name, amount))
		.then(() => {
			state.gold_xfer_at = Date.now();
			save_state();
			game_log(`gold: sent ${amount.toLocaleString()} to ${p.name} (they had ${poor.toLocaleString()}, < ${G_.min_ratio * 100}% of our ${rich.toLocaleString()})`, C.gold);
		})
		.catch((e) => { state.gold_retry_at = Date.now() + 600_000; game_log(`gold: sending to ${p.name} failed: ${why(e)} (retry in 10 min)`, C.dim); })
		.finally(() => (gold_inflight = false));
	return "sent";
}
setInterval(() => { try { gold_balance(); } catch (e) {} }, 15_000);

// Priests heal whoever in the party is lowest (partyheal when two or more are hurt)
// Priests: heal the lowest member below heal_at (partyheal when 2+ are hurt and it's ready); walk toward a hurt member
// out of range. Returns true when a heal was cast (it shares the attack cooldown).
function party_heal() {
	if (character.ctype !== "priest") return false;
	const members = [character];
	for (const n of others()) { const e = parent.entities?.[n]; if (e && !e.rip && valid(e)) members.push(e); }
	const low = members.filter((m) => m.hp < m.max_hp * CFG.party.heal_at).sort((a, b) => a.hp / a.max_hp - b.hp / b.max_hp);
	if (!low.length) return false;
	if (low.length >= 2 && can_use("partyheal")) return fire("partyheal"), true;
	const m = low[0];
	if (m !== character && distance(character, m) > character.range) { if (!walking()) move_to(m.x, m.y, 300); return false; } // close in
	return !is_on_cooldown("heal") && fire("heal", m);
}
// Follower: stay with the leader, shoot its target (or whatever is hitting the party), heal
function follower_tick() {
	const L = leader_hb();
	if (L.rip) return void hold_grind(); // leader dead: grind what we can solo here until it walks back
	state.hold = null;
	// v24.8: a fleeing leader sends no pack: keep ours and hold it (as on its errands) instead of walking to its town spot
	state.pack = L.pack && valid_boundary(L.pack.boundary) ? { mtype: L.pack.mtype, map: L.pack.map, boundary: L.pack.boundary, directive: `following ${L.name}`, probe: !!L.pack.probe }
		: L.recovering && state.pack ? state.pack : null;
	state.last_target_at = Date.now();
	if (party_heal()) return;
	const lm = !walking() ? looming() : null; // v24.14; v24.16: not mid-walk
	if (lm) { keep_away(lm); const a = hit_on_me(); if (a && a !== lm) fight(a, false); return; }
	// v18.8: the leader on an errand (town, bank...) → stay and fight at its pack instead of walking to town with it
	// and back (every leader trip used to move the whole party)
	// v24.10: also, while split (a member with nothing of its own to farm follows for a while), straight to the leader's
	// spot while the leader is still walking there — chasing its position across maps crossed paths with it
	const L_off = !!state.pack && split_now() && !(L.map === state.pack.map && Number.isFinite(L.x) &&
		in_rect(L.x, L.y, [state.pack.boundary[0] - 300, state.pack.boundary[1] - 300, state.pack.boundary[2] + 300, state.pack.boundary[3] + 300]));
	const away = (!!L.errand || !!L.recovering || L_off) && !!state.pack;
	let pos = away ? { map: state.pack.map, x: (state.pack.boundary[0] + state.pack.boundary[2]) / 2, y: (state.pack.boundary[1] + state.pack.boundary[3]) / 2 } : partner_pos(L);
	// v24.18: convoy — the slowest of us walks to the spot; the others follow it (not the leader)
	const CH = !away && state.pack ? convoy_head() : null;
	if (CH === character.name) pos = { map: state.pack.map, x: (state.pack.boundary[0] + state.pack.boundary[2]) / 2, y: (state.pack.boundary[1] + state.pack.boundary[3]) / 2 };
	else if (CH && CH !== L.name && state.partners[CH]) pos = partner_pos(state.partners[CH]);
	const lt = !away && L.target && parent.entities[L.target];
	const leader_t = lt && valid(lt) && lt.type === "monster" ? lt : null;
	// the tank picks (attackers first, then the pack's monster near the leader); others assist the tank, then the leader
	const easy = CFG.party.spread && !away && state.pack && !state.pack.probe && spread_ok(state.pack.mtype);
	// v24.8: what's hitting us first, always; spread: then a free monster, before one already on a partner (it was
	// choose_target first, which piled everyone onto the priest's monster)
	let t = easy ? hit_on_me() || spread_pick(pos, L) || choose_target(false) || leader_t
		: i_am_tank() ? choose_target(false) || follower_pick(pos) || leader_t : hit_on_me() || caller_target() || leader_t || choose_target(false) || follower_pick(pos);
	announce_target(t);
	// engaged = a target within wait_radius of the leader: stay on it (close in, then hold position in reach) instead of
	// drifting back to the leader — melee used to step back to the leader after every swing at a target that wasn't
	// attacking it, and only hit what wandered into range
	const engaged = !!t && pos.map === character.map && Math.hypot(t.x - pos.x, t.y - pos.y) <= CFG.party.wait_radius;
	if (t) {
		if (get_targeted_monster() !== t) change_target(t);
		if (engaged) break_walk_for(t);
		// close in on targets out of reach; kiting (ranged, when the target is on us) takes precedence
		if (engaged && !walking() && !errand_busy() && !kite(t) && distance(character, t) > standoff(t).reach) approach(t);
		if (!hold_for_tank(t) && !class_skills(t) && can_attack(t)) fire("attack", t);
	}
	if (engaged || walking() || errand_busy()) return;
	const d = pos.map === character.map ? Math.hypot(pos.x - character.x, pos.y - character.y) : Infinity;
	// v24.16: not along a way the vampire rats (or the like) make deadly: hold here; the leader picks spots reachable by all
	if (d > CFG.party.follow_far && pos.map !== character.map) {
		const rd = route_danger(pos.map, pos.x, pos.y);
		if (rd) { state.follow_block = { rd, at: Date.now() }; return void set_message(`not following ${L.name}: the way passes ${rd}`); }
	}
	state.follow_block = null;
	if (d > CFG.party.follow_far) travel(pos);
	else if (d > CFG.party.follow) {
		const ang = Math.atan2(character.y - pos.y, character.x - pos.x);
		const want = { x: pos.x + Math.cos(ang) * CFG.party.follow * 0.6, y: pos.y + Math.sin(ang) * CFG.party.follow * 0.6 };
		if (can_move_to(want.x, want.y)) move_to(want.x, want.y, 300); else travel(pos);
	}
}
// Easy enough to split up on: we'd kill it ALONE within spread_ttk, safely (v23.0: judged solo — no partner damage,
// tank or heals; it used to be the party-assisted verdict)
function spread_ok(mt) {
	if (state.spread_c && state.spread_c.mt === mt && Date.now() - state.spread_c.at < 30_000) return state.spread_c.ok;
	const pf = fight_profile(mt); // the party verdict: what following (live_ok) uses
	if (pf) state.safe[mt] = pf; else delete state.safe[mt]; // followers don't run pick_pack: live_ok reads this
	const sf = farmable_type(mt) && fight_math(G.monsters[mt], false, true);
	const ok = !!sf && safe_enough(sf, mt) && sf.ttk <= CFG.party.spread_ttk;
	state.spread_c = { mt, at: Date.now(), ok };
	return ok;
}
// Our own monster of the pack's type near the leader that no member is already hitting (spread mode)
function spread_pick(pos, L) {
	const mt = state.pack?.mtype, taken = new Set([L?.target, ...partners().map((p) => p.target)].filter(Boolean));
	if (!mt || pos.map !== character.map) return null;
	let best = null, bd = Infinity;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.mtype !== mt || taken.has(e.id) || !farmable_entity(e) || !valid(e) || (e.target && e.target !== character.name)) continue;
		if (Math.hypot(e.x - pos.x, e.y - pos.y) > CFG.party.wait_radius || !live_ok(e) || !entity_profile(e, true)) continue; // this one, alone
		const d = distance(character, e);
		if (d < bd && can_move_to(e)) (best = e), (bd = d);
	}
	return best;
}
// Follower with nothing to hit (the leader one-shots its targets, e.g. goos): take our own monster of the leader's
// pack type within wait_radius of the leader. Followers don't run pick_pack, so its safety is checked here (30s cache).
function follower_pick(pos) {
	const mt = state.pack?.mtype;
	if (!mt || pos.map !== character.map) return null;
	if (state.pack.probe) state.safe[mt] = { ttk: 5, xp: G.monsters[mt]?.xp || 0, probe: true }; // the leader is probing it
	else if (Date.now() - (state.fsafe_at || 0) > 30_000 || state.fsafe_mt !== mt) {
		const f = fight_profile(mt);
		if (f) state.safe[mt] = f; else delete state.safe[mt];
		state.fsafe_at = Date.now(); state.fsafe_mt = mt;
	}
	if (!state.safe[mt]) return null;
	const e = choose_target(true);
	return e && e.mtype === mt && Math.hypot(e.x - pos.x, e.y - pos.y) <= CFG.party.wait_radius ? e : null;
}
// Follower whose leader is dead: grind whatever it can SOLO near where it is (wait_radius), drift back when idle.
// Solo safety: partners_near() leaves out dead members, so fight_math leaves out its damage and heals.
function hold_grind() {
	if (!state.hold || state.hold.map !== character.map) {
		state.hold = { map: character.map, x: character.x, y: character.y };
		live_cache.clear();
	}
	const h = state.hold, R = CFG.party.wait_radius;
	state.last_target_at = Date.now();
	if (party_heal()) return true;
	let t = choose_target(false); // anything hitting us first
	if (!t) {
		const party = party_names();
		let best_v = 0;
		for (const id in parent.entities) {
			const e = parent.entities[id];
			if (!farmable_entity(e) || !valid(e) || (e.target && !party.has(e.target))) continue;
			if (Math.hypot(e.x - h.x, e.y - h.y) > R) continue;
			const f = entity_profile(e); // solo verdict
			if (!f) continue;
			const v = (e.xp || f.xp || 1) / (f.ttk * (e.hp / e.max_hp) + distance(character, e) / Math.max(character.speed, 1) + 0.2);
			if (v > best_v && can_move_to(e)) (t = e), (best_v = v);
		}
	}
	if (t && !watch_progress(t)) {
		fight(t, Math.hypot(t.x - h.x, t.y - h.y) <= R); // approach only inside the radius
		return true;
	}
	// nothing to do: drift back toward the waiting spot so the partner finds us
	if (!walking() && Math.hypot(character.x - h.x, character.y - h.y) > R / 2 && can_move_to(h.x, h.y)) move_to(h.x, h.y, 800);
	return false;
}
// Leader: never waits. The follower always knows where the leader is (heartbeat) and walks to it. What changes when
// the partner leaves (town, dead, far) or comes back is the fight model: its damage and heals stop/start counting,
// so the pack is re-judged at once — if it's too much solo, the leader moves to one it can handle, and back when
// the partner returns. Waiting in place gains nothing: the follower always knows where the leader is.
function duo_check() {
	if (!in_party_cfg() || is_follower() || split_now()) return; // split: fights are judged solo, passers-by change nothing
	const near = partners_near().map((p) => p.name).sort().join(",");
	if (near === state.duo_near) return;
	const was = state.duo_near;
	state.duo_near = near;
	live_cache.clear();
	state.last_pick = 0;
	if (was === undefined) return;
	const gone = (was ? was.split(",") : []).filter((n) => !near.split(",").includes(n));
	const back = (near ? near.split(",") : []).filter((n) => !(was ? was.split(",") : []).includes(n));
	const why_gone = (n) => { const p = state.partners[n]; return p?.rip ? "died" : p?.errand ? "in " + p.errand : "away"; };
	game_log(`party near: ${near || "nobody"}${back.length ? ` (+${back.join(", ")})` : ""}${gone.length ? ` (−${gone.map((n) => n + " " + why_gone(n)).join(", ")})` : ""}: re-checking the pack`, C.info);
}

// =====================================================================
// Main loop
// =====================================================================
let next_respawn = 0;
// First tick after dying: be more careful with that monster (safety × 0.6 per death) and avoid that pack for
// death_pack_cooldown_ms; drop the errand and measurement in progress
function on_death() {
	if (state.dead_handled) return;
	state.dead_handled = true;
	const pmd = postmortem();
	// v20.0: a death with no damage seen in the last 10s (dead when the script started, or killed while it wasn't
	// watching) is logged as unexplained and doesn't blame the pack: it used to cut the pack's safety ×0.6 on no evidence
	pmd.watched_s = Math.round((Date.now() - seen.since) / 1000);
	pmd.unexplained = !Object.keys(pmd.dmg10 || {}).length;
	log_ev("death", pmd);
	bucket().deaths++;
	const p = state.pack || state.flee_pack; // v24.4: a death mid-flee still blames (and cools down) the pack fled from
	const killer = pmd.killer && G.monsters[pmd.killer] ? pmd.killer : p?.mtype;
	if (!pmd.unexplained) safety_tune("death");
	if (pmd.unexplained) game_log(`Died with no damage seen (script watching for ${pmd.watched_s}s) — not blaming ${p?.mtype || "the pack"}`, C.warn);
	else if (p) {
		// v24.16: killed by another monster than the spot's (a roamer: the ent at gscorpion), the spot isn't cooled down —
		// that sent the party away from its best spot, through the caves, and back 30 min later
		const roamer = !!killer && killer !== p.mtype;
		incident(killer || p.mtype, 0.6);
		if (!roamer) state.cooldown[pack_key(p)] = Date.now() + CFG.death_pack_cooldown_ms;
		delete state.probe_ok[killer || p.mtype];
		share_verdict({ kind: "incident", mtype: killer || p.mtype, mult: 0.6, key: roamer ? null : pack_key(p), cd: roamer ? 0 : state.cooldown[pack_key(p)], death: true });
		game_log(`Died at ${p.mtype} (main damage: ${killer || "?"}); safety for it now x${danger_of(killer || p.mtype).toFixed(2)}`);
	}
	Object.assign(state, { session: null, pack: null, park_home: false, errand: null, recovering: false, flee_pack: null, fled_home: false });
}
// Main loop: one decision per tick (see the header for the order). Reschedules itself: 200ms normally, sooner when the
// next attack is due (never under 50ms), 500ms when over the call budget, 1s while dead, 5s with nowhere to fight.
function tick() {
	let wait = 200;
	try {
		meter_socket();
		if (spent() > BUDGET.soft) wait = 500;
		else if (character.rip) {
			probe_check(); // v24.3: a probe ends as failed when the leader dies or flees, not "held" after recovering
			on_death();
			if (Date.now() >= next_respawn && can_spend(1, RESERVE.potion)) {
				next_respawn = Date.now() + 5000; // retry every 5s; a "cant_respawn" reply says exactly how long to wait
				Promise.resolve(respawn()).catch((e) => { if (e?.ms > 0) next_respawn = Date.now() + e.ms + 200; });
			}
			wait = 1000;
		} else if (state.recovering || character.hp < character.max_hp * flee_at()) {
			state.dead_handled = false;
			recover();
			probe_check();
			loot_chests();
			set_message(`Recovering ${((character.hp / character.max_hp) * 100).toFixed(0)}%`);
			wait = 250; // recovery reacts faster (re-channel, heals)
		} else if (state.parked) {
			state.dead_handled = false;
			park_tick();
			wait = 300;
		} else {
			state.dead_handled = false;
			if (Date.now() - state.last_guide > CFG.guide_interval_ms) guide_refresh();
			town_check();
			if (event_tick()) { loot_chests(); setTimeout(tick, 200); return; }
			if (is_merchant()) {
				merchant_tick();
				loot_chests();
				setTimeout(tick, 250);
				return;
			}
			if (is_follower()) {
				lead_lost();
				follower_tick();
				loot_chests();
				const L = leader_hb();
				set_message(`${errand_busy() ? state.errand + " | " : ""}${L.rip ? "waiting for " + L.name + " (dead)" : "with " + L.name + (L.pack ? " @ " + L.pack.mtype : "")} | ${character.esize} free`);
				setTimeout(tick, 150);
				return;
			}
			split_decide();
			// v24.8: together, with the party waiting at our pack while we're on an errand or walking back: no re-judging it
			// as if alone (duo_check, the periodic re-pick, town_body's reset) — that switched to a solo pack and moved them
			const cp = state.pack, waiting = in_party_cfg() && !split_now() && !!cp && partners().length > 0 && !partners_near().length &&
				partners().every((q) => q.pack && valid_boundary(q.pack.boundary) && pack_key(q.pack) === pack_key(cp));
			if (!waiting) duo_check();
			probe_check();
			if (!state.pack || (!waiting && Date.now() - state.last_pick > CFG.repick_ms)) pick_pack();
			if (state.pack?.boss && boss_tick(state.pack)) { loot_chests(); setTimeout(tick, 200); return; }
			const pack = state.pack;
			const in_area = !!pack && character.map === pack.map && in_boundary(pack.boundary, 250);
			if (pack && state.group_ok && state.group_ok !== pack_key(pack)) state.group_ok = null;
			// v24.14: something we can't take on is close and may attack: step away first (still fight what's on us)
			// v24.18: travelling, the slowest member leads; we follow it like any follower
			const CH = convoy_head(), CP = CH && CH !== character.name ? state.partners[CH] : null;
			if (CP) {
				const q = partner_pos(CP), a = hit_on_me() || choose_target(false);
				if (a) fight(a, true);
				else if (!walking() && !errand_busy()) {
					const d = q.map === character.map ? Math.hypot(q.x - character.x, q.y - character.y) : Infinity;
					if (d > CFG.party.follow_far) travel(q);
					else if (d > CFG.party.follow) move_to(q.x + (character.x - q.x) * (CFG.party.follow * 0.6 / d), q.y + (character.y - q.y) * (CFG.party.follow * 0.6 / d), 300);
				}
				set_message(`convoy: following ${CH} to ${pack ? pack.mtype : "?"}`);
				loot_chests();
				setTimeout(tick, 200);
				return;
			}
			const lm = !walking() && in_area ? looming() : null; // v24.16: at the spot only — mid-walk it stopped the walk, stepped
			// away, and the walk went right back past it (stuck between camps); on the way, fight()'s escape outruns what attacks
			if (lm) {
				keep_away(lm);
				const a = hit_on_me();
				if (a && a !== lm) fight(a, false);
				loot_chests();
				setTimeout(tick, 200);
				return;
			}
			// v24.11: travel as a group — wait for stragglers before (and while) walking, and before pulling at the spot
			const hold = group_hold(pack, in_area);
			if (hold) {
				const a = hit_on_me() || choose_target(false); // what's attacking one of us still gets fought
				if (a) fight(a, true);
				else if (walking() && !errand_busy()) { try { stop("smart"); } catch (e) {} }
				set_message(`waiting for ${hold} (${Math.round((Date.now() - state.group_wait.since) / 1000)}s)`);
				loot_chests();
				setTimeout(tick, 250);
				return;
			}
			const spread_on = CFG.party.spread && !!pack && !pack.probe && spread_ok(pack.mtype); // v24.8: easy content: our own targets
			const t = hit_on_me() || (!i_am_tank() && !spread_on && caller_target()) || choose_target(in_area || !pack, true);
			announce_target(t);
			if (t && !watch_progress(t)) {
				state.last_target_at = Date.now();
				fight(t, true);
				wait = Math.min(Math.max(+(parent.next_skill?.attack || 0) - Date.now(), 50), 200); // wake for the next attack
			} else if (!pack) {
				set_message("No viable pack");
				wait = get_nearest_monster({ target: character.name }) ? 250 : 2000; // v24.8: 5s let an attacker hit unanswered
			} else if (!walking() && !errand_busy()) {
				if (!in_area) {
					if (!state.waypoints.length) state.waypoints = make_waypoints(pack.boundary);
					const w = state.waypoints[state.wp % state.waypoints.length];
					travel({ map: pack.map, x: w.x, y: w.y });
				// v24.6: at least one respawn (packs up to max_respawn are farmed, scored as if we wait for them)
				} else if (Date.now() - state.last_target_at > Math.max(CFG.idle_giveup_ms, Math.min(CFG.max_respawn, G.monsters[pack.mtype]?.respawn || 0) * 1000 + 5000)) {
					game_log(`Idle at ${pack.mtype}; cooling down this pack`, C.dim);
					state.cooldown[pack_key(pack)] = Date.now() + CFG.pack_cooldown_ms;
					pick_pack();
				} else patrol();
			}
			loot_chests();
			if (pack) {
				const s = state.session, live = s && Date.now() - s.start > 10_000 ? (s.xp / ((Date.now() - s.start) / 1000)).toFixed(0) : "–";
				const src = pack.directive ? pack.directive.split(/[ :(]/)[0] : "xp";
				set_message(`${errand_busy() ? state.errand + " | " : ""}${pack.mtype} (${src}) ${live}xp/s | ${character.esize} free`);
			}
		}
	} catch (e) { game_log("tick: " + e); log_error("tick: " + e); }
	setTimeout(tick, wait);
}

setInterval(() => { if (spent() <= BUDGET.soft) sustain(); }, 250); // potions/regen checked 4x a second
tick();

// =====================================================================
// OVERVIEW
// Adventure Land farmer. One file for every character (fighters and the merchant); VERSION (first line) is the only
// version number, and report() prints it. What changed between versions is in the git history, not here.
//
// Each tick, first match wins:
//   1. Dead → respawn as soon as the server allows (rip_time).
//   2. HP < flee_hp → cancel any walk, teleport to town, fight back only if hit, resume at recover_hp/recover_mp.
//   3. park() was called → finish the current errand, stand in town until resume().
//   4. Town run, when something is due: Daisy (hunt, tokens) → quest crafts (Cole etc.) → Progression Guide steps →
//      compound → upgrade project → exchange → elixir → sell → potions → bank (→ compound what the bank visit
//      fetched). Needs HP > town_hp and no attacker; with <= 3 free slots, HP > town_hp_critical and attackers are
//      ignored. A member already in town relaxes the thresholds (sync_factor) to share the trip. With the merchant
//      online, fighters go only at <= fighter_min_free slots / fighter_pot_min potions, and for guide steps alone at
//      most every guide_gap_ms.
//   5. Merchant → supply runs, secondhands, donations, stand (see Merchant).
//   6. Party follower → stay with the leader; hit the tank's target, else the leader's, else its own pick of the
//      leader's pack type within wait_radius of the leader, staying engaged until the kill; heal (priests),
//      energize the lowest-mana member (mages). Leader dead → solo-grind safe mobs nearby.
//   7. Leader / solo → a live boss we can survive, else fight at the chosen pack.
//   (Before 5-7: a live server event in CFG.events — Goo Brawl, Giga Crab — that we can survive: join and fight it.)
//
// Where to fight (solo or party leader):
//   live boss > own monster hunt > own-quest materials > guide-quest materials > guide farm row (skipped when
//   outlevelled) > best xp/s pack (CFG.goal_w). In a party the leader merges every member's weighted goals: a monster
//   on 2+ lists whose goals finish within mutual_max_h wins (more members, quicker first); otherwise members take
//   turn_min-minute turns.
//
// Probing (CFG.probe): every every_min the leader may try, for `minutes`, the best-xp spot just past the safety limit,
//   with everyone fleeing at probe.flee_hp; calibration learns from it, so the safe frontier can move.
// Safety: fight_math follows the server's damage formula on live monster stats; nearby members' damage and a nearby
//   priest's heals count only while they're near. Tank first: with a paladin/warrior near, it picks the targets and
//   announces them; the others hold fire on untouched monsters until it has aggro, and risk is judged on the tank's
//   HP/armour (not for aggressive monsters). Each monster's safety multiplier = calibration (actual ÷ predicted
//   damage per fight, after 20 fights: x0.4-1.5) × incidents (death x0.6, flee x0.8, fading 10%/h).
//   Bosses (cooperative: shared xp/loot) are judged on surviving boss.tank_s seconds of their damage.
//   Class skills: priest heal/partyheal/curse/absorb/darkblessing, mage energize/burst/cburst, paladin
//   selfheal/smash/mshield/purify, ranger mark/supershot, merchant mluck/massproduction.
//
// Bags — every item is KEEP, SELL or BANK; acted on when free slots drop below bag_min_free:
//   KEEP: locked, potions/scrolls/tools/computer, CFG.keep, copies the guide/quests/upgrade project need, compound
//         sets, stand stock (merchant), anything fetched from the bank in the last hour.
//   SELL: CFG.sell names; +0 plain gear only if auto_sell_gear or the bank is full; the merchant's bank purge.
//   BANK: everything else. Needed items, gear upgrades and compound copies in the bank are fetched back.
//
// Gear: items are scored by class-weighted stats (CFG.gear_w; tanks weigh defence double). Every 5s wear the best
//   bag upgrade, drink the best elixir, else hand a spare to a nearby member it upgrades (send_item). The bank is
//   account-wide, so upgrades seen there are fetched for whoever they fit. Slots the guide equipped are left to it
//   for gear_guide_respect_h. Compounding: three spare copies at one level (bags + bank) up to +compound_max_level
//   behind the server's preview, up to compound_per_run sets per trip; done only by the merchant while it's online.
//   Upgrade projects: the NPC-sold piece whose upgraded copy beats a member's worn piece most per gold. Monster
//   tokens buy shop class gear for a member; non-quest recipes whose output a member would wear are crafted from
//   spare materials (craft_power); weapon-slot upgrade projects may go to +9 with scroll2 (upgrade_high), funded by
//   the fighters when the merchant runs them; exchangeables (boxes, gems) are opened. Must-hold items (CFG.hold: the
//   Tracktrix) are kept by every character and re-acquired when missing: from the bank, else for tokens (reserved
//   ahead of gear); one fighter buys the merchant's copy and hands it over.
//
// Party (CFG.party): the lowest-level member leads; members talk via send_cm every beat_ms (heartbeats), invite each
//   other without splitting a party, and balance gold (the richest sends 15% to the poorest below 10% of its gold,
//   at most every 3h). The watchdog (every 30s) catches frozen, no-progress and lost-follower stalls.
//
// Merchant (CFG.merchant): not a party member. Carries potions to fighters low on potions or bag space and collects
//   their loot; casts mluck; fetches bank upgrades for them; does all compounding and upgrade projects while online;
//   checks Ponty's secondhands for upgrades / compound completions; levels by donating gold (no kill XP) up to
//   donate.to_level; idle at home it runs a stand (3x value, -10% per 12h, floor 1.5x); with the bank nearly full it
//   pulls low-value items to sell or list. The richest fighter nearby keeps its gold at float. Its idle spot is a
//   stand position that qualifies for Merrit's Market Parcels (square/aisle, spacing rules, 2 minutes still);
//   routine supply trips wait until the stand has stood min_stay_ms.
//
// Install: paste loader.js (once) into each character's CODE slot. It fetches this file from the public GitHub repo
//   (cached copy if GitHub is down); a release reaches a character when its code restarts (reload_farmer()).
//
// Diagnostics (CODE console, copyable text box): report() — this character at once, then the whole party in one
//   box (same server; stored copies otherwise); report(6) adds 6h history each; party_report() re-opens it;
//   history(hours) (party; history(h, "solo") just us), deaths(n), why_not("monster"); gear_check() (every slot: worn vs best owned); selftest() (checks the client: functions, data, events, storage,
//   cm round trips); park()/resume(); forget().
//
// Server behaviour relied on (checked against kaansoral/adventureland):
//   - call cost: > 200 per rolling 4s disconnects; move 2.5, equip 4, unequip 7; cm 1-2; character.cc = server total.
//   - client promises never time out → every game call goes through T(); every walk through go() (walk_timeout_ms).
//   - compound takes 10s on the server (5s with massproduction); an upgrade to +L takes 500·L·√L ms.
//   - use_town: 3s channel, cancelled by attacking/moving/equipping; fails with > 5 monsters targeting you.
//   - chests: gold multiplier lost beyond 400px or after 8 min; respawn rip_time 12s.
//   - a computer bypasses shop/upgrade/compound/craft/exchange distance checks, not Daisy's.
//   - monster-hunt kills and XP are credited to every party member; XP is split by damage dealt; merchants get none.
//   - send_gold / send_item: same map, < 400px; cm reaches only characters on the same server.
//   - bank_b / bank_u floors stay locked until a bkey / ukey is used; bank contents arrive after entering.
//   - an open stand sets speed to 10; two-handed weapons (G.classes[].doublehand) need the offhand empty.
//   - the runner defines ~350 globals (e.g. pm, smart, T): a top-level const/let with one of those names aborts the
//     whole script (test/smoke.js checks this); function declarations may replace them.
//   - Progression Guide rows: upgrade action.level = INPUT level, request.level = target; farm rows carry
//     action.route {monster, map, boundary, safe}; reason "bees" = save Bee Wings for Cole.
// =====================================================================
