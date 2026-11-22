// =====================================================================
// fighter.js — loaded by the fighters only (after shared/, before main.js; src/manifest.json). What only a fighter does: follow the
// tank, heal, hand loot and gold to the merchant, its own token buys and upgrade projects, collecting what the
// merchant holds for it. Defaults for the merchant are in shared/15_hooks.js.
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
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
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
// ---- report() sections of the fighters (v24.96): called from report_facts in order; c = { p: state.pack, d: state.directive, now } ----
function facts_doing(F, ctx) {
	const { p, d, now } = ctx;
	const at_pack = !!p && character.map === p.map && in_boundary(p.boundary, 600);
	const why_ = p?.directive || (p ? `best xp/s (${p.score !== undefined ? p.score.toFixed(0) : "?"})` : "no safe pack");
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
		(none && !P ? ` | last check ${ago(none.at)} ago: no monster within x${CFG.probe.max_over} of the limit beats ${CFG.probe.min_gain}x the best ${none.best} xp/s` : "") +
		(last ? ` | last probe: ${last.mtype} ${last.result === "ok" ? "✓" : "✗ " + last.why} ${ago(last.t)} ago` : ""));
}

function facts_engage(F, ctx) {
	const { p, d, now } = ctx;
	if (!(together_now() && partners_any().length)) return;
	const miss = is_tank_class(character.ctype) ? party_missing() : null, tk = party_tank();
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
	F("picks", "self", `spot choice (${ago(state.pick_table_at || state.last_pick || Date.now())} ago): ` + T_.map((c) => `${c.mtype}@${c.map} ${Math.round(c.rate || c.m)}${c.m ? " measured" : " est"}` +
		(c.out ? ` ✗ ${c.out}` : `${Math.round(c.score) !== Math.round(c.rate) ? ` (${Math.round(c.score)} after the walk)` : ""}${c.key === cur ? " ← here" : ""}`)).join(" | "));
}

function facts_targets(F, ctx) {
	const { p, d, now } = ctx;
	if (!(p && character.map === p.map)) return;
	const party = party_names(), box = p.boundary, P_ = CFG.near_pad, c = { ok: 0, unsafe: [], far: 0, taken: 0, ignored: 0, wall: 0 };
	for (const id in parent.entities || {}) {
		const e = parent.entities[id];
		if (!e || e.type !== "monster" || e.mtype !== p.mtype || !e.visible || e.dead) continue;
		if ((state.bad_ids[e.id] || 0) > now) c.ignored++;
		else if (e.target && !party.has(e.target)) c.taken++;
		else if (!in_rect(e.x, e.y, [box[0] - P_, box[1] - P_, box[2] + P_, box[3] + P_])) c.far++;
		else if (!live_ok(e)) c.unsafe.push(e.level || 1);
		else { c.ok++; if (!(distance(character, e) <= character.range || can_move_to(e))) c.wall++; }
	}
	const n = c.ok + c.unsafe.length + c.far + c.taken + c.ignored;
	if (n) F("targets", "self", `targets: ${n} ${p.mtype} in view — ${c.ok} attackable${c.wall ? ` (${c.wall} behind a wall/water)` : ""}` +
		`${c.unsafe.length ? `, ${c.unsafe.length} levelled up past the limit — the tank takes them, lowest first, when nothing else is there (levels ${c.unsafe.sort((x, y) => x - y).join(",")})` : ""}` +
		`${c.far ? `, ${c.far} outside the spot (+${P_}px)` : ""}${c.taken ? `, ${c.taken} someone else's` : ""}${c.ignored ? `, ${c.ignored} ignored (no damage / unreachable)` : ""}`);
}

function facts_quests(F, ctx) {
	const { p, d, now } = ctx;
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
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
// ---- One party or nothing (v24.51) ----
const in_town = () => character.map === "main" && Math.hypot(character.x, character.y) < CFG.party.town_px;
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
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
const drop_rate = (mt, item) => (drop_sources(item).find(([m]) => m === mt) || [, 0])[1];
// Farm the quickest missing drop of the first open quest recipe (guide quests: no time/xp limits)
function quest_directive(guide_only) {
	if (!CFG.quest_farm || !CFG.quest_crafts) return null;
	for (const id of quest_recipes()) {
		const r = G.craft[id], guided = is_guide_quest(id);
		if (guided !== !!guide_only || !recipe_open(id)) continue;
		const missing = r.items.filter(([q, n, l]) => owned_in_bags_or_bank(n, l) < q);
		if (!missing.length || missing.some(([, n, l]) => l || GEAR.has(G.items[n]?.type))) continue;
		let total_s = 0, pickm = null;
		for (const [q, n, l] of missing) {
			const src = best_source(n);
			if (!src || !(src.ips > 0)) { total_s = Infinity; break; }
			const have = owned_in_bags_or_bank(n, l), secs = (q - have) / src.ips;
			total_s += secs;
			if (!pickm || secs < pickm.secs) pickm = { ...src, secs, item: n, have, need: q };
		}
		if (!pickm || (!guided && total_s > CFG.quest_farm_max_h * 3600)) continue;
		const f = fight_profile(pickm.monster);
		// xp/s at that pack (items/s ÷ chance per kill = kills/s; × xp per kill); 1e-9 avoids dividing by zero
		const qxp = meas_aged(pack_key(pickm), f ? f.xp * pickm.ips * party_n() / Math.max(1e-9, drop_rate(pickm.monster, pickm.item)) : 0);
		const bk = best_known_xps();
		if (!guided && bk > 0 && qxp < CFG.quest_farm_min_xp * bk) continue;
		const sk = id + ":" + pickm.item, now = Date.now();
		if (!state.qprog || state.qprog.key !== sk || pickm.have > state.qprog.have) state.qprog = { key: sk, have: pickm.have, t: now };
		else if (now - state.qprog.t > Math.max(CFG.quest_stall_min * 60_000, 3000 / Math.max(pickm.ips, 1e-9))) { // or 3 expected drops' time
			skip("qc:" + id, CFG.quest_shelve_h * 3600_000);
			game_log(`quest: no ${pickm.item} in ${CFG.quest_stall_min} min at ${pickm.monster}; retrying ${id} in ${CFG.quest_shelve_h}h`, C.bad);
			state.qprog = null;
			continue;
		}
		return { monster: pickm.monster, map: pickm.map, boundary: pickm.boundary, count: pickm.count, guide_safe: false,
			reason: `${guided ? "guide quest " : ""}${id}: ${pickm.item} ${pickm.have}/${pickm.need}, ~${Math.ceil(total_s / 60)} min` };
	}
	return null;
}
function hunt_directive() {
	const h = character.s.monsterhunt;
	if (!CFG.auto_monster_hunt || !h || !(h.c > 0) || !fight_profile(h.id) || !hunt_feasible(h)) return null;
	const best = resolve_area(h.id);
	return best && { monster: h.id, ...best, reason: `monster hunt ${h.c} left`, guide_safe: false };
}
// Leader: merge every online member's goal list. Mutual goals first: a monster on the lists of 2+ members, each with a
// goal there finishing within mutual_max_h; ranked by combined weight ÷ (1 + the slowest of those goals' hours), so
// goals shared by more members and quicker ones win. With nothing in common, members take turn_min-minute turns
// (us, then the others in name order) with their top goal. Only monsters the group can fight are considered.
function pick_shared(mine) {
	const now = Date.now(), me = character.name;
	const members = [{ name: me, goals: goals_list() }, ...partners().map((p) => ({ name: p.name, goals: [...(p.goals || [])] }))];
	const by = new Map(); // monster -> { w: {member: weight}, eta: {member: hours}, src, why, too_slow }
	for (const m of members) for (const g of m.goals) {
		const e = by.get(g.monster) || { monster: g.monster, w: {}, eta: {}, src: null, why: [], too_slow: [] };
		by.set(g.monster, e);
		const eh = g.eta_h ?? 0; // guide rows and older members: no estimate → treat as feasible
		if (eh > CFG.party.mutual_max_h) { e.too_slow.push(`${m.name}: ${g.reason} ~${Math.round(eh)}h`); continue; }
		e.w[m.name] = Math.max(e.w[m.name] || 0, g.w);
		e.eta[m.name] = Math.min(e.eta[m.name] ?? Infinity, eh);
		if (!e.src && valid_boundary(g.boundary)) e.src = g;
		e.why.push(`${m.name}: ${g.reason}${g.eta_h ? ` ~${g.eta_h}h` : ""}`);
	}
	const ok = (e) => G.monsters[e.monster] && (fight_profile(e.monster) || (e.src?.guide_safe && farmable_type(e.monster)));
	const names = (e) => Object.keys(e.w);
	const hours = (e) => Math.max(...names(e).map((n) => e.eta[n]));
	const weight = (e) => names(e).reduce((t, n) => t + e.w[n], 0);
	const to_dir = (e, label) => {
		const area = e.src ? resolve_area(e.monster, e.src.map, e.src.boundary, e.src.count) : resolve_area(e.monster);
		return area && { monster: e.monster, ...area, reason: label, guide_safe: !!e.src?.guide_safe, for_partner: !e.w[me], mutual: names(e).length > 1 };
	};
	const cands = [...by.values()].filter((e) => names(e).length && ok(e));
	// mutual only when the combined weight reaches a hunt's: two guide-farm rows (1+1) don't override members' hunts
	// an hour of walking counts as travel.weight_h hours of goal time: a near shared goal beats an equal far one
	const walk_h = (e) => { if (e.walk_h === undefined) { const a = e.src ? resolve_area(e.monster, e.src.map, e.src.boundary, e.src.count) : resolve_area(e.monster); e.walk_h = a ? travel_s(a.map, a.boundary) / 3600 : 0; } return e.walk_h; };
	const rank = (e) => weight(e) / (1 + hours(e) + walk_h(e) * CFG.travel.weight_h);
	const mutual = cands.filter((e) => names(e).length >= 2 && weight(e) >= CFG.goal_w.hunt).sort((a, b) => rank(b) - rank(a));
	state.shared = { mutual: mutual.map((e) => `${e.monster} ~${hours(e).toFixed(1)}h (${e.why.join("; ")})`),
		too_slow: [...by.values()].flatMap((e) => e.too_slow.map((w) => `${e.monster}: ${w}`)), at: now };
	if (mutual.length) return to_dir(mutual[0], `mutual: ${[...new Set(mutual[0].why)].slice(0, 3).join(" + ")}`);
	// nothing in common: turns, rotating through members that have a goal the group can fight
	const top = (n) => cands.filter((e) => e.w[n]).sort((a, b) => b.w[n] - a.w[n])[0];
	const order = [me, ...partners().map((p) => p.name).sort()].filter((n) => (n === me ? mine : top(n)));
	if (!order.length) return mine;
	// a turn's turn_min counts from arrival at its target (walking there isn't the turn), capped by turn_walk_max_min
	const d0 = state.directive;
	if (state.turn && !state.turn.arrived && d0 && d0.map === character.map && valid_boundary(d0.boundary) &&
		in_rect(character.x, character.y, [d0.boundary[0] - 200, d0.boundary[1] - 200, d0.boundary[2] + 200, d0.boundary[3] + 200])) {
		state.turn.arrived = now;
		state.turn.end = Math.min(state.turn.end, now + CFG.party.turn_min * 60_000);
	}
	if (!state.turn || now > state.turn.end || !order.includes(state.turn.who)) {
		const i = state.turn ? order.indexOf(state.turn.who) : -1;
		state.turn = { who: order[(i + 1) % order.length], end: now + (CFG.party.turn_min + CFG.travel.turn_walk_max_min) * 60_000 };
	}
	if (state.turn.who === me) return mine;
	const t = top(state.turn.who);
	return to_dir(t, `${state.turn.who}: ${t.why.find((w) => w.startsWith(state.turn.who + ":"))?.slice(state.turn.who.length + 2) || t.monster}`);
}
// The live boss we'd join (highest xp), from the server's event list
function live_boss() {
	if (!CFG.boss?.enabled || character.ctype === "merchant") return null;
	const S_ = (typeof parent !== "undefined" && parent.S) || {};
	let best = null;
	for (const name in S_) {
		const e = S_[name], m = G.monsters[name];
		if (!e || e.live !== true || !m || !e.map || !Number.isFinite(e.x) || !G.maps[e.map] || !map_ok(e.map) || CFG.boss.skip.includes(name)) continue;
		if (!boss_safe(name)) continue;
		if (!best || (m.xp || 0) > (G.monsters[best.name].xp || 0)) best = { name, map: e.map, x: e.x, y: e.y, hp: e.hp, max_hp: e.max_hp };
	}
	return best;
}
// Boundary on a 400px grid around the boss, so its wandering doesn't make a new "pack" every refresh
function boss_directive() {
	const b = live_boss();
	if (!b) return null;
	const gx = Math.round(b.x / 400) * 400, gy = Math.round(b.y / 400) * 400;
	return { monster: b.name, map: b.map, boundary: [gx - 300, gy - 300, gx + 300, gy + 300], count: 1, boss: true, guide_safe: false,
		reason: `event boss ${G.monsters[b.name].name || b.name} (${b.hp}/${b.max_hp})` };
}
// Decide the farm directive: hunt > own quests > guide quests > guide farm row (CFG.goal_w order).
// A guide farm row pauses (quest_shelve_h) when its material stops rising for quest_stall_min, or after
// guide_farm_max_min if it names no material. A party leader then merges both members' goals (pick_shared).
// The directive lasts 4 guide intervals (60s) unless refreshed, so a stale one expires on its own.
function refresh_directive() {
	const now = Date.now();
	let g = live_guide_farm();
	if (g) {
		const gk = `${g.monster}:${g.map}`, have = g.item ? held(g.item) : 0;
		if (!state.gprog || state.gprog.key !== gk || have > state.gprog.have) state.gprog = { key: gk, have, t: now };
		else {
			const limit = (g.item ? CFG.quest_stall_min : CFG.guide_farm_max_min) * 60_000;
			if (now - state.gprog.t > limit) {
				state.guide_ignore[gk] = now + CFG.quest_shelve_h * 3600_000;
				game_log(`guide: ${g.item ? "no " + g.item + " from" : "no end to"} ${g.monster} in ${Math.round(limit / 60_000)} min; pausing that row ${CFG.quest_shelve_h}h`, C.bad);
				state.gprog = null;
				g = null;
			}
		}
	}
	const gq = () => quest_directive(true), oq = () => quest_directive(false);
	let mine = null;
	for (const f of [boss_directive, hunt_directive, oq, gq, () => g]) if (!mine) mine = f();
	// A follower never picks where to fight, so the leader works both members' goals: mutual ones first, otherwise
	// turns (pick_shared).
	let d = mine;
	if (partners().length && in_party_cfg() && !is_follower() && !mine?.boss) d = pick_shared(mine) || mine; // a boss beats every goal
	// commitment: don't turn around on the way to (or right after reaching) a target because the goal ranking shifted
	const cur = state.directive, L = state.dir_lock;
	// a finished goal ends the commitment: the held monster must still be on someone's goal list
	const still_goal = (mt) => goals_list().some((g) => g.monster === mt) || partners().some((p) => (p.goals || []).some((g) => g.monster === mt));
	if (CFG.travel.commit_min > 0 && cur && d && !d.boss && !cur.boss && L && now < L.until && L.monster === cur.monster && (d.monster !== cur.monster || d.map !== cur.map) && still_goal(cur.monster) &&
		(state.safe[cur.monster] !== undefined ? !!state.safe[cur.monster] : !!fight_profile(cur.monster))) {
		if (!state.dir_held || state.dir_held.monster !== d.monster) state.dir_held = { monster: d.monster, reason: d.reason, at: now };
		d = cur;
	} else state.dir_held = null;
	if (d && (!cur || cur.monster !== d.monster || cur.map !== d.map)) {
		const a = valid_boundary(d.boundary) ? d : resolve_area(d.monster, d.map, d.boundary);
		state.dir_lock = { monster: d.monster, until: now + ((a ? travel_s(a.map, a.boundary) : 60) + CFG.travel.commit_min * 60) * 1000 };
	}
	if (d) {
		const changed = !state.directive || state.directive.monster !== d.monster || state.directive.map !== d.map;
		state.directive = { ...d, until: now + CFG.guide_interval_ms * 4 };
		if (changed) state.last_pick = 0;
	} else if (state.directive) {
		state.directive = null;
		state.last_pick = 0;
	}
}
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
// v19.7/v20.0: a worn piece of ours that's an upgrade for a member near: take it off and send it. The member wears it
// (equip_upgrades), its old piece drops into its bags and share_gear sends it back (our slot is empty), and we wear
// that. The receiver gains by the usual margins; we may lose up to gear_swap_loss of its gain (the party total goes
// up). The member with the alphabetically first name starts, so the two don't both send at once.
let swap_at = 0;
async function swap_worn() {
	if (!CFG.gear_auto || gear_busy || character.rip || is_merchant() || errand_busy() || typeof send_item !== "function" || typeof unequip !== "function") return false;
	if (Date.now() - swap_at < 60_000 || character.esize < 1) return false;
	const mine = my_gear(), sl = character.slots || {};
	for (const p of partners_near(CFG.gear_share_range)) {
		if (!p.worn || !p.gear?.w || (p.esize ?? 1) < 1) continue;
		for (const s of GEAR_SLOTS) {
			// v24.7: weapons/offhands too (priest and mage share staves, sources, misc offhands) — but no two-handers (the
			// offhand would have to come off first)
			const X = sl[s], Y = p.worn[s];
			if ((s === "mainhand" || s === "offhand") && X && Y && (is_2h(X.name, p.ctype) || is_2h(Y.name, character.ctype) || is_2h(X.name, character.ctype) || is_2h(Y.name, p.ctype))) continue;
			// v24.5: their piece must be free too (a locked one would stay in their bags and ours would be lost to them)
			if (!X || !Y || X.l || X.b || Y.l || (X.name === Y.name && (X.level || 0) === Y.level)) continue;
			if (!slots_for(Y.name, character.ctype, mine).includes(s) || !slots_for(X.name, p.ctype, p.gear).includes(s)) continue;
			const ours = slot_value(Y, character.ctype, mine, s) - (mine.w[s] || 0), theirs = slot_value(X, p.ctype, p.gear, s) - (p.gear.w[s] || 0);
			const ok = (gain, cur) => gain >= CFG.gear_min_gain && gain >= cur * CFG.gear_margin;
			// the receiver must gain by the usual margins; we may lose up to gear_swap_loss of that, so the party gains
			if (!ok(theirs, p.gear.w[s] || 0) || ours < -theirs * CFG.gear_swap_loss || !(ours + theirs >= 2 * CFG.gear_min_gain)) continue;
			// v24.7: the giver is whoever's partner gains (it equips what it's sent); when both gain, the earlier name gives.
			// Only the earlier name started before, checking only the other's gain: a swap where it should receive never ran
			if (character.name > p.name && ok(ours, mine.w[s] || 0)) continue;
			swap_at = Date.now();
			gear_busy = true;
			try {
				await T(unequip(s));
				const k = character.items.findIndex((i) => i && i.name === X.name && (i.level || 0) === (X.level || 0) && !i.l);
				if (k < 0) return false;
				await T(send_item(p.name, k, 1));
				game_log(`gear: swap — gave our ${s} ${X.name}+${X.level || 0} to ${p.name} (+${Math.round(theirs)} for it), its ${Y.name}+${Y.level} comes back (+${Math.round(ours)} for us)`, C.ok);
				log_ev("gear_swap", { with: p.name, slot: s, gave: `${X.name}+${X.level || 0}`, get: `${Y.name}+${Y.level}` });
				return true;
			} catch (e) { game_log(`gear: swap with ${p.name}: ${why(e)}`, C.dim); return false; } finally { gear_busy = false; }
		}
	}
	return false;
}
// The event to be at: live in the server's event list, and safe for us (its safe_from monster passes fight_math)
function event_live() {
	if (is_merchant() || character.rip) return null;
	for (const name in CFG.events || {}) {
		const ev = CFG.events[name];
		if (!ev.on || !ev_info(name)) continue;
		const sf = ev.safe_from && G.monsters[ev.safe_from];
		if (sf && !safe_enough(fight_math(sf), ev.safe_from)) continue;
		return name;
	}
	return null;
}
// ---- Stat scrolls on what we wear (CFG.stat_scroll, v24.77) ----
// Worn pieces with a Stat line and no stat on it: { slot, name, level, stat, scroll, q, cost, pts, ok, why }
function stat_scroll_list() {
	const C_ = CFG.stat_scroll, cs = class_stats(character.ctype);
	if (!C_?.enabled || is_merchant() || !cs) return [];
	const stat = cs.main, scroll = stat + "scroll", sg = G.items[scroll]?.g, out = [];
	if (!sg || G.items[scroll]?.type !== "pscroll") return [];
	for (const slot of GEAR_SLOTS) {
		const it = character.slots?.[slot], def = it && G.items[it.name];
		if (!def || !(def.stat > 0) || it.stat_type || it.l || it.b) continue;
		const q = [1, 10, 100, 1000][Math.max(0, item_grade(it))] || 9999, cost = q * sg;
		const pts = (def.stat + (it.level || 0) * (def.upgrade?.stat || 0)) * stat_weight(stat, character.ctype);
		const key = `stat:${it.name}:${it.level || 0}`;
		const why_ = skipped(key) ? `paused (${skip_why[key] || "?"})` : (it.level || 0) < (C_.min_level || 0) ? `only at +${C_.min_level} or higher` : cost > (C_.max_cost ?? Infinity) ? `${fmt_k(cost)} is over ${fmt_k(C_.max_cost)} for one piece` : !(pts > 0) ? "no points in it" : cost / pts > C_.max_gold_per_pt ? `${fmt_k(cost)} for +${pts.toFixed(1)} pts is over ${fmt_k(C_.max_gold_per_pt)}/pt`
			: character.gold - cost < CFG.gold_reserve || !gold_ok(cost) ? `gold (${fmt_k(cost)})` : null;
		out.push({ slot, name: it.name, level: it.level || 0, stat, scroll, q, cost, pts, key, ok: !why_, why: why_ });
	}
	return out.sort((a, b) => a.cost / Math.max(a.pts, 0.01) - b.cost / Math.max(b.pts, 0.01)); // cheapest per point first
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
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
let event_join_at = 0, event_logged = null;
// Leader and followers alike: join, then fight the event's monsters (they're cooperative, which normal targeting
// skips). Leaving: off the event map once it's over. Returns true when it took the tick.
function event_tick() {
	if (in_party_cfg() && !is_merchant()) return false; // v24.60: party fighters don't go to events (the tank joined alone; the others couldn't follow)
	const name = event_live(), now = Date.now();
	if (!name) {
		event_logged = null;
		if (character.map === "goobrawl" && !walking() && !errand_busy()) { travel_as("event_tick", { map: "main" }); return true; } // event over
		return false;
	}
	if (errand_busy() || state.recovering) return false;
	const ev = CFG.events[name];
	if (event_logged !== name) { event_logged = name; log_ev("event", { name }); game_log(`event: ${name} — joining`, C.info); }
	if (!event_here(name)) {
		if (now - event_join_at > 20_000 && typeof join === "function") {
			event_join_at = now;
			if (walking()) halt("event_tick");
			Promise.resolve(join(name)).catch((e) => game_log(`event ${name}: ${why(e)}`, C.dim));
		}
		set_message(`→ event ${name}`);
		return true;
	}
	const party = party_names();
	const ok = (e) => e.type === "monster" && valid(e) && (ev.targets.includes(e.mtype) || (e.mtype === ev.extra && boss_safe(ev.extra)));
	const t = Object.values(parent.entities || {}).filter(ok)
		.sort((a, b) => (party.has(b.target) ? 1 : 0) - (party.has(a.target) ? 1 : 0) || distance(character, a) - distance(character, b))[0];
	if (t) {
		state.last_target_at = now;
		fight(t, true);
		set_message(`event ${name}: ${t.mtype} ${t.hp}/${t.max_hp}`);
	} else {
		const e = ev_info(name);
		if (!walking() && Number.isFinite(e?.x) && e.map === character.map) move_to_as("event_tick", e.x, e.y, 1000);
		set_message(`event ${name}: waiting for spawns`);
	}
	return true;
}
// ---- the fighters' code-message kinds (v25.1): true = handled; on_cm_message (shared/13_party.js) calls this first ----
function fighter_cm(m) {
	if (m && m.message?.k === "tgt" && (CFG.party.members || []).includes(m.name) && fresh(state.partners[m.name])) {
		state.partners[m.name].target = m.message.id; // a member holding fire for us: hit this one now
		return true;
	}
	if (m && m.message?.k === "mhb" && m.name === CFG.merchant?.name) { state.merchant = { ...m.message, name: m.name, t: Date.now() }; return true; }
	if (m && m.message?.k === "verdict" && (CFG.party.members || []).includes(m.name) && m.name !== character.name) { apply_verdict(m.message, m.name); return true; }
	if (m && m.message?.k === "ptown_off" && (CFG.party.members || []).includes(m.name) && m.name !== character.name) { if (state.ptown && !errand_busy()) state.ptown = null; return true; }
	if (m && m.message?.k === "ptown" && (CFG.party.members || []).includes(m.name) && m.name !== character.name) { ptown_recv(m.message, m.name); return true; }
	if (m && m.message?.k === "bill" && m.name === CFG.merchant?.name && !is_merchant()) { // potions it handed us (v23.0)
		const g = Math.max(0, Math.round(+m.message.g || 0));
		state.owe = (state.owe || 0) + g;
		log_ev("bill", { g, what: m.message.what || "" });
		return true;
	}
	return false;
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
// A party tank (paladin/warrior) near enough to take aggro: version-matched, alive, not on an errand, sturdier than us
function tank_cover(pool = partners_near(300)) {
	if (!CFG.party.tank_first || !in_party_cfg() || CFG.gear_tank.includes(character.ctype)) return null;
	// v24.24: any version (a rollout with mixed versions turned tanking off for everyone)
	return pool.find((p) => CFG.gear_tank.includes(p.ctype) && !p.errand && p.max_hp > character.max_hp && Number.isFinite(p.armor)) || null;
}
// Our share of the bank's copies of a quest material (v23.1). The bank is account-wide and every fighter runs the same
// own quests, so each used to count all of it toward its own copy. Copies go to the fighters short of the item (bags
// vs what they need; each one's shortfall comes in its heartbeat) in name order, so all agree. The merchant counts all.
const qshort = () => { const o = {}; for (const [n, q] of state.needs) if (G.items[n]?.s) { const v = q - held_any(n); if (v > 0) o[n] = v; } return o; };
// Our party-fight calibration ratios (20+ fights), for the leader's verdicts under our cover (tanks only, v24.6)
function calp_share() {
	const o = {};
	for (const k in state.calib) if (k.endsWith("@p") && state.calib[k].n >= CALIB_MIN_N) o[k.slice(0, -2)] = +state.calib[k].ratio.toFixed(3);
	return o;
}
function apply_verdict(v, from) {
	if (!v || !G.monsters[v.mtype]) return;
	if (v.kind === "incident" && v.mult > 0 && v.mult < 1) {
		incident(v.mtype, v.mult);
		if (v.key && v.cd > Date.now()) state.cooldown[v.key] = Math.max(state.cooldown[v.key] || 0, Math.min(v.cd, Date.now() + 3600_000));
		if (v.death) delete state.probe_ok[v.mtype];
		log_ev("verdict", { from, kind: v.kind, mtype: v.mtype, mult: v.mult });
	} else if (v.kind === "probe_ok" && v.mult >= 1 && v.mult <= (CFG.probe?.max_over || 2) * 1.1) {
		state.probe_ok[v.mtype] = { mult: v.mult, at: Date.now() };
		log_ev("verdict", { from, kind: v.kind, mtype: v.mtype, mult: v.mult });
	} else if (v.kind === "probe_fail") delete state.probe_ok[v.mtype];
}
// Status message to the other members every beat_ms: position, HP, target, pack, errand, combat stats (for the
// fight model), hunt, goals and gold. Skipped while the call budget is tight.
function heartbeat() {
	if (!in_party_cfg() || typeof send_cm !== "function") return;
	const t = get_targeted_monster(), p = state.pack;
	const msg = { k: "hb", v: VERSION, b: BUILD, tn: is_follower() && !errand_busy() ? town_urgent(town_due()) || null : null, lw: travel_long() ? 1 : 0, pt: state.ptown?.joined ? { id: state.ptown.id, done: !!state.ptown.done } : Date.now() - (state.ptown_done_at || 0) < 6000 ? { done: true } : null, xpm: xp_mult(), grp_wait: state.group_wait?.who && !(state.group_wait.go_until > Date.now()) ? state.group_wait.who : null, calp: CFG.gear_tank.includes(character.ctype) ? calp_share() : null, safety_mult: state.safety_mult || 1, qshort: qshort(), bag_lv: bag_gear_levels(), ledger: my_ledger(), bag_gear: bag_gear_names(), level: character.level, ctype: character.ctype, map: character.map,
		x: Math.round(character.x), y: Math.round(character.y), hp: character.hp, max_hp: character.max_hp, rip: !!character.rip,
		target: t && !t.dead ? t.id : null, pack: p ? { mtype: p.mtype, map: p.map, boundary: p.boundary, directive: p.directive, probe: !!p.probe } : null, recovering: !!state.recovering,
		errand: errand_busy() ? state.errand : null, attack: character.attack, frequency: character.frequency,
		damage_type: character.damage_type || G.classes[character.ctype]?.damage_type, apiercing: character.apiercing || 0,
		rpiercing: character.rpiercing || 0, range: character.range,
		hunt: character.s.monsterhunt?.c > 0 ? { id: character.s.monsterhunt.id, c: character.s.monsterhunt.c } : null,
		// our own top goal (a follower's directive is always its own; a leader's may be the partner's, so skip those)
		goals: goals_list().sort((a, b) => b.w - a.w).slice(0, 12),
		gold: character.gold, gold_xfer_at: state.gold_xfer_at || 0,
		party: Object.keys(get_party() || {}), // who we're in a game party with (invites use it)
		gear: CFG.gear_auto ? my_gear() : null, esize: character.esize, // hand-me-downs (share_gear)
		worn: CFG.gear_auto ? worn_items() : null, // swap_worn: what's in each slot
		armor: character.armor, resistance: character.resistance, // tank_first fight model
		pots: { hp: pot_count("hp"), mp: pot_count("mp") }, rates: rates(), h1: last_hour(), // merchant service, report
		mp: character.mp, max_mp: character.max_mp, tokens: held_any("monstertoken"), need: hold_missing() };
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
	const pk = state.pack, spawn = pk && (G.maps[pk.map]?.monsters || []).filter((x) => x.type === pk.mtype).reduce((a, x) => a + (x.count || 0), 0), rs = pk && G.monsters[pk.mtype]?.respawn;
	const cap = spawn && rs > 0 ? ` | the map has ${spawn} ${pk.mtype}, respawn ${rs}s: at most ${Math.round(spawn * 3600 / rs)} kills/h for the party` : "";
	return `camp time (${Math.round(tot / 60_000)} min): ` + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / tot * 100)}%`).join(" | ") + cap;
}
// Farm our own monster hunt's target if we can fight it safely
// A hunt that can't be finished before it expires (h.ms left) isn't worth chasing: let it lapse and take a new one
// (v18.6: a 417-bee hunt pulled the party onto bees at half the xp/s of croc for hours). Party kills count, so the
// party's rate is estimated as ours × (1 + 0.6 per member near).
// xp/s we'd get at a monster's best area (measured if we've been there, else estimated)
function mt_xps(mt) {
	let best = 0;
	const tab = meas();
	const fa = fight_profile(mt);
	// v24.6: aged like spot picks (meas_aged)
	each_area((pack, area) => {
		if (pack.type !== mt || tab[pack_key(area)] === undefined) return;
		const est = fa ? fa.xp * Math.min(1 / (fa.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack)) * state.realism : tab[pack_key(area)];
		best = Math.max(best, meas_aged(pack_key(area), est));
	});
	if (best) return best;
	const f = fa;
	return f ? kills_per_s(mt) * (f.xp || G.monsters[mt]?.xp || 0) : 0;
}
// The best xp/s we know of: this pick's best, or the best measured pack
// v23.6: this pick's best (safe and not cooling down now); only a member that doesn't pick (a follower) falls back to the
// best rate measured — the max over every measured spot included ones now unsafe or on cooldown and raised the bar
// v24.3: our own pick's best counts only if it was made in the last 10 min (a follower never picks). Otherwise: the
// best spot, computed (cached 60s).
const best_known_xps = () => {
	const now = Date.now();
	if (state.best_score > 0 && now - (state.best_at || 0) < 600_000) return state.best_score;
	const c = state.best_ref;
	if (c && now - c.at < 60_000) return c.v;
	const v = best_score() || Math.max(0, ...Object.values(meas() || {}).filter(Number.isFinite));
	state.best_ref = { at: now, v };
	return v;
};
function hunt_feasible(h) {
	if (!h || !(h.c > 0)) return false;
	// v18.7: a low-end monster (under hunt_min_xp of the best we know) doesn't trap the party; kills there still count
	const best = best_known_xps();
	if (CFG.hunt_min_xp > 0 && best > 0 && mt_xps(h.id) < CFG.hunt_min_xp * best) return false;
	if (!(h.ms > 0)) return true; // no expiry known
	// v24.3: kills_per_s is already the party's rate (party table, or an estimate with the members counted); adding
	// 0.6 per member near counted them twice and kept hunts that needed twice the real kill rate
	const kps = kills_per_s(h.id);
	return kps > 0 && h.c / kps * 1000 <= h.ms * 0.9;
}
// Kills per second we'd manage at the best spawn area of a monster (measured if we've been there); 0 if unsafe
function kills_per_s(mt) {
	const f = fight_profile(mt);
	if (!f) return 0;
	let best = 0;
	each_area((pack, area) => {
		if (pack.type !== mt) return;
		const est = Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack)) * state.realism;
		const kps = meas_aged(pack_key(area), est * Math.max(1, f.xp)) / Math.max(1, f.xp); // v24.6: aged
		best = Math.max(best, kps);
	});
	return best;
}
// Every monster worth farming for this character, weighted by CFG.goal_w (monster hunt, own-quest material,
// guide-quest material, guide farm row). eta_h = estimated hours to finish at our
// kill rate. Shared with the partner in the heartbeat; recomputed at most every 10s (it scans every map).
function goals_list() {
	const out = [], now = Date.now();
	if (state.goals_cache && now - state.goals_cache.at < 10_000) return state.goals_cache.list;
	const W = CFG.goal_w, g = live_guide_farm();
	if (g) out.push({ monster: g.monster, w: W.guide_farm, reason: g.reason, map: g.map, boundary: g.boundary, count: g.count, guide_safe: !!g.guide_safe });
	const h = character.s.monsterhunt;
	const eta = (n, per_kill, mt) => { const k = kills_per_s(mt) * per_kill; return k > 0 ? +(n / k / 3600).toFixed(2) : Infinity; };
	if (CFG.auto_monster_hunt && h?.c > 0 && hunt_feasible(h)) out.push({ monster: h.id, w: W.hunt, reason: `monster hunt ${h.c} left`, eta_h: eta(h.c, 1, h.id) });
	// v24.3: own-quest goals get quest_directive's rules here too (at least quest_farm_min_xp of the best xp/s, done within
	// quest_farm_max_h): this list goes to the leader, whose shared pick (mutual goals, turns) used it unfiltered and
	// took the party to low-xp quest monsters the floor was meant to keep it off
	const bk = best_known_xps();
	if (CFG.quest_farm && CFG.quest_crafts) for (const id of quest_recipes()) {
		if (!recipe_open(id)) continue;
		const guided = is_guide_quest(id);
		for (const [q, n, l] of G.craft[id].items) {
			const have = owned_in_bags_or_bank(n, l);
			if (l || GEAR.has(G.items[n]?.type) || have >= q) continue;
			for (const [mt, rate] of drop_sources(n)) if (farmable_type(mt)) {
				const eh = eta(q - have, rate / party_n(), mt); // v24.6: drops go to a random member (as best_source counts)
				if (!guided && (eh > CFG.quest_farm_max_h || (bk > 0 && mt_xps(mt) < CFG.quest_farm_min_xp * bk))) continue;
				out.push({ monster: mt, w: guided ? W.guide_quest : W.quest, reason: `${id}: ${n} ${have}/${q}`, eta_h: eh });
			}
		}
	}
	state.goals_cache = { at: now, list: out };
	return out;
}
// The guide's farm row if it's current, not paused and not outlevelled (guide_farm_min_xp; a row we can't measure,
// e.g. a monster we can't fight but the guide calls safe, is kept)
function live_guide_farm() {
	const g = state.guide_farm, now = Date.now();
	if (!g || !(g.until > now) || (state.guide_ignore[`${g.monster}:${g.map}`] || 0) > now) return null;
	const f = fight_profile(g.monster), gxp = f ? kills_per_s(g.monster) * f.xp : null;
	if (gxp !== null && best_known_xps() > 0 && gxp < CFG.guide_farm_min_xp * best_known_xps()) return null;
	return g;
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
	if (sk.length) L(`  skipped as dangerous at the last pick: ${sk.slice(0, 6).map(([k, w]) => `${k.split(":")[0]} (${w})`).join("; ")}`);
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
// ---- a parked fighter fights back with its full combat (v25.4; park_tick → fight_back) ----
function fighter_fight_back() {
	const t = choose_target(false);
	if (t && !character.c.town) { fight(t, false); return true; }
	return false;
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
function farmable_entity(e) {
	return e && e.type === "monster" && e.visible && !e.dead && !e.npc && !e.immune && !e.peaceful &&
		farmable_type(e.mtype) && !((state.bad_ids[e.id] || 0) > Date.now());
}

const tank_hold = { id: null, at: 0 }; // the monster we last told the tank about
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
// The party's tank (the first in the order warrior, paladin; alive and online), or null — never ourselves
function party_tank() {
	if (!together_now() || is_tank_class(character.ctype)) return null;
	return partners_any().find((p) => is_tank_class(p.ctype) && !p.rip) || null;
}
function hold_for_tank(t) {
	const tank = party_tank();
	if (!tank || !tank_first(t)) return false;
	if (tank_hold.id !== t.id) {
		tank_hold.id = t.id; tank_hold.at = Date.now();
		if (typeof send_cm === "function") Promise.resolve(send_cm([tank.name], { k: "tgt", id: t.id })).catch(() => {});
	}
	return true;
}
// Live-stat check per entity: monsters level up when left alive, and an elite can be several times stronger than its
// G.monsters entry. Verdicts are cached per entity id and recomputed when its level/HP/attack changes.
const live_cache = new Map(); // entity id -> { key, ok, ttk, xp }; trimmed to 500 entries (oldest first)
function entity_profile(e) {
	const key = `${fight_mates().map((p) => p.name).join()}:${e.level || 1}:${e.max_hp}:${e.attack}`; // re-judged when who counts changes
	const c = live_cache.get(e.id);
	if (c && c.key === key) return c.ok ? c : null;
	const def = G.monsters[e.mtype];
	const live = {};
	for (const k of ["hp", "max_hp", "attack", "frequency", "armor", "resistance", "speed", "xp", "1hp", "level"]) if (e[k] !== undefined) live[k] = e[k];
	const f = def && fight_math({ ...def, ...live, hp: e.max_hp || def.hp, charge: Math.max(def.charge || 0, e.speed || 0) });
	const ok = safe_enough(f, e.mtype);
	const out = { key, ok, ttk: f ? f.ttk : Infinity, xp: e.xp || def?.xp || 0 };
	live_cache.set(e.id, out);
	if (live_cache.size > 500) live_cache.delete(live_cache.keys().next().value);
	return ok ? out : null;
}
function live_ok(e) {
	const f = state.safe[e.mtype];
	if (!f) return null;
	if (f.trusted && !((e.level || 1) > 1)) return f; // guide-judged safe and not levelled up: trust it
	if (f.probe) return f; // probing this monster on purpose
	const lf = entity_profile(e);
	return lf ? { ttk: lf.ttk, xp: lf.xp } : null;
}

const can_take = (e) => !!(state.safe[e.mtype] ? live_ok(e) : fight_profile(e.mtype));
// Step away from a monster (it's slower than us): ~120px straight away, or sideways if that's blocked
function step_away(e) {
	if (!e || !Number.isFinite(e.x)) return false;
	const p = best_escape(e, 140);
	return p ? move_to_as("step_away", p.x, p.y, 300) : false;
}
// v24.23: where to move away from a monster: of 12 directions around us, the ones we can walk (and keep walking another
// `step` beyond — not into a dead end), the one ending farthest from it. Straight away and ±45/90° only, a party backed
// against a cliff stood still and face-tanked with open ground beside it; this also slips out sideways or past it.
function best_escape(t, step) {
	const cm = typeof can_move === "function" ? can_move : null;
	let best = null;
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
		const x = character.x + dx * step, y = character.y + dy * step;
		if (!can_move_to(x, y)) continue;
		const open = !cm || cm({ map: character.map, x, y, going_x: x + dx * step, going_y: y + dy * step, base: character.base });
		const v = Math.hypot(x - t.x, y - t.y) + (open ? step : 0);
		if (!best || v > best.v) best = { x, y, v };
	}
	return best;
}
// v24.59: a levelled-up monster of the camp's type is taken as a last resort only if the fight model, on its live
// stats and without the calibration and penalty factors, puts it within grown_over x the party's limit. Eight level-10
// cgoo (the type's level-1 stats had passed) were far beyond that and killed the party.
function grown_ok(e) {
	const def = G.monsters[e.mtype];
	if (!def) return false;
	const live = {};
	for (const k of ["hp", "max_hp", "attack", "frequency", "armor", "resistance", "speed", "level"]) if (e[k] !== undefined) live[k] = e[k];
	const f = fight_math({ ...def, ...live, hp: e.max_hp || def.hp });
	return !!f && fight_risk(f) <= (f.hp_pool || character.max_hp) * CFG.safety * heal_mult(f) * CFG.grown_over; // (v24.64: v24.63's kill-time limit here is gone)
}
function choose_target(local_ok, keep_cur = false) {
	const party = party_names();
	let hitting = null, hd = Infinity;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || !e.visible || e.dead || !e.target || !party.has(e.target)) continue;
		if ((state.bad_ids[e.id] || 0) > Date.now() || hopeless(e)) continue; // v24.44: nothing to gain from an ent
		const d = distance(character, e) - (e.target === character.name ? 10_000 : 0); // ours always before a partner's
		if (d < hd) (hd = d), (hitting = e);
	}
	if (hitting) return hitting;
	// v24.4: targets come from the pack area plus near_pad px only. Anything visible (700px) used to qualify inside the
	// area, but once the chase crossed the 250px margin only attackers did: the leader walked out toward a monster, lost
	// it, walked back, picked it again — without end. keep_cur: outside the margin, a target picked under this rule stays
	const box = state.pack && character.map === state.pack.map && valid_boundary(state.pack.boundary) ? state.pack.boundary : null, P_ = CFG.near_pad;
	const near_box = (e) => !box || in_rect(e.x, e.y, [box[0] - P_, box[1] - P_, box[2] + P_, box[3] + P_]);
	const cur = get_targeted_monster();
	if (!local_ok) return keep_cur && cur && near_box(cur) && farmable_entity(cur) && valid(cur) && !(cur.target && !party.has(cur.target)) && live_ok(cur) ? cur : null;
	const want = state.pack?.mtype;
	let best = null, best_v = 0, best_tier = 2, best_clear = false; // tier 0 = the pack's own monster, 1 = anything else
	let grown = null; // v24.56: the camp's own type, over the per-monster limit (levelled up): the last resort
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (!farmable_entity(e) || !valid(e) || (e.target && !party.has(e.target)) || !near_box(e)) continue;
		const f = live_ok(e);
		if (!f) {
			// lowest level first, then nearest; never one the party couldn't kill at all
			if (e.mtype === want && !hopeless(e) && grown_ok(e) && (!grown || (e.level || 1) < (grown.level || 1) ||
				((e.level || 1) === (grown.level || 1) && distance(character, e) < distance(character, grown)))) grown = e;
			continue;
		}
		// v24.64: the tank starts a fight on its camp's monster only. Another type nearby used to be taken on a
		// projected kill time (max_ttk_s); what attacks a member is fought above, whatever it is.
		if (want && e.mtype !== want) continue;
		const tier = e.mtype === want ? 0 : 1;
		if (tier === 1 && f.ttk * (e.hp / e.max_hp) > CFG.max_ttk_s) continue;
		if (tier > best_tier) continue;
		const walk_s = Math.max(0, distance(character, e) - character.range) / Math.max(character.speed, 1);
		// xp per second of effort (remaining fight + walk + 0.2s turnaround); the current target gets ×1.5 so we
		// finish it instead of flipping between similar targets
		const v = (e.xp || f.xp || 1) / (f.ttk * (e.hp / e.max_hp) + walk_s + 0.2) * (e === cur ? 1.5 : 1);
		// v24.37: a monster with no straight walking line (water, a ledge: level2s' cgoo pool) used to be skipped — with
		// targets all around, the leader found "nothing" and patrolled. In reach already, or with a clear line: first
		// choice; the others are taken when there's none of those (approach path-finds round to them).
		const clear = distance(character, e) <= character.range || can_move_to(e);
		if (tier < best_tier || (clear && !best_clear) || (clear === best_clear && v > best_v)) (best = e), (best_v = v), (best_tier = tier), (best_clear = clear);
	}
	// v24.56 (owner): a camp whose monsters have all levelled up past the limit isn't stood at — the tank works them
	// down, lowest level first, when nothing that passes is there. (The camp was chosen on the type's level-1 stats;
	// Torlis stood among five level 8-9 poisio, "0 attackable".)
	return best || grown;
}
// One distance used by both approach and kite, so they can't push against each other:
//   keep  = the monster's reach + kite_margin (closer than this, it can hit us)
//   reach = 90% of our range (a little inside it, so position jitter doesn't take us out of range)
//   want  = halfway between the two when we can kite (needs a 10px gap and at least its speed), else 80% of our range
function standoff(t) {
	const keep = (G.monsters[t.mtype]?.range || t.range || 0) + CFG.kite_margin;
	const reach = character.range * 0.9;
	const can_kite = RANGED && keep < reach - 10 && character.speed >= (t.speed || 0);
	return { keep, reach, can_kite, want: can_kite ? (keep + reach) / 2 : character.range * 0.8 };
}
// The point `dist` from t on the line t → us, rotated by ang_off radians
function point_at(t, dist, ang_off = 0) {
	const ang = Math.atan2(character.y - t.y, character.x - t.x) + ang_off;
	return { x: t.x + Math.cos(ang) * dist, y: t.y + Math.sin(ang) * dist };
}
function kite(t) {
	const so = standoff(t);
	if (!so.can_kite || t.target !== character.name || distance(character, t) >= so.keep) return false;
	// v24.23: the open direction that ends farthest from it (best_escape), far enough to get back to `want`
	const p = best_escape(t, Math.max(80, so.want - distance(character, t) + 40));
	if (p) { move_to_as("kite", p.x, p.y, 250); return true; } // kiting may re-steer every 250ms
	return false;
}
function approach(t) {
	const so = standoff(t);
	if (distance(character, t) <= so.reach) return;
	const p = point_at(t, so.want);
	if (can_move_to(p.x, p.y)) { approach_path = null; move_to_as("approach", p.x, p.y, 400); } // re-steer at most every 400ms while closing in
	else if (can_move_to(t.x, t.y)) { approach_path = null; move_to_as("approach", t.x, t.y, 400); } // only the standoff point is blocked: straight at it
	// v24.32: a wall between us (a ledge above the monster's pool): walking straight at it ran us into the corner, where we
	// stood for good. Path-find to it; break_walk_for leaves that walk alone until we can reach it or see a clear line.
	else {
		// v24.37: no way round within 10s (an island, the far bank): leave it alone for 2 min
		const now = Date.now(), d = distance(character, t);
		if (approach_try.id !== t.id || d < approach_try.d - 30) approach_try = { id: t.id, at: now, d };
		else if (now - approach_try.at > 10_000) {
			state.bad_ids[t.id] = now + 120_000; approach_path = null;
			return void game_log(`can't get to that ${t.mtype}; leaving it for 2 min`, C.dim);
		}
		approach_path = t.id; travel_as("approach", { map: character.map, x: t.x, y: t.y });
	}
}
let approach_try = { id: null, at: 0, d: 0 };
let approach_path = null; // id of the target we're path-finding around a wall to
// v24.8: in range for a skill (the server refuses "too_far" without a cooldown, so out of range it was re-sent every reply)
const in_reach = (t, skill) => (typeof is_in_range === "function" ? is_in_range(t, skill) : distance(character, t) <= (G.skills[skill]?.range || character.range));
// Class skills, used alongside attacks. Returns true when the skill replaces this tick's attack (priest heals share
// the attack cooldown). Thresholds: ranger marks targets worth >3 of its attacks; paladin self-heals below 50% HP
// and smashes targets worth >2 attacks; mage energizes below 50% MP.
function class_skills(t) {
	switch (character.ctype) {
		case "ranger":
			if (t.hp > character.attack * 3 && !t.s?.marked && can_use("huntersmark")) fire("huntersmark", t);
			else if (can_use("supershot")) fire("supershot", t);
			break;
		case "priest":
			if (party_heal()) return true; // heal shares the attack cooldown
			// dark blessing (level 70): +25% damage for every member within 600px for 8s, 60s cooldown: on a target
			// worth it (5+ of our hits) with someone else near
			if (G.skills.darkblessing && can_use("darkblessing") && !character.s?.darkblessing && t.hp > character.attack * 5 &&
				partners_near(G.skills.darkblessing.range || 600).length) fire("darkblessing");
			// absorb: pull every monster on a squishy member (not the tank) below 70% HP onto us, while we're healthy
			if (can_use("absorb") && character.hp > character.max_hp * 0.6) {
				const ents = Object.values(parent.entities || {});
				const victim = others().map((n) => parent.entities?.[n]).find((e) => e && !e.rip && valid(e) &&
					!CFG.gear_tank.includes(e.ctype) && e.hp < e.max_hp * 0.7 && distance(character, e) < (G.skills.absorb?.range || 240) &&
					ents.some((m) => m.type === "monster" && m.target === e.name));
				if (victim) fire("absorb", victim);
			}
			// curse (400 MP, +20% damage taken for 5s): only on a target with 5+ of our party's hits left, and MP above half
			if (!t.s?.cursed && t.hp > character.attack * 5 && character.mp > character.max_mp * 0.5 && can_use("curse") && in_reach(t, "curse")) fire("curse", t);
			break;
		case "paladin": {
			// mana shield: below 50% HP with MP to spare, damage comes out of MP (1.5 dmg per MP until 200 MP left);
			// off again once HP is back or MP runs low (smash/selfheal need it)
			const ms = !!character.s?.mshield;
			if (G.skills.mshield && can_use("mshield") && (ms ? character.mp < 250 || character.hp > character.max_hp * 0.85
				: character.hp < character.max_hp * 0.5 && character.mp > 400)) fire("mshield");
			if (character.hp < character.max_hp * 0.5 && can_use("selfheal")) fire("selfheal");
			else if (G.skills.purify && t.hp >= 1500 && character.mp > (G.skills.purify.mp || 360) + 200 && can_use("purify")) fire("purify", t);
			// purify (level 60): 2000 pure damage (ignores armour) every 24s, on targets with that much HP left
			// v24.4: smash is 0.36 x attack for 380 MP every 320ms (and needs a mace): unchecked, it emptied the bar in a
			// second and sustain() refilled it with MP potions (~30/min). Only from MP above smash_mp_floor of max, so it
			// spends natural regen and never potions, and keeps MP for mshield/selfheal/purify
			else if (t.hp > character.attack * 2 && character.mp > character.max_mp * CFG.smash_mp_floor + (G.skills.smash?.mp || 380) &&
				G.items[character.slots?.mainhand?.name]?.wtype === "mace" && can_use("smash") && in_reach(t, "smash")) fire("smash", t);
			break;
		}
		case "warrior":
			if (!character.s.warcry && can_use("warcry")) fire("warcry");
			break;
		case "mage": {
			// burst: all MP as one hit (MP × ratio, 6s cooldown) on a target that can soak most of it, when we're nearly
			// full and carry MP potions to refill
			const ratio = G.skills.burst?.ratio || 0.555;
			if (G.skills.burst && can_use("burst") && character.mp >= character.max_mp * 0.9 && t.hp >= character.mp * ratio * 0.6 &&
				pot_count("mp") >= CFG.pot_min && in_reach(t, "burst")) return fire("burst", t), true;
			if (cburst()) return true;
			if (!can_use("energize")) break;
			// the party member lowest on mana (below 40%) within range, else ourselves below 50%. A priest's heals run
			// on mana, so in a party this mostly keeps the healer going.
			const range = G.skills.energize?.range || 320;
			const low = others().map((n) => parent.entities?.[n]).filter((e) => e && !e.rip && valid(e) && e.max_mp &&
				e.mp < e.max_mp * 0.4 && distance(character, e) < range).sort((a, b) => a.mp / a.max_mp - b.mp / b.max_mp)[0];
			// v24.4: with no amount the server moves up to 10000 MP — all of ours. Give what they're missing, keeping 40%
			const give = low ? Math.min(low.max_mp - low.mp, Math.floor(character.mp - character.max_mp * 0.4)) : 0;
			if (low && give >= 100) fire("energize", low, give);
			// v24.8: on ourselves it moves no MP (server: same object) — the old "refill below 50%" did nothing but spend
			// the cooldown; its side effect, high attack speed, is the point: whenever no partner needs mana
			else if (!low) fire("energize", character);
			break;
		}
		case "rogue":
			if (!character.s.rspeed && can_use("rspeed")) fire("rspeed", character);
			break;
	}
	return false;
}
// Mage 75+: cburst splits MP across up to 12 monsters in range (damage = MP x ratio each). Only monsters already in our
// fight: hitting a party member, or the pack's type and safe for us (it aggroes everything it hits). Each target gets
// what it needs to die (lowest HP first) until the MP above 25% is spent; worth it from 3 targets.
function cburst() {
	const sk = G.skills.cburst;
	if (!sk || !can_use("cburst") || character.mp < character.max_mp * 0.5) return false;
	const party = party_names(), want = state.pack?.mtype;
	const dm = (d) => (typeof damage_multiplier === "function" ? damage_multiplier(d) : Math.max(0.05, 1 - d / 1000));
	const hits = Object.values(parent.entities || {}).filter((e) => e.type === "monster" && valid(e) && distance(character, e) < character.range &&
		!hopeless(e) && ((e.target && party.has(e.target)) || (e.mtype === want && !e.target && live_ok(e) && !tank_first(e)))).sort((a, b) => a.hp - b.hp);
	if (hits.length < 3) return false;
	let budget = character.mp - character.max_mp * 0.25;
	const targets = [];
	for (const e of hits.slice(0, 12)) {
		const need = Math.ceil(e.hp / ((sk.ratio || 0.5) * dm((e.resistance || 0) - (character.rpiercing || 0))) * 1.1);
		const mp = Math.min(need, Math.floor(budget));
		if (mp < 50) break;
		targets.push([e.id, mp]);
		budget -= mp;
	}
	if (targets.length < 3 || !can_spend(1, RESERVE.skill)) return false;
	return fire("cburst", targets);
}
// A walk (smart_move) in progress blocks approach(): stop it when a fight is right here — a target within 300px (on the
// way to a boss: only one attacking one of us). Never during errands.
// travel() treats the resulting "interrupted" as normal (no retry block).
function break_walk_for(t) {
	if (!walking() || !t || distance(character, t) > 300) return false;
	if (errand_busy() && !state.lead_walk) return false; // a town walk interrupted would fail (and pause) that errand step
	if (approach_path === t.id && distance(character, t) > standoff(t).reach && !can_move_to(t.x, t.y)) return false; // v24.32: the way round to it
	const attacking_us = !!t.target && party_names().has(t.target);
	if (!attacking_us && state.pack?.boss) return false; // on the way to a boss: only stop for attackers
	if (t.target === character.name && !can_take(t)) return false; // v24.10: outrun it; v24.16: keep walking whatever its speed
	halt("break_walk_for");
	return true;
}
function fight(t, steer = true) {
	// v24.10: attacked by something we can't take on and slower than us: get away (keep walking, or step away), shooting
	// if we can; stopping to trade hits with it was a death (a dark hound on the way through winterland)
	// v24.16: walking, never stop for it — whatever its speed: the walk goes on (through a door, it's left behind). Stopped,
	// a hawk (charge 52) cornered the party at desertland's cave door and killed Sanala while they face-tanked it
	// v24.59: only from a monster the party can't kill at all (an ent). It used to apply to anything that failed the
	// per-monster check — so the tank, having started on a levelled-up cgoo, stepped away from it 194 times in a minute
	// while the others fought it, and everyone died.
	if (t && t.target === character.name && hopeless(t) && (walking() || (character.speed || 0) > chase_speed(t.mtype))) {
		if (!walking()) step_away(t);
		return;
	}
	if (get_targeted_monster() !== t) change_target(t);
	if (steer) break_walk_for(t);
	if (steer && !walking() && !kite(t) && (!errand_busy() || state.lead_walk)) approach(t);
	else if (!steer && !walking()) kite(t);
	if (hold_for_tank(t)) { if (character.ctype === "priest") party_heal(); return; }
	if (!class_skills(t) && can_attack(t)) fire("attack", t);
}
// ---- from the shared code (v24.95–v25.6): used by the fighters only ----
// Best normal spot's xp/s, without being there (for a member that doesn't pick)
function best_score() {
	const prof = {};
	let best = 0;
	each_area((pack, area) => {
		const t = pack.type;
		if (!(t in prof)) { const f = farmable_type(t) && fight_math(G.monsters[t]); prof[t] = f && safe_enough(f, t) ? f : null; }
		const f = prof[t];
		if (!f || (!pack.grow && (expected_respawn(t, pack) > CFG.max_respawn || pack.count < CFG.min_count))) return;
		const est = f.xp * Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(t, pack));
		best = Math.max(best, meas_aged(pack_key(area), est * state.realism));
	});
	return best;
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
