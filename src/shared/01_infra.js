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
// Wrap the socket's emit so every packet (ours and the game UI's) is counted. tick() calls this every time: a reconnect
// creates a new socket, and a code reload leaves the previous script's wrapper counting into ITS array (v23.0: before,
// a flag stopped the new script from wrapping, so after any reload only the server's lagging character.cc was seen).
// The wrapper is rebuilt over the original emit whenever it isn't ours. The same hook keeps our kill_credit listener on
// the live socket, replacing the previous script's.
function meter_socket() {
	const s = parent.socket;
	if (!s) return;
	if (s.__xp_meter !== sent) {
		const orig = s.__xp_orig_emit || s.emit;
		s.__xp_orig_emit = orig;
		s.emit = function (ev, ...args) { sent.push([Date.now(), EMIT_COST[ev] || 1]); return orig.call(this, ev, ...args); };
		s.__xp_meter = sent;
	}
	if (typeof s.on === "function" && s.__farmer_kc !== on_kill_credit) {
		if (s.__farmer_kc && typeof s.off === "function") try { s.off("kill_credit", s.__farmer_kc); } catch (e) {}
		s.on("kill_credit", on_kill_credit);
		s.__farmer_kc = on_kill_credit;
	}
}
// Server "kill_credit" { mtype }: sent to every party member for every party kill, wherever they are (and to a solo
// player for its own). Counts the party's kills for pack measurements (together) and the watchdog (v23.0).
function on_kill_credit(d) {
	seen.kc = (seen.kc || 0) + 1;
	const xp = (d?.mtype && G.monsters[d.mtype]?.xp) || 0;
	const gold = (d?.mtype && G.monster_gold?.[d.mtype]) || 0; // v25.51: base gold, for the gold farm mode's rates
	if (state.session) { state.session.kc = (state.session.kc || 0) + xp; state.session.kg = (state.session.kg || 0) + gold; state.session.kc_n = (state.session.kc_n || 0) + 1; }
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
// v24.27: the walk in flight, for travel gear: long = another map, a named place we can't place, or > travel_gear.min_px
const trip = { long: false, end: 0 };
// Where smart_move would take a destination (its own table for named places), or null if we can't tell
function dest_point(dest) {
	if (dest && typeof dest === "object" && Number.isFinite(dest.x)) return { map: dest.map || character.map, x: dest.x, y: dest.y };
	let name = typeof dest === "string" ? dest : dest?.to || dest?.map;
	if (!name || G.monsters[name]) return null;
	if (name === "town") name = "main";
	if (G.maps[name]?.spawns?.[0]) return { map: name, x: G.maps[name].spawns[0][0], y: G.maps[name].spawns[0][1] };
	if (name === "upgrade" || name === "compound") return { map: "main", x: -204, y: -129 };
	if (name === "exchange") return { map: "main", x: -26, y: -432 };
	if (name === "potions") return character.map === "halloween" ? { map: "halloween", x: 149, y: -182 }
		: ["winterland", "winter_inn", "winter_cave"].includes(character.map) ? { map: "winter_inn", x: -84, y: -173 } : { map: "main", x: 56, y: -122 };
	if (name === "scrolls") return { map: "main", x: -465, y: -71 };
	const n = typeof find_npc === "function" ? find_npc(name) : null;
	return n && n.map ? { map: n.map, x: n.x, y: n.y } : null;
}
// v24.17: every walk (pack travel, town and bank trips, merchant deliveries, followers) goes the safe way: if smart_move's
// way crosses a map with an aggressive monster we can't take on or outrun (vampire rats in level1), walk the shortest
// way around it leg by leg — through doors, and the transporter where it's on that way; no way around: don't go
async function go(dest, ms = CFG.walk_timeout_ms) {
	{
		// v24.39: the whole walk decides, not each leg. A trip to town by the transporter is three short legs (to the
		// transporter, through it, to the NPC): judged leg by leg none was "long", and the gear stayed on all the way.
		const dp = dest_point(dest);
		trip.long = !dp || dp.map !== character.map || Math.hypot(dp.x - character.x, dp.y - character.y) > CFG.travel_gear.min_px;
	}
	try { return await go_route(dest, ms); }
	finally { if (errand_busy() && state.travel_off.length) await travel_restore("arrived").catch(() => {}); } // v24.27
}
async function go_route(dest, ms, tele_tried = false) {
	if (state.recovering) throw { reason: "fleeing" };
	const T_ = CFG.travel.safe_routes && G.maps[character.map]?.doors ? dest_point(dest) : null;
	if (T_ && T_.map !== character.map) {
		// v24.59: a follower doesn't judge the way (its own verdict made it detour, refuse, or teleport while the tank
		// walked on): it takes the shortest way, the transporter where that uses one
		let pl = is_follower() ? route_plain(T_.map, T_.x, T_.y) : route_plan(T_.map, T_.x, T_.y);
		if (pl?.danger) {
			if (Date.now() - (state.deadly_log_at || 0) > 60_000) { state.deadly_log_at = Date.now(); game_log(`walk to ${T_.map}: every way passes ${pl.danger} — not going`, C.warn); }
			state.walk_refused = { to: T_.map, why: pl.danger, at: Date.now() };
			throw { reason: "deadly_route", why: pl.danger };
		}
		if (pl?.legs?.length) {
			game_log(`walk to ${T_.map}: ${pl.around ? "around " + pl.around : "by the transporter"} (${pl.legs.map((l) => (l.kind === "tp" ? "transporter → " : "") + l.to).join(", ")})`, C.dim);
			for (const L of pl.legs) {
				if (character.map !== L.map) break; // moved some other way meanwhile: the last walk below finishes it
				if (L.kind === "tp") {
					await go_transporter(L, ms);
					if (typeof transport === "function") await T(transport(L.to, L.s), 25_000);
				} else if (L.kind === "door") await go_door(L, ms);
				else await go_raw({ map: L.to, x: L.tx, y: L.ty }, ms);
			}
		}
	}
	return go_raw(dest, ms);
}
// v25.27: a door leg goes through the door the plan chose: walk to it on this map, then use it (transport(map, spawn)).
// It used to be smart_move({map: next}), and the game's pathfinder picks its own shortest door: the planned way around
// level1's prats (main → halloween → spookytown) was walked back out through main after every re-plan — Torlis went in
// a door, stopped for the party, then walked back out, again and again (owner's report and screenshot, 2026-11-22).
// Where to stand: the server lets a door be used within B.door_dist of this side's spawn for it (doors[i][6], boxed to
// the door's size — server.js transport), and a spawn is walkable; the door's centre only when the spawn is unknown.
// No path there: the old way, once.
async function go_door(L, ms) {
	const sp = G.maps[L.map]?.spawns?.[L.fs], at = sp ? { x: sp[0], y: sp[1] } : { x: L.x, y: L.y };
	try { await go_raw({ map: L.map, x: at.x, y: at.y }, ms); }
	catch (e) { if (e?.reason !== "failed") throw e; return go_raw({ map: L.to, x: L.tx, y: L.ty }, ms); }
	if (character.map === L.map && typeof transport === "function") {
		await T(transport(L.to, L.s), 10_000).catch(() => {});
		await until(() => character.map === L.to, 5000);
	}
	if (character.map !== L.to) return go_raw({ map: L.to, x: L.tx, y: L.ty }, ms);
}
// v24.41: walk to a transporter. The ground nearest one can be 50-60px from the NPC (desertland: nothing walkable within
// 55px; winterland 48px — measured on the map geometry), so the pathfinder finds no way to the NPC's own point or just
// below it ("Path not found!", twice, and the party stood at desertland's door). The server lets us use it from 160px
// (B.transporter_dist): try points 65px out — below, right, left, the diagonals — then the old ones; the one that
// worked on a map is tried first next time.
const TP_SPOTS = [[0, 65], [65, 0], [-65, 0], [46, 46], [-46, 46], [0, -65], [0, 30], [0, 0]];
const tp_spot = {}; // map -> index into TP_SPOTS that worked
async function go_transporter(L, ms) {
	const order = [...new Set([tp_spot[L.map] ?? 0, ...TP_SPOTS.keys()])];
	let err = null;
	for (const i of order) {
		// in reach already (160px on the server; 120 leaves room for lag)
		if (character.map === L.map && Math.hypot(character.x - L.x, character.y - L.y) < 120) return;
		try { await go_raw({ map: L.map, x: L.x + TP_SPOTS[i][0], y: L.y + TP_SPOTS[i][1] }, ms); tp_spot[L.map] = i; return; }
		catch (e) { err = e; if (e?.reason !== "failed") throw e; } // "failed" = no path to that point: try the next
	}
	throw err || { reason: "failed" };
}
async function go_raw(dest, ms = CFG.walk_timeout_ms) {
	// v24.8: no walks while fleeing — an errand's next step started one each time recover() stopped the last, and moving
	// cancelled the town channel until the errand ran out of steps
	if (state.recovering) throw { reason: "fleeing" };
	smart_depth++;
	let timer, timed_out = false;
	try {
		return await Promise.race([smart_move(dest), new Promise((_, rej) => (timer = setTimeout(() => {
			timed_out = true;
			halt("go_raw");
			rej({ reason: "walk_timeout", dest: typeof dest === "string" ? dest : dest.map });
		}, ms)))]);
	} catch (e) {
		// v24.8: stop("smart") rejects the walk with "interrupted" first, which won the race: a timeout looked like an interruption
		if (timed_out) throw { reason: "walk_timeout", dest: typeof dest === "string" ? dest : dest.map };
		throw e;
	} finally { clearTimeout(timer); smart_depth--; if (!smart_depth) trip.end = Date.now(); }
}
const walking = () => smart_depth > 0;
// An errand (town run, park) owns NPC visits and pack travel while it runs. A hung one stops counting as busy after
// errand_timeout_ms; its token keeps a late finish from clearing a newer errand's lock.
const errand_busy = () => !!state.errand && Date.now() - state.errand_at < CFG.errand_timeout_ms;
function errand(name, fn) {
	if (errand_busy()) return false;
	const token = {};
	Object.assign(state, { errand: name, errand_at: Date.now(), errand_token: token });
	// v24.27: pieces off for travel go back on before the errand touches the bags
	Promise.resolve().then(() => state.travel_off.length && travel_restore("errand").catch(() => {})).then(() => fn()).catch((e) => game_log(`${name}: ${why(e)}`))
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
