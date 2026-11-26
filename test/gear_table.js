// Gear table tests (v25.81): the generator (tools/gear_table.js) on a small G fixture, the committed data/gear files
// (parse, sizes, and every equipment piece of the real data.js when one is at hand), and the run-time lookups
// (src/shared/19_gear_table.js) against a stubbed fetch: download, cache, failure, stale data. Run by test/roles.js.
const vm = require("vm"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), DIR = path.join(ROOT, "data", "gear");
const { build_table, parse_data } = require(path.join(ROOT, "tools", "gear_table.js"));
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
		rogue: { main_stat: "dex", mainhand: { dagger: {} }, offhand: { dagger: {} } },
	},
	items: {
		tring: { type: "ring", name: "Test Ring", int: 2, compound: { int: 1 }, g: 1000, grades: [2, 4, 6, 7] },
		twand: { type: "weapon", wtype: "wand", name: "Test Wand", tier: 1, attack: 10, upgrade: { attack: 2 }, g: 5000, grades: [3, 6, 8, 10] },
		taxe: { type: "weapon", wtype: "axe", name: "Test Axe", attack: 30, g: 9000 },
		thelm: { type: "helmet", name: "Test Helm", set: "tset", armor: 10, g: 100 },
		tboots: { type: "shoes", name: "Test Boots", set: "tset", armor: 4, class: ["mage"], g: 100 },
		tcoat: { type: "chest", name: "Test Coat", stat: 2, armor: 5, upgrade: { stat: 1, armor: 1 }, g: 100, grades: [3, 6, 8, 10] },
		tbox: { type: "box", name: "Test Box", e: 1, g: 10 },
		tmat: { type: "material", name: "Test Mat", g: 1 },
		cscroll0: { type: "cscroll", grade: 0, g: 6400 }, cscroll1: { type: "cscroll", grade: 1, g: 240000 },
		scroll0: { type: "uscroll", grade: 0, g: 1000 }, scroll1: { type: "uscroll", grade: 1, g: 40000 },
	},
	sets: { tset: { 1: {}, 2: { int: 5 }, name: "Test Set", items: ["thelm", "tboots"] } },
	npcs: { shopguy: { name: "Shop Guy", items: ["tring", "twand"] }, gone: { name: "Gone", ignore: true, items: ["thelm"] } },
	maps: { main: { npcs: [{ id: "shopguy", position: [10, 20] }, { id: "gone", position: [0, 0] }], monsters: [] } },
	craft: { thelm: { items: [[2, "tmat"], [1, "tring", 1]], cost: 500 } },
	dismantle: {},
	drops: { tbox: [[3, "tring"], [1, "open", "inner"]], inner: [[1, "thelm"], [1, "tmat"]], monsters: { goo: [[0.01, "tring"], [0.5, "open", "tbox"]] }, maps: { main: [[0.001, "twand"]] } },
	tokens: { monstertoken: { tboots: 15 } },
	monsters: {}, skills: {}, levels: {}, quests: {},
};
{
	const T = build_table(JSON.parse(JSON.stringify(FIX)));
	const ring = T.slots.ring?.tring, wand = T.slots.mainhand?.twand, helm = T.slots.helmet?.thelm, boots = T.slots.shoes?.tboots, axe = T.slots.mainhand?.taxe;
	assert(eq(Object.keys(T.slots).sort(), ["chest", "helmet", "mainhand", "ring", "shoes"]) && !T.slots.box, `generator: one file per slot type, gear only (${Object.keys(T.slots)})`);
	// compound: +1..+4 add 1 int each, +5 x1.25, +6 x1.5, +7 x2 (rounded as the game rounds)
	assert(ring && eq(ring.stats.map((s) => s.int), [2, 3, 4, 5, 6, 7, 9, 11]) && ring.max_level === 7, `generator: compound stats per level (${ring && ring.stats.map((s) => s.int)})`);
	assert(ring && eq(ring.odds, [null, 0.99, 0.75, 0.4, 0.25, 0.2, 0.1, 0.08]) && ring.scroll.kind === "compound" && eq(ring.scroll.by_level, ["cscroll0", "cscroll0", "cscroll1", "cscroll1", "cscroll2", "cscroll2", "cscroll3"]),
		`generator: compound odds (cmp_odds) and scrolls by grade (${ring && JSON.stringify(ring.odds)})`);
	// upgrade: +2 attack a level, +7 x1.25, +8 x1.5, +9 x2, +10 x3
	assert(wand && eq(wand.stats.map((s) => s.attack), [10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 38]) && wand.scroll.kind === "upgrade" && wand.scroll.by_level[3] === "scroll1" && wand.scroll.by_level[6] === "scroll2",
		`generator: upgrade stats per level and scroll grade per level (${wand && wand.stats.map((s) => s.attack)})`);
	assert(wand && eq(wand.odds.slice(0, 4), [null, 1, 0.98, 0.95]) && wand.odds[10] === 0.024, `generator: upgrade odds (upg_odds) per level`);
	// piece_value: mage int 1.2 a point (main stat); the wand: attack + the mage's wand frequency 60 x 2.5
	assert(ring && eq(ring.value.mage, [2.4, 3.6, 4.8, 6, 7.2, 8.4, 10.8, 13.2]) && ring.value.paladin[0] === 2.4 && ring.value.ranger[0] === 0.6,
		`generator: piece_value per class per level (mage ${ring && ring.value.mage}; ranger int 0.25x)`);
	assert(wand && eq(Object.keys(wand.value), ["mage"]) && wand.value.mage[0] === 160 && eq(wand.slots, { mage: ["mainhand"] }) && wand.hands === 1, `generator: weapons valued only for classes that wield them (${wand && JSON.stringify(wand.value)})`);
	assert(axe && axe.hands === 2 && eq(axe.two_handed_for, ["warrior"]) && eq(Object.keys(axe.value), ["warrior"]), "generator: the two-handed flag");
	assert(boots && eq(boots.class, ["mage"]) && eq(Object.keys(boots.value), ["mage"]) && boots.set === "tset", "generator: class restriction and set");
	// sources
	const rs = ring && ring.sources;
	assert(rs && eq(rs.shops, [{ map: "main", npc: "shopguy", npc_name: "Shop Guy", price: 1000, x: 10, y: 20 }]) && !helm.sources.shops.length, "generator: NPC shops (ignored NPCs left out)");
	assert(rs && rs.boxes.length === 1 && rs.boxes[0].box === "tbox" && rs.boxes[0].p === 0.75 && eq(helm.sources.boxes.find((b) => b.box === "tbox"), { box: "tbox", need: 1, p: 0.125, via: ["inner"] }), `generator: exchange boxes with probability, nested tables followed (${rs && JSON.stringify(rs.boxes)})`);
	assert(rs && eq(rs.drops.map((d) => [d.monster, d.rate]), [["goo", 0.375], ["goo", 0.01]]) && eq(wand.sources.map_drops, [{ map: "main", rate: 0.001 }]), `generator: monster drops (direct and through a box) and map drops (${rs && JSON.stringify(rs.drops)})`);
	assert(helm && eq(helm.sources.craft, { cost: 500, inputs: [{ item: "tmat", q: 2 }, { item: "tring", level: 1, q: 1 }] }) && rs && eq(rs.input_to, [{ craft: "thelm", level: 1, q: 1 }]), "generator: craft recipe and what it's an input to");
	assert(boots && eq(boots.sources.tokens, [{ price: 15, token: "monstertoken" }]) && rs.from_lower === "compound" && wand.sources.from_lower === "upgrade" && helm.sources.from_lower === null, "generator: token prices, upgradable/compoundable from a lower copy");
	// v_stat: a main-stat scroll on a stat piece — its stat points (2, +1 a level) as int (mage 1.2) / str (paladin 1.2, x1 not defence)
	const coat = T.slots.chest?.tcoat;
	assert(coat && eq(coat.stats.map((s) => s.stat), [2, 3, 4, 5, 6, 7, 8, 10, 13, 16, 20]) && coat.v_stat && eq(coat.v_stat.mage.map((v, L) => r2(v - coat.value.mage[L])), coat.stats.map((s) => r2(s.stat * 1.2)))
		&& eq(coat.v_stat.ranger.map((v, L) => r2(v - coat.value.ranger[L])), coat.stats.map((s) => r2(s.stat * 1.2))) && !ring.v_stat && !wand.v_stat,
		`generator: v_stat = piece_value with a main-stat scroll (coat mage ${coat && coat.v_stat && coat.v_stat.mage.slice(0, 3)} vs ${coat && coat.value.mage.slice(0, 3)})`);
	// odds: the game's G.upgrades / G.compounds when the data has them; the bot's copy (to +12 / +10) otherwise
	const Gu = JSON.parse(JSON.stringify(FIX)); Gu.upgrades = { 0: { 1: 0.5, 11: 0.3 } }; Gu.compounds = { 0: { 5: 0.33 } };
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
	const DATA = [process.env.AL_DATA, "/tmp/al-data.js"].find((p) => p && fs.existsSync(p));
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
const SHA = "abcdef1" + "0".repeat(33);
function client({ fetch_ok = true, store = {}, sha = SHA, version, files } = {}) {
	const logs = [], urls = [];
	const src = build(ROLE_FILES.fighter);
	const character = { name: "Torlis", ctype: "mage", level: 50, xp: 0, hp: 5000, max_hp: 5000, mp: 1000, max_mp: 1000, x: 0, y: 0, map: "main", attack: 300, frequency: 1,
		armor: 0, resistance: 0, range: 30, speed: 50, items: Array(42).fill(null), slots: {}, s: {}, c: {}, esize: 42, gold: 1e6, rip: false, on() {} };
	const G = { version, monsters: {}, maps: { main: { monsters: [], npcs: [] } }, items: { hpot1: { g: 20, type: "pot", gives: [["hp", 400]] }, mpot1: { g: 20, type: "pot", gives: [["mp", 500]] } },
		classes: { mage: { main_stat: "int" } }, npcs: {}, craft: {}, quests: {}, levels: { 50: 1e6 }, sets: {}, tokens: {}, skills: {} };
	const fetch = async (u) => {
		urls.push(u);
		if (!fetch_ok) throw new Error("offline");
		const f = (files || {})[u.split("/").pop()] ?? (fs.existsSync(path.join(DIR, u.split("/").pop())) ? fs.readFileSync(path.join(DIR, u.split("/").pop()), "utf8") : null);
		return f == null ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => JSON.parse(f), text: async () => f };
	};
	const ctx = { character, G, code_settings: {}, console, parent: { socket: { emit() {} }, entities: {}, chests: {}, next_skill: {} }, fetch, AbortController,
		window: { farmer_loaded: { sha, url: sha ? `https://raw.githubusercontent.com/someone/somefork/${sha}/src/manifest.json` : "https://raw.githubusercontent.com/someone/somefork/master/farmer.js" },
			localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } } },
		game_log: (m) => logs.push(String(m)), set_message() {}, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
		smart_move: () => new Promise(() => {}), move() {}, stop() {}, use_skill: () => Promise.resolve(), attack: () => Promise.resolve(), heal: () => Promise.resolve(),
		is_on_cooldown: () => false, quantity: () => 0, get_party: () => ({}), distance: () => 0, can_move_to: () => true, is_moving: () => false, is_in_range: () => true,
		can_attack: () => true, get_targeted_monster: () => null, change_target() {}, get_nearest_monster: () => null, respawn() {}, item_grade: () => 0, item_value: () => 0,
		find_npc: () => null, damage_multiplier: (d) => 1 - d / 1000, send_cm: () => Promise.resolve() };
	vm.createContext(ctx);
	vm.runInContext(src, ctx);
	return { ctx, logs, urls, store, R: (c) => vm.runInContext(c, ctx) };
}
(async () => {
	const ix = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8")), N = ix.items, M = Object.keys(ix.slots).length;
	// a) download at the loaded commit, from the loader's repo; cached; lookups
	let c = client({ version: Number(ix.g_version) || ix.g_version });
	assert(await c.R("gear_table_load()") === "loaded" && c.urls.length === M + 2 && c.urls.every((u) => u.startsWith(`https://raw.githubusercontent.com/someone/somefork/${SHA}/data/gear/`)), `lookup: index + ${M} slot files + sets fetched at the loaded commit (${c.urls[0]})`);
	await c.R("gear_table_load()");
	assert(c.urls.length === M + 2, "lookup: once per load (a second call fetches nothing)");
	assert(c.store.farmer_gear_table && JSON.parse(c.store.farmer_gear_table).sha === SHA, "lookup: the download is cached in localStorage");
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
	const line = c.R("gt_report_text()"), facts = c.R("report_facts().filter((f) => f.key === 'gear_table').map((f) => f.text)");
	assert(new RegExp(`^gear table: ${N} items, ${M} slots, built v${ix.built_from.replace(".", "\\.")} \\(current\\)`).test(line) && facts.length === 1 && facts[0] === line, `lookup: report line (${line})`);
	assert(c.logs.filter((l) => /^gear table:/.test(l)).length === 1 && !c.logs.some((l) => /built for game data/.test(l)), "lookup: logged once, no stale warning on matching game data");
	// the bot itself (v25.81): a stat-scrolled piece's stat counts as that attribute; can_wear counts two-handers
	c.R("G.items.tst = { type: 'helmet', stat: 2, upgrade: { stat: 1 }, grades: [9, 10, 11, 12] }; G.items.tax = { type: 'weapon', wtype: 'axe' }; G.items.tbw = { type: 'quiver' }");
	c.R("G.classes.warrior = { main_stat: 'str', mainhand: { mace: {} }, doublehand: { axe: {} }, offhand: { shield: {} } }; G.classes.priest = { main_stat: 'int', mainhand: { staff: {} }, offhand: { shield: {} } }; G.classes.mage.mainhand = { wand: {} }");
	assert(c.R("gear_score({ name: 'tst', level: 1, stat_type: 'int' }, 'mage')") === 3.6 && c.R("gear_score({ name: 'tst', level: 1 }, 'mage')") === 0 && c.R("gear_score({ name: 'tst', level: 1, stat_type: 'armor' }, 'mage')") === 2,
		`bot: piece_value counts a stat scroll's stat as its attribute (int +1: ${c.R("gear_score({ name: 'tst', level: 1, stat_type: 'int' }, 'mage')")}, none: ${c.R("gear_score({ name: 'tst', level: 1 }, 'mage')")}, armor: ${c.R("gear_score({ name: 'tst', level: 1, stat_type: 'armor' }, 'mage')")})`);
	const cw = (ct, n) => c.R(`character.ctype = '${ct}'; globalThis.__cw = can_wear('${n}'); character.ctype = 'mage'; __cw`);
	assert(cw("warrior", "tax") === true && cw("mage", "tax") === false && cw("priest", "tbw") === false,
		"bot: can_wear counts a two-hander (warrior axe yes; mage axe, priest quiver no)");
	// b) GitHub down, the cached copy is used
	const store = { ...c.store };
	c = client({ fetch_ok: false, store, version: Number(ix.g_version) || ix.g_version });
	assert(await c.R("gear_table_load()") === "cached" && c.R("gt_item('skullamulet')")?.name === "skullamulet" && /cached copy @abcdef1 \(GitHub: offline\)/.test(c.R("gt_report_text()")), `lookup: on a failed download the cached copy is served (${c.R("gt_report_text()")})`);
	// c) a broken download (a slot file missing) with a cache: the cache, not a half table
	{ const c2 = client({ store: { ...store }, version: Number(ix.g_version) || ix.g_version, files: { "orb.json": "{not json" } });
		assert(await c2.R("gear_table_load()") === "cached" && c2.R("gt_slot('orb').length") === ix.slots.orb.items, "lookup: a corrupt slot file → the cached copy, whole"); }
	// d) no download, no cache: nothing served, and the report says so
	c = client({ fetch_ok: false, store: {} });
	assert(await c.R("gear_table_load()") === "failed" && c.R("gt_item('skullamulet')") === null && c.R("gt_best('mage', 'ring').length") === 0 && /^gear table: not loaded \(offline; no cached copy\)/.test(c.R("gt_report_text()")),
		`lookup: failure with no cache → null / [] and a report line (${c.R("gt_report_text()")})`);
	assert(c.logs.filter((l) => /^gear table:/.test(l)).length === 1, "lookup: the failure is logged once");
	// e) stale: other game data — one warning, still served, flagged in the report
	c = client({ version: 1 });
	await c.R("gear_table_load()"); await c.R("gear_table_load()");
	assert(c.logs.filter((l) => /built for game data/.test(l)).length === 1 && c.R("gt_item('hpamulet')") && /\(stale\)/.test(c.R("gt_report_text()")) && c.R("report_facts().find((f) => f.key === 'gear_table').quiet") === false,
		"lookup: a g_version mismatch warns once, still serves, report says stale");
	// f) commit unknown: master
	c = client({ sha: null, version: Number(ix.g_version) || ix.g_version });
	await c.R("gear_table_load()");
	assert(c.urls[0] === "https://raw.githubusercontent.com/someone/somefork/master/data/gear/index.json", `lookup: no commit known → master (${c.urls[0]})`);
	console.log(fails ? `GEAR TABLE: ${fails} FAILED` : "GEAR TABLE ALL PASS");
	process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
