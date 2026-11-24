// =====================================================================
// Monster data & the fight model
// =====================================================================
// identifies a spawn area across reloads: map, box and monster type. v25.56: the type too — spawns that share a box
// (main: 6 squigs and 2 squigtoads) had one key, so the first type seen claimed it at the pick: squig (268 xp/s est)
// hid squigtoad (~3,900 est) for good. "map:box" stays the front ("map" = key.split(":")[0]).
const pack_key = (p) => `${p.map}:${p.boundary.join(",")}${p.mtype ? "#" + p.mtype : ""}`;
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
// Server complete_attack(): hit = attack · damage_multiplier(defense − pierce); 1hp targets take 1;
// evasion (physical) / avoidance miss; reflection bounces magic; dreturn hits melee; lifesteal/self_healing heal.
// team: who the fight is judged with. "party" (v24.35, the default): the members travelling with us wherever they are
// right now (not on an errand) — nobody fights alone. "all" (v23.1): every online member wherever it is — planning
// something the whole party gathers for (a boss). Outside a party (the merchant): whoever is near.
// v25.42: a member on the party's own town trip (its heartbeat's pt) is still the party — the camp was judged during
// one with "0 with us, no priest": gscorpion (1083 measured) failed x3.45 and the party went to cgoo (658)
const fight_mates = (team = "party") => (team === "all" ? partners() : in_party_cfg() ? partners().filter((p) => (!p.errand || p.pt) && !p.recovering) : partners_near());
// v25.34: a spawn with a rage box (server rage_logic, every 4.2 s: the first player found inside the box is targeted by
// every monster of that spawn, so for one party the whole spawn lands on one member): booboo at spookytown, 5 at once. The model counted one, and Torlis died twice there to
// 10.3k damage in 10 s against 1.5k predicted (2026-11-22). Per monster type: the largest such spawn.
let rage_c = null;
function rage_n(mt) {
	if (!rage_c) { rage_c = {}; for (const mp in G.maps || {}) for (const s of G.maps[mp].monsters || []) if (s.rage && s.type) rage_c[s.type] = Math.max(rage_c[s.type] || 1, s.count || 1); }
	return rage_c[mt] || 1;
}
// The type of a monster definition: callers pass G.monsters[t] itself, or a copy carrying mtype
let def_name = null;
const mtype_of = (m) => {
	if (m.mtype) return m.mtype;
	if (!def_name || !def_name.has(m)) { def_name = new Map(); for (const n in G.monsters) def_name.set(G.monsters[n], n); } // (rebuilt on a miss)
	return def_name.get(m);
};
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
	// v25.34: "pure" damage ignores armour and resistance (server complete_attack: defense none_existent) — booboo's 220
	// was taken through Torlis's 246 armour
	const their_hit = (m.attack || 0) * (m.damage_type === "pure" ? 1 : dm(((theirs_magic ? D.resistance : D.armor) || 0) - ((theirs_magic ? m.rpiercing : m.apiercing) || 0)));
	const their_dps = their_hit * (m.frequency || 1) * rage_n(mtype_of(m));
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
// v24.50: the tank decides. Together, with a tank in the party:
//  - only the tank starts a fight: nobody else touches a monster that has no target, wherever the tank is (v24.46 had
//    this only with the tank within reach) — no time limit, no exceptions;
//  - the tank starts one only when the whole party is with it: every online fighter alive, not in town, not fleeing,
//    on its map and within CFG.party.engage_px.
// A monster that already targets one of us may be hit by anyone. fire() enforces both for every attack and skill.
const is_tank_class = (ct) => CFG.gear_tank.includes(ct);
const together_now = () => CFG.party.tank_first && in_party_cfg();
let suicide_at = 0;
// Who the tank is still waiting for before it may start a fight (names), [] when the party is gathered
function party_missing() {
	// v24.62: a member not heard from (just loaded, or offline) is missing too — the tank used to start fights and
	// pick its camp alone in the seconds before the first heartbeats
	// v24.63: for starting a fight, three missed beats is enough (a disconnected member counted as present for 20s)
	const unheard = in_party_cfg() ? others().filter((n) => !fresh(state.partners[n]) || Date.now() - state.partners[n].t > 3 * CFG.party.beat_ms) : [];
	return unheard.concat(partners_any().filter((q) => q.rip || q.errand || q.recovering || q.map !== character.map ||
		Math.hypot(partner_pos(q).x - character.x, partner_pos(q).y - character.y) > CFG.party.engage_px).map((q) => q.name));
}
// v25.20 (owner): where the tank kills its targets in one hit, the rule loosens — at the tank's camp, for that monster
// type, anyone may start a fight (each follower picks its own at random). The tank's heartbeat carries the types it
// one-shoots (os: its last kills of the type, fighter/3_combat.js oneshot_types).
function free_for_all(t) {
	if (!t || t.type !== "monster" || !t.mtype || !in_party_cfg()) return false;
	const L = leader_hb(), P = state.pack;
	if (!L || L.rip || L.errand || !fresh(L) || !Array.isArray(L.os) || !L.os.includes(t.mtype)) return false; // (not while it's on an errand)
	if (!P || P.mtype !== t.mtype || P.map !== character.map || !valid_boundary(P.boundary)) return false;
	const b = P.boundary, pad = CFG.party.ffa_pad ?? 100; // the camp itself (near_pad's 450 px would scatter the party)
	return t.x >= b[0] - pad && t.x <= b[2] + pad && t.y >= b[1] - pad && t.y <= b[3] + pad;
}
function tank_first(t) {
	if (!t || t.type !== "monster" || t.target) return false;
	if (!together_now()) return false;
	if (!is_tank_class(character.ctype)) return !free_for_all(t); // not the tank: never the first hit (v24.51), unless the tank one-shoots these (v25.20)
	return party_missing().length > 0; // the tank: not before everyone's here
}
function fight_profile(mtype) {
	if (!farmable_type(mtype)) return null;
	// v24.35: a monster type is judged for the party, not for whoever is within 400px this second. The leader stepped
	// through a door ahead of the others, was "alone" on the far side, found its target unsafe, picked another spot and
	// walked back — at every door.
	const f = fight_math(G.monsters[mtype]);
	return safe_enough(f, mtype) ? { ttk: f.ttk, xp: f.xp } : null;
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
	if (pack.boundary) areas = [{ map: name, boundary: pack.boundary, count: pack.count, mtype: pack.type }];
	else if (pack.boundaries) areas = pack.boundaries.map((b) => ({ map: b[0], boundary: b.slice(1, 5), count: pack.count / pack.boundaries.length, mtype: pack.type }));
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
	const in_danger_here = safe && deadly_areas(map).some((z) => Math.hypot(Math.max(0, z.b[0] - x, x - z.b[2]), Math.max(0, z.b[1] - y, y - z.b[3])) < z.px);
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
			add(dr[4], dr[5] || 0, Math.hypot(dr[0] - p.x, dr[1] - p.y) + DP, { kind: "door", map: p.map, fx: p.x, fy: p.y, x: dr[0], y: dr[1], to: dr[4], s: dr[5] || 0, fs: dr[6] });
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
	const v = walk_speed(), now = Date.now(), c = dz_cache.get(map);
	if (c && now - c.at < 60_000 && c.v === v) return c.list;
	const list = [];
	// v25.55: an empty spawn (count 0: an event boss's, winterland's icegolem) isn't there; a spawn listed only as a
	// merchant threat (slow, it can't chase) reaches as far as its attack range plus a step, not danger_px
	for (const [pk, a] of map_areas(map)) {
		const t = pk.type;
		if (!(a.count > 0) || !valid_boundary(a.boundary)) continue;
		if (aggressive(t) && !state.safe[t] && chase_speed(t) >= v) list.push({ t, b: a.boundary, px: CFG.danger_px });
		else if (merchant_threat(t, v)) list.push({ t, b: a.boundary, px: (G.monsters[t].range || 0) + 120 }); // (range is edge to edge of the sprites, and the walk strays from the judged grid path)
	}
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
	const close = zs.some((z) => Math.hypot(Math.max(0, z.b[0] - hi_x, lo_x - z.b[2]), Math.max(0, z.b[1] - hi_y, lo_y - z.b[3])) < z.px);
	let pts = close ? walk_path(map, x1, y1, x2, y2) : null;
	if (!pts) {
		const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 40));
		pts = Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
	}
	for (const z of zs) for (const [x, y] of pts)
		if (Math.hypot(Math.max(0, z.b[0] - x, x - z.b[2]), Math.max(0, z.b[1] - y, y - z.b[3])) < z.px) return `${z.t} @ ${map}`;
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
// v25.43: the speed we walk at — a merchant with its stand open moves at 10, which made every aggressive monster look
// faster than us (Fable: from the stall every camp read "no safe way"); judged with the last speed seen while walking
let walk_v = 0;
function walk_speed() {
	if (!character.stand && character.speed > 0) walk_v = character.speed;
	return walk_v || (character.stand ? 55 : character.speed) || 55;
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
const no_go = (t, v) => !!G.monsters[t] && (merchant_threat(t, v) || aggressive(t) && !state.safe[t] && chase_speed(t) >= v);
// v25.55: the merchant (no fighting, ~2k HP) died walking to the gscorpion camp past desertland's fire spirits: aggro
// 0.2 (under the 0.5 above) and slower than it, but range 280 and 320 magical a hit — 2,749 damage in the 10 s it
// spent in reach. For the merchant a spawn is no place to walk when anything that may attack it at all (any aggro or
// rage) deals half its HP while it crosses that monster's reach (twice its range plus 100 px at our speed). Such a
// monster can't chase us, so deadly_areas keeps the walk out of its range (+120 px), not danger_px.
function merchant_threat(t, v) {
	const m = G.monsters[t];
	if (!is_merchant() || !m || !((m.aggro || 0) > 0 || (m.rage || 0) > 0)) return false;
	const dm = (d) => (typeof damage_multiplier === "function" ? damage_multiplier(d) : Math.max(0.05, 1 - d / 1000));
	const magic = m.damage_type === "magical";
	const hit = (m.attack || 0) * dm(((magic ? character.resistance : character.armor) || 0) - ((magic ? m.rpiercing : m.apiercing) || 0));
	const exposed_s = (2 * (m.range || 0) + 100) / Math.max(v, 10);
	return hit * (m.frequency || 0) * exposed_s >= (character.max_hp || 1) / 2;
}
const aggressive = (mt) => { const m = G.monsters[mt]; return !!m && ((m.aggro || 0) >= 0.5 || (m.rage || 0) >= 0.5); };
function map_areas(name) { const out = []; for (const pk of G.maps[name]?.monsters || []) for (const a of pack_areas(name, pk)) out.push([pk, a]); return out; }
function travel_s(map, boundary) {
	if (!map || !valid_boundary(boundary)) return 0;
	const cx = (boundary[0] + boundary[2]) / 2, cy = (boundary[1] + boundary[3]) / 2, v = Math.max(walk_speed(), 10);
	if (map === character.map) return (Math.hypot(cx - character.x, cy - character.y) / v) * 1.3;
	if (G.maps[character.map]?.doors) { const r = route_plan(map, cx, cy); return r ? (r.d / v) * 1.3 : Infinity; } // v24.16; v24.17: the way actually walked
	const sp = G.maps[map]?.spawns?.[0] || [0, 0];
	return CFG.travel.cross_map_s * map_hops(character.map, map) + (Math.hypot(cx - sp[0], cy - sp[1]) / v) * 1.3;
}
function resolve_area(monster, map, boundary, count) {
	if (map && G.maps[map] && valid_boundary(boundary)) return { map, boundary: boundary.slice(0, 4), count: count || 1, mtype: monster };
	// v19.1: already at a spawn of this monster → stay (a hunt for the snakes we were farming on main sent the party
	// across maps to halloween's bigger spawn)
	const cur = state.pack;
	if (cur && cur.mtype === monster && (!map || cur.map === map) && valid_boundary(cur.boundary) && G.maps[cur.map])
		return { map: cur.map, boundary: cur.boundary.slice(0, 4), count: cur.count || 1, mtype: monster };
	let best = null;
	each_area((pack, area) => {
		if (pack.type !== monster) return;
		// more monsters, but a minute of walking costs as much as halving the pack
		const rank = (area.map === map ? 1e6 : 0) + area.count / (1 + travel_s(area.map, area.boundary) / 60);
		if (!best || rank > best.rank) best = { ...area, rank };
	});
	return best && { map: best.map, boundary: best.boundary, count: best.count, mtype: monster };
}
// Estimated xp/s at an area: xp per kill × kills/s, where kills/s is the lower of how fast we kill (ttk + walking)
// and how fast the area refills (count / respawn). A measured rate replaces the estimate; unmeasured estimates are
// scaled by `realism` (how far off estimates have been elsewhere).
function score_area(t, pack, area) {
	const f = state.safe[t], kps = Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(t, pack));
	const est = kill_value(t, f) * kps;
	// xp: the spot's xp/s whatever the mode (v25.51: goals, hunts and quests weigh xp — state.best_xp)
	return { est, score: meas_aged(pack_key(area), est * state.realism), xp: meas_aged(pack_key(area), (f.xp || 0) * kps * state.realism, "xp") };
}
// v24.3: a measurement's weight halves every CFG.meas_half_h hours since it was taken, the rest going to the estimate.
// Rates had no age: one measured in a bad hour (a fighter offline, other players there, several levels ago) kept the
// spot out of every pick for good, since it was never visited again to re-measure it.
function meas_aged(key, est, kind = farm_kind()) {
	const v = meas(kind)[key], pre = kind === "gold" ? "g" : "";
	if (v === undefined) return est;
	const at = state.meas_at[pre + "p:" + key];
	let w = at && CFG.meas_half_h > 0 ? Math.pow(0.5, Math.max(0, Date.now() - at) / (CFG.meas_half_h * 3600_000)) : 1;
	// v24.84: and as the party has grown stronger since it was measured
	const p0 = state.meas_at[pre + "w:" + key];
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
// Measured rate per spot with the party there: base xp (or, v25.51, base gold) of the party's kills at it (kill_credit)
// v25.51: farm mode (CFG.farm_mode): "xp" (default) or "gold" — what a camp is chosen for. Both rates are measured
// at every camp all the time (state.measured / state.measured_gold), so switching modes starts with data. The unit
// is the monster's base value per kill (G.monsters[].xp, or G.monster_gold[]): the same for every camp, as base xp is.
const farm_kind = () => (CFG.farm_mode === "gold" ? "gold" : "xp");
const meas = (kind = farm_kind()) => (kind === "gold" ? state.measured_gold : state.measured);
// Base gold per kill: G.monster_gold[mtype] (G.monsters[] has no gold field — Fable on v25.51)
const monster_gold = (t) => G.monster_gold?.[t] || 0;
// v25.67: gold we really loot per base gold — the learned ratio (our goldm, our share of the party's chests, the tax);
// none learned yet: our goldm over the party's size
const gold_ratio = () => (state.gold_ratio > 0 ? state.gold_ratio : (character.goldm || 1) / Math.max(1, (CFG.party?.members || []).length + 1));
// a kill's value in the farm mode's unit (f: a fight profile — its xp, which a probe or the guide may set). Gold
// (v25.67): looted gold, as measured — base gold × gold_ratio()
const kill_value = (t, f, kind = farm_kind()) => (kind === "gold" ? monster_gold(t) * gold_ratio() : f?.xp ?? G.monsters[t]?.xp ?? 0);
const rate_unit = () => (farm_kind() === "gold" ? "gold/s" : "xp/s");

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
	// v25.16: less the seconds held for the party (03_history.js): the rate is the camp's, not our waiting
	const secs = ((s.end || Date.now()) - s.start - (s.lost || 0)) / 1000;
	if (secs < CFG.measure_min_s) return;
	// v23.0: the unit score_area estimates in: base xp of the kills made at this spot. The xp we receive is a share of
	// every party kill anywhere (server), so it can't be used: every party kill counts (kill_credit, sent to each
	// member; the party is here). No kill_credit seen at all (an older client?) → spots aren't measured; estimates stand.
	let rate;
	if (s.kc_n > 0) rate = s.kc / secs;
	else { if (s.kx > 0 && !seen.kc) log_error("no kill_credit events: together-mode xp/s not measured"); return; }
	// v25.67 (owner): gold/s is the gold really looted at the camp (chest_opened shares) over the session's time, whatever
	// the mode — was the table's base gold per kill. Its ratio to the same kills' base gold is learned, for estimates.
	const grate = (s.rg || 0) / secs, gbase = (s.kg || 0) / secs;
	if (s.kg > 0) state.gold_ratio = state.gold_ratio > 0 ? state.gold_ratio * 0.7 + Math.min(5, (s.rg || 0) / s.kg) * 0.3 : Math.min(5, (s.rg || 0) / s.kg);
	const pw = party_power();
	for (const [kind, r] of [["xp", rate], ["gold", grate]]) {
		const tab = meas(kind), prev = tab[s.key], pre = kind === "gold" ? "g" : "";
		// average with the previous measurement — aged (v24.7): averaged raw, a 3-day-old bad rate came back at full weight
		tab[s.key] = prev === undefined ? r : meas_aged(s.key, r, kind) * 0.5 + r * 0.5;
		state.meas_at[pre + "p:" + s.key] = Date.now();
		if (pw) state.meas_at[pre + "w:" + s.key] = { lv: pw.lv, gs: pw.gs }; // v24.84
	}
	log_ev("rate", { pack: `${s.mtype || "?"}@${s.key.split(":")[0]}`, key: s.key, xp_s: Math.round(rate), gold_s: +grate.toFixed(1), gb_s: +gbase.toFixed(1), secs: Math.round(secs) });
	// slow-moving average of measured ÷ estimate; one sample counts between 0.2x and 5x, the average stays in 0.1-3.
	// (v25.51: in the unit the session's estimate was made in — s.kind — so the ratio is the kill rate's either way)
	// (v25.57: the camp's own type's kills only — fillers aren't in the estimate; an old session without the split: all)
	const r_est = (s.kind === "gold" ? (s.kgm ?? s.kg ?? 0) * (s.gr || 1) : (s.kcm ?? s.kc)) / secs; // (s.gr: the ratio the est used)
	// (no kill of the camp's own type — a contested camp, fillers only: says nothing of the estimate; an old session: kc_n)
	if (s.est > 0 && (s.kcm_n ?? s.kc_n) > 0) state.realism = Math.min(3, Math.max(0.1, state.realism * 0.7 + Math.min(5, Math.max(0.2, r_est / s.est)) * 0.3));
	game_log(`${s.mtype || "?"}@${s.key.split(":")[0]}: ${rate.toFixed(1)} xp/s, ${grate.toFixed(1)} gold/s looted (${gbase.toFixed(1)} base) over ${secs.toFixed(0)}s${s.lost ? ` (${Math.round(s.lost / 1000)}s holding for the party left out)` : ""}`, C.dim);
}
