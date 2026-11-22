// =====================================================================
// shared/08_upgrade_pick.js — own upgrading: which piece to take how far, odds, costs (CFG.upgrade_auto)
// =====================================================================
// ---- Own upgrading (CFG.upgrade_auto) ----
// Highest level ≤ upgrade_max_level reachable with scroll0/scroll1 (0 = none)
// high: also scroll2 levels, up to upgrade_high.max_level (weapon slots only, decided by the caller)
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
// Gold a project may draw on: our own above the reserve; the merchant also counts fighters' gold above fund_keep
// (they send it on supply runs when a step needs it)
function upgrade_gold() {
	let g = character.gold - (is_merchant() ? CFG.merchant.donate.keep : CFG.gold_reserve);
	if (is_merchant()) for (const p of partners()) g += Math.max(0, (p.gold || 0) - CFG.merchant.fund_keep);
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
// Is it sold by an NPC we can find? (cached: G doesn't change)
const sold_c = new Map();
const sold_by_npc = (name) => { if (!sold_c.has(name)) sold_c.set(name, !!shop_for(name)); return sold_c.get(name); };
function pick_upgrade() {
	const room = gold_room(), gold = Math.min(upgrade_gold(), room), budget = gold * CFG.upgrade_spend, H = CFG.upgrade_high;
	if (!CFG.upgrade_auto) return null; // (v24.86: a budget at 0 still lets weapon projects through; the rest fail cost > cap)
	const takers = gear_takers().filter((m) => m.ctype !== "merchant");
	let best = null;
	for (const name in G.items) {
		const def = G.items[name];
		if (!def.upgrade || !GEAR.has(def.type) || def.cash || skipped("upg:" + name) || CFG.quest_craft_skip.includes(name)) continue;
		// v24.71: only what an NPC sells. The check used to come after the winner was chosen — over every item in the
		// game: when a piece nobody sells scored best (pyjamas, for Torlis), there was no project at all, ever.
		if (!sold_by_npc(name)) continue;
		// normal target (scroll0/1 levels) and, for weapon slots, the high target (scroll2 levels too)
		const targets = [];
		const WP = CFG.upgrade_weapon?.enabled && def.type === "weapon" ? Math.min(CFG.upgrade_weapon.to, upgrade_target(name)) : 0;
		if (WP) targets.push([WP, Infinity, false, true]); // v24.86: a weapon goes straight to +7, no budget
		else for (let L = 1, T = upgrade_target(name); L <= T; L++) targets.push([L, budget, false]); // v24.82: every level, by expected cost
		if (H?.enabled) targets.push([upgrade_target(name, true), gold * H.spend, true]);
		const capL = upg_cap_level(name);
		for (let [to, cap, high, weapon] of targets) {
			if (to > capL) to = capL; // v24.5: no higher than a past project of it reached before its odds/failures stopped it
			if (!to) continue;
			const cost = high ? upgrade_cost(name, to) : upgrade_expected(name, to);
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
				if (!r || (high && !H.slots.includes(r.slot))) continue;
				// worth (gain x gold per point) less the expected cost; a scroll2 project only when nothing else is worth doing
				const v = weapon ? 1e12 + r.gain : high ? -1e12 + r.gain / cost : r.gain * CFG.upgrade_gold_per_pt - cost;
				if (!high && !weapon && v <= 0) continue;
				if (!best || v > best.v) best = { name, to, for: m.name, slot: r.slot, gain: Math.round(r.gain), cost, v, high, weapon: !!weapon };
			}
		}
	}
	return best;
}
// Why there's no project (report): our own pieces that would win once upgraded, and the best shop pieces with what
// stops each
function upgrade_why() {
	const out = [];
	if (!is_merchant()) {
		const own = [...character.items.filter((i) => i && !i.l && GEAR.has(G.items[i.name]?.type)).map((i) => [i, "bags"]), ...(state.bank_gear || []).map((i) => [i, "bank"])]
			.map(([i, w]) => [i, w, set_piece_plan(i.name, i.level || 0)]).filter(([, , pl]) => pl).sort((a, b) => b[2].gain - a[2].gain)[0];
		out.push(own ? `ours next: ${own[0].name}+${own[0].level || 0} (${own[1]}) → +${own[2].to} (+${own[2].gain} pts)` : "nothing we own would win once upgraded");
	}
	if (is_merchant() || !merchant_does_it()) {
		const gold = Math.min(upgrade_gold(), gold_room()), budget = gold * CFG.upgrade_spend, takers = gear_takers().filter((m) => m.ctype !== "merchant"), rows = [];
		for (const name in G.items) {
			const def = G.items[name];
			if (!def.upgrade || !GEAR.has(def.type) || def.cash || !sold_by_npc(name)) continue;
			let g = null, to = 0, cost = 0;
			for (let L = 1, T = Math.min(upgrade_target(name), upg_cap_level(name)); L <= T; L++) for (const m of takers) {
				const r = gear_gain({ name, level: L }, m.ctype, m.g), c = upgrade_expected(name, L);
				if (r && r.gain * CFG.upgrade_gold_per_pt - c > 0 && (!g || r.gain * CFG.upgrade_gold_per_pt - c > g.net)) { g = { gain: r.gain, who: m.name, net: r.gain * CFG.upgrade_gold_per_pt - c }; to = L; cost = c; }
			}
			if (!g) continue;
			const stop = skipped("upg:" + name) ? "paused" : cost > budget ? `expected cost ${fmt_k(cost)}, budget ${fmt_k(Math.max(0, budget))}`
				: best_level_held(name) >= to || (state.bank_gear || []).some((i) => i.name === name && (i.level || 0) >= to) || party_holds_level(name, to, true) ? "a spare copy at that level exists already"
				: "eligible";
			rows.push({ name, to, g, stop });
		}
		rows.sort((a, b) => b.g.gain - a.g.gain);
		out.push(rows.length ? `shop: ${rows.slice(0, 4).map((r) => `${r.name}+${r.to} for ${r.g.who} +${Math.round(r.g.gain)} pts — ${r.stop}`).join("; ")}` : "shop: no upgradable piece at its reachable level beats what anyone wears");
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
function upgrade_due() {
	if (!CFG.upgrade_auto) return false;
	upg_drop_if_stale(); // v24.91
	set_piece_start(); // v24.69: a set piece in our bags that wins once upgraded
	if (merchant_does_it()) {
		// v21.2: the merchant runs projects now; a fighter's own one would sit forever, holding its copies in the bags
		// (v24.67: except our own project on a token piece — the copy is ours, and the merchant can't buy one)
		if (state.upg && !is_merchant() && !state.upg.own) { game_log(`upgrade project ${state.upg.name} handed to the merchant`, C.dim); state.upg = null; }
		if (!state.upg?.own) return false;
	}
	const now = Date.now();
	if (!state.upg && now - (state.upg_pick_at || 0) > 600_000) {
		state.upg_pick_at = now;
		state.upg = pick_upgrade();
		if (state.upg) game_log(`upgrade project: ${state.upg.name} → +${state.upg.to} for ${state.upg.for}'s ${state.upg.slot} (+${state.upg.gain} pts, ~${Math.round(state.upg.cost / 1000)}k)`, C.info);
	}
	if (merchant_awaits_funds()) return false; // v25.5: merchant/
	return !!state.upg && !skipped("upg:" + state.upg.name) && best_level_held(state.upg.name) < state.upg.to;
}
async function task_upgrade() {
	let n = 0;
	for (let i = 0; i < (is_merchant() ? CFG.merchant_upgrade_steps : CFG.upgrade_steps_per_run); i++) {
		if (state.errand) state.errand_at = Date.now();
		if (upg_drop_if_stale()) break; // v24.91: something better is worn now
		const P = state.upg;
		if (!P) break;
		const top = best_level_held(P.name);
		if (top >= P.to) {
			game_log(`upgrade project done: ${P.name}+${top} for ${P.for}`, C.ok);
			state.upg = null;
			state.upg_pick_at = 0; // v24.85: the next project is picked at once (there was a 10-min gap per project)
			break;
		}
		const step = (G.items[upgrade_scroll(P.name, Math.max(0, top))]?.g || 0) + (top < 0 ? G.items[P.name]?.g || 0 : 0);
		// over the party's gold budget: don't ask the fighters for gold we then couldn't spend (v19.6)
		if (!P.weapon && step > gold_room()) { town_reason.upgrade = `gold budget: next step ${fmt_k(step)}, room ${fmt_k(Math.max(0, gold_room()))}`; break; }
		if (merchant_asks_funds(P, step)) break; // v25.5: merchant/ — the fighters fund the step
		if (!(P.weapon ? character.gold - step >= (is_merchant() ? CFG.merchant.donate.keep : CFG.gold_reserve) : gold_ok(step))) { town_reason.upgrade = `gold budget: next step ${fmt_k(step)}, room ${fmt_k(Math.max(0, gold_room()))}`; break; }
		state.fund_need = 0;
		// v23.1: the gold the project's steps cost (copy + scrolls), counted per step — measuring from total gold let loot,
		// sales, potion buys and the fighters' funding move it
		if (P.spent === undefined) P.spent = 0;
		P.max = Math.max(P.max ?? -1, top); // v24.7: the highest level this project reached (a failure destroys the copy)
		// (v24.85: against the expected cost with failures, not the cost if every step succeeds)
		if (!P.weapon && P.spent > Math.max(P.cost || 0, upgrade_expected(P.name, P.to) - (P.own ? G.items[P.name]?.g || 0 : 0)) * CFG.upgrade_abort_x) {
			upg_cap(P.name, Math.max(0, P.max));
			skip("upg:" + P.name, 24 * 3600_000, "over budget");
			game_log(`upgrade ${P.name}: failures pushed the cost past ${CFG.upgrade_abort_x}x the estimate; stopped${top >= 1 ? ` at +${top}` : ""}`, C.bad);
			state.upg = null;
			break;
		}
		const g0 = character.gold;
		try {
			await run_upgrade({ name: P.name }, { request: { name: P.name, level: P.to } });
			// v24.85: at most what the step can cost (a scroll, a copy if one was bought). The gold delta alone counted a
			// transfer to the merchant made meanwhile: Torlis's shoes1 project "cost 2.5x its estimate" at +1 and stopped.
			P.spent += Math.min(Math.max(0, g0 - character.gold), upg_step_cost(P.name, top));
			n++;
		} catch (e) {
			P.spent += Math.min(Math.max(0, g0 - character.gold), upg_step_cost(P.name, top));
			// v24.7: a transient error (walk/call timeout, distance...) pauses the project, it doesn't end it: ending it freed the
			// copy (banked, never a project input again), and the re-pick rebought from +0 with the abort budget reset
			if (TRANSIENT.has(why(e))) { skip("upg:" + P.name, pause_ms(e, 600_000), why(e)); game_log(`upgrade ${P.name}: ${why(e)}; retrying in 10 min`, C.dim); break; }
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
