// =====================================================================
// Adventure Land farmer. One file for every character; VERSION below is the only version number (report() prints
// it). What changed between versions is in the git history, not here.
//
// Each tick, first match wins:
//   1. Dead → respawn as soon as the server allows (rip_time).
//   2. HP < flee_hp → cancel any walk, teleport to town, fight back only if hit, resume at recover_hp/recover_mp.
//   3. park() was called → finish the current errand, stand in town until resume().
//   4. Town run, when something is due: Daisy (hunt) → quest crafts (Cole etc.) → Progression Guide steps →
//      compound spares → upgrade project → exchange → elixir → sell → potions → bank (→ compound sets the bank visit
//      completed). With the merchant online, fighters go only at <= fighter_min_free slots / fighter_pot_min potions. Normally needs HP > town_hp and no attacker; with <= 3 free slots, HP > town_hp_critical
//      and attackers are ignored. While another party member is in town, thresholds relax (sync_factor) to share the trip.
//   5. Party follower → stay with the leader, close in on and hit its target (within wait_radius of the leader),
//      heal (priests), energize the lowest-mana member (mages); if the leader is dead, solo-grind
//      safe mobs nearby (wait_radius).
//   6. Otherwise fight at the chosen pack.
//
// Where to fight (solo or party leader):
//   own monster hunt > own-quest materials > guide-quest materials > guide farm row (skipped when outlevelled) >
//   best xp/s pack (CFG.goal_w).
//   In a party the leader merges every member's weighted goal list: a monster on 2+ lists whose goals finish within
//   mutual_max_h wins (more members and quicker first); with no overlap, members take turn_min-minute turns.
//   Safety (fight_math) follows the server's damage formula on live monster stats; nearby members' damage and a
//   nearby priest's heals count only while they're near. Tank first (CFG.party.tank_first): with a paladin/warrior
//   near, the others hold fire on untouched monsters until it has aggro, and risk is judged on the tank's HP/armour.
//   World bosses (CFG.boss): a live cooperative boss on this server that the party can survive beats every other goal.
//   Class skills: priest heal/partyheal/curse/absorb, mage energize (lowest-mana member)/burst, paladin
//   selfheal/smash/mshield, ranger mark/supershot.
//
// Bags — every item is KEEP, SELL or BANK; acted on when free slots drop below bag_min_free:
//   KEEP: locked, potions/scrolls/tools/computer, CFG.keep, the copies the guide's current steps use, materials of
//         unfinished quest recipes, anything fetched from the bank in the last hour.
//   SELL: CFG.sell names; +0 plain gear only if auto_sell_gear, or while every usable bank pack is full.
//   BANK: everything else. Needed items in the bank are fetched back (once per item per 2h).
//
// Party (CFG.party, any number of members): the lowest-level member leads, the others follow it; members talk via
//   send_cm every beat_ms, invite each other without splitting an existing party, and balance gold (CFG.party.gold:
//   the richest sends 15% to the poorest when the poorest has < 10% of its gold, at most once per 3h party-wide).
//
// Gear (CFG.gear_auto): items are scored by class-weighted stats (CFG.gear_w; tanks weigh defence double). Every 5s
//   wear the best bag upgrade, else hand a bag spare to a nearby member it's an upgrade for (send_item). The bank is
//   account-wide: upgrades seen there are fetched on the next bank visit, so a piece one member banks reaches another.
//   Slots the guide equipped are left to it for gear_guide_respect_h; gear a member would wear is never auto-sold.
//   Compounding (CFG.compound_auto): three spare copies of a compoundable item at one level (bags + bank; never
//   worn, locked, titled, guide-needed or a member's upgrade) are compounded on town runs up to +compound_max_level,
//   when the server's preview clears compound_min_chance. Bank copies are fetched to complete a set.
//
// Upgrades (CFG.upgrade_auto): one project at a time: the NPC-sold piece whose upgraded copy (up to +7, scroll0/1
//   levels) beats a member's worn piece by the most per gold, bought and upgraded step by step behind the server's
//   preview. Elixirs (elixir_auto): keep the elixir slot filled (owned, else Liquid Luck when rich). Exchange
//   (exchange_auto): boxes/gems/candies opened once the bags hold a full set.
//
// Merchant (CFG.merchant, a merchant-class character): not a party member. It carries potions to fighters low on
//   potions or bag space, collects their bankable/sellable items, casts mluck (level 40+), fetches bank upgrades for
//   them, and runs the town work (sell, bank, compound, upgrade projects, exchange). The richest near fighter keeps
//   its gold at CFG.merchant.float. Merchants get no kill XP; it levels by donating gold (donate: 3.2-4.8 XP per gold
//   on the server) until donate.to_level (40 = mluck). Every 10 min it checks Ponty's secondhand stock for fighter
//   upgrades and compound-set completions. At level 30+ it casts massproduction before each upgrade/compound.
//
// Diagnostics: report() and why_not("monster") in the CODE console (copyable text box). park()/resume(), forget().
//
// Server behaviour relied on (checked against kaansoral/adventureland):
//   - call cost: > 200 per rolling 4s disconnects; move 2.5, equip 4, unequip 7; character.cc = the server's total.
//   - use_town: 3s channel, cancelled by attacking/moving/equipping; fails with > 5 monsters targeting you.
//   - chests: gold multiplier lost beyond 400px or after 8 min; respawn rip_time 12s.
//   - a computer bypasses shop/upgrade/compound/craft/exchange distance checks, not Daisy's.
//   - client promises never time out → every game call goes through T(); every walk through go() (walk_timeout_ms).
//   - monster-hunt kills and XP are credited to every party member; XP is split by damage dealt.
//   - bank_b / bank_u floors stay locked until a bkey / ukey is used; send_gold needs same map, < 400px, not in bank.
//   - send_item: same map, < 400px. Two-handed weapons (G.classes[].doublehand) need the offhand empty.
//   - Progression Guide rows: upgrade action.level = INPUT level, request.level = target; farm rows carry
//     action.route {monster, map, boundary, safe}; reason "bees" = save Bee Wings for Cole.
// =====================================================================

const VERSION = "14.5";
// Every tunable lives here. Units are in the name (_ms, _s, _min, _h) or the comment; fractions are 0..1 of max.
const CFG = {
	// --- fighting -------------------------------------------------------------------------------------------------
	safety: 0.35,              // a fight may cost at most this fraction of max HP (expected damage taken over one kill).
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
	measure_min_s: 90,         // s at a pack before its measured xp/s is trusted over the estimate
	force_type: null,          // monster id to farm exclusively (testing/debugging); null = choose automatically
	flee_hp: 0.25,             // below 25% HP: teleport to town (use_town) and recover
	recover_hp: 0.85,          // ...and stay out until HP is back to 85%
	recover_mp: 0.4,           //    and MP to 40% (enough for heals/skills on the way back)
	loot_range: 400,           // px; the server pays a chest's gold multiplier only within 400px of the opener
	loot_wait_ms: 45_000,      // a chest farther than loot_range is opened anyway after 45s (we usually walk past it)
	// --- potions ---------------------------------------------------------------------------------------------------
	hp_pot: "hpot1",           // HP potion bought and used (hpot1 = the 400 HP potion)
	mp_pot: "mpot1",           // MP potion bought and used (mpot1 = the 500 MP potion)
	pot_min: 30,               // restock when either potion drops below this many
	pot_buy: 200,              // ...back up to this many (as far as gold allows)
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
	// --- own gear (scored by stats, independent of the guide) ---------------------------------------------------------
	gear_auto: true,           // equip bag/bank items that score higher than what's worn; hand spares to party members
	gear_min_gain: 3,          // an item must beat the worn one by this many points...
	gear_margin: 0.05,         // ...and by 5% (avoids swapping for noise)
	gear_guide_respect_h: 12,  // after the guide equips a slot, leave that slot to the guide this long
	gear_share_range: 300,     // px; hand a spare to a party member this close (server limit: same map, 400px)
	// Points per unit of each stat. main_stat = the class's own (str/dex/int: each point is ~1 attack and some HP/MP);
	// the other two main stats count off_stat. Defensive stats count × tank_mult for tank classes.
	gear_w: { attack: 1, main_stat: 1.2, off_stat: 0.2, vit: 1, for: 0.6, hp: 0.05, mp: 0.02, armor: 0.3, resistance: 0.3,
		frequency: 2.5, crit: 2, critdamage: 0.3, apiercing: 0.4, rpiercing: 0.4, evasion: 1.5, avoidance: 1.5,
		reflection: 1, lifesteal: 2, manasteal: 1, dreturn: 0.5, speed: 0.5, range: 0.1, xp: 0.6, luck: 0.15, gold: 0.15 },
	gear_tank: ["paladin", "warrior"],
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
	// Monster tokens (Daisy): spend on the shop's class gear that a member would wear, best points per token first
	token_auto: true,
	// Secondhands (Ponty, main): items players sold to NPCs, resold at 2x item value (3x cash-shop items). The merchant
	// checks every secondhand_every_ms and buys anything a fighter would wear as an upgrade, or that completes a compound
	// set, within secondhand_max_price and never below gold_reserve.
	secondhand_auto: true,
	secondhand_every_ms: 600_000,
	secondhand_max_price: 2_000_000,
	// Exchange (exchange_auto): items the exchange NPC (or a quest NPC) opens, once the bags hold G.items[].e of them:
	// boxes, gems, candies, seashells... Copies the guide/quests need and CFG.keep are never exchanged.
	exchange_auto: true,
	exchange_skip: [],         // item names never exchanged
	// --- town / Progression Guide ------------------------------------------------------------------------------------
	gear: true,                // execute Progression Guide steps (upgrade, equip, craft, ...); false = only read it
	guide_interval_ms: 15_000, // re-read the guide every 15s (cheap: no walking)
	guide_steps_per_run: 5,    // guide steps that need walking, per town run (steps done in place don't count)
	town_min_gap_ms: 20_000,   // at least 20s between town runs
	walk_timeout_ms: 120_000,  // a smart_move that hasn't arrived in 2 min is cancelled (locked doors, unreachable spots)
	town_hp: 0.7,              // start a town run only above 70% HP...
	town_hp_critical: 0.5,     // ...or above 50% when bags are nearly full (<= 3 free)
	errand_timeout_ms: 300_000, // an errand still running after 5 min is assumed hung; its lock is released
	gold_reserve: 50_000,      // guide steps never spend below this much gold (potions may dip into it)
	min_upgrade_chance: 0.80,  // upgrade only at >= 80% success (the server's own preview); failure destroys the item
	min_compound_chance: 0.80, // same for compounding (failure destroys all three inputs)
	min_chance_rebuyable: 0.5, // items NPCs sell: failure only costs gold, accept the guide's odds down to this
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
	quest_farm_min_xp: 0.25,   // own quests: skip while that pack gives < 25% of the best pack's xp/s (outlevelled)
	quest_stall_min: 60,       // a material that hasn't dropped in 60 min of farming pauses its recipe/row...
	quest_shelve_h: 2,         // ...for 2h, then it's retried (nothing the guide asks for is dropped for good)
	guide_quest_keep_h: 24,    // keep working a guide quest for 24h after the guide last listed it (its HUD shows
	                           //   only a few rows at a time, so a quest can scroll out of view and back)
	auto_monster_hunt: true,   // take and turn in Daisy's monster hunts, and farm the hunt target when safe
	park_key: null,            // e.g. "P": key toggling park()/resume() (replaces that key's game binding)
	// --- merchant (same script; a merchant-class character named here works for the party instead of fighting) ---------
	merchant: {
		name: "DoWhatNow",
		serve_free: 12,        // visit a fighter with fewer free bag slots than this...
		serve_pots: 80,        // ...or fewer potions of either kind than this
		pot_carry: 400,        // potions of each kind taken out per trip (configured tier, or the cheap one if gold is short)
		self_pots: 20,         // potions of each kind the merchant keeps for itself
		wait_ms: 15_000,       // stay with the fighters this long for their items to arrive
		trip_gap_ms: 120_000,  // at most one trip every 2 min
		float: 1_000_000,      // fighters top the merchant's gold up to this (the richest near fighter, every 30 min at most)
		fighter_min_free: 3,   // while the merchant is online, fighters walk to town themselves only below this many free
		fighter_pot_min: 10,   //   slots / potions of either kind (the merchant brings potions and takes loot)
		mluck_range: 250,      // px; mluck (merchant level 40+) on every fighter in range lacking ours
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
	party: {
		members: ["Aspernari", "Torlis", "Sanala"], // character names (any number; the game allows up to 9); [] = solo
		leader: null,          // null = the lowest-level member online leads (picks packs, others assist); or a name
		follow: 90,            // px; followers stay within this of the leader (close enough to heal, not in its way)
		follow_far: 500,       // px; farther than this (or another map) → path-find to the leader instead of stepping
		heal_at: 0.75,         // priests heal any member below 75% HP
		heal_bonus: 2.5,
		// Tank first: with a tank (CFG.gear_tank) near, the others hold fire on an untouched monster for up to
		// tank_hold_ms so the tank takes its aggro; risk is then judged against the tank's HP and armour, so the party
		// can take spots the leader couldn't survive alone. Not for aggressive monsters (G.monsters[].aggro > 0.3).
		tank_first: true,
		tank_hold_ms: 4000,       // leader's safety allowance × 2.5 while a priest partner is near (its heals offset damage)
		wait_radius: 300,      // px; a follower whose leader is dead solo-grinds safe monsters within this radius
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
const BAG_TYPES = new Set(["pot", "elixir", "uscroll", "cscroll", "pscroll", "offering", "stand", "tool", "misc", "throw",
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
	measured: {},            // pack key -> measured xp/s, averaged (saved)
	realism: 1,              // measured ÷ estimated xp/s, averaged; scales estimates of unvisited packs (saved)
	danger: {},              // monster id -> safety multiplier, × 0.6 each time it kills us (saved)
	session: null,           // current xp measurement: { key, est, xp, start }
	bad_ids: {},             // entity id -> until: targets that took no damage (immune/healing)
	prog: null,              // { id, hp, t }: damage progress on the current target
	errand: null, errand_at: 0, errand_token: null, // running errand name, start time, and identity token
	last_town: 0,            // when the last town run started
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
	upg: null,               // upgrade project { name, to, for, slot, gain, cost, spent_from } (saved)
	upg_pick_at: 0,          // last time a project was looked for (every 10 min)
	guide_quests: {},        // recipe id -> { first, last } seen in the guide (saved)
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
// Wrap the socket's emit so every packet (ours and the game UI's) is counted. A reconnect creates a new socket, so
// tick() calls this every time; the __xp_metered flag stops double-wrapping.
function meter_socket() {
	const s = parent.socket;
	if (!s || s.__xp_metered) return;
	const orig = s.emit;
	s.emit = function (ev, ...args) { sent.push([Date.now(), EMIT_COST[ev] || 1]); return orig.call(this, ev, ...args); };
	s.__xp_metered = true;
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
async function go(dest, ms = CFG.walk_timeout_ms) {
	smart_depth++;
	let timer;
	try {
		return await Promise.race([smart_move(dest), new Promise((_, rej) => (timer = setTimeout(() => {
			try { stop("smart"); } catch (e) {}
			rej({ reason: "walk_timeout", dest: typeof dest === "string" ? dest : dest.map });
		}, ms)))]);
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
function fight_math(m, use_tank = true) {
	// defence → damage fraction: the game's own curve if available, else ~0.1% less per point, floored at 5%
	const dm = (d) => (typeof damage_multiplier === "function" ? damage_multiplier(d) : Math.max(0.05, 1 - d / 1000));
	const our_magic = (character.damage_type || G.classes[character.ctype].damage_type) === "magical";
	const pct = (v) => Math.min(1, Math.max(0, (v || 0) / 100)); // game percentages (evasion 25 = 25%) → 0..1
	let hit = character.attack * dm(((our_magic ? m.resistance : m.armor) || 0) - ((our_magic ? character.rpiercing : character.apiercing) || 0));
	hit *= 1 + (m.incdmgamp || 0) / 100;
	if (m["1hp"]) hit = 1; // "1hp" monsters take exactly 1 damage per hit whatever the attack
	const land = (1 - (our_magic ? 0 : pct(m.evasion))) * (1 - pct(m.avoidance));
	const theirs_magic = m.damage_type === "magical";
	const tank = use_tank && !(m.aggro > 0.3) && tank_cover(), D = tank || character; // who the monster will be hitting
	const their_hit = (m.attack || 0) * dm(((theirs_magic ? D.resistance : D.armor) || 0) - ((theirs_magic ? m.rpiercing : m.apiercing) || 0));
	const their_dps = their_hit * (m.frequency || 1);
	const heal_dps = their_dps * (m.lifesteal || 0) / 100 +
		(m.abilities?.self_healing ? m.abilities.self_healing.heal / Math.max(1, m.abilities.self_healing.cooldown / 1000) : 0); // heal per s
	let our_dps = hit * land * character.frequency - heal_dps;
	for (const P of partners_near()) if (P.attack && P.frequency) { // every nearby member shoots the same target
		const pm = P.damage_type === "magical";
		our_dps += P.attack * dm(((pm ? m.resistance : m.armor) || 0) - ((pm ? P.rpiercing : P.apiercing) || 0)) * (pm ? 1 : 1 - pct(m.evasion)) * P.frequency;
	}
	if (!(our_dps > 0)) return null;
	const ttk = (m.hp || m.max_hp) / our_dps;
	const self_dps = (our_magic ? character.attack * character.frequency * pct(m.reflection) : 0) +
		(!our_magic && character.range < 75 ? character.attack * character.frequency * (m.dreturn || 0) / 100 : 0); // the server
		// returns dreturn % of each physical hit to attackers with range < 75 (melee)
	const chase = m.charge || m.speed || 0; // targeted monsters move at charge speed
	const kiteable = RANGED && character.range > (m.range || 0) + CFG.kite_margin && character.speed > chase;
	return { ttk, xp: m.xp, their_dps, self_dps, kiteable: kiteable && !tank, hp_pool: tank ? tank.max_hp : character.max_hp };
}
const fight_risk = (f) => (f.their_dps / (f.kiteable ? CFG.kite_slack : 1) + f.self_dps) * f.ttk;
const safe_enough = (f, mtype) => !!f && fight_risk(f) <= (f.hp_pool || character.max_hp) * CFG.safety * (state.danger[mtype] || 1) *
	(partners_near().some((p) => p.ctype === "priest") ? CFG.party.heal_bonus : 1);
// A party tank (paladin/warrior) near enough to take aggro: version-matched, alive, not on an errand, sturdier than us
function tank_cover() {
	if (!CFG.party.tank_first || !in_party_cfg() || CFG.gear_tank.includes(character.ctype)) return null;
	return partners_near(300).find((p) => CFG.gear_tank.includes(p.ctype) && !p.errand && p.max_hp > character.max_hp &&
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
	if (tank_hold.id !== t.id) {
		tank_hold.id = t.id; tank_hold.at = Date.now();
		if (typeof send_cm === "function") Promise.resolve(send_cm([tank.name], { k: "tgt", id: t.id })).catch(() => {});
	}
	return Date.now() - tank_hold.at < CFG.party.tank_hold_ms;
}
function fight_profile(mtype) {
	if (!farmable_type(mtype)) return null;
	const f = fight_math(G.monsters[mtype]);
	return safe_enough(f, mtype) ? { ttk: f.ttk, xp: f.xp } : null;
}
// Live-stat check per entity: monsters level up when left alive, and an elite can be several times stronger than its
// G.monsters entry. Verdicts are cached per entity id and recomputed when its level/HP/attack changes.
const live_cache = new Map(); // entity id -> { key, ok, ttk, xp }; trimmed to 500 entries (oldest first)
function entity_profile(e) {
	const key = `${e.level || 1}:${e.max_hp}:${e.attack}`;
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
function resolve_area(monster, map, boundary, count) {
	if (map && G.maps[map] && valid_boundary(boundary)) return { map, boundary: boundary.slice(0, 4), count: count || 1 };
	let best = null;
	each_area((pack, area) => {
		if (pack.type !== monster) return;
		const rank = (area.map === map ? 1e6 : 0) + area.count;
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
	return { est, score: state.measured[pack_key(area)] ?? est * state.realism };
}

// =====================================================================
// Where to fight
// =====================================================================
// Switch to a pack: new patrol route, close the running xp measurement, log the reason
function set_pack(p, label) {
	if (!state.pack || !p || pack_key(state.pack) !== pack_key(p)) {
		if (p) game_log(label, C.info);
		state.waypoints = p ? make_waypoints(p.boundary) : [];
		state.wp = 0;
		end_session();
		state.last_target_at = Date.now();
	}
	state.pack = p;
}
// Choose where to fight: best-scoring safe pack, unless a directive (guide/quest/hunt) names one we can fight.
// Stays at the current pack unless the best is switch_margin better (hysteresis).
function pick_pack() {
	state.safe = {};
	for (const t in G.monsters) { const f = fight_profile(t); if (f) state.safe[t] = f; }
	const now = Date.now();
	let best = null;
	const seen = new Set();
	each_area((pack, area) => {
		const t = pack.type;
		if ((CFG.force_type && t !== CFG.force_type) || !state.safe[t]) return;
		if (!pack.grow && (expected_respawn(t, pack) > CFG.max_respawn || pack.count < CFG.min_count)) return;
		const key = pack_key(area);
		if (seen.has(key) || (state.cooldown[key] || 0) > now) return;
		seen.add(key);
		const p = { mtype: t, ...area, ...score_area(t, pack, area) };
		if (!best || p.score > best.score) best = p;
	});
	state.last_pick = now;
	state.best_score = best ? best.score : 0;

	const d = state.directive;
	if (d && d.until > now && farmable_type(d.monster) && !state.safe[d.monster] && d.guide_safe)
		state.safe[d.monster] = { ttk: d.seconds || 5, xp: G.monsters[d.monster].xp, trusted: true }; // guide's kill time,
		// or 5s if it gave none — the guide's own fight model judged this route safe for us
	if (d && d.until > now && d.boss)
		return set_pack({ mtype: d.monster, map: d.map, boundary: d.boundary, count: 1, boss: true, est: 0, score: 0, directive: d.reason }, `→ ${d.reason} @ ${d.map}`);
	if (d && d.until > now && state.safe[d.monster]) {
		const area = { map: d.map, boundary: d.boundary, count: d.count };
		if (!((state.cooldown[pack_key(area)] || 0) > now)) {
			const pack = (G.maps[d.map]?.monsters || []).find((pk) => pk.type === d.monster) || { count: d.count };
			return set_pack({ mtype: d.monster, ...area, ...score_area(d.monster, pack, area), directive: d.reason }, `→ ${d.monster} @ ${d.map} (${d.reason})`);
		}
	}
	const cur = state.pack;
	if (cur && state.safe[cur.mtype] && !((state.cooldown[pack_key(cur)] || 0) > now) && best && pack_key(best) !== pack_key(cur)) {
		if (best.score < (state.measured[pack_key(cur)] ?? cur.score) * CFG.switch_margin) best = cur;
	}
	set_pack(best, best && `→ ${best.mtype} x${Math.round(best.count)} @ ${best.map} (~${best.score.toFixed(0)} xp/s${state.measured[pack_key(best)] ? " measured" : " est"})`);
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
	const secs = (Date.now() - s.start) / 1000;
	if (secs < CFG.measure_min_s) return;
	const rate = s.xp / secs, prev = state.measured[s.key];
	state.measured[s.key] = prev === undefined ? rate : prev * 0.5 + rate * 0.5; // average with the previous measurement
	if (s.est > 0) state.realism = state.realism * 0.7 + (rate / s.est) * 0.3; // slow-moving average of measured ÷ estimate
	game_log(`${s.key}: ${rate.toFixed(1)} xp/s over ${secs.toFixed(0)}s`, C.dim);
}
// Every second: count xp toward the current pack's measurement while we're there (300px slack) and not walking or on
// an errand. A measurement closes after 2 × measure_min_s so the picker keeps getting fresh numbers.
// Per-hour rates over the last hour (report, heartbeat): a sample of cumulative xp and gold every minute
// adj = gold moved between our own characters (sent: +, received: −), so transfers don't count as earnings/spending
const stats = { xp: 0, adj: 0, samples: [] };
// Send gold to one of our characters and tell it, so both sides leave the transfer out of their gold/h
function send_own_gold(name, g) {
	return T(send_gold(name, g)).then((r) => {
		stats.adj += g;
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
setInterval(() => {
	const d = xp_delta(), p = state.pack;
	stats.xp += d;
	if (!p || character.rip) return;
	const here = character.map === p.map && in_boundary(p.boundary, 300);
	if (!state.session && here && !walking() && !errand_busy() && !state.recovering)
		state.session = { key: pack_key(p), est: p.est, xp: 0, start: Date.now() };
	if (state.session) {
		state.session.xp += d;
		if ((Date.now() - state.session.start) / 1000 > CFG.measure_min_s * 2) end_session();
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
function choose_target(local_ok) {
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
	if (!local_ok) return null;
	const want = state.pack?.mtype, cur = get_targeted_monster();
	let best = null, best_v = 0, best_tier = 2; // tier 0 = the pack's own monster, 1 = anything else
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (!farmable_entity(e) || !valid(e) || (e.target && !party.has(e.target))) continue;
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
		if (e && e.reason !== "interrupted") game_log("travel: " + why(e));
		state.travel_block_until = Date.now() + 5000; // a failing path must not be retried every tick
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
			if (!t.s?.cursed && can_use("curse")) fire("curse", t);
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
			else if (t.hp > character.attack * 2 && can_use("smash")) fire("smash", t);
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
				pot_count("mp") >= CFG.pot_min) return fire("burst", t), true;
			if (cburst()) return true;
			if (!can_use("energize")) break;
			// the party member lowest on mana (below 40%) within range, else ourselves below 50%. A priest's heals run
			// on mana, so in a party this mostly keeps the healer going.
			const range = G.skills.energize?.range || 320;
			const low = others().map((n) => parent.entities?.[n]).filter((e) => e && !e.rip && valid(e) && e.max_mp &&
				e.mp < e.max_mp * 0.4 && distance(character, e) < range).sort((a, b) => a.mp / a.max_mp - b.mp / b.max_mp)[0];
			if (low && character.mp > character.max_mp * 0.3) fire("energize", low);
			else if (character.mp < character.max_mp * 0.5) fire("energize", character);
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
function fight(t, steer = true) {
	if (get_targeted_monster() !== t) change_target(t);
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
function sustain() {
	if (character.rip) return;
	const hp = character.hp / character.max_hp, mp = character.mp / character.max_mp;
	if (hp < 0.55 && pot_count("hp")) return fire("use_hp");
	if (mp < 0.35 && pot_count("mp")) return fire("use_mp");
	if (mp < 0.9 && hp > 0.8) return fire("regen_mp");
	if (hp < 0.9) return fire("regen_hp");
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
function gear_score(item, ctype = character.ctype) {
	if (!item || !G.items[item.name]) return 0;
	const p = item_props(item, ctype), W = CFG.gear_w, main = G.classes[ctype]?.main_stat, tank = CFG.gear_tank.includes(ctype);
	let s = 0;
	for (const k in p) {
		if (!p[k] || typeof p[k] !== "number") continue;
		let w = MAIN_STATS.includes(k) ? (k === main ? W.main_stat : W.off_stat) : W[k];
		if (!w) continue;
		if (tank && DEF_STATS.has(k)) w *= CFG.gear_tank_mult;
		s += p[k] * w;
	}
	return Math.round(s * 10) / 10;
}
// What a member (us, or a partner from its heartbeat) wears: slot -> score; slots the guide owns right now count as
// unbeatable (1e9); dh = mainhand is two-handed, off = offhand occupied
let my_gear_cache = null; // { at, key, g }: bag_plan judges every bag item against it, so memo it for 1s
function my_gear() {
	const now = Date.now(), sl = character.slots || {};
	const owned = (s) => now - (state.guide_equip[s] || 0) < CFG.gear_guide_respect_h * 3600_000;
	const key = GEAR_SLOTS.map((s) => (sl[s] ? sl[s].name + (sl[s].level || 0) : "") + (owned(s) ? "!" : "")).join();
	if (my_gear_cache && now - my_gear_cache.at < 1000 && my_gear_cache.key === key) return my_gear_cache.g;
	const w = {};
	for (const s of GEAR_SLOTS) w[s] = owned(s) ? 1e9 : gear_score(sl[s]);
	const mh = sl.mainhand && G.items[sl.mainhand.name];
	const g = { w, dh: !!(mh && G.classes[character.ctype]?.doublehand?.[mh.wtype]), off: !!sl.offhand };
	my_gear_cache = { at: now, key, g };
	return g;
}
// Slots an item could go in for a class (main-hand weapons only; two-handers only with the offhand free)
function slots_for(name, ctype, g) {
	const def = G.items[name], cls = G.classes[ctype] || {};
	if (!def || !GEAR.has(def.type) || (def.class && !def.class.includes(ctype))) return [];
	if (def.type === "weapon") {
		if (cls.mainhand?.[def.wtype]) return ["mainhand"];
		return cls.doublehand?.[def.wtype] && (!g.off || g.dh) ? ["mainhand"] : [];
	}
	if (OFFHAND_TYPES.has(def.type)) return cls.offhand?.[def.type] && !g.dh ? ["offhand"] : [];
	return SLOT_OF[def.type] || [];
}
// Best slot for an item and how much it beats what's there; null unless it clears gear_min_gain and gear_margin
function gear_gain(item, ctype, g) {
	if (!item || !g?.w) return null;
	const score = gear_score(item, ctype);
	let best = null;
	for (const s of slots_for(item.name, ctype, g)) {
		const cur = g.w[s] ?? 0, gain = score - cur;
		if (gain >= CFG.gear_min_gain && gain >= cur * CFG.gear_margin && (!best || gain > best.gain)) best = { slot: s, gain, score };
	}
	return best;
}
// Members that could use an item more than what they wear (us first); version-matched partners only
function gear_takers() {
	const out = [{ name: character.name, ctype: character.ctype, g: my_gear() }];
	for (const p of partners()) if (p.gear && p.v === VERSION) out.push({ name: p.name, ctype: p.ctype, g: p.gear, esize: p.esize, p });
	return out;
}
const gear_wanted_by = (item) => CFG.gear_auto && gear_takers().find((m) => gear_gain(item, m.ctype, m.g));
// Gear in the bank that beats what we wear: one per slot (the best), as task_bank fetch entries
function bank_upgrades() {
	if (!CFG.gear_auto || !CFG.bank) return [];
	const g = my_gear(), by = {};
	const takers = is_merchant() ? gear_takers().slice(1) : []; // the merchant fetches fighters' upgrades and delivers them
	for (const it of state.bank_gear || []) {
		const r = gear_gain(it, character.ctype, g) || takers.map((m) => gear_gain(it, m.ctype, m.g)).find(Boolean);
		if (r && (!by[r.slot] || r.gain > by[r.slot].gain)) by[r.slot] = { name: it.name, level: it.level, key: `gear:${it.name}:${it.level}`, gain: r.gain };
	}
	// rings/earrings: the two slots may pick the same bank piece; fetching it twice is harmless (the second fails)
	return Object.values(by);
}
// Wear the best upgrade in the bags (one equip per call; the replaced piece drops into the bags and is judged again)
let gear_busy = false;
async function equip_upgrades() {
	if (!CFG.gear_auto || gear_busy || character.rip || errand_busy()) return false;
	const needed = needed_slots(), g = my_gear();
	let best = null;
	character.items.forEach((it, k) => {
		if (!it || needed.has(k)) return; // the guide is working on that copy (upgrade/compound input)
		const r = gear_gain(it, character.ctype, g);
		if (r && (!best || r.gain > best.gain)) best = { ...r, k, it };
	});
	if (!best || !can_spend(EMIT_COST.equip, RESERVE.errand)) return false;
	gear_busy = true;
	try {
		await T(equip(best.k, best.slot));
		game_log(`gear: ${best.it.name}+${best.it.level || 0} → ${best.slot} (+${best.gain.toFixed(0)} pts)`, C.ok);
		return true;
	} catch (e) { game_log(`gear: equip ${best.it.name}: ${why(e)}`, C.dim); return false; } finally { gear_busy = false; }
}
// Hand a bag spare to a nearby member it's an upgrade for (one item per call). Items that are upgrades for us stay;
// locked/bound items and copies the guide needs are never sent.
async function share_gear() {
	if (!CFG.gear_auto || !(in_party_cfg() || is_merchant()) || gear_busy || character.rip || typeof send_item !== "function") return false;
	const near = new Set(partners_near(CFG.gear_share_range).map((p) => p.name));
	const takers = gear_takers().slice(1).filter((m) => near.has(m.name) && (m.esize ?? 1) > 0), now = Date.now();
	if (!takers.length) return false;
	const needed = needed_slots(), mine = my_gear();
	for (let k = 0; k < character.items.length; k++) {
		const it = character.items[k];
		if (!it || it.l || it.b || needed.has(k) || !GEAR.has(G.items[it.name]?.type) || gear_gain(it, character.ctype, mine)) continue;
		let to = null;
		for (const m of takers) {
			const r = gear_gain(it, m.ctype, m.g);
			if (r && (!to || r.gain > to.gain)) to = { ...r, m };
		}
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
setInterval(() => { equip_upgrades().then((did) => did || drink_elixir()).then((did) => did || share_gear()).catch(() => {}); }, 5_000);
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
	const preview = await T(upgrade(k, find_slot(scroll, 0), null, true)); // last arg true = preview only: {chance}
	if (!preview || !(preview.chance >= chance_floor(a.name, CFG.min_upgrade_chance, k, from))) throw { reason: "low_chance", chance: preview?.chance };
	await mass_production();
	await wait_budget(1, RESERVE.errand);
	const r = await T(upgrade(k, find_slot(scroll, 0)), 60_000); // the server takes 500·L·√L ms (+7: ~9s, +9: 13.5s)
	game_log(`upgrade ${a.name} +${from}→+${from + 1} (${(preview.chance * 100).toFixed(0)}%): ${r?.success ? "OK" : "FAILED"}`, r?.success ? C.ok : C.bad);
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
	return r;
}

// Own compounding (CFG.compound_auto). A group = one item name at one level with >= 3 spare copies across bags and
// bank. Bank copies are fetched on the next bank visit (bag_plan) and kept in the bags until compounded.
const compound_key = (name, level) => `cmp:${name}:${level}`;
function compound_spare(it, k, needed) {
	const def = it && G.items[it.name];
	return !!def?.compound && !it.l && !it.b && !it.p && !needed.has(k) && (it.level || 0) < CFG.compound_max_level &&
		!CFG.keep.includes(it.name) && !gear_wanted_by(it);
}
let cmp_cache = null; // { key, at, list }: keyed by bags + bank snapshot + pauses; bag_class asks once per item
function compound_groups(needed) {
	if (!CFG.compound_auto) return [];
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
function compound_fetches(groups) {
	const out = [];
	for (const g of groups) for (let i = 0; i < Math.min(g.bank, 3 - Math.min(3, g.bags.length)); i++)
		out.push({ name: g.name, level: g.level, key: `${g.key}:${i}` });
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
		const g = compound_groups().find((x) => x.bags.length >= 3);
		if (!g) break;
		const floor = shop_for(g.name) && !G.items[g.name]?.cash ? CFG.compound_min_chance_rebuyable : CFG.compound_min_chance;
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
			skip(g.key, 6 * 3600_000, `${why(e)}${e?.chance !== undefined ? ` (${Math.round(e.chance * 100)}%)` : ""}`);
			game_log(`compound ${g.name}+${g.level}: ${why(e)}; retrying in 6h`, C.dim);
		}
	}
	return n;
}

// ---- Own upgrading (CFG.upgrade_auto) ----
// Highest level ≤ upgrade_max_level reachable with scroll0/scroll1 (0 = none)
function upgrade_target(name) {
	let to = 0;
	for (let l = 1; l <= CFG.upgrade_max_level; l++) {
		const sc = upgrade_scroll(name, l - 1);
		if (sc === "scroll2" || !G.items[sc]) break;
		to = l;
	}
	return to;
}
// Gold for a +0 copy and the scrolls up to `to` (no failures counted)
function upgrade_cost(name, to) {
	let c = G.items[name]?.g || 0;
	for (let l = 0; l < to; l++) c += G.items[upgrade_scroll(name, l)]?.g || 1e9;
	return c;
}
const best_level_held = (name) => character.items.reduce((m, i) => (i && i.name === name && !i.l ? Math.max(m, i.level || 0) : m), -1);
// Best project: the NPC-sold piece whose upgraded copy beats a member's worn piece by the most points per gold
function pick_upgrade() {
	const budget = (character.gold - CFG.gold_reserve) * CFG.upgrade_spend;
	if (!CFG.upgrade_auto || budget <= 0) return null;
	const takers = gear_takers().filter((m) => m.ctype !== "merchant");
	let best = null;
	for (const name in G.items) {
		const def = G.items[name];
		if (!def.upgrade || !GEAR.has(def.type) || def.cash || skipped("upg:" + name) || CFG.quest_craft_skip.includes(name)) continue;
		const to = upgrade_target(name);
		if (!to) continue;
		const cost = upgrade_cost(name, to);
		if (cost > budget) continue;
		if (best_level_held(name) >= to || (state.bank_gear || []).some((i) => i.name === name && (i.level || 0) >= to)) continue;
		for (const m of takers) {
			const r = gear_gain({ name, level: to }, m.ctype, m.g);
			if (!r) continue;
			const v = r.gain / cost;
			if (!best || v > best.v) best = { name, to, for: m.name, slot: r.slot, gain: Math.round(r.gain), cost, v };
		}
	}
	return best && shop_for(best.name) ? best : null; // shop_for is the slow check: only for the winner
}
// Is there upgrade work for a town run? Picks a project (every 10 min at most) when there's none.
function upgrade_due() {
	if (!CFG.upgrade_auto || merchant_does_it()) return false;
	const now = Date.now();
	if (!state.upg && now - (state.upg_pick_at || 0) > 600_000) {
		state.upg_pick_at = now;
		state.upg = pick_upgrade();
		if (state.upg) game_log(`upgrade project: ${state.upg.name} → +${state.upg.to} for ${state.upg.for}'s ${state.upg.slot} (+${state.upg.gain} pts, ~${Math.round(state.upg.cost / 1000)}k)`, C.info);
	}
	return !!state.upg && !skipped("upg:" + state.upg.name) && best_level_held(state.upg.name) < state.upg.to;
}
async function task_upgrade() {
	let n = 0;
	for (let i = 0; i < CFG.upgrade_steps_per_run; i++) {
		const P = state.upg;
		if (!P) break;
		const top = best_level_held(P.name);
		if (top >= P.to) {
			game_log(`upgrade project done: ${P.name}+${top} for ${P.for}`, C.ok);
			state.upg = null;
			break;
		}
		if (P.spent_from === undefined) P.spent_from = character.gold;
		if (P.spent_from - character.gold > P.cost * CFG.upgrade_abort_x) {
			skip("upg:" + P.name, 24 * 3600_000, "over budget");
			game_log(`upgrade ${P.name}: failures pushed the cost past ${CFG.upgrade_abort_x}x the estimate; stopped${top >= 1 ? ` at +${top}` : ""}`, C.bad);
			state.upg = null;
			break;
		}
		try {
			await run_upgrade({ name: P.name }, { request: { name: P.name, level: P.to } });
			n++;
		} catch (e) {
			skip("upg:" + P.name, 24 * 3600_000, why(e) + (e?.chance !== undefined ? ` (${Math.round(e.chance * 100)}%)` : ""));
			game_log(`upgrade ${P.name}: ${why(e)}; project stopped${top >= 1 ? ` at +${top}` : ""}`, C.dim);
			state.upg = null; // the copy reached so far is free again (equip/share judge it)
			break;
		}
	}
	return n;
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
		return !!d?.e && (it.q || 1) >= d.e && !it.l && !needed.has(k) && !CFG.keep.includes(it.name) &&
			!CFG.exchange_skip.includes(it.name) && d.type !== "token" && !skipped("exch:" + it.name);
	});
}
async function task_exchange() {
	let n = 0;
	for (let i = 0; i < 20; i++) {
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
		} catch (e) {
			skip("exch:" + it.name, 6 * 3600_000, why(e));
			game_log(`exchange ${it.name}: ${why(e)}; retrying in 6h`, C.dim);
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
function bag_class(item, needed = needed_slots(), held_cmp) {
	if (!item) return "empty";
	if ((held_cmp || compound_slots(needed)).has(character.items.indexOf(item))) return "keep"; // waiting to be compounded
	const def = G.items[item.name];
	if (item.l || item.b || !def || CFG.keep.includes(item.name) || BAG_TYPES.has(def.type) ||
		item.name === CFG.hp_pot || item.name === CFG.mp_pot || needed.has(character.items.indexOf(item)) ||
		Date.now() - (state.fetched[item.name] || 0) < 3600_000) return "keep"; // never store what we fetched within the hour
	if (is_junk(item)) return "sell";
	return CFG.bank ? "bank" : "keep";
}
// Bag slot indices whose item matches f
const slots_where = (f) => character.items.map((it, i) => (f(it) ? i : -1)).filter((i) => i >= 0);
// What a bank/sell visit would do now: slots to sell, slots to bank, item names to fetch from the bank, free slots
function bag_plan() {
	const needed = needed_slots();
	const cmp = compound_slots(needed);
	const sell = slots_where((i) => bag_class(i, needed, cmp) === "sell"), bank = slots_where((i) => bag_class(i, needed, cmp) === "bank");
	// Fetch a needed item only when no copy at any level is in the bags or worn, and at most one attempt per item
	// name every 2 hours (persisted), whatever happens to the fetched copy. Counting only +0 copies, or not counting
	// worn ones, lets a fetched copy look missing again — the bot then fetches/banks in a loop.
	const worn = (n) => Object.values(character.slots || {}).filter((i) => i && i.name === n).length;
	const fetch = [...state.needs.keys()].filter((n) => (state.bank_seen[n] || 0) > 0 && held_any(n) + worn(n) === 0 &&
		!BAG_TYPES.has(G.items[n]?.type) && Date.now() - (state.fetch_try[n] || 0) > 2 * 3600_000);
	const bx = CFG.elixir_auto && character.ctype !== "merchant" && !elixir_active() && !best_elixir() && bank_elixir();
	if (bx) fetch.push({ name: bx.name, key: "elixir:" + bx.name });
	for (const u of [...bank_upgrades(), ...compound_fetches(compound_groups())])
		if (Date.now() - (state.fetch_try[u.key] || 0) > 2 * 3600_000) fetch.push(u);
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
function remember_bank() {
	if (!character.bank) return;
	const seen = {};
	const gear = [];
	for (const k in character.bank) if (k.startsWith("items")) for (const i of character.bank[k] || []) if (i) {
		seen[i.name] = (seen[i.name] || 0) + (i.q || 1);
		if ((GEAR.has(G.items[i.name]?.type) || G.items[i.name]?.type === "elixir") && gear.length < 400) gear.push({ name: i.name, level: i.level || 0, p: i.p, stat_type: i.stat_type });
	}
	state.bank_seen = seen;
	state.bank_gear = gear;
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
const floor_loaded = (map) => until(() => character.map === map && character.bank && Object.keys(character.bank).some((k) => k.startsWith("items")), 10_000);
// Bank visit: store everything classed BANK (overflowing to other unlocked floors), then fetch needed items
async function task_bank(fetch_names) {
	const store = slots_where((i) => bag_class(i) === "bank");
	if (!store.length && !fetch_names.length) return (town_reason.bank = "nothing to store or fetch"), 0;
	try { if (character.map !== "bank") await go({ map: "bank" }); } catch (e) { town_reason.bank = "can't reach the bank: " + why(e); throw e; }
	if (!(await floor_loaded("bank"))) { town_reason.bank = "bank didn't load"; throw { reason: "bank_not_loaded" }; }
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
	// pull back what bags need, from packs on whichever floor we're on
	let got = 0;
	for (const want of fetch_names) {
		if (character.esize < 2) break; // keep a slot free for loot
		// a name (any copy), or { name, level, key } for one exact gear piece (bank_upgrades)
		const name = want.name || want, lv = want.level;
		state.fetch_try[want.key || name] = Date.now();
		let found = false;
		for (const p in character.bank) {
			if (!p.startsWith("items") || (packs[p] && packs[p][0] !== character.map)) continue;
			const n = (character.bank[p] || []).findIndex((i) => i && i.name === name && (lv === undefined || (i.level || 0) === lv));
			if (n < 0) continue;
			await wait_budget(1, RESERVE.bulk);
			found = true;
			await T(bank_retrieve(p, n)).then(() => { got++; state.fetched[name] = Date.now(); game_log(`bank: fetched ${name} from ${p}`, C.dim); })
				.catch((e) => game_log(`bank: fetching ${name} failed: ${why(e)}`, C.dim));
			await sleep_ms(PACE_MS);
			break;
		}
		if (!found) game_log(`bank: ${name} not on this floor (${character.map}); not trying again for 2h`, C.dim);
	}
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
// Best place to farm an item: the safe monster/area with the most items per second (chance × kills/s)
function best_source(item) {
	let best = null;
	for (const [mt, rate] of drop_sources(item)) {
		const f = fight_profile(mt);
		if (!f) continue;
		each_area((pack, area) => {
			if (pack.type !== mt) return;
			const m = state.measured[pack_key(area)];
			const kps = m !== undefined ? m / Math.max(1, f.xp) // measured xp/s ÷ xp per kill = kills/s
				: Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack)) * state.realism;
			if (!best || rate * kps > best.ips) best = { monster: mt, ...area, ips: rate * kps };
		});
	}
	return best;
}
// Copies we have anywhere: bags + worn + last seen in the bank
const owned = (name) =>
	character.items.reduce((n, i) => n + (i && i.name === name ? i.q || 1 : 0), 0) +
	Object.values(character.slots || {}).filter((i) => i && i.name === name).length + (state.bank_seen[name] || 0);
// Has the guide asked for this recipe within guide_quest_keep_h?
const is_guide_quest = (id) => !!state.guide_quests[id] && Date.now() - (state.guide_quests[id].last || 0) < CFG.guide_quest_keep_h * 3600_000;
// Quest recipes to work on, in order: guide quests (in the order the guide asked), then own quests (quest_crafts /
// quest_npcs). Skips outputs our class can't wear.
function quest_recipes() {
	const mode = CFG.quest_crafts;
	if (!mode) return [];
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
	return (state.crafted[id] || 0) < CFG.quest_craft_max && owned(r.output?.name || id) < CFG.quest_craft_max;
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
		const qxp = state.measured[pack_key(pickm)] ?? (f ? f.xp * pickm.ips / Math.max(1e-9, drop_rate(pickm.monster, pickm.item)) : 0);
		if (!guided && state.best_score > 0 && qxp < CFG.quest_farm_min_xp * state.best_score) continue;
		const sk = id + ":" + pickm.item, now = Date.now();
		if (!state.qprog || state.qprog.key !== sk || pickm.have > state.qprog.have) state.qprog = { key: sk, have: pickm.have, t: now };
		else if (now - state.qprog.t > CFG.quest_stall_min * 60_000) {
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
const owned_in_bags_or_bank = (n, l) => held(n, l) + (l ? 0 : state.bank_seen[n] || 0);
// Farm our own monster hunt's target if we can fight it safely
function hunt_directive() {
	const h = character.s.monsterhunt;
	if (!CFG.auto_monster_hunt || !h || !(h.c > 0) || !fight_profile(h.id)) return null;
	const best = resolve_area(h.id);
	return best && { monster: h.id, ...best, reason: `monster hunt ${h.c} left`, guide_safe: false };
}
// The server credits a monster-hunt kill to every party member (monster_hunt_logic runs per member), so the leader
// can work its partner's hunt too — a follower never picks where to fight, so its hunts otherwise just expire.
function partner_hunt_directive() {
	if (!CFG.auto_monster_hunt || is_follower()) return null;
	const p = partners().find((m) => m.hunt?.c > 0 && fight_profile(m.hunt.id)), h = p?.hunt;
	if (!h) return null;
	const best = resolve_area(h.id);
	return best && { monster: h.id, ...best, reason: `${p.name}'s monster hunt ${h.c} left`, guide_safe: false, for_partner: true };
}
// Kills per second we'd manage at the best spawn area of a monster (measured if we've been there); 0 if unsafe
function kills_per_s(mt) {
	const f = fight_profile(mt);
	if (!f) return 0;
	let best = 0;
	each_area((pack, area) => {
		if (pack.type !== mt) return;
		const m = state.measured[pack_key(area)];
		const kps = m !== undefined ? m / Math.max(1, f.xp) : Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack)) * state.realism;
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
	if (CFG.auto_monster_hunt && h?.c > 0) out.push({ monster: h.id, w: W.hunt, reason: `monster hunt ${h.c} left`, eta_h: eta(h.c, 1, h.id) });
	if (CFG.quest_farm && CFG.quest_crafts) for (const id of quest_recipes()) {
		if (!recipe_open(id)) continue;
		for (const [q, n, l] of G.craft[id].items) {
			const have = owned_in_bags_or_bank(n, l);
			if (l || GEAR.has(G.items[n]?.type) || have >= q) continue;
			for (const [mt, rate] of drop_sources(n)) if (farmable_type(mt))
				out.push({ monster: mt, w: is_guide_quest(id) ? W.guide_quest : W.quest, reason: `${id}: ${n} ${have}/${q}`, eta_h: eta(q - have, rate, mt) });
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
	const members = [{ name: me, goals: goals_list() }, ...partners().map((p) => {
		const goals = [...(p.goals || [])];
		if (p.hunt?.c > 0 && !p.goals) goals.push({ monster: p.hunt.id, w: CFG.goal_w.hunt, reason: `monster hunt ${p.hunt.c} left` }); // older versions
		if (p.want && !p.goals) goals.push({ ...p.want, w: CFG.goal_w.guide_farm });                                             // send only these
		return { name: p.name, goals };
	})];
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
	const mutual = cands.filter((e) => names(e).length >= 2).sort((a, b) => weight(b) / (1 + hours(b)) - weight(a) / (1 + hours(a)));
	state.shared = { mutual: mutual.map((e) => `${e.monster} ~${hours(e).toFixed(1)}h (${e.why.join("; ")})`),
		too_slow: [...by.values()].flatMap((e) => e.too_slow.map((w) => `${e.monster}: ${w}`)), at: now };
	if (mutual.length) return to_dir(mutual[0], `mutual: ${[...new Set(mutual[0].why)].slice(0, 3).join(" + ")}`);
	// nothing in common: turns, rotating through members that have a goal the group can fight
	const top = (n) => cands.filter((e) => e.w[n]).sort((a, b) => b.w[n] - a.w[n])[0];
	const order = [me, ...partners().map((p) => p.name).sort()].filter((n) => (n === me ? mine : top(n)));
	if (!order.length) return mine;
	if (!state.turn || now > state.turn.end || !order.includes(state.turn.who)) {
		const i = state.turn ? order.indexOf(state.turn.who) : -1;
		state.turn = { who: order[(i + 1) % order.length], end: now + CFG.party.turn_min * 60_000 };
	}
	if (state.turn.who === me) return mine;
	const t = top(state.turn.who);
	return to_dir(t, `${state.turn.who}: ${t.why.find((w) => w.startsWith(state.turn.who + ":"))?.slice(state.turn.who.length + 2) || t.monster}`);
}
// The partner's own top farming goal, if the pair can fight it (partners on older versions only send this, not goals)
function partner_want() {
	const p = partners().find((m) => m.want), w = p?.want;
	if (!w || is_follower() || !G.monsters[w.monster]) return null;
	if (!fight_profile(w.monster) && !(w.guide_safe && farmable_type(w.monster))) return null;
	const area = resolve_area(w.monster, w.map, w.boundary, w.count);
	return area && { monster: w.monster, ...area, reason: `${p.name}: ${w.reason}`, guide_safe: false, for_partner: true };
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
function boss_safe(name) {
	const m = G.monsters[name];
	const f = m && fight_math({ ...m, hp: 1, "1hp": false }, true); // their side of the fight only
	if (!f) return false;
	const heal = partners_near().some((p) => p.ctype === "priest") ? CFG.party.heal_bonus : 1;
	if ((f.their_dps + f.self_dps) * CFG.boss.tank_s > f.hp_pool * CFG.safety * heal) return false;
	const squish = Math.min(character.max_hp, ...partners_near().map((p) => p.max_hp || Infinity));
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
// The guide's farm row if it's current, not paused and not outlevelled (guide_farm_min_xp; a row we can't measure,
// e.g. a monster we can't fight but the guide calls safe, is kept)
function live_guide_farm() {
	const g = state.guide_farm, now = Date.now();
	if (!g || !(g.until > now) || (state.guide_ignore[`${g.monster}:${g.map}`] || 0) > now) return null;
	const f = fight_profile(g.monster), gxp = f ? kills_per_s(g.monster) * f.xp : null;
	if (gxp !== null && state.best_score > 0 && gxp < CFG.guide_farm_min_xp * state.best_score) return null;
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
	for (const f of [boss_directive, hunt_directive, oq, gq, () => g]) if (!mine) mine = f();
	// A follower never picks where to fight, so the leader works both members' goals: mutual ones first, otherwise
	// turns (pick_shared).
	let d = mine;
	if (partners().length && in_party_cfg() && !is_follower() && !mine?.boss) d = pick_shared(mine) || mine; // a boss beats every goal
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
	if (typeof get_progression !== "function") return null;
	let prog;
	try { prog = get_progression({ spendLimit: Math.max(0, character.gold - CFG.gold_reserve) }); } catch (e) { game_log("progression: " + e); return null; }
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
	try {
		await run_row(row);
		await sleep_ms(500); // let the result's update arrive before the guide is re-read
		return true;
	} catch (e) {
		skip(row.id, e?.reason === "low_chance" ? 1_800_000 : 300_000, why(e) + (e?.chance !== undefined ? ` ${(e.chance * 100).toFixed(0)}%` : "") + (e?.want ? ` ${e.want}` : ""));
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
const TOWN_TASKS = ["hunt", "tokens", "craft", "guide", "compound", "upgrade", "exchange", "elixir", "sell", "restock", "bank"];
const due_tasks = (due) => TOWN_TASKS.filter((k) => due[k]);
// relaxed: the partner is already in town, so use the trip — bank at < bag_min_free × sync_factor free slots,
// restock potions below pot_min × sync_factor
// What a town run would do now (see TOWN_TASKS). sell/bank only when bags are short (or, with a computer, once
// sell_batch junk items pile up); bank also when needed items wait in the bank.
function town_due(relaxed = false) {
	const plan = bag_plan();
	let min_free = relaxed ? CFG.bag_min_free * CFG.party.sync_factor : CFG.bag_min_free;
	let pot_min = relaxed ? CFG.pot_min * CFG.party.sync_factor : CFG.pot_min;
	if (merchant_hb()) { min_free = Math.min(min_free, CFG.merchant.fighter_min_free); pot_min = Math.min(pot_min, CFG.merchant.fighter_pot_min); }
	const short = plan.free < min_free;
	if (plan.free === 0 && !plan.sell.length && !plan.bank.length && Date.now() - bags_warned > 600_000) {
		bags_warned = Date.now();
		game_log("Bags full and everything in them is marked keep — run report() to see why", C.bad);
	}
	return {
		hunt: hunt_due(),
		craft: !!next_quest_craft(),
		compound: compound_groups().some((g) => g.bags.length >= 3),
		upgrade: upgrade_due(),
		tokens: !skipped("town:tokens") && !!token_pick(),
		exchange: exchange_pick() >= 0,
		elixir: elixir_buy_due(),
		guide: !!next_guide_row(state.guide),
		sell: !skipped("town:sell") && plan.sell.length > 0 && (short || (has_computer() && plan.sell.length >= CFG.sell_batch)),
		restock: !skipped("town:restock") && (pot_count("hp") < pot_min || pot_count("mp") < pot_min),
		bank: !skipped("town:bank") && CFG.bank && ((short && plan.free + plan.sell.length < min_free && plan.bank.length > 0) || plan.fetch.length > 0),
		plan, min_free, pot_min, relaxed,
	};
}
function town_run(due) {
	return errand("town", async () => {
		const step = async (label, fn) => { try { return await fn(); } catch (e) { town_reason[label] = town_reason[label] || why(e); game_log(`${label}: ${why(e)}`, C.dim); } };
		// step: run one task, record why it failed (for report()), never let one failure end the run.
		// A bag/potion task that achieves nothing (bank full, item on another bank floor, no gold) pauses 15 min,
		// so an unfixable condition can't send us to town every town_min_gap_ms
		const bag_step = async (key, fn) => {
			delete town_reason[key];
			const n = (await step(key, fn)) || 0;
			if (!n) skip("town:" + key, 900_000, town_reason[key] || "achieved nothing");
			return n;
		};
		let did = 0;
		if (due.hunt) did += (await step("hunt", run_hunt)) ? 1 : (skip("hunt:auto", 300_000), 0);
		if (!skipped("town:tokens") && token_pick()) did += (await step("tokens", task_tokens)) || 0; // Daisy: next to the hunt
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
		if (due.compound || compound_groups().some((g) => g.bags.length >= 3)) did += (await step("compound", task_compound)) || 0;
		if (upgrade_due()) did += (await step("upgrade", task_upgrade)) || 0;
		if (exchange_pick() >= 0) did += (await step("exchange", task_exchange)) || 0;
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
		if (due.restock) did += await bag_step("restock", () => task_restock(due.pot_min));
		const after = bag_plan();
		// standing in the bank anyway (guide retrieves): store what's bankable now, short on space or not
		if (CFG.bank && !banked && !skipped("town:bank") && ((after.free < (due.min_free || CFG.bag_min_free) || on_bank_floor()) && after.bank.length || after.fetch.length))
			did += await bag_step("bank", () => task_bank(after.fetch));
		// the bank visit may have fetched the missing copies of a group: compound now, while still in town
		if (compound_groups().some((g) => g.bags.length >= 3)) did += (await step("compound", task_compound)) || 0;
		state.last_pick = 0; // re-evaluate where to fight
		return did;
	});
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
	const critical = character.esize <= 3; // nearly full bags: go even when attacked or lower on HP
	const attacked = !!get_nearest_monster({ target: character.name });
	const floor = critical ? CFG.town_hp_critical : CFG.town_hp;
	const blockers = [];
	if (errand_busy()) blockers.push(`errand ${state.errand}`);
	if (attacked && !critical) blockers.push("under attack");
	if (character.hp < character.max_hp * floor) blockers.push(`HP ${Math.round((character.hp / character.max_hp) * 100)}% < ${floor * 100}%`);
	if (walking() && !errand_busy()) { stop("smart"); blockers.push("stopping a pack walk"); } // a patrol/pack trip yields to town
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
	game_log(`Town: ${what.join("+")} (${due.plan.free} free${due.relaxed ? ", with " + in_town.join(", ") : ""})`, C.dim);
	town_run(due);
}

// =====================================================================
// Recovery, death, parking
// =====================================================================
// Low-HP recovery: cancel any walk (it would block the channel), teleport to town (3s channel), fight back only if
// hit, and stay out until recover_hp/recover_mp. use_town has no cooldown and fails while > 5 monsters target us, so
// retries are spaced 1.5s apart; it's re-channelled only if something followed us below flee_hp.
function recover() {
	if (!state.recovering) {
		Object.assign(state, { recovering: true, fled: false, session: null, pack: null });
		game_log(`HP ${((character.hp / character.max_hp) * 100).toFixed(0)}%: retreating`, C.bad);
	}
	const threat = get_nearest_monster({ target: character.name });
	const channeling = !!character.c.town;
	if (!channeling && Date.now() - (state.town_at || 0) > 1500 && (!state.fled || (threat && character.hp < character.max_hp * CFG.flee_hp))) {
		if (walking() || is_moving(character)) stop("smart"), stop("move");
		if (fire("use_town")) (state.fled = true), (state.town_at = Date.now());
	}
	if (!channeling && threat) { const t = choose_target(false); if (t) fight(t, false); }
	if (character.hp >= character.max_hp * CFG.recover_hp && character.mp >= character.max_mp * CFG.recover_mp && !threat) {
		state.recovering = false;
		state.last_target_at = Date.now();
		game_log("Recovered; resuming", C.ok);
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
	set(SAVE_KEY, { v: 1, at: Date.now(), measured: state.measured, realism: state.realism, danger: state.danger,
		cooldown: state.cooldown, gear_skip: state.gear_skip, crafted: state.crafted, bank_seen: state.bank_seen,
		guide_ignore: state.guide_ignore, guide_quests: state.guide_quests, qprog: state.qprog, gprog: state.gprog, bank_full_at: state.bank_full_at,
		fetched: state.fetched, fetch_try: state.fetch_try, gold_xfer_at: state.gold_xfer_at || 0,
		bank_gear: state.bank_gear, guide_equip: state.guide_equip, upg: state.upg, donated: state.donated,
		skip_why: Object.fromEntries(Object.entries(skip_why).filter(([k]) => skipped(k))) });
}
function load_state() {
	const d = typeof get === "function" ? get(SAVE_KEY) : null;
	if (!d || d.v !== 1) return;
	const now = Date.now(), live = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, t]) => t > now));
	Object.assign(state.measured, d.measured || {});
	if (d.realism > 0) state.realism = d.realism;
	Object.assign(state.danger, d.danger || {});
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
	if (Array.isArray(d.bank_gear)) state.bank_gear = d.bank_gear;
	if (d.upg?.name) state.upg = d.upg;
	if (d.donated) state.donated = d.donated;
	Object.assign(state.guide_equip, d.guide_equip || {});
	// guide-row pauses from older versions have no recorded reason and were judged by older rules: retry them now
	if (!d.skip_why) for (const k in state.gear_skip) if (!k.includes(":") || k.startsWith("upgrade:") || k.startsWith("compound:")) delete state.gear_skip[k];
	// v14.1: compounds/upgrades that took longer than 10s were reported as "timeout" and paused 6-24h: retry them
	for (const k in state.gear_skip) if (/timeout/.test(skip_why[k] || "") && /^(cmp:|upg:|upgrade:|compound:)/.test(k)) delete state.gear_skip[k];
	const off = now - (d.at || now);
	if (d.qprog) state.qprog = { ...d.qprog, t: d.qprog.t + off };
	if (d.gprog) state.gprog = { ...d.gprog, t: d.gprog.t + off };
	game_log(`farmer v${VERSION}: loaded ${Object.keys(state.measured).length} measured packs, ${Object.keys(state.crafted).length} crafts`, C.dim);
}
load_state();
setInterval(save_state, 60_000);
function on_destroy() { save_state(); } // the game calls this just before the code is stopped or reloaded
// forget(): clear learned farming data (measurements, danger notes, cooldowns, pauses); craft history is kept
function forget() { Object.assign(state, { measured: {}, danger: {}, cooldown: {}, gear_skip: {}, realism: 1 }); save_state(); game_log("Learned state cleared"); }

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
// report(): one-screen summary of what the bot is doing and why (also as copyable text)
function report() {
	const lines = [];
	const L = (s, c = C.note) => { lines.push(s); game_log(s, c); };
	const p = state.pack, d = state.directive;
	L(`— report v${VERSION} ${new Date().toLocaleTimeString()} —`, C.title);
	if (is_merchant()) L(`merchant mode: doesn't fight; serves ${(CFG.party.members || []).join(", ")}`);
	else L(`fighting: ${p ? `${p.mtype} @ ${p.map}` : "nothing"} because ${p?.directive || (p ? `best xp/s (${p.score !== undefined ? p.score.toFixed(0) : "?"})` : "no safe pack")}`);
	if (in_party_cfg()) {
		const near = partners_near().map((p) => p.name);
		L(`party: leader ${leader_name()} | in game party: ${Object.keys(get_party() || {}).join(", ") || "no"} | near: ${near.join(", ") || "nobody (solo safety)"}`);
		for (const n of others()) {
			const P = state.partners[n];
			L(fresh(P) ? `  ${n} (${P.ctype} ${P.level}${P.rip ? ", DEAD" : ""}, v${P.v || "?"}${P.v !== VERSION ? " ≠ ours: update it" : ""}) seen ${Math.round((Date.now() - P.t) / 1000)}s ago on ${P.map}${P.errand ? ", in " + P.errand : ""}`
				: `  ${n}: no message in 10s (not running the script, or offline)`);
		}
	}
	if (CFG.gear_auto) {
		const g = my_gear(), total = Object.values(g.w).filter((v) => v < 1e9).reduce((a, b) => a + b, 0);
		const held_for = character.items.map((it) => it && gear_takers().slice(1).find((m) => gear_gain(it, m.ctype, m.g)) && `${it.name}→${gear_takers().slice(1).find((m) => gear_gain(it, m.ctype, m.g)).name}`).filter(Boolean);
		const locked = Object.keys(g.w).filter((k) => g.w[k] >= 1e9);
		L(`gear: ${total.toFixed(0)} pts worn${locked.length ? ` (guide owns ${locked.join(", ")})` : ""} | bank upgrades: ${bank_upgrades().map((u) => u.name + "+" + u.level).join(", ") || "none"} | for party: ${held_for.join(", ") || "none"}`);
	}
	{
		const r = rates(), pr = partners().filter((x) => x.rates).map((x) => `${x.name} ${fmt_k(x.rates.xph)} xp/h ${fmt_k(x.rates.gph)} g/h`);
		L(`rates (last ${r ? r.mins : 0} min, transfers between us excluded): us ${r ? `${fmt_k(r.xph)} xp/h, ${fmt_k(r.gph)} gold/h` : "collecting (15 min)"}${pr.length ? " | " + pr.join(" | ") : ""}`);
	}
	if (is_merchant()) {
		const f = merchant_job();
		const D = CFG.merchant.donate;
		if (D) L(`xp: level ${character.level}${character.level < D.to_level ? `, donating gold above ${fmt_k(D.keep)} until level ${D.to_level} (${fmt_k(state.donated && Date.now() - state.donated.since < 86_400_000 ? state.donated.g : 0)}/${fmt_k(D.per_day)} today)` : " (donations done)"}`);
		L(`merchant: ${state.serving ? "serving " + state.serving : f ? "next: " + f.name + ` (${f.esize} free, pots ${f.pots?.hp}/${f.pots?.mp})` : "idle"} | trip gap ${mins(merchant_trip_at + CFG.merchant.trip_gap_ms)} | mluck ${G.skills.mluck && character.level >= (G.skills.mluck.level || 0) ? "on" : `at level ${G.skills.mluck?.level || 40}`}`);
	} else if (CFG.merchant?.name) {
		const M = merchant_hb();
		L(`merchant ${CFG.merchant.name}: ${M ? `online, ${M.serving ? "serving " + M.serving : "in " + M.map}, ${M.esize} free, ${fmt_k(M.gold)} gold` : "offline (fighters do their own town runs)"}`);
	}
	if (CFG.boss?.enabled && !is_merchant()) {
		const S_ = parent.S || {}, live = Object.keys(S_).filter((k) => S_[k]?.live === true && G.monsters[k]);
		L(`bosses: ${live.length ? live.map((k) => `${k}@${S_[k].map} ${boss_safe(k) ? "JOIN" : "too strong"}`).join(", ") : "none live on this server"}`);
	}
	if (CFG.token_auto && !is_merchant()) {
		const b = token_pick();
		L(`tokens: ${held_any("monstertoken")}${b ? ` → next: ${b.name} (${b.price}) for ${b.for}` : ""}`);
	}
	if (CFG.upgrade_auto) {
		const P = state.upg;
		L(`upgrade: ${P ? `${P.name} +${Math.max(0, best_level_held(P.name))}/+${P.to} for ${P.for}'s ${P.slot} (+${P.gain} pts, ~${fmt_k(P.cost)})` : merchant_does_it() ? "left to the merchant" : "no project"}`);
	}
	if (CFG.elixir_auto && character.ctype !== "merchant") {
		const e = character.slots?.elixir;
		L(`elixir: ${elixir_active() ? `${e.name}${e.expires ? ` until ${new Date(e.expires).toLocaleTimeString()}` : ""}` : best_elixir() ? "about to drink " + best_elixir().name : bank_elixir() ? "fetching " + bank_elixir().name + " from the bank" : character.gold >= CFG.elixir_buy_min_gold ? "buying " + CFG.elixir_buy : `none (buys ${CFG.elixir_buy} at ${fmt_k(CFG.elixir_buy_min_gold)} gold)`}`);
	}
	if (CFG.compound_auto) {
		const gs = compound_groups(), paused = Object.keys(state.gear_skip).filter((k) => k.startsWith("cmp:") && skipped(k));
		L(`compound: ${gs.map((g) => `${g.name}+${g.level} ${g.bags.length}${g.bank ? `(+${g.bank} bank)` : ""}`).join(", ") || "no sets of 3 spares"}` +
			(paused.length ? ` | paused: ${paused.map((k) => `${k.slice(4)} ${mins(state.gear_skip[k])} (${skip_why[k] || "?"})`).join(", ")}` : ""));
	}
	if (d) L(`directive: ${d.monster} — ${d.reason}${is_follower() ? ` (ignored while following ${leader_name()})` : state.safe[d.monster] ? "" : " (NOT safe → ignored; see why_not)"}`);
	if (state.guide_farm) L(`guide farm row: ${state.guide_farm.monster} (${state.guide_farm.reason})`);
	const h = character.s.monsterhunt;
	const golds = partners().filter((p) => Number.isFinite(p.gold));
	if (golds.length && CFG.party.gold?.enabled) {
		const next = (state.gold_xfer_at || 0) + CFG.party.gold.every_h * 3600_000;
		L(`gold: us ${character.gold.toLocaleString()} / ${golds.map((p) => `${p.name} ${p.gold.toLocaleString()}`).join(" / ")} | last transfer ${state.gold_xfer_at ? Math.round((Date.now() - state.gold_xfer_at) / 60_000) + "m ago" : "never"}${next > Date.now() ? `, next allowed in ${mins(next)}` : ""}`);
	}
	if (!is_follower() && partners().length) {
		if (state.shared?.mutual.length) L(`mutual goals: ${state.shared.mutual.slice(0, 3).join(" | ")}`);
		else if (state.turn) L(`no mutual goal; turn: ${state.turn.who}'s for ${mins(state.turn.end)}`);
		if (state.shared?.too_slow.length) L(`too slow to share (> ${CFG.party.mutual_max_h}h): ${state.shared.too_slow.slice(0, 4).join(" | ")}`);
	}
	if (is_follower()) L(`my goals (shared with ${leader_name()}): ${goals_list().sort((a, b) => b.w - a.w).slice(0, 4).map((g) => g.monster + " (" + g.reason + ")").join(", ") || "none"}`);
	for (const P of partners()) if (P.hunt?.c > 0)
		L(`${P.name}'s hunt: ${P.hunt.c}x ${P.hunt.id} left${is_follower() || is_merchant() ? "" : fight_profile(P.hunt.id) ? " (we can farm it)" : " (not safe for us)"}`);
	L(`hunt: ${h ? (h.c > 0 ? `${h.c}x ${h.id} left` : `${h.id} done, turn in`) : "none"}${skipped("hunt:auto") ? ` (Daisy paused ${mins(state.gear_skip["hunt:auto"])})` : ""}`);
	const due = town_due();
	L(`town due: ${due_tasks(due).join(", ") || "nothing"} | errand: ${state.errand || "none"} | last run ${state.last_town ? Math.round((Date.now() - state.last_town) / 60_000) + "m ago" : "never"}`);
	if (state.town_block?.blockers.length) L(`town blocked (${Math.round((Date.now() - state.town_block.at) / 1000)}s ago): ${state.town_block.blockers.join(", ")}`);
	for (const r of state.guide?.rows || []) {
		const st = r.kind === "farm" ? "farm row" : !CFG.gear_actions.includes(r.kind) ? "not automated" : skipped(r.id) ? `paused ${mins(state.gear_skip[r.id])}: ${skip_why[r.id] || "reason not recorded (set before this version)"}` : r.affordable === false ? "unaffordable" : "next";
		L(`guide ${r.id}: ${st}`);
	}
	for (const id of quest_recipes()) {
		const r = G.craft[id];
		const inputs = r.items.map(([q, n, l]) => `${n}${l ? "+" + l : ""} ${held(n, l)}${state.bank_seen[n] ? `(+${state.bank_seen[n]} bank)` : ""}/${q}`).join(", ");
		const st = !recipe_wanted(id) ? "done" : skipped("qc:" + id) ? `paused ${mins(state.gear_skip["qc:" + id])}` : has_inputs(r) ? "READY to craft" : "collecting";
		L(`quest ${id}${is_guide_quest(id) ? " [guide]" : ""} @ ${G.npcs[r.quest]?.name || r.quest}: ${st} — ${inputs}`);
	}
	const plan = bag_plan(), kept = {};
	character.items.forEach((i) => { if (i) kept[bag_class(i)] = (kept[bag_class(i)] || 0) + 1; });
	L(`bags: ${plan.free} free (min ${CFG.bag_min_free}) | keep ${kept.keep || 0}, bank ${kept.bank || 0}, sell ${kept.sell || 0}${plan.fetch.length ? ` | to fetch: ${plan.fetch.join(", ")}` : ""}`);
	for (const k of ["town:sell", "town:restock", "town:bank", "town:loop"]) if (skipped(k)) L(`${k} paused ${mins(state.gear_skip[k])}: ${skip_why[k] || "?"}`);
	if (bank_is_full()) L(`bank marked full ${Math.round((Date.now() - state.bank_full_at) / 60_000)}m ago: selling +0 junk meanwhile`);
	L(`calls ${spent().toFixed(0)}/${BUDGET.soft} per 4s`);
	L(`gold ${character.gold} | level ${character.level} ${character.ctype} | ${character.map} ${Math.round(character.x)},${Math.round(character.y)}`);
	return share_text("report()", lines);
}
// why_not("bee"): is this monster farmable and safe for us, with the numbers behind the verdict
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
	const limit = character.max_hp * CFG.safety * (state.danger[mtype] || 1);
	L(`${mtype}: ${f.ttk.toFixed(1)}s per kill, takes ~${fight_risk(f).toFixed(0)} dmg/kill vs limit ${limit.toFixed(0)} → ${safe_enough(f, mtype) ? "SAFE" : "UNSAFE"}` +
		`${f.kiteable ? " (kiteable)" : ""}${state.danger[mtype] ? ` (died to it: x${state.danger[mtype].toFixed(2)})` : ""}`);
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
// "Fresh" = heard from in the last 10s (5 missed heartbeats → treat as offline).
const fresh = (p) => !!p && Date.now() - p.t < 10_000;
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
const partner_near = (maxd) => partners_near(maxd)[0] || null; // any one (kept for older call sites/tests)
const partner = () => partners()[0] || null;
const partner_any = () => partners_any()[0] || null;
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
const is_follower = () => in_party_cfg() && partners_any().length > 0 && leader_name() !== character.name;
// Status message to the other members every beat_ms: position, HP, target, pack, errand, combat stats (for the
// fight model), hunt, goals and gold. Skipped while the call budget is tight.
function heartbeat() {
	if (!in_party_cfg() || typeof send_cm !== "function") return;
	const t = get_targeted_monster(), p = state.pack;
	const msg = { k: "hb", v: VERSION, level: character.level, ctype: character.ctype, map: character.map,
		x: Math.round(character.x), y: Math.round(character.y), hp: character.hp, max_hp: character.max_hp, rip: !!character.rip,
		target: t && !t.dead ? t.id : null, pack: p ? { mtype: p.mtype, map: p.map, boundary: p.boundary, directive: p.directive } : null,
		errand: errand_busy() ? state.errand : null, attack: character.attack, frequency: character.frequency,
		damage_type: character.damage_type || G.classes[character.ctype]?.damage_type, apiercing: character.apiercing || 0,
		rpiercing: character.rpiercing || 0, range: character.range,
		hunt: character.s.monsterhunt?.c > 0 ? { id: character.s.monsterhunt.id, c: character.s.monsterhunt.c } : null,
		// our own top goal (a follower's directive is always its own; a leader's may be the partner's, so skip those)
		goals: goals_list().sort((a, b) => b.w - a.w).slice(0, 12),
		gold: character.gold, gold_xfer_at: state.gold_xfer_at || 0,
		party: Object.keys(get_party() || {}), // who we're in a game party with (invites use it)
		gear: CFG.gear_auto ? my_gear() : null, esize: character.esize, // hand-me-downs (share_gear)
		armor: character.armor, resistance: character.resistance, // tank_first fight model
		pots: { hp: pot_count("hp"), mp: pot_count("mp") }, rates: rates(), // merchant service, report
		mp: character.mp, max_mp: character.max_mp,
		want: state.directive && !state.directive.for_partner
			? { monster: state.directive.monster, map: state.directive.map, boundary: state.directive.boundary, count: state.directive.count,
				reason: state.directive.reason, guide_safe: !!state.directive.guide_safe } : null };
	const to = CFG.merchant?.name && !others().includes(CFG.merchant.name) ? [...others(), CFG.merchant.name] : others();
	Promise.resolve(send_cm(to, msg)).catch(() => {});
}
if (typeof character.on === "function") character.on("cm", (m) => {
	if (m && m.message?.k === "tgt" && (CFG.party.members || []).includes(m.name) && fresh(state.partners[m.name])) {
		state.partners[m.name].target = m.message.id; // a member holding fire for us: hit this one now
		return;
	}
	if (m && m.message?.k === "gold" && ((CFG.party.members || []).includes(m.name) || m.name === CFG.merchant?.name)) {
		stats.adj -= +m.message.g || 0; // a transfer from one of ours: not income
		return;
	}
	if (m && m.message?.k === "mhb" && m.name === CFG.merchant?.name) return void (state.merchant = { ...m.message, name: m.name, t: Date.now() });
	if (!m || !(CFG.party.members || []).includes(m.name) || m.message?.k !== "hb") return;
	const first = !fresh(state.partners[m.name]);
	state.partners[m.name] = { ...m.message, name: m.name, t: Date.now() };
	if (m.message.gold_xfer_at > (state.gold_xfer_at || 0)) state.gold_xfer_at = m.message.gold_xfer_at; // one party-wide clock
	if (first) game_log(`party: ${m.name} (${m.message.ctype} ${m.message.level}) online; ${leader_name()} leads`, C.info);
	if (first && m.message.v !== VERSION) game_log(`party: ${m.name} runs v${m.message.v || "?"}, we run v${VERSION} - load the same version on every character`, C.warn);
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
const merchant_does_it = () => !!merchant_hb();
function merchant_beat() {
	if (!is_merchant() || typeof send_cm !== "function") return;
	const msg = { k: "mhb", v: VERSION, level: character.level, map: character.map, x: Math.round(character.x), y: Math.round(character.y),
		esize: character.esize, gold: character.gold, serving: state.serving || null, rip: !!character.rip };
	Promise.resolve(send_cm(CFG.party.members || [], msg)).catch(() => {});
}
setInterval(() => { if (spent() < BUDGET.soft - RESERVE.chat) merchant_beat(); }, CFG.party.beat_ms);
// The fighter most in need of a visit: fewest free slots, then fewest potions
function merchant_job() {
	const M = CFG.merchant;
	const need = (p) => (p.esize ?? 99) < M.serve_free || (p.pots && (p.pots.hp < M.serve_pots || p.pots.mp < M.serve_pots));
	return partners().filter(need).sort((a, b) => (a.esize ?? 99) - (b.esize ?? 99) ||
		Math.min(a.pots?.hp ?? 999, a.pots?.mp ?? 999) - Math.min(b.pots?.hp ?? 999, b.pots?.mp ?? 999))[0] || null;
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
		const q = Math.min(want, spare, character.items[k].q || 1);
		await wait_budget(1, RESERVE.errand);
		await T(send_item(f.name, k, q)).then(() => game_log(`merchant: ${q} ${character.items[k]?.name || kind + " pots"} → ${f.name}`, C.ok))
			.catch((e) => game_log(`merchant: potions to ${f.name}: ${why(e)}`, C.dim));
		if (f.pots) f.pots[kind] += q;
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
	state.serving = f.name;
	try {
		const M = CFG.merchant;
		await task_restock(M.pot_carry, M.pot_carry + M.self_pots).catch((e) => game_log(`merchant: potions: ${why(e)}`, C.dim));
		for (let i = 0; i < 4; i++) {
			const q = state.partners[f.name];
			if (!fresh(q) || q.rip || q.errand === "town") return;
			const pos = partner_pos(q);
			if (pos.map === character.map && Math.hypot(pos.x - character.x, pos.y - character.y) < 150) break;
			await go({ map: pos.map, x: pos.x, y: pos.y });
		}
		for (const p of partners_near(350)) await give_pots(p);
		const end = Date.now() + M.wait_ms;
		while (Date.now() < end && character.esize > 2 && !character.rip) {
			mluck_near();
			const q = state.partners[f.name], pos = q && partner_pos(q);
			if (pos && pos.map === character.map && Math.hypot(pos.x - character.x, pos.y - character.y) > 200) move_to(pos.x, pos.y, 500);
			await sleep_ms(1000);
		}
		game_log(`merchant: served ${f.name} (${character.esize} slots free)`, C.dim);
	} finally { state.serving = null; }
}
// ---- Monster tokens (CFG.token_auto) ----
// Best shop piece by points per token: class gear a member would wear (+0), not already owned (bags or bank)
function token_pick() {
	const have = held_any("monstertoken"), shop = G.tokens?.monstertoken || {};
	if (!CFG.token_auto || have <= 0 || character.esize < 2) return null;
	let best = null;
	for (const name in shop) {
		const price = shop[name];
		if (price > have || !GEAR.has(G.items[name]?.type) || held_any(name) || (state.bank_gear || []).some((i) => i.name === name)) continue;
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
			game_log(`tokens: bought ${b.name} (${b.price} tokens) for ${b.for} (+${b.gain} pts)`, C.ok);
			await until(() => held_any(b.name) > 0, 3000);
		} catch (e) { game_log(`tokens: ${b.name}: ${why(e)}`, C.dim); skip("town:tokens", 3600_000, why(e)); break; }
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
	const m = gear_takers().slice(1).filter((x) => x.ctype !== "merchant").find((x) => gear_gain(it, x.ctype, x.g));
	if (m) return `upgrade for ${m.name}`;
	const g = G.items[it.name].compound && !it.p && (it.level || 0) < CFG.compound_max_level &&
		groups[compound_key(it.name, it.level || 0)];
	if (g && (g.bags + g.bank) % 3 === 2) return "completes a compound set";
	return null;
}
let secondhand_at = 0;
async function task_secondhands() {
	const ref = G.maps.main?.ref?.secondhands;
	if (!ref) return 0;
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
		const why_buy = secondhand_reason(it, groups), price = shop_price(it);
		if (!why_buy || price > CFG.secondhand_max_price || character.gold - price < CFG.gold_reserve || character.esize < 3) continue;
		await wait_budget(1, RESERVE.errand);
		const before = character.esize;
		parent.socket.emit("sbuy", { rid: it.rid });
		await until(() => character.esize < before, 3000);
		if (character.esize < before) {
			n++;
			game_log(`secondhands: bought ${it.name}+${it.level || 0} for ${fmt_k(price)} (${why_buy})`, C.ok);
			if (why_buy.startsWith("completes")) count(it, "bags");
		}
	}
	return n;
}
// Donate gold above donate.keep for XP while below donate.to_level (once a minute, idle in town only)
let donate_at = 0;
function merchant_donate() {
	const D = CFG.merchant.donate, now = Date.now();
	if (!D || character.level >= D.to_level || now - donate_at < 60_000 || character.map === "bank") return false;
	donate_at = now;
	const day = state.donated && now - state.donated.since < 86_400_000 ? state.donated : (state.donated = { since: now, g: 0 });
	const g = Math.floor(Math.min(character.gold - D.keep, D.chunk, D.per_day - day.g));
	if (g < 100_000 || !can_spend(1, RESERVE.errand)) return false; // < 100k: the server's "low" donation, skip
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
	if (f && character.esize >= 8 && Date.now() - merchant_trip_at > CFG.merchant.trip_gap_ms) {
		merchant_trip_at = Date.now();
		return void errand("serve", () => serve(f));
	}
	merchant_donate();
	if (CFG.secondhand_auto && Date.now() - secondhand_at > CFG.secondhand_every_ms && character.esize >= 5) {
		secondhand_at = Date.now();
		return void errand("secondhands", () => task_secondhands());
	}
	// idle: wait near the town spawn (bank, shops and upgrade NPCs are close)
	const home = G.maps.main?.spawns?.[0] || [0, 0];
	if (character.map !== "main" || Math.hypot(character.x - home[0], character.y - home[1]) > 250) travel({ map: "main", x: home[0], y: home[1] });
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
		const fighters = [{ name: character.name, gold: character.gold }, ...partners_near(400)];
		const richest = fighters.sort((a, b) => (b.gold || 0) - (a.gold || 0))[0];
		if (richest.name === character.name && M.gold < CFG.merchant.float && character.gold > CFG.merchant.float * 3 &&
			Date.now() - merchant_gold_at > 1800_000 && typeof send_gold === "function") {
			merchant_gold_at = Date.now();
			const g = Math.round(CFG.merchant.float - M.gold);
			await send_own_gold(M.name, g).then(() => game_log(`merchant: sent ${M.name} ${g} gold`, C.ok)).catch(() => {});
		}
		if ((M.esize ?? 0) <= 2) return;
		const needed = needed_slots(), cmp = compound_slots(needed);
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
	const known = partners().filter((m) => Number.isFinite(m.gold)); // members on older versions don't report gold
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
	state.pack = L.pack && valid_boundary(L.pack.boundary) ? { mtype: L.pack.mtype, map: L.pack.map, boundary: L.pack.boundary, directive: `following ${L.name}` } : null;
	state.last_target_at = Date.now();
	if (party_heal()) return;
	let t = L.target && parent.entities[L.target];
	const pos = partner_pos(L);
	if (!(t && valid(t) && t.type === "monster")) t = choose_target(false) || follower_pick(pos);
	let engaging = false;
	if (t) {
		if (get_targeted_monster() !== t) change_target(t);
		// close in on targets out of reach (melee always needs this) as long as they're within wait_radius of the
		// leader; kiting (ranged, when the target is on us) takes precedence
		if (!walking() && !errand_busy() && !kite(t) && distance(character, t) > standoff(t).reach &&
			pos.map === character.map && Math.hypot(t.x - pos.x, t.y - pos.y) <= CFG.party.wait_radius) { approach(t); engaging = true; }
		if (!hold_for_tank(t) && !class_skills(t) && can_attack(t)) fire("attack", t);
	}
	if (engaging || walking() || errand_busy()) return;
	const d = pos.map === character.map ? Math.hypot(pos.x - character.x, pos.y - character.y) : Infinity;
	if (d > CFG.party.follow_far) travel(pos);
	else if (d > CFG.party.follow && !(t && t.target === character.name && distance(character, t) <= standoff(t).reach)) {
		const ang = Math.atan2(character.y - pos.y, character.x - pos.x);
		const want = { x: pos.x + Math.cos(ang) * CFG.party.follow * 0.6, y: pos.y + Math.sin(ang) * CFG.party.follow * 0.6 };
		if (can_move_to(want.x, want.y)) move_to(want.x, want.y, 300); else travel(pos);
	}
}
// Follower with nothing to hit (the leader one-shots its targets, e.g. goos): take our own monster of the leader's
// pack type within wait_radius of the leader. Followers don't run pick_pack, so its safety is checked here (30s cache).
function follower_pick(pos) {
	const mt = state.pack?.mtype;
	if (!mt || pos.map !== character.map) return null;
	if (Date.now() - (state.fsafe_at || 0) > 30_000 || state.fsafe_mt !== mt) {
		const f = fight_profile(mt);
		if (f) state.safe[mt] = f; else delete state.safe[mt];
		state.fsafe_at = Date.now(); state.fsafe_mt = mt;
	}
	if (!state.safe[mt]) return null;
	const e = choose_target(true);
	return e && e.mtype === mt && Math.hypot(e.x - pos.x, e.y - pos.y) <= CFG.party.wait_radius ? e : null;
}
// Follower whose leader is dead: grind whatever it can SOLO near where it is (wait_radius), drift back when idle.
// Solo safety: partner_near() is null while the partner is dead, so fight_math leaves out its damage and heals.
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
	if (!in_party_cfg() || is_follower()) return;
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
	const p = state.pack;
	if (p) {
		state.danger[p.mtype] = (state.danger[p.mtype] || 1) * 0.6;
		state.cooldown[pack_key(p)] = Date.now() + CFG.death_pack_cooldown_ms;
		game_log(`Died at ${p.mtype}; safety for it now x${state.danger[p.mtype].toFixed(2)}`);
	}
	Object.assign(state, { session: null, pack: null, park_home: false, errand: null, recovering: false });
}
// Main loop: one decision per tick (see the header for the order). Reschedules itself: 200ms normally, sooner when the
// next attack is due (never under 50ms), 500ms when over the call budget, 1s while dead, 5s with nowhere to fight.
function tick() {
	let wait = 200;
	try {
		meter_socket();
		if (spent() > BUDGET.soft) wait = 500;
		else if (character.rip) {
			on_death();
			if (Date.now() >= next_respawn && can_spend(1, RESERVE.potion)) {
				next_respawn = Date.now() + 5000; // retry every 5s; a "cant_respawn" reply says exactly how long to wait
				Promise.resolve(respawn()).catch((e) => { if (e?.ms > 0) next_respawn = Date.now() + e.ms + 200; });
			}
			wait = 1000;
		} else if (state.recovering || character.hp < character.max_hp * CFG.flee_hp) {
			state.dead_handled = false;
			recover();
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
			if (is_merchant()) {
				merchant_tick();
				loot_chests();
				setTimeout(tick, 250);
				return;
			}
			if (is_follower()) {
				follower_tick();
				loot_chests();
				const L = leader_hb();
				set_message(`${errand_busy() ? state.errand + " | " : ""}${L.rip ? "waiting for " + L.name + " (dead)" : "with " + L.name + (L.pack ? " @ " + L.pack.mtype : "")} | ${character.esize} free`);
				setTimeout(tick, 150);
				return;
			}
			duo_check();
			if (!state.pack || Date.now() - state.last_pick > CFG.repick_ms) pick_pack();
			if (state.pack?.boss && boss_tick(state.pack)) { loot_chests(); setTimeout(tick, 200); return; }
			const pack = state.pack;
			const in_area = !!pack && character.map === pack.map && in_boundary(pack.boundary, 250);
			const t = choose_target(in_area || !pack);
			if (t && !watch_progress(t)) {
				state.last_target_at = Date.now();
				fight(t, true);
				wait = Math.min(Math.max(+(parent.next_skill?.attack || 0) - Date.now(), 50), 200); // wake for the next attack
			} else if (!pack) {
				set_message("No viable pack");
				wait = 5000;
			} else if (!walking() && !errand_busy()) {
				if (!in_area) {
					if (!state.waypoints.length) state.waypoints = make_waypoints(pack.boundary);
					const w = state.waypoints[state.wp % state.waypoints.length];
					travel({ map: pack.map, x: w.x, y: w.y });
				} else if (Date.now() - state.last_target_at > CFG.idle_giveup_ms) {
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
	} catch (e) { game_log("tick: " + e); }
	setTimeout(tick, wait);
}

setInterval(() => { if (spent() <= BUDGET.soft) sustain(); }, 250); // potions/regen checked 4x a second
tick();
