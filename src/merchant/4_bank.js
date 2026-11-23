// =====================================================================
// merchant/4_bank.js — merchant only (src/manifest.json): bank housekeeping (purge)
// =====================================================================
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
// v25.33 (owner): gear past what the party could use. Decided only while every configured fighter has been heard
// from in the last 20 s with its worn gear — dead ones too (a dead fighter still wears its gear). With one missing, all
// of its pieces looked "not useful" and were sold (Fable). Nothing is cached across calls.
function purge_takers() {
	const now = Date.now(), out = [];
	for (const n of CFG.party.members || []) {
		const p = state.partners[n];
		if (!p || now - (p.t || 0) >= 20_000 || !p.gear?.w || !p.ctype) return null;
		out.push({ name: n, ctype: p.ctype, g: p.gear });
	}
	return out.length ? out : null;
}
// Would one of them wear it over what it wears, at some level up to `top`?
const gear_useful = (name, top, takers) => { for (let L = 0; L <= top; L++) if (takers.some((m) => gear_gain({ name, level: L }, m.ctype, m.g))) return true; return false; };
// A copy that may never be sold, whatever the count. A recipe input is protected at the level its recipe takes
// (G.craft rows are [qty, name, level], level 0 when left out; the server matches the level exactly): coat+5 and
// coat+0 are inputs (ratworkcoat, cave_ambercoat), the 17 coat+3 in the bank aren't.
let recipe_lv = null;
function gear_protected(it, takers) {
	const d = it && G.items[it.name];
	if (!recipe_lv) { recipe_lv = new Map(); for (const id in G.craft || {}) for (const [, n, l] of G.craft[id].items || []) (recipe_lv.get(n) || recipe_lv.set(n, new Set()).get(n)).add(l || 0); }
	return !d || !GEAR.has(d.type) || it.l || it.b || it.p || d.e || d.cash || CFG.keep.includes(it.name) || state.needs.has(it.name) ||
		!!recipe_lv.get(it.name)?.has(it.level || 0) || state.upg?.name === it.name ||
		takers.some((m) => gear_gain(it, m.ctype, m.g)) || // wanted now, by any fighter (gear_wanted_by skips dead ones)
		(d.compound && compound_groups().some((g) => g.name === it.name && g.level === (it.level || 0)));
}
// Copies to sell, by purge_key (name, level, title, stat): for each name the unprotected copies in the bags and in
// `bank` (a list of items), best first (level, then a stat-scrolled copy); the first `keep` stay, the rest go.
// keep = ring_earring (rings, earrings) or other, + failure_stock when no NPC sells it; 0 when nobody would wear it.
function gear_excess(bank, takers) {
	const P = CFG.merchant.gear_purge, by = {};
	const add = (it) => { if (it && !gear_protected(it, takers)) (by[it.name] = by[it.name] || []).push(it); };
	character.items.forEach(add);
	bank.forEach(add);
	const out = new Map();
	for (const name in by) {
		const L = by[name].sort((a, b) => (b.level || 0) - (a.level || 0) || (b.stat_type ? 1 : 0) - (a.stat_type ? 1 : 0)), t = G.items[name].type;
		const keep = !gear_useful(name, Math.max(7, L[0].level || 0), takers) ? 0
			: (t === "ring" || t === "earring" ? P.ring_earring : P.other) + (sold_by_npc(name) ? 0 : P.failure_stock);
		for (const it of L.slice(keep)) out.set(purge_key(it), (out.get(purge_key(it)) || 0) + 1);
	}
	return out;
}
// At the shop: is this bag copy one of the surplus — pulled (or marked) in the last 24 h, every fighter heard from,
// not protected, and still over the count with the bank as last seen (state.bank_gear)? Re-counted per sale.
let gx_cache = null;
function gear_sell_ok(item) {
	if (!CFG.merchant.gear_purge?.enabled || !GEAR.has(G.items[item.name]?.type)) return false;
	if (Date.now() - (state.purge[purge_key(item)] || 0) >= 86_400_000) return false;
	const tk = purge_takers();
	if (!tk || gear_protected(item, tk)) return false;
	const key = character.items.map((i) => (i ? purge_key(i) : "")).join() + "|" + (state.bank_gear || []).length + "|" + tk.map((m) => Object.values(m.g.w).join()).join();
	if (!gx_cache || gx_cache.key !== key || Date.now() - gx_cache.at > 2000) gx_cache = { key, at: Date.now(), ex: gear_excess(state.bank_gear || [], tk) };
	return (gx_cache.ex.get(purge_key(item)) || 0) > 0;
}
// In the bank with it nearly full: pull the least valuable purgeable items (this floor's packs)
async function bank_purge() {
	const M = CFG.merchant, bf = state.bank_free;
	if (!bf || bf.free >= bf.total * M.purge_below || character.esize < M.purge_n + 4) return 0;
	if (!CFG.sell_junk) return M.gear_purge?.enabled ? gear_purge() : 0;
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
// v25.33: pull this floor's surplus gear (gear_excess over the bags and the whole bank) to be sold, up to purge_n;
// copies of it already in the bags are marked too. Nothing without every fighter's heartbeat.
let purge_wait_at = 0;
async function gear_purge() {
	const M = CFG.merchant, bf = state.bank_free, packs = bank_packs_list(), now = Date.now(), tk = purge_takers();
	if (!tk) {
		if (now - purge_wait_at > 3600_000) { purge_wait_at = now; game_log("bank: surplus gear waits — not every fighter has been heard from with its gear", C.dim); }
		return 0;
	}
	const bank = [];
	for (const p in character.bank || {}) if (p.startsWith("items")) for (const it of character.bank[p] || []) if (it) bank.push(it);
	const left = gear_excess(bank, tk);
	if (!left.size) return 0;
	// (a locked copy shares its key with the surplus: only unprotected copies are marked or pulled)
	for (const it of character.items) if (it && (left.get(purge_key(it)) || 0) > 0 && !gear_protected(it, tk)) { state.purge[purge_key(it)] = now; left.set(purge_key(it), left.get(purge_key(it)) - 1); }
	const pulled = [];
	// this floor's packs, cheapest first
	const pull_here = async () => {
		const cands = [];
		for (const p in character.bank || {}) {
			if (!p.startsWith("items") || (packs[p] && packs[p][0] !== character.map)) continue;
			(character.bank[p] || []).forEach((it, n) => { if (it && (left.get(purge_key(it)) || 0) > 0 && !gear_protected(it, tk)) cands.push({ p, n, it, v: unit_value(it) }); });
		}
		cands.sort((a, b) => a.v - b.v);
		for (const c of cands) {
			if (pulled.length >= M.purge_n || character.esize < 6) break;
			const k = purge_key(c.it);
			if (!(left.get(k) > 0)) continue;
			await wait_budget(1, RESERVE.bulk);
			await T(bank_retrieve(c.p, c.n)).then(() => { pulled.push(k); left.set(k, left.get(k) - 1); state.purge[k] = Date.now(); }).catch(() => {});
			await sleep_ms(PACE_MS);
		}
	};
	await pull_here();
	// v25.35: then the other unlocked floors holding surplus (one visit pulled 1 piece: the rest sat on other floors)
	const floors = [...new Set(Object.keys(character.bank || {}).filter((p) => p.startsWith("items") && packs[p] && packs[p][0] !== character.map &&
		(character.bank[p] || []).some((it) => it && (left.get(purge_key(it)) || 0) > 0 && !gear_protected(it, tk))).map((p) => packs[p][0]))];
	for (const floor of floors) {
		if (pulled.length >= M.purge_n || character.esize < 6) break;
		try { await go({ map: floor }); } catch (e) { game_log(`bank: can't reach ${floor}: ${why(e)}`, C.dim); continue; }
		if (!(await floor_loaded(floor))) continue;
		await pull_here();
	}
	if (pulled.length) {
		game_log(`bank: ${bf.free}/${bf.total} free — pulled ${pulled.length} surplus gear to sell (${pulled.slice(0, 8).join(", ")}${pulled.length > 8 ? "…" : ""})`, C.info);
		log_ev("purge", { n: pulled.length, free: bf.free, total: bf.total, gear: true });
	}
	return pulled.length;
}
