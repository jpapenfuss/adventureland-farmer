// =====================================================================
// shared/09_craft.js — crafting for power, elixirs, exchange
// =====================================================================
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
