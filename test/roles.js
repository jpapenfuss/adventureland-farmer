// The split (src/): each role's file set loads and runs on its own — the build is current, no role uses the other
// role's names (tools/split_check.js), and in a mocked client a fighter (common + fighter + main) and the merchant
// (common + merchant + main) start, tick, report and plan town work without an error.
const vm = require("vm"), path = require("path");
const { build, role_fns, ROLE_FILES } = require(path.join(__dirname, "..", "tools", "build.js"));
const { check } = require(path.join(__dirname, "..", "tools", "split_check.js"));
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } console.log("ok -", m); };
const fs = require("fs");
assert(fs.readFileSync(path.join(__dirname, "..", "farmer.js"), "utf8") === build(), "farmer.js is the build of src/ (node tools/build.js)");
{ const e = check(); assert(!e.length, `split check${e.length ? ":\n  " + e.join("\n  ") : ""}`); }

async function run(role) {
	const src = build(ROLE_FILES[role]);
	const log = [], timers = [];
	const character = { name: role === "merchant" ? "DoWhatNow" : "Torlis", ctype: role === "merchant" ? "merchant" : "paladin", level: 50, xp: 0,
		hp: 5000, max_hp: 5000, mp: 1000, max_mp: 1000, x: 0, y: 0, map: "main", attack: 300, frequency: 1, armor: 200, resistance: 200,
		range: 30, speed: 50, items: Array(42).fill(null), slots: {}, s: {}, c: {}, esize: 42, gold: 1e6, rip: false, str: 80, int: 40 };
	character.on = () => {};
	const G = { monsters: { goo: { xp: 10, hp: 100, attack: 5, respawn: 10, range: 20, speed: 10, armor: 0, resistance: 0 } },
		maps: { main: { monsters: [{ type: "goo", count: 5, boundary: [100, 100, 400, 400] }], npcs: [] } },
		items: { hpot1: { g: 20, type: "pot", gives: [["hp", 400]] }, mpot1: { g: 20, type: "pot", gives: [["mp", 500]] } },
		classes: { paladin: { main_stat: "str", damage_type: "physical" }, merchant: { main_stat: "int" } }, npcs: {}, craft: {}, quests: {}, levels: { 50: 1e6 }, sets: {}, tokens: {}, skills: { mluck: { range: 320, cooldown: 100 } } };
	const ctx = { character, G, code_settings: {}, console, parent: { socket: { emit() {} }, entities: {}, chests: {}, next_skill: {} },
		game_log: (m) => log.push(String(m)), set_message() {}, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
		setInterval: (fn) => { timers.push({ fn, interval: true }); return timers.length; },
		smart_move: () => new Promise(() => {}), move() {}, stop() {}, use_skill: () => Promise.resolve(), attack: () => Promise.resolve(), heal: () => Promise.resolve(),
		is_on_cooldown: () => false, quantity: () => 100, get_party: () => ({}), distance: () => 0, can_move_to: () => true, is_moving: () => false,
		is_in_range: () => true, can_attack: () => true, get_targeted_monster: () => null, change_target() {}, get_nearest_monster: () => null, respawn() {},
		item_grade: () => 0, item_value: () => 0, find_npc: () => null, damage_multiplier: (d) => 1 - d / 1000, send_cm: () => Promise.resolve() };
	vm.createContext(ctx);
	const errs = () => log.filter((l) => /ReferenceError|TypeError|is not defined|is not a function/.test(l));
	vm.runInContext(src, ctx);
	// every interval body once, then ticks (each tick schedules the next)
	for (const t of timers.filter((x) => x.interval)) { try { const r = t.fn(); if (r?.catch) await r.catch((e) => log.push("interval: " + e)); } catch (e) { log.push("interval: " + e); } }
	for (let i = 0; i < 8; i++) {
		const t = timers.filter((x) => !x.interval && x.fn.name === "tick").pop();
		if (!t) break;
		timers.splice(timers.indexOf(t), 1);
		try { t.fn(); } catch (e) { log.push("tick: " + e); }
		await new Promise((r) => setImmediate(r));
	}
	for (const c of ["report_lines(false)", "town_due()", "bag_plan()", "my_gear()", "heartbeat()", "upgrade_due()", "history_lines(1)"]) {
		try { vm.runInContext(c, ctx); } catch (e) { log.push(`${c}: ${e}`); }
	}
	// v25.78 (owner): the merchant's report classes every non-stackable bank item; nothing placeable → UNCLASSIFIED
	if (role === "merchant") {
		Object.assign(G.items, { quiver: { type: "quiver", g: 100 }, mystery: { type: "misc", g: 100 }, shell9: { type: "material", s: 9999 } });
		vm.runInContext("state.bank_dump = { quiver: 3, mystery: 1, shell9: 500 }; state.bank_at = Date.now(); state.partners = {}; for (const n of CFG.party.members) state.partners[n] = { name: n, ctype: 'paladin', t: Date.now(), gear: { w: {} } }", ctx);
		const bt0 = vm.runInContext("globalThis.__pp = state.partners; state.partners = {}; globalThis.__bt0 = bank_classes_text(); state.partners = __pp; __bt0", ctx);
		assert(/gear \(not every fighter heard from/.test(bt0) || !/no party class/.test(bt0), `merchant: with fighters unheard, gear verdicts are provisional (${bt0})`);
		const bt = vm.runInContext("bank_classes_text()", ctx);
		assert(/no party class can use: quiver x3/.test(bt) && /UNCLASSIFIED: mystery/.test(bt) && !/shell9/.test(bt) && bt.indexOf("UNCLASSIFIED") < bt.indexOf("no party"), `merchant: bank items classed, UNCLASSIFIED first, stackables left out (${bt})`);
	}
	// the xp/gold sampling (rates() in reports) runs on every character — it had been carried to fighter.js (v24.95–v25.0)
	assert(vm.runInContext("stats.samples.length", ctx) > 0, `${role}: xp/gold samples are taken (rates in the report)`);
	// what the game and the console call must exist on every character, whatever its role
	const need = ["on_party_invite", "on_party_request", "on_destroy", "report", "history", "deaths", "selftest", "why_not", "park", "resume", "unpause", "gear_check"];
	const missing = need.filter((n) => typeof ctx[n] !== "function");
	assert(!missing.length, `${role}: console and game hooks present${missing.length ? " — MISSING " + missing.join(", ") : ""}`);
	// role functions (v25.11): the role's own version, by itself (no dispatcher in a role's own file set)
	assert(!/__fighter|__merchant/.test(src) && vm.runInContext("ptown_on()", ctx) === (role === "fighter" && !!vm.runInContext("CFG.party.town_together && in_party_cfg()", ctx))
		&& vm.runInContext("gold_keep()", ctx) === vm.runInContext(role === "merchant" ? "CFG.merchant.donate.keep" : "CFG.gold_reserve", ctx)
		&& (role === "fighter" || vm.runInContext("merchant_hb() === null && merchant_recent() === false", ctx)), `${role}: role functions are its own (ptown_on, gold_keep, merchant_hb)`);
	assert(!errs().length, `${role} (src/${ROLE_FILES[role].join(", src/")}): loads, ticks, reports with no error${errs().length ? ":\n  " + errs().slice(0, 8).join("\n  ") : ""}`);
}
// the all-in-one build (farmer.js): each role function calls the running character's role's version
{
	const fns = role_fns(), all = build();
	assert(fns.length && fns.every((n) => all.includes(`function ${n}(...a) { return (is_merchant() ? ${n}__merchant : ${n}__fighter)`) && all.includes(`function ${n}__fighter(`) && all.includes(`function ${n}__merchant(`)),
		`farmer.js dispatches the role functions by role (${fns.join(", ")})`);
}
(async () => { await run("fighter"); await run("merchant"); console.log("ROLES ALL PASS"); })().catch((e) => { console.error("FAIL:", e); process.exit(1); });
