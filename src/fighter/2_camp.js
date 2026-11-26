// =====================================================================
// fighter/2_camp.js — fighters only (src/manifest.json): camp choice and review: scoring, danger checks, exploration, waypoints, patrol
// =====================================================================
// The maps a walk crosses after leaving `from`, ending with `to` (the BFS route; smart_move's may differ a little)
function map_route(from, to) {
	if (from === to || !Number.isFinite(map_hops(from, to))) return [];
	const prev = hops_prev[from] || {}, out = [];
	for (let m = to; m && m !== from && out.length < 30; m = prev[m]) out.unshift(m);
	return out;
}
const rect_gap = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
// A spot within danger_px of a spawn of such a monster: its name, else null. v25.82 (review N3): only a neighbour that
// is there (count > 0), comes at players (aggressive) and that the party couldn't handle (handles: any type — jr. and
// greenjr, not farmable, closed booboo and the halloween snakes)
function area_danger(area, mt) {
	for (const [pk, a2] of map_areas(area.map)) {
		const t = pk.type;
		if (t === mt || !(a2.count > 0) || !aggressive(t) || handles(t) || !valid_boundary(a2.boundary)) continue;
		if (rect_gap(area.boundary, a2.boundary) < CFG.danger_px) return t;
	}
	return null;
}
// A route through (or into) a map with such a monster that's also faster than us — it can't be outrun: "mt @ map", else null.
// v24.16: smart_move's route (route_to); from defaults to us (the leader also checks each member's way there)
// (v25.82: except — the destination camp's own type, fought there, not walked past)
function route_danger(to, tx, ty, from, except = null) {
	const v = character.speed || 55;
	const sp = G.maps[to]?.spawns?.[0] || [0, 0];
	// v24.17: with door data, the danger is only real if there's no way around it (go() walks the way around)
	if (G.maps[(from || character).map]?.doors) { const pl = route_plan(to, tx ?? sp[0], ty ?? sp[1], from || undefined, except); return pl ? pl.danger : null; }
	const r = { maps: map_route((from || character).map, to) };
	for (const m of r.maps) for (const [pk] of map_areas(m)) {
		const t = pk.type;
		if (t !== except && no_go(t, v)) return `${t} @ ${m}`;
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
	const v = !!m && ((m.aggro || 0) > 0 || (m.rage || 0) > 0) && !handles(mt); // (v25.82, review N3: any type; a skip doesn't count)
	deadly_c[mt] = { at: now, v };
	return v;
}
function looming() {
	const party = party_names();
	let best = null, bd = CFG.keep_px;
	for (const id in parent.entities || {}) {
		const e = parent.entities[id];
		if (!e || e.type !== "monster" || !e.visible || e.dead || (e.target && party.has(e.target))) continue; // on us: fight()'s escape
		if (e.mtype === state.pack?.mtype) continue; // what the party came for (a boss, a trial): not something to avoid
		const d = distance(character, e);
		if (d >= bd) continue;
		// v24.25: only one coming our way (moving, its next point nearer us) or already very close — a wandering ent
		// 300px off made Torlis step away and walk back over and over ("afraid of trees")
		const gx = Number.isFinite(e.going_x) ? e.going_x : e.x, gy = Number.isFinite(e.going_y) ? e.going_y : e.y;
		const coming = !!e.moving && Math.hypot(gx - character.x, gy - character.y) < d - 10;
		if ((coming || d < CFG.keep_close_px) && deadly_type(e.mtype)) (best = e), (bd = d);
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
			rest_place(P, CFG.pack_cooldown_ms, now);
			state.keep_log = [];
			game_log(`${e.mtype} keeps coming to ${P.mtype}; cooling this spot down`, C.warn);
		}
	}
	state.keep_at = now;
}
// v24.16: together, a spot is only as safe as the way there for every member (one in another map walks its own route)
// (v25.75, audit: x/y — the camp itself; without, the map's spawn)
function party_route_danger(to, x, y, except = null) {
	const own = route_danger(to, x, y, undefined, except);
	if (own || !in_party_cfg()) return own;
	for (const p of partners()) {
		if (p.map === character.map || p.errand) continue;
		const q = partner_pos(p), rd = route_danger(to, x, y, { map: q.map, x: q.x, y: q.y }, except);
		if (rd) return `${rd} (${p.name}'s way)`;
	}
	return null;
}
// v24.9: a spot's xp/s counting the walk there: over an expected stay of stay_min, travel minutes earn nothing. Spots
// were picked by rate alone, so a slightly better one maps away beat the one at hand (walk was 72-93% of the time)
const walk_factor = (area) => { const st = CFG.travel.stay_min * 60, t = travel_s(area.map, area.boundary); return Number.isFinite(t) ? st / (st + t) : 0; };
// The live goal as the camp review compares it: monster, map and (v25.75, Fable) the box — another area of the same
// monster on the same map is a new goal too (a rested hunt camp's other area waited for the 30-min review)
const dir_key = (now = Date.now()) => { const d = state.directive; return d && d.until > now ? `${d.monster}:${d.map}:${valid_boundary(d.boundary) ? d.boundary.join(",") : ""}` : ""; };
// v24.84: the tank's camp review — on time, or early once the party is stronger than at the last pick
function camp_review() {
	const cur = state.pack, now = Date.now(), since = now - (state.review_at || state.camp_at || now);
	if (!cur || cur.boss || cur.explore || errand_busy() || party_hit()) return false; // (a trial: explore_check ends it)
	const pw = party_power(), p0 = state.review_pw;
	// v24.88: a new goal (a hunt taken, a quest's material) or one ended → review after a minute, not up to 30
	const dir = dir_key(now);
	const goal_changed = dir !== (state.review_dir || "") && since >= 60_000;
	// v25.75 (audit): a walk to the camp no longer blocks a goal change — the party walked all the way to the old hunt's
	// camp, killed a few, then turned around. Other reviews still wait for the walk's end.
	if (walking()) { if (!goal_changed) return false; halt("camp_review"); }
	const stronger = !!(pw && p0 && (pw.lv - p0.lv >= 1 || (p0.gs > 0 && pw.gs / p0.gs - 1 >= CFG.camp_review_gear)));
	if (!(goal_changed || since >= CFG.camp_review_min * 60_000 || (stronger && since >= CFG.camp_review_early_min * 60_000))) return false;
	const before = pack_key(cur);
	pick_pack();
	const moved = !!state.pack && pack_key(state.pack) !== before;
	const other = (state.pick_table || []).filter((c) => !c.out && c.key !== before).sort((a, b) => (b.score || 0) - (a.score || 0))[0];
	state.review_last = { at: now, why: goal_changed ? (dir ? `goal: ${state.directive.reason}` : "the goal ended") : stronger ? "the party is stronger" : `${CFG.camp_review_min} min at the camp`, moved,
		text: moved ? `moved to ${state.pack.mtype}@${state.pack.map}` : `kept ${cur.mtype}@${cur.map}${other ? ` (next best ${other.mtype}@${other.map} ${Math.round(other.score)} ${rate_unit()}${other.m ? " measured" : " est"})` : ""}` };
	log_ev("review", { moved, to: state.pack ? `${state.pack.mtype}@${state.pack.map}` : null, why: state.review_last.why });
	return moved;
}
// =====================================================================
// Where to fight
// =====================================================================
// Switch to a pack: new patrol route, close the running xp measurement, log the reason
function set_pack(p, label) {
	if (!state.pack || !p || pack_key(state.pack) !== pack_key(p)) {
		if (p) game_log(label, C.info);
		if (p) log_ev(p.boss ? "boss" : "pack", { name: p.mtype, to: `${p.mtype}@${p.map}`, from: state.pack ? `${state.pack.mtype}@${state.pack.map}` : null, why: p.directive || `best ${rate_unit()}` });
		state.waypoints = p ? make_waypoints(p.boundary) : [];
		state.wp = 0;
		state.camp_at = Date.now(); // v24.84: the review clock
		end_session();
		state.last_target_at = Date.now();
	}
	state.pack = p;
}
// v25.69 (owner: "why did we go to squigtoads, kill 2, turn around and leave?"): why pick_pack would refuse a goal at
// this spot, or null. The goal rotation handed turns to goals refused here, and each such turn sent the party to the
// best camp for a minute or two, between the goals it could farm.
function goal_blocked(mt, map, boundary) {
	// (state.safe: the last pick's verdict; a type it hasn't judged yet: fight_profile's)
	if (type_skipped(mt) || !(state.safe[mt] !== undefined ? state.safe[mt] : fight_profile(mt))) return refuse_why(mt) || "not fought at the last pick";
	if (!map || !valid_boundary(boundary)) return null;
	const area = { map, boundary, mtype: mt };
	const dz = area_danger(area, mt) || party_route_danger(map, (boundary[0] + boundary[2]) / 2, (boundary[1] + boundary[3]) / 2, mt);
	if (dz) return dz;
	return (state.cooldown[pack_key(area)] || 0) > Date.now() ? "resting" : null;
}
// Choose where to fight: best-scoring safe pack, unless a directive (guide/quest/hunt) names one we can fight.
// Stays at the current pack unless the best is switch_margin better (hysteresis).
// ---- Exploration (v25.82, owner: "Stop being so conservative. Try killing everything.") ----
// Every CFG.explore.every_min of farming the tank gives an untried camp — no measured xp or gold rate — a trial of
// trial_min, the highest xp per kill first (G.monsters xp x our xp multiplier; no safety model). The trial's session
// records its rates like any other (state.measured, measured_gold); then the pick ranks it by them. A type whose trial
// recorded a rate in the last 24 h waits; a trial cut short (a hunt, a death, a refused walk) doesn't count. Hunts first.
const untried = (key) => state.measured[key] === undefined && !state.measured_gold[key];
const is_hunt_goal = (d) => !!d && (!!d.hunt || /monster hunt/.test(d.reason || ""));
const explore_xp = (mt) => (G.monsters[mt]?.xp || 0) * (xp_mult() || 1);
// A camp's hard ceiling in xp/s: all its monsters killed as fast as they respawn (review N8)
const explore_ceiling = (c) => { const pk = (G.maps[c.map]?.monsters || []).find((p) => p.type === c.mtype) || {}; return (c.count / expected_respawn(c.mtype, pk)) * (G.monsters[c.mtype]?.xp || 0); }; // (base xp/s, state.measured's unit)
// The next untried camp, from this pick's candidates (they passed the pick's own checks: a spawn worth farming, not
// resting, no danger next to it or on the way, reachable). Not the camp we stand at (it's measured in place, review
// N9), nor one whose ceiling can't beat the best measured xp rate (review N8).
function explore_next(cands, now = Date.now()) {
	const tried = state.explore.tried, here = state.pack && !state.pack.explore && valid_boundary(state.pack.boundary) ? pack_key(state.pack) : null;
	const best_m = Math.max(0, ...cands.map((c) => state.measured[pack_key(c)]).filter(Number.isFinite));
	return cands.filter((c) => untried(pack_key(c)) && pack_key(c) !== here && !(now - (tried[c.mtype] || 0) < 86_400_000) && explore_ceiling(c) > best_m)
		.sort((a, b) => explore_xp(b.mtype) - explore_xp(a.mtype) || b.score - a.score)[0] || null;
}
function explore_end(why_, now = Date.now()) {
	const E = state.explore, c = E.cur;
	if (!c) return;
	// (review N6) the trial's session closes here, so its rate is booked now; only a trial that recorded one counts as tried
	if (state.session?.key === c.key) end_session();
	const rated = !untried(c.key);
	// a type whose full-length trials record nothing twice in a row waits 24 h too, so it can't take a trial every
	// 30 min forever; a trial cut short (a hunt, a death) proves nothing (review N6)
	E.dry = E.dry || {}; E.why = E.why || {};
	if (rated) { E.tried[c.mtype] = now; delete E.dry[c.mtype]; delete E.why[c.mtype]; }
	else if (why_ === "time" && (E.dry[c.mtype] = (E.dry[c.mtype] || 0) + 1) >= 2) { E.tried[c.mtype] = now; E.why[c.mtype] = "no kills in 2 trials"; delete E.dry[c.mtype]; }
	log_ev("explore_end", { mtype: c.mtype, map: c.map, mins: Math.round((now - c.start) / 60_000), why: why_, rate: state.measured[c.key] ?? null, rated });
	game_log(`explore ${c.mtype} @ ${c.map}: trial over (${why_})${rated ? "" : " — nothing measured, it stays untried"}`, C.info);
	E.cur = null; E.last_end = now; E.none_at = 0;
}
// The tank, each tick: end a trial on time, or as soon as a hunt is live (hunts first); start one when it's due
function explore_check() {
	if (is_follower() || is_merchant() || (in_party_cfg() && leader_name() !== character.name)) return;
	const E = state.explore, X = CFG.explore, now = Date.now(), d = state.directive && state.directive.until > now ? state.directive : null;
	if (E.cur) {
		// (review N11: guarded like fighter_tick's other pick paths)
		if ((now >= E.cur.until || (is_hunt_goal(d) && d.monster !== E.cur.mtype) || d?.boss) && !errand_busy() && !(in_party_cfg() && party_break())) pick_pack();
		return;
	}
	if (now - (E.last_end || 0) < X.every_min * 60_000 || now - (E.none_at || 0) < 300_000) return;
	if (is_hunt_goal(d) || d?.boss || errand_busy() || party_hit() || walking() || character.rip || (in_party_cfg() && party_break())) return;
	pick_pack();
}
var camp_load_at = Date.now(); // (var: pick_pack can run before this file's top level — v25.70's load wait)
function pick_pack() {
	state.safe = {};
	for (const t in G.monsters) { const f = fight_profile(t); if (f) state.safe[t] = f; }
	const now = Date.now();
	// v25.70 (owner: "left cgoo, went to a neighboring zone, pathed right back"): a fresh load has no goal yet — the
	// members' hunts come with their next heartbeats and refresh_directive — so its first pick was the best camp and the
	// party walked back a minute later. In a party, the first 30 s after a load pick only a goal.
	if (camp_load_at && in_party_cfg() && !is_follower() && now - camp_load_at < 30_000 && !(state.directive && state.directive.until > now)) {
		// (from the first call: the loop holds pick_pack until every member is heard from; the 8 s refresh then ends the
		// wait — the members' goals are in by then; Fable)
		if (!state.goals_at_load) { state.goals_at_load = true; camp_load_at = now; setTimeout(() => { try { refresh_directive(); } catch (e) {} camp_load_at = 0; }, 8000); }
		return;
	}
	// v25.82: a trial holds its camp until explore_check ends it (time, or a hunt); a camp gone (a death cleared it, the
	// idle time rested it) or a type no longer fought ends it here
	const d = state.directive && state.directive.until > now ? state.directive : null, E = state.explore;
	if (E.cur) {
		const P = state.pack, hunt = is_hunt_goal(d) && d.monster !== E.cur.mtype;
		if (now < E.cur.until && !hunt && !d?.boss && P?.explore && pack_key(P) === E.cur.key && !((state.cooldown[E.cur.key] || 0) > now) && state.safe[E.cur.mtype]) return;
		explore_end(now >= E.cur.until ? "time" : hunt ? "a hunt" : d?.boss ? "a boss" : !P?.explore || pack_key(P) !== E.cur.key ? "left the camp (a death, a regroup)" : "the camp is resting", now);
	}
	let best = null;
	const seen = new Set(), route_cache = new Map(), cands = [];
	state.pick_skips = {};
	// v24.38: every spot considered and what became of it (report: "spot choice"). out: why it's out, null = a candidate
	const table = (state.pick_table = []);
	state.pick_table_at = Date.now(); // (the report's "spot choice … ago")
	const note = (key, t, map, out, extra) => table.push({ key, mtype: t, map, out, m: meas()[key] || 0, ...extra });
	each_area((pack, area) => {
		const t = pack.type, key = pack_key(area);
		if (CFG.force_type && t !== CFG.force_type) return;
		if (!state.safe[t]) { if (meas()[key] && !seen.has("x" + key)) { seen.add("x" + key); note(key, t, area.map, refuse_why(t) || "not fought"); } return; }
		if (!pack.grow && (expected_respawn(t, pack) > CFG.max_respawn || pack.count < CFG.min_count)) return;
		if (seen.has(key)) return;
		if ((state.cooldown[key] || 0) > now) { seen.add(key); note(key, t, area.map, `resting ${mins(state.cooldown[key])} (a flee, a death, or it ran dry)`); return; }
		seen.add(key);
		// v24.10: not next to aggressive monsters we can't take on, nor past ones we can't outrun (v25.82: nor through
		// burners on the way; the camp's own type is what we go there for)
		const rk = area.map + "#" + t, nb = area_danger(area, t), rd = nb ? null : route_cache.has(rk) ? route_cache.get(rk) : (route_cache.set(rk, party_route_danger(area.map, undefined, undefined, t)), route_cache.get(rk));
		if (nb || rd) { state.pick_skips[key] = nb ? `${nb} spawns within ${CFG.danger_px}px` : `the way there passes ${rd}`; note(key, t, area.map, state.pick_skips[key]); return; }
		const p = { mtype: t, ...area, ...score_area(t, pack, area) };
		p.rate = p.score; // its rate there in the farm mode's unit (v25.51: p.xp is its xp/s)
		p.score *= walk_factor(area); // v24.9: counting the walk there
		if (!(p.score > 0)) return; // v24.20: unreachable (no way there) or worthless: never the pick (it took "jrat @ jail")
		note(key, t, area.map, null, { rate: p.rate, score: p.score });
		cands.push(p);
		if (!best || p.score > best.score) best = p;
	});
	state.review_at = now; state.review_pw = party_power(); // v24.84
	state.review_dir = dir_key(now); // v24.88
	state.best_score = best ? best.rate : 0; // in the farm mode's unit
	state.best_xp = best ? best.xp : 0; // v25.51: xp/s at the pick, whatever the mode (goals, hunts, quests: best_known_xps)
	state.best_at = now;
	// v25.82 exploration: due (every_min since the last trial), no hunt and no boss on — the next untried camp
	const nx = explore_next(cands, now);
	E.next = nx ? { mtype: nx.mtype, map: nx.map } : null;
	if (!is_follower() && !is_hunt_goal(d) && !d?.boss && now - (E.last_end || 0) >= CFG.explore.every_min * 60_000) {
		if (!nx) E.none_at = now;
		else {
			const key = pack_key(nx);
			E.cur = { key, mtype: nx.mtype, map: nx.map, start: now, until: now + CFG.explore.trial_min * 60_000 };
			log_ev("explore", { mtype: nx.mtype, map: nx.map, xp: G.monsters[nx.mtype].xp, est: Math.round(nx.score) });
			return set_pack({ ...nx, explore: true, directive: `explore: ${nx.mtype} (untried, ${CFG.explore.trial_min} min trial)` },
				`→ EXPLORE ${nx.mtype} @ ${nx.map}: untried, ${G.monsters[nx.mtype].xp} xp a kill, ${CFG.explore.trial_min} min trial`);
		}
	}
	if (d && d.until > now && d.boss)
		return set_pack({ mtype: d.monster, map: d.map, boundary: d.boundary, count: 1, boss: true, est: 0, score: 0, directive: d.reason }, `→ ${d.reason} @ ${d.map}`);
	if (d && d.until > now && state.safe[d.monster]) {
		const area = { map: d.map, boundary: d.boundary, count: d.count, mtype: d.monster };
		// v24.10: a goal's spot gets the same danger check (not a boss: the party gathers for it)
		const dz = !d.boss && valid_boundary(area.boundary) && (area_danger(area, d.monster) || party_route_danger(area.map, (area.boundary[0] + area.boundary[2]) / 2, (area.boundary[1] + area.boundary[3]) / 2, d.monster));
		if (dz) state.pick_skips[pack_key(area)] = `goal ${d.monster}: ${dz}`;
		if (!dz && !((state.cooldown[pack_key(area)] || 0) > now)) {
			const pack = (G.maps[d.map]?.monsters || []).find((pk) => pk.type === d.monster) || { count: d.count };
			return set_pack({ mtype: d.monster, ...area, ...score_area(d.monster, pack, area), directive: d.reason }, `→ ${d.monster} @ ${d.map} (${d.reason})`);
		}
	}
	const cur = state.pack;
	if (cur && !cur.explore && state.safe[cur.mtype] && !((state.cooldown[pack_key(cur)] || 0) > now) && best && pack_key(best) !== pack_key(cur)) {
		const cur_v = (cur.est > 0 ? meas_aged(pack_key(cur), cur.est * state.realism) : meas()[pack_key(cur)] ?? cur.score) * walk_factor(cur); // v24.6: aged; v24.9: walk left
		if (best.score < cur_v * CFG.switch_margin) best = cur;
	}
	// v24.36: leaving a spot because its type stopped being fought (not for a better one): it rests 5 min
	if (cur && !cur.boss && !cur.explore && !state.safe[cur.mtype] && best && pack_key(best) !== pack_key(cur))
		rest_camp(pack_key(cur), 300_000, now);
	set_pack(best, best && `→ ${best.mtype} x${Math.round(best.count)} @ ${best.map} (~${best.score.toFixed(0)} ${rate_unit()}${meas()[pack_key(best)] ? " measured" : " est"})`);
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

function patrol() {
	if (is_moving(character) || walking() || !state.waypoints.length) return;
	if (distance(character, state.waypoints[state.wp]) < 30) state.wp = (state.wp + 1) % state.waypoints.length; // reached
	const next = state.waypoints[state.wp];
	if (can_move_to(next.x, next.y)) move_to_as("patrol", next.x, next.y, 500); // patrol is low priority: a move per 500ms at most
	else travel_as("patrol", { map: state.pack.map, x: next.x, y: next.y });
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
// Best normal spot's xp/s, without being there (for a member that doesn't pick)
function best_score(kind = farm_kind()) { // (v25.51: kind — "xp" for best_known_xps)
	const prof = {};
	let best = 0;
	each_area((pack, area) => {
		const t = pack.type;
		if (!(t in prof)) prof[t] = fight_profile(t);
		const f = prof[t];
		if (!f || (!pack.grow && (expected_respawn(t, pack) > CFG.max_respawn || pack.count < CFG.min_count))) return;
		const est = kill_value(t, f, kind) * Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(t, pack));
		best = Math.max(best, meas_aged(pack_key(area), est * state.realism, kind));
	});
	return best;
}
