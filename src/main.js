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
			if (is_follower()) {
				lead_lost();
				follower_tick();
				loot_chests();
				const L = leader_hb();
				set_message(`${errand_busy() ? state.errand + " | " : ""}${!L ? "no tank online" : L.rip ? "waiting for " + L.name + " (dead)" : "with " + L.name + (L.pack ? " @ " + L.pack.mtype : "")} | ${character.esize} free`);
				setTimeout(tick, 150);
				return;
			}
			// v24.8: with the party waiting at our pack while we're on an errand or walking back: no re-pick (the periodic
			// one, town_body's reset) — that switched to another pack and moved them
			const cp = state.pack, waiting = in_party_cfg() && !!cp && partners().length > 0 && !partners_near().length &&
				partners().every((q) => q.pack && valid_boundary(q.pack.boundary) && pack_key(q.pack) === pack_key(cp));
			// v24.45: nor while a member is in town (a town run, a party trip): it's back in a minute, and a pick made
			// without it ("1 with us") ruled out the party's spot and walked the rest to a weaker one each time
			const member_in_town = in_party_cfg() && !!cp && partners().some((q) => q.errand === "town" || q.pt);
			probe_check();
			// v24.60: the party sits at its camp. No re-pick every repick_ms (estimates within a few % of each other moved
			// it between camps: 18 changes in an hour). A camp is left only when it's gone: a death there, nothing to
			// fight for the idle time, or no safe way to it — each of those clears state.pack or picks again itself.
			// v24.62: and it's chosen by the whole party: not before every member has been heard from (the tank used to
			// pick on the first tick after loading, judging every monster for itself alone, and the party sat there)
			if (!state.pack && !(in_party_cfg() && party_break())) pick_pack();
			else if (state.pack && !(in_party_cfg() && party_break())) camp_review(); // v24.84
			if (state.pack?.boss && boss_tick(state.pack)) { loot_chests(); setTimeout(tick, 200); return; }
			const pack = state.pack;
			const in_area = !!pack && character.map === pack.map && in_boundary(pack.boundary, 250);
			if (pack && state.group_ok && state.group_ok !== pack_key(pack)) state.group_ok = null;
			// v24.14: something we can't take on is close and may attack: step away first (still fight what's on us)
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
				else if (walking() && !errand_busy()) { halt("tick"); }
				state.last_target_at = Date.now(); // waiting for a member isn't an idle camp
				set_message(`waiting for ${hold} (${Math.round((Date.now() - state.group_wait.since) / 1000)}s)`);
				loot_chests();
				setTimeout(tick, 250);
				return;
			}
			// v24.74: on its walk to town (a party trip) the tank only fights what is already on a member. It kept starting
			// fights on the camp's monsters, each one stopping the walk: 12 minutes "on a town errand" without leaving the camp.
			const t = hit_on_me() || (!i_am_tank() && caller_target()) || (state.lead_walk ? choose_target(false) : choose_target(in_area || !pack, true));
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
					travel_as("tick", { map: pack.map, x: w.x, y: w.y });
				// v24.6: at least one respawn (packs up to max_respawn are farmed, scored as if we wait for them)
				} else if (camp_overgrown(pack)) {
					// v24.61: every monster here has levelled past what the party takes on: leave now, not after the idle time
					game_log(`${pack.mtype}: all ${camp_overgrown(pack)} here are levelled past the limit; resting this camp`, C.warn);
					log_ev("overgrown", { mtype: pack.mtype, n: camp_overgrown(pack) });
					state.cooldown[pack_key(pack)] = Date.now() + CFG.pack_cooldown_ms;
					pick_pack();
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
setInterval(gap_tick, 250);
tick();

// =====================================================================
// OVERVIEW
// Adventure Land farmer. Source in src/ by role (common.js, fighter.js, merchant.js, main.js; v24.94), built into
// farmer.js; VERSION (first line of common.js) is the only
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
