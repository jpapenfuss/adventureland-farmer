// =====================================================================
// shared/05_gear.js — can_wear, gear scoring per class, wearing upgrades from bags/bank, sharing spares
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
// =====================================================================
// Own gear: score items per class (gear evaluation below), wear upgrades from the bags or the account-wide bank,
// and hand spares to party members who'd wear them. Worn scores travel in the heartbeat, so every member can judge
// an item for any other (same formula, same version).
// =====================================================================
const GEAR_SLOTS = ["mainhand", "offhand", "helmet", "chest", "pants", "shoes", "gloves", "amulet", "belt", "cape", "orb",
	"ring1", "ring2", "earring1", "earring2"];
const SLOT_OF = { helmet: ["helmet"], chest: ["chest"], pants: ["pants"], shoes: ["shoes"], gloves: ["gloves"], amulet: ["amulet"],
	belt: ["belt"], cape: ["cape"], orb: ["orb"], ring: ["ring1", "ring2"], earring: ["earring1", "earring2"] };
const OFFHAND_TYPES = new Set(["shield", "quiver", "source", "misc_offhand"]);
// ---- Gear evaluation (v24.26) ----
// Points per unit of each item stat, per class (1 attack = 1 point):
//  - primary stats (str dex int vit for): the class's per-level growth, G.classes[c].lstats — the stat weighting in
//    the game's data docs (/docs/code/data/classes) — relative to its main_stat, which counts CFG.gear_w.main_stat.
//    Mage: int 1.2, str/dex 0.24, vit 0.36; paladin: str and its side_stat int 1.2 each; warrior: dex/int 0.3.
//  - every other stat: CFG.gear_w; xp: xp_weight (from the wearer's live attack).
//  - tanks (CFG.gear_tank): defence (DEF_STATS) x CFG.gear_tank_mult. Not fortitude: the server applies it only
//    against players (server.js: attacker.is_player && target.for).
// What a piece is worth in a slot also counts the class's modifiers for its weapon/offhand type (server: applied on
// equip — a mage's wand +60 frequency, a priest's shield -5 speed) and what it adds to set bonuses for that wearer.
const PRIMARY_STATS = ["str", "dex", "int", "vit", "for"];
const STAT_KEYS = [...new Set([...PRIMARY_STATS, ...Object.keys(CFG.gear_w), "xp"])].filter((k) => k !== "main_stat"); // every stat that can score
const DEF_STATS = new Set(["armor", "resistance", "hp", "vit", "evasion", "avoidance", "reflection"]);
// The docs' values (design/classes.py), used only when the client's G.classes lacks lstats (an old client, a test)
const CLASS_DOC = {
	warrior: ["str", { str: 1, dex: 0.25, int: 0.25, vit: 0.4, for: 0.025 }],
	paladin: ["str", { str: 1, dex: 0.05, int: 1, vit: 0.4, for: 0.2 }, "int"],
	rogue: ["dex", { str: 0.2, dex: 1, int: 0.2, vit: 0.3, for: 0.025 }],
	ranger: ["dex", { str: 0.2, dex: 1, int: 0.25, vit: 0.3, for: 0.02 }],
	mage: ["int", { str: 0.2, dex: 0.2, int: 1, vit: 0.3, for: 0.02 }],
	priest: ["int", { str: 0.2, dex: 0.2, int: 1, vit: 0.4, for: 0.025 }],
	merchant: ["int", { str: 0.1, dex: 0.4, int: 1, vit: 0.25, for: 0 }],
};
// { main, side, l (lstats), src: "G" | "doc" } or null for an unknown class
function class_stats(ctype) {
	const c = G.classes?.[ctype], d = CLASS_DOC[ctype], live = c?.lstats && typeof c.lstats === "object";
	const l = live ? c.lstats : d?.[1], main = c?.main_stat || d?.[0];
	return l && main && l[main] > 0 ? { main, side: c?.side_stat || d?.[2] || null, l, src: live ? "G" : "doc" } : null;
}
function stat_weight(k, ctype) {
	let w;
	if (PRIMARY_STATS.includes(k)) { const cs = class_stats(ctype); w = cs ? CFG.gear_w.main_stat * (cs.l[k] || 0) / cs.l[cs.main] : 0; }
	else if (k === "xp") w = xp_weight(ctype);
	else w = k === "main_stat" ? 0 : CFG.gear_w[k] || 0;
	if (w && CFG.gear_tank.includes(ctype) && DEF_STATS.has(k)) w *= CFG.gear_tank_mult;
	return w;
}
// The full table for a class (gear_check, report)
function gear_weights(ctype) {
	const out = {};
	for (const k of STAT_KEYS) { const w = stat_weight(k, ctype); if (w) out[k] = Math.round(w * 1000) / 1000; }
	return out;
}
// Item stats at its level: the game's own calculator when the runner exposes it, else base + per-level increments
function item_props(item, ctype) {
	const f = typeof calculate_item_properties === "function" ? calculate_item_properties
		: typeof parent !== "undefined" && typeof parent.calculate_item_properties === "function" ? parent.calculate_item_properties : null;
	if (f) try { return f(item, { class: ctype }); } catch (e) {}
	const def = G.items[item.name] || {}, out = {}, lv = item.level || 0, inc = def.upgrade || def.compound || {};
	for (const k of STAT_KEYS) if (typeof def[k] === "number") out[k] = def[k];
	for (const k in inc) if (typeof inc[k] === "number") out[k] = (out[k] || 0) + inc[k] * lv;
	return out;
}
// What wearing it adds: its stats plus the class's modifiers for its weapon type (mainhand) or offhand type
function gear_stats(item, ctype) {
	const p = { ...item_props(item, ctype) }, d = G.items[item.name], cls = G.classes[ctype];
	const mod = !cls || !d ? null : d.type === "weapon" ? cls.doublehand?.[d.wtype] || cls.mainhand?.[d.wtype]
		: OFFHAND_TYPES.has(d.type) ? cls.offhand?.[d.wtype] || cls.offhand?.[d.type] : null;
	for (const [k, v] of Object.entries(mod || {})) if (typeof v === "number") p[k] = (p[k] || 0) + v;
	// v25.55: the server floors MP per attack at 1 — a saving counts only down to there: the class's own cost at our
	// level (calculate_player_stats: mp_cost x (1 + level/10), the item's a_mp_cost added flat), less 1
	if (p.mp_cost < 0 && cls?.mp_cost > 0) {
		const lv = ctype === character.ctype ? character.level : partners().find((q) => q.ctype === ctype)?.level || character.level; // the wearer's level
		p.mp_cost = Math.max(p.mp_cost, 1 - cls.mp_cost * (1 + Math.min(lv || 1, 80) / 10));
	}
	return p;
}
// Points per xp stat point for a class (v23.4): its attack (ours, or a partner's from its heartbeat) x value
function xp_weight(ctype) {
	if (ctype === "merchant") return 0;
	const atk = ctype === character.ctype ? character.attack : partners().find((p) => p.ctype === ctype)?.attack;
	// v24.7: not x party size — +1% xp on one fighter is 1/n of the party's xp, the same as +1% of its own damage (which
	// speeds every member's share); x n made xp gear outscore real armour, and differ on the merchant (party_n 1)
	return CFG.gear_xp_value * (atk || character.attack || 100);
}
// Points of a stat bag for a class, and each stat's share (largest first)
function stat_terms(p, ctype) {
	const out = [];
	for (const k in p) {
		if (!p[k] || typeof p[k] !== "number") continue;
		const w = stat_weight(k, ctype);
		if (w) out.push({ k, v: p[k], w, pts: p[k] * w });
	}
	return out.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
}
const round1 = (x) => Math.round(x * 10) / 10;
function stat_points(p, ctype) {
	let s = 0;
	for (const k in p) if (p[k] && typeof p[k] === "number") s += p[k] * stat_weight(k, ctype);
	return s;
}
// A piece on its own (no set bonus): the same for every slot it fits
function gear_score(item, ctype = character.ctype) {
	if (!item || !G.items[item.name]) return 0;
	return round1(stat_points(gear_stats(item, ctype), ctype));
}
// Set bonus with n pieces worn: the server adds up the levels 1..n of G.sets[set] (server_functions.js, at boot; the
// client's G holds them per level)
function set_bonus(set, n) {
	const S = G.sets?.[set], out = {};
	if (!S) return out;
	for (let i = 1; i <= n; i++) for (const [k, v] of Object.entries(S[i] || {})) if (typeof v === "number") out[k] = (out[k] || 0) + v;
	return out;
}
// Points the piece adds to its set's bonus in this slot: the set as worn in the other slots, plus this one
function set_gain(item, ctype, g, slot) {
	const set = G.items[item?.name]?.set;
	if (!set || !G.sets?.[set]) return 0;
	const others = Math.max(0, (g?.sets?.[set] || 0) - (g?.sset?.[slot] === set ? 1 : 0));
	return stat_points(set_bonus(set, others + 1), ctype) - stat_points(set_bonus(set, others), ctype);
}
// What a piece is worth to a member (g: its my_gear, or a partner's heartbeat gear) in a slot: alone + set bonus
// (a partner on an older version sends off: true/false — the offhand flag that field used to be)
const dps_ctx = (g) => (CFG.gear_dps && g && typeof g.off === "object" && g.off && g.off.mult > 0 && g.off.A > 0 && g.off.F > 0 ? g.off : null);
function slot_value(item, ctype, g, slot) {
	let v = gear_score(item, ctype);
	const O = dps_ctx(g);
	if (O && slot && item && G.items[item.name]) {
		const p = gear_stats(item, ctype), lin = (p.attack || 0) * stat_weight("attack", ctype) + (p.frequency || 0) * stat_weight("frequency", ctype);
		if (lin) v += offense_points(p, O, slot) - lin; // its attack and speed as damage, instead of the flat weights
	}
	return round1(v + set_gain(item, ctype, g, slot));
}
// What a wearer's damage depends on (my_gear → heartbeat gear.off): its attack A and frequency F as worn, mult = attack
// per point of item attack (server calculate_player_stats: main stat / 20; paladin str/20 + int/40; priest x1.6), and
// each worn slot's item attack (ia) and frequency points (fr)
function offense_ctx(sl) {
	const cs = class_stats(character.ctype);
	if (!cs || !(character.attack > 0) || !(character.frequency > 0)) return null;
	let mult = character.ctype === "paladin" ? (character.str || 0) / 20 + (character.int || 0) / 40 : (character[cs.main] || 0) / 20;
	if (character.ctype === "priest") mult *= 1.6;
	if (!(mult > 0)) return null;
	const ia = {}, fr = {};
	for (const s of GEAR_SLOTS) if (sl[s]) { const p = gear_stats(sl[s], character.ctype); if (p.attack) ia[s] = p.attack; if (p.frequency) fr[s] = p.frequency; }
	return { A: Math.round(character.attack), F: +character.frequency.toFixed(3), mult: +mult.toFixed(3), ia, fr };
}
// Points a piece's attack and frequency are worth in a slot: the damage per second it adds over that slot EMPTY (so
// the worn piece and a candidate are measured from the same base — no flip-flop), in units of one point of item attack
function offense_points(p, O, slot) {
	const A0 = Math.max(1, O.A - (O.ia?.[slot] || 0) * O.mult), F0 = Math.max(0.1, O.F - (O.fr?.[slot] || 0) / 100);
	const A1 = Math.max(1, A0 + (p.attack || 0) * O.mult), F1 = Math.max(0.05, F0 + (p.frequency || 0) / 100);
	return (A1 * F1 - A0 * F0) / (F0 * O.mult);
}
// Sets worn: set -> pieces, slot -> set (my_gear, heartbeat)
function worn_sets(sl) {
	const sets = {}, sset = {};
	for (const s of GEAR_SLOTS) { const set = sl[s] && G.items[sl[s].name]?.set; if (set) { sets[set] = (sets[set] || 0) + 1; sset[s] = set; } }
	return { sets, sset };
}
// "int 10×1.2=12, vit 4×0.48=1.9 (+set wanderers 2pc 20)": why a piece scores what it does
function gear_why(item, ctype = character.ctype, g = null, slot = null) {
	if (!item || !G.items[item.name]) return "";
	const t = stat_terms(gear_stats(item, ctype), ctype).slice(0, 4).map((x) => `${x.k} ${round1(x.v)}×${+x.w.toFixed(2)}=${round1(x.pts)}`);
	const sg = g && slot ? round1(set_gain(item, ctype, g, slot)) : 0;
	const p_ = gear_stats(item, ctype), dps = dps_ctx(g) && slot && (p_.attack || p_.frequency) ? ` [attack+speed as damage: ${round1(offense_points(p_, g.off, slot))} pts, not the two weights]` : "";
	return t.join(", ") + (sg ? ` (+set ${G.items[item.name].set} ${sg})` : "") + dps;
}
// "weights paladin (G.classes lstats, main str, side int): str 1.2 int 1.2 vit 0.96 ... | attack 1 armor 0.6 ..."
function gear_weights_text(ctype) {
	const cs = class_stats(ctype), w = gear_weights(ctype);
	const prim = PRIMARY_STATS.filter((k) => w[k]).map((k) => `${k} ${w[k]}`).join(" ");
	const rest = Object.entries(w).filter(([k]) => !PRIMARY_STATS.includes(k)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" ");
	return `weights ${ctype}${cs ? ` (${cs.src === "G" ? "G.classes" : "docs copy"} lstats, main ${cs.main}${cs.side ? `, side ${cs.side}` : ""})` : " (unknown class)"}` +
		`${CFG.gear_tank.includes(ctype) ? `, defence x${CFG.gear_tank_mult}` : ""}: ${prim} | ${rest}`;
}
// What a member (us, or a partner from its heartbeat) wears: slot -> score; slots the guide owns right now count as
// unbeatable (1e9); dh = mainhand is two-handed, off = offhand occupied; sets/sset = sets worn (worn_sets)
let my_gear_cache = null; // { at, key, g }: bag_plan judges every bag item against it, so memo it for 1s
// Does the guide have a live (not paused) gear step for this slot? Row ids are "kind:slot:item:level:stat".
function guide_plans_slot(slot) {
	return (state.guide?.rows || []).some((r) => CFG.gear_actions.includes(r.kind) && !skipped(r.id) &&
		(r.action?.slot || String(r.id || "").split(":")[1]) === slot);
}
// Worn pieces, plus those off for a long walk (v24.27: still ours — judged, reported and protected as worn)
function gear_slots_v() {
	const sl = { ...(character.slots || {}) };
	for (const r of state.travel_off) if (!sl[r.slot]) sl[r.slot] = { name: r.name, level: r.level, p: r.p || undefined, stat_type: r.stat_type || undefined };
	return sl;
}
function my_gear() {
	const now = Date.now(), sl = gear_slots_v();
	const owned = (s) => now - (state.guide_equip[s] || 0) < CFG.gear_guide_respect_h * 3600_000 && guide_plans_slot(s);
	const key = GEAR_SLOTS.map((s) => (sl[s] ? sl[s].name + (sl[s].level || 0) : "") + (owned(s) ? "!" : "")).join();
	if (my_gear_cache && now - my_gear_cache.at < 1000 && my_gear_cache.key === key) return my_gear_cache.g;
	const w = {}, own = {}, ws = worn_sets(sl), off = CFG.gear_dps ? offense_ctx(sl) : null;
	if (off) ws.off = off;
	// v24.26: a worn piece's score includes what it adds to its set's bonus (taking it off loses that)
	for (const s of GEAR_SLOTS) { w[s] = slot_value(sl[s], character.ctype, ws, s); if (owned(s)) own[s] = true; }
	const mh = sl.mainhand && G.items[sl.mainhand.name];
	// wn (v25.65): what each slot holds, name and level — a higher level of the same piece is a win by any margin
	const wn = {}; for (const s of GEAR_SLOTS) if (sl[s]) wn[s] = [sl[s].name, sl[s].level || 0];
	const g = { w, own, wn, dh: !!(mh && G.classes[character.ctype]?.doublehand?.[mh.wtype]), has_off: !!sl.offhand, sets: ws.sets, sset: ws.sset, off };
	my_gear_cache = { at: now, key, g };
	return g;
}
// Slots an item could go in for a class (main-hand weapons only; two-handers only with the offhand free)
function slots_for(name, ctype, g) {
	const def = G.items[name], cls = G.classes[ctype] || {};
	if (!def || !GEAR.has(def.type) || (def.class && !def.class.includes(ctype))) return [];
	if (def.type === "weapon") {
		// v19.7: a two-hander is judged even with an offhand worn (it then has to beat mainhand + offhand together)
		return cls.mainhand?.[def.wtype] || cls.doublehand?.[def.wtype] ? ["mainhand"] : [];
	}
	if (OFFHAND_TYPES.has(def.type)) return cls.offhand?.[def.type] && !g.dh ? ["offhand"] : [];
	return SLOT_OF[def.type] || [];
}
// Best slot for an item and how much it beats what's there; null unless it clears gear_min_gain and gear_margin
const is_2h = (name, ctype) => { const d = G.items[name]; return d?.type === "weapon" && !!G.classes[ctype]?.doublehand?.[d.wtype] && !G.classes[ctype]?.mainhand?.[d.wtype]; };
function gear_gain(item, ctype, g) {
	if (!item || !g?.w) return null;
	let best = null;
	for (const s of slots_for(item.name, ctype, g)) {
		// v24.26: valued in that slot for that member: alone + what it adds to a set it'd complete there
		const score = slot_value(item, ctype, g, s);
		// a two-hander replaces the offhand too: it must beat both
		const cur = (g.w[s] ?? 0) + (s === "mainhand" && is_2h(item.name, ctype) && !g.dh ? g.w.offhand ?? 0 : 0), gain = score - cur;
		// a slot the guide is actively working on only takes a clearly better item (gear_guide_override)
		const margin = g.own?.[s] ? Math.max(CFG.gear_margin, CFG.gear_guide_override) : CFG.gear_margin;
		// v25.35 (owner: "Dex is better than literally nothing in a slot"): an empty slot takes anything worth more than
		// nothing — a dex earring is 0.6 pts for a mage, under gear_min_gain, and Sanala's earring slots stayed empty
		// while one sat in the merchant's bags. gear_min_gain and the margin are for swaps.
		const empty = !(cur > 0);
		// v25.65 (owner: "Everyone is wearing one at level 0, which means upgrading to level 1 is a win"): the same piece
		// at a higher level is no swap for noise — any gain counts (an orbg+1 over the +0: +1 str/int/dex, under gear_min_gain)
		const same = g.wn?.[s]?.[0] === item.name && (item.level || 0) > g.wn[s][1];
		if ((empty || same ? gain > 0 : gain >= CFG.gear_min_gain && gain >= cur * margin) && (!best || gain > best.gain)) best = { slot: s, gain, score, same };
	}
	return best;
}
// v25.36 (Fable, #22): worth spending on — gear_gain, but an empty slot's piece too must clear gear_min_gain. Filling
// an empty slot with what we already hold is free; paying for it (a Ponty compound copy, a craft, a token,
// a lower compound odds floor) is only for a real gain.
const gear_gain_min = (item, ctype, g) => { const r = gear_gain(item, ctype, g); return r && (r.gain >= CFG.gear_min_gain || r.same) ? r : null; }; // (v25.65: a higher level of the worn piece)
// Members that could use an item more than what they wear (us first); version-matched partners only
function gear_takers() {
	const out = [{ name: character.name, ctype: character.ctype, g: my_gear() }];
	for (const p of partners()) if (p.gear?.w) out.push({ name: p.name, ctype: p.ctype, g: p.gear, esize: p.esize, p });
	return out;
}
// (a merchant that doesn't wear gear isn't a taker for itself: v24.7)
// self_taker_ok(): role function (v25.11) — a fighter always wears what helps it; the merchant only with merchant.wear_gear
const gear_wanted_by = (item) => CFG.gear_auto && gear_takers().find((m, i) => (i > 0 || self_taker_ok()) && gear_gain(item, m.ctype, m.g));
// An upgrade for us (not refused by the server) or for a fighter: such a piece is never banked, sold or listed
const wanted_by_member = (item) => CFG.gear_auto && gear_takers().some((m, i) => (i > 0 || (!equip_paused(item) && self_taker_ok())) && gear_gain(item, m.ctype, m.g));
// Gear in the bank that beats what we wear: one per slot (the best), as task_bank fetch entries
function bank_upgrades() {
	if (!CFG.gear_auto || !CFG.bank) return [];
	const g = my_gear(), offers = [];
	// the merchant fetches fighters' upgrades and delivers them; with no merchant online, fighters fetch each other's
	// (share_gear hands them over when near)
	const takers = !merchant_recent() ? gear_takers().slice(1) : [];
	(state.bank_gear || []).forEach((it, i) => {
		const own = !equip_paused(it) && gear_gain(it, character.ctype, g);
		const theirs = () => takers.map((m) => [m.name, gear_gain(it, m.ctype, m.g)]).filter(([, r]) => r);
		// v24.5: a fighter keeps first claim; the merchant takes a piece only if no fighter would
		const cands = bank_cands(own, theirs); // role function (v25.11)
		for (const [who, r] of cands) offers.push({ ms: `${who}:${r.slot}`, i, gain: r.gain, it });
	});
	// v23.2: one piece per (member, slot); v24.5: and each bank copy to one (member, slot), biggest gains first — a
	// piece best for two members went to one, and the other's next-best piece was never fetched
	const used_ms = new Set(), used_i = new Set(), out = [];
	for (const o of offers.sort((a, b) => b.gain - a.gain)) {
		if (used_ms.has(o.ms) || used_i.has(o.i)) continue;
		used_ms.add(o.ms); used_i.add(o.i);
		const it = o.it;
		out.push({ name: it.name, level: it.level, p: it.p, stat_type: it.stat_type, exact: true, gain: o.gain,
			key: `gear:${it.name}:${it.level}${it.p ? ":" + it.p : ""}${it.stat_type ? ":" + it.stat_type : ""}` });
	}
	return out;
}
// A piece the server refused to equip (level, class...) isn't tried, fetched or held for 6h
const equip_paused = (it) => skipped(`equip:${it.name}:${it.level || 0}`);
// Wear the best upgrade in the bags (one equip per call; the replaced piece drops into the bags and is judged again)
let gear_busy = false;
// v24.5: the merchant wears only what no fighter would (and never a project or guide copy): it equipped fighter pieces
// the moment it held them — deliveries, Ponty buys, a project's in-progress copy (whose loss restarted the project) —
// and nothing ever took them off again. What it wears that a fighter now wants comes off, for gear_target to deliver.
let m_release_at = 0;
async function equip_upgrades() {
	if (!CFG.gear_auto || gear_busy || character.rip || errand_busy()) return false;
	const needed = needed_slots(), g = my_gear(), M_ = is_merchant(), off_s = travel_off_slots();
	const fighters = M_ ? gear_takers().slice(1).filter((m) => m.ctype !== "merchant") : [];
	const for_fighter = (it) => fighters.some((m) => gear_gain(it, m.ctype, m.g));
	let best = null;
	character.items.forEach((it, k) => {
		if (!it || equip_paused(it) || (M_ && (!CFG.merchant.wear_gear || needed.has(k) || for_fighter(it)))) return;
		const r = gear_gain(it, character.ctype, g);
		if (r && off_s.has(r.slot)) return; // v24.27: its piece is off for a walk and goes back on after it
		// a copy the guide holds as an upgrade/compound input is worn only when clearly better (v20.0)
		if (r && needed.has(k) && r.gain < (g.w[r.slot] || 0) * CFG.gear_input_gain) return;
		if (r && (!best || r.gain > best.gain)) best = { ...r, k, it };
	});
	// (c) wearing a two-hander: a one-hander + offhand from the bags may beat it together (the offhand goes on next)
	if (!best && g.dh && !off_s.has("mainhand") && !off_s.has("offhand")) {
		let one = null, off = null;
		character.items.forEach((it, k) => {
			if (!it || equip_paused(it) || needed.has(k) || (M_ && (!CFG.merchant.wear_gear || for_fighter(it)))) return;
			const d = G.items[it.name], cls = G.classes[character.ctype] || {};
			if (!d) return;
			if (d.type === "weapon" && cls.mainhand?.[d.wtype] && !is_2h(it.name, character.ctype)) { const sc = slot_value(it, character.ctype, g, "mainhand"); if (!one || sc > one.sc) one = { k, it, sc }; }
			if (OFFHAND_TYPES.has(d.type) && cls.offhand?.[d.type]) { const sc = slot_value(it, character.ctype, g, "offhand"); if (!off || sc > off.sc) off = { k, it, sc }; }
		});
		const cur = g.w.mainhand || 0, sum = (one?.sc || 0) + (off?.sc || 0);
		if (one && off && character.esize >= 1 && sum - cur >= CFG.gear_min_gain && sum - cur >= cur * CFG.gear_margin)
			best = { slot: "mainhand", gain: sum - cur, score: one.sc, k: one.k, it: one.it };
	}
	if (!best && M_ && fighters.length && character.esize >= 2 && Date.now() - m_release_at > 60_000 && typeof unequip === "function") {
		const s_ = GEAR_SLOTS.find((s) => { const X = character.slots?.[s]; return X && !X.l && !X.b && for_fighter(X); });
		if (s_ && can_spend(EMIT_COST.equip, RESERVE.errand)) {
			const X = character.slots[s_];
			m_release_at = Date.now();
			gear_busy = true;
			try { await T(unequip(s_)); game_log(`gear: took off ${X.name}+${X.level || 0} — an upgrade for a fighter`, C.ok); return true; }
			catch (e) { game_log(`gear: unequip ${s_}: ${why(e)}`, C.dim); return false; } finally { gear_busy = false; }
		}
	}
	if (!best || !can_spend(EMIT_COST.equip, RESERVE.errand)) return false;
	gear_busy = true;
	try {
		// a two-hander over an offhand: take the offhand off first (needs a free bag slot)
		if (best.slot === "mainhand" && is_2h(best.it.name, character.ctype) && character.slots?.offhand) {
			if (character.esize < 1) return false;
			await T(unequip("offhand"));
		}
		await T(equip(best.k, best.slot));
		game_log(`gear: ${best.it.name}+${best.it.level || 0} → ${best.slot} (+${best.gain.toFixed(0)} pts)`, C.ok);
		return true;
	} catch (e) {
		skip(`equip:${best.it.name}:${best.it.level || 0}`, 6 * 3600_000, why(e));
		game_log(`gear: equip ${best.it.name}+${best.it.level || 0}: ${why(e)} — not trying it for 6h`, C.dim);
		return false;
	} finally { gear_busy = false; }
}
// Hand a bag spare to a nearby member it's an upgrade for (one item per call). Items that are upgrades for us stay;
// locked/bound items and copies the guide needs are never sent.
async function share_gear() {
	if (!CFG.gear_auto || !(in_party_cfg() || is_merchant()) || gear_busy || character.rip || typeof send_item !== "function") return false;
	const near = new Set(partners_near(CFG.gear_share_range).map((p) => p.name));
	const takers = gear_takers().slice(1).filter((m) => near.has(m.name) && (m.esize ?? 1) > 0), now = Date.now();
	// v20.0: the merchant (near, from its heartbeat) takes what no fighter would wear
	const M = merchant_hb();
	const Mt = M && M.gear?.w && (M.esize ?? 0) > 2 && M.map === character.map && Math.hypot((parent.entities?.[M.name] || M).x - character.x, (parent.entities?.[M.name] || M).y - character.y) <= CFG.gear_share_range
		? { name: M.name, ctype: "merchant", g: M.gear } : null;
	if (!takers.length && !Mt) return false;
	const needed = needed_slots(), mine = my_gear();
	for (let k = 0; k < character.items.length; k++) {
		const it = character.items[k];
		if (!it || it.l || it.b || needed.has(k) || !GEAR.has(G.items[it.name]?.type) || (!is_merchant() && !equip_paused(it) && gear_gain(it, character.ctype, mine))) continue;
		let to = null;
		for (const m of takers) {
			const r = gear_gain(it, m.ctype, m.g);
			if (r && (!to || r.gain > to.gain)) to = { ...r, m };
		}
		// v24.7: the merchant hands a piece only to the fighter it helps most (gear_target walks to that one), not to
		// whoever is near when it serves someone
		if (to && !merchant_gives_to(it, to.m.name)) to = null; // v25.5+: merchant/ — only to the fighter it helps most
		if (!to && Mt && CFG.merchant.wear_gear) { const r = gear_gain(it, "merchant", Mt.g); if (r) to = { ...r, m: Mt }; }
		const key = `${it.name}:${it.level || 0}>${to?.m.name}`;
		if (!to || now - (state.gear_sent[key] || 0) < 600_000 || !can_spend(1, RESERVE.errand)) continue;
		state.gear_sent[key] = now;
		gear_busy = true;
		try {
			await T(send_item(to.m.name, k, 1));
			game_log(`gear: gave ${it.name}+${it.level || 0} to ${to.m.name} for its ${to.slot} (+${to.gain.toFixed(0)} pts)`, C.ok);
			return true;
		} catch (e) { game_log(`gear: giving ${it.name} to ${to.m.name}: ${why(e)}`, C.dim); } finally { gear_busy = false; }
	}
	return false;
}
// Worn pieces per slot (heartbeat), so members can spot swaps that help both
function worn_items() {
	const out = {}, sl = character.slots || {};
	for (const s of GEAR_SLOTS) if (sl[s]) out[s] = { name: sl[s].name, level: sl[s].level || 0, p: sl[s].p, stat_type: sl[s].stat_type, l: !!(sl[s].l || sl[s].b) };
	return out;
}
setInterval(() => { equip_upgrades().then((did) => did || drink_elixir()).then((did) => did || share_gear()).then((did) => did || swap_worn()).then((did) => did || send_tokens()).catch(() => {}); }, 5_000);
