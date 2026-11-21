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
