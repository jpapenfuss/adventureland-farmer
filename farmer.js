// =====================================================================
// Guide-driven farmer for Adventure Land — v9
// v9 (fixes):
//  - Flee: cancels any smart_move first (v8 never fled while traveling), then holds until recover_hp/recover_mp
//    instead of walking back at 26% HP; fights back only against attackers; no use_town spam in town.
//  - Split the single "traveling" flag into walking() (smart_move in flight → no steering) and an errand lock
//    (sell/guide/restock → no pack travel, kiting still allowed). Errand lock has a timeout and a token.
//  - Guide farm rows / hunt targets without a usable boundary fall back to spawn data (v8 crashed every tick).
//  - run_retrieve: own until() poller (wait_for isn't a runner function); bank_packs read from parent if needed.
//  - run_stat: all checks before unequip; finally{} always re-equips.
//  - tick wait: next_skill.attack unset → NaN → 0ms busy loop; now floored at 50ms.
//  - Game calls in errands go through T(): client deferreds never time out, so an unanswered call hung the errand.
//  - Monster hunt: a turn-in is immediately followed by starting the next hunt (server does one per call).
//  - Quest materials are protected from load, not only after the first guide read.
//  - Restock buys what it can afford (v8 bought nothing if a full stack was unaffordable); skips the walk with a computer.
//  - v9.2: governor takes max(own meter, server-reported character.cc) and real equip/unequip costs; chests far
//    than 400px wait 45s (goldm drops to 1 past 400px); quest crafts/exchanges go to the quest NPC; respawn waits
//    the server's rip_time instead of polling; use_town retries back off 1.5s (no cooldown, cant_escape >5 targets).
//  - v9.3: fight safety follows the server's damage formula (pierce, evasion/avoidance, 1hp, reflection, dreturn,
//    lifesteal, self_healing, chase at charge speed); kiteable mobs still count 1/kite_slack of their damage;
//    every target is re-checked with its live stats, so levelled-up elites are skipped. Bags: junk sells early
//    with a computer; if selling can't free space, materials/gems/quest items go to the bank.
//  - v9.4: quest crafting (Cole/mcollector etc.) runs on its own, without the guide: any quest recipe whose inputs
//    you hold is crafted at its NPC (walks there unless you carry a computer); crafted gear goes into empty slots.
//  - v9.5: farms the drops the next quest recipe is missing (G.drops rates × estimated kills/s, capped at
//    quest_farm_max_h); hunt/quest directives no longer need the guide (v8 never farmed a hunt target without it);
//    learned state persists across reloads (set/get, saved every 60s and in on_destroy); park()/resume().
// Verified against kaansoral/adventureland source: stop("smart"), interact("monsterhunt"), bank_packs global,
// can_move_to(entity), upgrade/compound preview → {chance}. Server: attacking, moving or equipping clears
// character.c (cancels the town channel); use_town fails with cant_escape while >5 monsters target you.
// v8: the Progression Guide (get_progression) is the driver. Every guide row that can be acted on
//     is executed in the guide's own order (equip, buy, upgrade, compound, craft, stat, exchange,
//     token, dismantle, retrieve, supplies, monster hunts); the guide's farm row decides where to
//     fight. The xp/s pack picker only runs when the guide has no farm row.
// v7 notes kept below.
// v7: follows the advisor's quest/material farm rows (e.g. the "working" lesson's
//     "Bee · Mainland — save Bee Wings for Cole", or "Still needed: N <material>" for a plan),
//     and executes craft rows at the right NPC (Cole = "mcollector" for wcap/wgloves/... recipes).
//     Quest/plan materials are never sold.
// v6: farmable-monster filter (training dummies "Target Automatron" are monsters with 0 attack,
//     50k hp, respawn 0, unlisted — v5 treated them as free XP; puppies/kitties give -500 xp);
//     no-progress blacklist for targets that don't lose HP (immune/invulnerable);
//     opportunistic targeting only inside the chosen pack area (v5 fought every goo it saw,
//     so it never left the starter zone); one stand-off distance shared by approach and kite
//     so they can't push against each other.
// v5: gear progression driven by the game's own advisor, get_progression() (js/progression/*).
//     It projects your real stats for every candidate (class/level restrictions, set bonuses,
//     weapon types), plans buy → upgrade/compound → equip chains, and keeps worn gear out of
//     inputs. This script executes its equip/buy/upgrade/compound steps, gated by the server's
//     own success-chance preview, a gold reserve, and the emit budget. Plan inputs are protected
//     from auto-selling.
// v4: measures real xp/s per pack and calibrates estimates against it; learns from deaths;
//     supports multi-map "boundaries" packs; party-aware targeting; sells junk when bags fill.
// v3: rate governance. Server (node/server.js) disconnects past 200 call-cost per rolling 4s;
//     every emit costs 1, "move" costs 2.5, and server-side resends add more. v2 sent move()
//     on every 10–120ms tick while approaching/kiting and re-fired skills before the server
//     acked the cooldown. Now: one metered emit path, de-duplicated moves, in-flight skill
//     guards, a 50ms tick floor, and a soft budget of 110/4s with per-action reserves.
// Changes from v1:
//  - Scores spawn packs by real throughput: min(our kill rate, pack.count / respawn time).
//    Respawn values come from G.monsters[m].respawn (seconds); the server adds 0–0.9s, or
//    scales it by 0.72–1.2x when the value is over 200. "grow" packs refill almost instantly.
//  - Travels once. v1 re-issued smart_move every tick whenever no farm mob was in view,
//    which is where the "Yes!" (smart_move's path-found text) spam came from.
//  - Patrols a grid inside the pack boundary instead of standing at its centre.
//  - Fights any safe monster in view, not just the chosen type.
//  - Gives up on a pack (cooldown) if it sits idle too long, then picks again.
//  - Loots chests on its own timer, independent of travel, calling parent.open_chest directly.
// =====================================================================

const CFG = {
	safety: 0.35,            // max fraction of max_hp a mob may deal over one kill (non-kiteable mobs)
	max_respawn: 120,        // ignore monsters whose respawn (s) exceeds this
	min_count: 3,            // ignore packs smaller than this unless they "grow"
	walk_overhead: 1.5,      // seconds of walking/aggro per kill (pack density varies)
	idle_giveup_ms: 25_000,  // no target for this long, mid-patrol → pick another pack
	pack_cooldown_ms: 600_000,
	repick_ms: 120_000,      // re-evaluate as stats/level change
	flee_hp: 0.25,
	recover_hp: 0.85,        // after fleeing, stay put (town) until HP and MP are back to these fractions
	recover_mp: 0.4,
	errand_timeout_ms: 180_000, // an errand (sell/guide/restock) still running after this is assumed hung; its lock is released
	hp_pot: "hpot1", mp_pot: "mpot1", pot_min: 30, pot_buy: 200,
	kite_margin: 25,
	kite_slack: 4,           // a kiteable mob's damage counts 1/kite_slack toward safety (kiting isn't perfect)
	loot_range: 400,         // server drops the gold multiplier past 400px from the chest
	loot_wait_ms: 45_000,    // a chest farther than loot_range is opened anyway after this long (before it's lost)
	force_type: null,
	switch_margin: 1.15,     // only change packs if the new one scores 15% better (travel isn't free)
	measure_min_s: 90,       // seconds at a pack before its measured xp/s replaces the estimate
	death_pack_cooldown_ms: 1_800_000,
	// Selling (fires when free slots <= sell_when_free)
	sell_when_free: 2,
	sell: [],                // extra item names to always sell (e.g. materials you don't craft with: "beewings", "gslime")
	auto_sell_gear: true,    // sell +0 normal-grade equipment with no title (.p) that isn't in keep
	keep: ["computer", "supercomputer", "tracker", "elixirluck", "lostearring"],
	sell_max_value: 20_000,  // never auto-sell gear the NPC values above this
	sell_batch: 4,           // with a computer, sell as soon as this many junk items pile up
	bank: true,              // when selling doesn't free enough space, deposit materials/gems/quest items/etc. in the bank
	bank_extra: 0,           // bank only if free slots after selling are <= sell_when_free + this
	// Gear progression
	gear: true,                    // guide driver on/off
	gear_interval_ms: 15_000,      // how often to re-read the guide while farming
	guide_steps_per_visit: 5,      // after an errand, keep executing guide steps (re-reading each time) up to this many
	// Quest crafting (Cole = "mcollector": wcap/wgloves/wbreeches/wattire/wshoes/quiver/...; also the witch etc.).
	// Runs on its own, without the guide. "materials" = only recipes whose inputs are all non-equipment
	// (armorring/resistancering/lbelt eat upgraded rings/belts, so they're opt-in); "all"; or a list of recipe ids.
	quest_crafts: "materials",
	quest_craft_max: 1,            // skip a recipe while you already hold this many of its output (bags + worn)
	quest_craft_skip: [],          // recipe ids never to craft
	quest_farm: true,              // farm the drops the next quest recipe is missing (bees for wings, ...)
	quest_farm_max_h: 3,           // ...unless finishing it would take longer than this at our estimated rate
	hunt_first: false,             // true: an active monster hunt outranks quest farming
	park_key: null,                // e.g. "P": key that toggles park()/resume() (overrides that key's default binding)
	auto_monster_hunt: true,       // start/turn in Daisy's hunts even when the guide's 3 rows don't show it, and farm the target if safe
	gold_reserve: 50_000,          // never spend below this (potions, scrolls)
	min_upgrade_chance: 0.80,      // server preview; a failed upgrade/compound destroys the item(s)
	min_compound_chance: 0.80,
	gear_actions: ["equip", "buy", "upgrade", "compound", "craft", "stat", "exchange", "token", "dismantle", "retrieve", "supplies", "hunt"],
	// Advisor farm rows to obey (reason ids, without the "progression.reason." prefix).
	// material/try_material = a plan needs drops; bees = early lesson (XP + Bee Wings for Cole);
	// hunt_farm = active monster hunt. Plain xp/level/gold suggestions are ignored: the
	// script's measured xp/s picker beats the advisor's estimate.
	follow_farm_reasons: null,    // null = obey every guide farm row; or a list like ["material","bees","hunt_farm"]
};
code_settings.show_smart_move_text = false;

const RANGED = ["ranger", "mage", "priest"].includes(character.ctype);
const state = {
	pack: null,           // { mtype, map, boundary, count, score }
	safe: {},             // mtype -> { per_kill_xp_rate } for every type we can fight
	errand: null,         // name of the running errand (sell/guide/restock); owns NPC visits, blocks pack travel
	errand_at: 0,
	errand_token: null,
	recovering: false,    // fled at low HP; no farming until recover_hp/recover_mp
	fled: false,          // use_town sent for this recovery
	waypoints: [], wp: 0,
	last_target_at: Date.now(),
	last_pick: 0,
	cooldown: {},         // packKey -> until timestamp
	measured: {},         // packKey -> measured xp/s (EMA)
	realism: 1,           // EMA of measured/estimated across packs; scales unmeasured estimates
	danger: {},           // mtype -> multiplier on CFG.safety, shrinks each time it kills us
	session: null,        // { key, est, xp, start }
	last_gear: 0,
	protect: new Set(),   // item names the advisor's plans need; never auto-sold
	gear_skip: {},        // row id -> until timestamp (failed/declined steps)
	bad_ids: {},          // entity id -> until timestamp (no HP progress)
	prog: null,           // { id, hp, t } progress watch on current target
	directive: null,      // { monster, map, boundary, count, reason, until } from an advisor farm row
};
const pack_key = (p) => `${p.map}:${p.boundary.join(",")}`;
// [x1,y1,x2,y2] with finite numbers and positive area; anything else would crash pack_key/in_boundary every tick
function valid_boundary(b) {
	return Array.isArray(b) && b.length >= 4 && b.slice(0, 4).every(Number.isFinite) && b[2] > b[0] && b[3] > b[1];
}

// ---------- Scoring ----------

// Excludes everything that isn't a normal respawning XP mob: training dummies (unlist, attack 0,
// respawn 0), pets/critters (cute; puppies & kitties are -500 xp), immune/passive/peaceful/stationary
// specials, bosses, co-op/world events, and anything that never respawns.
function farmable_type(mtype) {
	const m = G.monsters[mtype];
	return !!m && m.xp > 0 && m.hp > 0 && m.attack > 0 && m.respawn > 0 &&
		!(m.special || m.cooperative || m.global || m.unlist || m.immune || m.passive || m.peaceful || m.stationary || m.cute);
}
function farmable_entity(e) {
	return e && e.type === "monster" && e.visible && !e.dead && !e.npc && !e.immune && !e.peaceful &&
		farmable_type(e.mtype) && !((state.bad_ids[e.id] || 0) > Date.now());
}

// Levelled-up monsters (server level_monster/calculate_monster_stats): each level past 1 adds hp/2 and xp;
// attack ×(1+L·0.125), frequency +L·0.034, speed +L·0.24, L=min(level,12). Live entities carry these values.
// One fight, modelled on the server's complete_attack():
//   hit = attack · damage_multiplier(target_defense − attacker_pierce) · (1 + incdmgamp/100)
//   "1hp" targets take 1 per hit; evasion (physical only) and avoidance make hits miss;
//   reflection bounces magical hits back at full value; dreturn hits melee (range<75) physical attackers;
//   lifesteal and self_healing heal the monster.
// m: monster stats (G def, leveled() def, or a live entity merged over its def). Returns null if we can't hurt it.
function fight_math(m) {
	const dm = (d) => (typeof damage_multiplier === "function" ? damage_multiplier(d) : Math.max(0.05, 1 - d / 1000));
	const ours = character.damage_type || G.classes[character.ctype].damage_type || "physical";
	const our_magic = ours === "magical";
	const pct = (v) => Math.min(1, Math.max(0, (v || 0) / 100));
	let hit = character.attack * dm((our_magic ? m.resistance : m.armor) - (our_magic ? character.rpiercing : character.apiercing) || 0);
	hit *= 1 + (m.incdmgamp || 0) / 100;
	if (m["1hp"]) hit = 1;
	const land = (1 - (our_magic ? 0 : pct(m.evasion))) * (1 - pct(m.avoidance));
	const theirs_magic = m.damage_type === "magical";
	const their_hit = (m.attack || 0) * dm((theirs_magic ? character.resistance : character.armor) - (theirs_magic ? m.rpiercing : m.apiercing) || 0);
	const their_dps = their_hit * (m.frequency || 1);
	const heal_dps = their_dps * (m.lifesteal || 0) / 100 +
		(m.abilities?.self_healing ? m.abilities.self_healing.heal / Math.max(1, m.abilities.self_healing.cooldown / 1000) : 0);
	const our_dps = hit * land * character.frequency - heal_dps;
	if (!(our_dps > 0)) return null;
	const ttk = (m.hp || m.max_hp) / our_dps;
	const reflect_dps = our_magic ? character.attack * character.frequency * pct(m.reflection) : 0;
	const dreturn_dps = !our_magic && character.range < 75 ? character.attack * character.frequency * (m.dreturn || 0) / 100 : 0;
	// Kiting: a monster with a target moves at its charge speed (server), not its idle speed
	const chase = m.charge || m.speed || 0;
	const kiteable = RANGED && character.range > (m.range || 0) + CFG.kite_margin && character.speed > chase;
	return { ttk, xp: m.xp, their_dps, self_dps: reflect_dps + dreturn_dps, kiteable };
}
// Damage we expect to take over one kill. Kiting avoids most melee hits but not all (other mobs, terrain,
// mis-steps), so a kiteable fight still counts 1/kite_slack of the monster's damage.
function fight_risk(f) {
	return (f.their_dps / (f.kiteable ? CFG.kite_slack : 1) + f.self_dps) * f.ttk;
}
function safe_enough(f, mtype) {
	return !!f && fight_risk(f) <= character.max_hp * CFG.safety * (state.danger[mtype] || 1);
}

function fight_profile(mtype) {
	if (!farmable_type(mtype)) return null;
	const f = fight_math(G.monsters[mtype]);
	return safe_enough(f, mtype) ? { ttk: f.ttk, xp: f.xp } : null;
}
// Per-entity check with live stats: catches levelled-up "elite" mobs (a level 6 goo has 3.5x hp, 1.75x attack)
// that the type-level estimate passes
const live_cache = new Map(); // id -> { key, ok, ttk }
function entity_profile(e) {
	const key = `${e.level || 1}:${e.max_hp}:${e.attack}`;
	const c = live_cache.get(e.id);
	if (c && c.key === key) return c.ok ? c : null;
	const def = G.monsters[e.mtype];
	const f = def && fight_math({ ...def, ...pick(e, ["hp", "max_hp", "attack", "frequency", "armor", "resistance", "speed", "xp", "1hp", "level"]),
		hp: e.max_hp || def.hp, charge: Math.max(def.charge || 0, e.speed || 0) });
	const ok = safe_enough(f, e.mtype);
	const out = { key, ok, ttk: f ? f.ttk : Infinity, xp: e.xp || def?.xp || 0 };
	live_cache.set(e.id, out);
	if (live_cache.size > 500) live_cache.delete(live_cache.keys().next().value);
	return ok ? out : null;
}
function pick(o, keys) {
	const r = {};
	for (const k of keys) if (o[k] !== undefined) r[k] = o[k];
	return r;
}

function expected_respawn(mtype, pack) {
	if (pack.grow) return 0.1;
	const r = G.monsters[mtype].respawn || 1;
	return r > 200 ? r * 0.96 : r + 0.45;
}

function pack_areas(name, pack) {
	// single-map packs use .boundary; roaming packs list [map,x1,y1,x2,y2] in .boundaries
	let areas = [];
	if (pack.boundary) areas = [{ map: name, boundary: pack.boundary, count: pack.count }];
	else if (pack.boundaries) areas = pack.boundaries.map((b) => ({ map: b[0], boundary: b.slice(1, 5), count: pack.count / pack.boundaries.length }));
	return areas.filter((a) => valid_boundary(a.boundary));
}

// Area for a directive. Uses the given boundary if it is usable; otherwise falls back to spawn data,
// preferring the requested map, then the densest area anywhere. null if the monster has no reachable spawn.
function resolve_area(monster, map, boundary, count) {
	if (map && G.maps[map] && valid_boundary(boundary)) return { map, boundary: boundary.slice(0, 4), count: count || 1 };
	let best = null;
	for (const name in G.maps) {
		const m = G.maps[name];
		if (m.ignore || m.instance || m.pvp) continue;
		for (const pack of m.monsters || []) {
			if (pack.type !== monster) continue;
			for (const area of pack_areas(name, pack)) {
				const am = G.maps[area.map];
				if (!am || am.ignore || am.instance || am.pvp) continue;
				const rank = (area.map === map ? 1e6 : 0) + area.count;
				if (!best || rank > best.rank) best = { ...area, rank };
			}
		}
	}
	return best && { map: best.map, boundary: best.boundary, count: best.count };
}

function score_area(t, pack, area) {
	const f = state.safe[t];
	const key = pack_key(area);
	const est = f.xp * Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(t, pack));
	return { est, score: state.measured[key] ?? est * state.realism };
}

function pick_pack() {
	state.safe = {};
	for (const t in G.monsters) {
		const f = fight_profile(t);
		if (f) state.safe[t] = f;
	}
	let best = null;
	const now = Date.now();
	const seen = new Set();
	for (const name in G.maps) {
		const map = G.maps[name];
		if (map.ignore || map.instance || map.pvp || !map.monsters) continue;
		for (const pack of map.monsters) {
			const t = pack.type;
			if (CFG.force_type && t !== CFG.force_type) continue;
			if (!state.safe[t]) continue;
			if (!pack.grow && (expected_respawn(t, pack) > CFG.max_respawn || pack.count < CFG.min_count)) continue;
			for (const area of pack_areas(name, pack)) {
				const m = G.maps[area.map];
				if (!m || m.ignore || m.instance || m.pvp) continue;
				const key = pack_key(area);
				if (seen.has(key) || (state.cooldown[key] || 0) > now) continue;
				seen.add(key);
				const p = { mtype: t, ...area, ...score_area(t, pack, area) };
				if (!best || p.score > best.score) best = p;
			}
		}
	}
	state.last_pick = now;
	// Advisor directive (quest/material farm) overrides the xp/s choice when we can safely fight it
	const d = state.directive;
	if (d && d.until > now && farmable_type(d.monster) && !state.safe[d.monster] && d.guide_safe) {
		// The guide judged this route safe (its own estimate + observed fights); trust it
		state.safe[d.monster] = { ttk: d.seconds || 5, xp: G.monsters[d.monster].xp, trusted: true };
	}
	if (d && d.until > now && state.safe[d.monster]) {
		const area = { map: d.map, boundary: d.boundary, count: d.count };
		const key = pack_key(area);
		if (!((state.cooldown[key] || 0) > now)) {
			const pack = (G.maps[d.map]?.monsters || []).find((pk) => pk.type === d.monster) || { count: d.count };
			const directed = { mtype: d.monster, ...area, ...score_area(d.monster, pack, area), directive: d.reason };
			if (!state.pack || pack_key(state.pack) !== key) {
				game_log(`→ ${d.monster} @ ${d.map} (${d.reason})`, "#67A464");
				state.waypoints = make_waypoints(directed.boundary);
				state.wp = 0;
				end_session();
				state.last_target_at = now;
			}
			state.pack = directed;
			return;
		}
	}
	// Hysteresis: stay put unless the alternative is clearly better (current pack's score uses its measured rate)
	const cur = state.pack;
	const cur_ok = cur && state.safe[cur.mtype] && !((state.cooldown[pack_key(cur)] || 0) > now);
	if (cur_ok && best && pack_key(best) !== pack_key(cur)) {
		const cur_score = state.measured[pack_key(cur)] ?? cur.score;
		if (best.score < cur_score * CFG.switch_margin) best = cur;
	}
	if (best && (!cur || pack_key(best) !== pack_key(cur))) {
		game_log(`→ ${best.mtype} x${Math.round(best.count)} @ ${best.map} (~${best.score.toFixed(0)} xp/s${state.measured[pack_key(best)] ? " measured" : " est"})`);
		state.waypoints = make_waypoints(best.boundary);
		state.wp = 0;
		end_session();
		state.last_target_at = now;
	}
	state.pack = best;
}

// ---------- XP measurement ----------
let xp_prev = { level: character.level, xp: character.xp };
function xp_delta() {
	// handles level-ups: remaining xp of the old level + xp into the new one
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
	const secs = (Date.now() - s.start) / 1000;
	if (secs < CFG.measure_min_s) return;
	const rate = s.xp / secs;
	const prev = state.measured[s.key];
	state.measured[s.key] = prev === undefined ? rate : prev * 0.5 + rate * 0.5;
	if (s.est > 0) state.realism = state.realism * 0.7 + (rate / s.est) * 0.3;
	game_log(`${s.key}: ${rate.toFixed(1)} xp/s measured over ${secs.toFixed(0)}s (est ${s.est.toFixed(1)}, realism ${state.realism.toFixed(2)})`);
}
setInterval(() => {
	const d = xp_delta();
	const p = state.pack;
	if (!p || character.rip) return;
	const here = character.map === p.map && in_boundary(p.boundary, 300);
	if (!state.session && here && !walking() && !state.recovering) state.session = { key: pack_key(p), est: p.est, xp: 0, start: Date.now() };
	if (state.session) {
		state.session.xp += d;
		// roll the measurement periodically so the repick sees fresh numbers
		if ((Date.now() - state.session.start) / 1000 > CFG.measure_min_s * 2) { end_session(); }
	}
}, 1000);

function make_waypoints([x1, y1, x2, y2]) {
	// 3x3 snake through the boundary, inset 15%, so the server streams us every part of the pack
	const pts = [];
	for (let r = 0; r < 3; r++) {
		const cols = [0, 1, 2];
		if (r % 2) cols.reverse();
		for (const c of cols) pts.push({ x: x1 + (x2 - x1) * (0.15 + 0.35 * c), y: y1 + (y2 - y1) * (0.15 + 0.35 * r) });
	}
	return pts;
}

// ---------- Emit governor ----------
// Meters every packet this client sends (including the game's own) in the same 4s window the server uses.
const BUDGET = { window_ms: 4000, soft: 110 }; // server hard limit is 200; resends/skill costs eat the gap
// Server (node/server.js socket wrapper): every event costs 1 plus CC[event] (move 1.5, equip 3, unequip 6),
// and each resulting "player" resend on our socket adds ~1-2 more. The server also reports its own running
// total on every player update as character.cc, which includes costs we can't see (resends, chest/skill modifiers).
const EMIT_COST = { move: 2.5, equip: 5, unequip: 8, equip_batch: 6 };
const sent = [];
function meter_socket() {
	const s = parent.socket;
	if (!s || s.__xp_metered) return;
	const orig = s.emit;
	s.emit = function (ev, ...args) {
		sent.push([Date.now(), EMIT_COST[ev] || 1]);
		return orig.call(this, ev, ...args);
	};
	s.__xp_metered = true; // reconnects create a new socket; tick() re-wraps it
}
function spent() {
	const cut = Date.now() - BUDGET.window_ms;
	while (sent.length && sent[0][0] < cut) sent.shift();
	let c = 0;
	for (const x of sent) c += x[1];
	// character.cc lags by one update; our own meter covers what we sent since. Take whichever is higher.
	return Math.max(c, +character.cc || 0);
}
// reserve = headroom kept for higher-priority actions (attack 0, skills 15, potions 10, moves 30, loot 40)
const can_spend = (cost, reserve) => spent() + cost <= BUDGET.soft - reserve;

// ---------- Guarded actions ----------
const inflight = {};
function fire(skill, target, extra) {
	const key = G.skills[skill]?.share || skill;
	if (inflight[key] || is_on_cooldown(skill)) return false;
	if (!can_spend(1, skill === "attack" ? 0 : skill.startsWith("use_") || skill.startsWith("regen_") ? 10 : 15)) return false;
	inflight[key] = true;
	const release = () => setTimeout(() => (inflight[key] = false), 100); // covers cooldown update lag after ack
	const fallback = setTimeout(() => (inflight[key] = false), 3000);   // lost ack
	const p = skill === "attack" ? attack(target) : skill === "heal" ? heal(target) : use_skill(skill, target, extra);
	Promise.resolve(p).catch(() => {}).finally(() => { clearTimeout(fallback); release(); });
	return true;
}

let last_move = 0;
function move_to(x, y, min_gap = 300) {
	if (Date.now() - last_move < min_gap) return false;
	// already heading there: don't resend
	if (character.moving && Math.hypot(character.going_x - x, character.going_y - y) < 30) return false;
	if (!can_spend(2.5, 30)) return false;
	last_move = Date.now();
	move(x, y);
	return true;
}

// ---------- Targeting ----------
function valid(e) {
	return e && e.visible && !e.dead && parent.entities[e.id] === e;
}
function party_names() {
	const n = new Set([character.name]);
	for (const k in get_party() || {}) n.add(k);
	return n;
}
// Type must be in the safe set, and this particular entity must pass with its live stats. Guide-trusted types
// (no fight math of our own) are accepted at level 1 only; an elite of one still gets the live check.
function live_ok(e) {
	const f = state.safe[e.mtype];
	if (!f) return null;
	if (f.trusted && !((e.level || 1) > 1)) return f;
	const lf = entity_profile(e);
	return lf ? { ttk: lf.ttk, xp: lf.xp } : null;
}
function choose_target(local_ok) {
	const party = party_names();
	// Self-defense always: things hitting us, then things hitting a party member (must still be real mobs)
	let hitting = null, hd = Infinity;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || !e.visible || e.dead || !e.target || !party.has(e.target)) continue;
		if ((state.bad_ids[e.id] || 0) > Date.now()) continue;
		const d = distance(character, e) - (e.target === character.name ? 10_000 : 0); // ours first
		if (d < hd) (hd = d), (hitting = e);
	}
	if (hitting) return hitting;
	if (!local_ok) return null; // outside the pack area: don't get pulled into whatever is nearby
	const cur = get_targeted_monster();
	if (farmable_entity(cur) && valid(cur) && live_ok(cur) && (!cur.target || party.has(cur.target))) return cur;
	let best = null, best_v = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (!farmable_entity(e)) continue;
		if (e.target && !party.has(e.target)) continue;
		const f = live_ok(e);
		if (!f) continue;
		const walk_s = Math.max(0, distance(character, e) - character.range) / Math.max(character.speed, 1);
		const v = e.xp / (f.ttk * (e.hp / e.max_hp) + walk_s + 0.2);
		if (v > best_v && can_move_to(e)) (best = e), (best_v = v);
	}
	return best;
}

// Blacklists a target that hasn't lost HP after 8s of us being in range (immune, healing, invulnerable, etc.)
function watch_progress(t) {
	const now = Date.now();
	if (!is_in_range(t)) { if (state.prog && state.prog.id === t.id) state.prog.t = now; return false; }
	if (!state.prog || state.prog.id !== t.id) { state.prog = { id: t.id, hp: t.hp, t: now }; return false; }
	if (t.hp < state.prog.hp) { state.prog.hp = t.hp; state.prog.t = now; return false; }
	if (now - state.prog.t > 8000) {
		state.bad_ids[t.id] = now + 300_000;
		game_log(`No damage on ${t.mtype} (${t.id}) in 8s; ignoring it for 5 min`, "gray");
		state.prog = null;
		change_target(null);
		return true;
	}
	return false;
}

// ---------- Movement / errands ----------
// Two separate locks (v8 had one "traveling" flag held for an entire errand, which froze kiting and
// approach even while standing at an NPC):
//  - walking(): a smart_move is in flight; nothing else may steer.
//  - errand_busy(): a sell/guide/restock errand owns NPC visits; pack travel waits, defensive kiting doesn't.
let smart_depth = 0;
async function go(dest) {
	smart_depth++;
	try { return await smart_move(dest); } finally { smart_depth--; }
}
const walking = () => smart_depth > 0;
const errand_busy = () => !!state.errand && Date.now() - state.errand_at < CFG.errand_timeout_ms;
function errand(name, fn) {
	if (errand_busy()) return false;
	const token = {};
	Object.assign(state, { errand: name, errand_at: Date.now(), errand_token: token });
	Promise.resolve()
		.then(fn)
		.catch((e) => game_log(`${name}: ` + (e?.reason || e?.response || e)))
		.finally(() => {
			if (state.errand_token !== token) return; // a hung errand that timed out can't clear a newer one's lock
			state.errand = null;
			state.last_target_at = Date.now(); // time spent at NPCs isn't "idle at the pack"
		});
	return true;
}
const until = async (cond, ms) => {
	const end = Date.now() + ms;
	while (!cond()) { if (Date.now() > end) return false; await sleep_ms(200); }
	return true;
};

async function travel(dest) {
	if (walking() || Date.now() < (state.travel_block_until || 0)) return;
	try {
		await go(dest);
	} catch (e) {
		if (e && e.reason !== "interrupted") game_log("travel: " + (e.reason || JSON.stringify(e)));
		state.travel_block_until = Date.now() + 5000; // a failing smart_move must not be retried every tick
	}
	state.last_target_at = Date.now();
}

function in_boundary([x1, y1, x2, y2], pad = 150) {
	return character.x > x1 - pad && character.x < x2 + pad && character.y > y1 - pad && character.y < y2 + pad;
}

function patrol() {
	if (is_moving(character) || walking()) return;
	if (distance(character, state.waypoints[state.wp]) < 30) state.wp = (state.wp + 1) % state.waypoints.length;
	const next = state.waypoints[state.wp];
	if (can_move_to(next.x, next.y)) move_to(next.x, next.y, 500);
	else travel({ map: state.pack.map, x: next.x, y: next.y });
}

// One stand-off distance used by both kite and approach, so they converge instead of oscillating.
function standoff(t) {
	const keep = (G.monsters[t.mtype]?.range || t.range || 0) + CFG.kite_margin; // their reach + margin
	const reach = character.range * 0.9;
	const can_kite = RANGED && keep < reach - 10 && character.speed >= (t.speed || 0);
	return { keep, reach, can_kite, want: can_kite ? (keep + reach) / 2 : character.range * 0.8 };
}
function point_at(t, dist, ang_off = 0) {
	const ang = Math.atan2(character.y - t.y, character.x - t.x) + ang_off;
	return { x: t.x + Math.cos(ang) * dist, y: t.y + Math.sin(ang) * dist };
}
function kite(t) {
	const so = standoff(t);
	if (!so.can_kite || t.target !== character.name) return false;
	if (distance(character, t) >= so.keep) return false;
	for (const off of [0, 0.52, -0.52, 1.05, -1.05, 1.57, -1.57]) {
		const p = point_at(t, so.want, off);
		if (can_move_to(p.x, p.y)) { move_to(p.x, p.y, 250); return true; }
	}
	return false;
}
function approach(t) {
	const so = standoff(t);
	const d = distance(character, t);
	if (d <= so.reach) return; // in range: stay put (kite handles too-close)
	const p = point_at(t, so.want);
	if (can_move_to(p.x, p.y)) move_to(p.x, p.y, 400);
	else move_to(t.x, t.y, 400); // blocked line: walk at it, can_move collision will stop us
}

// ---------- Class skills ----------
function can_use(skill) {
	const s = G.skills[skill];
	return s && character.level >= (s.level || 0) && !is_on_cooldown(skill) && character.mp >= (s.mp || 0);
}
function class_skills(t) {
	switch (character.ctype) {
		case "ranger":
			if (t.hp > character.attack * 3 && !t.s?.marked && can_use("huntersmark")) fire("huntersmark", t);
			else if (can_use("supershot")) fire("supershot", t);
			break;
		case "priest":
			if (character.hp < character.max_hp * 0.6) return fire("heal", character), true; // shares attack cooldown
			if (!t.s?.cursed && can_use("curse")) fire("curse", t);
			break;
		case "warrior":
			if (!character.s.warcry && can_use("warcry")) fire("warcry");
			break;
		case "mage":
			if (character.mp < character.max_mp * 0.5 && can_use("energize")) fire("energize", character);
			break;
		case "rogue":
			if (!character.s.rspeed && can_use("rspeed")) fire("rspeed", character);
			break;
	}
	return false;
}

// ---------- Sustain / loot / restock ----------
function sustain() {
	if (character.rip) return;
	const hp = character.hp / character.max_hp, mp = character.mp / character.max_mp;
	if (hp < 0.55 && quantity(CFG.hp_pot)) return fire("use_hp");
	if (mp < 0.35 && quantity(CFG.mp_pot)) return fire("use_mp");
	if (mp < 0.9 && hp > 0.8) return fire("regen_mp");
	if (hp < 0.9) return fire("regen_hp");
}

const chest_tries = {}; // id -> { n, t }
function loot_chests() {
	// Server (open_chest): no distance requirement, but goldm drops to 1 when the opener is >400px away or the
	// chest is >8 min old. Open near chests now; a far one only after loot_wait_ms (we usually walk past it).
	if (character.rip || character.esize === 0) return;
	const now = Date.now();
	let best = null, best_d = Infinity;
	for (const id in parent.chests || {}) {
		const tr = (chest_tries[id] = chest_tries[id] || { n: 0, t: 0, seen: now });
		if (tr.n >= 3 || now - tr.t < 3000) continue; // 3 attempts max, 3s apart
		const d = distance(character, parent.chests[id]);
		if (d > CFG.loot_range && now - tr.seen < CFG.loot_wait_ms) continue;
		if (d < best_d) (best = id), (best_d = d);
	}
	if (!best || !can_spend(1, 40)) return;
	const tr = chest_tries[best];
	tr.n++; tr.t = now;
	parent.open_chest(best); // one chest per call; runner's loot(id) routes via parent.parent in CODE mode
}
setInterval(() => { for (const id in chest_tries) if (!(id in (parent.chests || {}))) delete chest_tries[id]; }, 60_000);

// ---------- Selling ----------
const GEAR = new Set(["weapon", "shield", "helmet", "chest", "pants", "gloves", "shoes", "cape", "ring", "earring", "amulet", "belt", "orb", "source", "quiver", "misc_offhand"]);
function is_junk(item) {
	if (!item || item.l || item.b || CFG.keep.includes(item.name) || state.protect.has(item.name)) return false;
	if (CFG.sell.includes(item.name)) return true;
	const def = G.items[item.name];
	if (!CFG.auto_sell_gear || !def || !GEAR.has(def.type)) return false;
	return !(item.level > 0) && !item.p && item_grade(item) === 0 && item_value(item) <= CFG.sell_max_value;
}
function has_computer() {
	return character.items.some((i) => i && (i.name === "computer" || i.name === "supercomputer"));
}
function nearest_shop() {
	// shops = NPCs with an item list (same rule the game uses to build map.merchants)
	const search = (mapname) => {
		let best = null, bd = Infinity;
		for (const npc of G.maps[mapname]?.npcs || []) {
			if (!npc.position || !G.npcs[npc.id]?.items) continue;
			const d = mapname === character.map ? Math.hypot(npc.position[0] - character.x, npc.position[1] - character.y) : 0;
			if (d < bd) (bd = d), (best = { map: mapname, x: npc.position[0], y: npc.position[1] + 30 });
		}
		return best;
	};
	return search(character.map) || search("main");
}
const sleep_ms = (ms) => new Promise((r) => setTimeout(r, ms));
// The client's deferreds (common_functions.js push_deferred) never time out: a lost or unanswered response
// (disconnect, a server path that returns without replying) would hang an errand until errand_timeout_ms.
// The real call may still land later; callers re-resolve slots by name/level so a late result is harmless.
function T(p, ms = 10_000) {
	let timer;
	const timeout = new Promise((_, rej) => (timer = setTimeout(() => rej({ reason: "timeout" }), ms)));
	return Promise.race([Promise.resolve(p), timeout]).finally(() => clearTimeout(timer));
}
// Bag space: sell junk first; if still short, deposit storables in the bank (v8 sold only junk, so a bag full
// of materials stalled looting forever). With a computer, junk is sold as soon as a few pieces pile up.
const BAG_TYPES = new Set(["pot", "elixir", "uscroll", "cscroll", "pscroll", "offering", "stand", "tool", "misc", "throw",
	"booster", "skill_item", "bank_key", "spawner", "placeholder", "computer"]); // stays in the bag
function is_storable(item) {
	if (!item || item.l || item.b || CFG.keep.includes(item.name) || state.protect.has(item.name)) return false;
	if (item.name === CFG.hp_pot || item.name === CFG.mp_pot) return false;
	const def = G.items[item.name];
	return !!def && !BAG_TYPES.has(def.type);
}
const slots_where = (f) => character.items.map((it, i) => (f(it) ? i : -1)).filter((i) => i >= 0);
let bags_warned = 0;
function free_bags() {
	if (errand_busy() || walking() || character.rip) return;
	const junk = slots_where(is_junk);
	const full = character.esize <= CFG.sell_when_free;
	const tidy = has_computer() && junk.length >= CFG.sell_batch; // no walk needed: sell early
	if (!full && !tidy) return;
	const store = CFG.bank && full && character.esize + junk.length <= CFG.sell_when_free ? slots_where(is_storable) : [];
	if (!junk.length && !store.length) {
		if (full && Date.now() - bags_warned > 300_000) (bags_warned = Date.now()), game_log("Bags full and nothing safe to sell or bank; clear them by hand", "#E25C5C");
		return;
	}
	errand("bags", async () => {
		if (junk.length) {
			if (!has_computer()) {
				const shop = nearest_shop();
				if (shop) await go(shop);
			}
			for (const i of junk) {
				const it = character.items[i];
				if (!is_junk(it)) continue; // slots can shift
				await wait_budget(1, 40);
				await T(sell(i, it.q || 1)).catch((e) => game_log("sell: " + (e.reason || e)));
				await sleep_ms(150);
			}
		}
		if (!store.length || character.esize > CFG.sell_when_free + CFG.bank_extra) return;
		await go({ map: "bank" });
		if (!(await until(() => character.bank && Object.keys(character.bank).some((k) => k.startsWith("items")), 10_000)))
			throw { reason: "bank_not_loaded" };
		let n = 0;
		for (let i = character.items.length - 1; i >= 0; i--) { // from the end, so earlier indices don't shift under us
			if (!is_storable(character.items[i])) continue;
			await wait_budget(1, 40);
			const r = await T(bank_store(i)).catch((e) => e);
			if (r?.reason === "bank_full") { game_log("Bank full", "#E25C5C"); break; }
			if (!r?.failed) n++;
			await sleep_ms(150);
		}
		game_log(`Banked ${n} stack${n === 1 ? "" : "s"}; ${character.esize} slots free`, "#58D685");
	});
}

// ---------- Gear progression ----------
// Materials for any quest recipe (Cole etc.) and their outputs (wcap/wgloves/wbreeches/... are +0 normal-grade
// gear the junk seller would otherwise take). Built at load so they're safe before the first guide read
// (v8 only filled state.protect inside gear_step, so an early full-bag sale could sell them).
const QUEST_PROTECT = new Set();
for (const id in G.craft || {}) if (G.craft[id].quest) {
	for (const i of G.craft[id].items || []) QUEST_PROTECT.add(i[1]);
	QUEST_PROTECT.add(G.craft[id].output?.name || id);
}
state.protect = new Set(QUEST_PROTECT);
function collect_plan_names(node, out) {
	if (!node) return;
	if (node.name) out.add(node.name);
	for (const a of node.alternatives || []) {
		if (a.name) out.add(a.name);
		if (a.scroll) out.add(a.scroll);
		for (const i of a.inputs || []) collect_plan_names(i, out);
	}
}
function find_slot(name, level) {
	return character.items.findIndex((i) => i && i.name === name && (i.level || 0) === (level || 0) && !i.l);
}
function find_slots(name, level, n) {
	const out = [];
	character.items.forEach((i, k) => { if (out.length < n && i && i.name === name && (i.level || 0) === level && !i.l) out.push(k); });
	return out.length === n ? out : null;
}
async function wait_budget(cost, reserve) {
	while (!can_spend(cost, reserve)) await sleep_ms(250);
}
function shop_for(name) {
	for (const id in G.npcs) if (!G.npcs[id].ignore && (G.npcs[id].items || []).includes(name) && find_npc(id)) return id;
	return null;
}
async function buy_from_npc(name, qty, npc) {
	const cost = (G.items[name].g || 0) * qty;
	if (G.items[name].cash || character.gold - cost < CFG.gold_reserve) throw { reason: "gold_reserve" };
	npc = npc || shop_for(name);
	if (!has_computer()) {
		const loc = npc && find_npc(npc);
		if (!loc) throw { reason: "no_shop", name };
		await go({ map: loc.map, x: loc.x, y: loc.y + 30 });
	}
	await wait_budget(1, 30);
	return T(buy(name, qty));
}
async function ensure_scroll(scroll) {
	let k = find_slot(scroll, 0);
	if (k >= 0) return k;
	await buy_from_npc(scroll, 1);
	await sleep_ms(400);
	k = find_slot(scroll, 0);
	if (k < 0) throw { reason: "scroll_missing", scroll };
	return k;
}
async function run_upgrade(a) {
	// a: { name, level (target), scroll } — target level is a.level, so input is a.level-1
	const from = a.level - 1;
	if (!has_computer()) await go("upgrade");
	await ensure_scroll(a.scroll);
	if (!has_computer()) await go("upgrade"); // buying the scroll may have walked us away
	const k = find_slot(a.name, from);
	if (k < 0) throw { reason: "input_missing" };
	await wait_budget(1, 30);
	const preview = await T(upgrade(k, find_slot(a.scroll, 0), null, true));
	if (!preview || !(preview.chance >= CFG.min_upgrade_chance))
		throw { reason: "low_chance", chance: preview && preview.chance };
	await wait_budget(1, 30);
	const r = await T(upgrade(k, find_slot(a.scroll, 0)));
	game_log(`upgrade ${a.name} +${from}→+${a.level} (${(preview.chance * 100).toFixed(1)}%): ${r && r.success ? "OK" : "FAILED"}`, r && r.success ? "#58D685" : "#E25C5C");
	return r;
}
async function run_compound(a) {
	const from = a.level - 1;
	if (!has_computer()) await go("compound");
	await ensure_scroll(a.scroll);
	if (!has_computer()) await go("compound");
	const ks = find_slots(a.name, from, 3);
	if (!ks) throw { reason: "input_missing" };
	await wait_budget(1, 30);
	const preview = await T(compound(ks[0], ks[1], ks[2], find_slot(a.scroll, 0), null, true));
	if (!preview || !(preview.chance >= CFG.min_compound_chance))
		throw { reason: "low_chance", chance: preview && preview.chance };
	await wait_budget(1, 30);
	const r = await T(compound(ks[0], ks[1], ks[2], find_slot(a.scroll, 0)));
	game_log(`compound ${a.name} +${from}→+${a.level} (${(preview.chance * 100).toFixed(1)}%): ${r && r.success ? "OK" : "FAILED"}`, r && r.success ? "#58D685" : "#E25C5C");
	return r;
}
async function run_craft(a) {
	// a: { recipe, npc, fee, inputs, ready } — only act once the advisor says every input is owned
	if (!a.ready) throw { reason: "inputs_not_ready" };
	const recipe = G.craft[a.recipe];
	if (!recipe) throw { reason: "recipe" };
	if ((recipe.cost || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" };
	if (character.esize < 1) throw { reason: "no_space" };
	// Server (craft): quest recipes must be made within sell_dist of their quest NPC (e.g. Cole), others at the
	// craftsman; a computer bypasses both
	const npc = a.npc || recipe.quest || "craftsman";
	if (!has_computer()) {
		const loc = find_npc(npc);
		if (!loc) throw { reason: "no_npc", npc };
		await go({ map: loc.map, x: loc.x, y: loc.y + 30 });
	}
	await wait_budget(1, 30);
	const r = await T(auto_craft(a.recipe));
	game_log(`craft ${a.recipe} at ${G.npcs[npc]?.name || npc}: ${r && !r.failed ? "OK" : "FAILED"}`, r && !r.failed ? "#58D685" : "#E25C5C");
	return r;
}
function hunt_directive() {
	const h = character.s.monsterhunt;
	if (!CFG.auto_monster_hunt || !h || !(h.c > 0) || !fight_profile(h.id)) return null;
	const best = resolve_area(h.id);
	return best && { monster: h.id, ...best, reason: `monster hunt ${h.c} left`, guide_safe: false };
}

// ---------- Quest material farming ----------
// Drop tables: G.drops.monsters[mtype] = [[rate, item, ...], ...] (design/drops.py). Fallback for Cole's
// materials if the client's G has no drops.
const DROP_FALLBACK = { beewings: [["bee", 0.01]], gslime: [["goo", 0.001]], spores: [["minimush", 1 / 60]],
	crabclaw: [["crab", 0.001]], frogt: [["squigtoad", 1 / 400]], ascale: [["armadillo", 0.0008]], feather0: [["bigbird", 0.05]],
	dstones: [["stoneworm", 1 / 300]], pleather: [["porcupine", 0.001]], bfur: [["arcticbee", 0.001]], cscale: [["croc", 0.0009]] };
function drop_sources(item) {
	const out = [], mons = G.drops?.monsters;
	if (mons) for (const mt in mons) for (const d of mons[mt] || []) if (Array.isArray(d) && d[1] === item && typeof d[0] === "number") out.push([mt, d[0]]);
	return out.length ? out : DROP_FALLBACK[item] || [];
}
// Best place to farm an item: max over safe monsters and their spawn areas of drop_rate × kills/s
function best_source(item) {
	let best = null;
	for (const [mt, rate] of drop_sources(item)) {
		const f = fight_profile(mt);
		if (!f) continue;
		for (const name in G.maps) {
			const map = G.maps[name];
			if (map.ignore || map.instance || map.pvp) continue;
			for (const pack of map.monsters || []) {
				if (pack.type !== mt) continue;
				for (const area of pack_areas(name, pack)) {
					const am = G.maps[area.map];
					if (!am || am.ignore || am.instance || am.pvp) continue;
					const m = state.measured[pack_key(area)];
					const kps = m !== undefined ? m / Math.max(1, f.xp)
						: Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack)) * state.realism;
					const ips = rate * kps;
					if (!best || ips > best.ips) best = { monster: mt, ...area, ips };
				}
			}
		}
	}
	return best;
}
const held = (name, level) => character.items.reduce((n, i) => n + (i && i.name === name && (i.level || 0) === (level || 0) ? i.q || 1 : 0), 0);
// First wanted quest recipe that is short only on farmable drops, and the quickest of its missing materials.
// Skips recipes that would take longer than quest_farm_max_h at our estimated rate.
function quest_directive() {
	if (!CFG.quest_farm || !CFG.quest_crafts) return null;
	for (const id of quest_recipes()) {
		const r = G.craft[id];
		if (owned(r.output?.name || id) >= CFG.quest_craft_max || (state.gear_skip["qc:" + id] || 0) > Date.now()) continue;
		if ((r.cost || 0) > character.gold - CFG.gold_reserve) continue;
		const missing = r.items.filter(([q, n, l]) => held(n, l) < q);
		if (!missing.length) continue; // craftable now; quest_crafts() handles it
		if (missing.some(([, n, l]) => l || GEAR.has(G.items[n]?.type))) continue; // can't farm an upgraded item
		let total_s = 0, pickm = null;
		for (const [q, n, l] of missing) {
			const src = best_source(n);
			if (!src || !(src.ips > 0)) { total_s = Infinity; break; }
			const secs = (q - held(n, l)) / src.ips;
			total_s += secs;
			if (!pickm || secs < pickm.secs) pickm = { ...src, secs, item: n, have: held(n, l), need: q };
		}
		if (!pickm || total_s > CFG.quest_farm_max_h * 3600) continue;
		return { monster: pickm.monster, map: pickm.map, boundary: pickm.boundary, count: pickm.count, guide_safe: false,
			reason: `${id}: ${pickm.item} ${pickm.have}/${pickm.need}, ~${Math.ceil(total_s / 60)} min` };
	}
	return null;
}

// Directive priority: guide farm row > quest materials > monster hunt (CFG.hunt_first swaps the last two).
// Refreshed every guide visit whether or not the guide exists (v8 only set hunt directives inside the guide step,
// so without get_progression the hunt target was never farmed).
function refresh_directive() {
	const now = Date.now();
	const g = state.guide_farm && state.guide_farm.until > now ? state.guide_farm : null;
	const order = CFG.hunt_first ? [hunt_directive, quest_directive] : [quest_directive, hunt_directive];
	let d = g;
	for (const f of order) if (!d) d = f();
	if (d) {
		const changed = !state.directive || state.directive.monster !== d.monster || state.directive.map !== d.map;
		state.directive = { ...d, until: now + CFG.gear_interval_ms * 4 };
		if (changed) state.last_pick = 0;
	} else if (state.directive) {
		state.directive = null;
		state.last_pick = 0;
	}
}
async function go_npc(npc) {
	if (has_computer() && npc !== "monsterhunter") return; // computer covers shop/upgrade/craft distance checks
	const loc = find_npc(npc);
	if (!loc) throw { reason: "no_npc", npc };
	if (character.map === loc.map && Math.hypot(character.x - loc.x, character.y - loc.y) < 150) return;
	await go({ map: loc.map, x: loc.x, y: loc.y + 30 });
}
async function run_hunt() {
	// Daisy (server "monsterhunt" handler): one call either turns in a finished hunt ({completed}) or starts a
	// new one ({started}); never both. Within B.sell_dist of her, which a computer does not cover.
	await go_npc("monsterhunter");
	let r;
	for (let i = 0; i < 2; i++) {
		await wait_budget(1, 30);
		r = await T(interact("monsterhunt"));
		if (r?.completed) { game_log("Monster hunt turned in (+monstertoken)", "#67A464"); await sleep_ms(300); continue; } // start the next one now, not next visit
		break;
	}
	const h = character.s.monsterhunt;
	if (r?.started) game_log(`Monster hunt: ${h?.c ?? "?"}x ${h?.id ?? "?"}`, "#67A464");
	else if (!r?.completed) game_log("Monster hunt: " + JSON.stringify(r), "#67A464");
	return r;
}
async function run_stat(a) {
	// a: { slot, num, name, scroll, quantity } — worn items must be unequipped to be scrolled, then re-equipped
	// Every precondition is checked before the item is unequipped, and the finally block always tries to put
	// it back, so a failed step can't leave the slot empty (v8 could, on input_missing or a failed purchase).
	if (character.esize < 1) throw { reason: "no_space" };
	const stat = G.items[a.scroll]?.stat;
	const want_q = a.quantity || 1;
	const raw = (i) => i && i.name === a.name && !i.l && i.stat_type !== stat;
	const worn = !!a.slot && raw(character.slots[a.slot]);
	if (!worn && character.items.findIndex(raw) < 0) throw { reason: "input_missing" };
	const need = want_q - quantity(a.scroll);
	if (need > 0) {
		if ((G.items[a.scroll].g || 0) * need > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" };
		await buy_from_npc(a.scroll, need);
		if (!(await until(() => quantity(a.scroll) >= want_q, 3000))) throw { reason: "scroll_missing" };
	}
	if (!has_computer()) await go("upgrade");
	let unequipped = false;
	try {
		if (worn) {
			await wait_budget(1, 30);
			await T(unequip(a.slot));
			unequipped = true;
			if (!(await until(() => !character.slots[a.slot], 3000))) throw { reason: "unequip_failed" };
		}
		const k = character.items.findIndex(raw);
		const sk = find_slot(a.scroll, 0);
		if (k < 0) throw { reason: "input_missing" };
		if (sk < 0) throw { reason: "scroll_missing" };
		await wait_budget(1, 30);
		const r = await T(upgrade(k, sk)); // pscroll: 99.999% per server
		game_log(`stat ${a.scroll} → ${a.name}: ${r?.stat || r?.success ? "OK" : JSON.stringify(r)}`, "#58D685");
		return r;
	} finally {
		if (unequipped && !character.slots[a.slot]) {
			await sleep_ms(300);
			// prefer the freshly scrolled copy; fall back to any copy (the scroll failed or the item moved)
			let back = character.items.findIndex((i) => i && i.name === a.name && i.stat_type === stat);
			if (back < 0) back = character.items.findIndex((i) => i && i.name === a.name);
			if (back >= 0) {
				await wait_budget(1, 30);
				await T(equip(back, a.slot)).catch((e) => game_log("stat re-equip: " + (e?.reason || e), "#E25C5C"));
			} else game_log(`stat: ${a.name} not in bags; ${a.slot} left empty`, "#E25C5C");
		}
	}
}
// Server (exchange): quest items (G.items[x].quest, e.g. seashells) are turned in within sell_dist of
// G.quests[quest]; everything else at Xyn (G.maps.main.exchange). A computer bypasses both.
async function go_exchange(a) {
	if (has_computer()) return;
	if (a.npc) return go_npc(a.npc);
	const quest = G.items[a.name]?.quest;
	const q = quest && G.quests?.[quest];
	if (q && q.map && Number.isFinite(q.x)) return go({ map: q.map, x: q.x, y: q.y + 30 });
	if (quest && find_npc(quest)) return go_npc(quest);
	return go_npc("exchange");
}
async function run_exchange(a) {
	if (!a.ready) throw { reason: "inputs_not_ready" };
	if (character.esize < 1) throw { reason: "no_space" };
	await go_exchange(a);
	const k = find_slot(a.name, a.level || 0);
	if (k < 0) throw { reason: "input_missing" };
	if ((character.items[k].q || 1) < (a.quantity || 1)) throw { reason: "inputs_not_ready" };
	await wait_budget(1, 30);
	const r = await T(exchange(k), 30_000); // exchange() polls until the roll finishes
	game_log(`exchange ${a.name} → ${r?.reward ? JSON.stringify(r.reward) : "?"}`, "#58D685");
	return r;
}
async function run_token(a, want) {
	if (!a.ready) throw { reason: "inputs_not_ready" };
	await go_npc(a.npc);
	await wait_budget(1, 30);
	game_log(`token ${a.token} → ${want}`, "#58D685");
	return T(exchange_buy(a.token, want));
}
async function run_dismantle(a) {
	if (!a.ready) throw { reason: "inputs_not_ready" };
	if ((a.fee || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" };
	const k = a.resources?.[0] && character.items[a.resources[0].num]?.name === a.name ? a.resources[0].num : find_slot(a.name, a.level || 0);
	if (k < 0) throw { reason: "input_missing" };
	await go_npc(a.npc || "craftsman");
	await wait_budget(1, 30);
	game_log(`dismantle ${a.name}`, "#58D685");
	return T(dismantle(k));
}
async function run_retrieve(a) {
	const t = a.target;
	// bank_packs lives on the game window; the code iframe may not have it as a global
	const packs = (typeof bank_packs !== "undefined" && bank_packs) || parent.bank_packs || {};
	if (!t || !packs[t.pack]) throw { reason: "bank_target" };
	if (character.esize < 1) throw { reason: "no_space" };
	const bank_map = packs[t.pack][0];
	if (character.map !== bank_map) await go({ map: bank_map });
	if (!(await until(() => character.bank && character.bank[t.pack], 10_000))) throw { reason: "bank_not_loaded" };
	// slot may have moved; find by name+level
	const pack = character.bank[t.pack];
	const n = pack[t.bankNum]?.name === a.name ? t.bankNum : pack.findIndex((i) => i && i.name === a.name && (i.level || 0) === (a.level || 0));
	if (n < 0) throw { reason: "not_in_bank" };
	await wait_budget(1, 30);
	game_log(`bank: retrieve ${a.name} from ${t.pack}`, "#58D685");
	return T(bank_retrieve(t.pack, n));
}
async function run_supplies(a) {
	if (a.unlock) throw { reason: "locked_potions_user_choice" }; // the guide wants you to unlock potions you locked; that's yours to decide
	return buy_from_npc(a.name, a.quantity, a.npc || "fancypots");
}
async function run_row(row) {
	const a = row.action || {};
	switch (row.kind) {
		case "equip": {
			// num can be stale; re-resolve by name+level
			const k = a.num !== undefined && character.items[a.num]?.name === a.name ? a.num : find_slot(a.name, a.level);
			if (k < 0) throw { reason: "input_missing" };
			await wait_budget(1, 30);
			game_log(`equip ${a.name} +${a.level || 0} → ${a.slot}`, "#58D685");
			return T(equip(k, a.slot));
		}
		case "buy": {
			if (a.kind === "purchase") throw { reason: "player_stand_skip" }; // buying from player stands needs trade_buy; not automated
			if ((row.cost || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" };
			game_log(`buy ${a.quantity || 1}x ${a.name} (${row.cost}g)`);
			return buy_from_npc(a.name, a.quantity || 1, a.npc);
		}
		case "upgrade":
			if ((row.cost || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" };
			return run_upgrade(a);
		case "compound":
			if ((row.cost || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" };
			return run_compound(a);
		case "craft":
			return run_craft(a);
		case "stat": return run_stat(a);
		case "exchange": return run_exchange(a);
		case "token": return run_token(a, row.target?.name || row.request?.name || a.name);
		case "dismantle": return run_dismantle(a);
		case "retrieve": return run_retrieve(a);
		case "supplies": return run_supplies(a);
		case "hunt": return run_hunt();
	}
	throw { reason: "unsupported" };
}
async function gear_step() {
	if (typeof get_progression !== "function") return;
	let prog;
	try {
		prog = get_progression({ spendLimit: Math.max(0, character.gold - CFG.gold_reserve) });
	} catch (e) { game_log("progression: " + e); return; }
	if (!prog || !prog.ready) return;

	// Protect anything the advisor plans to use (on top of the static quest set)
	const protect = new Set(QUEST_PROTECT);
	for (const plan of prog.plans || []) collect_plan_names(plan.tree, protect);
	for (const r of prog.rows || []) {
		if (r.target?.name) protect.add(r.target.name);
		if (r.action?.name) protect.add(r.action.name);
		if (r.action?.scroll) protect.add(r.action.scroll);
	}
	state.protect = protect;

	// Farm directive from the advisor
	const farm = (prog.rows || []).find((r) => {
		if (r.kind !== "farm") return false;
		const reason = (r.reason?.id || "").replace("progression.reason.", "");
		return (!CFG.follow_farm_reasons || CFG.follow_farm_reasons.includes(reason)) && (r.action?.route || r.route);
	});
	const route = farm && (farm.action?.route || farm.route);
	// a route without a usable boundary falls back to the monster's spawn data; no spawn at all → ignore the row
	const area = route && G.monsters[route.monster] && resolve_area(route.monster, route.map, route.boundary, route.count);
	if (route && !area) game_log(`guide: farm row for ${route.monster} has no usable area; ignoring it`, "gray");
	state.guide_farm = area ? { monster: route.monster, ...area, reason: "guide " + (farm.reason?.id || "").replace("progression.reason.", ""),
		guide_safe: route.safe !== false, seconds: route.seconds, until: Date.now() + CFG.gear_interval_ms * 4 } : null;
	refresh_directive();

	state.guide_rows = (prog.rows || []).map((r) => r.id);
	// Guide order is the guide's own priority order (what the HUD shows top to bottom)
	const now = Date.now();
	const row = (prog.rows || []).find((r) => CFG.gear_actions.includes(r.kind) && (state.gear_skip[r.id] || 0) < now && r.affordable !== false);
	if (!row) return false;

	try {
		await run_row(row);
		await sleep_ms(500);
	} catch (e) {
		const why = e?.reason || e?.response || String(e);
		// back off this step; chance-gated steps wait longer (grace/scroll grade may change)
		state.gear_skip[row.id] = now + (why === "low_chance" ? 1_800_000 : 300_000);
		game_log(`guide: skip ${row.id} (${why}${e?.chance !== undefined ? " " + (e.chance * 100).toFixed(1) + "%" : ""})`, "gray");
		return false;
	}
	return true;
}
// One guide visit: run actionable steps back to back while the guide keeps offering them
// ---------- Quest crafting ----------
const owned = (name) =>
	character.items.reduce((n, i) => n + (i && i.name === name ? i.q || 1 : 0), 0) +
	Object.values(character.slots || {}).filter((i) => i && i.name === name).length;
// auto_craft (client functions.js) needs ONE unlocked stack per input holding the full amount at the exact level
function has_inputs(recipe) {
	return recipe.items.every(([q, name, level]) =>
		character.items.some((i) => i && i.name === name && (i.level || 0) === (level || 0) && !i.l && (i.q || 1) >= q));
}
function quest_recipes() {
	const mode = CFG.quest_crafts;
	if (!mode) return [];
	const out = [];
	for (const id in G.craft) {
		const r = G.craft[id];
		if (!r.quest || CFG.quest_craft_skip.includes(id)) continue;
		if (Array.isArray(mode) ? !mode.includes(id) : mode === "materials" && r.items.some(([, n]) => GEAR.has(G.items[n]?.type))) continue;
		out.push(id);
	}
	if (Array.isArray(mode)) out.sort((a, b) => mode.indexOf(a) - mode.indexOf(b)); // list order = priority
	return out;
}
function next_quest_craft() {
	for (const id of quest_recipes()) {
		const r = G.craft[id];
		const output = r.output?.name || id;
		if (owned(output) >= CFG.quest_craft_max || (state.gear_skip["qc:" + id] || 0) > Date.now()) continue;
		if ((r.cost || 0) > character.gold - CFG.gold_reserve) continue;
		if (has_inputs(r)) return id;
	}
	return null;
}
// Server (craft): quest recipes need you within sell_dist (400) of their quest NPC unless you carry a computer
async function quest_crafts() {
	let n = 0, id;
	while ((id = next_quest_craft()) && n < 10) {
		if (character.esize < 1) { game_log(`craft ${id}: no free slot`, "gray"); break; }
		const r = G.craft[id];
		if (!has_computer()) {
			const loc = find_npc(r.quest);
			if (!loc) { state.gear_skip["qc:" + id] = Date.now() + 600_000; break; }
			if (character.map !== loc.map || Math.hypot(character.x - loc.x, character.y - loc.y) > 250)
				await go({ map: loc.map, x: loc.x, y: loc.y + 30 });
		}
		await wait_budget(1, 30);
		const res = await T(auto_craft(id)).catch((e) => e);
		const ok = res && !res.failed && !res.reason;
		game_log(`craft ${id} at ${G.npcs[r.quest]?.name || r.quest}: ${ok ? "OK" : "FAILED " + (res?.reason || res?.response || "")}`, ok ? "#58D685" : "#E25C5C");
		if (!ok) { state.gear_skip["qc:" + id] = Date.now() + 300_000; break; } // don't walk back every 15s for a failing recipe
		n++;
		await sleep_ms(400);
		await equip_if_empty(r.output?.name || id);
	}
	return n;
}
// Puts a freshly crafted piece on only if its slot is empty (never replaces anything you or the guide chose)
const SLOT_FOR = { helmet: ["helmet"], chest: ["chest"], pants: ["pants"], gloves: ["gloves"], shoes: ["shoes"],
	cape: ["cape"], belt: ["belt"], amulet: ["amulet"], orb: ["orb"], ring: ["ring1", "ring2"], earring: ["earring1", "earring2"],
	quiver: ["offhand"], shield: ["offhand"], source: ["offhand"], misc_offhand: ["offhand"] };
async function equip_if_empty(name) {
	const def = G.items[name];
	const cls = def?.class;
	if (!def || (cls && !cls.includes(character.ctype))) return; // class-restricted (e.g. quiver: ranger)
	if (character.ctype === "merchant") return;
	const slot = (SLOT_FOR[def.type] || []).find((sl) => sl in (character.slots || {}) && !character.slots[sl]);
	const k = character.items.findIndex((i) => i && i.name === name);
	if (!slot || k < 0) return;
	if (slot === "offhand" && character.slots.mainhand && G.items[character.slots.mainhand.name]?.wtype &&
		(G.classes[character.ctype]?.doublehand || {})[G.items[character.slots.mainhand.name].wtype]) return; // two-hander equipped
	await wait_budget(5, 30);
	await T(equip(k, slot)).then(() => game_log(`equipped ${name} → ${slot}`, "#58D685")).catch((e) => game_log(`equip ${name}: ` + (e?.reason || e), "gray"));
}

async function guide_visit() {
	let did = 0;
	try {
		if (CFG.quest_crafts && !state.recovering) did += await quest_crafts();
		const h = character.s.monsterhunt;
		if (CFG.auto_monster_hunt && character.ctype !== "merchant" && (!h || h.c === 0) && (state.gear_skip["hunt:auto"] || 0) < Date.now()) {
			try { await run_hunt(); did++; }
			catch (e) { state.gear_skip["hunt:auto"] = Date.now() + 300_000; game_log("hunt: " + (e?.reason || e?.response || e), "gray"); }
		}
		refresh_directive(); // quest/hunt directives even with no guide (gear_step refreshes again with the guide's farm row)
		for (let i = 0; CFG.gear && i < CFG.guide_steps_per_visit; i++) {
			if (character.rip || state.recovering || character.hp < character.max_hp * 0.5) break;
			if (!(await gear_step())) break;
			did++;
		}
	} finally {
		if (did) state.pack = null; // stats/position changed: re-pick (guide farm row first) and travel back
	}
}

function restock() {
	if (quantity(CFG.hp_pot) >= CFG.pot_min && quantity(CFG.mp_pot) >= CFG.pot_min) return;
	if (errand_busy() || walking() || character.rip) return; // allowed while recovering: we're in town anyway
	errand("restock", async () => {
		if (!has_computer()) await go("potions"); // a computer buys from anywhere
		// Potions are what gold_reserve exists for, so they may dip into it. Buys what's affordable instead of
		// nothing (v8 skipped the purchase entirely when the full pot_buy stack cost more than current gold).
		for (const p of [CFG.hp_pot, CFG.mp_pot]) {
			const n = Math.min(CFG.pot_buy - quantity(p), Math.floor(character.gold / (G.items[p].g || 1)));
			if (n > 0) {
				await wait_budget(1, 30);
				await T(buy(p, n)).catch((e) => game_log(`restock ${p}: ` + (e?.reason || e)));
			}
		}
	});
}

// Low HP: teleport out (cancelling any smart_move, which would otherwise block the channel — v8 never fled
// while traveling), then hold until recover_hp/recover_mp instead of walking back at 26% HP.
// Fights back only against things already hitting us; re-channels if something follows.
function recover() {
	if (!state.recovering) {
		Object.assign(state, { recovering: true, fled: false, session: null, pack: null });
		game_log(`HP ${((character.hp / character.max_hp) * 100).toFixed(0)}%: retreating`, "#E25C5C");
	}
	const threat = get_nearest_monster({ target: character.name });
	const channeling = !!character.c.town;
	// use_town has no cooldown and fails with cant_escape while >5 monsters target us: retry at most every 1.5s
	if (!channeling && Date.now() - (state.town_at || 0) > 1500 &&
		(!state.fled || (threat && character.hp < character.max_hp * CFG.flee_hp))) {
		if (walking() || is_moving(character)) stop("smart"), stop("move");
		if (fire("use_town")) (state.fled = true), (state.town_at = Date.now());
	}
	if (!channeling && threat) {
		const t = choose_target(false);
		if (t) {
			if (get_targeted_monster() !== t) change_target(t);
			if (!walking()) kite(t);
			if (!class_skills(t) && can_attack(t)) fire("attack", t);
		}
	}
	if (character.hp >= character.max_hp * CFG.recover_hp && character.mp >= character.max_mp * CFG.recover_mp && !threat) {
		state.recovering = false;
		state.last_target_at = Date.now();
		game_log("Recovered; resuming", "#58D685");
	}
}

// ---------- Persistence ----------
// What the bot has learned survives code reloads: measured xp/s per pack, the estimate realism factor,
// per-mob danger multipliers from deaths, pack cooldowns and skipped guide/craft steps. Stored per character
// with the runner's set()/get() (localStorage "cstore_" keys, so it's per browser/machine).
const SAVE_KEY = "farmer_v9:" + character.name;
function save_state() {
	if (typeof set !== "function") return;
	set(SAVE_KEY, { v: 1, at: Date.now(), measured: state.measured, realism: state.realism, danger: state.danger,
		cooldown: state.cooldown, gear_skip: state.gear_skip });
}
function load_state() {
	const d = typeof get === "function" ? get(SAVE_KEY) : null;
	if (!d || d.v !== 1) return;
	const now = Date.now(), live = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, t]) => t > now));
	Object.assign(state.measured, d.measured || {});
	if (d.realism > 0) state.realism = d.realism;
	Object.assign(state.danger, d.danger || {});
	Object.assign(state.cooldown, live(d.cooldown));
	Object.assign(state.gear_skip, live(d.gear_skip));
	game_log(`Loaded ${Object.keys(state.measured).length} measured packs, ${Object.keys(state.danger).length} danger notes`, "gray");
}
load_state();
setInterval(save_state, 60_000);
function on_destroy() { save_state(); } // runner calls this just before the code is stopped
function forget() { state.measured = {}; state.danger = {}; state.cooldown = {}; state.gear_skip = {}; state.realism = 1; save_state(); game_log("Learned state cleared"); }

// ---------- Park / resume ----------
// park(): let the current errand finish, go to town and stand there (still shooting back if attacked).
// resume(): carry on. Callable from the code console, or bind CFG.park_key.
function park() { state.parked = true; state.park_home = false; game_log("Parking after the current errand", "#67A464"); }
function resume() { state.parked = false; state.last_pick = 0; state.last_target_at = Date.now(); game_log("Resuming", "#67A464"); }
function park_tick() {
	if (!errand_busy() && !state.park_home) {
		if (walking()) stop("smart"); // a pack trip, not an errand: drop it
		state.park_home = errand("park", async () => { await go("town"); });
	}
	const t = choose_target(false); // only things attacking us
	if (t && !character.c.town) {
		if (get_targeted_monster() !== t) change_target(t);
		if (!walking() && !errand_busy()) kite(t);
		if (!class_skills(t) && can_attack(t)) fire("attack", t);
	}
	set_message(errand_busy() ? `Parking (${state.errand})` : "Parked");
}
if (CFG.park_key && typeof map_key === "function") map_key(CFG.park_key, "snippet", "state.parked ? resume() : park()");

// ---------- Main loop ----------
let next_respawn = 0;
function tick() {
	let wait = 200;
	try {
		meter_socket();
		if (spent() > BUDGET.soft) {
			wait = 500; // over budget: send nothing this tick
		} else if (character.rip) {
			if (!state.dead_handled) {
				state.dead_handled = true;
				const p = state.pack;
				if (p) {
					state.danger[p.mtype] = (state.danger[p.mtype] || 1) * 0.6; // tighter safety for this mob from now on
					state.cooldown[pack_key(p)] = Date.now() + CFG.death_pack_cooldown_ms;
					game_log(`Died at ${p.mtype}; safety for it now x${state.danger[p.mtype].toFixed(2)}`);
				}
				state.session = null; // don't let a death window count as a measurement
				state.pack = null;
			}
			state.park_home = false;
			state.errand = null; // in-flight errands die with us; their late finally can't clear a newer lock (token)
			state.recovering = false;
			// Server rejects respawn for B.rip_time (12s) after death with {ms: remaining}; wait exactly that long
			if (Date.now() >= next_respawn && can_spend(1, 10)) {
				next_respawn = Date.now() + 5000;
				Promise.resolve(respawn()).catch((e) => { if (e?.ms > 0) next_respawn = Date.now() + e.ms + 200; });
			}
			wait = 1000;
		} else if (state.recovering || character.hp < character.max_hp * CFG.flee_hp) {
			state.dead_handled = false;
			recover();
			loot_chests();
			set_message(`Recovering ${((character.hp / character.max_hp) * 100).toFixed(0)}%`);
			wait = 250;
		} else if (state.parked) {
			state.dead_handled = false;
			park_tick();
			wait = 300;
		} else {
			state.dead_handled = false;
			free_bags();
			if (!errand_busy() && !walking() && Date.now() - state.last_gear > CFG.gear_interval_ms &&
				character.hp > character.max_hp * 0.7 && !get_nearest_monster({ target: character.name })) {
				state.last_gear = Date.now();
				errand("guide", guide_visit);
			}
			if (!state.pack || Date.now() - state.last_pick > CFG.repick_ms) pick_pack();
			const pack = state.pack;
			const in_area = !!pack && character.map === pack.map && in_boundary(pack.boundary, 250);
			const t = choose_target(in_area || !pack);
			if (t && !watch_progress(t)) {
				state.last_target_at = Date.now();
				if (get_targeted_monster() !== t) change_target(t);
				// Never steer during a smart_move. During an errand only kite (defensive): approaching could
				// walk us out of NPC range mid-errand.
				if (!walking() && !kite(t) && !errand_busy()) approach(t);
				if (!class_skills(t) && can_attack(t)) fire("attack", t);
				// next_skill.attack is unset until the first attack; v8 got NaN here → setTimeout(tick, NaN) = 0ms busy loop
				const next_atk = +(parent.next_skill?.attack || 0);
				wait = Math.min(Math.max(next_atk - Date.now(), 50), 200);
			} else if (!pack) {
				set_message("No viable pack");
				wait = 5000;
			} else if (!walking() && !errand_busy()) {
				if (!in_area) {
					if (!state.waypoints.length) state.waypoints = make_waypoints(pack.boundary), (state.wp = 0);
					const w = state.waypoints[state.wp % state.waypoints.length];
					travel({ map: pack.map, x: w.x, y: w.y });
				} else if (Date.now() - state.last_target_at > CFG.idle_giveup_ms) {
					game_log(`Idle at ${pack.mtype}; cooling down this pack`);
					state.cooldown[pack_key(pack)] = Date.now() + CFG.pack_cooldown_ms;
					pick_pack();
				} else patrol();
			}
			loot_chests();
			if (pack) {
				const s = state.session, live = s && Date.now() - s.start > 10_000 ? (s.xp / ((Date.now() - s.start) / 1000)).toFixed(0) : "–";
				set_message(`${pack.mtype} ${live}xp/s ${((character.xp / G.levels[character.level]) * 100).toFixed(1)}% | ${spent().toFixed(0)}/${BUDGET.soft}`);
			}
		}
	} catch (e) { game_log("tick: " + e); }
	setTimeout(tick, wait);
}

setInterval(() => { if (spent() <= BUDGET.soft) sustain(); }, 250);
setInterval(restock, 30_000);
tick();
