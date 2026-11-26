// Gear table generator (v25.81): every equipment piece in the game, precomputed from the game's data.js with the bot's
// own functions, written to data/gear/<slot>.json + sets.json + index.json. The bot fetches them at run time
// (src/shared/19_gear_table.js: gt_item / gt_slot / gt_best).
//   node tools/gear_table.js <data.js> [outdir=data/gear]
// data.js is parsed as JSON, never executed. The bot's source (src/, built as farmer.js by tools/build.js) is loaded
// in a mocked client, as the tests load it, so piece values and odds are the bot's own: slot_value (no worn context:
// the piece on its own), upg_odds / cmp_odds, upgrade_scroll. Item stats per level come from a copy of the game's
// calculate_item_properties (common_functions.js), which the bot's item_props calls in the game.
// Deterministic: sorted keys, stable order; stats and values rounded to 2 decimals, odds to 4, drop and box
// probabilities to 4 significant digits. No timestamps.
const fs = require("fs"), path = require("path"), vm = require("vm");
const { build } = require(path.join(__dirname, "build.js"));

const CLASSES = ["mage", "paladin", "priest", "ranger", "rogue", "warrior"]; // the fighter classes (sorted)
const VALUE_CTX = { level: 60, attack: 100 }; // the wearer the values assume: xp points x attack/100, mp_cost floor at this level
const FILE_OF = { weapon: "mainhand", shield: "offhand", source: "offhand", quiver: "offhand", misc_offhand: "offhand" };
const NOT_TABLES = new Set(["gold", "maps", "monsters", "monsters_home_server", "skins"]); // G.drops keys that aren't exchange tables

const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 10000) / 10000;
const sig4 = (x) => (x ? +x.toPrecision(4) : 0);

function parse_data(file) {
	const t = fs.readFileSync(file, "utf8"), a = t.indexOf("{"), b = t.lastIndexOf("}");
	if (a < 0 || b < a) throw new Error(`${file}: no JSON object found`);
	return JSON.parse(t.slice(a, b + 1));
}

// ---- the game's item functions (common_functions.js), for items without a title or stat scroll ----
function calculate_item_grade(def, item) {
	if (!(def.upgrade || def.compound)) return 0;
	const gr = def.grades || [9, 10, 11, 12], L = (item && item.level) || 0;
	return L >= gr[3] ? 4 : L >= gr[2] ? 3 : L >= gr[1] ? 2 : L >= gr[0] ? 1 : 0;
}
const NO_ROUND = new Set(["evasion", "miss", "reflection", "dreturn", "lifesteal", "manasteal", "attr0", "attr1", "crit", "critdamage", "set", "class", "breaks"]);
const PROP_KEYS = ["gold", "luck", "xp", "int", "str", "dex", "vit", "for", "charisma", "cuteness", "awesomeness", "bling", "hp", "mp", "attack", "range",
	"armor", "incdmgamp", "resistance", "pnresistance", "firesistance", "fzresistance", "phresistance", "stresistance", "stun", "blast", "explosion", "breaks",
	"stat", "speed", "level", "evasion", "miss", "reflection", "lifesteal", "manasteal", "attr0", "attr1", "rpiercing", "apiercing", "crit", "critdamage",
	"dreturn", "frequency", "mp_cost", "mp_reduction", "output", "courage", "mcourage", "pcourage"];
function make_props(G) {
	// adopt_extras as the game has it (its upgrade/compound branch iterates the extras' own keys)
	const adopt = (def, ex) => { for (const p in ex) { if (p === "upgrade" || p === "compound") { for (const pp in ex) def[p][pp] = (def[p][pp] || 0) + ex[p][pp]; } else def[p] = (def[p] || 0) + ex[p]; } };
	return function calculate_item_properties(item, args = {}) {
		let def = G.items[item.name];
		const cls = args.class && def[args.class] ? args.class : "";
		if (cls) { def = JSON.parse(JSON.stringify(def)); adopt(def, def[cls]); }
		const prop = { set: null, class: null };
		for (const k of PROP_KEYS) prop[k] = 0;
		if (def.upgrade || def.compound) {
			const u = def.upgrade || def.compound, level = item.level || 0;
			prop.level = level;
			for (let i = 1; i <= level; i++) {
				let m = 1;
				if (def.upgrade) m = { 7: 1.25, 8: 1.5, 9: 2, 10: 3, 11: 1.25, 12: 1.25 }[i] || 1;
				else if (def.compound) m = i >= 8 ? 3 : { 5: 1.25, 6: 1.5, 7: 2 }[i] || 1;
				for (const p in u) {
					if (p === "stat") prop[p] += Math.round(u[p] * m);
					else prop[p] += u[p] * m;
					if (p === "stat" && i >= 7) prop.stat++;
				}
			}
		}
		if (item.level === 10 && prop.stat && def.tier && def.tier >= 3) prop.stat += 2;
		for (const p in def) if (prop[p] === null) prop[p] = def[p]; else if (prop[p] !== undefined) prop[p] += def[p];
		for (const p in prop) if (!NO_ROUND.has(p)) prop[p] = Math.round(prop[p]);
		return prop;
	};
}
// The numeric stats of a property bag: no zeros, no level, rounded
function stat_bag(p) {
	const out = {};
	for (const k of Object.keys(p).sort()) if (k !== "level" && typeof p[k] === "number" && Number.isFinite(p[k]) && p[k] !== 0) out[k] = r2(p[k]);
	return out;
}

// ---- the bot, loaded in a mocked client (as test/roles.js loads a role) ----
function load_bot(G) {
	const character = { name: "GearTable", ctype: "paladin", level: VALUE_CTX.level, xp: 0, hp: 5000, max_hp: 5000, mp: 1000, max_mp: 1000, x: 0, y: 0, map: "main",
		attack: VALUE_CTX.attack, frequency: 1, armor: 0, resistance: 0, range: 30, speed: 50, items: Array(42).fill(null), slots: {}, s: {}, c: {}, esize: 42, gold: 0, rip: false };
	character.on = () => {};
	const calc = make_props(G);
	const ctx = { character, G, code_settings: {}, console: { log() {}, error() {}, warn() {} }, parent: { socket: { emit() {} }, entities: {}, chests: {}, next_skill: {} },
		game_log() {}, set_message() {}, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
		smart_move: () => new Promise(() => {}), move() {}, stop() {}, use_skill: () => Promise.resolve(), attack: () => Promise.resolve(), heal: () => Promise.resolve(),
		is_on_cooldown: () => false, quantity: () => 0, get_party: () => ({}), distance: () => 0, can_move_to: () => true, is_moving: () => false,
		is_in_range: () => true, can_attack: () => true, get_targeted_monster: () => null, change_target() {}, get_nearest_monster: () => null, respawn() {},
		item_grade: (it) => (!it || !it.name ? -1 : calculate_item_grade(G.items[it.name], it)), item_value: () => 0, find_npc: () => null,
		damage_multiplier: (d) => 1 - d / 1000, send_cm: () => Promise.resolve(), calculate_item_properties: calc };
	vm.createContext(ctx);
	vm.runInContext(build(), ctx);
	const R = (code) => vm.runInContext(code, ctx);
	// exported for the generator: run with the wearer's class as ours (xp_weight and the mp_cost floor read character)
	R(`globalThis.__gt = { slot_value, slots_for, is_2h, upg_odds, cmp_odds, upgrade_scroll, set_bonus, stat_points, gt_hash, VERSION,
		UPG_N: UPG_ODDS[0].length, CMP_N: CMP_ODDS[0].length, GEAR: [...GEAR] }`);
	const B = R("globalThis.__gt");
	B.as = (ctype, f) => { character.ctype = ctype; return f(); };
	return B;
}

// ---- where pieces come from (reverse indexes over G) ----
function source_index(G, gear) {
	const S = {};
	const add = (n, k, v) => { if (gear.has(n)) ((S[n] = S[n] || {})[k] = S[n][k] || []).push(v); };
	// NPC shops: each NPC (not ignored) on each map (not ignored) it stands on
	const where = {};
	for (const m of Object.keys(G.maps || {}).sort()) if (!G.maps[m].ignore) for (const n of G.maps[m].npcs || []) (where[n.id] = where[n.id] || []).push({ map: m, x: n.position?.[0] ?? null, y: n.position?.[1] ?? null });
	for (const id of Object.keys(G.npcs || {}).sort()) {
		const N = G.npcs[id];
		if (N.ignore || !Array.isArray(N.items)) continue;
		for (const n of N.items) if (n) for (const w of where[id] || []) add(n, "shops", { npc: id, npc_name: N.name || id, map: w.map, x: w.x, y: w.y, price: G.items[n]?.g ?? null, ...(G.items[n]?.cash ? { cash: true } : {}) });
	}
	// crafts: this piece as an input
	for (const id of Object.keys(G.craft || {}).sort()) for (const e of G.craft[id].items || []) add(e[1], "input_to", { craft: id, q: e[0], ...(e[2] != null ? { level: e[2] } : {}) });
	// dismantling something gives it
	for (const id of Object.keys(G.dismantle || {}).sort()) for (const e of G.dismantle[id].items || []) add(e[1], "dismantled_from", { item: id, q: e[0] });
	// exchange tables (weighted: weight / table total), "open" entries followed into the table they open
	const expand = (table, p, via, depth, out) => {
		const T = G.drops?.[table];
		if (!Array.isArray(T) || depth > 4) return;
		const total = T.reduce((s, e) => s + (e[0] || 0), 0);
		if (!(total > 0)) return;
		for (const e of T) {
			const q = p * (e[0] || 0) / total;
			if (e[1] === "open") { if (!via.includes(e[2])) expand(e[2], q, [...via, e[2]], depth + 1, out); }
			else if (gear.has(e[1])) out.push({ n: e[1], p: q, via, level: e[3] ?? null, title: e[4] ?? null });
		}
	};
	for (const b of Object.keys(G.drops || {}).sort()) {
		if (NOT_TABLES.has(b) || !Array.isArray(G.drops[b])) continue;
		const got = []; expand(b, 1, [], 0, got);
		const agg = {};
		for (const g of got) { const k = g.n + "|" + g.via.join(">") + "|" + g.level + "|" + g.title; (agg[k] = agg[k] || { ...g, p: 0 }).p += g.p; }
		for (const g of Object.values(agg)) add(g.n, "boxes", { box: b, p: sig4(g.p), ...(G.items[b] ? { need: G.items[b].e || 1 } : { item: false }), ...(g.via.length ? { via: g.via } : {}), ...(g.level != null ? { level: g.level } : {}), ...(g.title ? { title: g.title } : {}) });
	}
	// monster drops (per kill) and map drops (per kill there; "global": anywhere); "open" = a chance at a whole table
	const drop_list = (list, emit) => {
		for (const e of list || []) {
			if (e[1] === "open") { const got = []; expand(e[2], 1, [e[2]], 1, got); for (const g of got) emit(g.n, sig4(e[0] * g.p), g.via); }
			else if (gear.has(e[1])) emit(e[1], sig4(e[0]), []);
		}
	};
	for (const m of Object.keys(G.drops?.monsters || {}).sort()) drop_list(G.drops.monsters[m], (n, rate, via) => add(n, "drops", { monster: m, rate, ...(via.length ? { via } : {}) }));
	for (const m of Object.keys(G.drops?.maps || {}).sort()) drop_list(G.drops.maps[m], (n, rate, via) => add(n, "map_drops", { map: m, rate, ...(via.length ? { via } : {}) }));
	// token prices
	for (const t of Object.keys(G.tokens || {}).sort()) for (const n of Object.keys(G.tokens[t]).sort()) add(n, "tokens", { token: t, price: G.tokens[t][n] });
	return S;
}

// ---- one record ----
function item_record(G, B, calc, S, name) {
	const def = G.items[name], kind = def.upgrade ? "upgrade" : def.compound ? "compound" : null;
	const max = kind ? (def.grades || [9, 10, 11, 12])[3] : 0, levels = [...Array(max + 1).keys()];
	const rec = { name, title: def.name || name, type: def.type, file: FILE_OF[def.type] || def.type, tier: def.tier ?? null, class: def.class ? [...def.class].sort() : null,
		set: def.set || null, g: def.g ?? null, max_level: max, grades: kind ? def.grades || [9, 10, 11, 12] : null, stat_scroll: !!def.stat };
	if (def.wtype) rec.wtype = def.wtype;
	if (def.cash) rec.cash = true;
	if (def.ignore) rec.ignore = true;
	// stats per level (any wearer) and, for pieces with class extras, per level for those classes
	rec.stats = levels.map((L) => stat_bag(calc({ name, level: L })));
	const by_cls = CLASSES.filter((c) => def[c] && typeof def[c] === "object");
	if (by_cls.length) rec.stats_class = Object.fromEntries(by_cls.map((c) => [c, levels.map((L) => stat_bag(calc({ name, level: L }, { class: c })))]));
	// scrolls: the one each step L → L+1 takes (index L), the bot's upgrade_scroll / its compound's cscroll by grade
	rec.scroll = kind ? { kind, by_level: levels.slice(0, max).map((L) => (kind === "upgrade" ? B.upgrade_scroll(name, L) : "cscroll" + Math.max(0, calculate_item_grade(def, { level: L })))) } : null;
	// odds of the step that reaches level L (index L; 0 is null); null past the bot's own tables (+10 upgrade, +4 compound)
	rec.odds = kind ? levels.map((L) => { if (!L) return null; const p = kind === "upgrade" ? B.upg_odds(name, L) : B.cmp_odds(name, L); return p ? r4(p) : null; }) : null;
	// who can wear it where, the hands flag, and piece_value per class per level (the bot's slot_value, no worn context)
	rec.slots = {}; rec.value = {};
	const two = [];
	for (const c of CLASSES) {
		// the bot's slots_for (class tag, the class's mainhand/doublehand/offhand types; not can_wear, which leaves out
		// two-handers), plus the offhand for a weapon type the class may hold there (a rogue's second dagger)
		const sl = [...B.slots_for(name, c, { dh: false })];
		if (def.type === "weapon" && G.classes[c]?.offhand?.[def.wtype] && (!def.class || def.class.includes(c)) && !sl.includes("offhand")) sl.push("offhand");
		if (!sl.length) continue;
		rec.slots[c] = sl;
		if (def.type === "weapon" && B.is_2h(name, c)) two.push(c);
		rec.value[c] = levels.map((L) => r2(B.as(c, () => B.slot_value({ name, level: L }, c, null, null))));
	}
	rec.hands = def.type !== "weapon" ? null : two.length && Object.keys(rec.slots).every((c) => two.includes(c) || !rec.slots[c].includes("mainhand")) ? 2 : 1;
	rec.two_handed_for = def.type === "weapon" ? two : null;
	// sources
	const s = S[name] || {};
	rec.sources = {
		shops: s.shops || [],
		craft: G.craft?.[name] ? { inputs: (G.craft[name].items || []).map((e) => ({ q: e[0], item: e[1], ...(e[2] != null ? { level: e[2] } : {}) })), cost: G.craft[name].cost || 0, ...(G.craft[name].quest ? { quest: G.craft[name].quest } : {}) } : null,
		input_to: s.input_to || [],
		dismantle: G.dismantle?.[name] ? { gives: (G.dismantle[name].items || []).map((e) => ({ q: e[0], item: e[1] })), cost: G.dismantle[name].cost || 0 } : null,
		dismantled_from: s.dismantled_from || [],
		boxes: (s.boxes || []).sort((a, b) => b.p - a.p || (a.box < b.box ? -1 : 1)),
		drops: (s.drops || []).sort((a, b) => b.rate - a.rate || (a.monster < b.monster ? -1 : 1)),
		map_drops: (s.map_drops || []).sort((a, b) => b.rate - a.rate || (a.map < b.map ? -1 : 1)),
		tokens: s.tokens || [],
		from_lower: kind, // upgrade: +L-1 and a scroll; compound: three +L-1 and a compound scroll
	};
	return rec;
}

function set_records(G, B) {
	const out = {};
	for (const id of Object.keys(G.sets || {}).sort()) {
		const S = G.sets[id], N = Math.max(0, ...Object.keys(S).filter((k) => /^\d+$/.test(k)).map(Number));
		const ns = [...Array(N).keys()].map((i) => i + 1);
		const bonus = {}, total = {};
		for (const n of ns) { bonus[n] = stat_bag(S[n] || {}); total[n] = stat_bag(B.set_bonus(id, n)); }
		const points = {};
		for (const c of CLASSES) points[c] = { step: Object.fromEntries(ns.map((n) => [n, r2(B.as(c, () => B.stat_points(S[n] || {}, c)))])), total: Object.fromEntries(ns.map((n) => [n, r2(B.as(c, () => B.stat_points(B.set_bonus(id, n), c)))])) };
		out[id] = { id, name: S.name || id, items: [...(S.items || [])].sort(), max: N, bonus, total, points };
	}
	return out;
}

// Canonical JSON: object keys sorted at every depth
function canon(v) {
	if (Array.isArray(v)) return v.map(canon);
	if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
	return v;
}
// One record per line, so a rebuild's diff shows which pieces changed
function file_text(head, key, map) {
	const names = Object.keys(map).sort();
	const body = names.map((n, i) => `${JSON.stringify(n)}:${JSON.stringify(canon(map[n]))}${i < names.length - 1 ? "," : ""}`).join("\n");
	const h = JSON.stringify(canon(head));
	return `${h.slice(0, -1)},${JSON.stringify(key)}:{\n${body}\n}}\n`;
}

// The whole table for a G: { files: { "<file>.json": text }, index, slots: { slot: { name: record } }, sets }
function build_table(G) {
	const B = load_bot(G), calc = make_props(G), gearT = new Set(B.GEAR);
	const names = Object.keys(G.items || {}).filter((n) => gearT.has(G.items[n]?.type)).sort();
	const S = source_index(G, new Set(names)), slots = {};
	for (const n of names) { const r = item_record(G, B, calc, S, n); (slots[r.file] = slots[r.file] || {})[n] = canon(r); }
	const sets = canon(set_records(G, B)), files = {}, ix_slots = {};
	for (const s of Object.keys(slots).sort()) {
		files[s + ".json"] = file_text({ slot: s, count: Object.keys(slots[s]).length }, "items", slots[s]);
		ix_slots[s] = { file: s + ".json", items: Object.keys(slots[s]).length, bytes: Buffer.byteLength(files[s + ".json"]) };
	}
	files["sets.json"] = file_text({ count: Object.keys(sets).length }, "sets", sets);
	const index = canon({ generator: "tools/gear_table.js", built_from: B.VERSION, g_version: G.version != null ? String(G.version) : B.gt_hash(G.items, G.sets),
		g_version_from: G.version != null ? "G.version" : "hash of G.items + G.sets", items: names.length, classes: CLASSES, value_ctx: VALUE_CTX,
		rounding: "stats and values 2 decimals, odds 4 decimals, drop/box probabilities 4 significant digits",
		odds_note: "odds[L]: the bot's chance for the step that reaches +L (upg_odds/cmp_odds); null past the bot's tables",
		slots: ix_slots, sets: "sets.json", sets_count: Object.keys(sets).length, sets_bytes: Buffer.byteLength(files["sets.json"]) });
	files["index.json"] = JSON.stringify(index, null, 1) + "\n";
	return { files, index, slots, sets };
}
module.exports = { build_table, parse_data, calculate_item_grade, make_props, CLASSES };

if (require.main === module) {
	const [data, out = path.join(__dirname, "..", "data", "gear")] = process.argv.slice(2);
	if (!data) { console.error("usage: node tools/gear_table.js <data.js> [outdir=data/gear]"); process.exit(2); }
	const T = build_table(parse_data(data));
	fs.mkdirSync(out, { recursive: true });
	for (const f of Object.keys(T.files).sort()) fs.writeFileSync(path.join(out, f), T.files[f]);
	for (const f of Object.keys(T.files).sort()) console.log(`${f.padEnd(14)} ${String(Buffer.byteLength(T.files[f])).padStart(8)} bytes${T.index.slots[f.replace(/\.json$/, "")] ? `  ${T.index.slots[f.replace(/\.json$/, "")].items} items` : ""}`);
	console.log(`${T.index.items} items, ${Object.keys(T.index.slots).length} slot files, g_version ${T.index.g_version}, built from v${T.index.built_from} → ${out}`);
}
