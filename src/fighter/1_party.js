// =====================================================================
// fighter/1_party.js — fighters only (src/manifest.json): the party rules: the break and the suicide, group travel, heartbeat and invites, verdicts, gold to the merchant
// =====================================================================
// Fighter side: with the merchant within 300px, hand it bankable/sellable items (one per 0.7s, never what a member
// would wear) and, if we're the richest fighter near, top its gold up to the float
let handoff_busy = false, merchant_gold_at = 0;
async function merchant_handoff() {
	const M = merchant_hb();
	if (!M || handoff_busy || character.rip || M.rip || M.map !== character.map || typeof send_item !== "function") return;
	const e = parent.entities?.[M.name], pos = e || M;
	if (Math.hypot(pos.x - character.x, pos.y - character.y) > 300) return;
	handoff_busy = true;
	try {
		// v23.0: pay the merchant's potion bills first, from gold above our reserve (the rest stays owed)
		if ((state.owe || 0) >= 1 && typeof send_gold === "function") {
			const pay = Math.floor(Math.min(state.owe, character.gold - CFG.gold_reserve));
			if (pay >= 1) await send_own_gold(M.name, pay).then(() => { state.owe = Math.max(0, state.owe - pay); save_state(); game_log(`merchant: paid ${fmt_k(pay)} for potions`, C.dim); }).catch(() => {});
		}
		const fighters = [{ name: character.name, gold: character.gold }, ...partners_near(400)];
		const richest = fighters.sort((a, b) => (b.gold || 0) - (a.gold || 0))[0];
		// project funding (upgrade/craft steps the merchant can't pay for), from the richest near, above fund_keep
		// (v24.86: what we can spare above fund_keep, up to what it asks; it used to be all of it or nothing, and every 10 min)
		const spare = Math.floor(Math.min(M.fund || 0, character.gold - CFG.merchant.fund_keep));
		if (richest.name === character.name && M.fund > 0 && spare >= 10_000 && Date.now() - (state.fund_sent_at || 0) > 60_000 && typeof send_gold === "function") {
			state.fund_sent_at = Date.now();
			await send_own_gold(M.name, spare).then(() => game_log(`merchant: funded its project with ${fmt_k(spare)}`, C.ok)).catch(() => {});
		}
		// v24.90: all our gold above fund_keep, whoever is richest (pending potion bills paid first, above)
		const dump = Math.floor(character.gold - CFG.merchant.fund_keep);
		if (CFG.merchant.dump_gold && dump >= 50_000 && Date.now() - (state.dump_at || 0) > 60_000 && typeof send_gold === "function") {
			state.dump_at = Date.now();
			await send_own_gold(M.name, dump).then(() => game_log(`merchant: handed ${M.name} ${fmt_k(dump)} (all but ${fmt_k(CFG.merchant.fund_keep)})`, C.ok)).catch(() => {});
		}
		if (!CFG.merchant.dump_gold && richest.name === character.name && M.gold < CFG.merchant.float && character.gold > CFG.merchant.float * 3 &&
			Date.now() - merchant_gold_at > 1800_000 && typeof send_gold === "function") {
			merchant_gold_at = Date.now();
			const g = Math.round(CFG.merchant.float - M.gold);
			await send_own_gold(M.name, g).then(() => game_log(`merchant: sent ${M.name} ${g} gold`, C.ok)).catch(() => {});
		}
		if ((M.esize ?? 0) <= 2) return;
		// v25.39: the merchant's upgrade project wants a piece we wear: off and over — in town only (in_town: not just the
		// main map, Fable), nothing on us; if it's already off (a failed send), from the bags
		const WW = worn_for_me();
		// (v25.43: also at the camp — the merchant comes to us — between fights: nothing on us or the party)
		if (WW && (in_town() || !party_hit()) && !Object.values(parent.entities || {}).some((e) => e?.type === "monster" && e.target === character.name) && can_spend(2, RESERVE.errand)) {
			// (v25.62: not by stat_type — a stat scroll applied between the merchant's pick and the hand-over kept it from ever
			// matching; the slot names the piece)
			const is_it = (i) => i && i.name === WW.name && (i.level || 0) === WW.level && !i.p && !i.l && !i.b;
			const w = character.slots?.[WW.slot];
			if (is_it(w) && character.esize >= 1) {
				skip(`equip:${WW.name}:${WW.level}`, 600_000, "handed to the merchant to upgrade"); // (before the unequip: equip_upgrades runs every 5 s)
				await T(unequip(WW.slot), 5000).catch(() => {});
				await until(() => character.items.some(is_it), 2000);
			}
			const k = character.items.findIndex(is_it);
			if (k >= 0) {
				await T(send_item(M.name, k, 1)).then(() => { game_log(`merchant: handed over our ${WW.name}+${WW.level} (${WW.slot}) to be upgraded`, C.ok); log_ev("give", { to: M.name, item: `${WW.name}+${WW.level}`, worn: true }); })
					.catch((er) => { delete state.gear_skip[`equip:${WW.name}:${WW.level}`]; game_log(`merchant: handing over ${WW.name}: ${why(er)} (it can go back on)`, C.dim); });
				return;
			}
		}
		// a must-hold item we bought for the merchant: hand it over (we keep our own copy)
		for (const n in state.hold_for) {
			if (!(M.need || []).includes(n)) { if (held_any(n) < 2 || Date.now() - state.hold_for[n].at > 86_400_000) delete state.hold_for[n]; continue; }
			const k = character.items.findIndex((it) => it && it.name === n && !it.l);
			if (k < 0 || held_any(n) < 2 || !can_spend(1, RESERVE.errand)) continue;
			await T(send_item(M.name, k, 1)).then(() => { delete state.hold_for[n]; game_log(`merchant: gave ${n} (its own copy)`, C.ok); log_ev("give", { to: M.name, item: n }); })
				.catch((er) => game_log(`merchant: giving ${n}: ${why(er)}`, C.dim));
			return;
		}
		const needed = needed_slots(), cmp = compound_slots(needed);
		// v23.1: a piece that's an upgrade for a partner who isn't near goes to the merchant, which delivers it
		// (gear_target → serve → share_gear). share_gear only reaches members within gear_share_range, which split
		// fighters rarely are, so such pieces used to sit in our bags. Not for pieces we'd wear ourselves.
		const near_n = new Set(partners_near(CFG.gear_share_range).map((p) => p.name)), mine = my_gear();
		const gk = character.items.findIndex((it, i) => {
			if (!it || it.l || it.b || needed.has(i) || !GEAR.has(G.items[it.name]?.type) || (!equip_paused(it) && gear_gain(it, character.ctype, mine))) return false;
			const want = gear_takers().slice(1).filter((m) => gear_gain(it, m.ctype, m.g));
			return want.length > 0 && !want.some((m) => near_n.has(m.name));
		});
		if (gk >= 0 && can_spend(1, RESERVE.errand)) {
			const it = character.items[gk];
			await T(send_item(M.name, gk, 1)).then(() => { M.esize--; game_log(`merchant: gave ${it.name}+${it.level || 0} to deliver (an upgrade for a partner away)`, C.dim); log_ev("give", { to: M.name, item: `${it.name}+${it.level || 0}`, deliver: true }); })
				.catch((er) => game_log(`merchant: giving ${it.name}: ${why(er)}`, C.dim));
			return;
		}
		const k = character.items.findIndex((it) => it && ["bank", "sell"].includes(bag_class(it, needed, cmp)) && !gear_wanted_by(it));
		if (k < 0 || !can_spend(1, RESERVE.errand)) return;
		const it = character.items[k];
		await T(send_item(M.name, k, it.q || 1)).then(() => { M.esize--; game_log(`merchant: gave ${it.name}${it.q > 1 ? " x" + it.q : ""}`, C.dim); })
			.catch((er) => game_log(`merchant: giving ${it.name}: ${why(er)}`, C.dim));
	} finally { handoff_busy = false; }
}
setInterval(() => { merchant_handoff().catch(() => {}); }, 700);

// Gold balance (see CFG.party.gold): only the richest member acts, toward the poorest. The every_h window is one
// party-wide clock (max of all members' last-transfer times, persisted), so a reload anywhere can't reset it.
// send_gold needs both on the same map within 400px and the sender not in the bank.
let gold_inflight = false;
function gold_balance() {
	const G_ = CFG.party.gold;
	if (!G_?.enabled || !in_party_cfg() || gold_inflight || character.rip || typeof send_gold !== "function") return null;
	const known = partners().filter((m) => Number.isFinite(m.gold)); // gold not heard yet (first beat) → skip them
	if (!known.length || known.some((m) => m.gold > character.gold)) return null; // not the richest: someone else acts
	const p = known.sort((a, b) => a.gold - b.gold)[0];              // the poorest
	const rich = character.gold, poor = p.gold;
	if (rich < G_.min_rich || poor >= rich * G_.min_ratio) return null;
	if (Date.now() - (state.gold_xfer_at || 0) < G_.every_h * 3600_000) return null;
	if (Date.now() < (state.gold_retry_at || 0)) return null;
	const pos = partner_pos(p);
	if (pos.map !== character.map || Math.hypot(pos.x - character.x, pos.y - character.y) > 350 || on_bank_floor() || p.map.startsWith("bank")) return "not together";
	const amount = Math.floor(rich * G_.give);
	gold_inflight = true;
	Promise.resolve(send_own_gold(p.name, amount))
		.then(() => {
			state.gold_xfer_at = Date.now();
			save_state();
			game_log(`gold: sent ${amount.toLocaleString()} to ${p.name} (they had ${poor.toLocaleString()}, < ${G_.min_ratio * 100}% of our ${rich.toLocaleString()})`, C.gold);
		})
		.catch((e) => { state.gold_retry_at = Date.now() + 600_000; game_log(`gold: sending to ${p.name} failed: ${why(e)} (retry in 10 min)`, C.dim); })
		.finally(() => (gold_inflight = false));
	return "sent";
}
setInterval(() => { try { gold_balance(); } catch (e) {} }, 15_000);

// Send gold to one of our characters and tell it, so both sides leave the transfer out of their gold/h
function send_own_gold(name, g) {
	tag_spend("transfer tax"); // (the server keeps 2.5% of a transfer: Fable on v25.80)
	return T(send_gold(name, g)).then((r) => {
		log_ev("gold", { to: name, g }); // (v25.80: the ledger adjustment comes from the game's gold_sent event)
		if (typeof send_cm === "function") Promise.resolve(send_cm([name], { k: "gold", g })).catch(() => {});
		return r;
	});
}
// ---- Group travel (CFG.party.group, v24.11) ----
// Leader, together: the members we should wait for, as text — or null to go on (nothing to wait for, or waited enough)
function group_hold(pack, here) {
	const G_ = CFG.party.group, now = Date.now();
	if (!G_?.enabled || !in_party_cfg() || !pack || is_follower() || leader_name() !== character.name || errand_busy())
		return void (state.group_wait = null), null;
	const key = pack_key(pack);
	if (here && state.group_ok === key) return null; // assembled at this spot already: fights move people around
	// (v24.62: it used to go on without the straggler when something it "couldn't take" was on a member)
	const at_pack = (q, p) => p.pack && valid_boundary(p.pack.boundary) && pack_key(p.pack) === key && q.map === pack.map &&
		in_rect(q.x, q.y, [pack.boundary[0] - 300, pack.boundary[1] - 300, pack.boundary[2] + 300, pack.boundary[3] + 300]);
	const r = state.group_wait ? G_.radius * 0.6 : G_.radius; // once waiting, until they're well in
	const far = partners().filter((p) => {
		if (p.errand || p.recovering || p.rip) return false;
		const q = partner_pos(p);
		if (at_pack(q, p)) return false; // already there, waiting for us (our errand)
		return q.map !== character.map || Math.hypot(q.x - character.x, q.y - character.y) > r;
	});
	if (!far.length) { if (here) state.group_ok = key; state.group_wait = null; return null; }
	const W = state.group_wait || (state.group_wait = { since: now, go_until: 0 });
	// v24.60: no time limit. It used to carry on for go_s after waiting wait_s — the tank walking off without a member.
	W.who = far.map((p) => p.name).join(", ");
	return W.who;
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
// Why the party isn't whole: a member offline or dead — else null. (v24.52: low HP is not a reason. v24.51 had a
// member under flee_hp use the suicide command; the owner's rule is that only a member's DEATH sends the others.)
function party_break() {
	const off = others().filter((n) => !fresh(state.partners[n]));
	if (off.length) return `${off.join(", ")} offline`;
	const dead = partners_any().filter((q) => q.rip).map((q) => q.name);
	return dead.length ? `${dead.join(", ")} dead` : null;
}
// Run each tick while alive (fighters): true = the party is broken and this tick is spent on it. In the field: a member
// dead → suicide (the only reason there is); a member offline → walk to town.
// In town: stand and wait (a town errand in progress carries on). The first 30s after loading are a grace period:
// the others' heartbeats haven't arrived yet.
function party_break_tick() {
	if (is_merchant() || !in_party_cfg() || Date.now() - seen.since < 30_000) return false;
	const why_ = party_break();
	if (!why_) return false;
	// v24.56: ONLY a member's death sends the others by suicide. A member offline: walk to town and wait there.
	const dead = partners_any().some((q) => q.rip);
	if (!in_town()) {
		if (dead) suicide(why_);
		else {
			// v24.60: the tank leads the walk to town and the others follow it, as on any walk — each walking alone was
			// three separate walks. With no tank online there is nobody to follow: then each walks.
			if (is_follower() && fresh(leader_hb()) && !leader_hb().rip) return false;
			// v24.62: the walk waits for a member behind and fights what's on any member; with no tank online the member
			// first by name leads and the other follows it (each used to walk alone)
			const lead = is_follower() ? partners().filter((p) => p.ctype !== "merchant" && p.name < character.name)[0] : null;
			const behind = partners().filter((p) => p.ctype !== "merchant").filter((p) => { const q = partner_pos(p); return q.map !== character.map || Math.hypot(q.x - character.x, q.y - character.y) > CFG.party.group.radius; });
			const a = hit_on_me() || party_hit();
			if (a) fight(a, !is_follower());
			else if (errand_busy()) { /* a town run in progress carries on */ }
			else if (lead) { if (behind.includes(lead) && !walking()) travel_as("party_break", partner_pos(lead)); set_message(`to town with ${lead.name}: ${why_}`); }
			else if (behind.length) { if (walking()) halt("party_break"); set_message(`to town: waiting for ${behind.map((p) => p.name).join(", ")}`); }
			else { travel_as("party_break", dest_point("main")); set_message(`to town: ${why_}`); }
		}
		return true;
	}
	if (errand_busy()) return false;
	if (walking()) halt("party_break");
	const a = hit_on_me(); // town is safe, but never just stand and be hit
	if (a) fight(a, false);
	set_message(`in town: waiting — ${why_}`);
	return true;
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
// ---- One party or nothing (v24.51) ----
const in_town = () => character.map === "main" && Math.hypot(character.x, character.y) < CFG.party.town_px;
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
// Self-tuning safety (CFG.safety_tune): up a step after every step_h without a death or flee; down on a flee; reset on
// a death. Checked every minute; the clock restarts on every change.
function safety_tune(ev) {
	const T_ = CFG.safety_tune, now = Date.now();
	if (!T_?.enabled || is_merchant()) return;
	const own = () => Math.min(CFG.safety * (state.safety_mult || 1), T_.max), was = own();
	if (!state.safety_at) state.safety_at = now;
	if (ev === "death") state.safety_mult = 1;
	else if (ev === "flee") state.safety_mult = Math.max(1, (state.safety_mult || 1) * T_.down);
	else if (now - state.safety_at >= T_.step_h * 3600_000 && own() < T_.max) state.safety_mult = (state.safety_mult || 1) * T_.up;
	else return;
	state.safety_at = now;
	if (own() !== was) {
		log_ev("safety", { to: +own().toFixed(3), why: ev || "calm" });
		game_log(`safety limit ${Math.round(was * 100)}% → ${Math.round(own() * 100)}% of HP per kill (${ev || `no death or flee for ${T_.step_h}h`})`, ev ? C.warn : C.info);
		state.last_pick = 0;
	}
}
setInterval(() => { try { safety_tune(); } catch (e) {} }, 60_000);
// Our share of the bank's copies of a quest material (v23.1). The bank is account-wide and every fighter runs the same
// own quests, so each used to count all of it toward its own copy. Copies go to the fighters short of the item (bags
// vs what they need; each one's shortfall comes in its heartbeat) in name order, so all agree. The merchant counts all.
const qshort = () => { const o = {}; for (const [n, q] of state.needs) if (G.items[n]?.s) { const v = q - held_any(n); if (v > 0) o[n] = v; } return o; };
// v25.82: verdicts from the party — a member's death (the tank judges whether the fight was impossible) and a type
// skipped after an impossible fight (every fighter skips it: followers judge their targets by it too)
function apply_verdict(v, from) {
	if (!v || !G.monsters[v.mtype]) return;
	const now = Date.now();
	if (v.kind === "death") {
		// (v.at is the sender's clock: only for staleness, since tabs on other machines can run ahead)
		if (!is_follower() && Number.isFinite(v.at) && Math.abs(now - v.at) < 600_000) judge_death(v.killer && G.monsters[v.killer] ? v.killer : null, from);
		log_ev("verdict", { from, kind: v.kind, mtype: v.mtype });
	} else if (v.kind === "type_skip" && Number.isFinite(v.until)) {
		state.type_skip[v.mtype] = Math.max(state.type_skip[v.mtype] || 0, Math.min(v.until, now + CFG.impossible.skip_h * 3600_000 * 1.1));
		state.last_pick = 0;
		log_ev("verdict", { from, kind: v.kind, mtype: v.mtype });
	}
}
// Status message to the other members every beat_ms: position, HP, target, pack, errand, combat stats (for the
// fight model), hunt, goals and gold. Skipped while the call budget is tight.
function heartbeat() {
	if (!in_party_cfg() || typeof send_cm !== "function") return;
	const t = get_targeted_monster(), p = state.pack;
	const msg = { k: "hb", v: VERSION, b: BUILD, tn: is_follower() && !errand_busy() ? town_urgent(town_due()) || null : null, lw: travel_long() ? 1 : 0, pt: state.ptown?.joined ? { id: state.ptown.id, done: !!state.ptown.done } : Date.now() - (state.ptown_done_at || 0) < 6000 ? { done: true } : null, xpm: xp_mult(), grp_wait: state.group_wait?.who && !(state.group_wait.go_until > Date.now()) ? state.group_wait.who : null, safety_mult: state.safety_mult || 1, qshort: qshort(), bag_lv: bag_gear_levels(), ledger: my_ledger(), bag_gear: bag_gear_names(), level: character.level, ctype: character.ctype, map: character.map,
		x: Math.round(character.x), y: Math.round(character.y), hp: character.hp, max_hp: character.max_hp, rip: !!character.rip,
		target: t && !t.dead ? t.id : null, pack: p ? { mtype: p.mtype, map: p.map, boundary: p.boundary, directive: p.directive, explore: !!p.explore } : null, recovering: !!state.recovering,
		errand: errand_busy() ? state.errand : null, attack: character.attack, frequency: character.frequency,
		damage_type: character.damage_type || G.classes[character.ctype]?.damage_type, apiercing: character.apiercing || 0,
		rpiercing: character.rpiercing || 0, range: character.range,
		hunt: character.s.monsterhunt?.c > 0 ? { id: character.s.monsterhunt.id, c: character.s.monsterhunt.c } : null, hs: hunt_state(), hms: character.s.monsterhunt?.ms || 0,
		// our own top goal (a follower's directive is always its own; a leader's may be the partner's, so skip those)
		goals: goals_list().sort((a, b) => b.w - a.w).slice(0, 12),
		gold: character.gold, gold_xfer_at: state.gold_xfer_at || 0,
		party: Object.keys(get_party() || {}), // who we're in a game party with (invites use it)
		gear: CFG.gear_auto ? my_gear() : null, esize: character.esize, // hand-me-downs (share_gear)
		worn: CFG.gear_auto ? worn_items() : null, // swap_worn: what's in each slot
		armor: character.armor, resistance: character.resistance, // tank_first fight model
		pots: { hp: pot_count("hp"), mp: pot_count("mp") }, rates: rates(), h1: last_hour(), // merchant service, report
		elx: CFG.merchant.elixir_supply ? held_any(CFG.merchant.elixir_supply.name) : null, // v25.44: the supply elixir held
		mp: character.mp, max_mp: character.max_mp, tokens: held_any("monstertoken"), need: hold_missing(),
		os: oneshot_types() }; // v25.20: types the tank kills in one hit (free-for-all at its camp)
	if (state.travel_off.length && state.travel_full) Object.assign(msg, state.travel_full); // v24.31: as with everything on
	const to = CFG.merchant?.name && !others().includes(CFG.merchant.name) ? [...others(), CFG.merchant.name] : others();
	Promise.resolve(send_cm(to, msg)).catch(() => {});
}
function party_invite_tick() {
	if (!in_party_cfg() || character.rip) return;
	const mine = Object.keys(get_party() || {});
	const missing = partners().filter((p) => !mine.includes(p.name));
	if (!missing.length) return;
	const call = (fn, name, key, msg) => { party_log(key, msg); Promise.resolve(fn(name)).catch(() => {}); };
	const partied = (p) => (p.party || []).some((n) => n !== p.name && members_cfg().includes(n));
	if (in_member_party()) {
		for (const p of missing) if (!partied(p)) call(send_party_invite, p.name, "inv:" + p.name, `party: inviting ${p.name}`);
		return;
	}
	const hosts = partners().filter(partied);
	if (hosts.length) {
		// ask one host per tick, rotating, in case one runs an old version that ignores us
		const h = hosts.sort((a, b) => (a.name < b.name ? -1 : 1))[Math.floor(Date.now() / 10_000) % hosts.length];
		call(send_party_request, h.name, "req:" + h.name, `party: asking to join ${h.name}'s party`);
	} else if (leader_name() === character.name) {
		for (const p of missing) call(send_party_invite, p.name, "inv:" + p.name, `party: inviting ${p.name}`);
	}
}
setInterval(party_invite_tick, 10_000); // every 10s until everyone online is in
// The suicide command: dead at once, no XP loss (server: "harakiri" skips defeated_by_a_monster's 1% of the level),
// respawn in main town after 12s. At most once per 15s.
function suicide(why_) {
	if (character.rip || Date.now() - suicide_at < 15_000 || !parent.socket) return;
	suicide_at = Date.now();
	halt("suicide");
	game_log(`Suicide to regroup in town: ${why_}`, C.warn);
	log_ev("suicide", { why: why_, at: `${state.pack?.mtype || "?"}@${character.map}` });
	parent.socket.emit("harakiri");
}
// ---- role functions (v25.11): the merchant's own versions are in merchant/0_loop.js ----
// The merchant's last heartbeat while it's fresh (null if none)
function merchant_hb() { return fresh(state.merchant) && state.merchant.name === CFG.merchant?.name ? state.merchant : null; }
// v25.39: the worn piece the merchant's upgrade project asks us for, if it's us
function worn_for_me() { const W = merchant_hb()?.want_worn; return W && W.to === character.name ? W : null; }
// Who does the shared work (compounding, upgrade/craft projects, town thresholds) must not flip with a single missed
// heartbeat (the merchant skips beats when its call budget is tight): "merchant online" = heard within 10 minutes
function merchant_recent() {
	return !!state.merchant && state.merchant.name === CFG.merchant?.name && Date.now() - state.merchant.t < 600_000 && !state.merchant.rip;
}
