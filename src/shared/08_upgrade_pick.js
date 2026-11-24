// =====================================================================
// shared/08_upgrade_pick.js — upgrading: one +1 step at a time on what a fighter wears (CFG.upgrade_auto)
// =====================================================================
// ---- Own upgrading (CFG.upgrade_auto) ----
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
const best_level_held = (name) => character.items.reduce((m, i) => (i && i.name === name && !i.l ? Math.max(m, i.level || 0) : m), -1);
// v24.82: the server's base upgrade odds by the item's starting grade (design/upgrades.py), result level 1..10
const UPG_ODDS = { 0: [0.9999999, 0.98, 0.95, 0.70, 0.60, 0.40, 0.25, 0.15, 0.07, 0.024], 1: [0.99998, 0.97, 0.94, 0.68, 0.58, 0.38, 0.24, 0.14, 0.066, 0.018],
	2: [0.97, 0.94, 0.92, 0.64, 0.52, 0.32, 0.232, 0.13, 0.062, 0.015] };
const upg_odds = (name, to) => (UPG_ODDS[Math.min(2, Math.max(0, item_grade({ name, level: 0 })))] || UPG_ODDS[0])[to - 1] || 0;
// The most one step of a project can cost: the scroll (the next one up when the boost is used) and a copy if none is held
const upg_step_cost = (name, top) => {
	const lv = Math.max(0, top), g = Math.max(0, item_grade({ name, level: lv }));
	return (G.items["scroll" + (g + 1)]?.g <= (CFG.upgrade_boost_max || 0) ? G.items["scroll" + (g + 1)].g : G.items["scroll" + g]?.g || 0) + (top < 0 ? G.items[name]?.g || 0 : 0);
};
// v25.17: the best level of a copy we own, in the bags (unlocked) or (last seen) in the bank; not a titled one, in either
// (the project's bank fetch skips titled copies too); -1 if none
const owned_level = (name) => Math.max(-1, ...character.items.filter((i) => i && i.name === name && !i.l && !i.p).map((i) => i.level || 0),
	...(state.bank_gear || []).filter((i) => i.name === name && !i.p).map((i) => i.level || 0));
// Is it sold by an NPC we can find? (cached: G doesn't change)
const sold_c = new Map();
const sold_by_npc = (name) => { if (!sold_c.has(name)) sold_c.set(name, !!shop_for(name)); return sold_c.get(name); };
// ---- v25.66 (owner: rebuild the upgrade logic — one rule) ----
// Every pick, the best single +1 step on a piece a fighter wears:
//  - a spare copy we own at the worn level is upgraded (then delivered: it beats the worn one); else
//  - the worn piece itself, handed over (never a weapon/offhand or a titled piece).
// Value: the wearer's gain from that +1 per gold of the step's scroll. Taken when the server's odds are at least
// upgrade_step.floor_spare with a spare copy behind it (a failure costs a spare), upgrade_step.floor_last on the last copy.
// No targets, caps, expected-cost chains or head starts: one level at a time, every time it pays.
const with_stat = (it, L) => ({ name: it.name, level: L, ...(it.stat_type ? { stat_type: it.stat_type } : {}) });
// The step for one worn piece: { name, from, to, gain, cost, p, floor, spare, ok, why } — copies: the best level of a
// spare copy we hold or can get (bags, bank, the merchant's give_lv), -1 if none
function upgrade_step(it, ctype, g, slot, copies) {
	const def = G.items[it?.name];
	if (!def?.upgrade || def.compound || def.cash || it.l) return null;
	const from = it.level || 0, to = from + 1, sc = upgrade_scroll(it.name, from), cost = G.items[sc]?.g;
	const base = { name: it.name, from, to, slot, cost: cost || 0 };
	if (!cost || sc === "scroll3") return { ...base, ok: false, why: "no scroll for the next level" };
	const r = gear_gain(with_stat(it, to), ctype, g);
	if (!r) return { ...base, ok: false, why: `+${to} gains nothing` };
	// (Fable) a copy held above the worn level is delivered first — no step on this piece till then; with none at the worn
	// level the worn piece itself is handed over — never a titled one (the hand-over leaves those on) or a weapon/offhand
	// (the fighter can't fight without it until it comes back: those step from a spare only)
	if (copies > from) return { ...base, ok: false, why: `a +${copies} copy held goes to it first` };
	const spare = copies === from, p = upg_odds(it.name, to), floor = spare ? CFG.upgrade_step.floor_spare : CFG.upgrade_step.floor_last;
	if (!spare && it.p) return { ...base, ok: false, why: "titled: never handed over, and no spare at its level" };
	if (!spare && (slot === "mainhand" || slot === "offhand")) return { ...base, ok: false, why: `a weapon/offhand: steps from a spare +${from} only` };
	const out = { ...base, gain: r.gain, p, floor, spare, copy: spare };
	if (p < floor) return { ...out, ok: false, why: `odds ${Math.round(p * 100)}% < ${Math.round(floor * 100)}% (${spare ? "a spare backs it" : "the last copy"})` };
	return { ...out, ok: true, why: null };
}
// Every worn piece of every fighter, with its step (the report lists them; pick_upgrade takes the best)
function upgrade_steps_all() {
	const rows = [];
	for (const m of gear_takers().filter((x) => x.ctype !== "merchant")) {
		const worn = m.name === character.name ? character.slots || {} : m.p?.worn || {};
		for (const [slot, it] of Object.entries(worn)) {
			if (!it || !GEAR.has(G.items[it.name]?.type)) continue;
			const st = upgrade_step(it, m.ctype, m.g, slot, Math.max(owned_level(it.name), merchant_hb_give(it.name)));
			if (st) rows.push({ ...st, who: m.name, stat_type: it.stat_type || null });
		}
	}
	return rows;
}
// The merchant's spare copies (its heartbeat's give_lv) as seen by a fighter; the merchant itself counts its own bags
const merchant_hb_give = (name) => (!is_merchant() && typeof merchant_hb === "function" ? merchant_hb()?.give_lv?.[name] ?? -1 : -1);
function pick_upgrade() {
	if (!CFG.upgrade_auto) return null;
	const budget = upgrade_gold();
	const rows = upgrade_steps_all().filter((r) => r.ok && r.cost <= budget && !skipped("upg:" + r.name) && (r.copy || is_merchant()))
		.sort((a, b) => b.gain / b.cost - a.gain / a.cost);
	const r = rows[0];
	if (!r) return null;
	const P = { name: r.name, to: r.to, for: r.who, slot: r.slot, gain: Math.round(r.gain), cost: r.cost, floor: r.floor, from_copy: r.from };
	// no spare at the worn level: the worn piece itself is handed over (want_worn in our heartbeat)
	if (!r.copy) P.worn = { who: r.who, slot: r.slot, level: r.from, stat_type: r.stat_type, at: Date.now() };
	return P;
}
// Report: each fighter's worn pieces and what their next step waits on
function upgrade_why() {
	if (!is_merchant() && merchant_does_it()) return "";
	const rows = upgrade_steps_all(), budget = upgrade_gold();
	if (!rows.length) return " | no upgradable piece worn";
	const txt = rows.sort((a, b) => (b.ok ? b.gain / b.cost : -1) - (a.ok ? a.gain / a.cost : -1)).slice(0, 8)
		.map((r) => `${r.who} ${r.name}+${r.from}→+${r.to}: ${r.ok ? (skipped("upg:" + r.name) ? `paused (${skip_why["upg:" + r.name] || "?"})` : r.cost > budget ? `scroll ${fmt_k(r.cost)} over the budget ${fmt_k(budget)}` : `+${round1(r.gain)} pts for ${fmt_k(r.cost)} at ${Math.round(r.p * 100)}%${r.copy ? " (our spare)" : " (worn piece)"}`) : r.why}`);
	return ` | steps: ${txt.join("; ")}`;
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
	if (merchant_does_it()) {
		// v21.2: the merchant runs projects now; a fighter's own one would sit forever, holding its copies in the bags.
		// v25.17 (owner: "make the merchant do it"): our own ones too (a set piece, a token buy) — the copy is no longer
		// kept, so it goes to the merchant (share_gear) or the bank, and the merchant picks it as a project from there
		if (state.upg) { game_log(`upgrade project ${state.upg.name} handed to the merchant`, C.dim); state.upg = null; }
		return false;
	}
	const now = Date.now();
	if (!state.upg && now - (state.upg_pick_at || 0) > 60_000) { // (v25.66: every minute — one step at a time)
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
// v25.66: a project is ONE roll: the copy at P.to-1 (a spare fetched from the bank, or the handed-over worn piece) is
// upgraded once at P.floor; success or failure, the project ends and the next pick decides again (Fable: the old loop
// rebuilt a chain after a failure — bought +0 copies and rolled up to the target)
async function task_upgrade() {
	const P0 = state.upg;
	if (!P0) return 0;
	if (merchant_does_it()) { game_log(`upgrade project ${P0.name} handed to the merchant`, C.dim); state.upg = null; return 0; }
	if (state.errand) state.errand_at = Date.now();
	if (upg_drop_if_stale()) return 0; // something better is worn now
	if (best_level_held(P0.name) < P0.to - 1 && !(await upg_fetch_copy(P0))) return 0;
	const P = state.upg;
	if (!P || worn_waiting()) return 0;
	const end = (why_, pause) => { if (pause) skip("upg:" + P.name, pause, why_); state.upg = null; state.upg_pick_at = 0; state.fund_need = 0; };
	if (best_level_held(P.name) !== P.to - 1) { game_log(`upgrade ${P.name}: no copy at +${P.to - 1} to step; ended`, C.dim); end("no copy at the level", 600_000); return 0; }
	const step = G.items[upgrade_scroll(P.name, P.to - 1)]?.g || 0;
	// no gold for the step anywhere (ours above upgrade_keep plus what the fighters can send): dropped for 30 min
	// (v25.48: only with every member heard from — a stale heartbeat reads as no gold to send)
	if (character.gold - upgrade_keep() + fund_pool() < step && party_heard()) {
		town_reason.upgrade = `gold: step ${fmt_k(step)}, none to fund it (have ${fmt_k(character.gold)}, keep ${fmt_k(upgrade_keep())})`;
		end("no gold for the step", 1_800_000); return 0;
	}
	if (merchant_asks_funds(P, step)) return 0; // merchant/: the fighters fund the step
	if (!upg_gold_ok(step)) { town_reason.upgrade = `gold: step ${fmt_k(step)}, have ${fmt_k(character.gold)}, keep ${fmt_k(upgrade_keep())}`; return 0; }
	state.fund_need = 0;
	try {
		const r = await run_upgrade({ name: P.name, floor: P.floor }, { request: { name: P.name, level: P.to } });
		game_log(`upgrade ${P.name} +${P.to - 1}→+${P.to} for ${P.for}: ${r?.success ? "done" : "failed"}`, r?.success ? C.ok : C.bad);
		end(); return 1;
	} catch (e) {
		// a transient error (walk/call timeout, distance...) pauses it; anything else (low odds at the server) ends it, paused
		if (TRANSIENT.has(why(e))) { skip("upg:" + P.name, pause_ms(e, 600_000), why(e)); game_log(`upgrade ${P.name}: ${why(e)}; retrying in 10 min`, C.dim); return 0; }
		game_log(`upgrade ${P.name}: ${why(e)}${e?.chance !== undefined ? ` (${Math.round(e.chance * 100)}%)` : ""}; step dropped`, C.dim);
		end(why(e) + (e?.chance !== undefined ? ` (${Math.round(e.chance * 100)}%)` : ""), pause_ms(e, 6 * 3600_000)); return 0;
	}
}

// v25.62/v25.66 (owner): a worn piece's generic Stat gets the wearer's main stat once no upgrade step for it passes the
// rule (or the merchant is upgrading it now)
function upgrade_ahead(it, ctype, g, who, slot) {
	const M = typeof merchant_hb === "function" ? merchant_hb() : null;
	if (M?.upg?.name === it.name && (!M.upg.for || M.upg.for === who)) return `the merchant's project (+${M.upg.to})`;
	const st = upgrade_step(it, ctype, g, slot, Math.max(owned_level(it.name), M?.give_lv?.[it.name] ?? -1));
	return st?.ok && (st.copy || M) ? `+${st.to} at ${Math.round(st.p * 100)}% (+${round1(st.gain)} pts)` : null;
}
