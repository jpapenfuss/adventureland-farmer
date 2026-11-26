// =====================================================================
// shared/19_gear_table.js — the prebuilt gear table (v25.81): every equipment piece in the game, by slot type
// =====================================================================
// data/gear/*.json is built offline from the game's data.js by tools/gear_table.js with this bot's own functions
// (stats per level, piece_value per class and level, upgrade/compound odds, where each piece comes from: shops,
// crafts, exchange boxes, drops, tokens) and committed to the repo. It is fetched once per load from GitHub at one
// commit — the one this code was loaded from (window.farmer_loaded.sha), else master's newest — and the last good copy
// is kept in the browser (localStorage) for when GitHub can't be reached. Static facts only.
//   gt_item(name)  → its record or null        gt_slot(type) → the records of one slot file ([] if none)
//   gt_best(ctype, slot, { max_level, filter, ignored }) → records a class can wear there, best piece_value first
//   gt_set(name)   → a set's pieces and bonuses (data/gear/sets.json) or null
// A table is stale when it was built for other game data (g_version) or by other scoring code (score_hash: the
// weights and the functions the values come from); it is still served, flagged in the report.
const GT_CACHE = "farmer_gear_table"; // localStorage key: { sha, at, index, slots, sets }
// status: off | loading | loaded (GitHub) | cached (the stored copy) | failed
const gt = { status: "off", index: null, items: null, slots: {}, sets: {}, sha: null, err: null, stale: null, why_stale: [], at: 0, promise: null, note: "" };
// A short hash (FNV-1a, 8 hex) of two values' JSON. tools/gear_table.js uses this same function.
function gt_hash(a, b) {
	const s = JSON.stringify([a || {}, b || {}]);
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
	return h.toString(16).padStart(8, "0");
}
// The game data's version (G.version, else a hash of G.items + G.sets)
const gt_g_version = (g = G) => (g && g.version != null ? String(g.version) : gt_hash(g?.items, g?.sets));
// What the values depend on in this code: the scoring weights and the source of the functions they come from
function gt_score_hash() {
	const fns = [stat_weight, class_stats, item_props, gear_stats, xp_weight, stat_points, gear_score, set_bonus, set_gain, slot_value, slots_for, is_2h,
		odds_grade, item_max_level, upg_odds, cmp_odds, upgrade_scroll].map(String);
	return gt_hash({ w: CFG.gear_w, tank: CFG.gear_tank, tank_mult: CFG.gear_tank_mult, xp: CFG.gear_xp_value, doc: CLASS_DOC, sm: STAT_SCROLL_MULT, u: UPG_ODDS, c: CMP_ODDS }, fns);
}
const gt_repo = () => {
	const fl = typeof window !== "undefined" ? window.farmer_loaded : null;
	return (String(fl?.url || "").match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\//) || [])[1] || CFG.gear_table?.repo;
};
const gt_url = (sha, f) => `https://raw.githubusercontent.com/${gt_repo()}/${sha || "master"}/${CFG.gear_table?.dir || "data/gear"}/${f}`;
async function gt_get(url, headers, as_text) {
	const ctl = typeof AbortController === "function" ? new AbortController() : null;
	const timer = ctl && setTimeout(() => ctl.abort(), CFG.gear_table?.timeout_ms || 15_000);
	try {
		const res = await fetch(url, { cache: "no-store", signal: ctl?.signal, headers });
		if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split("/").pop()}`);
		return as_text ? await res.text() : await res.json();
	} finally { if (timer) clearTimeout(timer); }
}
// The commit to read: the loaded one; else master's newest (GitHub API, as the loader asks); null if that fails
async function gt_commit() {
	const fl = typeof window !== "undefined" ? window.farmer_loaded : null;
	if (typeof fl?.sha === "string" && /^[0-9a-f]{7,40}$/.test(fl.sha)) return fl.sha;
	try {
		const r = String(await gt_get(`https://api.github.com/repos/${gt_repo()}/commits/master`, { Accept: "application/vnd.github.sha" }, true)).trim();
		return /^[0-9a-f]{40}$/.test(r) ? r : null;
	} catch (e) { return null; }
}
const gt_store = () => { try { return typeof window !== "undefined" && window.localStorage ? window.localStorage : null; } catch (e) { return null; } };
function gt_cached() { try { const s = gt_store(); return JSON.parse((s && s.getItem(GT_CACHE)) || "null"); } catch (e) { return null; } }
// A downloaded or cached copy is usable: an index listing slot files, each present with the number of items it lists
const gt_valid = (d) => !!d && typeof d === "object" && !!d.index?.slots && !!d.slots && typeof d.slots === "object" && Object.keys(d.index.slots).length > 0 &&
	Object.keys(d.index.slots).every((s) => d.slots[s] && typeof d.slots[s] === "object" && Object.keys(d.slots[s]).length === d.index.slots[s].items);
// Make a copy the live table (throws on a malformed record: the caller keeps the previous state)
function gt_install(d, status, sha) {
	const items = {}, slots = {};
	for (const s of Object.keys(d.index.slots).sort()) {
		slots[s] = Object.keys(d.slots[s]).sort().map((n) => d.slots[s][n]);
		for (const r of slots[s]) { if (!r || typeof r.name !== "string") throw new Error(`bad record in ${s}`); items[r.name] = r; }
	}
	const why = [], live = gt_g_version(), sh = gt_score_hash();
	if (d.index.g_version != null && String(d.index.g_version) !== live) why.push(`game data ${d.index.g_version}, the game runs ${live}`);
	if (d.index.score_hash && d.index.score_hash !== sh) why.push(`other scoring code (${d.index.score_hash}, this code ${sh})`);
	Object.assign(gt, { status, index: d.index, items, slots, sets: d.sets || {}, sha: sha || null, at: d.at || Date.now(), stale: why.length > 0, why_stale: why });
	if (gt.stale) game_log(`gear table: built for ${why.join("; ")} — still used; values may be off (node tools/gear_table.js rebuilds it)`, C.warn);
}
// Once per load (later calls return the same promise): download index.json, every slot file and sets.json from one
// commit; on any failure use the cached copy. Logs one line either way. Never rejects.
function gear_table_load() {
	if (gt.promise) return gt.promise;
	gt.status = "loading";
	gt.promise = (async () => {
		try {
			if (typeof fetch !== "function") throw new Error("no fetch");
			const sha = await gt_commit();
			const index = await gt_get(gt_url(sha, "index.json"));
			if (!index?.slots || !Object.keys(index.slots).length) throw new Error("index.json lists no slot files");
			const names = Object.keys(index.slots).sort(), slots = {};
			const files = await Promise.all(names.map((s) => gt_get(gt_url(sha, index.slots[s].file || s + ".json"))));
			names.forEach((s, i) => { slots[s] = files[i]?.items; });
			const sets = index.sets ? (await gt_get(gt_url(sha, index.sets)))?.sets || {} : {};
			const d = { index, slots, sets, sha, at: Date.now() };
			if (!gt_valid(d)) throw new Error("a slot file is missing or short of items");
			gt_install(d, "loaded", sha);
			// (with no commit known the files came from master: not cached, since they can't be told apart from a later build)
			if (!sha) gt.note = " (not cached: commit unknown)";
			else try { gt_store()?.setItem(GT_CACHE, JSON.stringify(d)); } catch (e) { gt.note = ` (not cached: ${e?.name || e})`; }
		} catch (e) {
			gt.err = String(e?.message || e);
			try {
				const c = gt_cached();
				if (!gt_valid(c)) throw new Error("no cached copy");
				gt_install(c, "cached", c.sha);
			} catch (e2) { Object.assign(gt, { status: "failed", items: null, slots: {}, sets: {}, index: null, cache_err: String(e2?.message || e2) }); }
		}
		try { game_log(gt_report_text() + gt.note, gt.status === "loaded" && !gt.stale ? C.dim : C.warn); } catch (e) {}
		return gt.status;
	})();
	return gt.promise;
}
const gt_item = (name) => (gt.items && Object.prototype.hasOwnProperty.call(gt.items, name) ? gt.items[name] : null);
const gt_slot = (type) => (gt.slots[type] || []).slice();
const gt_set = (name) => (gt.sets && Object.prototype.hasOwnProperty.call(gt.sets, name) ? gt.sets[name] : null);
// A record's best level for a class in a slot (up to max_level and the piece's own max): { level, value }, null if it
// can't wear it. A weapon in the offhand is worth its value_off (the class's offhand modifier) where the table has one.
function gt_best_level(r, ctype, max_level, slot) {
	const v = (slot === "offhand" && r?.value_off?.[ctype]) || r?.value?.[ctype];
	if (!Array.isArray(v)) return null;
	const top = Math.min(v.length - 1, max_level ?? Infinity);
	let best = null;
	for (let L = 0; L <= top; L++) if (typeof v[L] === "number" && (!best || v[L] > best.value)) best = { level: L, value: v[L] };
	return best;
}
// Records a class can wear in a slot ("ring" or "ring1", "mainhand", "offhand"...), best piece_value at their best
// level (up to max_level) first; each a copy of the record with best: { level, value } added. filter(record) narrows;
// pieces the game flags ignore (test items) only with ignored: true.
function gt_best(ctype, slot, opts = {}) {
	if (!gt.items) return [];
	const want = String(slot).replace(/[12]$/, ""), out = [];
	for (const n of Object.keys(gt.items).sort()) {
		const r = gt.items[n];
		if (r.ignore && !opts.ignored) continue;
		const s_ = (r.slots?.[ctype] || []).find((s) => s === slot || s.replace(/[12]$/, "") === want);
		if (!s_) continue;
		if (opts.filter && !opts.filter(r)) continue;
		const best = gt_best_level(r, ctype, opts.max_level, s_);
		if (best) out.push({ ...r, best });
	}
	return out.sort((a, b) => b.best.value - a.best.value || (a.name < b.name ? -1 : 1));
}
// The report line (facts): "gear table: N items, M slots, built vX (stale|current)"
function gt_report_text() {
	if (!gt.items) return `gear table: ${gt.status === "loading" ? "loading" : gt.status === "off" ? "off" : `not loaded (${gt.err || "?"}; cache: ${gt.cache_err || "none"})`}`;
	const ix = gt.index, b = ix.built_from || "?";
	return `gear table: ${Object.keys(gt.items).length} items, ${Object.keys(gt.slots).length} slots, built v${b}${b !== VERSION ? ` ≠ running v${VERSION}` : ""} (${gt.stale ? "stale" : "current"})` +
		`${gt.stale ? ` [${gt.why_stale.join("; ")}]` : ""} — ${gt.status === "cached" ? `cached copy${gt.sha ? " @" + gt.sha.slice(0, 7) : ""} (GitHub: ${gt.err})` : `GitHub @${gt.sha ? gt.sha.slice(0, 7) : "master"}`}, game data ${ix.g_version}`;
}
if (CFG.gear_table?.enabled) gear_table_load();
