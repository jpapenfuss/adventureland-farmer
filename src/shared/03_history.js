// =====================================================================
// History (v15): a persistent event log + hourly buckets, and death/flee post-mortems. Saved under its own key with
// save_state (every 60s and on_destroy). history(h) / deaths(n) print it as copyable text.
// =====================================================================
const LOG_KEY = "farmer_log:" + character.name;
const hist = { ev: [], buckets: {}, dirty: false };
(() => {
	const d = typeof get === "function" ? get(LOG_KEY) : null;
	if (d && d.v === 1) { hist.ev = Array.isArray(d.ev) ? d.ev : []; hist.buckets = d.buckets || {}; }
})();
function log_ev(type, data = {}) {
	hist.ev.push({ t: Date.now(), type, ...data });
	if (hist.ev.length > CFG.history_max) hist.ev.splice(0, hist.ev.length - CFG.history_max);
	hist.dirty = true;
}
log_ev("loaded", { v: VERSION }); // trip/time stats per version count from here
function save_hist() {
	if (!hist.dirty || typeof set !== "function") return;
	const keep = Date.now() - CFG.history_hours * 3600_000;
	for (const k in hist.buckets) if (+k < keep) delete hist.buckets[k];
	if (set(LOG_KEY, { v: 1, ev: hist.ev, buckets: hist.buckets })) hist.dirty = false;
}
const hour_of = (t) => Math.floor(t / 3600_000) * 3600_000;
function bucket(t = Date.now()) {
	const k = hour_of(t);
	return (hist.buckets[k] = hist.buckets[k] || { time: {}, xp: 0, gold: 0, earn: 0, spend: 0, ls: 0, kills: 0, deaths: 0, flees: 0 });
}
// Last 20s, one sample per second (filled by the 1s interval), and hits taken with the attacker's type
const pmring = { ring: [], hits: [] };
const seen = { hit: 0, target_hit: 0, kill: 0, kc: 0, cm: {}, since: Date.now() }; // event counts since load (selftest, watchdog)
if (typeof character.on === "function") {
	character.on("hit", (d) => {
		seen.hit++;
		if (!d || !(d.damage > 0)) return;
		const a = parent.entities?.[d.actor];
		pmring.hits.push({ t: Date.now(), mtype: a?.mtype || (a ? a.ctype || "player" : "?"), dmg: d.damage });
		if (a?.mtype && G.monsters[a.mtype]) cal.cur[a.mtype] = (cal.cur[a.mtype] || 0) + d.damage;
		if (pmring.hits.length > 200) pmring.hits.shift();
	});
	character.on("target_hit", (d) => {
		seen.target_hit++;
		if (!d?.kill) return;
		seen.kill++; bucket().kills++;
		// own kills, valued at the monster's base xp (end_session: kills but no kill_credit events → an error is logged)
		const mt = parent.entities?.[d.target]?.mtype || state.session?.mtype;
		if (state.session && mt && G.monsters[mt]) state.session.kx = (state.session.kx || 0) + (G.monsters[mt].xp || 0);
	});
}
function pm_sample() {
	const t = get_targeted_monster();
	const attackers = Object.values(parent.entities || {}).filter((e) => e.type === "monster" && e.target === character.name)
		.slice(0, 6).map((e) => ({ mtype: e.mtype, hp: e.hp }));
	pmring.ring.push({ t: Date.now(), hp: character.hp, mp: character.mp, target: t ? `${t.mtype}:${t.hp}` : null, attackers });
	if (pmring.ring.length > 20) pmring.ring.shift();
}
// What killed / nearly killed us: damage by attacker type over the last 10s, HP over the last 20s, and what the fight
// model predicted for the main culprit (risk over one kill vs the HP it was judged against)
function postmortem() {
	const now = Date.now(), by = {};
	for (const h of pmring.hits) if (now - h.t < 10_000) by[h.mtype] = (by[h.mtype] || 0) + h.dmg;
	const killer = Object.entries(by).sort((a, b) => b[1] - a[1])[0]?.[0] || state.pack?.mtype || null;
	const f = killer && G.monsters[killer] ? fight_math(G.monsters[killer]) : null;
	return { killer, dmg10: by, hp: pmring.ring.map((r) => r.hp), max_hp: character.max_hp, pack: state.pack?.mtype || null,
		map: character.map, x: Math.round(character.x), y: Math.round(character.y), tank: !!tank_cover(),
		priest: partners_near().some((p) => p.ctype === "priest"), pots: { hp: pot_count("hp"), mp: pot_count("mp") },
		predicted: f ? Math.round(fight_risk(f)) : null, pool: f ? Math.round(f.hp_pool) : null,
		danger: killer ? +danger_of(killer).toFixed(2) : null, last: pmring.ring.slice(-6) };
}
// ---- Calibration (v15.1): damage actually taken per fight vs the model's prediction ----
// Hits are summed per attacker type; a fight with type M ends when our target of type M dies or we switch away from
// it, and its damage is compared with fight_risk for M (expected damage over one kill).
const cal = { cur: {}, tgt: null };
function calib_record(mt) {
	const m = G.monsters[mt], f = m && fight_math(m);
	const pred = f ? fight_risk(f) : 0, act = cal.cur[mt] || 0;
	cal.cur[mt] = 0;
	// under tank cover we take little damage by design: such fights say nothing about fighting it without the tank
	if (!(pred > 1) || f.tank) return;
	const r = Math.min(act / pred, 5); // one freak fight can't swing it more than 5x
	const ck = calib_key(mt);
	const c = (state.calib[ck] = state.calib[ck] || { ratio: 1, n: 0, act: 0, pred: 0 });
	const a = c.n < 10 ? 1 / (c.n + 1) : 0.1; // plain average for the first 10, then EMA
	c.ratio += (r - c.ratio) * a; c.act += (act - c.act) * a; c.pred += (pred - c.pred) * a; c.n++;
	const g = state.calib_all, ga = g.n < 50 ? 1 / (g.n + 1) : 0.02;
	g.ratio += (r - g.ratio) * ga; g.n++;
}
function calib_tick() {
	const t = get_targeted_monster(), e = cal.tgt && parent.entities?.[cal.tgt.id];
	if (cal.tgt && (!e || e.dead || !t || t.id !== cal.tgt.id)) { calib_record(cal.tgt.mtype); cal.tgt = null; }
	if (t && t.type === "monster" && G.monsters[t.mtype] && !cal.tgt) cal.tgt = { id: t.id, mtype: t.mtype };
}
// Incidents fade: 10% of the way back to 1 per hour, starting an hour after the last one
setInterval(() => {
	const now = Date.now(), k = 1 - Math.pow(0.9, 1 / 60); // per minute
	for (const mt in state.danger) {
		if (now - (state.danger_at[mt] || 0) < 3600_000) continue;
		state.danger[mt] += (1 - state.danger[mt]) * k;
		if (Math.abs(1 - state.danger[mt]) < 0.01) delete state.danger[mt];
	}
}, 60_000);
function incident(mt, mult) {
	if (!mt || !G.monsters[mt]) return;
	state.danger[mt] = (state.danger[mt] || 1) * mult;
	state.danger_at[mt] = Date.now();
}
// ---- Watchdog (CFG.watchdog) ----
const wd = { pos: [], lost_since: null, acts: [], here_since: null };
function wd_act(kind, note) {
	const now = Date.now();
	wd.acts = wd.acts.filter((t) => now - t.t < 3600_000);
	wd.acts.push({ t: now, kind });
	log_ev("stuck", { kind, note, map: character.map, x: Math.round(character.x), y: Math.round(character.y), pack: state.pack?.mtype || null });
	game_log(`watchdog: ${kind} — ${note}`, C.warn);
}
function watchdog() {
	const W = CFG.watchdog, now = Date.now();
	if (!W?.enabled) return;
	wd.pos.push({ t: now, map: character.map, x: character.x, y: character.y, hits: seen.target_hit, kills: seen.kill, kc: seen.kc || 0 });
	wd.pos = wd.pos.filter((p) => now - p.t <= 15 * 60_000);
	if (character.rip || state.recovering || state.parked || character.map === "bank" || errand_busy() || state.pack?.boss || is_merchant()) {
		wd.lost_since = null;
		wd.pos = wd.pos.slice(-1); // v24.4: the clocks restart after; a town trip + walk back used to count as 10 min without a kill
		return;
	}
	const since = (min) => wd.pos.filter((p) => now - p.t >= min * 60_000).pop(); // the sample ~min minutes ago
	// v23.0: progress is our own fighting, not xp. In a party every member receives xp from every party kill wherever it
	// is (server), so a stuck fighter kept "gaining xp" and frozen/noprog never fired for party members.
	// frozen: no hit landed; noprog: no kill (together: any party kill — kill_credit — since the party shares targets)
	const no_hits = (p) => !!p && seen.target_hit - p.hits <= 0;
	const no_kills = (p) => !!p && (!seen.kc ? seen.kill - p.kills : seen.kc - p.kc) <= 0;
	const still = (p) => !!p && wd.pos.filter((q) => q.t >= p.t).every((q) => q.map === character.map && Math.hypot(q.x - character.x, q.y - character.y) < 20);
	const reset = (p) => { wd.pos = wd.pos.filter((q) => q.t > now - 1000); return p; };
	if (is_follower()) {
		const L = leader_hb(), pos = L && partner_pos(L);
		const away = !!pos && !L.rip && !L.errand && (pos.map !== character.map || Math.hypot(pos.x - character.x, pos.y - character.y) > CFG.party.follow_far) &&
			!(state.follow_block && now - state.follow_block.at < 60_000); // v24.16: held back on purpose (a deadly way), not lost
		wd.lost_since = away ? wd.lost_since || now : null;
		const f = since(W.frozen_min);
		if (still(f) && no_hits(f) && !away) { // a follower glued in place while the leader is near: walk back to it
			reset();
			wd_act("frozen", `follower stuck ${W.frozen_min} min; walking to ${L?.name}`);
			halt("watchdog");
			state.travel_block_until = 0;
		}
		return;
	}
	const f = since(W.frozen_min);
	if (state.pack && still(f) && no_hits(f)) { // no pack = nothing safe to fight: waiting is correct, not a stall
		reset();
		wd_act("frozen", `no movement and no hits for ${W.frozen_min} min${state.pack ? " at " + state.pack.mtype : ""}`);
		halt("watchdog");
		state.travel_block_until = 0;
		if (state.pack) state.cooldown[pack_key(state.pack)] = now + CFG.pack_cooldown_ms;
		state.last_pick = 0;
		return;
	}
	// v24.9: only time at the pack counts — a walk there longer than noprog_min put it on cooldown before we arrived, and
	// the next pick (often as far) went the same way: Torlis walked 93% of an hour, three noprogs at three spots
	const P_ = state.pack, at_pack = !!P_ && character.map === P_.map && in_boundary(P_.boundary, 300);
	if (!at_pack) wd.here_since = null; else if (!wd.here_since) wd.here_since = now;
	const n = since(W.noprog_min);
	if (state.pack && at_pack && n && n.t >= wd.here_since - 31_000 && no_kills(n)) {
		reset();
		const repeat = wd.acts.filter((a) => a.kind === "noprog").length >= 2;
		wd_act("noprog", `no kills for ${W.noprog_min} min at ${state.pack.mtype}${repeat ? "; 3rd time this hour: town first" : ""}`);
		state.cooldown[pack_key(state.pack)] = now + CFG.pack_cooldown_ms;
		state.last_pick = 0;
		if (repeat) halt("watchdog"); // v24.60: no town teleport of the tank's own (it left the party behind)
	}
}
setInterval(() => { try { watchdog(); } catch (e) { log_error("watchdog: " + e); } }, 30_000);
// Where this second went
function time_class() {
	if (character.rip) return "dead";
	if (state.recovering) return "recover";
	if (errand_busy()) return state.errand === "town" ? "town" : "errand";
	if (walking()) return "walk"; // a smart_move: travelling between places
	const t = get_targeted_monster();
	// stepping toward / around a live target (melee approach, kiting, a follower keeping up mid-fight) is fighting
	if (t && !t.dead && Date.now() - (state.last_target_at || 0) < 3000) return "fight";
	if (character.moving) return "walk";
	return "idle";
}
let err_seen = {};
function log_error(msg) {
	const k = String(msg).slice(0, 80);
	if (Date.now() - (err_seen[k] || 0) < 60_000) return;
	err_seen[k] = Date.now();
	log_ev("error", { msg: k });
}
const ago = (t) => { const m = Math.round((Date.now() - t) / 60_000); return m < 60 ? `${m}m` : `${(m / 60).toFixed(1)}h`; };
const sum_obj = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
function last_hour() {
	const now = Date.now(), ev = hist.ev.filter((e) => now - e.t < 3600_000);
	const b = hist.buckets[hour_of(now)] || {}, pb = hist.buckets[hour_of(now) - 3600_000] || {};
	const frac = (now % 3600_000) / 3600_000; // blend the current and previous hour into a trailing 60 min
	return { dead: ev.filter((e) => e.type === "death").length, fled: ev.filter((e) => e.type === "flee").length,
		xph: Math.round((b.xp || 0) + (pb.xp || 0) * (1 - frac)), town: ev.filter((e) => e.type === "town").length };
}
// history(hours): in a party, every character's history in one window (like report()); history(hours, "solo") only ours
function history(hours = 6, solo) {
	const targets = party_names_all().filter((n) => n !== character.name);
	if (solo === "solo" || hours === "solo" || !targets.length || typeof send_cm !== "function")
		return share_text(`history ${character.name}`, history_lines(+hours || 6));
	return party_gather("history", targets, hours, history_lines(hours));
}
function history_lines(hours = 6) {
	const now = Date.now(), from = now - hours * 3600_000, ev = hist.ev.filter((e) => e.t >= from);
	const L = [`— history ${character.name} v${VERSION}, last ${hours}h (${ev.length} events) —`];
	const tot = {};
	const hrs = Object.keys(hist.buckets).map(Number).filter((k) => k + 3600_000 > from).sort((a, b) => b - a);
	// v23.2: a bucket only partly inside the window counts for that part (history(1) used to sum up to 2 hours)
	for (const k of hrs) {
		const end = Math.min(k + 3600_000, now), frac = Math.max(0, end - Math.max(k, from)) / Math.max(1, end - k);
		for (const [c, n] of Object.entries(hist.buckets[k].time)) tot[c] = (tot[c] || 0) + n * frac;
	}
	const T_ = sum_obj(tot) || 1;
	L.push(`time: ${Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${Math.round((n / T_) * 100)}%`).join(", ") || "no data yet"}`);
	L.push("hour   xp      gold    kills deaths flees");
	for (const k of hrs) {
		const b = hist.buckets[k];
		L.push(`${new Date(k).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}  ${fmt_k(Math.round(b.xp)).padEnd(7)} ${fmt_k(Math.round(b.gold)).padEnd(7)} ${String(b.kills).padEnd(5)} ${String(b.deaths).padEnd(6)} ${b.flees}`);
	}
	const rates = {};
	for (const e of ev) if (e.type === "rate") (rates[e.pack] = rates[e.pack] || []).push(e.xp_s);
	const top = Object.entries(rates).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length, v.length]).sort((a, b) => b[1] - a[1]).slice(0, 6);
	L.push(`packs (measured xp/s): ${top.map(([k, r, n]) => `${k} ${r.toFixed(0)} (${n}x)`).join(", ") || "none measured"}`);
	for (const e of ev.filter((x) => x.type === "death" || x.type === "flee").slice(-10))
		L.push(`${e.type.toUpperCase()}${e.unexplained ? " (unexplained: no damage seen" + (e.watched_s !== undefined ? `, script up ${e.watched_s}s` : "") + ")" : ""} ${ago(e.t)} ago: ${e.killer || "?"} @ ${e.map} | hp ${e.hp?.[0] ?? "?"}→${e.hp?.[e.hp.length - 1] ?? "?"}/${e.max_hp} | ` +
			`10s dmg ${Object.entries(e.dmg10 || {}).map(([m, d]) => `${m} ${Math.round(d)}`).join(", ") || "none seen"} | predicted ${e.predicted ?? "?"} of ${e.pool ?? "?"} hp` +
			`${e.tank ? " | tank near" : ""}${e.priest ? " | priest near" : ""} | pots ${e.pots?.hp}/${e.pots?.mp}`);
	const towns = ev.filter((e) => e.type === "town"), why_t = {};
	for (const e of towns) for (const w of (e.due || "").split("+").filter(Boolean)) why_t[w] = (why_t[w] || 0) + 1;
	L.push(`town trips: ${towns.length}${towns.length ? ` (${Object.entries(why_t).map(([w, n]) => `${w} ${n}`).join(", ")}; avg ${Math.round(towns.reduce((a, e) => a + (e.secs || 0), 0) / towns.length)}s)` : ""}`);
	for (const kind of ["upgrade", "compound"]) {
		const xs = ev.filter((e) => e.type === kind);
		if (xs.length) L.push(`${kind}s: ${xs.filter((e) => e.ok).length} ok / ${xs.filter((e) => !e.ok).length} failed — ${xs.slice(-4).map((e) => `${e.item}+${e.from}${e.ok ? "✓" : "✗"}`).join(" ")}`);
	}
	const buys = ev.filter((e) => e.type === "buy");
	if (buys.length) L.push(`buys: ${buys.slice(-6).map((e) => `${e.item} (${e.src}${e.price ? " " + fmt_k(e.price) : ""})`).join(", ")}`);
	const serves = ev.filter((e) => e.type === "serve");
	if (serves.length) L.push(`merchant trips: ${serves.length} — ${serves.slice(-4).map((e) => `${e.who} ${e.secs}s`).join(", ")}`);
	const bosses = ev.filter((e) => e.type === "boss");
	if (bosses.length) L.push(`bosses: ${bosses.slice(-4).map((e) => `${e.name} ${ago(e.t)} ago`).join(", ")}`);
	{ const lg = my_ledger(Math.max(1, Math.ceil(hours))); L.push(`gold ${Math.ceil(hours)}h: earned ${fmt_k(lg.earn)}, spent ${fmt_k(lg.spend)} — ${cats_text(lg.cats)}`); }
	const gold = ev.filter((e) => e.type === "gold");
	if (gold.length) L.push(`gold transfers: ${gold.slice(-4).map((e) => (e.to ? `→${e.to} ` : `←${e.from} `) + fmt_k(e.g)).join(", ")}`);
	const probes = ev.filter((e) => e.type === "probe");
	// v24.51: regroups — the times we used the suicide command, and why
	const sui = ev.filter((e) => e.type === "suicide");
	if (sui.length) L.push(`regroups by suicide: ${sui.length} — ${sui.slice(-5).map((e) => `${ago(e.t)} ago at ${e.at} (${e.why})`).join(" | ")}`);
	// v24.33: where the leader sent us, and why (the last 12 changes of spot, oldest first)
	const spots = ev.filter((e) => e.type === "pack" || e.type === "boss");
	if (spots.length) L.push(`spots (${spots.length} changes): ${spots.slice(-12).map((e) => `${ago(e.t)} ago → ${e.to || e.name} (${e.why || "?"})`).join(" | ")}`);
	if (probes.length) L.push(`probes: ${probes.slice(-6).map((e) => `${e.mtype} ${e.result === "ok" ? "✓" : "✗ " + e.why} (x${e.over} over; calibration ${e.ratio ?? "?"} over ${e.n} fights)`).join(" | ")}`);
	const stuck = ev.filter((e) => e.type === "stuck");
	if (stuck.length) L.push(`watchdog: ${stuck.length} — ${stuck.slice(-5).map((e) => `${e.kind} ${ago(e.t)} ago (${e.note})`).join(" | ")}`);
	const errs = ev.filter((e) => e.type === "error");
	if (errs.length) L.push(`errors: ${errs.slice(-3).map((e) => `${ago(e.t)}: ${e.msg}`).join(" | ")}`);
	return L;
}
function deaths(n = 5) {
	const xs = hist.ev.filter((e) => e.type === "death" || e.type === "flee").slice(-n);
	const L = [`— last ${xs.length} deaths/flees, ${character.name} —`];
	for (const e of xs) {
		L.push(`${e.type.toUpperCase()} ${new Date(e.t).toLocaleString()} @ ${e.map} ${e.x},${e.y} fighting ${e.pack || "?"}; main damage: ${e.killer || "?"}`);
		L.push(`  predicted ${e.predicted ?? "?"} dmg per kill vs ${e.pool ?? "?"} hp (danger x${e.danger ?? 1}); tank ${e.tank ? "yes" : "no"}, priest ${e.priest ? "yes" : "no"}, pots ${e.pots?.hp}/${e.pots?.mp}`);
		L.push(`  damage last 10s: ${Object.entries(e.dmg10 || {}).map(([m, d]) => `${m} ${Math.round(d)}`).join(", ") || "none seen"}`);
		L.push(`  hp, 1/s: ${(e.hp || []).join(" ")}`);
		for (const r of e.last || []) L.push(`  ${new Date(r.t).toLocaleTimeString()} hp ${r.hp} mp ${r.mp} target ${r.target || "-"} attackers ${r.attackers.map((a) => `${a.mtype}(${a.hp})`).join(" ") || "-"}`);
	}
	return share_text(`deaths ${character.name}`, L);
}
// ---- Gold budget (CFG.spend) ----
// Our gross earned/spent over the last window_h (hour buckets), and the party's (heartbeats carry each member's)
// Spending categories (v20.0): a purchase tags the gold that leaves in the next few seconds. Upgrades and compounds
// cost no gold on the server (only their scrolls, tagged "scrolls"), so they aren't tagged (v20.1)
let spend_tag = null; // { cat, until }
const tag_spend = (cat) => (spend_tag = { cat, until: Date.now() + 5000 });
function spend_cat_of(name) {
	const d = G.items[name] || {};
	if (name === CFG.hp_pot || name === CFG.mp_pot || d.type === "pot") return "potions";
	if (["uscroll", "cscroll", "offering", "pscroll"].includes(d.type) || /scroll|offering/.test(name)) return "scrolls";
	if (d.type === "elixir") return "elixirs";
	if (GEAR.has(d.type)) return "gear buys";
	return "other buys";
}
function my_ledger(h = CFG.spend.window_h) {
	const from = hour_of(Date.now()) - (h - 1) * 3600_000, out = { earn: 0, spend: 0, s: 0, cats: {} };
	for (const k in hist.buckets) if (+k >= from) {
		const b = hist.buckets[k];
		out.earn += b.earn || 0; out.spend += b.spend || 0; out.s += b.ls || 0;
		for (const c in b.cats || {}) out.cats[c] = (out.cats[c] || 0) + b.cats[c];
	}
	return out;
}
const cats_text = (cats) => Object.entries(cats || {}).sort((a, b) => b[1] - a[1]).map(([c, g]) => `${c} ${fmt_k(g)}`).join(", ") || "no breakdown: spent before v20.0 recorded categories";
function party_ledger() {
	const L = my_ledger(), out = { ...L, cats: { ...L.cats }, who: [character.name] };
	const seen = new Set([character.name]);
	for (const p of [...partners_any(), ...(merchant_hb() ? [merchant_hb()] : [])]) {
		if (!p || seen.has(p.name) || !p.ledger) continue;
		seen.add(p.name);
		out.earn += p.ledger.earn || 0; out.spend += p.ledger.spend || 0; out.s += p.ledger.s || 0; out.who.push(p.name);
		for (const c in p.ledger.cats || {}) out.cats[c] = (out.cats[c] || 0) + p.ledger.cats[c];
	}
	return out;
}
// Gold optional spending may still use now (Infinity: budget off, or under min_data_h of records)
function gold_room() {
	if (!CFG.spend?.enabled) return Infinity;
	const L = party_ledger();
	if (L.s < CFG.spend.min_data_h * 3600 * L.who.length) return Infinity;
	// v24.82: "other" (gold that left with no tag: the owner's own purchases, trades) isn't the script's spending —
	// 4.5M of it had the budget at zero for six hours and every upgrade waiting
	return Math.floor(CFG.spend.share * L.earn - (L.spend - (L.cats?.other || 0)));
}
// The merchant's optional spending (Ponty, compound scrolls, crafting, upgrade steps) also has to leave it
// merchant.donate.keep (its potion float); nobody refills it, so when it's below that it simply stops buying extras
const gold_ok = (cost) => (cost || 0) <= gold_room() && (!is_merchant() || character.gold - (cost || 0) >= CFG.merchant.donate.keep);
// v18.9: gear names in our bags (heartbeats share them) and whether anyone in the party already holds a piece —
// so tokens/Ponty never buy a copy another character is already carrying (Sanala bought mparmor for Aspernari while
// the merchant held two)
const bag_gear_names = () => [...new Set(character.items.filter((i) => i && GEAR.has(G.items[i.name]?.type)).map((i) => i.name))].slice(0, 40);
// gear name -> highest level in our bags (heartbeats; v23.2: upgrade projects skip pieces someone already has at the target)
const bag_gear_levels = () => { const o = {}; for (const i of character.items) if (i && GEAR.has(G.items[i.name]?.type)) o[i.name] = Math.max(o[i.name] ?? -1, i.level || 0); return o; };
function party_holds_level(name, level, spare_only = false) {
	const M = state.merchant && fresh(state.merchant) ? [state.merchant] : [];
	return [...partners_any(), ...M].some((p) => (p.bag_lv?.[name] ?? -1) >= level || (!spare_only && Object.values(p.worn || {}).some((w) => w?.name === name && (w.level || 0) >= level)));
}
function budget_text() {
	const L = party_ledger(), room = gold_room();
	return `gold budget (${CFG.spend.window_h}h, ${L.who.length} chars): earned ${fmt_k(L.earn)}, spent ${fmt_k(L.spend)} (${cats_text(L.cats)})` +
		(room === Infinity ? " — under an hour of records, no limit yet" : room > 0 ? ` — ${fmt_k(room)} left for upgrades/guide buys/compounds/Ponty` : " — optional spending paused (the script's own spending ≥ 90% of income; \"other\" isn't counted)");
}
// Per-hour rates over the last hour (report, heartbeat): a sample of cumulative xp and gold every minute
// adj = gold moved between our own characters (sent: +, received: −), so transfers don't count as earnings/spending
const stats = { xp: 0, adj: 0, samples: [] };
function rates() {
	const a = stats.samples[0], now = Date.now();
	if (!a || now - a.t < 900_000) return null; // under 15 minutes of data: one sale or purchase would swamp the rate
	const h = (now - a.t) / 3600_000;
	return { xph: Math.round((stats.xp - a.xp) / h), gph: Math.round((character.gold + stats.adj - a.gold) / h), mins: Math.round(h * 60) };
}
const fmt_k = (n) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + "k" : String(n));
let gold_prev = null;
// Every second: count xp toward the current pack's measurement while we're there (300px slack) and not walking or on
// an errand. A measurement closes after 2 × measure_min_s so the picker keeps getting fresh numbers.
// (v25.16: a named function, so the tests can run it)
function meas_tick() {
	const d = xp_delta(), p = state.pack;
	stats.xp += d;
	const b = bucket(), cls = time_class();
	b.time[cls] = (b.time[cls] || 0) + 1;
	b.xp += d;
	const g = character.gold + stats.adj;
	if (gold_prev !== null) {
		const dg = g - gold_prev;
		b.gold += dg;
		// gross ledger (transfers between our characters are already out via stats.adj); ls = seconds recorded
		if (dg > 0) b.earn = (b.earn || 0) + dg;
		else if (dg < 0) {
			b.spend = (b.spend || 0) - dg;
			// v20.0: what it went on (the purchase just made tags it; untagged losses count as "other")
			const cat = spend_tag && Date.now() < spend_tag.until ? spend_tag.cat : "other";
			b.cats = b.cats || {};
			b.cats[cat] = (b.cats[cat] || 0) - dg;
		}
		b.ls = (b.ls || 0) + 1;
	}
	gold_prev = g;
	hist.dirty = true;
	if (!character.rip) { pm_sample(); calib_tick(); }
	if (!p || character.rip) return;
	// v24.49: together, a spot's xp/s is only measured while the whole party is at it. Time spent there with a member in
	// town, dead, a map behind or wandering was booked as the spot's rate, and those rates then steered the next pick.
	// v25.16: every configured member heard from, too — partners_any() leaves out a member whose heartbeat stopped (a
	// sleeping browser tab, 4:11 AM), so the party "all here" without her held at goo and booked it as goo's rate
	const all_here = !in_party_cfg() || (others().every((n) => fresh(state.partners[n])) && partners_any().every((q) => !q.rip && !q.errand && !q.recovering && q.map === p.map &&
		Math.hypot(partner_pos(q).x - character.x, partner_pos(q).y - character.y) <= 700));
	const here = character.map === p.map && in_boundary(p.boundary, 300) && all_here;
	if (!state.session && here && !walking() && !errand_busy() && !state.recovering)
		state.session = { key: pack_key(p), mtype: p.mtype, est: p.est, xp: 0, kx: 0, kc: 0, kc_n: 0, start: Date.now() };
	// v24.6: a session ends the moment we leave its spot (town run, event, errand, recovery, a follower's leader moving
	// on): it used to run on, booking the time away (no kills: the rate fell) and kill credits from elsewhere (an event
	// goo's full xp: one put realism at 42), until the 180s close
	const S = state.session;
	if (S) {
		if (!here || walking() || errand_busy() || state.recovering || event_live() || pack_key(p) !== S.key) { S.end = S.last_here || S.start; end_session(); }
		else {
			const now_ = Date.now(), gap = now_ - (S.last_here || now_);
			// a tick more than 5 s late: the tab was asleep or frozen — the session closes at the last good tick, the gap
			// isn't booked anywhere
			if (gap > 5000) { S.end = S.last_here; end_session(); return; }
			const dt = Math.max(0, gap);
			S.xp += d; S.last_here = now_;
			// v25.16: time the party isn't ready to fight isn't the camp's: a member too far for the tank to start
			// (party_missing: engage_px, three missed beats), or the tank holding for one. Elapsed time since the last tick.
			if (in_party_cfg() && (party_missing().length > 0 || gap_kind() === "monsters alive, holding for the party")) S.lost = (S.lost || 0) + dt;
			if ((Date.now() - S.start) / 1000 > CFG.measure_min_s * 2) end_session();
		}
	}
}
setInterval(meas_tick, 1000);
