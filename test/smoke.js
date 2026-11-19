// Minimal mock of the Adventure Land CODE runtime: enough to drive tick() through the paths v9 changed.
const vm = require("vm"), fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "farmer.js"), "utf8");
const log = [], calls = [];
const character = { name: "me", ctype: "ranger", level: 10, xp: 0, hp: 1000, max_hp: 1000, mp: 500, max_mp: 500,
	x: 0, y: 0, map: "main", attack: 100, frequency: 1, armor: 50, resistance: 50, range: 120, speed: 50,
	items: Array(42).fill(null), slots: {}, s: {}, c: {}, esize: 40, gold: 1e6, rip: false };
const handlers = {};
character.on = (ev, f) => (handlers[ev] = f);
const G = {
	monsters: { goo: { xp: 10, hp: 100, attack: 5, respawn: 10, range: 20, speed: 10, armor: 0, resistance: 0 } },
	maps: { main: { monsters: [{ type: "goo", count: 5, boundary: [100, 100, 400, 400] }], npcs: [] } },
	items: { hpot1: { g: 20 }, mpot1: { g: 20 }, beewings: { type: "material" }, gslime: { type: "material" } }, skills: { attack: {}, use_town: {}, use_hp: {}, use_mp: {}, regen_hp: {}, regen_mp: {} },
	classes: { ranger: { damage_type: "physical" } }, npcs: {}, craft: { wcap: { quest: "mcollector", items: [[20, "beewings"]] } }, quests: {}, levels: { 10: 1000 },
};
const timers = [];
const ctx = {
	character, G, code_settings: {}, console,
	parent: { socket: { emit() {} }, entities: {}, chests: {}, next_skill: {} },
	game_log: (m) => log.push(String(m)), set_message() {},
	setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}, setInterval() {},
	smart_move: () => new Promise(() => {}), // never resolves: simulates a long walk
	move: () => calls.push("move"), stop: (a) => calls.push("stop:" + a),
	use_skill: (s) => (calls.push("skill:" + s), Promise.resolve()), attack: () => Promise.resolve(), heal: () => Promise.resolve(),
	is_on_cooldown: () => false, quantity: () => 100, get_party: () => ({}), distance: () => 0, can_move_to: () => true,
	is_moving: () => false, is_in_range: () => true, can_attack: () => true, get_targeted_monster: () => null, change_target() {},
	get_nearest_monster: () => null, respawn() {}, item_grade: () => 0, item_value: () => 0, find_npc: () => null,
	damage_multiplier: (d) => 1 - d / 1000,
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const st = () => vm.runInContext("state", ctx);
const runTick = () => { const t = timers.filter((x) => x.fn.name === "tick").pop(); timers.length = 0; t.fn(); return timers.find((x) => x.fn.name === "tick").ms; };
const assert = (c, m) => { if (!c) { console.error("FAIL:", m, "\nlog:", log); process.exit(1); } console.log("ok -", m); };

// 1) tick wait is never NaN (next_skill.attack unset), with a target present
ctx.parent.entities.g1 = { id: "g1", type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, xp: 10, x: 200, y: 200, target: null };
ctx.get_targeted_monster = () => null;
character.x = 200; character.y = 200;
let w = runTick();
assert(Number.isFinite(w) && w >= 50, `tick wait finite with next_skill.attack unset (got ${w})`);
assert(st().pack && st().pack.mtype === "goo", "picked goo pack");
delete ctx.parent.entities.g1;

// 2) directive without boundary falls back to spawn data instead of crashing pack_key
vm.runInContext(`state.directive = null;`, ctx);
const area = vm.runInContext(`resolve_area("goo", "main", undefined, 3)`, ctx);
assert(area && area.map === "main" && area.boundary.join() === "100,100,400,400", "resolve_area falls back to spawn boundary");
assert(vm.runInContext(`resolve_area("nonexistent")`, ctx) === null, "resolve_area null for unknown monster");
assert(!vm.runInContext(`valid_boundary([0,0,"x",5]) || valid_boundary(undefined) || valid_boundary([5,5,1,1])`, ctx), "valid_boundary rejects junk");

// 3) low HP while smart_moving: stops the walk, channels town, holds until recovered
vm.runInContext(`travel({map:"main",x:1,y:1})`, ctx); // starts a never-ending smart_move
assert(vm.runInContext("walking()", ctx), "smart_move in flight");
character.hp = 200; calls.length = 0;
runTick();
assert(calls.includes("stop:smart") && calls.includes("skill:use_town"), "flee cancels smart_move and fires use_town while traveling");
assert(st().recovering, "recovering set");
character.hp = 300; calls.length = 0;
runTick(); runTick();
assert(st().recovering && !calls.includes("skill:use_town"), "at 30% HP: still recovering, no re-channel, no travel");
character.hp = 900;
runTick();
assert(!st().recovering, "resumes at recover_hp");

// 4) errand lock: hung errand times out and a stale finally can't clear a newer lock
vm.runInContext(`errand("a", () => new Promise(() => {}))`, ctx);
assert(vm.runInContext("errand_busy()", ctx), "errand busy");
assert(!vm.runInContext(`errand("b", async () => {})`, ctx), "second errand refused while busy");
vm.runInContext(`state.errand_at -= CFG.errand_timeout_ms + 1`, ctx);
assert(!vm.runInContext("errand_busy()", ctx), "hung errand times out");

// 5) run_stat re-equips when the scroll step fails after unequip
(async () => {
	ctx.G.items.cscroll = { g: 1, stat: "str" }; ctx.G.items.ring1 = {};
	character.slots.ring1 = { name: "ring1" };
	ctx.unequip = (slot) => { const it = character.slots[slot]; character.slots[slot] = null; character.items[0] = it; return Promise.resolve(); };
	ctx.equip = (k, slot) => { character.slots[slot] = character.items[k]; character.items[k] = null; calls.push("equip"); return Promise.resolve(); };
	ctx.upgrade = () => Promise.reject({ reason: "server_error" });
	ctx.quantity = (n) => (n === "cscroll" ? 5 : 100);
	character.items[1] = { name: "cscroll", q: 5 };
	character.items[2] = { name: "computer" };
	ctx.setTimeout = (fn, ms) => (ms < 5000 && fn(), 0); // short sleeps instant; T() timeouts never fire
	let err;
	try { await vm.runInContext(`run_stat({ slot: "ring1", name: "ring1", scroll: "cscroll", quantity: 1 })`, ctx); } catch (e) { err = e; }
	assert(err && err.reason === "server_error", "run_stat surfaces the upgrade failure");
	assert(character.slots.ring1 && character.slots.ring1.name === "ring1", "ring re-equipped after failed stat step");

	// 6) T(): a never-answered call rejects with timeout instead of hanging
	let fired;
	ctx.setTimeout = (fn, ms) => { if (ms >= 5000) fired = fn; else fn(); return 0; };
	const pending = vm.runInContext(`T(new Promise(() => {}))`, ctx);
	fired();
	const r6 = await pending.catch((e) => e);
	assert(r6 && r6.reason === "timeout", "T() times out unanswered game calls");

	// 7) quest materials protected before any guide read
	vm.runInContext("guide_refresh()", ctx);
	assert(vm.runInContext(`state.needs.has("beewings")`, ctx), "open quest recipe inputs are kept in bags (needs)");

	// 8) hunt: turn-in is followed by a start in the same visit
	const replies = [{ completed: true }, { started: true }];
	ctx.setTimeout = (fn, ms) => (ms < 5000 && fn(), 0);
	ctx.find_npc = () => ({ map: "main", x: 0, y: 0 });
	character.x = 0; character.y = 0;
	let n = 0;
	ctx.interact = () => (n++, Promise.resolve(replies.shift()));
	const r8 = await vm.runInContext(`run_hunt()`, ctx);
	assert(n === 2 && r8.started, "hunt turn-in chains into a new hunt");

	// 9) restock buys what it can afford instead of nothing
	const bought = [];
	ctx.quantity = () => 0; character.gold = 1000; // 50 pots' worth at 20g
	ctx.buy = (name, q) => (bought.push([name, q]), character.gold -= 20 * q, Promise.resolve());
	await vm.runInContext(`state.errand = null; smart_depth = 0; task_restock()`, ctx);
	assert(bought.length && bought[0][1] === 50, `restock buys affordable amount (${JSON.stringify(bought)})`);

	// 10) governor honours the server-reported call cost
	character.cc = 150;
	assert(vm.runInContext("spent()", ctx) >= 150 && !vm.runInContext("can_spend(1, 0)", ctx), "spent() uses character.cc");
	character.cc = 0;

	// 11) far chests wait for loot_wait_ms, near ones open at once
	const opened = [];
	ctx.parent.open_chest = (id) => opened.push(id);
	ctx.parent.chests = { far: { x: 1000, y: 0 } };
	ctx.distance = (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
	character.x = 0; character.y = 0; character.esize = 10;
	vm.runInContext("loot_chests()", ctx);
	assert(!opened.length, "far chest not opened immediately");
	vm.runInContext("chest_tries.far.seen -= CFG.loot_wait_ms + 1", ctx);
	vm.runInContext("loot_chests()", ctx);
	assert(opened[0] === "far", "far chest opened after loot_wait_ms");
	ctx.parent.chests = { near: { x: 100, y: 0 } };
	vm.runInContext("loot_chests()", ctx);
	assert(opened[1] === "near", "near chest opened at once");

	// 12) quest craft walks to the quest NPC
	const visited = [];
	ctx.G.craft.wcap.cost = 0; ctx.G.npcs.mcollector = { name: "Cole" };
	ctx.find_npc = (id) => (visited.push(id), { map: "main", x: 0, y: 0 });
	ctx.smart_move = () => Promise.resolve();
	ctx.auto_craft = () => Promise.resolve({ success: true });
	character.items[2] = null; // drop the computer
	character.gold = 1e6;
	const r12 = await vm.runInContext(`run_craft({ recipe: "wcap", ready: true })`, ctx).catch((e) => e);
	if (r12 && r12.reason) console.log("run_craft threw", r12);
	assert(visited[0] === "mcollector", `quest craft goes to quest NPC (${visited})`);
	assert(vm.runInContext("state.crafted.wcap === 1", ctx), "guide craft row counted in craft history");

	// 13) fight model
	vm.runInContext("pick_pack()", ctx);
	assert(vm.runInContext("!!state.safe.goo", ctx), "level-1 goo is safe");
	const elite = { id: "e1", type: "monster", mtype: "goo", level: 12, hp: 650, max_hp: 650, attack: 450, frequency: 0.8, speed: 15, xp: 1200 };
	assert(!vm.runInContext("live_ok", ctx)(elite), "levelled goo with 450 attack rejected by live check");
	const normal = { id: "n1", type: "monster", mtype: "goo", hp: 100, max_hp: 100, attack: 5, speed: 6, xp: 10 };
	assert(!!vm.runInContext("live_ok", ctx)(normal), "normal goo accepted by live check");
	ctx.G.monsters.fast = { xp: 10, hp: 100, attack: 2000, respawn: 10, range: 20, speed: 10, charge: 80, frequency: 1 };
	assert(!vm.runInContext(`fight_math(G.monsters.fast)`, ctx).kiteable, "kite check uses charge speed (80 > our 50)");
	ctx.G.monsters.onehp = { xp: 10, hp: 30, attack: 1, respawn: 10, "1hp": true, frequency: 1 };
	const f1 = vm.runInContext(`fight_math(G.monsters.onehp)`, ctx);
	assert(Math.abs(f1.ttk - 30) < 1e-6, `1hp mob: ttk = hp / hits per second (${f1.ttk})`);

	// 14) bag policy: spare gear and unneeded materials go to the bank at < bag_min_free free slots;
	//     potions, scrolls and open-quest materials stay; locked items stay
	ctx.G.items.gslime = { type: "material" }; ctx.G.items.beewings = { type: "material" }; ctx.G.items.seashell = { type: "material" };
	ctx.G.items.hpamulet = { type: "amulet", g: 7000 }; ctx.G.items.scroll0 = { type: "uscroll" }; ctx.G.items.hpot1.type = "pot";
	vm.runInContext("state.crafted = {}; state.gear_skip = {}; state.bank_seen = {}", ctx);
	ctx.G.craft.wcap.items = [[50, "beewings"], [3, "gslime"]];
	ctx.auto_craft = () => Promise.reject({ reason: "distance" }); // craft fails → recipe shelved but still wanted
	character.items = Array(42).fill(null);
	for (let i = 5; i < 38; i++) character.items[i] = i % 2 ? { name: "hpamulet" } : { name: "seashell", q: i };
	character.items[0] = { name: "hpot1", q: 100 }; character.items[1] = { name: "scroll0", q: 3 };
	character.items[2] = { name: "beewings", q: 171 }; character.items[3] = { name: "gslime", q: 23 }; character.items[4] = { name: "hpamulet", l: "l" };
	const recount = () => (character.esize = character.items.filter((x) => !x).length);
	recount(); // 4 free
	const stored = [];
	character.bank = { items0: [] };
	ctx.bank_store = (i) => (stored.push(character.items[i].name), (character.items[i] = null), recount(), Promise.resolve({ success: true }));
	ctx.smart_move = (d) => { if (d && d.map) character.map = d.map; return Promise.resolve(); };
	vm.runInContext("guide_refresh()", ctx);
	const due14 = vm.runInContext("town_due()", ctx);
	assert(due14.bank && !due14.sell && due14.craft, `town run due for the bank, nothing sold by default (${JSON.stringify({ bank: due14.bank, sell: due14.sell })})`);
	vm.runInContext(`state.errand = null; smart_depth = 0; town_run(town_due())`, ctx);
	for (let i = 0; i < 2000 && vm.runInContext("state.errand", ctx); i++) await new Promise((r) => setImmediate(r));
	const kept = character.items.filter(Boolean).map((x) => x.name + (x.l ? "(locked)" : "")).sort().join();
	assert(stored.length === 33 && kept === "beewings,gslime,hpamulet(locked),hpot1,scroll0", `banked spares, kept pots/scrolls/quest mats/locked (${stored.length}: ${kept})`);
	// banked quest material comes back out on a bank visit
	vm.runInContext(`state.bank_seen = { frogt: 5 }`, ctx);
	ctx.G.items.frogt = { type: "material" };
	ctx.G.craft.wshoes = { items: [[5, "frogt"], [500, "beewings"]], cost: 0, quest: "mcollector" };
	vm.runInContext("guide_refresh()", ctx);
	assert(vm.runInContext("bag_plan().fetch.join()", ctx) === "frogt", "banked quest material is fetched back");
	delete ctx.G.craft.wshoes;
	// bank that stores nothing (full) → bank paused 15 min instead of a trip every 20s
	vm.runInContext(`state.bank_seen = {}`, ctx);
	{ let free = 0; for (let i = 0; i < 42; i++) if (!character.items[i] && ++free > 4) character.items[i] = { name: "seashell", q: 1 }; }
	recount();
	ctx.bank_store = () => Promise.resolve({ failed: true, reason: "bank_full" });
	vm.runInContext(`state.errand = null; state.gear_skip = {}; town_run(town_due())`, ctx);
	for (let i = 0; i < 2000 && vm.runInContext("state.errand", ctx); i++) await new Promise((r) => setImmediate(r));
	assert(vm.runInContext(`skipped("town:bank") && !town_due().bank`, ctx), "full bank → bank trips paused");
	vm.runInContext(`state.gear_skip = {}`, ctx);

	vm.runInContext("state.gear_skip = {}; state.crafted = {}", ctx);
	// 15) Cole: 50 beewings + 3 gslime → walks to mcollector and crafts wcap; once only (quest_craft_max 1)
	ctx.G.craft = {
		wcap: { items: [[50, "beewings"], [3, "gslime"]], cost: 0, quest: "mcollector" },
		armorring: { items: [[1, "snakefang"], [1, "vitring", 2]], cost: 0, quest: "mcollector" },
	};
	ctx.G.items.wcap = { type: "helmet" }; ctx.G.items.vitring = { type: "ring" }; ctx.G.items.snakefang = { type: "material" };
	character.items = Array(42).fill(null);
	character.items[0] = { name: "beewings", q: 120 }; character.items[1] = { name: "gslime", q: 10 };
	character.items[2] = { name: "snakefang", q: 1 }; character.items[3] = { name: "vitring", level: 2 };
	character.esize = 38; character.gold = 1e6; character.slots = {};
	const walked = [], crafted = [];
	ctx.find_npc = (id) => (id === "mcollector" ? { map: "main", x: 81, y: -283 } : null);
	ctx.smart_move = (d) => (walked.push(d), Promise.resolve());
	ctx.auto_craft = (id) => {
		crafted.push(id);
		for (const [q, n] of ctx.G.craft[id].items) character.items.find((i) => i && i.name === n).q -= q;
		character.items[10] = { name: id };
		return Promise.resolve({ success: true });
	};
	vm.runInContext("state.crafted = {}", ctx);
	const n15 = await vm.runInContext("quest_crafts()", ctx);
	assert(n15 === 1 && crafted.join() === "wcap", `crafted wcap once, skipped gear-input armorring (${crafted})`);
	assert(walked[0] && walked[0].x === 81 && walked[0].y === -253, "walked to Cole");
	assert(character.items[0].q === 70, "50 beewings consumed");
	// equip-if-empty: helmet slot exists and is empty → equipped
	character.slots = { helmet: null }; character.items[10] = { name: "wcap" };
	ctx.equip = (k, slot) => ((character.slots[slot] = character.items[k]), (character.items[k] = null), Promise.resolve());
	await vm.runInContext(`equip_if_empty("wcap")`, ctx);
	assert(character.slots.helmet && character.slots.helmet.name === "wcap", "crafted cap equipped into empty helmet slot");
	character.items[11] = { name: "wcap" };
	await vm.runInContext(`equip_if_empty("wcap")`, ctx);
	assert(character.items[11], "occupied slot left alone");

	// 16) quest farming: short on wings for the cap → directive to farm bees (from G.drops); craftable → no directive
	ctx.G.monsters.bee = { xp: 50, hp: 200, attack: 5, respawn: 10, range: 20, speed: 10, charge: 20, frequency: 1 };
	ctx.G.maps.main.monsters.push({ type: "bee", count: 6, boundary: [500, 500, 800, 800] });
	ctx.G.drops = { monsters: { bee: [[0.01, "beewings"], [1 / 6000, "stinger"]] } };
	ctx.G.craft = { wcap: { items: [[50, "beewings"], [3, "gslime"]], cost: 0, quest: "mcollector" } };
	character.items = Array(42).fill(null);
	character.items[0] = { name: "beewings", q: 20 }; character.items[1] = { name: "gslime", q: 3 };
	character.slots = {};
	assert(!vm.runInContext(`recipe_open("wcap")`, ctx), "crafted recipe stays closed even after the cap is gone (no perpetual re-farm)");
	vm.runInContext("state.crafted = {}", ctx);
	const d16 = vm.runInContext("quest_directive()", ctx);
	assert(d16 && d16.monster === "bee" && /beewings 20\/50/.test(d16.reason), `quest directive farms bees (${d16 && d16.reason})`);
	vm.runInContext("state.directive = null; refresh_directive(); pick_pack()", ctx);
	assert(st().pack && st().pack.mtype === "bee", "pick_pack follows the quest directive");
	character.items[0].q = 60;
	assert(vm.runInContext("quest_directive()", ctx) === null, "no directive once inputs are complete (crafting takes over)");
	vm.runInContext("CFG.quest_farm_max_h = 0.0001", ctx); character.items[0].q = 20;
	assert(vm.runInContext("quest_directive()", ctx) === null, "recipe too slow to finish is skipped");
	vm.runInContext("CFG.quest_farm_max_h = 3", ctx);
	// outlevelled: best pack gives 100x the bee pack's xp/s → no quest farming
	vm.runInContext("state.best_score = 1e6", ctx);
	assert(vm.runInContext("quest_directive()", ctx) === null, "outlevelled material farm skipped (opportunity cost)");
	vm.runInContext("state.best_score = 0", ctx);
	// stall: count doesn't move for quest_stall_min → recipe shelved
	vm.runInContext("quest_directive(); state.qprog.t -= CFG.quest_stall_min * 60000 + 1", ctx);
	assert(vm.runInContext("quest_directive()", ctx) === null && vm.runInContext(`state.gear_skip["qc:wcap"] > Date.now()`, ctx), "stalled recipe shelved");
	vm.runInContext(`delete state.gear_skip["qc:wcap"]`, ctx);
	// banked copy counts as owned
	vm.runInContext(`state.bank_seen.wcap = 1`, ctx);
	assert(!vm.runInContext(`recipe_open("wcap")`, ctx), "banked output counts as owned");
	vm.runInContext(`state.bank_seen = {}`, ctx);
	// guide farm row: kept while its material count rises; paused when it stalls; unnamed rows use the long cap
	vm.runInContext(`state.guide_farm = { monster: "goo", map: "main", boundary: [100,100,400,400], count: 5, item: "gslime", reason: "guide material", until: Date.now() + 1e6 };
		state.directive = null; state.gprog = null; refresh_directive();`, ctx);
	assert(vm.runInContext(`state.directive.monster === "goo"`, ctx), "guide farm row followed");
	vm.runInContext(`state.gprog.t -= CFG.quest_stall_min * 60000 - 5000; character.items[1].q += 1; refresh_directive(); state.gprog.t -= 10000; refresh_directive()`, ctx);
	assert(vm.runInContext(`state.directive.monster === "goo"`, ctx), "rising material count keeps the row going past the stall window");
	vm.runInContext(`state.gprog.t -= CFG.quest_stall_min * 60000 + 1; refresh_directive()`, ctx);
	assert(vm.runInContext(`state.guide_ignore["goo:main"] > Date.now() && state.guide_ignore["goo:main"] < Date.now() + CFG.quest_shelve_h * 3600000 + 1000`, ctx),
		"stalled guide row paused for quest_shelve_h, not dropped");
	vm.runInContext(`state.guide_ignore = {}; state.gprog = null; state.guide_farm.item = undefined; refresh_directive();
		state.gprog.t -= CFG.quest_stall_min * 60000 + 1; refresh_directive()`, ctx);
	assert(vm.runInContext(`!state.guide_ignore["goo:main"]`, ctx), "row without a material isn't paused at the stall window");
	vm.runInContext(`state.gprog.t -= CFG.guide_farm_max_min * 60000; refresh_directive()`, ctx);
	assert(vm.runInContext(`state.guide_ignore["goo:main"] > Date.now()`, ctx), "...but is at guide_farm_max_min");
	vm.runInContext(`state.guide_farm = null; state.guide_ignore = {}; state.gprog = null`, ctx);

	const store = {};
	ctx.set = (k, v) => ((store[k] = JSON.stringify(v)), true);
	ctx.get = (k) => (k in store ? JSON.parse(store[k]) : null);
	// guide quests: recorded from guide rows, first in line, and not subject to the xp floor / time cap
	ctx.get_progression = () => ({ ready: true, plans: [], rows: [{ id: "r1", kind: "farm", reason: { id: "progression.reason.bees" }, target: { name: "wcap" } }] });
	vm.runInContext("state.guide_quests = {}; state.crafted = {}", ctx);
	vm.runInContext("guide_refresh()", ctx);
	assert(vm.runInContext(`is_guide_quest("wcap")`, ctx), "guide row naming wcap marks it a guide quest");
	vm.runInContext("state.best_score = 1e6; CFG.quest_farm_max_h = 0.0001; state.qprog = null", ctx);
	const g16 = vm.runInContext("quest_directive(true)", ctx);
	assert(g16 && /guide quest wcap/.test(g16.reason), "guide quest farmed even when outlevelled and slow");
	assert(vm.runInContext("quest_directive(false)", ctx) === null, "same recipe not offered as an own-choice quest");
	vm.runInContext("state.best_score = 0; CFG.quest_farm_max_h = 3", ctx);

	// persistence: guide quests and stall timers survive; offline time doesn't count against the timer
	vm.runInContext(`state.qprog = { key: "wcap:beewings", have: 20, t: Date.now() - 600000 }; save_state()`, ctx);
	const saved = JSON.parse(Object.values(store)[0]); saved.at -= 3600000; saved.qprog.t -= 3600000; store[Object.keys(store)[0]] = JSON.stringify(saved); // saved an hour ago
	vm.runInContext(`state.guide_quests = {}; state.qprog = null; load_state()`, ctx);
	assert(vm.runInContext(`is_guide_quest("wcap") && Math.abs(Date.now() - state.qprog.t - 600000) < 5000`, ctx),
		"guide quests + stall timer restored, offline hour not counted");
	ctx.get_progression = undefined;

	// 17) persistence round trip
	vm.runInContext(`state.measured["main:1,2,3,4"] = 12.5; state.danger.bee = 0.6; state.cooldown.x = Date.now() + 1e6; state.cooldown.old = 1; save_state();
		state.measured = {}; state.danger = {}; state.cooldown = {}; load_state();`, ctx);
	assert(vm.runInContext(`state.measured["main:1,2,3,4"] === 12.5 && state.danger.bee === 0.6 && state.cooldown.x > 0 && !("old" in state.cooldown)`, ctx),
		"learned state survives reload; expired cooldowns dropped");

	// 18) park: goes to town, then stays put
	const moves18 = [];
	ctx.smart_move = (d) => (moves18.push(d), Promise.resolve());
	ctx.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
	character.hp = character.max_hp; character.rip = false; character.c = {};
	vm.runInContext("state.errand = null; smart_depth = 0; state.recovering = false; park()", ctx);
	runTick();
	for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
	runTick(); runTick();
	assert(moves18.length === 1 && moves18[0] === "town", `parked: one trip to town (${JSON.stringify(moves18)})`);
	vm.runInContext("resume()", ctx);
	assert(!st().parked, "resume clears park");

	// 19) real guide rows (trimmed from a live get_progression dump)
	const fixture = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "fixtures", "progression_rows.json"), "utf8"));
	character.ctype = "priest";
	ctx.G.items.staff = { type: "weapon", g: 1000 }; ctx.G.items.scroll0 = { type: "uscroll", g: 1000 };
	ctx.G.items.quiver = { type: "quiver", class: ["ranger"] }; ctx.G.items.wgloves = { type: "gloves" }; ctx.G.items.wcap = { type: "helmet" };
	ctx.G.items.witchparcel = { type: "misc" };
	ctx.G.craft = {
		wcap: { items: [[50, "beewings"], [3, "gslime"]], cost: 0, quest: "mcollector" },
		wgloves: { items: [[60, "beewings"], [20, "spores"]], cost: 0, quest: "mcollector" },
		quiver: { items: [[1, "ascale"], [200, "beewings"]], cost: 0, quest: "mcollector" },
		wbreeches: { items: [[10, "crabclaw"], [100, "spores"]], cost: 0, quest: "mcollector" },
		witchparcel: { items: [[5, "verdantspore"]], cost: 10000, quest: "witch" },
	};
	ctx.G.npcs = { basics: { items: ["staff", "scroll0"] }, mcollector: { name: "Cole" } };
	const ids = [...vm.runInContext("guide_quest_ids", ctx)(fixture)].sort().join();
	assert(ids === "quiver,wcap,wgloves", `bees row → Cole recipes using bee wings; plan long-shots ignored (${ids})`);
	vm.runInContext("state.guide_quests = {}", ctx);
	vm.runInContext("guide_quest_ids", ctx)(fixture).forEach((id) => vm.runInContext(`state.guide_quests.${id} = { first: Date.now(), last: Date.now() }`, ctx));
	assert(!vm.runInContext("quest_recipes()", ctx).includes("quiver"), "ranger-only quiver not crafted by a priest");
	// upgrade row: action.level is the INPUT level; guide's 70% accepted for an NPC-sold staff
	character.items = Array(42).fill(null);
	character.items[7] = { name: "staff", level: 4 }; character.items[8] = { name: "scroll0", q: 5 };
	character.items[2] = { name: "computer" }; character.gold = 1e6;
	ctx.find_npc = (id) => (id === "basics" ? { map: "main", x: 0, y: 0 } : null);
	const ups = [];
	ctx.upgrade = (k, sk, off, calc) => (ups.push([k, sk, !!calc]), Promise.resolve(calc ? { chance: 0.7 } : { success: true }));
	await vm.runInContext("run_row", ctx)(fixture.rows[0]);
	assert(ups.length === 2 && ups[0][0] === 7 && !ups[1][2], `upgrades the +4 staff in slot 7 at 70% (${JSON.stringify(ups)})`);
	// a non-rebuyable item at 70% is still refused
	ctx.G.npcs.basics.items = ["scroll0"]; ups.length = 0;
	const e19 = await vm.runInContext("run_row", ctx)(fixture.rows[0]).catch((e) => e);
	assert(e19 && e19.reason === "low_chance" && ups.length === 1, "non-rebuyable item at 70% refused");

	// 20) targeting: at the squig pack, squigs beat a squigtoad even though the toad's xp/s looks better
	ctx.G.monsters.squig = { xp: 600, hp: 1000, attack: 7, respawn: 12, range: 15, speed: 10, frequency: 0.5 };
	ctx.G.monsters.squigtoad = { xp: 32000, hp: 9600, attack: 24, respawn: 120, range: 20, speed: 16, frequency: 0.6 };
	Object.assign(character, { attack: 183, frequency: 0.75, range: 183, speed: 49, max_hp: 2503, hp: 2503, armor: 57, resistance: 138, damage_type: "magical", x: 0, y: 0 });
	ctx.distance = (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
	ctx.get_targeted_monster = () => null;
	ctx.parent.entities = {
		toad: { id: "toad", type: "monster", mtype: "squigtoad", visible: true, hp: 9600, max_hp: 9600, xp: 32000, attack: 24, x: 50, y: 0 },
		sq: { id: "sq", type: "monster", mtype: "squig", visible: true, hp: 1000, max_hp: 1000, xp: 600, attack: 7, x: 300, y: 0 },
	};
	vm.runInContext(`state.safe = { squig: fight_profile("squig"), squigtoad: fight_profile("squigtoad") }; state.pack = { mtype: "squig", map: "main", boundary: [-1353,126,-998,718] }`, ctx);
	assert(vm.runInContext("choose_target(true)", ctx)?.id === "sq", "squig (pack type) chosen over a closer squigtoad");
	delete ctx.parent.entities.sq;
	assert(vm.runInContext("choose_target(true)", ctx) === null, "no squig in view: 70s squigtoad still skipped (max_ttk_s)");
	ctx.parent.entities = {};

	// 21) develop: guide wants staff +5 from a +4 we don't have; we own a spare +0 → upgrade +0→+1 with scroll0
	character.items = Array(42).fill(null);
	character.items[3] = { name: "staff", level: 0 }; character.items[2] = { name: "computer" }; character.items[9] = { name: "scroll0", q: 5 };
	ctx.G.npcs.basics = { items: ["staff", "scroll0"] };
	ups.length = 0;
	ctx.upgrade = (k, sk, off, calc) => (ups.push([k, sk, !!calc]), Promise.resolve(calc ? { chance: 0.98 } : { success: true }));
	await vm.runInContext("run_row", ctx)(fixture.rows[0]);
	assert(ups.length === 2 && ups[1][0] === 3 && ups[1][1] === 9, `develops the spare +0 staff (${JSON.stringify(ups)})`);
	// no staff at all → buys one, then upgrades it
	character.items[3] = null; ups.length = 0;
	const buys = [];
	ctx.buy = (n, q) => { buys.push(n); character.items[4] = { name: n, level: 0 }; return Promise.resolve({ success: true }); };
	await vm.runInContext("run_row", ctx)(fixture.rows[0]);
	assert(buys.join() === "staff" && ups.length === 2 && ups[1][0] === 4, `buys a staff and develops it (${buys}; ${JSON.stringify(ups)})`);

	// 22) diagnostics run without throwing and say something useful
	const logs0 = log.length;
	vm.runInContext("report(); why_not('squigtoad'); why_not('goo'); why_not('nope')", ctx);
	const out22 = log.slice(logs0).join("\n");
	if (process.env.SHOW) console.log(out22);
	assert(/fighting:/.test(out22) && /quest wcap/.test(out22) && /bags: \d+ free/.test(out22), "report() summarises pack, quests, bags");
	assert(/squigtoad: .*UNSAFE|squigtoad: .*SAFE/.test(out22) && /nope: no such monster/.test(out22), "why_not() explains safety");

	// 23) real-data shapes from the live report
	character.ctype = "priest";
	ctx.G.classes.priest = { damage_type: "magical", mainhand: { staff: {}, pmace: {} }, offhand: { shield: {}, source: {}, misc_offhand: {} } };
	ctx.G.items.quiver = { type: "quiver" }; // no class tag in the real data
	ctx.G.craft = {
		quiver: { items: [[1, "ascale"], [200, "beewings"]], cost: 0, quest: "mcollector" },
		wcap: { items: [[50, "beewings"], [3, "gslime"]], cost: 0, quest: "mcollector" },
		snakeoil: { items: [[40, "dstones"], [9000, "rattail"]], cost: 0, quest: "witch" },
	};
	ctx.G.items.dstones = { type: "material" }; ctx.G.items.rattail = { type: "material" }; ctx.G.items.ascale = { type: "material" };
	vm.runInContext(`state.guide_quests = { quiver: { first: 1, last: Date.now() } }; state.crafted = {}; state.gear_skip = {}`, ctx);
	const q23 = vm.runInContext("quest_recipes()", ctx).join();
	assert(q23 === "wcap", `priest: no quiver even as a guide quest; own quests only from Cole (${q23})`);
	// slimestaff +3 → +4 at the guide's 70%: two spare +3s + a worn +3 → accepted; a lone copy → refused
	ctx.G.items.slimestaff = { type: "weapon", wtype: "staff", g: 2000 }; ctx.G.npcs = {};
	character.items = Array(42).fill(null);
	character.items[2] = { name: "computer" }; character.items[5] = { name: "slimestaff", level: 3 }; character.items[6] = { name: "slimestaff", level: 3 };
	character.items[9] = { name: "scroll1", q: 3 }; ctx.G.items.scroll1 = { type: "uscroll" };
	character.slots = { mainhand: { name: "slimestaff", level: 3 } };
	ups.length = 0;
	ctx.upgrade = (k, sk, off, calc) => (ups.push([k, !!calc]), Promise.resolve(calc ? { chance: 0.7 } : { success: true }));
	const slimerow = { id: "upgrade:mainhand:slimestaff:4:", kind: "upgrade", cost: 0, action: { kind: "upgrade", name: "slimestaff", level: 3, scroll: "scroll1", resources: [{ num: 5 }] }, request: { name: "slimestaff", level: 4 } };
	await vm.runInContext("run_row", ctx)(slimerow);
	assert(ups.length === 2 && ups[1][0] === 5, `spare copies → guide's 70% accepted (${JSON.stringify(ups)})`);
	character.items[6] = null; character.slots = {}; ups.length = 0;
	const e23 = await vm.runInContext("run_row", ctx)(slimerow).catch((e) => e);
	assert(e23?.reason === "low_chance", "only copy → 70% refused");
	// report is copyable
	let modal = "";
	ctx.parent.show_modal = (html) => (modal = html);
	vm.runInContext("report()", ctx);
	assert(/<textarea/.test(modal) && /quest wcap/.test(modal), "report() opens a selectable text box");

	// 24) pause reasons survive reload; old reasonless guide-row pauses are cleared once
	vm.runInContext(`skip("upgrade:mainhand:slimestaff:4:", 600000, "low_chance 70%"); save_state(); state.gear_skip = {}; load_state()`, ctx);
	assert(vm.runInContext(`skip_why["upgrade:mainhand:slimestaff:4:"] === "low_chance 70%" && skipped("upgrade:mainhand:slimestaff:4:")`, ctx), "pause reason persisted");
	const k24 = Object.keys(store)[0], old = JSON.parse(store[k24]); delete old.skip_why; store[k24] = JSON.stringify(old);
	vm.runInContext(`state.gear_skip = {}; load_state()`, ctx);
	assert(vm.runInContext(`!skipped("upgrade:mainhand:slimestaff:4:")`, ctx), "pre-v10.3 upgrade pause cleared on load");

	vm.runInContext("state.bank_full_at = 0", ctx);
	// 25) the live failure: equipment lesson plans helmet/shoes +7 → bag full of helmets & shoes, all "needed"
	ctx.G.items.helmet = { type: "helmet", upgrade: {} }; ctx.G.items.shoes = { type: "shoes", upgrade: {} };
	ctx.G.items.ascale = { type: "material", s: 9999 };
	ctx.get_progression = () => ({ ready: true, rows: [], plans: [
		{ tree: { name: "helmet", level: 7, next: { kind: "upgrade", name: "helmet", level: 3, scroll: "scroll0" }, alternatives: [] } },
		{ tree: { name: "shoes", level: 7, next: { kind: "upgrade", name: "shoes", level: 3, scroll: "scroll0" }, alternatives: [] } } ] });
	character.items = Array(42).fill(null).map((_, i) => (i % 2 ? { name: "helmet", level: i % 5 } : { name: "shoes", level: i % 4 }));
	character.items[0] = { name: "ascale", q: 3 }; character.items[1] = { name: "hpot1", q: 50 };
	character.esize = 0;
	vm.runInContext("guide_refresh()", ctx);
	const p25 = vm.runInContext("bag_plan()", ctx);
	const keptNames = vm.runInContext("[...needed_slots()].map((k) => character.items[k].name + '+' + (character.items[k].level || 0)).sort().join()", ctx);
	assert(p25.bank.length === 37 && keptNames === "helmet+4,helmet+4,shoes+2,shoes+2", `keeps 2 best of each planned item, banks the other 36 + unneeded ascale (${p25.bank.length}; ${keptNames})`);
	assert(vm.runInContext("town_due().bank", ctx), "bank trip due with a full bag");
	// chests are still tried with a full bag (gold-only chests succeed)
	const opened25 = [];
	ctx.parent.open_chest = (id) => opened25.push(id);
	ctx.parent.chests = { c1: { x: 0, y: 0 } };
	vm.runInContext("loot_chests()", ctx);
	assert(opened25.join() === "c1", "chest opened with 0 free slots");
	ctx.get_progression = undefined; ctx.parent.chests = {};

	ctx.setTimeout = (fn, ms) => (ms < 5000 && setImmediate(fn), 0);
	// 26) main bank floor full → overflow to bank_b; every floor full → junk sold, reason recorded
	vm.runInContext("state.bank_full_at = 0; state.gear_skip = {}; state.needs = new Map(); state.errand = null; smart_depth = 0", ctx);
	ctx.parent.bank_packs = { items0: ["bank", 0, 0], items1: ["bank", 0, 0], items8: ["bank_b", 0, 0] };
	ctx.smart_move = (d) => { if (d && d.map) character.map = d.map; return Promise.resolve(); };
	ctx.G.items.hpamulet = { type: "amulet", g: 7000 };
	character.items = Array(42).fill(null).map(() => ({ name: "hpamulet" }));
	character.esize = 0; character.map = "main";
	const where = [];
	ctx.bank_store = (k) => {
		if (character.map === "bank") return Promise.reject({ reason: "bank_full" });
		where.push(character.map); character.items[k] = null; character.esize++;
		return Promise.resolve({ success: true });
	};
	const walks26 = [];
	ctx.smart_move = (d) => { walks26.push(d && d.map); if (d && d.map) character.map = d.map; return Promise.resolve(); };
	character.bank = { items0: [], items1: [] }; // bank_b never unlocked (no items8)
	await vm.runInContext("task_bank([])", ctx);
	assert(!walks26.includes("bank_b") && where.length === 0 && vm.runInContext("bank_is_full()", ctx), "locked bank_b: never walked to, bank marked full");
	vm.runInContext("state.bank_full_at = 0", ctx); character.map = "main";
	character.bank = { items0: [], items1: [], items8: [] }; // unlocked with a bkey
	await vm.runInContext("task_bank([])", ctx);
	assert(where.length === 42 && where.every((m) => m === "bank_b"), `unlocked bank_b: overflowed there (${where.length})`);
	character.items = Array(42).fill(null).map(() => ({ name: "hpamulet" })); character.esize = 0; character.map = "main";
	ctx.bank_store = () => Promise.reject({ reason: "bank_full" });
	ctx.item_value = () => 4200;
	vm.runInContext("state.errand = null; town_run(town_due())", ctx);
	for (let i = 0; i < 3000 && vm.runInContext("state.errand", ctx); i++) await new Promise((r) => setImmediate(r));
	assert(vm.runInContext("bank_is_full() && bag_class(character.items.find(Boolean) || { name: 'hpamulet' }) !== 'bank'", ctx), "bank full → junk classed for selling");
	vm.runInContext("town_reason.bank = 'every bank pack you can use is full'", ctx);

	// 27) full bag, priest at 65% HP, under attack, mid-patrol smart_move → patrol walk stopped, town run starts
	vm.runInContext("state.bank_full_at = 0; state.gear_skip = {}; state.errand = null; state.last_town = 0; state.needs = new Map(); smart_depth = 0", ctx);
	character.items = Array(42).fill(null).map(() => ({ name: "hpamulet" })); character.esize = 0;
	character.hp = character.max_hp * 0.65; character.map = "main";
	ctx.get_nearest_monster = (a) => (a && a.target ? { id: "bee" } : null);
	let stops = 0;
	ctx.stop = () => { stops++; return Promise.resolve(); };
	ctx.smart_move = () => new Promise(() => {}); // a patrol path that hasn't finished
	vm.runInContext("travel({ map: 'main', x: 1, y: 1 })", ctx);
	assert(vm.runInContext("walking()", ctx), "patrol walk in flight");
	vm.runInContext("town_check()", ctx);
	assert(stops === 1 && vm.runInContext("state.town_block.blockers.join()", ctx) === "stopping a pack walk", "walk stopped; HP 65% and attackers don't block with a full bag");
	vm.runInContext("smart_depth = 0", ctx); // the stopped walk settles
	ctx.smart_move = (d) => { if (d && d.map) character.map = d.map; return Promise.resolve(); };
	vm.runInContext("town_check()", ctx);
	assert(vm.runInContext("state.errand", ctx) === "town", "town run started");
	for (let i = 0; i < 3000 && vm.runInContext("state.errand", ctx); i++) await new Promise((r) => setImmediate(r));
	ctx.get_nearest_monster = () => null; character.hp = character.max_hp;

	// 28) a walk that never arrives (locked door loop) is cancelled at walk_timeout_ms
	let fire28 = null, stopped28 = 0;
	ctx.setTimeout = (fn, ms) => { if (ms >= 60000) fire28 = fn; else setImmediate(fn); return 0; };
	ctx.stop = () => { stopped28++; return Promise.resolve(); };
	ctx.smart_move = () => new Promise(() => {});
	vm.runInContext("smart_depth = 0", ctx);
	const w28 = vm.runInContext("go({ map: 'bank_b' })", ctx).catch((e) => e);
	fire28();
	const r28 = await w28;
	assert(r28?.reason === "walk_timeout" && stopped28 === 1 && vm.runInContext("!walking()", ctx), "endless walk cancelled, walking() cleared");

	// 29) new character: guide asks for 6 bank items one at a time (retrieve → equip → next retrieve…).
	//     One bank trip, all 6 done in one town run, leftovers stored before leaving.
	ctx.setTimeout = (fn, ms) => (ms < 60000 && setImmediate(fn), 0);
	const gear29 = ["helmet", "coat", "pants", "gloves", "shoes", "amulet"];
	for (const n of gear29) ctx.G.items[n] = { type: n === "coat" ? "chest" : n, g: 100 };
	ctx.G.items.junk29 = { type: "material" };
	ctx.parent.bank_packs = { items0: ["bank", 0, 0], items1: ["bank", 0, 0] };
	character.bank = { items0: gear29.map((n) => ({ name: n })), items1: [] };
	character.items = Array(42).fill(null); character.items[0] = { name: "junk29", q: 5 }; character.esize = 41;
	character.slots = {}; character.map = "main"; character.hp = character.max_hp;
	const walks29 = [];
	ctx.smart_move = (d) => { walks29.push(typeof d === "string" ? d : d.map); character.map = typeof d === "string" ? "main" : d.map || character.map; return Promise.resolve(); };
	ctx.bank_retrieve = (pack, n) => {
		const it = character.bank[pack][n]; character.bank[pack][n] = null;
		const k = character.items.findIndex((x) => !x); character.items[k] = it; character.esize--;
		return Promise.resolve({ success: true });
	};
	ctx.bank_store = (k) => { character.items[k] = null; character.esize++; return Promise.resolve({ success: true }); };
	ctx.equip = (k, slot) => { character.slots[slot] = character.items[k]; character.items[k] = null; character.esize++; return Promise.resolve({ success: true }); };
	ctx.get_progression = () => {
		const next = gear29.find((n) => !character.slots[n]);
		if (!next) return { ready: true, rows: [], plans: [] };
		const k = character.items.findIndex((i) => i && i.name === next);
		if (k >= 0) return { ready: true, plans: [], rows: [{ id: "equip:" + next, kind: "equip", action: { name: next, level: 0, slot: next, num: k } }] };
		const n = character.bank.items0.findIndex((i) => i && i.name === next);
		return { ready: true, plans: [], rows: [{ id: "retrieve:" + next, kind: "retrieve", action: { name: next, level: 0, target: { pack: "items0", bankNum: n } } }] };
	};
	vm.runInContext("state.errand = null; smart_depth = 0; state.gear_skip = {}; state.last_town = 0; state.bank_full_at = 0", ctx);
	vm.runInContext("guide_refresh(); town_check()", ctx);
	for (let i = 0; i < 5000 && vm.runInContext("state.errand", ctx); i++) await new Promise((r) => setImmediate(r));
	const worn29 = gear29.filter((n) => character.slots[n]).length;
	assert(worn29 === 6 && walks29.filter((m) => m === "bank").length === 1, `all 6 items retrieved+equipped in one bank visit (worn ${worn29}, walks ${JSON.stringify(walks29)})`);
	assert(!character.items.some((i) => i && i.name === "junk29") && walks29.indexOf("potions") > walks29.indexOf("bank"), `unneeded material stored before leaving the bank (${JSON.stringify(walks29)})`);
	ctx.get_progression = undefined;

	// 30) party: Aspernari (priest 56) + Torlis (paladin 5) → Torlis leads; Aspernari assists and heals
	ctx.setTimeout = (fn, ms) => (ms < 60000 && setImmediate(fn), 0);
	Object.assign(character, { name: "Aspernari", ctype: "priest", level: 56, map: "main", x: 0, y: 0, hp: 2500, max_hp: 2500, range: 180, rip: false });
	ctx.G.skills.heal = { share: "attack" }; ctx.G.skills.partyheal = {}; ctx.G.skills.curse = {};
	ctx.is_on_cooldown = () => false; ctx.can_attack = () => true;
	const fired30 = [];
	ctx.use_skill = (s, tg) => (fired30.push([s, tg && (tg.name || tg.id)]), Promise.resolve());
	ctx.attack = (tg) => (fired30.push(["attack", tg.id]), Promise.resolve());
	ctx.heal = (tg) => (fired30.push(["heal", tg.name || tg.id]), Promise.resolve());
	vm.runInContext("state.partner = null; state.errand = null; smart_depth = 0", ctx);
	handlers.cm({ name: "Torlis", message: { k: "hb", level: 5, ctype: "paladin", map: "main", x: 50, y: 0, hp: 300, max_hp: 300, target: "m1",
		pack: { mtype: "goo", map: "main", boundary: [-100, -100, 100, 100] }, errand: null, attack: 20, frequency: 1, damage_type: "physical" } });
	assert(vm.runInContext("leader_name() === 'Torlis' && is_follower()", ctx), "lowest level leads; priest follows");
	ctx.parent.entities = {
		m1: { id: "m1", type: "monster", mtype: "goo", visible: true, hp: 80, max_hp: 100, x: 60, y: 0, target: "Torlis" },
		Torlis: { id: "Torlis", name: "Torlis", type: "character", visible: true, hp: 290, max_hp: 300, x: 50, y: 0 },
	};
	ctx.get_targeted_monster = () => null; ctx.change_target = () => {};
	vm.runInContext("follower_tick()", ctx);
	assert(fired30.some(([s, id]) => s === "attack" && id === "m1"), `follower attacks the leader's target (${JSON.stringify(fired30)})`);
	fired30.length = 0;
	for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); // previous attack's in-flight guard clears
	ctx.parent.entities.Torlis.hp = 100; // leader at 33%
	vm.runInContext("follower_tick()", ctx);
	assert(fired30.length === 1 && fired30[0][0] === "heal" && fired30[0][1] === "Torlis", `priest heals the hurt leader instead of attacking (${JSON.stringify(fired30)})`);
	// invites: members accepted, strangers ignored
	const acc = [];
	ctx.accept_party_invite = (n) => acc.push(n);
	vm.runInContext("on_party_invite('Torlis'); on_party_invite('Stranger')", ctx);
	assert(acc.join() === "Torlis", "accepts party invites from members only");

	// 31) leader side: Torlis waits (defends only) while Aspernari is in town
	Object.assign(character, { name: "Torlis", ctype: "paladin", level: 5, hp: 300, max_hp: 300, attack: 20, frequency: 1, range: 25, armor: 20, resistance: 10, damage_type: "physical" });
	ctx.G.classes.paladin = { damage_type: "physical" };
	vm.runInContext("state.partner = null; state.duo_near = undefined; state.pack = { mtype: 'goo', map: 'main', boundary: [-100,-100,100,100] }", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 56, ctype: "priest", map: "bank", x: 0, y: 0, hp: 2500, max_hp: 2500, errand: "town", attack: 180, frequency: 0.75, damage_type: "magical" } });
	vm.runInContext("duo_check(); state.last_pick = 1", ctx);
	assert(vm.runInContext("leader_name() === 'Torlis' && !is_follower() && state.duo_near === false", ctx), "leader farms solo (no waiting) while the priest is in town");
	// safety: a mob too strong for a level-5 paladin alone is fine with the level-56 priest beside it
	ctx.G.monsters.tough31 = { xp: 500, hp: 1000, attack: 15, respawn: 10, range: 20, speed: 10, frequency: 1, resistance: 0, armor: 0 };
	const solo = vm.runInContext("!!fight_profile('tough31')", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 56, ctype: "priest", map: "main", x: 30, y: 0, hp: 2500, max_hp: 2500, errand: null, attack: 180, frequency: 0.75, damage_type: "magical" } });
	const duo = vm.runInContext("!!fight_profile('tough31')", ctx);
	assert(!solo && duo, `unsafe solo, safe with the priest near (solo ${solo}, duo ${duo})`);
	vm.runInContext("duo_check()", ctx);
	assert(vm.runInContext("state.duo_near === true && state.last_pick === 0", ctx), "priest back → pack re-judged as a pair");

	// 32) leader works the follower's monster hunt (kills credit every party member)
	ctx.G.monsters.tortoise = { xp: 300, hp: 600, attack: 8, respawn: 10, range: 20, speed: 8, frequency: 1 };
	ctx.G.maps.main.monsters.push({ type: "tortoise", count: 6, boundary: [-1353, 720, -896, 1516] });
	vm.runInContext("state.guide_farm = null; state.directive = null; state.guide_quests = {}; state.crafted = { wcap: 1 }", ctx);
	character.s = {};
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 56, ctype: "priest", map: "main", x: 30, y: 0, hp: 2500, max_hp: 2500, errand: null,
		attack: 180, frequency: 0.75, damage_type: "magical", hunt: { id: "tortoise", c: 20 } } });
	vm.runInContext("refresh_directive()", ctx);
	assert(vm.runInContext("state.directive && state.directive.monster === 'tortoise' && /Aspernari: monster hunt/.test(state.directive.reason)", ctx),
		`leader farms the partner's hunt (${vm.runInContext("JSON.stringify(state.directive)", ctx)})`);

	// 33) shared town trips: 15 free (not short) → no trip alone; partner in town → go too
	vm.runInContext("state.errand = null; smart_depth = 0; state.last_town = 0; state.gear_skip = {}; state.bank_full_at = 0; state.needs = new Map(); state.guide = null", ctx);
	ctx.G.items.junk33 = { type: "material" };
	character.items = Array(42).fill(null); for (let i = 0; i < 27; i++) character.items[i] = { name: "junk33", q: 1 };
	character.esize = 15; character.hp = character.max_hp; character.s = {};
	ctx.get_nearest_monster = () => null; ctx.quantity = () => 100;
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 56, ctype: "priest", map: "main", x: 30, y: 0, hp: 2500, max_hp: 2500, errand: null, attack: 180, frequency: 0.75, damage_type: "magical" } });
	const d33a = vm.runInContext("town_due(partner()?.errand === 'town')", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 56, ctype: "priest", map: "bank", x: 0, y: 0, hp: 2500, max_hp: 2500, errand: "town", attack: 180, frequency: 0.75, damage_type: "magical" } });
	const d33b = vm.runInContext("town_due(partner()?.errand === 'town')", ctx);
	assert(!d33a.bank && d33b.bank && d33b.relaxed, `bank trip only when the partner is already in town (${d33a.bank}, ${d33b.bank})`);

	// 34) a dead partner: the follower stays a follower (holds), the leader holds too
	Object.assign(character, { name: "Aspernari", ctype: "priest", level: 56, map: "main", x: 0, y: 0 });
	handlers.cm({ name: "Torlis", message: { k: "hb", level: 38, ctype: "paladin", map: "main", x: 50, y: 0, hp: 0, max_hp: 900, rip: true, errand: null } });
	const walk34 = [];
	ctx.smart_move = (d) => (walk34.push(d), Promise.resolve());
	vm.runInContext("follower_tick()", ctx);
	assert(vm.runInContext("is_follower()", ctx) && !walk34.length, "follower holds while the leader is dead");
	Object.assign(character, { name: "Torlis", ctype: "paladin", level: 38 });
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 56, ctype: "priest", map: "main", x: 30, y: 0, hp: 0, max_hp: 2500, rip: true, errand: null } });
	vm.runInContext("state.duo_near = true; state.last_pick = 1; duo_check()", ctx);
	assert(vm.runInContext("state.duo_near === false && state.last_pick === 0", ctx), "priest dies → leader re-judges its pack solo (no waiting)");

	// 35) regression: nothing due → no town run (v11.2 counted numeric fields as due tasks)
	vm.runInContext("state.errand = null; smart_depth = 0; state.last_town = 0; state.gear_skip = {}; state.guide = null; state.needs = new Map()", ctx);
	character.items = Array(42).fill(null); character.esize = 42; character.s = { monsterhunt: { id: "goo", c: 5 } };
	ctx.quantity = () => 100; ctx.get_nearest_monster = () => null; character.hp = character.max_hp; character.rip = false;
	vm.runInContext("state.partner = null", ctx);
	const due35 = vm.runInContext("town_due()", ctx);
	vm.runInContext("town_check()", ctx);
	assert(vm.runInContext("due_tasks(town_due()).length === 0 && !state.errand && state.last_town === 0", ctx), `no town run when nothing is due (${JSON.stringify(vm.runInContext("due_tasks(town_due())", ctx))})`);

	// 36) left alone: Torlis waits for Aspernari (in town) and solos safe mobs nearby; skips unsafe ones and far ones
	ctx.setTimeout = (fn, ms) => (ms < 60000 && setImmediate(fn), 0);
	Object.assign(character, { name: "Torlis", ctype: "paladin", level: 40, map: "main", x: 0, y: 0, hp: 900, max_hp: 900, attack: 60, frequency: 1, range: 30, armor: 60, resistance: 30, damage_type: "physical", speed: 40 });
	ctx.G.monsters.weak36 = { xp: 200, hp: 300, attack: 10, respawn: 5, range: 20, speed: 10, frequency: 1 };
	ctx.G.monsters.brute36 = { xp: 2000, hp: 9000, attack: 120, respawn: 5, range: 20, speed: 10, frequency: 1 };
	ctx.get_targeted_monster = () => null; ctx.change_target = () => {}; ctx.is_in_range = () => false; ctx.can_move_to = () => true;
	ctx.get_nearest_monster = () => null;
	vm.runInContext("state.hold = null; state.pack = { mtype: 'goo', map: 'main', boundary: [-100,-100,100,100] }; state.errand = null; smart_depth = 0", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 57, ctype: "priest", map: "bank", x: 0, y: 0, hp: 2500, max_hp: 2500, errand: "town", attack: 180, frequency: 0.75, damage_type: "magical" } });
	ctx.parent.entities = {
		b: { id: "b", type: "monster", mtype: "brute36", visible: true, hp: 9000, max_hp: 9000, x: 60, y: 0 },
		far: { id: "far", type: "monster", mtype: "weak36", visible: true, hp: 300, max_hp: 300, x: 900, y: 0 },
		w: { id: "w", type: "monster", mtype: "weak36", visible: true, hp: 300, max_hp: 300, x: 150, y: 50 },
	};
	const atk36 = [];
	ctx.attack = (tg) => (atk36.push(tg.id), Promise.resolve());
	ctx.can_attack = () => true;
	vm.runInContext("for (const k in inflight) inflight[k] = false", ctx);
	assert(vm.runInContext("!fight_profile('brute36') && !!fight_profile('weak36')", ctx), "with the priest away, the leader judges mobs on solo stats");
	vm.runInContext("hold_grind()", ctx);
	assert(atk36.join() === "w", `solo grind picks the safe mob within the radius, not the brute or the far one (${atk36})`);
	// dead leader: the follower grinds solo too
	Object.assign(character, { name: "Aspernari", ctype: "priest", level: 57, attack: 180, frequency: 0.75, range: 180, damage_type: "magical", hp: 2500, max_hp: 2500 });
	handlers.cm({ name: "Torlis", message: { k: "hb", level: 40, ctype: "paladin", map: "main", x: 0, y: 0, hp: 0, max_hp: 900, rip: true, errand: null } });
	vm.runInContext("state.hold = null", ctx); atk36.length = 0;
	for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
	vm.runInContext("follower_tick()", ctx);
	assert(atk36.includes("w") || atk36.includes("b"), `follower solos while the leader is dead (${atk36})`);

	// 37) turns: Torlis has its own guide farm row; Aspernari wants spores (minimush). Leader alternates.
	Object.assign(character, { name: "Torlis", ctype: "paladin", level: 41, map: "main", x: 0, y: 0, hp: 900, max_hp: 900, attack: 60, frequency: 1, range: 30, armor: 60, resistance: 30, damage_type: "physical" });
	ctx.G.monsters.minimush = { xp: 100, hp: 300, attack: 8, respawn: 10, range: 20, speed: 10, frequency: 1 };
	ctx.G.maps.main.monsters.push({ type: "minimush", count: 8, boundary: [200, 200, 400, 400] });
	vm.runInContext(`state.turn = null; state.guide_ignore = {}; state.gprog = null;
		state.guide_farm = { monster: "goo", map: "main", boundary: [-100,-100,100,100], count: 5, reason: "guide hunt_farm", guide_safe: true, until: Date.now() + 1e6 }`, ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 57, ctype: "priest", map: "main", x: 30, y: 0, hp: 2500, max_hp: 2500, errand: null, attack: 180, frequency: 0.75, damage_type: "magical",
		want: { monster: "minimush", map: "main", boundary: [200, 200, 400, 400], count: 8, reason: "guide quest wgloves: spores 0/20", guide_safe: false } } });
	vm.runInContext("refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'goo' && state.turn.who === 'me'", ctx), "first turn: leader's own goal");
	vm.runInContext("state.turn.end = Date.now() - 1; refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'minimush' && state.directive.for_partner && /Aspernari: guide quest wgloves/.test(state.directive.reason)", ctx),
		`second turn: partner's goal (${vm.runInContext("JSON.stringify(state.directive)", ctx)})`);
	// a goal worked for the partner isn't re-shared as our own want
	let sent37;
	ctx.send_cm = (to, m) => ((sent37 = m), Promise.resolve());
	vm.runInContext("heartbeat()", ctx);
	assert(sent37 && sent37.want === null, "partner's goal not echoed back as our want");
	vm.runInContext("state.turn.end = Date.now() - 1; refresh_directive(); heartbeat()", ctx);
	assert(sent37.want && sent37.want.monster === "goo", "own goal shared as want on our own turn");

	// 38) mutual goals win: Torlis's guide row is goo; Aspernari's goals include tortoise (hunt) and minimush (quest).
	//     Torlis also needs a minimush drop → minimush is mutual and beats both lists' top items.
	ctx.G.items.spores = { type: "material" }; ctx.G.items.mushcap = { type: "material" };
	ctx.G.drops = { monsters: { minimush: [[1 / 60, "spores"], [0.01, "mushcap"]] } };
	ctx.G.craft = { mushhat: { items: [[5, "mushcap"]], cost: 0, quest: "mcollector" } };
	ctx.G.items.mushhat = { type: "helmet" };
	vm.runInContext(`state.turn = null; state.crafted = {}; state.gear_skip = {}; state.guide_ignore = {}; state.bank_seen = {}; state.goals_cache = null;
		state.guide_farm = { monster: "goo", map: "main", boundary: [-100,-100,100,100], count: 5, reason: "guide hunt_farm", guide_safe: true, until: Date.now() + 1e6 }`, ctx);
	character.items = Array(42).fill(null); character.s = {};
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 57, ctype: "priest", map: "main", x: 30, y: 0, hp: 2500, max_hp: 2500, errand: null, attack: 180, frequency: 0.75, damage_type: "magical",
		goals: [{ monster: "tortoise", w: 3, reason: "monster hunt 20 left" }, { monster: "minimush", w: 2, reason: "wgloves: spores 0/20" }] } });
	vm.runInContext("refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'minimush' && state.directive.mutual", ctx), `mutual goal (minimush) chosen (${vm.runInContext("JSON.stringify(state.directive)", ctx)})`);
	// no overlap → turns between the two tops
	ctx.G.craft = {};
	vm.runInContext("state.turn = null; state.goals_cache = null; refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'goo' && !state.directive.mutual", ctx), "no overlap: our own goal on our turn");
	vm.runInContext("state.turn.end = Date.now() - 1; refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'tortoise'", ctx), "no overlap: partner's top goal on its turn");

	// 39) live report: crab chosen as "mutual" for 200 crab claws at 1/1000 (~forever). Infeasible goals don't count.
	ctx.G.items.crabclaw = { type: "material" }; ctx.G.items.ascale = { type: "material" };
	ctx.G.monsters.crab = { xp: 50, hp: 200, attack: 5, respawn: 10, range: 20, speed: 10, frequency: 1 };
	ctx.G.monsters.armadillo = { xp: 200, hp: 600, attack: 12, respawn: 10, range: 20, speed: 10, frequency: 1 };
	ctx.G.maps.main.monsters.push({ type: "crab", count: 8, boundary: [500, 500, 700, 700] }, { type: "armadillo", count: 6, boundary: [700, 700, 900, 900] });
	ctx.G.drops = { monsters: { crab: [[0.001, "crabclaw"]], armadillo: [[0.0008, "ascale"]] } };
	ctx.G.craft = { wattire: { items: [[200, "crabclaw"]], cost: 0, quest: "mcollector" }, orbg: { items: [[1, "ascale"]], cost: 0, quest: "mcollector" } };
	ctx.G.items.wattire = { type: "chest" }; ctx.G.items.orbg = { type: "orb" };
	vm.runInContext("state.turn = null; state.goals_cache = null; state.crafted = {}; state.guide_farm = null; state.measured = {}; state.realism = 1", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 57, ctype: "priest", map: "main", x: 30, y: 0, hp: 2500, max_hp: 2500, errand: null, attack: 180, frequency: 0.75, damage_type: "magical",
		goals: [{ monster: "crab", w: 2, reason: "wattire: crabclaw 0/200", eta_h: 150 }, { monster: "armadillo", w: 2, reason: "resistancering: ascale 4/5", eta_h: 0.8 }] } });
	vm.runInContext("refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'armadillo' && state.directive.mutual", ctx), `feasible mutual goal (armadillo) beats the 150h one (${vm.runInContext("JSON.stringify(state.directive)", ctx)})`);
	console.log("ALL PASS");
})();
