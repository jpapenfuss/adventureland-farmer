// =====================================================================
// fighter/9_cave.js — fighters only (src/manifest.json): the Cave of Many Dreams (v25.22, owner: "implement everything
// you can"). One visit a day per account, 3 characters (the party), 3 floors, 24 minutes, 10× enemy XP, no death
// penalty. Built from the game's own code (adventureland_mongodb: node/logic/cave_of_many_dreams.js, js/
// generated_zones.js): character.cave is the run's snapshot (floor, remaining_ms, paused, gold, amber, doors[{x, y, to,
// down, locked}], objectives[{id, x, y, done, floor, kind, required, name}], choice{id, kind, options[{id, cost, amber,
// unavailable}], votes, resolved, shop}); cave floors are loaded into G.maps, so smart_move paths them and their doors
// (the game's own "walk to the room" button does the same). A vote pauses the cave; every character votes once.
// The tank: once a day leads the party to Dorr (main, 816,1200) and enters; inside it walks to each objective, fights
// what's hostile there, takes the stairs when a floor's required rooms are done, farms the camps when it can't go on.
// Followers: follow and assist the tank as usual (follower_tick), walking after it between rooms and floors.
// Everyone: votes by cave_policy (rewards that cost nothing, never the wolves), loots the cave's chests.
// =====================================================================
const cave_st = { entering: false, info_at: 0, voted: {}, bought: {}, walk: null, deaths: {}, last_obj: null };
// ---- the daily visit (the tank) ----
async function cave_refresh_info() {
	if (typeof cave_info !== "function" || Date.now() - cave_st.info_at < CFG.cave.info_every_ms) return;
	cave_st.info_at = Date.now();
	try { state.cave_visit = { ...(await cave_info()), at: Date.now() }; } catch (e) { state.cave_visit = { error: why(e), at: Date.now() }; }
}
// Is a visit (or a return to the one under way, on this server) open to us?
function cave_open() {
	const v = state.cave_visit;
	if (!v) return false;
	const here = typeof server !== "undefined" && server ? server.region + server.id : null;
	return !!(v.available || (v.resume && (!here || v.resume.server === here)));
}
// The tank takes the party in: the visit is open, every member is online, alive, on no errand, nothing on us
function cave_due() {
	if (!CFG.cave?.enabled || character.cave || !in_party_cfg() || is_follower() || !is_tank_class(character.ctype)) return false;
	if (skipped("cave") || errand_busy() || state.ptown) return false;
	cave_refresh_info();
	if (!cave_open()) return false;
	return others().every((n) => { const p = state.partners[n]; return fresh(p) && !p.rip && !p.errand; });
}
const cave_door = () => { const d = (G.maps.main?.npcs || []).find((n) => n.id === "dreamkeeper"); return { map: "main", x: d?.position?.[0] ?? 816, y: (d?.position?.[1] ?? 1200) + 40 }; };
// → true while it's leading the party in (fighter_tick stops there)
function cave_entry_tick() {
	if (!cave_due()) return false;
	const D = cave_door();
	set_message("to the cave (Dorr)");
	if (character.map !== D.map || Math.hypot(character.x - D.x, character.y - D.y) > 90) {
		if (!walking()) travel_as("cave", D);
		const a = hit_on_me(); if (a) fight(a, false);
		return true;
	}
	const a = hit_on_me();
	if (a) { fight(a, false); return true; }
	// everyone beside us, alive and out of a fight (the game wants the whole party near Dorr)
	const far = partners_any().filter((q) => q.rip || q.map !== character.map || Math.hypot(partner_pos(q).x - character.x, partner_pos(q).y - character.y) > 150);
	if (far.length || partners_any().length < others().length || cave_st.entering) return true;
	cave_st.entering = true;
	game_log("cave: entering the Cave of Many Dreams with the party", C.info);
	log_ev("cave", { what: "enter" });
	Promise.resolve(cave_enter()).then((r) => game_log(`cave: in (${r?.resumed ? "returned to our visit" : "floor 1"})`, C.ok))
		.catch((e) => { game_log(`cave: entering failed: ${why(e)}; again in 30 min`, C.warn); skip("cave", 1_800_000, why(e)); })
		.finally(() => { cave_st.entering = false; cave_st.info_at = 0; });
	return true;
}
// ---- votes ----
// The option's definition from G (the snapshot sends ids only): the encounter of this kind that has this option id
function cave_option_def(choice, id) {
	if (id === "here") return { id, effect: "revive_here" };
	if (id === "landing") return { id, effect: "revive_landing" };
	for (const e of G.events?.dreams?.encounters || []) if (e.kind === choice.kind) { const o = (e.options || []).find((x) => x.id === id); if (o) return o; }
	return null;
}
// What an option is worth to us (purse gold only buys cave things; Amber pays out): rewards that cost nothing, never
// the wolves (six level-100 Cave Wolves: 48k HP, 480 attack) or a shadow of our strongest; a revive where we fell when
// the purse has the Amber. → score (higher is better), -Infinity: never
function cave_option_score(choice, o, st) {
	if (o.unavailable) return -Infinity;
	const def = cave_option_def(choice, o.id) || { effect: "leave" }, eff = def.effect;
	const cost = (o.cost || 0) / 4000 + (o.amber || 0) * 1.5;
	const fight_score = (f) => (!f ? 0 : f[0] === "cave_wolf" ? -100 : f[0] === "cave_guard" || f[0] === "cave_rat" || f[0] === "cave_crab" ? 0.5 : -1);
	if (eff === "revive_here") return (st?.amber || 0) >= (o.amber || 1) ? 10 : -Infinity;
	if (eff === "revive_landing") return 5;
	if (eff === "venture") {
		const outs = def.outcomes || [], w = outs.reduce((s, x) => s + (x.weight || 1), 0) || 1;
		let v = 0;
		for (const x of outs) {
			let s = (x.gold || 0) / 4000 + (x.amber || 0) * 1.5 + (x.reward ? 3 : 0) + (x.join || x.ally ? 0.5 : 0);
			if (x.shadow) s -= 100;
			s += fight_score(x.fight);
			v += s * (x.weight || 1) / w;
		}
		return v - cost - (def.hazard === "wolves" ? 100 : 0);
	}
	const base = {
		careful: 3, exchange: 3, gift: 3, small_gift: 1.5, free_die: 1.5, moths: 3, peace: 1.5, inspect: 2, buy: 2, appraise: 1, reveal: 1,
		hunt: 3.5, hunt_quick: 3, hunt_late: 3, hunt_helper: 3, hunt_double: 2, practice: 2, plant: 2, recipes: 0.5, story: 0.2, tool: 1, lamp: 1, decoy: 1,
		guide: 0.5, escort: 0.5, paid_help: 2.5, use_tool: 2.5, dice: 0.5, dice6: 0.3, die: 0.3, favor: 0, dice_room: 0.5,
		pay: 0.5, time: -0.5, bad_fight: 1, bad_double: -1, risk: -1, wolves: -100, shadow: -100,
		// a rescue or a duel: the predators are Cave Wolves — watch; a duel: make peace (1 Amber) or stay out of it
		watch: 0.5, neither: 0.5, save: -100, cover: -100, lure: -100, hire: -100, both: -100, left: -2, right: -2, testimony: -2,
		leave: 0, fight: 0, ambush: -1, boss: -1,
	}[eff];
	return (base ?? 0) - cost;
}
function cave_policy(choice, st) {
	let best = null;
	for (const o of choice?.options || []) {
		const s = cave_option_score(choice, o, st);
		if (s > -Infinity && (!best || s > best.s)) best = { id: o.id, s };
	}
	return best ? best.id : null;
}
function cave_vote_tick(st) {
	const c = st?.choice;
	if (!c || c.resolved || cave_st.voted[c.id] || (c.votes && c.votes[character.name] !== undefined)) return;
	const id = cave_policy(c, st);
	if (!id) return;
	cave_st.voted[c.id] = true;
	game_log(`cave vote — ${c.title || c.kind}: ${id}`, C.dim);
	log_ev("cave", { what: "vote", kind: c.kind, option: id });
	Promise.resolve(cave_reply(c.id, id)).catch((e) => game_log(`cave vote failed: ${why(e)}`, C.dim));
}
// A merchant's one item: bought with the purse (it never becomes our gold), when the purse has it
function cave_shop_tick(st) {
	const s = st?.choice?.shop;
	if (!s || s.sold || !s.nearby || cave_st.bought[s.room] || (s.price || 0) > (st.gold || 0) || is_follower()) return;
	cave_st.bought[s.room] = true;
	Promise.resolve(cave_buy(s.room)).then((r) => game_log(`cave: bought ${s.name} for ${fmt_k(s.price)} purse gold (→ ${r?.recipient || "?"})`, C.ok))
		.catch((e) => game_log(`cave: buying ${s.name}: ${why(e)}`, C.dim));
}
// ---- inside ----
// Hostile to us: a cave monster on the enemy side, or anything already on a party member (not the Dark Mage: only his
// own reflected spell kills him)
function cave_hostile(e) {
	if (!e || e.type !== "monster" || e.dead || e.mtype === "cave_darkmage") return false;
	const side = e.cave?.side;
	return side === "enemy" || (!!e.target && party_names().has(e.target) && side !== "ally" && side !== "neutral");
}
// Where the tank goes next on this floor: the floor's required rooms (the guard camp last: two Cave Wolves on floor 1),
// then the stairs down once they're done; with nothing reachable, the camps again (they refill) for the XP.
function cave_next_goal(st) {
	const f = st.floor, objs = (st.objectives || []).filter((o) => o.floor === f && !o.done && !cave_skip(o));
	const req = objs.filter((o) => o.required).sort((a, b) => (a.kind === "fight") - (b.kind === "fight"));
	const camps = objs.filter((o) => o.kind === "farm");
	if (camps.length) return { obj: camps[0] };
	if (req.length) return { obj: req[0] };
	const down = (st.doors || []).find((d) => d.down && !d.locked);
	if (down) return { door: down };
	return null;
}
// A room the party has died at twice is left (fight on elsewhere); a revive brings it back next visit
function cave_skip(o) { return (cave_st.deaths[o.id] || 0) >= CFG.cave.max_deaths_per_room; }
function cave_walk(dest, why_) {
	const k = `${dest.map}:${Math.round(dest.x)},${Math.round(dest.y)}`, now = Date.now();
	if (cave_st.walk && cave_st.walk.k === k && (is_moving(character) || now - cave_st.walk.at < 4000)) return;
	cave_st.walk = { k, at: now };
	Promise.resolve(smart_move(dest)).catch(() => {});
	set_message(`cave: ${why_}`);
}
function cave_tick() {
	const st = character.cave;
	if (!st) return 250;
	cave_vote_tick(st);
	cave_shop_tick(st);
	if (st.paused) { set_message("cave: vote"); return 250; }
	loot_chests();
	if (is_follower()) {
		const L = leader_hb();
		// the tank on another floor or far away: walk after it (smart_move takes the cave's doors)
		if (L && !L.rip && (L.map !== character.map || Math.hypot(partner_pos(L).x - character.x, partner_pos(L).y - character.y) > CFG.party.follow_far)) {
			const a = hit_on_me(); if (a) fight(a, false);
			cave_walk({ map: L.map, x: partner_pos(L).x, y: partner_pos(L).y }, `after ${L.name}`);
			return 200;
		}
		follower_tick();
		return 150;
	}
	// the tank: what's on us, then what's hostile near us, then the next goal
	const near = Object.values(parent.entities || {}).filter((e) => cave_hostile(e) && Math.hypot(e.x - character.x, e.y - character.y) < CFG.cave.engage_px)
		.sort((a, b) => Math.hypot(a.x - character.x, a.y - character.y) - Math.hypot(b.x - character.x, b.y - character.y));
	const t = hit_on_me() || near[0];
	if (t) { if (!hold_for_tank(t)) fight(t); set_message(`cave: ${t.name || t.mtype}`); return 200; }
	const g = cave_next_goal(st);
	if (!g) { set_message(`cave: floor ${st.floor + 1} done`); return 400; }
	if (g.door) { cave_walk({ map: g.door.to }, `stairs to floor ${st.floor + 2}`); return 300; }
	cave_st.last_obj = g.obj.id;
	if (Math.hypot(g.obj.x - character.x, g.obj.y - character.y) > CFG.cave.arrive_px) cave_walk({ map: character.map, x: g.obj.x, y: g.obj.y }, g.obj.name || g.obj.kind);
	else set_message(`cave: at ${g.obj.name || g.obj.kind}`);
	return 250;
}
// A death inside counts against the room we were working on (two → the room is left); main.js's dead branch calls this
// once per death (state.dead_handled)
function cave_died() {
	if (character.cave && cave_st.last_obj) cave_st.deaths[cave_st.last_obj] = (cave_st.deaths[cave_st.last_obj] || 0) + 1;
}
// Report
function facts_cave(F) {
	const st = character.cave, v = state.cave_visit;
	if (st) {
		const req = (st.objectives || []).filter((o) => o.floor === st.floor && o.required);
		F("cave", "self", `cave: floor ${st.floor + 1}, ${Math.round((st.remaining_ms || 0) / 60000)} min left${st.paused ? " (vote)" : ""} | purse ${fmt_k(st.gold || 0)} gold, ${st.amber || 0} Amber | ` +
			`rooms ${req.filter((o) => o.done).length}/${req.length} done${Object.keys(cave_st.deaths).length ? ` | deaths: ${Object.entries(cave_st.deaths).map(([k, n]) => `${k} ${n}`).join(", ")}` : ""}`);
		F("cave_json", "self", `cave JSON: ${JSON.stringify({ floor: st.floor, doors: st.doors, objectives: st.objectives, choice: st.choice && { kind: st.choice.kind, options: st.choice.options }, hunts: st.hunts })}`);
	} else if (CFG.cave?.enabled && is_tank_class(character.ctype)) {
		F("cave", "self", `cave: ${!v ? "not checked yet" : v.error ? `check failed: ${v.error}` : cave_open() ? (skipped("cave") ? `open — paused (${skip_why["cave"] || "?"})` : "open — going today") : `visited today; next ${v.resets ? new Date(v.resets).toLocaleTimeString() : "?"}`}`);
	}
}
