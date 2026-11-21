// =====================================================================
// fighter.js — loaded by the fighters only (after common.js, before main.js). What only a fighter does: follow the
// tank, heal, hand loot and gold to the merchant, its own token buys and upgrade projects, collecting what the
// merchant holds for it. Defaults for the merchant are in common.js ("Role hooks").
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
// Tokens set aside for our own missing must-hold items that the bank can't supply
const token_reserve = () => hold_missing().filter((n) => !(state.bank_seen[n] > 0)).reduce((a, n) => a + (hold_price(n) || 0), 0);
// The merchant's missing must-hold item that we should buy: only the alphabetically first fighter that already holds
// its own copy and can afford another, so exactly one copy gets bought
function hold_for_merchant() {
	const M = merchant_hb();
	if (!CFG.hold_buy_for_merchant || !M || !Array.isArray(M.need) || is_merchant()) return null;
	for (const n of M.need) {
		const price = hold_price(n), cur = CFG.hold[n];
		if (hold_missing().includes(n) || partners().some((f) => (f.need || []).includes(n))) continue; // fighters first
		if (!price || state.bank_seen[n] > 0 || held_any(n) !== 1 || state.hold_for[n]) continue; // ours only, no extra yet
		const me = { name: character.name, tokens: held_any(cur), need: hold_missing() };
		const ok = [me, ...partners()].filter((f) => Array.isArray(f.need) && !f.need.includes(n) && (f.tokens || 0) >= price)
			.sort((a, b) => (a.name < b.name ? -1 : 1));
		if (ok[0]?.name === character.name) return { name: n, price, for: M.name, gain: 0, hold: true };
	}
	return null;
}
function token_pick() {
	const have = held_any("monstertoken"), shop = G.tokens?.monstertoken || {};
	if (!CFG.token_auto || have <= 0 || character.esize < 2 || is_merchant()) return null; // the merchant hands its tokens to fighters
	// must-hold items first: ours, then the merchant's
	for (const n of hold_missing()) {
		const price = hold_price(n);
		if (CFG.hold[n] === "monstertoken" && price && price <= have && !(state.bank_seen[n] > 0)) return { name: n, price, for: character.name, gain: 0, hold: true };
	}
	const mh = hold_for_merchant();
	if (mh) return mh;
	const budget = have - token_reserve(); // gear never spends tokens a missing must-hold item needs
	let best = null;
	for (const name in shop) {
		const price = shop[name];
		if (price > budget || !GEAR.has(G.items[name]?.type) || party_holds(name)) continue;
		for (const m of gear_takers().filter((x) => x.ctype !== "merchant")) {
			const r = gear_gain({ name, level: 0 }, m.ctype, m.g);
			if (r && (!best || r.gain / price > best.v)) best = { name, price, for: m.name, gain: Math.round(r.gain), v: r.gain / price };
		}
		// v24.67: for ourselves, a piece that only beats what we wear once upgraded (the fifth piece of a set at +0
		// against a worn +5): bought when the lowest level at which it wins is one our scrolls reach; we upgrade it
		// ourselves (own project) and wear it then. Sanala sat at 4 of 5 Monster Hunter Mage pieces.
		const mine = set_piece_plan(name);
		if (mine && (!best || mine.gain / price > best.v)) best = { name, price, for: character.name, gain: mine.gain, v: mine.gain / price, to: mine.to, slot: mine.slot };
	}
	return best;
}
// The lowest level (1..what scroll0/scroll1 reach, under a past ceiling) at which an upgradable piece beats what we wear
// (from: the level of a copy we have — in the bags or the bank; 0 for one still to buy)
const spp_cache = new Map(); // "name:from" -> { at, v } (30s: bag_plan asks for every bag slot)
function set_piece_plan(name, from = 0) {
	if (state.upg) return null;
	const key = `${name}:${from}`, c = spp_cache.get(key);
	if (c && Date.now() - c.at < 30_000) return c.v;
	const v = set_piece_plan_raw(name, from);
	spp_cache.set(key, { at: Date.now(), v });
	return v;
}
function set_piece_plan_raw(name, from) {
	if (!CFG.upgrade_auto || !CFG.gear_auto || is_merchant() || !G.items[name]?.upgrade || !GEAR.has(G.items[name].type) || state.upg || skipped("upg:" + name)) return null;
	const g = my_gear(), max = Math.min(upgrade_target(name), upg_cap_level(name));
	if (gear_gain({ name, level: from }, character.ctype, g)) return null; // wins as it is: the ordinary pick
	for (let to = from + 1; to <= max; to++) {
		const r = gear_gain({ name, level: to }, character.ctype, g);
		if (r) return upgrade_cost(name, to) - upgrade_cost(name, from) <= upgrade_gold() ? { to, slot: r.slot, gain: Math.round(r.gain) } : null;
	}
	return null;
}
// v24.69: a piece of a set we wear that lies in the bank below the level at which it would win (Sanala's fifth
// Monster Hunter piece sat there at +0): fetched, then upgraded as our own project. One at a time.
// v24.70: any piece (not only a set's): the one with the biggest gain
function set_piece_fetch() {
	if (state.upg || is_merchant()) return [];
	let best = null;
	for (const it of state.bank_gear || []) {
		if (it.p || character.items.some((i) => i && i.name === it.name)) continue;
		const pl = set_piece_plan(it.name, it.level || 0);
		if (pl && (!best || pl.gain > best.pl.gain)) best = { it, pl };
	}
	return best ? [{ name: best.it.name, level: best.it.level || 0, exact: true, key: `setp:${best.it.name}` }] : [];
}
// A copy in our bags that would win once upgraded → our own project
function set_piece_start() {
	if (state.upg || is_merchant()) return;
	let best = null;
	for (const i of character.items) {
		if (!i || i.l || !GEAR.has(G.items[i.name]?.type)) continue;
		const pl = set_piece_plan(i.name, i.level || 0);
		if (pl && (!best || pl.gain > best.pl.gain)) best = { i, pl };
	}
	if (best) {
		const { i, pl } = best;
		state.upg = { name: i.name, to: pl.to, for: character.name, slot: pl.slot, gain: pl.gain, cost: upgrade_cost(i.name, pl.to) - upgrade_cost(i.name, i.level || 0), own: true };
		state.upg_pick_at = Date.now();
		return void game_log(`upgrade project (ours): ${i.name} +${i.level || 0} → +${pl.to}, then worn (+${pl.gain} pts)`, C.info);
	}
}
async function task_tokens() {
	let n = 0;
	for (let i = 0; i < 5; i++) {
		const b = token_pick();
		if (!b) break;
		await go_npc("monsterhunter");
		await wait_budget(1, RESERVE.errand);
		try {
			await T(exchange_buy("monstertoken", b.name));
			n++;
			if (b.hold && b.for !== character.name) state.hold_for[b.name] = { to: b.for, at: Date.now() };
			game_log(`tokens: bought ${b.name} (${b.price} tokens) for ${b.for} (+${b.gain} pts${b.to ? ` once it's +${b.to}` : ""})`, C.ok);
			// a piece bought to be upgraded: our own project (the merchant has no copy of it to work on)
			if (b.to) { state.upg = { name: b.name, to: b.to, for: character.name, slot: b.slot, gain: b.gain, cost: upgrade_cost(b.name, b.to), own: true }; state.upg_pick_at = Date.now(); }
			log_ev("buy", { item: b.name, src: "tokens", for: b.for });
			await until(() => held_any(b.name) > 0, 3000);
		} catch (e) { game_log(`tokens: ${b.name}: ${why(e)}`, C.dim); skip("town:tokens", pause_ms(e, 3600_000), why(e)); break; }
	}
	return n;
}
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

// Priests heal whoever in the party is lowest (partyheal when two or more are hurt)
// Priests: heal the lowest member below heal_at (partyheal when 2+ are hurt and it's ready); walk toward a hurt member
// out of range. Returns true when a heal was cast (it shares the attack cooldown).
function party_heal() {
	if (character.ctype !== "priest") return false;
	const members = [character];
	for (const n of others()) { const e = parent.entities?.[n]; if (e && !e.rip && valid(e)) members.push(e); }
	const low = members.filter((m) => m.hp < m.max_hp * CFG.party.heal_at).sort((a, b) => a.hp / a.max_hp - b.hp / b.max_hp);
	if (!low.length) return false;
	if (low.length >= 2 && can_use("partyheal")) return fire("partyheal"), true;
	const m = low[0];
	if (m !== character && distance(character, m) > character.range) return false; // v24.63: no walk to it — a follower's place is by the tank
	return !is_on_cooldown("heal") && fire("heal", m);
}
// Follower: stay with the leader, shoot its target (or whatever is hitting the party), heal
function follower_tick() {
	const L = leader_hb();
	if (!L || L.rip) { // no leader (no tank online), or it's dead: stand, heal, fight only what's on us
		state.last_target_at = Date.now();
		if (party_heal()) return;
		const a = hit_on_me();
		if (a) fight(a, false);
		return;
	}
	// v24.8: a fleeing leader sends no pack: keep ours and hold it (as on its errands) instead of walking to its town spot
	state.pack = L.pack && valid_boundary(L.pack.boundary) ? { mtype: L.pack.mtype, map: L.pack.map, boundary: L.pack.boundary, directive: `following ${L.name}`, probe: !!L.pack.probe }
		: L.recovering && state.pack ? state.pack : null;
	state.last_target_at = Date.now();
	if (party_heal()) return;
	// v24.57: a follower never walks to the camp on its own. While the leader is on an errand (a town trip: the party
	// is in town together) it waits where it is in town — or walks to town if it somehow isn't there; otherwise it
	// goes to the leader. The old rule (v18.8: "leader on an errand → go and fight at its camp") sent Aspernari off to
	// croc alone the moment her own town run ended, 2s before the tank's status showed its errand over.
	const away = !!L.errand;
	// v24.61: not in town while the leader is on an errand → go to the leader, wherever it is (it used to walk to town alone)
	const pos = away && in_town() ? { map: character.map, x: character.x, y: character.y } : partner_pos(L);
	const lt = !away && L.target && parent.entities[L.target];
	const leader_t = lt && valid(lt) && lt.type === "monster" ? lt : null;
	// v24.8: what's hitting us first, always; then assist the tank (the leader)
	// v24.56: a follower only goes for what already targets the party. It used to pick its own monster of the camp's
	// type (follower_pick) and walk up to it; fire() then refused the attack (only the tank starts a fight), so it stood
	// next to untanked monsters — Sanala, 150px from the tank, beside five level 8-9 poisio. follower_pick is still
	// called for what it keeps up to date (state.safe: which type the party can take), not for its pick.
	follower_pick(pos);
	let t = hit_on_me() || caller_target() || leader_t || choose_target(false);
	if (t && !t.target) t = null;
	announce_target(t);
	// engaged = a target within wait_radius of the leader: stay on it (close in, then hold position in reach) instead of
	// drifting back to the leader — melee used to step back to the leader after every swing at a target that wasn't
	// attacking it, and only hit what wandered into range
	const engaged = !!t && pos.map === character.map && Math.hypot(t.x - pos.x, t.y - pos.y) <= CFG.party.wait_radius;
	if (t) {
		if (get_targeted_monster() !== t) change_target(t);
		if (engaged) break_walk_for(t);
		// close in on targets out of reach; kiting (ranged, when the target is on us) takes precedence
		// v24.66: only when it's out of range. It used to step in from 90% of range — a caster that had just cast on
		// its target then walked closer to it.
		if (engaged && !walking() && !errand_busy() && distance(character, t) > character.range) approach(t);
		if (!hold_for_tank(t) && !class_skills(t) && can_attack(t)) fire("attack", t);
	}
	if (engaged || walking() || errand_busy()) return;
	const d = pos.map === character.map ? Math.hypot(pos.x - character.x, pos.y - character.y) : Infinity;
	state.follow_block = null;
	// v24.66: a caster stays within 70% of its range of the tank (what the tank fights is beside it: in range, and the
	// tank in heal range), not within `follow` px — it stepped after the tank on every monster while already in range
	const fol = RANGED ? Math.max(CFG.party.follow, Math.min(character.range * 0.7, CFG.party.engage_px * 0.5)) : CFG.party.follow;
	if (d > CFG.party.follow_far) travel_as("follower_tick", pos);
	else if (d > fol) {
		const ang = Math.atan2(character.y - pos.y, character.x - pos.x);
		const want = { x: pos.x + Math.cos(ang) * fol * 0.6, y: pos.y + Math.sin(ang) * fol * 0.6 };
		if (can_move_to(want.x, want.y)) move_to_as("follower_tick", want.x, want.y, 300); else travel_as("follower_tick", pos);
	}
}
// Follower with nothing to hit (the leader one-shots its targets, e.g. goos): take our own monster of the leader's
// pack type within wait_radius of the leader. Followers don't run pick_pack, so its safety is checked here (30s cache).
function follower_pick(pos) {
	const mt = state.pack?.mtype;
	if (!mt || pos.map !== character.map) return null;
	if (state.pack.probe) state.safe[mt] = { ttk: 5, xp: G.monsters[mt]?.xp || 0, probe: true }; // the leader is probing it
	else if (Date.now() - (state.fsafe_at || 0) > 30_000 || state.fsafe_mt !== mt) {
		const f = fight_profile(mt);
		if (f) state.safe[mt] = f; else delete state.safe[mt];
		state.fsafe_at = Date.now(); state.fsafe_mt = mt;
	}
	if (!state.safe[mt]) return null;
	const e = choose_target(true);
	return e && e.mtype === mt && Math.hypot(e.x - pos.x, e.y - pos.y) <= CFG.party.wait_radius ? e : null;
}
// v24.95: a fighter's part of tick() (alive, the party whole, not parked, no event): the follower follows; the tank
// picks and reviews its camp, holds for the party, fights, walks, patrols. Returns the ms until the next tick.
function fighter_tick() {
	let wait = 200;
	if (is_follower()) {
		lead_lost();
		follower_tick();
		loot_chests();
		const L = leader_hb();
		set_message(`${errand_busy() ? state.errand + " | " : ""}${!L ? "no tank online" : L.rip ? "waiting for " + L.name + " (dead)" : "with " + L.name + (L.pack ? " @ " + L.pack.mtype : "")} | ${character.esize} free`);
		return 150;
	}
	// v24.8: with the party waiting at our pack while we're on an errand or walking back: no re-pick (the periodic
	// one, town_body's reset) — that switched to another pack and moved them
	const cp = state.pack, waiting = in_party_cfg() && !!cp && partners().length > 0 && !partners_near().length &&
		partners().every((q) => q.pack && valid_boundary(q.pack.boundary) && pack_key(q.pack) === pack_key(cp));
	// v24.45: nor while a member is in town (a town run, a party trip): it's back in a minute, and a pick made
	// without it ("1 with us") ruled out the party's spot and walked the rest to a weaker one each time
	const member_in_town = in_party_cfg() && !!cp && partners().some((q) => q.errand === "town" || q.pt);
	probe_check();
	// v24.60: the party sits at its camp. No re-pick every repick_ms (estimates within a few % of each other moved
	// it between camps: 18 changes in an hour). A camp is left only when it's gone: a death there, nothing to
	// fight for the idle time, or no safe way to it — each of those clears state.pack or picks again itself.
	// v24.62: and it's chosen by the whole party: not before every member has been heard from (the tank used to
	// pick on the first tick after loading, judging every monster for itself alone, and the party sat there)
	if (!state.pack && !(in_party_cfg() && party_break())) pick_pack();
	else if (state.pack && !(in_party_cfg() && party_break())) camp_review(); // v24.84
	if (state.pack?.boss && boss_tick(state.pack)) { loot_chests(); return 200; }
	const pack = state.pack;
	const in_area = !!pack && character.map === pack.map && in_boundary(pack.boundary, 250);
	if (pack && state.group_ok && state.group_ok !== pack_key(pack)) state.group_ok = null;
	// v24.14: something we can't take on is close and may attack: step away first (still fight what's on us)
	const lm = !walking() && in_area ? looming() : null; // v24.16: at the spot only — mid-walk it stopped the walk, stepped
	// away, and the walk went right back past it (stuck between camps); on the way, fight()'s escape outruns what attacks
	if (lm) {
		keep_away(lm);
		const a = hit_on_me();
		if (a && a !== lm) fight(a, false);
		loot_chests();
		return 200;
	}
	// v24.11: travel as a group — wait for stragglers before (and while) walking, and before pulling at the spot
	const hold = group_hold(pack, in_area);
	if (hold) {
		const a = hit_on_me() || choose_target(false); // what's attacking one of us still gets fought
		if (a) fight(a, true);
		else if (walking() && !errand_busy()) { halt("tick"); }
		state.last_target_at = Date.now(); // waiting for a member isn't an idle camp
		set_message(`waiting for ${hold} (${Math.round((Date.now() - state.group_wait.since) / 1000)}s)`);
		loot_chests();
		return 250;
	}
	// v24.74: on its walk to town (a party trip) the tank only fights what is already on a member. It kept starting
	// fights on the camp's monsters, each one stopping the walk: 12 minutes "on a town errand" without leaving the camp.
	const t = hit_on_me() || (!i_am_tank() && caller_target()) || (state.lead_walk ? choose_target(false) : choose_target(in_area || !pack, true));
	announce_target(t);
	if (t && !watch_progress(t)) {
		state.last_target_at = Date.now();
		fight(t, true);
		wait = Math.min(Math.max(+(parent.next_skill?.attack || 0) - Date.now(), 50), 200); // wake for the next attack
	} else if (!pack) {
		set_message("No viable pack");
		wait = get_nearest_monster({ target: character.name }) ? 250 : 2000; // v24.8: 5s let an attacker hit unanswered
	} else if (!walking() && !errand_busy()) {
		if (!in_area) {
			if (!state.waypoints.length) state.waypoints = make_waypoints(pack.boundary);
			const w = state.waypoints[state.wp % state.waypoints.length];
			travel_as("tick", { map: pack.map, x: w.x, y: w.y });
		// v24.6: at least one respawn (packs up to max_respawn are farmed, scored as if we wait for them)
		} else if (camp_overgrown(pack)) {
			// v24.61: every monster here has levelled past what the party takes on: leave now, not after the idle time
			game_log(`${pack.mtype}: all ${camp_overgrown(pack)} here are levelled past the limit; resting this camp`, C.warn);
			log_ev("overgrown", { mtype: pack.mtype, n: camp_overgrown(pack) });
			state.cooldown[pack_key(pack)] = Date.now() + CFG.pack_cooldown_ms;
			pick_pack();
		} else if (Date.now() - state.last_target_at > Math.max(CFG.idle_giveup_ms, Math.min(CFG.max_respawn, G.monsters[pack.mtype]?.respawn || 0) * 1000 + 5000)) {
			game_log(`Idle at ${pack.mtype}; cooling down this pack`, C.dim);
			state.cooldown[pack_key(pack)] = Date.now() + CFG.pack_cooldown_ms;
			pick_pack();
		} else patrol();
	}
	loot_chests();
	if (pack) {
		const s = state.session, live = s && Date.now() - s.start > 10_000 ? (s.xp / ((Date.now() - s.start) / 1000)).toFixed(0) : "–";
		const src = pack.directive ? pack.directive.split(/[ :(]/)[0] : "xp";
		set_message(`${errand_busy() ? state.errand + " | " : ""}${pack.mtype} (${src}) ${live}xp/s | ${character.esize} free`);
	}
	return wait;
}
// ---- moved from common.js (v24.95): used by the fighters only ----
// ---- Assist the tank (v15.4): with a tank near, it picks the targets and everyone else hits its target ----
const i_am_tank = () => CFG.party.tank_first && in_party_cfg() && CFG.gear_tank.includes(character.ctype) && partners_near(400).length > 0;
// The tank's current target, as a live entity (its "tgt" broadcasts update state.partners[tank].target at once)
function caller_target() {
	const tank = tank_cover();
	const id = tank && state.partners[tank.name]?.target, e = id && parent.entities?.[id];
	return e && valid(e) && e.type === "monster" ? e : null;
}
// The tank tells everyone its new target right away (not at the next heartbeat)
let announced = null;
function announce_target(t) {
	if (!t || announced === t.id || !i_am_tank() || typeof send_cm !== "function") return;
	announced = t.id;
	Promise.resolve(send_cm(others(), { k: "tgt", id: t.id })).catch(() => {});
}
// The maps a walk crosses after leaving `from`, ending with `to` (the BFS route; smart_move's may differ a little)
function map_route(from, to) {
	if (from === to || !Number.isFinite(map_hops(from, to))) return [];
	const prev = hops_prev[from] || {}, out = [];
	for (let m = to; m && m !== from && out.length < 30; m = prev[m]) out.unshift(m);
	return out;
}
const rect_gap = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
// A spot within danger_px of a spawn of such a monster: its name, else null
function area_danger(area, mt) {
	for (const [pk, a2] of map_areas(area.map)) {
		const t = pk.type;
		if (t === mt || !aggressive(t) || state.safe[t] || !valid_boundary(a2.boundary)) continue;
		if (rect_gap(area.boundary, a2.boundary) < CFG.danger_px) return t;
	}
	return null;
}
// A route through (or into) a map with such a monster that's also faster than us — it can't be outrun: "mt @ map", else null.
// v24.16: smart_move's route (route_to); from defaults to us (the leader also checks each member's way there)
function route_danger(to, tx, ty, from) {
	const v = character.speed || 55;
	const sp = G.maps[to]?.spawns?.[0] || [0, 0];
	// v24.17: with door data, the danger is only real if there's no way around it (go() walks the way around)
	if (G.maps[(from || character).map]?.doors) { const pl = route_plan(to, tx ?? sp[0], ty ?? sp[1], from || undefined); return pl ? pl.danger : null; }
	const r = { maps: map_route((from || character).map, to) };
	for (const m of r.maps) for (const [pk] of map_areas(m)) {
		const t = pk.type;
		if (no_go(t, v)) return `${t} @ ${m}`;
	}
	return null;
}
// ---- Keep away (v24.14) ----
// A monster we can't take on that may attack at all (any aggro or rage), within keep_px and not yet on one of us:
// step away before it picks someone. An ent (8M HP, 3600 a hit, aggro 0.2) wandering into the gscorpion spot killed
// Sanala and made Aspernari flee; with aggro under 0.5 it passed the spawn check, and it roams anyway.
const deadly_c = {};
function deadly_type(mt) {
	const c = deadly_c[mt], now = Date.now();
	if (c && now - c.at < 30_000) return c.v;
	const m = G.monsters[mt];
	const v = !!m && ((m.aggro || 0) > 0 || (m.rage || 0) > 0) && !state.safe[mt] && !fight_profile(mt);
	deadly_c[mt] = { at: now, v };
	return v;
}
function looming() {
	const party = party_names();
	let best = null, bd = CFG.keep_px;
	for (const id in parent.entities || {}) {
		const e = parent.entities[id];
		if (!e || e.type !== "monster" || !e.visible || e.dead || (e.target && party.has(e.target))) continue; // on us: fight()'s escape
		if (e.mtype === state.pack?.mtype) continue; // what the party came for (a boss, a probe): not something to avoid
		const d = distance(character, e);
		if (d >= bd) continue;
		// v24.25: only one coming our way (moving, its next point nearer us) or already very close — a wandering ent
		// 300px off made Torlis step away and walk back over and over ("afraid of trees")
		const gx = Number.isFinite(e.going_x) ? e.going_x : e.x, gy = Number.isFinite(e.going_y) ? e.going_y : e.y;
		const coming = !!e.moving && Math.hypot(gx - character.x, gy - character.y) < d - 10;
		if ((coming || d < CFG.keep_close_px) && deadly_type(e.mtype)) (best = e), (bd = d);
	}
	return best;
}
// Step away from a looming one; repeated at the same spot (3 times in 5 min), that spot cools down (it lives there)
function keep_away(e) {
	const now = Date.now(), P = state.pack, key = P && valid_boundary(P.boundary) ? pack_key(P) : null;
	step_away(e);
	set_message(`keeping away from ${e.mtype}`);
	if (now - (state.keep_at || 0) > 5000) { // one count per 5s episode
		state.keep_log = (state.keep_log || []).filter((k) => now - k.t < 300_000);
		state.keep_log.push({ t: now, key, mt: e.mtype });
		log_ev("keep_away", { mtype: e.mtype, pack: P?.mtype || null });
		if (key && !is_follower() && state.keep_log.filter((k) => k.key === key).length >= 4) {
			state.cooldown[key] = now + CFG.pack_cooldown_ms;
			state.keep_log = [];
			state.last_pick = 0;
			game_log(`${e.mtype} keeps coming to ${P.mtype}; cooling this spot down`, C.warn);
		}
	}
	state.keep_at = now;
}
// v24.16: together, a spot is only as safe as the way there for every member (one in another map walks its own route)
function party_route_danger(to) {
	const own = route_danger(to);
	if (own || !in_party_cfg()) return own;
	for (const p of partners()) {
		if (p.map === character.map || p.errand) continue;
		const q = partner_pos(p), rd = route_danger(to, undefined, undefined, { map: q.map, x: q.x, y: q.y });
		if (rd) return `${rd} (${p.name}'s way)`;
	}
	return null;
}
// v24.9: a spot's xp/s counting the walk there: over an expected stay of stay_min, travel minutes earn nothing. Spots
// were picked by rate alone, so a slightly better one maps away beat the one at hand (walk was 72-93% of the time)
const walk_factor = (area) => { const st = CFG.travel.stay_min * 60, t = travel_s(area.map, area.boundary); return Number.isFinite(t) ? st / (st + t) : 0; };
// v24.84: the tank's camp review — on time, or early once the party is stronger than at the last pick
function camp_review() {
	const cur = state.pack, now = Date.now(), since = now - (state.review_at || state.camp_at || now);
	if (!cur || cur.boss || cur.probe || errand_busy() || walking() || party_hit()) return false;
	const pw = party_power(), p0 = state.review_pw;
	// v24.88: a new goal (a hunt taken, a quest's material) or one ended → review after a minute, not up to 30
	const dir = state.directive && state.directive.until > now ? `${state.directive.monster}:${state.directive.map}` : "";
	const goal_changed = dir !== (state.review_dir || "") && since >= 60_000;
	const stronger = !!(pw && p0 && (pw.lv - p0.lv >= 1 || (p0.gs > 0 && pw.gs / p0.gs - 1 >= CFG.camp_review_gear)));
	if (!(goal_changed || since >= CFG.camp_review_min * 60_000 || (stronger && since >= CFG.camp_review_early_min * 60_000))) return false;
	const before = pack_key(cur);
	pick_pack();
	const moved = !!state.pack && pack_key(state.pack) !== before;
	const other = (state.pick_table || []).filter((c) => !c.out && c.key !== before).sort((a, b) => (b.score || 0) - (a.score || 0))[0];
	state.review_last = { at: now, why: goal_changed ? (dir ? `goal: ${state.directive.reason}` : "the goal ended") : stronger ? "the party is stronger" : `${CFG.camp_review_min} min at the camp`, moved,
		text: moved ? `moved to ${state.pack.mtype}@${state.pack.map}` : `kept ${cur.mtype}@${cur.map}${other ? ` (next best ${other.mtype}@${other.map} ${Math.round(other.score)}${other.m ? " measured" : " est"})` : ""}` };
	log_ev("review", { moved, to: state.pack ? `${state.pack.mtype}@${state.pack.map}` : null, why: state.review_last.why });
	return moved;
}
// =====================================================================
// Where to fight
// =====================================================================
// Switch to a pack: new patrol route, close the running xp measurement, log the reason
function set_pack(p, label) {
	if (!state.pack || !p || pack_key(state.pack) !== pack_key(p)) {
		if (p) game_log(label, C.info);
		if (p) log_ev(p.boss ? "boss" : "pack", { name: p.mtype, to: `${p.mtype}@${p.map}`, from: state.pack ? `${state.pack.mtype}@${state.pack.map}` : null, why: p.directive || "best xp/s" });
		state.waypoints = p ? make_waypoints(p.boundary) : [];
		state.wp = 0;
		state.camp_at = Date.now(); // v24.84: the review clock
		end_session();
		state.last_target_at = Date.now();
	}
	state.pack = p;
}
// Choose where to fight: best-scoring safe pack, unless a directive (guide/quest/hunt) names one we can fight.
// Stays at the current pack unless the best is switch_margin better (hysteresis).
// ---- Probing (CFG.probe) ----
// How far over the safety limit a monster is: fight_risk ÷ the same budget safe_enough uses (1 = exactly at it)
function risk_over(mt) {
	const m = G.monsters[mt], f = m && fight_math(m);
	if (!f) return Infinity;
	const limit = (f.hp_pool || character.max_hp) * safety_now() * danger_of(mt, f) * heal_mult(f);
	return fight_risk(f) / Math.max(1, limit);
}
// May the leader start a probe now? Everyone near, healthy and stocked; nothing else special going on
function probe_ready() {
	const P = CFG.probe, now = Date.now();
	if (!P?.enabled || is_follower() || is_merchant() || (in_party_cfg() && leader_name() !== character.name) || state.probe || now - (state.probe_at || 0) < P.every_min * 60_000) return false;
	if (state.directive?.boss || event_live() || errand_busy() || state.recovering || character.rip) return false;
	const all = partners();
	if (partners_near().length < all.length || character.hp < character.max_hp * 0.8) return false;
	if (pot_count("hp") < CFG.pot_min * 2 || pot_count("mp") < CFG.pot_min * 2) return false;
	return all.every((p) => p.max_hp && p.hp >= p.max_hp * 0.8 && (p.pots?.hp ?? 0) >= CFG.pot_min * 2 && (p.pots?.mp ?? 0) >= CFG.pot_min * 2);
}
// Best-xp spot of a monster just past the limit that would beat the best normal spot (this pick's) by min_gain
function probe_pick() {
	const P = CFG.probe, now = Date.now(), ref = state.best_score;
	let best = null;
	for (const mt in G.monsters) {
		if (!farmable_type(mt) || skipped("probe:" + mt)) continue; // safe ones fail r > 1 below
		const r = risk_over(mt);
		if (!(r > 1 && r <= P.max_over)) continue;
		const m = G.monsters[mt], f = fight_math(m);
		each_area((pack, area) => {
			if (pack.type !== mt || (!pack.grow && (expected_respawn(mt, pack) > CFG.max_respawn || pack.count < CFG.min_count))) return;
			if ((state.cooldown[pack_key(area)] || 0) > now) return;
			// v24.54: a probe spot gets the same checks as any other — no no-go neighbour, a safe way there. The probe
			// picked cgoo@level2s, whose only way passes the ents: the tank stood in town repeating "deadly_route".
			if (area_danger(area, mt) || party_route_danger(area.map)) return;
			// v24.3: a spot probed before is judged by what it measured (a probe that held far below its estimate was
			// re-probed every win_cooldown_h forever); raw = the unscaled estimate, the unit realism compares against
			const raw = m.xp * Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack));
			const est = meas_aged(pack_key(area), raw * state.realism); // v24.7: aged
			if (est >= P.min_gain * (ref || 0) && (!best || est > best.est)) best = { mt, area, est, raw, r, ttk: f.ttk, pred: Math.round(fight_risk(f)) };
		});
	}
	return best;
}
// "over the safety limit x1.27 (calibration x0.74, incidents x0.70, 2 with us)": by how much a type fails, and what
// scales its limit — the fight model's risk against the HP pool x safety x calibration x incidents (flees, deaths: they
// fade) x the priest's bonus, judged as fight_profile judges it
function over_text(mt) {
	const m = G.monsters[mt], f = m && fight_math(m);
	if (!f) return "over the safety limit (no damage on it)";
	const lim = (f.hp_pool || character.max_hp) * safety_now() * danger_of(mt, f) * heal_mult(f);
	const inc = state.danger[mt] || 1, cal = calib_factor(mt, f);
	return `over the safety limit x${(fight_risk(f) / lim).toFixed(2)} (calibration x${cal.toFixed(2)}${inc !== 1 ? `, incidents x${inc.toFixed(2)}` : ""}, ${f.mates} with us${f.priest ? "" : ", no priest"})`;
}
function pick_pack() {
	state.safe = {};
	for (const t in G.monsters) { const f = fight_profile(t); if (f) state.safe[t] = f; }
	const now = Date.now();
	if (state.probe && now < state.probe.until) { // a probe holds the pack until probe_check ends it
		state.safe[state.probe.mtype] = state.probe.prof;
		state.last_pick = now;
		return;
	}
	let best = null;
	const seen = new Set(), route_cache = new Map();
	state.pick_skips = {};
	// v24.38: every spot considered and what became of it (report: "spot choice"). out: why it's out, null = a candidate
	const table = (state.pick_table = []);
	state.pick_table_at = Date.now(); // (the report's "spot choice … ago": last_pick is zeroed to force a pick)
	const note = (key, t, map, out, extra) => table.push({ key, mtype: t, map, out, m: meas()[key] || 0, ...extra });
	each_area((pack, area) => {
		const t = pack.type, key = pack_key(area);
		if (CFG.force_type && t !== CFG.force_type) return;
		if (!state.safe[t]) { if (meas()[key] && !seen.has("x" + key)) { seen.add("x" + key); note(key, t, area.map, over_text(t)); } return; }
		if (!pack.grow && (expected_respawn(t, pack) > CFG.max_respawn || pack.count < CFG.min_count)) return;
		if (seen.has(key)) return;
		if ((state.cooldown[key] || 0) > now) { seen.add(key); note(key, t, area.map, `resting ${mins(state.cooldown[key])} (a flee, a death, or it ran dry)`); return; }
		seen.add(key);
		// v24.10: not next to aggressive monsters we can't take on, nor past ones we can't outrun
		const nb = area_danger(area, t), rd = nb ? null : route_cache.has(area.map) ? route_cache.get(area.map) : (route_cache.set(area.map, party_route_danger(area.map)), route_cache.get(area.map));
		if (nb || rd) { state.pick_skips[key] = nb ? `${nb} spawns within ${CFG.danger_px}px` : `the way there passes ${rd}`; note(key, t, area.map, state.pick_skips[key]); return; }
		const p = { mtype: t, ...area, ...score_area(t, pack, area) };
		p.rate = p.score; // its xp/s there (the side-goal and probe reference)
		p.score *= walk_factor(area); // v24.9: counting the walk there
		if (!(p.score > 0)) return; // v24.20: unreachable (no way there) or worthless: never the pick (it took "jrat @ jail")
		note(key, t, area.map, null, { rate: p.rate, score: p.score });
		if (!best || p.score > best.score) best = p;
	});
	state.last_pick = now;
	state.review_at = now; state.review_pw = party_power(); // v24.84
	state.review_dir = state.directive && state.directive.until > now ? `${state.directive.monster}:${state.directive.map}` : ""; // v24.88
	state.best_score = best ? best.rate : 0;
	state.best_at = now;
	if (probe_ready()) {
		state.probe_at = now;
		const pb = probe_pick();
		if (!pb) state.probe_none = { at: now, best: Math.round(state.best_score || 0) };
		if (pb) {
			const prof = { ttk: pb.ttk, xp: G.monsters[pb.mt].xp, probe: true };
			state.probe = { mtype: pb.mt, start: now, until: now + CFG.probe.minutes * 60_000, ratio: pb.r, pred: pb.pred, prof };
			state.safe[pb.mt] = prof;
			log_ev("probe_start", { mtype: pb.mt, over: +pb.r.toFixed(2), est: Math.round(pb.est) });
			state.probe_none = null;
			return set_pack({ mtype: pb.mt, ...pb.area, est: pb.raw, score: pb.est, probe: true, directive: `probe: ${pb.mt} (risk x${pb.r.toFixed(2)} of the limit)` },
				`→ PROBE ${pb.mt} @ ${pb.area.map}: risk x${pb.r.toFixed(2)} of the limit, ~${Math.round(pb.est)} xp/s`);
		}
	}

	const d = state.directive;
	if (d && d.until > now && farmable_type(d.monster) && !state.safe[d.monster] && d.guide_safe)
		state.safe[d.monster] = { ttk: d.seconds || 5, xp: G.monsters[d.monster].xp, trusted: true }; // guide's kill time,
		// or 5s if it gave none — the guide's own fight model judged this route safe for us
	if (d && d.until > now && d.boss)
		return set_pack({ mtype: d.monster, map: d.map, boundary: d.boundary, count: 1, boss: true, est: 0, score: 0, directive: d.reason }, `→ ${d.reason} @ ${d.map}`);
	if (d && d.until > now && state.safe[d.monster]) {
		const area = { map: d.map, boundary: d.boundary, count: d.count };
		// v24.10: a goal's spot gets the same danger check (not a boss: the party gathers for it)
		const dz = !d.boss && valid_boundary(area.boundary) && (area_danger(area, d.monster) || party_route_danger(area.map));
		if (dz) state.pick_skips[pack_key(area)] = `goal ${d.monster}: ${dz}`;
		if (!dz && !((state.cooldown[pack_key(area)] || 0) > now)) {
			const pack = (G.maps[d.map]?.monsters || []).find((pk) => pk.type === d.monster) || { count: d.count };
			return set_pack({ mtype: d.monster, ...area, ...score_area(d.monster, pack, area), directive: d.reason }, `→ ${d.monster} @ ${d.map} (${d.reason})`);
		}
	}
	const cur = state.pack;
	if (cur && state.safe[cur.mtype] && !((state.cooldown[pack_key(cur)] || 0) > now) && best && pack_key(best) !== pack_key(cur)) {
		const cur_v = (cur.est > 0 ? meas_aged(pack_key(cur), cur.est * state.realism) : meas()[pack_key(cur)] ?? cur.score) * walk_factor(cur); // v24.6: aged; v24.9: walk left
		if (best.score < cur_v * CFG.switch_margin) best = cur;
	}
	// v24.36: leaving a spot because it stopped passing the safety check (not for a better one): it rests 5 min. A verdict
	// near the limit flipped with every small change in the party's stats, and the leader walked between two spots
	// (72 changes in an hour, cgoo ↔ booboo, through the door between them).
	if (cur && !cur.boss && !cur.probe && !state.safe[cur.mtype] && best && pack_key(best) !== pack_key(cur))
		state.cooldown[pack_key(cur)] = Math.max(state.cooldown[pack_key(cur)] || 0, now + 300_000);
	set_pack(best, best && `→ ${best.mtype} x${Math.round(best.count)} @ ${best.map} (~${best.score.toFixed(0)} xp/s${meas()[pack_key(best)] ? " measured" : " est"})`);
}
// Patrol route: a 3x3 grid snaking through the area at 15%, 50% and 85% of its width/height, so the server shows us
// every part of the pack (it only sends entities near us) without hugging the edges
function make_waypoints([x1, y1, x2, y2]) {
	const pts = [];
	for (let r = 0; r < 3; r++) {
		const cols = r % 2 ? [2, 1, 0] : [0, 1, 2];
		for (const c of cols) pts.push({ x: x1 + (x2 - x1) * (0.15 + 0.35 * c), y: y1 + (y2 - y1) * (0.15 + 0.35 * r) });
	}
	return pts;
}

function party_holds(name) {
	if (held_any(name) > 0 || (state.bank_gear || []).some((i) => i.name === name)) return true;
	const M = state.merchant && fresh(state.merchant) ? [state.merchant] : [];
	return [...partners_any(), ...M].some((p) => Array.isArray(p.bag_gear) && p.bag_gear.includes(name));
}
// Send gold to one of our characters and tell it, so both sides leave the transfer out of their gold/h
function send_own_gold(name, g) {
	return T(send_gold(name, g)).then((r) => {
		stats.adj += g;
		log_ev("gold", { to: name, g });
		if (typeof send_cm === "function") Promise.resolve(send_cm([name], { k: "gold", g })).catch(() => {});
		return r;
	});
}
setInterval(() => {
	stats.samples.push({ t: Date.now(), xp: stats.xp, gold: character.gold + stats.adj });
	if (stats.samples.length > 61) stats.samples.shift();
}, 60_000);
// How many of the camp's monsters are in view when every one of them is over the limit (0: none in view, or one is takeable)
function camp_overgrown(pack) {
	let n = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.mtype !== pack.mtype || !valid(e) || !in_rect(e.x, e.y, [pack.boundary[0] - CFG.near_pad, pack.boundary[1] - CFG.near_pad, pack.boundary[2] + CFG.near_pad, pack.boundary[3] + CFG.near_pad])) continue;
		if (live_ok(e) || (grown_ok(e) && !hopeless(e))) return 0;
		n++;
	}
	return n;
}
// A target that loses no HP for 8s in range is ignored for 5 min (immune, healing, invulnerable)
function watch_progress(t) {
	const now = Date.now();
	// v24.62: holding fire for a missing member isn't a monster that takes no damage (each one in view got ignored for
	// 5 min, then the camp was dropped as idle)
	if (tank_first(t)) { state.prog = null; return false; }
	if (!is_in_range(t)) { if (state.prog && state.prog.id === t.id) state.prog.t = now; return false; }
	if (!state.prog || state.prog.id !== t.id) { state.prog = { id: t.id, hp: t.hp, t: now }; return false; }
	if (t.hp < state.prog.hp) { state.prog.hp = t.hp; state.prog.t = now; return false; }
	if (now - state.prog.t > 8000) {
		state.bad_ids[t.id] = now + 300_000;
		game_log(`No damage on ${t.mtype} in 8s; ignoring it for 5 min`, C.dim);
		state.prog = null;
		change_target(null);
		return true;
	}
	return false;
}
function patrol() {
	if (is_moving(character) || walking() || !state.waypoints.length) return;
	if (distance(character, state.waypoints[state.wp]) < 30) state.wp = (state.wp + 1) % state.waypoints.length; // reached
	const next = state.waypoints[state.wp];
	if (can_move_to(next.x, next.y)) move_to_as("patrol", next.x, next.y, 500); // patrol is low priority: a move per 500ms at most
	else travel_as("patrol", { map: state.pack.map, x: next.x, y: next.y });
}
// Leader/solo at a boss pack: fight it when in view, else walk to its last reported position
function boss_tick(pack) {
	boss_type = pack?.mtype || null;
	const e = Object.values(parent.entities || {}).find((x) => x.type === "monster" && x.mtype === pack.mtype && x.visible && !x.dead);
	// v24.4: something else hitting us on the way (or while we wait for the party) gets fought; we used to walk or stand
	// there taking hits until flee HP
	const hit = !e || !e.target ? choose_target(false) : null;
	if (hit && hit.mtype !== pack.mtype && hit.target === character.name) { state.last_target_at = Date.now(); fight(hit, true); return true; }
	if (e && !e.target && (party_missing().length || !boss_safe(pack.mtype, "party"))) { // judged with the whole party: wait for it before engaging
		state.last_target_at = Date.now();
		set_message(`BOSS ${pack.mtype}: waiting for the party (${partners_near().length}/${partners().length} here)`);
		return true;
	}
	if (e) {
		state.last_target_at = Date.now();
		fight(e, true);
		set_message(`BOSS ${pack.mtype} ${e.hp}/${e.max_hp} | ${character.esize} free`);
		return true;
	}
	const b = parent.S?.[pack.mtype];
	if (!b || b.live !== true) { state.last_pick = 0; return false; }
	if (!walking() && !errand_busy()) travel_as("boss_tick", { map: b.map, x: b.x, y: b.y });
	set_message(`→ BOSS ${pack.mtype} @ ${b.map}`);
	return true;
}
// Not leading (now): a probe we started is ours no more — it would later be closed as "held" (v24.3). Called from the
// follower branch.
function lead_lost() {
	if (state.probe && in_party_cfg() && leader_name() !== character.name) {
		const P = state.probe;
		log_ev("probe", { mtype: P.mtype, mins: Math.round((Date.now() - P.start) / 60_000), result: "dropped", why: "leader changed", ratio: null, n: 0, over: +(P.ratio || 0).toFixed(2) });
		state.probe = null;
	}
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
// ---- moved from common.js (v24.95): used by the fighters only ----
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
// Leader: end a running probe on time (success) or on trouble (failure)
function probe_check() {
	const P = state.probe;
	if (!P) return;
	const now = Date.now(), members = [character, ...partners()];
	const fled = !!state.recovering || partners().some((p) => p.recovering);
	const low = members.some((p) => p.max_hp && p.hp < p.max_hp * CFG.probe.abort_hp);
	const dead = !!character.rip || partners_any().some((p) => p.rip);
	const result = fled || low || dead ? "fail" : now >= P.until ? "ok" : null;
	if (!result) return;
	const c = state.calib[calib_key(P.mtype)];
	log_ev("probe", { mtype: P.mtype, mins: Math.round((now - P.start) / 60_000), result, why: dead ? "death" : fled ? "flee" : low ? "low hp" : "time",
		ratio: c ? +c.ratio.toFixed(2) : null, n: c?.n || 0, over: +P.ratio.toFixed(2) });
	skip("probe:" + P.mtype, (result === "ok" ? CFG.probe.win_cooldown_h : CFG.probe.fail_cooldown_h) * 3600_000, result);
	// v24.6: a probe that held widens the party verdict for that monster by the risk it held at (24h), for every fighter:
	// before, nothing changed — calibration isn't recorded under tank cover — so it was re-probed every 2h, never adopted
	if (result === "ok") { const mult = +Math.min(P.ratio * 1.05, CFG.probe.max_over * 1.05).toFixed(3); state.probe_ok[P.mtype] = { mult, at: now }; share_verdict({ kind: "probe_ok", mtype: P.mtype, mult }); }
	else { delete state.probe_ok[P.mtype]; share_verdict({ kind: "probe_fail", mtype: P.mtype }); }
	if (result === "fail" && !fled && !dead) incident(P.mtype, 0.8); // a flee/death already recorded its own incident
	game_log(`probe ${P.mtype}: ${result === "ok" ? "held for " + CFG.probe.minutes + " min" : "aborted (" + (dead ? "death" : fled ? "flee" : "low hp") + ")"}`, result === "ok" ? C.ok : C.warn);
	state.probe = null;
	state.last_pick = 0;
}
function gap_kind() {
	const pk = state.pack;
	if (character.rip || is_merchant() || !pk || !valid_boundary(pk.boundary)) return null;
	if (errand_busy() || walking() || character.map !== pk.map || !in_boundary(pk.boundary, 250)) return "away from the camp (walk, town)";
	const party = party_names(), b = pk.boundary, P_ = CFG.near_pad, box = [b[0] - P_, b[1] - P_, b[2] + P_, b[3] + P_];
	let alive = 0, on_us = 0;
	for (const id in parent.entities || {}) {
		const e = parent.entities[id];
		if (e?.type !== "monster" || e.dead || !e.visible) continue;
		if (e.target && party.has(e.target)) on_us++;
		else if (e.mtype === pk.mtype && !e.target && in_rect(e.x, e.y, box)) alive++;
	}
	const t = get_targeted_monster();
	if (on_us) return t && t.target && in_reach(t, "attack") ? "in a fight, target in reach" : "in a fight, no target in reach";
	if (!alive) return "nothing alive here (respawn)";
	if (is_follower()) return "monsters alive, waiting for the tank's first hit";
	if (!t) return "monsters alive, none chosen";
	if (tank_first(t)) return "monsters alive, holding for the party";
	return in_reach(t, "attack") ? "monsters alive, in reach, swing on cooldown" : "monsters alive, walking to the next one";
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
