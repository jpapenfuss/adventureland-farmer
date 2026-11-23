// =====================================================================
// fighter/5_town.js — fighters only (src/manifest.json): party town trips, the tank's trip decisions, collecting from the merchant
// =====================================================================
// Fighters: what the merchant (in town) holds for us / for anyone, from its heartbeat
function collect_list(mine = false) {
	const M = merchant_hb();
	if (!CFG.merchant?.collect || !M || !Array.isArray(M.give) || M.map !== "main" || Math.hypot(M.x, M.y) > CFG.party.town_px) return [];
	return M.give.filter((g) => (CFG.party.members || []).includes(g.to) && (!mine || g.to === character.name));
}
function collect_key(g) { return `${g.to}:${g.name}:${g.level}`; }
// The tank: pieces not tried within collect_retry_min → a party trip for them
function collect_due() {
	const now = Date.now(), T_ = CFG.merchant.collect_retry_min * 60_000;
	return collect_list().filter((g) => now - ((state.collect_try || {})[collect_key(g)] || 0) > T_);
}
// v25.39: on a town run, the worn piece the merchant's project asked us for: walk to it and wait while it's handed over
// (merchant_handoff does that within 300px, in town)
async function task_worn_handover() {
	const W = worn_for_me(), M = merchant_hb();
	if (!W || !M) return 0;
	await go({ map: M.map, x: M.x, y: M.y });
	const t0 = Date.now(), has = () => Object.values(character.slots || {}).concat(character.items).some((i) => i && i.name === W.name && (i.level || 0) === W.level);
	while (Date.now() - t0 < CFG.merchant.collect_wait_s * 1000 && has() && worn_for_me()) { state.errand_at = Date.now(); set_message(`town: handing ${W.name} to ${M.name} to upgrade`); await sleep_ms(1000); }
	return has() ? 0 : 1;
}
// On a town run: walk to the merchant and wait for our piece (its share_gear hands it over within gear_share_range)
async function task_collect() {
	const mine = collect_list(true);
	if (!mine.length) return 0;
	const M = merchant_hb();
	await go({ map: M.map, x: M.x, y: M.y });
	const t0 = Date.now(), have = () => mine.filter((g) => character.items.some((i) => i && i.name === g.name && (i.level || 0) === g.level) ||
		Object.values(character.slots || {}).some((i) => i && i.name === g.name && (i.level || 0) === g.level)).length;
	while (Date.now() - t0 < CFG.merchant.collect_wait_s * 1000 && have() < mine.length && collect_list(true).length) { state.errand_at = Date.now(); set_message(`town: collecting ${mine.map((g) => g.name).join(", ")} from ${M.name}`); await sleep_ms(1000); }
	const got = have();
	game_log(got ? `collected ${got} piece${got === 1 ? "" : "s"} from ${M.name}` : `${M.name} didn't hand over ${mine.map((g) => g.name).join(", ")} in ${CFG.merchant.collect_wait_s}s`, got ? C.ok : C.warn);
	log_ev("collect", { got, want: mine.map((g) => `${g.name}+${g.level}`).join(",") });
	return got;
}
// Pending: go as soon as nothing is on us (each tick, before our own town check). true = holds our own town check.
function ptown_join_tick() {
	const P = state.ptown;
	if (!P) return false;
	const now = Date.now(), late = now - P.at > CFG.party.town_join_s * 1000;
	// stale: never got going, or our run ended without the wait (cleared there)
	if (P.joined && !P.done && !errand_busy() && late) { state.ptown = null; return false; }
	if (!P.pending) return false;
	// v24.60: no join window — a member that can't get away yet (a monster on it) goes as soon as it can; nobody is left out
	if (errand_busy()) { if (state.errand === "town") ptown_joined(P); return true; }
	// v24.61: a follower doesn't walk to town by its own path: it follows the tank there (follower_tick) and starts
	// its town work on arrival
	if (is_follower() && !in_town()) return false;
	if (character.rip || state.recovering || hit_on_me()) return true; // finish this fight first
	if (walking()) { halt("ptown_join_tick"); return true; } // the next tick starts the run
	state.town_runs = (state.town_runs || []).filter((t) => now - t < 600_000); // (v24.62: no brake here — the tank's own brake limits trips; a member that sat one out left the others waiting)
	const due = town_due(true), what = due_tasks(due);
	state.town_trig = `party trip (${P.by})`;
	if (!town_run(due)) return true;
	state.town_runs.push(now); state.last_town = now;
	ptown_joined(P);
	game_log(`Town: with ${P.leavers.join(", ")}${what.length ? ` — ${what.join("+")}` : " (nothing of our own due)"}`, C.dim);
	return true;
}
const ptown_tell = (P) => tell_party({ k: "ptown", id: P.id, by: P.by });
// We're on the trip: our heartbeat shows it (pt), and the others are told (they judge again without us)
function ptown_joined(P, why_) {
	P.pending = false; P.joined = true;
	if (why_) P.why = why_;
	ptown_tell(P);
}
// v24.46: one rule — together, a town trip is everyone's. (It used to judge whether the stay-behinds could keep farming.)
function ptown_reason() {
	return ptown_on() && !character.rip ? "the party goes to town together" : null;
}
// We start a trip: tell the others (they come)
function ptown_start(what) {
	if (!ptown_on() || !others().length) return;
	if (state.ptown?.joined && !state.ptown.done) return; // already on one (we joined someone's)
	state.ptown = { id: `${character.name}:${Date.now()}`, by: character.name, at: Date.now(), leavers: [character.name], joined: true, why: `started it: ${what.join("+")}` };
	ptown_tell(state.ptown);
	log_ev("ptown", { by: character.name, join: "started", what: what.join("+") });
}
// A member is going (it started a trip, or joined one)
function ptown_recv(msg, from) {
	if (!msg?.id || is_merchant()) return;
	let P = state.ptown;
	// another trip while we're on one: same thing — everyone on any trip waits for everyone (ptown_wait)
	if (P && P.id !== msg.id && !(P.joined || P.pending)) P = null;
	if (!P) P = state.ptown = { id: msg.id, by: msg.by || from, at: Date.now(), leavers: [] };
	if (!P.leavers.includes(from)) P.leavers.push(from);
	if (msg.by && !P.leavers.includes(msg.by)) P.leavers.push(msg.by);
	if (P.joined || P.pending) return;
	if (state.errand === "town" && errand_busy()) return void ptown_joined(P, "in town already");
	const why_ = ptown_reason();
	P.why = why_ || "staying (party trips are off, or we're dead)";
	log_ev("ptown", { by: P.by, join: why_ || null });
	if (why_) { P.pending = true; game_log(`party trip: going to town with ${P.leavers.join(", ")} (${why_})`, C.dim); }
}
// v24.61: the tank's walk to town on a party trip. It stops while a member is behind (another map, or beyond the group
// radius) and goes on when they're all with it; no time limit. Its town work starts once it's in town.
async function ptown_lead() {
	const town = dest_point("main"), r = CFG.party.group.radius;
	const behind = () => partners().filter((p) => p.ctype !== "merchant" && !hb_in_town(p)).filter((p) => {
		const q = partner_pos(p);
		return q.map !== character.map || Math.hypot(q.x - character.x, q.y - character.y) > r;
	}).map((p) => p.name);
	let dead_end = false;
	// v24.62: lead_walk — on this walk the tank fights like at the camp: the tick stops the walk for, and closes in on,
	// whatever is on a member (during any other errand step it doesn't)
	state.lead_walk = true;
	try {
		while (!character.rip && !in_town() && !dead_end) {
			state.errand_at = Date.now(); // a long walk isn't a hung errand
			const who = behind();
			if (who.length) { if (walking()) halt("ptown_lead"); set_message(`to town: waiting for ${who.join(", ")}`); }
			else if (!walking() && !party_hit()) go(town).catch((e) => { if (e?.reason === "deadly_route") dead_end = true; });
			await sleep_ms(500);
		}
	} finally { state.lead_walk = false; }
	// no safe way to town: the trip is off for everyone (it used to leave the others waiting for it without end)
	if (dead_end) { tell_party({ k: "ptown_off" }); state.ptown = null; throw { reason: "deadly_route" }; }
}
const hb_in_town = (p) => { const q = partner_pos(p); return q.map === "main" && Math.hypot(q.x, q.y) < CFG.party.town_px; };
// Our town work is done: wait in town until every member on a trip is done too, then all walk back together
async function ptown_wait() {
	const P = state.ptown;
	if (!P?.joined || character.rip) return;
	P.done = true;
	try { heartbeat(); } catch (e) {} // tell them now, not at the next beat
	const t0 = Date.now();
	// v24.61: a member not yet on the trip counts until it's in town (it's following the tank in, or still fighting)
	// v24.62: every fighter must say its work is done. A member in town whose heartbeat didn't show the trip yet counted
	// as done: the tank's trip ended at once and it left for the camp while the others were still at the shops.
	const busy = () => partners().filter((p) => p.ctype !== "merchant" && !p.pt?.done).map((p) => p.name);
	// nothing of ours took us to town (no work, no teleport): walk there, so we gather with them and leave together
	const town = dest_point("main"), rt = town && route_to(town.map, town.x, town.y);
	if (rt && rt.d > CFG.town_hop_px && busy().length) await go(town).catch(() => {});
	let who = [];
	while (!character.rip) { // v24.60: no time limit — the party leaves town together or not at all (a member offline or dead is party_break's case)
		who = busy();
		if (!who.length) break;
		// a follower whose tank is already off its trip (we missed its "done"): the trip is over — follow it
		if (is_follower()) { const L = leader_hb(); if (L && !L.rip && !L.errand && !L.pt) break; }
		state.errand_at = Date.now(); // a long wait isn't a hung errand
		if (Date.now() - (P.told || 0) > 5000 && partners().some((p) => p.ctype !== "merchant" && !p.pt)) { P.told = Date.now(); ptown_tell(P); } // one that missed the call
		set_message(`town: waiting for ${who.join(", ")}`);
		await sleep_ms(1000);
	}
	const waited = Math.round((Date.now() - t0) / 1000);
	state.ptown_last = { by: P.by, at: P.at, why: P.why, leavers: P.leavers, waited, left_without: who };
	log_ev("ptown_back", { by: P.by, waited, left_without: who.join(",") });
	if (who.length) game_log(`party trip: waited ${waited}s; going back without ${who.join(", ")}`, C.warn);
	state.ptown = null;
	state.ptown_done_at = Date.now(); // our heartbeat says "done" a little longer: the others may not have read it yet
}
// ---- town_check's party part (v24.99): the tank takes the party to town for the members' needs and for what the merchant
// holds for one of them. true = town_check is done for this tick ----
function party_trip_check(due, what) {
	// v24.58: a follower in need of town (bags, potions) says so in its heartbeat; the tank's trip takes the party
	const asks = partners().filter((p) => p.tn).map((p) => `${p.name}: ${p.tn}`);
	if (party_hit() && !errand_busy() && in_party_cfg()) return true; // v24.62: no trip starts while a monster is on any member
	// v24.75: the merchant holds an upgrade for one of us → the party goes to town for it, ahead of deferrable work
	const coll = is_follower() ? [] : collect_due();
	if (coll.length) asks.push(...coll.map((g) => `${g.to}: ${g.name}+${g.level} at the merchant`));
	// v25.39: the merchant's project waits for a member's worn piece → the party goes to town to hand it over (one try
	// per collect_retry_min)
	const WW = !is_follower() && merchant_hb()?.want_worn;
	if (WW && (CFG.party.members || []).includes(WW.to) && Date.now() - (state.worn_try_at || 0) > CFG.merchant.collect_retry_min * 60_000) { asks.push(`${WW.to}: hand ${WW.name}+${WW.level} to the merchant to upgrade`); state.worn_try_at = Date.now(); }
	if (asks.length && !errand_busy() && !character.rip && !hit_on_me()) {
		if (walking()) { halt("town_check"); return true; }
		state.town_runs = (state.town_runs || []).filter((t) => Date.now() - t < 600_000);
		if (state.town_runs.length < 6) {
			state.town_runs.push(Date.now()); state.last_town = Date.now(); state.town_trig = `for ${asks.join(", ")}`;
			state.collect_try = state.collect_try || {}; for (const g of coll) state.collect_try[collect_key(g)] = Date.now();
			game_log(`Town: the party goes — ${asks.join(", ")}${what.length ? `; ours: ${what.join("+")}` : ""}`, C.dim);
			if (town_run(due)) ptown_start(what.length ? what : ["a member's needs"]);
			return true;
		}
	}
	return false;
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
// A monster on any party member that the party fights (not one it never attacks)
function party_hit() {
	const party = party_names();
	for (const id in parent.entities || {}) { const e = parent.entities[id]; if (e?.type === "monster" && !e.dead && e.target && party.has(e.target) && !hopeless(e)) return e; }
	return null;
}
// ---- town_check's deferral (v25.5): a fighter's work that can wait doesn't start a trip within town_soft_gap_ms of the
// last, nor turn a walk to the camp around. true = town_check is done (town_block says why) ----
function fighter_defers_town(due, what) {
	if (town_urgent(due)) return false;
	const since = Date.now() - Math.max(state.last_town || 0, state.town_end_at || 0);
	if (since < CFG.town_soft_gap_ms) {
		state.town_block = { what: what.join("+"), blockers: [`deferrable: next trip in ${Math.ceil((CFG.town_soft_gap_ms - since) / 60_000)}m`], at: Date.now() };
		return true;
	}
	if (walking() && !errand_busy()) { // on the way to the pack: arrive first; deferrable work never turns us around
		state.town_block = { what: what.join("+"), blockers: ["deferrable: walking to the pack"], at: Date.now() };
		return true;
	}
	return false;
}
// Party town trips are on (a role function, v25.11: the merchant's is false)
function ptown_on() { return !!CFG.party.town_together && in_party_cfg(); }
