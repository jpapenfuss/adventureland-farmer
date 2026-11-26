// Gear table tests (v25.81): the generator (tools/gear_table.js) on a small G fixture, the committed data/gear files
// (parse, sizes, and every equipment piece of the real data.js when one is at hand), and the run-time lookups
// (src/shared/19_gear_table.js) against a stubbed fetch: download, cache, failure, stale data. Run by test/roles.js.
const vm = require("vm"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), DIR = path.join(ROOT, "data", "gear");
const { build_table, parse_data, calculate_item_grade } = require(path.join(ROOT, "tools", "gear_table.js"));
const { build, ROLE_FILES } = require(path.join(ROOT, "tools", "build.js"));
let fails = 0;
const assert = (c, m) => { console.log(`${c ? "ok" : "FAIL"} - ${m}`); if (!c) fails++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const r2 = (x) => Math.round(x * 100) / 100;

// ---- 1. the generator on a fixture ----
const FIX = {
	version: 77,
	classes: {
		mage: { main_stat: "int", mainhand: { wand: { frequency: 60 } }, offhand: { source: {} } },
		paladin: { main_stat: "str", mainhand: { mace: {} }, offhand: { shield: {} } },
		priest: { main_stat: "int", mainhand: { staff: {} }, offhand: { shield: {}, source: {} } },
		warrior: { main_stat: "str", mainhand: { mace: {} }, doublehand: { axe: {} }, offhand: { shield: {} } },
		ranger: { main_stat: "dex", mainhand: { bow: {} }, offhand: { quiver: {} } },
		rogue: { main_stat: "dex", mainhand: { dagger: {}, stars: { frequency: 20 } }, offhand: { dagger: {}, stars: {} } },
	},
	items: {
		tring: { type: "ring", name: "Test Ring", int: 2, compound: { int: 1 }, g: 1000, grades: [2, 4, 6, 7] },
		twand: { type: "weapon", wtype: "wand", name: "Test Wand", tier: 1, attack: 10, upgrade: { attack: 2 }, g: 5000, grades: [3, 6, 8, 10] },
		taxe: { type: "weapon", wtype: "axe", name: "Test Axe", attack: 30, g: 9000 },
		thelm: { type: "helmet", name: "Test Helm", set: "tset", armor: 10, g: 100 },
		tboots: { type: "shoes", name: "Test Boots", set: "tset", armor: 4, class: ["mage"], g: 100 },
		tcoat: { type: "chest", name: "Test Coat", stat: 2, armor: 5, upgrade: { stat: 1, armor: 1 }, g: 100, grades: [3, 6, 8, 10] },
		tstars: { type: "weapon", wtype: "stars", name: "Test Stars", attack: 8, g: 100 },
		lostearring: { type: "earring", name: "Lost Earring", int: 1, compound: { int: 1 }, g: 100, grades: [0, 2, 6, 7] },
		ttest: { type: "orb", name: "Test Orb", int: 99, ignore: true, g: 1 },
		glitch: { type: "misc", name: "Glitch", e: 1, g: 1 },
		tbox: { type: "box", name: "Test Box", e: 1, g: 10 },
		tmat: { type: "material", name: "Test Mat", g: 1 },
		cscroll0: { type: "cscroll", grade: 0, g: 6400 }, cscroll1: { type: "cscroll", grade: 1, g: 240000 },
		scroll0: { type: "uscroll", grade: 0, g: 1000 }, scroll1: { type: "uscroll", grade: 1, g: 40000 },
	},
	sets: { tset: { 1: {}, 2: { int: 5 }, name: "Test Set", items: ["thelm", "tboots"] } },
	npcs: { shopguy: { name: "Shop Guy", items: ["tring", "twand"] }, gone: { name: "Gone", ignore: true, items: ["thelm"] } },
	maps: { main: { npcs: [{ id: "shopguy", position: [10, 20] }, { id: "gone", position: [0, 0] }], monsters: [] }, hidden: { ignore: true, npcs: [], monsters: [] } },
	craft: { thelm: { items: [[2, "tmat"], [1, "tring", 1]], cost: 500 } },
	dismantle: {},
	drops: { tbox: [[3, "tring", 1, "jar"], [1, "open", "inner"]], inner: [[1, "thelm"], [1, "tmat"]], glitch: [[1, "tcoat"], [1, "tboots", 1, null, "lucky"]],
		monsters: { goo: [[0.01, "tring"], [0.5, "open", "tbox"]], bat: [[0.2, "open", "glitch"]] }, maps: { main: [[0.001, "twand"]], maintest: [[1, "twand"]], hidden: [[1, "twand"]] } },
	tokens: { monstertoken: { tboots: 15 } },
	monsters: {}, skills: {}, levels: {}, quests: {},
};
{
	const T = build_table(JSON.parse(JSON.stringify(FIX)));
	const ring = T.slots.ring?.tring, wand = T.slots.mainhand?.twand, helm = T.slots.helmet?.thelm, boots = T.slots.shoes?.tboots, axe = T.slots.mainhand?.taxe;
	assert(eq(Object.keys(T.slots).sort(), ["chest", "earring", "helmet", "mainhand", "orb", "ring", "shoes"]) && !T.slots.box, `generator: one file per slot type, gear only (${Object.keys(T.slots)})`);
	// compound: +1..+4 add 1 int each, +5 x1.25, +6 x1.5, +7 x2 (rounded as the game rounds)
	assert(ring && eq(ring.stats.map((s) => s.int), [2, 3, 4, 5, 6, 7, 9, 11]) && ring.max_level === 7, `generator: compound stats per level (${ring && ring.stats.map((s) => s.int)})`);
	// the server's compound rule (server.js compound): the row is the grade at +0 for inputs below +3, else the grade at
	// the input's level - 2. tring grades [2,4,6,7]: +4 from +3 → grade at +1 = 0 (0.25); +5 → grade at +2 = 1 (0.15);
	// +6 → at +3 = 1 (0.08); +7 → at +4 = 2 (0.03)
	assert(ring && eq(ring.odds, [null, 0.99, 0.75, 0.4, 0.25, 0.15, 0.08, 0.03]) && ring.scroll.kind === "compound" && eq(ring.scroll.by_level, ["cscroll0", "cscroll0", "cscroll1", "cscroll1", "cscroll2", "cscroll2", "cscroll3"]),
		`generator: compound odds (cmp_odds) and scrolls by grade (${ring && JSON.stringify(ring.odds)})`);
	// upgrade: +2 attack a level, +7 x1.25, +8 x1.5, +9 x2, +10 x3
	assert(wand && eq(wand.stats.map((s) => s.attack), [10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 38]) && wand.scroll.kind === "upgrade" && wand.scroll.by_level[3] === "scroll1" && wand.scroll.by_level[6] === "scroll2",
		`generator: upgrade stats per level and scroll grade per level (${wand && wand.stats.map((s) => s.attack)})`);
	assert(wand && eq(wand.odds.slice(0, 4), [null, 1, 0.98, 0.95]) && wand.odds[10] === 0.024 && wand.odds.length === 11, `generator: upgrade odds (upg_odds) per level, none past the max (+10)`);
	// lostearring: the server forces its row to grade 2 (its grades say 1 at +0): 0.80 / 0.60 / 0.32, then the -2 rule
	const le = T.slots.earring?.lostearring;
	assert(le && eq(le.odds, [null, 0.8, 0.6, 0.32, 0.2, 0.1, 0.05, 0.03]), `generator: lostearring compound odds on the server's grade 2 row (${le && JSON.stringify(le.odds)})`);
	// a rogue's stars: +20 frequency in the mainhand (x2.5), nothing in the offhand
	const st = T.slots.mainhand?.tstars;
	assert(st && eq(st.slots.rogue, ["mainhand", "offhand"]) && st.value.rogue[0] === 58 && st.value_off?.rogue?.[0] === 8 && !wand.value_off, `generator: value_off for a weapon held in the offhand (stars rogue ${st && st.value.rogue[0]} main / ${st && st.value_off?.rogue?.[0]} off)`);
	assert(/flat-weight/.test(T.index.value_note) && /monster\.level/.test(T.index.drop_note), "generator: index records that value is the flat-weight score and how drop rates scale");
	// piece_value: mage int 1.2 a point (main stat); the wand: attack + the mage's wand frequency 60 x 2.5
	assert(ring && eq(ring.value.mage, [2.4, 3.6, 4.8, 6, 7.2, 8.4, 10.8, 13.2]) && ring.value.paladin[0] === 2.4 && ring.value.ranger[0] === 0.6,
		`generator: piece_value per class per level (mage ${ring && ring.value.mage}; ranger int 0.25x)`);
	assert(wand && eq(Object.keys(wand.value), ["mage"]) && wand.value.mage[0] === 160 && eq(wand.slots, { mage: ["mainhand"] }) && wand.hands === 1, `generator: weapons valued only for classes that wield them (${wand && JSON.stringify(wand.value)})`);
	assert(axe && axe.hands === 2 && eq(axe.two_handed_for, ["warrior"]) && eq(Object.keys(axe.value), ["warrior"]), "generator: the two-handed flag");
	assert(boots && eq(boots.class, ["mage"]) && eq(Object.keys(boots.value), ["mage"]) && boots.set === "tset", "generator: class restriction and set");
	// sources
	const rs = ring && ring.sources;
	assert(rs && eq(rs.shops, [{ map: "main", npc: "shopguy", npc_name: "Shop Guy", price: 1000, x: 10, y: 20 }]) && !helm.sources.shops.length, "generator: NPC shops (ignored NPCs left out)");
	assert(rs && rs.boxes.length === 1 && eq(rs.boxes[0], { box: "tbox", need: 1, p: 0.75 }) && eq(helm.sources.boxes.find((b) => b.box === "tbox"), { box: "tbox", need: 1, p: 0.125, via: ["inner"] }), `generator: exchange boxes with probability, nested tables followed (${rs && JSON.stringify(rs.boxes)})`);
	assert(rs && eq(rs.drops.map((d) => [d.monster, d.base]), [["goo", 0.375], ["goo", 0.01]]) && eq(wand.sources.map_drops, [{ base: 0.001, map: "main" }]), `generator: monster drops (direct and through a box) and map drops as base rates; ignored and missing maps left out (${rs && JSON.stringify(rs.drops)} | ${wand && JSON.stringify(wand.sources.map_drops)})`);
	// titles: an exchange of glitch gives "glitched" (or the entry's own title); a monster's chest gives none
	const coat_ = T.slots.chest?.tcoat;
	assert(coat_ && eq(coat_.sources.boxes, [{ box: "glitch", need: 1, p: 0.5, title: "glitched" }]) && eq(boots.sources.boxes, [{ box: "glitch", need: 1, p: 0.5, title: "lucky" }]) && eq(coat_.sources.drops, [{ base: 0.1, monster: "bat", via: ["glitch"] }]),
		`generator: titles from exchanges, none from monster chests (${coat_ && JSON.stringify(coat_.sources)})`);
	assert(T.slots.orb?.ttest?.ignore === true, "generator: an ignored item is in the table, flagged ignore");
	assert(helm && eq(helm.sources.craft, { cost: 500, inputs: [{ item: "tmat", q: 2 }, { item: "tring", level: 1, q: 1 }] }) && rs && eq(rs.input_to, [{ craft: "thelm", level: 1, q: 1 }]), "generator: craft recipe and what it's an input to");
	assert(boots && eq(boots.sources.tokens, [{ price: 15, token: "monstertoken" }]) && rs.from_lower === "compound" && wand.sources.from_lower === "upgrade" && helm.sources.from_lower === null, "generator: token prices, upgradable/compoundable from a lower copy");
	// v_stat: a main-stat scroll on a stat piece — its stat points (2, +1 a level) as int (mage 1.2) / str (paladin 1.2, x1 not defence)
	const coat = T.slots.chest?.tcoat;
	assert(coat && eq(coat.stats.map((s) => s.stat), [2, 3, 4, 5, 6, 7, 8, 10, 13, 16, 20]) && coat.v_stat && eq(coat.v_stat.mage.map((v, L) => r2(v - coat.value.mage[L])), coat.stats.map((s) => r2(s.stat * 1.2)))
		&& eq(coat.v_stat.ranger.map((v, L) => r2(v - coat.value.ranger[L])), coat.stats.map((s) => r2(s.stat * 1.2))) && !ring.v_stat && !wand.v_stat,
		`generator: v_stat = piece_value with a main-stat scroll (coat mage ${coat && coat.v_stat && coat.v_stat.mage.slice(0, 3)} vs ${coat && coat.value.mage.slice(0, 3)})`);
	// odds: the game's G.upgrades / G.compounds when the data has them; the bot's copy (to +12 / +10) otherwise
	const Gu = JSON.parse(JSON.stringify(FIX)); Gu.upgrades = { 0: { 1: 0.5, 11: 0.3 } }; Gu.compounds = { 1: { 5: 0.33 } };
	const Tu = build_table(Gu);
	assert(Tu.slots.mainhand.twand.odds[1] === 0.5 && Tu.slots.mainhand.twand.odds[2] === 0.98 && Tu.slots.ring.tring.odds[5] === 0.33 && /G\.upgrades/.test(Tu.index.odds_source) && !/G\.upgrades \//.test(T.index.odds_source),
		`generator: odds from G.upgrades / G.compounds when present (${Tu.index.odds_source} | without: ${T.index.odds_source})`);
	const S = T.sets.tset;
	assert(S && eq(S.items, ["tboots", "thelm"]) && eq(S.total["2"], { int: 5 }) && S.points.mage.total["2"] === 6 && S.points.ranger.step["2"] === 1.5, `generator: sets — pieces, bonus per count, points per class (${S && JSON.stringify(S.points.mage)})`);
	assert(T.index.g_version === "77" && T.index.built_from === fs.readFileSync(path.join(ROOT, "src", "shared", "00_config.js"), "utf8").match(/"([^"]+)"/)[1] && T.index.slots.ring.items === 1, "generator: index (g_version, built_from VERSION, files)");
	const T2 = build_table(JSON.parse(JSON.stringify(FIX)));
	assert(Object.keys(T.files).every((f) => T.files[f] === T2.files[f]), "generator: deterministic (two runs, identical files)");
	const nov = JSON.parse(JSON.stringify(FIX)); delete nov.version;
	assert(/^[0-9a-f]{8}$/.test(build_table(nov).index.g_version), "generator: g_version is a hash of G.items + G.sets without G.version");
}

// ---- 2. the committed files ----
{
	const ix = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
	const files = Object.keys(ix.slots), recs = {};
	let parsed = true, sizes = [];
	for (const s of files) {
		try {
			const f = path.join(DIR, ix.slots[s].file), t = fs.readFileSync(f, "utf8"), j = JSON.parse(t);
			sizes.push(`${s} ${Math.round(t.length / 1024)}k`);
			if (t.length > 1_000_000 || Object.keys(j.items).length !== ix.slots[s].items) parsed = false;
			for (const n in j.items) { recs[n] = j.items[n]; if (j.items[n].file !== s || j.items[n].name !== n) parsed = false; }
		} catch (e) { parsed = false; console.log("  ", s, e.message); }
	}
	const sets = JSON.parse(fs.readFileSync(path.join(DIR, ix.sets), "utf8")).sets;
	assert(parsed && files.length >= 13 && Object.keys(recs).length === ix.items && Object.keys(sets).length === ix.sets_count, `data/gear: index + ${files.length} slot files parse, counts match, each under 1 MB (${sizes.join(", ")})`);
	const DATA = [process.env.AL_DATA].find((p) => p && fs.existsSync(p));
	if (!DATA) console.log("skip - data/gear covers every equipment piece: no data.js (set AL_DATA=<path to the game's data.js>)");
	else {
		const G = parse_data(DATA), GEAR = new Set(["weapon", "shield", "helmet", "chest", "pants", "gloves", "shoes", "cape", "ring", "earring", "amulet", "belt", "orb", "source", "quiver", "misc_offhand"]);
		const want = Object.keys(G.items).filter((n) => GEAR.has(G.items[n].type)), missing = want.filter((n) => !recs[n]);
		const same_v = String(G.version ?? "") === ix.g_version;
		assert(!missing.length && want.length === Object.keys(recs).length, `data/gear covers every equipment piece of ${DATA} (${want.length}${missing.length ? "; MISSING " + missing.slice(0, 10).join(", ") : ""})`);
		assert(!same_v || Object.keys(sets).length === Object.keys(G.sets || {}).length, `data/gear sets.json has every set (${Object.keys(sets).length})`);
		if (same_v) {
			const T = build_table(G);
			const diff = Object.keys(T.files).filter((f) => !fs.existsSync(path.join(DIR, f)) || fs.readFileSync(path.join(DIR, f), "utf8") !== T.files[f]);
			assert(!diff.length, `data/gear is the current build of ${DATA} (node tools/gear_table.js)${diff.length ? " — differs: " + diff.join(", ") : ""}`);
		} else console.log(`skip - data/gear rebuild check: ${DATA} is game data ${G.version}, the table ${ix.g_version}`);
	}
}

// ---- 3. run-time lookups on a stubbed fetch ----
const SHA = "abcdef1" + "0".repeat(33), MASTER = "1234567" + "0".repeat(33);
// api_sha: what the GitHub API names as master's newest commit (null: the API fails); hang: file names whose fetch never
// answers (until the timeout aborts it); set_throws: localStorage.setItem throws a quota error
function client({ fetch_ok = true, store = {}, sha = SHA, version, files, api_sha = MASTER, hang = [], set_throws = false } = {}) {
	const logs = [], urls = [], timers = [];
	const src = build(ROLE_FILES.fighter);
	const character = { name: "Torlis", ctype: "mage", level: 50, xp: 0, hp: 5000, max_hp: 5000, mp: 1000, max_mp: 1000, x: 0, y: 0, map: "main", attack: 300, frequency: 1,
		armor: 0, resistance: 0, range: 30, speed: 50, items: Array(42).fill(null), slots: {}, s: {}, c: {}, esize: 42, gold: 1e6, rip: false, on() {} };
	const G = { version, monsters: {}, maps: { main: { monsters: [], npcs: [] } }, items: { hpot1: { g: 20, type: "pot", gives: [["hp", 400]] }, mpot1: { g: 20, type: "pot", gives: [["mp", 500]] } },
		classes: { mage: { main_stat: "int" } }, npcs: {}, craft: {}, quests: {}, levels: { 50: 1e6 }, sets: {}, tokens: {}, skills: {} };
	const fetch = async (u, o) => {
		urls.push(u);
		if (!fetch_ok) throw new Error("offline");
		if (/api\.github\.com/.test(u)) { if (api_sha == null) throw new Error("rate limited"); return { ok: true, status: 200, text: async () => api_sha + "\n" }; }
		const name = u.split("/").pop();
		if (hang.includes(name)) return new Promise((_, rej) => o?.signal?.addEventListener("abort", () => rej(new Error("aborted (timeout)"))));
		const f = (files || {})[name] !== undefined ? files[name] : fs.existsSync(path.join(DIR, name)) ? fs.readFileSync(path.join(DIR, name), "utf8") : null;
		return f == null ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => JSON.parse(f), text: async () => f };
	};
	const ctx = { character, G, code_settings: {}, console, parent: { socket: { emit() {} }, entities: {}, chests: {}, next_skill: {} }, fetch, AbortController,
		window: { farmer_loaded: { sha, url: sha ? `https://raw.githubusercontent.com/someone/somefork/${sha}/src/manifest.json` : "https://raw.githubusercontent.com/someone/somefork/master/farmer.js" },
			localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { if (set_throws) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; } store[k] = v; } } },
		game_log: (m) => logs.push(String(m)), set_message() {}, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}, setInterval: () => 0,
		smart_move: () => new Promise(() => {}), move() {}, stop() {}, use_skill: () => Promise.resolve(), attack: () => Promise.resolve(), heal: () => Promise.resolve(),
		is_on_cooldown: () => false, quantity: () => 0, get_party: () => ({}), distance: () => 0, can_move_to: () => true, is_moving: () => false, is_in_range: () => true,
		can_attack: () => true, get_targeted_monster: () => null, change_target() {}, get_nearest_monster: () => null, respawn() {}, item_grade: () => 0, item_value: () => 0,
		find_npc: () => null, damage_multiplier: (d) => 1 - d / 1000, send_cm: () => Promise.resolve() };
	vm.createContext(ctx);
	vm.runInContext(src, ctx);
	return { ctx, logs, urls, store, timers, R: (c) => vm.runInContext(c, ctx) };
}
const tick = () => new Promise((r) => setImmediate(r));
(async () => {
	const ix = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8")), N = ix.items, M = Object.keys(ix.slots).length, GV = Number(ix.g_version) || ix.g_version;
	const slot_text = (s) => fs.readFileSync(path.join(DIR, ix.slots[s].file), "utf8");
	// a) download at the loaded commit, from the loader's repo; cached; lookups
	let c = client({ version: GV });
	assert(await c.R("gear_table_load()") === "loaded" && c.urls.length === M + 2 && c.urls.every((u) => u.startsWith(`https://raw.githubusercontent.com/someone/somefork/${SHA}/data/gear/`)), `lookup: index + ${M} slot files + sets fetched at the loaded commit (${c.urls[0]})`);
	await c.R("gear_table_load()");
	assert(c.urls.length === M + 2, "lookup: once per load (a second call fetches nothing)");
	assert(c.store.farmer_gear_table && JSON.parse(c.store.farmer_gear_table).sha === SHA, "lookup: the download is cached in localStorage");
	// the committed table was scored by this code (weights + scoring functions): no data.js needed
	assert(ix.score_hash && c.R("gt_score_hash()") === ix.score_hash, `committed table: index.score_hash is this code's (${ix.score_hash} vs ${c.R("gt_score_hash()")}) — rebuild with node tools/gear_table.js`);
	const sk = c.R("gt_item('skullamulet')");
	assert(sk && sk.type === "amulet" && sk.stats.length === sk.max_level + 1 && c.R("gt_item('nope')") === null && c.R("gt_item('constructor')") === null, "lookup: gt_item → record | null");
	assert(c.R("gt_slot('ring').length") === ix.slots.ring.items && c.R("gt_slot('nope').length") === 0, "lookup: gt_slot → that slot's records");
	const best = c.R("gt_best('mage', 'ring1')"), b3 = c.R("gt_best('mage', 'ring', { max_level: 3 })");
	const sorted = (a) => a.every((r, i) => !i || a[i - 1].best.value >= r.best.value);
	assert(best.length > 5 && sorted(best) && best.every((r) => r.slots.mage.includes("ring1")) && best[0].best.value === Math.max(...best[0].value.mage), `lookup: gt_best sorted by piece_value at the best level (top: ${best[0].name}+${best[0].best.level} ${best[0].best.value})`);
	assert(sorted(b3) && b3.every((r) => r.best.level <= 3) && b3.length === best.length, "lookup: gt_best max_level caps the level");
	const f = c.R("gt_best('mage', 'mainhand', { filter: (r) => r.wtype === 'wand' })");
	assert(f.length > 0 && f.every((r) => r.wtype === "wand") && c.R("gt_best('mage', 'mainhand')").some((r) => r.wtype === "staff"), `lookup: gt_best filter (${f.length} wands)`);
	assert(c.R("gt_best('priest', 'offhand')").every((r) => r.slots.priest.includes("offhand")) && !c.R("gt_best('priest', 'offhand')").some((r) => r.type === "quiver"), "lookup: gt_best only what the class can wear there");
	// ignored (test) pieces only on request
	const ign = c.R("gt_slot('orb').filter((r) => r.ignore).map((r) => r.name)");
	assert(ign.length > 0 && !c.R("gt_best('mage', 'orb')").some((r) => r.ignore) && c.R("gt_best('mage', 'orb', { ignored: true })").some((r) => r.ignore), `lookup: gt_best leaves out ignore pieces (${ign.join(", ")}) unless asked`);
	// a weapon in the offhand ranks by its offhand value
	const wo = c.R("gt_best('warrior', 'offhand').filter((r) => r.type === 'weapon' && r.value_off && r.value_off.warrior)");
	assert(wo.length > 0 && wo.every((r) => r.best.value === Math.max(...r.value_off.warrior)) && wo.some((r) => Math.max(...r.value_off.warrior) !== Math.max(...r.value.warrior)),
		`lookup: gt_best for the offhand uses value_off (${wo[0] && wo[0].name}: off ${wo[0] && wo[0].best.value} vs main ${wo[0] && Math.max(...wo[0].value.warrior)})`);
	const line = c.R("gt_report_text()"), facts = c.R("report_facts().filter((f) => f.key === 'gear_table').map((f) => f.text)");
	assert(new RegExp(`^gear table: ${N} items, ${M} slots, built v${ix.built_from.replace(".", "\\.")}(?: ≠ running v[\\d.]+)? \\(current\\)`).test(line) && facts.length === 1 && facts[0] === line, `lookup: report line (${line})`);
	assert(c.logs.filter((l) => /^gear table:/.test(l)).length === 1 && !c.logs.some((l) => /built for/.test(l)), "lookup: logged once, no stale warning on matching game data");
	c.R("globalThis.__bf = gt.index.built_from; gt.index.built_from = '1.0'");
	assert(/built v1\.0 ≠ running v\d/.test(c.R("gt_report_text()")), `lookup: the report flags a built_from other than VERSION (${c.R("gt_report_text()")})`);
	c.R("gt.index.built_from = __bf");
	// the bot itself (v25.81): a stat-scrolled piece's stat counts as that attribute; can_wear counts two-handers
	c.R("G.items.tst = { type: 'helmet', stat: 2, upgrade: { stat: 1 }, grades: [9, 10, 11, 12] }; G.items.tax = { type: 'weapon', wtype: 'axe' }; G.items.tbw = { type: 'quiver' }");
	c.R("G.classes.warrior = { main_stat: 'str', mainhand: { mace: {} }, doublehand: { axe: {} }, offhand: { shield: {} } }; G.classes.priest = { main_stat: 'int', mainhand: { staff: {} }, offhand: { shield: {} } }; G.classes.mage.mainhand = { wand: {} }");
	assert(c.R("gear_score({ name: 'tst', level: 1, stat_type: 'int' }, 'mage')") === 3.6 && c.R("gear_score({ name: 'tst', level: 1 }, 'mage')") === 0 && c.R("gear_score({ name: 'tst', level: 1, stat_type: 'armor' }, 'mage')") === 2,
		`bot: piece_value counts a stat scroll's stat as its attribute (int +1: ${c.R("gear_score({ name: 'tst', level: 1, stat_type: 'int' }, 'mage')")}, none: ${c.R("gear_score({ name: 'tst', level: 1 }, 'mage')")}, armor: ${c.R("gear_score({ name: 'tst', level: 1, stat_type: 'armor' }, 'mage')")})`);
	const cw = (ct, n) => c.R(`character.ctype = '${ct}'; globalThis.__cw = can_wear('${n}'); character.ctype = 'mage'; __cw`);
	assert(cw("warrior", "tax") === true && cw("mage", "tax") === false && cw("priest", "tbw") === false,
		"bot: can_wear counts a two-hander (warrior axe yes; mage axe, priest quiver no)");
	// the max level guard: a +10-max piece is never stepped to +11 or +12 (the old tables' zero odds were the only guard)
	c.R("G.items.t10 = { type: 'helmet', armor: 5, upgrade: { armor: 1 }, grades: [3, 6, 8, 10] }; G.items.t12 = { type: 'helmet', armor: 5, upgrade: { armor: 1 } }; for (const k of ['scroll0', 'scroll1', 'scroll2', 'scroll4']) G.items[k] = { type: 'uscroll', g: 1000 }");
	const st = (L) => c.R(`(() => { try { return upgrade_step({ name: 't10', level: ${L} }, 'mage', { w: { helmet: 1 }, wn: {} }, 'helmet', ${L}); } catch (e) { return { ok: 'threw', why: String(e) }; } })()`);
	assert([10, 11].every((L) => st(L)?.ok === false && /past its max level \+10/.test(st(L).why)) && c.R("upg_odds('t10', 11)") === 0 && c.R("upg_odds('t10', 12)") === 0 && c.R("upg_odds('t10', 10)") > 0 && c.R("upg_odds('t12', 11)") > 0,
		`bot: upgrade_step refuses +11 / +12 on a +10-max piece (${st(10)?.why}); upg_odds 0 past the max`);
	c.ctx.item_grade = (it) => (!it || !it.name ? -1 : calculate_item_grade(c.ctx.G.items[it.name], it)); // the game's grades for the odds rows
	assert(c.R("G.items.tcmp = { type: 'ring', compound: { int: 1 }, grades: [2, 4, 6, 7] }; [cmp_odds('tcmp', 4), cmp_odds('tcmp', 5), cmp_odds('tcmp', 7), cmp_odds('tcmp', 8)].join()") === "0.25,0.15,0.03,0",
		"bot: cmp_odds by the server's rule (the grade at the input level - 2 from +3 inputs), 0 past the max");
	assert(c.R("G.items.lostearring = { type: 'earring', compound: { int: 1 }, grades: [0, 2, 6, 7] }; [cmp_odds('lostearring', 1), cmp_odds('lostearring', 3)].join()") === "0.8,0.32", "bot: lostearring on the grade 2 row");
	// b) GitHub down, the cached copy is used
	const store = { ...c.store };
	c = client({ fetch_ok: false, store, version: GV });
	assert(await c.R("gear_table_load()") === "cached" && c.R("gt_item('skullamulet')")?.name === "skullamulet" && /cached copy @abcdef1 \(GitHub: offline\)/.test(c.R("gt_report_text()")), `lookup: on a failed download the cached copy is served (${c.R("gt_report_text()")})`);
	// c) broken downloads with a cache: the cache, not a half table
	{ const c2 = client({ store: { ...store }, version: GV, files: { "orb.json": "{not json" } });
		assert(await c2.R("gear_table_load()") === "cached" && c2.R("gt_slot('orb').length") === ix.slots.orb.items, "lookup: a corrupt slot file → the cached copy, whole"); }
	{ const c2 = client({ store: { ...store }, version: GV, files: { "orb.json": JSON.stringify({ slot: "orb", count: 0 }) } });
		assert(await c2.R("gear_table_load()") === "cached" && c2.R("gt_slot('orb').length") === ix.slots.orb.items, "lookup: a slot file with no items → the cached copy"); }
	{ const j = JSON.parse(slot_text("ring")); delete j.items[Object.keys(j.items)[0]];
		const c2 = client({ store: {}, version: GV, files: { "ring.json": JSON.stringify(j) } });
		assert(await c2.R("gear_table_load()") === "failed" && /short of items/.test(c2.R("gt_report_text()")), `lookup: a slot file short of the items index.json lists is refused (${c2.R("gt_report_text()")})`); }
	// d) no download, no cache: nothing served, and the report says so
	c = client({ fetch_ok: false, store: {} });
	assert(await c.R("gear_table_load()") === "failed" && c.R("gt_item('skullamulet')") === null && c.R("gt_best('mage', 'ring').length") === 0 && /^gear table: not loaded \(offline; cache: no cached copy\)/.test(c.R("gt_report_text()")),
		`lookup: failure with no cache → null / [] and a report line (${c.R("gt_report_text()")})`);
	assert(c.logs.filter((l) => /^gear table:/.test(l)).length === 1, "lookup: the failure is logged once");
	// d2) a corrupt cache: unparsable, or a null record — failed (not stuck loading), never a rejection
	for (const [label, bad] of [["unparsable", "{oops"], ["a null record", (() => { const d = JSON.parse(store.farmer_gear_table); const s = Object.keys(d.slots.ring)[0]; d.slots.ring[s] = null; return JSON.stringify(d); })()]]) {
		const c2 = client({ fetch_ok: false, store: { farmer_gear_table: bad } });
		let st_ = null; try { st_ = await c2.R("gear_table_load()"); } catch (e) { st_ = "rejected: " + e; }
		assert(st_ === "failed" && c2.R("gt.status") === "failed" && c2.R("gt.items") === null, `lookup: a corrupt cache (${label}) → failed, the promise resolves (${st_}; ${c2.R("gt_report_text()")})`);
	}
	// d3) setItem throws (quota): served, noted, not cached
	c = client({ store: {}, version: GV, set_throws: true });
	assert(await c.R("gear_table_load()") === "loaded" && c.logs.some((l) => /^gear table: .*\(not cached: QuotaExceededError\)/.test(l)), `lookup: a quota error on the cache write → loaded, noted (${c.logs.find((l) => /^gear table/.test(l))})`);
	// d4) timeout: a fetch that never answers is aborted after timeout_ms; the cache is used
	c = client({ store: { ...store }, version: GV, hang: ["index.json"] });
	{ const p = c.R("gear_table_load()"); await tick(); await tick();
		const t = c.timers.filter((x) => x.ms === c.R("CFG.gear_table.timeout_ms"));
		t.forEach((x) => x.fn());
		assert(t.length >= 1 && await p === "cached" && /aborted \(timeout\)/.test(c.R("gt.err")), `lookup: a hung download times out (${t.length} timer at ${c.R("CFG.gear_table.timeout_ms")} ms) → the cache (${c.R("gt.err")})`); }
	// e) stale: other game data, or other scoring code — one warning, still served, flagged in the report
	c = client({ version: 1 });
	await c.R("gear_table_load()"); await c.R("gear_table_load()");
	assert(c.logs.filter((l) => /built for game data/.test(l)).length === 1 && c.R("gt_item('hpamulet')") && /\(stale\)/.test(c.R("gt_report_text()")) && c.R("report_facts().find((f) => f.key === 'gear_table').quiet") === false,
		"lookup: a g_version mismatch warns once, still serves, report says stale");
	c = client({ version: GV, files: { "index.json": JSON.stringify({ ...ix, score_hash: "00000000" }) } });
	await c.R("gear_table_load()");
	assert(c.R("gt.stale") === true && /\(stale\) \[other scoring code/.test(c.R("gt_report_text()")) && c.logs.filter((l) => /^gear table: built for other scoring code/.test(l)).length === 1, `lookup: a score_hash other than this code's → stale (${c.R("gt_report_text()")})`);
	// f) commit unknown: master's newest commit from the API, every file from it, cached; the API down: master, not cached
	c = client({ sha: null, version: GV });
	await c.R("gear_table_load()");
	assert(/api\.github\.com\/repos\/someone\/somefork\/commits\/master/.test(c.urls[0]) && c.urls.slice(1).every((u) => u.includes(`/${MASTER}/data/gear/`)) && JSON.parse(c.store.farmer_gear_table).sha === MASTER,
		`lookup: no commit known → master's newest commit, every file from it (${c.urls[1]})`);
	c = client({ sha: null, version: GV, api_sha: null });
	await c.R("gear_table_load()");
	assert(c.R("gt.status") === "loaded" && c.urls[1] === "https://raw.githubusercontent.com/someone/somefork/master/data/gear/index.json" && !c.store.farmer_gear_table && c.logs.some((l) => /not cached: commit unknown/.test(l)),
		`lookup: master's commit unknown → master's files, not cached (${c.urls[1]})`);
	console.log(fails ? `GEAR TABLE: ${fails} FAILED` : "GEAR TABLE ALL PASS");
	process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
