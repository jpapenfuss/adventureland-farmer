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
	items: { hpot1: { g: 20, type: "pot", gives: [["hp", 400]] }, mpot1: { g: 20, type: "pot", gives: [["mp", 500]] }, hpot0: { g: 5, type: "pot", gives: [["hp", 200]] }, mpot0: { g: 5, type: "pot", gives: [["mp", 300]] }, beewings: { type: "material" }, gslime: { type: "material" } }, skills: { attack: {}, use_town: {}, use_hp: {}, use_mp: {}, regen_hp: {}, regen_mp: {} },
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
// Globals the game's code runner declares (var/function in common_functions.js, runner_functions.js,
// runner_compat.js). In the browser they're non-configurable, so a top-level const/let of the same name aborts the
// whole script ("redeclaration of non-configurable global property"; v15.0's `const pm` did this). Mirror them here
// so the same mistake fails the tests; function declarations may still replace them, as in the game. Node's vm
// doesn't enforce that rule, so it's checked statically: top-level const/let names vs this list.
const RUNNER_GLOBALS = ["CINF", "EPS", "G", "Heap", "PIXI", "REPS", "RESOLVE_ALL", "T", "TYPE_MAX", "TYPE_MIN", "ZEPS", "abs", "accept_magiport", "accept_party_invite", "accept_party_request", "activate", "active_code_slot", "add_bottom_button", "add_top_button", "adopt_extras", "all_cx", "array_delete", "ascending_comp", "attack", "attire_slots", "auto_craft", "auto_reload", "baby_steps", "bank_deposit", "bank_packs", "bank_retrieve", "bank_store", "bank_swap", "bank_withdraw", "base_points", "bfs", "booster_items", "bsearch_start", "buttons", "buy", "buy_with_gold", "buy_with_shells", "c_round", "c_version", "calculate_item_grade", "calculate_item_properties", "calculate_item_value", "calculate_move", "calculate_move_v2", "calculate_movex", "calculate_vxy", "can_add_item", "can_add_items", "can_attack", "can_buy", "can_heal", "can_move", "can_move_to", "can_stack", "can_transport", "can_use", "can_use_door", "can_walk", "ceil", "change_server", "change_target", "change_target_privately", "character", "character_slots", "clear_buttons", "clear_drawings", "cli_smart_move_result", "clone", "close_stand", "closest_line", "code_draw", "colors", "command_character", "compound", "consume", "continue_pathfinding", "craft", "cruise", "cshuffle", "cxtype_to_slot", "damage_multiplier", "deferred", "deferreds", "delete_indices", "destroy", "destroy_item", "direction_logic", "disconnect", "dismantle", "distance", "doneify", "doublehand_types", "dps_multiplier", "draw_circle", "draw_line", "drawings", "e_array", "enter", "eps_equal", "equip", "equip_batch", "equip_cx", "eval_s", "exchange_buy", "find_npc", "floor", "floor_f2", "free_cx", "future_h", "future_m", "future_ms", "future_s", "game_log", "get", "get_active_characters", "get_active_code_slot", "get_characters", "get_chests", "get_edited_code_slot", "get_entity", "get_focus", "get_height", "get_map", "get_monster", "get_nearest_hostile", "get_nearest_monster", "get_nearest_npc", "get_party", "get_player", "get_servers", "get_socket", "get_target", "get_target_of", "get_targeted_monster", "get_width", "get_x", "get_xy", "get_y", "giveaway", "handle_command", "handle_death", "hardcore_logic", "he", "heal", "hsince", "html_escape", "hx", "in_arr", "in_arrD2", "in_attack_range", "in_pvp", "interact", "is_array", "is_character", "is_character_local", "is_disabled", "is_door_close", "is_function", "is_in_front", "is_in_range", "is_monster", "is_moving", "is_npc", "is_number", "is_nun", "is_object", "is_on_cooldown", "is_paused", "is_player", "is_point_inside", "is_pvp", "is_silenced", "is_string", "is_substr", "is_transporting", "item_grade", "item_properties", "item_value", "join", "join_giveaway", "kick_party_member", "last_loot", "last_message", "last_potion", "leave", "leave_party", "line_hit_x", "line_hit_y", "load_code", "local_cm_logic", "local_m_num", "locate_item", "lock_item", "log", "log_trace", "loot", "lstack", "m_calculate", "m_dx", "m_dy", "m_line_x", "m_line_y", "map_cx", "map_key", "max", "min", "mode_resolve_all", "move", "moves", "msince", "mssince", "nunv", "object_sort", "offhand_types", "on_cm", "on_combined_damage", "on_destroy", "on_disappear", "on_draw", "on_game_event", "on_magiport", "on_map_click", "on_party_invite", "on_party_request", "open_stand", "party_say", "pause", "performance_trick", "pget", "plot", "pm", "point_distance", "preview_item", "process_game_data", "prop_cache", "proxy", "prune_cx", "pset", "push_deferred", "push_deferreds", "qpush", "quantity", "queue", "randomStr", "random_away", "random_binaries", "random_binary", "random_one", "random_point", "really_old", "recalculate_move", "recalculate_vxy", "reduce_cooldown", "reject_deferred", "reject_deferreds", "rejecting_promise", "require_code", "reset_mappings", "resolve_deferred", "resolve_deferreds", "resolving_promise", "respawn", "riches_slots", "rough_size", "round", "round_float", "safe_log", "safe_stringify", "safeties", "say", "seal_item", "seed0", "seed1", "sell", "send_cx", "send_gold", "send_item", "send_local_cm", "send_mail", "send_party_invite", "send_party_request", "send_server_cm", "set", "set_base", "set_button_color", "set_button_onclick", "set_button_value", "set_home", "set_keymap", "set_message", "set_skillbar", "set_xy", "shift", "show_json", "shuffle", "simple_distance", "sleep", "smart", "smart_eval", "smart_move", "smart_move_logic", "smart_num", "smooth_path", "split", "sq", "sqrt", "ssince", "start_character", "start_pathfinding", "stop", "stop_character", "stop_logic", "swap", "test_logic", "throw_item", "to_filename", "to_number", "to_pretty_float", "to_pretty_num", "to_shrinked_num", "to_title", "trade", "trade_buy", "trade_sell", "trade_slots", "trigger", "trigger_character_event", "trigger_event", "unequip", "unfriend", "unlock_item", "unmap_key", "unstuck_logic", "upgrade", "upload_code", "use", "use_hp_or_mp", "use_nearest_door", "use_skill", "vHeap", "valid_file_chars", "weapon_types", "wishlist", "within_xy_range", "xmove"];
{
	const lexical = [...src.matchAll(/^(?:const|let) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
	const clash = lexical.filter((n) => RUNNER_GLOBALS.includes(n));
	if (clash.length) { console.error("FAIL: top-level const/let shadows a runner global (aborts the script in game):", clash); process.exit(1); }
	console.log(`ok - no top-level const/let clashes with the ${RUNNER_GLOBALS.length} runner globals`);
}
vm.createContext(ctx);
vm.runInContext(src, ctx);
const st = () => vm.runInContext("state", ctx);
const runTick = () => { const t = timers.filter((x) => x.fn.name === "tick").pop(); timers.length = 0; t.fn(); return timers.find((x) => x.fn.name === "tick").ms; };
// A run that ends without reaching "ALL PASS" (an awaited promise that never settles, e.g. a mocked walk) must fail,
// not exit 0 silently
let all_done = false;
process.on("exit", (code) => { if (!all_done && code === 0) { console.error("FAIL: test run ended early (a promise never settled)"); process.exitCode = 1; } });
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
	ctx.buy = (name, q) => (bought.push([name, q]), character.gold -= ctx.G.items[name].g * q, Promise.resolve());
	await vm.runInContext(`state.errand = null; smart_depth = 0; task_restock()`, ctx);
	// 1000g can't refill 200 hpot1 (4000g) → cheap tier: hp gets half (500g → 100 hpot0), mp the rest (100 mpot0)
	assert(JSON.stringify(bought) === '[["hpot0",100],["mpot0",100]]', `poor: restock falls back to cheap potions (${JSON.stringify(bought)})`);
	bought.length = 0; character.gold = 100000;
	await vm.runInContext(`state.errand = null; smart_depth = 0; task_restock()`, ctx);
	assert(JSON.stringify(bought) === '[["hpot1",200],["mpot1",200]]', `rich: restock buys the configured potions (${JSON.stringify(bought)})`);
	character.gold = 1000;

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
	// (quests and hunts outrank the guide row now: switch them off so the row is the only goal)
	const hunt_save = character.s.monsterhunt; delete character.s.monsterhunt;
	vm.runInContext(`CFG.quest_farm = false; state.goals_cache = null`, ctx);
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
	// priorities: an own monster hunt outranks the guide row
	vm.runInContext(`state.guide_ignore = {}; state.gprog = null; state.guide_farm.until = Date.now() + 1e6`, ctx);
	character.s.monsterhunt = { id: "goo", c: 5 };
	const fp_save = ctx.fight_profile;
	vm.runInContext(`state.guide_farm.monster = "bee"; state.directive = null; refresh_directive()`, ctx);
	assert(vm.runInContext(`state.directive && /monster hunt/.test(state.directive.reason)`, ctx), `hunt outranks the guide row (${vm.runInContext("JSON.stringify(state.directive && state.directive.reason)", ctx)})`);
	delete character.s.monsterhunt;
	// outlevelled guide row skipped
	vm.runInContext(`state.guide_farm.monster = "goo"; state.best_score = 1e9; state.directive = null; state.goals_cache = null; refresh_directive()`, ctx);
	assert(vm.runInContext(`!state.directive && !goals_list().some((g) => /guide/.test(g.reason))`, ctx), "outlevelled guide farm row skipped (not shared either)");
	vm.runInContext(`state.best_score = 0`, ctx);
	if (hunt_save) character.s.monsterhunt = hunt_save;
	vm.runInContext(`CFG.quest_farm = true; state.goals_cache = null`, ctx);
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
	const rep22 = vm.runInContext("report('solo')", ctx);
	vm.runInContext("why_not('squigtoad'); why_not('goo'); why_not('nope')", ctx);
	const out22 = rep22 + "\n" + log.slice(logs0).join("\n");
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
	vm.runInContext("report('solo')", ctx);
	assert(/<textarea/.test(modal) && /quest wcap/.test(modal), "report('solo') opens a selectable text box");

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
	vm.runInContext("state.partners = {}; state.errand = null; smart_depth = 0", ctx);
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
	vm.runInContext("state.partners = {}; state.duo_near = undefined; state.pack = { mtype: 'goo', map: 'main', boundary: [-100,-100,100,100] }", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 56, ctype: "priest", map: "bank", x: 0, y: 0, hp: 2500, max_hp: 2500, errand: "town", attack: 180, frequency: 0.75, damage_type: "magical" } });
	vm.runInContext("duo_check(); state.last_pick = 1", ctx);
	assert(vm.runInContext("leader_name() === 'Torlis' && !is_follower() && state.duo_near === ''", ctx), "leader farms solo (no waiting) while the priest is in town");
	// safety: a mob too strong for a level-5 paladin alone is fine with the level-56 priest beside it
	ctx.G.monsters.tough31 = { xp: 500, hp: 1000, attack: 15, respawn: 10, range: 20, speed: 10, frequency: 1, resistance: 0, armor: 0 };
	const solo = vm.runInContext("!!fight_profile('tough31')", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 56, ctype: "priest", map: "main", x: 30, y: 0, hp: 2500, max_hp: 2500, errand: null, attack: 180, frequency: 0.75, damage_type: "magical" } });
	const duo = vm.runInContext("!!fight_profile('tough31')", ctx);
	assert(!solo && duo, `unsafe solo, safe with the priest near (solo ${solo}, duo ${duo})`);
	vm.runInContext("duo_check()", ctx);
	assert(vm.runInContext("state.duo_near === 'Aspernari' && state.last_pick === 0", ctx), "priest back → pack re-judged as a pair");

	// 32) leader works the follower's monster hunt (kills credit every party member)
	ctx.G.monsters.tortoise = { xp: 300, hp: 600, attack: 8, respawn: 10, range: 20, speed: 8, frequency: 1 };
	ctx.G.maps.main.monsters.push({ type: "tortoise", count: 6, boundary: [-1353, 720, -896, 1516] });
	vm.runInContext("state.guide_farm = null; state.directive = null; state.guide_quests = {}; state.crafted = { wcap: 1 }", ctx);
	character.s = {};
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 56, ctype: "priest", map: "main", x: 30, y: 0, hp: 2500, max_hp: 2500, errand: null,
		attack: 180, frequency: 0.75, damage_type: "magical", hunt: { id: "tortoise", c: 20 },
		goals: [{ monster: "tortoise", w: 4, reason: "monster hunt 20 left", eta_h: 0.5 }] } });
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
	const d33a = vm.runInContext("town_due(partners()[0]?.errand === 'town')", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 56, ctype: "priest", map: "bank", x: 0, y: 0, hp: 2500, max_hp: 2500, errand: "town", attack: 180, frequency: 0.75, damage_type: "magical" } });
	const d33b = vm.runInContext("town_due(partners()[0]?.errand === 'town')", ctx);
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
	vm.runInContext("state.duo_near = 'Aspernari'; state.last_pick = 1; duo_check()", ctx);
	assert(vm.runInContext("state.duo_near === '' && state.last_pick === 0", ctx), "priest dies → leader re-judges its pack solo (no waiting)");

	// 35) regression: nothing due → no town run (v11.2 counted numeric fields as due tasks)
	vm.runInContext("state.errand = null; smart_depth = 0; state.last_town = 0; state.gear_skip = {}; state.guide = null; state.needs = new Map()", ctx);
	character.items = [{ name: "hpot1", q: 100 }, { name: "mpot1", q: 100 }, ...Array(40).fill(null)]; character.esize = 42; character.s = { monsterhunt: { id: "goo", c: 5 } };
	ctx.quantity = () => 100; ctx.get_nearest_monster = () => null; character.hp = character.max_hp; character.rip = false;
	vm.runInContext("state.partners = {}", ctx);
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
		goals: [{ monster: "minimush", map: "main", boundary: [200, 200, 400, 400], count: 8, w: 2, reason: "guide quest wgloves: spores 0/20" }] } });
	vm.runInContext("refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'goo' && state.turn.who === 'Torlis'", ctx), "first turn: leader's own goal");
	vm.runInContext("state.turn.end = Date.now() - 1; refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'minimush' && state.directive.for_partner && /Aspernari: guide quest wgloves/.test(state.directive.reason)", ctx),
		`second turn: partner's goal (${vm.runInContext("JSON.stringify(state.directive)", ctx)})`);

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
	// v18.0: an overlap of guide-farm rows only (1+1 < a hunt's weight) isn't mutual: turns, not "guide goo" for both
	ctx.G.craft = {};
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 57, ctype: "priest", map: "main", x: 30, y: 0, hp: 2500, max_hp: 2500, errand: null, attack: 180, frequency: 0.75, damage_type: "magical",
		goals: [{ monster: "tortoise", w: 4, reason: "monster hunt 20 left" }, { monster: "goo", w: 1, reason: "guide goo" }] } });
	vm.runInContext("state.turn = null; state.goals_cache = null; refresh_directive()", ctx);
	assert(vm.runInContext("!state.directive.mutual", ctx), `guide-only overlap isn't mutual (${vm.runInContext("JSON.stringify(state.directive)", ctx)})`);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 57, ctype: "priest", map: "main", x: 30, y: 0, hp: 2500, max_hp: 2500, errand: null, attack: 180, frequency: 0.75, damage_type: "magical",
		goals: [{ monster: "tortoise", w: 3, reason: "monster hunt 20 left" }, { monster: "minimush", w: 2, reason: "wgloves: spores 0/20" }] } });
	// no overlap → turns between the two tops
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

	// 40) no fetch loop: needed wcap, bank holds wcap+3 → fetch once; with the +3 in the bag, nothing more to fetch
	ctx.G.items.wcap = { type: "helmet", upgrade: {} };
	character.items = Array(42).fill(null); character.esize = 42;
	vm.runInContext("state.needs = new Map([['wcap', 2]]); state.bank_seen = { wcap: 2 }", ctx);
	assert(vm.runInContext("bag_plan().fetch.join()", ctx) === "wcap", "fetch the needed wcap when none is in the bag");
	character.items[0] = { name: "wcap", level: 3 }; character.esize = 41;
	assert(vm.runInContext("bag_plan().fetch.length === 0 && bag_plan().bank.length === 0", ctx), "an upgraded copy in the bag satisfies the need (no re-fetch, not banked)");
	// compound row with inputs missing fails before walking
	const walk40 = [];
	ctx.smart_move = (d) => (walk40.push(d), Promise.resolve());
	ctx.G.items.intamulet = { type: "amulet", compound: {} };
	const e40 = await vm.runInContext("run_compound", ctx)({ name: "intamulet", level: 1, scroll: "cscroll0" }, { request: { name: "intamulet", level: 2 } }).catch((e) => e);
	assert(e40?.reason === "input_missing" && !walk40.length, "missing compound inputs: no walk to the NPC");

	// 41) fetch loop v2: needed helmet worn → no fetch; not worn → one attempt, then none for 2h even if it vanishes again
	ctx.G.items.helmet = { type: "helmet", upgrade: {} };
	character.items = Array(42).fill(null); character.esize = 42; character.slots = { helmet: { name: "helmet", level: 5 } };
	vm.runInContext("state.needs = new Map([['helmet', 2]]); state.bank_seen = { helmet: 3 }; state.fetch_try = {}", ctx);
	assert(vm.runInContext("bag_plan().fetch.length", ctx) === 0, "worn copy satisfies the need");
	character.slots = {};
	character.bank = { items0: [{ name: "helmet", level: 2 }, { name: "helmet", level: 1 }] }; character.map = "bank";
	ctx.parent.bank_packs = { items0: ["bank", 0, 0] };
	ctx.bank_retrieve = (p, n) => { character.bank[p][n] = null; return Promise.resolve({ success: true }); }; // the copy "vanishes" (equipped elsewhere)
	await vm.runInContext("task_bank(bag_plan().fetch)", ctx);
	assert(vm.runInContext("bag_plan().fetch.length", ctx) === 0, "no second fetch within 2h even though none is in bag or worn");

	// 42) loop brake: a 7th town run within 10 minutes is refused unless bags are critical
	vm.runInContext("state.errand = null; smart_depth = 0; state.gear_skip = {}; state.town_runs = Array(6).fill(Date.now()); state.last_town = 0; state.needs = new Map(); state.fetch_try = {}", ctx);
	ctx.quantity = () => 0; character.items = Array(42).fill(null); character.esize = 42; character.hp = character.max_hp;
	ctx.get_nearest_monster = () => null; character.map = "main";
	vm.runInContext("town_check()", ctx);
	assert(vm.runInContext("!state.errand && skipped('town:loop')", ctx), "7th run in 10 min refused, town paused");
	vm.runInContext("town_check()", ctx);
	assert(vm.runInContext("!state.errand", ctx), "still paused on the next check");
	ctx.quantity = () => 100;

	// 43) gold balance: Aspernari 13,191,492 vs Torlis 299,409 → Aspernari sends 15% (1,978,723) once; then 3h lockout both ways
	ctx.setTimeout = (fn, ms) => (ms < 60000 && setImmediate(fn), 0);
	const sends = [];
	ctx.send_gold = (to, g) => { sends.push([to, g]); return Promise.resolve({ success: true }); };
	Object.assign(character, { name: "Aspernari", ctype: "priest", level: 57, gold: 13191492, map: "main", x: 0, y: 0, rip: false });
	vm.runInContext("state.gold_xfer_at = 0; state.gold_retry_at = 0", ctx);
	const hbT = (extra) => handlers.cm({ name: "Torlis", message: { k: "hb", level: 41, ctype: "paladin", map: "main", x: 100, y: 0, hp: 900, max_hp: 900, errand: null, gold: 299409, gold_xfer_at: 0, ...extra } });
	hbT({});
	vm.runInContext("gold_balance()", ctx);
	for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
	assert(sends.length === 1 && sends[0][0] === "Torlis" && sends[0][1] === 1978723, `richer sends 15% (${JSON.stringify(sends)})`);
	vm.runInContext("gold_balance()", ctx);
	for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
	assert(sends.length === 1, "no second transfer within 3h");
	// the poorer side never sends; and it picks up the shared clock from the richer's heartbeat
	Object.assign(character, { name: "Torlis", ctype: "paladin", level: 41, gold: 299409 });
	vm.runInContext("state.gold_xfer_at = 0", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 57, ctype: "priest", map: "main", x: 50, y: 0, hp: 2500, max_hp: 2500, errand: null, gold: 13191492, gold_xfer_at: Date.now() } });
	vm.runInContext("gold_balance()", ctx);
	assert(sends.length === 1 && vm.runInContext("state.gold_xfer_at > 0", ctx), "poorer never sends; shared 3h clock received");
	// richer under 1,000,000 → no transfer; apart → waits
	Object.assign(character, { name: "Aspernari", ctype: "priest", level: 57, gold: 900000 });
	vm.runInContext("state.gold_xfer_at = 0", ctx);
	hbT({ gold: 10 });
	assert(vm.runInContext("gold_balance()", ctx) === null && sends.length === 1, "no transfer when the richer has < 1,000,000");
	character.gold = 13191492;
	hbT({ map: "halloween" });
	assert(vm.runInContext("gold_balance()", ctx) === "not together" && sends.length === 1, "waits until both are together");

	// 44) three members: Aspernari (priest 57), Torlis (paladin 41), Sanala (mage 1)
	ctx.setTimeout = (fn, ms) => (ms < 60000 && setImmediate(fn), 0);
	const hb = (name, extra) => handlers.cm({ name, message: { k: "hb", map: "main", x: 40, y: 0, errand: null, rip: false, ...extra } });
	const asp = { level: 57, ctype: "priest", hp: 2500, max_hp: 2500, attack: 180, frequency: 0.75, damage_type: "magical", gold: 13000000 };
	const tor = { level: 41, ctype: "paladin", hp: 900, max_hp: 900, attack: 60, frequency: 1, damage_type: "physical", gold: 2300000 };
	const san = { level: 1, ctype: "mage", hp: 150, max_hp: 150, attack: 15, frequency: 0.8, damage_type: "magical", gold: 0 };
	vm.runInContext("state.partners = {}; state.turn = null; state.duo_near = undefined", ctx);
	Object.assign(character, { name: "Aspernari", ...asp, map: "main", x: 0, y: 0, rip: false, gold: asp.gold });
	hb("Torlis", tor); hb("Sanala", san);
	assert(vm.runInContext("leader_name() === 'Sanala' && is_follower() && leader_hb().name === 'Sanala'", ctx), "lowest level (Sanala) leads; Aspernari follows her");
	// invites: Aspernari+Torlis already partied → Aspernari (alphabetically first of them) invites Sanala; Torlis doesn't
	const inv = [];
	ctx.send_party_invite = (n) => (inv.push([character.name, n]), Promise.resolve());
	ctx.get_party = () => ({ Aspernari: {}, Torlis: {} });
	hb("Torlis", { ...tor, party: ["Aspernari", "Torlis"] }); hb("Sanala", { ...san, party: [] });
	vm.runInContext("party_invite_tick()", ctx);
	assert(JSON.stringify(inv) === '[["Aspernari","Sanala"]]', `Aspernari invites Sanala (${JSON.stringify(inv)})`);
	// Aspernari partied with Torlis but NOT running the script (no heartbeat) → Torlis must invite instead
	inv.length = 0;
	Object.assign(character, { name: "Torlis", ...tor });
	vm.runInContext("delete state.partners.Aspernari", ctx);
	hb("Sanala", { ...san, party: [] });
	vm.runInContext("party_invite_tick()", ctx);
	assert(JSON.stringify(inv) === '[["Torlis","Sanala"]]', `idle Aspernari: Torlis invites Sanala (${JSON.stringify(inv)})`);
	Object.assign(character, { name: "Aspernari", ...asp });
	hb("Torlis", { ...tor, party: ["Aspernari", "Torlis"] });
	// Aspernari heard (e.g. an old version that doesn't know Sanala) AND partied with Torlis → Torlis still invites
	inv.length = 0;
	Object.assign(character, { name: "Torlis", ...tor });
	hb("Aspernari", { ...asp, party: ["Aspernari", "Torlis"], v: "11.9" }); hb("Sanala", { ...san, party: [] });
	vm.runInContext("party_invite_tick()", ctx);
	assert(JSON.stringify(inv) === '[["Torlis","Sanala"]]', `every partied member invites; nobody can block (${JSON.stringify(inv)})`);
	// unpartied Sanala asks to join the members' party
	const reqs = [];
	ctx.send_party_request = (n) => (reqs.push(n), Promise.resolve());
	ctx.get_party = () => ({});
	Object.assign(character, { name: "Sanala", ...san });
	hb("Torlis", { ...tor, party: ["Aspernari", "Torlis"] }); hb("Aspernari", { ...asp, party: ["Aspernari", "Torlis"] });
	vm.runInContext("party_invite_tick()", ctx);
	assert(reqs.length === 1 && ["Aspernari", "Torlis"].includes(reqs[0]) && !inv.some(([w]) => w === "Sanala"), `unpartied member requests to join (${reqs})`);
	ctx.get_party = () => ({ Aspernari: {}, Torlis: {} });
	Object.assign(character, { name: "Aspernari", ...asp });
	hb("Torlis", { ...tor, party: ["Aspernari", "Torlis"] }); hb("Sanala", { ...san, party: [] });
	const acc44 = [];
	ctx.accept_party_invite = (n) => acc44.push([character.name, n]);
	vm.runInContext("on_party_invite('Sanala')", ctx); // Aspernari is partied with Torlis: must not leave
	assert(!acc44.length, "a member partied with another member ignores invites (no party split)");
	ctx.get_party = () => ({});
	Object.assign(character, { name: "Sanala", ...san, gold: 0 });
	vm.runInContext("on_party_invite('Aspernari')", ctx);
	assert(JSON.stringify(acc44) === '[["Sanala","Aspernari"]]', "unpartied Sanala accepts");
	// gold: richest (Aspernari) sends to the poorest (Sanala), not Torlis
	Object.assign(character, { name: "Aspernari", ...asp });
	vm.runInContext("state.gold_xfer_at = 0; state.gold_retry_at = 0", ctx);
	hb("Torlis", tor); hb("Sanala", san);
	const sends44 = [];
	ctx.send_gold = (to, g) => (sends44.push([to, g]), Promise.resolve({ success: true }));
	vm.runInContext("gold_balance()", ctx);
	for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
	assert(sends44.length === 1 && sends44[0][0] === "Sanala" && sends44[0][1] === 1950000, `richest sends 15% to the poorest (${JSON.stringify(sends44)})`);
	Object.assign(character, { name: "Torlis", ...tor });
	vm.runInContext("state.gold_xfer_at = 0", ctx);
	hb("Aspernari", asp); hb("Sanala", san);
	sends44.length = 0;
	vm.runInContext("gold_balance()", ctx);
	assert(!sends44.length, "a member who isn't the richest never sends");
	// fight model: Sanala alone can't handle a mob that the trio can
	Object.assign(character, { name: "Sanala", ...san, armor: 5, resistance: 5, range: 120, speed: 50 });
	ctx.G.classes.mage = { damage_type: "magical" };
	ctx.G.monsters.trio44 = { xp: 300, hp: 1500, attack: 6, respawn: 10, range: 20, speed: 10, frequency: 1 };
	vm.runInContext("state.partners = {}; live_cache.clear()", ctx);
	const solo44 = vm.runInContext("!!fight_profile('trio44')", ctx);
	hb("Aspernari", asp); hb("Torlis", tor);
	const trio44 = vm.runInContext("!!fight_profile('trio44')", ctx);
	assert(!solo44 && trio44, `unsafe for Sanala alone, safe with both partners near (${solo44}, ${trio44})`);
	vm.runInContext("state.duo_near = undefined; duo_check(); duo_check()", ctx);
	assert(vm.runInContext("state.duo_near", ctx) === "Aspernari,Torlis", "leader tracks which members are near");
	// goals: a monster on 2 of 3 lists is mutual; with no overlap, turns rotate Sanala → Aspernari → Torlis
	ctx.G.monsters.m1 = { xp: 50, hp: 100, attack: 2, respawn: 5, range: 20, speed: 10, frequency: 1 };
	ctx.G.monsters.m2 = { ...ctx.G.monsters.m1 }; ctx.G.monsters.m3 = { ...ctx.G.monsters.m1 };
	ctx.G.maps.main.monsters.push({ type: "m1", count: 5, boundary: [0, 0, 50, 50] }, { type: "m2", count: 5, boundary: [60, 60, 90, 90] }, { type: "m3", count: 5, boundary: [100, 100, 150, 150] });
	vm.runInContext(`state.turn = null; state.goals_cache = null; state.guide_ignore = {}; state.gprog = null; G.craft = {}; character.s = {};
		state.guide_farm = { monster: "m1", map: "main", boundary: [0,0,50,50], count: 5, reason: "guide xp", guide_safe: true, until: Date.now() + 1e6 }`, ctx);
	hb("Aspernari", { ...asp, goals: [{ monster: "m2", w: 3, reason: "hunt", eta_h: 1 }] });
	hb("Torlis", { ...tor, goals: [{ monster: "m2", w: 4, reason: "guide row" }] });
	vm.runInContext("refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'm2' && state.directive.mutual", ctx), "m2 (Aspernari + Torlis) is mutual and wins");
	hb("Torlis", { ...tor, goals: [{ monster: "m3", w: 4, reason: "guide row" }] });
	vm.runInContext("state.turn = null; state.goals_cache = null", ctx);
	const seq = [];
	for (let i = 0; i < 4; i++) {
		vm.runInContext("refresh_directive()", ctx);
		seq.push(vm.runInContext("state.turn.who + ':' + state.directive.monster", ctx));
		vm.runInContext("state.turn.end = Date.now() - 1", ctx);
	}
	assert(seq.join() === "Sanala:m1,Aspernari:m2,Torlis:m3,Sanala:m1", `turns rotate through all three (${seq})`);
	// 45) melee follower walks to the leader's target (it used to wait for targets to come to it)
	const V = vm.runInContext("VERSION", ctx);
	ctx.G.classes.paladin = ctx.G.classes.paladin || { damage_type: "physical" };
	Object.assign(character, { name: "Torlis", ...tor, range: 25, map: "main", x: 0, y: 0, rip: false, moving: false });
	vm.runInContext("state.partners = {}; state.errand = null", ctx);
	hb("Sanala", { ...san, x: 40, y: 0, target: "m45" }); hb("Aspernari", { ...asp, x: 40, y: 10 });
	ctx.parent.entities.m45 = { id: "m45", type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, x: 200, y: 0, target: "Sanala" };
	const dist_save = ctx.distance, move_save = ctx.move, moved = [];
	ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	ctx.move = (x, y) => moved.push([Math.round(x), Math.round(y)]);
	ctx.can_attack = () => false;
	vm.runInContext("last_move = 0", ctx);
	vm.runInContext("is_follower() && follower_tick()", ctx);
	assert(moved.length && moved[0][0] > 100, `melee follower closes in on the leader's target (${JSON.stringify(moved)})`);
	// ...but not after a target far from the leader
	moved.length = 0;
	ctx.parent.entities.m45.x = 900;
	vm.runInContext("last_move = 0; follower_tick()", ctx);
	assert(!moved.some(([x]) => x > 400), `doesn't chase targets beyond wait_radius of the leader (${JSON.stringify(moved)})`);
	delete ctx.parent.entities.m45; ctx.can_attack = () => true;

	// 46) gear: equip a better helmet from the bags; hand a spare to a partner; fetch an upgrade from the bank
	ctx.G.items.helm1 = { type: "helmet", armor: 10, upgrade: { armor: 2 } };
	ctx.G.items.helm2 = { type: "helmet", armor: 30 };
	ctx.G.items.helm3 = { type: "helmet", armor: 80 };
	const eq = [];
	ctx.equip = (k, slot) => (eq.push([character.items[k].name, slot]), Promise.resolve());
	character.items = Array(42).fill(null); character.items[5] = { name: "helm2", level: 0 };
	character.slots = { helmet: { name: "helm1", level: 0 } };
	vm.runInContext("state.needs = new Map(); state.guide_equip = {}", ctx);
	await vm.runInContext("equip_upgrades()", ctx);
	assert(JSON.stringify(eq) === '[["helm2","helmet"]]', `better bag helmet equipped (${JSON.stringify(eq)})`);
	// guide-owned slot (recently equipped AND a live guide step for it): only a 20%+ better item goes in
	ctx.G.items.hA = { type: "helmet", armor: 100 }; ctx.G.items.hB = { type: "helmet", armor: 112 }; ctx.G.items.hC = { type: "helmet", armor: 140 };
	const slots46 = character.slots; character.slots = { helmet: { name: "hA", level: 0 } };
	character.items[5] = { name: "hB", level: 0 }; // +12%: clears the normal 5% margin, not the guide's 20%
	vm.runInContext("state.guide_equip.helmet = Date.now(); state.guide = { rows: [{ id: 'upgrade:helmet:hA:0:', kind: 'upgrade' }] }; my_gear_cache = null", ctx); eq.length = 0;
	await vm.runInContext("equip_upgrades()", ctx);
	assert(!eq.length, "a slot the guide is working on keeps its item against a marginal upgrade");
	character.items[5] = { name: "hC", level: 0 }; eq.length = 0; // +40%
	vm.runInContext("my_gear_cache = null", ctx);
	await vm.runInContext("equip_upgrades()", ctx);
	assert(JSON.stringify(eq) === '[["hC","helmet"]]', "...but takes a clearly (20%+) better one");
	vm.runInContext("state.guide = { rows: [] }; my_gear_cache = null", ctx); eq.length = 0; character.items[5] = { name: "hB", level: 0 };
	await vm.runInContext("equip_upgrades()", ctx);
	assert(JSON.stringify(eq) === '[["hB","helmet"]]', "no live guide step for the slot → normal margin applies");
	vm.runInContext("state.guide_equip = {}; state.guide = null; my_gear_cache = null", ctx); character.slots = slots46; character.items[5] = { name: "helm2", level: 0 };
	// hand-me-down: Aspernari wears helm3, so helm2 is a spare; Torlis wears helm1 → gets helm2
	Object.assign(character, { name: "Aspernari", ...asp, x: 0, y: 0 });
	character.slots = { helmet: { name: "helm3", level: 0 } };
	ctx.G.classes.priest = ctx.G.classes.priest || { damage_type: "magical" };
	const sent = [];
	ctx.send_item = (to, k) => (sent.push([to, character.items[k].name]), Promise.resolve());
	hb("Torlis", { ...tor, x: 40, y: 0, v: V, esize: 10, gear: { w: { helmet: vm.runInContext("gear_score({ name: 'helm1', level: 0 }, 'paladin')", ctx) }, dh: false, off: false } });
	hb("Sanala", { ...san, x: 40, y: 0, v: V, esize: 10, gear: { w: { helmet: 1e9 }, dh: false, off: false } });
	await vm.runInContext("share_gear()", ctx);
	assert(JSON.stringify(sent) === '[["Torlis","helm2"]]', `spare helmet handed to Torlis (${JSON.stringify(sent)})`);
	sent.length = 0;
	await vm.runInContext("share_gear()", ctx);
	assert(!sent.length, "a failed/finished hand-over isn't retried within 10 min");
	// bank: an upgrade seen in the (shared) bank becomes a fetch entry for that exact piece
	Object.assign(character, { name: "Torlis", ...tor });
	character.slots = { helmet: { name: "helm1", level: 0 } }; character.items = Array(42).fill(null);
	vm.runInContext("state.bank_gear = [{ name: 'helm3', level: 0 }, { name: 'helm1', level: 0 }]; state.fetch_try = {}", ctx);
	const fx = vm.runInContext("JSON.stringify(bag_plan().fetch)", ctx);
	assert(/"name":"helm3"/.test(fx) && !/"helm1"/.test(fx), `bank upgrade queued for fetching (${fx})`);
	vm.runInContext("state.bank_gear = []", ctx); character.slots = {};

	// 47) mage energizes the party member lowest on mana
	ctx.G.skills.energize = { range: 320 };
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", mp: 800, max_mp: 1000, x: 0, y: 0 });
	ctx.parent.entities.Aspernari = { id: "Aspernari", name: "Aspernari", type: "character", visible: true, mp: 100, max_mp: 1000, hp: 1, max_hp: 1, x: 50, y: 0 };
	const used = [];
	ctx.use_skill = (s, tg) => (used.push([s, tg && tg.name]), Promise.resolve());
	vm.runInContext("class_skills({ hp: 1, s: {} })", ctx);
	assert(JSON.stringify(used) === '[["energize","Aspernari"]]', `energize goes to the low-mana priest (${JSON.stringify(used)})`);
	delete ctx.parent.entities.Aspernari; ctx.distance = dist_save; ctx.move = move_save;
	// 48) own compounding: 3 spare rings in the bags → compound; a 4th copy in the bank → fetched; worn/locked excluded
	ctx.G.items.ringx = { type: "ring", compound: { attack: 1 }, attack: 2 };
	ctx.G.items.cscroll0 = { type: "cscroll", g: 1000 };
	ctx.G.items.computer = { type: "computer" };
	Object.assign(character, { name: "Torlis", ...tor, rip: false });
	character.slots = { ring1: { name: "ringx", level: 0 }, ring2: { name: "ringx", level: 0 } }; // wears two already: spares aren't upgrades
	character.items = Array(42).fill(null);
	character.items[0] = { name: "computer" }; character.items[1] = { name: "cscroll0", q: 5 };
	character.items[2] = { name: "ringx", level: 0 }; character.items[3] = { name: "ringx", level: 0 };
	character.items[4] = { name: "ringx", level: 0, l: "l" }; // locked: never compounded
	vm.runInContext("state.needs = new Map(); state.bank_gear = [{ name: 'ringx', level: 0 }]; state.fetch_try = {}; state.gear_skip = {}; state.partners = {}; cmp_cache = null", ctx);
	const g48 = vm.runInContext("JSON.stringify(compound_groups())", ctx);
	assert(/"bags":\[2,3\],"bank":1/.test(g48), `group counts 2 bag spares + 1 bank copy, not the locked one (${g48})`);
	const fx48 = vm.runInContext("JSON.stringify(bag_plan().fetch)", ctx);
	assert(/cmp:ringx:0:0/.test(fx48), `missing copy fetched from the bank (${fx48})`);
	assert(vm.runInContext("bag_class(character.items[2])", ctx) === "keep", "group copies stay in the bags (not banked)");
	assert(!vm.runInContext("town_due().compound", ctx), "not due until 3 copies are in the bags");
	character.items[5] = { name: "ringx", level: 0 }; // the fetched copy arrives
	vm.runInContext("cmp_cache = null", ctx);
	assert(vm.runInContext("town_due().compound", ctx), "due with 3 spares in the bags");
	const cmp = [];
	ctx.compound = (a, b, c, sc, off, preview) => {
		if (preview) return Promise.resolve({ chance: 0.9 });
		cmp.push([a, b, c]);
		character.items[a] = { name: "ringx", level: 1 }; character.items[b] = null; character.items[c] = null;
		return Promise.resolve({ success: true });
	};
	vm.runInContext("state.bank_gear = []", ctx);
	const n48 = await vm.runInContext("task_compound()", ctx);
	assert(n48 === 1 && JSON.stringify(cmp) === "[[2,3,5]]" && character.items[4].l, `compounded the three spares, left the locked ring (${JSON.stringify(cmp)})`);
	// low odds: paused 6h, nothing destroyed
	character.items[6] = { name: "ringx", level: 1 }; character.items[7] = { name: "ringx", level: 1 };
	ctx.compound = (a, b, c, sc, off, preview) => preview ? Promise.resolve({ chance: 0.5 }) : (cmp.push("REAL"), Promise.resolve({ success: true }));
	vm.runInContext("cmp_cache = null", ctx);
	await vm.runInContext("task_compound()", ctx);
	assert(!cmp.includes("REAL") && vm.runInContext("skipped('cmp:ringx:1')", ctx), "low preview chance: group paused, no compound");
	character.slots = {}; character.items = Array(42).fill(null);
	vm.runInContext("state.gear_skip = {}; cmp_cache = null", ctx);
	// 49) upgrade project: pick the NPC piece that beats Torlis's worn helmet most per gold, upgrade a spare to target
	ctx.G.items.scroll0 = { type: "uscroll", g: 1000 }; ctx.G.items.scroll1 = { type: "uscroll", g: 40000 };
	ctx.G.items.nhelm = { type: "helmet", armor: 5, upgrade: { armor: 6 }, g: 2000 };
	ctx.G.npcs.armorer = { items: ["nhelm"] };
	const fn_save = ctx.find_npc; ctx.find_npc = () => ({ map: "main", x: 0, y: 0 });
	Object.assign(character, { name: "Torlis", ...tor, gold: 5e6, rip: false });
	character.slots = { helmet: { name: "helm1", level: 0 } }; character.items = Array(42).fill(null);
	character.items[0] = { name: "computer" }; character.items[1] = { name: "scroll0", q: 20 }; character.items[2] = { name: "nhelm", level: 0 };
	vm.runInContext("state.partners = {}; state.merchant = null; state.upg = null; state.upg_pick_at = 0; state.gear_skip = {}; state.bank_gear = []; cmp_cache = null", ctx);
	assert(vm.runInContext("upgrade_due()", ctx) && vm.runInContext("state.upg.name", ctx) === "nhelm", `project picked (${vm.runInContext("JSON.stringify(state.upg)", ctx)})`);
	const to49 = vm.runInContext("state.upg.to", ctx);
	assert(vm.runInContext("needed_slots().has(2)", ctx), "project copy protected (not equipped/sent/banked mid-project)");
	const ups49 = [];
	ctx.upgrade = (k, sk, off, preview) => {
		if (preview) return Promise.resolve({ chance: 0.95 });
		ups49.push(character.items[k].level || 0); character.items[k] = { name: "nhelm", level: (character.items[k].level || 0) + 1 };
		return Promise.resolve({ success: true });
	};
	await vm.runInContext("task_upgrade()", ctx);
	assert(character.items[2].level === Math.min(to49, 8) || ups49.length === 8, `upgraded step by step (${ups49} → +${character.items[2].level}, target +${to49})`);
	if (character.items[2].level >= to49) { await vm.runInContext("task_upgrade()", ctx); assert(vm.runInContext("state.upg", ctx) === null, "project closed at target"); }
	// low odds stop the project at the level reached and pause that item
	vm.runInContext("state.upg = { name: 'nhelm', to: 9, for: 'Torlis', slot: 'helmet', gain: 10, cost: 1000 }", ctx);
	character.items[2] = { name: "nhelm", level: 2 };
	ctx.upgrade = (k, sk, off, preview) => Promise.resolve(preview ? { chance: 0.1 } : { success: true });
	await vm.runInContext("task_upgrade()", ctx);
	assert(vm.runInContext("state.upg === null && skipped('upg:nhelm')", ctx), "low preview: project stopped, item paused");
	// with the merchant online, fighters leave projects to it
	vm.runInContext("state.upg = null; state.upg_pick_at = 0; state.gear_skip = {}; state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 9999, y: 0, esize: 30, gold: 0 }", ctx);
	assert(!vm.runInContext("upgrade_due()", ctx), "fighter skips upgrade projects while the merchant is online");
	vm.runInContext("state.merchant = null", ctx);
	ctx.find_npc = fn_save;

	// 50) elixir: drink the best owned (not a withdrawal one); none active → fetch from bank; buy when rich
	ctx.G.items.elixirstr0 = { type: "elixir", str: 6, duration: 12 }; ctx.G.items.ale = { type: "elixir", str: 50, duration: 1, withdrawal: "hangover" };
	ctx.G.items.elixirluck = { type: "elixir", luck: 16, duration: 12, g: 240000 };
	ctx.G.classes.paladin.main_stat = "str";
	character.items = Array(42).fill(null); character.items[3] = { name: "ale", q: 1 }; character.items[4] = { name: "elixirstr0", q: 2 };
	character.slots = {};
	const drank = [];
	ctx.equip = (k, slot) => (drank.push(character.items[k].name), Promise.resolve());
	await vm.runInContext("drink_elixir()", ctx);
	assert(JSON.stringify(drank) === '["elixirstr0"]', `drinks the best non-withdrawal elixir (${drank})`);
	character.slots = { elixir: { name: "elixirstr0", expires: new Date(Date.now() + 3600e3).toISOString() } }; drank.length = 0;
	await vm.runInContext("drink_elixir()", ctx);
	assert(!drank.length, "an active elixir isn't replaced");
	character.slots = {}; character.items = Array(42).fill(null);
	vm.runInContext("state.bank_gear = [{ name: 'elixirstr0', level: 0 }]; state.fetch_try = {}", ctx);
	assert(/elixir:elixirstr0/.test(vm.runInContext("JSON.stringify(bag_plan().fetch)", ctx)), "fetches an elixir from the bank when none is active");
	vm.runInContext("state.bank_gear = []", ctx);
	assert(vm.runInContext("elixir_buy_due()", ctx), "rich and none owned → buy Liquid Luck");
	character.gold = 1e6;
	assert(!vm.runInContext("elixir_buy_due()", ctx), "...not below elixir_buy_min_gold");

	// 51) exchange: a full set of an exchangeable item, but never needed/kept ones
	ctx.G.items.gem0 = { type: "gem", e: 1, s: true }; ctx.G.items.seashell = { type: "material", e: 20, s: true };
	character.items[6] = { name: "seashell", q: 5 }; character.items[7] = { name: "gem0", q: 1 };
	assert(vm.runInContext("exchange_pick()", ctx) === 7, "picks the full exchange set (gem0), not 5/20 seashells");
	vm.runInContext("state.needs = new Map([['gem0', 1]])", ctx);
	assert(vm.runInContext("exchange_pick()", ctx) === -1, "never exchanges what the guide/quests need");
	vm.runInContext("state.needs = new Map()", ctx); character.items = Array(42).fill(null);

	// 52) tank first: with Torlis near, Sanala holds fire on an untouched monster; risk is judged on Torlis's HP
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 48, hp: 900, max_hp: 900, mp: 500, max_mp: 1000, x: 0, y: 0, armor: 10, resistance: 10, rip: false, attack: 600, frequency: 1 });
	vm.runInContext("state.partners = {}; live_cache.clear()", ctx);
	hb("Torlis", { ...tor, x: 40, y: 0, v: V, armor: 400, resistance: 300, max_hp: 6000, hp: 6000 });
	ctx.G.monsters.brute = { xp: 900, hp: 4000, attack: 220, respawn: 10, range: 20, speed: 10, frequency: 1, aggro: 0 };
	const with_tank = vm.runInContext("!!fight_profile('brute')", ctx);
	vm.runInContext("CFG.party.tank_first = false", ctx);
	const without = vm.runInContext("!!fight_profile('brute')", ctx);
	vm.runInContext("CFG.party.tank_first = true", ctx);
	assert(with_tank && !without, `a monster too strong for Sanala is fine with Torlis tanking (${with_tank}, ${without})`);
	ctx.G.monsters.brute.aggro = 1;
	assert(!vm.runInContext("!!fight_profile('brute')", ctx), "...but not an aggressive one (it may go for anyone)");
	const tg = { id: "b1", type: "monster", mtype: "brute", visible: true, hp: 4000, max_hp: 4000, x: 100, y: 0, target: null };
	ctx.parent.entities.b1 = tg;
	const cms = []; ctx.send_cm = (to, m) => (cms.push([to.join(), m.k]), Promise.resolve());
	assert(vm.runInContext("hold_for_tank(parent.entities.b1)", ctx), "holds fire on an untouched monster while Torlis is near");
	vm.runInContext("tank_hold.at -= CFG.party.tank_hold_ms + 1", ctx);
	assert(!vm.runInContext("hold_for_tank(parent.entities.b1)", ctx), "gives up holding after tank_hold_ms");
	tg.target = "Torlis";
	assert(!vm.runInContext("hold_for_tank(parent.entities.b1)", ctx), "fires once the tank has it");
	delete ctx.parent.entities.b1;
	handlers.cm({ name: "Torlis", message: { k: "tgt", id: "zz" } });
	assert(vm.runInContext("state.partners.Torlis.target", ctx) === "zz", "a tgt message updates that member's target at once");

	// 53) class skills: burst at full MP on a big target; priest absorbs for a hurt non-tank; paladin mana shield
	ctx.G.skills.burst = { ratio: 0.555 }; ctx.G.skills.absorb = { range: 240, mp: 200 }; ctx.G.skills.mshield = { mp: 0 };
	used.length = 0;
	character.mp = 1000; character.items[0] = { name: "mpot1", q: 100 };
	vm.runInContext("class_skills({ hp: 5000, s: {} })", ctx);
	assert(used.some(([s]) => s === "burst"), `mage bursts at full MP (${JSON.stringify(used)})`);
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", hp: 2500, max_hp: 2500, mp: 2000, max_mp: 2000 });
	ctx.parent.entities.Sanala = { id: "Sanala", name: "Sanala", type: "character", ctype: "mage", visible: true, hp: 300, max_hp: 900, x: 30, y: 0 };
	ctx.parent.entities.m53 = { id: "m53", type: "monster", mtype: "goo", visible: true, target: "Sanala", hp: 10, max_hp: 10, x: 40, y: 0 };
	used.length = 0; ctx.heal = () => Promise.resolve();
	vm.runInContext("CFG.party.heal_at = 0.2; class_skills({ hp: 10, s: { cursed: true } }); CFG.party.heal_at = 0.75", ctx);
	assert(used.some(([s, tgt]) => s === "absorb" && tgt === "Sanala"), `priest absorbs the monsters on Sanala (${JSON.stringify(used)})`);
	delete ctx.parent.entities.Sanala; delete ctx.parent.entities.m53;
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", hp: 300, max_hp: 1000, mp: 800, max_mp: 1000, s: {} });
	used.length = 0;
	vm.runInContext("class_skills({ hp: 10, s: {} })", ctx);
	assert(used.some(([s]) => s === "mshield"), `paladin raises mana shield at low HP (${JSON.stringify(used)})`);
	character.s = {}; character.items = Array(42).fill(null);

	// 54) merchant: picks the neediest fighter, hands potions, keeps its own; fighters hand loot and top up its gold
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 5, hp: 500, max_hp: 500, mp: 100, max_mp: 100, x: 0, y: 0, map: "main", gold: 50000, rip: false, esize: 30 });
	vm.runInContext("state.partners = {}", ctx);
	hb("Torlis", { ...tor, x: 40, y: 0, esize: 20, pots: { hp: 150, mp: 150 } });
	hb("Sanala", { ...san, x: 40, y: 0, esize: 5, pots: { hp: 150, mp: 150 } });
	hb("Aspernari", { ...asp, x: 40, y: 0, esize: 30, pots: { hp: 10, mp: 190 } });
	assert(vm.runInContext("is_merchant() && !in_party_cfg() && merchant_job().name", ctx) === "Sanala", "merchant serves the fighter with the fullest bags first");
	character.items = Array(42).fill(null); character.items[0] = { name: "hpot1", q: 100 }; character.items[1] = { name: "mpot1", q: 100 };
	const gave = []; ctx.send_item = (to, k, q) => (gave.push([to, character.items[k].name, q]), Promise.resolve());
	await vm.runInContext("give_pots(state.partners.Aspernari)", ctx);
	assert(JSON.stringify(gave) === '[["Aspernari","hpot1",80]]', `hands potions, keeping self_pots (${JSON.stringify(gave)})`);
	// fighter side
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", gold: 10e6, x: 0, y: 0 });
	character.items = Array(42).fill(null); character.items[5] = { name: "gslime", q: 3 };
	vm.runInContext("state.needs = new Map(); state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 50, y: 0, esize: 30, gold: 100 }; merchant_gold_at = 0", ctx);
	hb("Torlis", { ...tor, x: 40, y: 0 }); hb("Sanala", { ...san, x: 40, y: 0 });
	const golds = []; ctx.send_gold = (to, g) => (golds.push([to, g]), Promise.resolve());
	gave.length = 0;
	await vm.runInContext("merchant_handoff()", ctx);
	assert(JSON.stringify(golds) === '[["DoWhatNow",999900]]' && gave.length === 1 && gave[0][1] === "gslime", `richest tops up the merchant and hands loot (${JSON.stringify(golds)} ${JSON.stringify(gave)})`);
	assert(vm.runInContext("town_due().min_free", ctx) === 3, "fighters' own town threshold drops while the merchant is online");
	vm.runInContext("state.merchant = null", ctx);
	const rep_ok = (() => { try { vm.runInContext("report()", ctx); return true; } catch (e) { console.error(e); return false; } })();
	assert(rep_ok, "report() runs with every new section");
	character.items = Array(42).fill(null); character.slots = {};
	// 55) follower with nothing to hit takes its own monster of the leader's pack near the leader
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", x: 0, y: 0, map: "main", rip: false, hp: 2500, max_hp: 2500, attack: 180, range: 200 });
	vm.runInContext("state.partners = {}; state.merchant = null; state.errand = null; state.fsafe_at = 0", ctx);
	hb("Sanala", { ...san, level: 1, x: 40, y: 0, target: null, pack: { mtype: "goo", map: "main", boundary: [0, 0, 400, 400] } });
	hb("Torlis", { ...tor, x: 40, y: 0 });
	ctx.parent.entities.g55 = { id: "g55", type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, xp: 10, x: 120, y: 0, target: null };
	const atk55 = []; ctx.attack = (e) => (atk55.push(e.id), Promise.resolve());
	ctx.can_attack = () => true; ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	vm.runInContext("inflight.attack = false; follower_tick()", ctx);
	assert(atk55.includes("g55"), `idle follower attacks a goo near the leader on its own (${atk55})`);
	ctx.parent.entities.g55.x = 900; atk55.length = 0;
	vm.runInContext("inflight.attack = false; change_target(null); follower_tick()", ctx);
	assert(!atk55.includes("g55"), "...but not one beyond wait_radius of the leader");
	delete ctx.parent.entities.g55; ctx.distance = dist_save;
	// 56) transfers between our characters don't count as income/spending
	ctx.send_cm = () => Promise.resolve();
	vm.runInContext("stats.adj = 0", ctx);
	await vm.runInContext("send_own_gold('Torlis', 5000)", ctx);
	handlers.cm({ name: "Sanala", message: { k: "gold", g: 2000 } });
	assert(vm.runInContext("stats.adj", ctx) === 3000, "sent +5000 / received −2000 tracked as transfers");
	// 57) merchant donates gold above keep for XP, capped per day, stops at to_level
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 5, gold: 1_300_000, map: "main", rip: false });
	const emits = []; ctx.parent.socket.emit = (ev, d) => emits.push([ev, d && d.gold]);
	vm.runInContext("state.donated = null; donate_at = 0; merchant_donate()", ctx);
	assert(JSON.stringify(emits) === '[["donate",1000000]]', `donates up to chunk, keeping 300k (${JSON.stringify(emits)})`);
	character.gold = 5e6; emits.length = 0;
	vm.runInContext("donate_at = 0; state.donated.g = 2_500_000; merchant_donate()", ctx);
	assert(JSON.stringify(emits) === '[["donate",500000]]', `respects the daily cap (${JSON.stringify(emits)})`);
	character.level = 40; emits.length = 0;
	vm.runInContext("donate_at = 0; state.donated = null; merchant_donate()", ctx);
	assert(!emits.length, "no donations at to_level");
	ctx.parent.socket.emit = () => {};
	// 58) level-gated skills: purify, dark blessing, cburst (only monsters in our fight), massproduction
	ctx.G.skills.purify = { mp: 360 }; ctx.G.skills.darkblessing = { range: 600, mp: 900 }; ctx.G.skills.cburst = { ratio: 0.5, mp: 80 };
	ctx.G.skills.massproduction = { mp: 20 };
	ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", hp: 1000, max_hp: 1000, mp: 900, max_mp: 1000, s: {}, x: 0, y: 0, map: "main", rip: false });
	used.length = 0;
	vm.runInContext("inflight.purify = false; class_skills({ hp: 3000, s: {} })", ctx);
	assert(used.some(([s]) => s === "purify"), `paladin purifies a big target (${JSON.stringify(used)})`);
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", hp: 2500, max_hp: 2500, mp: 3000, max_mp: 3000, attack: 180, s: {} });
	vm.runInContext("state.partners = {}", ctx); hb("Torlis", { ...tor, x: 40, y: 0 });
	used.length = 0;
	vm.runInContext("class_skills({ hp: 5000, s: { cursed: true } })", ctx);
	assert(used.some(([s]) => s === "darkblessing"), `priest casts dark blessing with a member near (${JSON.stringify(used)})`);
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", hp: 900, max_hp: 900, mp: 2000, max_mp: 2000, range: 200, rpiercing: 0, s: {}, x: 0, y: 0 });
	vm.runInContext("party_names = () => new Set(['Sanala', 'Torlis', 'Aspernari'])", ctx);
	for (const [i, x] of [[1, 50], [2, 60], [3, 70]]) ctx.parent.entities["c" + i] = { id: "c" + i, type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, x, y: 0, target: "Torlis", resistance: 0 };
	ctx.parent.entities.far = { id: "far", type: "monster", mtype: "bee", visible: true, hp: 100, max_hp: 100, x: 60, y: 0, target: null, resistance: 0 };
	const cb = []; ctx.use_skill = (s, tg) => (cb.push([s, tg]), Promise.resolve());
	vm.runInContext("inflight.cburst = false; cburst()", ctx);
	assert(cb.length === 1 && cb[0][0] === "cburst" && cb[0][1].length === 3 && cb[0][1].every(([id, mp]) => id !== "far" && mp >= 200),
		`cburst hits the 3 monsters on the party with killing MP, not the stray bee (${JSON.stringify(cb)})`);
	for (const id of ["c1", "c2", "c3", "far"]) delete ctx.parent.entities[id];
	ctx.use_skill = (s, tg) => (used.push([s, tg && tg.name]), Promise.resolve());
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 30, mp: 100, max_mp: 100, s: {} });
	used.length = 0;
	ctx.use_skill = (s) => { used.push([s]); character.s.massproduction = { ms: 10000 }; return Promise.resolve(); };
	await vm.runInContext("mass_production()", ctx);
	assert(used.length === 1 && used[0][0] === "massproduction", "merchant casts massproduction before an upgrade/compound");
	character.s = {};

	// 59) secondhands: the merchant buys a fighter's upgrade and a compound set's missing copy, nothing else
	ctx.G.maps.main.ref = { secondhands: { x: 100, y: -50 } };
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 30, gold: 3e6, x: 100, y: -40, map: "main", esize: 30, rip: false });
	character.items = Array(42).fill(null); character.items[0] = { name: "ringx", level: 0 }; character.items[1] = { name: "ringx", level: 0 };
	character.slots = {};
	vm.runInContext("state.partners = {}; state.bank_gear = []; state.needs = new Map(); cmp_cache = null", ctx);
	hb("Torlis", { ...tor, x: 40, y: 0, v: V, esize: 10, gear: { w: { helmet: 3, ring1: 1e9, ring2: 1e9 }, dh: false, off: false } });
	ctx.parent.secondhands = [{ name: "helm3", level: 0, rid: "a" }, { name: "ringx", level: 0, rid: "b" }, { name: "beewings", q: 5, rid: "c" }];
	const sb = [];
	ctx.parent.socket.emit = (ev, d) => { if (ev === "sbuy") { sb.push(d.rid); character.esize--; } };
	await vm.runInContext("task_secondhands()", ctx);
	assert(JSON.stringify(sb) === '["a","b"]', `bought Torlis's helmet upgrade and the 3rd ringx, not the bee wings (${JSON.stringify(sb)})`);
	ctx.parent.socket.emit = () => {}; character.items = Array(42).fill(null); ctx.distance = dist_save;
	// 60) world bosses: snowman joined (beats the hunt), franky not; boss pack; tokens
	ctx.G.monsters.snowman = { name: "Snowman", hp: 1200, xp: 12000, attack: 80, damage_type: "physical", frequency: 1, range: 20, speed: 8, aggro: 0, special: true, cooperative: true, "1hp": true };
	ctx.G.monsters.franky = { name: "Franky", hp: 120000000, xp: 200000000, attack: 2910, damage_type: "magical", frequency: 1.6, range: 948, speed: 48, aggro: 1, special: true, cooperative: true };
	ctx.G.maps.winterland = { monsters: [] };
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 49, hp: 3000, max_hp: 3000, armor: 300, resistance: 200, attack: 300, frequency: 1, x: 0, y: 0, map: "main", rip: false, s: {} });
	character.s.monsterhunt = { id: "goo", c: 5 };
	vm.runInContext("state.partners = {}; state.merchant = null; state.directive = null; state.goals_cache = null; state.pack = null", ctx);
	ctx.parent.S = { snowman: { live: true, map: "winterland", x: 830, y: -430, hp: 1100, max_hp: 1200 }, franky: { live: true, map: "level2w", x: 0, y: 0, hp: 1e8, max_hp: 1.2e8 } };
	assert(vm.runInContext("boss_safe('snowman') && !boss_safe('franky')", ctx), "snowman is survivable, franky isn't");
	vm.runInContext("refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.boss && state.directive.monster === 'snowman' && state.directive.map === 'winterland'", ctx), `boss beats the monster hunt (${vm.runInContext("JSON.stringify(state.directive)", ctx)})`);
	vm.runInContext("pick_pack()", ctx);
	assert(vm.runInContext("state.pack.boss && state.pack.mtype === 'snowman'", ctx), "leader switches to the boss pack");
	ctx.parent.S = {};
	vm.runInContext("state.directive = null; refresh_directive(); pick_pack()", ctx);
	assert(!vm.runInContext("state.pack && state.pack.boss", ctx), "boss gone → back to normal packs");
	delete character.s.monsterhunt;
	// tokens: best points per token for a member, not owned yet, affordable
	ctx.G.tokens = { monstertoken: { mphat: 7, mparmor: 12, armorbox: 5 } };
	ctx.G.items.mphat = { type: "helmet", armor: 40, class: ["paladin"] }; ctx.G.items.mparmor = { type: "chest", armor: 45, class: ["paladin"] };
	ctx.G.items.armorbox = { type: "box" }; ctx.G.items.monstertoken = { type: "token", s: true };
	character.slots = { helmet: { name: "helm1", level: 0 } }; character.items = Array(42).fill(null); character.items[0] = { name: "monstertoken", q: 10 };
	vm.runInContext("state.bank_gear = []; state.guide_equip = {}", ctx);
	const tp = vm.runInContext("JSON.stringify(token_pick())", ctx);
	assert(/"name":"mphat"/.test(tp), `tokens buy the best affordable upgrade per token (${tp})`);
	character.items[1] = { name: "mphat", level: 0 };
	assert(!/mphat/.test(vm.runInContext("JSON.stringify(token_pick())", ctx)), "never buys a piece already owned");
	character.items = Array(42).fill(null); character.slots = {};
	// 61) history: events, ring cap, persistence, post-mortem, history()/deaths() output, time buckets
	const store61 = {};
	ctx.set = (k, v) => ((store61[k] = JSON.stringify(v)), true); ctx.get = (k) => (k in store61 ? JSON.parse(store61[k]) : null);
	vm.runInContext("hist.ev = []; hist.buckets = {}; const cap_save = CFG.history_max; CFG.history_max = 5; for (let i = 0; i < 9; i++) log_ev('pack', { i }); globalThis.__cap = hist.ev.map((e) => e.i).join(); CFG.history_max = cap_save", ctx);
	assert(vm.runInContext("__cap", ctx) === "4,5,6,7,8", "ring keeps only the newest history_max events");
	vm.runInContext("save_hist()", ctx);
	assert(JSON.parse(store61[vm.runInContext("LOG_KEY", ctx)]).ev.length === 5, "history persisted under its own key");
	// a death with recent hits from a croc
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", hp: 0, max_hp: 900, map: "main", x: 5, y: 5, rip: true });
	ctx.G.monsters.croc = { xp: 700, hp: 1200, attack: 60, frequency: 1, range: 20, speed: 10, respawn: 10 };
	vm.runInContext("hist.ev = []; pmring.ring = [{ t: Date.now() - 2000, hp: 400, mp: 100, target: 'croc:600', attackers: [{ mtype: 'croc', hp: 600 }] }]; pmring.hits = []", ctx);
	ctx.parent.entities.k1 = { id: "k1", type: "monster", mtype: "croc" };
	handlers.hit({ actor: "k1", damage: 250 }); handlers.hit({ actor: "k1", damage: 150 });
	vm.runInContext("state.dead_handled = false; state.pack = { mtype: 'croc', map: 'main', boundary: [0,0,10,10] }; on_death()", ctx);
	const de = vm.runInContext("hist.ev.find((e) => e.type === 'death')", ctx);
	assert(de && de.killer === "croc" && Math.round(de.dmg10.croc) === 400 && de.predicted !== undefined && de.hp.length === 1, `post-mortem names the killer and its damage (${JSON.stringify(de && { k: de.killer, d: de.dmg10, p: de.predicted })})`);
	delete ctx.parent.entities.k1;
	character.rip = false; character.hp = 900;
	vm.runInContext("log_ev('town', { due: 'sell+bank', did: 2, secs: 40 }); log_ev('upgrade', { item: 'nhelm', from: 3, ok: true }); log_ev('rate', { pack: 'croc@main', xp_s: 120 }); bucket().xp += 5000; bucket().time.fight = 50", ctx);
	const h61 = vm.runInContext("history(6, 'solo')", ctx);
	assert(/time: fight/.test(h61) && /DEATH/.test(h61) && /croc 400/.test(h61) && /town trips: 1 \(sell 1, bank 1/.test(h61) && /upgrades: 1 ok/.test(h61) && /croc@main 120/.test(h61), `history() summarises every section:\n${h61}`);
	const d61 = vm.runInContext("deaths(3)", ctx);
	assert(/main damage: croc/.test(d61) && /hp, 1\/s: 400/.test(d61), "deaths() prints the full post-mortem");
	assert(vm.runInContext("last_hour().dead", ctx) === 1, "last_hour() counts the death");
	vm.runInContext("state.pack = null; hist.ev = []", ctx);
	// 62) calibration: easy fights relax safety (max x1.5), a flee/death tighten it, incidents fade, few fights → global
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", hp: 900, max_hp: 900, attack: 100, frequency: 1, armor: 0, resistance: 0, rip: false, map: "main", x: 0, y: 0 });
	vm.runInContext("state.partners = {}; state.calib = {}; state.calib_all = { ratio: 1, n: 0 }; state.danger = {}; state.danger_at = {}; cal.cur = {}; cal.tgt = null", ctx);
	const pred62 = vm.runInContext("Math.round(fight_risk(fight_math(G.monsters.croc)))", ctx);
	for (let i = 0; i < 25; i++) vm.runInContext(`cal.cur.croc = ${pred62 * 0.2}; calib_record('croc')`, ctx);
	assert(Math.abs(vm.runInContext("calib_factor('croc')", ctx) - 1.5) < 1e-9, `fights at 20% of predicted damage relax croc to x1.5 (${vm.runInContext("calib_factor('croc')", ctx)})`);
	ctx.G.monsters.newmob = { xp: 10, hp: 100, attack: 5, frequency: 1, range: 20, speed: 10, respawn: 5 };
	const g62 = vm.runInContext("calib_factor('newmob')", ctx);
	assert(g62 > 1 && g62 <= 1.2, `a monster with no fights uses the all-monster ratio, capped at 1.2 (${g62})`);
	vm.runInContext("incident('croc', 0.8)", ctx);
	assert(Math.abs(vm.runInContext("danger_of('croc')", ctx) - 1.2) < 1e-9, "a flee multiplies the safety by 0.8");
	vm.runInContext("incident('croc', 0.6)", ctx);
	assert(Math.abs(vm.runInContext("state.danger.croc", ctx) - 0.48) < 1e-9, "a death on top multiplies by 0.6");
	vm.runInContext("state.danger_at.croc = Date.now() - 3 * 3600e3", ctx);
	const before62 = vm.runInContext("state.danger.croc", ctx);
	vm.runInContext("const k = 1 - Math.pow(0.9, 1 / 60); for (let i = 0; i < 60; i++) state.danger.croc += (1 - state.danger.croc) * k", ctx);
	const after62 = vm.runInContext("state.danger.croc", ctx);
	assert(after62 > before62 && Math.abs((1 - after62) / (1 - before62) - 0.9) < 1e-6, `incidents fade 10% per hour toward 1 (${before62.toFixed(3)} → ${after62.toFixed(3)})`);
	// hits feed the current fight; switching targets closes it
	vm.runInContext("cal.cur = {}; state.calib = {}", ctx);
	ctx.parent.entities.k62 = { id: "k62", type: "monster", mtype: "croc", visible: true, hp: 100 };
	handlers.hit({ actor: "k62", damage: 77 });
	ctx.get_targeted_monster = () => ctx.parent.entities.k62;
	vm.runInContext("calib_tick()", ctx);
	delete ctx.parent.entities.k62; ctx.get_targeted_monster = () => null;
	vm.runInContext("calib_tick()", ctx);
	assert(vm.runInContext("state.calib.croc && state.calib.croc.n === 1 && Math.round(state.calib.croc.act) === 77", ctx), "a fight's hits are recorded when the target dies");
	assert(/calibration x/.test(vm.runInContext("why_not('croc'); calib_text('croc')", ctx)), "why_not/report show the calibration");
	vm.runInContext("state.calib = {}; state.calib_all = { ratio: 1, n: 0 }; state.danger = {}; state.danger_at = {}", ctx);
	// 63) stand: buys a stand, opens it, lists the most valuable spare at 3x, cuts stale prices to the floor, notices sales
	ctx.G.items.stand0 = { type: "stand", stand: "stand0", g: 40000 };
	ctx.G.items.goldring = { type: "ring", g: 200000 }; ctx.G.items.cheapthing = { type: "material", g: 10 };
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 20, gold: 2e6, map: "main", x: 0, y: 0, rip: false, moving: false, esize: 30, stand: false });
	character.items = Array(42).fill(null); character.slots = {};
	character.items[3] = { name: "goldring", level: 0 }; character.items[4] = { name: "cheapthing", q: 5 };
	vm.runInContext("state.stand = {}; state.partners = {}; state.needs = new Map(); state.gear_skip = {}; stand_cache = null; cmp_cache = null; state.errand = null", ctx);
	assert(vm.runInContext("bag_class(character.items[3])", ctx) === "keep" && vm.runInContext("bag_class(character.items[4])", ctx) !== "keep", "valuable spare held for the stand, cheap junk isn't");
	const buys63 = []; ctx.buy = (n, q) => { buys63.push(n); character.items[0] = { name: n }; return Promise.resolve({ success: true }); };
	ctx.find_npc = () => ({ map: "main", x: 0, y: 0 }); ctx.G.npcs.standmerchant = { items: ["stand0"] };
	await vm.runInContext("stand_tick()", ctx);
	assert(buys63[0] === "stand0", `buys a stand when it has none (${buys63})`);
	const opens = []; ctx.open_stand = (k) => { opens.push(k); character.stand = true; return Promise.resolve(); };
	await vm.runInContext("stand_tick()", ctx);
	assert(opens[0] === 0 && character.stand, "opens the stand");
	const trades = []; ctx.trade = (k, slot, price, q) => { trades.push([character.items[k].name, slot, price]); character.slots[slot] = { ...character.items[k], price }; character.items[k] = null; return Promise.resolve(); };
	await vm.runInContext("stand_tick()", ctx);
	assert(JSON.stringify(trades) === '[["goldring","trade1",360000]]', `lists the ring at 3x its value (${JSON.stringify(trades)})`);
	// stale: cut 10%, never below 1.5x
	ctx.unequip = (slot) => { const k = character.items.findIndex((i) => !i); character.items[k] = character.slots[slot]; delete character.slots[slot]; return Promise.resolve(); };
	vm.runInContext("state.stand.trade1.at = state.stand.trade1.cut_at = Date.now() - 13 * 3600e3", ctx); trades.length = 0;
	await vm.runInContext("stand_tick()", ctx);
	assert(trades.length === 1 && trades[0][2] === 324000, `stale listing re-listed 10% lower (${JSON.stringify(trades)})`);
	vm.runInContext("state.stand.trade1.price = 185000; state.stand.trade1.cut_at = Date.now() - 13 * 3600e3", ctx); trades.length = 0;
	await vm.runInContext("stand_tick()", ctx);
	assert(trades.length === 1 && trades[0][2] === 180000, `never below 1.5x value (${JSON.stringify(trades)})`);
	// sale: slot empties while open
	delete character.slots.trade1;
	await vm.runInContext("stand_tick()", ctx);
	assert(vm.runInContext("!state.stand.trade1 && hist.ev.some((e) => e.type === 'sold' && e.item === 'goldring+0')", ctx), "an emptied slot is logged as a sale");
	// closes before walking
	const closes = []; ctx.close_stand = () => { closes.push(1); character.stand = false; return Promise.resolve(); };
	await vm.runInContext("stand_close()", ctx);
	assert(closes.length === 1 && !character.stand, "stand closed before a trip");
	character.items = Array(42).fill(null); character.slots = {}; vm.runInContext("state.stand = {}", ctx);
	// 64) melee stays engaged: no drift back to the leader while on a target near it; walks break off for a fight
	ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", range: 25, x: 160, y: 0, map: "main", rip: false, moving: false, hp: 3000, max_hp: 3000, s: {} });
	vm.runInContext("state.partners = {}; state.merchant = null; state.errand = null; smart_depth = 0; last_move = 0", ctx);
	hb("Sanala", { ...san, level: 1, x: 0, y: 0, target: "m64" }); hb("Aspernari", { ...asp, x: 0, y: 30 });
	ctx.parent.entities.m64 = { id: "m64", type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, x: 175, y: 0, target: "Sanala" };
	const mv64 = []; ctx.move = (x, y) => mv64.push([Math.round(x), Math.round(y)]);
	const at64 = []; ctx.attack = (e) => (at64.push(e.id), Promise.resolve()); ctx.can_attack = () => true;
	vm.runInContext("inflight.attack = false; follower_tick()", ctx);
	assert(!mv64.length && at64.includes("m64"), `in reach of the leader's target (attacking the leader): stays and attacks (${JSON.stringify(mv64)} ${at64})`);
	// target far from the leader: not engaged, drifts back
	ctx.parent.entities.m64.x = 900; mv64.length = 0;
	vm.runInContext("last_move = 0; follower_tick()", ctx);
	assert(mv64.length && mv64[0][0] < 160, `target beyond the leash: drifts back to the leader (${JSON.stringify(mv64)})`);
	// walking (smart_move) with a target near: the walk is stopped so approach() can run
	ctx.parent.entities.m64.x = 260;
	const stops64 = []; ctx.stop = (w) => stops64.push(w);
	vm.runInContext("smart_depth = 1; state.pack = { mtype: 'goo', map: 'main', boundary: [0,0,400,400] }", ctx);
	vm.runInContext("fight(parent.entities.m64, true)", ctx);
	assert(stops64.includes("smart"), `a walk is broken off for a fight 100px away (${stops64})`);
	stops64.length = 0;
	vm.runInContext("state.errand = 'town'; state.errand_at = Date.now(); fight(parent.entities.m64, true); state.errand = null", ctx);
	assert(!stops64.length, "never during an errand (town)");
	vm.runInContext("smart_depth = 0; state.pack = null", ctx);
	delete ctx.parent.entities.m64; ctx.distance = dist_save; ctx.stop = (a) => calls.push("stop:" + a);
	// 65) assist the tank: the tank picks and announces; the mage follower and a non-tank leader hit its target
	ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	ctx.G.monsters.goo.aggro = 0;
	const cms65 = []; ctx.send_cm = (to, m) => (cms65.push([to.join(), m.k, m.id]), Promise.resolve());
	// Torlis (tank) following Sanala: picks the goo near her, broadcasts it
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", range: 25, x: 0, y: 0, map: "main", rip: false, moving: false, hp: 3000, max_hp: 3000, attack: 300, s: {} });
	vm.runInContext("state.partners = {}; state.errand = null; smart_depth = 0; last_move = 0; announced = null; state.fsafe_at = 0", ctx);
	hb("Sanala", { ...san, level: 1, x: 20, y: 0, target: "far65", v: V, pack: { mtype: "goo", map: "main", boundary: [0, 0, 400, 400] } });
	hb("Aspernari", { ...asp, x: 20, y: 30, v: V });
	ctx.parent.entities.g65 = { id: "g65", type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, xp: 10, x: 120, y: 0, target: null };
	ctx.parent.entities.far65 = { id: "far65", type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, xp: 10, x: 280, y: 0, target: null };
	const at65 = []; ctx.attack = (e) => (at65.push(e.id), Promise.resolve()); ctx.can_attack = () => true;
	vm.runInContext("inflight.attack = false; follower_tick()", ctx);
	assert(cms65.some(([to, k, id]) => k === "tgt" && id === "g65" && /Sanala/.test(to) && /Aspernari/.test(to)), `the tank picks its own target and announces it to everyone (${JSON.stringify(cms65)})`);
	// Aspernari (follower, not the tank) assists Torlis instead of hitting the leader's target
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", range: 200, x: 20, y: 30, hp: 2500, max_hp: 2500 });
	vm.runInContext("state.partners = {}", ctx);
	hb("Sanala", { ...san, level: 1, x: 20, y: 0, target: "far65", v: V, pack: { mtype: "goo", map: "main", boundary: [0, 0, 400, 400] } });
	hb("Torlis", { ...tor, x: 100, y: 0, v: V, armor: 400, resistance: 300, max_hp: 6000, hp: 6000 });
	handlers.cm({ name: "Torlis", message: { k: "tgt", id: "g65" } });
	ctx.parent.entities.g65.target = "Torlis"; at65.length = 0;
	vm.runInContext("inflight.attack = false; CFG.party.heal_at = 0; follower_tick(); CFG.party.heal_at = 0.75", ctx);
	assert(at65.includes("g65") && !at65.includes("far65"), `a follower hits the tank's target, not the leader's (${at65})`);
	// tank away (errand): back to the leader's target
	hb("Torlis", { ...tor, x: 100, y: 0, v: V, armor: 400, resistance: 300, max_hp: 6000, hp: 6000, errand: "town" });
	ctx.parent.entities.far65.target = "Sanala"; at65.length = 0;
	vm.runInContext("inflight.attack = false; CFG.party.heal_at = 0; follower_tick(); CFG.party.heal_at = 0.75", ctx);
	assert(at65.includes("far65"), `with the tank away, the leader's target is used (${at65})`);
	// non-tank party (no paladin near): caller_target is null
	vm.runInContext("delete state.partners.Torlis", ctx);
	assert(vm.runInContext("caller_target() === null && !i_am_tank()", ctx), "without a tank nothing changes");
	for (const id of ["g65", "far65"]) delete ctx.parent.entities[id];
	ctx.distance = dist_save; ctx.send_cm = () => Promise.resolve();
	// 66) watchdog: frozen leader, no-progress leader (3rd time → town), lost follower; never during errands/parked
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 1, x: 100, y: 100, map: "main", rip: false, hp: 900, max_hp: 900 });
	vm.runInContext("state.partners = {}; state.errand = null; state.parked = false; state.recovering = false; smart_depth = 0; hist.ev = []; wd.acts = []; wd.lost_since = null", ctx);
	vm.runInContext("state.pack = { mtype: 'goo', map: 'main', boundary: [0,0,400,400] }; state.cooldown = {}", ctx);
	const seed = (mins, dx = 0) => vm.runInContext(`wd.pos = [{ t: Date.now() - ${mins} * 60000, map: 'main', x: ${100 + dx}, y: 100, xp: stats.xp }]`, ctx);
	const stop66 = []; ctx.stop = (w) => stop66.push(w);
	seed(4);
	vm.runInContext("watchdog()", ctx);
	assert(vm.runInContext("hist.ev.some((e) => e.type === 'stuck' && e.kind === 'frozen') && Object.keys(state.cooldown).length === 1", ctx) && stop66.includes("smart"), "frozen leader: walk stopped, pack cooled down, logged");
	// moving but no xp for 11 min → noprog; third time in an hour → town
	vm.runInContext("hist.ev = []; state.cooldown = {}", ctx);
	const town66 = []; ctx.use_skill = (s) => (town66.push(s), Promise.resolve());
	for (let i = 0; i < 3; i++) { seed(11, 300); vm.runInContext("watchdog()", ctx); }
	assert(vm.runInContext("hist.ev.filter((e) => e.kind === 'noprog').length", ctx) === 3 && town66.includes("use_town"), `no-progress acted 3x, the 3rd with a town teleport (${town66})`);
	// during an errand or parked: nothing
	vm.runInContext("hist.ev = []; wd.acts = []; state.errand = 'town'; state.errand_at = Date.now()", ctx); seed(30);
	vm.runInContext("watchdog(); state.errand = null; state.parked = true", ctx); seed(30);
	vm.runInContext("watchdog(); state.parked = false", ctx);
	assert(vm.runInContext("hist.ev.length", ctx) === 0, "no intervention during an errand or while parked");
	// lost follower: other map than the leader for > lost_min
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", map: "halloween", x: 0, y: 0 });
	hb("Sanala", { ...san, level: 1, map: "main", x: 0, y: 0 });
	town66.length = 0;
	vm.runInContext("wd.lost_since = Date.now() - 6 * 60000; watchdog()", ctx);
	assert(vm.runInContext("hist.ev.some((e) => e.kind === 'lost')", ctx) && vm.runInContext("state.errand", ctx) === "regroup", "lost follower regroups via town");
	vm.runInContext("state.errand = null; state.pack = null; wd.pos = []; wd.acts = []; hist.ev = []", ctx);
	ctx.stop = (a) => calls.push("stop:" + a);
	// 67) bank housekeeping: free-slot count, purge filter, purged items sold
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 20, gold: 2e6, map: "bank", x: 0, y: 0, rip: false, esize: 30 });
	character.items = Array(42).fill(null); character.slots = {};
	const fullpack = Array(42).fill(null).map((_, i) => (i < 40 ? { name: "cheapthing", q: 1 } : null));
	fullpack[0] = { name: "beewings", q: 50 }; fullpack[1] = { name: "gem0", q: 1 }; fullpack[2] = { name: "goldring", level: 0 };
	character.bank = { items0: fullpack };
	vm.runInContext("state.needs = new Map(); state.partners = {}; state.purge = {}; state.stand = {}; cmp_cache = null; stand_cache = null; recipe_inputs = null; G.craft = { wcap: { items: [[20, 'beewings']] } }; remember_bank()", ctx);
	assert(vm.runInContext("state.bank_free.free === 2 && state.bank_free.total === 42", ctx), "counts the bank's free slots");
	assert(!vm.runInContext("purge_ok({ name: 'beewings', q: 50 })", ctx) && !vm.runInContext("purge_ok({ name: 'gem0', q: 1 })", ctx) && vm.runInContext("purge_ok({ name: 'cheapthing', q: 1 })", ctx),
		"never purges recipe materials or exchangeables; junk is fair game");
	const got67 = []; ctx.bank_retrieve = (p, n) => { got67.push(n); const k = character.items.findIndex((i) => !i); character.items[k] = character.bank[p][n]; character.bank[p][n] = null; return Promise.resolve(); };
	ctx.bank_packs = { items0: ["bank", 0, 0] };
	const n67 = await vm.runInContext("bank_purge()", ctx);
	assert(n67 === 10 && !got67.includes(0) && !got67.includes(1), `pulls 10 low-value items, not quest/exchange ones (${got67})`);
	const k67 = character.items.findIndex((i) => i && i.name === "cheapthing");
	assert(vm.runInContext(`bag_class(character.items[${k67}])`, ctx) === "sell", "purged junk is classed sell");
	character.bank = undefined; character.items = Array(42).fill(null);
	vm.runInContext("state.purge = {}; state.bank_free = null; recipe_inputs = null", ctx);
	// 68) party report: report() asks everyone, replies are combined in order, stale ids ignored, stored copies fill gaps
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 50, map: "main", x: 0, y: 0, rip: false, hp: 900, max_hp: 900, s: {} });
	character.items = Array(42).fill(null); character.slots = {};
	vm.runInContext("state.partners = {}; state.merchant = null; gather = null; last_party_report = null; state.pack = null", ctx);
	const cm68 = []; ctx.send_cm = (to, m) => (cm68.push([to.join(), m.k, m]), Promise.resolve());
	let modal68 = ""; ctx.parent.show_modal = (h) => (modal68 = h);
	vm.runInContext("report()", ctx);
	const req = cm68.find(([, k]) => k === "rreq");
	assert(req && req[0] === "Aspernari,Torlis,DoWhatNow" && modal68 === "", `report() asks the other three and opens no window until the combined one (${req && req[0]})`);
	const id68 = req[2].id;
	// responder side: a request makes us reply with our lines; a 2nd within 5s doesn't
	cm68.length = 0;
	handlers.cm({ name: "Torlis", message: { k: "rreq", id: "x1", hours: 2 } });
	handlers.cm({ name: "Torlis", message: { k: "rreq", id: "x2", hours: 2 } });
	const reps = cm68.filter(([, k]) => k === "rrep");
	assert(reps.length === 1 && reps[0][0] === "Torlis" && reps[0][2].lines.some((l) => /^level \d+ .* at main .* per 4s/.test(l)) && !reps[0][2].lines.some((l) => /^gold: us/.test(l)) && reps[0][2].lines.some((l) => /— history Sanala/.test(l)),
		`replies once with report + history lines (${reps.length})`);
	// collector: stale id ignored; Aspernari + Torlis reply, DoWhatNow silent but has a stored copy
	handlers.cm({ name: "Torlis", message: { k: "rrep", id: "old", v: "15.9", lines: ["STALE"] } });
	handlers.cm({ name: "Torlis", message: { k: "rrep", id: id68, v: "15.9", lines: ["torlis line"] } });
	handlers.cm({ name: "Aspernari", message: { k: "rrep", id: id68, v: "15.9", lines: ["aspernari line"] } });
	ctx.get = (k) => (k === "farmer_report:DoWhatNow" ? { at: Date.now() - 600000, v: "15.9", lines: ["merchant stored line"] } : null);
	const out68 = vm.runInContext(`report_finish("${id68}")`, ctx);
	const iS = out68.indexOf("▌ Sanala"), iA = out68.indexOf("▌ Aspernari"), iT = out68.indexOf("▌ Torlis"), iD = out68.indexOf("▌ DoWhatNow");
	assert(/2\/3 replied/.test(out68) && iS < iA && iA < iT && iT < iD && /torlis line/.test(out68) && /aspernari line/.test(out68) && !/STALE/.test(out68) &&
		/stored copy, 10m old/.test(out68) && /merchant stored line/.test(out68), `combined in order, stale ignored, stored copy for the silent one:\n${out68}`);
	assert(vm.runInContext("party_report()", ctx) === out68, "party_report() re-opens the last one");
	// history(): asks everyone for history only; one "party history" window; doesn't replace the last party report
	cm68.length = 0; modal68 = "";
	vm.runInContext("history(2)", ctx);
	const hreq = cm68.find(([, k]) => k === "rreq");
	assert(hreq && hreq[2].kind === "history" && hreq[2].hours === 2 && hreq[0] === "Aspernari,Torlis,DoWhatNow", "history() asks the other three for their history");
	cm68.length = 0; vm.runInContext("report_reply_at.Aspernari = 0", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "rreq", id: "h1", hours: 2, kind: "history" } });
	const hrep = cm68.find(([, k]) => k === "rrep");
	assert(hrep && hrep[2].lines.some((l) => /— history Sanala/.test(l)) && !hrep[2].lines.some((l) => /^level \d+ .* per 4s/.test(l)), "a history request is answered with history lines only");
	handlers.cm({ name: "Torlis", message: { k: "rrep", id: hreq[2].id, v: "x", lines: ["torlis history"] } });
	const hout = vm.runInContext(`report_finish("${hreq[2].id}")`, ctx);
	assert(/party history \(2h\)/.test(hout) && /torlis history/.test(hout) && !/^roster:/m.test(hout) && /party history/.test(modal68) &&
		vm.runInContext("party_report()", ctx) === out68, `combined history window, no party header, last report kept:\n${hout}`);
	ctx.get = () => null; ctx.send_cm = () => Promise.resolve();
	// 69) v16.0: batch compound fetches; merchant sole compounder; guide row backoff; guide-only trips wait; keep reasons
	ctx.G.items.ringx = ctx.G.items.ringx || { type: "ring", compound: { attack: 1 }, attack: 2 };
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 42, gold: 2e6, map: "main", x: 0, y: 0, rip: false, esize: 30, s: {} });
	character.items = Array(42).fill(null); character.slots = {}; character.items[5] = { name: "ringx", level: 0 };
	vm.runInContext("state.partners = {}; state.merchant = null; state.needs = new Map(); state.gear_skip = {}; state.fetch_try = {}; state.stand = {}; cmp_cache = null; stand_cache = null; state.bank_gear = Array.from({ length: 40 }, () => ({ name: 'ringx', level: 0 }))", ctx);
	const cf = vm.runInContext("compound_fetches(compound_groups())", ctx);
	assert(cf.length === 17, `40 in the bank + 1 in bags → fetch 17 copies for 6 sets (${cf.length})`);
	vm.runInContext("for (const f of compound_fetches(compound_groups())) state.fetch_try[f.key] = Date.now() - 11 * 60000", ctx);
	assert(vm.runInContext("bag_plan().fetch.filter((f) => f.key && f.key.startsWith('cmp:')).length", ctx) === 17, "compound fetch keys retry after 10 min, not 2h");
	// a fighter while the merchant is online: no compound groups; its spare is bankable (handed to the merchant)
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", esize: 30 });
	character.slots = { ring1: { name: "ringx", level: 0 }, ring2: { name: "ringx", level: 0 } };
	character.items[6] = { name: "ringx", level: 0 }; character.items[7] = { name: "ringx", level: 0 };
	vm.runInContext("cmp_cache = null; state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 9999, y: 0, esize: 30, gold: 1e6 }", ctx);
	assert(vm.runInContext("compound_groups().length", ctx) === 0 && vm.runInContext("bag_class(character.items[6])", ctx) === "bank", "fighter leaves compounding to the online merchant");
	vm.runInContext("state.merchant = null; cmp_cache = null", ctx);
	assert(vm.runInContext("compound_groups().length", ctx) > 0, "merchant offline: fighter compounds as before");
	// guide row backoff
	const g69 = [];
	vm.runInContext("state.row_fails = {}; run_row = () => Promise.reject({ reason: 'input_missing' })", ctx);
	for (let i = 0; i < 3; i++) { vm.runInContext("delete state.gear_skip.r69", ctx); await vm.runInContext("guide_step({ id: 'r69', kind: 'buy' })", ctx); g69.push(Math.round((vm.runInContext("state.gear_skip.r69", ctx) - Date.now()) / 60000)); }
	assert(JSON.stringify(g69) === "[5,15,45]", `failing guide row pauses 5, 15, 45 min (${g69})`);
	vm.runInContext("run_row = () => Promise.resolve(); delete state.gear_skip.r69", ctx);
	await vm.runInContext("guide_step({ id: 'r69', kind: 'buy' })", ctx);
	assert(vm.runInContext("!state.row_fails.r69", ctx), "success resets the failure count");
	// keep reasons in the bags line
	character.items = Array(42).fill(null); character.items[0] = { name: "hpot1", q: 50 }; character.items[1] = { name: "computer" };
	const r69 = vm.runInContext("report_lines(false).find((l) => l.startsWith('bags:'))", ctx);
	assert(/keep 2 \(/.test(r69) && /supplies 1/.test(r69) && /keep-list 1/.test(r69), `bags line explains keep (${r69})`);
	character.items = Array(42).fill(null); character.slots = {};
	vm.runInContext("state.bank_gear = []; state.fetch_try = {}; cmp_cache = null", ctx);
	// 70) merchant online: a guide step alone doesn't send a fighter to town within guide_gap_ms of the last run
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", esize: 30, rip: false, s: { monsterhunt: { id: "goo", c: 5 } } });
	character.items = Array(42).fill(null); character.items[0] = { name: "hpot1", q: 300 }; character.items[1] = { name: "mpot1", q: 300 };
	vm.runInContext("state.guide = { rows: [{ id: 'g70', kind: 'buy', action: {} }] }; state.gear_skip = {}; state.needs = new Map(); state.fetch_try = {}; state.bank_gear = []; cmp_cache = null; state.upg = null; state.upg_pick_at = Date.now()", ctx);
	vm.runInContext("state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 9999, y: 0, esize: 30, gold: 1e6 }; state.last_town = Date.now() - 60000", ctx);
	assert(!vm.runInContext("town_due().guide", ctx), "guide alone waits while the merchant is online");
	vm.runInContext("state.last_town = Date.now() - 31 * 60000", ctx);
	assert(vm.runInContext("town_due().guide", ctx), "...but goes once guide_gap_ms has passed");
	vm.runInContext("state.merchant = null; state.last_town = Date.now() - 60000", ctx);
	assert(vm.runInContext("town_due().guide", ctx), "merchant offline: guide steps go as before");
	vm.runInContext("state.guide = null; delete character.s.monsterhunt", ctx); character.items = Array(42).fill(null);
	// 71) compact party report: one shared header (roster, leader, gold, hunts, last hour, merchant); sections without
	// the shared lines, done quests, idle features or "not automated" guide rows; a full solo report keeps them
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 50, gold: 3e6, map: "main", x: 0, y: 0, rip: false, hp: 900, max_hp: 900, s: { monsterhunt: { id: "armadillo", c: 43 } } });
	character.items = Array(42).fill(null); character.slots = {};
	vm.runInContext("state.partners = {}; state.pack = { mtype: 'goo', map: 'main', boundary: [0,0,400,400], directive: 'monster hunt 43 left' }; state.crafted = { wcap: 1 }", ctx);
	hb("Torlis", { ...tor, gold: 2.7e6, hunt: { id: "armadillo", c: 43 }, h1: { dead: 0, fled: 1, town: 2, xph: 0 } });
	hb("Aspernari", { ...asp, gold: 7.7e6, hunt: { id: "armadillo", c: 43 }, h1: { dead: 0, fled: 0, town: 3, xph: 0 } });
	vm.runInContext("state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 0, y: 0, esize: 9, gold: 1e6 }", ctx);
	const hdr = vm.runInContext("party_header_lines()", ctx).join("\n");
	assert(/^roster: Aspernari priest .*\| Sanala mage 50 .*\| Torlis paladin/m.test(hdr) && /^leader: /m.test(hdr) && /^gold: Aspernari 7\.7M \/ Sanala 3\.0M \/ Torlis 2\.7M \/ DoWhatNow 1\.0M/m.test(hdr) &&
		/^hunts: armadillo \(Aspernari 43, Sanala 43, Torlis 43\)/m.test(hdr) && /Torlis 0d\/1f\/2town/.test(hdr) && /^merchant DoWhatNow: in main, 9 free/m.test(hdr), `party header:\n${hdr}`);
	const cmp71 = vm.runInContext("report_lines(false, true)", ctx).join("\n"), full71 = vm.runInContext("report_lines(false)", ctx).join("\n");
	if (process.env.SHOW) console.log("HEADER\n" + hdr + "\nSECTION\n" + cmp71);
	assert(!/^gold: us/m.test(cmp71) && !/'s hunt:/.test(cmp71) && !/^quest wcap.*done/m.test(cmp71) && !/^tokens:/m.test(cmp71) && !/^— report/m.test(cmp71) && /^gear:/m.test(cmp71) && /^bags:/m.test(cmp71),
		`compact section drops shared/idle lines:\n${cmp71}`);
	assert(/^gold: us/m.test(full71) && /^hunt:/m.test(full71) && full71.split("\n").length > cmp71.split("\n").length, "the full report keeps everything");
	vm.runInContext("state.merchant = null; state.pack = null", ctx); delete character.s.monsterhunt;
	// 72) must-hold items: Tracktrix fetched from the bank, else bought with tokens before any gear; one fighter buys the
	// merchant's copy and hands only that over
	ctx.G.items.tracker = { type: "tracker", g: 12 };
	ctx.G.tokens = { monstertoken: { tracker: 4, mphat: 3 } };
	ctx.G.items.mphat = { type: "helmet", armor: 40, class: ["paladin"] };
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", esize: 30, rip: false, map: "main", x: 0, y: 0, s: {} });
	character.items = Array(42).fill(null); character.slots = { helmet: { name: "helm1", level: 0 } };
	vm.runInContext("state.partners = {}; state.merchant = null; state.bank_seen = { tracker: 1 }; state.fetch_try = {}; state.bank_gear = []; state.hold_for = {}; state.gear_skip = {}; state.guide_equip = {}", ctx);
	assert(vm.runInContext("bag_plan().fetch.some((f) => f.key === 'hold:tracker')", ctx) && vm.runInContext("town_due().bank", ctx), "missing tracker in the bank → fetched (bank due)");
	vm.runInContext("state.bank_seen = {}", ctx);
	character.items[0] = { name: "monstertoken", q: 5 };
	assert(vm.runInContext("token_pick().name", ctx) === "tracker", "missing tracker, 5 tokens → buy the tracker first");
	character.items[0].q = 3;
	assert(vm.runInContext("token_pick()", ctx) === null, "3 tokens: gear (3 tokens) can't eat the tracker's reserve");
	character.items[1] = { name: "tracker", q: 1 };
	assert(vm.runInContext("token_pick() && token_pick().name", ctx) === "mphat", "tracker held → tokens go to gear again");
	assert(vm.runInContext("bag_class(character.items[1])", ctx) === "keep", "the tracker is never banked or sold");
	// merchant lacks one: only the alphabetically first eligible fighter buys it (opt-in since v18.0)
	vm.runInContext("CFG.hold_buy_for_merchant = true", ctx);
	character.items[0].q = 6;
	vm.runInContext("state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 50, y: 0, esize: 20, gold: 1e6, need: ['tracker'] }", ctx);
	hb("Aspernari", { ...asp, tokens: 9, need: [] });
	assert(vm.runInContext("token_pick() && token_pick().name", ctx) === "mphat", "Aspernari (first alphabetically, eligible) buys the merchant's copy, not Torlis");
	hb("Aspernari", { ...asp, tokens: 1, need: [] });
	const tp72 = vm.runInContext("token_pick()", ctx);
	assert(tp72 && tp72.name === "tracker" && tp72.for === "DoWhatNow", `Aspernari can't afford it → Torlis buys it for the merchant (${JSON.stringify(tp72)})`);
	// hand-off: only the extra copy goes, and only to the merchant
	character.items[2] = { name: "tracker", q: 1 };
	vm.runInContext("state.hold_for = { tracker: { to: 'DoWhatNow', at: Date.now() } }; handoff_busy = false; merchant_gold_at = Date.now()", ctx);
	const sent72 = []; ctx.send_item = (to, k, q) => (sent72.push([to, character.items[k].name, q]), character.items[k] = null, Promise.resolve());
	await vm.runInContext("merchant_handoff()", ctx);
	assert(JSON.stringify(sent72) === '[["DoWhatNow","tracker",1]]' && vm.runInContext("held_any('tracker')", ctx) === 1 && vm.runInContext("!state.hold_for.tracker", ctx), `extra tracker handed to the merchant, ours kept (${JSON.stringify(sent72)})`);
	const r72 = vm.runInContext("report_lines(false).find((l) => l.startsWith('hold:'))", ctx);
	assert(/tracker ✓/.test(r72), `report: hold line (${r72})`);
	character.items = Array(42).fill(null); character.slots = {};
	vm.runInContext("state.merchant = null; state.hold_for = {}", ctx);
	// 73) events: join Goo Brawl, fight Brawl Goos there, leave when over; merchant never joins; unsafe event skipped
	ctx.G.monsters.bgoo = { name: "Brawl Goo", hp: 100000, xp: 100000, attack: 5, frequency: 0.4, range: 15, speed: 6, armor: 200, resistance: 200, cooperative: true, special: true };
	ctx.G.monsters.rgoo = { name: "Rainbow Goo", hp: 1e6, xp: 4.8e7, attack: 320, frequency: 1.2, range: 64, speed: 9, armor: 300, aggro: 0.1 };
	ctx.G.monsters.crabx = { name: "Huge Crab", hp: 4200, xp: 3600, attack: 99999, frequency: 1, range: 15, speed: 8, armor: 210, aggro: 0.5 };
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 50, hp: 3000, max_hp: 3000, attack: 300, frequency: 1, range: 25, map: "main", x: 0, y: 0, rip: false, s: {} });
	vm.runInContext("state.partners = {}; state.merchant = null; state.errand = null; state.recovering = false; smart_depth = 0; event_join_at = 0", ctx);
	const joins = []; ctx.join = (n) => (joins.push(n), Promise.resolve());
	ctx.parent.S = { goobrawl: { end: new Date(Date.now() + 5e5).toISOString() }, crabxx: { live: true, map: "main", x: -1000, y: 1700 } };
	assert(vm.runInContext("event_live()", ctx) === "goobrawl", "goo brawl is live and safe (crab event unsafe: skipped)");
	assert(vm.runInContext("event_tick()", ctx) && JSON.stringify(joins) === '["goobrawl"]', `joins goo brawl (${joins})`);
	character.map = "goobrawl";
	ctx.parent.entities.bg1 = { id: "bg1", type: "monster", mtype: "bgoo", visible: true, hp: 90000, max_hp: 100000, x: 40, y: 0, target: null };
	const at73 = []; ctx.attack = (e) => (at73.push(e.id), Promise.resolve()); ctx.can_attack = () => true;
	vm.runInContext("inflight.attack = false; event_tick()", ctx);
	assert(at73.includes("bg1"), `fights the Brawl Goo (cooperative, normally skipped) (${at73})`);
	delete ctx.parent.entities.bg1;
	ctx.parent.S = {};
	const tr73 = []; ctx.smart_move = (d) => (tr73.push(d), new Promise(() => {}));
	vm.runInContext("event_tick()", ctx);
	assert(tr73.length && tr73[0].map === "main", "event over → leaves Goo Island");
	vm.runInContext("smart_depth = 0", ctx); ctx.smart_move = () => new Promise(() => {});
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", map: "main" });
	ctx.parent.S = { goobrawl: { end: "x" } };
	assert(vm.runInContext("event_live()", ctx) === null, "the merchant never joins events");
	ctx.parent.S = {};
	// 74) selftest: lists functions/data/events/storage and pings the others; replies arrive as pongs
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", map: "main", rip: false });
	vm.runInContext("state.partners = {}; state.merchant = null", ctx);
	const pings = []; ctx.send_cm = (to, m) => (pings.push([to.join(), m.k, m.id]), Promise.resolve());
	ctx.set = (k, v) => ((ctx.__st = ctx.__st || {}), (ctx.__st[k] = JSON.stringify(v)), true); ctx.get = (k) => (ctx.__st && k in ctx.__st ? JSON.parse(ctx.__st[k]) : null);
	const st74 = vm.runInContext("selftest()", ctx);
	assert(/game functions:/.test(st74) && /storage write\/read/.test(st74) && /✓ storage/.test(st74) && pings.some(([to, k]) => k === "ping" && /Torlis/.test(to)), `selftest checks + pings (${st74.split("\n").slice(0, 3).join(" | ")})`);
	const pid = pings.find(([, k]) => k === "ping")[2];
	handlers.cm({ name: "Torlis", message: { k: "pong", id: pid, v: "16.6" } });
	let modal74 = ""; ctx.parent.show_modal = (h) => (modal74 = h);
	vm.runInContext(`selftest_finish([], ['Torlis', 'Aspernari'], "${pid}")`, ctx);
	assert(/✓ cm round trip Torlis/.test(modal74) && /✗ cm round trip Aspernari/.test(modal74), "pong recorded, silent member flagged");
	// a ping gets a pong
	pings.length = 0;
	handlers.cm({ name: "Aspernari", message: { k: "ping", id: "p1" } });
	assert(pings.some(([to, k, id]) => to === "Aspernari" && k === "pong" && id === "p1"), "answers pings");

	// 75) high upgrades: weapon slot may target +9 (scroll2), others stop at scroll0/1 levels; offering lifts odds
	ctx.G.items.scroll2 = { type: "uscroll", g: 1600000 };
	ctx.G.items.wbow = { type: "weapon", wtype: "bow", attack: 20, upgrade: { attack: 10 }, g: 5000, grades: [3, 6] };
	ctx.G.items.lhelm = { type: "helmet", armor: 5, upgrade: { armor: 6 }, g: 2000, grades: [3, 6] };
	ctx.G.classes.ranger = { damage_type: "physical", mainhand: { bow: {} } };
	const ig_save = ctx.item_grade; ctx.item_grade = (it) => ((it.level || 0) >= 6 ? 2 : (it.level || 0) >= 3 ? 1 : 0);
	assert(vm.runInContext("upgrade_target('wbow')", ctx) === 6 && vm.runInContext("upgrade_target('wbow', true)", ctx) === 9, "normal target stops before scroll2; high goes to +9");
	// offering lifts a too-low preview over the floor
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", gold: 5e6, esize: 30, map: "main" });
	character.items = Array(42).fill(null);
	character.items[0] = { name: "computer" }; character.items[1] = { name: "scroll2", q: 3 }; character.items[2] = { name: "wbow", level: 6 }; character.items[3] = { name: "offeringp", q: 1 };
	ctx.G.items.offeringp = { type: "offering", grade: 1, g: 480000 };
	ctx.G.npcs.weaponsmith = { items: ["wbow"] }; const fn75 = ctx.find_npc; ctx.find_npc = () => ({ map: "main", x: 0, y: 0 }); // NPC-sold: 55% floor applies
	const up75 = [];
	ctx.upgrade = (k, sk, off, preview) => { if (preview) return Promise.resolve({ chance: off != null ? 0.62 : 0.4 }); up75.push(off); return Promise.resolve({ success: true }); };
	await vm.runInContext("run_upgrade({ name: 'wbow' }, { request: { name: 'wbow', level: 7 } })", ctx);
	assert(JSON.stringify(up75) === "[3]", `40% preview < 55% floor → the Primling (62%) is used (${JSON.stringify(up75)})`);
	ctx.upgrade = (k, sk, off, preview) => Promise.resolve(preview ? { chance: 0.4 } : { success: true });
	character.items[3] = null; character.items[2] = { name: "wbow", level: 6 };
	let threw75 = null; await vm.runInContext("run_upgrade({ name: 'wbow' }, { request: { name: 'wbow', level: 7 } })", ctx).catch((e) => (threw75 = e));
	assert(threw75 && threw75.reason === "low_chance", "without an offering a 40% scroll2 step is refused");
	ctx.item_grade = ig_save; ctx.find_npc = fn75;
	// merchant funding: a project step beyond its gold → fund request in the heartbeat; the richest fighter near sends it
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", gold: 302000, map: "main", x: 0, y: 0, esize: 30 }); // 2k spare < the 6k first step
	character.items = Array(42).fill(null);
	vm.runInContext("state.upg = { name: 'wbow', to: 9, for: 'Torlis', slot: 'mainhand', gain: 50, cost: 9e6, high: true }; state.fund_need = 0; state.gear_skip = {}", ctx);
	await vm.runInContext("task_upgrade()", ctx);
	const fund75 = vm.runInContext("state.fund_need", ctx);
	assert(fund75 > 0 && !vm.runInContext("upgrade_due()", ctx), `merchant waits for funding (${fund75})`);
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", gold: 7.7e6, x: 0, y: 0 });
	vm.runInContext(`state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 40, y: 0, esize: 30, gold: 2e6, fund: ${fund75} }; state.fund_sent_at = 0; state.partners = {}; handoff_busy = false; merchant_gold_at = Date.now(); state.hold_for = {}`, ctx);
	const g75 = []; ctx.send_gold = (to, g) => (g75.push([to, g]), Promise.resolve());
	await vm.runInContext("merchant_handoff()", ctx);
	assert(g75.length === 1 && g75[0][0] === "DoWhatNow" && g75[0][1] === Math.round(fund75), `richest fighter funds the project (${JSON.stringify(g75)})`);
	vm.runInContext("state.merchant = null; state.upg = null; state.fund_need = 0", ctx);

	// 76) crafting for power: a non-quest recipe of plain materials whose output a member wears as an upgrade
	ctx.G.items.cloth = { type: "material", s: true }; ctx.G.items.silkhat = { type: "helmet", armor: 90, g: 1000 };
	ctx.G.items.questhat = { type: "helmet", armor: 200 };
	ctx.G.craft = { silkhat: { items: [[5, "cloth"]], cost: 1000 }, questhat: { quest: "mcollector", items: [[5, "cloth"]] } };
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", gold: 3e6, esize: 30, map: "main" });
	character.items = Array(42).fill(null); character.slots = { helmet: { name: "helm1", level: 0 } };
	vm.runInContext("state.needs = new Map(); state.bank_seen = { cloth: 5 }; state.bank_gear = []; state.fetch_try = {}; state.gear_skip = {}; state.guide_equip = {}; craft_cache = null; quest_inputs = null", ctx);
	assert(vm.runInContext("craft_pick()", ctx) === null, "cloth is a quest recipe input → never spent on other crafts");
	ctx.G.craft = { silkhat: { items: [[5, "cloth"]], cost: 1000 } };
	vm.runInContext("craft_cache = null; quest_inputs = null", ctx);
	const c76 = vm.runInContext("craft_pick()", ctx);
	assert(c76 && c76.id === "silkhat" && c76.for === "Torlis", `picks the silk hat for Torlis (${JSON.stringify(c76)})`);
	assert(vm.runInContext("bag_plan().fetch.some((f) => f.key === 'craft:cloth')", ctx), "fetches the inputs from the bank");
	character.items[0] = { name: "cloth", q: 5 };
	const crafted76 = []; ctx.auto_craft = (id) => (crafted76.push(id), Promise.resolve({ success: true }));
	vm.runInContext("craft_cache = null", ctx);
	await vm.runInContext("task_craft_power()", ctx);
	assert(JSON.stringify(crafted76) === '["silkhat"]', `crafts it once inputs are in the bags (${crafted76})`);
	character.items = Array(42).fill(null); character.slots = {};
	vm.runInContext("G.craft = {}; craft_cache = null; quest_inputs = null; state.bank_seen = {}", ctx);
	// 77) merchant online is sticky (10 min); fetched compound copies go to the merchant; a broke compound retries soon
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", esize: 30, map: "main" });
	character.items = Array(42).fill(null); character.slots = {};
	character.items[4] = { name: "ringx", level: 0 }; character.items[5] = { name: "ringx", level: 0 }; character.items[6] = { name: "ringx", level: 0 };
	vm.runInContext("state.merchant = { name: CFG.merchant.name, t: Date.now() - 3 * 60000, map: 'main', x: 0, y: 0, esize: 30, gold: 1e6 }; state.fetched = { ringx: Date.now() }; state.needs = new Map(); cmp_cache = null; state.bank_gear = []", ctx);
	assert(vm.runInContext("merchant_does_it() && compound_groups().length === 0", ctx), "a heartbeat 3 min old still counts: fighters don't compound");
	assert(vm.runInContext("bag_class(character.items[4])", ctx) === "bank", "a fetched compound copy isn't held: it goes to the merchant");
	vm.runInContext("state.merchant.t = Date.now() - 11 * 60000; cmp_cache = null", ctx);
	assert(!vm.runInContext("merchant_does_it()", ctx), "after 10 min of silence the fighter takes over");
	// merchant compound fails on gold → 10-min pause and a funding request
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", gold: 40000, esize: 30, map: "main" });
	vm.runInContext("state.merchant = null; state.gear_skip = {}; state.fund_need = 0; state.fetched = {}; cmp_cache = null; state.stand = {}; stand_cache = null", ctx);
	const rc_save = vm.runInContext("run_compound", ctx);
	vm.runInContext("run_compound = () => Promise.reject({ reason: 'gold_reserve' })", ctx);
	await vm.runInContext("task_compound()", ctx);
	const until77 = vm.runInContext("state.gear_skip['cmp:ringx:0']", ctx) - Date.now();
	assert(until77 > 0 && until77 <= 600_000 && vm.runInContext("state.fund_need", ctx) > 0, `broke compound: 10-min pause + funding request (${Math.round(until77 / 60000)}m, ${vm.runInContext("state.fund_need", ctx)})`);
	ctx.__rc = rc_save; vm.runInContext("run_compound = __rc; state.fund_need = 0; state.gear_skip = {}", ctx);
	character.items = Array(42).fill(null);
	// 78) Merrit: a stand spot in the square/aisle, clear of fixed NPCs and other stands; routine trips wait 2.5 min
	ctx.G.maps.main.npcs = [{ id: "fixedguy", position: [0, 0] }, { id: "citizen0", position: [20, 20] }, { id: "bean", position: [16, 0], boundary: [-100, -100, 100, 100] }];
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 42, gold: 1e6, map: "main", x: 500, y: 500, esize: 30, rip: false, stand: false, moving: false });
	character.items = Array(42).fill(null); character.slots = {};
	vm.runInContext("state.mspot = null; state.partners = {}; state.merchant = null", ctx);
	assert(!vm.runInContext("spot_ok(0, 0)", ctx) && !vm.runInContext("spot_ok(300, 0)", ctx) && !vm.runInContext("spot_ok(0, 400)", ctx) && vm.runInContext("spot_ok(0, 200)", ctx),
		"spot rules: not on a fixed NPC, not outside the square/aisle; the aisle qualifies");
	const sp78 = vm.runInContext("merrit_spot()", ctx);
	assert(sp78 && Math.hypot(sp78.x, sp78.y) > 40 && Math.hypot(sp78.x, sp78.y) < 64, `nearest qualifying grid point to the centre (${JSON.stringify(sp78)})`);
	ctx.parent.entities.rival = { id: "rival", name: "Rival", type: "character", stand: true, map: "main", x: sp78.x + 5, y: sp78.y };
	const sp78b = vm.runInContext("merrit_spot()", ctx);
	assert(sp78b && (sp78b.x !== sp78.x || sp78b.y !== sp78.y), `another stand next to our spot → we pick a new one (${JSON.stringify(sp78b)})`);
	ctx.parent.entities.rival.x = sp78b.x; ctx.parent.entities.rival.y = sp78b.y + 12; // within 10px sideways, 12px vertically
	assert(!vm.runInContext(`spot_ok(${sp78b.x}, ${sp78b.y})`, ctx), "too close in front/behind another stand is refused");
	delete ctx.parent.entities.rival;
	// routine trip waits while the stand settles; an urgent one goes
	Object.assign(character, { x: sp78b.x, y: sp78b.y, stand: true });
	vm.runInContext(`state.mspot = { x: ${sp78b.x}, y: ${sp78b.y} }; state.stand_since = Date.now() - 30000; merchant_trip_at = 0; state.errand = null; smart_depth = 0`, ctx);
	hb("Torlis", { ...tor, x: 900, y: 900, esize: 10, pots: { hp: 150, mp: 150 } });
	vm.runInContext("merchant_tick()", ctx);
	assert(vm.runInContext("state.errand", ctx) === null, "routine supply trip waits for the 2-minute window");
	hb("Torlis", { ...tor, x: 900, y: 900, esize: 2, pots: { hp: 150, mp: 150 } });
	vm.runInContext("merchant_tick()", ctx);
	assert(vm.runInContext("state.errand", ctx) === "serve", "an urgent trip (2 free slots) goes at once");
	vm.runInContext("state.errand = null; state.partners = {}; G.maps.main.npcs = []; state.mspot = null", ctx);
	character.stand = false;
	// 79) v16.9: walk failures pause compounds 10 min (item verdicts 6h); old 'interrupted' pauses cleared; merchant's
	// fetched compound copies of a paused set are bankable; town steps refresh the errand lock
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", gold: 2e6, esize: 30, map: "main" });
	character.items = Array(42).fill(null);
	character.items[4] = { name: "ringx", level: 0 }; character.items[5] = { name: "ringx", level: 0 }; character.items[6] = { name: "ringx", level: 0 };
	vm.runInContext("state.merchant = null; state.gear_skip = {}; state.fund_need = 0; state.fetched = { ringx: Date.now() }; state.needs = new Map(); cmp_cache = null; state.stand = {}; stand_cache = null; state.bank_gear = []", ctx);
	const rc79 = vm.runInContext("run_compound", ctx);
	vm.runInContext("run_compound = () => Promise.reject({ reason: 'interrupted' })", ctx);
	await vm.runInContext("task_compound()", ctx);
	const p79 = vm.runInContext("state.gear_skip['cmp:ringx:0']", ctx) - Date.now();
	assert(p79 > 0 && p79 <= 600_000, `interrupted → 10-min pause (${Math.round(p79 / 60000)}m)`);
	assert(vm.runInContext("bag_class(character.items[4])", ctx) === "bank", "paused set: the merchant's fetched copies are bankable, not held 1h");
	vm.runInContext("state.gear_skip = {}; cmp_cache = null; run_compound = () => Promise.reject({ reason: 'low_chance', chance: 0.3 })", ctx);
	await vm.runInContext("task_compound()", ctx);
	assert(vm.runInContext("state.gear_skip['cmp:ringx:0']", ctx) - Date.now() > 5 * 3600_000, "low chance → 6h pause");
	ctx.__rc79 = rc79; vm.runInContext("run_compound = __rc79; state.gear_skip = {}; cmp_cache = null", ctx);
	assert(vm.runInContext("bag_class(character.items[4])", ctx) === "keep", "active set: copies kept for compounding");
	// load clears interrupted pauses
	ctx.get = (k) => (k.startsWith("farmer_v9:") ? { v: 1, at: Date.now(), gear_skip: { "cmp:hpbelt:0": Date.now() + 3e6 }, skip_why: { "cmp:hpbelt:0": "interrupted" } } : null);
	vm.runInContext("state.gear_skip = {}; load_state()", ctx);
	assert(!vm.runInContext("state.gear_skip['cmp:hpbelt:0']", ctx), "an old 'interrupted' compound pause is cleared on load");
	ctx.get = () => null;
	// errand lock refreshed by town steps: an errand started 6 min ago is still busy after a step
	vm.runInContext("state.errand = 'town'; state.errand_at = Date.now() - 6 * 60000", ctx);
	assert(!vm.runInContext("errand_busy()", ctx), "(setup) a 6-min-old lock has lapsed");
	vm.runInContext("cmp_cache = null; state.gear_skip['cmp:ringx:0'] = Date.now() + 1e6", ctx); // nothing to compound
	await vm.runInContext("task_compound()", ctx);
	assert(vm.runInContext("errand_busy()", ctx), "a compound pass refreshes the errand lock");
	vm.runInContext("state.errand = null; state.gear_skip = {}; state.fetched = {}", ctx);
	character.items = Array(42).fill(null);
	// 80) v17 report: party sections say each fact once; not-at-pack is visible; merrit counts parcels from history
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, gold: 3.8e6, map: "winterland", x: 4, y: -602, rip: false, s: { monsterhunt: { id: "croc", c: 90 } } });
	character.items = Array(42).fill(null); character.slots = {};
	vm.runInContext("state.partners = {}; state.merchant = null; state.pack = { mtype: 'croc', map: 'main', boundary: [0,0,400,400], directive: 'mutual: hunt' }; state.directive = { monster: 'croc', reason: 'mutual: hunt' }; state.safe = { croc: { ttk: 1, xp: 1 } }; state.shared = { mutual: ['croc ~0.2h (x)'], too_slow: ['goo: slow'] }", ctx);
	ctx.G.items.tracker = ctx.G.items.tracker || { type: "tracker" };
	character.items[0] = { name: "monstertoken", q: 1 };
	hb("Torlis", { ...tor, level: 60, map: "winterland", x: 20, y: -600 }); // Sanala (51) leads
	const sec80 = vm.runInContext("report_lines(false, true)", ctx).join("\n");
	assert(/^fighting: → croc @ main \(now at winterland\)$/m.test(sec80), `not at the pack: shown as heading there (${sec80.split("\n")[0]})`);
	assert(!/mutual/.test(sec80) && !/directive/.test(sec80) && !/too slow/.test(sec80) && !/^tokens:/m.test(sec80), `leader section: no directive/goals repeats, no separate tokens line:\n${sec80}`);
	assert((sec80.match(/^hold:/gm) || []).length === 1, "hold + tokens in one line");
	const full80 = vm.runInContext("report_lines(false)", ctx).join("\n");
	if (process.env.SHOW) console.log("SECTION\n" + sec80 + "\nFULL\n" + full80 + "\nEND");
	assert((full80.match(/mutual: hunt/g) || []).length === 1, `solo report states the directive once (${(full80.match(/mutual: hunt/g) || []).length})`);
	// merrit counts parcels from history
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", map: "main", x: 0, y: -8, stand: true });
	vm.runInContext("hist.ev = [{ t: Date.now() - 600000, type: 'parcel', n: 1 }]; state.parcel_at = Date.now() - 600000; state.mspot = { x: 0, y: -8 }; state.pack = null; state.directive = null", ctx);
	const m80 = vm.runInContext("report_lines(false, true).find((l) => l.startsWith('merrit:'))", ctx);
	assert(/parcels 24h: 1, last 10m ago/.test(m80), `merrit line counts parcels from history (${m80})`);
	vm.runInContext("hist.ev = []; state.shared = null; state.partners = {}", ctx);
	delete character.s.monsterhunt; character.items = Array(42).fill(null); character.stand = false;
	// 81) tokens: fighters keep them (never loot for the merchant); the merchant gives held tokens to fighters lacking a tracker
	ctx.G.items.monstertoken = { type: "token", s: true };
	ctx.G.tokens = { monstertoken: { tracker: 4 } };
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", map: "main", x: 0, y: 0, rip: false, esize: 30 });
	character.items = Array(42).fill(null); character.items[0] = { name: "monstertoken", q: 2 };
	vm.runInContext("state.needs = new Map(); state.fetched = {}; cmp_cache = null", ctx);
	assert(vm.runInContext("bag_class(character.items[0])", ctx) === "keep", "fighters keep their monster tokens");
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", map: "main", x: 0, y: 0 });
	character.items = Array(42).fill(null); character.items[3] = { name: "monstertoken", q: 4 }; // tokens only (no tracker of its own here)
	vm.runInContext("state.partners = {}", ctx);
	hb("Sanala", { ...san, x: 30, y: 0, tokens: 1, need: ["tracker"] });
	hb("Torlis", { ...tor, x: 30, y: 10, tokens: 0, need: ["tracker"] });
	hb("Aspernari", { ...asp, x: 30, y: 20, tokens: 1, need: [] });
	const gt81 = []; ctx.send_item = (to, k, q) => { gt81.push([to, q]); character.items[k].q -= q; if (!character.items[k].q) character.items[k] = null; return Promise.resolve(); };
	ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	await vm.runInContext("give_tokens()", ctx);
	vm.runInContext("state.bank_seen = { monstertoken: 3 }; state.fetch_try = {}", ctx);
	const saved81 = character.items[3]; character.items[3] = null;
	assert(vm.runInContext("bag_plan().fetch.some((f) => f.key === 'give:monstertoken')", ctx), "merchant fetches banked tokens while a fighter lacks its tracker");
	character.items[3] = saved81; vm.runInContext("state.bank_seen = {}", ctx);
	assert(JSON.stringify(gt81) === '[["Sanala",3],["Torlis",1]]', `Sanala gets 3 (1→4), Torlis the last one; Aspernari (has one) nothing (${JSON.stringify(gt81)})`);
	character.items = Array(42).fill(null); ctx.distance = dist_save;
	vm.runInContext("state.partners = {}", ctx);
	// 82) fighters first: the merchant's own tracker goes to a fighter lacking one; nobody buys the merchant a copy
	// while any fighter still lacks theirs
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", map: "main", x: 0, y: 0 });
	character.items = Array(42).fill(null); character.items[2] = { name: "tracker", q: 1 };
	vm.runInContext("state.partners = {}", ctx);
	hb("Torlis", { ...tor, x: 30, y: 0, tokens: 0, need: ["tracker"] });
	hb("Sanala", { ...san, x: 30, y: 10, tokens: 0, need: [] });
	const g82 = []; ctx.send_item = (to, k, q) => { g82.push([to, character.items[k].name]); character.items[k] = null; return Promise.resolve(); };
	ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	await vm.runInContext("give_tokens()", ctx);
	assert(JSON.stringify(g82) === '[["Torlis","tracker"]]', `merchant's tracker goes to Torlis (${JSON.stringify(g82)})`);
	// a fighter with spare tokens doesn't buy for the merchant while Torlis (on its heartbeat) still lacks one
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", x: 0, y: 0 });
	character.items = Array(42).fill(null); character.items[0] = { name: "monstertoken", q: 9 }; character.items[1] = { name: "tracker", q: 1 };
	vm.runInContext("state.partners = {}; state.bank_seen = {}; state.hold_for = {}; state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 50, y: 0, esize: 20, gold: 1e6, need: ['tracker'] }", ctx);
	hb("Torlis", { ...tor, tokens: 0, need: ["tracker"] });
	assert(vm.runInContext("hold_for_merchant()", ctx) === null, "no copy bought for the merchant while a fighter lacks one");
	hb("Torlis", { ...tor, tokens: 0, need: [] });
	assert(vm.runInContext("hold_for_merchant() && hold_for_merchant().for", ctx) === "DoWhatNow", "once every fighter has one, the merchant's copy is bought (opt-in)");
	vm.runInContext("CFG.hold_buy_for_merchant = false", ctx);
	assert(vm.runInContext("hold_for_merchant()", ctx) === null, "default: nobody buys the merchant a tracker");
	character.items = Array(42).fill(null); ctx.distance = dist_save;
	vm.runInContext("state.partners = {}; state.merchant = null", ctx);
	// 83) audit: only gear/materials/gems are ever listed or purged; only boxes/chests/gems exchanged; recipe inputs
	// never; walk-type failures pause briefly
	ctx.G.items.dkey = { type: "dungeon_key", g: 500000 }; ctx.G.items.lic = { type: "licence", g: 900000 };
	ctx.G.items.qitem = { type: "quest", g: 50000, e: 10 }; ctx.G.items.gembox = { type: "box", g: 1000, e: 1 };
	ctx.G.items.cscale = { type: "material", g: 80000 };
	ctx.G.craft = { orbg: { quest: "mcollector", items: [[1, "cscale"]] } };
	vm.runInContext("recipe_input_set = null; recipe_inputs = null", ctx);
	assert(!vm.runInContext("tradeable('dkey') || tradeable('lic') || tradeable('qitem') || tradeable('cscale')", ctx) && vm.runInContext("tradeable('helm2')", ctx),
		"dungeon keys, licences, quest items and recipe materials are never sold/listed/purged; gear is");
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", map: "main", esize: 30 });
	character.items = Array(42).fill(null); character.items[0] = { name: "qitem", q: 10 }; character.items[1] = { name: "gembox", q: 1 };
	vm.runInContext("state.needs = new Map(); state.gear_skip = {}", ctx);
	assert(vm.runInContext("exchange_pick()", ctx) === 1, "exchange opens the box, not the quest item");
	assert(vm.runInContext("pause_ms({ reason: 'interrupted' }, 6 * 3600000)", ctx) === 600000 && vm.runInContext("pause_ms({ reason: 'low_chance' }, 6 * 3600000)", ctx) === 6 * 3600000, "transient failures pause 10 min, verdicts the long pause");
	assert(vm.runInContext("fresh({ t: Date.now() - 15000 })", ctx), "a member silent 15s still counts (busy members skip beats)");
	character.items = Array(42).fill(null);
	vm.runInContext("G.craft = {}; recipe_input_set = null; recipe_inputs = null", ctx);
	// 84) the merchant makes a delivery trip for a Tracktrix/tokens it holds even when nobody needs supplies
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", map: "main", x: 0, y: 0 });
	character.items = Array(42).fill(null); character.items[2] = { name: "tracker", q: 1 };
	vm.runInContext("state.partners = {}", ctx);
	hb("Torlis", { ...tor, esize: 30, pots: { hp: 200, mp: 200 }, tokens: 0, need: ["tracker"] });
	hb("Sanala", { ...san, esize: 30, pots: { hp: 200, mp: 200 }, tokens: 0, need: [] });
	assert(vm.runInContext("merchant_job() && merchant_job().name", ctx) === "Torlis", "a held Tracktrix makes Torlis a delivery job");
	character.items[2] = null;
	assert(vm.runInContext("merchant_job()", ctx) === null, "nothing to deliver and no needs → no trip");
	vm.runInContext("state.partners = {}", ctx);
	// 85) selftest: two quick runs keep separate pongs; events read from the live server's event_flags/event_ends shape
	ctx.send_cm = (to, m) => (pings.push([to.join(), m.k, m.id]), Promise.resolve());
	pings.length = 0;
	ctx.parent.S = {};
	vm.runInContext("selftest(); selftest()", ctx);
	const ids85 = pings.filter(([, k]) => k === "ping").map(([, , id]) => id);
	for (const id of ids85) handlers.cm({ name: "Torlis", message: { k: "pong", id, v: "17.5" } });
	assert(ids85.length === 2 && ids85.every((id) => vm.runInContext(`!!st_runs["${id}"].pong.Torlis`, ctx)), "each selftest run records its own pongs");
	vm.runInContext("for (const k in st_runs) delete st_runs[k]", ctx);
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", map: "main", rip: false });
	ctx.parent.S = { schedule: {}, event_flags: { goobrawl: true }, event_ends: {} };
	assert(vm.runInContext("event_live()", ctx) === "goobrawl", "goo brawl detected from event_flags (live server shape)");
	ctx.parent.S = { schedule: {}, event_flags: {}, event_ends: { goobrawl: new Date(Date.now() + 3e5).toISOString() } };
	assert(vm.runInContext("event_live()", ctx) === "goobrawl", "...or from a future event_ends entry");
	ctx.parent.S = {};
	// 86) time accounting: moving while engaged with a target is fight time; a smart_move is walk time
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", moving: true, rip: false });
	vm.runInContext("state.recovering = false; state.errand = null; smart_depth = 0; state.last_target_at = Date.now()", ctx);
	const gtm86 = ctx.get_targeted_monster;
	ctx.get_targeted_monster = () => ({ id: "x", hp: 10 });
	assert(vm.runInContext("time_class()", ctx) === "fight", "approaching a live target counts as fighting");
	vm.runInContext("smart_depth = 1", ctx);
	assert(vm.runInContext("time_class()", ctx) === "walk", "a smart_move counts as walking");
	vm.runInContext("smart_depth = 0", ctx); ctx.get_targeted_monster = gtm86; character.moving = false;
	// 87) gear_check(): worn vs best owned per slot, with a verdict
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin" });
	character.slots = { helmet: { name: "hA", level: 0 } }; character.items = Array(42).fill(null);
	vm.runInContext("state.bank_gear = [{ name: 'hC', level: 0 }]; state.guide = null; my_gear_cache = null", ctx);
	const gc87 = vm.runInContext("gear_check()", ctx);
	assert(/^helmet\s+hA\+0 \d+ pts \| best owned: hC\+0 \d+ pts \(bank\) — UPGRADE/m.test(gc87), `gear_check lists the bank helmet as an upgrade:\n${gc87.split("\n").slice(0, 6).join("\n")}`);
	character.slots = {}; vm.runInContext("state.bank_gear = []", ctx);
	// 88) probing: picks a monster just over the limit that beats the best xp/s; guarded start; raised flee; endings
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, hp: 1000, max_hp: 1000, mp: 500, max_mp: 1000, attack: 100, frequency: 1,
		armor: 0, resistance: 0, range: 200, map: "main", x: 0, y: 0, rip: false, s: {} });
	character.items = Array(42).fill(null); character.items[0] = { name: "hpot1", q: 200 }; character.items[1] = { name: "mpot1", q: 200 };
	vm.runInContext("state.partners = {}; state.merchant = null; state.probe = null; state.probe_at = 0; state.gear_skip = {}; state.calib = {}; state.calib_all = { ratio: 1, n: 0 }; state.danger = {}; state.directive = null; state.recovering = false; state.errand = null; state.cooldown = {}; live_cache.clear()", ctx);
	ctx.parent.S = {};
	// risk ≈ attack·ttk; tune three monsters around the limit (1000 hp × safety 0.35 = 350)
	ctx.G.monsters.edge = { xp: 4000, hp: 500, attack: 400, frequency: 1, range: 20, speed: 10, respawn: 5 };   // over, high xp → probe
	ctx.G.monsters.wall = { xp: 9000, hp: 500, attack: 1200, frequency: 1, range: 20, speed: 10, respawn: 5 }; // far over → never
	ctx.G.monsters.meh = { xp: 20, hp: 500, attack: 400, frequency: 1, range: 20, speed: 10, respawn: 5 };     // over, but poor xp
	ctx.G.maps.main.monsters.push({ type: "edge", count: 6, boundary: [600, 600, 800, 800] }, { type: "wall", count: 6, boundary: [900, 900, 1000, 1000] }, { type: "meh", count: 6, boundary: [1100, 1100, 1200, 1200] });
	const ro = (m) => vm.runInContext(`risk_over('${m}')`, ctx);
	assert(ro("edge") > 1 && ro("edge") <= 2 && ro("wall") > 2, `risk ratios: edge x${ro("edge").toFixed(2)}, wall x${ro("wall").toFixed(2)}`);
	vm.runInContext("state.best_score = 50", ctx);
	assert(vm.runInContext("probe_ready()", ctx), "solo, healthy, stocked → a probe may start");
	assert(vm.runInContext("probe_pick().mt", ctx) === "edge", "picks the over-limit monster that beats the best xp/s (not the wall, not the poor one)");
	hb("Torlis", { ...tor, x: 900, y: 900, hp: 3000, max_hp: 3000, pots: { hp: 200, mp: 200 } });
	assert(!vm.runInContext("probe_ready()", ctx), "a member far away blocks the probe");
	hb("Torlis", { ...tor, x: 20, y: 0, hp: 3000, max_hp: 3000, pots: { hp: 20, mp: 200 } });
	assert(!vm.runInContext("probe_ready()", ctx), "a member low on potions blocks the probe");
	hb("Torlis", { ...tor, level: 60, attack: 1, x: 20, y: 0, hp: 3000, max_hp: 3000, pots: { hp: 200, mp: 200 } }); // Sanala (51) leads; negligible damage keeps edge over the limit
	vm.runInContext("pick_pack()", ctx);
	assert(vm.runInContext("state.probe && state.probe.mtype === 'edge' && state.pack.probe", ctx), "pick_pack starts the probe");
	assert(vm.runInContext("flee_at()", ctx) === 0.55, "flee threshold raised during the probe");
	vm.runInContext("pick_pack()", ctx);
	assert(vm.runInContext("state.pack.mtype === 'edge' && !state.probe_at_reset", ctx), "the probe holds the pack through repicks");
	// a member under 40% → failure, 6h cooldown + incident
	hb("Torlis", { ...tor, level: 60, x: 20, y: 0, hp: 1000, max_hp: 3000, pots: { hp: 200, mp: 200 } });
	vm.runInContext("probe_check()", ctx);
	assert(vm.runInContext("!state.probe && skipped('probe:edge') && state.danger.edge < 1 && state.gear_skip['probe:edge'] - Date.now() > 5 * 3600000", ctx), "member under 40% HP → failure, 6h cooldown, incident");
	// time's up → success, 2h cooldown
	hb("Torlis", { ...tor, level: 60, x: 20, y: 0, hp: 3000, max_hp: 3000, pots: { hp: 200, mp: 200 } });
	vm.runInContext("state.gear_skip = {}; state.danger = {}; state.probe = { mtype: 'edge', start: Date.now() - 700000, until: Date.now() - 1, ratio: 1.4, prof: { probe: true } }", ctx);
	vm.runInContext("probe_check()", ctx);
	const pe = vm.runInContext("hist.ev.filter((e) => e.type === 'probe').pop()", ctx);
	assert(pe && pe.result === "ok" && vm.runInContext("state.gear_skip['probe:edge'] - Date.now() < 2.1 * 3600000", ctx), "time up → success, 2h cooldown, logged");
	// a follower raises its flee threshold from the leader's probe flag
	Object.assign(character, { name: "Torlis", ...tor, level: 60 });
	vm.runInContext("state.partners = {}", ctx);
	hb("Sanala", { ...san, level: 51, pack: { mtype: "edge", map: "main", boundary: [600, 600, 800, 800], probe: true } });
	vm.runInContext("state.pack = { mtype: 'edge', map: 'main', boundary: [600,600,800,800], probe: true }", ctx);
	assert(vm.runInContext("is_follower() && flee_at() === 0.55", ctx), "followers flee at 55% while the leader probes");
	vm.runInContext("state.pack = null; state.probe = null; state.partners = {}; state.gear_skip = {}; G.maps.main.monsters = G.maps.main.monsters.filter((p) => !['edge','wall','meh'].includes(p.type))", ctx);
	character.items = Array(42).fill(null);
	// 89) v18.0: the merchant never spends tokens (hands them to the fighter with the fewest); a town task that is due but
	// achieves nothing pauses itself (town:<task>) instead of tripping the loop brake; guide-only overlaps aren't mutual
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", map: "main", x: 0, y: 0, rip: false, esize: 30 });
	character.items = Array(42).fill(null); character.items[3] = { name: "monstertoken", q: 5 };
	vm.runInContext("state.partners = {}; state.merchant = null; state.gear_skip = {}; state.hold_for = {}; state.bank_seen = {}", ctx);
	assert(vm.runInContext("token_pick()", ctx) === null, "merchant: token_pick never buys");
	hb("Sanala", { ...san, x: 30, y: 0, tokens: 6, need: [] });
	hb("Torlis", { ...tor, x: 30, y: 10, tokens: 2, need: [] });
	assert(vm.runInContext("merchant_job() && merchant_job().name", ctx) === "Torlis", "merchant holding tokens: a delivery to the fighter with the fewest");
	const g89 = []; ctx.send_item = (to, k, q) => { g89.push([to, character.items[k].name, q]); character.items[k] = null; return Promise.resolve(); };
	ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	await vm.runInContext("give_tokens()", ctx);
	assert(JSON.stringify(g89) === '[["Torlis","monstertoken",5]]', `leftover tokens → Torlis (fewest) (${JSON.stringify(g89)})`);
	ctx.distance = dist_save;
	// stuck compound: due, task returns 0 → town:compound paused with the reason, no longer due
	vm.runInContext(`state.partners = {}; state.gear_skip = {}; state.town_runs = [];
		globalThis.__cg = compound_groups; globalThis.__tc = task_compound;
		compound_groups = () => [{ name: "intamulet", level: 0, key: "cmp:intamulet:0", bags: [1, 2, 3], bank: 0 }];
		task_compound = async () => { town_reason.compound = "intamulet+0: input_missing"; return 0; };`, ctx);
	assert(vm.runInContext("town_due().compound", ctx), "compound due before the run");
	vm.runInContext("state.errand = null; smart_depth = 0; town_run(town_due())", ctx);
	for (let i = 0; i < 2000 && vm.runInContext("state.errand", ctx); i++) await new Promise((r) => setImmediate(r));
	assert(vm.runInContext("skipped('town:compound') && !town_due().compound && !skipped('town:loop')", ctx), "compound that achieved nothing → town:compound paused, not due, no loop brake");
	const rep89 = vm.runInContext("report_lines(false)", ctx).join("\n");
	assert(/town:compound paused .*input_missing/.test(rep89), `report lists the town:compound pause with its reason:\n${rep89}`);
	vm.runInContext("compound_groups = globalThis.__cg; task_compound = globalThis.__tc; state.gear_skip = {}; cmp_cache = null", ctx);
	character.items = Array(42).fill(null);
	vm.runInContext("state.partners = {}", ctx);
	// 90) v18.1 town-trip diet: deferrable-only work waits town_soft_gap_ms; shortages go now; causes are counted
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", map: "main", x: 0, y: 0, rip: false, esize: 30, hp: 1000, max_hp: 1000 });
	vm.runInContext(`state.partners = {}; state.merchant = null; state.errand = null; state.gear_skip = {}; state.town_runs = []; smart_depth = 0;
		globalThis.__td = town_due; globalThis.__tr = town_run; globalThis.__runs = 0;
		town_run = () => { globalThis.__runs++; return true; };
		town_due = () => ({ guide: true, plan: { free: 30, bank: [], sell: [], fetch: [] }, min_free: 10, pot_min: 50 });
		state.last_town = Date.now() - 120000`, ctx);
	vm.runInContext("town_check()", ctx);
	assert(vm.runInContext("globalThis.__runs === 0 && /deferrable/.test(state.town_block.blockers.join())", ctx), "guide-only work 2 min after a trip waits (deferrable)");
	vm.runInContext("town_due = () => ({ guide: true, restock: true, plan: { free: 30, bank: [], sell: [], fetch: [] }, min_free: 10, pot_min: 50 }); town_check()", ctx);
	assert(vm.runInContext("globalThis.__runs === 1", ctx), `potions low → the trip goes now (${vm.runInContext("JSON.stringify(state.town_block)", ctx)})`);
	vm.runInContext("town_due = () => ({ guide: true, plan: { free: 30, bank: [], sell: [], fetch: [] }, min_free: 10, pot_min: 50 }); state.last_town = Date.now() - 1300000; state.town_end_at = Date.now() - 60000; town_check()", ctx);
	assert(vm.runInContext("globalThis.__runs === 1", ctx), "v18.2: the soft gap counts from when the last run finished (walk back included)");
	vm.runInContext("state.town_end_at = Date.now() - 1300000; smart_depth = 1; town_check()", ctx);
	assert(vm.runInContext("globalThis.__runs === 1 && /walking to the pack/.test(state.town_block.blockers.join())", ctx), "v18.2: deferrable work never turns a pack walk around");
	vm.runInContext("smart_depth = 0; town_check()", ctx);
	assert(vm.runInContext("globalThis.__runs === 2", ctx), "deferrable work goes once the soft gap has passed and we've arrived");
	vm.runInContext("town_due = globalThis.__td; town_run = globalThis.__tr; state.last_town = 0; state.town_end_at = 0", ctx);
	vm.runInContext("hist.ev.push({ t: Date.now(), type: 'town', due: 'guide+bank', trig: 'deferrable', v: VERSION }, { t: Date.now(), type: 'town', due: 'guide', trig: 'potions', v: VERSION }, { t: Date.now(), type: 'town', due: 'guide', v: '0.1' })", ctx);
	const tc90 = vm.runInContext("town_causes()", ctx);
	assert(JSON.stringify(tc90.by.slice(0, 1)) === '[["guide",2]]' && tc90.n === 2 && tc90.older === 1 && tc90.trig.length === 2, `town_causes: this version's trips, triggers, older ones apart (${JSON.stringify(tc90)})`);
	// 91) quests too slow to farm park (materials no longer held); a better estimate unparks them
	ctx.G.items.crabclaw = { type: "material", s: true };
	ctx.G.craft.wattire_t = { items: [[200, "crabclaw"]], cost: 0, quest: "mcollector" };
	vm.runInContext(`globalThis.__bs = best_source; best_source = () => ({ monster: "crab", map: "main", boundary: [0,0,10,10], count: 5, ips: 1 / 3600 }); quest_park_cache.clear(); state.quest_park = {}`, ctx);
	assert(vm.runInContext("quest_parked('wattire_t') && !recipe_wanted('wattire_t')", ctx), "200 crabclaw at 1/h → parked, not wanted");
	vm.runInContext("best_source = () => ({ monster: 'crab', map: 'main', boundary: [0,0,10,10], count: 5, ips: 1 }); quest_park_cache.clear()", ctx);
	assert(vm.runInContext("!quest_parked('wattire_t') && !state.quest_park.wattire_t", ctx), "200 at 1/s (~3 min) → unparked");
	vm.runInContext("best_source = () => ({ monster: 'crab', map: 'main', boundary: [0,0,10,10], count: 5, ips: 200 / 10 / 3600 }); quest_park_cache.clear(); state.quest_park = { wattire_t: { at: Date.now() } }", ctx);
	assert(vm.runInContext("quest_parked('wattire_t')", ctx), "parked quest at ~10h stays parked until under quest_unpark_h (hysteresis)");
	vm.runInContext("best_source = globalThis.__bs; quest_park_cache.clear(); state.quest_park = {}", ctx);
	delete ctx.G.craft.wattire_t;
	// 92) travel: of two spawns, the near one wins unless the far one is much bigger
	ctx.G.monsters.tm = { xp: 10, hp: 10, attack: 1, frequency: 1, range: 20, speed: 10, respawn: 5 };
	ctx.G.maps.main.monsters.push({ type: "tm", count: 4, boundary: [100, 100, 200, 200] }, { type: "tm", count: 6, boundary: [3000, 3000, 3100, 3100] });
	Object.assign(character, { x: 0, y: 0, map: "main", speed: 55 });
	assert(JSON.stringify(vm.runInContext("resolve_area('tm').boundary", ctx)) === "[100,100,200,200]", "near spawn (4) beats a far one (6) ~100s away");
	assert(vm.runInContext("travel_s('main', [3000,3000,3100,3100])", ctx) > 90, "travel_s: ~4300px at 55px/s ≈ 100s");
	vm.runInContext("G.maps.main.monsters = G.maps.main.monsters.filter((p) => p.type !== 'tm')", ctx);
	// 93) a piece the server won't equip pauses 6h: not equipped again, not listed/fetched as a bank upgrade
	ctx.G.items.hpam = { type: "amulet", hp: 400 };
	Object.assign(character, { name: "Sanala", ctype: "mage" }); character.slots = { amulet: null };
	character.items = Array(42).fill(null); character.items[5] = { name: "hpam", level: 2 };
	const eq_save = ctx.equip; ctx.equip = () => Promise.reject({ reason: "no_level" });
	vm.runInContext("state.gear_skip = {}; gear_busy = false; state.errand = null; state.bank_gear = [{ name: 'hpam', level: 2 }]", ctx);
	const before93 = vm.runInContext("bank_upgrades().length", ctx);
	await vm.runInContext("equip_upgrades()", ctx);
	assert(before93 === 1 && vm.runInContext("skipped('equip:hpam:2') && bank_upgrades().length === 0", ctx), `refused equip → paused 6h and dropped from bank upgrades (before: ${before93})`);
	ctx.equip = eq_save; character.items = Array(42).fill(null);
	vm.runInContext("state.gear_skip = {}; state.bank_gear = []", ctx);
	// 94) quiet_logs: "Received a code message from" lines are dropped; others pass; re-wrapping keeps the original
	const logged94 = []; const add94 = function (m, c) { logged94.push(m); }; ctx.parent.add_log = add94;
	vm.runInContext("quiet_logs(); quiet_logs()", ctx);
	ctx.parent.add_log("Received a code message from: Torlis", "#aaf"); ctx.parent.add_log("Monster hunt: 20x bee", "#fff");
	ctx.parent.add_log("Searching for a path...", "#bbb"); ctx.parent.add_log("Path found!", "#bbb"); ctx.parent.add_log("Torlis: Path found~", "#bbb");
	assert(JSON.stringify(logged94) === '["Monster hunt: 20x bee"]' && ctx.parent.add_log.farmer_orig === add94, `cm log lines hidden, others kept, no double wrap (${JSON.stringify(logged94)})`);
	vm.runInContext("globalThis.__ql = CFG.quiet_logs; CFG.quiet_logs = []; quiet_logs(); CFG.quiet_logs = globalThis.__ql", ctx);
	assert(ctx.parent.add_log === add94, "quiet_logs = [] restores the game's own add_log");
	// 95) v18.6: an unfinishable hunt is ignored; Ponty buys cap price per point; the merchant delivers held gear
	vm.runInContext("state.partners = {}; state.merchant = null", ctx);
	vm.runInContext("globalThis.__kps = kills_per_s; kills_per_s = () => 0.05; globalThis.__ms = state.measured; state.measured = {}; state.best_score = 0", ctx); // 3 kills/min
	assert(vm.runInContext("!hunt_feasible({ id: 'bee', c: 417, ms: 1800000 }) && hunt_feasible({ id: 'bee', c: 40, ms: 1800000 }) && hunt_feasible({ id: 'bee', c: 417 })", ctx),
		"417 kills in 30 min at 3/min: ignored; 40: kept; no expiry known: kept");
	// v18.7: a hunt monster far below the best xp/s we know isn't chased
	vm.runInContext("globalThis.__mx = mt_xps; mt_xps = (mt) => (mt === 'bee' ? 300 : 800); state.best_score = 800", ctx);
	assert(vm.runInContext("hunt_feasible({ id: 'bee', c: 10 })", ctx), "v18.8: hunt_min_xp off by default — a bee hunt is chased");
	vm.runInContext("CFG.hunt_min_xp = 0.6", ctx);
	assert(vm.runInContext("!hunt_feasible({ id: 'bee', c: 10 }) && hunt_feasible({ id: 'croc', c: 10 })", ctx), "hunt_min_xp 0.6: bee hunt at 300 xp/s vs best 800 not chased; croc chased");
	vm.runInContext("CFG.hunt_min_xp = 0", ctx);
	vm.runInContext("mt_xps = globalThis.__mx; kills_per_s = globalThis.__kps; state.measured = globalThis.__ms; state.best_score = 0", ctx);
	// v18.7 gold budget: party spending held under 90% of income
	vm.runInContext(`globalThis.__hb = hist.buckets; hist.buckets = {}; state.partners = {}; state.merchant = null;
		const b = bucket(); b.earn = 1000000; b.spend = 800000; b.ls = 7200;`, ctx);
	assert(vm.runInContext("gold_room()", ctx) === 100000 && vm.runInContext("gold_ok(50000) && !gold_ok(200000)", ctx), `room = 0.9 × 1M − 800k = 100k (${vm.runInContext("gold_room()", ctx)})`);
	vm.runInContext("bucket().spend = 950000", ctx);
	assert(vm.runInContext("gold_room() < 0 && !gold_ok(1)", ctx), "spending over 90% of income: optional spending stops");
	hb("Torlis", { ...tor, ledger: { earn: 2000000, spend: 0, s: 7200 } });
	assert(vm.runInContext("gold_room()", ctx) === Math.floor(0.9 * 3000000 - 950000), "the party's ledger counts (heartbeats)");
	vm.runInContext("hist.buckets = {}; bucket().ls = 60; state.partners = {}", ctx);
	assert(vm.runInContext("gold_room() === Infinity", ctx), "under an hour of records: no limit yet");
	vm.runInContext("hist.buckets = globalThis.__hb; state.partners = {}", ctx);
	ctx.G.items.gpants = { type: "pants", armor: 60, g: 1000 };
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", map: "main", x: 0, y: 0, rip: false });
	character.items = Array(42).fill(null); character.slots = {};
	hb("Torlis", { ...tor, x: 900, y: 900, gear: { w: { pants: 0 }, own: {} } });
	const sp_save = ctx.calculate_item_value; ctx.calculate_item_value = () => 1e9;
	assert(vm.runInContext("secondhand_reason({ name: 'gpants', level: 0 }, {})", ctx) === null, "an upgrade priced far above its points isn't bought");
	ctx.calculate_item_value = () => 100;
	assert(/upgrade for Torlis/.test(vm.runInContext("secondhand_reason({ name: 'gpants', level: 0 }, {})", ctx) || ""), "a cheap upgrade for a fighter is bought");
	ctx.calculate_item_value = sp_save;
	character.items[4] = { name: "gpants", level: 0 };
	assert(vm.runInContext("gear_target() && gear_target().name", ctx) === "Torlis", "merchant holding a fighter's upgrade: a delivery trip to it");
	character.items = Array(42).fill(null); vm.runInContext("state.partners = {}", ctx);
	// 96) v18.8: the leader's town run doesn't drag followers to town; they hold its pack
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", level: 58, map: "main", x: 0, y: 0, rip: false, hp: 2500, max_hp: 2500 });
	ctx.parent.entities = {};
	vm.runInContext("state.partners = {}; state.merchant = null; state.errand = null; smart_depth = 0; globalThis.__tv = travel; globalThis.__trav = []; travel = (p) => globalThis.__trav.push(p)", ctx);
	hb("Sanala", { ...san, level: 51, x: 3000, y: 0, errand: "town", pack: { mtype: "snake", map: "main", boundary: [-100, -100, 100, 100] } });
	vm.runInContext("follower_tick()", ctx);
	assert(vm.runInContext("is_follower() && globalThis.__trav.length === 0", ctx), "leader in town: follower stays at the pack");
	hb("Sanala", { ...san, level: 51, x: 3000, y: 0, errand: null, pack: { mtype: "snake", map: "main", boundary: [-100, -100, 100, 100] } });
	vm.runInContext("follower_tick()", ctx);
	assert(vm.runInContext("globalThis.__trav.length === 1", ctx), "leader not on an errand and far: follower follows it");
	vm.runInContext("travel = globalThis.__tv; state.partners = {}", ctx);
	// 97) v18.9: no token buy of gear another character already carries (the merchant held 2 mparmor)
	ctx.G.items.mparmor = { type: "chest", armor: 50, class: ["priest", "mage"] };
	ctx.G.tokens = { monstertoken: { mparmor: 12 } };
	Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, rip: false, esize: 30 });
	character.items = Array(42).fill(null); character.items[0] = { name: "monstertoken", q: 36 }; character.items[1] = { name: "tracker", q: 1 }; character.slots = {};
	vm.runInContext("state.partners = {}; state.bank_gear = []; state.bank_seen = {}; state.hold_for = {}; state.merchant = null", ctx);
	hb("Aspernari", { ...asp, gear: { w: { chest: 0 }, own: {} } });
	assert(vm.runInContext("token_pick() && token_pick().name", ctx) === "mparmor", "nobody holds mparmor: buy it for Aspernari");
	vm.runInContext("state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 0, y: 0, bag_gear: ['mparmor'] }", ctx);
	assert(vm.runInContext("token_pick()", ctx) === null, "the merchant carries one: no token buy");
	character.items = Array(42).fill(null); vm.runInContext("state.partners = {}; state.merchant = null", ctx);
	all_done = true;
	console.log("ALL PASS");
})();
