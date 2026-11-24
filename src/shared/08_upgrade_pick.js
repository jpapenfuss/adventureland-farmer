// =====================================================================
// shared/08_upgrade_pick.js — own upgrading: which piece to take how far, odds, costs (CFG.upgrade_auto)
// =====================================================================
// ---- Own upgrading (CFG.upgrade_auto) ----
// Highest level ≤ upgrade_max_level reachable with scroll0/scroll1 (0 = none)
// high: also scroll2 levels, up to upgrade_high.max_level (any slot since v25.38; a weapon stops at upgrade_weapon.to)
function upgrade_target(name, high = false) {
	let to = 0;
	const max = high ? CFG.upgrade_high.max_level : CFG.upgrade_max_level;
	for (let l = 1; l <= max; l++) {
		const sc = upgrade_scroll(name, l - 1);
		if ((sc === "scroll2" && !high) || sc === "scroll3" || !G.items[sc]) break;
		to = l;
	}
	return to;
}
// v25.46: the gold an upgrade or compound never spends: the role's reserve (gold_keep(), a role function), and for the
// merchant at least CFG.upgrade_keep (a fighter holds ~fund_keep; a 1M floor would stop its own projects)
const upgrade_keep = () => (is_merchant() ? Math.max(gold_keep(), CFG.upgrade_keep) : gold_keep());
// A step's gold is there: ours minus the step stays at or above upgrade_keep() (v25.46: no earnings test)
const upg_gold_ok = (cost) => character.gold - (cost || 0) >= upgrade_keep();
// Gold a project may draw on: our own above upgrade_keep(); the merchant also counts fighters' gold above fund_keep
// (they send it on supply runs when a step needs it). v25.46: this is the whole budget — no gold_room() (recent
// earnings) and no spend fraction; "vgloves+3 expected cost 5.6M, budget 460k" held every upgrade back.
function upgrade_gold() {
	let g = character.gold - upgrade_keep();
	g += fund_pool(); // role function (v25.11): the merchant counts the fighters' gold above fund_keep
	return Math.max(0, g);
}
// Gold for a +0 copy and the scrolls up to `to` (no failures counted)
function upgrade_cost(name, to) {
	let c = G.items[name]?.g || 0;
	for (let l = 0; l < to; l++) c += G.items[upgrade_scroll(name, l)]?.g || 1e9;
	return c;
}
// Upgrade ceilings (v24.5): item -> { level, at } where a project of it was stopped by its odds or its failures.
// Kept 7 days (saved). A re-pick aims no higher, and is skipped while a copy at that level exists anywhere.
const upg_cap = (name, level) => { state.upg_caps[name] = { level, at: Date.now() }; };
const upg_cap_level = (name) => { const c = state.upg_caps[name]; return c && Date.now() - c.at < 7 * 86400_000 ? c.level : Infinity; };
const best_level_held = (name) => character.items.reduce((m, i) => (i && i.name === name && !i.l ? Math.max(m, i.level || 0) : m), -1);
// Best project: the NPC-sold piece whose upgraded copy beats a member's worn piece by the most points per gold
// v24.82: the server's base upgrade odds by the item's starting grade (design/upgrades.py), result level 1..10
const UPG_ODDS = { 0: [0.9999999, 0.98, 0.95, 0.70, 0.60, 0.40, 0.25, 0.15, 0.07, 0.024], 1: [0.99998, 0.97, 0.94, 0.68, 0.58, 0.38, 0.24, 0.14, 0.066, 0.018],
	2: [0.97, 0.94, 0.92, 0.64, 0.52, 0.32, 0.232, 0.13, 0.062, 0.015] };
const upg_odds = (name, to) => (UPG_ODDS[Math.min(2, Math.max(0, item_grade({ name, level: 0 })))] || UPG_ODDS[0])[to - 1] || 0;
// Expected gold for one copy at +to, buying again after each failure: C(l) = (C(l-1) + scroll) / odds(l)
function upgrade_expected(name, to) {
	let c = G.items[name]?.g || 0;
	for (let l = 1; l <= to; l++) c = (c + (G.items[upgrade_scroll(name, l - 1)]?.g || 1e9)) / Math.max(0.01, upg_odds(name, l));
	return Math.round(c);
}
// The most one step of a project can cost: the scroll (the next one up when the boost is used) and a copy if none is held
const upg_step_cost = (name, top) => {
	const lv = Math.max(0, top), g = Math.max(0, item_grade({ name, level: lv }));
	return (G.items["scroll" + (g + 1)]?.g <= (CFG.upgrade_boost_max || 0) ? G.items["scroll" + (g + 1)].g : G.items["scroll" + g]?.g || 0) + (top < 0 ? G.items[name]?.g || 0 : 0);
};
// v25.17: the best level of a copy we own, in the bags (unlocked) or (last seen) in the bank; not a titled one, in either
// (the project's bank fetch skips titled copies too); -1 if none
const owned_level = (name) => Math.max(-1, ...character.items.filter((i) => i && i.name === name && !i.l && !i.p).map((i) => i.level || 0),
	...(state.bank_gear || []).filter((i) => i.name === name && !i.p).map((i) => i.level || 0));
// v25.19: the highest level a project of this piece will actually be taken to: each step's base odds (lifted by the next
// scroll up where run_upgrade would use it: not for shop pieces, that scroll at most upgrade_boost_max) at or over the
// floor run_upgrade applies (chance_floor; a second copy owned — bags or bank — counts as a spare). The planner aimed
// past it: xmasshoes was taken to +4, then refused +5 (73% < 80%) — gold spent short of the level that was the upgrade.
function upg_reach(name) {
	const base = chance_floor(name, CFG.min_upgrade_chance), shop = shop_for(name) && !G.items[name]?.cash;
	const copies = character.items.filter((i) => i && i.name === name && !i.l && !i.p).length + (state.bank_gear || []).filter((i) => i.name === name && !i.p).length;
	const floor0 = !shop && copies >= 2 ? Math.min(base, CFG.min_chance_spare) : base;
	let L = 0;
	for (let l = 1; l <= 12; l++) {
		let p = upg_odds(name, l);
		// a scroll2 step, or (v25.32) one past upgrade_max_level: run_upgrade raises the floor to upgrade_high.min_chance
		const floor = upgrade_scroll(name, l - 1) === "scroll2" || l > CFG.upgrade_max_level ? Math.max(floor0, CFG.upgrade_high?.min_chance || 0) : floor0;
		const hc = G.items["scroll" + (Math.max(0, item_grade({ name, level: l - 1 })) + 1)]?.g;
		if (!shop && hc && hc <= (CFG.upgrade_boost_max || 0)) p = Math.min(1, p * 1.2 + 0.01);
		if (p < floor) break;
		L = l;
	}
	return L;
}
// Is it sold by an NPC we can find? (cached: G doesn't change)
const sold_c = new Map();
const sold_by_npc = (name) => { if (!sold_c.has(name)) sold_c.set(name, !!shop_for(name)); return sold_c.get(name); };
function pick_upgrade() {
	const budget = upgrade_gold(), H = CFG.upgrade_high;
	if (!CFG.upgrade_auto) return null; // (v24.86: a budget at 0 still lets weapon projects through; the rest fail cost > cap)
	const takers = gear_takers().filter((m) => m.ctype !== "merchant");
	let best = null;
	for (const name in G.items) {
		const def = G.items[name];
		if (!def.upgrade || !GEAR.has(def.type) || def.cash || skipped("upg:" + name) || CFG.quest_craft_skip.includes(name)) continue;
		// v24.71: only what an NPC sells. The check used to come after the winner was chosen — over every item in the
		// game: when a piece nobody sells scored best (pyjamas, for Torlis), there was no project at all, ever.
		// v25.17: or a copy we own (bags, or the bank: fetched for the project, upgin:) — the fighters' own pieces (a set
		// piece, a token buy) are the merchant's projects now; they reach it through the bank or share_gear
		const own_lv = owned_level(name);
		if (!sold_by_npc(name) && own_lv < 0) continue;
		// normal target (scroll0/1 levels) and, for weapon slots, the high target (scroll2 levels too)
		const targets = [];
		const WP = CFG.upgrade_weapon?.enabled && def.type === "weapon" ? Math.min(CFG.upgrade_weapon.to, upgrade_target(name)) : 0;
		if (WP) targets.push([WP, Infinity, false, true]); // v24.86: a weapon goes straight to +7, no budget
		// v24.82: every level, by expected cost. v25.38 (owner: "We cannot progress in this game without equipment upgrades.
		// It must happen."): scroll2 levels too, for every slot, judged like the rest — expected cost (failures counted)
		// against gain x upgrade_gold_per_pt. Before, a scroll2 project was weapon/offhand only, costed without failures,
		// and only when nothing else was worth doing: the set pieces at grade 2 from +0 (gphelmet, frankypants, vgloves)
		// were never projects. A weapon still stops at +7 (owner).
		const T0 = upgrade_target(name), TH = H?.enabled ? Math.max(T0, Math.min(upgrade_target(name, true), def.type === "weapon" ? CFG.upgrade_weapon?.to ?? 7 : Infinity)) : T0;
		for (let L = 1; L <= TH; L++) if (!(WP && L <= WP)) targets.push([L, budget, L > T0]);
		const capL = Math.min(upg_cap_level(name), upg_reach(name)); // v25.19: and no higher than the run will go
		for (let [to, cap, high, weapon] of targets) {
			if (to > capL) to = capL; // v24.5: no higher than a past project of it reached before its odds/failures stopped it
			if (!to) continue;
			if (own_lv >= to) continue;
			// v25.17: from our copy, only the steps above its level (a lost copy of a piece no NPC sells can't be rebought:
			// the project ends there)
			const cost = own_lv >= 0 ? Math.max(0, upgrade_expected(name, to) - upgrade_expected(name, own_lv)) : upgrade_expected(name, to);
			if (cost > cap) continue;
			// a copy at the target level already exists: ours, the bank's, or (v23.2) in another member's bags or worn
			// (v24.74: a copy another member WEARS no longer counts — a wand+7 on one caster blocked the other's for good)
			if (best_level_held(name) >= to || (state.bank_gear || []).some((i) => i.name === name && (i.level || 0) >= to) || party_holds_level(name, to, true)) continue;
			// v24.7: a lower copy that's already an upgrade for a fighter is delivered first (then judged against): a project
			// held it as its input, undelivered, and rolled it at 50% odds
			const ready = (i) => i && i.name === name && !i.l && (i.level || 0) < to && takers.some((m) => gear_gain(i, m.ctype, m.g));
			if (character.items.some(ready) || (state.bank_gear || []).some(ready)) continue;
			for (const m of takers) {
				const r = gear_gain({ name, level: to }, m.ctype, m.g);
				if (!r) continue;
				// worth (gain x gold per point) less the expected cost
				const v = weapon ? 1e12 + r.gain : r.gain * CFG.upgrade_gold_per_pt - cost;
				if (!weapon && v <= 0) continue;
				if (!best || v > best.v) best = { name, to, for: m.name, slot: r.slot, gain: Math.round(r.gain), cost, v, high, weapon: !!weapon, ...(own_lv >= 0 ? { from_copy: own_lv } : {}) };
			}
		}
	}
	// v25.39 (owner: the easy, reliable upgrades must happen): a fighter's WORN piece, when we have no spare copy of it —
	// Aspernari's mpgloves/mppants +0 → +3 at 97%/94% for ~140k (+7.2 pts each) were never done, only because projects
	// never touched worn gear. Only steps whose base odds are at least upgrade_worn.min_chance (a failure destroys what
	// the fighter wears); the fighter hands the piece over in town (want_worn in our heartbeat), we upgrade it, and the
	// result goes back as a delivery (it beats what's in that slot then).
	const W = CFG.upgrade_worn;
	if (W?.enabled && is_merchant()) for (const m of takers) for (const [slot, it] of Object.entries(m.p?.worn || {})) {
		const def = it && G.items[it.name];
		// (never a weapon or offhand: the fighter would fight without it until the party is back in town — Fable)
		if (slot === "mainhand" || slot === "offhand" || def?.type === "weapon") continue;
		if (!def?.upgrade || !GEAR.has(def.type) || def.cash || it.p || it.l || skipped("upg:" + it.name) || CFG.quest_craft_skip.includes(it.name)) continue;
		if (owned_level(it.name) >= 0 || state.upg?.name === it.name) continue; // a spare copy: the normal project (above)
		const lw = it.level || 0;
		const T = Math.min(Math.max(upgrade_target(it.name), CFG.upgrade_high?.enabled ? upgrade_target(it.name, true) : 0), upg_cap_level(it.name));
		for (let L = lw + 1; L <= T; L++) {
			if (upg_odds(it.name, L) < W.min_chance) break;
			const cost = Math.max(0, upgrade_expected(it.name, L) - upgrade_expected(it.name, lw));
			if (cost > budget) break;
			const r = gear_gain({ name: it.name, level: L }, m.ctype, m.g);
			if (!r) continue;
			const v = r.gain * CFG.upgrade_gold_per_pt - cost;
			if (v > 0 && (!best || (!best.weapon && v > best.v)))
				best = { name: it.name, to: L, for: m.name, slot, gain: Math.round(r.gain), cost, v, high: L > upgrade_target(it.name), weapon: false, from_copy: lw,
					worn: { who: m.name, slot, level: lw, stat_type: it.stat_type || null, at: Date.now() } };
		}
	}
	return best;
}
// Why there's no project (report): our own pieces that would win once upgraded, and the best shop pieces with what
// stops each
function upgrade_why() {
	const out = [];
	if (!is_merchant() && !merchant_does_it()) { // v25.17: with the merchant online, our pieces are its projects
		const own = [...character.items.filter((i) => i && !i.l && GEAR.has(G.items[i.name]?.type)).map((i) => [i, "bags"]), ...(state.bank_gear || []).map((i) => [i, "bank"])]
			.map(([i, w]) => [i, w, set_piece_plan(i.name, i.level || 0)]).filter(([, , pl]) => pl).sort((a, b) => b[2].gain - a[2].gain)[0];
		out.push(own ? `ours next: ${own[0].name}+${own[0].level || 0} (${own[1]}) → +${own[2].to} (+${own[2].gain} pts)` : "nothing we own would win once upgraded");
	}
	if (!merchant_does_it()) { // the merchant, or a fighter while it is away
		const budget = upgrade_gold(), takers = gear_takers().filter((m) => m.ctype !== "merchant"), rows = [];
		for (const name in G.items) {
			const def = G.items[name];
			// v25.32: and the copies we own (bags/bank) — the merchant's projects since v25.17, missing from this line:
			// "no upgradable piece" while owned set pieces were the candidates
			const own_lv = owned_level(name);
			if (!def.upgrade || !GEAR.has(def.type) || def.cash || (!sold_by_npc(name) && own_lv < 0)) continue;
			let g = null, to = 0, cost = 0, best_any = null; // best_any: the biggest gain at any level, worth its cost or not
			for (let L = Math.max(1, own_lv + 1), T = Math.min(CFG.upgrade_high?.enabled ? Math.max(upgrade_target(name), upgrade_target(name, true)) : upgrade_target(name), upg_reach(name)); L <= T; L++) for (const m of takers) {
				const r = gear_gain({ name, level: L }, m.ctype, m.g), c = own_lv >= 0 ? Math.max(0, upgrade_expected(name, L) - upgrade_expected(name, own_lv)) : upgrade_expected(name, L);
				if (r && (!best_any || r.gain > best_any.gain)) best_any = { gain: r.gain, who: m.name, to: L, cost: c };
				if (r && r.gain * CFG.upgrade_gold_per_pt - c > 0 && (!g || r.gain * CFG.upgrade_gold_per_pt - c > g.net)) { g = { gain: r.gain, who: m.name, net: r.gain * CFG.upgrade_gold_per_pt - c }; to = L; cost = c; }
			}
			// v25.61: a piece that wins but not by enough for its cost is listed too (the line said "no upgradable piece" with
			// nothing to show why)
			if (!g) { if (best_any) rows.push({ name, to: best_any.to, g: best_any, poor: true, stop: `${own_lv >= 0 ? `ours +${own_lv}: ` : ""}not worth it (× ${fmt_k(CFG.upgrade_gold_per_pt)}/pt < expected cost ${fmt_k(best_any.cost)})` }); continue; }
			const ready = (i) => i && i.name === name && !i.l && (i.level || 0) < to && takers.some((m) => gear_gain(i, m.ctype, m.g));
			const stop = skipped("upg:" + name) ? `paused (${skip_why["upg:" + name] || "?"})` : to > upg_cap_level(name) ? `a past project stopped at +${upg_cap_level(name)}`
				: cost > budget ? `expected cost ${fmt_k(cost)}, budget ${fmt_k(Math.max(0, budget))}`
				: best_level_held(name) >= to || (state.bank_gear || []).some((i) => i.name === name && (i.level || 0) >= to) || party_holds_level(name, to, true) ? "a spare copy at that level exists already"
				: character.items.some(ready) || (state.bank_gear || []).some(ready) ? "a lower copy goes to the fighter first"
				: "eligible";
			rows.push({ name, to, g, stop: own_lv >= 0 ? `ours +${own_lv}: ${stop}` : stop });
		}
		rows.sort((a, b) => (a.poor ? 1 : 0) - (b.poor ? 1 : 0) || b.g.gain - a.g.gain); // (worth-it rows first — Fable)
		// (v25.61: the best few, and the reach limits — a piece whose next levels fall under the odds floors never shows)
		const who = `judged for ${takers.map((m) => m.name).join(", ") || "no fighter's gear (no heartbeat with gear)"}`;
		out.push(rows.length ? `candidates (${who}): ${rows.slice(0, 6).map((r) => `${r.name}+${r.to} for ${r.g.who} +${Math.round(r.g.gain)} pts — ${r.stop}`).join("; ")}` : `no upgradable piece (shop or ours) at its reachable level beats what anyone wears (${who})`);
	}
	return out.length ? ` | ${out.join(" | ")}` : "";
}
// v24.91: is the project still worth finishing — would its target still beat what its member wears? (Sanala kept
// building a wand to +3, a project from when she held a +5 staff, after she had been handed a +7 wand.)
function upg_still_wanted(P) {
	if (!P) return false;
	const m = gear_takers().find((x) => x.name === P.for);
	if (!m || !m.g?.w) return true; // its member isn't heard from: keep it for now
	return !!gear_gain({ name: P.name, level: P.to }, m.ctype, m.g);
}
function upg_drop_if_stale() {
	const P = state.upg;
	if (!P || upg_still_wanted(P)) return false;
	game_log(`upgrade project dropped: ${P.name} +${P.to} would no longer beat what ${P.for} wears`, C.dim);
	log_ev("upgrade_drop", { item: P.name, to: P.to, for: P.for });
	state.upg = null; state.upg_pick_at = 0;
	return true;
}
// Is there upgrade work for a town run? Picks a project (every 10 min at most) when there's none.
// v25.48: every party member heard from (fresh heartbeat) — their gear and gold are known
// (v25.49, Fable: per member, for 3 min — after our load for one never heard from, after its last beat for one that
// went quiet (a fighter's reload); a member offline for long mustn't keep an unfundable project or a pick every
// minute going forever)
const party_heard = () => (CFG.party.members || []).every((n) => {
	const p = state.partners[n];
	return n === character.name || fresh(p) || Date.now() - (p ? p.t : seen.since) > 180_000;
});
function upgrade_due() {
	if (!CFG.upgrade_auto) return false;
	upg_drop_if_stale(); // v24.91
	set_piece_start(); // v24.69: a set piece in our bags that wins once upgraded
	if (merchant_does_it()) {
		// v21.2: the merchant runs projects now; a fighter's own one would sit forever, holding its copies in the bags.
		// v25.17 (owner: "make the merchant do it"): our own ones too (a set piece, a token buy) — the copy is no longer
		// kept, so it goes to the merchant (share_gear) or the bank, and the merchant picks it as a project from there
		if (state.upg) { game_log(`upgrade project ${state.upg.name} handed to the merchant`, C.dim); state.upg = null; }
		return false;
	}
	const now = Date.now();
	if (!state.upg && now - (state.upg_pick_at || 0) > 600_000) {
		state.upg_pick_at = now;
		state.upg = pick_upgrade();
		// v25.48: nothing found while a party member's heartbeat (its worn gear) is missing — right after a reload —
		// is retried in 1 min, not 10: the 2:57 report showed "no project" beside an eligible vgloves+3
		if (!state.upg && !party_heard()) state.upg_pick_at = now - 540_000;
		if (state.upg) game_log(`upgrade project: ${state.upg.name} → +${state.upg.to} for ${state.upg.for}'s ${state.upg.slot} (+${state.upg.gain} pts, ~${Math.round(state.upg.cost / 1000)}k)`, C.info);
	}
	if (merchant_awaits_funds()) return false; // v25.5: merchant/
	if (worn_waiting()) return false; // v25.39: the fighter hasn't handed its piece over yet
	return !!state.upg && !skipped("upg:" + state.upg.name) && best_level_held(state.upg.name) < state.upg.to;
}
// v25.17: the project's best copy lies in the bank (a piece we own: the bank step comes after this one in a town run,
// and run_upgrade only looks in the bags) → fetch it first. Gone from the bank (bank_gear is last seen) and no NPC sells
// one: the project ends, it isn't paused for a day on "input_missing". → false to stop this run
async function upg_fetch_copy(P) {
	const have = best_level_held(P.name);
	const b = CFG.bank && (state.bank_gear || []).filter((i) => i.name === P.name && !i.p && (i.level || 0) < P.to && (i.level || 0) > have).sort((x, y) => (y.level || 0) - (x.level || 0))[0];
	if (!b) return true;
	// a failed bank visit pauses the project 10 min (any reason: an unknown one mustn't end it and forget the copy)
	try { await task_bank([{ name: P.name, level: b.level || 0, exact: true, ...(b.stat_type ? { stat_type: b.stat_type } : {}), key: `upgin:${P.name}` }]); }
	catch (e) { skip("upg:" + P.name, 600_000, "bank: " + why(e)); game_log(`upgrade ${P.name}: fetching its copy from the bank: ${why(e)}; retrying in 10 min`, C.dim); return false; }
	// v25.37 (Fable): the copy didn't arrive — drop it from the record by name and level (remember_bank rebuilt the
	// array, so the identity filter missed it), or every failed step walked to the bank for it again
	const got = best_level_held(P.name) > have;
	if (!got) state.bank_gear = (state.bank_gear || []).filter((i) => !(i.name === P.name && (i.level || 0) === (b.level || 0) && !i.p));
	if (got || best_level_held(P.name) >= 0 || sold_by_npc(P.name)) return true;
	game_log(`upgrade ${P.name}: the copy isn't in the bank any more, and no NPC sells one — project ended`, C.dim);
	state.upg = null; state.upg_pick_at = 0;
	return false;
}
// v25.39: a worn-piece project waiting for its hand-over (true), received (got set), or given up after wait_ms
function worn_waiting() {
	const P = state.upg, W = P?.worn;
	if (!W || W.got) return false;
	if (best_level_held(P.name) >= W.level) { W.got = Date.now(); game_log(`upgrade: ${W.who} handed over its ${P.name}+${W.level}`, C.info); return false; }
	if (Date.now() - (W.at || 0) > (CFG.upgrade_worn?.wait_ms || 1_800_000)) {
		game_log(`upgrade project ${P.name}: ${W.who} didn't hand its piece over in time; dropped`, C.dim);
		skip("upg:" + P.name, 3600_000, "worn piece not handed over");
		state.upg = null; state.upg_pick_at = 0;
		return false;
	}
	town_reason.upgrade = `waiting for ${W.who} to hand over its ${P.name}+${W.level} (we go to it)`;
	return true;
}
async function task_upgrade() {
	let n = 0;
	if (state.upg && merchant_does_it()) { game_log(`upgrade project ${state.upg.name} handed to the merchant`, C.dim); state.upg = null; return 0; }
	if (state.upg && !(await upg_fetch_copy(state.upg))) return 0;
	for (let i = 0; i < upgrade_steps(); i++) { // role function (v25.11)
		if (state.errand) state.errand_at = Date.now();
		if (upg_drop_if_stale()) break; // v24.91: something better is worn now
		const P = state.upg;
		if (!P) break;
		if (merchant_does_it()) { game_log(`upgrade project ${P.name} handed to the merchant`, C.dim); state.upg = null; break; } // v25.17: it came online
		// v25.37: a failed step destroyed the copy in the bags — the next best is fetched from the bank before the next step.
		// (The fetch ran only at the start of a run, so the next step found no copy: input_missing ended the shield project
		// with a shield+3 and a +0 in the bank, and paused it a day — 7:29 PM report.)
		// (and whenever the bank holds a better copy below the target than the bags: a +0 left in the bags isn't rolled
		// while the bank has the +3)
		if ((state.bank_gear || []).some((i) => i.name === P.name && !i.p && (i.level || 0) < P.to && (i.level || 0) > best_level_held(P.name)) && !(await upg_fetch_copy(P))) break;
		if (!state.upg) break;
		if (worn_waiting()) break; // v25.39
		const top = best_level_held(P.name);
		if (top >= P.to) {
			game_log(`upgrade project done: ${P.name}+${top} for ${P.for}`, C.ok);
			state.upg = null;
			state.upg_pick_at = 0; // v24.85: the next project is picked at once (there was a 10-min gap per project)
			break;
		}
		const step = (G.items[upgrade_scroll(P.name, Math.max(0, top))]?.g || 0) + (top < 0 ? G.items[P.name]?.g || 0 : 0);
		// v25.46: no gold for the step anywhere (ours above upgrade_keep plus what the fighters can send): the project is
		// dropped for 30 min rather than waiting on funds forever and holding every other project back (a weapon's too)
		// (v25.48: only with every member heard from — a stale heartbeat reads as no gold to send)
		if (character.gold - upgrade_keep() + fund_pool() < step && party_heard()) {
			town_reason.upgrade = `gold: next step ${fmt_k(step)}, none to fund it (have ${fmt_k(character.gold)}, keep ${fmt_k(upgrade_keep())})`;
			skip("upg:" + P.name, 1_800_000, "no gold for the next step"); state.upg = null; state.fund_need = 0; break;
		}
		if (merchant_asks_funds(P, step)) break; // v25.5: merchant/ — the fighters fund the step
		if (!upg_gold_ok(step)) { town_reason.upgrade = `gold: next step ${fmt_k(step)}, have ${fmt_k(character.gold)}, keep ${fmt_k(upgrade_keep())}`; break; }
		state.fund_need = 0;
		// v23.1: the gold the project's steps cost (copy + scrolls), counted per step — measuring from total gold let loot,
		// sales, potion buys and the fighters' funding move it
		if (P.spent === undefined) P.spent = 0;
		P.max = Math.max(P.max ?? -1, top); // v24.7: the highest level this project reached (a failure destroys the copy)
		// (v24.85: against the expected cost with failures, not the cost if every step succeeds)
		// (v25.17: a project from our copy: the expected cost above that copy's level)
		const est = P.from_copy !== undefined ? Math.max(P.cost || 0, upgrade_expected(P.name, P.to) - upgrade_expected(P.name, P.from_copy))
			: Math.max(P.cost || 0, upgrade_expected(P.name, P.to) - (P.own ? G.items[P.name]?.g || 0 : 0));
		if (!P.weapon && P.spent > est * CFG.upgrade_abort_x) {
			upg_cap(P.name, Math.max(0, P.max));
			skip("upg:" + P.name, 24 * 3600_000, "over budget");
			game_log(`upgrade ${P.name}: failures pushed the cost past ${CFG.upgrade_abort_x}x the estimate; stopped${top >= 1 ? ` at +${top}` : ""}`, C.bad);
			state.upg = null;
			break;
		}
		const g0 = character.gold;
		try {
			await run_upgrade({ name: P.name, ...(P.worn ? { min_chance: CFG.upgrade_worn.min_chance } : {}) }, { request: { name: P.name, level: P.to } });
			// v24.85: at most what the step can cost (a scroll, a copy if one was bought). The gold delta alone counted a
			// transfer to the merchant made meanwhile: Torlis's shoes1 project "cost 2.5x its estimate" at +1 and stopped.
			P.spent += Math.min(Math.max(0, g0 - character.gold), upg_step_cost(P.name, top));
			n++;
		} catch (e) {
			P.spent += Math.min(Math.max(0, g0 - character.gold), upg_step_cost(P.name, top));
			// v24.7: a transient error (walk/call timeout, distance...) pauses the project, it doesn't end it: ending it freed the
			// copy (banked, never a project input again), and the re-pick rebought from +0 with the abort budget reset
			if (TRANSIENT.has(why(e))) { skip("upg:" + P.name, pause_ms(e, 600_000), why(e)); game_log(`upgrade ${P.name}: ${why(e)}; retrying in 10 min`, C.dim); break; }
			// v25.37: no copy to work on (none in the bags or the bank, none to buy): the project ends without a day's pause —
			// a copy arriving (a drop, Ponty, a share) makes it a candidate again at once
			if (why(e) === "input_missing") { skip("upg:" + P.name, 600_000, why(e)); game_log(`upgrade ${P.name}: no copy left to work on; project ended`, C.dim); state.upg = null; break; }
			// v24.5: refused for its odds, the next step will be refused again: remember the level reached, so the project
			// isn't re-picked a day later to rebuild a copy at that level from +0 (and stopped there again, every day)
			if (e?.chance !== undefined) upg_cap(P.name, Math.max(0, P.max ?? top));
			skip("upg:" + P.name, pause_ms(e, 24 * 3600_000), why(e) + (e?.chance !== undefined ? ` (${Math.round(e.chance * 100)}%)` : ""));
			game_log(`upgrade ${P.name}: ${why(e)}; project stopped${top >= 1 ? ` at +${top}` : ""}`, C.dim);
			state.upg = null; // the copy reached so far is free again (equip/share judge it)
			break;
		}
	}
	return n;
}
