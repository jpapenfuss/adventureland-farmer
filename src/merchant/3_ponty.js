// =====================================================================
// merchant/3_ponty.js — merchant only (src/manifest.json): Ponty: shop prices, secondhand buys, compound odds
// =====================================================================
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
	const fighters = gear_takers().slice(1).filter((x) => x.ctype !== "merchant"), lv = it.level || 0;
	// someone already has one at this level or better: deliver that instead (v24.7: any copy of the name used to block it).
	// v25.18: a titled listing (shiny: more stats at the same level) is blocked only by a copy with the same title
	// (owner: a shiny is an upgrade over the upgrade — bought even while a plain copy is on its way to the member)
	const held_at = (lvl) => it.p
		? [...character.items, ...(state.bank_gear || [])].some((b) => b && b.name === it.name && b.p === it.p && (b.level || 0) >= lvl)
		: best_level_held(it.name) >= lvl || (state.bank_gear || []).some((b) => b.name === it.name && (b.level || 0) >= lvl) || party_holds_level(it.name, lvl);
	if (!held_at(lv)) for (const x of fighters) {
		const r = gear_gain(it, x.ctype, x.g);
		if (r && price <= r.gain * CFG.secondhand_gold_per_pt) return `upgrade for ${x.name} (+${Math.round(r.gain)} pts)`;
	}
	// v25.47: stock for compounding (CFG.ponty_stock): plain +0 copies up to n held, at up to max_price
	const S = CFG.ponty_stock?.[it.name];
	// v25.48: only while compounding runs and a fighter would wear a result (v25.60: at any level up to the item's reachable
	// ceiling — +3 alone stopped it once everyone wore two +3s) — else the stock grows with nothing turning it into
	// anything; and only plain, unlocked copies count (what compounding uses)
	// (up to cmp_top: no stock for levels the server's odds have ruled out — Fable)
	const useful = S && CFG.compound_auto && fighters.some((x) => { for (let L = 1; L <= cmp_top(it.name); L++) if (gear_gain_min({ name: it.name, level: L }, x.ctype, x.g)) return true; return false; });
	const have0 = () => character.items.filter((b) => b && b.name === it.name && !(b.level > 0) && !b.p && !b.l).length + (state.bank_gear || []).filter((b) => b.name === it.name && !(b.level > 0) && !b.p).length;
	if (useful && lv === 0 && !it.p && price <= S.max_price) {
		const have = have0();
		if (have < S.n) return `stock for compounding (${have + 1}/${S.n})`;
	}
	// v25.65: a stocked item's plain copies stop at n by any route — 15 ringsj+0 piled up through "completes a set" while
	// compounding waited on gold (the 10:50 PM report: Ponty 5.5M in 6 h)
	if (S && lv === 0 && have0() >= S.n) return null;
	const g = G.items[it.name].compound && (it.level || 0) < cmp_max(it.name) &&
		groups[compound_key(it.name, it.level || 0)];
	// v24.15: only when the result would be worn — compounding for its own sake roughly breaks even at an NPC, and a Ponty
	// copy costs twice its value; the merchant's twelve unwanted Amulet of HP +2 were built partly this way
	// v25.50 (Fable): priced — this copy is a third of the result, so at most a third of the best fighter's gain from it
	// at secondhand_gold_per_pt (with no fixed cap any more, a 24M ring was bought for a 3-point +1)
	// (v25.60: the gain at the best level it leads to, up to the reachable ceiling — a ringsj +2 on the way to a +4 too)
	const gain = g ? Math.max(0, ...gear_takers().slice(1).filter((x) => x.ctype !== "merchant").flatMap((x) => {
		const out = []; for (let L = (it.level || 0) + 1; L <= cmp_top(it.name); L++) out.push((gear_gain_min({ name: it.name, level: L }, x.ctype, x.g)?.gain || 0) / 3 ** (L - (it.level || 0) - 1)); return out; })) : 0;
	if (g && gain > 0 && (g.bags + g.bank) % 3 === 2 && price <= (gain * CFG.secondhand_gold_per_pt) / 3) return "completes a compound set";
	return null;
}
// v24.81: the server's base compound odds by the item's starting grade (design/upgrades.py), result level 1..10 (v25.81:
// +5..+10 added; the game's data.js carries the same table as G.compounds, which is read first when present)
const CMP_ODDS = { 0: [0.99, 0.75, 0.40, 0.25, 0.20, 0.10, 0.08, 0.05, 0.05, 0.05], 1: [0.90, 0.70, 0.40, 0.20, 0.15, 0.08, 0.05, 0.05, 0.05, 0.03],
	2: [0.80, 0.60, 0.32, 0.16, 0.10, 0.05, 0.03, 0.03, 0.03, 0.02] };
const cmp_odds = (name, to) => { const g = odds_grade(name); return G.compounds?.[g]?.[to] || (CMP_ODDS[g] || CMP_ODDS[0])[to - 1] || 0; };
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
			if (to > cmp_max(name) || cmp_odds(name, to) < Math.min(CFG.compound_min_chance, CFG.compound_min_chance_wanted) || to > cmp_top(name)) continue;
			let best = null;
			for (const m of takers) { const r = gear_gain_min({ name, level: to }, m.ctype, m.g); /* (v25.36: a route spends) */ if (r && (!best || r.gain > best.gain)) best = { gain: r.gain, who: m.name }; }
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
	// v25.50 (Fable): the stand is closed only for a walk — a poll every minute from the square (Ponty is ~170 px away)
	// closed it every time, and a close restarts Merrit's 2 min
	if (character.map !== "main" || Math.hypot(character.x - ref.x, character.y - ref.y) > 400) { await stand_close(); await go({ map: "main", x: ref.x, y: ref.y + 40 }); }
	const modals0 = modals_open();
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
				if (skipped(sbuy_key(it))) continue;
				await wait_budget(1, RESERVE.errand);
				const before = held_any(nm);
				tag_spend("ponty");
				parent.socket.emit("sbuy", { rid: it.rid });
				await until(() => held_any(nm) > before, 3000);
				if (!(held_any(nm) > before)) sbuy_missed(it, price);
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
		if (!why_buy || price > CFG.secondhand_max_price || character.gold - price < CFG.gold_reserve || character.esize < 3 || !upg_gold_ok(price)) continue; // v25.46: every reason here is gear for the party: no earnings test
		if (skipped(sbuy_key(it))) continue; // v25.63: a listing whose buy didn't land waits 10 min
		await wait_budget(1, RESERVE.errand);
		// (v25.63: landed = one more copy of it at that level in the bags — not a free slot fewer, which a slot freed in the
		// same 3 s hid — Fable)
		const copies = () => character.items.filter((b) => b && b.name === it.name && (b.level || 0) === (it.level || 0)).length, before = copies();
		tag_spend("ponty");
		parent.socket.emit("sbuy", { rid: it.rid });
		await until(() => copies() > before, 3000);
		if (!(copies() > before)) sbuy_missed(it, price);
		if (copies() > before) {
			n++;
			game_log(`secondhands: bought ${it.name}+${it.level || 0} for ${fmt_k(price)} (${why_buy})`, C.ok);
			log_ev("buy", { item: `${it.name}+${it.level || 0}`, src: "secondhands", price });
			if (why_buy.startsWith("completes")) count(it, "bags");
		}
	}
	// the list opens Ponty's window: close it — only if a window opened during the poll (v25.61: every 15 s it would close
	// one the owner had open — Fable)
	try { if (typeof parent.hide_modal === "function" && modals_open() > modals0) parent.hide_modal(); } catch (e) {}
	return n;
}

// Open game windows (the client's modals), or -1 when that can't be told (then a poll's window is always closed, as before)
function modals_open() { try { return typeof parent.$ === "function" ? parent.$(".modal:visible").length : -1; } catch (e) { return -1; } }

// v25.63 (Fable): a buy that didn't land (sold to someone else, refused) was retried every poll — every 15 s since v25.61
// — with a 3 s wait each time and nothing in the log. Keyed by listing (its rid; without one, name, level and price).
const sbuy_key = (it) => "sbuy:" + (it.rid || `${it.name}:${it.level || 0}:${shop_price(it)}`);
function sbuy_missed(it, price) {
	skip(sbuy_key(it), 600_000, "the buy didn't land");
	game_log(`secondhands: buying ${it.name}${it.level ? "+" + it.level : ""} for ${fmt_k(price)} didn't land; that listing waits 10 min`, C.dim);
}
