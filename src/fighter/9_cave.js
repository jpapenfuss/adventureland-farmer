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
const cave_st = { entering: false, entered_at: 0, info_at: 0, voted: {}, bought: {}, walk: null, deaths: {}, stuck: {}, prog: null, last_obj: null, run: null, wait_at: 0 };
// Rooms, shops and objective ids repeat on every visit ("0:shop", "0:1"...): what's remembered about them is per run
function cave_run_check(st) {
	if (!st || st.run === cave_st.run) return;
	cave_st.run = st.run; cave_st.bought = {}; cave_st.deaths = {}; cave_st.stuck = {}; cave_st.prog = null; cave_st.last_obj = null; cave_st.walk = null;
	cave_st.visit_deaths = 0; cave_st.exiting = false; cave_st.out_since = 0; cave_st.exit_tries = 0; cave_st.rip_seen = {}; cave_st.death_by = {}; cave_st.revived = false;
}
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
	if (skipped("cave") || errand_busy() || state.ptown || Date.now() - cave_st.entered_at < 120_000) return false;
	cave_refresh_info();
	if (!cave_open()) return false;
	if (cave_blocked()) return false;
	return others().every((n) => { const p = state.partners[n]; return fresh(p) && !p.rip && !p.errand; });
}
// v25.29: after a visit the cave beat us, not again until the party is stronger (party_power: average level, gear points)
function cave_blocked() {
	const B = state.cave_block, pw = party_power();
	if (!B) return false;
	// (only with at least as many fighters online as then: an average without a weaker member isn't the party stronger)
	if (pw && pw.n >= (B.n || 0) && (pw.lv >= B.lv + CFG.cave.retry_levels || pw.gs >= B.gs * CFG.cave.retry_gear)) { state.cave_block = null; game_log("cave: the party is stronger now — trying the cave again", C.info); return false; }
	return true;
}
// Leave the visit for good (Amber pays out on exit). The tank: after give_up_deaths; a follower: when the tank has left.
function cave_leave(why_) {
	if (cave_st.exiting || typeof cave_exit !== "function") return;
	cave_st.exiting = true;
	if (!cave_st.exit_tries) { game_log(`cave: leaving — ${why_}`, C.warn); log_ev("cave", { what: "exit", why: why_ }); }
	cave_st.exit_tries = (cave_st.exit_tries || 0) + 1;
	// (a synchronous throw is caught too; 6 tries, 5 s apart, then the visit plays on)
	let p;
	try { p = Promise.resolve(cave_exit()); } catch (e) { p = Promise.reject(e); }
	p.catch((e) => {
		const more = cave_st.exit_tries < 6;
		game_log(`cave: exit failed: ${why(e)}${more ? " (again in 5 s)" : " — giving up this visit"}`, C.dim);
		if (more) setTimeout(() => { cave_st.exiting = false; if (character.cave) cave_leave(why_); }, 5000);
	});
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
	// everyone beside us, alive and out of a fight (the game wants the whole party near Dorr) — at most
	// cave.wait_party_ms: a member that can't get here mustn't keep the party standing at the door all day
	const far = partners_any().filter((q) => q.rip || q.map !== character.map || Math.hypot(partner_pos(q).x - character.x, partner_pos(q).y - character.y) > 150);
	if (far.length || partners_any().length < others().length) {
		if (!cave_st.wait_at) cave_st.wait_at = Date.now();
		if (Date.now() - cave_st.wait_at > CFG.cave.wait_party_ms) { skip("cave", 1_800_000, `waited for ${far.map((q) => q.name).join(", ") || "the party"} at Dorr`); cave_st.wait_at = 0; return false; }
		return true;
	}
	cave_st.wait_at = 0;
	if (cave_st.entering) return true;
	cave_st.entering = true;
	game_log("cave: entering the Cave of Many Dreams with the party", C.info);
	log_ev("cave", { what: "enter" });
	Promise.resolve(cave_enter()).then((r) => { cave_st.entered_at = Date.now(); game_log(`cave: in (${r?.resumed ? "returned to our visit" : "floor 1"})`, C.ok); })
		.catch((e) => { game_log(`cave: entering failed: ${why(e)}; again in 30 min`, C.warn); skip("cave", 1_800_000, why(e)); })
		.finally(() => { cave_st.entering = false; cave_st.info_at = Date.now() - CFG.cave.info_every_ms + 60_000; }); // re-check in a minute
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
	// v25.41: the landing, always: reviving where we fell put Aspernari back in the same fight 20 times in three minutes
	// (23 Nov). (Only after a death this visit, first: the vote arrives before the heartbeat that shows the death — Fable.)
	if (eff === "revive_here") return (st?.amber || 0) < (o.amber || 1) ? -Infinity : 1;
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
		return v - cost;
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
	Promise.resolve(cave_reply(c.id, id)).catch((e) => { game_log(`cave vote failed: ${why(e)} (trying again)`, C.dim); setTimeout(() => { delete cave_st.voted[c.id]; }, 3000); });
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
	const f = st.floor, objs = (st.objectives || []).filter((o) => o.floor === f && !o.done && !cave_skip(o) && !cave_st.stuck[o.id]);
	const req = objs.filter((o) => o.required).sort((a, b) => (a.kind === "fight") - (b.kind === "fight"));
	const camps = objs.filter((o) => o.kind === "farm");
	if (camps.length) return { obj: camps[0] };
	if (req.length) return { obj: req[0] };
	const down = (st.doors || []).find((d) => d.down && !d.locked && !cave_st.stuck["door:" + d.to]);
	if (down) return { door: down };
	return null;
}
// A room the party has died at twice is left (fight on elsewhere) for the rest of this visit
function cave_skip(o) { return (cave_st.deaths[o.id] || 0) >= CFG.cave.max_deaths_per_room; }
function cave_walk(dest, why_) {
	const k = `${dest.map}:${Math.round(dest.x)},${Math.round(dest.y)}`, now = Date.now();
	if (cave_st.walk && cave_st.walk.k === k && (is_moving(character) || now - cave_st.walk.at < 4000)) return;
	cave_st.walk = { k, at: now };
	Promise.resolve(smart_move(dest)).catch(() => {});
	set_message(`cave: ${why_}`);
}
// Progress watchdog (the tank): a goal is given up for this visit when we get no closer to it for cave.stuck_ms while
// walking (unreachable: a smart_move that fails is re-issued forever otherwise), or a camp after cave.camp_max_ms
// there (it needs three waves; one that never completes mustn't hold the required rooms and the stairs)
function cave_progress(g) {
	const id = g.door ? "door:" + g.door.to : g.obj.id, now = Date.now();
	const d = g.door ? (character.map === g.door.to ? 0 : Math.hypot((g.door.x ?? character.x) - character.x, (g.door.y ?? character.y) - character.y)) : Math.hypot(g.obj.x - character.x, g.obj.y - character.y);
	let P = cave_st.prog;
	if (!P || P.id !== id) P = cave_st.prog = { id, best: d, best_at: now, since: now, map: character.map };
	if (d < P.best - 40 || character.map !== P.map) { P.best = d; P.best_at = now; P.map = character.map; }
	const near = !g.door && d <= CFG.cave.arrive_px;
	if (near) P.best_at = now; // at the room: fighting there is progress
	const stuck = !near && now - P.best_at > CFG.cave.stuck_ms;
	const camp_over = !g.door && g.obj.kind === "farm" && now - P.since > CFG.cave.camp_max_ms;
	if (!stuck && !camp_over) return false;
	cave_st.stuck[id] = true; cave_st.prog = null;
	game_log(`cave: giving up on ${g.door ? "the stairs" : g.obj.name || g.obj.kind} (${camp_over ? "camp time up" : "no way closer"})`, C.dim);
	log_ev("cave", { what: "skip", goal: id, why: camp_over ? "camp_time" : "stuck" });
	return true;
}
function cave_tick() {
	const st = character.cave;
	if (!st) return 250;
	cave_run_check(st);
	cave_vote_tick(st);
	cave_shop_tick(st);
	cave_watch_deaths(); // v25.40 (before the vote pause: deaths count whatever the room)
	if (st.paused) { set_message("cave: vote"); return 250; }
	loot_chests();
	if (is_follower()) {
		const L = leader_hb();
		// v25.29: the tank has left the cave (its heartbeat on a map that isn't a cave floor for 20 s straight — its first
		// beats after entering still say main): leave too. Reset per run (cave_run_check).
		const out = L && fresh(L) && L.map && !/^zone_/.test(L.map);
		if (!out) cave_st.out_since = 0;
		else if (!cave_st.out_since) cave_st.out_since = Date.now();
		else if (Date.now() - cave_st.out_since > 20_000) { cave_leave(`${L.name} has left the cave`); return 400; }
		// v25.41: back from the dead (revived at the landing): stay there until our HP is back to cave.rejoin_hp — we heal
		// (a priest: the party too) and hit only what hits us; not walking back into the fight (Fable: only after our
		// own death, not any follower under 70% mid-fight)
		if (cave_st.revived) {
			if (character.hp >= character.max_hp * (CFG.cave.rejoin_hp || 0.7)) cave_st.revived = false;
			else {
				if (typeof party_heal === "function") party_heal();
				const a = hit_on_me(); if (a) fight(a, false);
				set_message(`cave: recovering (${Math.round(character.hp / character.max_hp * 100)}%)`);
				return 300;
			}
		}
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
	if (cave_progress(g)) return 200; // given up on: the next goal next tick
	if (g.door) { cave_walk({ map: g.door.to }, `stairs to floor ${st.floor + 2}`); return 300; }
	cave_st.last_obj = g.obj.id;
	if (Math.hypot(g.obj.x - character.x, g.obj.y - character.y) > CFG.cave.arrive_px) cave_walk({ map: character.map, x: g.obj.x, y: g.obj.y }, g.obj.name || g.obj.kind);
	else set_message(`cave: at ${g.obj.name || g.obj.kind}`);
	return 250;
}
// A death inside counts against the room we were working on (two → the room is left); main.js's dead branch calls this
// once per death (state.dead_handled)
function cave_died() {
	if (!character.cave) return;
	cave_run_check(character.cave);
	if (cave_st.last_obj) cave_st.deaths[cave_st.last_obj] = (cave_st.deaths[cave_st.last_obj] || 0) + 1;
	cave_party_death(character.name); // (v25.41: every member counts the visit's deaths; only the tank leaves on them)
	cave_st.revived = true; // v25.41: back from the dead — recover before rejoining (a follower)
}
// v25.29: give_up_deaths deaths in one visit: this cave is beyond us for now — leave, and wait to be stronger.
// v25.40: any member's death counts, not only the tank's (11 PM, 23 Nov: Aspernari died 20 times and Sanala 6 in three
// minutes to cave_bats, 6-12k damage in 10 s against ~500 predicted, while the visit waited for the tank's third)
function cave_party_death(who) {
	const n = ++cave_st.visit_deaths;
	cave_st.death_by = cave_st.death_by || {}; cave_st.death_by[who] = (cave_st.death_by[who] || 0) + 1;
	if (is_follower() || !is_tank_class(character.ctype)) return; // the tank decides
	if (n < CFG.cave.give_up_deaths || cave_st.exiting) return;
	const pw = party_power();
	state.cave_block = { at: Date.now(), lv: pw?.lv || character.level, gs: pw?.gs || 0, n: pw?.n || 1, deaths: n };
	if (typeof save_state === "function") save_state();
	cave_leave(`${n} deaths this visit (${Object.entries(cave_st.death_by).map(([k, c]) => `${k} ${c}`).join(", ")}); back when the party is stronger`);
}
// The tank: a member's heartbeat turning to dead inside the cave is one death (each counted once, until it lives again)
function cave_watch_deaths() {
	cave_st.rip_seen = cave_st.rip_seen || {};
	// (members in the cave only — Fable #27: one outside, seeing a death, would count again)
	for (const p of partners_any().filter((q) => /^zone_/.test(q.map || ""))) {
		if (p.rip && !cave_st.rip_seen[p.name]) { cave_st.rip_seen[p.name] = true; cave_party_death(p.name); }
		else if (!p.rip) cave_st.rip_seen[p.name] = false;
	}
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
		const B = state.cave_block;
		if (B) return F("cave", "self", `cave: on hold — it beat us ${ago(B.at)} ago (${B.deaths || "?"} deaths); back at average level ${(B.lv + CFG.cave.retry_levels).toFixed(1)} or ${Math.round(B.gs * CFG.cave.retry_gear)} gear points (now ${party_power()?.lv ?? "?"} / ${party_power()?.gs ?? "?"})`);
		F("cave", "self", `cave: ${!v ? "not checked yet" : v.error ? `check failed: ${v.error}` : cave_open() ? (skipped("cave") ? `open — paused (${skip_why["cave"] || "?"})` : "open — going today") : `visited today; next ${v.resets ? new Date(v.resets).toLocaleTimeString() : "?"}`}`);
	}
}
