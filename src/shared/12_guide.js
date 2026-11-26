// =====================================================================
// Progression Guide adapter
// =====================================================================
// Guide text carries display names ("Bee Wings"); map them back to item ids (lookup table built on first use)
let item_by_name = null;
function item_id(n) {
	if (!n) return null;
	if (G.items[n]) return n;
	if (!item_by_name) { item_by_name = {}; for (const id in G.items) if (G.items[id].name) item_by_name[G.items[id].name] = id; }
	return item_by_name[n] || null;
}
// Walk each plan's chosen path (node.next, plus "develop" inputs), not every alternative: plan trees list long shots
// (glitch boxes, event drops) the guide isn't pursuing. Depth capped at 12 (real plans are ~6 deep; guards cycles).
function chosen_path(node, visit, depth = 0) {
	if (!node || depth > 12) return;
	visit(node);
	const nx = node.next;
	if (nx) { visit(nx); for (const i of nx.inputs || []) chosen_path(i, visit, depth + 1); }
	for (const alt of node.alternatives || []) if (alt.kind === "develop") for (const i of alt.inputs || []) chosen_path(i, visit, depth + 1);
}
// Quest recipes the guide is working toward: craft rows and craft nodes on plans' chosen paths; rows naming a quest
// output; farm rows for drops a quest needs ("bees" = save Bee Wings for Cole; "material"); a "set" goal's pieces
function guide_quest_ids(prog) {
	const by_output = {};
	for (const id in G.craft) if (G.craft[id].quest) by_output[G.craft[id].output?.name || id] = id;
	const quest = (id) => (G.craft[id]?.quest ? id : null);
	const out = new Set(), add = (id) => id && out.add(id);
	for (const plan of prog.plans || []) chosen_path(plan.tree, (n) => { if (n.kind === "craft") add(quest(n.recipe) || by_output[n.name]); });
	const drops_of = (mt) => new Set((G.drops?.monsters?.[mt] || []).filter((d) => Array.isArray(d) && typeof d[0] === "number").map((d) => d[1])
		.concat(Object.keys(DROP_FALLBACK).filter((it) => DROP_FALLBACK[it].some(([m]) => m === mt))));
	for (const r of prog.rows || []) {
		if (r.kind === "craft" || r.action?.kind === "craft") add(quest(r.action?.recipe) || by_output[r.action?.name]);
		for (const n of [r.request?.name, r.target?.name, r.action?.name]) add(by_output[n]);
		const reason = (r.reason?.id || "").replace("progression.reason.", "");
		const mt = (r.action?.route || r.route)?.monster;
		if (r.kind === "farm" && mt && ["bees", "material", "try_material"].includes(reason)) {
			const drops = drops_of(mt);
			for (const id in G.craft) if (G.craft[id].quest && G.craft[id].items.some(([, n]) => drops.has(n))) add(id);
		}
	}
	if (prog.goal?.kind === "set" && prog.goal.name) {
		const pieces = new Set(G.sets?.[prog.goal.name]?.items || Object.keys(G.items).filter((n) => G.items[n].set === prog.goal.name));
		for (const id in G.craft) if (G.craft[id].quest && pieces.has(G.craft[id].output?.name || id)) add(id);
	}
	return out;
}
// What bags must hold: name -> copies. The guide's steps touch a few copies at a time (one item to upgrade plus a
// spare, three to compound), so only that many of the best copies stay; the rest is banked. Keeping every copy of
// a mentioned name would make every dropped helmet/shoes "needed" whenever the guide plans gear upgrades
// (its equipment lesson does), leaving nothing bankable.
// Stackable items (materials, scrolls) are one slot no matter how many, so they're kept whole.
function compute_needs(prog) {
	const needs = new Map();
	const add = (n, k) => {
		const def = n && G.items[n];
		if (!def) return;
		k = k || (def.compound ? CFG.need_copies_compound : CFG.need_copies_upgrade);
		needs.set(n, Math.max(needs.get(n) || 0, k));
	};
	for (const r of prog?.rows || []) {
		const a = r.action || {};
		add(a.name); add(a.scroll); add(r.request?.name);
		for (const i of a.inputs || []) add(i.name, i.quantity);
		for (const res of a.resources || []) add(character.items[res.num]?.name);
	}
	for (const plan of prog?.plans || []) chosen_path(plan.tree, (n) => { add(n.next?.name); add(n.next?.scroll); });
	for (const id of quest_recipes()) if (recipe_wanted(id)) for (const [q, n] of G.craft[id].items) add(n, q);
	return needs;
}
// Bag slots holding needed copies: per needed name, the best `count` copies by level (all stacks of stackables)
// Recomputed on each call (cheap: one pass over 42 slots); bag_plan() computes it once and passes it down
function needed_slots() {
	const keep = new Set(), by = {};
	const P = state.upg; // the upgrade project's copies below its target stay put (not equipped/sent/banked/compounded)
	if (P) character.items.forEach((i, k) => { if (i && i.name === P.name && (i.level || 0) < P.to) keep.add(k); });
	if (state.travel_off.length) for (const k of travel_slots_held()) keep.add(k); // v24.27: worn pieces off for a walk
	// v25.39: a piece the merchant's project asked us for (worn_for_me: role function) stays put until it's sent
	const WW = worn_for_me();
	if (WW) character.items.forEach((i, k) => { if (i && i.name === WW.name && (i.level || 0) === WW.level && !i.p) keep.add(k); });
	character.items.forEach((i, k) => { if (i && state.needs.has(i.name)) (by[i.name] = by[i.name] || []).push(k); });
	for (const n in by) {
		if (G.items[n]?.s) { by[n].forEach((k) => keep.add(k)); continue; }
		by[n].sort((a, b) => (character.items[b].level || 0) - (character.items[a].level || 0))
			.slice(0, state.needs.get(n)).forEach((k) => keep.add(k));
	}
	return keep;
}
// Read the Progression Guide: remember the quests it asks for and normalise its first farm row (state.guide_farm).
// spendLimit tells the guide how much gold it may plan to spend (everything above gold_reserve).
function read_guide() {
	if (!CFG.guide_enabled) { state.guide = null; state.guide_farm = null; return null; }
	if (typeof get_progression !== "function") return null;
	let prog;
	try { prog = get_progression({ spendLimit: Math.max(0, Math.min(character.gold - CFG.gold_reserve, gold_room())) }); } catch (e) { game_log("progression: " + e); return null; }
	if (!prog || !prog.ready) return null;
	state.guide = prog;
	for (const id of guide_quest_ids(prog)) {
		const r = G.craft[id], g = (state.guide_quests[id] = state.guide_quests[id] || { first: Date.now() });
		if (!g.last) game_log(`guide quest: ${id} (${G.npcs[r.quest]?.name || r.quest})`, C.info);
		g.last = Date.now();
	}
	const farm = (prog.rows || []).find((r) => {
		if (r.kind !== "farm") return false;
		const reason = (r.reason?.id || "").replace("progression.reason.", "");
		return (!CFG.follow_farm_reasons || CFG.follow_farm_reasons.includes(reason)) && (r.action?.route || r.route);
	});
	const route = farm && (farm.action?.route || farm.route);
	const area = route && G.monsters[route.monster] && resolve_area(route.monster, route.map, route.boundary, route.count);
	const mat = [farm?.title?.args?.item, farm?.reason?.args?.item, farm?.target?.name, farm?.action?.item, farm?.action?.name, route?.item, route?.drop].map(item_id).find(Boolean);
	state.guide_farm = area ? { monster: route.monster, ...area, item: mat, guide_safe: route.safe !== false, seconds: route.seconds,
		reason: "guide " + (farm.reason?.id || "").replace("progression.reason.", "") + (mat ? ` (${mat} ${held(mat)})` : ""),
		until: Date.now() + CFG.guide_interval_ms * 4 } : null; // valid for 4 reads (60s): survives a read or two failing
	return prog;
}
// Read the guide, recompute what bags must hold, re-decide the farm directive (every guide_interval_ms, and after steps)
function guide_refresh() {
	state.last_guide = Date.now();
	const prog = read_guide();
	state.needs = compute_needs(prog);
	refresh_directive();
	return prog;
}
const unsupported_seen = new Set(); // row kinds already reported as not automated (logged once each)
// The top guide row we can act on now: an automated kind, not paused, affordable
const next_guide_row = (prog) => {
	for (const r of prog?.rows || []) if (r.kind !== "farm" && !CFG.gear_actions.includes(r.kind) && !unsupported_seen.has(r.kind)) {
		unsupported_seen.add(r.kind);
		game_log(`guide: rows of kind "${r.kind}" aren't automated (e.g. ${r.id})`, C.dim);
	}
	return CFG.gear && (prog?.rows || []).find((r) => CFG.gear_actions.includes(r.kind) && !skipped(r.id) && r.affordable !== false);
};

// ---- Guide row executors: each runs one row's action or throws {reason} (the row is then paused, see guide_step) ----
// Craft row: only once the guide says every input is owned (a.ready); at the recipe's NPC
async function run_craft(a) {
	if (!a.ready) throw { reason: "inputs_not_ready" };
	const recipe = G.craft[a.recipe];
	if (!recipe) throw { reason: "recipe" };
	if ((recipe.cost || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" };
	if (character.esize < 1) throw { reason: "no_space" };
	await go_npc(a.npc || recipe.quest || "craftsman");
	await wait_budget(1, RESERVE.errand);
	tag_spend("crafting");
	const r = await T(auto_craft(a.recipe));
	const ok = r && !r.failed;
	game_log(`craft ${a.recipe}: ${ok ? "OK" : "FAILED"}`, ok ? C.ok : C.bad);
	if (ok) { state.crafted[a.recipe] = (state.crafted[a.recipe] || 0) + 1; save_state(); }
	return r;
}
async function task_stat() {
	let n = 0;
	for (const r of stat_scroll_list().filter((x) => x.ok).slice(0, CFG.stat_scroll.per_run)) {
		if (state.errand) state.errand_at = Date.now();
		try {
			const res = await run_stat({ name: r.name, slot: r.slot, scroll: r.scroll, quantity: r.q });
			await sleep_ms(400);
			if (character.slots?.[r.slot]?.stat_type === r.stat) { n++; log_ev("stat", { item: r.name, stat: r.stat, q: r.q, cost: r.cost }); }
			else { skip(r.key, 6 * 3600_000, why(res) || "not applied"); game_log(`stat scroll on ${r.name}: not applied (${why(res) || "?"}); again in 6h`, C.warn); }
		} catch (e) { skip(r.key, pause_ms(e, 6 * 3600_000), why(e)); game_log(`stat scroll on ${r.name}: ${why(e)}`, C.dim); }
	}
	return n;
}
// Stat-scroll row: apply a stat scroll (e.g. int) to an item. Worn items must come off first; every check runs
// before unequipping, and the finally block always puts the item back on (the scrolled copy if it worked).
async function run_stat(a) {
	if (character.esize < 1) throw { reason: "no_space" };
	const stat = G.items[a.scroll]?.stat, want_q = a.quantity || 1;
	const raw = (i) => i && i.name === a.name && !i.l && i.stat_type !== stat;
	const worn = !!a.slot && raw(character.slots[a.slot]);
	if (!worn && character.items.findIndex(raw) < 0) throw { reason: "input_missing" };
	const need = want_q - quantity(a.scroll);
	if (need > 0) {
		await buy_from_npc(a.scroll, need);
		if (!(await until(() => quantity(a.scroll) >= want_q, 3000))) throw { reason: "scroll_missing" }; // purchase lands
	}
	if (!has_computer()) await go("upgrade"); // stat scrolls are applied at the upgrade NPC
	let unequipped = false;
	try {
		if (worn) {
			await wait_budget(EMIT_COST.unequip, RESERVE.errand);
			await T(unequip(a.slot));
			unequipped = true;
			if (!(await until(() => !character.slots[a.slot], 3000))) throw { reason: "unequip_failed" }; // up to 3s for the update
		}
		const k = character.items.findIndex(raw), sk = find_slot(a.scroll, 0);
		if (k < 0) throw { reason: "input_missing" };
		if (sk < 0) throw { reason: "scroll_missing" };
		await wait_budget(1, RESERVE.errand);
		const r = await T(upgrade(k, sk), 30_000);
		game_log(`stat ${a.scroll} → ${a.name}: ${r?.stat || r?.success ? "OK" : why(r)}`, C.ok);
		return r;
	} finally {
		if (unequipped && !character.slots[a.slot]) {
			await sleep_ms(300); // let the scrolled item's update arrive
			let back = character.items.findIndex((i) => i && i.name === a.name && i.stat_type === stat);
			if (back < 0) back = character.items.findIndex((i) => i && i.name === a.name);
			if (back >= 0) { await wait_budget(EMIT_COST.equip, RESERVE.errand); await T(equip(back, a.slot)).catch((e) => game_log("stat re-equip: " + why(e), C.bad)); }
			else game_log(`stat: ${a.name} not in bags; ${a.slot} left empty`, C.bad);
		}
	}
}
// Exchange location: quest items (e.g. seashells) at their quest's NPC, everything else at Xyn ("exchange")
async function go_exchange(a) {
	if (has_computer()) return;
	if (a.npc) return go_npc(a.npc);
	const quest = G.items[a.name]?.quest, q = quest && G.quests?.[quest];
	if (q && q.map && Number.isFinite(q.x)) return go({ map: q.map, x: q.x, y: q.y + NPC_STAND_Y });
	if (quest && find_npc(quest)) return go_npc(quest);
	return go_npc("exchange");
}
// Execute one guide row by kind. Throws {reason, want?, chance?} when it can't (guide_step pauses the row).
async function run_row(row) {
	const a = row.action || {};
	const gold_ok = () => { if ((row.cost || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" }; };
	switch (row.kind) {
		case "equip": {
			const k = a.num !== undefined && character.items[a.num]?.name === a.name ? a.num : find_slot(a.name, a.level);
			if (k < 0) throw { reason: "input_missing" };
			// v19.7: never wear something that scores lower than what's in the slot (the guide doesn't own the slot)
			const sv = a.slot && slot_value(character.items[k], character.ctype, my_gear(), a.slot);
			if (CFG.gear_auto && a.slot && character.slots?.[a.slot] && sv < (my_gear().w[a.slot] || 0))
				throw { reason: "worse_than_worn", want: `${a.name}+${a.level || 0} ${Math.round(sv)} < ${Math.round(my_gear().w[a.slot])} pts` };
			await wait_budget(EMIT_COST.equip, RESERVE.errand);
			game_log(`equip ${a.name} +${a.level || 0} → ${a.slot}`, C.ok);
			if (a.slot) state.guide_equip[a.slot] = Date.now();
			return T(equip(k, a.slot));
		}
		case "buy":
			if (a.kind === "purchase") throw { reason: "player_stand_skip" };
			gold_ok();
			return buy_from_npc(a.name, a.quantity || 1, a.npc);
		case "upgrade":
		case "develop": {
			gold_ok();
			const name = a.name || row.request?.name || row.target?.name;
			if (!name || !G.items[name]) throw { reason: "unsupported", want: JSON.stringify(a).slice(0, 80) };
			if (row.kind === "develop" && !(row.request?.level > 0) && row.target?.level) row = { ...row, request: { name, level: row.target.level } };
			const aa = { ...a, name, scroll: a.scroll || upgrade_scroll(name, a.level || 0) };
			return G.items[name].compound ? run_compound(aa, row) : run_upgrade(aa, row);
		}
		case "compound": gold_ok(); return run_compound(a, row);
		case "craft": return run_craft(a);
		case "stat": return run_stat(a);
		case "exchange": {
			if (!a.ready) throw { reason: "inputs_not_ready" };
			if (character.esize < 1) throw { reason: "no_space" };
			await go_exchange(a);
			const k = find_slot(a.name, a.level || 0);
			if (k < 0 || (character.items[k].q || 1) < (a.quantity || 1)) throw { reason: "input_missing" };
			await wait_budget(1, RESERVE.errand);
			const r = await T(exchange(k), 30_000); // exchange() waits out the roll animation (several seconds)
			game_log(`exchange ${a.name} → ${r?.reward || "?"}`, C.ok);
			return r;
		}
		case "token":
			if (!a.ready) throw { reason: "inputs_not_ready" };
			await go_npc(a.npc);
			await wait_budget(1, RESERVE.errand);
			return T(exchange_buy(a.token, row.target?.name || row.request?.name || a.name));
		case "dismantle": {
			if (!a.ready) throw { reason: "inputs_not_ready" };
			if ((a.fee || 0) > character.gold - CFG.gold_reserve) throw { reason: "gold_reserve" };
			const k = a.resources?.[0] && character.items[a.resources[0].num]?.name === a.name ? a.resources[0].num : find_slot(a.name, a.level || 0);
			if (k < 0) throw { reason: "input_missing" };
			await go_npc(a.npc || "craftsman");
			await wait_budget(1, RESERVE.errand);
			return T(dismantle(k));
		}
		case "retrieve": {
			const t = a.target, packs = bank_packs_list();
			if (!t || !packs[t.pack]) throw { reason: "bank_target" };
			if (character.esize < 1) throw { reason: "no_space" };
			if (character.map !== packs[t.pack][0]) await go({ map: packs[t.pack][0] });
			if (!(await until(() => character.bank && character.bank[t.pack], 10_000))) throw { reason: "bank_not_loaded" }; // ≤10s
			const pack = character.bank[t.pack];
			const n = pack[t.bankNum]?.name === a.name ? t.bankNum : pack.findIndex((i) => i && i.name === a.name && (i.level || 0) === (a.level || 0));
			if (n < 0) throw { reason: "not_in_bank" };
			await wait_budget(1, RESERVE.errand);
			state.fetched[a.name] = Date.now(); // don't bank it straight back
			return T(bank_retrieve(t.pack, n));
		}
		case "supplies":
			if (a.unlock) throw { reason: "locked_potions_user_choice" };
			return buy_from_npc(a.name, a.quantity, a.npc || "fancypots");
		case "hunt": return run_hunt();
	}
	throw { reason: "unsupported" };
}
// One guide step: re-read, run the top actionable row; failures back off (low odds 30 min, else 5 min)
// A row we can do without walking anywhere from here: equips, retrieves from the bank floor we're standing on,
// and NPC steps a computer covers. Those don't count toward guide_steps_per_run, so a bank visit keeps going
// while the guide keeps asking for items from the bank (it reveals them one retrieve+equip at a time).
const bank_floors = () => new Set(Object.values(bank_packs_list()).map((p) => p[0]));
const on_bank_floor = () => bank_floors().has(character.map);
function row_is_local(row) {
	const a = row.action || {};
	if (row.kind === "equip") return true;
	if (row.kind === "retrieve") return bank_packs_list()[a.target?.pack]?.[0] === character.map;
	return has_computer() && ["buy", "upgrade", "develop", "compound", "craft", "exchange", "supplies"].includes(row.kind) && !G.craft[a.recipe]?.quest;
}
// Run one guide row (the given one, or the top actionable). On failure pause it: 30 min if the odds were too low
// (they change slowly), 5 min otherwise. Returns true if the row ran.
async function guide_step(row) {
	row = row || next_guide_row(guide_refresh());
	if (!row) return false;
	if (["buy", "upgrade", "compound", "stat", "craft"].includes(row.kind) && gold_room() <= 0) {
		skip(row.id, 1_800_000, "gold budget: party spending ≥ income");
		return false;
	}
	try {
		await run_row(row);
		await sleep_ms(500); // let the result's update arrive before the guide is re-read
		delete state.row_fails[row.id];
		return true;
	} catch (e) {
		// repeated failures back off: 5, 15, 45 min ... up to 6h (low odds: at least 30 min)
		const n = (state.row_fails[row.id] = (state.row_fails[row.id] || 0) + 1);
		const ms = Math.min(6 * 3600_000, 300_000 * Math.pow(3, n - 1));
		skip(row.id, e?.reason === "low_chance" ? Math.max(1_800_000, ms) : ms, why(e) + (e?.chance !== undefined ? ` ${(e.chance * 100).toFixed(0)}%` : "") + (e?.want ? ` ${e.want}` : "") + (n > 1 ? ` (failure #${n})` : ""));
		game_log(`guide: skip ${row.id} (${why(e)}${e?.chance !== undefined ? " " + (e.chance * 100).toFixed(0) + "%" : ""}${e?.want ? " " + e.want : ""})`, C.dim);
		return false;
	}
}
