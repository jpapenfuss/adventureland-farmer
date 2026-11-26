// =====================================================================
// shared/19_gear_table.js — the prebuilt gear table (v25.81): every equipment piece in the game, by slot type
// =====================================================================
// data/gear/*.json is built offline from the game's data.js by tools/gear_table.js with this bot's own functions
// (stats per level, piece_value per class and level, upgrade/compound odds, where each piece comes from: shops,
// crafts, exchange boxes, drops, tokens) and committed to the repo. It is fetched once per load from GitHub at the
// commit this code was loaded from (window.farmer_loaded.sha; master if unknown), and the last good copy is kept in
// the browser (localStorage) for when GitHub can't be reached. Static facts only: nothing here is computed at run time.
//   gt_item(name)  → its record or null        gt_slot(type) → the records of one slot file ([] if none)
//   gt_best(ctype, slot, { max_level, filter }) → records a class can wear there, best piece_value first
//   gt_set(name)   → a set's pieces and bonuses (data/gear/sets.json) or null
const GT_CACHE = "farmer_gear_table"; // localStorage key: { sha, at, index, slots, sets }
// status: off | loading | loaded (GitHub) | cached (the stored copy) | failed; stale: the table's g_version ≠ the live G's
const gt = { status: "off", index: null, items: null, slots: {}, sets: {}, sha: null, from: null, err: null, stale: null, at: 0, promise: null };
// A short hash of the game's item and set data (FNV-1a, 8 hex): the table's g_version when G has no version number.
// tools/gear_table.js uses this same function.
function gt_hash(items, sets) {
	const s = JSON.stringify([items || {}, sets || {}]);
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
	return h.toString(16).padStart(8, "0");
}
const gt_g_version = (g = G) => (g && g.version != null ? String(g.version) : gt_hash(g?.items, g?.sets));
// Where the files are: raw GitHub at the loaded commit (its repo from the loader's url when it names one)
function gt_base() {
	const fl = typeof window !== "undefined" ? window.farmer_loaded : null, T_ = CFG.gear_table || {};
	const sha = typeof fl?.sha === "string" && /^[0-9a-f]{7,40}$/.test(fl.sha) ? fl.sha : null;
	const repo = (String(fl?.url || "").match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\//) || [])[1] || T_.repo;
	return { sha, url: `https://raw.githubusercontent.com/${repo}/${sha || "master"}/${T_.dir || "data/gear"}/` };
}
async function gt_get_json(url) {
	const ctl = typeof AbortController === "function" ? new AbortController() : null;
	const timer = ctl && setTimeout(() => ctl.abort(), CFG.gear_table?.timeout_ms || 15_000);
	try {
		const res = await fetch(url, { cache: "no-store", signal: ctl?.signal });
		if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split("/").pop()}`);
		return await res.json();
	} finally { if (timer) clearTimeout(timer); }
}
const gt_store = () => { try { return typeof window !== "undefined" && window.localStorage ? window.localStorage : null; } catch (e) { return null; } };
function gt_cached() { try { const s = gt_store(); return JSON.parse((s && s.getItem(GT_CACHE)) || "null"); } catch (e) { return null; } }
// A downloaded or cached copy is usable: an index listing slot files, and every one of them present
const gt_valid = (d) => !!d && typeof d === "object" && !!d.index?.slots && typeof d.slots === "object" &&
	Object.keys(d.index.slots).length > 0 && Object.keys(d.index.slots).every((s) => d.slots[s] && typeof d.slots[s] === "object");
function gt_install(d, status, sha) {
	const items = {}, slots = {};
	for (const s of Object.keys(d.index.slots).sort()) {
		slots[s] = Object.keys(d.slots[s]).sort().map((n) => d.slots[s][n]);
		for (const r of slots[s]) items[r.name] = r;
	}
	const live = gt_g_version();
	Object.assign(gt, { status, index: d.index, items, slots, sets: d.sets || {}, sha: sha || null, at: d.at || Date.now(),
		stale: d.index.g_version != null && String(d.index.g_version) !== live });
	if (gt.stale) game_log(`gear table: built for game data ${d.index.g_version}, the game runs ${live} — still used; values may be off (node tools/gear_table.js rebuilds it)`, C.warn);
}
// Once per load (later calls return the same promise): download index.json, every slot file and sets.json; on any
// failure use the cached copy. Logs one line either way.
function gear_table_load() {
	if (gt.promise) return gt.promise;
	gt.status = "loading";
	gt.promise = (async () => {
		const b = gt_base();
		let note = "";
		try {
			if (typeof fetch !== "function") throw new Error("no fetch");
			const index = await gt_get_json(b.url + "index.json");
			if (!index?.slots || !Object.keys(index.slots).length) throw new Error("index.json lists no slot files");
			const names = Object.keys(index.slots).sort(), slots = {};
			const files = await Promise.all(names.map((s) => gt_get_json(b.url + (index.slots[s].file || s + ".json"))));
			names.forEach((s, i) => { slots[s] = files[i]?.items || {}; });
			const sets = index.sets ? (await gt_get_json(b.url + index.sets))?.sets || {} : {};
			const d = { index, slots, sets, sha: b.sha, at: Date.now() };
			if (!gt_valid(d)) throw new Error("a slot file is missing or empty");
			gt_install(d, "loaded", b.sha);
			try { gt_store()?.setItem(GT_CACHE, JSON.stringify(d)); } catch (e) { note = ` (not cached: ${e?.name || e})`; }
		} catch (e) {
			gt.err = String(e?.message || e);
			const c = gt_cached();
			if (gt_valid(c)) gt_install(c, "cached", c.sha);
			else gt.status = "failed";
		}
		game_log(gt_report_text() + note, gt.status === "loaded" ? C.dim : C.warn);
		return gt.status;
	})();
	return gt.promise;
}
const gt_item = (name) => (gt.items && Object.prototype.hasOwnProperty.call(gt.items, name) ? gt.items[name] : null);
const gt_slot = (type) => (gt.slots[type] || []).slice();
const gt_set = (name) => (gt.sets && Object.prototype.hasOwnProperty.call(gt.sets, name) ? gt.sets[name] : null);
// A record's best level for a class (up to max_level and the piece's own max): { level, value }, null if it can't wear it
function gt_best_level(r, ctype, max_level) {
	const v = r?.value?.[ctype];
	if (!Array.isArray(v)) return null;
	const top = Math.min(v.length - 1, max_level ?? Infinity);
	let best = null;
	for (let L = 0; L <= top; L++) if (typeof v[L] === "number" && (!best || v[L] > best.value)) best = { level: L, value: v[L] };
	return best;
}
// Records a class can wear in a slot ("ring" or "ring1", "mainhand", "offhand"...), best piece_value at their best
// level (up to max_level) first; each a copy of the record with best: { level, value } added. filter(record) narrows.
function gt_best(ctype, slot, opts = {}) {
	if (!gt.items) return [];
	const want = String(slot).replace(/[12]$/, ""), out = [];
	for (const n of Object.keys(gt.items).sort()) {
		const r = gt.items[n];
		if (!(r.slots?.[ctype] || []).some((s) => s === slot || s.replace(/[12]$/, "") === want)) continue;
		if (opts.filter && !opts.filter(r)) continue;
		const best = gt_best_level(r, ctype, opts.max_level);
		if (best) out.push({ ...r, best });
	}
	return out.sort((a, b) => b.best.value - a.best.value || (a.name < b.name ? -1 : 1));
}
// The report line (facts): "gear table: N items, M slots, built vX (stale|current)"
function gt_report_text() {
	if (!gt.items) return `gear table: ${gt.status === "loading" ? "loading" : gt.status === "off" ? "off" : `not loaded (${gt.err || "?"}; no cached copy)`}`;
	const ix = gt.index;
	return `gear table: ${Object.keys(gt.items).length} items, ${Object.keys(gt.slots).length} slots, built v${ix.built_from || "?"} (${gt.stale ? "stale" : "current"})` +
		` — ${gt.status === "cached" ? `cached copy${gt.sha ? " @" + gt.sha.slice(0, 7) : ""} (GitHub: ${gt.err})` : `GitHub @${gt.sha ? gt.sha.slice(0, 7) : "master"}`}, game data ${ix.g_version}`;
}
if (CFG.gear_table?.enabled) gear_table_load();
