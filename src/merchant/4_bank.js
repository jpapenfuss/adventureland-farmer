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
