// =====================================================================
// merchant/5_report.js — merchant only (src/manifest.json): report()'s merchant lines
// =====================================================================
// ---- report() sections of the merchant (v24.96): called from report_facts in order; c = { p: state.pack, d: state.directive, now } ----
function facts_merchant(F, ctx) {
	const { p, d, now } = ctx;
	const f = merchant_job(), D = CFG.merchant.donate;
	if (D && character.level < D.to_level) F("xp", "self", `xp: level ${character.level}, donating gold above ${fmt_k(D.keep)} until level ${D.to_level} (${fmt_k(state.donated && now - state.donated.since < 86_400_000 ? state.donated.g : 0)}/${fmt_k(D.per_day)} today)`);
	const bf = state.bank_free, pend = character.items.filter((i) => i && state.purge[purge_key(i)]).length;
	if (bf) F("bank", "self", `bank: ${bf.free} of ${bf.total} free (seen ${ago(state.bank_at || bf.at)} ago${state.bank_by && state.bank_by !== character.name ? " by " + state.bank_by : ""})${bf.free < bf.total * CFG.merchant.purge_below ? (CFG.sell_junk ? " — purging low-value items" : CFG.merchant.gear_purge?.enabled ? ` — nearly full; ${gear_purge_text()}` : " — nearly full; nothing is sold (sell_junk off)") : ""}${pend ? ` | purge: ${pend} pending` : ""}`);
	// v24.68: everything in the bank (as last seen) and in the merchant's bags, as JSON: "name+level" → count, * = locked
	F("bank_json", "self", state.bank_dump ? `bank JSON (seen ${ago(state.bank_at)} ago${state.bank_by && state.bank_by !== character.name ? " by " + state.bank_by : ""}): ${JSON.stringify(state.bank_dump)}`
		: "bank JSON: nothing recorded yet — it's taken on the next bank visit by any character");
	F("bags_json", "self", `bags JSON: ${JSON.stringify(items_dump(character.items))}`);
	F("bank_classes", "self", bank_classes_text());
	if (merrit_on()) {
		const sp = state.mspot, st = state.stand_since ? Math.round((now - state.stand_since) / 1000) : 0;
		const got = hist.ev.filter((e) => e.type === "parcel" && now - e.t < 86_400_000).reduce((a, e) => a + (e.n || 1), 0);
		F("merrit", "self", `merrit: ${sp ? `spot ${sp.x},${sp.y} (${in_rect(sp.x, sp.y, CFG.merchant.merrit.square) ? "square" : "aisle"})` : "no qualifying spot"} | ${character.stand ? `stand still ${Math.floor(st / 60)}m${st % 60}s${st >= 120 ? " — ready for her" : ""}` : "stand closed"} | parcels 24h: ${got}${state.parcel_at ? `, last ${ago(state.parcel_at)} ago` : ""}${parcel_count() ? ` | holding ${parcel_count()}` : ""}`);
	}
	const ls = Object.values(state.stand).filter((l) => !l.decoy), dc = Object.values(state.stand).find((l) => l.decoy), sold = hist.ev.filter((e) => e.type === "sold" && now - e.t < 86_400_000);
	F("stand", "self", `stand: ${character.stand ? "open" : "closed"}, ${ls.length}/16 listed${ls.length ? ` (${fmt_k(ls.reduce((a, l) => a + l.price * (l.per_unit ? l.q || 1 : 1), 0))} asked)` : ""}${dc ? ` + Merrit's ${dc.name}` : CFG.merchant.stand.decoy ? ` | Merrit's listing: ${skipped("stand:decoy") ? `paused (${skip_why["stand:decoy"] || "?"})` : "not up yet"}` : ""} | sold 24h: ${sold.length}${sold.length ? ` for ${fmt_k(sold.reduce((a, e) => a + (e.price || 0), 0))}` : ""}`);
	F("merchant", "self", `supply: ${state.serving ? "serving " + state.serving : f ? "next: " + f.name + ` (${f.esize} free, pots ${f.pots?.hp}/${f.pots?.mp})` : "idle"} | mluck ${G.skills.mluck && character.level >= (G.skills.mluck.level || 0) ? "on" : `at level ${G.skills.mluck?.level || 40}`}`);
}

// v25.35: the surplus-gear state for the bank line (bank as last seen)
function gear_purge_text() {
	const tk = purge_takers();
	if (!tk) return "surplus gear waits: not every fighter heard from with its gear";
	const ex = gear_excess(state.bank_gear || [], tk), n = [...ex.values()].reduce((a, b) => a + b, 0);
	return n ? `surplus gear to sell: ${n} (${[...ex].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, c]) => `${k.replace(/:(\d+)/, "+$1")} x${c}`).join(", ")}${ex.size > 5 ? "…" : ""})` : "no surplus gear";
}

// v25.78 (owner: "report() include all items in the bank, flagging unclassified items"): every non-stackable bank item
// (stackables stack in one slot forever: left out) by what it is to the party; UNCLASSIFIED = nothing places it yet
function bank_item_class(name, level, locked, takers) {
	const d = G.items[name];
	if (!d) return "UNCLASSIFIED (unknown item)";
	if (locked) return "locked (yours)";
	if (CFG.keep.includes(name)) return "keep-list";
	if (state.upg?.name === name) return "upgrade project";
	const it = { name, level };
	if (GEAR.has(d.type)) {
		const who = takers.filter((m) => gear_gain(it, m.ctype, m.g)).map((m) => m.name);
		if (who.length) return `upgrade now for ${who.join("/")}`;
		if (!takers.some((m) => slots_for(name, m.ctype, m.g).length)) return "no party class can use";
		if (d.set && G.sets?.[d.set] && Array.isArray(d.class)) return `set piece (${d.set})`;
		if (d.compound && compound_groups().some((g) => g.name === name && g.level === level)) return "compound set copy";
		if (!recipe_lv) gear_protected({ name: "" }, takers); // (fills recipe_lv)
		if (recipe_lv?.get(name)?.has(level)) return "recipe input";
		if (gear_useful(name, Math.max(7, level), takers)) return "useful once upgraded";
		return "surplus gear (no fighter would wear it at any level)";
	}
	if (d.e || d.quest) return "exchange / quest turn-in";
	if (state.needs.has(name)) return "needed (quest / guide)";
	return "UNCLASSIFIED";
}
function bank_classes_text() {
	const dump = state.bank_dump;
	if (!dump) return "bank items: nothing recorded yet";
	const takers = purge_takers() || gear_takers().filter((m) => m.ctype !== "merchant");
	const by = {};
	for (const [k, q] of Object.entries(dump)) {
		const m = k.match(/^(.+?)(?:\+(\d+))?(\*)?$/), name = m[1], level = +(m[2] || 0);
		if (G.items[name]?.s) continue; // stackable
		const c = bank_item_class(name, level, !!m[3], takers);
		(by[c] = by[c] || []).push(`${name}${level ? "+" + level : ""}${q > 1 ? " x" + q : ""}`);
	}
	const order = Object.keys(by).sort((a, b) => (b.startsWith("UNCLASSIFIED") ? 1 : 0) - (a.startsWith("UNCLASSIFIED") ? 1 : 0) || a.localeCompare(b));
	return `bank items, non-stackable (seen ${ago(state.bank_at)} ago): ` + (order.map((c) => `${c}: ${by[c].join(", ")}`).join(" | ") || "none");
}
