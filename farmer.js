// =====================================================================
// Adventure Land farmer — v10.5 (see VERSION; report() prints it)
//
// What it does, in priority order every tick:
//   1. Dead → respawn (waits the server's rip_time).
//   2. HP < flee_hp → teleport to town, recover to recover_hp/recover_mp, fight back only if hit.
//   3. Parked (park()) → finish the current errand, stand in town.
//   4. Town run, when something is due and nothing is attacking us — one errand, in this order:
//        Daisy (hunt turn-in/start) → Cole & other quest crafts → Progression Guide steps →
//        sell junk → potions → bank (store everything not needed in bags; pull needed items back out).
//   5. Fight at the chosen pack: guide farm row > guide quest materials > monster hunt > own quest
//      materials > best measured/estimated xp/s pack.
//
// Diagnostics: type report() or why_not("bee") in the CODE console; both open a copyable text box.
//
// Bag policy (the reason for the rewrite): every bag item is KEEP, SELL or BANK.
//   KEEP: locked items, potions/scrolls/tools/computer, CFG.keep, items the guide's current steps use
//         (rows + each plan's chosen .next path, not every alternative), inputs of open quest recipes.
//   SELL: +0 normal-grade gear with no title worth <= sell_max_value, and CFG.sell names.
//   BANK: everything else (spare amulets/belts/shoes, upgraded spares, materials nobody needs now).
//   Runs whenever free slots drop below bag_min_free (default 10), not only when the bag is full.
//
// Server facts this relies on (checked against kaansoral/adventureland):
//   - call cost: 200 per rolling 4s disconnects; move 2.5, equip 4, unequip 7; character.cc = server total.
//   - town teleport (use_town): 3s channel, cancelled by attacking/moving/equipping; fails with >5 targets.
//   - chests: gold multiplier lost beyond 400px or after 8 min. Respawn: 12s rip_time.
//   - shop/upgrade/compound/craft/exchange distance checks are bypassed by a computer; Daisy's is not.
//   - client deferreds never time out → every game call here goes through T().
//   - Progression Guide rows (live dump): upgrade action.level = INPUT level, request.level = target;
//     farm rows carry action.route {monster,map,boundary,safe}; "bees" reason = save Bee Wings for Cole.
// =====================================================================

const VERSION = "11.5";
const CFG = {
	// --- fighting
	safety: 0.35,            // max fraction of max_hp a fight may cost (kiteable mobs count 1/kite_slack)
	kite_margin: 25,
	kite_slack: 4,
	max_ttk_s: 20,           // monsters other than the pack's type: skip if a kill takes longer than this
	max_respawn: 120,        // ignore packs whose respawn (s) exceeds this
	min_count: 3,            // ignore packs smaller than this unless they "grow"
	walk_overhead: 1.5,      // seconds of walking per kill in estimates
	idle_giveup_ms: 25_000,  // no target this long while patrolling → cool the pack down
	pack_cooldown_ms: 600_000,
	death_pack_cooldown_ms: 1_800_000,
	repick_ms: 120_000,
	switch_margin: 1.15,     // change packs only if the new one scores 15% better
	measure_min_s: 90,
	force_type: null,
	flee_hp: 0.25,
	recover_hp: 0.85,
	recover_mp: 0.4,
	loot_range: 400,
	loot_wait_ms: 45_000,
	// --- potions
	hp_pot: "hpot1", mp_pot: "mpot1", pot_min: 30, pot_buy: 200,
	// --- bags
	bag_min_free: 10,        // town run (sell + bank) when free slots drop below this
	sell: [],                // item names to always sell
	auto_sell_gear: false,   // true: sell +0 normal-grade untitled gear (worth <= sell_max_value) instead of banking it
	sell_max_value: 20_000,  // never sell gear the NPC values above this
	sell_batch: 4,           // with a computer: sell as soon as this many junk items pile up
	bank: true,              // store everything else in the bank
	need_copies_upgrade: 2,  // copies of an item the guide is upgrading kept in bags (the one in work + a spare)
	need_copies_compound: 4, // copies of a compoundable item the guide is working on (3 per compound + 1)
	keep: ["computer", "supercomputer", "tracker", "elixirluck", "lostearring"],
	// --- town / guide
	gear: true,              // execute Progression Guide steps
	guide_interval_ms: 15_000,
	guide_steps_per_run: 5,
	town_min_gap_ms: 20_000, // at least this long between town runs
	walk_timeout_ms: 120_000, // a smart_move that hasn't arrived by then is cancelled (locked doors, unreachable spots)
	town_hp: 0.7,            // start a town run only above this HP fraction...
	town_hp_critical: 0.5,   // ...or this one when bags are nearly full (<= 3 free)
	errand_timeout_ms: 300_000,
	gold_reserve: 50_000,
	min_upgrade_chance: 0.80,
	min_compound_chance: 0.80,
	min_chance_rebuyable: 0.5, // items NPCs sell: failure only costs gold, accept the guide's odds down to this
	min_chance_spare: 0.6,     // you hold another copy at that level or higher (bags/worn): a failure costs a spare
	gear_actions: ["equip", "buy", "upgrade", "develop", "compound", "craft", "stat", "exchange", "token", "dismantle", "retrieve", "supplies", "hunt"],
	follow_farm_reasons: null, // null = every guide farm row; or e.g. ["material","bees","hunt_farm"]
	guide_farm_max_min: 360,   // a guide farm row naming no material: pause after this long in a row
	// --- quests (Cole = "mcollector", witch, ...)
	quest_crafts: "materials", // "materials" | "all" | [recipe ids in priority order]; guide quests always included
	quest_npcs: ["mcollector"],  // own (non-guide) quests only from these NPCs (Cole); guide quests from anyone
	quest_craft_max: 1,
	quest_craft_skip: [],
	quest_farm: true,
	quest_farm_max_h: 3,       // own quests only
	quest_farm_min_xp: 0.25,   // own quests only
	quest_stall_min: 60,
	quest_shelve_h: 2,
	guide_quest_keep_h: 24,
	auto_monster_hunt: true,
	hunt_first: false,
	park_key: null,
	// --- party (the same script runs on every member)
	party: {
		members: ["Aspernari", "Torlis"], // [] = solo
		leader: null,          // null = the lowest-level member online leads (picks packs, others assist)
		follow: 90,            // followers stay within this many px of the leader
		follow_far: 500,       // farther (or another map) → path-find to the leader
		heal_at: 0.75,         // priests heal any member below this HP fraction
		heal_bonus: 2.5,       // leader's safety allowance × this while a priest partner is near
		wait_radius: 300,      // a follower whose leader is dead solo-grinds safe monsters within this many px
		beat_ms: 2000,         // status message interval
		sync_factor: 2,        // while the partner is in town, go too at bag_min_free×this free slots / pot_min×this potions
	},
};
code_settings.show_smart_move_text = false;

const RANGED = ["ranger", "mage", "priest"].includes(character.ctype);
const GEAR = new Set(["weapon", "shield", "helmet", "chest", "pants", "gloves", "shoes", "cape", "ring", "earring", "amulet", "belt", "orb", "source", "quiver", "misc_offhand"]);
const BAG_TYPES = new Set(["pot", "elixir", "uscroll", "cscroll", "pscroll", "offering", "stand", "tool", "misc", "throw",
	"booster", "skill_item", "bank_key", "spawner", "placeholder", "computer"]);

const state = {
	pack: null, safe: {}, waypoints: [], wp: 0, last_pick: 0, last_target_at: Date.now(), best_score: 0,
	cooldown: {}, measured: {}, realism: 1, danger: {}, session: null,
	bad_ids: {}, prog: null,
	errand: null, errand_at: 0, errand_token: null, last_town: 0,
	recovering: false, fled: false, parked: false, park_home: false,
	directive: null, guide: null, guide_farm: null, last_guide: 0,
	needs: new Map(),          // item name -> copies to keep in bags (guide steps + open quests)
	gear_skip: {}, crafted: {}, bank_seen: {}, guide_ignore: {}, guide_quests: {}, qprog: null, gprog: null,
};

// =====================================================================
// Infrastructure: timing, call budget, game-call timeouts, errands
// =====================================================================
const sleep_ms = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms) => {
	const end = Date.now() + ms;
	while (!cond()) { if (Date.now() > end) return false; await sleep_ms(200); }
	return true;
};
function T(p, ms = 10_000) {
	let timer;
	const timeout = new Promise((_, rej) => (timer = setTimeout(() => rej({ reason: "timeout" }), ms)));
	return Promise.race([Promise.resolve(p), timeout]).finally(() => clearTimeout(timer));
}
const why = (e) => e?.reason || e?.response || (typeof e === "string" ? e : JSON.stringify(e));

const BUDGET = { window_ms: 4000, soft: 110 };
const EMIT_COST = { move: 2.5, equip: 5, unequip: 8, equip_batch: 6 };
const sent = [];
function meter_socket() {
	const s = parent.socket;
	if (!s || s.__xp_metered) return;
	const orig = s.emit;
	s.emit = function (ev, ...args) { sent.push([Date.now(), EMIT_COST[ev] || 1]); return orig.call(this, ev, ...args); };
	s.__xp_metered = true;
}
function spent() {
	const cut = Date.now() - BUDGET.window_ms;
	while (sent.length && sent[0][0] < cut) sent.shift();
	let c = 0;
	for (const x of sent) c += x[1];
	return Math.max(c, +character.cc || 0);
}
const can_spend = (cost, reserve) => spent() + cost <= BUDGET.soft - reserve;
async function wait_budget(cost, reserve) { while (!can_spend(cost, reserve)) await sleep_ms(250); }

// Every walk has a deadline: the game's pathfinder retries a locked door ("The door is locked!" → "Lost the path"
// → "Path found!") forever, which hung v10.5's bank errand in front of the locked bank_b door.
let smart_depth = 0;
async function go(dest, ms = CFG.walk_timeout_ms) {
	smart_depth++;
	let timer;
	try {
		return await Promise.race([smart_move(dest), new Promise((_, rej) => (timer = setTimeout(() => {
			try { stop("smart"); } catch (e) {}
			rej({ reason: "walk_timeout", dest: typeof dest === "string" ? dest : dest.map });
		}, ms)))]);
	} finally { clearTimeout(timer); smart_depth--; }
}
const walking = () => smart_depth > 0;
const errand_busy = () => !!state.errand && Date.now() - state.errand_at < CFG.errand_timeout_ms;
function errand(name, fn) {
	if (errand_busy()) return false;
	const token = {};
	Object.assign(state, { errand: name, errand_at: Date.now(), errand_token: token });
	Promise.resolve().then(fn).catch((e) => game_log(`${name}: ${why(e)}`))
		.finally(() => {
			if (state.errand_token !== token) return;
			state.errand = null;
			state.last_target_at = Date.now();
		});
	return true;
}
const skipped = (key) => (state.gear_skip[key] || 0) > Date.now();
const skip_why = {}; // key -> last reason (shown by report())
const skip = (key, ms, reason) => { if (reason) skip_why[key] = reason; return (state.gear_skip[key] = Date.now() + ms); };

// =====================================================================
// Monster data & the fight model
// =====================================================================
const pack_key = (p) => `${p.map}:${p.boundary.join(",")}`;
function valid_boundary(b) {
	return Array.isArray(b) && b.length >= 4 && b.slice(0, 4).every(Number.isFinite) && b[2] > b[0] && b[3] > b[1];
}
function in_boundary([x1, y1, x2, y2], pad = 150) {
	return character.x > x1 - pad && character.x < x2 + pad && character.y > y1 - pad && character.y < y2 + pad;
}
const map_ok = (name) => { const m = G.maps[name]; return !!m && !m.ignore && !m.instance && !m.pvp; };

// Normal respawning XP mobs only: no dummies, pets, bosses, events, immune/passive specials
function farmable_type(mtype) {
	const m = G.monsters[mtype];
	return !!m && m.xp > 0 && m.hp > 0 && m.attack > 0 && m.respawn > 0 &&
		!(m.special || m.cooperative || m.global || m.unlist || m.immune || m.passive || m.peaceful || m.stationary || m.cute);
}
function farmable_entity(e) {
	return e && e.type === "monster" && e.visible && !e.dead && !e.npc && !e.immune && !e.peaceful &&
		farmable_type(e.mtype) && !((state.bad_ids[e.id] || 0) > Date.now());
}

// Server complete_attack(): hit = attack · damage_multiplier(defense − pierce); 1hp targets take 1;
// evasion (physical) / avoidance miss; reflection bounces magic; dreturn hits melee; lifesteal/self_healing heal.
function fight_math(m) {
	const dm = (d) => (typeof damage_multiplier === "function" ? damage_multiplier(d) : Math.max(0.05, 1 - d / 1000));
	const our_magic = (character.damage_type || G.classes[character.ctype].damage_type) === "magical";
	const pct = (v) => Math.min(1, Math.max(0, (v || 0) / 100));
	let hit = character.attack * dm(((our_magic ? m.resistance : m.armor) || 0) - ((our_magic ? character.rpiercing : character.apiercing) || 0));
	hit *= 1 + (m.incdmgamp || 0) / 100;
	if (m["1hp"]) hit = 1;
	const land = (1 - (our_magic ? 0 : pct(m.evasion))) * (1 - pct(m.avoidance));
	const theirs_magic = m.damage_type === "magical";
	const their_hit = (m.attack || 0) * dm(((theirs_magic ? character.resistance : character.armor) || 0) - ((theirs_magic ? m.rpiercing : m.apiercing) || 0));
	const their_dps = their_hit * (m.frequency || 1);
	const heal_dps = their_dps * (m.lifesteal || 0) / 100 +
		(m.abilities?.self_healing ? m.abilities.self_healing.heal / Math.max(1, m.abilities.self_healing.cooldown / 1000) : 0);
	let our_dps = hit * land * character.frequency - heal_dps;
	const P = partner_near();
	if (P && P.attack && P.frequency) { // the partner shoots the same target
		const pm = P.damage_type === "magical";
		our_dps += P.attack * dm(((pm ? m.resistance : m.armor) || 0) - ((pm ? P.rpiercing : P.apiercing) || 0)) * (pm ? 1 : 1 - pct(m.evasion)) * P.frequency;
	}
	if (!(our_dps > 0)) return null;
	const ttk = (m.hp || m.max_hp) / our_dps;
	const self_dps = (our_magic ? character.attack * character.frequency * pct(m.reflection) : 0) +
		(!our_magic && character.range < 75 ? character.attack * character.frequency * (m.dreturn || 0) / 100 : 0);
	const chase = m.charge || m.speed || 0; // targeted monsters move at charge speed
	const kiteable = RANGED && character.range > (m.range || 0) + CFG.kite_margin && character.speed > chase;
	return { ttk, xp: m.xp, their_dps, self_dps, kiteable };
}
const fight_risk = (f) => (f.their_dps / (f.kiteable ? CFG.kite_slack : 1) + f.self_dps) * f.ttk;
const safe_enough = (f, mtype) => !!f && fight_risk(f) <= character.max_hp * CFG.safety * (state.danger[mtype] || 1) *
	(partner_near()?.ctype === "priest" ? CFG.party.heal_bonus : 1);
function fight_profile(mtype) {
	if (!farmable_type(mtype)) return null;
	const f = fight_math(G.monsters[mtype]);
	return safe_enough(f, mtype) ? { ttk: f.ttk, xp: f.xp } : null;
}
// Live-stat check per entity (levelled-up elites)
const live_cache = new Map();
function entity_profile(e) {
	const key = `${e.level || 1}:${e.max_hp}:${e.attack}`;
	const c = live_cache.get(e.id);
	if (c && c.key === key) return c.ok ? c : null;
	const def = G.monsters[e.mtype];
	const live = {};
	for (const k of ["hp", "max_hp", "attack", "frequency", "armor", "resistance", "speed", "xp", "1hp", "level"]) if (e[k] !== undefined) live[k] = e[k];
	const f = def && fight_math({ ...def, ...live, hp: e.max_hp || def.hp, charge: Math.max(def.charge || 0, e.speed || 0) });
	const ok = safe_enough(f, e.mtype);
	const out = { key, ok, ttk: f ? f.ttk : Infinity, xp: e.xp || def?.xp || 0 };
	live_cache.set(e.id, out);
	if (live_cache.size > 500) live_cache.delete(live_cache.keys().next().value);
	return ok ? out : null;
}
function live_ok(e) {
	const f = state.safe[e.mtype];
	if (!f) return null;
	if (f.trusted && !((e.level || 1) > 1)) return f;
	const lf = entity_profile(e);
	return lf ? { ttk: lf.ttk, xp: lf.xp } : null;
}

function expected_respawn(mtype, pack) {
	if (pack.grow) return 0.1;
	const r = G.monsters[mtype].respawn || 1;
	return r > 200 ? r * 0.96 : r + 0.45;
}
function pack_areas(name, pack) {
	let areas = [];
	if (pack.boundary) areas = [{ map: name, boundary: pack.boundary, count: pack.count }];
	else if (pack.boundaries) areas = pack.boundaries.map((b) => ({ map: b[0], boundary: b.slice(1, 5), count: pack.count / pack.boundaries.length }));
	return areas.filter((a) => valid_boundary(a.boundary) && map_ok(a.map));
}
function each_area(fn) {
	for (const name in G.maps) {
		if (!map_ok(name)) continue;
		for (const pack of G.maps[name].monsters || []) for (const area of pack_areas(name, pack)) fn(pack, area);
	}
}
function resolve_area(monster, map, boundary, count) {
	if (map && G.maps[map] && valid_boundary(boundary)) return { map, boundary: boundary.slice(0, 4), count: count || 1 };
	let best = null;
	each_area((pack, area) => {
		if (pack.type !== monster) return;
		const rank = (area.map === map ? 1e6 : 0) + area.count;
		if (!best || rank > best.rank) best = { ...area, rank };
	});
	return best && { map: best.map, boundary: best.boundary, count: best.count };
}
function score_area(t, pack, area) {
	const f = state.safe[t];
	const est = f.xp * Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(t, pack));
	return { est, score: state.measured[pack_key(area)] ?? est * state.realism };
}

// =====================================================================
// Where to fight
// =====================================================================
function set_pack(p, label) {
	if (!state.pack || !p || pack_key(state.pack) !== pack_key(p)) {
		if (p) game_log(label, "#67A464");
		state.waypoints = p ? make_waypoints(p.boundary) : [];
		state.wp = 0;
		end_session();
		state.last_target_at = Date.now();
	}
	state.pack = p;
}
function pick_pack() {
	state.safe = {};
	for (const t in G.monsters) { const f = fight_profile(t); if (f) state.safe[t] = f; }
	const now = Date.now();
	let best = null;
	const seen = new Set();
	each_area((pack, area) => {
		const t = pack.type;
		if ((CFG.force_type && t !== CFG.force_type) || !state.safe[t]) return;
		if (!pack.grow && (expected_respawn(t, pack) > CFG.max_respawn || pack.count < CFG.min_count)) return;
		const key = pack_key(area);
		if (seen.has(key) || (state.cooldown[key] || 0) > now) return;
		seen.add(key);
		const p = { mtype: t, ...area, ...score_area(t, pack, area) };
		if (!best || p.score > best.score) best = p;
	});
	state.last_pick = now;
	state.best_score = best ? best.score : 0;

	const d = state.directive;
	if (d && d.until > now && farmable_type(d.monster) && !state.safe[d.monster] && d.guide_safe)
		state.safe[d.monster] = { ttk: d.seconds || 5, xp: G.monsters[d.monster].xp, trusted: true };
	if (d && d.until > now && state.safe[d.monster]) {
		const area = { map: d.map, boundary: d.boundary, count: d.count };
		if (!((state.cooldown[pack_key(area)] || 0) > now)) {
			const pack = (G.maps[d.map]?.monsters || []).find((pk) => pk.type === d.monster) || { count: d.count };
			return set_pack({ mtype: d.monster, ...area, ...score_area(d.monster, pack, area), directive: d.reason }, `→ ${d.monster} @ ${d.map} (${d.reason})`);
		}
	}
	const cur = state.pack;
	if (cur && state.safe[cur.mtype] && !((state.cooldown[pack_key(cur)] || 0) > now) && best && pack_key(best) !== pack_key(cur)) {
		if (best.score < (state.measured[pack_key(cur)] ?? cur.score) * CFG.switch_margin) best = cur;
	}
	set_pack(best, best && `→ ${best.mtype} x${Math.round(best.count)} @ ${best.map} (~${best.score.toFixed(0)} xp/s${state.measured[pack_key(best)] ? " measured" : " est"})`);
}
function make_waypoints([x1, y1, x2, y2]) {
	const pts = [];
	for (let r = 0; r < 3; r++) {
		const cols = r % 2 ? [2, 1, 0] : [0, 1, 2];
		for (const c of cols) pts.push({ x: x1 + (x2 - x1) * (0.15 + 0.35 * c), y: y1 + (y2 - y1) * (0.15 + 0.35 * r) });
	}
	return pts;
}

// xp/s measurement per pack (feeds the picker)
let xp_prev = { level: character.level, xp: character.xp };
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
	const secs = (Date.now() - s.start) / 1000;
	if (secs < CFG.measure_min_s) return;
	const rate = s.xp / secs, prev = state.measured[s.key];
	state.measured[s.key] = prev === undefined ? rate : prev * 0.5 + rate * 0.5;
	if (s.est > 0) state.realism = state.realism * 0.7 + (rate / s.est) * 0.3;
	game_log(`${s.key}: ${rate.toFixed(1)} xp/s over ${secs.toFixed(0)}s`, "gray");
}
setInterval(() => {
	const d = xp_delta(), p = state.pack;
	if (!p || character.rip) return;
	const here = character.map === p.map && in_boundary(p.boundary, 300);
	if (!state.session && here && !walking() && !errand_busy() && !state.recovering)
		state.session = { key: pack_key(p), est: p.est, xp: 0, start: Date.now() };
	if (state.session) {
		state.session.xp += d;
		if ((Date.now() - state.session.start) / 1000 > CFG.measure_min_s * 2) end_session();
	}
}, 1000);

// =====================================================================
// Combat: actions, targeting, movement
// =====================================================================
const inflight = {};
function fire(skill, target, extra) {
	const key = G.skills[skill]?.share || skill;
	if (inflight[key] || is_on_cooldown(skill)) return false;
	if (!can_spend(1, skill === "attack" ? 0 : skill.startsWith("use_") || skill.startsWith("regen_") ? 10 : 15)) return false;
	inflight[key] = true;
	const fallback = setTimeout(() => (inflight[key] = false), 3000);
	const p = skill === "attack" ? attack(target) : skill === "heal" ? heal(target) : use_skill(skill, target, extra);
	Promise.resolve(p).catch(() => {}).finally(() => { clearTimeout(fallback); setTimeout(() => (inflight[key] = false), 100); });
	return true;
}
let last_move = 0;
function move_to(x, y, min_gap = 300) {
	if (Date.now() - last_move < min_gap) return false;
	if (character.moving && Math.hypot(character.going_x - x, character.going_y - y) < 30) return false;
	if (!can_spend(2.5, 30)) return false;
	last_move = Date.now();
	move(x, y);
	return true;
}
const valid = (e) => e && e.visible && !e.dead && parent.entities[e.id] === e;
function party_names() {
	const n = new Set([character.name]);
	for (const k in get_party() || {}) n.add(k);
	return n;
}
// Self-defence first; then the pack's own monster type; others only if none in view and quick to kill.
function choose_target(local_ok) {
	const party = party_names();
	let hitting = null, hd = Infinity;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || !e.visible || e.dead || !e.target || !party.has(e.target)) continue;
		if ((state.bad_ids[e.id] || 0) > Date.now()) continue;
		const d = distance(character, e) - (e.target === character.name ? 10_000 : 0);
		if (d < hd) (hd = d), (hitting = e);
	}
	if (hitting) return hitting;
	if (!local_ok) return null;
	const want = state.pack?.mtype, cur = get_targeted_monster();
	let best = null, best_v = 0, best_tier = 2;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (!farmable_entity(e) || !valid(e) || (e.target && !party.has(e.target))) continue;
		const f = live_ok(e);
		if (!f) continue;
		const tier = e.mtype === want ? 0 : 1;
		if (tier === 1 && f.ttk * (e.hp / e.max_hp) > CFG.max_ttk_s) continue;
		if (tier > best_tier) continue;
		const walk_s = Math.max(0, distance(character, e) - character.range) / Math.max(character.speed, 1);
		const v = (e.xp || f.xp || 1) / (f.ttk * (e.hp / e.max_hp) + walk_s + 0.2) * (e === cur ? 1.5 : 1);
		if ((tier < best_tier || v > best_v) && can_move_to(e)) (best = e), (best_v = v), (best_tier = tier);
	}
	return best;
}
// A target that loses no HP for 8s in range is ignored for 5 min (immune, healing, invulnerable)
function watch_progress(t) {
	const now = Date.now();
	if (!is_in_range(t)) { if (state.prog && state.prog.id === t.id) state.prog.t = now; return false; }
	if (!state.prog || state.prog.id !== t.id) { state.prog = { id: t.id, hp: t.hp, t: now }; return false; }
	if (t.hp < state.prog.hp) { state.prog.hp = t.hp; state.prog.t = now; return false; }
	if (now - state.prog.t > 8000) {
		state.bad_ids[t.id] = now + 300_000;
		game_log(`No damage on ${t.mtype} in 8s; ignoring it for 5 min`, "gray");
		state.prog = null;
		change_target(null);
		return true;
	}
	return false;
}
function standoff(t) {
	const keep = (G.monsters[t.mtype]?.range || t.range || 0) + CFG.kite_margin;
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
	if (!so.can_kite || t.target !== character.name || distance(character, t) >= so.keep) return false;
	for (const off of [0, 0.52, -0.52, 1.05, -1.05, 1.57, -1.57]) {
		const p = point_at(t, so.want, off);
		if (can_move_to(p.x, p.y)) { move_to(p.x, p.y, 250); return true; }
	}
	return false;
}
function approach(t) {
	const so = standoff(t);
	if (distance(character, t) <= so.reach) return;
	const p = point_at(t, so.want);
	if (can_move_to(p.x, p.y)) move_to(p.x, p.y, 400);
	else move_to(t.x, t.y, 400);
}
async function travel(dest) {
	if (walking() || Date.now() < (state.travel_block_until || 0)) return;
	try { await go(dest); } catch (e) {
		if (e && e.reason !== "interrupted") game_log("travel: " + why(e));
		state.travel_block_until = Date.now() + 5000;
	}
	state.last_target_at = Date.now();
}
function patrol() {
	if (is_moving(character) || walking() || !state.waypoints.length) return;
	if (distance(character, state.waypoints[state.wp]) < 30) state.wp = (state.wp + 1) % state.waypoints.length;
	const next = state.waypoints[state.wp];
	if (can_move_to(next.x, next.y)) move_to(next.x, next.y, 500);
	else travel({ map: state.pack.map, x: next.x, y: next.y });
}
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
			if (party_heal()) return true; // heal shares the attack cooldown
			if (!t.s?.cursed && can_use("curse")) fire("curse", t);
			break;
		case "paladin":
			if (character.hp < character.max_hp * 0.5 && can_use("selfheal")) fire("selfheal");
			else if (t.hp > character.attack * 2 && can_use("smash")) fire("smash", t);
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
function fight(t, steer = true) {
	if (get_targeted_monster() !== t) change_target(t);
	if (steer && !walking() && !kite(t) && !errand_busy()) approach(t);
	else if (!steer && !walking()) kite(t);
	if (!class_skills(t) && can_attack(t)) fire("attack", t);
}
function sustain() {
	if (character.rip) return;
	const hp = character.hp / character.max_hp, mp = character.mp / character.max_mp;
	if (hp < 0.55 && quantity(CFG.hp_pot)) return fire("use_hp");
	if (mp < 0.35 && quantity(CFG.mp_pot)) return fire("use_mp");
	if (mp < 0.9 && hp > 0.8) return fire("regen_mp");
	if (hp < 0.9) return fire("regen_hp");
}
const chest_tries = {};
function loot_chests() {
	// A full bag still opens chests: gold-only chests succeed, item chests fail with loot_no_space (v10 skipped
	// every chest at 0 free slots, leaving the gold on the ground for hours)
	if (character.rip) return;
	const now = Date.now();
	let best = null, best_d = Infinity;
	for (const id in parent.chests || {}) {
		const tr = (chest_tries[id] = chest_tries[id] || { n: 0, t: 0, seen: now });
		if (tr.n >= (character.esize === 0 ? 1 : 3) || now - tr.t < 3000) continue;
		const d = distance(character, parent.chests[id]);
		if (d > CFG.loot_range && now - tr.seen < CFG.loot_wait_ms) continue;
		if (d < best_d) (best = id), (best_d = d);
	}
	if (!best || !can_spend(1, 40)) return;
	chest_tries[best].n++;
	chest_tries[best].t = now;
	parent.open_chest(best);
}
setInterval(() => { for (const id in chest_tries) if (!(id in (parent.chests || {}))) delete chest_tries[id]; }, 60_000);

// =====================================================================
// NPCs, shopping, upgrades
// =====================================================================
// Class weapon/offhand rules (G.classes[ctype].mainhand/offhand list the allowed weapon types / offhand types):
// a priest can't use a quiver or a bow even though the item itself carries no class tag
function can_wear(name) {
	const def = G.items[name], cls = G.classes[character.ctype] || {};
	if (!def) return false;
	if (def.class && !def.class.includes(character.ctype)) return false;
	if (def.type === "weapon" && def.wtype && (cls.mainhand || cls.offhand))
		return !!((cls.mainhand || {})[def.wtype] || (cls.offhand || {})[def.wtype]);
	if (["quiver", "source", "shield", "misc_offhand"].includes(def.type) && cls.offhand) return !!cls.offhand[def.type];
	return true;
}
const has_computer = () => character.items.some((i) => i && (i.name === "computer" || i.name === "supercomputer"));
function find_slot(name, level) {
	return character.items.findIndex((i) => i && i.name === name && (i.level || 0) === (level || 0) && !i.l);
}
function find_slots(name, level, n) {
	const out = [];
	character.items.forEach((i, k) => { if (out.length < n && i && i.name === name && (i.level || 0) === level && !i.l) out.push(k); });
	return out.length === n ? out : null;
}
const held = (name, level) => character.items.reduce((n, i) => n + (i && i.name === name && (i.level || 0) === (level || 0) ? i.q || 1 : 0), 0);
function shop_for(name) {
	for (const id in G.npcs) if (!G.npcs[id].ignore && (G.npcs[id].items || []).includes(name) && find_npc(id)) return id;
	return null;
}
async function go_npc(npc) {
	if (has_computer() && npc !== "monsterhunter") return;
	const loc = find_npc(npc);
	if (!loc) throw { reason: "no_npc", npc };
	if (character.map === loc.map && Math.hypot(character.x - loc.x, character.y - loc.y) < 150) return;
	await go({ map: loc.map, x: loc.x, y: loc.y + 30 });
}
async function buy_from_npc(name, qty, npc) {
	const cost = (G.items[name].g || 0) * qty;
	if (G.items[name].cash || character.gold - cost < CFG.gold_reserve) throw { reason: "gold_reserve" };
	npc = npc || shop_for(name);
	if (!npc) throw { reason: "no_shop", name };
	await go_npc(npc);
	await wait_budget(1, 30);
	return T(buy(name, qty));
}
async function ensure_scroll(scroll) {
	if (find_slot(scroll, 0) >= 0) return;
	await buy_from_npc(scroll, 1);
	if (!(await until(() => find_slot(scroll, 0) >= 0, 3000))) throw { reason: "scroll_missing", scroll };
}
// Guide rows: action.level = INPUT level; request.level = target
function input_level(a, row) {
	if (row?.request?.name === a.name && Number.isFinite(row.request.level)) return row.request.level - 1;
	return a.level || 0;
}
function input_slots(a, from, n) {
	const hinted = (a.resources || []).map((r) => r.num).filter((k) => {
		const i = character.items[k];
		return i && i.name === a.name && (i.level || 0) === from && !i.l;
	});
	if (hinted.length >= n) return hinted.slice(0, n);
	if (n === 1) { const k = find_slot(a.name, from); return k >= 0 ? [k] : null; }
	return find_slots(a.name, from, n);
}
// Lower odds are accepted when a failure can't cost anything irreplaceable:
//  - NPCs sell the item (failure costs gold): min_chance_rebuyable;
//  - another copy at the same level or higher remains (bags or worn): min_chance_spare.
function chance_floor(name, base, k, level) {
	if (shop_for(name) && !G.items[name]?.cash) return Math.min(base, CFG.min_chance_rebuyable);
	if (k !== undefined) {
		const lv = level ?? (character.items[k]?.level || 0);
		const spares = character.items.filter((i, n) => n !== k && i && i.name === name && (i.level || 0) >= lv).length +
			Object.values(character.slots || {}).filter((i) => i && i.name === name && (i.level || 0) >= lv).length;
		if (spares > 0) return Math.min(base, CFG.min_chance_spare);
	}
	return base;
}
// Develop: best spare (bags only) below the target, or a fresh +0 from an NPC
function develop_pick(name, target) {
	let k = -1;
	character.items.forEach((i, n) => { if (i && i.name === name && !i.l && (i.level || 0) < target && (k < 0 || (i.level || 0) > (character.items[k].level || 0))) k = n; });
	return k;
}
const upgrade_scroll = (name, level) => "scroll" + Math.max(0, item_grade({ name, level }));
async function run_upgrade(a, row) {
	let from = input_level(a, row), scroll = a.scroll;
	const target = row?.request?.name === a.name && row.request.level ? row.request.level : from + 1;
	let ks = input_slots(a, from, 1);
	if (!ks) {
		let k = develop_pick(a.name, target);
		if (k < 0 && shop_for(a.name)) {
			await buy_from_npc(a.name, 1);
			await until(() => develop_pick(a.name, target) >= 0, 3000);
			k = develop_pick(a.name, target);
		}
		if (k < 0) throw { reason: "input_missing", want: `${a.name} below +${target}` };
		from = character.items[k].level || 0;
		scroll = upgrade_scroll(a.name, from);
		ks = [k];
		game_log(`develop ${a.name}: +${from} → +${from + 1} (toward +${target})`, "#67A464");
	}
	if (!has_computer()) await go("upgrade");
	await ensure_scroll(scroll);
	if (!has_computer()) await go("upgrade");
	const k = character.items[ks[0]]?.name === a.name ? ks[0] : develop_pick(a.name, from + 1);
	if (k < 0) throw { reason: "input_missing", want: `${a.name}+${from}` };
	await wait_budget(1, 30);
	const preview = await T(upgrade(k, find_slot(scroll, 0), null, true));
	if (!preview || !(preview.chance >= chance_floor(a.name, CFG.min_upgrade_chance, k, from))) throw { reason: "low_chance", chance: preview?.chance };
	await wait_budget(1, 30);
	const r = await T(upgrade(k, find_slot(scroll, 0)));
	game_log(`upgrade ${a.name} +${from}→+${from + 1} (${(preview.chance * 100).toFixed(0)}%): ${r?.success ? "OK" : "FAILED"}`, r?.success ? "#58D685" : "#E25C5C");
	return r;
}
async function run_compound(a, row) {
	const from = input_level(a, row);
	const scroll = a.scroll || "cscroll" + Math.max(0, item_grade({ name: a.name, level: from }));
	if (!has_computer()) await go("compound");
	await ensure_scroll(scroll);
	if (!has_computer()) await go("compound");
	const ks = input_slots(a, from, 3);
	if (!ks) throw { reason: "input_missing", want: `3x ${a.name}+${from}` };
	await wait_budget(1, 30);
	const preview = await T(compound(ks[0], ks[1], ks[2], find_slot(scroll, 0), null, true));
	if (!preview || !(preview.chance >= chance_floor(a.name, CFG.min_compound_chance))) throw { reason: "low_chance", chance: preview?.chance };
	await wait_budget(1, 30);
	const r = await T(compound(ks[0], ks[1], ks[2], find_slot(scroll, 0)));
	game_log(`compound ${a.name} +${from}→+${from + 1} (${(preview.chance * 100).toFixed(0)}%): ${r?.success ? "OK" : "FAILED"}`, r?.success ? "#58D685" : "#E25C5C");
	return r;
}

// =====================================================================
// Bags: keep / sell / bank
// =====================================================================
function is_junk(item) {
	if (!item || item.l || item.b || CFG.keep.includes(item.name) || needed_slots().has(character.items.indexOf(item))) return false;
	if (CFG.sell.includes(item.name)) return true;
	const def = G.items[item.name];
	if (!(CFG.auto_sell_gear || bank_is_full()) || !def || !GEAR.has(def.type)) return false; // bank full: selling is the only way to make room
	return !(item.level > 0) && !item.p && item_grade(item) === 0 && item_value(item) <= CFG.sell_max_value;
}
function bag_class(item, needed = needed_slots()) {
	if (!item) return "empty";
	const def = G.items[item.name];
	if (item.l || item.b || !def || CFG.keep.includes(item.name) || BAG_TYPES.has(def.type) ||
		item.name === CFG.hp_pot || item.name === CFG.mp_pot || needed.has(character.items.indexOf(item))) return "keep";
	if (is_junk(item)) return "sell";
	return CFG.bank ? "bank" : "keep";
}
const slots_where = (f) => character.items.map((it, i) => (f(it) ? i : -1)).filter((i) => i >= 0);
function bag_plan() {
	const needed = needed_slots();
	const sell = slots_where((i) => bag_class(i, needed) === "sell"), bank = slots_where((i) => bag_class(i, needed) === "bank");
	// items the bank holds that bags need (quest inputs, guide step inputs)
	const fetch = [...state.needs.keys()].filter((n) => (state.bank_seen[n] || 0) > 0 && held(n) === 0 && !BAG_TYPES.has(G.items[n]?.type));
	return { sell, bank, fetch, free: character.esize };
}
function nearest_shop() {
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
async function task_sell() {
	const slots = slots_where((i) => bag_class(i) === "sell");
	if (!slots.length) return 0;
	if (!has_computer()) { const shop = nearest_shop(); if (shop) await go(shop); }
	let n = 0;
	for (const k of slots) {
		const it = character.items[k];
		if (bag_class(it) !== "sell") continue;
		await wait_budget(1, 40);
		await T(sell(k, it.q || 1)).then(() => n++).catch((e) => game_log("sell: " + why(e)));
		await sleep_ms(150);
	}
	if (n) game_log(`Sold ${n} junk item${n === 1 ? "" : "s"}`, "#58D685");
	return n;
}
const bank_packs_list = () => (typeof bank_packs !== "undefined" && bank_packs) || parent.bank_packs || {};
function remember_bank() {
	if (!character.bank) return;
	const seen = {};
	for (const k in character.bank) if (k.startsWith("items")) for (const i of character.bank[k] || []) if (i) seen[i.name] = (seen[i.name] || 0) + (i.q || 1);
	state.bank_seen = seen;
}
setInterval(remember_bank, 2000);
const town_reason = {}; // task -> why it achieved nothing (shown by report())
const bank_is_full = () => Date.now() - (state.bank_full_at || 0) < 6 * 3600_000;
// Store bankable items into packs on the current floor; stops at the first bank_full
async function store_here() {
	let stored = 0, full = false;
	for (let k = character.items.length - 1; k >= 0; k--) {
		if (bag_class(character.items[k]) !== "bank") continue;
		await wait_budget(1, 40);
		const r = await T(bank_store(k)).catch((e) => e);
		if (r?.reason === "bank_full") { full = true; break; }
		if (!r?.failed && !r?.reason) stored++;
		else game_log(`bank: ${character.items[k]?.name}: ${why(r)}`, "gray");
		await sleep_ms(150);
	}
	return { stored, full };
}
const floor_loaded = (map) => until(() => character.map === map && character.bank && Object.keys(character.bank).some((k) => k.startsWith("items")), 10_000);
async function task_bank(fetch_names) {
	const store = slots_where((i) => bag_class(i) === "bank");
	if (!store.length && !fetch_names.length) return (town_reason.bank = "nothing to store or fetch"), 0;
	try { if (character.map !== "bank") await go({ map: "bank" }); } catch (e) { town_reason.bank = "can't reach the bank: " + why(e); throw e; }
	if (!(await floor_loaded("bank"))) { town_reason.bank = "bank didn't load"; throw { reason: "bank_not_loaded" }; }
	let { stored, full } = await store_here();
	// main floor full → other floors you've unlocked. bank_b/bank_u sit behind doors the server keeps locked until a
	// bkey/ukey is used; an unlocked floor's packs show up in character.bank (items8 for bank_b, items24 for bank_u).
	const packs = bank_packs_list();
	const unlocked_floors = [...new Set(Object.keys(character.bank || {}).filter((k) => packs[k]).map((k) => packs[k][0]))];
	if (full) for (const floor of unlocked_floors.filter((f) => f !== "bank")) {
		if (!slots_where((i) => bag_class(i) === "bank").length) break;
		try { await go({ map: floor }); } catch (e) { game_log(`bank: can't reach ${floor}: ${why(e)}`, "gray"); continue; }
		if (!(await floor_loaded(floor))) continue;
		const r = await store_here();
		stored += r.stored;
		full = r.full;
		if (!full) break;
	}
	if (full) {
		state.bank_full_at = Date.now();
		town_reason.bank = "every bank pack you can use is full";
		const has_key = character.items.some((i) => i && (i.name === "bkey" || i.name === "ukey"));
		game_log(`Bank full (floors: ${unlocked_floors.join(", ")}): selling plain +0 junk until there's room.` +
			(has_key ? " You hold a bank key: use it in the bank to unlock another floor." : " A Bank Key (bkey) unlocks the bank_b floor."), "#E25C5C");
	} else if (!stored && store.length) town_reason.bank = "store calls failed (see gray bank: lines)";
	// pull back what bags need, from packs on whichever floor we're on
	let got = 0;
	for (const name of fetch_names) {
		if (character.esize < 2) break;
		for (const p in character.bank) {
			if (!p.startsWith("items") || (packs[p] && packs[p][0] !== character.map)) continue;
			const n = (character.bank[p] || []).findIndex((i) => i && i.name === name);
			if (n < 0) continue;
			await wait_budget(1, 40);
			await T(bank_retrieve(p, n)).then(() => got++).catch((e) => game_log(`bank: ${name}: ${why(e)}`, "gray"));
			await sleep_ms(150);
			break;
		}
	}
	remember_bank();
	game_log(`Bank: stored ${stored}, retrieved ${got}; ${character.esize} slots free`, "#58D685");
	return stored + got;
}
async function task_restock(pot_min = CFG.pot_min) {
	if (quantity(CFG.hp_pot) >= pot_min && quantity(CFG.mp_pot) >= pot_min) return 0;
	if (!has_computer()) await go("potions");
	let n = 0;
	for (const p of [CFG.hp_pot, CFG.mp_pot]) {
		const q = Math.min(CFG.pot_buy - quantity(p), Math.floor(character.gold / (G.items[p].g || 1)));
		if (q <= 0) continue;
		await wait_budget(1, 30);
		await T(buy(p, q)).then(() => n++).catch((e) => game_log(`restock ${p}: ${why(e)}`));
	}
	return n;
}

// =====================================================================
// Quests (Cole & other quest NPCs), monster hunts
// =====================================================================
const DROP_FALLBACK = { beewings: [["bee", 0.01]], gslime: [["goo", 0.001]], spores: [["minimush", 1 / 60]],
	crabclaw: [["crab", 0.001]], frogt: [["squigtoad", 1 / 400]], ascale: [["armadillo", 0.0008]], feather0: [["bigbird", 0.05]],
	dstones: [["stoneworm", 1 / 300]], pleather: [["porcupine", 0.001]], bfur: [["arcticbee", 0.001]], cscale: [["croc", 0.0009]] };
function drop_sources(item) {
	const out = [], mons = G.drops?.monsters;
	if (mons) for (const mt in mons) for (const d of mons[mt] || []) if (Array.isArray(d) && d[1] === item && typeof d[0] === "number") out.push([mt, d[0]]);
	return out.length ? out : DROP_FALLBACK[item] || [];
}
const drop_rate = (mt, item) => (drop_sources(item).find(([m]) => m === mt) || [, 0])[1];
function best_source(item) {
	let best = null;
	for (const [mt, rate] of drop_sources(item)) {
		const f = fight_profile(mt);
		if (!f) continue;
		each_area((pack, area) => {
			if (pack.type !== mt) return;
			const m = state.measured[pack_key(area)];
			const kps = m !== undefined ? m / Math.max(1, f.xp)
				: Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack)) * state.realism;
			if (!best || rate * kps > best.ips) best = { monster: mt, ...area, ips: rate * kps };
		});
	}
	return best;
}
const owned = (name) =>
	character.items.reduce((n, i) => n + (i && i.name === name ? i.q || 1 : 0), 0) +
	Object.values(character.slots || {}).filter((i) => i && i.name === name).length + (state.bank_seen[name] || 0);
const is_guide_quest = (id) => !!state.guide_quests[id] && Date.now() - (state.guide_quests[id].last || 0) < CFG.guide_quest_keep_h * 3600_000;
function quest_recipes() {
	const mode = CFG.quest_crafts;
	if (!mode) return [];
	const guide = [], own = [];
	for (const id in G.craft) {
		const r = G.craft[id];
		if (!r.quest || CFG.quest_craft_skip.includes(id)) continue;
		const out = r.output?.name || id;
		if (GEAR.has(G.items[out]?.type) && !can_wear(out)) continue; // e.g. quiver for a priest
		if (is_guide_quest(id)) { guide.push(id); continue; }
		if (Array.isArray(mode) ? !mode.includes(id)
			: !CFG.quest_npcs.includes(r.quest) || (mode === "materials" && r.items.some(([, n]) => GEAR.has(G.items[n]?.type)))) continue;
		own.push(id);
	}
	guide.sort((a, b) => state.guide_quests[a].first - state.guide_quests[b].first);
	if (Array.isArray(mode)) own.sort((a, b) => mode.indexOf(a) - mode.indexOf(b));
	return [...guide, ...own];
}
// wanted: not yet crafted quest_craft_max times and not owned (inputs stay in bags while wanted);
// open: wanted and actionable right now (not shelved, affordable)
function recipe_wanted(id) {
	const r = G.craft[id];
	return (state.crafted[id] || 0) < CFG.quest_craft_max && owned(r.output?.name || id) < CFG.quest_craft_max;
}
function recipe_open(id) {
	return recipe_wanted(id) && !skipped("qc:" + id) && (G.craft[id].cost || 0) <= character.gold - CFG.gold_reserve;
}
const has_inputs = (r) => r.items.every(([q, name, level]) =>
	character.items.some((i) => i && i.name === name && (i.level || 0) === (level || 0) && !i.l && (i.q || 1) >= q));
function next_quest_craft() {
	for (const id of quest_recipes()) if (recipe_open(id) && has_inputs(G.craft[id])) return id;
	return null;
}
async function quest_crafts() {
	let n = 0, id;
	while ((id = next_quest_craft()) && n < 10) {
		if (character.esize < 1) { game_log(`craft ${id}: no free slot`, "gray"); break; }
		const r = G.craft[id];
		if (!has_computer()) {
			const loc = find_npc(r.quest);
			if (!loc) { skip("qc:" + id, 600_000); break; }
			if (character.map !== loc.map || Math.hypot(character.x - loc.x, character.y - loc.y) > 250) await go({ map: loc.map, x: loc.x, y: loc.y + 30 });
		}
		await wait_budget(1, 30);
		const res = await T(auto_craft(id)).catch((e) => e);
		const ok = res && !res.failed && !res.reason;
		game_log(`craft ${id} at ${G.npcs[r.quest]?.name || r.quest}: ${ok ? "OK" : "FAILED " + why(res)}`, ok ? "#58D685" : "#E25C5C");
		if (!ok) { skip("qc:" + id, 300_000); break; }
		n++;
		state.crafted[id] = (state.crafted[id] || 0) + 1;
		save_state();
		await sleep_ms(400);
		await equip_if_empty(r.output?.name || id);
	}
	return n;
}
const SLOT_FOR = { helmet: ["helmet"], chest: ["chest"], pants: ["pants"], gloves: ["gloves"], shoes: ["shoes"],
	cape: ["cape"], belt: ["belt"], amulet: ["amulet"], orb: ["orb"], ring: ["ring1", "ring2"], earring: ["earring1", "earring2"],
	quiver: ["offhand"], shield: ["offhand"], source: ["offhand"], misc_offhand: ["offhand"] };
async function equip_if_empty(name) {
	const def = G.items[name];
	if (!def || !can_wear(name) || character.ctype === "merchant") return;
	const slot = (SLOT_FOR[def.type] || []).find((sl) => sl in (character.slots || {}) && !character.slots[sl]);
	const k = character.items.findIndex((i) => i && i.name === name);
	if (!slot || k < 0) return;
	const main = character.slots.mainhand && G.items[character.slots.mainhand.name];
	if (slot === "offhand" && main?.wtype && (G.classes[character.ctype]?.doublehand || {})[main.wtype]) return;
	await wait_budget(5, 30);
	await T(equip(k, slot)).then(() => game_log(`equipped ${name} → ${slot}`, "#58D685")).catch((e) => game_log(`equip ${name}: ${why(e)}`, "gray"));
}
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
		const qxp = state.measured[pack_key(pickm)] ?? (f ? f.xp * pickm.ips / Math.max(1e-9, drop_rate(pickm.monster, pickm.item)) : 0);
		if (!guided && state.best_score > 0 && qxp < CFG.quest_farm_min_xp * state.best_score) continue;
		const sk = id + ":" + pickm.item, now = Date.now();
		if (!state.qprog || state.qprog.key !== sk || pickm.have > state.qprog.have) state.qprog = { key: sk, have: pickm.have, t: now };
		else if (now - state.qprog.t > CFG.quest_stall_min * 60_000) {
			skip("qc:" + id, CFG.quest_shelve_h * 3600_000);
			game_log(`quest: no ${pickm.item} in ${CFG.quest_stall_min} min at ${pickm.monster}; retrying ${id} in ${CFG.quest_shelve_h}h`, "#E25C5C");
			state.qprog = null;
			continue;
		}
		return { monster: pickm.monster, map: pickm.map, boundary: pickm.boundary, count: pickm.count, guide_safe: false,
			reason: `${guided ? "guide quest " : ""}${id}: ${pickm.item} ${pickm.have}/${pickm.need}, ~${Math.ceil(total_s / 60)} min` };
	}
	return null;
}
const owned_in_bags_or_bank = (n, l) => held(n, l) + (l ? 0 : state.bank_seen[n] || 0);
function hunt_directive() {
	const h = character.s.monsterhunt;
	if (!CFG.auto_monster_hunt || !h || !(h.c > 0) || !fight_profile(h.id)) return null;
	const best = resolve_area(h.id);
	return best && { monster: h.id, ...best, reason: `monster hunt ${h.c} left`, guide_safe: false };
}
// The server credits a monster-hunt kill to every party member (monster_hunt_logic runs per member), so the leader
// can work its partner's hunt too — a follower never picks where to fight, so its hunts otherwise just expire.
function partner_hunt_directive() {
	const p = partner(), h = p?.hunt;
	if (!CFG.auto_monster_hunt || !h || !(h.c > 0) || is_follower() || !fight_profile(h.id)) return null;
	const best = resolve_area(h.id);
	return best && { monster: h.id, ...best, reason: `${p.name}'s monster hunt ${h.c} left`, guide_safe: false };
}
const hunt_due = () => {
	const h = character.s.monsterhunt;
	return CFG.auto_monster_hunt && character.ctype !== "merchant" && (!h || h.c === 0) && !skipped("hunt:auto");
};
async function run_hunt() {
	await go_npc("monsterhunter");
	let r;
	for (let i = 0; i < 2; i++) {
		await wait_budget(1, 30);
		r = await T(interact("monsterhunt"));
		if (r?.completed) { game_log("Monster hunt turned in (+monstertoken)", "#67A464"); await sleep_ms(300); continue; }
		break;
	}
	const h = character.s.monsterhunt;
	if (r?.started) game_log(`Monster hunt: ${h?.c ?? "?"}x ${h?.id ?? "?"}`, "#67A464");
	return r;
}
// guide farm row > guide quests > hunt > own quests (hunt_first: hunt > quests)
function refresh_directive() {
	const now = Date.now();
	let g = state.guide_farm && state.guide_farm.until > now ? state.guide_farm : null;
	if (g) {
		const gk = `${g.monster}:${g.map}`, have = g.item ? held(g.item) : 0;
		if ((state.guide_ignore[gk] || 0) > now) g = null;
		else if (!state.gprog || state.gprog.key !== gk || have > state.gprog.have) state.gprog = { key: gk, have, t: now };
		else {
			const limit = (g.item ? CFG.quest_stall_min : CFG.guide_farm_max_min) * 60_000;
			if (now - state.gprog.t > limit) {
				state.guide_ignore[gk] = now + CFG.quest_shelve_h * 3600_000;
				game_log(`guide: ${g.item ? "no " + g.item + " from" : "no end to"} ${g.monster} in ${Math.round(limit / 60_000)} min; pausing that row ${CFG.quest_shelve_h}h`, "#E25C5C");
				state.gprog = null;
				g = null;
			}
		}
	}
	const gq = () => quest_directive(true), oq = () => quest_directive(false);
	let d = g;
	for (const f of CFG.hunt_first ? [hunt_directive, partner_hunt_directive, gq, oq] : [gq, hunt_directive, partner_hunt_directive, oq]) if (!d) d = f();
	if (d) {
		const changed = !state.directive || state.directive.monster !== d.monster || state.directive.map !== d.map;
		state.directive = { ...d, until: now + CFG.guide_interval_ms * 4 };
		if (changed) state.last_pick = 0;
	} else if (state.directive) {
		state.directive = null;
		state.last_pick = 0;
	}
}

// =====================================================================
// Progression Guide adapter
// =====================================================================
let item_by_name = null;
function item_id(n) {
	if (!n) return null;
	if (G.items[n]) return n;
	if (!item_by_name) { item_by_name = {}; for (const id in G.items) if (G.items[id].name) item_by_name[G.items[id].name] = id; }
	return item_by_name[n] || null;
}
// Names along each plan's chosen path (node.next), not every alternative
function chosen_path(node, visit, depth = 0) {
	if (!node || depth > 12) return;
	visit(node);
	const nx = node.next;
	if (nx) { visit(nx); for (const i of nx.inputs || []) chosen_path(i, visit, depth + 1); }
	for (const alt of node.alternatives || []) if (alt.kind === "develop") for (const i of alt.inputs || []) chosen_path(i, visit, depth + 1);
}
function guide_quest_ids(prog) {
	const by_output = {};
	for (const id in G.craft) if (G.craft[id].quest) by_output[G.craft[id].output?.name || id] = id;
	const quest = (id) => (G.craft[id]?.quest ? id : null);
	const out = new Set(), add = (id) => id && out.add(id);
	for (const plan of prog.plans || []) chosen_path(plan.tree, (n) => { if (n.kind === "craft") add(quest(n.recipe) || by_output[n.name]); });
	const drops_of = (mt) => new Set((G.drops?.monsters?.[mt] || []).filter((d) => Array.isArray(d) && typeof d[0] === "number").map((d) => d[1])
		.concat(Object.keys(DROP_FALLBACK).filter((it) => DROP_FALLBACK[it].some(([m]) => m === mt))));
	for (const r of prog.rows || []) {
		if (r.kind === "craft" || r.action?.kind === "craft") add(quest(r.action?.recipe) || by_output[r.action?.name]);
		for (const n of [r.request?.name, r.target?.name, r.action?.name]) add(by_output[n]);
		const reason = (r.reason?.id || "").replace("progression.reason.", "");
		const mt = (r.action?.route || r.route)?.monster;
		if (r.kind === "farm" && mt && ["bees", "material", "try_material"].includes(reason)) {
			const drops = drops_of(mt);
			for (const id in G.craft) if (G.craft[id].quest && G.craft[id].items.some(([, n]) => drops.has(n))) add(id);
		}
	}
	if (prog.goal?.kind === "set" && prog.goal.name) {
		const pieces = new Set(G.sets?.[prog.goal.name]?.items || Object.keys(G.items).filter((n) => G.items[n].set === prog.goal.name));
		for (const id in G.craft) if (G.craft[id].quest && pieces.has(G.craft[id].output?.name || id)) add(id);
	}
	return out;
}
// What bags must hold: name -> copies. The guide's steps touch a few copies at a time (one item to upgrade plus a
// spare, three to compound), so only that many of the best copies stay; the rest is banked. v10 kept EVERY copy of
// any name the guide mentioned — the equipment lesson plans helmet/coat/pants/gloves/shoes +7, so every dropped
// helmet and pair of shoes was "needed", nothing was bankable, and the bag sat full for hours.
// Stackable items (materials, scrolls) are one slot no matter how many, so they're kept whole.
function compute_needs(prog) {
	const needs = new Map();
	const add = (n, k) => {
		const def = n && G.items[n];
		if (!def) return;
		k = k || (def.compound ? CFG.need_copies_compound : CFG.need_copies_upgrade);
		needs.set(n, Math.max(needs.get(n) || 0, k));
	};
	for (const r of prog?.rows || []) {
		const a = r.action || {};
		add(a.name); add(a.scroll); add(r.request?.name);
		for (const i of a.inputs || []) add(i.name, i.quantity);
		for (const res of a.resources || []) add(character.items[res.num]?.name);
	}
	for (const plan of prog?.plans || []) chosen_path(plan.tree, (n) => { add(n.next?.name); add(n.next?.scroll); });
	for (const id of quest_recipes()) if (recipe_wanted(id)) for (const [q, n] of G.craft[id].items) add(n, q);
	return needs;
}
// Bag slots holding needed copies: per needed name, the best `count` copies by level (all stacks of stackables)
function needed_slots() {
	const keep = new Set(), by = {};
	character.items.forEach((i, k) => { if (i && state.needs.has(i.name)) (by[i.name] = by[i.name] || []).push(k); });
	for (const n in by) {
		if (G.items[n]?.s) { by[n].forEach((k) => keep.add(k)); continue; }
		by[n].sort((a, b) => (character.items[b].level || 0) - (character.items[a].level || 0))
			.slice(0, state.needs.get(n)).forEach((k) => keep.add(k));
	}
	return keep;
}
function read_guide() {
	if (typeof get_progression !== "function") return null;
	let prog;
	try { prog = get_progression({ spendLimit: Math.max(0, character.gold - CFG.gold_reserve) }); } catch (e) { game_log("progression: " + e); return null; }
	if (!prog || !prog.ready) return null;
	state.guide = prog;
	for (const id of guide_quest_ids(prog)) {
		const r = G.craft[id], g = (state.guide_quests[id] = state.guide_quests[id] || { first: Date.now() });
		if (!g.last) game_log(`guide quest: ${id} (${G.npcs[r.quest]?.name || r.quest})`, "#67A464");
		g.last = Date.now();
	}
	const farm = (prog.rows || []).find((r) => {
		if (r.kind !== "farm") return false;
		const reason = (r.reason?.id || "").replace("progression.reason.", "");
		return (!CFG.follow_farm_reasons || CFG.follow_farm_reasons.includes(reason)) && (r.action?.route || r.route);
	});
	const route = farm && (farm.action?.route || farm.route);
	const area = route && G.monsters[route.monster] && resolve_area(route.monster, route.map, route.boundary, route.count);
	const mat = [farm?.title?.args?.item, farm?.reason?.args?.item, farm?.target?.name, farm?.action?.item, farm?.action?.name, route?.item, route?.drop].map(item_id).find(Boolean);
	state.guide_farm = area ? { monster: route.monster, ...area, item: mat, guide_safe: route.safe !== false, seconds: route.seconds,
		reason: "guide " + (farm.reason?.id || "").replace("progression.reason.", "") + (mat ? ` (${mat} ${held(mat)})` : ""),
		until: Date.now() + CFG.guide_interval_ms * 4 } : null;
	return prog;
}
function guide_refresh() {
	state.last_guide = Date.now();
	const prog = read_guide();
	state.needs = compute_needs(prog);
	refresh_directive();
	return prog;
}
const unsupported_seen = new Set();
const next_guide_row = (prog) => {
	for (const r of prog?.rows || []) if (r.kind !== "farm" && !CFG.gear_actions.includes(r.kind) && !unsupported_seen.has(r.kind)) {
		unsupported_seen.add(r.kind);
		game_log(`guide: rows of kind "${r.kind}" aren't automated (e.g. ${r.id})`, "gray");
	}
	return CFG.gear && (prog?.rows || []).find((r) => CFG.gear_actions.includes(r.kind) && !skipped(r.id) && r.affordable !== false);
};

// Guide row executors
async function run_craft(a) {
	if (!a.ready) throw { reason: "inputs_not_ready" };
	const recipe = G.craft[a.recipe];
	if (!recipe) throw { reason: "recipe" };
	if ((recipe.cost || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" };
	if (character.esize < 1) throw { reason: "no_space" };
	await go_npc(a.npc || recipe.quest || "craftsman");
	await wait_budget(1, 30);
	const r = await T(auto_craft(a.recipe));
	const ok = r && !r.failed;
	game_log(`craft ${a.recipe}: ${ok ? "OK" : "FAILED"}`, ok ? "#58D685" : "#E25C5C");
	if (ok) { state.crafted[a.recipe] = (state.crafted[a.recipe] || 0) + 1; save_state(); }
	return r;
}
async function run_stat(a) {
	if (character.esize < 1) throw { reason: "no_space" };
	const stat = G.items[a.scroll]?.stat, want_q = a.quantity || 1;
	const raw = (i) => i && i.name === a.name && !i.l && i.stat_type !== stat;
	const worn = !!a.slot && raw(character.slots[a.slot]);
	if (!worn && character.items.findIndex(raw) < 0) throw { reason: "input_missing" };
	const need = want_q - quantity(a.scroll);
	if (need > 0) {
		await buy_from_npc(a.scroll, need);
		if (!(await until(() => quantity(a.scroll) >= want_q, 3000))) throw { reason: "scroll_missing" };
	}
	if (!has_computer()) await go("upgrade");
	let unequipped = false;
	try {
		if (worn) {
			await wait_budget(8, 30);
			await T(unequip(a.slot));
			unequipped = true;
			if (!(await until(() => !character.slots[a.slot], 3000))) throw { reason: "unequip_failed" };
		}
		const k = character.items.findIndex(raw), sk = find_slot(a.scroll, 0);
		if (k < 0) throw { reason: "input_missing" };
		if (sk < 0) throw { reason: "scroll_missing" };
		await wait_budget(1, 30);
		const r = await T(upgrade(k, sk));
		game_log(`stat ${a.scroll} → ${a.name}: ${r?.stat || r?.success ? "OK" : why(r)}`, "#58D685");
		return r;
	} finally {
		if (unequipped && !character.slots[a.slot]) {
			await sleep_ms(300);
			let back = character.items.findIndex((i) => i && i.name === a.name && i.stat_type === stat);
			if (back < 0) back = character.items.findIndex((i) => i && i.name === a.name);
			if (back >= 0) { await wait_budget(5, 30); await T(equip(back, a.slot)).catch((e) => game_log("stat re-equip: " + why(e), "#E25C5C")); }
			else game_log(`stat: ${a.name} not in bags; ${a.slot} left empty`, "#E25C5C");
		}
	}
}
async function go_exchange(a) {
	if (has_computer()) return;
	if (a.npc) return go_npc(a.npc);
	const quest = G.items[a.name]?.quest, q = quest && G.quests?.[quest];
	if (q && q.map && Number.isFinite(q.x)) return go({ map: q.map, x: q.x, y: q.y + 30 });
	if (quest && find_npc(quest)) return go_npc(quest);
	return go_npc("exchange");
}
async function run_row(row) {
	const a = row.action || {};
	const gold_ok = () => { if ((row.cost || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" }; };
	switch (row.kind) {
		case "equip": {
			const k = a.num !== undefined && character.items[a.num]?.name === a.name ? a.num : find_slot(a.name, a.level);
			if (k < 0) throw { reason: "input_missing" };
			await wait_budget(5, 30);
			game_log(`equip ${a.name} +${a.level || 0} → ${a.slot}`, "#58D685");
			return T(equip(k, a.slot));
		}
		case "buy":
			if (a.kind === "purchase") throw { reason: "player_stand_skip" };
			gold_ok();
			return buy_from_npc(a.name, a.quantity || 1, a.npc);
		case "upgrade":
		case "develop": {
			gold_ok();
			const name = a.name || row.request?.name || row.target?.name;
			if (!name || !G.items[name]) throw { reason: "unsupported", want: JSON.stringify(a).slice(0, 80) };
			if (row.kind === "develop" && !(row.request?.level > 0) && row.target?.level) row = { ...row, request: { name, level: row.target.level } };
			const aa = { ...a, name, scroll: a.scroll || upgrade_scroll(name, a.level || 0) };
			return G.items[name].compound ? run_compound(aa, row) : run_upgrade(aa, row);
		}
		case "compound": gold_ok(); return run_compound(a, row);
		case "craft": return run_craft(a);
		case "stat": return run_stat(a);
		case "exchange": {
			if (!a.ready) throw { reason: "inputs_not_ready" };
			if (character.esize < 1) throw { reason: "no_space" };
			await go_exchange(a);
			const k = find_slot(a.name, a.level || 0);
			if (k < 0 || (character.items[k].q || 1) < (a.quantity || 1)) throw { reason: "input_missing" };
			await wait_budget(1, 30);
			const r = await T(exchange(k), 30_000);
			game_log(`exchange ${a.name} → ${r?.reward || "?"}`, "#58D685");
			return r;
		}
		case "token":
			if (!a.ready) throw { reason: "inputs_not_ready" };
			await go_npc(a.npc);
			await wait_budget(1, 30);
			return T(exchange_buy(a.token, row.target?.name || row.request?.name || a.name));
		case "dismantle": {
			if (!a.ready) throw { reason: "inputs_not_ready" };
			if ((a.fee || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" };
			const k = a.resources?.[0] && character.items[a.resources[0].num]?.name === a.name ? a.resources[0].num : find_slot(a.name, a.level || 0);
			if (k < 0) throw { reason: "input_missing" };
			await go_npc(a.npc || "craftsman");
			await wait_budget(1, 30);
			return T(dismantle(k));
		}
		case "retrieve": {
			const t = a.target, packs = bank_packs_list();
			if (!t || !packs[t.pack]) throw { reason: "bank_target" };
			if (character.esize < 1) throw { reason: "no_space" };
			if (character.map !== packs[t.pack][0]) await go({ map: packs[t.pack][0] });
			if (!(await until(() => character.bank && character.bank[t.pack], 10_000))) throw { reason: "bank_not_loaded" };
			const pack = character.bank[t.pack];
			const n = pack[t.bankNum]?.name === a.name ? t.bankNum : pack.findIndex((i) => i && i.name === a.name && (i.level || 0) === (a.level || 0));
			if (n < 0) throw { reason: "not_in_bank" };
			await wait_budget(1, 30);
			return T(bank_retrieve(t.pack, n));
		}
		case "supplies":
			if (a.unlock) throw { reason: "locked_potions_user_choice" };
			return buy_from_npc(a.name, a.quantity, a.npc || "fancypots");
		case "hunt": return run_hunt();
	}
	throw { reason: "unsupported" };
}
// One guide step: re-read, run the top actionable row; failures back off (low odds 30 min, else 5 min)
// A row we can do without walking anywhere from here: equips, retrieves from the bank floor we're standing on,
// and NPC steps a computer covers. Those don't count toward guide_steps_per_run, so a bank visit keeps going
// while the guide keeps asking for items from the bank (v10.7 left after each retrieve+equip and came back).
const bank_floors = () => new Set(Object.values(bank_packs_list()).map((p) => p[0]));
const on_bank_floor = () => bank_floors().has(character.map);
function row_is_local(row) {
	const a = row.action || {};
	if (row.kind === "equip") return true;
	if (row.kind === "retrieve") return bank_packs_list()[a.target?.pack]?.[0] === character.map;
	return has_computer() && ["buy", "upgrade", "develop", "compound", "craft", "exchange", "supplies"].includes(row.kind) && !G.craft[a.recipe]?.quest;
}
async function guide_step(row) {
	row = row || next_guide_row(guide_refresh());
	if (!row) return false;
	try {
		await run_row(row);
		await sleep_ms(500);
		return true;
	} catch (e) {
		skip(row.id, e?.reason === "low_chance" ? 1_800_000 : 300_000, why(e) + (e?.chance !== undefined ? ` ${(e.chance * 100).toFixed(0)}%` : "") + (e?.want ? ` ${e.want}` : ""));
		game_log(`guide: skip ${row.id} (${why(e)}${e?.chance !== undefined ? " " + (e.chance * 100).toFixed(0) + "%" : ""}${e?.want ? " " + e.want : ""})`, "gray");
		return false;
	}
}

// =====================================================================
// Town run: one errand doing everything due, in walking order
// =====================================================================
let bags_warned = 0;
// The tasks a town run can do. town_due() also returns plan/min_free/pot_min/relaxed; v11.2 derived "what's due" from
// every truthy key, so the numeric min_free/pot_min made a town run due every 20s (empty trips, walking back alone).
const TOWN_TASKS = ["hunt", "craft", "guide", "sell", "restock", "bank"];
const due_tasks = (due) => TOWN_TASKS.filter((k) => due[k]);
// relaxed: the partner is already in town, so use the trip — bank at < bag_min_free × sync_factor free slots,
// restock potions below pot_min × sync_factor
function town_due(relaxed = false) {
	const plan = bag_plan();
	const min_free = relaxed ? CFG.bag_min_free * CFG.party.sync_factor : CFG.bag_min_free;
	const pot_min = relaxed ? CFG.pot_min * CFG.party.sync_factor : CFG.pot_min;
	const short = plan.free < min_free;
	if (plan.free === 0 && !plan.sell.length && !plan.bank.length && Date.now() - bags_warned > 600_000) {
		bags_warned = Date.now();
		game_log("Bags full and everything in them is marked keep — run report() to see why", "#E25C5C");
	}
	return {
		hunt: hunt_due(),
		craft: !!next_quest_craft(),
		guide: !!next_guide_row(state.guide),
		sell: !skipped("town:sell") && plan.sell.length > 0 && (short || (has_computer() && plan.sell.length >= CFG.sell_batch)),
		restock: !skipped("town:restock") && (quantity(CFG.hp_pot) < pot_min || quantity(CFG.mp_pot) < pot_min),
		bank: !skipped("town:bank") && CFG.bank && ((short && plan.free + plan.sell.length < min_free && plan.bank.length > 0) || plan.fetch.length > 0),
		plan, min_free, pot_min, relaxed,
	};
}
function town_run(due) {
	return errand("town", async () => {
		const step = async (label, fn) => { try { return await fn(); } catch (e) { town_reason[label] = town_reason[label] || why(e); game_log(`${label}: ${why(e)}`, "gray"); } };
		// a bag/potion task that achieves nothing (bank full, item on another bank floor, no gold) pauses 15 min,
		// so an unfixable condition can't send us to town every town_min_gap_ms
		const bag_step = async (key, fn) => {
			delete town_reason[key];
			const n = (await step(key, fn)) || 0;
			if (!n) skip("town:" + key, 900_000, town_reason[key] || "achieved nothing");
			return n;
		};
		let did = 0;
		if (due.hunt) did += (await step("hunt", run_hunt)) ? 1 : (skip("hunt:auto", 300_000), 0);
		if (due.craft) did += (await step("craft", quest_crafts)) || 0;
		// Guide steps: keep going while the next row is local (no walking); rows that walk count toward the cap;
		// a failed row is paused and we move on to the next one instead of ending the run
		if (due.guide) for (let i = 0, far = 0, fails = 0; i < 60; i++) {
			if (character.rip || state.recovering || character.hp < character.max_hp * 0.5) break;
			const row = next_guide_row(guide_refresh());
			if (!row) break;
			const local = row_is_local(row);
			if (!local && far >= CFG.guide_steps_per_run) break;
			if (!local) far++;
			if (await step("guide", () => guide_step(row))) did++;
			else if (++fails >= 5) break;
		}
		guide_refresh(); // needs may have changed (crafted, upgraded) before deciding what to bank
		// Still in the bank after the guide's retrieves: store/fetch now, before walking anywhere else
		let banked = false;
		if (CFG.bank && on_bank_floor() && !skipped("town:bank")) {
			const here = bag_plan();
			if (here.bank.length || here.fetch.length) { did += await bag_step("bank", () => task_bank(here.fetch)); banked = true; }
		}
		const plan = bag_plan();
		const short = plan.free < (due.min_free || CFG.bag_min_free);
		if (due.sell || (short && plan.sell.length && !skipped("town:sell"))) did += await bag_step("sell", task_sell);
		if (due.restock) did += await bag_step("restock", () => task_restock(due.pot_min));
		const after = bag_plan();
		// standing in the bank anyway (guide retrieves): store what's bankable now, short on space or not
		if (CFG.bank && !banked && !skipped("town:bank") && ((after.free < (due.min_free || CFG.bag_min_free) || on_bank_floor()) && after.bank.length || after.fetch.length))
			did += await bag_step("bank", () => task_bank(after.fetch));
		state.last_pick = 0; // re-evaluate where to fight
		return did;
	});
}

// Starts a town run when something is due. Blockers are recorded (report() shows them; the log says so every
// 5 min): v10.5 silently required HP > 70% and no smart_move in flight, so a priest hovering at 60-70% HP or a
// patrol that path-finds between waypoints could farm with a full bag for hours.
let town_block_logged = 0;
function town_check() {
	if (Date.now() - state.last_town < CFG.town_min_gap_ms) return;
	const due = town_due(partner()?.errand === "town"); // partner in town → share the trip
	const what = due_tasks(due);
	if (!what.length) return void (state.town_block = null);
	const critical = character.esize <= 3;
	const attacked = !!get_nearest_monster({ target: character.name });
	const floor = critical ? CFG.town_hp_critical : CFG.town_hp;
	const blockers = [];
	if (errand_busy()) blockers.push(`errand ${state.errand}`);
	if (attacked && !critical) blockers.push("under attack");
	if (character.hp < character.max_hp * floor) blockers.push(`HP ${Math.round((character.hp / character.max_hp) * 100)}% < ${floor * 100}%`);
	if (walking() && !errand_busy()) { stop("smart"); blockers.push("stopping a pack walk"); } // a patrol/pack trip yields to town
	state.town_block = { what: what.join("+"), blockers, at: Date.now() };
	if (blockers.length) {
		if (critical && Date.now() - town_block_logged > 300_000) {
			town_block_logged = Date.now();
			game_log(`Town needed (${what.join("+")}, ${due.plan.free} free) but waiting: ${blockers.join(", ")}`, "#E2A05C");
		}
		return;
	}
	state.last_town = Date.now();
	game_log(`Town: ${what.join("+")} (${due.plan.free} free${due.relaxed ? ", with " + partner().name : ""})`, "gray");
	town_run(due);
}

// =====================================================================
// Recovery, death, parking
// =====================================================================
function recover() {
	if (!state.recovering) {
		Object.assign(state, { recovering: true, fled: false, session: null, pack: null });
		game_log(`HP ${((character.hp / character.max_hp) * 100).toFixed(0)}%: retreating`, "#E25C5C");
	}
	const threat = get_nearest_monster({ target: character.name });
	const channeling = !!character.c.town;
	if (!channeling && Date.now() - (state.town_at || 0) > 1500 && (!state.fled || (threat && character.hp < character.max_hp * CFG.flee_hp))) {
		if (walking() || is_moving(character)) stop("smart"), stop("move");
		if (fire("use_town")) (state.fled = true), (state.town_at = Date.now());
	}
	if (!channeling && threat) { const t = choose_target(false); if (t) fight(t, false); }
	if (character.hp >= character.max_hp * CFG.recover_hp && character.mp >= character.max_mp * CFG.recover_mp && !threat) {
		state.recovering = false;
		state.last_target_at = Date.now();
		game_log("Recovered; resuming", "#58D685");
	}
}
function park() { state.parked = true; state.park_home = false; game_log("Parking after the current errand", "#67A464"); }
function resume() { state.parked = false; state.last_pick = 0; state.last_target_at = Date.now(); game_log("Resuming", "#67A464"); }
function park_tick() {
	if (!errand_busy() && !state.park_home) {
		if (walking()) stop("smart");
		state.park_home = errand("park", async () => { await go("town"); });
	}
	const t = choose_target(false);
	if (t && !character.c.town) fight(t, false);
	set_message(errand_busy() ? `Parking (${state.errand})` : "Parked");
}
if (CFG.park_key && typeof map_key === "function") map_key(CFG.park_key, "snippet", "state.parked ? resume() : park()");

// =====================================================================
// Persistence
// =====================================================================
const SAVE_KEY = "farmer_v9:" + character.name; // same key as v9: keeps learned state across the upgrade
function save_state() {
	if (typeof set !== "function") return;
	set(SAVE_KEY, { v: 1, at: Date.now(), measured: state.measured, realism: state.realism, danger: state.danger,
		cooldown: state.cooldown, gear_skip: state.gear_skip, crafted: state.crafted, bank_seen: state.bank_seen,
		guide_ignore: state.guide_ignore, guide_quests: state.guide_quests, qprog: state.qprog, gprog: state.gprog, bank_full_at: state.bank_full_at,
		skip_why: Object.fromEntries(Object.entries(skip_why).filter(([k]) => skipped(k))) });
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
	Object.assign(state.crafted, d.crafted || {});
	Object.assign(state.bank_seen, d.bank_seen || {});
	Object.assign(state.guide_ignore, live(d.guide_ignore));
	Object.assign(state.guide_quests, d.guide_quests || {});
	Object.assign(skip_why, d.skip_why || {});
	if (d.bank_full_at) state.bank_full_at = d.bank_full_at;
	// guide-row pauses from older versions have no recorded reason and were judged by older rules: retry them now
	if (!d.skip_why) for (const k in state.gear_skip) if (!k.includes(":") || k.startsWith("upgrade:") || k.startsWith("compound:")) delete state.gear_skip[k];
	const off = now - (d.at || now);
	if (d.qprog) state.qprog = { ...d.qprog, t: d.qprog.t + off };
	if (d.gprog) state.gprog = { ...d.gprog, t: d.gprog.t + off };
	game_log(`farmer v${VERSION}: loaded ${Object.keys(state.measured).length} measured packs, ${Object.keys(state.crafted).length} crafts`, "gray");
}
load_state();
setInterval(save_state, 60_000);
function on_destroy() { save_state(); }
function forget() { Object.assign(state, { measured: {}, danger: {}, cooldown: {}, gear_skip: {}, realism: 1 }); save_state(); game_log("Learned state cleared"); }

// =====================================================================
// Diagnostics (call from the CODE console): report(), why_not("bee")
// =====================================================================
const mins = (t) => `${Math.max(0, Math.ceil((t - Date.now()) / 60_000))}m`;
// The game's log can't be copied; report() also opens a selectable text box and tries the clipboard
function share_text(title, lines) {
	const text = lines.join("\n");
	try { parent.navigator?.clipboard?.writeText(text).catch(() => {}); } catch (e) {}
	const esc = (x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
	if (typeof parent.show_modal === "function")
		parent.show_modal(`<div style="color:#fff;margin-bottom:6px">${esc(title)} — select all and copy (Ctrl+A, Ctrl+C)</div>` +
			`<textarea readonly style="width:100%;height:420px;background:#111;color:#cfe;font-size:13px" onclick="this.select()">${esc(text)}</textarea>`);
	return text;
}
function report() {
	const lines = [];
	const L = (s, c = "#9BD") => { lines.push(s); game_log(s, c); };
	const p = state.pack, d = state.directive;
	L(`— report v${VERSION} ${new Date().toLocaleTimeString()} —`, "#FFF");
	L(`fighting: ${p ? `${p.mtype} @ ${p.map}` : "nothing"} because ${p?.directive || (p ? `best xp/s (${p.score !== undefined ? p.score.toFixed(0) : "?"})` : "no safe pack")}`);
	if (in_party_cfg()) {
		const P = partner();
		L(P ? `party: ${P.name} (${P.ctype} ${P.level}) seen ${Math.round((Date.now() - P.t) / 1000)}s ago on ${P.map}${P.errand ? ", in " + P.errand : ""} | leader ${leader_name()}` +
			` | in game party: ${Object.keys(get_party() || {}).join(", ") || "no"} | ${partner_near() ? "fighting as a pair" : "partner away: solo safety"}`
			: `party: no message from ${others().join(", ")} in 10s (not running the script, or offline) → solo`);
	}
	if (d) L(`directive: ${d.monster} — ${d.reason}${is_follower() ? ` (ignored while following ${partner().name})` : state.safe[d.monster] ? "" : " (NOT safe → ignored; see why_not)"}`);
	if (state.guide_farm) L(`guide farm row: ${state.guide_farm.monster} (${state.guide_farm.reason})`);
	const h = character.s.monsterhunt;
	const ph = partner()?.hunt;
	if (ph) L(`${partner().name}'s hunt: ${ph.c}x ${ph.id} left${is_follower() ? "" : fight_profile(ph.id) ? " (we can farm it)" : " (not safe for us)"}`);
	L(`hunt: ${h ? (h.c > 0 ? `${h.c}x ${h.id} left` : `${h.id} done, turn in`) : "none"}${skipped("hunt:auto") ? ` (Daisy paused ${mins(state.gear_skip["hunt:auto"])})` : ""}`);
	const due = town_due();
	L(`town due: ${due_tasks(due).join(", ") || "nothing"} | errand: ${state.errand || "none"} | last run ${state.last_town ? Math.round((Date.now() - state.last_town) / 60_000) + "m ago" : "never"}`);
	if (state.town_block?.blockers.length) L(`town blocked (${Math.round((Date.now() - state.town_block.at) / 1000)}s ago): ${state.town_block.blockers.join(", ")}`);
	for (const r of state.guide?.rows || []) {
		const st = r.kind === "farm" ? "farm row" : !CFG.gear_actions.includes(r.kind) ? "not automated" : skipped(r.id) ? `paused ${mins(state.gear_skip[r.id])}: ${skip_why[r.id] || "reason not recorded (set before this version)"}` : r.affordable === false ? "unaffordable" : "next";
		L(`guide ${r.id}: ${st}`);
	}
	for (const id of quest_recipes()) {
		const r = G.craft[id];
		const inputs = r.items.map(([q, n, l]) => `${n}${l ? "+" + l : ""} ${held(n, l)}${state.bank_seen[n] ? `(+${state.bank_seen[n]} bank)` : ""}/${q}`).join(", ");
		const st = !recipe_wanted(id) ? "done" : skipped("qc:" + id) ? `paused ${mins(state.gear_skip["qc:" + id])}` : has_inputs(r) ? "READY to craft" : "collecting";
		L(`quest ${id}${is_guide_quest(id) ? " [guide]" : ""} @ ${G.npcs[r.quest]?.name || r.quest}: ${st} — ${inputs}`);
	}
	const plan = bag_plan(), kept = {};
	character.items.forEach((i) => { if (i) kept[bag_class(i)] = (kept[bag_class(i)] || 0) + 1; });
	L(`bags: ${plan.free} free (min ${CFG.bag_min_free}) | keep ${kept.keep || 0}, bank ${kept.bank || 0}, sell ${kept.sell || 0}${plan.fetch.length ? ` | to fetch: ${plan.fetch.join(", ")}` : ""}`);
	for (const k of ["town:sell", "town:restock", "town:bank"]) if (skipped(k)) L(`${k} paused ${mins(state.gear_skip[k])}: ${skip_why[k] || "?"}`);
	if (bank_is_full()) L(`bank marked full ${Math.round((Date.now() - state.bank_full_at) / 60_000)}m ago: selling +0 junk meanwhile`);
	L(`calls ${spent().toFixed(0)}/${BUDGET.soft} per 4s`);
	L(`gold ${character.gold} | level ${character.level} ${character.ctype} | ${character.map} ${Math.round(character.x)},${Math.round(character.y)}`);
	return share_text("report()", lines);
}
function why_not(mtype) {
	const lines = [];
	const L = (s) => { lines.push(s); game_log(s, "#9BD"); };
	const out = (r) => (share_text(`why_not("${mtype}")`, lines), r);
	const m = G.monsters[mtype];
	if (!m) return out(L(`${mtype}: no such monster`));
	const flags = ["special", "cooperative", "global", "unlist", "immune", "passive", "peaceful", "stationary", "cute"].filter((f) => m[f]);
	if (!farmable_type(mtype)) return out(L(`${mtype}: not farmable (${flags.join(", ") || "no xp/attack/respawn"})`));
	const f = fight_math(m);
	if (!f) return out(L(`${mtype}: we can't out-damage its healing`));
	const limit = character.max_hp * CFG.safety * (state.danger[mtype] || 1);
	L(`${mtype}: ${f.ttk.toFixed(1)}s per kill, takes ~${fight_risk(f).toFixed(0)} dmg/kill vs limit ${limit.toFixed(0)} → ${safe_enough(f, mtype) ? "SAFE" : "UNSAFE"}` +
		`${f.kiteable ? " (kiteable)" : ""}${state.danger[mtype] ? ` (died to it: x${state.danger[mtype].toFixed(2)})` : ""}`);
	const areas = [];
	each_area((pack, area) => { if (pack.type === mtype) areas.push(`${area.map} x${Math.round(area.count)}${(state.cooldown[pack_key(area)] || 0) > Date.now() ? ` (cooldown ${mins(state.cooldown[pack_key(area)])})` : ""}`); });
	L(`${mtype} packs: ${areas.join(", ") || "none on open maps"}; respawn ${m.respawn}s${m.respawn > CFG.max_respawn ? " (> max_respawn: only via directive)" : ""}`);
	return out();
}

// =====================================================================
// Party: the lowest-level member leads (packs, directives); others follow, assist its target, priests heal.
// Members talk with send_cm every beat_ms (free when both run in one browser: localStorage; else a small call cost).
// =====================================================================
const in_party_cfg = () => (CFG.party.members || []).includes(character.name) && CFG.party.members.length > 1;
const others = () => (CFG.party.members || []).filter((n) => n !== character.name);
// partner_any: heard from in the last 10s, dead or alive; partner: alive
function partner_any() {
	const p = state.partner;
	return p && Date.now() - p.t < 10_000 ? p : null;
}
function partner() {
	const p = partner_any();
	return p && !p.rip ? p : null;
}
function partner_pos(p) {
	const e = parent.entities?.[p.name];
	return e && character.map === p.map ? { map: p.map, x: e.x, y: e.y } : { map: p.map, x: p.x, y: p.y };
}
function partner_near(maxd = 400) {
	const p = partner();
	if (!p || p.map !== character.map) return null;
	const pos = partner_pos(p);
	return Math.hypot(pos.x - character.x, pos.y - character.y) <= maxd ? p : null;
}
function leader_name() {
	if (!in_party_cfg()) return character.name;
	if (CFG.party.leader) return CFG.party.leader;
	const p = partner();
	if (!p) return character.name;
	return p.level < character.level || (p.level === character.level && p.name < character.name) ? p.name : character.name;
}
// A dead leader is still the leader: the follower holds position instead of wandering off solo
function leader_name_any() {
	const p = partner_any();
	if (!in_party_cfg() || !p) return character.name;
	if (CFG.party.leader) return CFG.party.leader;
	return p.level < character.level || (p.level === character.level && p.name < character.name) ? p.name : character.name;
}
const is_follower = () => in_party_cfg() && !!partner_any() && leader_name_any() !== character.name;
function heartbeat() {
	if (!in_party_cfg() || typeof send_cm !== "function") return;
	const t = get_targeted_monster(), p = state.pack;
	const msg = { k: "hb", v: VERSION, level: character.level, ctype: character.ctype, map: character.map,
		x: Math.round(character.x), y: Math.round(character.y), hp: character.hp, max_hp: character.max_hp, rip: !!character.rip,
		target: t && !t.dead ? t.id : null, pack: p ? { mtype: p.mtype, map: p.map, boundary: p.boundary, directive: p.directive } : null,
		errand: errand_busy() ? state.errand : null, attack: character.attack, frequency: character.frequency,
		damage_type: character.damage_type || G.classes[character.ctype]?.damage_type, apiercing: character.apiercing || 0,
		rpiercing: character.rpiercing || 0, range: character.range,
		hunt: character.s.monsterhunt?.c > 0 ? { id: character.s.monsterhunt.id, c: character.s.monsterhunt.c } : null };
	Promise.resolve(send_cm(others(), msg)).catch(() => {});
}
if (typeof character.on === "function") character.on("cm", (m) => {
	if (!m || !(CFG.party.members || []).includes(m.name) || m.message?.k !== "hb") return;
	const first = !state.partner;
	state.partner = { ...m.message, name: m.name, t: Date.now() };
	if (first) game_log(`party: ${m.name} (${m.message.ctype} ${m.message.level}) online; ${leader_name()} leads`, "#67A464");
});
setInterval(() => { if (spent() < BUDGET.soft - 30) heartbeat(); }, CFG.party.beat_ms);
// Party membership: the leader invites, members accept each other's invites/requests
function on_party_invite(name) { if ((CFG.party.members || []).includes(name)) accept_party_invite(name); }
function on_party_request(name) { if ((CFG.party.members || []).includes(name)) accept_party_request(name); }
setInterval(() => {
	const p = partner();
	if (!p || !in_party_cfg() || character.rip) return;
	const party = get_party() || {};
	if (party[p.name]) return;
	if (leader_name() === character.name) Promise.resolve(send_party_invite(p.name)).catch(() => {});
	else if (!Object.keys(party).length) Promise.resolve(send_party_request(p.name)).catch(() => {});
}, 10_000);

// Priests heal whoever in the party is lowest (partyheal when two or more are hurt)
function party_heal() {
	if (character.ctype !== "priest") return false;
	const members = [character];
	for (const n of others()) { const e = parent.entities?.[n]; if (e && !e.rip && valid(e)) members.push(e); }
	const low = members.filter((m) => m.hp < m.max_hp * CFG.party.heal_at).sort((a, b) => a.hp / a.max_hp - b.hp / b.max_hp);
	if (!low.length) return false;
	if (low.length >= 2 && can_use("partyheal")) return fire("partyheal"), true;
	const m = low[0];
	if (m !== character && distance(character, m) > character.range) { if (!walking()) move_to(m.x, m.y, 300); return false; }
	return !is_on_cooldown("heal") && fire("heal", m);
}
// Follower: stay with the leader, shoot its target (or whatever is hitting the party), heal
function follower_tick() {
	const L = partner_any();
	if (L.rip) return void hold_grind(); // leader dead: grind what we can solo here until it walks back
	state.hold = null;
	state.pack = L.pack && valid_boundary(L.pack.boundary) ? { mtype: L.pack.mtype, map: L.pack.map, boundary: L.pack.boundary, directive: `following ${L.name}` } : null;
	state.last_target_at = Date.now();
	if (party_heal()) return;
	let t = L.target && parent.entities[L.target];
	if (!(t && valid(t) && t.type === "monster")) t = choose_target(false);
	if (t) {
		if (get_targeted_monster() !== t) change_target(t);
		if (!walking()) kite(t);
		if (!class_skills(t) && can_attack(t)) fire("attack", t);
	}
	if (walking() || errand_busy()) return;
	const pos = partner_pos(L);
	const d = pos.map === character.map ? Math.hypot(pos.x - character.x, pos.y - character.y) : Infinity;
	if (d > CFG.party.follow_far) travel(pos);
	else if (d > CFG.party.follow && !(t && t.target === character.name)) {
		const ang = Math.atan2(character.y - pos.y, character.x - pos.x);
		const want = { x: pos.x + Math.cos(ang) * CFG.party.follow * 0.6, y: pos.y + Math.sin(ang) * CFG.party.follow * 0.6 };
		if (can_move_to(want.x, want.y)) move_to(want.x, want.y, 300); else travel(pos);
	}
}
// Follower whose leader is dead: grind whatever it can SOLO near where it is (wait_radius), drift back when idle.
// Solo safety: partner_near() is null while the partner is dead, so fight_math leaves out its damage and heals.
function hold_grind() {
	if (!state.hold || state.hold.map !== character.map) {
		state.hold = { map: character.map, x: character.x, y: character.y };
		live_cache.clear();
	}
	const h = state.hold, R = CFG.party.wait_radius;
	state.last_target_at = Date.now();
	if (party_heal()) return true;
	let t = choose_target(false); // anything hitting us first
	if (!t) {
		const party = party_names();
		let best_v = 0;
		for (const id in parent.entities) {
			const e = parent.entities[id];
			if (!farmable_entity(e) || !valid(e) || (e.target && !party.has(e.target))) continue;
			if (Math.hypot(e.x - h.x, e.y - h.y) > R) continue;
			const f = entity_profile(e); // solo verdict
			if (!f) continue;
			const v = (e.xp || f.xp || 1) / (f.ttk * (e.hp / e.max_hp) + distance(character, e) / Math.max(character.speed, 1) + 0.2);
			if (v > best_v && can_move_to(e)) (t = e), (best_v = v);
		}
	}
	if (t && !watch_progress(t)) {
		fight(t, Math.hypot(t.x - h.x, t.y - h.y) <= R); // approach only inside the radius
		return true;
	}
	// nothing to do: drift back toward the waiting spot so the partner finds us
	if (!walking() && Math.hypot(character.x - h.x, character.y - h.y) > R / 2 && can_move_to(h.x, h.y)) move_to(h.x, h.y, 800);
	return false;
}
// Leader: never waits. The follower always knows where the leader is (heartbeat) and walks to it. What changes when
// the partner leaves (town, dead, far) or comes back is the fight model: its damage and heals stop/start counting,
// so the pack is re-judged at once — if it's too much solo, the leader moves to one it can handle, and back when
// the partner returns. (v11.4 held position up to 3 minutes instead.)
function duo_check() {
	if (!in_party_cfg() || is_follower()) return;
	const near = !!partner_near();
	if (near === state.duo_near) return;
	const was = state.duo_near;
	state.duo_near = near;
	live_cache.clear();
	state.last_pick = 0;
	const p = partner_any();
	if (was !== undefined && p) game_log(near ? `${p.name} is back: picking packs as a pair` : `${p.name} ${p.rip ? "died" : p.errand ? "is in " + p.errand : "is away"}: farming solo (re-checking the pack)`, "#67A464");
}

// =====================================================================
// Main loop
// =====================================================================
let next_respawn = 0;
function on_death() {
	if (state.dead_handled) return;
	state.dead_handled = true;
	const p = state.pack;
	if (p) {
		state.danger[p.mtype] = (state.danger[p.mtype] || 1) * 0.6;
		state.cooldown[pack_key(p)] = Date.now() + CFG.death_pack_cooldown_ms;
		game_log(`Died at ${p.mtype}; safety for it now x${state.danger[p.mtype].toFixed(2)}`);
	}
	Object.assign(state, { session: null, pack: null, park_home: false, errand: null, recovering: false });
}
function tick() {
	let wait = 200;
	try {
		meter_socket();
		if (spent() > BUDGET.soft) wait = 500;
		else if (character.rip) {
			on_death();
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
			if (Date.now() - state.last_guide > CFG.guide_interval_ms) guide_refresh();
			town_check();
			if (is_follower()) {
				follower_tick();
				loot_chests();
				const L = partner_any();
				set_message(`${errand_busy() ? state.errand + " | " : ""}${L.rip ? "waiting for " + L.name + " (dead)" : "with " + L.name + (L.pack ? " @ " + L.pack.mtype : "")} | ${character.esize} free`);
				setTimeout(tick, 150);
				return;
			}
			duo_check();
			if (!state.pack || Date.now() - state.last_pick > CFG.repick_ms) pick_pack();
			const pack = state.pack;
			const in_area = !!pack && character.map === pack.map && in_boundary(pack.boundary, 250);
			const t = choose_target(in_area || !pack);
			if (t && !watch_progress(t)) {
				state.last_target_at = Date.now();
				fight(t, true);
				wait = Math.min(Math.max(+(parent.next_skill?.attack || 0) - Date.now(), 50), 200);
			} else if (!pack) {
				set_message("No viable pack");
				wait = 5000;
			} else if (!walking() && !errand_busy()) {
				if (!in_area) {
					if (!state.waypoints.length) state.waypoints = make_waypoints(pack.boundary);
					const w = state.waypoints[state.wp % state.waypoints.length];
					travel({ map: pack.map, x: w.x, y: w.y });
				} else if (Date.now() - state.last_target_at > CFG.idle_giveup_ms) {
					game_log(`Idle at ${pack.mtype}; cooling down this pack`, "gray");
					state.cooldown[pack_key(pack)] = Date.now() + CFG.pack_cooldown_ms;
					pick_pack();
				} else patrol();
			}
			loot_chests();
			if (pack) {
				const s = state.session, live = s && Date.now() - s.start > 10_000 ? (s.xp / ((Date.now() - s.start) / 1000)).toFixed(0) : "–";
				const src = pack.directive ? pack.directive.split(/[ :(]/)[0] : "xp";
				set_message(`${errand_busy() ? state.errand + " | " : ""}${pack.mtype} (${src}) ${live}xp/s | ${character.esize} free`);
			}
		}
	} catch (e) { game_log("tick: " + e); }
	setTimeout(tick, wait);
}

setInterval(() => { if (spent() <= BUDGET.soft) sustain(); }, 250);
tick();
