// =====================================================================
// merchant/1_serve.js — merchant only (src/manifest.json): supply runs: potions, tokens and gear to the fighters, mluck, fetching what they are owed, funds
// =====================================================================
// The fighter most in need of a visit: fewest free slots, then fewest potions
// We hold something that completes a fighter's missing must-hold item: the item itself, or its tokens
const can_supply_hold = (p) => (p.need || []).some((n) => held_any(n) > 0 || (hold_price(n) && held_any(CFG.hold[n]) > 0));
// Gear in the merchant's bags that's an upgrade for a fighter (bought at Ponty, fetched from the bank): deliver it
// (share_gear hands it over once near); one trip per piece per 20 min (v18.6)
const gear_trip_at = {};
// Merchant: the pieces in its bags that are an upgrade for a fighter, and for whom ({ to, name, level, gain }) — not
// project copies, compound sets or stand stock. Sent in its heartbeat (v24.75): the party comes to town for them.
function gear_to_give() {
	if (!is_merchant() || !CFG.gear_auto) return [];
	const needed = needed_slots(), cmp = compound_slots(needed), st = stand_hold(), out = [];
	character.items.forEach((it, k) => {
		if (!it || it.l || it.b || !GEAR.has(G.items[it.name]?.type) || needed.has(k) || cmp.has(k) || st.has(k) || out.length >= 6) return;
		const to = best_fighter_for(it);
		if (to) out.push({ to: to.name, name: it.name, level: it.level || 0, gain: Math.round(to.gain) });
	});
	return out;
}
function gear_target() {
	if (!is_merchant() || !CFG.gear_auto || CFG.merchant.collect) return null; // v24.75: the party comes for it (collect mode)
	// (v25.43: not compound-set copies or stand stock either, as the collect list — Fable: a ring set held to compound)
	const needed = needed_slots(), cmp = compound_slots(needed), st = stand_hold(), now = Date.now();
	for (const it of character.items) {
		if (!it || it.l || it.b || !GEAR.has(G.items[it.name]?.type)) continue;
		const key = `${it.name}:${it.level || 0}`, k = character.items.indexOf(it);
		if (now - (gear_trip_at[key] || 0) < 1_200_000 || needed.has(k) || cmp.has(k) || st.has(k)) continue;
		const to = best_fighter_for(it); // v24.7: the fighter it helps most (was: the first in config order with any gain)
		if (to && merchant_reach_ok(to.p)) return to.p; // serve() marks the pieces it carries (v25.43: a safe way there, else the party comes)
	}
	return null;
}
// v25.48 (owner: the lattes weren't handed over): a fighter holding none of merchant.elixir_supply is a trip of its
// own — give_elixir only rode on trips for potions or gear, and none went out (1 merchant trip in 6h)
let elixir_trip_at = 0;
function elixir_target() {
	const E = CFG.merchant.elixir_supply;
	// (v25.49, Fable: an unlocked stack — give_elixir sends only from one; a locked one walked out every 10 min for nothing)
	if (!E || !is_merchant() || !character.items.some((i) => i && i.name === E.name && !i.l) || Date.now() - elixir_trip_at < 600_000) return null;
	return partners().find((p) => p.ctype !== "merchant" && p.elx === 0 && merchant_reach_ok(p)) || null;
}
// v25.53 (5:26 AM report: the merchant at 425k, a project "waiting for 1.1M gold" and compounds paused on a 6k
// scroll, while the fighters held 1.0-1.2M each): fighters hand over their gold above fund_keep only with us within
// 300 px (merchant_handoff, dump_gold), and they hadn't been to town for 94 min — so we go to them. When we're short
// (a funds wait, or under upgrade_keep + gold_trip_min) and a fighter we can reach has gold_trip_min above fund_keep:
// a trip to the richest, at most one per gold_trip_ms.
let gold_trip_at = 0, gold_trip_fails = 0;
function gold_target() {
	const M = CFG.merchant, min = M.gold_trip_min || 0;
	// (v25.54, Fable: a trip that brought nothing doubles the gap, up to 4h; one that brought gold resets it)
	const gap = Math.min(4 * 3600_000, (M.gold_trip_ms || 900_000) * Math.pow(2, gold_trip_fails));
	if (!is_merchant() || !min || Date.now() - gold_trip_at < gap) return null;
	if (!(state.fund_need > 0 || character.gold < upgrade_keep() + min)) return null;
	const spare = (p) => (p.gold || 0) - M.fund_keep;
	return partners().filter((p) => p.ctype !== "merchant" && spare(p) >= min && merchant_reach_ok(p)).sort((a, b) => spare(b) - spare(a))[0] || null;
}
// Tokens the merchant holds go to the fighter with the fewest (merchant never spends them); one delivery per 30 min
let token_trip_at = 0;
const token_target = () => (is_merchant() && held_any("monstertoken") > 0 && Date.now() - token_trip_at > 1_800_000 ?
	partners().filter((p) => fresh(p) && p.ctype !== "merchant" && !p.rip).sort((a, b) => (a.tokens || 0) - (b.tokens || 0))[0] : null) || null;
// Bag slot of a potion of this kind, preferring the configured tier, never the last self_pots
function pot_slot(kind) {
	let best = -1;
	character.items.forEach((it, k) => {
		const d = it && G.items[it.name];
		if (!d || d.type !== "pot" || !(d.gives || []).some(([g, v]) => g === kind && v > 0)) return;
		if (best < 0 || it.name === CFG[kind + "_pot"]) best = k;
	});
	return best;
}
// v25.44 (owner): a fighter holding none of the supply elixir gets merchant.elixir_supply.give of it (the owner's stock: no bill)
async function give_elixir(f) {
	const E = CFG.merchant.elixir_supply, k = E ? character.items.findIndex((i) => i && i.name === E.name && !i.l) : -1;
	if (!E || f.elx !== 0 || k < 0) return;
	const q = Math.min(E.give || 1, character.items[k].q || 1);
	await wait_budget(1, RESERVE.errand);
	await T(send_item(f.name, k, q)).then(() => { f.elx = q; game_log(`merchant: ${q} ${E.name} → ${f.name}`, C.ok); log_ev("give", { to: f.name, item: E.name, q }); })
		.catch((e) => game_log(`merchant: ${E.name} to ${f.name}: ${why(e)}`, C.dim));
}
async function give_pots(f) {
	for (const kind of ["hp", "mp"]) {
		const want = CFG.pot_buy - (f.pots?.[kind] ?? CFG.pot_buy);
		const spare = pot_count(kind) - CFG.merchant.self_pots;
		const k = pot_slot(kind);
		if (want < 20 || spare <= 0 || k < 0) continue;
		const q = Math.min(want, spare, character.items[k].q || 1), name = character.items[k].name, price = G.items[name]?.g || 0;
		await wait_budget(1, RESERVE.errand);
		await T(send_item(f.name, k, q)).then(() => {
			game_log(`merchant: ${q} ${name} → ${f.name}`, C.ok);
			// v23.0: the fighter pays for what it gets. The merchant used to buy every fighter's potions with its own
			// gold, and nothing refilled it once the fighters were under 3M, so it ran dry and stopped supplying. A bill
			// by cm; the fighter pays it from gold above its reserve the next time it's near us (merchant_handoff).
			if (price > 0 && typeof send_cm === "function") Promise.resolve(send_cm([f.name], { k: "bill", g: q * price, what: `${q} ${name}` })).catch(() => {});
		}).catch((e) => game_log(`merchant: potions to ${f.name}: ${why(e)}`, C.dim));
		if (f.pots) f.pots[kind] += q;
	}
}
// Tokens the merchant holds (fighters used to hand them over as loot) go to fighters still missing a must-hold item
// bought with them: the one closest to affording it first, just enough to complete it, the rest to the next
async function give_tokens() {
	// fighters first: our own copy of a must-hold item goes to a near fighter that lacks it (we're re-supplied later,
	// once every fighter has one)
	for (const n of Object.keys(CFG.hold || {})) {
		const f = partners_near(350).find((x) => Array.isArray(x.need) && x.need.includes(n));
		const k = character.items.findIndex((i) => i && i.name === n && !i.l);
		if (!f || k < 0) continue;
		await wait_budget(1, RESERVE.errand);
		await T(send_item(f.name, k, 1)).then(() => { f.need = f.need.filter((x) => x !== n); game_log(`merchant: gave our ${n} to ${f.name} (fighters first)`, C.ok); log_ev("give", { to: f.name, item: n }); })
			.catch((e) => game_log(`merchant: ${n} to ${f.name}: ${why(e)}`, C.dim));
	}
	for (const n of Object.keys(CFG.hold || {})) {
		const cur = CFG.hold[n], price = hold_price(n);
		if (!price) continue;
		const lacking = partners_near(350).filter((f) => Array.isArray(f.need) && f.need.includes(n)).sort((a, b) => (b.tokens || 0) - (a.tokens || 0));
		for (const f of lacking) {
			const have = held_any(cur), k = character.items.findIndex((i) => i && i.name === cur && !i.l);
			if (have <= 0 || k < 0) return;
			const q = Math.min(have, character.items[k].q || 1, Math.max(1, price - (f.tokens || 0)));
			await wait_budget(1, RESERVE.errand);
			await T(send_item(f.name, k, q)).then(() => { f.tokens = (f.tokens || 0) + q; game_log(`merchant: ${q} ${cur} → ${f.name} (for its ${n})`, C.ok); log_ev("give", { to: f.name, item: cur, q }); })
				.catch((e) => game_log(`merchant: tokens to ${f.name}: ${why(e)}`, C.dim));
		}
	}
	// the rest: the merchant never spends tokens; the near fighter holding the fewest gets them (it spends them on gear)
	for (const cur of new Set(["monstertoken", ...Object.values(CFG.hold || {})])) {
		const k = character.items.findIndex((i) => i && i.name === cur && !i.l);
		const f = partners_near(350).filter((x) => x.ctype !== "merchant").sort((a, b) => (a.tokens || 0) - (b.tokens || 0))[0];
		if (k < 0 || !f) continue;
		const q = character.items[k].q || 1;
		await wait_budget(1, RESERVE.errand);
		await T(send_item(f.name, k, q)).then(() => { f.tokens = (f.tokens || 0) + q; game_log(`merchant: ${q} ${cur} → ${f.name} (merchant doesn't spend tokens)`, C.ok); log_ev("give", { to: f.name, item: cur, q }); })
			.catch((e) => game_log(`merchant: tokens to ${f.name}: ${why(e)}`, C.dim));
	}
}
function mluck_near() {
	if (!G.skills.mluck || !can_use("mluck")) return;
	const ents = [character, ...others().map((n) => parent.entities?.[n])];
	const e = ents.find((x) => x && !x.rip && (x === character || (valid(x) && distance(character, x) < CFG.merchant.mluck_range)) &&
		!(x.s?.mluck && x.s.mluck.f === character.name && x.s.mluck.ms > 600_000)); // ours, with > 10 min left: fine
	if (e) fire("mluck", e);
}
// One service trip: stock potions, walk to the fighter (it moves: re-aim up to 4 times), hand potions to every fighter
// near, then wait for their items
async function serve(f) {
	await stand_close();
	const serve_t0 = Date.now();
	// v25.43: a walk for our project's worn piece (worn_target): its 10-min slot starts now, and we wait by the fighter
	// for a lull (it hands over only with nothing on the party) — up to worn_wait_ms
	const Wn = state.upg?.worn, for_worn = !!Wn && !Wn.got && Wn.who === f.name;
	if (for_worn) worn_trip_at = Date.now();
	if (f.elx === 0) elixir_trip_at = Date.now(); // v25.48: elixir_target's 10-min slot
	const for_gold = gold_target()?.name === f.name;
	let gold0 = character.gold;
	if (for_gold) gold_trip_at = Date.now(); // v25.53: gold_target's slot
	state.serving = f.name;
	// v24.7: only the pieces for this fighter (marking every piece paused deliveries to everyone else for 20 min)
	for (const it of character.items) if (it && GEAR.has(G.items[it.name]?.type) && best_fighter_for(it)?.name === f.name) gear_trip_at[`${it.name}:${it.level || 0}`] = Date.now();
	try {
		const M = CFG.merchant;
		// v24.12: enough for every fighter's shortfall to pot_buy (they're together: one trip tops all of them up)
		const short = (k) => partners().reduce((t, p) => t + Math.max(0, CFG.pot_buy - (p.pots?.[k] ?? CFG.pot_buy)), 0);
		const carry = Math.min(M.pot_carry, Math.max(short("hp"), short("mp"), 100)) + M.self_pots;
		await task_restock(carry, carry).catch((e) => game_log(`merchant: potions: ${why(e)}`, C.dim));
		gold0 = character.gold; // (v25.54, Fable: measured after the restock — only what the fighters send counts)
		for (let i = 0; i < 4; i++) {
			if (state.errand) state.errand_at = Date.now(); // each re-aimed walk is progress
			const q = state.partners[f.name];
			if (!fresh(q) || q.rip || q.errand === "town") return;
			const pos = partner_pos(q);
			if (pos.map === character.map && Math.hypot(pos.x - character.x, pos.y - character.y) < 150) break;
			await go({ map: pos.map, x: pos.x, y: pos.y });
		}
		for (const p of partners_near(350)) { await give_pots(p); await give_elixir(p); }
		await give_tokens();
		token_trip_at = Date.now();
		const end = Date.now() + M.wait_ms, end_w = Date.now() + (M.worn_wait_ms || 120_000);
		while ((Date.now() < end || (for_worn && Date.now() < end_w && !state.upg?.worn?.got && best_level_held(state.upg?.name) < (state.upg?.worn?.level ?? 0))) && character.esize > 2 && !character.rip) {
			if (state.errand) state.errand_at = Date.now();
			mluck_near();
			const q = state.partners[f.name], pos = q && partner_pos(q);
			if (pos && pos.map === character.map && Math.hypot(pos.x - character.x, pos.y - character.y) > 200) move_to_as("serve", pos.x, pos.y, 500);
			await sleep_ms(1000);
		}
		game_log(`merchant: served ${f.name} (${character.esize} slots free)`, C.dim);
		log_ev("serve", { who: f.name, secs: Math.round((Date.now() - serve_t0) / 1000), free: character.esize });
	} finally {
		state.serving = null;
		// v25.54: a gold trip that brought less than half of gold_trip_min counts as fruitless (back-off in gold_target) —
		// in finally, so an aborted one (a failed walk) counts too
		if (for_gold) gold_trip_fails = character.gold - gold0 >= (CFG.merchant.gold_trip_min || 0) / 2 ? 0 : gold_trip_fails + 1;
	}
}
// ---- bag_plan's merchant parts (v25.0): bank fetches only the merchant makes, added to `fetch` in bag_plan's order ----
// a must-hold item a fighter lacks (the merchant hands it over)
function merchant_fetch_give(fetch) {
	for (const n of Object.keys(CFG.hold || {})) {
		const cur = CFG.hold[n];
		if (partners().some((f) => (f.need || []).includes(n)) && (state.bank_seen[cur] || 0) > 0 && held_any(cur) === 0 &&
			Date.now() - (state.fetch_try["give:" + cur] || 0) > 1_800_000) fetch.push({ name: cur, key: "give:" + cur });
	}
}
// stock for the stand
function merchant_fetch_stand(fetch) {
	if (CFG.merchant.stand?.enabled) {
		const free = TRADE_SLOTS.length - Object.keys(state.stand).length - stand_hold().size, nd = new Set(), cm = new Set();
		for (const it of (state.bank_gear || []).filter((i) => stand_worthy(i, -1, nd, cm)).slice(0, Math.max(0, Math.min(free, character.esize - 6))))
			fetch.push({ name: it.name, level: it.level, key: `stand:${it.name}:${it.level}` });
	}
}
// copies to sell: the sell_plain list, dead compound pieces
function merchant_fetch_sale(fetch) {
	// v24.74: plain copies on the sell_plain list come out of the bank to be sold (the merchant; as many as fit)
	for (const name of CFG.sell_plain || []) {
		const n = Math.min((state.bank_gear || []).filter((i) => i.name === name && !(i.level > 0) && !i.p).length, Math.max(0, character.esize - 8));
		for (let i = 0; i < n; i++) if (Date.now() - (state.fetch_try[`sellp:${name}:${i}`] || 0) > 600_000) fetch.push({ name, level: 0, exact: true, key: `sellp:${name}:${i}` });
	}
	// v24.15: dead compound pieces in the bank come out to be sold (they'd sit there until a purge)
	if (CFG.sell_junk && CFG.merchant.sell_dead_compounds) {
		let room = Math.max(0, character.esize - 8);
		for (const it of state.bank_gear || []) {
			if (room <= 0) break;
			const key = `dead:${it.name}:${it.level || 0}`;
			if (!dead_compound(it) || Date.now() - (state.fetch_try[key] || 0) < 600_000) continue;
			fetch.push({ name: it.name, level: it.level || 0, key }); room--;
		}
	}
}
// ---- project funding (v25.5): the merchant's projects are paid by the fighters (merchant.fund_keep) ----
// waiting for gold asked for earlier
function merchant_awaits_funds() {
	// v25.47: not past 10 min, nor with no fighter able to send any: the wait was for 3x the step (or a weapon's
	// remainder) and held every upgrade until all of it came, even with the next step already paid for
	// v25.48: and not once the step itself is paid for (state.fund_step): the ask is for up to 3 steps
	return state.fund_need > 0 && !upg_gold_ok(state.fund_need) && !upg_gold_ok(state.fund_step || 0) && fund_pool() > 0 && Date.now() - (state.fund_at || 0) < 600_000;
}
// the next step (P: an upgrade project; null: a craft costing `step`) is beyond our gold: ask the fighters. true = asked
function merchant_asks_funds(P, step) {
	if (upg_gold_ok(step)) return false; // v25.46: against upgrade_keep()
	// v25.47: merchant_awaits_funds times out from here. v25.48: stamped when a wait starts, not on every ask (a craft's
	// ask kept an upgrade's wait open), so a wait really ends after 10 min
	if (!merchant_awaits_funds()) state.fund_at = Date.now();
	state.fund_step = step;
	if (!P) { state.fund_need = step; return true; }
	state.fund_need = P.weapon ? Math.max(step * 3, (P.cost || 0) - (P.spent || 0)) : Math.min(P.cost, step * 3); // v24.86: a weapon asks for what's left
	game_log(`upgrade ${P.name}: waiting for ${fmt_k(state.fund_need)} gold from the fighters`, C.dim);
	return true;
}
// ---- share_gear (v25.6): the merchant hands a piece only to the fighter it helps most (v24.7) ----
function merchant_gives_to(it, name) { return best_fighter_for(it)?.name === name; }
// ---- from the shared code (v24.95–v25.6): used by the merchant only ----
// The online fighter a piece helps most: { name, ctype, g, p, gain } or null
function best_fighter_for(it) {
	let best = null;
	for (const m of gear_takers().slice(1)) {
		if (m.ctype === "merchant" || !fresh(m.p) || m.p.rip) continue;
		const r = gear_gain(it, m.ctype, m.g);
		if (r && (!best || r.gain > best.gain)) best = { ...m, gain: r.gain };
	}
	return best;
}
