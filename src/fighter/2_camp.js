// =====================================================================
// fighter/2_camp.js — fighters only (src/manifest.json): camp choice and review: scoring, danger checks, probes, waypoints, patrol
// =====================================================================
// The maps a walk crosses after leaving `from`, ending with `to` (the BFS route; smart_move's may differ a little)
function map_route(from, to) {
	if (from === to || !Number.isFinite(map_hops(from, to))) return [];
	const prev = hops_prev[from] || {}, out = [];
	for (let m = to; m && m !== from && out.length < 30; m = prev[m]) out.unshift(m);
	return out;
}
const rect_gap = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
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
		if (no_go(t, v)) return `${t} @ ${m}`;
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
			state.last_pick = 0;
			game_log(`${e.mtype} keeps coming to ${P.mtype}; cooling this spot down`, C.warn);
		}
	}
	state.keep_at = now;
}
// v24.16: together, a spot is only as safe as the way there for every member (one in another map walks its own route)
function party_route_danger(to) {
	const own = route_danger(to);
	if (own || !in_party_cfg()) return own;
	for (const p of partners()) {
		if (p.map === character.map || p.errand) continue;
		const q = partner_pos(p), rd = route_danger(to, undefined, undefined, { map: q.map, x: q.x, y: q.y });
		if (rd) return `${rd} (${p.name}'s way)`;
	}
	return null;
}
// v24.9: a spot's xp/s counting the walk there: over an expected stay of stay_min, travel minutes earn nothing. Spots
// were picked by rate alone, so a slightly better one maps away beat the one at hand (walk was 72-93% of the time)
const walk_factor = (area) => { const st = CFG.travel.stay_min * 60, t = travel_s(area.map, area.boundary); return Number.isFinite(t) ? st / (st + t) : 0; };
// v24.84: the tank's camp review — on time, or early once the party is stronger than at the last pick
function camp_review() {
	const cur = state.pack, now = Date.now(), since = now - (state.review_at || state.camp_at || now);
	if (!cur || cur.boss || cur.probe || errand_busy() || walking() || party_hit()) return false;
	const pw = party_power(), p0 = state.review_pw;
	// v24.88: a new goal (a hunt taken, a quest's material) or one ended → review after a minute, not up to 30
	const dir = state.directive && state.directive.until > now ? `${state.directive.monster}:${state.directive.map}` : "";
	const goal_changed = dir !== (state.review_dir || "") && since >= 60_000;
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
// Choose where to fight: best-scoring safe pack, unless a directive (guide/quest/hunt) names one we can fight.
// Stays at the current pack unless the best is switch_margin better (hysteresis).
// ---- Probing (CFG.probe) ----
// How far over the safety limit a monster is: fight_risk ÷ the same budget safe_enough uses (1 = exactly at it)
function risk_over(mt) {
	const m = G.monsters[mt], f = m && fight_math(m);
	if (!f) return Infinity;
	const limit = (f.hp_pool || character.max_hp) * safety_now() * danger_of(mt, f) * heal_mult(f);
	return fight_risk(f) / Math.max(1, limit);
}
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
// Best-xp spot of a monster just past the limit that would beat the best normal spot (this pick's) by min_gain
function probe_pick() {
	const P = CFG.probe, now = Date.now(), ref = state.best_score;
	let best = null;
	for (const mt in G.monsters) {
		if (!farmable_type(mt) || skipped("probe:" + mt)) continue; // safe ones fail r > 1 below
		const r = risk_over(mt);
		if (!(r > 1 && r <= P.max_over)) continue;
		const m = G.monsters[mt], f = fight_math(m);
		each_area((pack, area) => {
			if (pack.type !== mt || (!pack.grow && (expected_respawn(mt, pack) > CFG.max_respawn || pack.count < CFG.min_count))) return;
			if ((state.cooldown[pack_key(area)] || 0) > now) return;
			// v24.54: a probe spot gets the same checks as any other — no no-go neighbour, a safe way there. The probe
			// picked cgoo@level2s, whose only way passes the ents: the tank stood in town repeating "deadly_route".
			if (area_danger(area, mt) || party_route_danger(area.map)) return;
			// v24.3: a spot probed before is judged by what it measured (a probe that held far below its estimate was
			// re-probed every win_cooldown_h forever); raw = the unscaled estimate, the unit realism compares against
			const raw = kill_value(mt, null) * Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack));
			const est = meas_aged(pack_key(area), raw * state.realism); // v24.7: aged
			if (est >= P.min_gain * (ref || 0) && (!best || est > best.est)) best = { mt, area, est, raw, r, ttk: f.ttk, pred: Math.round(fight_risk(f)) };
		});
	}
	return best;
}
// "over the safety limit x1.27 (calibration x0.74, incidents x0.70, 2 with us)": by how much a type fails, and what
// scales its limit — the fight model's risk against the HP pool x safety x calibration x incidents (flees, deaths: they
// fade) x the priest's bonus, judged as fight_profile judges it
function over_text(mt) {
	const m = G.monsters[mt], f = m && fight_math(m);
	if (!f) return "over the safety limit (no damage on it)";
	const lim = (f.hp_pool || character.max_hp) * safety_now() * danger_of(mt, f) * heal_mult(f);
	const inc = state.danger[mt] || 1, cal = calib_factor(mt, f);
	return `over the safety limit x${(fight_risk(f) / lim).toFixed(2)} (calibration x${cal.toFixed(2)}${inc !== 1 ? `, incidents x${inc.toFixed(2)}` : ""}, ${f.mates} with us${f.priest ? "" : ", no priest"})`;
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
	// v24.38: every spot considered and what became of it (report: "spot choice"). out: why it's out, null = a candidate
	const table = (state.pick_table = []);
	state.pick_table_at = Date.now(); // (the report's "spot choice … ago": last_pick is zeroed to force a pick)
	const note = (key, t, map, out, extra) => table.push({ key, mtype: t, map, out, m: meas()[key] || 0, ...extra });
	each_area((pack, area) => {
		const t = pack.type, key = pack_key(area);
		if (CFG.force_type && t !== CFG.force_type) return;
		if (!state.safe[t]) { if (meas()[key] && !seen.has("x" + key)) { seen.add("x" + key); note(key, t, area.map, over_text(t)); } return; }
		if (!pack.grow && (expected_respawn(t, pack) > CFG.max_respawn || pack.count < CFG.min_count)) return;
		if (seen.has(key)) return;
		if ((state.cooldown[key] || 0) > now) { seen.add(key); note(key, t, area.map, `resting ${mins(state.cooldown[key])} (a flee, a death, or it ran dry)`); return; }
		seen.add(key);
		// v24.10: not next to aggressive monsters we can't take on, nor past ones we can't outrun
		const nb = area_danger(area, t), rd = nb ? null : route_cache.has(area.map) ? route_cache.get(area.map) : (route_cache.set(area.map, party_route_danger(area.map)), route_cache.get(area.map));
		if (nb || rd) { state.pick_skips[key] = nb ? `${nb} spawns within ${CFG.danger_px}px` : `the way there passes ${rd}`; note(key, t, area.map, state.pick_skips[key]); return; }
		const p = { mtype: t, ...area, ...score_area(t, pack, area) };
		p.rate = p.score; // its rate there in the farm mode's unit (the probe reference; v25.51: p.xp is its xp/s)
		p.score *= walk_factor(area); // v24.9: counting the walk there
		if (!(p.score > 0)) return; // v24.20: unreachable (no way there) or worthless: never the pick (it took "jrat @ jail")
		note(key, t, area.map, null, { rate: p.rate, score: p.score });
		if (!best || p.score > best.score) best = p;
	});
	state.last_pick = now;
	state.review_at = now; state.review_pw = party_power(); // v24.84
	state.review_dir = state.directive && state.directive.until > now ? `${state.directive.monster}:${state.directive.map}` : ""; // v24.88
	state.best_score = best ? best.rate : 0; // in the farm mode's unit (the probe's reference)
	state.best_xp = best ? best.xp : 0; // v25.51: xp/s at the pick, whatever the mode (goals, hunts, quests: best_known_xps)
	state.best_at = now;
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
				`→ PROBE ${pb.mt} @ ${pb.area.map}: risk x${pb.r.toFixed(2)} of the limit, ~${Math.round(pb.est)} ${rate_unit()}`);
		}
	}

	const d = state.directive;
	if (d && d.until > now && farmable_type(d.monster) && !state.safe[d.monster] && d.guide_safe)
		state.safe[d.monster] = { ttk: d.seconds || 5, xp: G.monsters[d.monster].xp, trusted: true }; // guide's kill time,
		// or 5s if it gave none — the guide's own fight model judged this route safe for us
	if (d && d.until > now && d.boss)
		return set_pack({ mtype: d.monster, map: d.map, boundary: d.boundary, count: 1, boss: true, est: 0, score: 0, directive: d.reason }, `→ ${d.reason} @ ${d.map}`);
	// v25.82: a held hunt (the party is at it, refresh_directive) is kept whatever the camp's rest, danger or safety verdict
	// v25.84: a hunt's directive on the way there is kept like a held one (a safety flip, a rest or a danger verdict
	// mid-walk turned the party back before it ever arrived; Fable)
	const hunt_dir = d && (d.hold || !!hunt_open(d.monster));
	if (d && d.until > now && (state.safe[d.monster] || (hunt_dir && fight_profile(d.monster)))) {
		const area = { map: d.map, boundary: d.boundary, count: d.count, mtype: d.monster };
		// v24.10: a goal's spot gets the same danger check (not a boss: the party gathers for it)
		const dz = !d.boss && !hunt_dir && valid_boundary(area.boundary) && (area_danger(area, d.monster) || party_route_danger(area.map));
		if (dz) state.pick_skips[pack_key(area)] = `goal ${d.monster}: ${dz}`;
		if (!dz && (hunt_dir || !((state.cooldown[pack_key(area)] || 0) > now))) {
			const pack = (G.maps[d.map]?.monsters || []).find((pk) => pk.type === d.monster) || { count: d.count };
			return set_pack({ mtype: d.monster, ...area, ...score_area(d.monster, pack, area), directive: d.reason }, `→ ${d.monster} @ ${d.map} (${d.reason})`);
		}
	}
	const cur = state.pack;
	if (cur && state.safe[cur.mtype] && !((state.cooldown[pack_key(cur)] || 0) > now) && best && pack_key(best) !== pack_key(cur)) {
		const cur_v = (cur.est > 0 ? meas_aged(pack_key(cur), cur.est * state.realism) : meas()[pack_key(cur)] ?? cur.score) * walk_factor(cur); // v24.6: aged; v24.9: walk left
		if (best.score < cur_v * CFG.switch_margin) best = cur;
	}
	// v24.36: leaving a spot because it stopped passing the safety check (not for a better one): it rests 5 min. A verdict
	// near the limit flipped with every small change in the party's stats, and the leader walked between two spots
	// (72 changes in an hour, cgoo ↔ booboo, through the door between them).
	if (cur && !cur.boss && !cur.probe && !state.safe[cur.mtype] && best && pack_key(best) !== pack_key(cur))
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
	const c = state.calib[calib_key(P.mtype)];
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
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
// Best normal spot's xp/s, without being there (for a member that doesn't pick)
function best_score(kind = farm_kind()) { // (v25.51: kind — "xp" for best_known_xps)
	const prof = {};
	let best = 0;
	each_area((pack, area) => {
		const t = pack.type;
		if (!(t in prof)) { const f = farmable_type(t) && fight_math(G.monsters[t]); prof[t] = f && safe_enough(f, t) ? f : null; }
		const f = prof[t];
		if (!f || (!pack.grow && (expected_respawn(t, pack) > CFG.max_respawn || pack.count < CFG.min_count))) return;
		const est = kill_value(t, f, kind) * Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(t, pack));
		best = Math.max(best, meas_aged(pack_key(area), est * state.realism, kind));
	});
	return best;
}
