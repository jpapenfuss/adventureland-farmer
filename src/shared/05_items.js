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
	const g = { w, own, dh: !!(mh && G.classes[character.ctype]?.doublehand?.[mh.wtype]), has_off: !!sl.offhand, sets: ws.sets, sset: ws.sset, off };
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
		if (gain >= CFG.gear_min_gain && gain >= cur * margin && (!best || gain > best.gain)) best = { slot: s, gain, score };
	}
	return best;
}
// Members that could use an item more than what they wear (us first); version-matched partners only
function gear_takers() {
	const out = [{ name: character.name, ctype: character.ctype, g: my_gear() }];
	for (const p of partners()) if (p.gear?.w) out.push({ name: p.name, ctype: p.ctype, g: p.gear, esize: p.esize, p });
	return out;
}
// (a merchant that doesn't wear gear isn't a taker for itself: v24.7)
const self_taker_ok = () => !is_merchant() || CFG.merchant.wear_gear;
const gear_wanted_by = (item) => CFG.gear_auto && gear_takers().find((m, i) => (i > 0 || self_taker_ok()) && gear_gain(item, m.ctype, m.g));
// An upgrade for us (not refused by the server) or for a fighter: such a piece is never banked, sold or listed
const wanted_by_member = (item) => CFG.gear_auto && gear_takers().some((m, i) => (i > 0 || (!equip_paused(item) && self_taker_ok())) && gear_gain(item, m.ctype, m.g));
// Gear in the bank that beats what we wear: one per slot (the best), as task_bank fetch entries
function bank_upgrades() {
	if (!CFG.gear_auto || !CFG.bank) return [];
	const g = my_gear(), offers = [];
	// the merchant fetches fighters' upgrades and delivers them; with no merchant online, fighters fetch each other's
	// (share_gear hands them over when near)
	const takers = is_merchant() || !merchant_recent() ? gear_takers().slice(1) : [];
	(state.bank_gear || []).forEach((it, i) => {
		const own = !equip_paused(it) && gear_gain(it, character.ctype, g);
		const theirs = () => takers.map((m) => [m.name, gear_gain(it, m.ctype, m.g)]).filter(([, r]) => r);
		// v24.5: a fighter keeps first claim; the merchant takes a piece only if no fighter would
		const cands = is_merchant() ? (theirs().length ? theirs() : own && CFG.merchant.wear_gear ? [[character.name, own]] : []) : own ? [[character.name, own]] : theirs();
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
	const M = !is_merchant() && merchant_hb();
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
// ---- Travel gear (v24.27): pieces that slow us come off for long walks, and go back on when they end ----
// Our own long walk (go_raw's trip), or the walk just ended a moment ago (between a route's legs, a group hold)
// v24.31: ...or we're the leader holding for stragglers on the way (group_hold): still the same trip — the followers'
// gear went on and off with every hold
const own_long_walk = () => !!trip.long && (walking() || Date.now() - trip.end < CFG.travel_gear.settle_ms || !!state.group_wait);
// Are we on a long walk now? A follower walks with its leader (heartbeat lw), not through go()
function travel_long() {
	if (state.pack && character.map === state.pack.map && in_boundary(state.pack.boundary, 250)) return false; // at the spot
	if (own_long_walk() && !(errand_busy() && !walking())) return true; // an errand at its NPC isn't travelling
	if (errand_busy() || !is_follower()) return false;
	const L = leader_hb();
	// walking with it: same map, within reach of it (a member holding somewhere else isn't travelling)
	return !!L?.lw && partners_near(2 * CFG.party.follow_far).includes(L);
}
// Why the travel gear must go back on now (null: no reason)
function travel_danger() {
	if (character.hp < character.max_hp * 0.5) return "low HP";
	const party = party_names();
	for (const id in parent.entities || {}) {
		const e = parent.entities[id];
		if (e && e.type === "monster" && e.visible && !e.dead && e.target && party.has(e.target) && distance(character, e) <= CFG.travel_gear.danger_px)
			return `${e.mtype} on ${e.target === character.name ? "us" : e.target}`;
	}
	if (character.ctype === "priest" && partners_near(400).some((p) => p.max_hp && p.hp < p.max_hp * 0.6)) return "a member needs heals";
	return null;
}
// Worn pieces worth taking off: speed they cost us (own speed + class modifier, and the dex/str speed they give),
// the HP/MP the server would clamp away, biggest speed first
function travel_candidates() {
	const T_ = CFG.travel_gear, out = [], sl = character.slots || {};
	for (const s of GEAR_SLOTS) {
		const it = sl[s];
		if (!it || it.b || !G.items[it.name] || skipped(`tgear:${s}`)) continue;
		const p = gear_stats(it, character.ctype);
		const speed = -(p.speed || 0) - Math.max(0, p.dex || 0) / 32 - Math.max(0, p.str || 0) / 64;
		if (speed < T_.min_speed) continue;
		const dhp = (p.hp || 0) + (p.str || 0) * 21 + (p.vit || 0) * (48 + character.level / 3), dmp = (p.mp || 0) + (p.int || 0) * 15;
		const hp_loss = Math.max(0, character.hp - (character.max_hp - dhp)), mp_loss = Math.max(0, character.mp - (character.max_mp - dmp));
		if (hp_loss > character.max_hp * T_.max_hp_loss || mp_loss > character.max_mp * T_.max_mp_loss) continue;
		out.push({ slot: s, it, speed: round1(speed), hp_loss: Math.round(hp_loss), mp_loss: Math.round(mp_loss) });
	}
	return out.sort((a, b) => b.speed - a.speed);
}
// Bag slot of a piece we took off (exact copy), -1 if it's gone
const travel_bag_slot = (r) => character.items.findIndex((i) => i && i.name === r.name && (i.level || 0) === (r.level || 0) &&
	(i.p || null) === (r.p || null) && (i.stat_type || null) === (r.stat_type || null));
const travel_slots_held = () => new Set(state.travel_off.map(travel_bag_slot).filter((k) => k >= 0));
const travel_off_slots = () => new Set(state.travel_off.map((r) => r.slot));
// v24.31: a swap changes our speed mid-step; the client keeps walking its old step and drifts off the server's position
// (the pathfinder then clips a corner and stands there). Stop the step: the walk in flight re-plans from where we are.
const travel_resync = () => { if (character.moving) try { stop("move"); } catch (e) {} };
// v24.31: our combat stats with everything on (taken as the pieces come off): the heartbeat keeps sending these, so the
// leader doesn't judge spots on a priest without its staff
// v24.36: kept in state and saved with travel_off — after a reload mid-walk the pieces were still off but these were
// gone, so the heartbeat sent the stripped stats again and the leader's verdicts flipped with every swap
const HB_COMBAT = ["attack", "frequency", "max_hp", "armor", "resistance", "range", "apiercing", "rpiercing", "max_mp"];
const travel_stats = { off: 0, on: 0, last: null, at: 0 }; // report: pieces taken off / put back since load, the last action
let travel_restored_at = 0;
async function travel_strip() {
	const T_ = CFG.travel_gear;
	const cands = travel_candidates().slice(0, Math.max(0, character.esize - T_.keep_free)); // each needs a free bag slot
	let n = 0;
	if (cands.length && !state.travel_off.length) state.travel_full = Object.fromEntries(HB_COMBAT.map((k) => [k, character[k] || 0]));
	for (const c of cands) {
		if (gear_busy || !can_spend(EMIT_COST.unequip, RESERVE.errand)) break;
		gear_busy = true;
		try { await T(unequip(c.slot)); } catch (e) { game_log(`travel gear: unequip ${c.slot}: ${why(e)}`, C.dim); } finally { gear_busy = false; }
		if (character.slots?.[c.slot]) { skip(`tgear:${c.slot}`, 600_000, "unequip failed"); continue; }
		state.travel_off.push({ slot: c.slot, name: c.it.name, level: c.it.level || 0, p: c.it.p || null, stat_type: c.it.stat_type || null, speed: c.speed });
		n++;
	}
	if (n) {
		my_gear_cache = null; travel_resync();
		const txt = state.travel_off.map((r) => `${r.name}+${r.level} (${r.speed} speed)`).join(", ");
		travel_stats.off += n; travel_stats.last = `took off ${txt}`; travel_stats.at = Date.now();
		game_log(`travel gear: took off ${txt} for the walk`, C.dim);
		save_state(); // a reload mid-walk must still know to put them back on
	}
	return n > 0;
}
// Put everything back on (mainhand first: a two-hander needs the offhand free, as it was). A slot something else went
// into meanwhile, or a piece no longer in the bags, is dropped from the list (the piece is judged as any bag item).
let restore_p = null; // one restore at a time (the tick, an errand's start and its walk's end can all ask)
function travel_restore(why_) {
	if (!restore_p) restore_p = travel_restore_run(why_).finally(() => { restore_p = null; });
	return restore_p;
}
async function travel_restore_run(why_) {
	if (!state.travel_off.length || character.rip) return false;
	if (channeling() && why_ !== "errand" && why_ !== "arrived") return false; // equip would cancel the town channel
	const list = [...state.travel_off].sort((a, b) => (b.slot === "mainhand") - (a.slot === "mainhand"));
	let n = 0;
	for (const r of list) {
		const drop = () => { state.travel_off = state.travel_off.filter((x) => x !== r); };
		await wait_budget(EMIT_COST.equip, RESERVE.skill);
		while (gear_busy) await sleep_ms(100);
		if (character.slots?.[r.slot]) { drop(); continue; }
		const k = travel_bag_slot(r);
		if (k < 0) { drop(); game_log(`travel gear: ${r.name}+${r.level} is no longer in the bags`, C.warn); continue; }
		gear_busy = true;
		try { await T(equip(k, r.slot)); } catch (e) { game_log(`travel gear: equip ${r.name}: ${why(e)}`, C.dim); } finally { gear_busy = false; }
		if (character.slots?.[r.slot]?.name === r.name) { drop(); n++; }
		else if (!character.items[k] || character.items[k].name !== r.name) drop(); // moved/consumed: stop chasing it
		else if ((r.fails = (r.fails || 0) + 1) >= 3) { // refused 3 times: leave it to the gear loop (it's the slot's best piece)
			drop(); skip(`tgear:${r.slot}`, 3600_000, "re-equip refused");
			game_log(`travel gear: ${r.name}+${r.level} wouldn't go back on — left to the gear loop; not taking ${r.slot} off for 1h`, C.warn);
		}
	}
	if (n) {
		my_gear_cache = null; travel_restored_at = Date.now(); travel_resync();
		travel_stats.on += n; travel_stats.last = `put ${n} back on (${why_})`; travel_stats.at = Date.now();
		game_log(`travel gear: back on (${why_})`, C.dim);
		save_state();
	}
	return n > 0;
}
let travel_busy = false;
async function travel_gear_tick() {
	const T_ = CFG.travel_gear;
	if (travel_busy || character.rip || typeof equip !== "function" || typeof unequip !== "function") return;
	if (!T_.enabled || is_merchant()) { if (state.travel_off.length && !channeling()) { travel_busy = true; try { await travel_restore("disabled"); } finally { travel_busy = false; } } return; }
	if (channeling()) return; // equip/unequip cancel the town channel (server: player.c = {})
	travel_busy = true;
	try {
		// pieces off but no full-gear stats to report for them (saved by a version before v24.36): back on first
		if (state.travel_off.length && !state.travel_full) return void (await travel_restore("no full-gear stats"));
		const long = travel_long();
		if (!long && !state.travel_off.length) return; // nothing off, no long walk: nothing to judge
		const danger = travel_danger();
		if (state.travel_off.length) { if (!long || danger) await travel_restore(danger || "walk over"); }
		else if (long && !danger && !gear_busy && Date.now() - travel_restored_at > T_.cooldown_ms) await travel_strip();
	} finally { travel_busy = false; }
}
setInterval(() => { travel_gear_tick().catch(() => {}); }, 500);
setInterval(() => { equip_upgrades().then((did) => did || drink_elixir()).then((did) => did || share_gear()).then((did) => did || swap_worn()).catch(() => {}); }, 5_000);
// A computer (or supercomputer) in the bags lets shop/upgrade/compound/craft/exchange work from anywhere
const has_computer = () => character.items.some((i) => i && (i.name === "computer" || i.name === "supercomputer"));
// First unlocked bag slot holding name at exactly this upgrade level (-1 if none); find_slots: n of them or null
function find_slot(name, level) {
	return character.items.findIndex((i) => i && i.name === name && (i.level || 0) === (level || 0) && !i.l);
}
function find_slots(name, level, n) {
	const out = [];
	character.items.forEach((i, k) => { if (out.length < n && i && i.name === name && (i.level || 0) === level && !i.l) out.push(k); });
	return out.length === n ? out : null;
}
// Quantity in the bags: any level / exactly this level (stacks count their q)
const held_any = (name) => character.items.reduce((n, i) => n + (i && i.name === name ? i.q || 1 : 0), 0);
const held = (name, level) => character.items.reduce((n, i) => n + (i && i.name === name && (i.level || 0) === (level || 0) ? i.q || 1 : 0), 0);
// An NPC that sells this item and is somewhere we can walk to (null if none)
function shop_for(name) {
	for (const id in G.npcs) if (!G.npcs[id].ignore && (G.npcs[id].items || []).includes(name) && find_npc(id)) return id;
	return null;
}
// Walk to an NPC unless we're already within 150px (NPC actions allow 400px). A computer makes the walk unnecessary,
// except for Daisy (monsterhunter), whose hunt counter checks distance regardless.
async function go_npc(npc) {
	if (has_computer() && npc !== "monsterhunter") return;
	const loc = find_npc(npc);
	if (!loc) throw { reason: "no_npc", npc };
	if (character.map === loc.map && Math.hypot(character.x - loc.x, character.y - loc.y) < 150) return;
	await go({ map: loc.map, x: loc.x, y: loc.y + NPC_STAND_Y });
}
async function buy_from_npc(name, qty, npc) {
	const cost = (G.items[name].g || 0) * qty;
	if (G.items[name].cash || character.gold - cost < CFG.gold_reserve) throw { reason: "gold_reserve" };
	npc = npc || shop_for(name);
	if (!npc) throw { reason: "no_shop", name };
	await go_npc(npc);
	await wait_budget(1, RESERVE.errand);
	tag_spend(spend_cat_of(name));
	return T(buy(name, qty));
}
// Make sure one upgrade/compound scroll is in the bags (buy one; wait up to 3s for it to arrive)
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
// Bag slots for n copies of a.name at level `from`: the slots the guide named (resources[].num) if they still hold
// the right item, else any matching unlocked copies
function input_slots(a, from, n) {
	const hinted = (a.resources || []).map((r) => r.num).filter((k) => {
		const i = character.items[k];
		return i && i.name === a.name && (i.level || 0) === from && !i.l;
	});
	if (hinted.length >= n) return hinted.slice(0, n);
	if (n === 1) { const k = find_slot(a.name, from); return k >= 0 ? [k] : null; }
	return find_slots(a.name, from, n);
}
// Merchant 30+: massproduction halves the next upgrade/compound (a one-use buff that lasts 10s): cast it right before
async function mass_production() {
	if (character.ctype !== "merchant" || character.s?.massproduction || !G.skills.massproduction || !can_use("massproduction")) return;
	await T(use_skill("massproduction"), 3000).catch(() => {});
	await until(() => !!character.s?.massproduction, 1500);
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
// Develop: the highest-level spare in the bags (never worn gear) still below the target; -1 if none
function develop_pick(name, target) {
	let k = -1;
	character.items.forEach((i, n) => { if (i && i.name === name && !i.l && (i.level || 0) < target && (k < 0 || (i.level || 0) > (character.items[k].level || 0))) k = n; });
	return k;
}
// Upgrade scroll for an item at a level: scroll0/1/2 for the item's grade at that level (normal/high/rare)
const upgrade_scroll = (name, level) => "scroll" + Math.max(0, item_grade({ name, level }));
// One upgrade step from a guide row. If the exact input isn't owned (a "develop" step), take the best spare below
// the target (or buy a +0) and upgrade it one level. Gated by the server's own success preview and chance_floor().
async function run_upgrade(a, row) {
	let from = input_level(a, row), scroll = a.scroll || upgrade_scroll(a.name, from);
	const target = row?.request?.name === a.name && row.request.level ? row.request.level : from + 1;
	let ks = input_slots(a, from, 1);
	if (!ks) {
		let k = develop_pick(a.name, target);
		if (k < 0 && shop_for(a.name)) {
			await buy_from_npc(a.name, 1);
			await until(() => develop_pick(a.name, target) >= 0, 3000); // the bought item arrives with the next update
			k = develop_pick(a.name, target);
		}
		if (k < 0) throw { reason: "input_missing", want: `${a.name} below +${target}` };
		from = character.items[k].level || 0;
		scroll = upgrade_scroll(a.name, from);
		ks = [k];
		game_log(`develop ${a.name}: +${from} → +${from + 1} (toward +${target})`, C.info);
	}
	if (!has_computer()) await go("upgrade");
	await ensure_scroll(scroll);
	if (!has_computer()) await go("upgrade"); // buying the scroll may have walked us to another NPC
	const k = character.items[ks[0]]?.name === a.name ? ks[0] : develop_pick(a.name, from + 1);
	if (k < 0) throw { reason: "input_missing", want: `${a.name}+${from}` };
	await wait_budget(1, RESERVE.errand);
	let preview = await T(upgrade(k, find_slot(scroll, 0), null, true)); // last arg true = preview only: {chance}
	let floor = chance_floor(a.name, CFG.min_upgrade_chance, k, from);
	if (scroll === "scroll2") floor = Math.max(floor, CFG.upgrade_high.min_chance); // expensive copies: never a coin flip
	let off = null;
	if (preview && !(preview.chance >= floor)) { // v24.81: the next scroll up may lift it over (cheaper than an offering)
		const hs = "scroll" + (Math.max(0, item_grade({ name: a.name, level: from })) + 1), hc = G.items[hs]?.g;
		if (hs !== scroll && hc && hc <= (CFG.upgrade_boost_max || 0) && !(shop_for(a.name) && !G.items[a.name]?.cash) && gold_ok(hc) && character.gold - hc >= CFG.gold_reserve) {
			await ensure_scroll(hs);
			if (!has_computer()) await go("upgrade");
			await wait_budget(1, RESERVE.errand);
			const p3 = await T(upgrade(k, find_slot(hs, 0), null, true)).catch(() => null);
			if (p3?.chance >= floor) { game_log(`upgrade ${a.name}: ${hs} lifts +${from + 1} from ${Math.round(preview.chance * 100)}% to ${Math.round(p3.chance * 100)}%`, C.info); preview = p3; scroll = hs; }
		}
	}
	if (preview && !(preview.chance >= floor)) { // a Primling (or other allowed offering) in the bags may lift it over
		const ok_ = character.items.findIndex((i) => i && (CFG.upgrade_high.offerings || []).includes(i.name) && !i.l);
		if (ok_ >= 0) {
			await wait_budget(1, RESERVE.errand);
			const p2 = await T(upgrade(k, find_slot(scroll, 0), ok_, true)).catch(() => null);
			if (p2?.chance >= floor) { preview = p2; off = ok_; game_log(`upgrade ${a.name}: using ${character.items[ok_].name} (${Math.round(p2.chance * 100)}%)`, C.info); }
		}
	}
	if (!preview || !(preview.chance >= floor)) throw { reason: "low_chance", chance: preview?.chance };
	await mass_production();
	await wait_budget(1, RESERVE.errand);
	const r = await T(upgrade(k, find_slot(scroll, 0), off), 60_000); // the server takes 500·L·√L ms (+7: ~9s, +9: 13.5s)
	game_log(`upgrade ${a.name} +${from}→+${from + 1} (${(preview.chance * 100).toFixed(0)}%): ${r?.success ? "OK" : "FAILED"}`, r?.success ? C.ok : C.bad);
	log_ev("upgrade", { item: a.name, from, chance: +preview.chance.toFixed(3), ok: !!r?.success });
	return r;
}
// One compound step: three copies at level `from` + a compound scroll (cscroll0/1/2 by grade) → one at from+1.
// Failure destroys all three, hence the same success gate as upgrades.
async function run_compound(a, row, floor) {
	const from = input_level(a, row);
	const scroll = a.scroll || "cscroll" + Math.max(0, item_grade({ name: a.name, level: from }));
	if (!input_slots(a, from, 3)) throw { reason: "input_missing", want: `3x ${a.name}+${from}` }; // before walking anywhere
	if (!has_computer()) await go("compound");
	await ensure_scroll(scroll);
	if (!has_computer()) await go("compound");
	const ks = input_slots(a, from, 3);
	if (!ks) throw { reason: "input_missing", want: `3x ${a.name}+${from}` };
	await wait_budget(1, RESERVE.errand);
	const preview = await T(compound(ks[0], ks[1], ks[2], find_slot(scroll, 0), null, true));
	if (!preview || !(preview.chance >= (floor ?? chance_floor(a.name, CFG.min_compound_chance)))) throw { reason: "low_chance", chance: preview?.chance };
	await mass_production();
	await wait_budget(1, RESERVE.errand);
	const r = await T(compound(ks[0], ks[1], ks[2], find_slot(scroll, 0)), 40_000); // the server takes 10s to combine
	game_log(`compound ${a.name} +${from}→+${from + 1} (${(preview.chance * 100).toFixed(0)}%): ${r?.success ? "OK" : "FAILED"}`, r?.success ? C.ok : C.bad);
	log_ev("compound", { item: a.name, from, chance: +preview.chance.toFixed(3), ok: !!r?.success });
	return r;
}

// Own compounding (CFG.compound_auto). A group = one item name at one level with >= 3 spare copies across bags and
// bank. Bank copies are fetched on the next bank visit (bag_plan) and kept in the bags until compounded.
const compound_key = (name, level) => `cmp:${name}:${level}`;
function compound_spare(it, k, needed) {
	const def = it && G.items[it.name];
	// v24.73: a copy a member would wear is no longer left out. Three skull amulets sat in the merchant's bags, each
	// "wanted" for one empty amulet slot, so there was never a set of three; the +1 goes to whoever wanted the +0.
	// (v24.87: titled copies too — the server doesn't check titles; the result is the first copy, so a titled one goes first)
	return !!def?.compound && !it.l && !it.b && !needed.has(k) && (it.level || 0) < cmp_top(it.name) &&
		!CFG.keep.includes(it.name);
}
// Report: three or more equal copies in the bags that aren't being compounded, and why
function compound_why() {
	const by = {}, needed = needed_slots(), groups = compound_groups();
	character.items.forEach((it, k) => { if (it && G.items[it.name]?.compound) (by[compound_key(it.name, it.level || 0)] = by[compound_key(it.name, it.level || 0)] || []).push([it, k]); });
	const out = [];
	for (const key in by) {
		const L = by[key], [it] = L[0];
		if (L.length < 3 || groups.some((g) => g.key === key)) continue;
		const lv = it.level || 0;
		const why_ = skipped(key) ? `paused ${mins(state.gear_skip[key])} (${skip_why[key] || "?"})` : lv >= cmp_top(it.name) ? `+${lv} is its ceiling here (max +${CFG.compound_max_level}, or the odds were under ${Math.round(CFG.compound_min_chance * 100)}%)`
			: CFG.keep.includes(it.name) ? "on the keep list" : L.some(([i]) => i.l || i.b) ? "locked or bound copies" : L.some(([i]) => i.p) ? "titled copies" : L.some(([, k]) => needed.has(k)) ? "copies held for a quest or project"
			: !CFG.compound_auto ? "compound_auto is off" : !is_merchant() && merchant_does_it() ? "the merchant compounds" : "?";
		out.push(`${it.name}+${lv} x${L.length}: ${why_}`);
	}
	return out;
}
// Compound ceilings (v24.15): item -> { level, at } where the server's odds were under our floor; 7 days (saved)
const cmp_cap = (name, level) => { state.cmp_caps[name] = { level, at: Date.now() }; cmp_cache = null; };
const cmp_top = (name) => {
	const c = state.cmp_caps[name];
	let top = Math.min(CFG.compound_max_level, c && Date.now() - c.at < 7 * 86400_000 ? c.level : Infinity);
	// a refusal for its odds paused before v24.15 (a 6h skip, no ceiling recorded) counts too
	for (let L = 0; L < top; L++) if (skipped(compound_key(name, L)) && /low_chance/.test(skip_why[compound_key(name, L)] || "")) { top = L; break; }
	return top;
};
let cmp_cache = null; // { key, at, list }: keyed by bags + bank snapshot + pauses; bag_class asks once per item
function compound_groups(needed) {
	// while the merchant is online it compounds for everyone (shared bank); fighters hand it their spares instead
	if (!CFG.compound_auto || (!is_merchant() && merchant_does_it())) return [];
	const key = character.items.map((i) => (i ? `${i.name}${i.level || 0}${i.l ? "l" : ""}` : "")).join() + "|" +
		(state.bank_gear || []).length + "|" + Object.keys(state.gear_skip).filter((k) => k.startsWith("cmp:") && skipped(k)).join();
	if (cmp_cache && cmp_cache.key === key && Date.now() - cmp_cache.at < 2000) return cmp_cache.list;
	needed = needed || needed_slots();
	const by = {};
	const add = (it, where, k) => {
		const key = compound_key(it.name, it.level || 0);
		const g = (by[key] = by[key] || { name: it.name, level: it.level || 0, key, bags: [], bank: 0 });
		if (where === "bags") g.bags.push(k); else g.bank++;
	};
	character.items.forEach((it, k) => { if (compound_spare(it, k, needed)) add(it, "bags", k); });
	for (const it of state.bank_gear || []) if (compound_spare(it, -1, needed)) add(it, "bank");
	for (const g of Object.values(by)) g.bags.sort((a, b) => (character.items[b]?.p ? 1 : 0) - (character.items[a]?.p ? 1 : 0));
	const list = Object.values(by).filter((g) => g.bags.length + g.bank >= 3 && !skipped(g.key))
		.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)); // cheapest scrolls / best odds first
	cmp_cache = { key, at: Date.now(), list };
	return list;
}
// Bank copies to fetch so a group reaches 3 in the bags (task_bank entries; one attempt per copy per 2h)
// Bank copies to fetch for up to compound_per_run whole sets in one bank visit (cheapest level first), within the free
// bag slots minus 6 for loot. Keys get a 10-min retry guard (bag_plan), not the 2h one: a successful fetch lowers the
// bank count anyway.
function compound_fetches(groups) {
	const out = [];
	let room = Math.max(0, character.esize - 6), sets = CFG.compound_per_run;
	for (const g of groups) {
		if (sets <= 0 || room <= 0) break;
		const n_sets = Math.min(sets, Math.floor((g.bags.length + g.bank) / 3));
		const copies = Math.min(g.bank, room, Math.max(0, n_sets * 3 - g.bags.length));
		for (let i = 0; i < copies; i++) out.push({ name: g.name, level: g.level, key: `${g.key}:${i}` });
		room -= copies;
		sets -= Math.floor((g.bags.length + copies) / 3);
	}
	return out;
}
// Bag slots held for a group: the copies that, with the bank's, make up complete sets of three
function compound_slots(needed) {
	const keep = new Set();
	for (const g of compound_groups()) g.bags.slice(0, Math.floor((g.bags.length + g.bank) / 3) * 3).forEach((k) => keep.add(k));
	return keep;
}
// Compound every complete group in the bags (up to compound_per_run). A failed preview pauses that group 6h; a
// result that's a member's upgrade is picked up by equip_upgrades/share_gear.
async function task_compound() {
	let n = 0;
	for (let guard = 0; guard < CFG.compound_per_run * 2 && n < CFG.compound_per_run; guard++) {
		if (state.errand) state.errand_at = Date.now(); // progress keeps the errand lock
		const g = compound_groups().find((x) => x.bags.length >= 3);
		if (!g) break;
		// rebuyable odds only when the three copies are cheap: a +L copy embodies 3^L base copies (v23.1)
		const wanted = gear_takers().filter((m) => m.ctype !== "merchant").some((m) => gear_gain({ name: g.name, level: g.level + 1 }, m.ctype, m.g));
		const floor = Math.min(shop_for(g.name) && !G.items[g.name]?.cash && 3 * (G.items[g.name]?.g || 0) * Math.pow(3, g.level) <= CFG.rebuy_loss_max
			? CFG.compound_min_chance_rebuyable : CFG.compound_min_chance, wanted ? CFG.compound_min_chance_wanted : 1);
		const sc_cost = G.items["cscroll" + Math.max(0, item_grade({ name: g.name, level: g.level }))]?.g || 0;
		if (!gold_ok(sc_cost)) { town_reason.compound = `gold budget (${g.name}+${g.level} needs a ${fmt_k(sc_cost)} scroll)`; break; }
		try {
			// resources: the exact spare slots, so run_compound never grabs a guide-needed copy of the same item
			const before = g.bags.slice(0, 3).map((k) => character.items[k]);
			const r = await run_compound({ name: g.name, level: g.level, resources: g.bags.map((num) => ({ num })) }, null, floor);
			n++;
			if (!r?.success) {
				await sleep_ms(500); // let the bag update arrive
				// inputs still there = the server refused without rolling (not a real failure): don't retry soon, or
				// each retry would cost a town trip
				const untouched = before.every((it, i) => character.items[g.bags[i]] === it);
				skip(g.key, untouched ? 6 * 3600_000 : 600_000, untouched ? `refused: ${why(r)}` : "last compound failed");
			}
		} catch (e) {
			// only verdicts about the items themselves are worth a 6h pause; walking/transient failures retry in 10 min
			const item_verdict = ["low_chance", "not_combinable", "mismatch"].includes(why(e));
			// v24.15: odds don't change — that level is this item's compound ceiling (7 days): no more fetching the copies
			// out of the bank every 6h to be refused again
			if (why(e) === "low_chance") cmp_cap(g.name, g.level);
			if (item_verdict) n++; // v24.74: a verdict on one set is a result — it used to pause all compounding 15 min ("achieved nothing")
			skip(g.key, item_verdict ? 6 * 3600_000 : 600_000, `${why(e)}${e?.chance !== undefined ? ` (${Math.round(e.chance * 100)}%)` : ""}`); // no gold: retry in 10 min
			town_reason.compound = `${g.name}+${g.level}: ${why(e)}`;
			game_log(`compound ${g.name}+${g.level}: ${why(e)}; retrying in ${item_verdict ? "6h" : "10 min"}`, C.dim);
		}
	}
	return n;
}

// ---- Own upgrading (CFG.upgrade_auto) ----
// Highest level ≤ upgrade_max_level reachable with scroll0/scroll1 (0 = none)
// high: also scroll2 levels, up to upgrade_high.max_level (weapon slots only, decided by the caller)
function upgrade_target(name, high = false) {
	let to = 0;
	const max = high ? CFG.upgrade_high.max_level : CFG.upgrade_max_level;
	for (let l = 1; l <= max; l++) {
		const sc = upgrade_scroll(name, l - 1);
		if ((sc === "scroll2" && !high) || sc === "scroll3" || !G.items[sc]) break;
		to = l;
	}
	return to;
}
// Gold a project may draw on: our own above the reserve; the merchant also counts fighters' gold above fund_keep
// (they send it on supply runs when a step needs it)
function upgrade_gold() {
	let g = character.gold - (is_merchant() ? CFG.merchant.donate.keep : CFG.gold_reserve);
	if (is_merchant()) for (const p of partners()) g += Math.max(0, (p.gold || 0) - CFG.merchant.fund_keep);
	return Math.max(0, g);
}
// Gold for a +0 copy and the scrolls up to `to` (no failures counted)
function upgrade_cost(name, to) {
	let c = G.items[name]?.g || 0;
	for (let l = 0; l < to; l++) c += G.items[upgrade_scroll(name, l)]?.g || 1e9;
	return c;
}
// Upgrade ceilings (v24.5): item -> { level, at } where a project of it was stopped by its odds or its failures.
// Kept 7 days (saved). A re-pick aims no higher, and is skipped while a copy at that level exists anywhere.
const upg_cap = (name, level) => { state.upg_caps[name] = { level, at: Date.now() }; };
const upg_cap_level = (name) => { const c = state.upg_caps[name]; return c && Date.now() - c.at < 7 * 86400_000 ? c.level : Infinity; };
const best_level_held = (name) => character.items.reduce((m, i) => (i && i.name === name && !i.l ? Math.max(m, i.level || 0) : m), -1);
// Best project: the NPC-sold piece whose upgraded copy beats a member's worn piece by the most points per gold
// v24.82: the server's base upgrade odds by the item's starting grade (design/upgrades.py), result level 1..10
const UPG_ODDS = { 0: [0.9999999, 0.98, 0.95, 0.70, 0.60, 0.40, 0.25, 0.15, 0.07, 0.024], 1: [0.99998, 0.97, 0.94, 0.68, 0.58, 0.38, 0.24, 0.14, 0.066, 0.018],
	2: [0.97, 0.94, 0.92, 0.64, 0.52, 0.32, 0.232, 0.13, 0.062, 0.015] };
const upg_odds = (name, to) => (UPG_ODDS[Math.min(2, Math.max(0, item_grade({ name, level: 0 })))] || UPG_ODDS[0])[to - 1] || 0;
// Expected gold for one copy at +to, buying again after each failure: C(l) = (C(l-1) + scroll) / odds(l)
function upgrade_expected(name, to) {
	let c = G.items[name]?.g || 0;
	for (let l = 1; l <= to; l++) c = (c + (G.items[upgrade_scroll(name, l - 1)]?.g || 1e9)) / Math.max(0.01, upg_odds(name, l));
	return Math.round(c);
}
// The most one step of a project can cost: the scroll (the next one up when the boost is used) and a copy if none is held
const upg_step_cost = (name, top) => {
	const lv = Math.max(0, top), g = Math.max(0, item_grade({ name, level: lv }));
	return (G.items["scroll" + (g + 1)]?.g <= (CFG.upgrade_boost_max || 0) ? G.items["scroll" + (g + 1)].g : G.items["scroll" + g]?.g || 0) + (top < 0 ? G.items[name]?.g || 0 : 0);
};
// Is it sold by an NPC we can find? (cached: G doesn't change)
const sold_c = new Map();
const sold_by_npc = (name) => { if (!sold_c.has(name)) sold_c.set(name, !!shop_for(name)); return sold_c.get(name); };
function pick_upgrade() {
	const room = gold_room(), gold = Math.min(upgrade_gold(), room), budget = gold * CFG.upgrade_spend, H = CFG.upgrade_high;
	if (!CFG.upgrade_auto) return null; // (v24.86: a budget at 0 still lets weapon projects through; the rest fail cost > cap)
	const takers = gear_takers().filter((m) => m.ctype !== "merchant");
	let best = null;
	for (const name in G.items) {
		const def = G.items[name];
		if (!def.upgrade || !GEAR.has(def.type) || def.cash || skipped("upg:" + name) || CFG.quest_craft_skip.includes(name)) continue;
		// v24.71: only what an NPC sells. The check used to come after the winner was chosen — over every item in the
		// game: when a piece nobody sells scored best (pyjamas, for Torlis), there was no project at all, ever.
		if (!sold_by_npc(name)) continue;
		// normal target (scroll0/1 levels) and, for weapon slots, the high target (scroll2 levels too)
		const targets = [];
		const WP = CFG.upgrade_weapon?.enabled && def.type === "weapon" ? Math.min(CFG.upgrade_weapon.to, upgrade_target(name)) : 0;
		if (WP) targets.push([WP, Infinity, false, true]); // v24.86: a weapon goes straight to +7, no budget
		else for (let L = 1, T = upgrade_target(name); L <= T; L++) targets.push([L, budget, false]); // v24.82: every level, by expected cost
		if (H?.enabled) targets.push([upgrade_target(name, true), gold * H.spend, true]);
		const capL = upg_cap_level(name);
		for (let [to, cap, high, weapon] of targets) {
			if (to > capL) to = capL; // v24.5: no higher than a past project of it reached before its odds/failures stopped it
			if (!to) continue;
			const cost = high ? upgrade_cost(name, to) : upgrade_expected(name, to);
			if (cost > cap) continue;
			// a copy at the target level already exists: ours, the bank's, or (v23.2) in another member's bags or worn
			// (v24.74: a copy another member WEARS no longer counts — a wand+7 on one caster blocked the other's for good)
			if (best_level_held(name) >= to || (state.bank_gear || []).some((i) => i.name === name && (i.level || 0) >= to) || party_holds_level(name, to, true)) continue;
			// v24.7: a lower copy that's already an upgrade for a fighter is delivered first (then judged against): a project
			// held it as its input, undelivered, and rolled it at 50% odds
			const ready = (i) => i && i.name === name && !i.l && (i.level || 0) < to && takers.some((m) => gear_gain(i, m.ctype, m.g));
			if (character.items.some(ready) || (state.bank_gear || []).some(ready)) continue;
			for (const m of takers) {
				const r = gear_gain({ name, level: to }, m.ctype, m.g);
				if (!r || (high && !H.slots.includes(r.slot))) continue;
				// worth (gain x gold per point) less the expected cost; a scroll2 project only when nothing else is worth doing
				const v = weapon ? 1e12 + r.gain : high ? -1e12 + r.gain / cost : r.gain * CFG.upgrade_gold_per_pt - cost;
				if (!high && !weapon && v <= 0) continue;
				if (!best || v > best.v) best = { name, to, for: m.name, slot: r.slot, gain: Math.round(r.gain), cost, v, high, weapon: !!weapon };
			}
		}
	}
	return best;
}
// Why there's no project (report): our own pieces that would win once upgraded, and the best shop pieces with what
// stops each
function upgrade_why() {
	const out = [];
	if (!is_merchant()) {
		const own = [...character.items.filter((i) => i && !i.l && GEAR.has(G.items[i.name]?.type)).map((i) => [i, "bags"]), ...(state.bank_gear || []).map((i) => [i, "bank"])]
			.map(([i, w]) => [i, w, set_piece_plan(i.name, i.level || 0)]).filter(([, , pl]) => pl).sort((a, b) => b[2].gain - a[2].gain)[0];
		out.push(own ? `ours next: ${own[0].name}+${own[0].level || 0} (${own[1]}) → +${own[2].to} (+${own[2].gain} pts)` : "nothing we own would win once upgraded");
	}
	if (is_merchant() || !merchant_does_it()) {
		const gold = Math.min(upgrade_gold(), gold_room()), budget = gold * CFG.upgrade_spend, takers = gear_takers().filter((m) => m.ctype !== "merchant"), rows = [];
		for (const name in G.items) {
			const def = G.items[name];
			if (!def.upgrade || !GEAR.has(def.type) || def.cash || !sold_by_npc(name)) continue;
			let g = null, to = 0, cost = 0;
			for (let L = 1, T = Math.min(upgrade_target(name), upg_cap_level(name)); L <= T; L++) for (const m of takers) {
				const r = gear_gain({ name, level: L }, m.ctype, m.g), c = upgrade_expected(name, L);
				if (r && r.gain * CFG.upgrade_gold_per_pt - c > 0 && (!g || r.gain * CFG.upgrade_gold_per_pt - c > g.net)) { g = { gain: r.gain, who: m.name, net: r.gain * CFG.upgrade_gold_per_pt - c }; to = L; cost = c; }
			}
			if (!g) continue;
			const stop = skipped("upg:" + name) ? "paused" : cost > budget ? `expected cost ${fmt_k(cost)}, budget ${fmt_k(Math.max(0, budget))}`
				: best_level_held(name) >= to || (state.bank_gear || []).some((i) => i.name === name && (i.level || 0) >= to) || party_holds_level(name, to, true) ? "a spare copy at that level exists already"
				: "eligible";
			rows.push({ name, to, g, stop });
		}
		rows.sort((a, b) => b.g.gain - a.g.gain);
		out.push(rows.length ? `shop: ${rows.slice(0, 4).map((r) => `${r.name}+${r.to} for ${r.g.who} +${Math.round(r.g.gain)} pts — ${r.stop}`).join("; ")}` : "shop: no upgradable piece at its reachable level beats what anyone wears");
	}
	return out.length ? ` | ${out.join(" | ")}` : "";
}
// v24.91: is the project still worth finishing — would its target still beat what its member wears? (Sanala kept
// building a wand to +3, a project from when she held a +5 staff, after she had been handed a +7 wand.)
function upg_still_wanted(P) {
	if (!P) return false;
	const m = gear_takers().find((x) => x.name === P.for);
	if (!m || !m.g?.w) return true; // its member isn't heard from: keep it for now
	return !!gear_gain({ name: P.name, level: P.to }, m.ctype, m.g);
}
function upg_drop_if_stale() {
	const P = state.upg;
	if (!P || upg_still_wanted(P)) return false;
	game_log(`upgrade project dropped: ${P.name} +${P.to} would no longer beat what ${P.for} wears`, C.dim);
	log_ev("upgrade_drop", { item: P.name, to: P.to, for: P.for });
	state.upg = null; state.upg_pick_at = 0;
	return true;
}
// Is there upgrade work for a town run? Picks a project (every 10 min at most) when there's none.
function upgrade_due() {
	if (!CFG.upgrade_auto) return false;
	upg_drop_if_stale(); // v24.91
	set_piece_start(); // v24.69: a set piece in our bags that wins once upgraded
	if (merchant_does_it()) {
		// v21.2: the merchant runs projects now; a fighter's own one would sit forever, holding its copies in the bags
		// (v24.67: except our own project on a token piece — the copy is ours, and the merchant can't buy one)
		if (state.upg && !is_merchant() && !state.upg.own) { game_log(`upgrade project ${state.upg.name} handed to the merchant`, C.dim); state.upg = null; }
		if (!state.upg?.own) return false;
	}
	const now = Date.now();
	if (!state.upg && now - (state.upg_pick_at || 0) > 600_000) {
		state.upg_pick_at = now;
		state.upg = pick_upgrade();
		if (state.upg) game_log(`upgrade project: ${state.upg.name} → +${state.upg.to} for ${state.upg.for}'s ${state.upg.slot} (+${state.upg.gain} pts, ~${Math.round(state.upg.cost / 1000)}k)`, C.info);
	}
	if (merchant_awaits_funds()) return false; // v25.5: merchant/
	return !!state.upg && !skipped("upg:" + state.upg.name) && best_level_held(state.upg.name) < state.upg.to;
}
async function task_upgrade() {
	let n = 0;
	for (let i = 0; i < (is_merchant() ? CFG.merchant_upgrade_steps : CFG.upgrade_steps_per_run); i++) {
		if (state.errand) state.errand_at = Date.now();
		if (upg_drop_if_stale()) break; // v24.91: something better is worn now
		const P = state.upg;
		if (!P) break;
		const top = best_level_held(P.name);
		if (top >= P.to) {
			game_log(`upgrade project done: ${P.name}+${top} for ${P.for}`, C.ok);
			state.upg = null;
			state.upg_pick_at = 0; // v24.85: the next project is picked at once (there was a 10-min gap per project)
			break;
		}
		const step = (G.items[upgrade_scroll(P.name, Math.max(0, top))]?.g || 0) + (top < 0 ? G.items[P.name]?.g || 0 : 0);
		// over the party's gold budget: don't ask the fighters for gold we then couldn't spend (v19.6)
		if (!P.weapon && step > gold_room()) { town_reason.upgrade = `gold budget: next step ${fmt_k(step)}, room ${fmt_k(Math.max(0, gold_room()))}`; break; }
		if (merchant_asks_funds(P, step)) break; // v25.5: merchant/ — the fighters fund the step
		if (!(P.weapon ? character.gold - step >= (is_merchant() ? CFG.merchant.donate.keep : CFG.gold_reserve) : gold_ok(step))) { town_reason.upgrade = `gold budget: next step ${fmt_k(step)}, room ${fmt_k(Math.max(0, gold_room()))}`; break; }
		state.fund_need = 0;
		// v23.1: the gold the project's steps cost (copy + scrolls), counted per step — measuring from total gold let loot,
		// sales, potion buys and the fighters' funding move it
		if (P.spent === undefined) P.spent = 0;
		P.max = Math.max(P.max ?? -1, top); // v24.7: the highest level this project reached (a failure destroys the copy)
		// (v24.85: against the expected cost with failures, not the cost if every step succeeds)
		if (!P.weapon && P.spent > Math.max(P.cost || 0, upgrade_expected(P.name, P.to) - (P.own ? G.items[P.name]?.g || 0 : 0)) * CFG.upgrade_abort_x) {
			upg_cap(P.name, Math.max(0, P.max));
			skip("upg:" + P.name, 24 * 3600_000, "over budget");
			game_log(`upgrade ${P.name}: failures pushed the cost past ${CFG.upgrade_abort_x}x the estimate; stopped${top >= 1 ? ` at +${top}` : ""}`, C.bad);
			state.upg = null;
			break;
		}
		const g0 = character.gold;
		try {
			await run_upgrade({ name: P.name }, { request: { name: P.name, level: P.to } });
			// v24.85: at most what the step can cost (a scroll, a copy if one was bought). The gold delta alone counted a
			// transfer to the merchant made meanwhile: Torlis's shoes1 project "cost 2.5x its estimate" at +1 and stopped.
			P.spent += Math.min(Math.max(0, g0 - character.gold), upg_step_cost(P.name, top));
			n++;
		} catch (e) {
			P.spent += Math.min(Math.max(0, g0 - character.gold), upg_step_cost(P.name, top));
			// v24.7: a transient error (walk/call timeout, distance...) pauses the project, it doesn't end it: ending it freed the
			// copy (banked, never a project input again), and the re-pick rebought from +0 with the abort budget reset
			if (TRANSIENT.has(why(e))) { skip("upg:" + P.name, pause_ms(e, 600_000), why(e)); game_log(`upgrade ${P.name}: ${why(e)}; retrying in 10 min`, C.dim); break; }
			// v24.5: refused for its odds, the next step will be refused again: remember the level reached, so the project
			// isn't re-picked a day later to rebuild a copy at that level from +0 (and stopped there again, every day)
			if (e?.chance !== undefined) upg_cap(P.name, Math.max(0, P.max ?? top));
			skip("upg:" + P.name, pause_ms(e, 24 * 3600_000), why(e) + (e?.chance !== undefined ? ` (${Math.round(e.chance * 100)}%)` : ""));
			game_log(`upgrade ${P.name}: ${why(e)}; project stopped${top >= 1 ? ` at +${top}` : ""}`, C.dim);
			state.upg = null; // the copy reached so far is free again (equip/share judge it)
			break;
		}
	}
	return n;
}
// ---- Crafting for power (CFG.craft_power) ----
let quest_inputs = null; // every input of a quest recipe (Cole etc.): never spent on other crafts
let craft_cache = null; // { at, v }: bag_plan/town_due ask often; recipes scan is ~1000 entries
function craft_pick() {
	if (craft_cache && Date.now() - craft_cache.at < 10_000) return craft_cache.v;
	const v = craft_pick_raw();
	craft_cache = { at: Date.now(), v };
	return v;
}
function craft_pick_raw() {
	if (!CFG.craft_power || (!is_merchant() && merchant_does_it())) return null;
	if (!quest_inputs) { quest_inputs = new Set(); for (const id in G.craft || {}) if (G.craft[id].quest) for (const [, n] of G.craft[id].items || []) quest_inputs.add(n); }
	const gold = upgrade_gold(), takers = gear_takers().filter((m) => m.ctype !== "merchant");
	let best = null;
	for (const id in G.craft || {}) {
		const r = G.craft[id], d = G.items[id];
		if (!d || !GEAR.has(d.type) || r.quest || skipped("craft:" + id) || CFG.quest_craft_skip.includes(id) || (r.cost || 0) > gold * CFG.craft_spend) continue;
		if (held_any(id) || (state.bank_gear || []).some((i) => i.name === id)) continue;
		const inputs_ok = (r.items || []).every(([q, n, l]) => {
			const dn = G.items[n];
			return dn && !GEAR.has(dn.type) && !l && !quest_inputs.has(n) && !state.needs.has(n) && owned_in_bags_or_bank(n, 0) >= q;
		});
		if (!inputs_ok) continue;
		for (const m of takers) {
			const g = gear_gain({ name: id, level: 0 }, m.ctype, m.g);
			if (g && (!best || g.gain > best.gain)) best = { id, for: m.name, slot: g.slot, gain: Math.round(g.gain), cost: r.cost || 0 };
		}
	}
	return best;
}
const craft_inputs_in_bags = (id) => (G.craft[id]?.items || []).every(([q, n]) => held_any(n) >= q);
async function task_craft_power() {
	const c = craft_pick();
	if (!c || !craft_inputs_in_bags(c.id)) return 0;
	const r = G.craft[c.id];
	if (!gold_ok(r.cost)) return (town_reason.forge = "gold budget"), 0;
	if ((r.cost || 0) > character.gold - (is_merchant() ? CFG.merchant.donate.keep : CFG.gold_reserve)) {
		merchant_asks_funds(null, r.cost); // v25.5: merchant/
		return 0;
	}
	if (character.esize < 1) return 0;
	await go_npc(r.npc || "craftsman");
	await wait_budget(1, RESERVE.errand);
	tag_spend("crafting");
	const res = await T(auto_craft(c.id)).catch((e) => ({ failed: true, reason: why(e) }));
	const ok = res && !res.failed;
	game_log(`craft ${c.id} for ${c.for}'s ${c.slot} (+${c.gain} pts): ${ok ? "OK" : "FAILED " + (res?.reason || "")}`, ok ? C.ok : C.bad);
	log_ev("craft", { item: c.id, for: c.for, ok });
	craft_cache = null;
	if (!ok) skip("craft:" + c.id, pause_ms({ reason: res?.reason || "invalid" }, 6 * 3600_000), res?.reason || "failed");
	return ok ? 1 : 0;
}
// ---- Elixirs (CFG.elixir_auto) ----
const elixir_active = () => { const e = character.slots?.elixir; return !!e && !(e.expires && Date.parse(e.expires) <= Date.now()); };
const elixir_ok = (name) => { const d = G.items[name]; return !!d && d.type === "elixir" && !!d.duration && !d.withdrawal; };
function best_elixir() {
	let best = null;
	character.items.forEach((it, k) => {
		if (!it || it.l || !elixir_ok(it.name)) return;
		const sc = gear_score({ name: it.name, level: 0 });
		if (!best || sc > best.score) best = { k, name: it.name, score: sc };
	});
	return best;
}
const bank_elixir = () => (state.bank_gear || []).filter((i) => elixir_ok(i.name))
	.sort((a, b) => gear_score({ name: b.name }) - gear_score({ name: a.name }))[0] || null;
const elixir_buy_due = () => CFG.elixir_auto && character.ctype !== "merchant" && !elixir_active() && !best_elixir() && !bank_elixir() &&
	gold_ok(G.items[CFG.elixir_buy]?.g) &&
	character.gold >= CFG.elixir_buy_min_gold && !!G.items[CFG.elixir_buy] && !skipped("town:elixir");
async function drink_elixir() {
	if (!CFG.elixir_auto || character.ctype === "merchant" || character.rip || elixir_active()) return false;
	const b = best_elixir();
	if (!b || !can_spend(EMIT_COST.equip, RESERVE.errand)) return false;
	await T(equip(b.k)).then(() => game_log(`elixir: drank ${b.name}`, C.ok)).catch((e) => game_log(`elixir ${b.name}: ${why(e)}`, C.dim));
	return true;
}
async function task_elixir() {
	await buy_from_npc(CFG.elixir_buy, 1);
	await until(() => !!best_elixir(), 3000);
	return (await drink_elixir()) ? 1 : 0;
}
// ---- Exchange (CFG.exchange_auto) ----
function exchange_pick(needed = needed_slots()) {
	if (!CFG.exchange_auto || character.esize < 2) return -1;
	return character.items.findIndex((it, k) => {
		const d = it && G.items[it.name];
		return !!d?.e && EXCHANGE_TYPES.has(d.type) && !recipe_input(it.name) && (it.q || 1) >= d.e && !it.l && !needed.has(k) &&
			!CFG.keep.includes(it.name) && !CFG.exchange_skip.includes(it.name) && !skipped("exch:" + it.name);
	});
}
async function task_exchange() {
	let n = 0;
	for (let i = 0; i < 20; i++) {
		if (state.errand) state.errand_at = Date.now();
		const k = exchange_pick();
		if (k < 0) break;
		const it = character.items[k];
		try {
			await go_exchange({ name: it.name });
			const k2 = find_slot(it.name, it.level || 0);
			if (k2 < 0) break;
			await wait_budget(1, RESERVE.errand);
			const r = await T(exchange(k2), 30_000); // the exchange roll takes several seconds
			n++;
			game_log(`exchange ${it.name} → ${r?.reward || "?"}`, C.ok);
			log_ev("exchange", { item: it.name, reward: r?.reward || null });
		} catch (e) {
			skip("exch:" + it.name, pause_ms(e, 6 * 3600_000), why(e));
			game_log(`exchange ${it.name}: ${why(e)}; retrying in ${TRANSIENT.has(why(e)) ? "10 min" : "6h"}`, C.dim);
		}
	}
	return n;
}
