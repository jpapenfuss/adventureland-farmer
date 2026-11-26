// =====================================================================
// fighter/7_report.js — fighters only (src/manifest.json): report() lines and why_not's answer
// =====================================================================
function gap_kind() {
	const pk = state.pack;
	if (character.rip || is_merchant() || !pk || !valid_boundary(pk.boundary)) return null;
	if (errand_busy() || walking() || character.map !== pk.map || !in_boundary(pk.boundary, 250)) return "away from the camp (walk, town)";
	const party = party_names(), b = pk.boundary, P_ = CFG.near_pad, box = [b[0] - P_, b[1] - P_, b[2] + P_, b[3] + P_];
	let alive = 0, on_us = 0, theirs = 0, beyond = 0;
	for (const id in parent.entities || {}) {
		const e = parent.entities[id];
		if (e?.type !== "monster" || e.dead || !e.visible) continue;
		if (e.target && party.has(e.target)) on_us++;
		else if (e.mtype === pk.mtype && in_rect(e.x, e.y, box)) { if (e.target) theirs++; else if (live_ok(e) || killable(e)) alive++; else beyond++; }
		else if (!e.target && farmable_entity(e) && in_rect(e.x, e.y, b)) { const f = live_ok(e); if (f && f.ttk * (e.hp / e.max_hp) <= CFG.max_ttk_s) alive++; } // v25.57: a filler choose_target would take
	}
	const t = get_targeted_monster();
	if (on_us) return t && t.target && in_reach(t, "attack") ? "in a fight, target in reach" : "in a fight, no target in reach";
	// v25.57: the camp's monsters that another player is fighting aren't "nothing alive" (squigtoad: a grow spawn of 2 always
	// has one up, yet the report said "nothing alive" 53% of the time — other players had them)
	if (!alive) return theirs ? "monsters here, all another player's" : beyond ? "monsters here, none the party can kill (the idle time rests the camp)" : "nothing alive here (respawn)";
	if (is_follower()) return "monsters alive, waiting for the tank's first hit";
	if (!t) return "monsters alive, none chosen";
	if (tank_first(t)) return "monsters alive, holding for the party";
	return in_reach(t, "attack") ? "monsters alive, in reach, swing on cooldown" : "monsters alive, walking to the next one";
}
// ---- report() sections of the fighters (v24.96): called from report_facts in order; c = { p: state.pack, d: state.directive, now } ----
function facts_doing(F, ctx) {
	const { p, d, now } = ctx;
	const at_pack = !!p && character.map === p.map && in_boundary(p.boundary, 600);
	const why_ = p?.directive || (p ? `best ${rate_unit()} (${p.score !== undefined ? p.score.toFixed(0) : "?"})` : "no safe pack");
	const where = p && !at_pack ? (character.map === p.map ? `${Math.round(Math.hypot(character.x - (p.boundary[0] + p.boundary[2]) / 2, character.y - (p.boundary[1] + p.boundary[3]) / 2))}px away` : `now at ${character.map}`) : "";
	const tgt = p ? `${at_pack ? "" : "→ "}${p.mtype} @ ${p.map}${where ? ` (${where})` : ""}` : "nothing";
	// a follower's reason is "following X"; the leader's directive is in the party header
	F("doing", "self", `fighting: ${tgt}${is_follower() ? ` — ${why_}` : ""}`);
	F("doing_why", "party", `  because ${why_}`, is_follower());
	if (d && !is_follower() && !state.safe[d.monster] && !d.boss) F("directive_unsafe", "self", `directive ${d.monster} is NOT safe → ignored (why_not("${d.monster}"))`);
}

function facts_party(F, ctx) {
	const { p, d, now } = ctx;
	if (!(in_party_cfg())) return;
	const near = partners_near().map((x) => x.name);
	F("near", "self", `near: ${near.join(", ") || "nobody"}${leader_name() === character.name ? " | LEADER" : ""}`);
	F("party", "party", `party: leader ${leader_name() || "none (no tank online)"} | in game party: ${Object.keys(get_party() || {}).join(", ") || "no"}`);
	for (const n of others()) {
		const P = state.partners[n];
		F("partner:" + n, "party", fresh(P) ? `  ${n} (${P.ctype} ${P.level}${P.rip ? ", DEAD" : ""}, ${build_txt(P.v, P.b)}${other_build(P.v, P.b) ? " ≠ ours: update it" : ""}) on ${P.map}${P.errand ? ", in " + P.errand : ""}`
			: `  ${n}: no message in 20s (not running the script, or offline)`);
	}
}

function facts_bosses(F, ctx) {
	const { p, d, now } = ctx;
	if (!(CFG.boss?.enabled)) return;
	const S_ = parent.S || {}, live = Object.keys(S_).filter((k) => S_[k]?.live === true && G.monsters[k]);
	F("bosses", "party", `bosses: ${live.length ? live.map((k) => `${k}@${S_[k].map} ${boss_safe(k) ? "JOIN" : "too strong"}`).join(", ") : "none live on this server"}`, !live.length);
}

function facts_probe(F, ctx) {
	const { p, d, now } = ctx;
	if (!(CFG.probe?.enabled && (!in_party_cfg() || leader_name() === character.name))) return;
	const P = state.probe, last = [...hist.ev].reverse().find((e) => e.type === "probe");
	const next = (state.probe_at || 0) + CFG.probe.every_min * 60_000;
	const why_ = P ? null : probe_why(), none = state.probe_none && Date.now() - state.probe_none.at < 2 * 3600_000 ? state.probe_none : null;
	F("probe", "self", `probe: ${P ? `${P.mtype} running (${Math.max(0, Math.round((P.until - Date.now()) / 60_000))}m left, risk x${P.ratio.toFixed(2)})` : why_}` +
		(none && !P ? ` | last check ${ago(none.at)} ago: no monster within x${CFG.probe.max_over} of the limit beats ${CFG.probe.min_gain}x the best ${none.best} ${rate_unit()}` : "") +
		(last ? ` | last probe: ${last.mtype} ${last.result === "ok" ? "✓" : "✗ " + last.why} ${ago(last.t)} ago` : ""));
}

function facts_engage(F, ctx) {
	const { p, d, now } = ctx;
	if (!(together_now() && partners_any().length)) return;
	const miss = is_tank_class(character.ctype) ? party_missing() : null, tk = party_tank();
	// v25.20: the free-for-all
	const os = is_tank_class(character.ctype) ? oneshot_types() : (leader_hb()?.os || []);
	if (os.length) F("engage_ffa", "self", `free-for-all: ${os.join(", ")} — the tank kills ${os.length > 1 ? "them" : "it"} in one hit; at its camp everyone starts fights on ${os.length > 1 ? "them" : "it"}${state.os_pick ? ` (our pick: ${parent.entities?.[state.os_pick]?.mtype || "?"})` : ""}`);
	F("engage", "self", miss ? (miss.length ? `engage: holding — waiting for ${miss.join(", ")} within ${CFG.party.engage_px}px` : "engage: party gathered — the tank may start fights")
		: tk ? `engage: ${tk.name} (tank) starts every fight; we hit what already targets the party` : "engage: no tank alive — fighting on our own judgement");
}

function facts_picks(F, ctx) {
	const { p, d, now } = ctx;
	if (!(!is_follower() && state.pick_table?.length)) return;
	const T_ = [...state.pick_table].sort((x, y) => Math.max(y.rate || 0, y.m) - Math.max(x.rate || 0, x.m)).slice(0, 6);
	const cur = p ? pack_key(p) : null;
	if (state.review_at && !is_follower()) {
		const pw = party_power(), RL = state.review_last;
		F("camp_review", "self", `camp review: next in ${mins((state.review_at || 0) + CFG.camp_review_min * 60_000)} (sooner once the party is stronger: now avg level ${pw?.lv ?? "?"}, gear ${pw?.gs ?? "?"} pts; at the last pick ${state.review_pw?.lv ?? "?"} / ${state.review_pw?.gs ?? "?"})` +
			(RL ? ` | last ${ago(RL.at)} ago (${RL.why}): ${RL.text}` : ""));
	}
	F("picks", "self", `spot choice (${ago(state.pick_table_at || state.last_pick || Date.now())} ago${farm_kind() === "gold" ? ", GOLD mode: base gold/s" : ""}): ` + T_.map((c) => `${c.mtype}@${c.map} ${Math.round(c.rate || c.m)}${c.m ? " measured" : " est"}` +
		(c.out ? ` ✗ ${c.out}` : `${Math.round(c.score) !== Math.round(c.rate) ? ` (${Math.round(c.score)} after the walk)` : ""}${c.key === cur ? " ← here" : ""}`)).join(" | "));
}

function facts_targets(F, ctx) {
	const { p, d, now } = ctx;
	if (!(p && character.map === p.map)) return;
	const party = party_names(), box = p.boundary, P_ = CFG.near_pad, c = { ok: 0, unsafe: [], beyond: [], far: 0, taken: 0, ignored: 0, wall: 0 };
	for (const id in parent.entities || {}) {
		const e = parent.entities[id];
		if (!e || e.type !== "monster" || e.mtype !== p.mtype || !e.visible || e.dead) continue;
		if ((state.bad_ids[e.id] || 0) > now) c.ignored++;
		else if (e.target && !party.has(e.target)) c.taken++;
		else if (!in_rect(e.x, e.y, [box[0] - P_, box[1] - P_, box[2] + P_, box[3] + P_])) c.far++;
		else if (!live_ok(e)) (killable(e) ? c.unsafe : c.beyond).push(e.level || 1);
		else { c.ok++; if (!(distance(character, e) <= character.range || can_move_to(e))) c.wall++; }
	}
	const n = c.ok + c.unsafe.length + c.beyond.length + c.far + c.taken + c.ignored;
	if (n) F("targets", "self", `targets: ${n} ${p.mtype} in view — ${c.ok} attackable${c.wall ? ` (${c.wall} behind a wall/water)` : ""}` +
		`${c.unsafe.length ? `, ${c.unsafe.length} levelled up past the limit — the tank takes them, lowest first, when none passes (levels ${c.unsafe.sort((x, y) => x - y).join(",")})` : ""}` +
		`${c.beyond.length ? `, ${c.beyond.length} the party can't kill within ${CFG.hopeless_ttk_s}s — never taken (levels ${c.beyond.sort((x, y) => x - y).join(",")})` : ""}` +
		`${c.far ? `, ${c.far} outside the spot (+${P_}px)` : ""}${c.taken ? `, ${c.taken} someone else's` : ""}${c.ignored ? `, ${c.ignored} ignored (no damage / unreachable)` : ""}`);
}

function facts_quests(F, ctx) {
	const { p, d, now } = ctx;
	// v25.15: own quests left out because their output wouldn't be worn (or we already have one)
	if (CFG.quest_crafts && !Array.isArray(CFG.quest_crafts)) {
		const sk = Object.keys(G.craft).filter((id) => { const r = G.craft[id];
			return r.quest && CFG.quest_npcs.includes(r.quest) && !CFG.quest_craft_skip.includes(id) && !is_guide_quest(id)
				&& !(CFG.quest_crafts === "materials" && r.items.some(([, n]) => GEAR.has(G.items[n]?.type))) && quest_skip_why(id); });
		if (sk.length) F("quest_skip", "self", `quests skipped: ${sk.map((id) => `${id} (${quest_skip_why(id)})`).join(", ")}`);
	}
	for (const id of quest_recipes()) {
		const r = G.craft[id];
		const inputs = r.items.map(([q, n, l]) => { const b = l ? 0 : bank_share(n), t = state.bank_seen[n] || 0;
			return `${n}${l ? "+" + l : ""} ${held(n, l)}${b ? `(+${b} bank${t > b ? ` of ${t}` : ""})` : t && !l ? `(bank ${t}: partners' share)` : ""}/${q}`; }).join(", ");
		const pk = quest_parked(id) && quest_park_cache.get(id);
		const st = pk ? `parked ~${Math.round(pk.eta)}h to farm (> ${CFG.quest_park_h}h; materials banked)` : !recipe_wanted(id) ? "done" : skipped("qc:" + id) ? `paused ${mins(state.gear_skip["qc:" + id])}` : has_inputs(r) ? "READY to craft" : "collecting";
		F("quest:" + id, "self", `quest ${id}${is_guide_quest(id) ? " [guide]" : ""} @ ${G.npcs[r.quest]?.name || r.quest}: ${st} — ${inputs}`, st === "done");
	}
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
// Why probe_ready() says no right now (report; v20.0 — the probe line used to be hidden until a first probe ran)
function probe_why() {
	const P = CFG.probe, now = Date.now();
	if (!P?.enabled) return "off";
	if (is_follower() || (in_party_cfg() && leader_name() !== character.name)) return "only the leader probes";
	if (state.probe) return null;
	if (now - (state.probe_at || 0) < P.every_min * 60_000) return `next check in ${mins((state.probe_at || 0) + P.every_min * 60_000)}`;
	if (state.directive?.boss) return "boss fight";
	if (event_live()) return "event running";
	if (errand_busy()) return `errand ${state.errand}`;
	if (state.recovering || character.rip) return "recovering";
	const all = partners(), near = partners_near();
	if (near.length < all.length) return `waiting for ${all.filter((p) => !near.includes(p)).map((p) => p.name).join(", ")} to be near`;
	if (character.hp < character.max_hp * 0.8) return "our HP under 80%";
	if (pot_count("hp") < CFG.pot_min * 2 || pot_count("mp") < CFG.pot_min * 2) return `our potions under ${CFG.pot_min * 2}`;
	const low = all.find((p) => !(p.max_hp && p.hp >= p.max_hp * 0.8));
	if (low) return `${low.name} HP under 80%`;
	const lp = all.find((p) => (p.pots?.hp ?? 0) < CFG.pot_min * 2 || (p.pots?.mp ?? 0) < CFG.pot_min * 2);
	if (lp) return `${lp.name} potions under ${CFG.pot_min * 2}`;
	return "ready (next pick)";
}
// ---- more report() lines of the fighters (v25.2), called from report_facts in order ----
function facts_stat(F, ctx) {
	const { p, d, now } = ctx;
	if (CFG.stat_scroll?.enabled) {
		const L = stat_scroll_list();
		if (L.length) F("stat", "self", `stat scrolls: ${L.map((r) => `${r.name}${r.level ? "+" + r.level : ""} → ${r.stat} (${r.q} scroll${r.q === 1 ? "" : "s"}, ${fmt_k(r.cost)}, +${r.pts.toFixed(1)} pts)${r.ok ? " — on the next town trip" : " — not done: " + r.why}`).join("; ")}`);
	}
}
function facts_elixir(F, ctx) {
	const { p, d, now } = ctx;
	if (CFG.elixir_auto) {
		const e = character.slots?.elixir;
		const t = elixir_active() ? `${e.name}${e.expires ? ` until ${new Date(e.expires).toLocaleTimeString()}` : ""}` : best_elixir() ? "about to drink " + best_elixir().name
			: bank_elixir() ? "fetching " + bank_elixir().name + " from the bank" : character.gold >= CFG.elixir_buy_min_gold ? "buying " + CFG.elixir_buy : `none (buys ${CFG.elixir_buy} at ${fmt_k(CFG.elixir_buy_min_gold)} gold)`;
		F("elixir", "self", `elixir: ${t}`, !elixir_active() && !best_elixir() && !bank_elixir() && character.gold < CFG.elixir_buy_min_gold);
	}
}
function facts_safety(F, ctx) {
	const { p, d, now } = ctx;
	if (p && !p.boss) F("safety", "self", `safety limit ${Math.round(safety_now() * 100)}% of HP per kill${(state.safety_mult || 1) > 1 ? ` (raised from ${Math.round(CFG.safety * 100)}%; next step ${mins((state.safety_at || Date.now()) + CFG.safety_tune.step_h * 3600_000)})` : ""} | at ${p.mtype}: x${danger_of(p.mtype).toFixed(2)} — ${calib_text(p.mtype)}${state.danger[p.mtype] ? `, incidents x${state.danger[p.mtype].toFixed(2)}` : ""}`, danger_of(p.mtype) >= 1);
}
function facts_guide_farm(F, ctx) {
	const { p, d, now } = ctx;
	if (state.guide_farm) F("guide_farm", "self", `guide farm row: ${state.guide_farm.monster} (${state.guide_farm.reason})`, true);
}
function facts_dir_held(F, ctx) {
	const { p, d, now } = ctx;
	if (state.dir_held && state.dir_lock) F("dir_held", "self", `committed to ${state.directive?.monster} for ${mins(state.dir_lock.until)} more; then: ${state.dir_held.monster} (${state.dir_held.reason})`);
}
function facts_shared(F, ctx) {
	const { p, d, now } = ctx;
	if (!is_follower() && partners().length) {
		if (state.shared?.mutual.length) F("mutual", "party", `mutual goals: ${state.shared.mutual.slice(0, 3).join(" | ")}`);
		else if (state.turn) F("turn", "party", `no mutual goal; turn: ${state.turn.who}'s for ${mins(state.turn.end)}${state.turn.arrived ? "" : " (walking there; the clock starts on arrival)"}`);
		if (state.shared?.too_slow.length) F("too_slow", "party", `too slow to share (> ${CFG.party.mutual_max_h}h): ${state.shared.too_slow.slice(0, 4).join(" | ")}`);
	}
}
function facts_goals(F, ctx) {
	const { p, d, now } = ctx;
	if (is_follower()) F("goals", "self", `my goals (shared with ${leader_name() || "nobody"}): ${goals_list().sort((a, b) => b.w - a.w).slice(0, 4).map((g) => g.monster + " (" + g.reason + ")").join(", ") || "none"}`);
}
function facts_hunt(F, ctx) {
	const { p, d, now } = ctx;
	const h = character.s.monsterhunt;
	F("hunt", "party", `hunt: ${h ? (h.c > 0 ? `${h.c}x ${h.id} left${hunt_feasible(h) ? "" : CFG.hunt_min_xp > 0 && mt_xps(h.id) < CFG.hunt_min_xp * best_known_xps() ? ` — ${h.id} pays ${Math.round(mt_xps(h.id))} xp/s vs best ${Math.round(best_known_xps())}: not chased` : ` — can't finish in ${Math.round((h.ms || 0) / 60_000)}m left: ignored until it lapses`}` : `${h.id} done, turn in`) : "none"}${skipped("hunt:auto") ? ` (Daisy paused ${mins(state.gear_skip["hunt:auto"])})` : ""}`);
}
function facts_owe(F, ctx) {
	const { p, d, now } = ctx;
	if ((state.owe || 0) >= 1) F("owe", "self", `owes ${CFG.merchant?.name || "the merchant"} ${fmt_k(state.owe)} for potions (paid when it's within reach, from gold above ${fmt_k(CFG.gold_reserve)})`);
}
function facts_camp_time(F, ctx) {
	const { p, d, now } = ctx;
	{ const g = gaps_text(); if (g) F("camp_time", "self", g); }
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
function gaps_text() {
	const by = {};
	for (const b of gaps.min) for (const k in b.by) by[k] = (by[k] || 0) + b.by[k];
	const tot = sum_obj(by);
	if (tot < 30_000) return null;
	// the camp's own spawn (the server's grow threshold is per spawn), else the type's spawns on the map
	const pk = state.pack, sp_all = pk ? (G.maps[pk.map]?.monsters || []).filter((x) => x.type === pk.mtype) : [];
	const own = pk && valid_boundary(pk.boundary) && sp_all.find((x) => x.boundary && x.boundary.join(",") === pk.boundary.join(","));
	const spawn = own ? own.count || 0 : sp_all.reduce((a, x) => a + (x.count || 0), 0), rs = pk && G.monsters[pk.mtype]?.respawn;
	// (a grow spawn refills on a kill once two thirds or fewer are up — server: no respawn wait, no kills/h cap)
	const grow = own ? !!own.grow : sp_all.some((x) => x.grow);
	const cap = !spawn ? "" : grow ? ` | the map has ${spawn} ${pk.mtype}, a grow spawn: refilled on each kill once ${Math.floor(spawn * 2 / 3)} or fewer are up`
		: rs > 0 ? ` | the map has ${spawn} ${pk.mtype}, respawn ${rs}s: at most ${Math.round(spawn * 3600 / rs)} kills/h for the party` : "";
	return `camp time (${Math.round(tot / 60_000)} min): ` + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / tot * 100)}%`).join(" | ") + cap;
}
// ---- why_not("bee") (console): is this monster farmable and safe for us — the fighters' answer (v25.3) ----
function why_not_fighter(mtype) {
	const lines = [];
	const L = (s) => { lines.push(s); game_log(s, C.note); };
	const out = (r) => (share_text(`why_not("${mtype}")`, lines), r);
	const m = G.monsters[mtype];
	if (!m) return out(L(`${mtype}: no such monster`));
	const flags = ["special", "cooperative", "global", "unlist", "immune", "passive", "peaceful", "stationary", "cute"].filter((f) => m[f]);
	if (!farmable_type(mtype)) return out(L(`${mtype}: not farmable (${flags.join(", ") || "no xp/attack/respawn"})`));
	const f = fight_math(m);
	if (!f) return out(L(`${mtype}: we can't out-damage its healing`));
	const limit = (f.hp_pool || character.max_hp) * safety_now() * danger_of(mtype, f) * heal_mult(f);
	L(`${mtype}: ${f.ttk.toFixed(1)}s per kill, takes ~${fight_risk(f).toFixed(0)} dmg/kill vs limit ${limit.toFixed(0)} → ${safe_enough(f, mtype) ? "SAFE" : "UNSAFE"}` +
		`${f.kiteable ? " (kiteable)" : ""}${f.hp_pool > character.max_hp ? " (tank's HP)" : ""}`);
	L(`  safety x${danger_of(mtype).toFixed(2)} = ${calib_text(mtype)} × incidents x${(state.danger[mtype] || 1).toFixed(2)}`);
	const sk = Object.entries(state.pick_skips || {}).filter(([k, w]) => (G.maps[k.split(":")[0]]?.monsters || []).some((pk) => pk.type === mtype) || w.includes(mtype));
	if (sk.length) L(`  skipped as dangerous at the last pick: ${sk.slice(0, 6).map(([k, w]) => `${k.split("#")[1] ? k.split("#")[1] + "@" : ""}${k.split(":")[0]} (${w})`).join("; ")}`);
	const areas = [];
	each_area((pack, area) => { if (pack.type === mtype) areas.push(`${area.map} x${Math.round(area.count)}${(state.cooldown[pack_key(area)] || 0) > Date.now() ? ` (cooldown ${mins(state.cooldown[pack_key(area)])})` : ""}`); });
	L(`${mtype} packs: ${areas.join(", ") || "none on open maps"}; respawn ${m.respawn}s${m.respawn > CFG.max_respawn ? " (> max_respawn: only via directive)" : ""}`);
	return out();
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
function calib_text(mt) {
	const c = state.calib[calib_key(mt)];
	return c ? `calibration x${calib_factor(mt).toFixed(2)} (predicted ${Math.round(c.pred)}, actual ${Math.round(c.act)} dmg per fight over ${c.n}${c.n < CALIB_MIN_N ? `, needs ${CALIB_MIN_N}: judged as an unknown monster` : ""})`
		: `calibration x${calib_factor(mt).toFixed(2)} (no fights yet: judged as the worst we've measured, at least x${CFG.model_distrust} the prediction)`;
}
