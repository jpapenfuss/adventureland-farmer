// =====================================================================
// src/merchant/ — loaded by the merchant only (after shared/, before main.js; src/manifest.json). What only the merchant
// does: supply runs, the stand and Merrit's parcels, Ponty, bank housekeeping, donations. Its answers to the fighters'
// functions are in merchant/6_fighter_parts.js (role functions).
// merchant/0_loop.js — merchant only (src/manifest.json): the merchant's part of tick(), its heartbeat, the flee to town, fight-back, donations
// =====================================================================
function merchant_beat() {
	if (!is_merchant() || typeof send_cm !== "function") return;
	if (state.fund_need > 0 && upg_gold_ok(state.fund_need) && !state.upg) state.fund_need = 0;
	const msg = { k: "mhb", v: VERSION, b: BUILD, worn: CFG.gear_auto ? worn_items() : null, ledger: my_ledger(), bag_gear: bag_gear_names(), bag_lv: bag_gear_levels(), gear: CFG.gear_auto ? my_gear() : null, level: character.level, map: character.map, x: Math.round(character.x), y: Math.round(character.y),
		esize: character.esize, gold: character.gold, serving: state.serving || null, rip: !!character.rip, need: hold_missing(),
		fund: state.fund_need && !upg_gold_ok(state.fund_need) ? state.fund_need : 0, // v25.46: upgrade_keep()
		// (collect mode: every piece; else only those for fighters we can't safely walk to — the party comes for those)
		...(() => { const cr = CFG.merchant.collect ? null : cant_reach(); return { cant_reach: cr, give: CFG.merchant.collect ? gear_to_give() : cr.length ? gear_to_give().filter((g) => cr.includes(g.to)) : null }; })(),
		// v25.39: the worn piece our upgrade project needs, until it arrives
		want_worn: state.upg?.worn && !state.upg.worn.got ? { to: state.upg.worn.who, name: state.upg.name, level: state.upg.worn.level, slot: state.upg.worn.slot, stat_type: state.upg.worn.stat_type || null } : null };
	Promise.resolve(send_cm(CFG.party.members || [], msg)).catch(() => {});
}
setInterval(() => { if (spent() < BUDGET.soft - RESERVE.chat) merchant_beat(); }, CFG.party.beat_ms);
function merchant_job() {
	const M = CFG.merchant;
	const need = (p) => (p.esize ?? 99) < M.serve_free || (p.pots && (p.pots.hp < M.serve_pots || p.pots.mp < M.serve_pots));
	const urgent = partners().filter(need).sort((a, b) => (a.esize ?? 99) - (b.esize ?? 99) ||
		Math.min(a.pots?.hp ?? 999, a.pots?.mp ?? 999) - Math.min(b.pots?.hp ?? 999, b.pots?.mp ?? 999))[0];
	// otherwise a delivery: a Tracktrix (or its tokens) we hold for a fighter that lacks one
	return urgent || (is_merchant() ? partners().find(can_supply_hold) : null) || token_target() || worn_target() || gear_target();
}
// v25.43 (owner: "If the route is unsafe for the merchant, the fighters can make the trip to town"): can we walk to this
// fighter? route_plan from here to it, judged for us (we don't fight); 30 s per fighter. The ones we can't reach are
// named in our heartbeat (cant_reach): for them the tank takes the party to town instead.
const reach_c = {};
function merchant_reach_ok(p) {
	const c = reach_c[p.name];
	if (c && Date.now() - c.at < 30_000) return c.ok;
	const pos = partner_pos(p);
	const pl = pos.map === character.map && Math.hypot(pos.x - character.x, pos.y - character.y) < 400 ? { danger: null } : route_plan(pos.map, pos.x, pos.y);
	const ok = !!pl && !pl.danger, now = Date.now();
	reach_c[p.name] = { at: now, ok, why: pl?.danger || (pl ? null : "no way there"), bad_since: ok ? 0 : c?.bad_since || now };
	return ok;
}
// (named only after the verdict has held a minute — one heartbeat starts a party trip — and not for "no way there":
// a fighter in the bank has no route graph entry)
const cant_reach = () => partners().filter((p) => fresh(p) && !p.rip && !merchant_reach_ok(p) && reach_c[p.name].why !== "no way there" &&
	Date.now() - reach_c[p.name].bad_since >= 60_000).map((p) => p.name);
// v25.43: our upgrade project waits for a fighter's worn piece → walk out to it (serve waits by it; the fighter hands the
// piece over at the camp, between fights). One trip per 10 min.
let worn_trip_at = 0;
function worn_target() {
	const W = state.upg?.worn;
	if (!is_merchant() || !W || W.got || Date.now() - worn_trip_at < 600_000) return null;
	const p = state.partners[W.who];
	if (!p || !fresh(p) || p.rip || !merchant_reach_ok(p)) return null; // (an unsafe way: the party comes to town for it)
	return p; // (pure: the slot is stamped when serve() starts the walk — merchant_job is asked every tick and by report())
}
// Donate gold above donate.keep for XP while below donate.to_level (once a minute, idle in town only)
let donate_at = 0;
function merchant_donate() {
	const D = CFG.merchant.donate, now = Date.now();
	if (!D || character.level >= D.to_level || now - donate_at < 60_000 || character.map === "bank") return false;
	donate_at = now;
	const day = state.donated && now - state.donated.since < 86_400_000 ? state.donated : (state.donated = { since: now, g: 0 });
	const g = Math.floor(Math.min(character.gold - D.keep, D.chunk, D.per_day - day.g, gold_room()));
	if (g < 100_000 || !can_spend(1, RESERVE.errand)) return false; // < 100k: the server's "low" donation, skip
	tag_spend("donations");
	parent.socket.emit("donate", { gold: g });
	day.g += g;
	save_state();
	game_log(`merchant: donated ${fmt_k(g)} gold for XP (${fmt_k(day.g)} today, level ${character.level} → ${D.to_level})`, C.info);
	return true;
}
let merchant_trip_at = 0;
function merchant_tick() {
	const f = merchant_job();
	set_message(`${errand_busy() ? state.errand + " | " : ""}merchant${f ? " → " + f.name : ""} | ${character.esize} free`);
	if (walking() || errand_busy()) return;
	mluck_near();
	const MM = CFG.merchant.merrit;
	const urgent = f && ((f.esize ?? 99) < MM.urgent_free || Math.min(f.pots?.hp ?? 999, f.pots?.mp ?? 999) < MM.urgent_pots);
	const settling = merrit_on() && character.stand && state.stand_since && Date.now() - state.stand_since < MM.min_stay_ms;
	if (f && character.esize >= 8 && Date.now() - merchant_trip_at > CFG.merchant.trip_gap_ms && (!settling || urgent)) {
		merchant_trip_at = Date.now();
		return void errand("serve", () => serve(f));
	}
	merchant_donate();
	if (CFG.secondhand_auto && Date.now() - secondhand_at > CFG.secondhand_every_ms && character.esize >= 5 && !settling) { // Ponty can wait for Merrit
		secondhand_at = Date.now();
		return void errand("secondhands", () => task_secondhands());
	}
	// idle: stand at the Merrit spot (or near the town spawn without it); standing still there is what earns parcels
	if (merrit_on()) {
		const sp = merrit_spot();
		if (sp) {
			const here = character.map === "main" && Math.hypot(character.x - sp.x, character.y - sp.y) <= 12;
			if (here && !character.moving) {
				// arrived (smart_move stops a few px short): keep where we are if that spot qualifies too
				if (Math.hypot(character.x - sp.x, character.y - sp.y) > 2 && spot_ok(character.x, character.y)) state.mspot = { x: Math.round(character.x), y: Math.round(character.y) };
				return void stand_tick().catch(() => {});
			}
			if (here) return;
			if (character.stand) return void stand_close();
			if (character.map === "main" && Math.hypot(character.x - sp.x, character.y - sp.y) < 150 && can_move_to(sp.x, sp.y)) return void move_to_as("merchant_tick", sp.x, sp.y, 1000);
			return void travel_as("merchant_tick", { map: "main", x: sp.x, y: sp.y });
		}
	}
	const home = G.maps.main?.spawns?.[0] || [0, 0];
	if (character.map !== "main" || Math.hypot(character.x - home[0], character.y - home[1]) > 250) {
		if (character.stand) return void stand_close();
		travel_as("merchant_tick", { map: "main", x: home[0], y: home[1] });
	} else if (!character.moving) stand_tick().catch(() => {});
}
// ---- from the shared code (v24.95–v25.6): used by the merchant only ----
function recover() {
	if (!state.recovering) {
		const pmf = postmortem();
		log_ev("flee", pmf);
		bucket().flees++;
		const fk = pmf.killer && G.monsters[pmf.killer] ? pmf.killer : state.pack?.mtype;
		incident(fk, 0.8);
		share_verdict({ kind: "incident", mtype: fk, mult: 0.8 }); // v24.6: the leader picks for the party from its own tables
		if (!state.pack?.probe) safety_tune("flee"); // a probe's flee is the probe's verdict, not the everyday limit's
		Object.assign(state, { recovering: true, fled: false, session: null, pack: null });
		game_log(`HP ${((character.hp / character.max_hp) * 100).toFixed(0)}%: retreating`, C.bad);
	}
	const threat = get_nearest_monster({ target: character.name });
	const done = character.hp >= character.max_hp * CFG.recover_hp && character.mp >= character.max_mp * CFG.recover_mp;
	if (done && !threat) {
		Object.assign(state, { recovering: false, fled_home: false, last_target_at: Date.now() });
		return void game_log("Recovered; resuming", C.ok);
	}
	if (channeling()) return void set_message("Teleporting to town…"); // nothing that would cancel it
	if (threat || hurt_ms() < CFG.flee_quiet_ms) {
		// v25.4: a plain attack on what's hitting us (the fighters' combat — steering, kiting, skills — is in fighter/);
		// it used to steer toward a ranged attacker while fleeing
		if (fight_back()) {}
		else if (threat && Number.isFinite(threat.x)) { // v24.8: one we ignore as immune: step away from it (stood still before)
			const a = Math.atan2(character.y - threat.y, character.x - threat.x), x = character.x + Math.cos(a) * 120, y = character.y + Math.sin(a) * 120;
			if (can_move_to(x, y)) move_to_as("recover", x, y, 300);
		}
	} else if (!done && !state.fled_home && Date.now() - (state.town_at || 0) > 1500) {
		if (at_town_spot()) state.fled_home = true;
		else {
			if (walking() || is_moving(character)) halt("recover"), stop("move");
			if (fire("use_town")) (state.fled = true), (state.town_at = Date.now());
		}
	}
}
// ---- the merchant's fight-back (v25.4): what's hitting us gets attacked if in reach; true when something is on us ----
function fight_back() { // v25.11: role function (the fighters' is in fighter/3_combat.js)
	const t = hit_on_me();
	if (!t) return false;
	if (character.c.town) return true; // channelling the town teleport: an attack would cancel it
	if (get_targeted_monster() !== t) change_target(t);
	if (can_attack(t)) fire("attack", t);
	return true;
}
// ---- role functions (v25.11): the fighters' versions are in fighter/1_party.js, 5_town.js and 6_gear.js ----
// The merchant doesn't watch its own heartbeat
function merchant_hb() { return null; }
function merchant_recent() { return false; }
// The merchant never joins a party trip
function ptown_on() { return false; }
// The merchant wears a piece only with merchant.wear_gear (it hands the rest to the fighters)
function self_taker_ok() { return !!CFG.merchant.wear_gear; }
// The merchant keeps its potion float (donate.keep) when it spends
function gold_keep() { return CFG.merchant.donate.keep; }
// The main loop's merchant parts (tick(), main.js): fleeing to town when hurt, then the merchant's own work
function flee_tick() {
	if (!(state.recovering || character.hp < character.max_hp * CFG.flee_hp)) return false;
	recover();
	loot_chests();
	set_message(`Recovering ${((character.hp / character.max_hp) * 100).toFixed(0)}%`);
	return true;
}
function role_tick() { merchant_tick(); loot_chests(); return 250; }
// Gold for an upgrade project: the fighters' gold above fund_keep counts too (they send it on supply runs)
function fund_pool() { return partners().reduce((g, p) => g + Math.max(0, (p.gold || 0) - CFG.merchant.fund_keep), 0); }
function upgrade_steps() { return CFG.merchant_upgrade_steps; }
// A bank piece: the members' it would help; ours only if none would and merchant.wear_gear (v24.5)
function bank_cands(own, theirs) { const t = theirs(); return t.length ? t : own && CFG.merchant.wear_gear ? [[character.name, own]] : []; }
