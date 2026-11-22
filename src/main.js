// =====================================================================
// main.js — loaded last by every character: death handling, the main loop (tick) and start-up, the overview.
// =====================================================================
// =====================================================================
// Main loop
// =====================================================================
let next_respawn = 0;
// First tick after dying: be more careful with that monster (safety × 0.6 per death) and avoid that pack for
// death_pack_cooldown_ms; drop the errand and measurement in progress
function on_death() {
	if (state.dead_handled) return;
	state.dead_handled = true;
	// v24.51: our own suicide (regrouping) is not the camp's doing: logged, nothing blamed, nothing rested
	if (Date.now() - suicide_at < 20_000) {
		Object.assign(state, { session: null, pack: null, park_home: false, errand: null, recovering: false, fled_home: false, ptown: null });
		return;
	}
	const pmd = postmortem();
	// v20.0: a death with no damage seen in the last 10s (dead when the script started, or killed while it wasn't
	// watching) is logged as unexplained and doesn't blame the pack: it used to cut the pack's safety ×0.6 on no evidence
	pmd.watched_s = Math.round((Date.now() - seen.since) / 1000);
	pmd.unexplained = !Object.keys(pmd.dmg10 || {}).length;
	log_ev("death", pmd);
	bucket().deaths++;
	const p = state.pack;
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
	Object.assign(state, { session: null, pack: null, park_home: false, errand: null, recovering: false, fled_home: false, ptown: null });
}
// Main loop: one decision per tick (see the header for the order). Reschedules itself: 200ms normally, sooner when the
// next attack is due (never under 50ms), 500ms when over the call budget, 1s while dead, 5s with nowhere to fight.
function tick() {
	let wait = 200;
	try {
		meter_socket();
		if (spent() > BUDGET.soft) wait = 500;
		else if (character.rip) {
			probe_check(); // v24.3: a probe ends as failed when the leader dies, not "held" after respawning
			on_death();
			if (Date.now() >= next_respawn && can_spend(1, RESERVE.potion)) {
				next_respawn = Date.now() + 5000; // retry every 5s; a "cant_respawn" reply says exactly how long to wait
				Promise.resolve(respawn()).catch((e) => { if (e?.ms > 0) next_respawn = Date.now() + e.ms + 200; });
			}
			wait = 1000;
		} else if (party_break_tick()) { // v24.51: the party isn't whole — suicide to town, or wait there
			state.dead_handled = false;
			state.recovering = false;
			wait = 500;
		} else if (is_merchant() && (state.recovering || character.hp < character.max_hp * CFG.flee_hp)) {
			// fleeing to town: only the merchant (fighters never flee)
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
			// v24.58: the tank decides. A follower doesn't start a town trip or go to an event by itself: it joins the
			// party's trip when one is announced, tells the tank what it needs (heartbeat: tn), and follows.
			if (is_follower()) ptown_join_tick(); else town_check();
			if (!is_follower() && event_tick()) { loot_chests(); setTimeout(tick, 200); return; }
			if (is_merchant()) {
				merchant_tick();
				loot_chests();
				setTimeout(tick, 250);
				return;
			}
			wait = fighter_tick(); // v24.95: fighter/
		}
	} catch (e) { game_log("tick: " + e); log_error("tick: " + e); }
	setTimeout(tick, wait);
}

setInterval(() => { if (spent() <= BUDGET.soft) sustain(); }, 250); // potions/regen checked 4x a second
setInterval(gap_tick, 250);
tick();

// =====================================================================
// OVERVIEW
// Adventure Land farmer. Source in src/ (v24.94; manifest.json: shared/ for every character, fighter/ or
// merchant/, main.js), built into farmer.js; VERSION (first line of shared/00_config.js) is the only
// version number, and report() prints it. What changed between versions is in the git history, not here.
//
// Each tick, first match wins:
//   1. Dead → respawn as soon as the server allows (rip_time).
//   2. The merchant, HP < flee_hp → cancel any walk, teleport to town, fight back only if hit, resume at
//      recover_hp/recover_mp. Fighters never flee; a member dead or offline → the others suicide and wait in town.
//   3. park() was called → finish the current errand, stand in town until resume().
//   4. Town run, when something is due: Daisy (hunt, tokens) → quest crafts (Cole etc.) → Progression Guide steps →
//      compound → upgrade project → exchange → elixir → sell → potions → bank (→ compound what the bank visit
//      fetched). Needs HP > town_hp and no attacker; with <= 3 free slots, HP > town_hp_critical and attackers are
//      ignored. A member already in town relaxes the thresholds (sync_factor) to share the trip. Together (v24.28), a
//      trip is announced: the others come along when they have town work or their spot isn't safe without the leavers
//      (CFG.party.town_together); all wait in town for each other and walk back together. Runs start with the town
//      teleport when this map's spawn is nearer town (town_hop). With the merchant
//      online, fighters go only at <= fighter_min_free slots / fighter_pot_min potions, and for guide steps alone at
//      most every guide_gap_ms.
//   5. Merchant → supply runs, secondhands, donations, stand (see Merchant).
//   6. Party follower → stay with the leader; hit the tank's target, else the leader's, else its own pick of the
//      leader's pack type within wait_radius of the leader, staying engaged until the kill; heal (priests),
//      energize the lowest-mana member (mages).
//   7. Leader (the tank) → a live boss we can survive, else fight at the chosen pack.
//   (Before 5-7: a live server event in CFG.events — Goo Brawl, Giga Crab — that we can survive: join and fight it.)
//
// Where to fight (the party leader):
//   live boss > own monster hunt > own-quest materials > guide-quest materials > guide farm row (skipped when
//   outlevelled) > best xp/s pack (CFG.goal_w). In a party the leader merges every member's weighted goals: a monster
//   on 2+ lists whose goals finish within mutual_max_h wins (more members, quicker first); otherwise members take
//   turn_min-minute turns.
//
// Probing (CFG.probe): every every_min the leader may try, for `minutes`, the best-xp spot just past the safety limit,
//   aborted when a member drops below probe.abort_hp; calibration learns from it, so the safe frontier can move.
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
// Gear: items are scored per class: primary stats by the class's lstats (G.classes, the game's data docs), the rest
//   by CFG.gear_w (tanks weigh defence double), plus class weapon/offhand modifiers and set bonuses. Every 5s wear the best
//   bag upgrade, drink the best elixir, else hand a spare to a nearby member it upgrades (send_item). Travel gear: worn
//   pieces that cost speed come off for long walks and go back on at the destination or when something attacks. The bank is
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
// Party (CFG.party): the tank leads; members talk via send_cm every beat_ms (heartbeats), invite each
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
