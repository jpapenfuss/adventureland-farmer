// Minimal mock of the Adventure Land CODE runtime: enough to drive tick() through the paths v9 changed.
const vm = require("vm"), fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "farmer.js"), "utf8");
const log = [], calls = [];
const character = { name: "me", ctype: "ranger", level: 10, xp: 0, hp: 1000, max_hp: 1000, mp: 500, max_mp: 500,
	x: 0, y: 0, map: "main", attack: 100, frequency: 1, armor: 50, resistance: 50, range: 120, speed: 50,
	items: Array(42).fill(null), slots: {}, s: {}, c: {}, esize: 40, gold: 1e6, rip: false };
const G = {
	monsters: { goo: { xp: 10, hp: 100, attack: 5, respawn: 10, range: 20, speed: 10, armor: 0, resistance: 0 } },
	maps: { main: { monsters: [{ type: "goo", count: 5, boundary: [100, 100, 400, 400] }], npcs: [] } },
	items: { hpot1: { g: 20 }, mpot1: { g: 20 } }, skills: { attack: {}, use_town: {}, use_hp: {}, use_mp: {}, regen_hp: {}, regen_mp: {} },
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
	assert(vm.runInContext(`state.protect.has("beewings")`, ctx), "quest materials protected at load");

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
	vm.runInContext(`state.errand = null; smart_depth = 0; restock()`, ctx);
	await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
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

	// 14) full bags of materials: nothing to sell → bank them; keep potions, scrolls, protected items
	ctx.G.items.gslime = { type: "material" }; ctx.G.items.beewings = { type: "material" };
	ctx.G.items.scroll0 = { type: "uscroll" }; ctx.G.items.hpot1.type = "pot";
	character.items = Array(42).fill(null).map((_, i) => ({ name: "gslime", q: 1 }));
	character.items[0] = { name: "hpot1", q: 100 }; character.items[1] = { name: "scroll0", q: 3 }; character.items[2] = { name: "beewings", q: 5 };
	const recount = () => (character.esize = character.items.filter((x) => !x).length);
	recount();
	const stored = [];
	character.bank = { items0: [] };
	ctx.bank_store = (i) => (stored.push(character.items[i].name), (character.items[i] = null), recount(), Promise.resolve({ success: true }));
	ctx.smart_move = () => Promise.resolve();
	vm.runInContext(`state.errand = null; smart_depth = 0; free_bags()`, ctx);
	for (let i = 0; i < 400 && vm.runInContext("state.errand", ctx); i++) await new Promise((r) => setImmediate(r));
	const kept = character.items.filter(Boolean).map((x) => x.name).sort().join();
	assert(stored.length === 39 && kept === "beewings,hpot1,scroll0", `banked materials, kept pots/scrolls/quest mats (${stored.length}, ${kept})`);
	console.log("ALL PASS");
})();
