// =====================================================================
// merchant.js — loaded by the merchant only (after common.js, before main.js). What only the merchant does: supply
// runs, the stand and Merrit's parcels, Ponty, bank housekeeping, donations. Defaults for the fighters are in
// common.js ("Role hooks").
// =====================================================================
function merchant_beat() {
	if (!is_merchant() || typeof send_cm !== "function") return;
	if (state.fund_need > 0 && character.gold - CFG.merchant.donate.keep >= state.fund_need && !state.upg) state.fund_need = 0;
	const msg = { k: "mhb", v: VERSION, b: BUILD, worn: CFG.gear_auto ? worn_items() : null, ledger: my_ledger(), bag_gear: bag_gear_names(), bag_lv: bag_gear_levels(), gear: CFG.gear_auto ? my_gear() : null, level: character.level, map: character.map, x: Math.round(character.x), y: Math.round(character.y),
		esize: character.esize, gold: character.gold, serving: state.serving || null, rip: !!character.rip, need: hold_missing(),
		fund: state.fund_need && character.gold - CFG.merchant.donate.keep < state.fund_need ? state.fund_need : 0,
		give: CFG.merchant.collect ? gear_to_give() : null };
	Promise.resolve(send_cm(CFG.party.members || [], msg)).catch(() => {});
}
setInterval(() => { if (spent() < BUDGET.soft - RESERVE.chat) merchant_beat(); }, CFG.party.beat_ms);
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
	if (!is_merchant() || !CFG.gear_auto || CFG.merchant.collect) return null; // v24.75: the party comes for it
	const needed = needed_slots(), now = Date.now();
	for (const it of character.items) {
		if (!it || it.l || it.b || !GEAR.has(G.items[it.name]?.type)) continue;
		const key = `${it.name}:${it.level || 0}`;
		if (now - (gear_trip_at[key] || 0) < 1_200_000 || needed.has(character.items.indexOf(it))) continue;
		const to = best_fighter_for(it); // v24.7: the fighter it helps most (was: the first in config order with any gain)
		if (to) return to.p; // serve() marks the pieces it carries
	}
	return null;
}
// Tokens the merchant holds go to the fighter with the fewest (merchant never spends them); one delivery per 30 min
let token_trip_at = 0;
const token_target = () => (is_merchant() && held_any("monstertoken") > 0 && Date.now() - token_trip_at > 1_800_000 ?
	partners().filter((p) => fresh(p) && p.ctype !== "merchant" && !p.rip).sort((a, b) => (a.tokens || 0) - (b.tokens || 0))[0] : null) || null;
function merchant_job() {
	const M = CFG.merchant;
	const need = (p) => (p.esize ?? 99) < M.serve_free || (p.pots && (p.pots.hp < M.serve_pots || p.pots.mp < M.serve_pots));
	const urgent = partners().filter(need).sort((a, b) => (a.esize ?? 99) - (b.esize ?? 99) ||
		Math.min(a.pots?.hp ?? 999, a.pots?.mp ?? 999) - Math.min(b.pots?.hp ?? 999, b.pots?.mp ?? 999))[0];
	// otherwise a delivery: a Tracktrix (or its tokens) we hold for a fighter that lacks one
	return urgent || (is_merchant() ? partners().find(can_supply_hold) : null) || token_target() || gear_target();
}
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
	state.serving = f.name;
	// v24.7: only the pieces for this fighter (marking every piece paused deliveries to everyone else for 20 min)
	for (const it of character.items) if (it && GEAR.has(G.items[it.name]?.type) && best_fighter_for(it)?.name === f.name) gear_trip_at[`${it.name}:${it.level || 0}`] = Date.now();
	try {
		const M = CFG.merchant;
		// v24.12: enough for every fighter's shortfall to pot_buy (they're together: one trip tops all of them up)
		const short = (k) => partners().reduce((t, p) => t + Math.max(0, CFG.pot_buy - (p.pots?.[k] ?? CFG.pot_buy)), 0);
		const carry = Math.min(M.pot_carry, Math.max(short("hp"), short("mp"), 100)) + M.self_pots;
		await task_restock(carry, carry).catch((e) => game_log(`merchant: potions: ${why(e)}`, C.dim));
		for (let i = 0; i < 4; i++) {
			if (state.errand) state.errand_at = Date.now(); // each re-aimed walk is progress
			const q = state.partners[f.name];
			if (!fresh(q) || q.rip || q.errand === "town") return;
			const pos = partner_pos(q);
			if (pos.map === character.map && Math.hypot(pos.x - character.x, pos.y - character.y) < 150) break;
			await go({ map: pos.map, x: pos.x, y: pos.y });
		}
		for (const p of partners_near(350)) await give_pots(p);
		await give_tokens();
		token_trip_at = Date.now();
		const end = Date.now() + M.wait_ms;
		while (Date.now() < end && character.esize > 2 && !character.rip) {
			if (state.errand) state.errand_at = Date.now();
			mluck_near();
			const q = state.partners[f.name], pos = q && partner_pos(q);
			if (pos && pos.map === character.map && Math.hypot(pos.x - character.x, pos.y - character.y) > 200) move_to_as("serve", pos.x, pos.y, 500);
			await sleep_ms(1000);
		}
		game_log(`merchant: served ${f.name} (${character.esize} slots free)`, C.dim);
		log_ev("serve", { who: f.name, secs: Math.round((Date.now() - serve_t0) / 1000), free: character.esize });
	} finally { state.serving = null; }
}
// ---- Secondhands (Ponty) ----
const shop_price = (it) => {
	const f = typeof calculate_item_value === "function" ? calculate_item_value : parent?.calculate_item_value;
	const v = f ? f(it) : (G.items[it.name]?.g || 0) * 0.6;
	return Math.ceil(v * (G.items[it.name]?.cash ? 3 : 2) * (it.q || 1));
};
// Worth buying: an upgrade for a fighter, or the last copy a compound set (bags + bank) is missing
function secondhand_reason(it, groups) {
	if (!it || !G.items[it.name]) return null;
	const price = shop_price(it);
	for (const x of gear_takers().slice(1).filter((x) => x.ctype !== "merchant")) {
		// someone already has one at this level or better: deliver that instead (v24.7: any copy of the name used to block it)
		const lv = it.level || 0;
		if (best_level_held(it.name) >= lv || (state.bank_gear || []).some((b) => b.name === it.name && (b.level || 0) >= lv) || party_holds_level(it.name, lv)) break;
		const r = gear_gain(it, x.ctype, x.g);
		if (r && price <= r.gain * CFG.secondhand_gold_per_pt) return `upgrade for ${x.name} (+${Math.round(r.gain)} pts)`;
	}
	const g = G.items[it.name].compound && (it.level || 0) < CFG.compound_max_level &&
		groups[compound_key(it.name, it.level || 0)];
	// v24.15: only when the result would be worn — compounding for its own sake roughly breaks even at an NPC, and a Ponty
	// copy costs twice its value; the merchant's twelve unwanted Amulet of HP +2 were built partly this way
	const up = g && gear_takers().slice(1).filter((x) => x.ctype !== "merchant").some((x) => gear_gain({ name: it.name, level: (it.level || 0) + 1 }, x.ctype, x.g));
	if (g && up && (g.bags + g.bank) % 3 === 2) return "completes a compound set";
	return null;
}
// v24.81: the server's base compound odds by the item's starting grade (design/upgrades.py), result level 1..4
const CMP_ODDS = { 0: [0.99, 0.75, 0.40, 0.25], 1: [0.90, 0.70, 0.40, 0.20], 2: [0.80, 0.60, 0.32, 0.16] };
const cmp_odds = (name, to) => (CMP_ODDS[Math.min(2, Math.max(0, item_grade({ name, level: 0 })))] || CMP_ODDS[0])[to - 1] || 0;
// Routes through Ponty's stock: for a compound item, the copies to buy there so that — with ours (bags + bank) — three
// make a +1 or a +2 a fighter would wear. A +1 for the last step comes from ours, from Ponty, or from three +0s (ours
// first, then Ponty's cheapest). Only steps at or over compound_min_chance; cost = Ponty prices + scrolls.
// → [{ name, to, for, gain, cost, chance, buy: [list entries], text }], best points per gold first
function ponty_routes(list, groups) {
	if (!CFG.ponty_routes || !CFG.compound_auto) return [];
	const takers = gear_takers().slice(1).filter((x) => x.ctype !== "merchant"), sc = G.items.cscroll0?.g || 6400, out = [];
	const names = [...new Set(list.filter((it) => G.items[it.name]?.compound).map((it) => it.name))];
	for (const name of names) {
		const have = (L) => { const g = groups[compound_key(name, L)]; return g ? g.bags + g.bank : 0; };
		const shop = (L) => list.filter((it) => it.name === name && (it.level || 0) === L).map((it) => ({ it, price: shop_price(it) })).sort((a, b) => a.price - b.price);
		for (const to of [1, 2, 3]) { // (v24.87: +3 too, at compound_min_chance_wanted — the result is one a fighter would wear)
			if (to > CFG.compound_max_level || cmp_odds(name, to) < Math.min(CFG.compound_min_chance, CFG.compound_min_chance_wanted) || to > cmp_top(name)) continue;
			let best = null;
			for (const m of takers) { const r = gear_gain({ name, level: to }, m.ctype, m.g); if (r && (!best || r.gain > best.gain)) best = { gain: r.gain, who: m.name }; }
			if (!best) continue;
			// units of level to-1: ours, Ponty's, and (for to = 2) ones made from three +0s
			const need = 3 - have(to - 1);
			if (need <= 0) continue; // we hold the set already: the compound task does it
			const units = shop(to - 1).map((x) => ({ cost: x.price, buy: [x.it], chance: 1 }));
			if (to >= 2 && cmp_odds(name, to - 1) >= CFG.compound_min_chance) { // (a +1 from three +0s; a +2 from three +1s)
				let own0 = have(to - 2); const p0 = shop(to - 2);
				while (own0 + p0.length >= 3) {
					const from_own = Math.min(3, own0), buy = p0.splice(0, 3 - from_own);
					own0 -= from_own;
					units.push({ cost: buy.reduce((a, x) => a + x.price, 0) + sc, buy: buy.map((x) => x.it), chance: cmp_odds(name, to - 1) });
				}
			}
			units.sort((a, b) => a.cost - b.cost);
			if (units.length < need) continue;
			const use = units.slice(0, need), buy = use.flatMap((u) => u.buy);
			if (!buy.length) continue; // all from our own +0s: nothing to buy (the compound task gets there)
			const cost = use.reduce((a, u) => a + u.cost, 0) + sc, chance = use.reduce((a, u) => a * u.chance, 1) * cmp_odds(name, to);
			if (buy.some((it) => shop_price(it) > CFG.secondhand_max_price) || cost > best.gain * CFG.secondhand_gold_per_pt * chance) continue;
			out.push({ name, to, for: best.who, gain: Math.round(best.gain), cost, chance: +chance.toFixed(2), buy,
				text: `${name}+${to} for ${best.who} (+${Math.round(best.gain)} pts): buy ${buy.map((it) => `+${it.level || 0}`).join(" ")} for ${fmt_k(buy.reduce((a, it) => a + shop_price(it), 0))}, ${Math.round(chance * 100)}% to come out` });
		}
	}
	return out.sort((a, b) => b.gain * b.chance / b.cost - a.gain * a.chance / a.cost);
}
// Everything Ponty has (v24.83): "name+level:title" → [count, price of one] — every entry, sorted by name
function ponty_dump(list) {
	const d = {};
	for (const it of list || []) {
		if (!it?.name) continue;
		const k = it.name + (it.level ? "+" + it.level : "") + (it.p ? ":" + it.p : "") + (it.stat_type ? ":" + it.stat_type : "");
		const q = it.q || 1, e = d[k] || (d[k] = [0, 0]);
		e[0] += q; e[1] = Math.round(shop_price(it) / q);
		if (G.items[it.name]?.s) { e[2] = (e[2] || 0) + 1; e[3] = Math.min(e[3] ?? Infinity, q); } // stackables: listings, smallest
	}
	return Object.fromEntries(Object.entries(d).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}
let secondhand_at = 0;
async function task_secondhands() {
	const ref = G.maps.main?.ref?.secondhands;
	if (!ref) return 0;
	await stand_close();
	if (character.map !== "main" || Math.hypot(character.x - ref.x, character.y - ref.y) > 400) await go({ map: "main", x: ref.x, y: ref.y + 40 });
	parent.socket.emit("secondhands");
	await sleep_ms(1500); // the list arrives as a "secondhands" event; the client keeps it in parent.secondhands
	const list = [...(parent.secondhands || [])];
	// compound counts by name:level across bags + bank (spares only), to spot sets one copy short
	const groups = {}, needed = needed_slots();
	const count = (it, where) => { const k = compound_key(it.name, it.level || 0); (groups[k] = groups[k] || { bags: 0, bank: 0 })[where]++; };
	character.items.forEach((it, k) => { if (compound_spare(it, k, needed)) count(it, "bags"); });
	for (const it of state.bank_gear || []) if (compound_spare(it, -1, needed)) count(it, "bank");
	// v24.81: what Ponty had (report: "ponty JSON") and the compound routes through it; one route per name is bought
	const groups2 = Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, { ...g }]));
	const routes = ponty_routes(list, groups2), route_of = new Map();
	for (const r of routes) if (!routes.some((q) => q !== r && q.name === r.name && routes.indexOf(q) < routes.indexOf(r))) for (const it of r.buy) route_of.set(it, r);
	state.ponty = { at: Date.now(), items: ponty_dump(list), routes: routes.slice(0, 5).map((r) => r.text) };
	let n = 0;
	// v24.89: quest materials the fighters are short of
	if (CFG.ponty_materials && is_merchant()) {
		const short = {};
		for (const p of partners()) for (const [nm, q] of Object.entries(p.qshort || {})) short[nm] = (short[nm] || 0) + q;
		for (const nm in short) {
			let need = short[nm] - (state.bank_seen[nm] || 0) - held_any(nm);
			const offers = list.filter((it) => it.name === nm).sort((a, b) => (a.q || 1) - (b.q || 1));
			for (const it of offers) {
				if (need <= 0) break;
				const price = shop_price(it);
				if (price > CFG.ponty_material_max || character.gold - price < CFG.merchant.donate.keep || character.esize < 3) continue;
				await wait_budget(1, RESERVE.errand);
				const before = held_any(nm);
				tag_spend("ponty");
				parent.socket.emit("sbuy", { rid: it.rid });
				await until(() => held_any(nm) > before, 3000);
				if (held_any(nm) > before) {
					n++; need -= it.q || 1;
					game_log(`secondhands: bought ${it.q || 1} ${nm} for ${fmt_k(price)} (quest material the fighters are short of)`, C.ok);
					log_ev("buy", { item: `${nm}x${it.q || 1}`, src: "secondhands", price });
				}
			}
		}
	}
	for (const it of list) {
		if (state.errand) state.errand_at = Date.now();
		const rt = route_of.get(it);
		const why_buy = secondhand_reason(it, groups) || (rt ? `route to ${rt.name}+${rt.to} for ${rt.for}` : null), price = shop_price(it);
		if (!why_buy || price > CFG.secondhand_max_price || character.gold - price < CFG.gold_reserve || character.esize < 3 || !gold_ok(price)) continue;
		await wait_budget(1, RESERVE.errand);
		const before = character.esize;
		tag_spend("ponty");
		parent.socket.emit("sbuy", { rid: it.rid });
		await until(() => character.esize < before, 3000);
		if (character.esize < before) {
			n++;
			game_log(`secondhands: bought ${it.name}+${it.level || 0} for ${fmt_k(price)} (${why_buy})`, C.ok);
			log_ev("buy", { item: `${it.name}+${it.level || 0}`, src: "secondhands", price });
			if (why_buy.startsWith("completes")) count(it, "bags");
		}
	}
	try { if (typeof parent.hide_modal === "function") parent.hide_modal(); } catch (e) {} // the list opens Ponty's window: close it
	return n;
}
// ---- Bank housekeeping (merchant) ----
let recipe_inputs = null; // every item any crafting recipe uses (anyone's quests): never purged
function purge_ok(it) {
	const d = it && G.items[it.name];
	if (!recipe_inputs) { recipe_inputs = new Set(); for (const id in G.craft || {}) for (const [, n] of G.craft[id].items || []) recipe_inputs.add(n); }
	if (!d || it.l || it.b || d.e || !tradeable(it.name) || CFG.keep.includes(it.name) || state.needs.has(it.name) ||
		recipe_inputs.has(it.name) || gear_wanted_by(it)) return false;
	if (d.compound && compound_groups().some((g) => g.name === it.name && g.level === (it.level || 0))) return false;
	return true;
}
// In the bank with it nearly full: pull the least valuable purgeable items (this floor's packs)
async function bank_purge() {
	if (!CFG.sell_junk) return 0;
	const M = CFG.merchant, bf = state.bank_free;
	if (!bf || bf.free >= bf.total * M.purge_below || character.esize < M.purge_n + 4) return 0;
	const packs = bank_packs_list(), cands = [];
	for (const p in character.bank) {
		if (!p.startsWith("items") || (packs[p] && packs[p][0] !== character.map)) continue;
		(character.bank[p] || []).forEach((it, n) => { if (it && purge_ok(it)) cands.push({ p, n, it, v: unit_value(it) * (it.q || 1) }); });
	}
	cands.sort((a, b) => a.v - b.v);
	let got = 0;
	for (const c of cands.slice(0, M.purge_n)) {
		await wait_budget(1, RESERVE.bulk);
		await T(bank_retrieve(c.p, c.n)).then(() => { got++; state.purge[purge_key(c.it)] = Date.now(); }).catch(() => {});
		await sleep_ms(PACE_MS);
	}
	if (got) { game_log(`bank: ${bf.free}/${bf.total} free — pulled ${got} low-value items to sell/list`, C.info); log_ev("purge", { n: got, free: bf.free, total: bf.total }); }
	return got;
}
// Fixed NPCs on Mainland (roamers — citizens, ones with a boundary or a loop — don't count)
function fixed_npcs() {
	const out = [];
	for (const n of G.maps.main?.npcs || []) {
		if (/^citizen/.test(n.id || "") || n.boundary || n.loop) continue;
		if (Array.isArray(n.position)) out.push(n.position);
		for (const p of n.positions || []) if (Array.isArray(p)) out.push(p);
	}
	return out;
}
// Can a stand stand here? Region, NPC and stand spacing, and walkable straight from (0,0) (Merrit's centre)
function spot_ok(x, y) {
	const M = CFG.merchant.merrit;
	if (!in_rect(x, y, M.square) && !in_rect(x, y, M.aisle)) return false;
	if (fixed_npcs().some(([nx, ny]) => Math.hypot(nx - x, ny - y) <= M.npc_gap)) return false;
	for (const e of Object.values(parent.entities || {})) {
		if (!e || e.type !== "character" || !e.stand || e.name === character.name || e.map && e.map !== "main") continue;
		const dx = Math.abs(e.x - x), dy = Math.abs(e.y - y);
		if (Math.hypot(dx, dy) <= M.stand_gap || (dx <= M.stand_gap && dy <= M.stand_vgap)) return false;
	}
	if (typeof can_move === "function") {
		try { if (!can_move({ map: "main", x: 0, y: 0, going_x: x, going_y: y, base: character.base || { h: 8, v: 7, vn: 2 } })) return false; } catch (e) {}
	}
	return true;
}
// Our spot: the saved one while it still qualifies, else the qualifying grid point nearest (0,0)
function merrit_spot() {
	const M = CFG.merchant.merrit;
	if (state.mspot && spot_ok(state.mspot.x, state.mspot.y)) return state.mspot;
	const pts = [];
	for (const r of [M.square, M.aisle]) for (let x = r[0]; x <= r[2]; x += M.step) for (let y = r[1]; y <= r[3]; y += M.step) pts.push([x, y]);
	pts.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
	const p = pts.find(([x, y]) => spot_ok(x, y));
	state.mspot = p ? { x: p[0], y: p[1] } : null;
	if (p) game_log(`merrit: stand spot ${p[0]},${p[1]}`, C.dim);
	return state.mspot;
}
function merrit_on() { return is_merchant() && !!CFG.merchant.merrit?.enabled; }
// Parcel arrivals (any item named "Market Parcel"): counted every 30s on the merchant
let parcel_ids = null, parcels_prev = null;
function parcel_count() {
	if (!parcel_ids) parcel_ids = Object.keys(G.items).filter((n) => /market parcel/i.test(G.items[n]?.name || ""));
	return parcel_ids.reduce((a, n) => a + held_any(n), 0);
}
setInterval(() => {
	if (!merrit_on()) return;
	const n = parcel_count();
	if (parcels_prev !== null && n > parcels_prev) { state.parcel_at = Date.now(); log_ev("parcel", { n: n - parcels_prev }); game_log(`merrit: Market Parcel received`, C.ok); }
	parcels_prev = n;
	if (!character.stand || character.moving || walking()) state.stand_since = 0;
	else if (!state.stand_since) state.stand_since = Date.now();
}, 30_000);
const unit_value = (it) => {
	const f = typeof calculate_item_value === "function" ? calculate_item_value : parent?.calculate_item_value;
	return Math.max(1, Math.round(f ? f({ ...it, q: 1 }) : (G.items[it.name]?.g || 0) * 0.6));
};
function stand_worthy(it, k, needed, cmp) {
	const d = it && G.items[it.name], S_ = CFG.merchant.stand;
	if (!d || it.l || it.b || needed.has(k) || cmp.has(k) || CFG.keep.includes(it.name) || !tradeable(it.name) || gear_wanted_by(it)) return false;
	return unit_value(it) >= S_.min_value || (GEAR.has(d.type) && (it.level || 0) >= 3) || item_grade(it) >= 1 || !!it.p;
}
// Bag slots held back for the stand: the most valuable candidates, as many as there are free trade slots
let stand_cache = null;
function stand_hold() {
	if (!CFG.merchant?.stand?.enabled || !is_merchant()) return new Set();
	const key = character.items.map((i) => (i ? i.name + (i.level || 0) + (i.q || 1) : "")).join() + Object.keys(state.stand).length;
	if (stand_cache && stand_cache.key === key && Date.now() - stand_cache.at < 2000) return stand_cache.set;
	const needed = needed_slots(), cmp = compound_slots(needed), free = TRADE_SLOTS.length - Object.keys(state.stand).length;
	const ks = character.items.map((it, k) => (stand_worthy(it, k, needed, cmp) ? k : -1)).filter((k) => k >= 0)
		.sort((a, b) => unit_value(character.items[b]) - unit_value(character.items[a])).slice(0, Math.max(0, free));
	stand_cache = { key, at: Date.now(), set: new Set(ks) };
	return stand_cache.set;
}
async function stand_close() {
	if (!character.stand || typeof close_stand !== "function") return;
	await T(close_stand(), 3000).catch(() => {});
	await until(() => !character.stand, 2000);
}
// Idle at home: open the stand, notice sales, cut stale prices, list new stock (one listing action per call)
let stand_busy = false;
async function stand_tick() {
	const S_ = CFG.merchant.stand;
	if (!S_?.enabled || stand_busy || walking() || errand_busy()) return;
	stand_busy = true;
	try {
		const now = Date.now(), sl = character.slots || {};
		// sales: a listing whose slot emptied (we only take items down by re-listing, which updates state first)
		if (character.stand) for (const slot in state.stand) { // trade slots are only reliable while the stand is open
			const L_ = state.stand[slot], cur = sl[slot];
			const unit = L_.per_unit ? L_.price : L_.price / Math.max(1, L_.q);
			// v24.7: with per-unit prices a buyer can take part of a stack: the slot keeps the item with a smaller q
			if (cur && cur.name === L_.name && (cur.q || 1) < (L_.q || 1)) {
				const q_s = (L_.q || 1) - (cur.q || 1);
				log_ev("sold", { item: `${L_.name}+${L_.level}`, q: q_s, price: Math.round(unit * q_s) });
				game_log(`stand: sold ${q_s} of ${L_.name} for ${fmt_k(Math.round(unit * q_s))}`, C.gold || C.ok);
				L_.q = cur.q || 1;
				continue;
			}
			if (cur && cur.name === L_.name) continue;
			{
				log_ev("sold", { item: `${L_.name}+${L_.level}`, q: L_.q, price: Math.round(unit * (L_.q || 1)) });
				game_log(`stand: sold ${L_.name}+${L_.level}${L_.q > 1 ? " x" + L_.q : ""} for ${fmt_k(Math.round(unit * (L_.q || 1)))}`, C.gold || C.ok);
				delete state.stand[slot];
			}
		}
		if (!character.stand) {
			let k = character.items.findIndex((i) => i && G.items[i.name]?.stand);
			if (k < 0) {
				if (skipped("stand:buy") || character.gold < (G.items[S_.item]?.g || 40000) + CFG.merchant.donate.keep) return;
				skip("stand:buy", 6 * 3600_000, "buying a stand");
				await buy_from_npc(S_.item, 1).catch((e) => game_log(`stand: buying ${S_.item}: ${why(e)}`, C.dim));
				return;
			}
			await T(open_stand(k), 3000).catch(() => {});
			return;
		}
		// v19.7: a listed piece that's now an upgrade for one of us comes off the stand
		for (const slot in state.stand) {
			const cur = sl[slot];
			if (!cur || !GEAR.has(G.items[cur.name]?.type) || !wanted_by_member(cur)) continue;
			await T(unequip(slot), 5000).then(() => game_log(`stand: took ${cur.name}+${cur.level || 0} down — an upgrade for the party`, C.ok)).catch(() => {});
			delete state.stand[slot];
			return;
		}
		// price cuts: re-list at the lower price
		for (const slot in state.stand) {
			const L_ = state.stand[slot];
			// v24.5: the server's price is per unit (a buyer pays price x q); stacks were listed at q times their value.
			// A stack listed before (no per_unit) is re-listed at once at the per-unit price.
			const old = L_.q > 1 && !L_.per_unit;
			if (!old && now - (L_.cut_at || L_.at) < S_.cut_every_h * 3600_000) continue;
			const min_price = Math.ceil(L_.value * S_.floor);
			const next = old ? Math.ceil(L_.value * S_.markup) : Math.max(min_price, Math.floor(L_.price * (1 - S_.cut)));
			L_.cut_at = now;
			if (next >= L_.price) { L_.per_unit = true; continue; }
			await T(unequip(slot), 5000).catch(() => {});
			const k = character.items.findIndex((i) => i && i.name === L_.name && (i.level || 0) === L_.level);
			if (k < 0) { delete state.stand[slot]; return; }
			await T(trade(k, slot, next, L_.q), 5000).then(() => { L_.price = next; L_.per_unit = true; game_log(`stand: ${L_.name} now ${fmt_k(next)}${L_.q > 1 ? " each" : ""}`, C.dim); })
				.catch(() => delete state.stand[slot]);
			return;
		}
		// new listing
		const slot = TRADE_SLOTS.find((t) => !sl[t] && !state.stand[t]);
		const k = [...stand_hold()][0];
		if (!slot || k === undefined) return;
		const it = character.items[k], q = it.q || 1, value = unit_value(it), price = Math.ceil(value * S_.markup); // per unit
		await wait_budget(1, RESERVE.errand);
		await T(trade(k, slot, price, q), 5000).then(() => {
			state.stand[slot] = { name: it.name, level: it.level || 0, q, price, value, at: now, per_unit: true };
			stand_cache = null;
			game_log(`stand: listed ${it.name}+${it.level || 0}${q > 1 ? " x" + q : ""} at ${fmt_k(price)}${q > 1 ? " each" : ""} (value ${fmt_k(value)}${q > 1 ? " each" : ""})`, C.dim);
		}).catch((e) => game_log(`stand: listing ${it.name}: ${why(e)}`, C.dim));
	} finally { stand_busy = false; }
}
// Donate gold above donate.keep for XP while below donate.to_level (once a minute, idle in town only)
let donate_at = 0;
function merchant_donate() {
	const D = CFG.merchant.donate, now = Date.now();
	if (!D || character.level >= D.to_level || now - donate_at < 60_000 || character.map === "bank") return false;
	donate_at = now;
	const day = state.donated && now - state.donated.since < 86_400_000 ? state.donated : (state.donated = { since: now, g: 0 });
	const g = Math.floor(Math.min(character.gold - D.keep, D.chunk, D.per_day - day.g, gold_room()));
	if (g < 100_000 || !can_spend(1, RESERVE.errand)) return false; // < 100k: the server's "low" donation, skip
	tag_spend("donations");
	parent.socket.emit("donate", { gold: g });
	day.g += g;
	save_state();
	game_log(`merchant: donated ${fmt_k(g)} gold for XP (${fmt_k(day.g)} today, level ${character.level} → ${D.to_level})`, C.info);
	return true;
}
let merchant_trip_at = 0;
function merchant_tick() {
	const f = merchant_job();
	set_message(`${errand_busy() ? state.errand + " | " : ""}merchant${f ? " → " + f.name : ""} | ${character.esize} free`);
	if (walking() || errand_busy()) return;
	mluck_near();
	const MM = CFG.merchant.merrit;
	const urgent = f && ((f.esize ?? 99) < MM.urgent_free || Math.min(f.pots?.hp ?? 999, f.pots?.mp ?? 999) < MM.urgent_pots);
	const settling = merrit_on() && character.stand && state.stand_since && Date.now() - state.stand_since < MM.min_stay_ms;
	if (f && character.esize >= 8 && Date.now() - merchant_trip_at > CFG.merchant.trip_gap_ms && (!settling || urgent)) {
		merchant_trip_at = Date.now();
		return void errand("serve", () => serve(f));
	}
	merchant_donate();
	if (CFG.secondhand_auto && Date.now() - secondhand_at > CFG.secondhand_every_ms && character.esize >= 5 && !settling) { // Ponty can wait for Merrit
		secondhand_at = Date.now();
		return void errand("secondhands", () => task_secondhands());
	}
	// idle: stand at the Merrit spot (or near the town spawn without it); standing still there is what earns parcels
	if (merrit_on()) {
		const sp = merrit_spot();
		if (sp) {
			const here = character.map === "main" && Math.hypot(character.x - sp.x, character.y - sp.y) <= 12;
			if (here && !character.moving) {
				// arrived (smart_move stops a few px short): keep where we are if that spot qualifies too
				if (Math.hypot(character.x - sp.x, character.y - sp.y) > 2 && spot_ok(character.x, character.y)) state.mspot = { x: Math.round(character.x), y: Math.round(character.y) };
				return void stand_tick().catch(() => {});
			}
			if (here) return;
			if (character.stand) return void stand_close();
			if (character.map === "main" && Math.hypot(character.x - sp.x, character.y - sp.y) < 150 && can_move_to(sp.x, sp.y)) return void move_to_as("merchant_tick", sp.x, sp.y, 1000);
			return void travel_as("merchant_tick", { map: "main", x: sp.x, y: sp.y });
		}
	}
	const home = G.maps.main?.spawns?.[0] || [0, 0];
	if (character.map !== "main" || Math.hypot(character.x - home[0], character.y - home[1]) > 250) {
		if (character.stand) return void stand_close();
		travel_as("merchant_tick", { map: "main", x: home[0], y: home[1] });
	} else if (!character.moving) stand_tick().catch(() => {});
}
// ---- moved from common.js (v24.95): used by the merchant only ----
// Item types that always stay in the bags: consumables, scrolls, tools, keys
// Item types the bot may ever sell, list on the stand or purge from the bank: gear, plain materials, gems. Everything
// else (dungeon keys, licences, cosmetics, quest items, tomes, flutes, containers...) is only ever kept or banked.
const TRADE_TYPES = new Set(["material", "gem"]);
const tradeable = (name) => { const d = G.items[name]; return !!d && (GEAR.has(d.type) || TRADE_TYPES.has(d.type)) && !recipe_input(name); };
// ---- report() sections of the merchant (v24.96): called from report_facts in order; c = { p: state.pack, d: state.directive, now } ----
function facts_merchant(F, ctx) {
	const { p, d, now } = ctx;
	const f = merchant_job(), D = CFG.merchant.donate;
	if (D && character.level < D.to_level) F("xp", "self", `xp: level ${character.level}, donating gold above ${fmt_k(D.keep)} until level ${D.to_level} (${fmt_k(state.donated && now - state.donated.since < 86_400_000 ? state.donated.g : 0)}/${fmt_k(D.per_day)} today)`);
	const bf = state.bank_free, pend = character.items.filter((i) => i && state.purge[purge_key(i)]).length;
	if (bf) F("bank", "self", `bank: ${bf.free} of ${bf.total} free (seen ${ago(state.bank_at || bf.at)} ago${state.bank_by && state.bank_by !== character.name ? " by " + state.bank_by : ""})${bf.free < bf.total * CFG.merchant.purge_below ? (CFG.sell_junk ? " — purging low-value items" : " — nearly full; nothing is sold (sell_junk off)") : ""}${pend ? ` | purge: ${pend} pending` : ""}`);
	// v24.68: everything in the bank (as last seen) and in the merchant's bags, as JSON: "name+level" → count, * = locked
	F("bank_json", "self", state.bank_dump ? `bank JSON (seen ${ago(state.bank_at)} ago${state.bank_by && state.bank_by !== character.name ? " by " + state.bank_by : ""}): ${JSON.stringify(state.bank_dump)}`
		: "bank JSON: nothing recorded yet — it's taken on the next bank visit by any character");
	F("bags_json", "self", `bags JSON: ${JSON.stringify(items_dump(character.items))}`);
	if (merrit_on()) {
		const sp = state.mspot, st = state.stand_since ? Math.round((now - state.stand_since) / 1000) : 0;
		const got = hist.ev.filter((e) => e.type === "parcel" && now - e.t < 86_400_000).reduce((a, e) => a + (e.n || 1), 0);
		F("merrit", "self", `merrit: ${sp ? `spot ${sp.x},${sp.y} (${in_rect(sp.x, sp.y, CFG.merchant.merrit.square) ? "square" : "aisle"})` : "no qualifying spot"} | ${character.stand ? `stand still ${Math.floor(st / 60)}m${st % 60}s${st >= 120 ? " — ready for her" : ""}` : "stand closed"} | parcels 24h: ${got}${state.parcel_at ? `, last ${ago(state.parcel_at)} ago` : ""}${parcel_count() ? ` | holding ${parcel_count()}` : ""}`);
	}
	const ls = Object.values(state.stand), sold = hist.ev.filter((e) => e.type === "sold" && now - e.t < 86_400_000);
	F("stand", "self", `stand: ${character.stand ? "open" : "closed"}, ${ls.length}/16 listed${ls.length ? ` (${fmt_k(ls.reduce((a, l) => a + l.price * (l.per_unit ? l.q || 1 : 1), 0))} asked)` : ""} | sold 24h: ${sold.length}${sold.length ? ` for ${fmt_k(sold.reduce((a, e) => a + (e.price || 0), 0))}` : ""}`);
	F("merchant", "self", `supply: ${state.serving ? "serving " + state.serving : f ? "next: " + f.name + ` (${f.esize} free, pots ${f.pots?.hp}/${f.pots?.mp})` : "idle"} | mluck ${G.skills.mluck && character.level >= (G.skills.mluck.level || 0) ? "on" : `at level ${G.skills.mluck?.level || 40}`}`);
}
// ---- moved from common.js (v24.95): used by the merchant only ----
function recover() {
	if (!state.recovering) {
		const pmf = postmortem();
		log_ev("flee", pmf);
		bucket().flees++;
		const fk = pmf.killer && G.monsters[pmf.killer] ? pmf.killer : state.pack?.mtype;
		incident(fk, 0.8);
		share_verdict({ kind: "incident", mtype: fk, mult: 0.8 }); // v24.6: the leader picks for the party from its own tables
		if (!state.pack?.probe) safety_tune("flee"); // a probe's flee is the probe's verdict, not the everyday limit's
		Object.assign(state, { recovering: true, fled: false, session: null, pack: null });
		game_log(`HP ${((character.hp / character.max_hp) * 100).toFixed(0)}%: retreating`, C.bad);
	}
	const threat = get_nearest_monster({ target: character.name });
	const done = character.hp >= character.max_hp * CFG.recover_hp && character.mp >= character.max_mp * CFG.recover_mp;
	if (done && !threat) {
		Object.assign(state, { recovering: false, fled_home: false, last_target_at: Date.now() });
		return void game_log("Recovered; resuming", C.ok);
	}
	if (channeling()) return void set_message("Teleporting to town…"); // nothing that would cancel it
	if (threat || hurt_ms() < CFG.flee_quiet_ms) {
		const t = choose_target(false); // what's hitting us (then a partner)
		if (t) fight(t, true); // steer: a melee fighter walks to a ranged attacker; a ranged one kites
		else if (threat && Number.isFinite(threat.x)) { // v24.8: one we ignore as immune: step away from it (stood still before)
			const a = Math.atan2(character.y - threat.y, character.x - threat.x), x = character.x + Math.cos(a) * 120, y = character.y + Math.sin(a) * 120;
			if (can_move_to(x, y)) move_to_as("recover", x, y, 300);
		}
	} else if (!done && !state.fled_home && Date.now() - (state.town_at || 0) > 1500) {
		if (at_town_spot()) state.fled_home = true;
		else {
			if (walking() || is_moving(character)) halt("recover"), stop("move");
			if (fire("use_town")) (state.fled = true), (state.town_at = Date.now());
		}
	}
}
