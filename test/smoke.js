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
vm.runInContext("CFG.guide_enabled = true", ctx); // most tests exercise the guide; 105 tests the default (off)
if (!log.some((l) => /★ farmer v\S+ running — pasted; first run here/.test(l))) { console.log("FAIL: startup version line missing", log.slice(0, 5)); process.exit(1); }
vm.runInContext("CFG.model_distrust = 1; CFG.quest_farm_max_h = 3; CFG.quest_park_h = 12; CFG.quest_farm_min_xp = 0.7; CFG.hunt_min_xp = 0.7; CFG.boss.enabled = true; CFG.merchant.collect = false; CFG.sell_junk = true; CFG.probe.enabled = true; CFG.town_soft_gap_ms = 1_200_000; CFG.quest_farm = true; CFG.auto_monster_hunt = true; CFG.travel_gear.enabled = true; CFG.travel.commit_min = 0; globalThis.__run_row_real = run_row", ctx); // commitment is tested on its own (99); other tests switch freely
vm.runInContext("seen.since = Date.now() - 60_000", ctx); // past the 30s start-up grace: the party rules (one party or nothing) apply in every test
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
	assert(JSON.stringify(bought) === '[["hpot1",1000],["mpot1",1000]]', `rich: restock buys the configured potions, up to pot_buy (v24.12: 1000) (${JSON.stringify(bought)})`);
	assert(vm.runInContext("CFG.pot_buy === 1000 && CFG.merchant.serve_pots === 500", ctx) && /const carry = Math\.min\(M\.pot_carry, Math\.max\(short\("hp"\), short\("mp"\), 100\)\) \+ M\.self_pots/.test(src),
		"v24.12: the merchant comes out at 500 and carries every fighter's shortfall to pot_buy");
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
	vm.runInContext("(state.best_score = 1e6, state.best_at = Date.now())", ctx);
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
	// (the xp floor off: this is about priority; v24.3 judges side goals against the computed best even before a pick)
	vm.runInContext(`globalThis.__hmx = CFG.hunt_min_xp; CFG.hunt_min_xp = 0; state.guide_farm.monster = "bee"; state.directive = null; refresh_directive()`, ctx);
	assert(vm.runInContext(`state.directive && /monster hunt/.test(state.directive.reason)`, ctx), `hunt outranks the guide row (${vm.runInContext("JSON.stringify(state.directive && state.directive.reason)", ctx)})`);
	vm.runInContext("CFG.hunt_min_xp = globalThis.__hmx", ctx);
	delete character.s.monsterhunt;
	// outlevelled guide row skipped
	vm.runInContext(`state.guide_farm.monster = "goo"; (state.best_score = 1e9, state.best_at = Date.now()); state.directive = null; state.goals_cache = null; refresh_directive()`, ctx);
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
	vm.runInContext("(state.best_score = 1e6, state.best_at = Date.now()); CFG.quest_farm_max_h = 0.0001; state.qprog = null", ctx);
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
	assert(vm.runInContext("leader_name() === 'Torlis' && is_follower()", ctx), "the tank leads; priest follows");
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

	// 31) leader side: a member in town isn't counted in the fight verdict
	Object.assign(character, { name: "Torlis", ctype: "paladin", level: 5, hp: 300, max_hp: 300, attack: 20, frequency: 1, range: 25, armor: 20, resistance: 10, damage_type: "physical" });
	ctx.G.classes.paladin = { damage_type: "physical" };
	vm.runInContext("state.partners = {}; state.pack = { mtype: 'goo', map: 'main', boundary: [-100,-100,100,100] }", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 56, ctype: "priest", map: "bank", x: 0, y: 0, hp: 2500, max_hp: 2500, errand: "town", attack: 180, frequency: 0.75, damage_type: "magical" } });
	assert(vm.runInContext("leader_name() === 'Torlis' && !is_follower()", ctx), "the tank leads while the priest is in town");
	// safety: a mob too strong for a level-5 paladin alone is fine with the level-56 priest beside it
	ctx.G.monsters.tough31 = { xp: 500, hp: 1000, attack: 15, respawn: 10, range: 20, speed: 10, frequency: 1, resistance: 0, armor: 0 };
	const solo = vm.runInContext("!!fight_profile('tough31')", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 56, ctype: "priest", map: "main", x: 30, y: 0, hp: 2500, max_hp: 2500, errand: null, attack: 180, frequency: 0.75, damage_type: "magical" } });
	const duo = vm.runInContext("!!fight_profile('tough31')", ctx);
	assert(!solo && duo, `unsafe with the priest in town, safe with it back (in town ${solo}, back ${duo})`);

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

	// 34) a dead leader: the follower stays a follower (holds)
	Object.assign(character, { name: "Aspernari", ctype: "priest", level: 56, map: "main", x: 0, y: 0 });
	handlers.cm({ name: "Torlis", message: { k: "hb", level: 38, ctype: "paladin", map: "main", x: 50, y: 0, hp: 0, max_hp: 900, rip: true, errand: null } });
	const walk34 = [];
	ctx.smart_move = (d) => (walk34.push(d), Promise.resolve());
	vm.runInContext("follower_tick()", ctx);
	assert(vm.runInContext("is_follower()", ctx) && !walk34.length, "follower holds while the leader is dead");
	Object.assign(character, { name: "Torlis", ctype: "paladin", level: 38 });

	// 35) regression: nothing due → no town run (v11.2 counted numeric fields as due tasks)
	vm.runInContext("state.errand = null; smart_depth = 0; state.last_town = 0; state.gear_skip = {}; state.guide = null; state.needs = new Map()", ctx);
	character.items = [{ name: "hpot1", q: 100 }, { name: "mpot1", q: 100 }, ...Array(40).fill(null)]; character.esize = 42; character.s = { monsterhunt: { id: "goo", c: 5 } };
	ctx.quantity = () => 100; ctx.get_nearest_monster = () => null; character.hp = character.max_hp; character.rip = false;
	vm.runInContext("state.partners = {}", ctx);
	const due35 = vm.runInContext("town_due()", ctx);
	vm.runInContext("town_check()", ctx);
	assert(vm.runInContext("due_tasks(town_due()).length === 0 && !state.errand && state.last_town === 0", ctx), `no town run when nothing is due (${JSON.stringify(vm.runInContext("due_tasks(town_due())", ctx))})`);

	// 36) Aspernari in town: Torlis judges monsters without it
	ctx.setTimeout = (fn, ms) => (ms < 60000 && setImmediate(fn), 0);
	Object.assign(character, { name: "Torlis", ctype: "paladin", level: 40, map: "main", x: 0, y: 0, hp: 900, max_hp: 900, attack: 60, frequency: 1, range: 30, armor: 60, resistance: 30, damage_type: "physical", speed: 40 });
	ctx.G.monsters.weak36 = { xp: 200, hp: 300, attack: 10, respawn: 5, range: 20, speed: 10, frequency: 1 };
	ctx.G.monsters.brute36 = { xp: 2000, hp: 9000, attack: 120, respawn: 5, range: 20, speed: 10, frequency: 1 };
	ctx.get_targeted_monster = () => null; ctx.change_target = () => {}; ctx.is_in_range = () => false; ctx.can_move_to = () => true;
	ctx.get_nearest_monster = () => null;
	vm.runInContext("state.pack = { mtype: 'goo', map: 'main', boundary: [-100,-100,100,100] }; state.errand = null; smart_depth = 0", ctx);
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
	assert(vm.runInContext("!fight_profile('brute36') && !!fight_profile('weak36')", ctx), "with the priest in town, the leader judges mobs without it");

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
	ctx.G.items.mushhat = { type: "helmet", armor: 60, resistance: 60, int: 20, str: 20, dex: 20, vit: 20 }; // v25.15: a quest counts only for an upgrade
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
	ctx.G.drops = { monsters: { crab: [[0.001, "crabclaw"]], armadillo: [[0.002, "ascale"]] } }; // v24.6: drops split across the party; 0.0008 now took us >3h
	ctx.G.craft = { wattire: { items: [[200, "crabclaw"]], cost: 0, quest: "mcollector" }, orbg: { items: [[1, "ascale"]], cost: 0, quest: "mcollector" } };
	ctx.G.items.wattire = { type: "chest", armor: 80, resistance: 80, int: 20, str: 20, dex: 20, vit: 20 }; ctx.G.items.orbg = { type: "orb", int: 20, str: 20, dex: 20, vit: 20 }; // v25.15: upgrades
	vm.runInContext("state.turn = null; state.goals_cache = null; state.crafted = {}; state.guide_farm = null; state.measured = {}; state.realism = 1", ctx);
	handlers.cm({ name: "Aspernari", message: { k: "hb", level: 57, ctype: "priest", map: "main", x: 30, y: 0, hp: 2500, max_hp: 2500, errand: null, attack: 180, frequency: 0.75, damage_type: "magical",
		goals: [{ monster: "crab", w: 2, reason: "wattire: crabclaw 0/200", eta_h: 150 }, { monster: "armadillo", w: 2, reason: "resistancering: ascale 4/5", eta_h: 0.8 }] } });
	vm.runInContext("refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'armadillo' && state.directive.mutual", ctx), `feasible mutual goal (armadillo) beats the 150h one (${vm.runInContext("JSON.stringify(state.directive)", ctx)})`);
	// v25.15: an own quest whose output wouldn't be worn, or that we already hold (bags/bank), isn't worked on; an owner's
	// list of ids is
	{
		const R = (c) => vm.runInContext(c, ctx);
		ctx.G.items.junkhat = { type: "helmet" }; ctx.G.craft.junkhat = { items: [[5, "crabclaw"]], cost: 0, quest: "mcollector" };
		R("qskip_cache.at = 0; state.bank_seen = {}");
		assert(!R("quest_recipes()").includes("junkhat") && R("quest_skip_why('junkhat')") === "not an upgrade for us", "a quest for a piece we wouldn't wear is skipped");
		assert(R("quest_recipes()").includes("wattire"), "an upgrade's quest stays");
		R("state.bank_seen = { wattire: 1 }; qskip_cache.at = 0");
		assert(!R("quest_recipes()").includes("wattire") && /bank/.test(R("quest_skip_why('wattire')")), "...unless a copy is in the bank");
		const lines = R("report_lines(false)").filter((l) => /^quests skipped: /.test(l));
		assert(lines.length === 1 && /junkhat \(not an upgrade for us\)/.test(lines[0]) && /wattire \(a copy is in our bags or the bank\)/.test(lines[0]), `report names them (${lines})`);
		R("CFG.quest_crafts = ['junkhat']; qskip_cache.at = 0");
		assert(R("quest_recipes()").includes("junkhat"), "a quest the owner lists is kept");
		R("CFG.quest_crafts = 'materials'; state.bank_seen = {}; qskip_cache.at = 0"); delete ctx.G.craft.junkhat;
	}

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
	assert(vm.runInContext("JSON.stringify(unpause('town:loop'))", ctx) === '["town:loop"]' && vm.runInContext("!skipped('town:loop')", ctx), "v24.93: unpause('town:loop') lifts the brake from the console");
	{ // v24.92: the merchant isn't braked while its runs get work done
		const nm = character.name, ct = character.ctype;
		Object.assign(character, { name: vm.runInContext("CFG.merchant.name", ctx), ctype: "merchant" });
		vm.runInContext("state.errand = null; state.gear_skip = {}; state.town_runs = Array(6).fill(Date.now()); state.last_town = 0; state.last_town_did = 3", ctx);
		vm.runInContext("town_check()", ctx);
		assert(vm.runInContext("!skipped('town:loop')", ctx), "merchant: 6 runs in 10 min that each did work → no loop brake");
		vm.runInContext("state.errand = null; state.gear_skip = {}; state.last_town_did = 0", ctx);
		Object.assign(character, { name: nm, ctype: ct });
	}
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
	vm.runInContext("state.partners = {}; state.turn = null", ctx);
	Object.assign(character, { name: "Aspernari", ...asp, map: "main", x: 0, y: 0, rip: false, gold: asp.gold });
	hb("Torlis", tor); hb("Sanala", san);
	assert(vm.runInContext("leader_name() === 'Torlis' && is_follower() && leader_hb().name === 'Torlis'", ctx), "the tank (Torlis) leads whatever the levels; Aspernari follows it");
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
	// fight model: Sanala can't handle a mob without her partners that the trio can
	Object.assign(character, { name: "Sanala", ...san, armor: 5, resistance: 5, range: 120, speed: 50 });
	ctx.G.classes.mage = { damage_type: "magical" };
	ctx.G.monsters.trio44 = { xp: 300, hp: 1500, attack: 6, respawn: 10, range: 20, speed: 10, frequency: 1 };
	vm.runInContext("state.partners = {}; live_cache.clear()", ctx);
	const solo44 = vm.runInContext("!!fight_profile('trio44')", ctx);
	hb("Aspernari", asp); hb("Torlis", tor);
	const trio44 = vm.runInContext("!!fight_profile('trio44')", ctx);
	assert(!solo44 && trio44, `unsafe for Sanala without partners, safe with both (${solo44}, ${trio44})`);
	// goals (the leader, Torlis): a monster on 2 of 3 lists is mutual; with no overlap, turns rotate Torlis → Aspernari → Sanala
	Object.assign(character, { name: "Torlis", ...tor, armor: 60, resistance: 30, range: 30, speed: 40 });
	vm.runInContext("state.partners = {}", ctx);
	ctx.G.monsters.m1 = { xp: 50, hp: 100, attack: 2, respawn: 5, range: 20, speed: 10, frequency: 1 };
	ctx.G.monsters.m2 = { ...ctx.G.monsters.m1 }; ctx.G.monsters.m3 = { ...ctx.G.monsters.m1 };
	ctx.G.maps.main.monsters.push({ type: "m1", count: 5, boundary: [0, 0, 50, 50] }, { type: "m2", count: 5, boundary: [60, 60, 90, 90] }, { type: "m3", count: 5, boundary: [100, 100, 150, 150] });
	vm.runInContext(`state.turn = null; state.goals_cache = null; state.guide_ignore = {}; state.gprog = null; G.craft = {}; character.s = {};
		state.guide_farm = { monster: "m1", map: "main", boundary: [0,0,50,50], count: 5, reason: "guide xp", guide_safe: true, until: Date.now() + 1e6 }`, ctx);
	hb("Aspernari", { ...asp, goals: [{ monster: "m2", w: 3, reason: "hunt", eta_h: 1 }] });
	hb("Sanala", { ...san, goals: [{ monster: "m2", w: 4, reason: "guide row" }] });
	vm.runInContext("refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'm2' && state.directive.mutual", ctx), "m2 (Aspernari + Sanala) is mutual and wins");
	hb("Sanala", { ...san, goals: [{ monster: "m3", w: 4, reason: "guide row" }] });
	vm.runInContext("state.turn = null; state.goals_cache = null", ctx);
	const seq = [];
	for (let i = 0; i < 4; i++) {
		vm.runInContext("refresh_directive()", ctx);
		seq.push(vm.runInContext("state.turn.who + ':' + state.directive.monster", ctx));
		vm.runInContext("state.turn.end = Date.now() - 1", ctx);
	}
	assert(seq.join() === "Torlis:m1,Aspernari:m2,Sanala:m3,Torlis:m1", `turns rotate through all three (${seq})`);
	// 45) melee follower walks to the leader's target (it used to wait for targets to come to it)
	const V = vm.runInContext("VERSION", ctx);
	ctx.G.classes.paladin = ctx.G.classes.paladin || { damage_type: "physical" };
	Object.assign(character, { name: "Aspernari", ...asp, range: 25, map: "main", x: 0, y: 0, rip: false, moving: false }); // a short-range follower
	vm.runInContext("state.partners = {}; state.errand = null", ctx);
	hb("Torlis", { ...tor, x: 40, y: 0, target: "m45" }); hb("Sanala", { ...san, x: 40, y: 10 });
	ctx.parent.entities.m45 = { id: "m45", type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, x: 200, y: 0, target: "Torlis" };
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
	assert(JSON.stringify(eq) === '[["hB","helmet"]]', "v19.7: a guide-owned slot takes any upgrade past the normal margin (override 0)");
	eq.length = 0; character.slots = { helmet: { name: "hA", level: 0 } }; vm.runInContext("CFG.gear_guide_override = 0.2; my_gear_cache = null", ctx);
	await vm.runInContext("equip_upgrades()", ctx);
	assert(!eq.length, "with gear_guide_override set, a guide-owned slot keeps its item against a marginal upgrade");
	vm.runInContext("CFG.gear_guide_override = 0", ctx);
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
	// v24.73: copies a member would wear still make a set (three skull amulets, each "wanted" for one empty slot, never combined)
	{ const sl = character.slots; character.slots = {}; ctx.G.items.ringx.attack = 60; vm.runInContext("cmp_cache = null; my_gear_cache = null", ctx);
		assert(vm.runInContext("!!gear_gain({ name: 'ringx', level: 0 }, character.ctype, my_gear())", ctx), "setup: with empty ring slots we'd wear a ringx");
		assert(/"bags":\[2,3\],"bank":1/.test(vm.runInContext("JSON.stringify(compound_groups())", ctx)), "...and the copies still count toward a set of three");
		character.items[6] = { name: "ringx", level: 2 }; character.items[7] = { name: "ringx", level: 2 }; character.items[8] = { name: "ringx", level: 2 };
		vm.runInContext("state.cmp_caps = { ringx: { level: 2, at: Date.now() } }; cmp_cache = null", ctx);
		assert(/ringx\+2 x3: \+2 is its ceiling/.test(vm.runInContext("compound_why().join('; ')", ctx)), `the report says why three equal copies aren't combined (${vm.runInContext("compound_why().join('; ')", ctx)})`);
		character.items[6] = character.items[7] = character.items[8] = null;
		ctx.G.items.ringx.attack = 2; character.slots = sl; vm.runInContext("state.cmp_caps = {}; cmp_cache = null; my_gear_cache = null", ctx); }
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
	// v24.87: the same 45% is taken when a fighter would wear the result
	vm.runInContext("state.gear_skip = {}; state.cmp_caps = {}; cmp_cache = null; my_gear_cache = null", ctx);
	ctx.G.items.ringx.attack = 60; ctx.G.items.ringx.compound = { attack: 30 };
	ctx.compound = (a, b, c, sc, off, preview) => preview ? Promise.resolve({ chance: 0.45 }) : (cmp.push("REAL"), Promise.resolve({ success: true }));
	await vm.runInContext("task_compound()", ctx);
	assert(cmp.includes("REAL"), `a 45% compound whose result a fighter would wear goes ahead (${JSON.stringify(cmp)})`);
	ctx.G.items.ringx.attack = 2; ctx.G.items.ringx.compound = { attack: 1 };
	character.slots = {}; character.items = Array(42).fill(null);
	vm.runInContext("state.gear_skip = {}; cmp_cache = null", ctx);
	// 49) upgrade project: pick the NPC piece that beats Torlis's worn helmet most per gold, upgrade a spare to target
	ctx.G.items.scroll0 = { type: "uscroll", g: 1000 }; ctx.G.items.scroll1 = { type: "uscroll", g: 40000 };
	ctx.G.items.nhelm = { type: "helmet", armor: 5, upgrade: { armor: 6 }, g: 2000 };
	ctx.G.npcs.armorer = { items: ["nhelm"] };
	ctx.G.items.xhelm49 = { type: "helmet", armor: 50, upgrade: { armor: 20 }, g: 1000 }; // v24.71: far better per gold, but nobody sells it
	const fn_save = ctx.find_npc; ctx.find_npc = () => ({ map: "main", x: 0, y: 0 });
	Object.assign(character, { name: "Torlis", ...tor, gold: 5e6, rip: false });
	character.slots = { helmet: { name: "helm1", level: 0 } }; character.items = Array(42).fill(null);
	character.items[0] = { name: "computer" }; character.items[1] = { name: "scroll0", q: 20 }; character.items[2] = { name: "nhelm", level: 0 };
	vm.runInContext("state.partners = {}; state.merchant = null; state.upg = null; state.upg_pick_at = 0; state.gear_skip = {}; state.bank_gear = []; cmp_cache = null", ctx);
	assert(vm.runInContext("upgrade_due()", ctx) && vm.runInContext("state.upg.name", ctx) === "nhelm", `project picked — the best piece an NPC sells, though one nobody sells scores higher (${vm.runInContext("JSON.stringify(state.upg)", ctx)})`);
	// v24.86: a shop weapon a fighter would hold goes to +7 first, with no budget
	ctx.G.items.nmace = { type: "weapon", wtype: "mace", attack: 20, upgrade: { attack: 4 }, g: 3700 };
	ctx.G.npcs.armorer.items.push("nmace");
	{ const cls = ctx.G.classes.paladin; ctx.G.classes.paladin = { ...(cls || {}), mainhand: { mace: {} } }; vm.runInContext("sold_c.clear()", ctx);
		vm.runInContext("globalThis.__gr86 = gold_room; gold_room = () => 0", ctx);
		const pw = vm.runInContext("JSON.stringify(pick_upgrade())", ctx);
		vm.runInContext("gold_room = __gr86", ctx);
		assert(/"name":"nmace","to":7/.test(pw) && /"weapon":true/.test(pw), `a weapon project goes to +7 ahead of the helmet, with the budget at 0 (${pw})`);
		ctx.G.classes.paladin = cls; }
	ctx.G.npcs.armorer.items.pop(); delete ctx.G.items.nmace; vm.runInContext("sold_c.clear()", ctx);
	delete ctx.G.items.xhelm49;
	// v24.82: the target comes from the expected cost with failures (2000 gold copy, 1000 scrolls, base odds 100/98/95/70%)
	assert(vm.runInContext("upgrade_expected('nhelm', 1)", ctx) === 3000 && vm.runInContext("upgrade_expected('nhelm', 4)", ctx) === 9070 && vm.runInContext("upgrade_expected('nhelm', 7)", ctx) > 150_000,
		`expected cost counts the copies lost on the way (+1 ${vm.runInContext("upgrade_expected('nhelm', 1)", ctx)}, +4 ${vm.runInContext("upgrade_expected('nhelm', 4)", ctx)}, +7 ${vm.runInContext("upgrade_expected('nhelm', 7)", ctx)})`);
	{ const gpp = vm.runInContext("CFG.upgrade_gold_per_pt", ctx);
		vm.runInContext("CFG.upgrade_gold_per_pt = 2000; globalThis.__p49 = pick_upgrade()", ctx);
		const lo = vm.runInContext("__p49 && __p49.to", ctx);
		vm.runInContext(`CFG.upgrade_gold_per_pt = ${gpp}; globalThis.__q49 = pick_upgrade()`, ctx);
		const hi = vm.runInContext("__q49 && __q49.to", ctx);
		assert(lo >= 1 && hi > lo, `a point worth more gold takes the project to a higher level (${lo} → ${hi})`);
	}
	const to49 = vm.runInContext("state.upg.to", ctx);
	assert(vm.runInContext("needed_slots().has(2)", ctx), "project copy protected (not equipped/sent/banked mid-project)");
	// v24.85: a better copy in the bank (below the target) is fetched to start from, not a +0 upgraded from scratch
	vm.runInContext("state.bank_gear = [{ name: 'nhelm', level: Math.max(1, state.upg.to - 1) }]; state.fetch_try = {}", ctx);
	assert(/"key":"upgin:nhelm"/.test(vm.runInContext("JSON.stringify(bag_plan().fetch)", ctx)), `the project fetches the banked copy below its target to start from (${vm.runInContext("JSON.stringify([state.upg, bag_plan().fetch])", ctx)})`);
	vm.runInContext("state.bank_gear = []", ctx);
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
	// v25.13: the report says when a project is the fighter's own (kept while the merchant is online)
	{
		const P = "state.upg = { name: 'slimestaff', to: 7, for: 'Torlis', slot: 'mainhand', gain: 10, cost: 80000, own: true }";
		vm.runInContext(P, ctx);
		const line = vm.runInContext("report_lines(false).find((l) => /^upgrade: /.test(l))", ctx);
		assert(/slimestaff .* — our own \(while the merchant is away\)$/.test(line || ""), `report marks an own project (${line})`);
		vm.runInContext(P.replace("own: true", "own: false"), ctx);
		assert(!/our own/.test(vm.runInContext("report_lines(false).find((l) => /^upgrade: /.test(l))", ctx) || ""), "and not a shared one");
		vm.runInContext("state.upg = null", ctx);
	}
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
	character.gold = 3e5; // (v24.86: the floor is 500k)
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
	vm.runInContext("CFG.party.tank_first = true", ctx);
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
	vm.runInContext("tank_hold.at -= 3600_000", ctx);
	assert(vm.runInContext("hold_for_tank(parent.entities.b1) && fire('attack', parent.entities.b1) === false", ctx), "v24.46: and keeps holding — no time limit, no attack");
	tg.target = "Torlis";
	assert(!vm.runInContext("hold_for_tank(parent.entities.b1)", ctx), "fires once the tank has it");
	delete ctx.parent.entities.b1;
	handlers.cm({ name: "Torlis", message: { k: "tgt", id: "zz" } });
	assert(vm.runInContext("state.partners.Torlis.target", ctx) === "zz", "a tgt message updates that member's target at once");

	// 53) class skills: burst at full MP on a big target; priest absorbs for a hurt non-tank; paladin mana shield
	ctx.G.skills.burst = { ratio: 0.555 }; ctx.G.skills.absorb = { range: 240, mp: 200 }; ctx.G.skills.mshield = { mp: 0 };
	const iir53 = ctx.is_in_range; ctx.is_in_range = () => true; // v24.8: skills check range; this target is in reach
	used.length = 0;
	character.mp = 1000; character.items[0] = { name: "mpot1", q: 100 };
	vm.runInContext("class_skills({ hp: 5000, s: {} })", ctx);
	assert(used.some(([s]) => s === "burst"), `mage bursts at full MP (${JSON.stringify(used)})`);
	vm.runInContext("for (const k in inflight) inflight[k] = false", ctx); used.length = 0; ctx.is_in_range = () => false;
	vm.runInContext("class_skills({ hp: 5000, s: {} })", ctx);
	assert(!used.some(([s]) => s === "burst"), "v24.8: out of reach, no burst (the server refuses it without a cooldown)");
	ctx.is_in_range = () => true; vm.runInContext("for (const k in inflight) inflight[k] = false", ctx);
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

	ctx.is_in_range = iir53;
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
	// v24.12: pot_buy 1000 — Aspernari (10 hp, 190 mp) is short of both; each limited by our 100 minus self_pots 20
	assert(JSON.stringify(gave) === '[["Aspernari","hpot1",80],["Aspernari","mpot1",80]]', `hands potions, keeping self_pots (${JSON.stringify(gave)})`);
	// fighter side
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", gold: 10e6, x: 0, y: 0 });
	character.items = Array(42).fill(null); character.items[5] = { name: "gslime", q: 3 };
	vm.runInContext("state.needs = new Map(); state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 50, y: 0, esize: 30, gold: 100 }; merchant_gold_at = 0", ctx);
	hb("Torlis", { ...tor, x: 40, y: 0 }); hb("Sanala", { ...san, x: 40, y: 0 });
	const golds = []; ctx.send_gold = (to, g) => (golds.push([to, g]), Promise.resolve());
	gave.length = 0;
	await vm.runInContext("merchant_handoff()", ctx);
	assert(JSON.stringify(golds) === `[["DoWhatNow",${Math.floor(character.gold - 500_000)}]]` && gave.length === 1 && gave[0][1] === "gslime", `v24.90: hands the merchant all its gold but 500k, and the loot (${JSON.stringify(golds)} ${JSON.stringify(gave)})`);
	assert(vm.runInContext("town_due().min_free", ctx) === 3, "fighters' own town threshold drops while the merchant is online");
	vm.runInContext("state.merchant = null", ctx);
	const rep_ok = (() => { try { vm.runInContext("report()", ctx); return true; } catch (e) { console.error(e); return false; } })();
	assert(rep_ok, "report() runs with every new section");
	character.items = Array(42).fill(null); character.slots = {};
	// 55) follower with nothing to hit takes its own monster of the leader's pack near the leader
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", x: 0, y: 0, map: "main", rip: false, hp: 2500, max_hp: 2500, attack: 180, range: 200 });
	vm.runInContext("state.partners = {}; state.merchant = null; state.errand = null; state.fsafe_at = 0", ctx);
	hb("Sanala", { ...san, level: 1, x: 40, y: 0, target: null });
	hb("Torlis", { ...tor, x: 40, y: 0, pack: { mtype: "goo", map: "main", boundary: [0, 0, 400, 400] } });
	ctx.parent.entities.g55 = { id: "g55", type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, xp: 10, x: 120, y: 0, target: null };
	const atk55 = []; ctx.attack = (e) => (atk55.push(e.id), Promise.resolve());
	ctx.can_attack = () => true; ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	vm.runInContext("inflight.attack = false; follower_tick()", ctx);
	assert(!atk55.includes("g55"), `v24.46: the tank is with us — an untouched goo is the tank's to hit first (${atk55})`);
	ctx.parent.entities.g55.target = "Torlis";
	const gp55 = ctx.get_party; ctx.get_party = () => ({ Torlis: {}, Sanala: {}, Aspernari: {} });
	vm.runInContext("inflight.attack = false; follower_tick()", ctx);
	assert(atk55.includes("g55"), `once the tank has it, the follower attacks (${atk55})`);
	ctx.get_party = gp55; ctx.parent.entities.g55.target = null; atk55.length = 0;
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
	// v24.15: a compound set's missing copy only when the result is a fighter's upgrade — rings at 1e9: no
	hb("Torlis", { ...tor, x: 40, y: 0, v: V, esize: 10, gear: { w: { helmet: 3, ring1: 1e9, ring2: 1e9 }, dh: false, off: false } });
	assert(!vm.runInContext("secondhand_reason({ name: 'ringx', level: 0 }, compound_groups())", ctx), "v24.15: no buy for a compound set nobody would wear");
	// empty ring slots: ringx+0 (2 pts) is under gear_min_gain, the +1 it completes (3 pts) isn't
	hb("Torlis", { ...tor, x: 40, y: 0, v: V, esize: 10, gear: { w: { helmet: 3, ring1: 0, ring2: 0 }, dh: false, off: false } });
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
	// v24.47: a monster with no fights is never judged better than the model — here: model_distrust, as nothing we
	// measured went worse than predicted; then as bad as the worst we have measured (3x → x0.33)
	vm.runInContext("CFG.model_distrust = 2", ctx);
	const g62 = vm.runInContext("calib_factor('newmob')", ctx);
	assert(Math.abs(g62 - 0.5) < 1e-9, `no fights against it: assumed to deal twice the prediction (${g62})`);
	vm.runInContext("state.calib['bad62@p'] = { ratio: 3, n: 3, pred: 100, act: 300 }", ctx);
	assert(Math.abs(vm.runInContext("calib_factor('newmob')", ctx) - 1 / 3) < 1e-9 && Math.abs(vm.runInContext("calib_factor('bad62')", ctx) - 1 / 3) < 1e-9, "...or as bad as the worst monster measured; and three fights are enough to count");
	vm.runInContext("delete state.calib['bad62@p']; CFG.model_distrust = 1", ctx);
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
	assert(vm.runInContext("state.calib['croc@p'] && state.calib['croc@p'].n === 1 && Math.round(state.calib['croc@p'].act) === 77", ctx), "a fight's hits are recorded when the target dies");
	assert(/calibration x/.test(vm.runInContext("why_not('croc'); calib_text('croc')", ctx)), "why_not/report show the calibration");
	vm.runInContext("state.calib = {}; state.calib_all = { ratio: 1, n: 0 }; state.danger = {}; state.danger_at = {}", ctx);
	// 63) stand: buys a stand, opens it, lists the most valuable spare at 3x, cuts stale prices to the floor, notices sales
	ctx.G.items.stand0 = { type: "stand", stand: "stand0", g: 40000 };
	ctx.G.items.goldring = { type: "ring", g: 200000 }; ctx.G.items.cheapthing = { type: "material", g: 10 };
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 20, gold: 2e6, map: "main", x: 0, y: 0, rip: false, moving: false, esize: 30, stand: false });
	character.items = Array(42).fill(null); character.slots = {};
	character.items[3] = { name: "goldring", level: 0 }; character.items[4] = { name: "cheapthing", q: 5 };
	vm.runInContext("state.stand = {}; state.partners = {}; state.needs = new Map(); state.gear_skip = {}; stand_cache = null; cmp_cache = null; state.errand = null", ctx);
	vm.runInContext("CFG.merchant.stand.list = []", ctx);
	assert(vm.runInContext("bag_class(character.items[3])", ctx) !== "keep", "v25.15: a piece the owner hasn't listed isn't held for the stand");
	vm.runInContext("CFG.merchant.stand.list = ['goldring', 'cheapthing']; stand_cache = null", ctx);
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
	// 64) a short-range follower stays engaged: no drift back to the leader while on a target near it; walks break off for a fight
	ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", range: 25, x: 160, y: 0, map: "main", rip: false, moving: false, hp: 3000, max_hp: 3000, s: {} });
	vm.runInContext("state.partners = {}; state.merchant = null; state.errand = null; smart_depth = 0; last_move = 0", ctx);
	hb("Torlis", { ...tor, x: 0, y: 0, target: "m64" }); hb("Sanala", { ...san, x: 0, y: 30 });
	ctx.parent.entities.m64 = { id: "m64", type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, x: 175, y: 0, target: "Torlis" };
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
	// 65) assist the tank: the tank (the leader) announces its target; the followers hit it
	ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	ctx.G.monsters.goo.aggro = 0;
	const cms65 = []; ctx.send_cm = (to, m) => (cms65.push([to.join(), m.k, m.id]), Promise.resolve());
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", range: 25, x: 0, y: 0, map: "main", rip: false, moving: false, hp: 3000, max_hp: 3000, attack: 300, s: {} });
	vm.runInContext("state.partners = {}; state.errand = null; smart_depth = 0; last_move = 0; announced = null; state.fsafe_at = 0", ctx);
	hb("Sanala", { ...san, level: 1, x: 20, y: 0, v: V });
	hb("Aspernari", { ...asp, x: 20, y: 30, v: V });
	ctx.parent.entities.g65 = { id: "g65", type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, xp: 10, x: 120, y: 0, target: null };
	ctx.parent.entities.far65 = { id: "far65", type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, xp: 10, x: 280, y: 0, target: null };
	const at65 = []; ctx.attack = (e) => (at65.push(e.id), Promise.resolve()); ctx.can_attack = () => true;
	vm.runInContext("announce_target(parent.entities.g65)", ctx);
	assert(cms65.some(([to, k, id]) => k === "tgt" && id === "g65" && /Sanala/.test(to) && /Aspernari/.test(to)), `the tank announces its pick to everyone (${JSON.stringify(cms65)})`);
	// Aspernari (a follower) hits the target the tank announced
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", range: 200, x: 20, y: 30, hp: 2500, max_hp: 2500 });
	vm.runInContext("state.partners = {}", ctx);
	hb("Sanala", { ...san, level: 1, x: 20, y: 0, v: V });
	hb("Torlis", { ...tor, x: 100, y: 0, v: V, armor: 400, resistance: 300, max_hp: 6000, hp: 6000, pack: { mtype: "goo", map: "main", boundary: [0, 0, 400, 400] } });
	handlers.cm({ name: "Torlis", message: { k: "tgt", id: "g65" } });
	ctx.parent.entities.g65.target = "Torlis"; at65.length = 0;
	vm.runInContext("inflight.attack = false; CFG.party.heal_at = 0; follower_tick(); CFG.party.heal_at = 0.75", ctx);
	assert(at65.includes("g65") && !at65.includes("far65"), `a follower hits the tank's target, nothing untouched (${at65})`);
	// no tank online: caller_target is null
	vm.runInContext("delete state.partners.Torlis", ctx);
	assert(vm.runInContext("caller_target() === null && !i_am_tank()", ctx), "without a tank there is no target to assist");
	for (const id of ["g65", "far65"]) delete ctx.parent.entities[id];
	ctx.distance = dist_save; ctx.send_cm = () => Promise.resolve();
	// 66) watchdog: frozen leader, no-progress leader (3rd time → town), lost follower; never during errands/parked
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", x: 100, y: 100, map: "main", rip: false, hp: 900, max_hp: 900 });
	vm.runInContext("state.partners = {}; state.errand = null; state.parked = false; state.recovering = false; smart_depth = 0; hist.ev = []; wd.acts = []; wd.lost_since = null", ctx);
	vm.runInContext("state.pack = { mtype: 'goo', map: 'main', boundary: [0,0,400,400] }; state.cooldown = {}", ctx);
	// v23.0: progress = our own hits/kills (party xp arrives from partners' kills anywhere)
	const seed = (mins, dx = 0) => vm.runInContext(`wd.pos = [{ t: Date.now() - ${mins} * 60000, map: 'main', x: ${100 + dx}, y: 100, hits: seen.target_hit, kills: seen.kill, kc: seen.kc }]`, ctx);
	const stop66 = []; ctx.stop = (w) => stop66.push(w);
	seed(4);
	vm.runInContext("stats.xp += 5000; watchdog()", ctx); // xp from partners' kills doesn't count as our progress
	assert(vm.runInContext("hist.ev.some((e) => e.type === 'stuck' && e.kind === 'frozen') && Object.keys(state.cooldown).length === 1", ctx) && stop66.includes("smart"), "frozen leader: walk stopped, pack cooled down, logged");
	// moving but no xp for 11 min → noprog; third time in an hour → town
	vm.runInContext("hist.ev = []; state.cooldown = {}", ctx);
	const town66 = []; ctx.use_skill = (s) => (town66.push(s), Promise.resolve());
	// v24.9: only time at the pack counts — just arrived (after a long walk), or not there: no noprog
	seed(11, 300); vm.runInContext("wd.here_since = null; watchdog()", ctx);
	assert(vm.runInContext("!hist.ev.some((e) => e.kind === 'noprog')", ctx), "v24.9: 11 min without kills, but just arrived at the pack: no noprog");
	seed(11, 300); character.x = 2000; vm.runInContext("watchdog()", ctx); character.x = 100;
	assert(vm.runInContext("!hist.ev.some((e) => e.kind === 'noprog') && wd.here_since === null", ctx), "v24.9: still walking to it: no noprog");
	for (let i = 0; i < 3; i++) { seed(11, 300); vm.runInContext("wd.here_since = Date.now() - 12 * 60000; watchdog()", ctx); }
	assert(vm.runInContext("hist.ev.filter((e) => e.kind === 'noprog').length", ctx) === 3 && !town66.includes("use_town"), `no-progress acted 3x — v24.60: never with a town teleport of the tank's own (${town66})`);
	// during an errand or parked: nothing
	vm.runInContext("hist.ev = []; wd.acts = []; state.errand = 'town'; state.errand_at = Date.now()", ctx); seed(30);
	vm.runInContext("watchdog(); state.errand = null; state.parked = true", ctx); seed(30);
	vm.runInContext("watchdog(); state.parked = false", ctx);
	assert(vm.runInContext("hist.ev.length", ctx) === 0, "no intervention during an errand or while parked");
	// lost follower: other map than the leader for > lost_min
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", map: "halloween", x: 0, y: 0 });
	hb("Torlis", { ...tor, map: "main", x: 0, y: 0 });
	town66.length = 0;
	vm.runInContext("wd.lost_since = Date.now() - 6 * 60000; watchdog()", ctx);
	assert(!vm.runInContext("hist.ev.some((e) => e.kind === 'lost')", ctx) && vm.runInContext("state.errand", ctx) !== "regroup", "v24.58: a follower away from the leader is not sent to town on its own by the watchdog");
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
	assert(req[2].hours === 1, `v22.2: report() asks for each character's 1h history too (${req[2].hours})`);
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
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", esize: 30, rip: false, gold: 1e5, s: { monsterhunt: { id: "goo", c: 5 } } }); // (gold under the elixir floor: no elixir buy due)
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
	assert(vm.runInContext("event_tick()", ctx) === false && joins.length === 0, `v24.60: a party fighter doesn't go off to an event (${joins})`);
	character.map = "goobrawl";
	ctx.parent.entities.bg1 = { id: "bg1", type: "monster", mtype: "bgoo", visible: true, hp: 90000, max_hp: 100000, x: 40, y: 0, target: null };
	const at73 = []; ctx.attack = (e) => (at73.push(e.id), Promise.resolve()); ctx.can_attack = () => true;
	vm.runInContext("inflight.attack = false; event_tick()", ctx);
	// (v24.60: party fighters don't go to events — the fight and the walk back are no longer tested)
	delete ctx.parent.entities.bg1;
	ctx.parent.S = {};
	const tr73 = []; ctx.smart_move = (d) => (tr73.push(d), new Promise(() => {}));
	vm.runInContext("event_tick()", ctx);

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
	// merchant under its potion float: no compound is attempted and no gold is requested from the fighters
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", gold: 40000, esize: 30, map: "main" });
	vm.runInContext("state.merchant = null; state.gear_skip = {}; state.fund_need = 0; state.fetched = {}; cmp_cache = null; state.stand = {}; stand_cache = null", ctx);
	const rc_save = vm.runInContext("run_compound", ctx);
	let rc_calls = 0;
	ctx.run_compound = () => (rc_calls++, Promise.reject({ reason: 'gold_reserve' }));
	await vm.runInContext("task_compound()", ctx);
	assert(rc_calls === 0 && vm.runInContext("state.fund_need", ctx) === 0 && /gold budget/.test(vm.runInContext("town_reason.compound || ''", ctx)), `v19.6: broke merchant doesn't compound or ask for funding (${rc_calls} calls, fund ${vm.runInContext("state.fund_need", ctx)})`);
	// merchant above the float whose compound is still refused on gold: 10-min pause, still no funding request
	character.gold = 5e6; vm.runInContext("cmp_cache = null", ctx);
	await vm.runInContext("task_compound()", ctx);
	const until77 = vm.runInContext("state.gear_skip['cmp:ringx:0']", ctx) - Date.now();
	assert(until77 > 0 && until77 <= 600_000 && vm.runInContext("state.fund_need", ctx) === 0, `refused compound: 10-min pause, no funding request (${Math.round(until77 / 60000)}m, ${vm.runInContext("state.fund_need", ctx)})`);
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
	// v25.28 (owner): no spot within keep_px (80) of another player's stand; with none left, the farthest valid one
	ctx.parent.entities.rival = { id: "rival", name: "Rival", type: "character", stand: true, map: "main", x: 0, y: 100 };
	assert(!vm.runInContext("spot_ok(40, 100)", ctx) && vm.runInContext("spot_ok(40, 100, 0)", ctx), "40 px from another stand: refused (keep_px), though the server would allow it");
	const sp78c = vm.runInContext("state.mspot = null; merrit_spot()", ctx);
	assert(sp78c && Math.hypot(sp78c.x - 0, sp78c.y - 100) >= 80, `the spot keeps 80 px from the other stand (${JSON.stringify(sp78c)})`);
	// hysteresis: a stand opening 60 px from our spot (inside keep_px, outside keep_hold_px) doesn't move us
	ctx.parent.entities.rival2 = { id: "rival2", name: "Rival2", type: "character", stand: true, map: "main", x: sp78c.x + 60, y: sp78c.y };
	const sp78h = vm.runInContext("merrit_spot()", ctx);
	assert(sp78h.x === sp78c.x && sp78h.y === sp78c.y, `a stand 60 px away doesn't move us (kept until 40) (${JSON.stringify(sp78h)})`);
	delete ctx.parent.entities.rival2;
	vm.runInContext("globalThis.__kp = CFG.merchant.merrit.keep_px; CFG.merchant.merrit.keep_px = 5000; state.mspot = null", ctx);
	const sp78d = vm.runInContext("merrit_spot()", ctx);
	const pts78 = vm.runInContext("(() => { const M = CFG.merchant.merrit, o = []; for (const r of [M.square, M.aisle]) for (let x = r[0]; x <= r[2]; x += M.step) for (let y = r[1]; y <= r[3]; y += M.step) if (spot_ok(x, y, 0)) o.push(Math.hypot(x, y - 100)); return Math.max(...o); })()", ctx);
	assert(sp78d && sp78d.fb && vm.runInContext(`spot_ok(${sp78d.x}, ${sp78d.y}, 0)`, ctx) && Math.abs(Math.hypot(sp78d.x, sp78d.y - 100) - pts78) < 0.01, `nowhere far enough: the valid spot farthest from the stand (${JSON.stringify(sp78d)})`);
	// ...and kept on the next calls: no rescan, no log line, until rescan_ms
	let calls78 = 0; const so78 = vm.runInContext("spot_ok", ctx); ctx.spot_ok = (...a) => (calls78++, so78(...a));
	const logs78 = log.length;
	vm.runInContext("merrit_spot(); merrit_spot(); merrit_spot()", ctx);
	assert(calls78 === 3 && log.length === logs78, `a fallback spot is kept: one check per call (${calls78}), no log lines (${log.length - logs78})`);
	// no valid spot at all: the failed scan isn't repeated every tick (rescan_ms)
	vm.runInContext("state.mspot = null; merrit_spot.failed_at = Date.now()", ctx); calls78 = 0;
	vm.runInContext("merrit_spot(); merrit_spot()", ctx);
	assert(calls78 === 0 && vm.runInContext("state.mspot", ctx) === null, `after a scan that found nothing, no rescan until rescan_ms (${calls78} checks)`);
	vm.runInContext("merrit_spot.failed_at = 0", ctx);
	ctx.spot_ok = so78;
	vm.runInContext("CFG.merchant.merrit.keep_px = globalThis.__kp; state.mspot = null", ctx);
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
	assert(vm.runInContext("cmp_top('ringx') === 0 && !compound_spare(character.items[4], 4, new Set())", ctx), "v24.15: ...and a ceiling: +0 copies are no longer compound inputs");
	ctx.__rc79 = rc79; vm.runInContext("run_compound = __rc79; state.gear_skip = {}; state.cmp_caps = {}; cmp_cache = null", ctx);
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
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 51, gold: 3.8e6, map: "winterland", x: 4, y: -602, rip: false, s: { monsterhunt: { id: "croc", c: 90 } } });
	character.items = Array(42).fill(null); character.slots = {};
	vm.runInContext("state.partners = {}; state.merchant = null; state.pack = { mtype: 'croc', map: 'main', boundary: [0,0,400,400], directive: 'mutual: hunt' }; state.directive = { monster: 'croc', reason: 'mutual: hunt' }; state.safe = { croc: { ttk: 1, xp: 1 } }; state.shared = { mutual: ['croc ~0.2h (x)'], too_slow: ['goo: slow'] }", ctx);
	ctx.G.items.tracker = ctx.G.items.tracker || { type: "tracker" };
	character.items[0] = { name: "monstertoken", q: 1 };
	hb("Sanala", { ...san, level: 60, map: "winterland", x: 20, y: -600 }); // Torlis (the tank) leads
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
	hb("Torlis", { ...tor, esize: 30, pots: { hp: 1000, mp: 1000 }, tokens: 0, need: ["tracker"] }); // v24.12: stocked = pot_buy
	hb("Sanala", { ...san, esize: 30, pots: { hp: 1000, mp: 1000 }, tokens: 0, need: [] });
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
	const gc87 = vm.runInContext("gear_check('solo')", ctx);
	assert(/^helmet\s+hA\+0 \d+ pts \| best owned: hC\+0 \d+ pts \(bank\) — UPGRADE/m.test(gc87), `gear_check lists the bank helmet as an upgrade:\n${gc87.split("\n").slice(0, 6).join("\n")}`);
	// party-wide gear_check asks the others for their gear lines
	{
		const cm_s = ctx.send_cm, sent87 = []; ctx.send_cm = (to, m) => (sent87.push([to.join(), m.kind]), Promise.resolve());
		vm.runInContext("gather = null; gear_check()", ctx);
		assert(sent87.length === 1 && sent87[0][1] === "gear" && /Aspernari/.test(sent87[0][0]), `gear_check() asks every other character (${JSON.stringify(sent87)})`);
		vm.runInContext("gather = null", ctx); ctx.send_cm = cm_s;
	}
	character.slots = {}; vm.runInContext("state.bank_gear = []", ctx);
	// 88) probing: picks a monster just over the limit that beats the best xp/s; guarded start; endings
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 51, hp: 1000, max_hp: 1000, mp: 500, max_mp: 1000, attack: 100, frequency: 1,
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
	vm.runInContext("(state.best_score = 50, state.best_at = Date.now())", ctx);
	assert(vm.runInContext("probe_ready()", ctx), "the leader, healthy, stocked → a probe may start");
	assert(vm.runInContext("probe_pick().mt", ctx) === "edge", "picks the over-limit monster that beats the best xp/s (not the wall, not the poor one)");
	hb("Sanala", { ...san, x: 900, y: 900, hp: 3000, max_hp: 3000, pots: { hp: 200, mp: 200 } });
	assert(!vm.runInContext("probe_ready()", ctx), "a member far away blocks the probe");
	hb("Sanala", { ...san, x: 20, y: 0, hp: 3000, max_hp: 3000, pots: { hp: 20, mp: 200 } });
	assert(!vm.runInContext("probe_ready()", ctx), "a member low on potions blocks the probe");
	hb("Sanala", { ...san, level: 60, attack: 1, x: 20, y: 0, hp: 3000, max_hp: 3000, pots: { hp: 200, mp: 200 } }); // negligible damage keeps edge over the limit
	vm.runInContext("pick_pack()", ctx);
	assert(vm.runInContext("state.probe && state.probe.mtype === 'edge' && state.pack.probe", ctx), "pick_pack starts the probe");
	vm.runInContext("pick_pack()", ctx);
	assert(vm.runInContext("state.pack.mtype === 'edge' && !state.probe_at_reset", ctx), "the probe holds the pack through repicks");
	// a member under 40% → failure, 6h cooldown + incident
	hb("Sanala", { ...san, level: 60, x: 20, y: 0, hp: 1000, max_hp: 3000, pots: { hp: 200, mp: 200 } });
	vm.runInContext("probe_check()", ctx);
	assert(vm.runInContext("!state.probe && skipped('probe:edge') && state.danger.edge < 1 && state.gear_skip['probe:edge'] - Date.now() > 5 * 3600000", ctx), "member under 40% HP → failure, 6h cooldown, incident");
	// time's up → success, 2h cooldown
	hb("Sanala", { ...san, level: 60, x: 20, y: 0, hp: 3000, max_hp: 3000, pots: { hp: 200, mp: 200 } });
	vm.runInContext("state.gear_skip = {}; state.danger = {}; state.probe = { mtype: 'edge', start: Date.now() - 700000, until: Date.now() - 1, ratio: 1.4, prof: { probe: true } }", ctx);
	vm.runInContext("probe_check()", ctx);
	const pe = vm.runInContext("hist.ev.filter((e) => e.type === 'probe').pop()", ctx);
	assert(pe && pe.result === "ok" && vm.runInContext("state.gear_skip['probe:edge'] - Date.now() < 2.1 * 3600000", ctx), "time up → success, 2h cooldown, logged");
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
		state.last_town = Date.now() - 120000; state.regroup_due = false; state.ptown = null`, ctx);
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
	vm.runInContext("CFG.quest_park_h = 0; quest_park_cache.clear(); state.quest_park = {}", ctx);
	assert(vm.runInContext("!quest_parked('wattire_t')", ctx), "v24.89 (default quest_park_h 0): no quest is parked on an estimate");
	vm.runInContext("CFG.quest_park_h = 12; quest_park_cache.clear(); state.quest_park = {}", ctx);
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
	vm.runInContext("state.pack = { mtype: 'tm', map: 'main', boundary: [3000, 3000, 3100, 3100], count: 6 }", ctx);
	assert(JSON.stringify(vm.runInContext("resolve_area('tm').boundary", ctx)) === "[3000,3000,3100,3100]", "v19.1: already at a spawn of that monster → stay there");
	vm.runInContext("state.pack = null", ctx);
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
	assert(vm.runInContext("CFG.hunt_min_xp = 0; globalThis.__h95 = !hunt_feasible({ id: 'bee', c: 417, ms: 1800000 }) && hunt_feasible({ id: 'bee', c: 40, ms: 1800000 }) && hunt_feasible({ id: 'bee', c: 417 }); CFG.hunt_min_xp = 0.7; globalThis.__h95", ctx),
		"417 kills in 30 min at 3/min: ignored; 40: kept; no expiry known: kept (xp floor off: this is about expiry)");
	// v18.7: a hunt monster far below the best xp/s we know isn't chased
	vm.runInContext("globalThis.__mx = mt_xps; mt_xps = (mt) => (mt === 'bee' ? 300 : 800); (state.best_score = 800, state.best_at = Date.now())", ctx);
	assert(!vm.runInContext("hunt_feasible({ id: 'bee', c: 10 })", ctx), "v23.5: hunt_min_xp 70% by default — a bee hunt at 300 vs best 800 isn't chased");
	vm.runInContext("CFG.hunt_min_xp = 0; globalThis.__ok0 = hunt_feasible({ id: 'bee', c: 10 }); CFG.hunt_min_xp = 0.6", ctx);
	assert(vm.runInContext("globalThis.__ok0", ctx), "hunt_min_xp 0: chased");
	assert(vm.runInContext("!hunt_feasible({ id: 'bee', c: 10 }) && hunt_feasible({ id: 'croc', c: 10 })", ctx), "hunt_min_xp 0.6: bee hunt at 300 xp/s vs best 800 not chased; croc chased");
	vm.runInContext("CFG.hunt_min_xp = 0.7", ctx); // back to the default
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
	// v24.81: a route through Ponty — two +0 copies there plus our one make a +1 a fighter would wear
	ctx.G.items.rngp = { type: "ring", attack: 30, compound: { attack: 10 }, g: 1000 }; ctx.G.items.cscroll0 = ctx.G.items.cscroll0 || { type: "cscroll", g: 1000 };
	{
		const run = (groups) => JSON.parse(vm.runInContext(`JSON.stringify(ponty_routes([{ name: 'rngp', level: 0, rid: 'a' }, { name: 'rngp', level: 0, rid: 'b' }, { name: 'gpants', level: 0, rid: 'c' }], ${JSON.stringify(groups)}).map((r) => [r.name, r.to, r.for, r.buy.map((i) => i.rid).join("")]))`, ctx));
		const r1 = run({ "cmp:rngp:0": { bags: 1, bank: 0 } });
		assert(JSON.stringify(r1) === '[["rngp",1,"Torlis","ab"]]', `Ponty route: buy the two copies that complete a set whose +1 Torlis would wear (${JSON.stringify(r1)})`);
		assert(run({ "cmp:rngp:0": { bags: 3, bank: 0 } }).length === 0, "...nothing to buy when we hold the three already");
		{ // v24.87: titled copies count, and a +3 (40%) is a route when a fighter would wear it
			const r3 = JSON.parse(vm.runInContext(`JSON.stringify(ponty_routes([{ name: 'rngp', level: 2, p: 'shiny', rid: 'x' }, { name: 'rngp', level: 2, rid: 'y' }], { "cmp:rngp:2": { bags: 1, bank: 0 } }).map((r) => [r.to, r.buy.map((i) => i.rid).join(""), r.chance]))`, ctx));
			assert(r3.some(([to, buy, ch]) => to === 3 && buy === "xy" && ch === 0.4), `Ponty route to +3 from two +2s there (one titled) and ours (${JSON.stringify(r3)})`);
		}
		assert(run({}).length === 0, "...and no route when Ponty's copies can't make a set");
		ctx.calculate_item_value = () => 1e7;
		assert(run({ "cmp:rngp:0": { bags: 1, bank: 0 } }).length === 0, "...nor when the copies cost more than the points are worth");
		ctx.calculate_item_value = () => 100;
		assert(/"attack":/.test(vm.runInContext("report_facts().find((f) => f.key === 'stats_json').text", ctx)), "v24.81: the report dumps the character's stats as JSON");
		assert(vm.runInContext("JSON.stringify(ponty_dump([{ name: 'rngp', level: 0 }, { name: 'rngp', level: 0 }, { name: 'rngp', level: 2, p: 'shiny' }, { name: 'gpants', q: 5 }]))", ctx) === '{"gpants":[5,200],"rngp":[2,200],"rngp+2:shiny":[1,200]}',
			`v24.83: Ponty's whole stock with prices (${vm.runInContext("JSON.stringify(ponty_dump([{ name: 'rngp', level: 0 }, { name: 'rngp', level: 0 }, { name: 'rngp', level: 2, p: 'shiny' }, { name: 'gpants', q: 5 }]))", ctx)})`);
	}
	delete ctx.G.items.rngp;
	ctx.calculate_item_value = sp_save;
	character.items[4] = { name: "gpants", level: 0 };
	assert(vm.runInContext("gear_target() && gear_target().name", ctx) === "Torlis", "merchant holding a fighter's upgrade: a delivery trip to it");
	// v24.75: with collect on the merchant doesn't walk out with it; its heartbeat says what it holds for whom
	vm.runInContext("CFG.merchant.collect = true; cmp_cache = null", ctx);
	assert(vm.runInContext("gear_target()", ctx) === null && vm.runInContext("JSON.stringify(gear_to_give().map((g) => g.to + ':' + g.name + '+' + g.level))", ctx) === '["Torlis:gpants+0"]',
		`collect: no delivery walk; the heartbeat lists the piece for Torlis (${vm.runInContext("JSON.stringify(gear_to_give())", ctx)})`);
	{ // the tank's side: a piece for a member at the merchant (in town) is a reason for a party trip, once per retry time
		const me = { name: character.name, ctype: character.ctype, x: character.x, y: character.y, map: character.map };
		Object.assign(character, { name: "Torlis", ctype: "paladin", map: "main", x: 700, y: 1600 });
		vm.runInContext("globalThis.__m75 = state.merchant; state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 0, y: -8, give: [{ to: 'Sanala', name: 'gpants', level: 0, gain: 18 }] }; state.collect_try = {}", ctx);
		assert(vm.runInContext("collect_due().length", ctx) === 1 && vm.runInContext("collect_list(true).length", ctx) === 0, "the tank sees a piece waiting for Sanala at the merchant (none for itself)");
		vm.runInContext("state.collect_try[collect_key(collect_due()[0])] = Date.now()", ctx);
		assert(vm.runInContext("collect_due().length", ctx) === 0, "...and doesn't go again for the same piece within the retry time");
		vm.runInContext("state.collect_try = {}; state.merchant.map = 'bank'", ctx);
		assert(vm.runInContext("collect_due().length", ctx) === 0, "...nor while the merchant isn't in town");
		vm.runInContext("state.merchant = __m75; state.collect_try = {}", ctx);
		Object.assign(character, me);
	}
	vm.runInContext("CFG.merchant.collect = false; cmp_cache = null", ctx);
	character.items = Array(42).fill(null); vm.runInContext("state.partners = {}", ctx);
	// 96) v18.8: the leader's town run doesn't drag followers to town; they hold its pack
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", level: 58, map: "main", x: 0, y: 0, rip: false, hp: 2500, max_hp: 2500 });
	ctx.parent.entities = {};
	vm.runInContext("state.partners = {}; state.merchant = null; state.errand = null; smart_depth = 0; globalThis.__tv = travel; globalThis.__trav = []; travel = (p) => globalThis.__trav.push(p)", ctx);
	hb("Torlis", { ...tor, x: 3000, y: 0, errand: "town", pack: { mtype: "snake", map: "main", boundary: [-100, -100, 100, 100] } });
	vm.runInContext("follower_tick()", ctx);
	assert(vm.runInContext("is_follower() && globalThis.__trav.length === 0", ctx), "leader in town: follower stays at the pack");
	hb("Torlis", { ...tor, x: 3000, y: 0, errand: null, pack: { mtype: "snake", map: "main", boundary: [-100, -100, 100, 100] } });
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
	// 98) v19.0: trip timers survive a reload
	{
		const store98 = {}; const set_s = ctx.set, get_s = ctx.get;
		ctx.set = (k, v) => ((store98[k] = JSON.parse(JSON.stringify(v))), true); ctx.get = (k) => store98[k] ?? null;
		const t0 = Date.now() - 300000;
		vm.runInContext(`state.last_town = ${t0}; state.town_end_at = ${t0 + 60000}; save_state(); state.last_town = 0; state.town_end_at = 0; load_state()`, ctx);
		assert(vm.runInContext(`state.last_town === ${t0} && state.town_end_at === ${t0 + 60000}`, ctx), "last_town / town_end_at saved and restored");
		ctx.set = set_s; ctx.get = get_s;
	}
	// 99) v19.3: the leader keeps a target it's walking to; a boss still overrides
	Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 51 }); // the leader
	vm.runInContext("state.partners = {}", ctx);
	hb("Sanala", { ...san, level: 60, goals: [{ monster: "arcticbee", w: 2, reason: "orbg: bfur 0/1" }] });
	vm.runInContext(`CFG.travel.commit_min = 10; state.goals_cache = null; state.directive = { monster: "arcticbee", map: "winterland", boundary: [0,0,100,100] };
		state.dir_lock = { monster: "arcticbee", until: Date.now() + 600000 }; state.safe.arcticbee = { ttk: 1, xp: 1 };
		globalThis.__ps = pick_shared; globalThis.__hd = hunt_directive; globalThis.__bd = boss_directive;
		pick_shared = () => ({ monster: "bee", map: "main", boundary: [0,0,50,50], reason: "mutual" });
		hunt_directive = () => null; boss_directive = () => null; refresh_directive()`, ctx);
	assert(vm.runInContext("state.directive.monster === 'arcticbee' && state.dir_held && state.dir_held.monster === 'bee'", ctx), "committed: arcticbee kept, bee noted as waiting");
	hb("Sanala", { ...san, level: 60, goals: [] }); // the goal finished: no member lists arcticbee any more
	vm.runInContext("state.goals_cache = null; refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'bee'", ctx), "a finished goal ends the commitment at once");
	hb("Sanala", { ...san, level: 60, goals: [{ monster: "arcticbee", w: 2, reason: "orbg: bfur 0/1" }] });
	vm.runInContext(`state.directive = { monster: "arcticbee", map: "winterland", boundary: [0,0,100,100] }; state.dir_lock = { monster: "arcticbee", until: Date.now() + 600000 }; state.goals_cache = null; refresh_directive()`, ctx);
	vm.runInContext("state.dir_lock.until = Date.now() - 1; refresh_directive()", ctx);
	assert(vm.runInContext("state.directive.monster === 'bee'", ctx), "commitment over: switches to bee");
	vm.runInContext(`state.directive = { monster: "arcticbee", map: "winterland", boundary: [0,0,100,100] }; state.dir_lock = { monster: "arcticbee", until: Date.now() + 600000 };
		boss_directive = () => ({ monster: "franky", map: "main", boundary: [0,0,10,10], boss: true, reason: "boss" }); refresh_directive()`, ctx);
	assert(vm.runInContext("state.directive.monster === 'franky'", ctx), "a boss overrides the commitment");
	vm.runInContext("pick_shared = globalThis.__ps; hunt_directive = globalThis.__hd; boss_directive = globalThis.__bd; state.partners = {}; state.directive = null; state.dir_lock = null; CFG.travel.commit_min = 0", ctx);
	// 100) v19.6: the merchant's optional spending leaves its potion float (donate.keep); fighters aren't affected
	vm.runInContext("globalThis.__hb2 = hist.buckets; hist.buckets = {}; state.partners = {}", ctx);
	Object.assign(character, { name: "DoWhatNow", ctype: "merchant", gold: 400000 });
	assert(vm.runInContext("gold_ok(50000) && !gold_ok(150000)", ctx), "merchant at 400k: a 50k extra is fine, a 150k one would dip under the 300k float");
	character.gold = 61000;
	assert(!vm.runInContext("gold_ok(1000)", ctx), "merchant under its float buys no extras");
	Object.assign(character, { name: "Sanala", ctype: "mage", gold: 61000 });
	assert(vm.runInContext("gold_ok(1000)", ctx), "a fighter isn't held to the merchant's float");
	vm.runInContext("hist.buckets = globalThis.__hb2", ctx);
	// 101) v19.7 gear: two-handers vs mainhand+offhand; guide equip never lowers a slot; wanted gear kept; worn swaps
	{
		// real class rules (design/classes.py): mage one-handers staff/wand/wblade, two-hander great_staff, offhand source
		ctx.G.classes.mage = { ...(ctx.G.classes.mage || {}), main_stat: "int", mainhand: { staff: {}, wand: {}, wblade: {} }, doublehand: { great_staff: {} }, offhand: { source: {}, misc_offhand: {} } };
		ctx.G.items.wnd = { type: "weapon", wtype: "wand", attack: 20 }; ctx.G.items.src = { type: "source", int: 10 };
		ctx.G.items.stf = { type: "weapon", wtype: "great_staff", attack: 40 }; ctx.G.items.stf2 = { type: "weapon", wtype: "great_staff", attack: 25 };
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, rip: false, esize: 30 });
		vm.runInContext("state.partners = {}; state.merchant = null; state.guide = null; state.guide_equip = {}; state.gear_skip = {}; my_gear_cache = null; state.needs = new Map(); gear_busy = false; state.errand = null", ctx);
		character.slots = { mainhand: { name: "wnd", level: 0 }, offhand: { name: "src", level: 0 } };
		// wand 20 + source 12 (int 10 × 1.2) = 32: a 25-attack staff loses, a 40-attack staff wins
		assert(!vm.runInContext("gear_gain({ name: 'stf2', level: 0 }, 'mage', my_gear())", ctx), "a staff weaker than wand+source isn't an upgrade");
		const r101 = vm.runInContext("gear_gain({ name: 'stf', level: 0 }, 'mage', my_gear())", ctx);
		assert(r101 && r101.slot === "mainhand" && Math.round(r101.gain) === 8, `a staff is judged against wand + source (${JSON.stringify(r101)})`);
		const eq101 = []; const eq_s = ctx.equip, uq_s = ctx.unequip;
		ctx.equip = (k, slot) => (eq101.push(["equip", character.items[k].name, slot]), Promise.resolve());
		ctx.unequip = (slot) => (eq101.push(["unequip", slot]), Promise.resolve());
		character.items = Array(42).fill(null); character.items[3] = { name: "stf", level: 0 };
		await vm.runInContext("equip_upgrades()", ctx);
		assert(JSON.stringify(eq101) === '[["unequip","offhand"],["equip","stf","mainhand"]]', `two-hander: offhand off, staff on (${JSON.stringify(eq101)})`);
		// guide equip step with a worse piece is refused
		ctx.G.items.hlow = { type: "helmet", armor: 10 }; ctx.G.items.hhigh = { type: "helmet", armor: 100 };
		character.slots = { helmet: { name: "hhigh", level: 0 } }; character.items[3] = { name: "hlow", level: 0 };
		vm.runInContext("my_gear_cache = null", ctx);
		let err101 = null;
		try { await vm.runInContext("__run_row_real({ id: 'equip:helmet:hlow:0:', kind: 'equip', action: { kind: 'equip', name: 'hlow', level: 0, slot: 'helmet' } })", ctx); } catch (e) { err101 = e; }
		assert(err101 && err101.reason === "worse_than_worn", `guide can't swap in a worse helmet (${JSON.stringify(err101)})`);
		// a piece that's an upgrade for a member is kept (not banked/sold)
		ctx.G.items.plate = { type: "chest", armor: 200 };
		character.items[4] = { name: "plate", level: 0 };
		hb("Torlis", { ...tor, x: 30, y: 0, gear: { w: { chest: 0 }, own: {} } });
		assert(vm.runInContext("bag_class(character.items[4])", ctx) === "keep" && vm.runInContext("keep_reason(character.items[4], 4, needed_slots(), compound_slots(needed_slots()))", ctx) === "for party",
			"a piece Torlis would wear is kept for him");
		// mutual swap: our ring is better for Torlis, his for us → we start (Sanala < Torlis)
		ctx.G.items.rint = { type: "ring", int: 30 }; ctx.G.items.rstr = { type: "ring", str: 30 };
		character.slots = { ring1: { name: "rstr", level: 0 } }; character.items = Array(42).fill(null);
		vm.runInContext("my_gear_cache = null; swap_at = 0; gear_busy = false", ctx);
		hb("Torlis", { ...tor, ctype: "paladin", x: 30, y: 0, esize: 20, gear: { w: { ring1: 6 }, own: {} }, worn: { ring1: { name: "rint", level: 0 } } });
		const sw = []; const si_s = ctx.send_item;
		ctx.unequip = (slot) => { const it = character.slots[slot]; character.slots[slot] = null; character.items[0] = it; sw.push(["unequip", slot]); return Promise.resolve(); };
		ctx.send_item = (to, k, q) => (sw.push(["send", to, character.items[k].name]), Promise.resolve());
		ctx.G.classes.paladin = { ...(ctx.G.classes.paladin || {}), main_stat: "str" };
		await vm.runInContext("swap_worn()", ctx);
		assert(JSON.stringify(sw) === '[["unequip","ring1"],["send","Torlis","rstr"]]', `mutual swap: our str ring goes to Torlis (${JSON.stringify(sw)})`);
		// no swap when only one side gains
		sw.length = 0; character.slots = { ring1: { name: "rint", level: 0 } }; character.items = Array(42).fill(null);
		vm.runInContext("my_gear_cache = null; swap_at = 0", ctx);
		hb("Torlis", { ...tor, ctype: "paladin", x: 30, y: 0, esize: 20, gear: { w: { ring1: 36 }, own: {} }, worn: { ring1: { name: "rstr", level: 0 } } });
		await vm.runInContext("swap_worn()", ctx);
		assert(sw.length === 0, "no swap when both already wear their best");
		ctx.equip = eq_s; ctx.unequip = uq_s; ctx.send_item = si_s;
		character.slots = {}; character.items = Array(42).fill(null);
		vm.runInContext("state.partners = {}; my_gear_cache = null", ctx);
	}
	// 102) v20.0: unexplained deaths; spending categories; probe reasons; gear leftovers
	{
		Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", x: 0, y: 0, map: "main", rip: false, hp: 2500, max_hp: 2500, attack: 180, range: 200, s: {} });
		vm.runInContext("state.partners = {}; state.merchant = null; state.errand = null; smart_depth = 0", ctx);
		ctx.parent.entities = {};
		// a death with no damage seen doesn't blame the pack
		vm.runInContext("pmring.hits = []; state.danger = {}; state.cooldown = {}; state.camp_deaths = {}; state.dead_handled = false; state.pack = { mtype: 'tortoise', map: 'main', boundary: [0,0,10,10] }; on_death(); state.dead_handled = false", ctx);
		const d102 = vm.runInContext("hist.ev.filter((e) => e.type === 'death').pop()", ctx);
		assert(d102 && d102.unexplained === true && !vm.runInContext("state.danger.tortoise", ctx), "death with no damage seen: logged unexplained, no safety cut");
		vm.runInContext("pmring.hits = [{ t: Date.now(), mtype: 'tortoise', dmg: 900 }]; state.pack = { mtype: 'tortoise', map: 'main', boundary: [0,0,10,10] }; on_death(); state.dead_handled = false", ctx);
		assert(vm.runInContext("state.danger.tortoise < 1", ctx), "death with damage seen: the safety cut still applies");
		// v25.29: each death at the same camp within 24h rests it 4x longer
		const rest = () => Math.round((vm.runInContext("state.cooldown['main:0,0,10,10']", ctx) - Date.now()) / 60000);
		const r1 = rest();
		vm.runInContext("pmring.hits = [{ t: Date.now(), mtype: 'tortoise', dmg: 900 }]; state.pack = { mtype: 'tortoise', map: 'main', boundary: [0,0,10,10] }; on_death(); state.dead_handled = false", ctx);
		const r2 = rest();
		vm.runInContext("pmring.hits = [{ t: Date.now(), mtype: 'tortoise', dmg: 900 }]; state.pack = { mtype: 'tortoise', map: 'main', boundary: [0,0,10,10] }; on_death(); state.dead_handled = false", ctx);
		const r3 = rest();
		assert(r1 === 30 && r2 === 120 && r3 === 480, `deaths at one camp: rested 30, 120, 480 min (${r1}, ${r2}, ${r3})`);
		vm.runInContext("state.cooldown = {}; state.camp_deaths['main:0,0,10,10'] = [Date.now() - 90000000]; pmring.hits = [{ t: Date.now(), mtype: 'tortoise', dmg: 900 }]; state.pack = { mtype: 'tortoise', map: 'main', boundary: [0,0,10,10] }; on_death(); state.dead_handled = false", ctx);
		assert(rest() === 30, "a death there over a day ago doesn't count");
		// v25.31: a member's death reaches the tank's count (it picks the camps); the same wipe twice counts once;
		// a shorter rest never shortens a longer one
		vm.runInContext("state.cooldown = {}; state.camp_deaths = {}", ctx);
		vm.runInContext("apply_verdict({ kind: 'incident', mtype: 'tortoise', mult: 0.6, key: 'main:0,0,10,10', cd: Date.now() + 1800000, death: true, at: Date.now() - 5000 }, 'Sanala')", ctx);
		vm.runInContext("apply_verdict({ kind: 'incident', mtype: 'tortoise', mult: 0.6, key: 'main:0,0,10,10', cd: Date.now() + 1800000, death: true, at: Date.now() - 5000 }, 'Aspernari')", ctx);
		assert(rest() === 30 && vm.runInContext("state.camp_deaths['main:0,0,10,10'].length", ctx) === 1, `a member's death: counted once, rested 30 min (${rest()})`);
		vm.runInContext("apply_verdict({ kind: 'incident', mtype: 'tortoise', mult: 0.6, key: 'main:0,0,10,10', cd: Date.now() + 1800000, death: true, at: Date.now() }, 'Sanala')", ctx);
		assert(rest() === 120, `a second member death there: 120 min on the tank, not capped at 60 (${rest()})`);
		vm.runInContext("rest_camp('main:0,0,10,10', 300000)", ctx);
		assert(rest() === 120, "a 5-min rest doesn't shorten a 2-hour one");
		vm.runInContext("apply_verdict({ kind: 'incident', mtype: 'tortoise', mult: 0.6, key: 'main:0,0,10,10', cd: Date.now() + 1800000, death: true, at: Date.now() - 3600000 }, 'Sanala')", ctx);
		assert(vm.runInContext("state.camp_deaths['main:0,0,10,10'].length", ctx) === 2, "a stale death verdict (an hour old) isn't counted");
		vm.runInContext("state.danger = {}; state.cooldown = {}; state.camp_deaths = {}; state.pack = null", ctx);
		// spending categories: the purchase tags the gold that leaves
		vm.runInContext(`globalThis.__hb3 = hist.buckets; hist.buckets = {}; tag_spend("ponty"); { const b = bucket(); b.spend = 500; b.cats = { ponty: 500 }; }`, ctx);
		assert(vm.runInContext("my_ledger().cats.ponty === 500 && /ponty 500/.test(cats_text(my_ledger().cats))", ctx), "ledger reports spending by category");
		assert(vm.runInContext("spend_cat_of(CFG.hp_pot) === 'potions'", ctx), "potions categorised");
		vm.runInContext("hist.buckets = globalThis.__hb3", ctx);
		// probe status says why it isn't running
		Object.assign(character, { name: "Torlis", ...tor, level: 51, hp: 1000, max_hp: 1000 });
		vm.runInContext("state.partners = {}; state.probe = null; state.probe_at = 0; state.errand = null", ctx);
		hb("Sanala", { ...san, level: 60, x: 2000, y: 0, hp: 3000, max_hp: 3000 });
		assert(/waiting for Sanala/.test(vm.runInContext("probe_why()", ctx)), `probe_why names who's missing (${vm.runInContext("probe_why()", ctx)})`);
		vm.runInContext("state.partners = {}", ctx);
		// gear: a guide-held input is worn only when 15%+ better
		ctx.G.items.cA = { type: "chest", armor: 100 }; ctx.G.items.cB = { type: "chest", armor: 110 }; ctx.G.items.cC = { type: "chest", armor: 130 };
		character.slots = { chest: { name: "cA", level: 0 } }; character.items = Array(42).fill(null); character.items[2] = { name: "cB", level: 0 };
		const eq102 = []; const eq_s2 = ctx.equip; ctx.equip = (k, slot) => (eq102.push(character.items[k].name), Promise.resolve());
		vm.runInContext("state.needs = new Map([['cB', 1], ['cC', 1]]); my_gear_cache = null; gear_busy = false; state.errand = null; state.gear_skip = {}", ctx);
		await vm.runInContext("equip_upgrades()", ctx);
		assert(!eq102.length, "a guide input only 10% better stays in the bags");
		character.items[2] = { name: "cC", level: 0 }; vm.runInContext("my_gear_cache = null", ctx);
		await vm.runInContext("equip_upgrades()", ctx);
		assert(JSON.stringify(eq102) === '["cC"]', `a guide input 30% better is worn (${eq102})`);
		ctx.equip = eq_s2; character.slots = {}; character.items = Array(42).fill(null);
		vm.runInContext("state.needs = new Map(); my_gear_cache = null", ctx);
		// bank snapshots: a newer one from another character is adopted, an older one isn't; off a bank floor ours isn't retaken
		vm.runInContext("state.bank_at = Date.now() - 600000; state.bank_gear = [{ name: 'old', level: 0 }]; state.bank_seen = { old: 1 }", ctx);
		handlers.cm({ name: "DoWhatNow", message: { k: "bank", at: Date.now() - 60000, seen: { fresh: 1 }, gear: [{ name: "fresh", level: 0 }] } });
		assert(vm.runInContext("state.bank_gear[0].name === 'fresh' && state.bank_by === 'DoWhatNow'", ctx), "a newer bank snapshot from the merchant is adopted");
		handlers.cm({ name: "Torlis", message: { k: "bank", at: Date.now() - 3600000, seen: { stale: 1 }, gear: [{ name: "stale", level: 0 }] } });
		assert(vm.runInContext("state.bank_gear[0].name === 'fresh'", ctx), "an older snapshot is ignored");
		character.map = "main"; character.bank = { items0: [{ name: "lingering", level: 0 }] };
		vm.runInContext("remember_bank()", ctx);
		assert(vm.runInContext("state.bank_gear[0].name === 'fresh'", ctx), "off a bank floor, a lingering character.bank doesn't overwrite the snapshot");
		character.bank = undefined; vm.runInContext("state.bank_gear = []; state.bank_seen = {}; state.bank_at = 0; state.bank_by = null", ctx);
	}
	// 104) v21.2: a fighter's own upgrade project is dropped once the merchant runs projects (its copies are freed)
	Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest" });
	vm.runInContext("state.upg = { name: 'wshield', to: 7, for: 'Aspernari', slot: 'offhand', gain: 38, cost: 12000 }; state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 0, y: 0 }", ctx);
	assert(vm.runInContext("upgrade_due() === false && state.upg === null", ctx), "merchant online: the fighter's project is dropped");
	vm.runInContext("state.merchant = null", ctx);
	// only the leader probes
	{
		vm.runInContext("state.partners = {}; state.directive = null; state.dir_lock = null; state.goals_cache = null", ctx);
		hb("Torlis", { ...tor, level: 60 });
		assert(vm.runInContext("is_follower() && probe_ready() === false && probe_why() === 'only the leader probes'", ctx), "a follower never probes (Torlis leads)");
		vm.runInContext("state.partners = {}", ctx);
	}
	// 105) v22.0: guide off (the default) → no guide reads, rows, farm rows, guide quests or held inputs
	{
		let called = 0; const gp_s = ctx.get_progression;
		ctx.get_progression = () => (called++, { ready: true, rows: [{ id: "upgrade:chest:coat:3:str", kind: "upgrade", action: { name: "coat" } }], plans: [] });
		vm.runInContext("CFG.guide_enabled = false; state.guide_quests = { wattire: { first: Date.now(), last: Date.now() } }; guide_refresh()", ctx);
		assert(called === 0 && vm.runInContext("state.guide === null && state.guide_farm === null && !next_guide_row(state.guide)", ctx), "guide off: not read, no rows, no farm row");
		assert(vm.runInContext("!is_guide_quest('wattire') && !state.needs.has('coat')", ctx), "guide off: no guide quests, nothing held for it");
		vm.runInContext("CFG.guide_enabled = true; state.guide_quests = {}", ctx); ctx.get_progression = gp_s;
	}
	// 106) v23.0 high-priority fixes
	{
		// (1) quest materials split between bags and bank: fetch the rest
		ctx.G.items.spores = { type: "material", s: 9999 };
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 52, map: "main", x: 0, y: 0, rip: false, esize: 30 });
		character.items = Array(42).fill(null); character.items[3] = { name: "spores", q: 12 }; character.slots = {};
		vm.runInContext("state.partners = {}; state.merchant = null; state.needs = new Map([['spores', 20]]); state.bank_seen = { spores: 8 }; state.fetch_try = {}; state.bank_gear = []; cmp_cache = null; craft_cache = null", ctx);
		assert(vm.runInContext("bag_plan().fetch.includes('spores')", ctx), "12 spores in bags + 8 in the bank, 20 needed → the bank's are fetched");
		character.items[3].q = 20;
		assert(!vm.runInContext("bag_plan().fetch.includes('spores')", ctx), "20 in bags → nothing fetched");
		ctx.G.items.hX = { type: "helmet", armor: 5 };
		character.items[3] = { name: "hX", level: 0 };
		vm.runInContext("state.needs = new Map([['hX', 2]]); state.bank_seen = { hX: 1 }", ctx);
		assert(!vm.runInContext("bag_plan().fetch.includes('hX')", ctx), "gear: a copy in the bags still blocks the fetch (no fetch/bank loop)");
		character.items = Array(42).fill(null);
		vm.runInContext("state.needs = new Map(); state.bank_seen = {}", ctx);

		ctx.G.classes.mage = { ...(ctx.G.classes.mage || {}), damage_type: "magical" };
		ctx.G.monsters.solo_t = { xp: 100, hp: 1000, attack: 30, frequency: 1, range: 20, speed: 10, respawn: 5, armor: 0, resistance: 0 };
		vm.runInContext("state.partners = {}; live_cache.clear()", ctx);

		// (3) the measurement unit: party kills (kill_credit)
		vm.runInContext("state.partners = {}; state.measured = {}", ctx);
		vm.runInContext(`state.session = { key: "main:1,1,9,9", mtype: "goo", est: 0, xp: 99999, kx: 0, kc: 0, kc_n: 0, start: Date.now() - 100000 };
			for (let i = 0; i < 10; i++) on_kill_credit({ mtype: "goo" }); end_session()`, ctx);
		assert(Math.round(vm.runInContext("state.measured['main:1,1,9,9']", ctx)) === 1, `together: 10 party kills x 10 xp / 100s = 1 (received xp ignored) (${vm.runInContext("state.measured['main:1,1,9,9']", ctx)})`);
		vm.runInContext(`state.session = { key: "main:1,1,9,8", mtype: "goo", est: 0, xp: 99999, kx: 50, kc: 0, kc_n: 0, start: Date.now() - 100000 }; end_session()`, ctx);
		assert(vm.runInContext("state.measured['main:1,1,9,8'] === undefined", ctx), "together with no kill_credit in the session: not measured");
		vm.runInContext("state.measured = {}", ctx);
		// the socket hook: kill_credit listener registered once, the previous script's replaced; emit re-wrapped after a reload
		{
			const on = [], off = []; let real = 0;
			const sock = { emit() { real++; }, on(ev, f) { on.push([ev, f]); }, off(ev, f) { off.push([ev, f]); } };
			ctx.parent.socket = sock;
			vm.runInContext("meter_socket(); meter_socket()", ctx);
			assert(on.length === 1 && on[0][0] === "kill_credit", `kill_credit listener registered once (${on.length})`);
			const old = () => {}; sock.__farmer_kc = old;
			vm.runInContext("meter_socket()", ctx);
			assert(off.length === 1 && off[0][1] === old && on.length === 2, "the previous script's listener is removed and ours added");
			sock.__xp_meter = []; // what a previous script leaves behind
			vm.runInContext("meter_socket(); sent.length = 0; parent.socket.emit('x')", ctx);
			assert(vm.runInContext("sent.length", ctx) === 1 && real === 1, `after a reload our meter counts again, one wrapper deep (${vm.runInContext("sent.length", ctx)} counted, ${real} sent)`);
			ctx.parent.socket = { emit() {} };
		}

		// (5) potions: the merchant bills, the fighter pays when near
		Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 42, gold: 200000, map: "main", x: 0, y: 0, rip: false, esize: 30 });
		character.items = Array(42).fill(null); character.items[0] = { name: "hpot1", q: 300 };
		const bills = [], si = ctx.send_item, scm = ctx.send_cm;
		ctx.send_item = () => Promise.resolve();
		ctx.send_cm = (to, m) => (bills.push([to.join(), m]), Promise.resolve());
		await vm.runInContext("give_pots({ name: 'Torlis', pots: { hp: 50, mp: 200 } })", ctx);
		const bill = bills.find(([, m]) => m.k === "bill");
		// v24.12: Torlis is 950 short of pot_buy 1000; we have 300 and keep self_pots 20 → 280 handed, billed at 20 each
		assert(bill && bill[0] === "Torlis" && bill[1].g === 280 * 20, `merchant bills Torlis for 280 hpot1 at 20 = 5600 (${JSON.stringify(bill)})`);
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 52, gold: 500000, map: "main", x: 0, y: 0 });
		character.items = Array(42).fill(null);
		vm.runInContext("state.owe = 0; state.partners = {}; handoff_busy = false; merchant_gold_at = Date.now()", ctx);
		handlers.cm({ name: "DoWhatNow", message: { k: "bill", g: 3000, what: "150 hpot1" } });
		assert(vm.runInContext("state.owe", ctx) === 3000, "the fighter records the bill");
		assert(/owes DoWhatNow 3k for potions/.test(vm.runInContext("report_lines(false).join('\\n')", ctx)), "report shows the unpaid bill");
		vm.runInContext("state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 50, y: 0, esize: 30, gold: 200000 }", ctx);
		const paid = []; const sg = ctx.send_gold; ctx.send_gold = (to, g) => (paid.push([to, g]), Promise.resolve());
		await vm.runInContext("merchant_handoff()", ctx);
		assert(JSON.stringify(paid) === '[["DoWhatNow",3000]]' && vm.runInContext("state.owe", ctx) === 0, `paid when the merchant is near (${JSON.stringify(paid)})`);
		ctx.send_gold = sg; ctx.send_item = si; ctx.send_cm = scm;
		vm.runInContext("state.merchant = null; state.partners = {}; state.owe = 0", ctx);
	}
	// 107) v23.1 medium fixes
	{
		const V = vm.runInContext("VERSION", ctx);
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, attack: 100, frequency: 1, hp: 1000, max_hp: 1000, map: "main", x: 0, y: 0, rip: false });
		vm.runInContext("state.partners = {}; state.measured = {}", ctx);
		// the probe timer is saved
		{
			const st = {}; const set_s = ctx.set, get_s = ctx.get;
			ctx.set = (k, v) => ((st[k] = JSON.parse(JSON.stringify(v))), true); ctx.get = (k) => st[k] ?? null;
			const t0 = Date.now() - 600000;
			vm.runInContext(`state.probe_at = ${t0}; save_state(); state.probe_at = 0; load_state()`, ctx);
			assert(vm.runInContext(`state.probe_at === ${t0}`, ctx), "probe_at survives a reload");
			ctx.set = set_s; ctx.get = get_s;
		}
		// bosses: judged with the whole party (members away count), engaged only once everyone is here
		ctx.G.monsters.bossx = { xp: 50000, hp: 100000, attack: 500, frequency: 1, range: 50, speed: 10, respawn: 600, armor: 0, resistance: 0 };
		vm.runInContext("state.partners = {}", ctx);
		hb("Torlis", { ...tor, level: 60, x: 3000, y: 0, max_hp: 20000, hp: 20000, armor: 900, resistance: 900, v: V });
		assert(vm.runInContext("boss_safe('bossx')", ctx), "boss: safe with the party (the tank, away, counts)");
		const atk107 = []; const atk_s = ctx.attack; ctx.attack = (e) => (atk107.push(e.id), Promise.resolve());
		ctx.parent.entities = { b1: { id: "b1", type: "monster", mtype: "bossx", visible: true, hp: 100000, max_hp: 100000, x: 10, y: 0, target: null } };
		vm.runInContext("inflight.attack = false; boss_tick({ mtype: 'bossx', map: 'main', boundary: [0,0,10,10], boss: true })", ctx);
		assert(atk107.length === 0, "boss: waits for the party before engaging");
		hb("Torlis", { ...tor, level: 60, x: 20, y: 0, max_hp: 20000, hp: 20000, armor: 900, resistance: 900, v: V });
		vm.runInContext("inflight.attack = false; boss_tick({ mtype: 'bossx', map: 'main', boundary: [0,0,10,10], boss: true })", ctx);
		assert(atk107.length === 0, "v24.46: the tank is here but hasn't hit it yet: still nobody else does");
		ctx.parent.entities.b1.target = "Torlis";
		vm.runInContext("inflight.attack = false; boss_tick({ mtype: 'bossx', map: 'main', boundary: [0,0,10,10], boss: true })", ctx);
		assert(atk107.includes("b1"), `boss: the tank has it → engage (${atk107})`);
		ctx.attack = atk_s; ctx.parent.entities = {}; vm.runInContext("state.partners = {}", ctx);
		// the shared bank, shared out: fighters short of a material claim the bank's copies in name order
		ctx.G.items.spores = { type: "material", s: 9999 };
		character.items = Array(42).fill(null); character.items[1] = { name: "spores", q: 10 }; // Sanala holds 10 of 20 → short 10
		vm.runInContext("state.needs = new Map([['spores', 20]]); state.bank_seen = { spores: 12 }", ctx);
		hb("Aspernari", { ...asp, x: 900, y: 0, qshort: { spores: 8 } });
		hb("Torlis", { ...tor, level: 60, x: 900, y: 0, qshort: { spores: 5 } });
		assert(vm.runInContext("bank_share('spores')", ctx) === 4, `12 in the bank: Aspernari 8, Sanala 4, Torlis 0 (${vm.runInContext("bank_share('spores')", ctx)})`);
		assert(vm.runInContext("owned_in_bags_or_bank('spores', 0)", ctx) === 14, "Sanala's quest counts 10 in bags + her 4");
		vm.runInContext("state.needs = new Map(); state.bank_seen = {}; state.partners = {}", ctx);
		character.items = Array(42).fill(null);
		// loot sharing: items per second that reach us = drops ÷ fighters in the party
		ctx.G.monsters.minimush = { xp: 20, hp: 50, attack: 1, frequency: 1, range: 20, speed: 10, respawn: 5, armor: 0, resistance: 0 };
		vm.runInContext("G.maps.main.monsters.push({ type: 'minimush', count: 6, boundary: [500, 500, 700, 700] }); state.measured = {}", ctx);
		const solo_ips = vm.runInContext("best_source('spores').ips", ctx);
		hb("Aspernari", { ...asp, x: 3000, y: 0, attack: 0 }); hb("Torlis", { ...tor, level: 60, x: 3000, y: 0, attack: 0 }); // (no damage of theirs: v24.35 counts the party's)
		const party_ips = vm.runInContext("best_source('spores').ips", ctx);
		assert(Math.abs(solo_ips / party_ips - 3) < 0.01, `3 fighters: a third of the spores reach us (${solo_ips} vs ${party_ips})`);
		vm.runInContext("state.partners = {}; G.maps.main.monsters = G.maps.main.monsters.filter((p) => p.type !== 'minimush')", ctx);
		// partner gear goes to the merchant when the partner is away
		ctx.G.items.plate2 = { type: "chest", armor: 300 };
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 60, gold: 500000, map: "main", x: 0, y: 0 });
		character.items = Array(42).fill(null); character.slots = { chest: { name: "plate2", level: 0 } }; character.items[2] = { name: "plate2", level: 0 };
		vm.runInContext("state.partners = {}; state.owe = 0; handoff_busy = false; merchant_gold_at = Date.now(); my_gear_cache = null; state.needs = new Map(); state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 40, y: 0, esize: 30, gold: 1e6 }", ctx);
		hb("Sanala", { ...san, level: 51, x: 3000, y: 0, gear: { w: { chest: 0 }, own: {} } });
		const gv = []; const si_s = ctx.send_item; ctx.send_item = (to, k, q) => (gv.push([to, character.items[k]?.name]), Promise.resolve());
		await vm.runInContext("merchant_handoff()", ctx);
		assert(JSON.stringify(gv) === '[["DoWhatNow","plate2"]]', `an upgrade for Sanala (away) goes to the merchant to deliver (${JSON.stringify(gv)})`);
		ctx.send_item = si_s; character.items = Array(42).fill(null); character.slots = {};
		vm.runInContext("state.merchant = null; state.partners = {}", ctx);
		// upgrade projects count what their steps cost, not total gold changes
		vm.runInContext("globalThis.__usw = upg_still_wanted; upg_still_wanted = () => true", ctx); // (these test the spending, not the target)
		vm.runInContext(`state.upg = { name: 'wbow', to: 3, for: 'Torlis', slot: 'mainhand', gain: 50, cost: 1e6, spent: 3e6 }; state.gear_skip = {};
			globalThis.__ru = run_upgrade; run_upgrade = async () => ({ success: true });`, ctx);
		Object.assign(character, { gold: 9e6 });
		await vm.runInContext("task_upgrade()", ctx);
		assert(vm.runInContext("state.upg === null && skipped('upg:wbow')", ctx), "3M spent on a 1M project → stopped, whatever our gold");
		// v24.85: gold that leaves during a step for something else (a transfer to the merchant) isn't the project's
		vm.runInContext(`state.upg = { name: 'wbow', to: 3, for: 'Torlis', slot: 'mainhand', gain: 50, cost: 1e6, spent: 0 }; state.gear_skip = {};
			run_upgrade = async () => { character.gold -= 971316; return { success: true }; };`, ctx);
		Object.assign(character, { gold: 9e6 });
		await vm.runInContext("task_upgrade()", ctx);
		assert(vm.runInContext("state.upg !== null && state.upg.spent < 1e6 && !skipped('upg:wbow')", ctx), `a 971k transfer during the steps isn't counted as the project's spending (spent ${vm.runInContext("JSON.stringify([state.upg, best_level_held('wbow'), Object.keys(state.gear_skip)])", ctx)} ${JSON.stringify(log.slice(-4))})`);
		vm.runInContext("state.upg = null; state.gear_skip = {}", ctx);
		vm.runInContext("state.upg = { name: 'wbow', to: 9, for: 'Torlis', slot: 'mainhand', gain: 50, cost: 1e6 }; state.gear_skip = {}; run_upgrade = async () => { character.gold -= 4000; return { success: true }; }", ctx);
		character.items = Array(42).fill(null); character.items[0] = { name: "computer" };
		await vm.runInContext("task_upgrade()", ctx);
		assert(vm.runInContext("state.upg && state.upg.spent >= 4000", ctx), `each step's cost is added (${vm.runInContext("state.upg && state.upg.spent", ctx)})`);
		vm.runInContext("run_upgrade = globalThis.__ru; upg_still_wanted = __usw; state.upg = null; state.gear_skip = {}", ctx);
		// v24.91: a project whose target no longer beats what its member wears is dropped
		vm.runInContext("state.upg = { name: 'wbow', to: 3, for: character.name, slot: 'mainhand', gain: 5, cost: 1e5, spent: 0 }; my_gear_cache = null; upgrade_due()", ctx);
		assert(vm.runInContext("!state.upg || state.upg.name !== 'wbow'", ctx), `a project for a piece its member can't use (or has something better than) is dropped (${vm.runInContext("JSON.stringify([character.name, character.ctype, gear_takers().map((m) => m.name + ':' + m.ctype + ':' + !!(m.g && m.g.w)), !!gear_gain({ name: 'wbow', level: 3 }, character.ctype, my_gear()), CFG.upgrade_auto])", ctx)})`);
		character.items = Array(42).fill(null);
		// compounds of NPC-sold items take the rebuyable odds only while the three copies are cheap
		{
			ctx.G.items.cring = { type: "ring", compound: {}, g: 10000 }; ctx.G.npcs.jeweler = { items: ["cring"] };
			const fn_s = ctx.find_npc; ctx.find_npc = () => ({ map: "main", x: 0, y: 0 });
			const floors = [];
			vm.runInContext(`globalThis.__cg2 = compound_groups; globalThis.__rc2 = run_compound; globalThis.__lvl = 0;
				compound_groups = () => [{ name: "cring", level: globalThis.__lvl, key: "cmp:cring:" + globalThis.__lvl, bags: [1, 2, 3], bank: 0 }];
				run_compound = (a, row, floor) => { globalThis.__floors.push(floor); return Promise.resolve({ success: true }); };
				globalThis.__floors = []; CFG.compound_per_run = 1;`, ctx);
			await vm.runInContext("task_compound()", ctx);
			vm.runInContext("globalThis.__lvl = 2", ctx);
			await vm.runInContext("task_compound()", ctx);
			const fl = vm.runInContext("globalThis.__floors", ctx);
			assert(fl[0] === 0.6 && fl[1] === 0.75, `cring+0 (3 x 10k) at 60%; cring+2 (worth 270k) needs 75% (${JSON.stringify(fl)})`);
			vm.runInContext("compound_groups = globalThis.__cg2; run_compound = globalThis.__rc2; CFG.compound_per_run = 6; cmp_cache = null", ctx);
			ctx.find_npc = fn_s;
		}
	}
	// 108) v23.2 low-priority fixes
	{
		const V = vm.runInContext("VERSION", ctx);
		// bank upgrades: one per (member, slot), so two fighters' chest upgrades are both fetched
		ctx.G.items.chA = { type: "chest", armor: 300 }; ctx.G.items.chB = { type: "chest", armor: 280 };
		Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 42, map: "main", x: 0, y: 0, rip: false, esize: 30 });
		character.items = Array(42).fill(null); character.slots = { chest: { name: "chB", level: 0 } }; // the merchant has its own
		vm.runInContext("state.partners = {}; state.bank_gear = [{ name: 'chA', level: 0 }, { name: 'chB', level: 0 }]; state.gear_skip = {}; my_gear_cache = null", ctx);
		hb("Torlis", { ...tor, level: 60, gear: { w: { chest: 0 }, own: {} } });
		hb("Sanala", { ...san, level: 51, gear: { w: { chest: 0 }, own: {} } });
		const bu = vm.runInContext("bank_upgrades().map((u) => u.name).sort().join()", ctx);
		assert(bu === "chA,chB", `both members' chest upgrades are fetched (${bu})`);
		vm.runInContext("state.bank_gear = []; state.partners = {}", ctx); character.slots = {};
		// report() and history() back to back: both collected, both answered
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51 });
		const cm108 = []; const scm = ctx.send_cm; ctx.send_cm = (to, m) => (cm108.push([to.join(), m]), Promise.resolve());
		vm.runInContext("report(0); history(1)", ctx);
		const ids = cm108.filter(([, m]) => m.k === "rreq").map(([, m]) => m.id);
		assert(ids.length === 2 && vm.runInContext(`gathers.has("${ids[0]}") && gathers.has("${ids[1]}")`, ctx), "two collections run at once");
		cm108.length = 0; vm.runInContext("for (const k in report_reply_at) delete report_reply_at[k]", ctx);
		handlers.cm({ name: "Torlis", message: { k: "rreq", id: "r1", hours: 0 } });
		handlers.cm({ name: "Torlis", message: { k: "rreq", id: "h1", hours: 1, kind: "history" } });
		assert(cm108.filter(([, m]) => m.k === "rrep").length === 2, "a report request and a history request from the same member are both answered");
		for (const id of ids) vm.runInContext(`report_finish("${id}")`, ctx);
		ctx.send_cm = scm;
		// history: a bucket half inside the window counts half
		{
			const hb_s = vm.runInContext("hist.buckets", ctx);
			const h0 = Math.floor(Date.now() / 3600000) * 3600000;
			vm.runInContext(`hist.buckets = { [${h0 - 3600000}]: { time: { walk: 3600 }, xp: 0, gold: 0, kills: 0, deaths: 0, flees: 0 }, [${h0}]: { time: { fight: 100 }, xp: 0, gold: 0, kills: 0, deaths: 0, flees: 0 } }`, ctx);
			const line = vm.runInContext("history_lines(1).find((l) => l.startsWith('time:'))", ctx);
			const now = Date.now(), into = (now - h0) / 3600000, walk = 3600 * (1 - into), pct = Math.round(walk / (walk + 100) * 100);
			assert(new RegExp(`walk ${pct}%`).test(line), `history(1): only the last hour's part of the older bucket counts (${line}; expected walk ${pct}%)`);
			ctx.__hb_s = hb_s; vm.runInContext("hist.buckets = __hb_s", ctx);
		}
		// upgrade projects skip a piece another member already has at the target level
		hb("Torlis", { ...tor, level: 60, bag_lv: { wbow: 7 } });
		assert(vm.runInContext("party_holds_level('wbow', 7) && !party_holds_level('wbow', 8)", ctx), "Torlis carries wbow+7: a +7 project is skipped, +8 isn't");
		Object.assign(character, { name: "Aspernari", ...asp });
		vm.runInContext("state.partners = {}", ctx);
		character.items = Array(42).fill(null);
	}
	// 109) v23.3: the report's checks line flags what looks wrong
	{
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, rip: false });
		character.items = Array(42).fill(null);
		vm.runInContext("state.partners = {}; state.owe = 0; hist.ev = []; seen.kill = 0; seen.kc = 0; seen.target_hit = 5", ctx);
		hb("Torlis", { ...tor, level: 60 });
		assert(vm.runInContext("health_checks().length", ctx) === 0, `nothing wrong → no checks (${vm.runInContext("JSON.stringify(health_checks())", ctx)})`);
		assert(/^checks: ok$/m.test(vm.runInContext("report_lines(false).join('\\n')", ctx)), "report: checks: ok");
		vm.runInContext("seen.kill = 30; state.owe = 900000; log_ev('death', { killer: 'x' })", ctx);
		const w = vm.runInContext("health_checks().join(' | ')", ctx);
		assert(/no kill_credit/.test(w) && /owes the merchant 900k/.test(w) && /1 death/.test(w), `flags missing kill_credit, a big unpaid bill, a death (${w})`);
		vm.runInContext("seen.kill = 0; state.owe = 0; hist.ev = []; state.partners = {}", ctx);
	}
	// 110) v23.4: the xp stat is worth attack x fighters x 1% (merchants: nothing)
	{
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, attack: 400 });
		vm.runInContext("state.partners = {}; my_gear_cache = null", ctx);
		hb("Torlis", { ...tor, level: 60 }); hb("Aspernari", { ...asp });
		ctx.G.items.xorb = { type: "orb", xp: 5 };
		// v24.7: not x party size (+1% xp on one fighter = 1/n of party xp = +1% of its own damage)
		assert(Math.abs(vm.runInContext("xp_weight('mage')", ctx) - 4) < 1e-9, `3 fighters, attack 400: 4 points per xp, as alone (${vm.runInContext("xp_weight('mage')", ctx)})`);
		assert(vm.runInContext("gear_score({ name: 'xorb', level: 0 })", ctx) === 20 && vm.runInContext("gear_score({ name: 'xorb', level: 0 }, 'merchant')", ctx) === 0, "an orb with +5 xp: 20 points for a fighter, 0 for the merchant");
		vm.runInContext("state.partners = {}", ctx);
		assert(Math.abs(vm.runInContext("xp_weight('mage')", ctx) - 4) < 1e-9, "alone: 4 points per xp");
	}
	// 111) v23.5: self-tuning safety limit; side goals need 70% of the best xp/s
	{
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51 });
		vm.runInContext("state.safety_mult = 1; state.safety_at = Date.now() - 2.1 * 3600000; hist.ev = []", ctx);
		vm.runInContext("safety_tune()", ctx);
		assert(Math.abs(vm.runInContext("safety_now()", ctx) - 0.35 * 1.15) < 1e-9, `2h calm → 35% x 1.15 (${vm.runInContext("safety_now()", ctx)})`);
		vm.runInContext("safety_tune()", ctx);
		assert(Math.abs(vm.runInContext("safety_now()", ctx) - 0.35 * 1.15) < 1e-9, "not again until another step_h");
		vm.runInContext("state.safety_mult = 10; ", ctx);
		assert(vm.runInContext("safety_now()", ctx) === 0.6, "capped at safety_tune.max");
		vm.runInContext("state.safety_mult = 1.5; safety_tune('flee')", ctx);
		assert(Math.abs(vm.runInContext("state.safety_mult", ctx) - 1.5 * 0.85) < 1e-9, "a flee lowers it a step");
		vm.runInContext("safety_tune('death')", ctx);
		assert(vm.runInContext("state.safety_mult", ctx) === 1 && vm.runInContext("safety_now()", ctx) === 0.35, "a death resets it");
		vm.runInContext("state.safety_mult = 1; state.safety_at = 0; hist.ev = []", ctx);
		assert(vm.runInContext("CFG.quest_farm_min_xp === 0.7 && CFG.hunt_min_xp === 0.7", ctx), "side goals: 70% of the best xp/s");
	}
	// 112) v23.6: party-wide safety; a hunt alone doesn't start a trip; side goals vs this pick's best
	{
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, hp: 1000, max_hp: 1000, map: "main", x: 0, y: 0, rip: false, esize: 30 });
		vm.runInContext("state.partners = {}; state.safety_mult = 1.5", ctx);
		hb("Torlis", { ...tor, level: 60, safety_mult: 1 }); // Torlis died: his limit is back to 35%
		assert(Math.abs(vm.runInContext("safety_now()", ctx) - 0.35) < 1e-9, "the party's lowest limit (35%)");
		vm.runInContext("state.safety_mult = 1; state.partners = {}", ctx);
		// a hunt alone waits for another trip
		vm.runInContext(`globalThis.__td3 = town_due; globalThis.__tr3 = town_run; globalThis.__runs3 = 0; smart_depth = 0; state.errand = null;
			town_run = () => { globalThis.__runs3++; return true; }; state.last_town = 0; state.town_end_at = 0; state.town_runs = []; state.gear_skip = {}; state.regroup_due = false; state.ptown = null;
			town_due = () => ({ hunt: true, plan: { free: 30, bank: [], sell: [], fetch: [] }, min_free: 10, pot_min: 30 }); town_check()`, ctx);
		assert(vm.runInContext("globalThis.__runs3 === 0 && /hunt or stat scrolls alone/.test(state.town_block.blockers.join())", ctx), "a hunt alone: no trip");
		vm.runInContext("town_due = () => ({ hunt: true, restock: true, plan: { free: 30, bank: [], sell: [], fetch: [] }, min_free: 10, pot_min: 30 }); town_check()", ctx);
		assert(vm.runInContext("globalThis.__runs3 === 1", ctx), "a hunt with potions due: the trip goes (and takes the hunt)");
		vm.runInContext("town_due = globalThis.__td3; town_run = globalThis.__tr3; state.last_town = 0; state.town_end_at = 0", ctx);
		// side goals compare with this pick's best, not the best rate ever measured
		vm.runInContext("(state.best_score = 400, state.best_at = Date.now()); state.measured = { 'main:0,0,1,1': 2000 }", ctx);
		assert(vm.runInContext("best_known_xps()", ctx) === 400, "a picker: its current best (400), not an old 2000 measurement");
		vm.runInContext("state.best_score = 0; state.best_ref = null", ctx);
		assert(vm.runInContext("best_known_xps() === best_score() && best_known_xps() !== 400", ctx), "no fresh pick of our own (a follower): the best spot, computed");
		vm.runInContext("(state.best_score = 400, state.best_at = Date.now() - 700000); state.best_ref = null", ctx);
		assert(vm.runInContext("best_known_xps() !== 400", ctx), "...nor one over 10 min old");
		vm.runInContext("state.measured = {}; state.best_score = 0", ctx);
	}
	// 114) v24.2: builds are compared by version and, when both know it, commit
	{
		assert(vm.runInContext("other_build('1.0', null) && !other_build(VERSION, null) && !other_build(VERSION, 'abc1234')", ctx), "another version differs; the same version with no commit of our own to compare doesn't");
		assert(vm.runInContext("build_txt('24.2', 'abc1234') === 'v24.2@abc1234' && build_txt('24.2', null) === 'v24.2'", ctx), "build text");
		const sent114 = []; const scm = ctx.send_cm; ctx.send_cm = (to, m) => { sent114.push(m); return Promise.resolve(); };
		vm.runInContext("heartbeat()", ctx); ctx.send_cm = scm;
		assert(sent114.some((m) => m.k === "hb" && "b" in m), "the heartbeat carries the build commit");
	}
	// 115) v24.3 review fixes: quest goals carry the xp floor; hunts aren't double-counted; a dropped probe isn't "held";
	// measurements age
	{
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, hp: 1000, max_hp: 1000, map: "main", x: 0, y: 0, rip: false });
		vm.runInContext(`state.partners = {}; state.probe = null; state.recovering = false; hist.ev = [];
			globalThis.__s115 = { mt_xps, quest_recipes, recipe_open, drop_sources, kills_per_s, hmx: CFG.hunt_min_xp, qc: CFG.quest_crafts };
			CFG.quest_crafts = true; quest_recipes = () => ["qx115"]; recipe_open = () => true; drop_sources = () => [["goo", 0.5]]; kills_per_s = () => 1;
			G.craft.qx115 = { items: [[5, "spores115", 0]] };`, ctx);
		// #1: the leader's shared pick uses members' goal lists, so the floor applies there too
		vm.runInContext("(state.best_score = 1000, state.best_at = Date.now()); mt_xps = () => 100; state.goals_cache = null", ctx);
		assert(vm.runInContext("!goals_list().some((g) => /qx115/.test(g.reason))", ctx), "a quest monster at 10% of the best xp/s isn't on the goal list");
		vm.runInContext("mt_xps = () => 800; state.goals_cache = null", ctx);
		assert(vm.runInContext("goals_list().some((g) => /qx115/.test(g.reason))", ctx), "at 80% it is");
		vm.runInContext("kills_per_s = () => 0.0001; state.goals_cache = null", ctx);
		assert(vm.runInContext("!goals_list().some((g) => /qx115/.test(g.reason))", ctx), "...unless finishing takes over quest_farm_max_h");
		// #7: together, the hunt rate is already the party's
		vm.runInContext("CFG.hunt_min_xp = 0; kills_per_s = () => 0.05", ctx);
		hb("Torlis", { ...tor, level: 60, x: 30, y: 0 }); hb("Aspernari", { ...asp, level: 58, x: -30, y: 0 });
		assert(vm.runInContext("partners_near().length === 2 && !hunt_feasible({ id: 'goo', c: 100, ms: 1800000 })", ctx),
			"100 kills at the party's 0.05/s (2000s) don't fit in 30 min — not x2.2 for the members near");
		// #10: a measurement's weight halves every meas_half_h
		vm.runInContext("state.measured['main:9,9,9,9'] = 100; state.meas_at['p:main:9,9,9,9'] = Date.now() - CFG.meas_half_h * 3600000", ctx);
		assert(Math.abs(vm.runInContext("meas_aged('main:9,9,9,9', 300)", ctx) - 200) < 0.5, "12h old: half measured (100), half estimate (300)");
		vm.runInContext("state.meas_at['p:main:9,9,9,9'] = Date.now()", ctx);
		assert(Math.abs(vm.runInContext("meas_aged('main:9,9,9,9', 300)", ctx) - 100) < 0.5, "fresh: the measurement");
		vm.runInContext("delete state.measured['main:9,9,9,9']; state.meas_at = {}", ctx);
		// #3: a probe started by a member that isn't the leader (any more) stops being its own
		Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", level: 58 });
		vm.runInContext("state.partners = {}; state.probe_at = 0; state.probe = { mtype: 'edge', start: Date.now() - 120000, until: Date.now() + 1e6, ratio: 1.3 }", ctx);
		hb("Torlis", { ...tor, level: 60 });
		vm.runInContext("lead_lost()", ctx);
		assert(vm.runInContext("leader_name() === 'Torlis' && !state.probe && hist.ev.some((e) => e.type === 'probe' && e.result === 'dropped')", ctx), "not leading: the probe is dropped, not later closed as held");
		// #2: the leader's death ends a probe as failed
		assert(/else if \(character\.rip\) \{\s*(?:if \(character\.cave[^\n]*\n\s*)?probe_check\(\);/.test(src), "the death branch runs probe_check");
		vm.runInContext(`state.recovering = false; const S = globalThis.__s115; mt_xps = S.mt_xps; quest_recipes = S.quest_recipes; recipe_open = S.recipe_open;
			drop_sources = S.drop_sources; kills_per_s = S.kills_per_s; CFG.hunt_min_xp = S.hmx; CFG.quest_crafts = S.qc; delete G.craft.qx115;
			state.partners = {}; state.goals_cache = null; hist.ev = []`, ctx);
	}
	// 116) v24.4 combat review fixes: the (merchant's) flee channel survives; smash/curse/energize
	// spend sensibly; targets stay near the pack; interrupted walks don't block travel; time away resets the watchdog
	{
		// fleeing to town is the merchant's alone (fighters never flee)
		Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 42, hp: 300, max_hp: 1000, mp: 1000, max_mp: 1000, map: "main", x: 0, y: 0, rip: false, c: {} });
		const rec = [], sk = []; const us = ctx.use_skill, gnm = ctx.get_nearest_monster;
		ctx.use_skill = (n, t, x) => (sk.push([n, t, x]), Promise.resolve());
		vm.runInContext(`state.partners = {}; state.pack = null; globalThis.__f116 = { fight, choose_target, hit_on_me, fire }; globalThis.__fought = [];
			fight = (t, steer) => globalThis.__fought.push([t.id, steer]); choose_target = () => globalThis.__thr || null;
			hit_on_me = () => globalThis.__thr || null; fire = (s, t, x) => (s === "attack" ? (globalThis.__fought.push([t.id, s]), true) : globalThis.__f116.fire(s, t, x)); // v25.4: merchant_fight_back
			Object.assign(state, { recovering: true, fled: false, fled_home: false, town_at: 0 }); pmring.hits.length = 0;
			for (const k in inflight) inflight[k] = false;`, ctx);
		const T116 = { id: "x116", mtype: "goo", target: "DoWhatNow" };
		ctx.get_nearest_monster = (a) => (a && a.target === "DoWhatNow" && ctx.__thr ? ctx.__thr : null);
		ctx.__thr = T116;
		vm.runInContext("recover()", ctx);
		assert(vm.runInContext("globalThis.__fought.length === 1 && globalThis.__fought[0][1] === 'attack'", ctx) && !sk.some(([n]) => n === "use_town"),
			`something on us: attack it (v25.4: a plain attack; it used to steer toward it), no channel (its hits would cancel it) (${vm.runInContext("JSON.stringify(globalThis.__fought)", ctx)})`);
		ctx.__thr = null; vm.runInContext("pmring.hits.push({ t: Date.now() - 500, mtype: 'goo', dmg: 50 }); recover()", ctx);
		assert(!sk.some(([n]) => n === "use_town"), "hit 0.5s ago: still not quiet enough to channel");
		vm.runInContext("pmring.hits.length = 0; pmring.hits.push({ t: Date.now() - 5000, mtype: 'goo', dmg: 50 }); recover()", ctx);
		assert(sk.filter(([n]) => n === "use_town").length === 1 && vm.runInContext("state.town_at > Date.now() - 1000", ctx), "quiet: channel");
		character.c = { town: { ms: 3000 } }; character.items[0] = { name: "hpot1", q: 5 };
		vm.runInContext("for (const k in inflight) inflight[k] = false; globalThis.__fought = []; sustain(); recover()", ctx);
		assert(!sk.some(([n]) => n === "use_hp") && vm.runInContext("globalThis.__fought.length === 0", ctx), "channelling: no potion (it'd cancel), no fighting");
		character.c = {};
		vm.runInContext("for (const k in inflight) inflight[k] = false; state.town_at = Date.now() - 2000; recover()", ctx);
		assert(sk.filter(([n]) => n === "use_town").length === 2, "a cancelled channel is retried at 30% HP (the old code only retried under flee_hp)");
		vm.runInContext("for (const k in inflight) inflight[k] = false; G.maps.main.spawns = [[0, 0]]; state.town_at = Date.now() - 2000; recover()", ctx);
		assert(sk.filter(([n]) => n === "use_town").length === 2 && vm.runInContext("state.fled_home", ctx), "at the town spot: no more channels");
		vm.runInContext("delete G.maps.main.spawns", ctx);
		// regen only when nothing's on us (it locks potions 4s)
		character.hp = 700; ctx.__thr = T116; sk.length = 0;
		vm.runInContext("for (const k in inflight) inflight[k] = false; sustain()", ctx);
		assert(!sk.some(([n]) => n.startsWith("regen")), "attacked at 70%: no regen");
		ctx.__thr = null; vm.runInContext("pmring.hits.length = 0; for (const k in inflight) inflight[k] = false; sustain()", ctx);
		assert(sk.some(([n]) => n === "regen_hp"), "calm at 70%: regen");
		character.items[0] = null;
		vm.runInContext("state.recovering = false; state.fled_home = false", ctx);
		vm.runInContext("pmring.hits.length = 0; state.dead_handled = false; state.danger = {}; state.cooldown = {}; state.safety_mult = 1; hit_on_me = globalThis.__f116.hit_on_me; fire = globalThis.__f116.fire; fight = globalThis.__f116.fight; choose_target = globalThis.__f116.choose_target", ctx);
		// paladin smash: only from MP above the floor, only with a mace
		Object.assign(character, { name: "Torlis", ctype: "paladin", hp: 1000, max_hp: 1000, mp: 900, max_mp: 1000, attack: 100, slots: { mainhand: { name: "mace116" } } });
		vm.runInContext("globalThis.__pur = G.skills.purify; delete G.skills.purify; G.skills.smash = { mp: 380, cooldown: 320, wtype: 'mace' }; G.items.mace116 = { wtype: 'mace', type: 'weapon' }; G.items.blade116 = { wtype: 'sword', type: 'weapon' }", ctx);
		const tgt = { id: "big116", mtype: "goo", hp: 5000, max_hp: 5000, s: {} };
		const iir116 = ctx.is_in_range; ctx.is_in_range = () => true;
		sk.length = 0; ctx.__tgt = tgt;
		vm.runInContext("for (const k in inflight) inflight[k] = false; class_skills(globalThis.__tgt)", ctx);
		assert(!sk.some(([n]) => n === "smash"), "MP 900/1000 (under 60% + 380): no smash");
		character.mp = 1000; vm.runInContext("for (const k in inflight) inflight[k] = false; class_skills(globalThis.__tgt)", ctx);
		assert(sk.some(([n]) => n === "smash"), "MP full with a mace: smash");
		sk.length = 0; character.slots = { mainhand: { name: "blade116" } };
		vm.runInContext("for (const k in inflight) inflight[k] = false; class_skills(globalThis.__tgt)", ctx);
		assert(!sk.some(([n]) => n === "smash"), "no mace: no smash (the server refuses it without a cooldown)");
		vm.runInContext("delete G.skills.smash; delete G.items.mace116; delete G.items.blade116; if (globalThis.__pur) G.skills.purify = globalThis.__pur", ctx);
		ctx.is_in_range = iir116;
		// mage energize: what the partner is missing, keeping 40% of ours
		Object.assign(character, { name: "Sanala", ctype: "mage", mp: 1500, max_mp: 2300, slots: {} });
		vm.runInContext("G.skills.energize = { range: 320, cooldown: 4000 }", ctx);
		const asp116 = { id: "Aspernari", name: "Aspernari", type: "character", visible: true, mp: 100, max_mp: 2000, x: 10, y: 0 };
		ctx.parent.entities.Aspernari = asp116; sk.length = 0;
		vm.runInContext("for (const k in inflight) inflight[k] = false; class_skills({ id: 'z', hp: 1, s: {} })", ctx);
		const en = sk.find(([n]) => n === "energize");
		assert(en && en[1] === asp116 && en[2] === 580, `energize sends an amount: 1500 - 40% of 2300 = 580 MP (sent ${en && en[2]})`);
		delete ctx.parent.entities.Aspernari; vm.runInContext("delete G.skills.energize", ctx);
		// targets: only near the pack area; a picked one stays while chased past the margin
		Object.assign(character, { hp: 1000, mp: 1000, x: 250, y: 250 });
		vm.runInContext("state.pack = { mtype: 'goo', map: 'main', boundary: [100, 100, 400, 400] }; state.safe = { goo: { ttk: 1, xp: 10 } }; state.bad_ids = {}", ctx);
		const far = { id: "far116", type: "monster", mtype: "goo", visible: true, x: 1500, y: 250, hp: 100, max_hp: 100, xp: 10 };
		ctx.parent.entities.far116 = far;
		assert(vm.runInContext("choose_target(true)", ctx) === null || vm.runInContext("choose_target(true)", ctx)?.id !== "far116", "a goo 1100px past the area isn't picked");
		far.x = 700; // 300px past the edge: within near_pad
		const picked = vm.runInContext("choose_target(true)", ctx);
		ctx.get_targeted_monster = () => far;
		const kept = vm.runInContext("choose_target(false, true)", ctx), notkept = vm.runInContext("choose_target(false)", ctx);
		ctx.get_targeted_monster = () => null;
		assert(picked?.id === "far116" && kept?.id === "far116" && notkept === null, `within near_pad: picked, and kept outside the margin (${picked?.id}, ${kept?.id}, ${notkept})`);
		delete ctx.parent.entities.far116;
		// travel: an interrupted walk doesn't block the next one
		const smv = ctx.smart_move; ctx.smart_move = () => Promise.reject({ reason: "interrupted" });
		vm.runInContext("state.travel_block_until = 0; globalThis.__tp = travel({ map: 'main', x: 5, y: 5 })", ctx);
		await vm.runInContext("globalThis.__tp", ctx);
		assert(vm.runInContext("!(state.travel_block_until > Date.now())", ctx), "interrupted walk: no 5s travel block");
		ctx.smart_move = () => Promise.reject({ reason: "failed" });
		vm.runInContext("globalThis.__tp = travel({ map: 'main', x: 5, y: 5 })", ctx);
		await vm.runInContext("globalThis.__tp", ctx);
		assert(vm.runInContext("state.travel_block_until > Date.now()", ctx), "a failing path still is");
		ctx.smart_move = smv;
		// watchdog: time away isn't time at the pack
		vm.runInContext("wd.pos = [{ t: Date.now() - 600000, map: 'main', x: 0, y: 0, hits: 0, kills: 0, kc: 0 }]; state.recovering = true; watchdog()", ctx);
		assert(vm.runInContext("wd.pos.length === 1 && wd.pos[0].t > Date.now() - 5000", ctx), "recovering: the watchdog's samples restart");
		vm.runInContext("state.recovering = false; state.pack = null; state.travel_block_until = 0; wd.pos = []", ctx);
		ctx.use_skill = us; ctx.get_nearest_monster = gnm;
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, hp: 1000, max_hp: 1000, mp: 500, max_mp: 500, x: 0, y: 0, c: {}, slots: {} });
	}
	// 117) v24.5 town/gear review fixes: the merchant leaves fighter gear to fighters (and takes worn pieces off);
	// bank copies go one per member; locked bank items are ignored; stacks list per unit; a stopped project is capped
	{
		Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 42, map: "main", x: 0, y: 0, rip: false, esize: 30, stand: false });
		character.items = Array(42).fill(null); character.slots = {};
		ctx.G.items.helm117 = { type: "helmet", armor: 60 };
		vm.runInContext("state.partners = {}; state.gear_skip = {}; state.errand = null; my_gear_cache = null; gear_busy = false; m_release_at = 0", ctx);
		hb("Torlis", { ...tor, level: 60, gear: { w: { helmet: 0 }, own: {} } });
		character.items[2] = { name: "helm117", level: 0 };
		const eq = []; const eq0 = ctx.equip, uq0 = ctx.unequip;
		ctx.equip = (k, slot) => { eq.push(slot); character.slots[slot] = character.items[k]; character.items[k] = null; return Promise.resolve(); };
		ctx.unequip = (slot) => { eq.push("off:" + slot); const k = character.items.findIndex((i) => !i); character.items[k] = character.slots[slot]; delete character.slots[slot]; return Promise.resolve(); };
		await vm.runInContext("equip_upgrades()", ctx);
		assert(!eq.length && character.items[2]?.name === "helm117", `merchant: a helmet Torlis would gain from isn't worn (${eq})`);
		character.slots.helmet = character.items[2]; character.items[2] = null;
		vm.runInContext("my_gear_cache = null", ctx);
		await vm.runInContext("equip_upgrades()", ctx);
		assert(eq.join() === "off:helmet" && !character.slots.helmet, `...and one it already wears comes off, for delivery (${eq})`);
		eq.length = 0;
		hb("Torlis", { ...tor, level: 60, gear: { w: { helmet: 1e6 }, own: {} } });
		vm.runInContext("my_gear_cache = null; m_release_at = 0", ctx);
		await vm.runInContext("equip_upgrades()", ctx);
		assert(eq.join() === "", `v24.7: no fighter wants it, but the merchant doesn't wear gear by default (${eq})`);
		vm.runInContext("CFG.merchant.wear_gear = true; my_gear_cache = null", ctx);
		await vm.runInContext("equip_upgrades()", ctx);
		vm.runInContext("CFG.merchant.wear_gear = false", ctx);
		assert(eq.join() === "helmet", `with wear_gear on, it wears what no fighter wants (${eq})`);
		ctx.equip = eq0; ctx.unequip = uq0; character.slots = {}; character.items = Array(42).fill(null);
		// bank: the merchant fetches for fighters first; each copy to one member
		hb("Torlis", { ...tor, level: 60, gear: { w: { helmet: 0 }, own: {} } });
		vm.runInContext("state.bank_gear = [{ name: 'helm117', level: 0 }]; my_gear_cache = null", ctx);
		assert(vm.runInContext("bank_upgrades().length === 1", ctx), "one bank copy, one fetch");
		// locked bank items aren't counted or listed
		character.map = "bank"; character.bank = { items0: [{ name: "helm117", level: 0, l: "l" }, { name: "spores", q: 7, l: "l" }, { name: "spores", q: 3 }] };
		vm.runInContext("state.bank_gear = []; state.bank_seen = {}; remember_bank()", ctx);
		assert(vm.runInContext("state.bank_gear.length === 0 && state.bank_seen.spores === 3", ctx), `locked bank items ignored (${vm.runInContext("JSON.stringify([state.bank_gear, state.bank_seen])", ctx)})`);
		character.map = "main"; character.bank = undefined; vm.runInContext("state.bank_gear = []; state.bank_seen = {}; state.bank_at = 0", ctx);
		// worn pieces carry their lock (a swap never takes a locked partner piece)
		character.slots = { ring1: { name: "goldring", level: 0, l: "l" } };
		assert(vm.runInContext("worn_items().ring1.l === true", ctx), "worn_items marks a locked piece");
		character.slots = {};
		// stand: a stack is listed at a per-unit price
		ctx.G.items.gem117 = { type: "gem", g: 200000, s: 9999 };
		character.stand = true; character.items[5] = { name: "gem117", q: 5 };
		const tr = []; const trade0 = ctx.trade;
		ctx.trade = (k, slot, price, q) => { tr.push([character.items[k].name, price, q]); character.slots[slot] = { ...character.items[k], price }; character.items[k] = null; return Promise.resolve(); };
		vm.runInContext("state.stand = {}; state.needs = new Map(); stand_cache = null; cmp_cache = null; CFG.merchant.stand.list = ['gem117']", ctx); // v25.15: listed by the owner
		await vm.runInContext("stand_tick()", ctx);
		const one = vm.runInContext("Math.ceil(unit_value({ name: 'gem117', q: 1 }) * CFG.merchant.stand.markup)", ctx);
		assert(tr.length === 1 && tr[0][0] === "gem117" && tr[0][2] === 5 && tr[0][1] === one, `5 gems listed at ${one} each, not x5 (${JSON.stringify(tr)})`);
		// v25.15: a saved listing of an item the owner hasn't listed comes down (and isn't price-cut or re-listed)
		{
			const un = []; const uneq0 = ctx.unequip;
			ctx.unequip = (slot) => { un.push(slot); delete character.slots[slot]; return Promise.resolve(); };
			character.slots.trade9 = { name: "mace", level: 7, price: 999999 };
			vm.runInContext("state.stand.trade9 = { name: 'mace', level: 7, q: 1, price: 999999, value: 300000, at: Date.now() - 20 * 3600e3, per_unit: true }", ctx);
			await vm.runInContext("stand_tick()", ctx);
			assert(un.includes("trade9") && !vm.runInContext("'trade9' in state.stand", ctx), `an unlisted saved listing is taken down (${un})`);
			ctx.unequip = () => Promise.reject({ reason: "busy" });
			character.slots.trade9 = { name: "mace", level: 7, price: 999999 };
			vm.runInContext("state.stand.trade9 = { name: 'mace', level: 7, q: 1, price: 999999, value: 300000, at: Date.now(), per_unit: true }", ctx);
			await vm.runInContext("stand_tick()", ctx);
			vm.runInContext("state.stand.trade9.at = Date.now() - 20 * 3600e3", ctx);
			// (the next unequip works — Fable's case: one timeout, then the item would come into the bags and go back up)
			{ const tr0 = ctx.trade, ue0 = ctx.unequip; let relist = 0; ctx.trade = () => (relist++, Promise.resolve());
				ctx.unequip = (slot) => { const it = character.slots[slot]; delete character.slots[slot]; character.items[30] = { name: it.name, level: it.level }; return Promise.resolve(); };
				for (let i = 0; i < 3; i++) await vm.runInContext("stand_busy = false; stand_tick()", ctx);
				ctx.trade = tr0; ctx.unequip = ue0; character.items[30] = null;
				if (!character.slots.trade9) { character.slots.trade9 = { name: "mace", level: 7, price: 999999 }; vm.runInContext("state.stand.trade9 = { name: 'mace', level: 7, q: 1, price: 999999, value: 300000, at: Date.now(), per_unit: true }", ctx); }
				assert(relist === 0, `while take-downs are paused, an unlisted listing isn't price-cut and re-listed (${relist})`); }
			assert(vm.runInContext("'trade9' in state.stand && skipped('stand:down')", ctx), "a failed take-down keeps the listing (retried after a 2-min pause)");
			vm.runInContext("delete state.gear_skip['stand:down']", ctx);
			delete character.slots.trade9; vm.runInContext("delete state.stand.trade9", ctx);
			ctx.unequip = uneq0;
		}
		// v25.26: Merrit's decoy — one health potion listed at the server's maximum price, once, and left alone
		{
			const tr2 = [], trade1 = ctx.trade, uneq1 = ctx.unequip; let uneqs = 0;
			ctx.trade = (k, slot, price, q) => { tr2.push([character.items[k].name, price, q, slot]); character.slots[slot] = { name: character.items[k].name, q, price }; return Promise.resolve(); };
			ctx.unequip = (slot) => (uneqs++, delete character.slots[slot], Promise.resolve());
			character.slots = {}; character.stand = true; character.items[20] = { name: "hpot0", q: 50 };
			vm.runInContext("state.stand = {}; CFG.merchant.stand.list = []; stand_busy = false; stand_cache = null; state.gear_skip = {}", ctx); // (earlier stand tests had no potion: the decoy paused)
			await vm.runInContext("stand_tick()", ctx);
			assert(tr2.length === 1 && tr2[0][0] === "hpot0" && tr2[0][1] === vm.runInContext("CFG.merchant.stand.decoy.price", ctx) && tr2[0][2] === 1,
				`one health potion listed at the decoy price (${JSON.stringify(tr2)})`);
			vm.runInContext("for (const s in state.stand) state.stand[s].at = state.stand[s].cut_at = Date.now() - 48 * 3600e3; stand_busy = false", ctx);
			await vm.runInContext("stand_tick()", ctx); await vm.runInContext("stand_busy = false; stand_tick()", ctx);
			assert(tr2.length === 1 && uneqs === 0 && vm.runInContext("Object.values(state.stand).filter((l) => l.decoy).length", ctx) === 1
				&& vm.runInContext("Object.values(state.stand).find((l) => l.decoy).price === CFG.merchant.stand.decoy.price", ctx),
				"the decoy isn't taken down, price-cut or listed twice (it's not on the owner's list)");
			assert(/\+ Merrit's hpot0/.test(vm.runInContext("report_lines(false).find((l) => /^stand: /.test(l))", ctx)) && !/99\.9B|100B/.test(vm.runInContext("report_lines(false).find((l) => /^stand: /.test(l))", ctx)), "the report names the decoy, not its price in the 'asked' total");
			// a listing the server refuses: one try, the decoy paused 10 min, and the owner's listing still goes up
			character.slots = {}; vm.runInContext("state.stand = {}; state.gear_skip = {}; stand_busy = false; CFG.merchant.stand.list = ['goldring']; stand_cache = null", ctx);
			character.items[21] = { name: "goldring", level: 0 }; let tries = 0;
			ctx.trade = (k, slot, price, q) => { if (character.items[k].name === "hpot0") { tries++; return Promise.reject({ reason: "invalid" }); } tr2.push([character.items[k].name, price, q, slot]); character.slots[slot] = { name: character.items[k].name, q, price }; return Promise.resolve(); };
			for (let i = 0; i < 3; i++) await vm.runInContext("stand_busy = false; stand_tick()", ctx);
			assert(tries === 1 && vm.runInContext("skipped('stand:decoy')", ctx) && tr2.some((t) => t[0] === "goldring"), `a refused decoy: one try (${tries}), paused, and the owner's listing still goes up`);
			character.items[21] = null; vm.runInContext("CFG.merchant.stand.list = []; state.gear_skip = {}", ctx);
			// v25.30: listings we have no record of (DoWhatNow, 22 Nov: all 16 trade slots held old listings with
			// state.stand empty — nothing took them down and the decoy had no slot): they come down, one per call,
			// then the decoy goes up; an untracked decoy (its name at its price) is adopted and stays
			{
				const un = [];
				ctx.unequip = (slot) => { un.push(slot); delete character.slots[slot]; return Promise.resolve(); };
				ctx.trade = (k, slot, price, q) => { tr2.push([character.items[k].name, price, q, slot]); character.slots[slot] = { name: character.items[k].name, q, price }; return Promise.resolve(); };
				character.slots = {}; for (let i = 1; i <= 16; i++) character.slots["trade" + i] = { name: i % 2 ? "harmor" : "hpamulet", level: 2, price: 293232 };
				vm.runInContext("state.stand = {}; state.gear_skip = {}; stand_busy = false; stand_cache = null", ctx);
				const n0 = tr2.length;
				for (let i = 0; i < 17; i++) await vm.runInContext("stand_busy = false; stand_tick()", ctx);
				assert(un.length === 16 && tr2.length === n0 + 1 && tr2[tr2.length - 1][0] === "hpot0", `16 untracked listings taken down (${un.length}), then the decoy listed (${tr2.length - n0})`);
				character.slots = { trade3: { name: "hpot0", q: 1, price: vm.runInContext("CFG.merchant.stand.decoy.price", ctx) }, trade4: { name: "hpot0", q: 1, price: 50 } };
				vm.runInContext("state.stand = {}; stand_busy = false", ctx); un.length = 0;
				for (let i = 0; i < 3; i++) await vm.runInContext("stand_busy = false; stand_tick()", ctx);
				assert(vm.runInContext("state.stand.trade3?.decoy", ctx) === true && un.join() === "trade4" && tr2.length === n0 + 1,
					`an untracked decoy is adopted, not re-listed; a potion at another price comes down (${un})`);
				// a buy order and a giveaway (the owner's) stay; full bags pause take-downs; an owner-listed item is adopted
				character.slots = { trade3: character.slots.trade3, trade5: { name: "harmor", price: 5000, b: true }, trade6: { name: "wcap", price: 1, giveaway: 600 }, trade7: { name: "gem0", q: 3, price: 900 }, trade8: { name: "coat", level: 4, price: 20000 } };
				vm.runInContext("CFG.merchant.stand.list = ['gem0']; stand_busy = false", ctx); un.length = 0;
				const es = character.esize; character.esize = 0;
				await vm.runInContext("stand_busy = false; stand_tick()", ctx);
				assert(un.length === 0 && vm.runInContext("skipped('stand:down')", ctx), `full bags: nothing taken down, take-downs paused (${un})`);
				character.esize = 10; vm.runInContext("delete state.gear_skip['stand:down']", ctx);
				for (let i = 0; i < 3; i++) await vm.runInContext("stand_busy = false; stand_tick()", ctx);
				character.esize = es;
				assert(un.join() === "trade8" && vm.runInContext("state.stand.trade7?.name === 'gem0' && state.stand.trade7.price === 900", ctx),
					`a buy order and a giveaway stay, an owner-listed item is adopted at its price, the unlisted coat comes down (${un})`);
				vm.runInContext("CFG.merchant.stand.list = []", ctx);
			}
			ctx.trade = trade1; ctx.unequip = uneq1; character.items[20] = null; character.slots = {};
			vm.runInContext("state.stand = {}", ctx);
		}
		ctx.trade = trade0; character.stand = false; character.slots = {}; character.items = Array(42).fill(null); vm.runInContext("state.stand = {}", ctx);
		// a project stopped by its odds: remembered, and a re-pick aims no higher
		vm.runInContext("state.upg_caps = {}; upg_cap('helm117', 6)", ctx);
		assert(vm.runInContext("upg_cap_level('helm117') === 6 && upg_cap_level('other') === Infinity", ctx), "the level a stopped project reached is its ceiling");
		vm.runInContext("state.upg_caps.helm117.at = Date.now() - 8 * 86400000", ctx);
		assert(vm.runInContext("upg_cap_level('helm117') === Infinity", ctx), "...for 7 days");
		vm.runInContext("state.upg_caps = {}; state.partners = {}; my_gear_cache = null", ctx);
		delete ctx.G.items.helm117; delete ctx.G.items.gem117;
	}
	// 118) v24.6 party review fixes: deaths and probe results are shared; no calibration under tank cover;
	// a measurement covers only time at the spot; realism clamped
	{
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, hp: 1000, max_hp: 1000, map: "main", x: 0, y: 0, rip: false });
		vm.runInContext("state.partners = {}; state.danger = {}; state.cooldown = {}; state.probe_ok = {}; state.calib = {}; hist.ev = []", ctx);
		hb("Torlis", { ...tor, level: 60, x: 30, y: 0 });
		handlers.cm({ name: "Torlis", message: { k: "verdict", kind: "incident", mtype: "goo", mult: 0.6, key: "main:100,100,400,400", cd: Date.now() + 1800000, death: true } });
		assert(vm.runInContext("Math.abs(state.danger.goo - 0.6) < 1e-9 && state.cooldown['main:100,100,400,400'] > Date.now() + 1700000", ctx),
			"a partner's death at a pack: we take its incident and the pack's cooldown");
		handlers.cm({ name: "Torlis", message: { k: "verdict", kind: "probe_ok", mtype: "goo", mult: 1.5 } });
		assert(vm.runInContext("state.probe_ok.goo && state.probe_ok.goo.mult === 1.5", ctx), "a probe that held is shared");
		assert(vm.runInContext("Math.abs(probe_ok_mult('goo') - 1.5) < 1e-9 && Math.abs(danger_of('goo') / (calib_factor('goo') * state.danger.goo) - 1.5) < 1e-9", ctx), "...and widens the verdict for that monster");
		handlers.cm({ name: "Torlis", message: { k: "verdict", kind: "probe_fail", mtype: "goo" } });
		assert(vm.runInContext("!state.probe_ok.goo", ctx), "a failed probe clears it");
		handlers.cm({ name: "Stranger", message: { k: "verdict", kind: "incident", mtype: "goo", mult: 0.1 } });
		assert(vm.runInContext("Math.abs(state.danger.goo - 0.6) < 1e-9", ctx), "verdicts from outside the party are ignored");
		// our own death is sent
		const sent118 = []; const scm = ctx.send_cm; ctx.send_cm = (to, m) => { sent118.push([to, m]); return Promise.resolve(); };
		vm.runInContext(`state.pack = { mtype: 'goo', map: 'main', boundary: [100, 100, 400, 400] }; state.dead_handled = false;
			pmring.hits.push({ t: Date.now(), mtype: 'goo', dmg: 500 }); on_death(); pmring.hits.length = 0; state.dead_handled = false`, ctx);
		assert(sent118.some(([to, m]) => m.k === "verdict" && m.kind === "incident" && m.death && m.key === "main:100,100,400,400" && to.includes("Torlis")), "our death is sent to the party");
		// a probe that held is recorded and sent
		sent118.length = 0;
		vm.runInContext("state.probe = { mtype: 'goo', start: Date.now() - 700000, until: Date.now() - 1, ratio: 1.4 }; state.recovering = false; probe_check()", ctx);
		assert(vm.runInContext("Math.abs(state.probe_ok.goo.mult - 1.47) < 1e-9", ctx) && sent118.some(([, m]) => m.kind === "probe_ok" && m.mtype === "goo"), "probe held: verdict widened x1.4 x 1.05 and sent");
		ctx.send_cm = scm;
		// calibration: a fight under tank cover isn't ours to record; the tank's shared ratio is used for it
		vm.runInContext("state.calib = {}; cal.cur.goo = 50; globalThis.__fm = fight_math; fight_math = () => ({ their_dps: 10, self_dps: 0, ttk: 5, mates: 1, tank: 'Torlis', hp_pool: 900 }); calib_record('goo')", ctx);
		assert(vm.runInContext("Object.keys(state.calib).length === 0", ctx), "under tank cover: nothing recorded");
		hb("Torlis", { ...tor, level: 60, x: 30, y: 0, calp: { goo: 0.5 } });
		assert(vm.runInContext("Math.abs(calib_factor('goo', { mates: 1, tank: 'Torlis' }) - 1.5) < 1e-9", ctx), "the tank's calibration (hits half as hard) gives the covered verdict x1.5");
		vm.runInContext("fight_math = () => ({ their_dps: 10, self_dps: 0, ttk: 5, mates: 1, tank: null, hp_pool: 1000 }); cal.cur.goo = 25; calib_record('goo')", ctx);
		assert(vm.runInContext("state.calib['goo@p'] && state.calib['goo@p'].n === 1 && Object.keys(state.calib).length === 1", ctx), "a fight with no tank cover is recorded (one entry per monster)");
		vm.runInContext("fight_math = globalThis.__fm; state.calib = {}; state.danger = {}; state.cooldown = {}; state.probe_ok = {}; cal.cur = {}", ctx);
		// a measurement covers only the time at the spot
		vm.runInContext(`state.measured = {}; state.realism = 1;
			state.session = { key: 'main:5,5,6,6', mtype: 'goo', est: 10, xp: 0, kx: 0, kc: 1000, kc_n: 5, start: Date.now() - 300000, end: Date.now() - 200000 }; end_session()`, ctx);
		assert(Math.abs(vm.runInContext("state.measured['main:5,5,6,6']", ctx) - 10) < 0.01, `1000 xp over the 100s spent there = 10 xp/s, not over 300s (${vm.runInContext("state.measured['main:5,5,6,6']", ctx)})`);
		vm.runInContext(`state.session = { key: 'main:7,7,8,8', mtype: 'goo', est: 0.01, xp: 0, kx: 0, kc: 100000, kc_n: 1, start: Date.now() - 100000 }; end_session()`, ctx);
		assert(vm.runInContext("state.realism <= 3 && Math.abs(state.realism - (0.7 + 5 * 0.3)) < 1e-9", ctx), `a wild sample moves realism by at most 5x its weight (${vm.runInContext("state.realism", ctx)})`);
		// v25.16: seconds held for the party aren't the camp's: 1000 xp over 200s, 100 of them held → 10 xp/s
		vm.runInContext(`state.measured = {}; state.realism = 1;
			state.session = { key: 'main:5,5,6,7', mtype: 'goo', est: 10, xp: 0, kx: 0, kc: 1000, kc_n: 5, start: Date.now() - 200000, lost: 100000 }; end_session()`, ctx);
		assert(Math.abs(vm.runInContext("state.measured['main:5,5,6,7']", ctx) - 10) < 0.05, `held time left out (${vm.runInContext("state.measured['main:5,5,6,7']", ctx)})`);
		vm.runInContext(`state.measured = {};
			state.session = { key: 'main:5,5,6,8', mtype: 'goo', est: 10, xp: 0, kx: 0, kc: 1000, kc_n: 5, start: Date.now() - 120000, lost: 100000 }; end_session()`, ctx);
		assert(vm.runInContext("state.measured['main:5,5,6,8'] === undefined", ctx), "too little real time left (20s): no measurement");
		// v25.16: a configured member not heard from (her tab asleep) → the party isn't all here: no session starts
		{
			const R = (c) => vm.runInContext(c, ctx);
			const sv = { name: character.name, ctype: character.ctype, map: character.map, x: character.x, y: character.y };
			Object.assign(character, { name: "Torlis", ctype: "paladin", map: "main", x: 50, y: 50, rip: false });
			R(`state.session = null; state.errand = null; state.recovering = false; state.pack = { mtype: 'goo', map: 'main', boundary: [0, 0, 100, 100] };
				state.partners = { Aspernari: { name: 'Aspernari', ctype: 'priest', map: 'main', x: 60, y: 60, t: Date.now() } }`);
			R("meas_tick()");
			assert(R("state.session") === null, "Sanala unheard: no measurement session");
			R("state.partners.Sanala = { name: 'Sanala', ctype: 'mage', map: 'main', x: 40, y: 40, t: Date.now() }; meas_tick()");
			assert(R("!!state.session"), "everyone heard and here: the session starts");
			// a member out of the tank's engage range: the elapsed seconds are left out (not just 1 s a tick)
			R("state.session.last_here = Date.now() - 3000; state.partners.Sanala.x = 50 + CFG.party.engage_px + 50; state.partners.Sanala.y = 50; meas_tick()");
			assert(Math.abs(R("state.session.lost") - 3000) < 200, `3 s with Sanala out of engage range left out (${R("state.session.lost")})`);
			R("state.partners.Sanala.x = 40; state.partners.Sanala.y = 40; state.session.last_here = Date.now() - 2000; meas_tick()");
			assert(R("!!state.session") && Math.abs(R("state.session.lost") - 3000) < 200, "everyone in range: nothing more left out");
			// the tank holding (gap_kind) is left out too
			{ const gk = ctx.gap_kind; ctx.gap_kind = () => "monsters alive, holding for the party";
				R("state.session.last_here = Date.now() - 2000; meas_tick()"); ctx.gap_kind = gk; }
			assert(Math.abs(R("state.session.lost") - 5000) < 200, `the tank's hold left out (${R("state.session.lost")})`);
			// a tick 60 s late (tab asleep): the session closes at the last good tick; the gap isn't booked
			R("state.session.last_here = Date.now() - 60000; meas_tick()");
			assert(R("state.session") === null, "a 60 s gap closes the session instead of booking it");
			R("state.session = null; state.pack = null; state.partners = {}"); Object.assign(character, sv);
		}
		vm.runInContext("state.measured = {}; state.meas_at = {}; state.realism = 1; state.session = null", ctx);
		vm.runInContext("state.partners = {}; state.pack = null; hist.ev = []", ctx);
	}
	// 119) v24.7 economy + regression fixes: deliveries to the biggest gain; no merchant quests; purge after keep rules;
	// weapon class modifiers and paladin int in gear scores; transient project errors keep the project; caps at the
	// highest level reached; aged re-measurements; regen without potions in combat; partial stand sales; parked leader
	{
		Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 42, map: "main", x: 0, y: 0, rip: false, esize: 30, stand: false, gold: 5e6 });
		character.items = Array(42).fill(null); character.slots = {};
		ctx.G.items.ring119 = { type: "ring", int: 10 };
		vm.runInContext("state.partners = {}; state.gear_skip = {}; my_gear_cache = null; state.upg = null; state.needs = new Map()", ctx);
		hb("Aspernari", { ...asp, level: 58, gear: { w: { ring1: 10, ring2: 10 }, own: {} } });
		hb("Sanala", { ...san, ctype: "mage", level: 51, gear: { w: { ring1: 0, ring2: 0 }, own: {} } });
		character.items[1] = { name: "ring119", level: 0 };
		const tgt = vm.runInContext("gear_target()", ctx);
		assert(tgt && tgt.name === "Sanala", `delivery goes to the biggest gain (Sanala, empty ring slots), not the first in config order (${tgt && tgt.name})`);
		assert(vm.runInContext("quest_recipes().length === 0", ctx), "the merchant has no quests of its own");
		// purge: after the keep rules, by the exact copy
		ctx.G.items.helm119 = { type: "helmet", armor: 5, upgrade: { armor: 1 }, g: 1000 };
		character.items[1] = { name: "helm119", level: 3 }; character.items[2] = { name: "helm119", level: 3, p: "shiny" };
		vm.runInContext("state.purge = { 'helm119:3': Date.now() }; state.upg = { name: 'helm119', to: 7, cost: 1000, for: 'Torlis' }", ctx);
		assert(vm.runInContext("bag_class(character.items[1])", ctx) === "keep", "a purged plain helm+3 that the project holds stays");
		vm.runInContext("state.upg = null", ctx);
		assert(vm.runInContext("bag_class(character.items[1])", ctx) === "sell" && vm.runInContext("bag_class(character.items[2])", ctx) !== "sell", "no project: the plain purged copy sells, the titled one doesn't");
		vm.runInContext("state.purge = {}", ctx); character.items = Array(42).fill(null);
		// gear scores: class weapon modifiers; paladin int
		ctx.G.items.staff119 = { type: "weapon", wtype: "staff", attack: 30 }; ctx.G.items.wand119 = { type: "weapon", wtype: "wand", attack: 30 };
		const mc = ctx.G.classes.mage; ctx.G.classes.mage = { ...mc, main_stat: "int", mainhand: { staff: { speed: -4 }, wand: { frequency: 60 } } };
		assert(vm.runInContext("gear_score({ name: 'wand119', level: 0 }, 'mage') - gear_score({ name: 'staff119', level: 0 }, 'mage')", ctx) === 60 * 2.5 + 4 * 0.5,
			"mage: a wand's +60 frequency counts (and a staff's -4 speed)");
		ctx.G.classes.mage = mc;
		ctx.G.items.intorb119 = { type: "orb", int: 10 }; ctx.G.items.strorb119 = { type: "orb", str: 10 };
		const pc = ctx.G.classes.paladin; ctx.G.classes.paladin = { ...pc, main_stat: "str" };
		// v24.26: the docs' lstats weigh a paladin's int (its side_stat) the same as str
		assert(vm.runInContext("gear_score({ name: 'intorb119', level: 0 }, 'paladin') === gear_score({ name: 'strorb119', level: 0 }, 'paladin')", ctx), "paladin: int counts as much as str (lstats)");
		ctx.G.classes.paladin = pc;
		// upgrade project: a transient error pauses it; the odds cap is the highest level reached
		character.items[1] = { name: "helm119", level: 3 };
		ctx.G.items.scroll0 = { g: 1000, type: "uscroll" };
		vm.runInContext(`state.upg = { name: 'helm119', to: 7, cost: 100000, for: 'Torlis', spent: 0 }; state.upg_caps = {}; state.gear_skip = {}; state.fund_need = 0;
			globalThis.__ru = run_upgrade; run_upgrade = async () => { throw { reason: "timeout" }; }`, ctx);
		await vm.runInContext("task_upgrade()", ctx);
		assert(vm.runInContext("state.upg && state.upg.name === 'helm119' && skipped('upg:helm119')", ctx), "a timeout pauses the project, it doesn't drop it");
		vm.runInContext("state.gear_skip = {}; state.upg.max = 5; run_upgrade = async () => { throw { reason: 'low_chance', chance: 0.3 }; }", ctx);
		await vm.runInContext("task_upgrade()", ctx);
		assert(vm.runInContext("!state.upg && upg_cap_level('helm119') === 5", ctx), `refused for its odds: capped at the highest level reached (+5), not the copy now held (+3) (${vm.runInContext("upg_cap_level('helm119')", ctx)})`);
		vm.runInContext("run_upgrade = globalThis.__ru; state.upg_caps = {}; state.gear_skip = {}; state.upg = null", ctx);
		character.items = Array(42).fill(null); delete ctx.G.items.scroll0;
		// Ponty: a lower copy held doesn't block buying a better one
		ctx.G.items.amulet119 = { type: "amulet", int: 5, upgrade: { int: 3 } };
		vm.runInContext("state.bank_gear = [{ name: 'amulet119', level: 0 }]; CFG.secondhand_gold_per_pt = 1e9", ctx);
		hb("Sanala", { ...san, ctype: "mage", level: 51, gear: { w: { amulet: 0 }, own: {} } });
		assert(/upgrade for/.test(vm.runInContext("secondhand_reason({ name: 'amulet119', level: 5 }, {}) || ''", ctx)), "a +0 in the bank doesn't block buying a +5");
		vm.runInContext("state.bank_gear = [{ name: 'amulet119', level: 6 }]", ctx);
		assert(!/upgrade for/.test(vm.runInContext("secondhand_reason({ name: 'amulet119', level: 5 }, {}) || ''", ctx)), "a +6 in the bank does");
		vm.runInContext("state.bank_gear = []", ctx);
		// v25.18: a shiny listing isn't blocked by a plain copy at its level; a shiny one blocks it
		vm.runInContext("state.bank_gear = [{ name: 'amulet119', level: 6 }]", ctx);
		assert(/upgrade for/.test(vm.runInContext("secondhand_reason({ name: 'amulet119', level: 5, p: 'shiny' }, {}) || ''", ctx)), "a shiny +5 isn't blocked by a plain +6");
		vm.runInContext("state.bank_gear = [{ name: 'amulet119', level: 6, p: 'shiny' }]", ctx);
		assert(!/upgrade for/.test(vm.runInContext("secondhand_reason({ name: 'amulet119', level: 5, p: 'shiny' }, {}) || ''", ctx)), "...a shiny +6 blocks it");
		vm.runInContext("state.bank_gear = []", ctx);
		// v25.18: a head start — a +1 that doesn't win as it is, but wins at +3, and nobody sells one: bought to be upgraded
		{
			const R = (c) => vm.runInContext(c, ctx);
			const sc0 = ctx.G.items.scroll0; ctx.G.items.scroll0 = { g: 1000, type: "uscroll", grade: 0 };
			const g2 = R("gear_gain({ name: 'amulet119', level: 2 }, 'mage', { w: { amulet: 0 }, own: {} }).gain");
			const parts0 = R("JSON.stringify(state.partners)"); R("state.partners = {}");
			hb("Sanala", { ...san, ctype: "mage", level: 51, gear: { w: { amulet: g2 + 0.1 }, own: {} } });
			R("CFG.secondhand_gold_per_pt = 15000; state.upg_caps = {}; state.gear_skip = {}; sold_c.set('amulet119', false)");
			const why1 = R("secondhand_reason({ name: 'amulet119', level: 1 }, {}) || ''");
			assert(/start for an upgrade: \+1 → \+\d+ for Sanala/.test(why1), `a +1 that wins once upgraded is a head start (${why1}; target ${R("upgrade_target('amulet119')")})`);
			character.items[7] = { name: "amulet119", level: 2 };
			assert(!/start for/.test(R("secondhand_reason({ name: 'amulet119', level: 1 }, {}) || ''")), "...not when our own copy is as far along");
			character.items[7] = null;
			R("CFG.secondhand_upgrade_starts = false");
			assert(!/start for/.test(R("secondhand_reason({ name: 'amulet119', level: 1 }, {}) || ''")), "...and not when switched off");
			R("CFG.secondhand_upgrade_starts = true");
			// the planner's gates: not for a paused piece, the current project's piece, or over the project budget
			R("skip('upg:amulet119', 60000, 'test')");
			assert(!/start for/.test(R("secondhand_reason({ name: 'amulet119', level: 1 }, {}) || ''")), "...not for a piece the planner has paused");
			R("state.gear_skip = {}; state.upg = { name: 'amulet119', to: 6, for: 'Sanala' }");
			assert(!/start for/.test(R("secondhand_reason({ name: 'amulet119', level: 1 }, {}) || ''")), "...not for the piece the current project builds");
			R("state.upg = null; globalThis.__us = CFG.upgrade_spend; CFG.upgrade_spend = 0");
			assert(!/start for/.test(R("secondhand_reason({ name: 'amulet119', level: 1 }, {}) || ''")), "...not over the planner's budget");
			R("CFG.upgrade_spend = globalThis.__us; sold_c.delete('amulet119')");
			// v25.19: the planner aims no higher than the run will go: grade 0, not sold, scroll1 within the boost —
			// +4 70%→85% passes the 80% floor, +5 60%→73% doesn't; with a second copy owned (bank), the 60% spare floor: +5 passes
			{
				const s1 = ctx.G.items.scroll1; ctx.G.items.scroll1 = { g: 40000, type: "uscroll", grade: 1 };
				ctx.G.items.xs138 = { type: "shoes", armor: 5, upgrade: { armor: 2 } };
				R("sold_c.set('xs138', false); state.bank_gear = []; character.items[9] = { name: 'xs138', level: 3 }");
				assert(R("upg_reach('xs138')") === 4, `one copy: reach +4 (${R("upg_reach('xs138')")})`);
				R("state.bank_gear = [{ name: 'xs138', level: 0 }]");
				assert(R("upg_reach('xs138')") === 5, `a spare in the bank: reach +5 (${R("upg_reach('xs138')")})`);
				assert(R("chance_floor('xs138', CFG.min_upgrade_chance, 9, 3)") === R("CFG.min_chance_spare"), "the run's floor counts the bank spare (+0) too");
				R("state.bank_gear = []");
				assert(R("chance_floor('xs138', CFG.min_upgrade_chance, 9, 3)") === R("CFG.min_upgrade_chance"), "...and without one, the full floor");
				R("character.items[10] = { name: 'xs138', level: 0 }");
				assert(R("chance_floor('xs138', CFG.min_upgrade_chance, 9, 3)") === R("CFG.min_chance_spare") && R("upg_reach('xs138')") === 5, "a lower copy in the bags is a spare too");
				R("character.items[10] = { name: 'xs138', level: 0, p: 'shiny' }; state.bank_gear = [{ name: 'xs138', level: 0, p: 'shiny' }]");
				assert(R("chance_floor('xs138', CFG.min_upgrade_chance, 9, 3)") === R("CFG.min_upgrade_chance") && R("upg_reach('xs138')") === 4, "titled copies aren't spares (a project never uses one)");
				R("character.items[9] = null; character.items[10] = null; state.bank_gear = []; sold_c.delete('xs138')"); delete ctx.G.items.xs138;
				if (s1) ctx.G.items.scroll1 = s1; else delete ctx.G.items.scroll1;
			}
			if (sc0) ctx.G.items.scroll0 = sc0; else delete ctx.G.items.scroll0;
			R(`state.partners = ${parts0}`);
		}
		// stand: a partial sale is logged and the listing's quantity follows
		character.stand = true; character.slots = { trade1: { name: "gem119", q: 3, price: 100 } };
		vm.runInContext("hist.ev = []; state.stand = { trade1: { name: 'gem119', level: 0, q: 5, price: 100, value: 30, at: Date.now(), per_unit: true } }; stand_busy = false; CFG.merchant.stand.list = ['gem119']", ctx);
		await vm.runInContext("stand_tick()", ctx);
		assert(vm.runInContext("state.stand.trade1 && state.stand.trade1.q === 3 && hist.ev.some((e) => e.type === 'sold' && e.q === 2 && e.price === 200)", ctx), "2 of 5 sold: logged for 200, listing now x3");
		character.stand = false; character.slots = {}; vm.runInContext("state.stand = {}; hist.ev = []", ctx);
		// regression: re-measuring a stale spot averages with its aged value
		vm.runInContext(`state.measured = { 'main:3,3,4,4': 20 }; state.meas_at = { 'p:main:3,3,4,4': Date.now() - 72 * 3600000 };
			state.session = { key: 'main:3,3,4,4', mtype: 'goo', est: 100, xp: 0, kx: 0, kc: 10000, kc_n: 5, start: Date.now() - 100000 }; end_session()`, ctx);
		assert(vm.runInContext("state.measured['main:3,3,4,4'] > 95", ctx), `a 3-day-old 20 re-measured at 100 is ~100, not 60 (${vm.runInContext("state.measured['main:3,3,4,4']", ctx)})`);
		vm.runInContext("state.measured = {}; state.meas_at = {}; state.realism = 1", ctx);
		// regression: no HP potions → regen even with something on us
		Object.assign(character, { name: "Sanala", ctype: "mage", hp: 500, max_hp: 1000, mp: 500, max_mp: 500 });
		const sk119 = []; const us = ctx.use_skill, gnm = ctx.get_nearest_monster;
		ctx.use_skill = (n) => (sk119.push(n), Promise.resolve()); ctx.get_nearest_monster = (a) => (a && a.target ? { id: "x" } : null);
		vm.runInContext("for (const k in inflight) inflight[k] = false; sustain()", ctx);
		assert(sk119.includes("regen_hp"), `no potions, 50% HP, attacked: regen (${sk119})`);
		ctx.use_skill = us; ctx.get_nearest_monster = gnm;
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, hp: 1000, max_hp: 1000, mp: 500, max_mp: 500 });
		for (const k of ["ring119", "helm119", "staff119", "wand119", "intorb119", "strorb119", "amulet119"]) delete ctx.G.items[k];
	}
	// 120) v24.8 combat review fixes: self-defence first; no walks while fleeing; a walk timeout says so; an unreachable
	// waypoint is skipped; an ignored attacker while fleeing (the merchant) is walked away from
	{
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, hp: 1000, max_hp: 1000, mp: 500, max_mp: 500, map: "main", x: 0, y: 0, rip: false, c: {} });
		const dist0 = ctx.distance; ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
		ctx.parent.entities.a120 = { id: "a120", type: "monster", mtype: "goo", visible: true, x: 50, y: 0, target: "Sanala" };
		ctx.parent.entities.b120 = { id: "b120", type: "monster", mtype: "goo", visible: true, x: 20, y: 0, target: "Sanala" };
		ctx.parent.entities.c120 = { id: "c120", type: "monster", mtype: "goo", visible: true, x: 5, y: 0, target: "Torlis" };
		vm.runInContext("state.bad_ids = {}", ctx);
		assert(vm.runInContext("hit_on_me()?.id", ctx) === "b120", "hit_on_me: the nearest monster attacking us (not a partner's)");
		vm.runInContext("state.bad_ids.b120 = Date.now() + 60000", ctx);
		assert(vm.runInContext("hit_on_me()?.id", ctx) === "a120", "...skipping one we ignore as immune");
		assert(/hit_on_me\(\) \|\| \(!i_am_tank\(\) && caller_target\(\)\)/.test(src), "the leader defends itself before taking the tank's call");
		for (const k of ["a120", "b120", "c120"]) delete ctx.parent.entities[k];
		vm.runInContext("state.bad_ids = {}", ctx);
		// no walks while fleeing
		vm.runInContext("state.recovering = true; globalThis.__g120 = go({ map: 'main', x: 1, y: 1 }).then(() => 'ok', (e) => e.reason)", ctx);
		assert(await vm.runInContext("globalThis.__g120", ctx) === "fleeing", "go() refuses while fleeing (an errand step would cancel the channel)");
		vm.runInContext("state.recovering = false", ctx);
		// a timeout is reported as one, even though stop() rejects the walk as "interrupted" first
		const sm0 = ctx.smart_move, st0 = ctx.stop; let rej120 = null;
		ctx.smart_move = () => new Promise((_, rej) => { rej120 = rej; });
		ctx.stop = (a) => { if (a === "smart" && rej120) rej120({ reason: "interrupted" }); };
		vm.runInContext("globalThis.__g120 = go({ map: 'main', x: 1, y: 1 }, 20).then(() => 'ok', (e) => e.reason)", ctx);
		assert(await vm.runInContext("globalThis.__g120", ctx) === "walk_timeout", "a walk timeout comes back as walk_timeout");
		// an unreachable waypoint is skipped, and the failure isn't activity
		ctx.smart_move = () => Promise.reject({ reason: "failed" });
		vm.runInContext("state.waypoints = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]; state.wp = 1; state.travel_block_until = 0; state.last_target_at = 5; globalThis.__g120 = travel({ map: 'main', x: 2, y: 2 })", ctx);
		await vm.runInContext("globalThis.__g120", ctx);
		assert(vm.runInContext("state.wp === 2 && state.last_target_at === 5", ctx), "unreachable waypoint: next one, and the idle clock isn't reset");
		ctx.smart_move = sm0; ctx.stop = st0;
		vm.runInContext("state.waypoints = []; state.wp = 0; state.travel_block_until = 0; state.last_target_at = Date.now()", ctx);
		// fleeing (the merchant) with only an ignored attacker on us: step away from it
		Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 42 });
		const mv = []; const mv0 = ctx.move; ctx.move = (x, y) => (mv.push([x, y]), Promise.resolve());
		ctx.parent.entities.i120 = { id: "i120", type: "monster", mtype: "goo", visible: true, x: 50, y: 0, target: "DoWhatNow" };
		const gnm0 = ctx.get_nearest_monster; ctx.get_nearest_monster = (a) => (a && a.target === "DoWhatNow" ? ctx.parent.entities.i120 : null);
		vm.runInContext("state.bad_ids = { i120: Date.now() + 60000 }; Object.assign(state, { recovering: true, fled_home: false, town_at: 0 }); last_move = 0; character.hp = 200; recover()", ctx);
		assert(mv.length === 1 && mv[0][0] < 0, `stepped away from it (${JSON.stringify(mv)})`);
		ctx.move = mv0; ctx.get_nearest_monster = gnm0; delete ctx.parent.entities.i120; ctx.distance = dist0;
		vm.runInContext("state.bad_ids = {}; state.recovering = false; character.hp = 1000", ctx);
		vm.runInContext("state.partners = {}; state.pack = null", ctx);
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, hp: 1000, max_hp: 1000 });
	}
	// 121) v24.9: travel counts in spot picks (map hops via doors and the transporter); noprog only at the pack (test 66)
	{
		Object.assign(character, { map: "main", x: 0, y: 0, speed: 50 });
		const maps0 = ctx.G.maps, npcs0 = ctx.G.npcs;
		ctx.G.maps = { main: { doors: [[0, 0, 10, 10, "cave1", 0]], spawns: [[0, 0]], monsters: [] }, cave1: { doors: [[0, 0, 10, 10, "main", 0], [5, 5, 10, 10, "cave2", 0]], spawns: [[0, 0]] },
			cave2: { doors: [[0, 0, 10, 10, "cave1", 1]], spawns: [[0, 0]] }, winter: { doors: [], spawns: [[0, 0]] }, island: { doors: [], spawns: [[0, 0]] } };
		ctx.G.npcs = { ...npcs0, transporter: { places: { main: 0, winter: 0 } } };
		vm.runInContext("for (const k in hops_cache) delete hops_cache[k]", ctx);
		assert(vm.runInContext("map_hops('main', 'cave2') === 2 && map_hops('main', 'winter') === 1 && map_hops('main', 'island') === Infinity", ctx), "hops: doors (2 to cave2), the transporter (1 to winter), none (island)");
		// v24.16: walking distance as smart_move walks it (cave1's door to cave2 is at 5,5: one more 7px leg): door_px per door
		const B = "[0, 0, 10, 10]", inner = Math.hypot(5, 5), DP = vm.runInContext("CFG.travel.door_px", ctx);
		const t2 = vm.runInContext(`travel_s('cave2', ${B})`, ctx), t1 = vm.runInContext(`travel_s('cave1', ${B})`, ctx);
		assert(Math.abs(t1 - (DP + inner) / 50 * 1.3) < 1e-9 && Math.abs(t2 - (2 * DP + 2 * inner) / 50 * 1.3) < 1e-9, `walk estimate: distance + door_px per door, at our speed (${t1}, ${t2})`);
		const wf = vm.runInContext(`walk_factor({ map: 'cave2', boundary: ${B} })`, ctx);
		assert(Math.abs(wf - 1200 / (1200 + t2)) < 1e-9 && vm.runInContext(`walk_factor({ map: 'island', boundary: ${B} })`, ctx) === 0, `the walk discounts the stay (${wf}); unreachable scores 0`);
		const r = vm.runInContext("route_to('cave2', 5, 5)", ctx);
		assert(r && JSON.stringify(r.maps) === '["cave1","cave2"]' && r.doors === 2, `route_to: the maps entered (${JSON.stringify(r)})`);
		assert(/p\.score \*= walk_factor\(area\)/.test(src) && /state\.best_score = best \? best\.rate : 0/.test(src), "picks count the walk; the side-goal reference stays the rate there");
		ctx.G.maps = maps0; ctx.G.npcs = npcs0; vm.runInContext("for (const k in hops_cache) delete hops_cache[k]", ctx);
	}
	// 122) v24.10: no spots next to aggressive monsters we can't take on, nor routes past faster ones; outrun the slower
	{
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 52, map: "town", x: 0, y: 0, speed: 55, rip: false, hp: 1000, max_hp: 1000 });
		const maps0 = ctx.G.maps, mons0 = ctx.G.monsters;
		ctx.G.monsters = { ...mons0, roamer: { xp: 100, hp: 100, attack: 5, respawn: 2, speed: 20, aggro: 0.2 }, boar: { xp: 10, hp: 12000, attack: 240, speed: 20, charge: 40, aggro: 1, rage: 1 },
			prat: { xp: 10, hp: 9200, attack: 320, speed: 12, charge: 86, aggro: 1 }, mouse: { xp: 1, hp: 10, attack: 1, speed: 10, aggro: 1 } };
		ctx.G.maps = { town: { doors: [[0, 0, 1, 1, "cave", 0], [0, 0, 1, 1, "snow", 0]], spawns: [[0, 0]], monsters: [] },
			cave: { doors: [[0, 0, 1, 1, "town", 0], [0, 0, 1, 1, "deep", 0]], spawns: [[0, 0]], monsters: [{ type: "prat", count: 3, boundary: [0, 100, 200, 300] }] }, // v24.19: by the way through
			deep: { doors: [[0, 0, 1, 1, "cave", 1]], spawns: [[0, 0]], monsters: [{ type: "roamer", count: 5, boundary: [0, 0, 200, 200] }] },
			snow: { doors: [[0, 0, 1, 1, "town", 1]], spawns: [[0, 0]], monsters: [{ type: "roamer", count: 5, boundary: [0, 0, 200, 200] }, { type: "boar", count: 4, boundary: [400, 0, 600, 200] },
				{ type: "roamer", count: 5, boundary: [2000, 2000, 2200, 2200] }, { type: "mouse", count: 3, boundary: [2300, 2000, 2400, 2100] }] } };
		vm.runInContext("for (const k in hops_cache) delete hops_cache[k]; rt_cache.clear(); dz_cache.clear(); state.safe = { roamer: { ttk: 1, xp: 100 }, mouse: { ttk: 0.1, xp: 1 } }", ctx);
		assert(vm.runInContext("area_danger({ map: 'snow', boundary: [0, 0, 200, 200] }, 'roamer')", ctx) === "boar", "roamers 200px from boars: dangerous");
		assert(vm.runInContext("area_danger({ map: 'snow', boundary: [2000, 2000, 2200, 2200] }, 'roamer')", ctx) === null, "...far from them, or next to an aggressive one we can take (mice): fine");
		assert(vm.runInContext("route_danger('deep')", ctx) === "prat @ cave" && vm.runInContext("route_danger('snow')", ctx) === null, "the way to deep passes prats (faster than us); snow's boars are slower");
		assert(JSON.stringify(vm.runInContext("map_route('town', 'deep')", ctx)) === '["cave","deep"]', "route: the maps crossed");
		// outrun: a boar on us (can't take it, slower): step away, don't stop a walk for it
		const mv = []; const mv0 = ctx.move, dist0 = ctx.distance; ctx.move = (x, y) => (mv.push([x, y]), Promise.resolve()); ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
		const boar = { id: "boar1", type: "monster", mtype: "boar", visible: true, x: 30, y: 0, target: "Sanala", hp: 12000, max_hp: 12000 };
		ctx.parent.entities.boar1 = boar;
		vm.runInContext("last_move = 0; smart_depth = 0; fight(parent.entities.boar1, true)", ctx);
		assert(mv.length === 1 && mv[0][0] < 0, `a boar on us: stepped away from it (${JSON.stringify(mv)})`);
		vm.runInContext("smart_depth = 1", ctx);
		assert(vm.runInContext("break_walk_for(parent.entities.boar1)", ctx) === false, "walking: the walk goes on past it");
		vm.runInContext("smart_depth = 0", ctx);
		delete ctx.parent.entities.boar1; ctx.move = mv0; ctx.distance = dist0;
		ctx.G.maps = maps0; ctx.G.monsters = mons0;
		vm.runInContext("for (const k in hops_cache) delete hops_cache[k]; state.safe = {}; state.pick_skips = {}", ctx);
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, hp: 1000, max_hp: 1000 });
	}
	// 123) v24.11: the leader travels as a group (waits for stragglers, pulls once all are there)
	{
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 51, map: "main", x: 0, y: 0, rip: false, hp: 1000, max_hp: 1000 });
		vm.runInContext("state.partners = {}; state.group_wait = null; state.group_ok = null; state.errand = null", ctx);
		const P = "{ mtype: 'goo', map: 'main', boundary: [1000, 1000, 1400, 1400] }";
		hb("Sanala", { ...san, level: 60, x: 900, y: 0 }); hb("Aspernari", { ...asp, level: 58, x: 50, y: 0 });
		assert(vm.runInContext(`group_hold(${P}, false)`, ctx) === "Sanala", "heading out with Sanala 900px behind: wait for her");
		hb("Sanala", { ...san, level: 60, x: 400, y: 0 });
		assert(vm.runInContext(`group_hold(${P}, false)`, ctx) === "Sanala", "...until she's well in (400px: not yet, once waiting)");
		hb("Sanala", { ...san, level: 60, x: 200, y: 0 });
		assert(vm.runInContext(`group_hold(${P}, false) === null && state.group_wait === null`, ctx), "200px: go");
		hb("Sanala", { ...san, level: 60, x: 900, y: 0, errand: "town" });
		assert(vm.runInContext(`group_hold(${P}, false)`, ctx) === null, "a member on its own errand isn't waited for");
		hb("Sanala", { ...san, level: 60, x: 1200, y: 1200, pack: { mtype: "goo", map: "main", boundary: [1000, 1000, 1400, 1400] } });
		assert(vm.runInContext(`group_hold(${P}, false)`, ctx) === null, "one already at our spot (waiting for us) isn't a straggler");
		// at the spot: hold the pull until everyone's there; once assembled, no more holds at this spot
		Object.assign(character, { x: 1200, y: 1200 });
		hb("Sanala", { ...san, level: 60, x: 1200, y: 1250 }); hb("Aspernari", { ...asp, level: 58, x: 200, y: 200 });
		assert(vm.runInContext(`group_hold(${P}, true)`, ctx) === "Aspernari", "arrived; Aspernari still on the way: no pull yet");
		hb("Aspernari", { ...asp, level: 58, x: 1210, y: 1190 });
		assert(vm.runInContext(`group_hold(${P}, true) === null && state.group_ok === 'main:1000,1000,1400,1400'`, ctx), "all there: assembled");
		hb("Aspernari", { ...asp, level: 58, x: 200, y: 200 });
		assert(vm.runInContext(`group_hold(${P}, true)`, ctx) === null, "assembled at this spot: people moving around in the fight don't stop it");
		// a stuck straggler: wait_s, then go on for go_s
		Object.assign(character, { x: 0, y: 0 });
		vm.runInContext("state.group_ok = null; state.group_wait = null", ctx);
		hb("Aspernari", { ...asp, level: 58, x: 3000, y: 0 }); hb("Sanala", { ...san, level: 60, x: 10, y: 0 });
		vm.runInContext(`group_hold(${P}, false); state.group_wait.since = Date.now() - CFG.party.group.wait_s * 1000 - 1`, ctx);
		assert(vm.runInContext(`group_hold(${P}, false)`, ctx) !== null, "v24.60: waited wait_s: still waiting — the tank never goes on without a member");

		vm.runInContext(`state.partners = {}; state.group_wait = null; state.group_ok = null`, ctx);
		assert(/group: \{ enabled: true, radius: 450/.test(src), "v24.11 default: group travel on");
		Object.assign(character, { x: 0, y: 0 });
	}
	// 124) v24.13: the xp multiplier and its breakdown (report, heartbeat, party header)
	{
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 52, xpm: 1.26, slots: { amulet: { name: "xamulet124", level: 0 } } });
		ctx.G.items.xamulet124 = { type: "amulet", xp: 10 };
		const gp0 = ctx.get_party; ctx.get_party = () => ({ Sanala: {}, Torlis: {}, Aspernari: {} });
		assert(vm.runInContext("xp_mult_text()", ctx) === "xp multiplier x1.26 = 100% + gear 10% + party 16%", vm.runInContext("xp_mult_text()", ctx));
		character.xpm = 1.36;
		assert(/\+ other 10%$/.test(vm.runInContext("xp_mult_text()", ctx)), "what's left is shown as other");
		const sent124 = []; const scm = ctx.send_cm; ctx.send_cm = (to, m) => { sent124.push(m); return Promise.resolve(); };
		vm.runInContext("heartbeat()", ctx); ctx.send_cm = scm;
		assert(sent124.some((m) => m.k === "hb" && m.xpm === 1.36), "the heartbeat carries it");
		ctx.get_party = gp0; delete character.xpm; character.slots = {}; delete ctx.G.items.xamulet124;
	}
	// 125) v24.14: keep away from a monster we can't take on that may attack, before it picks one of us
	{
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 52, map: "main", x: 0, y: 0, speed: 55, rip: false, hp: 4000, max_hp: 4000 }); // the leader
		const mons0 = ctx.G.monsters, dist0 = ctx.distance, mv0 = ctx.move;
		ctx.G.monsters = { ...mons0, ent125: { xp: 9200000, hp: 8000000, attack: 3600, speed: 12, charge: 48, aggro: 0.2, range: 64, frequency: 1.2 }, calm125: { xp: 1, hp: 8000000, attack: 3600, speed: 12, aggro: 0 } };
		ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
		const mv = []; ctx.move = (x, y) => (mv.push([x, y]), Promise.resolve());
		vm.runInContext("for (const k in deadly_c) delete deadly_c[k]; state.safe = {}; state.pack = { mtype: 'goo', map: 'main', boundary: [-100, -100, 100, 100] }; state.keep_log = []; state.keep_at = 0; state.cooldown = {}; hist.ev = []", ctx);
		ctx.parent.entities.e125 = { id: "e125", type: "monster", mtype: "ent125", visible: true, x: 200, y: 0 };
		ctx.parent.entities.c125 = { id: "c125", type: "monster", mtype: "calm125", visible: true, x: 50, y: 0 };
		assert(vm.runInContext("looming()", ctx) === null, "v24.25: an ent standing 200px away doesn't loom (only one coming at us, or within 120px)");
		Object.assign(ctx.parent.entities.e125, { moving: true, going_x: 100, going_y: 0 });
		assert(vm.runInContext("looming()?.id", ctx) === "e125", "an ent walking our way (can't take it, aggro 0.2) looms; a never-aggressive giant doesn't");
		vm.runInContext("last_move = 0; smart_depth = 0; keep_away(looming())", ctx);
		assert(mv.length === 1 && mv[0][0] < 0, `stepped away from it (${JSON.stringify(mv)})`);
		ctx.parent.entities.e125.target = "Sanala";
		assert(vm.runInContext("looming()", ctx) === null, "already on one of us: that's fight()'s escape, not this");
		delete ctx.parent.entities.e125.target;
		vm.runInContext("state.pack.mtype = 'ent125'", ctx);
		assert(vm.runInContext("looming()", ctx) === null, "what the party came for (a boss, a probe) isn't avoided");
		vm.runInContext("state.pack.mtype = 'goo'", ctx);
		// the same spot three times in 5 min: it cools down
		vm.runInContext("for (let i = 0; i < 3; i++) { state.keep_at = 0; keep_away(parent.entities.e125); }", ctx);
		assert(vm.runInContext("state.cooldown['main:-100,-100,100,100'] > Date.now()", ctx), "an ent that keeps coming: the spot cools down");
		for (const k of ["e125", "c125"]) delete ctx.parent.entities[k];
		ctx.G.monsters = mons0; ctx.distance = dist0; ctx.move = mv0;
		vm.runInContext("state.pack = null; state.cooldown = {}; state.keep_log = []; hist.ev = []; for (const k in deadly_c) delete deadly_c[k]", ctx);
	}
	// 126) v24.15: compound pieces stuck at their ceiling that nobody wants are sold by the merchant, not hoarded
	{
		Object.assign(character, { name: "DoWhatNow", ctype: "merchant", level: 42, map: "main", x: 0, y: 0, rip: false, esize: 20, stand: false });
		character.items = Array(42).fill(null); character.slots = {};
		ctx.G.items.hpam126 = { type: "amulet", hp: 200, compound: { hp: 240 }, g: 20000 };
		vm.runInContext("state.partners = {}; state.gear_skip = {}; state.cmp_caps = {}; state.needs = new Map(); state.stand = {}; stand_cache = null; cmp_cache = null; my_gear_cache = null; state.upg = null; state.purge = {}", ctx);
		hb("Torlis", { ...tor, level: 60, gear: { w: { amulet: 1e9 }, own: {} } });
		character.items[3] = { name: "hpam126", level: 2 };
		vm.runInContext("state.fetched = { hpam126: Date.now() }", ctx);
		assert(vm.runInContext("bag_class(character.items[3])", ctx) !== "keep", `fetched, an upgrade only for the merchant's own (unused) slot: not held (${vm.runInContext("bag_class(character.items[3])", ctx)})`);
		vm.runInContext("cmp_cap('hpam126', 2)", ctx);
		assert(vm.runInContext("dead_compound(character.items[3]) && bag_class(character.items[3]) === 'sell'", ctx), "+2 at its ceiling, no fighter wants it: sell");
		hb("Torlis", { ...tor, level: 60, gear: { w: { amulet: 0 }, own: {} } });
		vm.runInContext("my_gear_cache = null", ctx);
		assert(vm.runInContext("!dead_compound(character.items[3]) && bag_class(character.items[3]) !== 'sell'", ctx), "a fighter would wear it: not sold");
		hb("Torlis", { ...tor, level: 60, gear: { w: { amulet: 1e9 }, own: {} } });
		vm.runInContext("state.cmp_caps.hpam126.at = Date.now() - 8 * 86400000; cmp_cache = null", ctx);
		assert(vm.runInContext("cmp_top('hpam126') === CFG.compound_max_level && !dead_compound(character.items[3])", ctx), "the ceiling lapses after 7 days (odds re-checked)");
		// a low_chance pause from before v24.15 counts as the ceiling at once; bank copies come out to be sold
		vm.runInContext("state.cmp_caps = {}; skip('cmp:hpam126:2', 3600000, 'low_chance (40%)'); state.bank_gear = [{ name: 'hpam126', level: 2 }, { name: 'hpam126', level: 1 }]; state.fetch_try = {}", ctx);
		assert(vm.runInContext("cmp_top('hpam126') === 2 && dead_compound(character.items[3])", ctx), "an old low_chance pause is a ceiling too");
		assert(vm.runInContext("bag_plan().fetch.some((f) => f.key === 'dead:hpam126:2') && !bag_plan().fetch.some((f) => f.key === 'dead:hpam126:1')", ctx), "the bank's +2 comes out to be sold (not the +1, still compoundable)");
		vm.runInContext("state.cmp_caps = {}; state.gear_skip = {}; state.bank_gear = []; state.fetched = {}; state.partners = {}; cmp_cache = null", ctx);
		character.items = Array(42).fill(null); delete ctx.G.items.hpam126;
	}
	// 127) v24.16: routes as smart_move walks them; never stop a walk for what we can't take on; roamer deaths don't cool
	// the spot; no keep-away mid-walk; no group wait under attack
	{
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 52, map: "town", x: 0, y: 0, speed: 55, rip: false, hp: 4000, max_hp: 4000 });
		const maps0 = ctx.G.maps, mons0 = ctx.G.monsters, dist0 = ctx.distance;
		ctx.G.monsters = { ...mons0, rat127: { xp: 10, hp: 9200, attack: 320, speed: 12, charge: 86, aggro: 1 }, hawk127: { xp: 30000, hp: 32000, attack: 480, speed: 24, charge: 52, aggro: 1 } };
		// by map hops the long way (town → hall → dest, 2) wins; by distance the cave way (town → rats → tube → dest, 3)
		ctx.G.maps = { town: { doors: [[5000, 0, 10, 10, "hall", 0], [20, 0, 10, 10, "rats", 0], [10, 0, 10, 10, "camp", 0]], spawns: [[0, 0]], monsters: [] },
			hall: { doors: [[0, 0, 10, 10, "dest", 0]], spawns: [[0, 0]], monsters: [] },
			rats: { doors: [[30, 0, 10, 10, "tube", 0], [40, 0, 10, 10, "camp", 0]], spawns: [[0, 0]], monsters: [{ type: "rat127", count: 3, boundary: [100, 100, 200, 200] }] },
			camp: { doors: [], spawns: [[0, 0]], monsters: [] }, far: { doors: [[0, 0, 10, 10, "rats", 0]], spawns: [[0, 0]], monsters: [] },
			tube: { doors: [[30, 0, 10, 10, "dest", 0]], spawns: [[0, 0]], monsters: [] },
			dest: { doors: [], spawns: [[0, 0]], monsters: [] } };
		vm.runInContext("for (const k in hops_cache) delete hops_cache[k]; rt_cache.clear(); dz_cache.clear(); state.safe = {}; state.partners = {}", ctx);
		assert(JSON.stringify(vm.runInContext("route_to('dest', 0, 0).maps", ctx)) === '["rats","tube","dest"]', "the route smart_move takes: the short way, through the rats");
		// v24.17: there's a way around (the long hall): not dangerous, and go() walks that way
		const pl127 = vm.runInContext("route_plan('dest', 0, 0)", ctx);
		assert(pl127 && pl127.danger === null && pl127.around === "rat127 @ rats" && JSON.stringify(pl127.legs.map((l) => l.to)) === '["hall","dest"]',
			`the rats are on smart_move's way; the plan goes around through the hall (${JSON.stringify(pl127 && { a: pl127.around, l: pl127.legs.map((l) => l.to) })})`);
		assert(vm.runInContext("route_danger('dest')", ctx) === null && vm.runInContext("travel_s('dest', [0, 0, 10, 10])", ctx) > 5000 / 55, "a way around exists: not a danger, and the walk estimate is that way's");
		// a member elsewhere: its own way counts too
		hb("Sanala", { ...san, level: 60, map: "far", x: 0, y: 0 });
		assert(vm.runInContext("route_danger('camp')", ctx) === null && /Sanala's way/.test(vm.runInContext("party_route_danger('camp') || ''", ctx)),
			`camp: safe for us (its own door), but Sanala's only way there is through the rats (${vm.runInContext("party_route_danger('camp')", ctx)})`);
		vm.runInContext("state.partners = {}", ctx);
		ctx.G.maps = maps0; ctx.G.monsters = { ...mons0, hawk127: ctx.G.monsters.hawk127 };
		vm.runInContext("for (const k in hops_cache) delete hops_cache[k]; rt_cache.clear(); dz_cache.clear(); for (const k in deadly_c) delete deadly_c[k]", ctx);
		// a hawk (faster than us, can't take it) on us mid-walk: the walk goes on; standing, we fight back
		Object.assign(character, { map: "main", x: 0, y: 0, speed: 50 });
		ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
		ctx.parent.entities.h127 = { id: "h127", type: "monster", mtype: "hawk127", visible: true, x: 20, y: 0, target: "Torlis", hp: 32000, max_hp: 32000 };
		const st = []; const st0 = ctx.stop; ctx.stop = (a) => st.push(a);
		vm.runInContext("smart_depth = 1", ctx);
		assert(vm.runInContext("break_walk_for(parent.entities.h127)", ctx) === false && !st.length, "walking: a hawk on us doesn't stop the walk (through the door, it's left behind)");
		vm.runInContext("smart_depth = 0", ctx);
		// v24.62: the tank waits for a straggler even while something it can't take on is on one of us
		hb("Sanala", { ...san, level: 60, map: "main", x: 3000, y: 0 });
		assert(vm.runInContext("group_hold({ mtype: 'goo', map: 'main', boundary: [5000, 5000, 5100, 5100] }, false)", ctx) === "Sanala", "v24.62: the tank still waits for a straggler while something it can't take on is on one of us");
		vm.runInContext("state.group_wait = null", ctx);
		delete ctx.parent.entities.h127; ctx.stop = st0; ctx.distance = dist0; ctx.G.monsters = mons0;
		vm.runInContext("state.partners = {}; state.group_wait = null", ctx);
		// a roamer's kill doesn't cool the spot down
		vm.runInContext(`state.pack = { mtype: 'goo', map: 'main', boundary: [100, 100, 400, 400] }; state.cooldown = {}; state.dead_handled = false; state.danger = {};
			pmring.hits.push({ t: Date.now(), mtype: 'boar', dmg: 5000 }); G.monsters.boar = G.monsters.boar || { xp: 1, hp: 1, attack: 1 }; on_death(); pmring.hits.length = 0`, ctx);
		assert(vm.runInContext("!state.cooldown['main:100,100,400,400'] && state.danger.boar < 1", ctx), "killed by a roamer (not the spot's monster): the roamer is blamed, the spot isn't cooled");
		assert(/const lm = !walking\(\) && in_area \? looming\(\) : null/.test(src) && /length >= 4\) \{/.test(src), "keep-away only at the spot, not mid-walk; a spot cools after 4 episodes");
		vm.runInContext("state.pack = null; state.cooldown = {}; state.danger = {}; state.dead_handled = false; state.safety_mult = 1", ctx);
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, hp: 1000, max_hp: 1000 });
	}
	// 128) v24.17: go() walks around deadly ground — leg by leg, through doors and the transporter — or doesn't go
	{
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 52, map: "town", x: 0, y: 0, speed: 55, rip: false }); // the tank plans the way (a follower takes the plain one)
		const maps0 = ctx.G.maps, mons0 = ctx.G.monsters, npcs0 = ctx.G.npcs, sm0 = ctx.smart_move;
		ctx.G.monsters = { ...mons0, rat128: { xp: 10, hp: 9200, attack: 320, speed: 12, charge: 86, aggro: 1 } };
		ctx.G.npcs = { ...npcs0, transporter: { places: { town: 0, sand: 0 } } };
		// town → sand: the short way is through the rats' cave; the town's transporter (300px off) goes there too
		ctx.G.maps = { town: { doors: [[10, 0, 10, 10, "cave128", 0]], spawns: [[0, 0]], monsters: [], npcs: [{ id: "transporter", position: [300, 0] }] },
			cave128: { doors: [[10, 0, 10, 10, "sand", 0], [0, 0, 10, 10, "town", 0]], spawns: [[0, 0]], monsters: [{ type: "rat128", count: 3, boundary: [100, 100, 200, 200] }] },
			sand: { doors: [[0, 0, 10, 10, "cave128", 0]], spawns: [[0, 0]], monsters: [], npcs: [{ id: "transporter", position: [0, 50] }] },
			pit: { doors: [[0, 0, 10, 10, "cave128", 0]], spawns: [[0, 0]], monsters: [] } };
		ctx.G.maps.cave128.doors.push([20, 0, 10, 10, "pit", 0]);
		vm.runInContext("rt_cache.clear(); dz_cache.clear(); state.safe = {}; state.recovering = false", ctx);
		const walks = [], tps = [];
		ctx.smart_move = (d) => { walks.push(typeof d === "string" ? d : `${d.map}:${d.x},${d.y}`); if (d.map) character.map = d.map; return Promise.resolve(); };
		ctx.transport = (m, sp) => { tps.push(m); character.map = m; return Promise.resolve({ success: true }); };
		await vm.runInContext("go({ map: 'sand', x: 100, y: 100 })", ctx);
		assert(JSON.stringify(walks) === '["town:300,65","sand:100,100"]' && JSON.stringify(tps) === '["sand"]', `beside the transporter (65px below it: within the 160px the server allows), across, then the spot — not through the cave (${JSON.stringify([walks, tps])})`);
		// the pit: only reachable through the cave → don't go
		walks.length = 0; character.map = "town";
		vm.runInContext("rt_cache.clear(); globalThis.__g128 = go({ map: 'pit', x: 0, y: 0 }).then(() => 'went', (e) => e.reason)", ctx);
		assert(await vm.runInContext("globalThis.__g128", ctx) === "deadly_route" && walks.length === 0, "the pit's only way is through the rats: not going");
		// named places resolve like smart_move's table
		assert(JSON.stringify(vm.runInContext("dest_point('potions')", ctx)) === '{"map":"main","x":56,"y":-122}' && vm.runInContext("dest_point('goo')", ctx) === null, "dest_point: named places as smart_move resolves them (a monster: smart_move picks one, unknown)");
		ctx.G.maps = maps0; ctx.G.monsters = mons0; ctx.G.npcs = npcs0; ctx.smart_move = sm0; delete ctx.transport;
		vm.runInContext("rt_cache.clear(); dz_cache.clear()", ctx);
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0 });
	}
	// 130) v24.19: danger is judged by the stretches a route walks, not whole maps — the priest left the bank through a map
	// with hawks in a far corner
	{
		Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", level: 58, map: "bankx", x: 0, y: 0, speed: 41, rip: false });
		const maps0 = ctx.G.maps, mons0 = ctx.G.monsters, npcs0 = ctx.G.npcs;
		ctx.G.monsters = { ...mons0, hawk130: { xp: 30000, hp: 32000, attack: 480, speed: 24, charge: 52, aggro: 1 } };
		ctx.G.npcs = { ...npcs0, transporter: { places: { mainx: 0, sand: 0 } } };
		ctx.G.maps = { bankx: { doors: [[0, 0, 10, 10, "mainx", 0]], spawns: [[0, 0]], monsters: [] },
			mainx: { doors: [[0, 0, 10, 10, "bankx", 0]], spawns: [[0, 0]], npcs: [{ id: "transporter", position: [-300, -300] }],
				monsters: [{ type: "hawk130", count: 4, boundary: [1100, 160, 1586, 336] }] },
			sand: { doors: [], spawns: [[0, 0]], monsters: [], npcs: [{ id: "transporter", position: [0, 0] }] } };
		vm.runInContext("rt_cache.clear(); dz_cache.clear(); state.safe = {}", ctx);
		const pl = vm.runInContext("route_plan('sand', 0, 0)", ctx);
		assert(pl && pl.danger === null && vm.runInContext("route_danger('sand')", ctx) === null, `bank → main (hawks in the far corner) → transporter → sand: safe (${JSON.stringify(pl)})`);
		character.map = "sand";
		vm.runInContext("rt_cache.clear()", ctx);
		assert(/hawk130 @ mainx/.test(vm.runInContext("route_danger('mainx', 1300, 250) || ''", ctx)), "a walk into the hawks' corner is dangerous");
		ctx.G.maps = maps0; ctx.G.monsters = mons0; ctx.G.npcs = npcs0;
		vm.runInContext("rt_cache.clear(); dz_cache.clear()", ctx);
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, speed: 55 });
	}
	// 131) v24.20: bigger game panels (log size/font/resize handle, the status box) and ui(); no picks in jail / unreachable
	{
		const els = {}, pd0 = ctx.parent.document;
		const mk = (id) => ({ id, style: {}, textContent: "", offsetWidth: 128, offsetHeight: 60 });
		els.gamelog = mk("gamelog");
		ctx.parent.document = { getElementById: (id) => els[id] || null, createElement: () => mk(""), head: { appendChild: (e) => (els[e.id || "farmer-ui"] = e) } };
		const store131 = {}, sg = [ctx.set, ctx.get];
		// v24.21: off by default — and an earlier version's rule is taken out of the page
		els["farmer-ui"] = { id: "farmer-ui", textContent: "#gamelog{}", parentNode: { removeChild: (e) => delete els[e.id] } };
		assert(vm.runInContext("CFG.ui.enabled === false && apply_ui() === false", ctx) && !els["farmer-ui"], "ui off by default: the old style rule is removed from the game page");
		vm.runInContext("CFG.ui.enabled = true", ctx);
		ctx.set = (k, v) => ((store131[k] = JSON.stringify(v)), true); ctx.get = (k) => (k in store131 ? JSON.parse(store131[k]) : null);
		assert(vm.runInContext("apply_ui()", ctx) === true && /#gamelog\{width:560px !important;height:360px/.test(els["farmer-ui"]?.textContent || "") && /resize:both/.test(els["farmer-ui"].textContent),
			`the log gets CFG.ui's size, font and a resize handle (${els["farmer-ui"] && els["farmer-ui"].textContent.slice(0, 80)})`);
		vm.runInContext("ui(700, 450, 17)", ctx);
		assert(/width:700px !important;height:450px[^}]*font-size:17px/.test(els["farmer-ui"].textContent) && JSON.parse(store131.farmer_ui).log_w === 700, "ui(700, 450, 17): applied and saved");
		vm.runInContext("ui()", ctx);
		assert(/width:560px/.test(els["farmer-ui"].textContent), "ui(): back to CFG.ui");
		vm.runInContext("CFG.ui.enabled = false", ctx);
		[ctx.set, ctx.get] = sg; ctx.parent.document = pd0;
		// v25.21: the status box alone (CFG.ui.status_box): our iframe grows to its size; the log is left alone
		{
			const fe = { style: {}, offsetWidth: 128 }, gg = { style: {} }, w0 = ctx.window, d0 = ctx.document;
			ctx.window = { frameElement: fe }; ctx.document = { getElementById: (id) => (id === "gg" ? gg : null) };
			els["farmer-ui"] = undefined; delete els["farmer-ui"]; ctx.parent.document = { getElementById: (id) => els[id] || null, createElement: () => mk(""), head: { appendChild: (e) => (els[e.id || "farmer-ui"] = e) } };
			vm.runInContext("apply_ui()", ctx);
			assert(fe.style.height === vm.runInContext("CFG.ui.status_box.h", ctx) + "px" && gg.style.whiteSpace === "normal", `the status box is taller (${fe.style.height}), its text wraps`);
			// v25.23: w "log": widened so its left edge meets the log's (box left 900, log left 700 → +200 px)
			fe.clientWidth = 128; fe.getBoundingClientRect = () => ({ left: 900, width: 138 }); fe.style = {};
			els.gamelog.getBoundingClientRect = () => ({ left: 700, width: 400 });
			vm.runInContext("apply_status_box()", ctx);
			assert(fe.style.width === "328px", `the box's left edge lined up with the log's (${fe.style.width})`);
			fe.getBoundingClientRect = () => ({ left: 700, width: 338 }); fe.clientWidth = 328; fe.style.width = "328px";
			vm.runInContext("apply_status_box()", ctx);
			assert(fe.style.width === "328px", "...and left alone once it is");
			delete els.gamelog.getBoundingClientRect; fe.style = {};
			const fe1 = { style: {}, offsetWidth: 1 }; ctx.window = { frameElement: fe1 };
			assert(vm.runInContext("apply_status_box()", ctx) === false && !fe1.style.height, "a 1px runner frame (no status box) is left alone");
			ctx.window = { frameElement: fe };
			assert(!els["farmer-ui"], "...and the log isn't touched (CFG.ui.enabled stays off)");
			vm.runInContext("CFG.ui.status_box.enabled = false", ctx); fe.style = {};
			vm.runInContext("apply_status_box()", ctx);
			assert(!fe.style.width, "status_box off: the game's own size");
			vm.runInContext("CFG.ui.status_box.enabled = true", ctx);
			ctx.window = w0; ctx.document = d0; ctx.parent.document = pd0;
		}
		assert(vm.runInContext("map_ok('jail') === false", ctx) && /if \(!\(p\.score > 0\)\) return;/.test(src), "jail is never a pick, nor a spot with no way there");
	}
	// 132) v24.22: one in the bank at a time
	{
		Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", level: 58, map: "main", x: 0, y: 0, speed: 41, rip: false });
		vm.runInContext("state.partners = {}; state.errand = null; state.recovering = false", ctx);
		hb("Sanala", { ...san, level: 51, x: 200, y: 0 });
		// the bank: wait while another of ours is inside
		hb("Torlis", { ...tor, level: 60, map: "bank", x: 0, y: 0 });
		character.items = Array(42).fill(null); character.items[3] = { name: "gslime", q: 2 };
		vm.runInContext("globalThis.__bk = task_bank(['gslime']).then(() => 'went', (e) => e.reason)", ctx);
		assert(await vm.runInContext("globalThis.__bk", ctx) === "bank_busy", "Torlis is in the bank: we wait (no hammering at the door)");
		character.items = Array(42).fill(null);
		vm.runInContext("state.partners = {}", ctx);
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, speed: 55 });
	}
	// 133) v24.23: escaping or kiting picks open ground, not just "straight away" — out of a corner, past a dead end
	{
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, speed: 55, rip: false });
		const cmt0 = ctx.can_move_to, cm0 = ctx.can_move;
		// a corner: cliffs to the east (x > 20) and the north (y < -20); the monster sits just west of us
		ctx.can_move_to = (x, y) => x <= 20 && y >= -20;
		ctx.can_move = (o) => o.going_x <= 20 && o.going_y >= -20 && !(o.going_y > 200 && o.going_x > -50); // straight south runs into a dead end past 200
		const m133 = { x: -40, y: 0 };
		const p = vm.runInContext("(m) => best_escape(m, 140)", ctx)(m133);
		assert(p && p.x <= 20 && p.y >= -20 && Math.hypot(p.x - m133.x, p.y - m133.y) > 100,
			`cornered (cliffs east and north, the monster west): out along the open side (${JSON.stringify(p)})`);
		assert(!(p.y > 100 && p.x > -50), "...not down the dead end to the south");
		ctx.can_move_to = () => false;
		assert(vm.runInContext("(m) => best_escape(m, 140)", ctx)(m133) === null, "walled in all round: nothing (fight back)");
		ctx.can_move_to = cmt0; if (cm0) ctx.can_move = cm0; else delete ctx.can_move;
	}
	// 134) v24.24: with the tank near, nobody else touches an untouched monster (it attacks whoever hits it first, for good)
	{
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, hp: 1000, max_hp: 1000, rip: false });
		const dist0 = ctx.distance, scm = ctx.send_cm; ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
		const sent = []; ctx.send_cm = (to, m) => (sent.push([to.join(), m.k, m.id]), Promise.resolve());
		vm.runInContext("state.partners = {}; tank_hold.id = null; CFG.party.tank_first = true", ctx);
		hb("Torlis", { ...tor, level: 60, x: 50, y: 0, v: "0.1", armor: 400, max_hp: 6000, hp: 6000 }); // another version: still our tank
		const easy = { id: "e134", type: "monster", mtype: "goo", visible: true, hp: 100, max_hp: 100, target: null, x: 100, y: 0 };
		ctx.parent.entities.e134 = easy;
		assert(vm.runInContext("tank_cover() && tank_cover().name", ctx) === "Torlis", "the tank counts whatever version it runs");
		assert(vm.runInContext("hold_for_tank(parent.entities.e134)", ctx) === true, "an untouched goo (one we'd solo): we hold for the tank anyway");
		assert(sent.some(([to, k, id]) => to === "Torlis" && k === "tgt" && id === "e134"), "...and tell the tank our pick at once");
		vm.runInContext("tank_hold.at = Date.now() - 3600_000; inflight.attack = false", ctx);
		assert(vm.runInContext("hold_for_tank(parent.entities.e134)", ctx) === true && vm.runInContext("fire('attack', parent.entities.e134)", ctx) === false, "v24.46: an hour later we still hold: the tank always hits first");
		vm.runInContext("tank_hold.id = null", ctx); easy.target = "Torlis";
		assert(vm.runInContext("hold_for_tank(parent.entities.e134)", ctx) === false, "the tank has it: fire");
		easy.target = null; hb("Torlis", { ...tor, level: 60, x: 50, y: 0, armor: 400, max_hp: 6000, hp: 6000, recovering: true });
		assert(vm.runInContext("hold_for_tank(parent.entities.e134)", ctx) === true, "v24.50: the tank is fleeing: still nobody else starts a fight");
		hb("Torlis", { ...tor, level: 60, x: 50, y: 0, armor: 400, max_hp: 6000, hp: 0, rip: true });
		assert(vm.runInContext("hold_for_tank(parent.entities.e134)", ctx) === false, "the tank is dead: we fight on our own judgement");
		delete ctx.parent.entities.e134; ctx.distance = dist0; ctx.send_cm = scm;
		vm.runInContext("state.partners = {}; tank_hold.id = null", ctx);
	}
	// 135) v24.25: the tank leads (warrior, then paladin, then by name); with none online nobody leads; it judges aggressive monsters on the squishiest member
	{
		const L = (arr) => vm.runInContext(`pick_leader(${JSON.stringify(arr)})`, ctx);
		const sana = { name: "Sanala", level: 51, ctype: "mage" }, tor = { name: "Torlis", level: 52, ctype: "paladin" }, asp = { name: "Aspernari", level: 58, ctype: "priest" };
		assert(L([sana, tor, asp]) === "Torlis", "the paladin leads, not the lowest level");
		assert(L([sana, tor, asp, { name: "Wally", level: 40, ctype: "warrior" }]) === "Wally", "a warrior before a paladin");
		assert(L([sana, tor, asp, { name: "Abe", level: 90, ctype: "paladin" }]) === "Abe", "two paladins: by name (not by level)");
		assert(L([sana, asp]) === null, "no tank online: nobody leads");
		// no tank online: the others follow nobody, and stand
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, rip: false });
		vm.runInContext("state.partners = {}; state.errand = null; state.recovering = false", ctx);
		assert(vm.runInContext("leader_name() === null && is_follower() && leader_hb() === undefined", ctx), "a mage with no tank ever heard: no leader, and it doesn't lead itself");
		hb("Aspernari", { ...asp, level: 58, ctype: "priest", x: -30, y: 0 });
		{
			const mv135 = []; const sm135 = ctx.smart_move, mo135 = ctx.move;
			ctx.smart_move = (d) => (mv135.push(d), Promise.resolve()); ctx.move = (x, y) => (mv135.push([x, y]), Promise.resolve());
			vm.runInContext("follower_tick()", ctx);
			assert(!mv135.length && vm.runInContext("is_follower() && leader_name() === null", ctx), "two members without the tank: nobody leads, the follower stands");
			ctx.smart_move = sm135; ctx.move = mo135;
		}
		hb("Torlis", { ...tor, ctype: "paladin", level: 52, x: 30, y: 0 });
		vm.runInContext("state.partners.Torlis.t -= 60_000", ctx); // the tank went offline
		assert(vm.runInContext("leader_name() === 'Torlis' && is_follower() && !partners_any().some((p) => p.name === 'Torlis')", ctx), "the tank offline: still named as the leader (from its last heartbeat), nobody takes over");
		assert(vm.runInContext("CFG.party.leader === undefined && CFG.party.tank_leads === undefined && CFG.party.split === undefined && CFG.party.all_or_nothing === undefined", ctx), "no other leadership settings");
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 52, map: "main", x: 0, y: 0, speed: 50, hp: 6000, max_hp: 6000, rip: false, attack: 300, frequency: 1, armor: 400, resistance: 200 });
		vm.runInContext("state.partners = {}; state.pack = { mtype: 'goo', map: 'main', boundary: [3000, 3000, 3200, 3200] }; state.errand = null; state.recovering = false", ctx);
		hb("Sanala", { ...san, level: 51, ctype: "mage", x: 30, y: 0, speed: 58, max_hp: 4000, hp: 4000, armor: 50, resistance: 50 });
		hb("Aspernari", { ...asp, level: 58, ctype: "priest", x: -30, y: 0, speed: 41, max_hp: 5000, hp: 5000, armor: 80, resistance: 80 });
		assert(vm.runInContext("leader_name() === 'Torlis' && !is_follower()", ctx), "Torlis leads");
		// an aggressive monster: judged on Sanala (4000 hp, the squishiest near), not on the tank's 6000 and armour
		const f = vm.runInContext("fight_math({ hp: 1000, attack: 200, frequency: 1, aggro: 1, damage_type: 'physical', xp: 10 })", ctx);
		const g = vm.runInContext("fight_math({ hp: 1000, attack: 200, frequency: 1, aggro: 0, damage_type: 'physical', xp: 10 })", ctx);
		assert(f.hp_pool === 4000 && g.hp_pool === 6000, `aggressive: Sanala's 4000 HP is the pool (passive: ours) (${f.hp_pool}, ${g.hp_pool})`);
		vm.runInContext("state.partners = {}; state.pack = null", ctx);
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, speed: 55, hp: 1000, max_hp: 1000 });
	}
	// 136) v24.26: gear evaluation from the class stat weights (G.classes lstats), offhand modifiers, set bonuses
	{
		const R = (c) => vm.runInContext(c, ctx);
		const mc = ctx.G.classes.mage, pc = ctx.G.classes.paladin, prc = ctx.G.classes.priest;
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, rip: false, esize: 30, attack: 400 });
		R("state.partners = {}; state.guide = null; state.guide_equip = {}; state.gear_skip = {}; my_gear_cache = null; gear_busy = false");
		// weights come from G.classes[c].lstats, relative to main_stat (main = CFG.gear_w.main_stat)
		ctx.G.classes.mage = { ...mc, main_stat: "int", lstats: { str: 0.2, dex: 0.5, int: 1, vit: 0.3, for: 0.02 } };
		const wm = R("gear_weights('mage')");
		assert(wm.int === 1.2 && wm.dex === 0.6 && wm.str === 0.24 && wm.vit === 0.36, `mage weights from G lstats: int 1.2, dex 0.5→0.6, str 0.24, vit 0.36 (${JSON.stringify(wm)})`);
		assert(R("class_stats('mage').src") === "G" && /G\.classes lstats, main int/.test(R("gear_weights_text('mage')")), "the weights say where they come from");
		// no lstats in G (an old client): the built-in docs copy, same values as design/classes.py
		ctx.G.classes.priest = { damage_type: "magical", offhand: { shield: { speed: -5 }, source: {} } };
		const wp = R("gear_weights('priest')");
		assert(R("class_stats('priest').src") === "doc" && wp.int === 1.2 && wp.str === 0.24 && wp.vit === 0.48 && Math.abs(wp.for - 0.03) < 1e-9, `priest from the docs copy (${JSON.stringify(wp)})`);
		// tanks: defence x gear_tank_mult, fortitude not (PvP only); side_stat int = str
		ctx.G.classes.paladin = { damage_type: "physical", main_stat: "str", side_stat: "int", lstats: { str: 1, dex: 0.05, int: 1, vit: 0.4, for: 0.2 } };
		const wl = R("gear_weights('paladin')");
		assert(wl.str === 1.2 && wl.int === 1.2 && wl.vit === 0.96 && wl.for === 0.24 && wl.armor === 0.6, `paladin: str = int 1.2, vit 0.48 x2, for 0.24 (not x2), armor 0.3 x2 (${JSON.stringify(wl)})`);
		// offhand class modifiers count (priest shield -5 speed): armor 10 x 0.3 - 5 x 0.5
		ctx.G.items.shield136 = { type: "shield", armor: 10 };
		assert(R("gear_score({ name: 'shield136', level: 0 }, 'priest')") === 0.5, `a priest's shield pays its -5 speed (${R("gear_score({ name: 'shield136', level: 0 }, 'priest')")})`);
		// set bonuses: levels add up (server); a piece is worth what it adds to the set where it'd go
		ctx.G.sets = { wan136: { items: ["wcap136", "wat136"], 1: {}, 2: { hp: 200 }, 3: { mp: 100 } } };
		R("set_bonus('wan136', 3).hp === 200 && set_bonus('wan136', 3).mp === 100") || assert(false, "set bonus is cumulative");
		ctx.G.items.wcap136 = { type: "helmet", armor: 5, set: "wan136" }; ctx.G.items.wat136 = { type: "chest", armor: 5, set: "wan136" };
		ctx.G.items.helm136 = { type: "helmet", armor: 6 };
		character.slots = { helmet: { name: "helm136", level: 0 }, chest: { name: "wat136", level: 0 } };
		R("my_gear_cache = null");
		const g1 = R("my_gear()");
		assert(g1.sets.wan136 === 1 && g1.sset.chest === "wan136" && g1.w.chest === 1.5, `worn sets tracked; one piece alone adds no bonus (${JSON.stringify(g1)})`);
		const r1 = R("gear_gain({ name: 'wcap136', level: 0 }, 'mage', my_gear())");
		assert(r1 && r1.slot === "helmet" && r1.score === 11.5 && Math.round(r1.gain * 10) === 97, `the cap completes 2pc (+200 hp = 10): 1.5 + 10 beats the 1.8 helmet (${JSON.stringify(r1)})`);
		character.slots = { helmet: { name: "helm136", level: 0 } }; R("my_gear_cache = null");
		assert(!R("gear_gain({ name: 'wcap136', level: 0 }, 'mage', my_gear())"), "without the chest piece the cap is just a worse helmet");
		character.slots = { helmet: { name: "wcap136", level: 0 }, chest: { name: "wat136", level: 0 } }; R("my_gear_cache = null");
		const g2 = R("my_gear()");
		assert(g2.w.helmet === 11.5 && g2.w.chest === 11.5, `wearing both: each piece's score holds the bonus it would take with it (${JSON.stringify(g2.w)})`);
		assert(!R("gear_gain({ name: 'helm136', level: 0 }, 'mage', my_gear())"), "a plain helmet doesn't replace a set piece it scores above alone");
		// a partner's heartbeat carries its sets: the same judgement for it
		assert(R("!!gear_gain({ name: 'wcap136', level: 0 }, 'mage', { w: { helmet: 1.8 }, sets: { wan136: 1 }, sset: { chest: 'wan136' } })"), "judged for a partner from its heartbeat sets");
		assert(/armor 5×0\.3=1\.5/.test(R("gear_why({ name: 'wcap136', level: 0 }, 'mage', my_gear(), 'helmet')")) && /\+set wan136 10/.test(R("gear_why({ name: 'wcap136', level: 0 }, 'mage', { sets: { wan136: 1 }, sset: { chest: 'wan136' } }, 'helmet')")),
			`gear_why explains the points (${R("gear_why({ name: 'wcap136', level: 0 }, 'mage', { sets: { wan136: 1 }, sset: { chest: 'wan136' } }, 'helmet')")})`);
		const gc = R("gear_check_lines()").join("\n");
		assert(/weights mage \(G\.classes lstats/.test(gc) && /worn: armor 5×0\.3=1\.5 \(\+set wan136 10\)/.test(gc), "gear_check shows the weights and where each worn piece's points come from");
		// v24.67: the missing piece of a set that only wins once upgraded is bought with tokens and becomes our own project
		{
			const I = ctx.G.items, keep = { tokens: ctx.G.tokens, items: character.items, ctype: character.ctype, gold: character.gold, upg: R("state.upg") };
			const up = { stat: 1, resistance: 4, armor: 4 }, gr = [0, 7, 10, 12];
			for (const [n, t] of [["mmh137", "helmet"], ["mma137", "chest"], ["mmp137", "pants"], ["mms137", "shoes"], ["mmg137", "gloves"]]) I[n] = { type: t, set: "mm137", armor: 22, resistance: 11, upgrade: up, grades: gr, g: 68000 };
			I.gl137 = { type: "gloves", armor: 16, resistance: 8, upgrade: { stat: 1, resistance: 2.5, armor: 2.5 }, grades: gr, g: 34000 };
			I.scroll0 = I.scroll0 || { g: 1000 }; I.scroll1 = I.scroll1 || { g: 40000 }; I.monstertoken = I.monstertoken || { type: "token", s: true };
			ctx.G.sets.mm137 = { items: ["mmh137", "mma137", "mmg137", "mmp137", "mms137"], 1: {}, 2: { int: 2 }, 3: { int: 3 }, 4: { rpiercing: 40 }, 5: { crit: 2 } };
			ctx.G.tokens = { monstertoken: { mmg137: 8 } };
			character.ctype = "mage"; character.gold = 5_000_000;
			character.slots = { helmet: { name: "mmh137", level: 3 }, chest: { name: "mma137", level: 3 }, pants: { name: "mmp137", level: 1 }, shoes: { name: "mms137", level: 0 }, gloves: { name: "gl137", level: 5 } };
			character.items = Array(42).fill(null); character.items[0] = { name: "monstertoken", q: 9 };
			R("state.upg = null; state.bank_gear = []; state.upg_caps = {}");
			assert(R("gear_gain({ name: 'mmg137', level: 0 }, 'mage', my_gear())") === null, "setup: the set's fifth piece at +0 doesn't beat the worn +5 gloves");
			const tp = R("JSON.stringify(token_pick())");
			assert(/"name":"mmg137"/.test(tp) && R("token_pick().to") >= 1, `...but it's bought with tokens to be upgraded to the level where it wins (${tp})`);
			R("state.upg = { name: 'mmg137', to: token_pick().to, for: character.name, own: true }; state.upg_pick_at = Date.now()");
			character.items[1] = { name: "mmg137", level: 0 };
			assert(R("upgrade_due()") === true && R("state.upg.own") === true, "our own project on it is upgrade work for the next town trip, merchant or not");
			assert(R("token_pick()") === null, "...and no second copy is bought meanwhile");
			// v24.69: the same piece lying in the bank at +0: fetched, then our own project
			character.items[1] = null; character.items[0] = null;
			R("state.upg = null; state.upg_pick_at = Date.now(); state.bank_gear = [{ name: 'mmg137', level: 0 }]; state.fetch_try = {}");
			assert(R("JSON.stringify(set_piece_fetch().map((f) => f.name + '+' + f.level))") === '["mmg137+0"]', `a set piece in the bank that wins once upgraded is fetched (${R("JSON.stringify(set_piece_fetch())")})`);
			assert(R("bag_plan().fetch.some((f) => f.key === 'setp:mmg137')"), "...it's on the bank visit's fetch list");
			assert(/ours next: mmg137\+0 \(bank\) → \+\d/.test(R("upgrade_why()")), `v24.70: the report says which piece of ours is next (${R("upgrade_why()")})`);
			assert(/"gloves":"gl137\+5"/.test(R("report_facts().find((f) => f.key === 'worn_json').text")), "v24.70: the report dumps what's worn as JSON");
			character.items[1] = { name: "mmg137", level: 0 };
			assert(R("set_piece_fetch().length") === 0, "...not fetched again once a copy is in the bags");
			assert(R("upgrade_due()") === true && R("state.upg && state.upg.own && state.upg.name") === "mmg137" && R("state.upg.to") >= 1, `...and in the bags it becomes our own upgrade project (${R("JSON.stringify(state.upg)")})`);
			// v25.17: with the merchant online, our pieces are its projects: the own project is handed over, none is started
			{
				const gm = R("JSON.parse(JSON.stringify(my_gear()))"), me = character.name;
				R("state.merchant = { name: CFG.merchant.name, t: Date.now(), map: 'main', x: 0, y: 0, esize: 30, gold: 9e6 }; spp_cache.clear()");
				assert(R("upgrade_due()") === false && R("state.upg") === null, "merchant online: our own project is handed to it");
				assert(R("set_piece_plan('mmg137', 0)") === null && R("set_piece_fetch().length") === 0, "...and none is started or fetched");
				assert(R("bag_class(character.items[1])") !== "keep" && !R("needed_slots().has(1)"), `...the copy isn't kept for one (${R("bag_class(character.items[1])")})`);
				// the merchant: the fighter's piece in the bank becomes its project for her
				const sv = { name: character.name, ctype: character.ctype, items: character.items, slots: character.slots };
				Object.assign(character, { name: R("CFG.merchant.name"), ctype: "merchant", items: Array(42).fill(null), slots: {} });
				R(`state.merchant = null; state.upg = null; state.upg_caps = {}; state.gear_skip = {}; state.bank_gear = [{ name: 'mmg137', level: 0 }];
					state.partners = { ${JSON.stringify(me)}: { name: ${JSON.stringify(me)}, ctype: 'mage', level: 54, map: 'main', x: 0, y: 0, t: Date.now(), gold: 0, gear: ${JSON.stringify(gm)} } }`);
				const pk = R("JSON.stringify(pick_upgrade())");
				assert(/"name":"mmg137"/.test(pk) && /"from_copy":0/.test(pk) && new RegExp(`"for":"${me}"`).test(pk), `the merchant picks the bank copy as a project for ${me} (${pk})`);
				R("state.upg = pick_upgrade(); state.fetch_try = {}");
				assert(R("bag_plan().fetch.some((f) => f.key === 'upgin:mmg137')"), "...and fetches that copy from the bank for it");
				// the run fetches the bank copy before its first step (the bank step comes later in a town run); an unsold
				// piece gone from the bank ends the project instead of pausing it a day
				{
					const tb = ctx.task_bank, ru = ctx.run_upgrade, calls = [];
					ctx.task_bank = async (f) => { calls.push("bank:" + f.map((x) => x.key).join()); character.items[5] = { name: "mmg137", level: 0 }; return 1; };
					ctx.run_upgrade = async (a) => { calls.push("upgrade:" + a.name + "@" + R("best_level_held('mmg137')")); character.items[5].level++; return 1; };
					R("state.gear_skip = {}; sold_c.set('mmg137', false)");
					await R("task_upgrade()");
					assert(calls[0] === "bank:upgin:mmg137" && calls[1] === "upgrade:mmg137@0", `copy fetched from the bank first, then upgraded (${calls})`);
					character.items[5] = null; calls.length = 0;
					ctx.task_bank = async (f) => { calls.push("bank"); return 0; };
					R("state.upg = { name: 'mmg137', to: 5, for: 'Sanala', slot: 'gloves', gain: 11, cost: 1, from_copy: 0 }; state.bank_gear = [{ name: 'mmg137', level: 0 }]; state.gear_skip = {}");
					await R("task_upgrade()");
					assert(R("state.upg") === null && !R("skipped('upg:mmg137')") && calls.length === 1 && R("state.bank_gear.length") === 0, "a copy gone from the bank (unsold piece): project ended, not paused 24h");
					ctx.task_bank = async () => { throw { reason: "weird" }; };
					R("state.upg = { name: 'mmg137', to: 5, for: 'Sanala', slot: 'gloves', gain: 11, cost: 1, from_copy: 0 }; state.bank_gear = [{ name: 'mmg137', level: 0 }]; state.gear_skip = {}");
					await R("task_upgrade()");
					assert(R("!!state.upg && skipped('upg:mmg137') && state.bank_gear.length === 1"), "a failed bank visit pauses the project, keeps the copy on record");
					ctx.task_bank = tb; ctx.run_upgrade = ru; R("sold_c.delete('mmg137')");
				}
				Object.assign(character, sv);
				R("state.partners = {}; state.merchant = null; state.upg = null; state.bank_gear = []; spp_cache.clear()");
			}
			R("state.bank_gear = []");
			for (const n of ["mmh137", "mma137", "mmp137", "mms137", "mmg137", "gl137"]) delete I[n];
			delete ctx.G.sets.mm137; ctx.G.tokens = keep.tokens; character.items = keep.items; character.ctype = keep.ctype; character.gold = keep.gold;
			R("state.upg = null; state.upg_pick_at = 0");
		}
		// v24.72: with sell_junk off nothing is sold as junk, bank full or not
		{
			const it = { name: "helm1", level: 0 }, items0 = character.items;
			character.items = Array(42).fill(null); character.items[0] = it; character.slots = { helmet: { name: "helm3", level: 5 } };
			R("state.bank_full_at = Date.now(); state.upg = null; spp_cache.clear()");
			const on = R("is_junk(character.items[0])");
			R("CFG.sell_junk = false");
			assert(R("is_junk(character.items[0])") === false && R("bag_class(character.items[0])") !== "sell", `sell_junk off: a plain +0 piece isn't sold even with the bank full (it was junk before: ${on})`);
			R("CFG.sell_junk = true; state.bank_full_at = 0");
			character.items = items0; character.slots = {};
		}
		// v24.74: plain copies on the sell_plain list are sold — sell_junk off, fetched a minute ago or not; upgraded ones never
		{
			const items0 = character.items, I = ctx.G.items; I.stf137 = { type: "weapon", wtype: "staff", attack: 25, upgrade: { attack: 5 }, g: 12400 };
			character.items = Array(42).fill(null); character.items[0] = { name: "stf137", level: 0 }; character.items[1] = { name: "stf137", level: 5 }; character.items[2] = { name: "stf137", level: 0, p: "shiny" };
			R("globalThis.__sp137 = CFG.sell_plain; CFG.sell_plain = ['stf137']; CFG.sell_junk = false; state.fetched.stf137 = Date.now(); state.upg = null; spp_cache.clear(); cmp_cache = null");
			assert(R("bag_class(character.items[0])") === "sell" && R("bag_class(character.items[1])") !== "sell" && R("bag_class(character.items[2])") !== "sell", `sell_plain: the +0 copy is sold, the +5 and the titled one aren't (${R("[0,1,2].map((k) => bag_class(character.items[k])).join()")})`);
			R("CFG.sell_plain = __sp137; CFG.sell_junk = true; delete state.fetched.stf137");
			delete I.stf137; character.items = items0;
		}
		// v24.77: stat scrolls for worn pieces with an empty Stat line
		{
			const I = ctx.G.items, keep = { slots: character.slots, ctype: character.ctype, gold: character.gold };
			I.strscroll = { type: "pscroll", stat: "str", g: 8000 };
			I.sg0_137 = { type: "gloves", stat: 2, upgrade: { stat: 1 }, grades: [7, 9, 10, 12], armor: 5 };  // normal grade at +3
			I.sg1_137 = { type: "pants", stat: 2, upgrade: { stat: 1 }, grades: [0, 9, 10, 12], armor: 5 };   // high grade at +0
			I.sg2_137 = { type: "chest", stat: 3, upgrade: { stat: 1 }, grades: [0, 0, 10, 12], armor: 5 };   // rare at +0
			I.sgx_137 = { type: "helmet", upgrade: { armor: 1 }, grades: [7, 9, 10, 12], armor: 5 };          // no Stat line
			const ig137 = ctx.item_grade; ctx.item_grade = (it) => { const g = I[it.name]?.grades || []; let n = 0; for (const t of g.slice(0, 3)) if ((it.level || 0) >= t) n++; return n; }; // the game's rule
			Object.assign(character, { ctype: "paladin", gold: 5_000_000 });
			character.slots = { gloves: { name: "sg0_137", level: 3 }, pants: { name: "sg1_137", level: 0 }, chest: { name: "sg2_137", level: 0 }, helmet: { name: "sgx_137", level: 0 }, shoes: { name: "sg0_137", level: 0, stat_type: "str" } };
			R("state.gear_skip = Object.fromEntries(Object.entries(state.gear_skip).filter(([k]) => !k.startsWith('stat:')))");
			R("globalThis.__ss137 = { ...CFG.stat_scroll }; CFG.stat_scroll.min_level = 0; CFG.stat_scroll.max_cost = Infinity");
			const L = JSON.parse(R("JSON.stringify(stat_scroll_list().map((r) => [r.slot, r.stat, r.q, r.cost, r.ok]))"));
			assert(JSON.stringify(L) === '[["gloves","str",1,8000,true],["pants","str",10,80000,true],["chest","str",100,800000,false]]',
				`stat scrolls: the class's main stat; 1/10/100 scrolls by grade; the rare piece is over the price cap; scrolled and stat-less pieces aren't listed (${JSON.stringify(L)})`);
			assert(R("town_due().stat") === true && /chest.*not done: 800k/.test(R("report_facts().find((f) => f.key === 'stat').text").replace(/sg2_137/, "chest")), "...due on a town trip, and the report says what is left and why");
			// v24.78: only at +7 or higher, and never more than max_cost for one piece
			R("Object.assign(CFG.stat_scroll, __ss137)");
			assert(R("stat_scroll_list().every((r) => !r.ok && /only at \\+7/.test(r.why))") && R("town_due().stat") === false, "by default nothing under +7 is scrolled");
			character.slots.gloves.level = 7; character.slots.chest.level = 7;
			const L7 = JSON.parse(R("JSON.stringify(stat_scroll_list().filter((r) => r.level >= 7).map((r) => [r.slot, r.q, r.ok]))"));
			assert(JSON.stringify(L7) === '[["gloves",10,true],["chest",100,false]]', `at +7: the piece that turned high grade takes 10 scrolls and is done; the rare one (800k) is over max_cost (${JSON.stringify(L7)})`);
			for (const n of ["sg0_137", "sg1_137", "sg2_137", "sgx_137"]) delete I[n];
			ctx.item_grade = ig137;
			character.slots = keep.slots; character.ctype = keep.ctype; character.gold = keep.gold;
		}
		// v24.80: attack and attack speed valued as damage — a priest's two-handed wand against a staff plus an offhand
		{
			const I = ctx.G.items, keep = { slots: character.slots, ctype: character.ctype, attack: character.attack, frequency: character.frequency, int: character.int, cls: ctx.G.classes.priest };
			I.wnd137 = { type: "weapon", wtype: "wand", attack: 16, range: 30, upgrade: { attack: 3, range: 6 } };
			I.stf138 = { type: "weapon", wtype: "staff", attack: 30, range: 53, upgrade: { attack: 5.25, range: 3.25 } };
			I.lan137 = { type: "misc_offhand", resistance: 120, evasion: 10 };
			ctx.G.classes.priest = { ...(keep.cls || {}), main_stat: "int", lstats: { str: 0.2, dex: 0.2, int: 1, vit: 0.3, for: 0.02 }, mainhand: { staff: { speed: -4 } }, doublehand: { wand: { frequency: 40 } }, offhand: { misc_offhand: { speed: -4 } } };
			// as she stood: the wand+1 in hand, nothing in the offhand; int 150 → 12 attack per point of item attack
			Object.assign(character, { ctype: "priest", int: 150, frequency: 1.21, attack: Math.round(1.6 * 30 + 19 * 12) });
			character.slots = { mainhand: { name: "wnd137", level: 1 } };
			R("my_gear_cache = null; globalThis.__gd137 = CFG.gear_dps; CFG.gear_dps = false");
			const flat = R("JSON.stringify([slot_value({ name: 'wnd137', level: 1 }, 'priest', my_gear(), 'mainhand'), slot_value({ name: 'stf138', level: 5 }, 'priest', my_gear(), 'mainhand') + slot_value({ name: 'lan137' }, 'priest', my_gear(), 'offhand')])");
			R("CFG.gear_dps = true; my_gear_cache = null");
			const dps = JSON.parse(R("JSON.stringify([slot_value({ name: 'wnd137', level: 1 }, 'priest', my_gear(), 'mainhand'), slot_value({ name: 'stf138', level: 5 }, 'priest', my_gear(), 'mainhand') + slot_value({ name: 'lan137' }, 'priest', my_gear(), 'offhand')])"));
			assert(JSON.parse(flat)[0] > JSON.parse(flat)[1] && dps[1] > dps[0] * 1.5, `the flat weights put the +1 wand ahead of staff+5 and lantern (${flat}); as damage the staff and lantern are far ahead (${JSON.stringify(dps)})`);
			assert(R("!!gear_gain({ name: 'stf138', level: 5 }, 'priest', my_gear())"), "...so the staff is an upgrade over the wand she holds");
			// and from the other side (the staff worn): the wand is still not an upgrade — no flip-flop
			Object.assign(character, { frequency: 0.81, attack: Math.round(1.6 * 30 + 56.25 * 12) });
			character.slots = { mainhand: { name: "stf138", level: 5 }, offhand: { name: "lan137" } };
			R("my_gear_cache = null");
			assert(R("gear_gain({ name: 'wnd137', level: 1 }, 'priest', my_gear())") === null, "holding the staff and lantern, the wand isn't an upgrade (no swapping back)");
			assert(R("dps_ctx({ off: true })") === null, "a partner on an older version (off: true) is judged with the flat weights");
			R("CFG.gear_dps = __gd137; my_gear_cache = null");
			for (const n of ["wnd137", "stf138", "lan137"]) delete I[n];
			ctx.G.classes.priest = keep.cls; Object.assign(character, { ctype: keep.ctype, attack: keep.attack, frequency: keep.frequency, int: keep.int }); character.slots = keep.slots;
		}
		// v24.84: the camp review — on time, early once the party is stronger; never while a monster is on a member
		{
			const pk = { mtype: "croc", map: "main", boundary: [0, 0, 100, 100] }, ents0 = ctx.parent.entities;
			ctx.parent.entities = {};
			R("globalThis.__pp84 = pick_pack; globalThis.__ppn = 0; pick_pack = () => { __ppn++; state.review_at = Date.now(); state.review_pw = party_power(); }; pw_cache = null; state.errand = null; smart_depth = 0");
			R(`state.pack = ${JSON.stringify(pk)}; state.review_at = Date.now() - 5 * 60_000; state.review_pw = party_power()`);
			R("camp_review()");
			assert(R("__ppn") === 0, "5 min at the camp, the party no stronger: no review");
			R("state.review_at = Date.now() - 31 * 60_000; camp_review()");
			assert(R("__ppn") === 1 && /30 min at the camp/.test(R("state.review_last.why")), "30 min at the camp: reviewed");
			R("state.review_at = Date.now() - 11 * 60_000; state.review_pw = { lv: party_power().lv - 1, gs: party_power().gs }; camp_review()");
			assert(R("__ppn") === 2 && /stronger/.test(R("state.review_last.why")), "a level gained and 10 min there: reviewed early");
			R("state.review_at = Date.now() - 2 * 60_000; state.review_pw = party_power(); state.review_dir = ''; state.directive = { monster: 'bee', map: 'main', until: Date.now() + 3600_000, reason: 'monster hunt 483 left' }; camp_review()");
			assert(R("__ppn") === 3 && /goal: monster hunt/.test(R("state.review_last.why")), `v24.88: a new goal (a hunt taken) → reviewed after a minute (${R("state.review_last && state.review_last.why")})`);
			R("state.directive = null; state.review_dir = ''");
			R("state.review_at = Date.now() - 31 * 60_000");
			ctx.parent.entities = { m84: { id: "m84", type: "monster", mtype: "croc", visible: true, dead: false, target: character.name, x: 0, y: 0 } };
			R("camp_review()");
			assert(R("__ppn") === 3, "...never while a monster is on a member");
			ctx.parent.entities = {};
			// a measurement loses weight as the party grows
			R(`state.measured['k84'] = 500; state.meas_at['p:k84'] = Date.now(); state.meas_at['w:k84'] = { lv: party_power().lv, gs: party_power().gs }`);
			const same = R("meas_aged('k84', 100)");
			R("state.meas_at['w:k84'] = { lv: party_power().lv - 2, gs: party_power().gs }");
			const up2 = R("meas_aged('k84', 100)");
			assert(Math.round(same) === 500 && Math.round(up2) === 300, `a camp measured two levels ago counts half (${same} → ${up2})`);
			R("delete state.measured.k84; delete state.meas_at['p:k84']; delete state.meas_at['w:k84']; pick_pack = __pp84; state.pack = null; state.review_last = null");
			ctx.parent.entities = ents0;
		}
		// v24.68: the report's JSON dumps
		assert(R("JSON.stringify(items_dump([{ name: 'b', q: 3 }, null, { name: 'a', level: 2 }, { name: 'a', level: 2 }, { name: 'c', l: 'l' }, { name: 'b', q: 2 }]))") === '{"a+2":2,"b":5,"c*":1}', "items_dump: name+level → count, stacks summed, * for locked, sorted");
		delete ctx.G.sets; character.slots = {}; ctx.G.classes.mage = mc; ctx.G.classes.paladin = pc; ctx.G.classes.priest = prc;
		R("my_gear_cache = null");
	}
	// 137) v24.27: travel gear — pieces that slow us come off for long walks and go back on when they end
	{
		const R = (c) => vm.runInContext(c, ctx);
		const mc = ctx.G.classes.mage, eq_s = ctx.equip, uq_s = ctx.unequip, ents = ctx.parent.entities;
		ctx.G.classes.mage = { ...mc, main_stat: "int", mainhand: { staff: { speed: -4 }, wand: {} }, offhand: { source: {}, misc_offhand: { speed: -4 } } };
		ctx.G.items.staff137 = { type: "weapon", wtype: "staff", attack: 30, int: 2 }; ctx.G.items.orb137 = { type: "orb", int: 5 };
		ctx.G.items.misc137 = { type: "misc_offhand", hp: 300 };
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, rip: false, esize: 30, hp: 1000, max_hp: 1000, mp: 1000, max_mp: 1000, c: {} });
		character.items = Array(42).fill(null);
		character.slots = { mainhand: { name: "staff137", level: 0 }, orb: { name: "orb137", level: 0 }, offhand: { name: "misc137", level: 0 } };
		const calls137 = [];
		ctx.unequip = (slot) => { const k = character.items.indexOf(null); character.items[k] = character.slots[slot]; character.slots[slot] = null; calls137.push(["unequip", slot]); return Promise.resolve(); };
		ctx.equip = (k, slot) => { character.slots[slot] = character.items[k]; character.items[k] = null; calls137.push(["equip", slot]); return Promise.resolve(); };
		ctx.parent.entities = {};
		R("state.partners = {}; state.pack = null; state.errand = null; state.recovering = false; state.travel_off = []; state.town_at = 0; state.gear_skip = {}; state.guide = null; my_gear_cache = null; gear_busy = false; travel_busy = false; travel_restored_at = 0");
		// candidates: the staff (-4 speed, mage class rule); not the orb; not the misc offhand (its 300 HP would be clamped away)
		const tc = R("travel_candidates()");
		assert(tc.length === 1 && tc[0].slot === "mainhand" && tc[0].speed === 4 && tc[0].mp_loss === 30, `only the staff comes off (${JSON.stringify(tc.map((c) => [c.slot, c.speed, c.hp_loss, c.mp_loss]))})`);
		const w0 = R("my_gear().w.mainhand");
		// a short walk: nothing comes off; a long one (another map): the staff does
		R("trip.long = false; trip.end = 0; smart_depth = 1");
		await R("travel_gear_tick()");
		assert(calls137.length === 0, "a short walk: everything stays on");
		R("trip.long = true; trip.at = Date.now()");
		await R("travel_gear_tick()");
		assert(JSON.stringify(calls137) === '[["unequip","mainhand"]]' && R("state.travel_off.length === 1 && state.travel_off[0].name === 'staff137'"), `long walk: the staff comes off (${JSON.stringify(calls137)})`);
		assert(R("travel_long()") === true, "on a long walk (the heartbeat's lw: followers take theirs off too)");
		// still ours: scored as worn, kept out of bank/sell/give, not re-equipped by the gear loop
		R("my_gear_cache = null");
		const k137 = character.items.findIndex((i) => i && i.name === "staff137");
		assert(R("my_gear().w.mainhand") === w0 && R(`needed_slots().has(${k137})`) && R(`bag_class(character.items[${k137}])`) === "keep", "the staff off for the walk still counts as worn and is kept");
		calls137.length = 0;
		await R("equip_upgrades()");
		assert(calls137.length === 0, "the gear loop doesn't put it back on mid-walk");
		const tg = R("report_facts()").find((f) => f.key === "tgear");
		assert(tg && /^travel gear: OFF for the walk: staff137\+0 \| 1 off \/ 0 on since load/.test(tg.text), `the report says what's off (${tg && tg.text})`);
		// the town channel: no equip/unequip (it would cancel it)
		character.c = { town: { ms: 3000 } };
		ctx.parent.entities = { m137: { id: "m137", type: "monster", mtype: "goo", visible: true, dead: false, target: "Sanala", x: 0, y: 0 } };
		await R("travel_gear_tick()");
		assert(calls137.length === 0 && R("state.travel_off.length") === 1, "channelling town: nothing changes");
		character.c = {};
		// a monster on us: back on at once
		await R("travel_gear_tick()");
		assert(JSON.stringify(calls137) === '[["equip","mainhand"]]' && character.slots.mainhand?.name === "staff137" && R("state.travel_off.length") === 0, `a monster on us: the staff goes back on (${JSON.stringify(calls137)})`);
		ctx.parent.entities = {}; calls137.length = 0;
		// cooldown, then off again; the walk ends: back on after settle_ms
		await R("travel_gear_tick()");
		assert(calls137.length === 0, "not off again within cooldown_ms");
		R("travel_restored_at = 0"); await R("travel_gear_tick()");
		assert(R("state.travel_off.length") === 1, "off again on the same walk");
		R("smart_depth = 0; trip.end = Date.now() - 2000"); calls137.length = 0;
		await R("travel_gear_tick()");
		assert(calls137.length === 0, "between legs (walk ended 2s ago): stays off");
		R("trip.end = Date.now() - CFG.travel_gear.settle_ms - 1");
		await R("travel_gear_tick()");
		assert(JSON.stringify(calls137) === '[["equip","mainhand"]]' && R("state.travel_off.length") === 0, "walk over: back on");
		// at the spot: back on at once, walking or not
		R("travel_restored_at = 0; smart_depth = 1; trip.long = true; trip.end = 0"); await R("travel_gear_tick()");
		R("state.pack = { mtype: 'goo', map: 'main', boundary: [-100, -100, 100, 100] }"); calls137.length = 0;
		await R("travel_gear_tick()");
		assert(JSON.stringify(calls137) === '[["equip","mainhand"]]', "arrived at the spot: back on");
		R("state.pack = null; travel_restored_at = 0"); await R("travel_gear_tick()");
		// an errand puts it back on before its work
		const saved137 = {}, set_s = ctx.set; ctx.set = (k, v) => ((saved137[k] = JSON.parse(JSON.stringify(v))), true);
		R("save_state()"); ctx.set = set_s;
		assert(R("state.travel_off.length") === 1 && Object.values(saved137)[0]?.travel_off?.[0]?.name === "staff137", "what's off is saved (a reload mid-walk still puts it back on)");
		R("globalThis.__mh137 = 'unset'; errand('t137', async () => { globalThis.__mh137 = character.slots.mainhand ? character.slots.mainhand.name : null; })");
		for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
		assert(R("globalThis.__mh137") === "staff137", `the errand starts with the staff back on (${R("globalThis.__mh137")})`);
		R("state.errand = null; smart_depth = 0; trip.long = false");
		// a follower: its leader's long walk counts, while it walks with it
		R("state.partners = {}");
		hb("Torlis", { ...tor, ctype: "paladin", level: 52, map: "main", x: 300, y: 0, lw: 1 });
		assert(R("is_follower() && travel_long()") === true, "follower: the leader's long walk is ours");
		hb("Torlis", { ...tor, ctype: "paladin", level: 52, map: "main", x: 3000, y: 0, lw: 1 });
		assert(R("travel_long()") === false, "...not when we're nowhere near it");
		hb("Torlis", { ...tor, ctype: "paladin", level: 52, map: "main", x: 300, y: 0, lw: 0 });
		assert(R("travel_long()") === false, "...nor once it has arrived");
		R("state.partners = {}");
		// a .b piece never comes off (the server deletes it on unequip)
		character.slots.mainhand.b = true;
		assert(R("travel_candidates().length") === 0, "a .b piece stays on");
		delete character.slots.mainhand.b;
		ctx.G.classes.mage = mc; ctx.equip = eq_s; ctx.unequip = uq_s; ctx.parent.entities = ents;
		character.slots = {}; character.items = Array(42).fill(null);
		R("state.travel_off = []; my_gear_cache = null; travel_restored_at = 0");
	}
	// 138) v24.28: party town trips — the others go too when they'd only stand around; all wait, then walk back together
	{
		const R = (c) => vm.runInContext(c, ctx);
		const scm = ctx.send_cm, ents = ctx.parent.entities, cms = [];
		ctx.send_cm = (to, m) => (cms.push([to.join(), m.k, m.id, m.by]), Promise.resolve());
		ctx.parent.entities = {};
		R("CFG.party.town_together = true; state.partners = {}; state.ptown = null; state.ptown_last = null; state.errand = null; state.recovering = false");
		R("globalThis.__td = town_due; town_due = () => ({ plan: { free: 30 }, min_free: 10, pot_min: 100, relaxed: true }); globalThis.__trun = town_run; globalThis.__runs = []; town_run = (due) => (__runs.push(due), true)");
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, rip: false, hp: 4000, max_hp: 4000, attack: 300, frequency: 1, armor: 50, resistance: 50, speed: 55 });
		hb("Torlis", { ...tor, ctype: "paladin", level: 52, map: "main", x: 30, y: 0, hp: 6000, max_hp: 6000, armor: 600, resistance: 300, attack: 300, frequency: 1 });
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: -30, y: 0, hp: 5000, max_hp: 5000, armor: 100, resistance: 100, attack: 200, frequency: 1 });
		ctx.G.monsters.hard138 = { hp: 30000, attack: 900, frequency: 1, aggro: 0, damage_type: "physical", xp: 5000, speed: 20, range: 50 };
		ctx.G.monsters.easy138 = { hp: 300, attack: 10, frequency: 1, aggro: 0, damage_type: "physical", xp: 50, speed: 20, range: 50 };
		R("state.pack = { mtype: 'hard138', map: 'main', boundary: [-100, -100, 100, 100] }");
		assert(R("is_follower() && leader_name() === 'Torlis'"), "setup: Torlis (the tank) leads, Sanala follows");
		const f_all = R("fight_math(G.monsters.hard138, true, false)"), f_wo = { mates: 1, tank: null };
		assert(f_all.mates === 2 && f_wo.mates === 1 && f_all.tank === "Torlis" && f_wo.tank === null && f_all.priest === true, `fight_math without Torlis: no tank, one mate (${f_all.mates}/${f_wo.mates}, ${f_all.tank}/${f_wo.tank})`);
		// v24.46: one rule — a member goes to town, we all go
		cms.length = 0;
		R("ptown_recv({ k: 'ptown', id: 'Torlis:1', by: 'Torlis' }, 'Torlis')");
		assert(R("state.ptown.pending === true && /together/.test(state.ptown.why)"), `the leader goes: we go (${R("state.ptown.why")})`);
		// pending: not while something is on us; then the run starts, and we tell the others (with the same trip id)
		ctx.parent.entities = { m138: { id: "m138", type: "monster", mtype: "easy138", visible: true, dead: false, target: "Sanala", x: 0, y: 0 } };
		assert(R("ptown_join_tick()") === true && R("__runs.length") === 0, "a monster on us: finish it first");
		ctx.parent.entities = {};
		assert(R("ptown_join_tick()") === true && R("__runs.length") === 1 && R("state.ptown.joined === true && !state.ptown.pending"), "then we go");
		assert(cms.some(([to, k, id, by]) => k === "ptown" && id === "Torlis:1" && by === "Torlis" && to.includes("Aspernari")), `we tell the others we're going (${JSON.stringify(cms)})`);
		const hb_s = R("heartbeat__fighter.toString()");
		assert(/pt: state\.ptown\?\.joined \? \{ id: state\.ptown\.id, done: !!state\.ptown\.done \}/.test(hb_s), "our heartbeat carries the trip (pt)");
		// an easy spot we could farm without them, nothing of our own due: we go all the same
		R("state.ptown = null; state.pack = { mtype: 'easy138', map: 'main', boundary: [-100, -100, 100, 100] }");
		R("ptown_recv({ k: 'ptown', id: 'Aspernari:2', by: 'Aspernari' }, 'Aspernari')");
		assert(R("state.ptown.pending === true"), `an easy spot, a follower leaving: we go too (${R("state.ptown.why")})`);
		// off: nobody joins
		R("state.ptown = null; CFG.party.town_together = false"); R("ptown_recv({ k: 'ptown', id: 'Aspernari:4', by: 'Aspernari' }, 'Aspernari')");
		assert(R("!state.ptown.pending"), "town_together off: each goes alone");
		R("CFG.party.town_together = true");
		// too late: we couldn't get away within town_join_s
		R("state.ptown = { id: 'x', by: 'Torlis', at: Date.now() - CFG.party.town_join_s * 1000 - 1, leavers: ['Torlis'], pending: true, why: 'w' }");
		assert(R("ptown_join_tick()") === true && R("state.ptown.joined === true"), "v24.60: no join window — a member that couldn't get away earlier still goes");
		// done in town: wait while a member on the trip isn't done, then go back together
		R("globalThis.__hbf = heartbeat; heartbeat = () => {}; state.ptown = { id: 'Torlis:1', by: 'Torlis', at: Date.now(), leavers: ['Torlis'], joined: true, why: 'w' }");
		hb("Torlis", { ...tor, ctype: "paladin", level: 52, map: "main", x: 30, y: 0, pt: { id: "Torlis:1", done: false } });
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: -30, y: 0, pt: null });
		let fin = false;
		const mark = timers.length; // only ptown_wait's own 1s sleeps are run below (older timers belong to other tests)
		const pw = R("ptown_wait()").then(() => { fin = true; });
		await new Promise((r) => setImmediate(r));
		assert(!fin && R("state.ptown.done === true"), "Torlis is still busy in town: we wait (and say we're done)");
		hb("Torlis", { ...tor, ctype: "paladin", level: 52, map: "main", x: 30, y: 0, pt: { id: "Torlis:1", done: true } });
		for (let i = 0; i < 5 && !fin; i++) { timers.splice(mark).filter((t) => t.ms === 1000).forEach((t) => t.fn()); await new Promise((r) => setImmediate(r)); }
		await pw;
		assert(fin && R("state.ptown === null && state.ptown_last.left_without.length === 0"), "everyone's done: back together");
		const pf = R("report_facts()").find((f) => f.key === "ptown");
		assert(pf && /last party trip .*all back together/.test(pf.text), `the report shows the trip (${pf && pf.text})`);
		// the initiator: starting a run tells the others
		cms.length = 0; R("state.ptown = null; ptown_start(['bank'])");
		assert(R("state.ptown.joined && state.ptown.by === 'Sanala'") && cms.some(([, k, , by]) => k === "ptown" && by === "Sanala"), "a trip we start is announced");
		// the teleport: only when this map's spawn is much nearer town
		const us = ctx.use_skill; const sk = []; ctx.use_skill = (s) => (sk.push(s), Promise.resolve());
		ctx.G.maps.main.spawns = ctx.G.maps.main.spawns || [[0, 0]];
		Object.assign(character, { map: "main", x: 100, y: 100 });
		assert(await R("town_hop()") === 0 && sk.length === 0, "near town: no teleport");
		Object.assign(character, { map: "main", x: 1450, y: 1450, c: {} });
		const mk = timers.length; let hopped = null;
		const hp_ = R("town_hop()").then((v) => { hopped = v; });
		for (let i = 0; i < 10 && hopped === null; i++) {
			await new Promise((r) => setImmediate(r));
			if (sk.length) Object.assign(character, { x: 0, y: 0 }); // the server moved us to the spawn
			R("state.town_at = Date.now() - 2000");
			timers.splice(mk).filter((t) => t.ms === 200).forEach((t) => t.fn());
		}
		await hp_;
		assert(hopped === 1 && sk.join() === "use_town", `1450px out on main: teleport to the spawn (${hopped}, ${sk.join()})`);
		ctx.use_skill = us;
		R("town_due = __td; town_run = __trun; heartbeat = __hbf; state.ptown = null; state.ptown_last = null; state.partners = {}; state.pack = null");
		ctx.send_cm = scm; ctx.parent.entities = ents;
		delete ctx.G.monsters.hard138; delete ctx.G.monsters.easy138;
	}
	// 139) v24.31: a gear swap mid-step stops the step (resync); the heartbeat keeps full-gear stats; the leader's hold is the same trip
	{
		const R = (c) => vm.runInContext(c, ctx);
		const mc = ctx.G.classes.mage, eq_s = ctx.equip, uq_s = ctx.unequip, scm = ctx.send_cm, ents = ctx.parent.entities;
		ctx.G.classes.mage = { ...mc, main_stat: "int", mainhand: { staff: { speed: -4 } } };
		ctx.G.items.staff139 = { type: "weapon", wtype: "staff", attack: 30 };
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, rip: false, esize: 30, hp: 1000, max_hp: 1000, mp: 1000, max_mp: 1000, c: {}, attack: 400, moving: true });
		character.items = Array(42).fill(null); character.slots = { mainhand: { name: "staff139", level: 0 } };
		ctx.unequip = (slot) => { character.items[0] = character.slots[slot]; character.slots[slot] = null; character.attack = 50; return Promise.resolve(); };
		ctx.equip = (k, slot) => { character.slots[slot] = character.items[k]; character.items[k] = null; character.attack = 400; return Promise.resolve(); };
		const hbs = []; ctx.send_cm = (to, m) => (hbs.push(m), Promise.resolve());
		ctx.parent.entities = {};
		R("state.partners = {}; state.pack = null; state.errand = null; state.recovering = false; state.travel_off = []; state.group_wait = null; my_gear_cache = null; gear_busy = false; travel_busy = false; travel_restored_at = 0; trip.long = true; trip.end = 0; smart_depth = 1");
		calls.length = 0;
		await R("travel_gear_tick()");
		assert(R("state.travel_off.length") === 1 && calls.includes("stop:move"), `the staff came off mid-step: the step is stopped so the walk re-plans from our real position (${calls.join()})`);
		hbs.length = 0; R("heartbeat()");
		const h139 = hbs.find((m) => m.k === "hb");
		assert(character.attack === 50 && (!h139 || h139.attack === 400), `the heartbeat still says attack 400 while the staff is off (${h139 && h139.attack})`);
		// the leader holding for stragglers after its walk stopped: still the long walk (followers keep theirs off)
		R("smart_depth = 0; trip.end = Date.now() - CFG.travel_gear.settle_ms - 1");
		assert(R("travel_long()") === false, "walk over, no hold: not travelling");
		R("state.group_wait = { since: Date.now(), who: 'Aspernari' }");
		assert(R("travel_long()") === true, "holding for a straggler on the way: still travelling");
		R("state.group_wait = null");
		calls.length = 0; character.moving = true;
		await R("travel_gear_tick()");
		assert(R("state.travel_off.length") === 0 && calls.includes("stop:move") && character.attack === 400, "back on: resynced again");
		character.moving = false; ctx.G.classes.mage = mc; ctx.equip = eq_s; ctx.unequip = uq_s; ctx.send_cm = scm; ctx.parent.entities = ents;
		character.slots = {}; character.items = Array(42).fill(null);
		R("state.travel_off = []; my_gear_cache = null; travel_restored_at = 0; trip.long = false");
	}
	// 140) v24.32: a target behind a wall is path-found to, not walked straight at (into the corner)
	{
		const R = (c) => vm.runInContext(c, ctx);
		const cm = ctx.can_move_to, ds = ctx.distance, mv = ctx.move, steps = [];
		ctx.move = (x, y) => steps.push([x, y]);
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", map: "main", x: 0, y: 0, rip: false, range: 100 });
		R("state.errand = null; state.recovering = false; state.travel_block_until = 0; smart_depth = 0; approach_path = null; globalThis.__tv = travel; travel = (d) => { globalThis.__tvd = d; }");
		ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
		const t = { id: "g140", type: "monster", mtype: "goo", x: 0, y: 400, visible: true, dead: false };
		ctx.parent.entities.g140 = t;
		ctx.can_move_to = () => false;
		R("last_move = 0; approach(parent.entities.g140)");
		assert(steps.length === 0 && R("__tvd && __tvd.y === 400 && approach_path === 'g140'"), "wall in the way: path-find to the target, no straight step");
		R("smart_depth = 1"); t.y = 250;
		assert(R("break_walk_for(parent.entities.g140)") === false, "that walk isn't stopped while the wall is still between us");
		ctx.can_move_to = () => true;
		assert(R("break_walk_for(parent.entities.g140)") === true, "a clear line: stop the walk and fight");
		t.y = 400; character.moving = false;
		R("smart_depth = 0; last_move = 0; approach(parent.entities.g140)");
		assert(steps.length === 1 && R("approach_path === null"), `clear line: a straight step, as before (${JSON.stringify(steps)})`);
		R("travel = __tv; approach_path = null"); delete ctx.parent.entities.g140; ctx.can_move_to = cm; ctx.distance = ds; ctx.move = mv;
	}
	// 141) v24.35: a monster type is judged for the party wherever its members are (the leader through a door first)
	{
		const R = (c) => vm.runInContext(c, ctx);
		R("state.partners = {}; state.errand = null; state.recovering = false");
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 52, map: "level2", x: 0, y: 0, rip: false, hp: 6000, max_hp: 6000, attack: 300, frequency: 1, armor: 400, resistance: 200 });
		ctx.G.monsters.hard141 = { hp: 60000, attack: 500, frequency: 1, aggro: 0, damage_type: "physical", xp: 5000, speed: 20, range: 50, respawn: 10 };
		const none = R("fight_math(G.monsters.hard141)"), none_safe = R("!!fight_profile('hard141')"); // nobody online yet
		hb("Sanala", { ...san, ctype: "mage", level: 51, map: "level2s", x: 0, y: 0, hp: 4000, max_hp: 4000, attack: 900, frequency: 1.5, damage_type: "magical" });
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "level2s", x: 0, y: 0, hp: 5000, max_hp: 5000, attack: 500, frequency: 1, damage_type: "magical" });
		const party = R("fight_math(G.monsters.hard141)");
		assert(R("partners_near().length") === 0 && none.mates === 0 && party.mates === 2 && party.priest === true && party.ttk < none.ttk / 3, `the others are a map away: nobody near, but the party is still three (${none.mates}/${party.mates})`);
		assert(R("!!fight_profile('hard141')") && !none_safe, "the spot stays safe for the party while the leader is through the door first");
		hb("Sanala", { ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, hp: 4000, max_hp: 4000, attack: 900, frequency: 1.5, damage_type: "magical", errand: "town" });
		assert(R("fight_math(G.monsters.hard141).mates") === 1, "a member on an errand isn't counted");
		R("state.partners = {}"); delete ctx.G.monsters.hard141;
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0 });
	}
	// 142) v24.41: the transporter leg tries points around the NPC until the pathfinder finds a way; in reach: no walk
	{
		const R = (c) => vm.runInContext(c, ctx);
		const sm = ctx.smart_move, tried = [];
		Object.assign(character, { map: "desertland", x: 600, y: -2365, rip: false });
		R("state.recovering = false; for (const k in tp_spot) delete tp_spot[k]");
		ctx.smart_move = (d) => { tried.push([d.x, d.y]); return d.x === 51 ? Promise.resolve() : Promise.reject({ reason: "failed" }); }; // only the point to the right is reachable
		await R("go_transporter({ map: 'desertland', x: -14, y: -477 }, 5000)");
		assert(JSON.stringify(tried) === "[[-14,-412],[51,-477]]" && R("tp_spot.desertland") === 1, `below fails, right works, and is remembered (${JSON.stringify(tried)})`);
		tried.length = 0; await R("go_transporter({ map: 'desertland', x: -14, y: -477 }, 5000)");
		assert(JSON.stringify(tried) === "[[51,-477]]", "next time the point that worked goes first");
		tried.length = 0; Object.assign(character, { x: 40, y: -470 });
		await R("go_transporter({ map: 'desertland', x: -14, y: -477 }, 5000)");
		assert(tried.length === 0, "already within reach of it: no walk");
		ctx.smart_move = sm; Object.assign(character, { map: "main", x: 0, y: 0 });
	}
	// 143) v24.44: a monster the party can't kill (an ent) is never attacked or targeted — on us, on a partner, by any skill
	{
		const R = (c) => vm.runInContext(c, ctx);
		const atk = ctx.attack, ents = ctx.parent.entities, hits = [];
		ctx.attack = (e) => (hits.push(e.id), Promise.resolve());
		ctx.G.monsters.ent143 = { hp: 8_000_000, attack: 3600, frequency: 1.2, aggro: 0.2, damage_type: "physical", xp: 1, speed: 12, charge: 48, range: 64, respawn: 10, abilities: { mtangle: {} } };
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 0, y: 0, rip: false, hp: 3650, max_hp: 3650, attack: 900, frequency: 1.5, range: 150, speed: 52 });
		R("state.partners = {}; state.pack = { mtype: 'goo', map: 'main', boundary: [-200, -200, 200, 200] }; state.bad_ids = {}; inflight.attack = false; for (const k in hopeless_c) delete hopeless_c[k]; boss_type = null");
		const e = { id: "t143", type: "monster", mtype: "ent143", visible: true, dead: false, hp: 8_000_000, max_hp: 8_000_000, x: 30, y: 0, target: "Sanala" };
		ctx.parent.entities = { t143: e };
		assert(R("hopeless(parent.entities.t143)") === true && R("chase_speed('ent143')") === Infinity, "an ent: hopeless, and (it tangles) not to be outrun");
		assert(R("fire('attack', parent.entities.t143)") === false && hits.length === 0, "no attack on it, even with it on us");
		assert(R("choose_target(true)") === null, "nor is it a target (it would only hold us there)");
		e.target = "Torlis";
		assert(R("choose_target(true)") === null, "nor when it's on a partner");
		R("state.pack = null; for (const k in hopeless_c) delete hopeless_c[k]");
		ctx.attack = atk; ctx.parent.entities = ents; delete ctx.G.monsters.ent143;
	}
	// 144) v24.50: the tank decides — only it starts a fight, only with the party gathered; a death regroups in town;
	//      everything learned is cleared once
	{
		const R = (c) => vm.runInContext(c, ctx);
		const ents = ctx.parent.entities, atk = ctx.attack, hits = [];
		ctx.attack = (e) => (hits.push(e.id), Promise.resolve());
		ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
		R("CFG.party.tank_first = true; state.partners = {}; state.errand = null; state.recovering = false; inflight.attack = false; for (const k in hopeless_c) delete hopeless_c[k]; state.pack = { mtype: 'goo', map: 'main', boundary: [-300, -300, 300, 300] }");
		const goo = { id: "g144", type: "monster", mtype: "goo", visible: true, dead: false, hp: 100, max_hp: 100, x: 50, y: 0, target: null };
		ctx.parent.entities = { g144: goo };
		// the tank, party not gathered: no first hit
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 52, map: "main", x: 0, y: 0, rip: false, hp: 6000, max_hp: 6000, range: 30 });
		hb("Sanala", { ...san, ctype: "mage", level: 51, map: "main", x: 30, y: 0 });
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: 900, y: 0 });
		assert(R("party_missing().join()") === "Aspernari" && R("fire('attack', parent.entities.g144)") === false && hits.length === 0, "the tank doesn't start a fight while Aspernari is 900px away");
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: -30, y: 0, errand: "town" });
		assert(R("fire('attack', parent.entities.g144)") === false, "...nor while a member is in town");
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: -30, y: 0 });
		assert(R("party_missing().length") === 0 && R("fire('attack', parent.entities.g144)") === true && hits.join() === "g144", "everyone within engage_px: the tank starts the fight");
		// a monster already on one of us: the tank fights it whoever is missing
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: 900, y: 0 });
		goo.target = "Sanala"; hits.length = 0; R("inflight.attack = false");
		assert(R("fire('attack', parent.entities.g144)") === true, "a monster already on a member is fought at once");
		// not the tank: never the first hit, however far the tank is
		goo.target = null; hits.length = 0;
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "main", x: 30, y: 0, rip: false, range: 150 });
		R("state.partners = {}; inflight.attack = false");
		hb("Torlis", { ...tor, ctype: "paladin", level: 52, map: "desertland", x: 5000, y: 0 });
		assert(R("party_tank().name") === "Torlis" && R("fire('attack', parent.entities.g144)") === false && hits.length === 0, "a follower never starts a fight, even with the tank on another map");
		goo.target = "Torlis"; ctx.get_party = () => ({ Torlis: {}, Sanala: {}, Aspernari: {} });
		assert(R("fire('attack', parent.entities.g144)") === true, "once the monster targets the tank, the follower attacks");
		ctx.get_party = () => ({});
		// v24.51: one party or nothing — a member dead or offline, or us about to die: suicide in the field, wait in town
		const emits = [], em = ctx.parent.socket.emit; ctx.parent.socket.emit = (ev) => { emits.push(ev); };
		const scm = ctx.send_cm; ctx.send_cm = () => Promise.resolve();
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "desertland", x: 400, y: -1400, rip: false, hp: 3000, max_hp: 3650 });
		R("seen.since = Date.now() - 60_000; suicide_at = 0; state.partners = {}; state.errand = null; smart_depth = 0; hist.ev = []");
		hb("Torlis", { ...tor, ctype: "paladin", level: 52, map: "desertland", x: 420, y: -1400 });
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "desertland", x: 380, y: -1400 });
		assert(R("party_break()") === null && R("party_break_tick()") === false && emits.length === 0, "all three online and alive: nothing to do");
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "desertland", x: 380, y: -1400, rip: true });
		assert(R("party_break_tick()") === true && emits.join() === "harakiri" && R("hist.ev.some((e) => e.type === 'suicide' && /Aspernari dead/.test(e.why))"), `a member died in the field: we use the suicide command to join it (${emits.join()})`);
		assert(R("party_break_tick()") === true && emits.length === 1, "...once (not again within 15s)");
		// our own suicide blames nobody: no incident, no camp rest
		character.rip = true;
		R("state.dead_handled = false; state.danger = {}; state.cooldown = {}; state.pack = { mtype: 'gscorpion', map: 'desertland', boundary: [220, -1569, 561, -1275] }; pmring.hits = [{ t: Date.now(), mtype: 'gscorpion', dmg: 900 }]; on_death()");
		assert(R("!state.danger.gscorpion && !Object.keys(state.cooldown).length && !hist.ev.some((e) => e.type === 'death')"), "our suicide isn't booked as a death by the camp: no penalty, no rest");
		// respawned in town with the others still dead: wait there, no second suicide
		Object.assign(character, { rip: false, map: "main", x: 0, y: 0, hp: 3650 }); emits.length = 0;
		R("state.dead_handled = false; suicide_at = 0");
		assert(R("party_break_tick()") === true && emits.length === 0, "in town with a member still dead: wait, don't suicide again");
		// everyone back: carry on
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: 10, y: 0 }); hb("Torlis", { ...tor, ctype: "paladin", level: 52, map: "main", x: -10, y: 0 });
		assert(R("party_break_tick()") === false, "all three alive again: the party carries on");
		// a member offline: all three or nothing
		Object.assign(character, { map: "desertland", x: 400, y: -1400 });
		R("state.partners.Aspernari.t = Date.now() - 60_000");
		{ const tv = []; R("globalThis.__tv144 = travel; travel = (d) => { globalThis.__tvd144 = d; }; globalThis.__tvd144 = null");
			assert(R("/Aspernari offline/.test(party_break())") && R("party_break_tick()") === false && emits.length === 0 && R("__tvd144") === null, "v24.60: a member offline: no suicide, and a follower keeps following the tank (which leads the walk to town)");
			// v24.62: the tank's walk to town with a member offline — it waits for a member behind, then leads
			Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 52, map: "desertland", x: 400, y: -1400 });
			const ents144 = ctx.parent.entities; ctx.parent.entities = {};
			R("state.partners = {}; __tvd144 = null");
			hb("Sanala", { ...san, ctype: "mage", level: 51, map: "desertland", x: 2000, y: -1400 });
			assert(R("party_break_tick()") === true && R("__tvd144") === null, "a member offline, another far behind: the tank doesn't set off for town without it");
			hb("Sanala", { ...san, ctype: "mage", level: 51, map: "desertland", x: 430, y: -1400 });
			assert(R("party_break_tick()") === true && R("__tvd144 && __tvd144.map") === "main", "...and leads the walk to town once it's beside it");
			// no tank online: the follower first by name leads, the other goes to it
			Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "desertland", x: 400, y: -1400 });
			R("state.partners = {}; __tvd144 = null");
			hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "desertland", x: 2000, y: -1400 });
			assert(R("party_break_tick()") === true && R("__tvd144 && __tvd144.map === 'desertland' && __tvd144.x === 2000"), `the tank offline: the second follower goes to the first, not to town alone (${JSON.stringify(R("__tvd144"))})`);
			// the tank's walk to town on a party trip (ptown_lead): stops while a member is behind, walks when they're with it
			Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 52, map: "desertland", x: 400, y: -1400 });
			R("state.partners = {}; globalThis.__go144 = go; globalThis.__gn144 = 0; go = () => { __gn144++; return Promise.resolve(); }; state.errand = 'town'; state.errand_at = Date.now()");
			hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "desertland", x: 380, y: -1400 });
			hb("Sanala", { ...san, ctype: "mage", level: 51, map: "desertland", x: 2000, y: -1400 });
			const step144 = async () => { const m = timers.length; await new Promise((r) => setImmediate(r)); for (const t of timers.splice(m)) t.fn(); await new Promise((r) => setImmediate(r)); };
			const mark144 = timers.length;
			R("globalThis.__pl144 = 'walking'; ptown_lead().then(() => { __pl144 = 'arrived'; }, () => { __pl144 = 'failed'; })");
			await new Promise((r) => setImmediate(r));
			assert(R("__gn144") === 0 && R("state.lead_walk") === true, "party trip: the tank doesn't walk toward town while a member is behind");
			hb("Sanala", { ...san, ctype: "mage", level: 51, map: "desertland", x: 430, y: -1400 });
			for (const t of timers.splice(mark144)) t.fn();
			await new Promise((r) => setImmediate(r));
			assert(R("__gn144") === 1, `...and walks once everyone is with it (${R("__gn144")})`);
			Object.assign(character, { map: "main", x: 0, y: 0 });
			for (let i = 0; i < 3 && R("__pl144") === "walking"; i++) { for (const t of timers.splice(mark144)) t.fn(); await new Promise((r) => setImmediate(r)); }
			assert(R("__pl144") === "arrived" && R("state.lead_walk") === false, `...until it's in town (${R("__pl144")})`);
			R("go = __go144; state.errand = null; state.partners = {}");
			ctx.parent.entities = ents144;
			Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 51, map: "desertland", x: 400, y: -1400 });
			R("travel = __tv144"); }
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "desertland", x: 380, y: -1400 }); hb("Torlis", { ...tor, ctype: "paladin", level: 52, map: "desertland", x: 420, y: -1400 });
		// about to die: suicide is free, dying to the monster isn't
		emits.length = 0; R("suicide_at = 0"); character.hp = 500;
		ctx.parent.entities = { m144: { id: "m144", type: "monster", mtype: "goo", visible: true, dead: false, target: "Sanala", x: 400, y: -1400 } };
		assert(R("party_break_tick()") === false && emits.length === 0, "v24.52: low HP with a monster on us is no reason to suicide — only a member's death is");
		ctx.parent.entities = {}; character.hp = 3650; emits.length = 0; R("suicide_at = 0; seen.since = Date.now()");
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "desertland", x: 380, y: -1400, rip: true });
		assert(R("party_break_tick()") === false && emits.length === 0, "the first 30s after loading: no suicide (heartbeats still arriving)");
		// without a live tank nobody starts a fight
		R("seen.since = Date.now() - 60_000; state.partners = {}");
		hb("Torlis", { ...tor, ctype: "paladin", level: 52, map: "desertland", x: 420, y: -1400, rip: true });
		ctx.parent.entities = { g144: { id: "g144", type: "monster", mtype: "goo", visible: true, dead: false, hp: 100, max_hp: 100, x: 410, y: -1400, target: null } };
		assert(R("tank_first(parent.entities.g144)") === true, "tank dead: still nobody else starts a fight");
		ctx.parent.socket.emit = em; ctx.send_cm = scm; ctx.parent.entities = {};
		R("state.partners = {}; state.pack = null; state.dead_handled = false; suicide_at = 0; hist.ev = []");
		Object.assign(character, { map: "main", x: 0, y: 0, rip: false });
		// one-time clear-out: an old save loses what was learned, keeps the rest; the next save is marked
		const gs = ctx.get, ss = ctx.set; let saved = null;
		ctx.get = () => ({ v: 1, meas_v: 3, at: Date.now(), measured: { "main:1,2,3,4": 999 }, calib: { goo: { ratio: 3, n: 50 } }, danger: { goo: 0.5 }, cooldown: { k: Date.now() + 1e6 }, safety_mult: 0.5, probe_ok: { goo: { mult: 2, at: Date.now() } }, last_town: 12345 });
		ctx.set = (k, v) => ((saved = JSON.parse(JSON.stringify(v))), true);
		R("state.measured = {}; state.calib = {}; state.danger = {}; state.cooldown = {}; state.safety_mult = 1; state.probe_ok = {}; load_state()");
		assert(R("Object.keys(state.measured).length === 0 && !state.calib.goo && !state.danger.goo && !Object.keys(state.cooldown).length && state.safety_mult === 1 && !state.probe_ok.goo") && R("state.last_town") === 12345, "an old save: spot rates, calibration, penalties, rests, probe verdicts and safety tuning are dropped; the rest loads");
		R("save_state()");
		assert(saved && saved.data_v === R("DATA_V"), "the next save carries the marker, so it happens once");
		assert(saved.rates_v === R("RATES_V"), "...and the rates marker (v25.16)");
		ctx.get = () => ({ v: 1, meas_v: 3, data_v: R("DATA_V"), rates_v: R("RATES_V"), at: Date.now(), measured: { "main:1,2,3,4": 999 }, realism: 0.4 });
		R("state.measured = {}; state.realism = 1; load_state()");
		assert(R("state.measured['main:1,2,3,4']") === 999 && R("state.realism") === 0.4, "a save with the markers loads in full");
		// v25.16: a save from before the rates marker loses its spot rates and realism only
		ctx.get = () => ({ v: 1, meas_v: 3, data_v: R("DATA_V"), at: Date.now(), measured: { "main:1,2,3,4": 999 }, realism: 0.4, calib: { goo: { ratio: 3, n: 50 } } });
		R("state.measured = {}; state.realism = 1; state.calib = {}; load_state()");
		assert(R("!state.measured['main:1,2,3,4'] && state.realism === 1 && state.calib.goo && state.calib.goo.n === 50"), "a save without the rates marker drops spot rates and realism, keeps calibration");
		ctx.get = gs; ctx.set = ss; ctx.send_cm = scm; ctx.attack = atk; ctx.parent.entities = ents; ctx.distance = () => 0;
		R("state.measured = {}; state.partners = {}; state.pack = null");
	}
	// 145) refactor stage 2: nobody fights solo — a fighter never flees (only the merchant does, through tick());
	// calibration saved under the "@p" keys still applies
	{
		const R = (c) => vm.runInContext(c, ctx);
		const sk145 = []; const us145 = ctx.use_skill, st145 = ctx.setTimeout, gnm145 = ctx.get_nearest_monster;
		ctx.use_skill = (s) => (sk145.push(s), Promise.resolve()); ctx.setTimeout = () => 0; ctx.get_nearest_monster = () => null;
		R("state.partners = {}; state.merchant = null; state.pack = null; state.errand = 'x145'; state.errand_at = Date.now(); smart_depth = 0; state.recovering = false; state.parked = false; state.town_at = 0; state.fled_home = false; pmring.hits.length = 0; for (const k in inflight) inflight[k] = false");
		Object.assign(character, { name: "me", ctype: "ranger", level: 10, map: "main", x: 0, y: 0, rip: false, hp: 100, max_hp: 1000, mp: 500, max_mp: 500, c: {} });
		R("tick()");
		assert(!st().recovering && !sk145.includes("use_town"), `a fighter at 10% HP doesn't flee (${sk145})`);
		Object.assign(character, { name: "DoWhatNow", ctype: "merchant", x: 2000, y: 0 }); // away from the town spot
		R("for (const k in inflight) inflight[k] = false; tick()");
		assert(st().recovering && sk145.includes("use_town"), `the merchant at 10% HP flees to town (${sk145})`);
		character.hp = 1000; R("tick()");
		assert(!st().recovering, "...and carries on once recovered");
		R("state.errand = null; state.pack = null");
		ctx.use_skill = us145; ctx.setTimeout = st145; ctx.get_nearest_monster = gnm145; character.x = 0;
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 52, hp: 3650, max_hp: 3650 });
		const gs = ctx.get;
		ctx.get = () => ({ v: 1, meas_v: 3, data_v: R("DATA_V"), at: Date.now(), calib: { "goo@p": { ratio: 2, n: 5, act: 20, pred: 10 }, goo: { ratio: 0.2, n: 50, act: 2, pred: 10 } } });
		R("state.calib = {}; load_state()");
		assert(Math.abs(R("calib_factor('goo')") - 0.5) < 1e-9 && R("calib_key('goo')") === "goo@p", `saved party calibration ("goo@p") still applies; the old solo entry isn't read (${R("calib_factor('goo')")})`);
		ctx.get = gs; R("state.calib = {}; state.partners = {}");
	}
	// 146) v24.56: a follower never goes for an untouched monster; the tank clears levelled-up monsters of its camp
	{
		const R = (c) => vm.runInContext(c, ctx);
		const ents = ctx.parent.entities, atk = ctx.attack, gp = ctx.get_party, mv0 = ctx.move, hits = [], steps = [];
		ctx.attack = (e) => (hits.push(e.id), Promise.resolve()); ctx.move = (x, y) => steps.push([x, y]);
		ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y); ctx.get_party = () => ({ Torlis: {}, Sanala: {}, Aspernari: {} });
		ctx.G.monsters.poi146 = { xp: 100, hp: 500, attack: 20, frequency: 1, range: 20, speed: 10, respawn: 10, armor: 0, resistance: 0, aggro: 0, damage_type: "physical" };
		const mk = (id, x, lv, tg) => ({ id, type: "monster", mtype: "poi146", visible: true, dead: false, hp: 500 * lv, max_hp: 500 * lv, attack: 20 * lv * lv * lv, level: lv, x, y: 0, target: tg || null, xp: 100 });
		R("CFG.party.tank_first = true; state.partners = {}; state.errand = null; smart_depth = 0; last_move = 0; inflight.attack = false; live_cache.clear(); state.fsafe_at = 0; state.bad_ids = {}; for (const k in hopeless_c) delete hopeless_c[k]");
		// Sanala (follower): five untouched monsters around, the tank has no target → she stays put and attacks nothing
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 53, map: "main", x: 0, y: 0, rip: false, hp: 3650, max_hp: 3650, range: 150, attack: 600, frequency: 1.2, moving: false });
		const pk = { mtype: "poi146", map: "main", boundary: [-300, -300, 300, 300] };
		hb("Torlis", { ...tor, ctype: "paladin", level: 53, map: "main", x: 40, y: 0, hp: 6500, max_hp: 6500, armor: 500, resistance: 250, attack: 380, frequency: 0.9, target: null, pack: pk });
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: 20, y: 30, hp: 5270, max_hp: 5270, attack: 300, frequency: 0.8 });
		ctx.parent.entities = { a: mk("a", 250, 1), b: mk("b", 260, 1) };
		R("follower_tick()");
		assert(hits.length === 0 && steps.length === 0 && R("approach_path === null"), `follower with only untouched monsters about: no approach, no attack (${JSON.stringify([hits, steps])})`);
		ctx.parent.entities.a.target = "Torlis"; R("inflight.attack = false; last_move = 0");
		R("follower_tick()");
		assert(hits.join() === "a" || steps.length > 0, `once a monster is on the tank, the follower goes for it (${JSON.stringify([hits, steps])})`);
		// Torlis (tank) at a camp where everything has levelled up: lowest level first, as a last resort
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 53, map: "main", x: 0, y: 0, rip: false, hp: 6500, max_hp: 6500, range: 30, attack: 380, frequency: 0.9, armor: 500, resistance: 250 });
		R("state.partners = {}; live_cache.clear(); state.pack = { mtype: 'poi146', map: 'main', boundary: [-300, -300, 300, 300] }; pick_pack_safe146 = (state.safe.poi146 = { ttk: 3, xp: 100 })");
		hb("Sanala", { ...san, ctype: "mage", level: 53, map: "main", x: 10, y: 0, hp: 3650, max_hp: 3650, attack: 600, frequency: 1.2, damage_type: "magical" });
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: -10, y: 0, hp: 5270, max_hp: 5270, attack: 300, frequency: 0.8, damage_type: "magical" });
		// (the per-monster check is stubbed: only "ok1" passes it; n4/n5 are mildly levelled, n10 is far beyond the party)
		R("globalThis.__lo146 = live_ok; live_ok = (e) => (e.id === 'ok1' ? { ttk: 1, xp: 1 } : null)");
		const mild = (id, x, lv) => ({ ...mk(id, x, lv), attack: 30, hp: 800, max_hp: 800 });
		ctx.parent.entities = { n5: mild("n5", 60, 5), n4: mild("n4", 200, 4), n10: mk("n10", 40, 10), o9: { ...mk("o9", 30, 9), mtype: "goo" } };
		assert(R("grown_ok(parent.entities.n4) && grown_ok(parent.entities.n5) && !grown_ok(parent.entities.n10)"), "setup: two mildly levelled monsters are within grown_over, the level-10 one is far beyond it");
		assert(R("choose_target(true).id") === "n4", `nothing passes: the tank takes the lowest-level one of its camp's type (${R("choose_target(true)?.id")})`);
		ctx.parent.entities.ok1 = mk("ok1", 250, 1);
		R("live_cache.clear()");
		assert(R("choose_target(true).id") === "ok1", "a monster that passes is there: that one first");
		ctx.parent.entities.ok1.mtype = "goo"; R("live_cache.clear()");
		assert(R("choose_target(true).id") !== "ok1", "v24.64: a monster of another type is never started on, even one that passes the check");
		delete ctx.parent.entities.ok1; delete ctx.parent.entities.n5; delete ctx.parent.entities.n4; R("live_cache.clear()");
		assert(R("choose_target(true)") === null, "v24.59: one far beyond the party (level 10), or of another type, is never taken this way");
		// v24.65: where the camp time goes
		assert(R("gap_kind()") === "monsters alive, walking to the next one" || R("gap_kind()") === "monsters alive, none chosen" || R("gap_kind()") === "monsters alive, in reach, swing on cooldown", `the tank with untouched camp monsters around: ${R("gap_kind()")}`);
		R("gaps.min = [{ m: Math.floor(Date.now() / 60_000), by: { 'nothing alive here (respawn)': 45_000, 'in a fight, target in reach': 15_000 } }]");
		assert(/camp time \(1 min\): nothing alive here \(respawn\) 75% \| in a fight, target in reach 25%/.test(R("gaps_text()")), `the report line: ${R("gaps_text()")}`);
		R("gaps.min = []");
		assert(R("camp_overgrown(state.pack)") === 1, "v24.61: every monster of the camp's type in view is past the limit → the camp counts as overgrown (left at once)");
		ctx.parent.entities.n4 = mild("n4", 200, 4); R("live_cache.clear()");
		assert(R("camp_overgrown(state.pack)") === 0, "...not while one of them can still be taken");
		delete ctx.parent.entities.n4; delete ctx.parent.entities.n10; R("live_cache.clear()");
		assert(R("camp_overgrown(state.pack)") === 0, "...and not when none is in view (that's the idle time's case)");
		ctx.parent.entities.n10 = mk("n10", 40, 10); R("live_cache.clear()");
		// the tank stands and fights what it started: no stepping away from a monster that only fails the per-monster check
		ctx.parent.entities.n10.target = "Torlis"; steps.length = 0; R("last_move = 0; smart_depth = 0");
		R("fight(parent.entities.n10, false)");
		assert(steps.length === 0, `a levelled monster on the tank: it fights, it doesn't step away (${JSON.stringify(steps)})`);
		R("live_ok = __lo146");
		ctx.attack = atk; ctx.move = mv0; ctx.get_party = gp; ctx.parent.entities = ents; ctx.distance = () => 0; delete ctx.G.monsters.poi146;
		R("state.partners = {}; state.pack = null; delete state.safe.poi146; CFG.party.tank_first = false; live_cache.clear()");
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", map: "main", x: 0, y: 0 });
	}
	// 147) v24.57: with the leader on an errand a follower waits in town (or walks to town) — never to the camp alone
	{
		const R = (c) => vm.runInContext(c, ctx);
		const ents = ctx.parent.entities, mv0 = ctx.move, steps = [];
		ctx.parent.entities = {}; ctx.move = (x, y) => steps.push([x, y]); ctx.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
		R("globalThis.__tv147 = travel; globalThis.__d147 = null; travel = (d) => { globalThis.__d147 = d; }; state.partners = {}; state.errand = null; smart_depth = 0; last_move = 0; state.follow_block = null");
		const pk = { mtype: "croc", map: "main", boundary: [696, 1498, 906, 1922] };
		Object.assign(character, { name: "Aspernari", ...asp, ctype: "priest", level: 58, map: "main", x: 10, y: 20, rip: false, hp: 5270, max_hp: 5270, moving: false });
		hb("Torlis", { ...tor, ctype: "paladin", level: 53, map: "main", x: -200, y: -130, errand: "town", pack: pk });
		hb("Sanala", { ...san, ctype: "mage", level: 53, map: "main", x: 40, y: -100, errand: "town" });
		R("follower_tick()");
		assert(R("__d147") === null && steps.length === 0, `leader still on its town run, we're in town: wait here — no walk to the camp (${JSON.stringify(R("__d147"))})`);
		Object.assign(character, { map: "main", x: 700, y: 1600 });
		R("follower_tick()");
		assert(R("__d147 && __d147.map === 'main' && __d147.x === -200 && __d147.y === -130"), `...and if we're out in the field: to the leader (v24.61), not to town alone and not to the camp (${JSON.stringify(R("__d147"))})`);
		// v24.61: a party trip pending while we're out in the field doesn't start our own walk to town
		R("state.ptown = { id: 'Torlis:1', by: 'Torlis', at: Date.now(), leavers: ['Torlis'], pending: true }");
		assert(R("ptown_join_tick()") === false && R("state.errand") === null && R("state.ptown.pending") === true, "a follower out in the field with a party trip pending starts no town run of its own: it follows the tank in");
		R("state.ptown = null");
		// v24.66: a caster in range doesn't step closer — not toward the tank, not toward its target
		if (R("RANGED")) {
			R("state.partners = {}; __d147 = null; last_move = 0; smart_depth = 0"); steps.length = 0;
			Object.assign(character, { name: "Sanala", ...san, ctype: "mage", map: "main", x: 0, y: 0, range: 200, moving: false });
			hb("Torlis", { ...tor, ctype: "paladin", level: 53, map: "main", x: 120, y: 0, pack: pk });
			hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: 60, y: 0 });
			ctx.parent.entities = { c147: { id: "c147", type: "monster", mtype: "croc", x: 190, y: 0, hp: 100, max_hp: 100, visible: true, target: "Torlis" } };
			R("follower_tick()");
			assert(steps.length === 0 && R("__d147") === null, `a caster 120px from the tank with its target at 95% of range: it stands and casts (${JSON.stringify(steps)})`);
			hb("Torlis", { ...tor, ctype: "paladin", level: 53, map: "main", x: 170, y: 300, pack: pk });
			ctx.parent.entities = {};
			R("last_move = 0; follower_tick()");
			assert(steps.length === 1, `...and steps after the tank once it's beyond 70% of its range (${JSON.stringify(steps)})`);
			steps.length = 0; R("last_move = 0");
		}
		// v24.62: a member the tank hasn't heard from is missing: no fight is started, and holding fire isn't "no progress"
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 53, map: "main", x: 0, y: 0 });
		R("state.partners = {}; CFG.party.tank_first = true; state.prog = null; state.bad_ids = {}");
		hb("Sanala", { ...san, ctype: "mage", level: 53, map: "main", x: 40, y: 0 });
		assert(R("party_missing().join()") === "Aspernari", `a member with no heartbeat yet is missing (${R("party_missing().join()")})`);
		const m147 = { id: "m147", type: "monster", mtype: "croc", x: 5, y: 0, hp: 100, max_hp: 100, visible: true };
		ctx.parent.entities = { m147 };
		assert(R("tank_first(parent.entities.m147)") === true, "...so the tank doesn't start a fight");
		R("watch_progress(parent.entities.m147); state.prog && (state.prog.t = 0); watch_progress(parent.entities.m147)");
		assert(R("!state.bad_ids.m147"), "...and a monster it's holding fire on isn't marked as taking no damage");
		// the wait in town: a member in town whose heartbeat doesn't show the trip yet is still waited for
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: 10, y: 20 });
		hb("Sanala", { ...san, ctype: "mage", level: 53, map: "main", x: 40, y: 0, pt: { done: true } });
		R("state.ptown = { id: 'Torlis:2', by: 'Torlis', at: Date.now(), leavers: ['Torlis'], joined: true }; globalThis.__w147 = 'waiting'; ptown_wait().then(() => { globalThis.__w147 = 'left'; })");
		await new Promise((r) => setImmediate(r));
		assert(R("__w147") === "waiting" && R("!!state.ptown"), "the tank's wait in town doesn't end while a member in town hasn't said its work is done");
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: 10, y: 20, pt: { done: true } });
		{ const mark = timers.length; for (let i = 0; i < 3 && R("__w147") === "waiting"; i++) { for (const t of timers.splice(mark)) t.fn(); await new Promise((r) => setImmediate(r)); } }
		assert(R("__w147") === "left" && R("state.ptown") === null, `...and ends once every member has (${R("__w147")})`);
		R("CFG.party.tank_first = false; state.prog = null; state.bad_ids = {}; state.errand = null; state.ptown_done_at = 0");
		R("travel = __tv147; state.partners = {}; state.pack = null");
		ctx.parent.entities = ents; ctx.move = mv0; ctx.distance = () => 0;
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", map: "main", x: 0, y: 0 });
	}
	// 148) v24.58: only the tank starts town trips and goes to events; a follower reports its need and waits to be taken
	{
		const R = (c) => vm.runInContext(c, ctx);
		const scm = ctx.send_cm, msgs = []; ctx.send_cm = (to, m) => (msgs.push(m), Promise.resolve());
		const src_tick = R("tick.toString()");
		assert(/if \(is_follower\(\)\) ptown_join_tick\(\); else town_check\(\);/.test(src_tick) && /if \(!is_follower\(\) && event_tick\(\)\)/.test(src_tick), "tick: a follower runs neither town_check nor event_tick");
		assert(!/looming\(\)|keep_away\(|kite\(|route_danger\(/.test(R("follower_tick__fighter.toString()")), "follower_tick: no keep-away, no kiting, no route refusal of its own");
		// the follower's heartbeat carries its need; the tank acts on it
		R("globalThis.__td148 = town_due; globalThis.__tr148 = town_run; globalThis.__n148 = 0; town_run = () => (++globalThis.__n148, true); state.partners = {}; state.errand = null; state.ptown = null; state.town_runs = []; smart_depth = 0");
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", level: 53, map: "main", x: 700, y: 1600, rip: false, esize: 2 });
		hb("Torlis", { ...tor, ctype: "paladin", level: 53, map: "main", x: 720, y: 1600 });
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: 680, y: 1600 });
		R("town_due = () => ({ sell: true, plan: { free: 2, sell: [1], bank: [], fetch: [] }, min_free: 10, pot_min: 100 })");
		msgs.length = 0; R("heartbeat()");
		assert(R("is_follower()") && /bags 2 free/.test(msgs.find((m) => m.k === "hb")?.tn || ""), `a follower with full bags says so in its heartbeat (${msgs.find((m) => m.k === "hb")?.tn})`);
		Object.assign(character, { name: "Torlis", ...tor, ctype: "paladin", level: 53, map: "main", x: 720, y: 1600, rip: false, esize: 30 });
		R("state.partners = {}; town_due = () => ({ plan: { free: 30, sell: [], bank: [], fetch: [] }, min_free: 10, pot_min: 100 }); state.last_town = 0");
		hb("Sanala", { ...san, ctype: "mage", level: 53, map: "main", x: 700, y: 1600, tn: "bags 2 free" });
		hb("Aspernari", { ...asp, ctype: "priest", level: 58, map: "main", x: 680, y: 1600 });
		msgs.length = 0; R("town_check()");
		assert(R("__n148") === 1 && msgs.some((m) => m.k === "ptown") && /for Sanala: bags 2 free/.test(R("state.town_trig")), `the tank starts the party's trip for a member in need (${R("state.town_trig")})`);
		R("town_due = __td148; town_run = __tr148; state.partners = {}; state.ptown = null; state.town_runs = []; state.last_town = 0");
		ctx.send_cm = scm;
		Object.assign(character, { name: "Sanala", ...san, ctype: "mage", map: "main", x: 0, y: 0, esize: 30 });
	}
	// v25.20: the tank's one-hit kills open a free-for-all at its camp, for that type only
	{
		const R = (c) => vm.runInContext(c, ctx);
		const sv = { name: character.name, ctype: character.ctype, map: character.map, x: character.x, y: character.y }, ents = ctx.parent.entities;
		ctx.G.monsters.os150 = { hp: 200, attack: 5, frequency: 1, xp: 10, speed: 10, range: 20, respawn: 10 };
		ctx.G.monsters.ot150 = { hp: 200, attack: 5, frequency: 1, xp: 10, speed: 10, range: 20, respawn: 10 };
		// the tank: three kills in one hit → it one-shoots os150; one kill that took two hits → it doesn't
		Object.assign(character, { name: "Torlis", ctype: "paladin", map: "main", x: 0, y: 0 });
		R("for (const k in os_log) delete os_log[k]");
		for (let i = 0; i < 3; i++) {
			ctx.parent.entities = { ["m" + i]: { id: "m" + i, type: "monster", mtype: "os150", max_hp: 200, hp: 0, x: 0, y: 0 } };
			R(`os_note({ kill: true, damage: 250, target: "m${i}" })`);
		}
		assert(JSON.stringify(R("oneshot_types()")) === '["os150"]', `the tank one-shoots os150 (${JSON.stringify(R("oneshot_types()"))})`);
		ctx.parent.entities = { m9: { id: "m9", type: "monster", mtype: "os150", max_hp: 200, hp: 0, x: 0, y: 0 } };
		R(`os_note({ kill: true, damage: 120, target: "m9" })`);
		assert(R("oneshot_types().length") === 0, "a kill that took more than one hit ends it");
		// a follower: the tank's heartbeat says it one-shoots os150; the camp is os150
		Object.assign(character, { name: "Sanala", ctype: "mage", map: "main", x: 0, y: 0 });
		hb("Torlis", { ...tor, ctype: "paladin", level: 55, map: "main", x: 10, y: 0, os: ["os150"] });
		R("globalThis.__tf = CFG.party.tank_first; CFG.party.tank_first = true"); // (an earlier test leaves it off)
		R("globalThis.__sf = state.safe.os150; state.safe.os150 = { trusted: true, ttk: 1, xp: 10 }"); // our own safety verdict on the type (follower_pick)
		R("state.pack = { mtype: 'os150', map: 'main', boundary: [-100, -100, 100, 100] }; state.os_pick = null");
		const mk = (id, mt, x) => ({ id, type: "monster", mtype: mt, visible: true, dead: false, x, y: 0, hp: 200, max_hp: 200, level: 1, attack: 5 });
		ctx.parent.entities = { a: mk("a", "os150", 20), b: mk("b", "os150", 50), c: mk("c", "os150", 400), d: mk("d", "ot150", 30) };
		const E = ctx.parent.entities;
		R("globalThis.__E = parent.entities");
		assert(R("tank_first(__E.a)") === false && R("free_for_all(__E.a)") === true, "a follower may start on the one-shot type at the camp");
		assert(R("tank_first(__E.c)") === true, "...not outside the camp");
		assert(R("tank_first(__E.d)") === true, "...not on another type");
		const firsts = new Set();
		for (let i = 0; i < 30; i++) { R("state.os_pick = null"); firsts.add(R("os_pick() && os_pick().id")); }
		assert(firsts.has("a") && firsts.has("b") && !firsts.has("c") && !firsts.has("d"), `random picks among the camp's untouched os150 (${[...firsts]})`);
		const p1 = R("os_pick().id"); assert(R("os_pick().id") === p1, "a pick is kept until it's dead or taken");
		// a pick that takes no damage in 12 s is set aside (2 min) and another is picked; an immune one is never picked
		R("state.os_pick_at = Date.now() - 13000; state.os_pick_hp = 200");
		const p2 = R("os_pick().id");
		assert(p2 !== p1 && R(`(state.bad_ids['${p1}'] || 0) > Date.now()`), `a stalled pick is set aside (${p1} → ${p2})`);
		R(`delete state.bad_ids['${p1}']`); E.a.immune = true; E.b.immune = true; R("state.os_pick = null");
		assert(R("os_pick()") === null, "immune monsters aren't picked");
		delete E.a.immune; delete E.b.immune;
		hb("Torlis", { ...tor, ctype: "paladin", level: 55, map: "main", x: 10, y: 0, os: ["os150"], errand: "town" });
		assert(R("free_for_all(__E.a)") === false, "no free-for-all while the tank is on an errand");
		hb("Torlis", { ...tor, ctype: "paladin", level: 55, map: "main", x: 10, y: 0, os: [] });
		assert(R("tank_first(__E.a)") === true && R("free_for_all(__E.a)") === false, "the tank stops one-shooting it: back to the tank's first hit");
		ctx.parent.entities = ents; R("CFG.party.tank_first = globalThis.__tf; if (globalThis.__sf) state.safe.os150 = globalThis.__sf; else delete state.safe.os150; state.pack = null; state.os_pick = null; state.partners = {}; delete globalThis.__E"); Object.assign(character, sv);
	}
	// v25.27: a door leg goes through the planned door (walk to it, transport), not smart_move({map: next})
	{
		const R = (c) => vm.runInContext(c, ctx);
		const calls = [], sv = { map: character.map, x: character.x, y: character.y };
		Object.assign(character, { map: "halloween", x: 0, y: 0 });
		R("globalThis.__gr = go_raw; globalThis.__rp = route_plan; globalThis.__rpl = route_plain; globalThis.__tc = CFG.travel.safe_routes; CFG.travel.safe_routes = true");
		// (Copilot, PR #14: undo only what this test adds to a shared halloween map)
		const hd = ctx.G.maps.halloween, hd_doors = hd ? hd.doors : undefined;
		ctx.G.maps.halloween = hd || {};
		if (!ctx.G.maps.halloween.doors) ctx.G.maps.halloween.doors = [[1, 1, 10, 10, "spookytown", 0]];
		ctx.__calls = calls;
		R(`route_plan = route_plain = () => ({ d: 100, around: "prat @ level1", legs: [{ kind: "door", map: "halloween", fx: 0, fy: 0, x: 300, y: 40, to: "spookytown", s: 2, fs: 3, tx: 5, ty: 6 }] });
			go_raw = async (d) => { __calls.push("walk " + d.map + " " + d.x + "," + d.y); if (d.map !== character.map) character.map = d.map; return true; }`);
		const tp0 = ctx.transport; ctx.transport = (m, sp) => { calls.push("transport " + m + " " + sp); character.map = m; return Promise.resolve(); };
		await R("go_route({ map: 'spookytown', x: 50, y: 60 }, 5000)");
		assert(calls[0] === "walk halloween 300,40" && calls[1] === "transport spookytown 2" && !calls.some((c) => /walk main/.test(c)), `the planned door: walked to on this map, then used (${calls})`);
		// with this side's spawn for the door known: stand there (the server's door check is from that spawn)
		calls.length = 0; character.map = "halloween"; const spw = ctx.G.maps.halloween.spawns; ctx.G.maps.halloween.spawns = [[0, 0], [1, 1], [2, 2], [290, 60]];
		await R("go_route({ map: 'spookytown', x: 50, y: 60 }, 5000)");
		assert(calls[0] === "walk halloween 290,60" && calls[1] === "transport spookytown 2", `...from this side's spawn for the door (${calls})`);
		ctx.G.maps.halloween.spawns = spw;
		// no path to the door's point: the old way (smart_move to the next map)
		calls.length = 0; character.map = "halloween";
		R(`go_raw = async (d) => { __calls.push("walk " + d.map + " " + d.x + "," + d.y); if (d.map === "halloween") throw { reason: "failed" }; character.map = d.map; return true; }`);
		await R("go_route({ map: 'spookytown', x: 50, y: 60 }, 5000)");
		assert(calls[1] === "walk spookytown 5,6", `no path to the door's point: the old way (${calls})`);
		R("go_raw = globalThis.__gr; route_plan = globalThis.__rp; route_plain = globalThis.__rpl; CFG.travel.safe_routes = globalThis.__tc");
		ctx.transport = tp0; if (hd) { if (hd_doors === undefined) delete hd.doors; else hd.doors = hd_doors; } else delete ctx.G.maps.halloween; delete ctx.__calls;
		Object.assign(character, sv);
	}
	// v25.22: the Cave of Many Dreams
	{
		const R = (c) => vm.runInContext(c, ctx);
		const G0 = ctx.G.events;
		ctx.G.events = { dreams: { encounters: [
			{ kind: "wolves", group: "mixed", options: [{ id: "e10_0", effect: "wolves" }, { id: "e10_1", effect: "venture", outcomes: [{ weight: 1, fight: ["cave_wolf", 2] }] }, { id: "e10_2", effect: "venture", amber: 2, outcomes: [{ weight: 1, reward: "cave_parcel" }, { weight: 1, fight: ["cave_guard", 3] }] }, { id: "e10_5", effect: "leave" }] },
			{ kind: "rescue", group: "mixed", options: [{ id: "save", effect: "save" }, { id: "watch", effect: "watch" }, { id: "finish", effect: "both" }] },
			{ kind: "shadow", group: "mixed", options: [{ id: "e17_0", effect: "venture", outcomes: [{ weight: 1, shadow: true }] }, { id: "e17_4", effect: "careful" }, { id: "e17_5", effect: "leave" }] },
			{ kind: "toll", group: "bad", options: [{ id: "e27_0", effect: "pay", cost: 3000 }, { id: "e27_1", effect: "bad_fight" }, { id: "e27_3", effect: "time", cost: 1000 }, { id: "e27_5", effect: "bad_double" }] },
		] } };
		const ch = (kind, ids, extra) => ({ id: "c1", kind, options: ids.map((id) => ({ id, cost: 0, amber: 0, ...(extra?.[id] || {}) })) });
		const pol = (c, st) => R(`cave_policy(${JSON.stringify(c)}, ${JSON.stringify(st || { gold: 5000, amber: 3 })})`);
		assert(pol(ch("wolves", ["e10_0", "e10_1", "e10_5"])) === "e10_5", "never the wolves (e10_0, nor e10_1: two Cave Wolves, as in the game's data): walk away");
		assert(pol(ch("wolves", ["e10_0", "e10_2", "e10_5"], { e10_2: { amber: 0 } })) === "e10_2", "a parcel or three guards beats walking away");
		assert(pol(ch("rescue", ["save", "watch", "finish"])) === "watch", "a rescue (Cave Wolves): watch, never fight them");
		assert(pol(ch("shadow", ["e17_0", "e17_4", "e17_5"])) === "e17_4", "never a shadow of our strongest; the careful reward");
		assert(pol(ch("toll", ["e27_0", "e27_1", "e27_3", "e27_5"])) === "e27_1", "a toll: three guards (easy, XP) over paying or losing time");
		assert(pol(ch("toll", ["e27_0", "e27_3"], { e27_0: { unavailable: "purse_short" } })) === "e27_3", "an option the purse can't pay isn't taken");
		assert(pol({ id: "r", kind: "revival", options: [{ id: "here", amber: 2 }, { id: "landing" }] }, { amber: 3 }) === "here", "revive where we fell when the purse has the Amber");
		assert(pol({ id: "r", kind: "revival", options: [{ id: "here", amber: 2 }, { id: "landing" }] }, { amber: 1 }) === "landing", "...at the doorway when it doesn't");
		// goals: camps first, the guard camp last, then the stairs; a room died at twice is left
		const st = { floor: 0, objectives: [{ id: "a", floor: 0, kind: "fight", required: true, done: false, x: 1, y: 1 }, { id: "b", floor: 0, kind: "boss", required: true, done: false, x: 2, y: 2 },
			{ id: "c", floor: 0, kind: "farm", done: false, x: 3, y: 3 }, { id: "d", floor: 1, kind: "boss", required: true, done: false }], doors: [{ to: "z1", down: true, locked: true }] };
		R("for (const k in cave_st.deaths) delete cave_st.deaths[k]");
		const g = (x) => R(`JSON.stringify(cave_next_goal(${JSON.stringify(x)}))`);
		assert(/"id":"c"/.test(g(st)), `a camp first (${g(st)})`);
		st.objectives[2].done = true;
		assert(/"id":"b"/.test(g(st)), "then the floor keeper before the guard camp (two Cave Wolves on floor 1)");
		st.objectives[1].done = true;
		assert(/"id":"a"/.test(g(st)), "then the guard camp");
		R("cave_st.deaths.a = 2");
		assert(g(st) === "null", "a room died at twice is left; stairs still locked: nothing");
		st.doors[0].locked = false;
		assert(/"door"/.test(g(st)), "the stairs once they're open");
		R("for (const k in cave_st.deaths) delete cave_st.deaths[k]");
		// the daily entry: the tank, a visit open, the party online → walks to Dorr; beside it with the party → cave_enter()
		const sv = { name: character.name, ctype: character.ctype, map: character.map, x: character.x, y: character.y }, ents = ctx.parent.entities;
		Object.assign(character, { name: "Torlis", ctype: "paladin", map: "main", x: 816, y: 1240, rip: false });
		ctx.parent.entities = {};
		hb("Aspernari", { ...asp, ctype: "priest", level: 59, map: "main", x: 830, y: 1240 });
		hb("Sanala", { ...san, ctype: "mage", level: 54, map: "main", x: 800, y: 1240 });
		let entered = 0; ctx.cave_enter = () => (entered++, Promise.resolve({ run: "r", level: 1 })); ctx.cave_info = () => Promise.resolve({ available: true });
		R("state.cave_visit = { available: true, at: Date.now() }; cave_st.info_at = Date.now(); state.gear_skip = {}; state.errand = null; state.ptown = null; cave_st.entering = false");
		assert(R("cave_due()") === true, "the tank, the visit open, the party online: due");
		R("cave_entry_tick()");
		assert(entered === 1, "beside Dorr with the party: cave_enter()");
		R("state.cave_visit = { available: false, at: Date.now() }; cave_st.entering = false");
		assert(R("cave_due()") === false, "visited today: not due");
		R("state.cave_visit = { available: true, at: Date.now() }; CFG.cave.enabled = false");
		assert(R("cave_due()") === false, "...nor when switched off");
		R("CFG.cave.enabled = true; cave_st.entered_at = 0");
		// a member that can't reach Dorr: the tank waits at most wait_party_ms, then leaves it for 30 min
		hb("Sanala", { ...san, ctype: "mage", level: 54, map: "main", x: 2000, y: 1240 });
		R("state.gear_skip = {}; cave_st.entering = false; cave_st.wait_at = Date.now() - CFG.cave.wait_party_ms - 1000");
		assert(R("cave_entry_tick()") === false && R("skipped('cave')"), "a member that can't reach Dorr: the wait times out, the visit is put off");
		R("state.gear_skip = {}; cave_st.wait_at = 0");
		// a new run forgets the last one's rooms and shops (their ids repeat every visit)
		R("cave_st.run = 'r1'; cave_st.deaths = { '0:1': 2 }; cave_st.bought = { '0:shop': true }; cave_st.stuck = { '0:2': true }; cave_run_check({ run: 'r2' })");
		assert(R("cave_st.run === 'r2' && !Object.keys(cave_st.deaths).length && !Object.keys(cave_st.bought).length && !Object.keys(cave_st.stuck).length"), "a new run starts with no rooms skipped or shops bought");
		// the watchdog: no closer to a room for stuck_ms → given up; a camp after camp_max_ms
		character.cave = { run: "r2", floor: 0 };
		R("cave_st.prog = null");
		const og = { obj: { id: "0:1", kind: "boss", x: character.x + 600, y: character.y } };
		assert(R(`cave_progress(${JSON.stringify(og)})`) === false, "a new goal isn't given up");
		R("cave_st.prog.best_at = Date.now() - CFG.cave.stuck_ms - 1000");
		assert(R(`cave_progress(${JSON.stringify(og)})`) === true && R("cave_st.stuck['0:1']"), "no closer for stuck_ms: given up for this visit");
		const oc = { obj: { id: "0:c", kind: "farm", x: character.x, y: character.y } };
		R(`cave_progress(${JSON.stringify(oc)}); cave_st.prog.since = Date.now() - CFG.cave.camp_max_ms - 1000`);
		assert(R(`cave_progress(${JSON.stringify(oc)})`) === true && R("cave_st.stuck['0:c']"), "a camp held past camp_max_ms is left (the required rooms and stairs come next)");
		R("cave_st.stuck = {}; cave_st.prog = null"); delete character.cave;
		// inside: one vote per choice, and the shop's item bought with the purse
		let votes = [], buys = 0;
		ctx.cave_reply = (c, o) => (votes.push(o), Promise.resolve({})); ctx.cave_buy = () => (buys++, Promise.resolve({ recipient: "Sanala" }));
		character.cave = { floor: 0, paused: true, gold: 9000, amber: 1, objectives: [], doors: [], choice: { id: "v1", kind: "toll", options: [{ id: "e27_1" }, { id: "e27_3" }], votes: {}, resolved: false, shop: { room: "m1", name: "cave_counterweight", price: 8000, sold: false, nearby: true } } };
		R("cave_tick(); cave_tick()");
		assert(votes.length === 1 && votes[0] === "e27_1" && buys === 1, `one vote per choice (${votes}), the shop item bought once (${buys})`);
		delete character.cave; delete ctx.cave_enter; delete ctx.cave_info; delete ctx.cave_reply; delete ctx.cave_buy;
		ctx.parent.entities = ents; Object.assign(character, sv); R("state.partners = {}; state.cave_visit = null");
		ctx.G.events = G0;
	}
	// v25.29: the cave beat us → leave and wait to be stronger; followers leave with the tank
	{
		const R = (c) => vm.runInContext(c, ctx);
		const sv = { name: character.name, ctype: character.ctype, level: character.level };
		let exits = 0; ctx.cave_exit = () => (exits++, Promise.resolve({ exited: true }));
		Object.assign(character, { name: "Torlis", ctype: "paladin", level: 56 });
		character.cave = { run: "rz", floor: 0, objectives: [], doors: [] };
		R("cave_st.run = null; state.cave_block = null; globalThis.__pp = party_power; party_power = () => ({ lv: 56, gs: 500, n: 3 }); globalThis.__ss = save_state; save_state = () => {}");
		R("cave_died(); cave_died()");
		assert(exits === 0 && R("state.cave_block") === null, "two deaths in a visit: still in");
		R("cave_died()");
		assert(exits === 1 && R("state.cave_block && state.cave_block.lv === 56 && state.cave_block.gs === 500"), "the tank's third death: the party leaves, the cave is on hold");
		delete character.cave;
		R("state.cave_visit = { available: true, at: Date.now() }; cave_st.info_at = Date.now()");
		assert(R("cave_blocked()") === true, "on hold while the party is as strong as when it lost");
		R("party_power = () => ({ lv: 58, gs: 500, n: 2 })");
		assert(R("cave_blocked()") === true, "a higher average with a member offline isn't the party stronger");
		R("party_power = () => ({ lv: 58, gs: 500, n: 3 })");
		assert(R("cave_blocked()") === false && R("state.cave_block") === null, "two levels stronger: the cave again");
		R("party_power = globalThis.__pp; save_state = globalThis.__ss");
		// a follower: the tank's heartbeat shows it outside the cave → leave too
		Object.assign(character, { name: "Sanala", ctype: "mage" });
		character.cave = { run: "rz2", floor: 0, objectives: [], doors: [], paused: false };
		hb("Torlis", { ...tor, ctype: "paladin", level: 56, map: "main", x: 0, y: 0 });
		R("cave_st.exiting = false; cave_tick()");
		assert(exits === 1, "the tank's heartbeat outside on our first tick inside (its old beat): not yet");
		R("cave_st.out_since = Date.now() - 21000; cave_tick()");
		assert(exits === 2, "outside for 20 s straight: a follower leaves with the tank");
		// a later visit: the clock starts again (it was kept across visits)
		character.cave = { run: "rz3", floor: 0, objectives: [], doors: [], paused: false };
		R("cave_st.exiting = false; cave_tick()");
		assert(exits === 2, "a new visit: the tank's old heartbeat on main doesn't make us leave at once");
		hb("Torlis", { ...tor, ctype: "paladin", level: 56, map: "zone_rz3_0", x: 0, y: 0 });
		R("cave_tick()");
		assert(R("cave_st.out_since") === 0, "...and the tank inside resets the clock");
		// a cave_exit that throws synchronously: caught, retried, at most 6 tries
		{
			let tries = 0; ctx.cave_exit = () => { tries++; throw new Error("not now"); };
			const st = ctx.setTimeout; let pend = []; ctx.setTimeout = (f) => pend.push(f);
			R("cave_st.exiting = false; cave_st.exit_tries = 0; cave_leave('test')");
			for (let i = 0; i < 10; i++) { await new Promise((r) => setImmediate(r)); const f = pend.shift(); if (f) f(); }
			ctx.setTimeout = st;
			assert(tries === 6, `a synchronous throw from cave_exit is caught and retried, 6 tries at most (got ${tries})`);
		}
		delete character.cave; delete ctx.cave_exit; R("state.partners = {}; state.cave_visit = null; cave_st.exiting = false; cave_st.exit_tries = 0"); Object.assign(character, sv);
	}
	// v25.14: keep_awake calls the game's performance_trick only while no loop exists, then replays the loop only when it
	// stopped and sound is allowed (no stacked or queued copies)
	{
		let started = 0, plays = 0, on = false, howl = false;
		const snd = { playing: () => on, play: () => { plays++; on = true; } };
		ctx.parent.Howler = { ctx: { state: "suspended" } };
		ctx.performance_trick = () => { started++; if (howl) { on = true; ctx.parent.sounds = { empty: snd }; } }; // no Howl yet: nothing
		delete ctx.parent.sounds;
		vm.runInContext("keep_awake()", ctx);
		howl = true; vm.runInContext("keep_awake(); keep_awake(); keep_awake()", ctx);
		assert(started === 2 && plays === 0, `retried until the loop exists, then not again (${started}), not replayed while playing (${plays})`);
		on = false; vm.runInContext("keep_awake(); keep_awake()", ctx);
		assert(started === 2 && plays === 0, "stopped while the browser blocks sound: not replayed (it would queue copies)");
		ctx.parent.Howler.ctx.state = "running"; vm.runInContext("keep_awake(); keep_awake()", ctx);
		assert(started === 2 && plays === 1, `replayed once when it stopped and sound runs (${plays})`);
		on = false; delete ctx.parent.Howler.ctx; vm.runInContext("keep_awake()", ctx);
		assert(plays === 2, "HTML5 audio (no context): replayed when stopped");
		ctx.performance_trick = () => { throw new Error("no Howl"); }; delete ctx.parent.sounds;
		let threw = false; try { vm.runInContext("keep_awake()", ctx); } catch (e) { threw = true; }
		assert(!threw, "a failing performance_trick doesn't throw");
		delete ctx.parent.Howler; delete ctx.parent.sounds;
	}
	all_done = true;
	console.log("ALL PASS");
})();
