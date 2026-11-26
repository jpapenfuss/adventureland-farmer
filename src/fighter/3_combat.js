// =====================================================================
// fighter/3_combat.js — fighters only (src/manifest.json): combat: targets, approach, kiting, class skills, the tank's cover, healing
// =====================================================================
// Priests heal whoever in the party is lowest (partyheal when two or more are hurt)
// Priests: heal the lowest member below heal_at (partyheal when 2+ are hurt and it's ready); walk toward a hurt member
// out of range. Returns true when a heal was cast (it shares the attack cooldown).
function party_heal() {
	if (character.ctype !== "priest") return false;
	const members = [character];
	for (const n of others()) { const e = parent.entities?.[n]; if (e && !e.rip && valid(e)) members.push(e); }
	const low = members.filter((m) => m.hp < m.max_hp * CFG.party.heal_at).sort((a, b) => a.hp / a.max_hp - b.hp / b.max_hp);
	if (!low.length) return false;
	if (low.length >= 2 && can_use("partyheal")) return fire("partyheal"), true;
	const m = low[0];
	if (m !== character && distance(character, m) > character.range) return false; // v24.63: no walk to it — a follower's place is by the tank
	return !is_on_cooldown("heal") && fire("heal", m);
}
// The tank's current target, as a live entity (its "tgt" broadcasts update state.partners[tank].target at once)
function caller_target() {
	const tank = tank_cover();
	const id = tank && state.partners[tank.name]?.target, e = id && parent.entities?.[id];
	return e && valid(e) && e.type === "monster" ? e : null;
}
// The tank tells everyone its new target right away (not at the next heartbeat)
let announced = null;
function announce_target(t) {
	if (!t || announced === t.id || !i_am_tank() || typeof send_cm !== "function") return;
	announced = t.id;
	Promise.resolve(send_cm(others(), { k: "tgt", id: t.id })).catch(() => {});
}
// A target that loses no HP for 8s in range is ignored for 5 min (immune, healing, invulnerable)
function watch_progress(t) {
	const now = Date.now();
	// v24.62: holding fire for a missing member isn't a monster that takes no damage (each one in view got ignored for
	// 5 min, then the camp was dropped as idle)
	if (tank_first(t)) { state.prog = null; return false; }
	if (!is_in_range(t)) { if (state.prog && state.prog.id === t.id) state.prog.t = now; return false; }
	if (!state.prog || state.prog.id !== t.id) { state.prog = { id: t.id, hp: t.hp, t: now }; return false; }
	if (t.hp < state.prog.hp) { state.prog.hp = t.hp; state.prog.t = now; return false; }
	if (now - state.prog.t > 8000) {
		state.bad_ids[t.id] = now + 300_000;
		game_log(`No damage on ${t.mtype} in 8s; ignoring it for 5 min`, C.dim);
		state.prog = null;
		change_target(null);
		return true;
	}
	return false;
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
// A party tank (paladin/warrior) near enough to take aggro: version-matched, alive, not on an errand, sturdier than us
function tank_cover(pool = partners_near(300)) {
	if (!CFG.party.tank_first || !in_party_cfg() || CFG.gear_tank.includes(character.ctype)) return null;
	// v24.24: any version (a rollout with mixed versions turned tanking off for everyone)
	return pool.find((p) => CFG.gear_tank.includes(p.ctype) && !p.errand && p.max_hp > character.max_hp && Number.isFinite(p.armor)) || null;
}
// ---- a parked fighter fights back with its full combat (v25.4; park_tick → fight_back) ----
function fight_back() { // v25.11: role function (the merchant's is in merchant/0_loop.js)
	const t = choose_target(false);
	if (t && !character.c.town) { fight(t, false); return true; }
	return false;
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
function farmable_entity(e) {
	return e && e.type === "monster" && e.visible && !e.dead && !e.npc && !e.immune && !e.peaceful &&
		farmable_type(e.mtype) && !((state.bad_ids[e.id] || 0) > Date.now());
}

const tank_hold = { id: null, at: 0 }; // the monster we last told the tank about
// The party's tank (the first in the order warrior, paladin; alive and online), or null — never ourselves
function party_tank() {
	if (!together_now() || is_tank_class(character.ctype)) return null;
	return partners_any().find((p) => is_tank_class(p.ctype) && !p.rip) || null;
}
function hold_for_tank(t) {
	const tank = party_tank();
	if (!tank || !tank_first(t)) return false;
	if (tank_hold.id !== t.id) {
		tank_hold.id = t.id; tank_hold.at = Date.now();
		if (typeof send_cm === "function") Promise.resolve(send_cm([tank.name], { k: "tgt", id: t.id })).catch(() => {});
	}
	return true;
}
// Live-stat check per entity: monsters level up when left alive, and an elite can be several times stronger than its
// G.monsters entry. Verdicts are cached per entity id and recomputed when its level/HP/attack changes. v25.82 (owner:
// "Try killing everything"): the verdict is only the hard limits (fightable: the kill time, the sustain test) — no
// safety fraction, no calibration.
const live_cache = new Map(); // entity id -> { key, ok, ttk, xp }; trimmed to 500 entries (oldest first)
function entity_profile(e) {
	const key = `${fight_mates().map((p) => p.name).join()}:${e.level || 1}:${e.max_hp}:${e.attack}`; // re-judged when who counts changes
	const c = live_cache.get(e.id);
	if (c && c.key === key) return c.ok ? c : null;
	const def = G.monsters[e.mtype], f = live_math(e);
	const ok = fightable(f); // (the kill time and the sustain test, on its live stats)
	const out = { key, ok, ttk: f ? f.ttk : Infinity, xp: e.xp || def?.xp || 0 };
	live_cache.set(e.id, out);
	if (live_cache.size > 500) live_cache.delete(live_cache.keys().next().value);
	return ok ? out : null;
}
// A type the party fights (state.safe: fight_profile — not an impossible fight lately), this one on its live stats
function live_ok(e) {
	if (!state.safe[e.mtype]) return null;
	const lf = entity_profile(e);
	return lf ? { ttk: lf.ttk, xp: lf.xp } : null;
}

const can_take = (e) => !!(state.safe[e.mtype] ? live_ok(e) : fight_profile(e.mtype));
// Step away from a monster (it's slower than us): ~120px straight away, or sideways if that's blocked
function step_away(e) {
	if (!e || !Number.isFinite(e.x)) return false;
	const p = best_escape(e, 140);
	return p ? move_to_as("step_away", p.x, p.y, 300) : false;
}
// v24.23: where to move away from a monster: of 12 directions around us, the ones we can walk (and keep walking another
// `step` beyond — not into a dead end), the one ending farthest from it. Straight away and ±45/90° only, a party backed
// against a cliff stood still and face-tanked with open ground beside it; this also slips out sideways or past it.
function best_escape(t, step) {
	const cm = typeof can_move === "function" ? can_move : null;
	let best = null;
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
		const x = character.x + dx * step, y = character.y + dy * step;
		if (!can_move_to(x, y)) continue;
		const open = !cm || cm({ map: character.map, x, y, going_x: x + dx * step, going_y: y + dy * step, base: character.base });
		const v = Math.hypot(x - t.x, y - t.y) + (open ? step : 0);
		if (!best || v > best.v) best = { x, y, v };
	}
	return best;
}
// The fight model on this one's live stats (a levelled monster), or null
function live_math(e) {
	const def = G.monsters[e.mtype];
	if (!def) return null;
	const live = {};
	for (const k of ["hp", "max_hp", "attack", "frequency", "armor", "resistance", "speed", "xp", "1hp", "level"]) if (e[k] !== undefined) live[k] = e[k];
	return fight_math({ ...def, ...live, mtype: e.mtype, hp: e.max_hp || def.hp, charge: Math.max(def.charge || 0, e.speed || 0) });
}
// v25.82 (prior art: the server's fear — targets of a damage type over our courage cut our attack to 40%, then 20%,
// server.js L1427-1445; earthiverse's attack strategy skips a new pull at courage): would one more monster of this
// damage type on us go past our courage? extra: ones about to be pulled with it (no courage stat: no cap). choose_target
// fights what's on us before any new monster, so single pulls never stack; an area skill's pulls (cburst) can.
function over_courage(e, extra = 0) {
	const dt = e.damage_type || G.monsters[e.mtype]?.damage_type || "physical";
	const cap = dt === "magical" ? character.mcourage : dt === "pure" ? character.pcourage : character.courage;
	if (!(cap > 0)) return false;
	let n = extra;
	for (const id in parent.entities || {}) {
		const m = parent.entities[id];
		if (m?.type === "monster" && !m.dead && m.target === character.name && (m.damage_type || G.monsters[m.mtype]?.damage_type || "physical") === dt) n++;
	}
	return n >= cap;
}
function choose_target(local_ok, keep_cur = false) {
	const party = party_names();
	let hitting = null, hd = Infinity;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || !e.visible || e.dead || !e.target || !party.has(e.target)) continue;
		if ((state.bad_ids[e.id] || 0) > Date.now() || hopeless(e)) continue; // v24.44: nothing to gain from an ent
		const d = distance(character, e) - (e.target === character.name ? 10_000 : 0); // ours always before a partner's
		if (d < hd) (hd = d), (hitting = e);
	}
	if (hitting) return hitting;
	// v24.4: targets come from the pack area plus near_pad px only. Anything visible (700px) used to qualify inside the
	// area, but once the chase crossed the 250px margin only attackers did: the leader walked out toward a monster, lost
	// it, walked back, picked it again — without end. keep_cur: outside the margin, a target picked under this rule stays
	const box = state.pack && character.map === state.pack.map && valid_boundary(state.pack.boundary) ? state.pack.boundary : null, P_ = CFG.near_pad;
	const near_box = (e) => !box || in_rect(e.x, e.y, [box[0] - P_, box[1] - P_, box[2] + P_, box[3] + P_]);
	const cur = get_targeted_monster();
	if (!local_ok) return keep_cur && cur && near_box(cur) && farmable_entity(cur) && valid(cur) && !(cur.target && !party.has(cur.target)) && live_ok(cur) ? cur : null;
	const want = state.pack?.mtype;
	let best = null, best_v = 0, best_tier = 2, best_clear = false; // tier 0 = the pack's own monster, 1 = anything else
	// v25.82 (review N5): the camp's own type levelled past hopeless_ttk_s but still out-healed — the last resort,
	// lowest level first (fire()'s hopeless() exempts the camp's type)
	let grown = null;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (!farmable_entity(e) || !valid(e) || (e.target && !party.has(e.target)) || !near_box(e)) continue;
		const f = live_ok(e);
		if (!f) {
			if (e.mtype === want && state.safe[want] && sustainable(live_math(e)) && (!grown || (e.level || 1) < (grown.level || 1) ||
				((e.level || 1) === (grown.level || 1) && distance(character, e) < distance(character, grown)))) grown = e;
			continue;
		}
		// v24.64: the tank starts a fight on its camp's monster first. v25.57 (owner: "Never, under any circumstances,
		// should [they] just wander around doing nothing in a camp"): when none of the camp's type is free (squigtoad: 2
		// up, other players on them, "nothing alive" 53% of the time), another type in the camp box that passes the same
		// check and dies within max_ttk_s is taken (the squigs sharing the box) — the camp's type always first.
		const tier = e.mtype === want ? 0 : 1;
		if (tier === 1 && box && !in_rect(e.x, e.y, box)) continue; // (a filler from the camp box itself, not its 450px pad)
		if (tier === 1 && f.ttk * (e.hp / e.max_hp) > CFG.max_ttk_s) continue;
		if (tier > best_tier) continue;
		const walk_s = Math.max(0, distance(character, e) - character.range) / Math.max(character.speed, 1);
		// xp per second of effort (remaining fight + walk + 0.2s turnaround); the current target gets ×1.5 so we
		// finish it instead of flipping between similar targets
		const v = (e.xp || f.xp || 1) / (f.ttk * (e.hp / e.max_hp) + walk_s + 0.2) * (e === cur ? 1.5 : 1);
		// v24.37: a monster with no straight walking line (water, a ledge: level2s' cgoo pool) used to be skipped — with
		// targets all around, the leader found "nothing" and patrolled. In reach already, or with a clear line: first
		// choice; the others are taken when there's none of those (approach path-finds round to them).
		const clear = distance(character, e) <= character.range || can_move_to(e);
		if (tier < best_tier || (clear && !best_clear) || (clear === best_clear && v > best_v)) (best = e), (best_v = v), (best_tier = tier), (best_clear = clear);
	}
	// the camp's type first, then its levelled ones, then a filler (owner: "How about we actually just kill things?");
	// the camp is left only when there's nothing to fight for the idle time, or by the camp review
	return best_tier === 0 ? best : grown || best;
}
// One distance used by both approach and kite, so they can't push against each other:
//   keep  = the monster's reach + kite_margin (closer than this, it can hit us)
//   reach = 90% of our range (a little inside it, so position jitter doesn't take us out of range)
//   want  = halfway between the two when we can kite (needs a 10px gap and at least its speed), else 80% of our range
function standoff(t) {
	const keep = (G.monsters[t.mtype]?.range || t.range || 0) + CFG.kite_margin;
	const reach = character.range * 0.9;
	const can_kite = RANGED && keep < reach - 10 && character.speed >= (t.speed || 0);
	return { keep, reach, can_kite, want: can_kite ? (keep + reach) / 2 : character.range * 0.8 };
}
// The point `dist` from t on the line t → us, rotated by ang_off radians
function point_at(t, dist, ang_off = 0) {
	const ang = Math.atan2(character.y - t.y, character.x - t.x) + ang_off;
	return { x: t.x + Math.cos(ang) * dist, y: t.y + Math.sin(ang) * dist };
}
function kite(t) {
	const so = standoff(t);
	if (!so.can_kite || t.target !== character.name || distance(character, t) >= so.keep) return false;
	// v24.23: the open direction that ends farthest from it (best_escape), far enough to get back to `want`
	const p = best_escape(t, Math.max(80, so.want - distance(character, t) + 40));
	if (p) { move_to_as("kite", p.x, p.y, 250); return true; } // kiting may re-steer every 250ms
	return false;
}
function approach(t) {
	const so = standoff(t);
	if (distance(character, t) <= so.reach) return;
	const p = point_at(t, so.want);
	if (can_move_to(p.x, p.y)) { approach_path = null; move_to_as("approach", p.x, p.y, 400); } // re-steer at most every 400ms while closing in
	else if (can_move_to(t.x, t.y)) { approach_path = null; move_to_as("approach", t.x, t.y, 400); } // only the standoff point is blocked: straight at it
	// v24.32: a wall between us (a ledge above the monster's pool): walking straight at it ran us into the corner, where we
	// stood for good. Path-find to it; break_walk_for leaves that walk alone until we can reach it or see a clear line.
	else {
		// v24.37: no way round within 10s (an island, the far bank): leave it alone for 2 min
		const now = Date.now(), d = distance(character, t);
		if (approach_try.id !== t.id || d < approach_try.d - 30) approach_try = { id: t.id, at: now, d };
		else if (now - approach_try.at > 10_000) {
			state.bad_ids[t.id] = now + 120_000; approach_path = null;
			return void game_log(`can't get to that ${t.mtype}; leaving it for 2 min`, C.dim);
		}
		approach_path = t.id; travel_as("approach", { map: character.map, x: t.x, y: t.y });
	}
}
let approach_try = { id: null, at: 0, d: 0 };
let approach_path = null; // id of the target we're path-finding around a wall to
// v24.8: in range for a skill (the server refuses "too_far" without a cooldown, so out of range it was re-sent every reply)
const in_reach = (t, skill) => (typeof is_in_range === "function" ? is_in_range(t, skill) : distance(character, t) <= (G.skills[skill]?.range || character.range));
// Class skills, used alongside attacks. Returns true when the skill replaces this tick's attack (priest heals share
// the attack cooldown). Thresholds: ranger marks targets worth >3 of its attacks; paladin self-heals below 50% HP
// and smashes targets worth >2 attacks; mage energizes below 50% MP.
function class_skills(t) {
	switch (character.ctype) {
		case "ranger":
			if (t.hp > character.attack * 3 && !t.s?.marked && can_use("huntersmark")) fire("huntersmark", t);
			else if (can_use("supershot")) fire("supershot", t);
			break;
		case "priest":
			if (party_heal()) return true; // heal shares the attack cooldown
			// dark blessing (level 70): +25% damage for every member within 600px for 8s, 60s cooldown: on a target
			// worth it (5+ of our hits) with someone else near
			if (G.skills.darkblessing && can_use("darkblessing") && !character.s?.darkblessing && t.hp > character.attack * 5 &&
				partners_near(G.skills.darkblessing.range || 600).length) fire("darkblessing");
			// absorb: pull every monster on a squishy member (not the tank) below 70% HP onto us, while we're healthy
			if (can_use("absorb") && character.hp > character.max_hp * 0.6) {
				const ents = Object.values(parent.entities || {});
				const victim = others().map((n) => parent.entities?.[n]).find((e) => e && !e.rip && valid(e) &&
					!CFG.gear_tank.includes(e.ctype) && e.hp < e.max_hp * 0.7 && distance(character, e) < (G.skills.absorb?.range || 240) &&
					ents.some((m) => m.type === "monster" && m.target === e.name));
				if (victim) fire("absorb", victim);
			}
			// curse (400 MP, +20% damage taken for 5s): only on a target with 5+ of our party's hits left, and MP above half
			if (!t.s?.cursed && t.hp > character.attack * 5 && character.mp > character.max_mp * 0.5 && can_use("curse") && in_reach(t, "curse")) fire("curse", t);
			break;
		case "paladin": {
			// mana shield: below 50% HP with MP to spare, damage comes out of MP (1.5 dmg per MP until 200 MP left);
			// off again once HP is back or MP runs low (smash/selfheal need it)
			const ms = !!character.s?.mshield;
			if (G.skills.mshield && can_use("mshield") && (ms ? character.mp < 250 || character.hp > character.max_hp * 0.85
				: character.hp < character.max_hp * 0.5 && character.mp > 400)) fire("mshield");
			if (character.hp < character.max_hp * 0.5 && can_use("selfheal")) fire("selfheal");
			else if (G.skills.purify && t.hp >= 1500 && character.mp > (G.skills.purify.mp || 360) + 200 && can_use("purify")) fire("purify", t);
			// purify (level 60): 2000 pure damage (ignores armour) every 24s, on targets with that much HP left
			// v24.4: smash is 0.36 x attack for 380 MP every 320ms (and needs a mace): unchecked, it emptied the bar in a
			// second and sustain() refilled it with MP potions (~30/min). Only from MP above smash_mp_floor of max, so it
			// spends natural regen and never potions, and keeps MP for mshield/selfheal/purify
			else if (t.hp > character.attack * 2 && character.mp > character.max_mp * CFG.smash_mp_floor + (G.skills.smash?.mp || 380) &&
				G.items[character.slots?.mainhand?.name]?.wtype === "mace" && can_use("smash") && in_reach(t, "smash")) fire("smash", t);
			break;
		}
		case "warrior":
			if (!character.s.warcry && can_use("warcry")) fire("warcry");
			break;
		case "mage": {
			// burst: all MP as one hit (MP × ratio, 6s cooldown) on a target that can soak most of it, when we're nearly
			// full and carry MP potions to refill
			const ratio = G.skills.burst?.ratio || 0.555;
			if (G.skills.burst && can_use("burst") && character.mp >= character.max_mp * 0.9 && t.hp >= character.mp * ratio * 0.6 &&
				pot_count("mp") >= CFG.pot_min && in_reach(t, "burst")) return fire("burst", t), true;
			if (cburst()) return true;
			if (!can_use("energize")) break;
			// the party member lowest on mana (below 40%) within range, else ourselves below 50%. A priest's heals run
			// on mana, so in a party this mostly keeps the healer going.
			const range = G.skills.energize?.range || 320;
			const low = others().map((n) => parent.entities?.[n]).filter((e) => e && !e.rip && valid(e) && e.max_mp &&
				e.mp < e.max_mp * 0.4 && distance(character, e) < range).sort((a, b) => a.mp / a.max_mp - b.mp / b.max_mp)[0];
			// v24.4: with no amount the server moves up to 10000 MP — all of ours. Give what they're missing, keeping 40%
			const give = low ? Math.min(low.max_mp - low.mp, Math.floor(character.mp - character.max_mp * 0.4)) : 0;
			if (low && give >= 100) fire("energize", low, give);
			// v24.8: on ourselves it moves no MP (server: same object) — the old "refill below 50%" did nothing but spend
			// the cooldown; its side effect, high attack speed, is the point: whenever no partner needs mana
			else if (!low) fire("energize", character);
			break;
		}
		case "rogue":
			if (!character.s.rspeed && can_use("rspeed")) fire("rspeed", character);
			break;
	}
	return false;
}
// Mage 75+: cburst splits MP across up to 12 monsters in range (damage = MP x ratio each). Only monsters already in our
// fight: hitting a party member, or the pack's type and safe for us (it aggroes everything it hits). Each target gets
// what it needs to die (lowest HP first) until the MP above 25% is spent; worth it from 3 targets.
function cburst() {
	const sk = G.skills.cburst;
	if (!sk || !can_use("cburst") || character.mp < character.max_mp * 0.5) return false;
	const party = party_names(), want = state.pack?.mtype;
	const dm = (d) => (typeof damage_multiplier === "function" ? damage_multiplier(d) : Math.max(0.05, 1 - d / 1000));
	const hits = Object.values(parent.entities || {}).filter((e) => e.type === "monster" && valid(e) && distance(character, e) < character.range &&
		!hopeless(e) && ((e.target && party.has(e.target)) || (e.mtype === want && !e.target && live_ok(e) && !tank_first(e)))).sort((a, b) => a.hp - b.hp);
	if (hits.length < 3) return false;
	let budget = character.mp - character.max_mp * 0.25;
	const targets = [], pulled = {};
	for (const e of hits.slice(0, 12)) {
		// v25.82: no more new pulls than our courage allows (past it the server cuts our attack to 40%/20%)
		if (!e.target) { const dt = e.damage_type || G.monsters[e.mtype]?.damage_type || "physical"; if (over_courage(e, pulled[dt] || 0)) continue; pulled[dt] = (pulled[dt] || 0) + 1; }
		const need = Math.ceil(e.hp / ((sk.ratio || 0.5) * dm((e.resistance || 0) - (character.rpiercing || 0))) * 1.1);
		const mp = Math.min(need, Math.floor(budget));
		if (mp < 50) break;
		targets.push([e.id, mp]);
		budget -= mp;
	}
	if (targets.length < 3 || !can_spend(1, RESERVE.skill)) return false;
	return fire("cburst", targets);
}
// A walk (smart_move) in progress blocks approach(): stop it when a fight is right here — a target within 300px (on the
// way to a boss: only one attacking one of us). Never during errands.
// travel() treats the resulting "interrupted" as normal (no retry block).
function break_walk_for(t) {
	if (!walking() || !t || distance(character, t) > 300) return false;
	if (errand_busy() && !state.lead_walk) return false; // a town walk interrupted would fail (and pause) that errand step
	if (approach_path === t.id && distance(character, t) > standoff(t).reach && !can_move_to(t.x, t.y)) return false; // v24.32: the way round to it
	const attacking_us = !!t.target && party_names().has(t.target);
	if (!attacking_us && state.pack?.boss) return false; // on the way to a boss: only stop for attackers
	if (t.target === character.name && !can_take(t)) return false; // v24.10: outrun it; v24.16: keep walking whatever its speed
	halt("break_walk_for");
	return true;
}
function fight(t, steer = true) {
	// v24.10: attacked by something we can't take on and slower than us: get away (keep walking, or step away), shooting
	// if we can; stopping to trade hits with it was a death (a dark hound on the way through winterland)
	// v24.16: walking, never stop for it — whatever its speed: the walk goes on (through a door, it's left behind). Stopped,
	// a hawk (charge 52) cornered the party at desertland's cave door and killed Sanala while they face-tanked it
	// v24.59: only from a monster the party can't kill at all (an ent). It used to apply to anything that failed the
	// per-monster check — so the tank, having started on a levelled-up cgoo, stepped away from it 194 times in a minute
	// while the others fought it, and everyone died.
	if (t && t.target === character.name && hopeless(t) && (walking() || (character.speed || 0) > chase_speed(t.mtype))) {
		if (!walking()) step_away(t);
		return;
	}
	if (get_targeted_monster() !== t) change_target(t);
	if (steer) break_walk_for(t);
	if (steer && !walking() && !kite(t) && (!errand_busy() || state.lead_walk)) approach(t);
	else if (!steer && !walking()) kite(t);
	if (hold_for_tank(t)) { if (character.ctype === "priest") party_heal(); return; }
	if (!class_skills(t) && can_attack(t)) fire("attack", t);
}
// ---- v25.20: one-hit kills (the tank) and the followers' free-for-all ----
// The tank's own kills by type: was the killing hit at least the monster's max HP? The server reports the hit's full
// damage (def.damage before HP is taken off), so this is "the hit alone kills it from full HP", even when it was already
// hurt. target_hit fires from the client's 'hit' handler while the entity still exists (it's removed on 'death').
const os_log = {};
function os_note(d) {
	if (!d?.kill || !(d.damage > 0)) return;
	const e = parent.entities?.[d.target], mt = e?.mtype;
	if (!mt || !G.monsters[mt]) return;
	const L = (os_log[mt] = os_log[mt] || []);
	L.push({ t: Date.now(), one: d.damage >= (e.max_hp || G.monsters[mt].hp || Infinity) });
	if (L.length > 8) L.shift();
}
if (typeof character.on === "function") character.on("target_hit", os_note);
// Types the tank one-shoots: its last 5 kills of the type in 10 min (at least 3) were all one hit
function oneshot_types() {
	if (!is_tank_class(character.ctype)) return [];
	const now = Date.now();
	return Object.keys(os_log).filter((mt) => { const L = os_log[mt].filter((x) => now - x.t < 600_000).slice(-5); return L.length >= 3 && L.every((x) => x.one); });
}
// A follower's own pick while the tank one-shoots the camp's type: a random untouched monster of that type at the camp
// (kept until it's dead or taken), so the members spread out instead of all hitting the same one
function os_pick() {
	const P = state.pack, now = Date.now();
	if (!P) return null;
	const cur = state.os_pick && parent.entities?.[state.os_pick];
	if (cur && farmable_entity(cur) && (!cur.target || party_names().has(cur.target)) && free_for_all(cur)) {
		// no damage on it 12 s after the pick (unreachable, out of sight, immune to us): set aside 2 min, pick another
		// (followers don't run watch_progress, which does this for the tank)
		if (now - (state.os_pick_at || now) > 12_000 && cur.hp >= (state.os_pick_hp ?? Infinity)) { state.bad_ids[cur.id] = now + 120_000; }
		else return cur;
	}
	const c = Object.values(parent.entities || {}).filter((e) => farmable_entity(e) && !e.target &&
		e.mtype === P.mtype && free_for_all(e) && !hopeless(e) && live_ok(e));
	const e = c.length ? c[Math.floor(Math.random() * c.length)] : null;
	state.os_pick = e ? e.id : null; state.os_pick_at = now; state.os_pick_hp = e ? e.hp : null;
	return e;
}
