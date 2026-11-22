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
// v25.33 (owner): gear past what the party could use. A piece is useful if a fighter would wear it over what it
// wears at some level up to +7 (or the best copy we hold); cached 10 min per name.
const useful_c = new Map();
function gear_useful(name, top = 7) {
	const c = useful_c.get(name);
	if (c && Date.now() - c.at < 600_000 && c.top >= top) return c.v;
	const takers = gear_takers().filter((m) => m.ctype !== "merchant");
	let v = false;
	for (let L = 0; L <= top && !v; L++) v = takers.some((m) => gear_gain({ name, level: L }, m.ctype, m.g));
	useful_c.set(name, { at: Date.now(), top, v });
	return v;
}
// A copy that may never be sold, whatever the count
function gear_protected(it) {
	const d = it && G.items[it.name];
	if (!recipe_inputs) { recipe_inputs = new Set(); for (const id in G.craft || {}) for (const [, n] of G.craft[id].items || []) recipe_inputs.add(n); }
	return !d || !GEAR.has(d.type) || it.l || it.b || it.p || d.e || d.cash || !tradeable(it.name) || CFG.keep.includes(it.name) || state.needs.has(it.name) ||
		recipe_inputs.has(it.name) || state.upg?.name === it.name || gear_wanted_by(it) ||
		(d.compound && compound_groups().some((g) => g.name === it.name && g.level === (it.level || 0)));
}
// The levels of each item name to sell: every unprotected copy (bags + bank) at a level wholly below the copies kept.
// A level the kept copies reach is never sold, so a purge mark (by name and level) can't catch a kept copy.
// → Map name -> Set of levels
function gear_excess() {
	const P = CFG.merchant.gear_purge, by = {};
	const add = (it) => { if (it && !gear_protected(it)) (by[it.name] = by[it.name] || []).push(it.level || 0); };
	character.items.forEach(add);
	for (const p in character.bank || {}) if (p.startsWith("items")) (character.bank[p] || []).forEach(add);
	const out = new Map();
	for (const name in by) {
		const lv = by[name].sort((a, b) => b - a), t = G.items[name].type;
		const keep = !gear_useful(name, Math.max(7, lv[0])) ? 0
			: (t === "ring" || t === "earring" ? P.ring_earring : P.other) + (sold_by_npc(name) ? 0 : P.failure_stock);
		if (lv.length <= keep) continue;
		const floor = keep ? lv[keep - 1] : Infinity; // the lowest level kept
		const sell = new Set(lv.slice(keep).filter((l) => l < floor));
		if (sell.size) out.set(name, sell);
	}
	return out;
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
// v25.33: pull this floor's surplus gear (gear_excess) to be sold; copies already in the bags at those levels are marked too
async function gear_purge() {
	const M = CFG.merchant, bf = state.bank_free, ex = gear_excess(), packs = bank_packs_list(), now = Date.now();
	if (!ex.size) return 0;
	const hit = (it) => it && ex.get(it.name)?.has(it.level || 0) && !gear_protected(it);
	for (const it of character.items) if (hit(it)) state.purge[purge_key(it)] = now;
	const cands = [];
	for (const p in character.bank || {}) {
		if (!p.startsWith("items") || (packs[p] && packs[p][0] !== character.map)) continue;
		(character.bank[p] || []).forEach((it, n) => { if (hit(it)) cands.push({ p, n, it, v: unit_value(it) }); });
	}
	cands.sort((a, b) => a.v - b.v);
	let got = 0;
	for (const c of cands.slice(0, M.purge_n)) {
		await wait_budget(1, RESERVE.bulk);
		await T(bank_retrieve(c.p, c.n)).then(() => { got++; state.purge[purge_key(c.it)] = Date.now(); }).catch(() => {});
		await sleep_ms(PACE_MS);
	}
	if (got) {
		game_log(`bank: ${bf.free}/${bf.total} free — pulled ${got} surplus gear to sell (${[...ex].map(([n, l]) => `${n} +${[...l].join("/+")}`).slice(0, 6).join(", ")}${ex.size > 6 ? "…" : ""})`, C.info);
		log_ev("purge", { n: got, free: bf.free, total: bf.total, gear: true });
	}
	return got;
}
