// =====================================================================
// Combat: actions, targeting, movement
// =====================================================================
// One request per skill (or shared cooldown group) at a time: the client's cooldown only updates when the server
// replies, so firing again before that would waste calls. Cleared 100ms after the reply (cooldown display lag),
// or after 3s if the reply never comes.
const inflight = {};
// v24.44: a monster the whole party couldn't kill in hopeless_ttk_s (an ent: 8M HP) is never attacked — not in
// self-defence, not because it's on a partner, not by any skill. Every attack and skill goes through fire(), so the rule
// lives here and nowhere else. Hitting it gains nothing and keeps us there.
const hopeless_c = {};
let boss_type = null; // the boss boss_tick is on (a long fight the party chose)
function hopeless(t) {
	// not what we came for (the spot's own type, a boss), nor an event monster everyone hits together (cooperative)
	if (!t || t.type !== "monster" || !G.monsters[t.mtype] || state.pack?.mtype === t.mtype || boss_type === t.mtype || G.monsters[t.mtype].cooperative) return false;
	const c = hopeless_c[t.mtype], now = Date.now();
	if (c && now - c.at < 30_000) return c.v;
	const f = fight_math(G.monsters[t.mtype]);
	const v = !f || f.ttk > CFG.hopeless_ttk_s;
	hopeless_c[t.mtype] = { at: now, v };
	return v;
}
function fire(skill, target, extra) {
	if (hopeless(target) || tank_first(target)) return false;
	const key = G.skills[skill]?.share || skill;
	if (inflight[key] || is_on_cooldown(skill)) return false;
	const reserve = skill === "attack" ? RESERVE.attack : skill.startsWith("use_") || skill.startsWith("regen_") ? RESERVE.potion : RESERVE.skill;
	if (!can_spend(1, reserve)) return false;
	inflight[key] = true;
	const fallback = setTimeout(() => (inflight[key] = false), 3000);
	const p = skill === "attack" ? attack(target) : skill === "heal" ? heal(target) : use_skill(skill, target, extra);
	Promise.resolve(p).catch(() => {}).finally(() => { clearTimeout(fallback); setTimeout(() => (inflight[key] = false), 100); });
	return true;
}
let last_move = 0;
// Every move costs 2.5 call units: at most one per min_gap ms, and none if we're already heading within 30px of there
// ---- Who moved us (v24.48, refactor step 4a) ----
// Every step (move_to_as), walk (travel_as) and stop of a walk (halt) names the piece of code asking for it. Nothing is
// decided here yet: it is the one place all movement passes through, with a short record of who asked for what — so a
// report can show two owners pulling the character different ways, and so one arbiter can replace them here later.
const mv = { log: [], clash: 0 }; // log: [{ t, who, kind }] of the last minute
function mv_note(who, kind) {
	const now = Date.now(), last = mv.log[mv.log.length - 1];
	// a clash: a different owner steps or stops within 1.5s of another's step or walk
	if (last && last.who !== who && now - last.t < 1500 && !(last.kind === "halt" && kind !== "halt")) mv.clash++;
	// (v25.59: a streak is split per minute — merged for good, "approach step x1149" in the 1-minute line was 8 minutes of it)
	if (last && last.who === who && last.kind === kind && now - (last.t0 || last.t) < 60_000) { last.t = now; last.n++; } else mv.log.push({ t: now, t0: now, who, kind, n: 1 });
	while (mv.log.length && now - (mv.log[0].t0 || mv.log[0].t) > 60_000) mv.log.shift();
}
function move_to_as(who, x, y, min_gap) { const ok = move_to(x, y, min_gap); if (ok) mv_note(who, "step"); return ok; }
function travel_as(who, dest) { if (!walking() && Date.now() >= (state.travel_block_until || 0)) mv_note(who, "walk"); return travel(dest); }
function halt(who) { mv_note(who, "halt"); try { stop("smart"); } catch (e) {} }
function move_to(x, y, min_gap = 300) {
	if (Date.now() - last_move < min_gap) return false;
	if (character.moving && Math.hypot(character.going_x - x, character.going_y - y) < 30) return false;
	if (!can_spend(EMIT_COST.move, RESERVE.move)) return false;
	last_move = Date.now();
	move(x, y);
	return true;
}
const valid = (e) => e && e.visible && !e.dead && parent.entities[e.id] === e; // still the live, visible entity
function party_names() {
	const n = new Set([character.name]);
	for (const k in get_party() || {}) n.add(k);
	return n;
}
// Self-defence first (monsters hitting us, then a party member); then the pack's own monster type; others only if
// none of the pack's type is in view and they die within max_ttk_s.
// v24.8: the nearest monster attacking us (not one ignored as immune): self-defence comes before the tank's call —
// a mage kept shooting the tank's target, and stepped toward it, while another monster hit it unkited
function hit_on_me() {
	let best = null, bd = Infinity;
	for (const id in parent.entities || {}) {
		const e = parent.entities[id];
		if (!e || e.type !== "monster" || !e.visible || e.dead || e.target !== character.name || (state.bad_ids[e.id] || 0) > Date.now()) continue;
		const d = distance(character, e);
		if (d < bd) (bd = d), (best = e);
	}
	return best;
}
// ---- Where the time at the camp goes (v24.65; report line "camp time") ----
// Sampled 4x a second, kept per minute for 10 min. It answers "why is a member idle": nothing alive (respawn), monsters
// alive but the tank's first hit hasn't landed (its walk, its swing, or holding for the party), or a fight is on.
const gaps = { t: 0, min: [] }; // min: [{ m: minute number, by: { kind: ms } }], newest first
function gap_tick() {
	const now = Date.now(), dt = Math.min(now - (gaps.t || now), 1000);
	gaps.t = now;
	const k = dt > 0 ? gap_kind() : null;
	if (!k) return;
	const m = Math.floor(now / 60_000);
	if (gaps.min[0]?.m !== m) { gaps.min.unshift({ m, by: {} }); gaps.min.length = Math.min(gaps.min.length, 10); }
	gaps.min[0].by[k] = (gaps.min[0].by[k] || 0) + dt;
}
async function travel(dest) {
	if (walking() || Date.now() < (state.travel_block_until || 0)) return;
	try { await go(dest); } catch (e) {
		// a failing path must not be retried every tick; an interrupted one (we stopped it to fight, or the watchdog did) isn't
		// failing (v24.4: it was blocked 5s too, standing idle after the kill and undoing the watchdog's reset)
		if (!e || e.reason !== "interrupted") {
			game_log("travel: " + why(e)); state.travel_block_until = Date.now() + 5000;
			// v24.54: no safe way to our own camp — whoever chose it: rest it 30 min and pick again, don't stand and retry
			const P_ = state.pack;
			if (e?.reason === "deadly_route" && P_ && !is_follower() && dest?.map === P_.map) {
				rest_place(P_, 1_800_000);
				// v25.89: the held hunt plan ends too (the pick would otherwise re-set the same camp every tick)
				if (state.hunt_hold?.monster === P_.mtype && typeof plan_end === "function") plan_end(`no safe way there: ${e.why || "the walk was refused"}`, 1_800_000);
				if (state.probe?.mtype === P_.mtype) { skip("probe:" + P_.mtype, 6 * 3600_000, "no safe way there"); state.probe = null; }
				game_log(`${P_.mtype} @ ${P_.map}: no safe way there (${e.why || "?"}) — resting it 30 min, picking again`, C.warn);
				state.pack = null; state.last_pick = 0;
			}
			// v25.55: the merchant with no safe way home (it walks no spawn that could kill it): teleport to town
			if (e?.reason === "deadly_route" && is_merchant() && dest?.map === "main" && character.map !== "main" && !character.stand) fire("use_town");
			// v24.8: an unreachable waypoint is skipped (it was retried forever, and each failure counted as activity, so
			// the idle give-up never fired)
			const W = state.waypoints, w = W.length ? W[state.wp % W.length] : null;
			if (w && dest && dest.x === w.x && dest.y === w.y) state.wp = (state.wp + 1) % W.length;
			return;
		}
	}
	state.last_target_at = Date.now();
}
function can_use(skill) {
	const s = G.skills[skill];
	return s && character.level >= (s.level || 0) && !is_on_cooldown(skill) && character.mp >= (s.mp || 0);
}
// Potions of any tier: the game's use_hp/use_mp drink the last bag item that gives hp/mp, whatever its name
const pot_count = (kind) => character.items.reduce((n, i) => {
	const d = i && G.items[i.name];
	return n + (d && d.type === "pot" && (d.gives || []).some(([k, v]) => k === kind && v > 0) ? i.q || 1 : 0);
}, 0);
// Drink below 55% HP / 35% MP; otherwise use the free (slow) regen when topped up enough elsewhere
// v24.4: no potion while channelling a town teleport (a drink cancels it); and the free regen only when nothing is on
// us — it puts every potion on a 4s cooldown (server), twice a potion's own, which a hit at 60% HP can't afford
function sustain() {
	if (character.rip) return;
	const hp = character.hp / character.max_hp, mp = character.mp / character.max_mp;
	const calm = !get_nearest_monster({ target: character.name }) && hurt_ms() > 3000;
	if (channeling()) return calm && hp < 0.9 ? fire("regen_hp") : undefined;
	if (hp < 0.55 && pot_count("hp")) return fire("use_hp");
	if (mp < 0.35 && pot_count("mp")) return fire("use_mp");
	// v24.7: calm matters only with potions of that kind to protect — with none, the regen is all there is
	const ok_hp = calm || !pot_count("hp"), ok_mp = calm || (!pot_count("mp") && !pot_count("hp"));
	if (mp < 0.9 && hp > 0.8 && ok_mp) return fire("regen_mp");
	if (hp < 0.9 && ok_hp) return fire("regen_hp");
}
const chest_tries = {}; // chest id -> { n: attempts, t: last attempt, seen: first seen }; forgotten once the chest is gone
function loot_chests() {
	// A full bag still opens chests: gold-only chests succeed; item chests fail with loot_no_space, so each is tried
	// once at 0 free slots (gold would otherwise be left on the ground while the bag is full)
	if (character.rip) return;
	const now = Date.now();
	let best = null, best_d = Infinity;
	for (const id in parent.chests || {}) {
		const tr = (chest_tries[id] = chest_tries[id] || { n: 0, t: 0, seen: now });
		if (tr.n >= (character.esize === 0 ? 1 : 3) || now - tr.t < 3000) continue; // ≤3 tries (1 with a full bag), 3s apart
		const d = distance(character, parent.chests[id]);
		if (d > CFG.loot_range && now - tr.seen < CFG.loot_wait_ms) continue;
		if (d < best_d) (best = id), (best_d = d);
	}
	if (!best || !can_spend(1, RESERVE.loot)) return;
	chest_tries[best].n++;
	chest_tries[best].t = now;
	parent.open_chest(best); // one chest per call; the tick runs every ~200ms, so a pile still empties quickly
}
setInterval(() => { for (const id in chest_tries) if (!(id in (parent.chests || {}))) delete chest_tries[id]; }, 60_000);
