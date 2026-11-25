// =====================================================================
// fighter/4_goals.js — fighters only (src/manifest.json): goals and directives: quests, hunts, bosses, events, the guide's farm rows
// =====================================================================
// Leader/solo at a boss pack: fight it when in view, else walk to its last reported position
function boss_tick(pack) {
	boss_type = pack?.mtype || null;
	const e = Object.values(parent.entities || {}).find((x) => x.type === "monster" && x.mtype === pack.mtype && x.visible && !x.dead);
	// v24.4: something else hitting us on the way (or while we wait for the party) gets fought; we used to walk or stand
	// there taking hits until flee HP
	const hit = !e || !e.target ? choose_target(false) : null;
	if (hit && hit.mtype !== pack.mtype && hit.target === character.name) { state.last_target_at = Date.now(); fight(hit, true); return true; }
	if (e && !e.target && (party_missing().length || !boss_safe(pack.mtype, "party"))) { // judged with the whole party: wait for it before engaging
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
	if (!walking() && !errand_busy()) travel_as("boss_tick", { map: b.map, x: b.x, y: b.y });
	set_message(`→ BOSS ${pack.mtype} @ ${b.map}`);
	return true;
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
const drop_rate = (mt, item) => (drop_sources(item).find(([m]) => m === mt) || [, 0])[1];
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
		const qxp = meas_aged(pack_key(pickm), f ? f.xp * pickm.ips * party_n() / Math.max(1e-9, drop_rate(pickm.monster, pickm.item)) : 0, "xp"); // (v25.51: xp)
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
function hunt_directive() {
	const h = character.s.monsterhunt;
	if (!CFG.auto_monster_hunt || !h || !(h.c > 0) || !fight_profile(h.id) || !hunt_feasible(h)) return null;
	const best = resolve_area(h.id);
	return best && { monster: h.id, ...best, reason: `monster hunt ${h.c} left`, guide_safe: false };
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
	// v25.69: and only goals the camp pick would take there (goal_blocked) — a refused goal's turn sent the party to the best camp
	const area_of = (e) => (e.area === undefined ? (e.area = (e.src ? resolve_area(e.monster, e.src.map, e.src.boundary, e.src.count) : resolve_area(e.monster)) || null) : e.area);
	const blocked = [];
	const ok = (e) => {
		if (!G.monsters[e.monster] || !(fight_profile(e.monster) || (e.src?.guide_safe && farmable_type(e.monster)))) return false;
		const a = area_of(e), why = a ? goal_blocked(e.monster, a.map, a.boundary, e.src?.guide_safe) : "no spawn found";
		if (why) blocked.push(`${e.monster} (${Object.keys(e.w).join(", ")}): ${why}`);
		return !why;
	};
	const names = (e) => Object.keys(e.w);
	const hours = (e) => Math.max(...names(e).map((n) => e.eta[n]));
	const weight = (e) => names(e).reduce((t, n) => t + e.w[n], 0);
	const to_dir = (e, label) => {
		const area = area_of(e);
		return area && { monster: e.monster, ...area, reason: label, guide_safe: !!e.src?.guide_safe, for_partner: !e.w[me], mutual: names(e).length > 1 };
	};
	const cands = [...by.values()].filter((e) => names(e).length && ok(e));
	// mutual only when the combined weight reaches a hunt's: two guide-farm rows (1+1) don't override members' hunts
	// an hour of walking counts as travel.weight_h hours of goal time: a near shared goal beats an equal far one
	const walk_h = (e) => { if (e.walk_h === undefined) { const a = area_of(e); e.walk_h = a ? travel_s(a.map, a.boundary) / 3600 : 0; } return e.walk_h; };
	const rank = (e) => weight(e) / (1 + hours(e) + walk_h(e) * CFG.travel.weight_h);
	const mutual = cands.filter((e) => names(e).length >= 2 && weight(e) >= CFG.goal_w.hunt).sort((a, b) => rank(b) - rank(a));
	state.shared = { mutual: mutual.map((e) => `${e.monster} ~${hours(e).toFixed(1)}h (${e.why.join("; ")})`),
		too_slow: [...by.values()].flatMap((e) => e.too_slow.map((w) => `${e.monster}: ${w}`)), blocked, at: now };
	if (mutual.length) return to_dir(mutual[0], `mutual: ${[...new Set(mutual[0].why)].slice(0, 3).join(" + ")}`);
	// nothing in common: turns, rotating through members that have a goal the group can fight
	const top = (n) => cands.filter((e) => e.w[n]).sort((a, b) => b.w[n] - a.w[n])[0];
	const mine_ok = !!mine; // (refresh_directive passes only a goal the camp pick would take)
	const order = [me, ...partners().map((p) => p.name).sort()].filter((n) => (n === me ? mine_ok : top(n)));
	if (!order.length) return mine_ok ? mine : null;
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
	if (state.turn.who === me) return mine_ok ? mine : null;
	const t = top(state.turn.who);
	return to_dir(t, `${state.turn.who}: ${t.why.find((w) => w.startsWith(state.turn.who + ":"))?.slice(state.turn.who.length + 2) || t.monster}`);
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
	// (v25.69: the first the camp pick would take — a refused hunt no longer hides our quest goals)
	for (const f of [boss_directive, hunt_directive, oq, gq, () => g]) if (!mine) { const x = f(); if (x && (x.boss || !goal_blocked(x.monster, x.map, x.boundary, x.guide_safe))) mine = x; }
	// A follower never picks where to fight, so the leader works both members' goals: mutual ones first, otherwise
	// turns (pick_shared).
	let d = mine;
	// (v25.69: no "|| mine" — pick_shared leaves out a goal the camp pick would refuse, and that one mustn't come back)
	if (partners().length && in_party_cfg() && !is_follower() && !mine?.boss) d = pick_shared(mine); // a boss beats every goal
	// commitment: don't turn around on the way to (or right after reaching) a target because the goal ranking shifted
	const cur = state.directive, L = state.dir_lock;
	// v25.69 (owner: "why did we go to squigtoads, kill 2, turn around and leave?"): a member's finished hunt dropped its
	// goal, the tank re-picked the best camp, went to town to turn it in, came back to that camp — and the member's new
	// hunt (often the same monster) arrived a minute later. While a hunt trip is due, and for 45 s after a town run (the
	// members' new goals reach us), the current goal stays.
	// (v25.73: through the whole party trip and 45 s after it ends — counted from our own town run's end, the 34 s wait
	// in town for the others used it up and the party still went to the best camp first)
	if (!d && cur && !cur.boss && in_party_cfg() && (hunts_trip_due() || state.ptown?.joined || now - Math.max(state.town_end_at || 0, state.ptown_done_at || 0) < 45_000)) d = cur;
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
		// v25.70 (owner: "fighting cgoo for absolutely no reason"): the camp's reason follows the goal live — it was the
		// text at the pick ("39 left" while 29 were left)
		const P = state.pack;
		if (P?.directive && !P.boss && !P.probe && !is_follower() && P.mtype === d.monster && P.map === d.map) P.directive = d.reason;
	} else if (state.directive) {
		state.directive = null;
		state.last_pick = 0;
	}
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
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
let event_join_at = 0, event_logged = null;
// Leader and followers alike: join, then fight the event's monsters (they're cooperative, which normal targeting
// skips). Leaving: off the event map once it's over. Returns true when it took the tick.
function event_tick() {
	if (in_party_cfg() && !is_merchant()) return false; // v24.60: party fighters don't go to events (the tank joined alone; the others couldn't follow)
	const name = event_live(), now = Date.now();
	if (!name) {
		event_logged = null;
		if (character.map === "goobrawl" && !walking() && !errand_busy()) { travel_as("event_tick", { map: "main" }); return true; } // event over
		return false;
	}
	if (errand_busy() || state.recovering) return false;
	const ev = CFG.events[name];
	if (event_logged !== name) { event_logged = name; log_ev("event", { name }); game_log(`event: ${name} — joining`, C.info); }
	if (!event_here(name)) {
		if (now - event_join_at > 20_000 && typeof join === "function") {
			event_join_at = now;
			if (walking()) halt("event_tick");
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
		if (!walking() && Number.isFinite(e?.x) && e.map === character.map) move_to_as("event_tick", e.x, e.y, 1000);
		set_message(`event ${name}: waiting for spawns`);
	}
	return true;
}
// Farm our own monster hunt's target if we can fight it safely
// A hunt that can't be finished before it expires (h.ms left) isn't worth chasing: let it lapse and take a new one
// (v18.6: a 417-bee hunt pulled the party onto bees at half the xp/s of croc for hours). Party kills count, so the
// party's rate is estimated as ours × (1 + 0.6 per member near).
// xp/s we'd get at a monster's best area (measured if we've been there, else estimated)
function mt_xps(mt) {
	let best = 0;
	const tab = meas("xp"); // v25.51: xp rates whatever the farm mode
	const fa = fight_profile(mt);
	// v24.6: aged like spot picks (meas_aged)
	each_area((pack, area) => {
		if (pack.type !== mt || tab[pack_key(area)] === undefined) return;
		const est = fa ? fa.xp * Math.min(1 / (fa.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack)) * state.realism : tab[pack_key(area)];
		best = Math.max(best, meas_aged(pack_key(area), est, "xp"));
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
	// (v25.51: state.best_xp — xp/s at the pick in either farm mode; best_score is the mode's unit)
	if (state.best_xp > 0 && now - (state.best_at || 0) < 600_000) return state.best_xp;
	const c = state.best_ref;
	if (c && now - c.at < 60_000) return c.v;
	const v = best_score("xp") || Math.max(0, ...Object.values(meas("xp") || {}).filter(Number.isFinite));
	state.best_ref = { at: now, v };
	return v;
};
// v25.69 (owner: two fresh hunts on very killable targets, and the party went to squigtoad): a hunt is chased while it
// lasts and the camp pick would fight its monster — no estimate of whether it finishes in time (hunt counts are sized
// for every spawn of the type on every map, so a kill-rate estimate at one spawn failed most fresh hunts) and no xp floor
function hunt_feasible(h) {
	if (!h || !(h.c > 0) || (h.ms !== undefined && !(h.ms > 0))) return false;
	// (a follower never picks camps, so its state.safe and danger data are partial: it reports the hunt, the leader
	// judges it — pick_shared and hunts_trip_due apply goal_blocked to partners' hunts; Fable)
	if (is_follower()) return state.safe[h.id] !== undefined ? !!state.safe[h.id] : !!fight_profile(h.id);
	const a = resolve_area(h.id);
	return !!a && !goal_blocked(h.id, a.map, a.boundary);
}
// Kills per second we'd manage at the best spawn area of a monster (measured if we've been there); 0 if unsafe
function kills_per_s(mt) {
	const f = fight_profile(mt);
	if (!f) return 0;
	let best = 0;
	each_area((pack, area) => {
		if (pack.type !== mt) return;
		const est = Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack)) * state.realism;
		const kps = meas_aged(pack_key(area), est * Math.max(1, f.xp), "xp") / Math.max(1, f.xp); // v24.6: aged (v25.51: xp)
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
	// (v25.69: no eta — a hunt isn't dropped as "too slow to share" on an estimate)
	if (CFG.auto_monster_hunt && h?.c > 0 && hunt_feasible(h)) out.push({ monster: h.id, w: W.hunt, reason: `monster hunt ${h.c} left` });
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
// The guide's farm row if it's current, not paused and not outlevelled (guide_farm_min_xp; a row we can't measure,
// e.g. a monster we can't fight but the guide calls safe, is kept)
function live_guide_farm() {
	const g = state.guide_farm, now = Date.now();
	if (!g || !(g.until > now) || (state.guide_ignore[`${g.monster}:${g.map}`] || 0) > now) return null;
	const f = fight_profile(g.monster), gxp = f ? kills_per_s(g.monster) * f.xp : null;
	if (gxp !== null && best_known_xps() > 0 && gxp < CFG.guide_farm_min_xp * best_known_xps()) return null;
	return g;
}
