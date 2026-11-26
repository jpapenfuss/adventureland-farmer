// =====================================================================
// Persistence
// =====================================================================
const SAVE_KEY = "farmer_v9:" + character.name; // historical name — don't change it, or saved state is lost
// Saved every 60s, after crafts and gold transfers, and in on_destroy (just before the code stops). Expired pauses and
// cooldowns are dropped on load; stall timers resume where they were (time offline doesn't count against them).
const DATA_V = 2; // bump to clear everything learned, once per character (load_state)
const RATES_V = 2; // bump to clear only the learned rates (spot xp/s, realism), once per character (v25.16)
function save_state() {
	if (typeof set !== "function") return;
	// v: format version (load_state ignores anything else); at: save time (offline time is excluded from stall timers)
	set(SAVE_KEY, { v: 1, at: Date.now(), data_v: DATA_V, rates_v: RATES_V, upg_v: 6, cmp_v: 4, meas_v: 3, key_v: 2, measured: state.measured, measured_gold: state.measured_gold, gold_v: 4, meas_at: state.meas_at, realism: state.realism,
		type_skip: state.type_skip, explore: { tried: state.explore.tried, last_end: state.explore.last_end }, deaths_nc: state.deaths_nc || [],
		cooldown: state.cooldown, cave_block: state.cave_block || null, gear_skip: state.gear_skip, crafted: state.crafted, bank_seen: state.bank_seen,
		guide_ignore: state.guide_ignore, guide_quests: state.guide_quests, qprog: state.qprog, gprog: state.gprog, bank_full_at: state.bank_full_at,
		fetched: state.fetched, fetch_try: state.fetch_try, gold_xfer_at: state.gold_xfer_at || 0,
		last_town: state.last_town || 0, town_end_at: state.town_end_at || 0, town_runs: state.town_runs || [],
		bank_gear: state.bank_gear, bank_dump: state.bank_dump || null, bank_at: state.bank_at || 0, bank_by: state.bank_by || null, guide_equip: state.guide_equip, upg: state.upg, cmp_caps: state.cmp_caps, donated: state.donated, stand: state.stand,
		bank_free: state.bank_free, purge: state.purge, row_fails: state.row_fails, hold_for: state.hold_for,
		mspot: state.mspot, parcel_at: state.parcel_at, travel_off: state.travel_off, travel_full: state.travel_full || null, owe: state.owe || 0, safety_mult: state.safety_mult || 1, safety_at: state.safety_at || 0, hunt_fails: state.hunt_fails || 0,
		skip_why: Object.fromEntries(Object.entries(skip_why).filter(([k]) => skipped(k))) });
}
// v25.56: pack keys gained the monster type ("map:box" → "map:box#type"). A saved key's type is the first farmable
// type of that box in map order that the pick would farm (its own filter: grow, or respawn <= max_respawn and count >=
// min_count) — the one it claimed the box for, so the one a rate, a rest or a death was booked to (Fable: winterland's
// stompy and halloween's fvampire come before wolf and ghost in their boxes); else the first farmable type.
// A key whose box isn't in G.maps (any more) is kept as it was: nothing looks it up.
function migrate_pack_keys(d) {
	const type_of = new Map(), first = new Map();
	each_area((pack, area) => {
		const k = `${area.map}:${area.boundary.join(",")}`, t = pack.type;
		if (!farmable_type(t)) return;
		if (!first.has(k)) first.set(k, t);
		if (!type_of.has(k) && (pack.grow || (expected_respawn(t, pack) <= CFG.max_respawn && pack.count >= CFG.min_count))) type_of.set(k, t);
	});
	for (const [k, t] of first) if (!type_of.has(k)) type_of.set(k, t);
	const conv = (k) => (k.includes("#") || !type_of.has(k) ? k : `${k}#${type_of.get(k)}`);
	const remap = (o, pre = /^/) => {
		if (!o || typeof o !== "object") return o;
		const out = {};
		for (const [k, v] of Object.entries(o)) {
			const m = k.match(pre), head = m ? m[0] : "";
			out[head + conv(k.slice(head.length))] = v;
		}
		return out;
	};
	for (const f of ["measured", "measured_gold", "cooldown"]) d[f] = remap(d[f]);
	d.meas_at = remap(d.meas_at, /^(gp:|gw:|p:|w:)/);
}
function load_state() {
	const d = typeof get === "function" ? get(SAVE_KEY) : null;
	if (!d || d.v !== 1) return;
	// v24.50: one-time clear-out of everything learned so far (owner's instruction). Spot xp/s, the model's realism,
	// damage calibration, flee/death penalties, spot rests, probe verdicts, the safety self-tuning (v25.82: the
	// calibration, penalties and probes are gone; old saves' copies are simply not read)
	// were all gathered while the party wandered, fought with members missing or without their gear, and walked
	// into fights one by one — none of it describes this party farming a camp together. Each character drops it once,
	// the first time it loads this version; quests, bank, gear and town state are kept.
	if (d.data_v !== DATA_V) {
		for (const k of ["measured", "measured_gold", "meas_at", "realism", "cooldown", "safety_mult", "safety_at"]) delete d[k];
		game_log(`farmer v${VERSION}: learned data cleared once (spot rates, rests, the safety self-tuning) — starting clean`, C.warn);
	}
	// v25.16: the owner (2026-11-22): the time estimates were far off — the rates had been measured with the party held
	// for members whose tabs slept, or waiting "in town" at a camp; each of those minutes counted as the camp being slow,
	// and realism scaled every estimate down with it. Spot xp/s and realism are dropped once (calibration, safety and
	// everything else are kept), and re-measured on the seconds the camp itself is responsible for.
	if ((d.rates_v || 1) !== RATES_V) {
		for (const k of ["measured", "meas_at", "realism"]) delete d[k]; // (v25.68: gold totals are kept)
		game_log(`farmer v${VERSION}: learned spot rates and realism cleared once (measured while held for missing members) — re-measuring`, C.warn);
	}
	if ((d.key_v || 1) < 2) migrate_pack_keys(d);
	const now = Date.now(), live = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, t]) => t > now));
	// v23.0: measurements are now in one unit (base xp of kills at the spot); older ones mixed received xp (a share of
	// every party kill) with own kills, so they're dropped once and re-measured
	if (d.meas_v === 3) {
		Object.assign(state.measured, d.measured || {});
		// measurements saved before v24.3 have no time: they start ageing now
		const t0 = Date.now();
		// v25.68 gold_v 3: per-camp totals of looted gold and seconds; earlier gold rates (table values, averaged
		// rates) are another unit and are dropped once
		// v25.76 gold_v 4: v25.68-25.75 totals may hold stray loot (short visits, loot from the last camp): re-measured clean
		if (d.gold_v === 4) for (const [k, m] of Object.entries(d.measured_gold || {})) if (m && m.s >= CFG.measure_min_s) state.measured_gold[k] = m; // (v25.76: totals from under measure_min_s — short visits' stray loot — dropped)
		for (const k in state.measured) { state.meas_at["p:" + k] = d.meas_at?.["p:" + k] || t0; if (d.meas_at?.["w:" + k]) state.meas_at["w:" + k] = d.meas_at["w:" + k]; }
		if (d.realism > 0) state.realism = d.realism;
	} else if (Object.keys(d.measured || {}).length) game_log(`farmer v${VERSION}: pack measurements reset (new unit); re-measuring`, C.dim);
	Object.assign(state.cooldown, live(d.cooldown));
	// v25.82: types skipped after an impossible fight (still running), and the exploration clock and its tried types
	for (const [mt, t] of Object.entries(d.type_skip || {})) if (t > now) state.type_skip[mt] = t;
	if (d.explore?.last_end > 0) state.explore.last_end = d.explore.last_end;
	Object.assign(state.explore.tried, d.explore?.tried || {});
	if (Array.isArray(d.deaths_nc)) state.deaths_nc = d.deaths_nc.filter((t) => now - t < 86_400_000);
	if (d.cave_block) state.cave_block = d.cave_block;
	Object.assign(state.gear_skip, live(d.gear_skip));
	Object.assign(state.crafted, d.crafted || {});
	Object.assign(state.bank_seen, d.bank_seen || {});
	Object.assign(state.guide_ignore, live(d.guide_ignore));
	Object.assign(state.guide_quests, d.guide_quests || {});
	Object.assign(skip_why, d.skip_why || {});
	if (d.bank_full_at) state.bank_full_at = d.bank_full_at;
	Object.assign(state.fetched, d.fetched || {});
	Object.assign(state.fetch_try, d.fetch_try || {});
	if (Array.isArray(d.travel_off)) state.travel_off = d.travel_off;
	if (d.travel_full) state.travel_full = d.travel_full; // v24.27: a reload mid-walk still puts them back on
	if (d.gold_xfer_at) state.gold_xfer_at = d.gold_xfer_at;
	// v19.0: trip timers survive a reload (before, every reload sent everyone to town for deferrable work at once)
	if (d.last_town) state.last_town = d.last_town;
	if (d.town_end_at) state.town_end_at = d.town_end_at;
	if (d.hunt_fails > 0) state.hunt_fails = d.hunt_fails; // v25.59: Daisy's back-off survives a reload
	if (Array.isArray(d.town_runs)) state.town_runs = d.town_runs.filter((t) => now - t < 600_000);
	if (Array.isArray(d.bank_gear)) state.bank_gear = d.bank_gear;
	if (d.bank_dump && typeof d.bank_dump === "object") state.bank_dump = d.bank_dump;
	if (d.bank_at) { state.bank_at = d.bank_at; state.bank_by = d.bank_by || null; }
	if (d.upg?.name) state.upg = d.upg;
	if (d.cmp_caps && typeof d.cmp_caps === "object") state.cmp_caps = d.cmp_caps;
	if (d.donated) state.donated = d.donated;
	if (d.stand) state.stand = d.stand;
	if (d.bank_free) state.bank_free = d.bank_free;
	Object.assign(state.purge, d.purge || {});
	Object.assign(state.row_fails, d.row_fails || {});
	Object.assign(state.hold_for, d.hold_for || {});
	if (d.mspot) state.mspot = d.mspot;
	if (d.parcel_at) state.parcel_at = d.parcel_at;
	if (d.owe > 0) state.owe = d.owe; // potion bills not paid yet (v23.0)
	if (d.safety_mult > 0) { state.safety_mult = d.safety_mult; state.safety_at = d.safety_at || 0; } // v23.5
	Object.assign(state.guide_equip, d.guide_equip || {});
	// guide-row pauses from older versions have no recorded reason and were judged by older rules: retry them now
	if (!d.skip_why) for (const k in state.gear_skip) if (!k.includes(":") || k.startsWith("upgrade:") || k.startsWith("compound:")) delete state.gear_skip[k];
	// v14.1: compounds/upgrades that took longer than 10s were reported as "timeout" and paused 6-24h: retry them
	for (const k in state.gear_skip) if (/timeout|gold_reserve|buy_cost|interrupted/.test(skip_why[k] || "") && /^(cmp:|upg:|upgrade:|compound:)/.test(k)) delete state.gear_skip[k];
	const off = now - (d.at || now);
	if (d.qprog) state.qprog = { ...d.qprog, t: d.qprog.t + off };
	if (d.gprog) state.gprog = { ...d.gprog, t: d.gprog.t + off };
	// v24.82: upgrade ceilings and pauses recorded under the 50%/80% rules go once (a wand "capped at +4" would stay there)
	delete state.gear_skip["town:loop"]; // v24.93: a loop brake from before a reload (usually a new build) doesn't carry over
	// (v25.32: once more — ceilings recorded under the old 75%/80% floors)
	// v25.60: a ceiling recorded for an item with its own (ponty_stock.to) came from the old "wanted" rule — dropped once
	if (d.cmp_v === 3) for (const n in CFG.ponty_stock || {}) if (CFG.ponty_stock[n].to) { delete state.cmp_caps[n]; for (const k in state.gear_skip) if (k.startsWith(compound_key(n, 0).replace(/0$/, ""))) delete state.gear_skip[k]; }
	if (d.cmp_v !== 3 && d.cmp_v !== 4) { state.cmp_caps = {}; for (const k in state.gear_skip) if (k.startsWith("cmp:")) delete state.gear_skip[k]; } // v24.87: caps from the 75% rule
	// (v25.37: a day's input_missing pause sat on the shield with copies in the bank — the upg: pauses are cleared once
	// more; the ceilings only when coming from before v25.32's floors, as before)
	if (d.upg_v !== 6) { state.upg = null; for (const k in state.gear_skip) if (k.startsWith("upg:")) delete state.gear_skip[k]; } // (v25.66: an old multi-level project isn't run)
	game_log(`farmer v${VERSION}: loaded ${Object.keys(state.measured).length} measured packs, ${Object.keys(state.crafted).length} crafts`, C.dim);
}
load_state();
if (typeof setTimeout === "function") setTimeout(() => { try { ask_bank_view(); } catch (e) {} }, 3000); // v25.64: the others' newer bank view
// v24.2: the commit this build came from (loader v2 passes it on); a version number alone can't tell two builds apart
const BUILD = (() => { const s = typeof window !== "undefined" ? window.farmer_loaded?.sha : null; return typeof s === "string" ? s.slice(0, 7) : null; })();
const build_txt = (v, b) => `v${v || "?"}${b ? "@" + b : ""}`;
// Another member runs different code: another version, or the same version from another commit (when both know theirs)
const other_build = (v, b) => v !== VERSION || (!!b && !!BUILD && b !== BUILD);
// v19.2: say which version just started, how it was loaded, and what ran before (per character, in browser storage)
(() => {
	const key = "farmer_ver:" + character.name, prev = typeof get === "function" ? get(key) : null;
	const fl = typeof window !== "undefined" ? window.farmer_loaded : null;
	const how = fl ? (fl.how || "loaded") : "pasted";
	const was = prev?.v ? (prev.v === VERSION ? `same as before` : `was v${prev.v}`) : "first run here";
	game_log(`★ farmer ${build_txt(VERSION, BUILD)} running — ${how}; ${was}`, prev?.v && prev.v !== VERSION ? "#7f7" : fl?.how?.includes("cache") ? "#fa0" : "#8cf");
	if (typeof set === "function") set(key, { v: VERSION, at: Date.now() });
})();
setInterval(() => { save_state(); save_hist(); }, 60_000);
function on_destroy() { save_state(); save_hist(); store_report(); } // the game calls this just before the code is stopped or reloaded
// forget(): clear learned farming data (measurements, danger notes, cooldowns, pauses); craft history is kept
function forget() { Object.assign(state, { measured: {}, measured_gold: {}, meas_at: {}, type_skip: {}, cooldown: {}, gear_skip: {}, realism: 1 }); save_state(); game_log("Learned state cleared"); }
