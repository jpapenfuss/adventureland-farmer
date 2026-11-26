// =====================================================================
// Diagnostics (call from the CODE console): report(), why_not("bee")
// =====================================================================
const mins = (t) => `${Math.max(0, Math.ceil((t - Date.now()) / 60_000))}m`; // minutes until timestamp t, as "12m"
// The game's log can't be copied; report() also opens a selectable text box and tries the clipboard
function share_text(title, lines) {
	const text = lines.join("\n");
	try { parent.navigator?.clipboard?.writeText(text).catch(() => {}); } catch (e) {}
	const esc = (x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
	if (typeof parent.show_modal === "function")
		// a read-only text box in the game's modal window (420px tall fits a full report); clicking selects everything
		parent.show_modal(`<div style="color:#fff;margin-bottom:6px">${esc(title)} — select all and copy (Ctrl+A, Ctrl+C)</div>` +
			`<textarea readonly style="width:100%;height:420px;background:#111;color:#cfe;font-size:13px" onclick="this.select()">${esc(text)}</textarea>`);
	return text;
}
// Hide game-log lines matching CFG.quiet_logs: wraps the game page's add_log (the client's log function). A reload
// re-wraps the original, never a wrapper; [] turns it off.
// Characters started as bots log via parent.parent with a "Name: " prefix, so both windows are wrapped (unanchored patterns).
function quiet_logs() {
	const pats = CFG.quiet_logs || [];
	let n = 0;
	for (const P of new Set([typeof parent !== "undefined" ? parent : null, typeof parent !== "undefined" ? parent?.parent : null])) {
		try {
			if (!P || typeof P.add_log !== "function") continue;
			const orig = P.add_log.farmer_orig || P.add_log;
			const f = function (message, color) {
				if (typeof message === "string" && pats.some((re) => re.test(message))) return;
				return orig.apply(this, arguments);
			};
			f.farmer_orig = orig;
			P.add_log = pats.length ? f : orig;
			n++;
		} catch (e) {} // another origin's window: leave it
	}
	return n > 0;
}
quiet_logs();
// ---- Bigger panels (CFG.ui, v24.20) ----
// A style rule in the game page for the log (size, font, a resize handle) and our own iframe's size for the status box.
// A size dragged with the log's handle is saved (shared by every character in this browser) and reapplied on reload.
// v25.21 (owner): the status box under CODE alone — our iframe, which the game makes 128x60 and which cut off
// set_message's text ("gscorpion (xp" ...). It sits in the bottom-aligned top row of #bottomrightcorner (position:
// fixed, bottom/right 0, no width: its widest row sets its width) above the tutorial bar and the log. So only its
// height grows (upward: nothing is above it) and its text wraps; a wider box would widen the whole corner and pull the
// left-aligned bars and log with it — v24.20 resized the log and broke the layout. status_box.w: 0 keeps the game's.
function apply_status_box() {
	const S = CFG.ui?.status_box;
	if (!S?.enabled || typeof window === "undefined") return false;
	try {
		const fe = window.frameElement;
		if (!fe || !fe.style || !(fe.offsetWidth > 2)) return false; // no box (a CODE runner without one, or the tests)
		// v25.23 (owner): w "log" — as wide as lines its left edge up with the log's. The row is right-aligned, so widening
		// the box by (its left − the log's left) moves only its left edge, to the log's, and the corner keeps its width.
		if (S.w === "log") {
			const gl = parent.document?.getElementById?.("gamelog"), fr = fe.getBoundingClientRect?.(), lr = gl?.getBoundingClientRect?.();
			const d = fr && lr && lr.width > 0 ? fr.left - lr.left : 0;
			if (Math.abs(d) > 1) fe.style.width = Math.max(128, Math.round((fe.clientWidth || fe.offsetWidth) + d)) + "px";
		} else if (S.w > 0) fe.style.width = S.w + "px";
		if (fe.style.height !== S.h + "px") fe.style.height = S.h + "px";
		const gg = typeof document !== "undefined" && document.getElementById ? document.getElementById("gg") : null;
		if (gg) { gg.style.whiteSpace = "normal"; gg.style.overflowWrap = "anywhere"; gg.style.lineHeight = "1.2"; }
		return true;
	} catch (e) { return false; }
}
setInterval(apply_status_box, 5000); // v25.23: kept lined up with the log (it can be moved or resized)
function apply_ui() {
	apply_status_box();
	const U = CFG.ui;
	if (typeof parent === "undefined" || !parent.document) return false;
	if (!U?.enabled) { // v24.21: take back the rule an earlier version left in the game page (it lasts until the page reloads)
		try { const st = parent.document.getElementById("farmer-ui"); if (st && st.parentNode) st.parentNode.removeChild(st); } catch (e) {}
		return false;
	}
	try {
		const pd = parent.document, saved = (typeof get === "function" && get("farmer_ui")) || {};
		let st = pd.getElementById("farmer-ui");
		if (!st) { st = pd.createElement("style"); st.id = "farmer-ui"; (pd.head || pd.documentElement).appendChild(st); }
		const w = saved.log_w || U.log_w, h = saved.log_h || U.log_h, f = saved.log_font || U.log_font;
		st.textContent = `#gamelog{width:${w}px !important;height:${h}px !important;max-height:none !important;max-width:none !important;` +
			`font-size:${f}px !important;line-height:1.25 !important;resize:both !important;overflow:auto !important}` +
			`#gamelog .gameentry{font-size:inherit !important}`;
		const fe = typeof window !== "undefined" ? window.frameElement : null; // our iframe: the status box under CODE
		if (fe && fe.style && fe.offsetWidth > 2) { fe.style.width = U.status_w + "px"; fe.style.height = U.status_h + "px"; }
		const gg = typeof document !== "undefined" && document.getElementById ? document.getElementById("gg") : null;
		if (gg) { gg.style.fontSize = U.status_font + "px"; gg.style.lineHeight = "1.25"; gg.style.whiteSpace = "normal"; }
		const gl = pd.getElementById("gamelog");
		const W_ = typeof window !== "undefined" ? window : globalThis;
		if (gl && gl.__farmer_ro_win !== W_ && typeof ResizeObserver === "function") {
			let tmr = null;
			const ro = new ResizeObserver(() => {
				clearTimeout(tmr);
				tmr = setTimeout(() => {
					const cw = Math.round(gl.offsetWidth), ch = Math.round(gl.offsetHeight);
					const cur = (typeof get === "function" && get("farmer_ui")) || {};
					if (cw > 100 && ch > 60 && (cw !== cur.log_w || ch !== cur.log_h) && typeof set === "function") set("farmer_ui", { ...cur, log_w: cw, log_h: ch });
				}, 800);
			});
			ro.observe(gl);
			gl.__farmer_ro_win = W_;
		}
		return true;
	} catch (e) { return false; } // another origin, or no such panel: leave the game's own layout
}
// Console: ui(560, 360, 15) — the log's width, height and font size (saved); ui() — back to CFG.ui. Needs CFG.ui.enabled.
function ui(w, h, font) {
	const cur = (typeof get === "function" && get("farmer_ui")) || {};
	const next = w === undefined ? {} : { ...cur, log_w: w || cur.log_w, log_h: h || cur.log_h, log_font: font || cur.log_font };
	if (typeof set === "function") set("farmer_ui", next);
	apply_ui();
	return next;
}
apply_ui();
// report(): one-screen summary of what the bot is doing and why (also as copyable text)
// ---- Report (v17): facts once, two renderers ----
// report_facts(): this character's state as { key, scope, text, quiet } in display order.
//   scope "party": the party header shows it once for everyone (roster, leader/directive, goals merge, gold, hunts,
//   last hour, rates, bosses, merchant) — only the solo report prints these from here.
//   quiet: nothing worth reading right now (done quests, farm rows, idle features, normal safety); solo shows them.
// Things that look wrong right now (v23.3): one "checks:" line per character, so a report shows at a glance whether the
// latest fixes work in the game. Each check names what it saw.
function health_checks() {
	const W = [], now = Date.now(), hr = hist.ev.filter((e) => now - e.t < 3600_000), M_ = is_merchant();
	const up_min = (now - seen.since) / 60_000;
	if (!M_ && in_party_cfg() && seen.kill >= 20 && !seen.kc) W.push(`no kill_credit events after ${seen.kill} kills (together-mode spot rates not measured)`);
	if (!M_ && up_min > 20 && seen.target_hit === 0 && !state.parked) W.push(`no hits landed in ${Math.round(up_min)} min`);
	const deaths = hr.filter((e) => e.type === "death").length, flees = hr.filter((e) => e.type === "flee").length;
	if (deaths) W.push(`${deaths} death${deaths > 1 ? "s" : ""} in the last hour`);
	if (flees >= 3) W.push(`${flees} flees in the last hour`);
	const stuck = hr.filter((e) => e.type === "stuck").length;
	if (stuck >= 2) W.push(`watchdog acted ${stuck}x in the last hour`);
	const trips = town_causes();
	if (!M_ && trips.span >= 30 && trips.n * 60 / Math.max(trips.span, 1) > 8) W.push(`${trips.n} town trips in ${trips.span} min`);
	if ((state.owe || 0) > 500_000) W.push(`owes the merchant ${fmt_k(state.owe)} (not near it to pay?)`);
	if (M_ && character.gold < CFG.merchant.donate.keep) W.push(`merchant gold ${fmt_k(character.gold)} < its ${fmt_k(CFG.merchant.donate.keep)} potion float`);
	if (spent() > BUDGET.soft) W.push(`call budget over (${Math.round(spent())}/${BUDGET.soft})`);
	// a quest that has everything (bags + our bank share) but hasn't been crafted
	for (const id of quest_recipes()) {
		const r = G.craft[id];
		if (!recipe_wanted(id) || skipped("qc:" + id)) continue;
		if (r.items.every(([q, n, l]) => owned_in_bags_or_bank(n, l) >= q) && !has_inputs(r) && !bag_plan().fetch.some((f) => r.items.some(([, n]) => (f.name || f) === n)))
			W.push(`quest ${id}: materials complete (bags + bank) but no fetch planned`);
	}
	const errs = hr.filter((e) => e.type === "error");
	if (errs.length) W.push(`${errs.length} error${errs.length > 1 ? "s" : ""} logged in the last hour (history())`);
	return W;
}
function report_facts() {
	const out = [], F = (key, scope, text, quiet = false) => out.push({ key, scope, text, quiet });
	const p = state.pack, d = state.directive, M_ = is_merchant(), now = Date.now();
	const c = { p, d, now }; // v24.96: for the role sections (facts_*: role functions, v25.12 — each role's own; the other's adds nothing)
	{ const W = health_checks(); F("checks", "self", W.length ? `checks: ⚠ ${W.join(" | ")}` : "checks: ok"); }
	// what we're doing (fight target and reason merged into one line; say so when we're not there yet)
	if (M_) F("doing", "self", `merchant: doesn't fight; serves ${(CFG.party.members || []).join(", ")}`);
	else facts_doing(F, c);
	facts_party(F, c);
	{
		const ev = event_live();
		if (ev) F("event", "self", `event: ${ev} — ${event_here(ev) ? "at it" : "joining"}`);
	}
	if (CFG.gear_auto) {
		// v24.79: the pieces' own points plus each set's whole bonus. It used to add up the per-slot values, and each of
		// those carries only what the LAST piece of its set adds: Sanala's fifth Monster Hunter piece showed 486 → 442
		// (five pieces x the 5th-piece bonus instead of four x the 4th), though every stat went up.
		const g = my_gear(), sl_ = gear_slots_v();
		const total = GEAR_SLOTS.map((s) => (sl_[s] ? slot_value(sl_[s], character.ctype, { off: g.off }, s) : 0)).filter((v) => v < 1e9).reduce((a, b) => a + b, 0) +
			Object.entries(g.sets || {}).reduce((a, [set, n]) => a + stat_points(set_bonus(set, n), character.ctype), 0);
		const owns = Object.keys(g.own || {});
		const takers = gear_takers().slice(1);
		const held_for = character.items.map((it) => { const m = it && takers.find((x) => gear_gain(it, x.ctype, x.g)); return m && `${it.name}→${m.name}`; }).filter(Boolean);
		const fr = (u) => { const r = state.fetch_res[u.key], t = state.fetch_try[u.key]; return r ? ` (fetch ${ago(r.at)} ago: ${r.ok ? "ok" : r.why})` : t ? ` (tried ${ago(t)} ago)` : ""; };
		const locked = owns, bu = bank_upgrades().map((u) => u.name + "+" + u.level + fr(u));
		F("xpm", "self", xp_mult_text());
		// v24.19: why a member isn't moving (a refused walk, a follower holding back)
		if (state.walk_refused && Date.now() - state.walk_refused.at < 600_000) F("walk", "self", `walk refused ${ago(state.walk_refused.at)} ago: to ${state.walk_refused.to}, every way passes ${state.walk_refused.why}`, true);
		if (state.follow_block && Date.now() - state.follow_block.at < 600_000) F("follow", "self", `not following the leader (${ago(state.follow_block.at)} ago): the way passes ${state.follow_block.rd}`, true);
		const sets_txt = Object.entries(g.sets || {}).map(([k, n]) => `${k} ${n}pc`).join(", ");
		// v24.27: travel gear — what's off now, the last swap, and what would come off on a long walk
		{
			const off = state.travel_off.map((r) => `${r.name}+${r.level}`), tc = travel_candidates().map((c) => `${c.it.name} ${c.speed}`);
			if (CFG.travel_gear.enabled && !is_merchant() && (off.length || travel_stats.at || tc.length))
				F("tgear", "self", `travel gear: ${off.length ? `OFF for the walk: ${off.join(", ")}` : "all on"}${tc.length ? ` | comes off on long walks: ${tc.join(", ")} speed` : ""}` +
					`${travel_stats.at ? ` | ${travel_stats.off} off / ${travel_stats.on} on since load, last ${ago(travel_stats.at)} ago: ${travel_stats.last}` : ""}`);
		}
		F("gear", "self", `gear: ${total.toFixed(0)} pts worn${sets_txt ? ` (sets: ${sets_txt})` : ""}${locked.length ? ` (guide working on ${locked.join(", ")})` : ""}${bu.length ? ` | bank upgrades: ${bu.join(", ")}` : ""}${held_for.length ? ` | for party: ${held_for.join(", ")}` : ""}`);
	}
	{
		const acts = wd.acts.filter((a) => now - a.t < 3600_000);
		if (acts.length) F("watchdog", "self", `watchdog: ${acts.length} intervention(s) in 1h (last: ${acts[acts.length - 1].kind} ${ago(acts[acts.length - 1].t)} ago)`);
	}
	{
		const h = last_hour(), r = rates();
		F("hour", "party", `last hour: ${h.dead} deaths, ${h.fled} flees, ${h.town} town trips | ${r ? `${fmt_k(r.xph)} xp/h, ${fmt_k(r.gph)} gold/h (${r.mins} min)` : "rates after 15 min"} — history() / deaths()`);
	}
	if (M_) facts_merchant(F, c); else if (CFG.merchant?.name) {
		const M = merchant_hb();
		F("merchant", "party", `merchant ${CFG.merchant.name}: ${M ? `online, ${M.serving ? "serving " + M.serving : "in " + M.map}, ${M.esize} free, ${fmt_k(M.gold)} gold` : "offline (fighters do their own town runs)"}`);
	}
	facts_bosses(F, c);
	{
		// must-hold items and tokens in one line
		const miss = hold_missing(), names = Object.keys(CFG.hold || {}).filter((n) => G.items[n]), tok = held_any("monstertoken"), b = CFG.token_auto ? token_pick() : null;
		const parts = names.map((n) => {
			if (!miss.includes(n)) return `${n} ✓`;
			if (state.bank_seen[n] > 0) return `${n} missing — fetching from the bank`;
			const pr = hold_price(n);
			return M_ ? `${n} missing — a fighter buys it (${pr} tokens)` : `${n} missing — ${tok >= pr ? `buying (${pr} tokens)` : `${tok}/${pr} tokens`}`;
		});
		if (!M_ && tok > 0 && b && !b.hold) parts.push(`tokens ${tok} → next: ${b.name} (${b.price}) for ${b.for}${b.to ? ` (to upgrade to +${b.to})` : ""}`);
		else parts.push(`monster tokens: ${tok}`); // v24.68: always shown
		if (Object.keys(state.hold_for).length) parts.push(`for the merchant: ${Object.keys(state.hold_for).join(", ")}`);
		if (parts.length) F("hold", "self", `hold: ${parts.join(" | ")}`, !miss.length && !(b && !b.hold) && !Object.keys(state.hold_for).length && !(tok > 0));
	}
	{
		const c = CFG.craft_power && craft_pick();
		if (c) F("craft", "self", `craft: ${c.id} for ${c.for}'s ${c.slot} (+${c.gain} pts${c.cost ? `, ${fmt_k(c.cost)} gold` : ""})${craft_inputs_in_bags(c.id) ? " — ready" : " — fetching inputs"}`);
	}
	// v24.81: the character's own numbers (the server's totals, as the client shows them)
	{
		const c = character, pick = ["level", "int", "str", "dex", "vit", "for", "attack", "frequency", "range", "speed", "armor", "resistance", "max_hp", "max_mp", "mp_cost", "crit", "critdamage",
			"evasion", "reflection", "lifesteal", "manasteal", "apiercing", "rpiercing", "xpm", "goldm", "luckm"];
		F("stats_json", "self", `stats JSON: ${JSON.stringify(Object.fromEntries(pick.filter((k) => typeof c[k] === "number" && c[k] !== 0).map((k) => [k, +c[k].toFixed(3)])))}`);
	}
	if (M_ && state.ponty) {
		F("ponty_json", "self", `ponty JSON (seen ${ago(state.ponty.at)} ago; name+level → [count, price each, listings, smallest listing]): ${JSON.stringify(state.ponty.items)}`);
		F("ponty_routes", "self", `ponty routes: ${state.ponty.routes?.length ? state.ponty.routes.join(" | ") : `none — nothing there compounds (at ${Math.round(Math.min(CFG.compound_min_chance, CFG.compound_min_chance_wanted) * 100)}% or better) into a piece a fighter would wear within the price per point`}`);
	}
	// v24.70: what's worn, as JSON (slot → name+level, :stat for a stat scroll) — with the bank dump, enough to judge gear
	F("worn_json", "self", `worn JSON: ${JSON.stringify(Object.fromEntries(Object.entries(character.slots || {}).filter(([k, v]) => v && !/^trade/.test(k)).map(([k, v]) => [k, v.name + (v.level ? "+" + v.level : "") + (v.stat_type ? ":" + v.stat_type : "") + (v.p ? ":" + v.p : "")])))}`);
	facts_stat(F, c);
	if (CFG.upgrade_auto) {
		const P = state.upg;
		F("upgrade", "self", `upgrade: ${P ? `${P.name} +${Math.max(0, best_level_held(P.name))}/+${P.to}${P.high ? " (high)" : ""} for ${P.for}'s ${P.slot} (+${P.gain} pts, ~${fmt_k(P.cost)})${P.own ? " — our own (while the merchant is away)" : ""}${state.fund_need > 0 ? ` | waiting for ${fmt_k(state.fund_need)} gold` : ""}` : (merchant_does_it() ? "projects are the merchant's (ours too: it gets the copy)" : "no project") + upgrade_why()}`);
	}
	facts_elixir(F, c);
	if (CFG.compound_auto) {
		const gs = compound_groups(), paused = Object.keys(state.gear_skip).filter((k) => k.startsWith("cmp:") && skipped(k));
		const cw = compound_why();
		F("compound", "self", `compound: ${gs.map((g) => `${g.name}+${g.level} ${g.bags.length}${g.bank ? `(+${g.bank} bank)` : ""}`).join(", ") || "no sets of 3 spares"}` +
			(paused.length ? ` | paused: ${paused.map((k) => `${k.slice(4)} ${mins(state.gear_skip[k])} (${skip_why[k] || "?"})`).join(", ")}` : "") +
			(cw.length ? ` | not compounded: ${cw.join("; ")}` : "") + (town_reason.compound ? ` | last: ${town_reason.compound}` : "") +
			// v25.35: whether the bank-full mode (any odds for cheap sets) is on, and the count it's judged on
			(CFG.compound_bank_full && state.bank_free ? ` | bank-full mode ${bank_tight() ? "on" : "off"} (${state.bank_free.free}/${state.bank_free.total} free, counted ${state.bank_free.at ? ago(state.bank_free.at) + " ago" : "at an unknown time"})` : ""),
			!gs.length && !paused.length && !cw.length);
	}
	facts_probe(F, c);
	facts_safety(F, c);
	facts_guide_farm(F, c);
	if (CFG.spend?.enabled) F("budget", "party", budget_text());
	const golds = partners().filter((x) => Number.isFinite(x.gold));
	if (golds.length && CFG.party.gold?.enabled) {
		const next = (state.gold_xfer_at || 0) + CFG.party.gold.every_h * 3600_000;
		F("gold", "party", `gold: us ${character.gold.toLocaleString()} / ${golds.map((x) => `${x.name} ${x.gold.toLocaleString()}`).join(" / ")} | last transfer ${state.gold_xfer_at ? Math.round((now - state.gold_xfer_at) / 60_000) + "m ago" : "never"}${next > now ? `, next allowed in ${mins(next)}` : ""}`);
	}
	facts_dir_held(F, c);
	facts_shared(F, c);
	facts_goals(F, c);
	const h = character.s.monsterhunt;
	for (const P of partners()) if (P.hunt?.c > 0) F("hunt:" + P.name, "party", `${P.name}'s hunt: ${P.hunt.c}x ${P.hunt.id} left`);
	facts_hunt(F, c);
	const due = town_due();
	const tc = town_causes();
	F("town", "self", `town due: ${due_tasks(due).join(", ") || "nothing"} | errand: ${state.errand || "none"} | last run ${state.last_town ? Math.round((now - state.last_town) / 60_000) + "m ago" : "never"}`);
	F("trips", "self", `trips v${VERSION} (last ${tc.span}m): ${tc.n}${tc.n ? ` — triggered by ${tc.trig.map(([w, n]) => `${w} ${n}`).join(", ")}; work due on them: ${tc.by.map(([w, n]) => `${w} ${n}`).join(", ")}` : ""}` +
		`${tc.older ? ` | ${tc.older} more on older versions` : ""}`);
	facts_owe(F, c);
	if (state.town_block?.blockers.length) F("town_block", "self", `town blocked (${Math.round((now - state.town_block.at) / 1000)}s ago): ${state.town_block.blockers.join(", ")}`);
	// v24.50: is the party gathered (may the tank start a fight)?
	facts_engage(F, c);
	facts_camp_time(F, c);
	facts_cave(F, c); // v25.22
	// v24.48: who moved us in the last minute, in order, and how often two owners overlapped since load
	if (mv.log.length) F("moves", "self", `movement (1 min): ${mv.log.slice(-10).map((m) => `${m.who} ${m.kind}${m.n > 1 ? " x" + m.n : ""}`).join(" → ")} | clashes since load: ${mv.clash}`);
	// v24.38: the spots the last pick weighed, best first: xp/s (measured or estimated), after the walk, and what ruled it out
	facts_picks(F, c);
	// v24.37: why the monsters in view are or aren't targets (the spot's type): attackable, or skipped and why
	facts_targets(F, c);
	// v24.28: party town trips — the one on now, else the last (1h)
	{
		const P = state.ptown, L = state.ptown_last;
		if (P && !is_merchant()) F("ptown", "self", `party trip (${P.by}, ${ago(P.at)} ago; going: ${P.leavers.join(", ")}): ` +
			(P.done ? "done, waiting in town for the others" : P.joined ? `in town — ${P.why}` : P.pending ? `joining — ${P.why}` : P.why));
		else if (L && now - L.at < 3600_000) F("ptown", "self", `last party trip ${ago(L.at)} ago (${L.by}; ${L.leavers.join(", ")}): ${L.why}; waited ${L.waited}s in town` +
			(L.left_without.length ? `, went back without ${L.left_without.join(", ")}` : ", all back together"));
	}
	for (const r of state.guide?.rows || []) {
		const st = r.kind === "farm" ? "farm row" : !CFG.gear_actions.includes(r.kind) ? "not automated" : skipped(r.id) ? `paused ${mins(state.gear_skip[r.id])}: ${skip_why[r.id] || "reason not recorded"}` : r.affordable === false ? "unaffordable" : "next";
		F("guide:" + r.id, "self", `guide ${r.id}: ${st}`, r.kind === "farm" || !CFG.gear_actions.includes(r.kind));
	}
	facts_quests(F, c);
	const plan = bag_plan(), kept = {}, why_k = {}, fetched_n = {}, nd = needed_slots(), cm = compound_slots(nd);
	character.items.forEach((i, k) => {
		if (!i) return;
		const c = bag_class(i, nd, cm);
		kept[c] = (kept[c] || 0) + 1;
		if (c === "keep") {
			const r = keep_reason(i, k, nd, cm);
			why_k[r] = (why_k[r] || 0) + 1;
			if (r === "fetched") fetched_n[i.name] = (fetched_n[i.name] || 0) + 1;
		}
	});
	const fetch_names = {};
	for (const f of plan.fetch) { const n = f.name ? `${f.name}${f.level ? "+" + f.level : ""}` : f; fetch_names[n] = (fetch_names[n] || 0) + 1; }
	F("bags", "self", `bags: ${plan.free} free (min ${CFG.bag_min_free}) | keep ${kept.keep || 0}${kept.keep ? ` (${Object.entries(why_k).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(", ")})` : ""}, bank ${kept.bank || 0}, sell ${kept.sell || 0}` +
		`${plan.fetch.length ? ` | to fetch: ${Object.entries(fetch_names).map(([n, c]) => (c > 1 ? `${n} x${c}` : n)).join(", ")}` : ""}`);
	if (Object.keys(fetched_n).length) F("fetched", "self", `  fetched (kept 1h): ${Object.entries(fetched_n).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} x${c}`).join(", ")}`);
	for (const k of Object.keys(state.gear_skip).filter((x) => x.startsWith("town:")).sort()) if (skipped(k)) F("pause:" + k, "self", `${k} paused ${mins(state.gear_skip[k])}: ${skip_why[k] || "?"}`);
	if (bank_is_full()) F("bank_full", "self", `bank marked full ${Math.round((now - state.bank_full_at) / 60_000)}m ago: ${CFG.sell_junk ? "selling +0 junk meanwhile" : "nothing is sold (sell_junk off); it stays in the bags"}`);
	F("footer", "self", `level ${character.level} ${character.ctype} | ${fmt_k(character.gold)} gold | at ${character.map} ${Math.round(character.x)},${Math.round(character.y)} | calls ${spent().toFixed(0)}/${BUDGET.soft} per 4s`);
	return out;
}
// Lines for one character. compact (party sections): only "self" facts that say something; full (solo): everything.
function report_lines(log = true, compact = false) {
	const facts = report_facts().filter((f) => !compact || (f.scope === "self" && !f.quiet));
	const lines = [...(compact ? [] : [`— report v${VERSION} ${new Date().toLocaleTimeString()} —`]), ...facts.map((f) => f.text)];
	if (log) lines.forEach((l, i) => game_log(l, i === 0 && !compact ? C.title : C.note));
	return lines;
}
// why_not("bee"): is this monster farmable and safe for us, with the numbers behind the verdict
// gear_check(): every slot — what's worn (score), the best piece in the bags or the bank (from the last visit) and
// whether it would go on. Answers "is this item worth anything to me?".
// gear_check(): every character's slots in one window (like report()); gear_check("solo") only ours
function gear_check(solo) {
	const targets = party_names_all().filter((n) => n !== character.name);
	if (solo === "solo" || !targets.length || typeof send_cm !== "function") return share_text(`gear_check ${character.name}`, gear_check_lines());
	return party_gather("gear", targets, 0, gear_check_lines());
}
function gear_check_lines() {
	const g = my_gear(), sl = gear_slots_v(), L = [`— gear_check ${character.name} (${character.ctype} ${character.level}) —`];
	L.push(gear_weights_text(character.ctype));
	const cand = {}; // slot -> best { it, name, level, score, where }
	const look = (it, where) => {
		if (!it || !G.items[it.name] || !GEAR.has(G.items[it.name].type)) return;
		for (const s of slots_for(it.name, character.ctype, g)) {
			const sc = slot_value(it, character.ctype, g, s);
			if (!cand[s] || sc > cand[s].score) cand[s] = { it, name: it.name, level: it.level || 0, score: sc, where };
		}
	};
	const held = travel_slots_held(); // a piece off for the walk is the worn one, not a candidate
	character.items.forEach((it, k) => held.has(k) || look(it, "bags"));
	for (const it of state.bank_gear || []) look(it, "bank");
	const off_s = travel_off_slots();
	for (const s of GEAR_SLOTS) {
		const w = sl[s], c = cand[s], cur = g.w[s] || 0;
		const verdict = !c ? "nothing better owned" : gear_gain(c, character.ctype, g) ? `UPGRADE +${Math.round(gear_gain(c, character.ctype, g).gain)} pts → equips${c.where === "bank" ? " once fetched" : ""}` :
			c.score > cur ? `+${Math.round(c.score - cur)} pts, below the ${g.own?.[s] ? Math.round(CFG.gear_guide_override * 100) + "% guide" : Math.round(CFG.gear_margin * 100) + "%"} margin` : "worse";
		L.push(`${s.padEnd(9)} ${w ? `${w.name}+${w.level || 0}` : "(empty)"} ${Math.round(cur)} pts${g.own?.[s] ? " [guide working on it]" : ""}${off_s.has(s) ? " [off for the walk]" : ""}` +
			`${c ? ` | best owned: ${c.name}+${c.level} ${Math.round(c.score)} pts (${c.where})` : ""} — ${verdict}`);
		// v24.26: where the points come from (worn, and a better piece owned)
		if (w && cur < 1e9) L.push(`          worn: ${gear_why(w, character.ctype, g, s) || "no weighted stats"}`);
		if (c && c.score > cur) L.push(`          best: ${gear_why(c.it, character.ctype, g, s)}`);
	}
	if (!state.bank_gear?.length) L.push("(no bank snapshot yet: it's taken on the next bank visit)");
	// pieces in our bags that are upgrades for another member (handed over when near, merchant delivers)
	const takers = gear_takers().slice(1);
	for (const it of character.items) {
		const m = it && GEAR.has(G.items[it.name]?.type) && takers.find((x) => gear_gain(it, x.ctype, x.g));
		if (m) L.push(`holding ${it.name}+${it.level || 0} for ${m.name} (+${Math.round(gear_gain(it, m.ctype, m.g).gain)} pts its ${gear_gain(it, m.ctype, m.g).slot})`);
	}
	for (const k in state.gear_skip) if (k.startsWith("equip:") && skipped(k)) L.push(`refused by the server: ${k.slice(6)} — ${skip_why[k] || "?"} (retry in ${mins(state.gear_skip[k])})`);
	return L;
}
// ---- selftest(): checks the assumptions the script makes about the live game client ----
// Functions it calls, data it reads, events it listens to, storage, and a cm round trip to every other character
// (results after 4s). Run it after loading a new version; anything ✗ is a feature that can't work in this client.
const st_runs = {}; // run id -> { at, pong }: each selftest() keeps its own (two quick runs used to share one)
function selftest() {
	const R = [], now = Date.now(), mins_up = Math.max(1, Math.round((now - seen.since) / 60_000));
	const ok = (c, m, warn) => R.push(`${c ? "✓" : warn ? "!" : "✗"} ${m}`);
	const g = typeof globalThis !== "undefined" ? globalThis : {};
	const fns = ["smart_move", "move", "stop", "attack", "heal", "use_skill", "change_target", "respawn", "equip", "unequip", "buy", "sell",
		"upgrade", "compound", "exchange", "exchange_buy", "auto_craft", "bank_store", "bank_retrieve", "send_item", "send_gold", "send_cm",
		"send_party_invite", "accept_party_invite", "join", "trade", "open_stand", "close_stand", "get_progression", "set", "get", "interact"];
	const miss = fns.filter((f) => typeof g[f] !== "function");
	ok(!miss.length, `game functions: ${miss.length ? "MISSING " + miss.join(", ") : fns.length + " present"}`);
	ok(typeof character.on === "function", "character.on (events)");
	ok(typeof calculate_item_properties === "function" || typeof parent.calculate_item_properties === "function", "item stat calculator (exact gear scores)", true);
	ok(typeof calculate_item_value === "function" || typeof parent.calculate_item_value === "function", "item value calculator (stand / secondhands prices)", true);
	ok(class_stats(character.ctype)?.src === "G", `G.classes.${character.ctype}.lstats + main_stat (gear stat weights${class_stats(character.ctype) ? "" : ": missing"}${class_stats(character.ctype)?.src === "doc" ? ": using the built-in docs copy" : ""})`, true);
	ok(!!G.sets && typeof G.sets === "object", `G.sets (set bonuses in gear scores: ${Object.keys(G.sets || {}).length} sets)`, true);
	ok(typeof damage_multiplier === "function", "damage_multiplier (fight model)", true);
	ok(!!parent.S && typeof parent.S === "object", `server event list parent.S (${Object.keys(parent.S || {}).join(", ") || "no events now"})`);
	ok(!!G.tokens?.monstertoken?.tracker, `Tracktrix price (${G.tokens?.monstertoken?.tracker ?? "?"} tokens)`);
	ok(!!G.maps.main?.ref?.secondhands, "Ponty (secondhands) location");
	ok(!!G.events?.goobrawl, "Goo Brawl in G.events");
	ok(seen.hit > 0 || is_merchant(), `"hit" events: ${seen.hit} in ${mins_up} min${seen.hit ? "" : " (none: post-mortems and calibration get no damage data)"}`, true);
	ok(seen.kill > 0 || is_merchant(), `kills seen: ${seen.kill} in ${mins_up} min`, true);
	ok(stats.xp > 0 || is_merchant(), `xp gained since load: ${fmt_k(Math.round(stats.xp))}`, true);
	ok((seen.kc || 0) > 0 || is_merchant() || !in_party_cfg(), `kill_credit events since load: ${seen.kc || 0} (party kills: together-mode xp/s measurement and the watchdog use them)`, true);
	try {
		const tok = { t: now };
		set("farmer_selftest:" + character.name, tok);
		ok(get("farmer_selftest:" + character.name)?.t === now, "storage write/read (set/get)");
	} catch (e) { ok(false, "storage: " + e); }
	const size = (k) => { try { return JSON.stringify(get(k) || "").length; } catch (e) { return 0; } };
	const kb = Math.round((size(SAVE_KEY) + size(LOG_KEY) + size("farmer_report:" + character.name)) / 1024);
	ok(kb < 1500, `saved data: ${kb} KB (state + history + stored report)`, true);
	ok(Number.isFinite(character.cc), `call meter character.cc (${character.cc})`, true);
	const fl = typeof window !== "undefined" ? window.farmer_loaded : null;
	ok(true, fl ? `loaded via loader v${fl.loader} (${fl.how}) from ${fl.url}${fl.sha ? "" : " — commit unknown: loader v1 or the branch copy"}` : "pasted directly (no loader)");
	for (const n of party_names_all().filter((x) => x !== character.name)) {
		const P = n === CFG.merchant?.name ? state.merchant : state.partners[n];
		ok(fresh(P), `${n}: ${fresh(P) ? `heartbeat ${Math.round((now - P.t) / 1000)}s ago, ${build_txt(P.v, P.b)}${other_build(P.v, P.b) ? " ≠ ours" : ""}` : "no heartbeat in 10s"}`, true);
	}
	ok(true, `cm received: ${Object.entries(seen.cm).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
	const others_ = party_names_all().filter((x) => x !== character.name);
	if (!others_.length || typeof send_cm !== "function") return share_text("selftest", [`— selftest ${character.name} v${VERSION} —`, ...R]);
	const id = `${now}:${character.name}`;
	st_runs[id] = { at: now, pong: {} };
	Promise.resolve(send_cm(others_, { k: "ping", id })).catch(() => {});
	game_log("selftest: pinging " + others_.join(", ") + " (4s)…", C.info);
	setTimeout(() => selftest_finish(R, others_, id), 4000);
	return R.join("\n");
}
function selftest_finish(R, others_, id) {
	const run = st_runs[id];
	delete st_runs[id];
	for (const n of others_) {
		const p = run?.pong[n];
		R.push(`${p ? "✓" : "✗"} cm round trip ${n}: ${p ? `${p.ms} ms, v${p.v}` : "no reply in 4s (other server, offline, or older version)"}`);
	}
	const bad = R.filter((l) => l.startsWith("✗")).length, warn = R.filter((l) => l.startsWith("!")).length;
	return share_text("selftest", [`— selftest ${character.name} v${VERSION}: ${bad} failed, ${warn} warnings —`, ...R]);
}
// ---- Party report (v15.9): report() here asks every other character (same server, via cm) for its report ----
// report(hours): own report at once; then one text box with every character's section once all replied or after 6s.
// hours > 0 adds each character's history(hours). Non-repliers show their stored copy (saved every 5 min to browser
// storage, shared by characters running in the same browser) or "no reply". party_report() re-opens the last one.
const gathers = new Map(); // id -> a report/history/gear_check being collected (v23.2: several at once)
let last_party_report = null;
const report_reply_at = {}; // "requester:kind" -> last reply (one per 5s per kind: report() then history() both answer)
const party_names_all = () => [...new Set([...(CFG.party.members || []), CFG.merchant?.name].filter(Boolean))];
// report(): one window. In a party: the combined report (after every reply or 6s). Solo, or report("solo"): this
// character's full report. Each character's history of the last CFG.report_history_h hours (1) comes with it
// (v22.2); report(6) widens that to 6h, report(0) leaves it out.
function report(hours = CFG.report_history_h) {
	const solo = hours === "solo";
	if (solo) hours = CFG.report_history_h;
	const targets = party_names_all().filter((n) => n !== character.name);
	if (solo || !targets.length || typeof send_cm !== "function") return share_text("report()", [...report_lines(false), ...(hours > 0 ? history_lines(hours) : [])]);
	const own = report_lines(false, true);
	return party_gather("report", targets, hours, hours > 0 ? [...own, ...history_lines(hours)] : own);
}
// Ask every other character for its report or history; one window once all replied or after 6s
function party_gather(kind, targets, hours, own) {
	const id = `${Date.now()}:${character.name}`;
	gathers.set(id, { id, kind, hours, want: new Set(targets), got: { [character.name]: { v: VERSION, lines: own } }, at: Date.now() });
	Promise.resolve(send_cm(targets, { k: "rreq", id, hours, kind })).catch(() => {});
	game_log(`${kind}: collecting from ${targets.join(", ")} (up to 6s)…`, C.info);
	setTimeout(() => report_finish(id), 6000);
	return `collecting ${kind} from ${targets.join(", ")}…`;
}
function report_reply(m) {
	const from = m.name, now = Date.now(), rk = `${from}:${m.message.kind || "report"}`;
	if (now - (report_reply_at[rk] || 0) < 5000) return;
	report_reply_at[rk] = now;
	const h = +m.message.hours || 0;
	const lines = m.message.kind === "history" ? history_lines(h || 6) : m.message.kind === "gear" ? gear_check_lines() : [...report_lines(false, true), ...(h > 0 ? history_lines(h) : [])];
	Promise.resolve(send_cm([from], { k: "rrep", id: m.message.id, v: VERSION, b: BUILD, lines })).catch(() => {});
}
function report_collect(m) {
	const g = gathers.get(m.message.id);
	if (!g || !g.want.has(m.name)) return;
	g.got[m.name] = { v: m.message.v, b: m.message.b || null, lines: Array.isArray(m.message.lines) ? m.message.lines : [] };
	if ([...g.want].every((n) => g.got[n])) report_finish(g.id);
}
function report_finish(id) {
	const g = gathers.get(id);
	if (!g) return null;
	gathers.delete(id);
	const members = (CFG.party.members || []).filter((n) => n !== character.name).sort();
	const order = [character.name, ...members, ...(CFG.merchant?.name && CFG.merchant.name !== character.name ? [CFG.merchant.name] : [])];
	const replied = [...g.want].filter((n) => g.got[n]).length;
	const hist_k = g.kind === "history" || g.kind === "gear";
	const out = [`══ party ${g.kind === "history" ? `history (${g.hours || 6}h)` : g.kind === "gear" ? "gear_check" : "report"} ${build_txt(VERSION, BUILD)} ${new Date(g.at).toLocaleTimeString()} — ${replied}/${g.want.size} replied (from ${character.name}) ══`, ...(hist_k ? [] : party_header_lines())];
	for (const n of order) {
		const v = g.got[n]?.v, b = g.got[n]?.b;
		out.push("", `▌ ${n}${v && other_build(v, b) ? ` (${build_txt(v, b)} ≠ ${build_txt(VERSION, BUILD)}: update it)` : ""}`);
		if (g.got[n]) { out.push(...g.got[n].lines); continue; }
		const stored = !hist_k && typeof get === "function" ? get("farmer_report:" + n) : null;
		if (stored && Array.isArray(stored.lines)) out.push(`(no reply — stored copy, ${ago(stored.at)} old, v${stored.v})`, ...stored.lines);
		else out.push("(no reply: offline, on another server, or running an older version)");
	}
	if (!hist_k) last_party_report = out;
	return share_text(g.kind === "gear" ? "party gear_check" : hist_k ? "party history" : "party report", out);
}
// Everything shared, once: roster, leader and its pack, gold, hunts, last hour per member, bosses, merchant, mutual goals
function party_header_lines() {
	const out = [], me_f = in_party_cfg();
	const fighters = [...(me_f ? [{ name: character.name, ctype: character.ctype, level: character.level, map: character.map, errand: errand_busy() ? state.errand : null,
		rip: !!character.rip, gold: character.gold, hunt: character.s?.monsterhunt?.c > 0 ? { id: character.s.monsterhunt.id, c: character.s.monsterhunt.c } : null,
		h1: last_hour(), rates: rates(), xpm: xp_mult(), pack: state.pack ? { mtype: state.pack.mtype, map: state.pack.map, directive: state.pack.directive } : null }] : []),
		...partners_any()].sort((a, b) => (a.name < b.name ? -1 : 1));
	if (!fighters.length) return out;
	out.push(`roster: ${fighters.map((f) => `${f.name} ${f.ctype} ${f.level} @${f.map}${f.errand ? " (" + f.errand + ")" : ""}${f.rip ? " DEAD" : ""}`).join(" | ")}`);
	const lead = pick_leader(fighters);
	const lp = fighters.find((f) => f.name === lead)?.pack;
	out.push(`leader: ${lead || "none (no tank online)"}${lp ? ` @ ${lp.mtype} (${lp.map})${lp.directive ? " — " + lp.directive : ""}` : " — no pack"}`);
	const gw = lead === character.name ? state.group_wait?.who && !(state.group_wait.go_until > Date.now()) ? state.group_wait.who : null : state.partners[lead]?.grp_wait;
	if (gw) out.push(`party: waiting for ${gw}`);
	const M = is_merchant() ? { name: character.name, gold: character.gold, map: character.map, esize: character.esize, serving: state.serving } : merchant_hb();
	out.push(`gold: ${[...fighters, ...(M ? [M] : [])].map((f) => `${f.name} ${fmt_k(f.gold || 0)}`).join(" / ")}`);
	const hunts = {};
	for (const f of fighters) if (f.hunt?.c > 0) (hunts[`${f.hunt.id}`] = hunts[f.hunt.id] || []).push(`${f.name} ${f.hunt.c}`);
	if (Object.keys(hunts).length) out.push(`hunts: ${Object.entries(hunts).map(([id, xs]) => `${id} (${xs.join(", ")})`).join(" | ")}`);
	out.push(`last hour: ${fighters.map((f) => `${f.name} ${f.h1 ? `${f.h1.dead}d/${f.h1.fled}f/${f.h1.town}town` : "?"}${f.rates ? ` ${fmt_k(f.rates.xph)}xp/h` : ""}${f.xpm ? ` (x${(+f.xpm).toFixed(2)})` : ""}`).join(" | ")}`);
	const S_ = parent.S || {}, live = Object.keys(S_).filter((k) => S_[k]?.live === true && G.monsters[k]);
	if (live.length) out.push(`bosses: ${live.map((k) => `${k}@${S_[k].map} ${boss_safe(k) ? "JOIN" : "too strong"}`).join(", ")}`);
	const lack = [...fighters.map((f) => [f.name, f.name === character.name ? hold_missing() : f.need]), ...(M ? [[M.name, M.name === character.name ? hold_missing() : M.need]] : [])]
		.filter(([, nd]) => Array.isArray(nd) && nd.length);
	if (lack.length) out.push(`missing must-hold items: ${lack.map(([n, nd]) => `${n} (${nd.join(", ")})`).join(", ")}`);
	if (CFG.spend?.enabled) out.push(budget_text());
	if (CFG.merchant?.name) out.push(`merchant ${CFG.merchant.name}: ${M ? `${M.serving ? "serving " + M.serving : "in " + M.map}, ${M.esize} free` : "offline (fighters do their own town runs)"}`);
	if (lead === character.name && state.shared?.mutual.length) out.push(`mutual goals: ${state.shared.mutual.slice(0, 3).join(" | ")}`);
	return out;
}
const party_report = () => (last_party_report ? share_text("party report", last_party_report) : "no party report yet: run report()");
// Stored copy for party reports when cm can't reach us (other server, same browser)
function store_report() {
	if (typeof set === "function") try { set("farmer_report:" + character.name, { at: Date.now(), v: VERSION, lines: report_lines(false) }); } catch (e) {}
}
setInterval(store_report, 300_000);
