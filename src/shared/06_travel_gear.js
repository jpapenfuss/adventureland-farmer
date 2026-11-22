// =====================================================================
// shared/06_travel_gear.js — travel gear: pieces that slow us come off for long walks (off: CFG travel_*)
// =====================================================================
// ---- Travel gear (v24.27): pieces that slow us come off for long walks, and go back on when they end ----
// Our own long walk (go_raw's trip), or the walk just ended a moment ago (between a route's legs, a group hold)
// v24.31: ...or we're the leader holding for stragglers on the way (group_hold): still the same trip — the followers'
// gear went on and off with every hold
const own_long_walk = () => !!trip.long && (walking() || Date.now() - trip.end < CFG.travel_gear.settle_ms || !!state.group_wait);
// Are we on a long walk now? A follower walks with its leader (heartbeat lw), not through go()
function travel_long() {
	if (state.pack && character.map === state.pack.map && in_boundary(state.pack.boundary, 250)) return false; // at the spot
	if (own_long_walk() && !(errand_busy() && !walking())) return true; // an errand at its NPC isn't travelling
	if (errand_busy() || !is_follower()) return false;
	const L = leader_hb();
	// walking with it: same map, within reach of it (a member holding somewhere else isn't travelling)
	return !!L?.lw && partners_near(2 * CFG.party.follow_far).includes(L);
}
// Why the travel gear must go back on now (null: no reason)
function travel_danger() {
	if (character.hp < character.max_hp * 0.5) return "low HP";
	const party = party_names();
	for (const id in parent.entities || {}) {
		const e = parent.entities[id];
		if (e && e.type === "monster" && e.visible && !e.dead && e.target && party.has(e.target) && distance(character, e) <= CFG.travel_gear.danger_px)
			return `${e.mtype} on ${e.target === character.name ? "us" : e.target}`;
	}
	if (character.ctype === "priest" && partners_near(400).some((p) => p.max_hp && p.hp < p.max_hp * 0.6)) return "a member needs heals";
	return null;
}
// Worn pieces worth taking off: speed they cost us (own speed + class modifier, and the dex/str speed they give),
// the HP/MP the server would clamp away, biggest speed first
function travel_candidates() {
	const T_ = CFG.travel_gear, out = [], sl = character.slots || {};
	for (const s of GEAR_SLOTS) {
		const it = sl[s];
		if (!it || it.b || !G.items[it.name] || skipped(`tgear:${s}`)) continue;
		const p = gear_stats(it, character.ctype);
		const speed = -(p.speed || 0) - Math.max(0, p.dex || 0) / 32 - Math.max(0, p.str || 0) / 64;
		if (speed < T_.min_speed) continue;
		const dhp = (p.hp || 0) + (p.str || 0) * 21 + (p.vit || 0) * (48 + character.level / 3), dmp = (p.mp || 0) + (p.int || 0) * 15;
		const hp_loss = Math.max(0, character.hp - (character.max_hp - dhp)), mp_loss = Math.max(0, character.mp - (character.max_mp - dmp));
		if (hp_loss > character.max_hp * T_.max_hp_loss || mp_loss > character.max_mp * T_.max_mp_loss) continue;
		out.push({ slot: s, it, speed: round1(speed), hp_loss: Math.round(hp_loss), mp_loss: Math.round(mp_loss) });
	}
	return out.sort((a, b) => b.speed - a.speed);
}
// Bag slot of a piece we took off (exact copy), -1 if it's gone
const travel_bag_slot = (r) => character.items.findIndex((i) => i && i.name === r.name && (i.level || 0) === (r.level || 0) &&
	(i.p || null) === (r.p || null) && (i.stat_type || null) === (r.stat_type || null));
const travel_slots_held = () => new Set(state.travel_off.map(travel_bag_slot).filter((k) => k >= 0));
const travel_off_slots = () => new Set(state.travel_off.map((r) => r.slot));
// v24.31: a swap changes our speed mid-step; the client keeps walking its old step and drifts off the server's position
// (the pathfinder then clips a corner and stands there). Stop the step: the walk in flight re-plans from where we are.
const travel_resync = () => { if (character.moving) try { stop("move"); } catch (e) {} };
// v24.31: our combat stats with everything on (taken as the pieces come off): the heartbeat keeps sending these, so the
// leader doesn't judge spots on a priest without its staff
// v24.36: kept in state and saved with travel_off — after a reload mid-walk the pieces were still off but these were
// gone, so the heartbeat sent the stripped stats again and the leader's verdicts flipped with every swap
const HB_COMBAT = ["attack", "frequency", "max_hp", "armor", "resistance", "range", "apiercing", "rpiercing", "max_mp"];
const travel_stats = { off: 0, on: 0, last: null, at: 0 }; // report: pieces taken off / put back since load, the last action
let travel_restored_at = 0;
async function travel_strip() {
	const T_ = CFG.travel_gear;
	const cands = travel_candidates().slice(0, Math.max(0, character.esize - T_.keep_free)); // each needs a free bag slot
	let n = 0;
	if (cands.length && !state.travel_off.length) state.travel_full = Object.fromEntries(HB_COMBAT.map((k) => [k, character[k] || 0]));
	for (const c of cands) {
		if (gear_busy || !can_spend(EMIT_COST.unequip, RESERVE.errand)) break;
		gear_busy = true;
		try { await T(unequip(c.slot)); } catch (e) { game_log(`travel gear: unequip ${c.slot}: ${why(e)}`, C.dim); } finally { gear_busy = false; }
		if (character.slots?.[c.slot]) { skip(`tgear:${c.slot}`, 600_000, "unequip failed"); continue; }
		state.travel_off.push({ slot: c.slot, name: c.it.name, level: c.it.level || 0, p: c.it.p || null, stat_type: c.it.stat_type || null, speed: c.speed });
		n++;
	}
	if (n) {
		my_gear_cache = null; travel_resync();
		const txt = state.travel_off.map((r) => `${r.name}+${r.level} (${r.speed} speed)`).join(", ");
		travel_stats.off += n; travel_stats.last = `took off ${txt}`; travel_stats.at = Date.now();
		game_log(`travel gear: took off ${txt} for the walk`, C.dim);
		save_state(); // a reload mid-walk must still know to put them back on
	}
	return n > 0;
}
// Put everything back on (mainhand first: a two-hander needs the offhand free, as it was). A slot something else went
// into meanwhile, or a piece no longer in the bags, is dropped from the list (the piece is judged as any bag item).
let restore_p = null; // one restore at a time (the tick, an errand's start and its walk's end can all ask)
function travel_restore(why_) {
	if (!restore_p) restore_p = travel_restore_run(why_).finally(() => { restore_p = null; });
	return restore_p;
}
async function travel_restore_run(why_) {
	if (!state.travel_off.length || character.rip) return false;
	if (channeling() && why_ !== "errand" && why_ !== "arrived") return false; // equip would cancel the town channel
	const list = [...state.travel_off].sort((a, b) => (b.slot === "mainhand") - (a.slot === "mainhand"));
	let n = 0;
	for (const r of list) {
		const drop = () => { state.travel_off = state.travel_off.filter((x) => x !== r); };
		await wait_budget(EMIT_COST.equip, RESERVE.skill);
		while (gear_busy) await sleep_ms(100);
		if (character.slots?.[r.slot]) { drop(); continue; }
		const k = travel_bag_slot(r);
		if (k < 0) { drop(); game_log(`travel gear: ${r.name}+${r.level} is no longer in the bags`, C.warn); continue; }
		gear_busy = true;
		try { await T(equip(k, r.slot)); } catch (e) { game_log(`travel gear: equip ${r.name}: ${why(e)}`, C.dim); } finally { gear_busy = false; }
		if (character.slots?.[r.slot]?.name === r.name) { drop(); n++; }
		else if (!character.items[k] || character.items[k].name !== r.name) drop(); // moved/consumed: stop chasing it
		else if ((r.fails = (r.fails || 0) + 1) >= 3) { // refused 3 times: leave it to the gear loop (it's the slot's best piece)
			drop(); skip(`tgear:${r.slot}`, 3600_000, "re-equip refused");
			game_log(`travel gear: ${r.name}+${r.level} wouldn't go back on — left to the gear loop; not taking ${r.slot} off for 1h`, C.warn);
		}
	}
	if (n) {
		my_gear_cache = null; travel_restored_at = Date.now(); travel_resync();
		travel_stats.on += n; travel_stats.last = `put ${n} back on (${why_})`; travel_stats.at = Date.now();
		game_log(`travel gear: back on (${why_})`, C.dim);
		save_state();
	}
	return n > 0;
}
let travel_busy = false;
async function travel_gear_tick() {
	const T_ = CFG.travel_gear;
	if (travel_busy || character.rip || typeof equip !== "function" || typeof unequip !== "function") return;
	if (!T_.enabled || is_merchant()) { if (state.travel_off.length && !channeling()) { travel_busy = true; try { await travel_restore("disabled"); } finally { travel_busy = false; } } return; }
	if (channeling()) return; // equip/unequip cancel the town channel (server: player.c = {})
	travel_busy = true;
	try {
		// pieces off but no full-gear stats to report for them (saved by a version before v24.36): back on first
		if (state.travel_off.length && !state.travel_full) return void (await travel_restore("no full-gear stats"));
		const long = travel_long();
		if (!long && !state.travel_off.length) return; // nothing off, no long walk: nothing to judge
		const danger = travel_danger();
		if (state.travel_off.length) { if (!long || danger) await travel_restore(danger || "walk over"); }
		else if (long && !danger && !gear_busy && Date.now() - travel_restored_at > T_.cooldown_ms) await travel_strip();
	} finally { travel_busy = false; }
}
setInterval(() => { travel_gear_tick().catch(() => {}); }, 500);
