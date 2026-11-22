// =====================================================================
// fighter/6_gear.js — fighters only (src/manifest.json): tokens, own upgrade projects, worn-gear swaps, stat scrolls
// =====================================================================
// Tokens set aside for our own missing must-hold items that the bank can't supply
const token_reserve = () => hold_missing().filter((n) => !(state.bank_seen[n] > 0)).reduce((a, n) => a + (hold_price(n) || 0), 0);
// The merchant's missing must-hold item that we should buy: only the alphabetically first fighter that already holds
// its own copy and can afford another, so exactly one copy gets bought
function hold_for_merchant() {
	const M = merchant_hb();
	if (!CFG.hold_buy_for_merchant || !M || !Array.isArray(M.need) || is_merchant()) return null;
	for (const n of M.need) {
		const price = hold_price(n), cur = CFG.hold[n];
		if (hold_missing().includes(n) || partners().some((f) => (f.need || []).includes(n))) continue; // fighters first
		if (!price || state.bank_seen[n] > 0 || held_any(n) !== 1 || state.hold_for[n]) continue; // ours only, no extra yet
		const me = { name: character.name, tokens: held_any(cur), need: hold_missing() };
		const ok = [me, ...partners()].filter((f) => Array.isArray(f.need) && !f.need.includes(n) && (f.tokens || 0) >= price)
			.sort((a, b) => (a.name < b.name ? -1 : 1));
		if (ok[0]?.name === character.name) return { name: n, price, for: M.name, gain: 0, hold: true };
	}
	return null;
}
function token_pick() {
	const have = held_any("monstertoken"), shop = G.tokens?.monstertoken || {};
	if (!CFG.token_auto || have <= 0 || character.esize < 2 || is_merchant()) return null; // the merchant hands its tokens to fighters
	// must-hold items first: ours, then the merchant's
	for (const n of hold_missing()) {
		const price = hold_price(n);
		if (CFG.hold[n] === "monstertoken" && price && price <= have && !(state.bank_seen[n] > 0)) return { name: n, price, for: character.name, gain: 0, hold: true };
	}
	const mh = hold_for_merchant();
	if (mh) return mh;
	const budget = have - token_reserve(); // gear never spends tokens a missing must-hold item needs
	let best = null;
	for (const name in shop) {
		const price = shop[name];
		if (price > budget || !GEAR.has(G.items[name]?.type) || party_holds(name)) continue;
		for (const m of gear_takers().filter((x) => x.ctype !== "merchant")) {
			const r = gear_gain({ name, level: 0 }, m.ctype, m.g);
			if (r && (!best || r.gain / price > best.v)) best = { name, price, for: m.name, gain: Math.round(r.gain), v: r.gain / price };
		}
		// v24.67: for ourselves, a piece that only beats what we wear once upgraded (the fifth piece of a set at +0
		// against a worn +5): bought when the lowest level at which it wins is one our scrolls reach; we upgrade it
		// ourselves (own project) and wear it then. Sanala sat at 4 of 5 Monster Hunter Mage pieces.
		const mine = set_piece_plan(name);
		if (mine && (!best || mine.gain / price > best.v)) best = { name, price, for: character.name, gain: mine.gain, v: mine.gain / price, to: mine.to, slot: mine.slot };
	}
	return best;
}
// The lowest level (1..what scroll0/scroll1 reach, under a past ceiling) at which an upgradable piece beats what we wear
// (from: the level of a copy we have — in the bags or the bank; 0 for one still to buy)
const spp_cache = new Map(); // "name:from" -> { at, v } (30s: bag_plan asks for every bag slot)
function set_piece_plan(name, from = 0) {
	if (state.upg) return null;
	const key = `${name}:${from}`, c = spp_cache.get(key);
	if (c && Date.now() - c.at < 30_000) return c.v;
	const v = set_piece_plan_raw(name, from);
	spp_cache.set(key, { at: Date.now(), v });
	return v;
}
function set_piece_plan_raw(name, from) {
	if (!CFG.upgrade_auto || !CFG.gear_auto || is_merchant() || !G.items[name]?.upgrade || !GEAR.has(G.items[name].type) || state.upg || skipped("upg:" + name)) return null;
	const g = my_gear(), max = Math.min(upgrade_target(name), upg_cap_level(name));
	if (gear_gain({ name, level: from }, character.ctype, g)) return null; // wins as it is: the ordinary pick
	for (let to = from + 1; to <= max; to++) {
		const r = gear_gain({ name, level: to }, character.ctype, g);
		if (r) return upgrade_cost(name, to) - upgrade_cost(name, from) <= upgrade_gold() ? { to, slot: r.slot, gain: Math.round(r.gain) } : null;
	}
	return null;
}
// v24.69: a piece of a set we wear that lies in the bank below the level at which it would win (Sanala's fifth
// Monster Hunter piece sat there at +0): fetched, then upgraded as our own project. One at a time.
// v24.70: any piece (not only a set's): the one with the biggest gain
function set_piece_fetch() {
	if (state.upg || is_merchant()) return [];
	let best = null;
	for (const it of state.bank_gear || []) {
		if (it.p || character.items.some((i) => i && i.name === it.name)) continue;
		const pl = set_piece_plan(it.name, it.level || 0);
		if (pl && (!best || pl.gain > best.pl.gain)) best = { it, pl };
	}
	return best ? [{ name: best.it.name, level: best.it.level || 0, exact: true, key: `setp:${best.it.name}` }] : [];
}
// A copy in our bags that would win once upgraded → our own project
function set_piece_start() {
	if (state.upg || is_merchant()) return;
	let best = null;
	for (const i of character.items) {
		if (!i || i.l || !GEAR.has(G.items[i.name]?.type)) continue;
		const pl = set_piece_plan(i.name, i.level || 0);
		if (pl && (!best || pl.gain > best.pl.gain)) best = { i, pl };
	}
	if (best) {
		const { i, pl } = best;
		state.upg = { name: i.name, to: pl.to, for: character.name, slot: pl.slot, gain: pl.gain, cost: upgrade_cost(i.name, pl.to) - upgrade_cost(i.name, i.level || 0), own: true };
		state.upg_pick_at = Date.now();
		return void game_log(`upgrade project (ours): ${i.name} +${i.level || 0} → +${pl.to}, then worn (+${pl.gain} pts)`, C.info);
	}
}
async function task_tokens() {
	let n = 0;
	for (let i = 0; i < 5; i++) {
		const b = token_pick();
		if (!b) break;
		await go_npc("monsterhunter");
		await wait_budget(1, RESERVE.errand);
		try {
			await T(exchange_buy("monstertoken", b.name));
			n++;
			if (b.hold && b.for !== character.name) state.hold_for[b.name] = { to: b.for, at: Date.now() };
			game_log(`tokens: bought ${b.name} (${b.price} tokens) for ${b.for} (+${b.gain} pts${b.to ? ` once it's +${b.to}` : ""})`, C.ok);
			// a piece bought to be upgraded: our own project (the merchant has no copy of it to work on)
			if (b.to) { state.upg = { name: b.name, to: b.to, for: character.name, slot: b.slot, gain: b.gain, cost: upgrade_cost(b.name, b.to), own: true }; state.upg_pick_at = Date.now(); }
			log_ev("buy", { item: b.name, src: "tokens", for: b.for });
			await until(() => held_any(b.name) > 0, 3000);
		} catch (e) { game_log(`tokens: ${b.name}: ${why(e)}`, C.dim); skip("town:tokens", pause_ms(e, 3600_000), why(e)); break; }
	}
	return n;
}
function party_holds(name) {
	if (held_any(name) > 0 || (state.bank_gear || []).some((i) => i.name === name)) return true;
	const M = state.merchant && fresh(state.merchant) ? [state.merchant] : [];
	return [...partners_any(), ...M].some((p) => Array.isArray(p.bag_gear) && p.bag_gear.includes(name));
}
// v19.7/v20.0: a worn piece of ours that's an upgrade for a member near: take it off and send it. The member wears it
// (equip_upgrades), its old piece drops into its bags and share_gear sends it back (our slot is empty), and we wear
// that. The receiver gains by the usual margins; we may lose up to gear_swap_loss of its gain (the party total goes
// up). The member with the alphabetically first name starts, so the two don't both send at once.
let swap_at = 0;
async function swap_worn() {
	if (!CFG.gear_auto || gear_busy || character.rip || is_merchant() || errand_busy() || typeof send_item !== "function" || typeof unequip !== "function") return false;
	if (Date.now() - swap_at < 60_000 || character.esize < 1) return false;
	const mine = my_gear(), sl = character.slots || {};
	for (const p of partners_near(CFG.gear_share_range)) {
		if (!p.worn || !p.gear?.w || (p.esize ?? 1) < 1) continue;
		for (const s of GEAR_SLOTS) {
			// v24.7: weapons/offhands too (priest and mage share staves, sources, misc offhands) — but no two-handers (the
			// offhand would have to come off first)
			const X = sl[s], Y = p.worn[s];
			if ((s === "mainhand" || s === "offhand") && X && Y && (is_2h(X.name, p.ctype) || is_2h(Y.name, character.ctype) || is_2h(X.name, character.ctype) || is_2h(Y.name, p.ctype))) continue;
			// v24.5: their piece must be free too (a locked one would stay in their bags and ours would be lost to them)
			if (!X || !Y || X.l || X.b || Y.l || (X.name === Y.name && (X.level || 0) === Y.level)) continue;
			if (!slots_for(Y.name, character.ctype, mine).includes(s) || !slots_for(X.name, p.ctype, p.gear).includes(s)) continue;
			const ours = slot_value(Y, character.ctype, mine, s) - (mine.w[s] || 0), theirs = slot_value(X, p.ctype, p.gear, s) - (p.gear.w[s] || 0);
			const ok = (gain, cur) => gain >= CFG.gear_min_gain && gain >= cur * CFG.gear_margin;
			// the receiver must gain by the usual margins; we may lose up to gear_swap_loss of that, so the party gains
			if (!ok(theirs, p.gear.w[s] || 0) || ours < -theirs * CFG.gear_swap_loss || !(ours + theirs >= 2 * CFG.gear_min_gain)) continue;
			// v24.7: the giver is whoever's partner gains (it equips what it's sent); when both gain, the earlier name gives.
			// Only the earlier name started before, checking only the other's gain: a swap where it should receive never ran
			if (character.name > p.name && ok(ours, mine.w[s] || 0)) continue;
			swap_at = Date.now();
			gear_busy = true;
			try {
				await T(unequip(s));
				const k = character.items.findIndex((i) => i && i.name === X.name && (i.level || 0) === (X.level || 0) && !i.l);
				if (k < 0) return false;
				await T(send_item(p.name, k, 1));
				game_log(`gear: swap — gave our ${s} ${X.name}+${X.level || 0} to ${p.name} (+${Math.round(theirs)} for it), its ${Y.name}+${Y.level} comes back (+${Math.round(ours)} for us)`, C.ok);
				log_ev("gear_swap", { with: p.name, slot: s, gave: `${X.name}+${X.level || 0}`, get: `${Y.name}+${Y.level}` });
				return true;
			} catch (e) { game_log(`gear: swap with ${p.name}: ${why(e)}`, C.dim); return false; } finally { gear_busy = false; }
		}
	}
	return false;
}
// ---- Stat scrolls on what we wear (CFG.stat_scroll, v24.77) ----
// Worn pieces with a Stat line and no stat on it: { slot, name, level, stat, scroll, q, cost, pts, ok, why }
function stat_scroll_list() {
	const C_ = CFG.stat_scroll, cs = class_stats(character.ctype);
	if (!C_?.enabled || is_merchant() || !cs) return [];
	const stat = cs.main, scroll = stat + "scroll", sg = G.items[scroll]?.g, out = [];
	if (!sg || G.items[scroll]?.type !== "pscroll") return [];
	for (const slot of GEAR_SLOTS) {
		const it = character.slots?.[slot], def = it && G.items[it.name];
		if (!def || !(def.stat > 0) || it.stat_type || it.l || it.b) continue;
		const q = [1, 10, 100, 1000][Math.max(0, item_grade(it))] || 9999, cost = q * sg;
		const pts = (def.stat + (it.level || 0) * (def.upgrade?.stat || 0)) * stat_weight(stat, character.ctype);
		const key = `stat:${it.name}:${it.level || 0}`;
		const why_ = skipped(key) ? `paused (${skip_why[key] || "?"})` : (it.level || 0) < (C_.min_level || 0) ? `only at +${C_.min_level} or higher` : cost > (C_.max_cost ?? Infinity) ? `${fmt_k(cost)} is over ${fmt_k(C_.max_cost)} for one piece` : !(pts > 0) ? "no points in it" : cost / pts > C_.max_gold_per_pt ? `${fmt_k(cost)} for +${pts.toFixed(1)} pts is over ${fmt_k(C_.max_gold_per_pt)}/pt`
			: character.gold - cost < CFG.gold_reserve || !gold_ok(cost) ? `gold (${fmt_k(cost)})` : null;
		out.push({ slot, name: it.name, level: it.level || 0, stat, scroll, q, cost, pts, key, ok: !why_, why: why_ });
	}
	return out.sort((a, b) => a.cost / Math.max(a.pts, 0.01) - b.cost / Math.max(b.pts, 0.01)); // cheapest per point first
}
// ---- role functions (v25.11): the merchant's own versions are in merchant/0_loop.js ----
// A fighter wears what helps it
function self_taker_ok() { return true; }
// Gold a fighter keeps when it spends on its own projects
function gold_keep() { return CFG.gold_reserve; }
