// =====================================================================
// src/fighter/ — loaded by the fighters only (after shared/, before main.js; src/manifest.json). What only a fighter
// does: follow the tank, heal, hand loot and gold to the merchant, its own token buys and upgrade projects, collecting
// what the merchant holds for it. Its answers to the merchant's functions are in
// fighter/8_merchant_parts.js (role functions).
// fighter/0_loop.js — fighters only (src/manifest.json): the fighter's part of tick() and the follower: what runs every tick, and the fighters' code messages
// =====================================================================
// Follower: stay with the leader, shoot its target (or whatever is hitting the party), heal
function follower_tick() {
	const L = leader_hb();
	if (!L || L.rip) { // no leader (no tank online), or it's dead: stand, heal, fight only what's on us
		state.last_target_at = Date.now();
		if (party_heal()) return;
		const a = hit_on_me();
		if (a) fight(a, false);
		return;
	}
	// v24.8: a fleeing leader sends no pack: keep ours and hold it (as on its errands) instead of walking to its town spot
	state.pack = L.pack && valid_boundary(L.pack.boundary) ? { mtype: L.pack.mtype, map: L.pack.map, boundary: L.pack.boundary, directive: `following ${L.name}`, probe: !!L.pack.probe }
		: L.recovering && state.pack ? state.pack : null;
	state.last_target_at = Date.now();
	if (party_heal()) return;
	// v24.57: a follower never walks to the camp on its own. While the leader is on an errand (a town trip: the party
	// is in town together) it waits where it is in town — or walks to town if it somehow isn't there; otherwise it
	// goes to the leader. The old rule (v18.8: "leader on an errand → go and fight at its camp") sent Aspernari off to
	// croc alone the moment her own town run ended, 2s before the tank's status showed its errand over.
	const away = !!L.errand;
	// v24.61: not in town while the leader is on an errand → go to the leader, wherever it is (it used to walk to town alone)
	const pos = away && in_town() ? { map: character.map, x: character.x, y: character.y } : partner_pos(L);
	const lt = !away && L.target && parent.entities[L.target];
	const leader_t = lt && valid(lt) && lt.type === "monster" ? lt : null;
	// v24.8: what's hitting us first, always; then assist the tank (the leader)
	// v24.56: a follower only goes for what already targets the party. It used to pick its own monster of the camp's
	// type (follower_pick) and walk up to it; fire() then refused the attack (only the tank starts a fight), so it stood
	// next to untanked monsters — Sanala, 150px from the tank, beside five level 8-9 poisio. follower_pick is still
	// called for what it keeps up to date (state.safe: which type the party can take), not for its pick.
	follower_pick(pos);
	// v25.20: the tank one-shoots the camp's type → our own random pick of it (os_pick), before the tank's call
	const ffa = !away && !!L.os?.includes(state.pack?.mtype);
	let t = hit_on_me() || (ffa ? os_pick() : null) || caller_target() || leader_t || choose_target(false);
	if (t && !t.target && !free_for_all(t)) t = null;
	announce_target(t);
	// engaged = a target within wait_radius of the leader: stay on it (close in, then hold position in reach) instead of
	// drifting back to the leader — melee used to step back to the leader after every swing at a target that wasn't
	// attacking it, and only hit what wandered into range
	const engaged = !!t && pos.map === character.map && (Math.hypot(t.x - pos.x, t.y - pos.y) <= CFG.party.wait_radius || free_for_all(t)); // (v25.20: anywhere at the camp)
	if (t) {
		if (get_targeted_monster() !== t) change_target(t);
		if (engaged) break_walk_for(t);
		// close in on targets out of reach; kiting (ranged, when the target is on us) takes precedence
		// v24.66: only when it's out of range. It used to step in from 90% of range — a caster that had just cast on
		// its target then walked closer to it.
		if (engaged && !walking() && !errand_busy() && distance(character, t) > character.range) approach(t);
		if (!hold_for_tank(t) && !class_skills(t) && can_attack(t)) fire("attack", t);
	}
	if (engaged || walking() || errand_busy()) return;
	const d = pos.map === character.map ? Math.hypot(pos.x - character.x, pos.y - character.y) : Infinity;
	state.follow_block = null;
	// v24.66: a caster stays within 70% of its range of the tank (what the tank fights is beside it: in range, and the
	// tank in heal range), not within `follow` px — it stepped after the tank on every monster while already in range
	const fol = RANGED ? Math.max(CFG.party.follow, Math.min(character.range * 0.7, CFG.party.engage_px * 0.5)) : CFG.party.follow;
	if (d > CFG.party.follow_far) travel_as("follower_tick", pos);
	else if (d > fol) {
		const ang = Math.atan2(character.y - pos.y, character.x - pos.x);
		const want = { x: pos.x + Math.cos(ang) * fol * 0.6, y: pos.y + Math.sin(ang) * fol * 0.6 };
		if (can_move_to(want.x, want.y)) move_to_as("follower_tick", want.x, want.y, 300); else travel_as("follower_tick", pos);
	}
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
// v24.95: a fighter's part of tick() (alive, the party whole, not parked, no event): the follower follows; the tank
// picks and reviews its camp, holds for the party, fights, walks, patrols. Returns the ms until the next tick.
function fighter_tick() {
	let wait = 200;
	if (is_follower()) {
		lead_lost();
		follower_tick();
		loot_chests();
		const L = leader_hb();
		set_message(`${errand_busy() ? state.errand + " | " : ""}${!L ? "no tank online" : L.rip ? "waiting for " + L.name + " (dead)" : "with " + L.name + (L.pack ? " @ " + L.pack.mtype : "")} | ${character.esize} free`);
		return 150;
	}
	if (cave_entry_tick()) { loot_chests(); return 200; } // v25.22: once a day, the party goes into the Cave of Many Dreams
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
	if (state.pack?.boss && boss_tick(state.pack)) { loot_chests(); return 200; }
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
		return 200;
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
		return 250;
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
			rest_camp(pack_key(pack), CFG.pack_cooldown_ms);
			pick_pack();
		} else if (Date.now() - state.last_target_at > Math.max(CFG.idle_giveup_ms, Math.min(CFG.max_respawn, G.monsters[pack.mtype]?.respawn || 0) * 1000 + 5000)) {
			game_log(`Idle at ${pack.mtype}; cooling down this pack`, C.dim);
			rest_camp(pack_key(pack), CFG.pack_cooldown_ms);
			pick_pack();
		} else patrol();
	}
	loot_chests();
	if (pack) {
		const s = state.session, live = s && Date.now() - s.start > 10_000 ? (s.xp / ((Date.now() - s.start) / 1000)).toFixed(0) : "–";
		const src = pack.directive ? pack.directive.split(/[ :(]/)[0] : "xp";
		set_message(`${errand_busy() ? state.errand + " | " : ""}${pack.mtype} (${src}) ${live}xp/s | ${character.esize} free`);
	}
	return wait;
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
// ---- Assist the tank (v15.4): with a tank near, it picks the targets and everyone else hits its target ----
const i_am_tank = () => CFG.party.tank_first && in_party_cfg() && CFG.gear_tank.includes(character.ctype) && partners_near(400).length > 0;
// ---- the fighters' code-message kinds (v25.1): true = handled; on_cm_message (shared/17_party.js) calls this first ----
function fighter_cm(m) {
	if (m && m.message?.k === "tgt" && (CFG.party.members || []).includes(m.name) && fresh(state.partners[m.name])) {
		state.partners[m.name].target = m.message.id; // a member holding fire for us: hit this one now
		return true;
	}
	if (m && m.message?.k === "mhb" && m.name === CFG.merchant?.name) { state.merchant = { ...m.message, name: m.name, t: Date.now() }; return true; }
	if (m && m.message?.k === "verdict" && (CFG.party.members || []).includes(m.name) && m.name !== character.name) { apply_verdict(m.message, m.name); return true; }
	if (m && m.message?.k === "ptown_off" && (CFG.party.members || []).includes(m.name) && m.name !== character.name) { if (state.ptown && !errand_busy()) state.ptown = null; return true; }
	if (m && m.message?.k === "ptown" && (CFG.party.members || []).includes(m.name) && m.name !== character.name) { ptown_recv(m.message, m.name); return true; }
	if (m && m.message?.k === "bill" && m.name === CFG.merchant?.name && !is_merchant()) { // potions it handed us (v23.0)
		const g = Math.max(0, Math.round(+m.message.g || 0));
		state.owe = (state.owe || 0) + g;
		log_ev("bill", { g, what: m.message.what || "" });
		return true;
	}
	return false;
}
// ---- role functions (v25.11): the main loop's fighter parts (tick(), main.js); the merchant's are in merchant/0_loop.js ----
function flee_tick() { return false; } // fighters never flee (v24.51): at low HP they fight on with potions and heals
function role_tick() { return fighter_tick(); }
