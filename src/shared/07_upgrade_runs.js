// =====================================================================
// shared/07_upgrade_runs.js — bag lookups, NPC shopping, scrolls, running an upgrade or a compound, compound groups
// =====================================================================
// A computer (or supercomputer) in the bags lets shop/upgrade/compound/craft/exchange work from anywhere
const has_computer = () => character.items.some((i) => i && (i.name === "computer" || i.name === "supercomputer"));
// First unlocked bag slot holding name at exactly this upgrade level (-1 if none); find_slots: n of them or null
function find_slot(name, level) {
	return character.items.findIndex((i) => i && i.name === name && (i.level || 0) === (level || 0) && !i.l);
}
function find_slots(name, level, n) {
	const out = [];
	character.items.forEach((i, k) => { if (out.length < n && i && i.name === name && (i.level || 0) === level && !i.l) out.push(k); });
	return out.length === n ? out : null;
}
// Quantity in the bags: any level / exactly this level (stacks count their q)
const held_any = (name) => character.items.reduce((n, i) => n + (i && i.name === name ? i.q || 1 : 0), 0);
const held = (name, level) => character.items.reduce((n, i) => n + (i && i.name === name && (i.level || 0) === (level || 0) ? i.q || 1 : 0), 0);
// An NPC that sells this item and is somewhere we can walk to (null if none)
function shop_for(name) {
	for (const id in G.npcs) if (!G.npcs[id].ignore && (G.npcs[id].items || []).includes(name) && find_npc(id)) return id;
	return null;
}
// Walk to an NPC unless we're already within 150px (NPC actions allow 400px). A computer makes the walk unnecessary,
// except for Daisy (monsterhunter), whose hunt counter checks distance regardless.
async function go_npc(npc) {
	if (has_computer() && npc !== "monsterhunter") return;
	const loc = find_npc(npc);
	if (!loc) throw { reason: "no_npc", npc };
	if (character.map === loc.map && Math.hypot(character.x - loc.x, character.y - loc.y) < 150) return;
	await go({ map: loc.map, x: loc.x, y: loc.y + NPC_STAND_Y });
}
async function buy_from_npc(name, qty, npc) {
	const cost = (G.items[name].g || 0) * qty;
	if (G.items[name].cash || character.gold - cost < CFG.gold_reserve) throw { reason: "gold_reserve" };
	npc = npc || shop_for(name);
	if (!npc) throw { reason: "no_shop", name };
	await go_npc(npc);
	await wait_budget(1, RESERVE.errand);
	tag_spend(spend_cat_of(name));
	return T(buy(name, qty));
}
// Make sure one upgrade/compound scroll is in the bags (buy one; wait up to 3s for it to arrive)
async function ensure_scroll(scroll) {
	if (find_slot(scroll, 0) >= 0) return;
	await buy_from_npc(scroll, 1);
	if (!(await until(() => find_slot(scroll, 0) >= 0, 3000))) throw { reason: "scroll_missing", scroll };
}
// Guide rows: action.level = INPUT level; request.level = target
function input_level(a, row) {
	if (row?.request?.name === a.name && Number.isFinite(row.request.level)) return row.request.level - 1;
	return a.level || 0;
}
// Bag slots for n copies of a.name at level `from`: the slots the guide named (resources[].num) if they still hold
// the right item, else any matching unlocked copies
function input_slots(a, from, n) {
	const hinted = (a.resources || []).map((r) => r.num).filter((k) => {
		const i = character.items[k];
		return i && i.name === a.name && (i.level || 0) === from && !i.l;
	});
	if (hinted.length >= n) return hinted.slice(0, n);
	if (n === 1) { const k = find_slot(a.name, from); return k >= 0 ? [k] : null; }
	return find_slots(a.name, from, n);
}
// Merchant 30+: massproduction halves the next upgrade/compound (a one-use buff that lasts 10s): cast it right before
async function mass_production() {
	if (character.ctype !== "merchant" || character.s?.massproduction || !G.skills.massproduction || !can_use("massproduction")) return;
	await T(use_skill("massproduction"), 3000).catch(() => {});
	await until(() => !!character.s?.massproduction, 1500);
}
// Lower odds are accepted when a failure can't cost anything irreplaceable:
//  - NPCs sell the item (failure costs gold): min_chance_rebuyable;
//  - another copy at the same level or higher remains (bags or worn): min_chance_spare.
function chance_floor(name, base, k, level) {
	if (shop_for(name) && !G.items[name]?.cash) return Math.min(base, CFG.min_chance_rebuyable);
	if (k !== undefined) {
		const lv = level ?? (character.items[k]?.level || 0);
		// v25.19: a spare at any level in the bags or the bank counts too (owner: accept higher failure rates for
		// meaningful upgrades) — a failure then costs the steps to rebuild from it, not the only copy. xmasshoes stopped
		// at +4 (+5 at 73% with scroll1, floor 80%) with two +0 copies in the bank.
		// (not titled copies: a project never fetches or rebuilds from one)
		const spares = character.items.filter((i, n) => n !== k && i && i.name === name && !i.l && !i.p).length +
			Object.values(character.slots || {}).filter((i) => i && i.name === name && (i.level || 0) >= lv).length +
			(state.bank_gear || []).filter((i) => i.name === name && !i.p).length;
		if (spares > 0) return Math.min(base, CFG.min_chance_spare);
	}
	return base;
}
// Develop: the highest-level spare in the bags (never worn gear) still below the target; -1 if none
function develop_pick(name, target) {
	let k = -1;
	character.items.forEach((i, n) => { if (i && i.name === name && !i.l && (i.level || 0) < target && (k < 0 || (i.level || 0) > (character.items[k].level || 0))) k = n; });
	return k;
}
// Upgrade scroll for an item at a level: scroll0/1/2 for the item's grade at that level (normal/high/rare)
const upgrade_scroll = (name, level) => "scroll" + Math.max(0, item_grade({ name, level }));
// One upgrade step from a guide row. If the exact input isn't owned (a "develop" step), take the best spare below
// the target (or buy a +0) and upgrade it one level. Gated by the server's own success preview and chance_floor().
async function run_upgrade(a, row) {
	let from = input_level(a, row), scroll = a.scroll || upgrade_scroll(a.name, from);
	const target = row?.request?.name === a.name && row.request.level ? row.request.level : from + 1;
	let ks = input_slots(a, from, 1);
	if (!ks) {
		let k = develop_pick(a.name, target);
		if (k < 0 && shop_for(a.name)) {
			await buy_from_npc(a.name, 1);
			await until(() => develop_pick(a.name, target) >= 0, 3000); // the bought item arrives with the next update
			k = develop_pick(a.name, target);
		}
		if (k < 0) throw { reason: "input_missing", want: `${a.name} below +${target}` };
		from = character.items[k].level || 0;
		scroll = upgrade_scroll(a.name, from);
		ks = [k];
		game_log(`develop ${a.name}: +${from} → +${from + 1} (toward +${target})`, C.info);
	}
	if (!has_computer()) await go("upgrade");
	await ensure_scroll(scroll);
	if (!has_computer()) await go("upgrade"); // buying the scroll may have walked us to another NPC
	const k = character.items[ks[0]]?.name === a.name ? ks[0] : develop_pick(a.name, from + 1);
	if (k < 0) throw { reason: "input_missing", want: `${a.name}+${from}` };
	await wait_budget(1, RESERVE.errand);
	let preview = await T(upgrade(k, find_slot(scroll, 0), null, true)); // last arg true = preview only: {chance}
	let floor = chance_floor(a.name, CFG.min_upgrade_chance, k, from);
	// expensive copies: never a coin flip — a scroll2 step, and (v25.32) any step past upgrade_max_level (+8 on scroll1
	// was 15%: with the 10% floors a +7 weapon became a +8 project)
	if (scroll === "scroll2" || from >= CFG.upgrade_max_level) floor = Math.max(floor, CFG.upgrade_high.min_chance);
	if (a.min_chance) floor = Math.max(floor, a.min_chance); // v25.39: a worn piece's project (upgrade_worn.min_chance)
	let off = null;
	if (preview && !(preview.chance >= floor)) { // v24.81: the next scroll up may lift it over (cheaper than an offering)
		const hs = "scroll" + (Math.max(0, item_grade({ name: a.name, level: from })) + 1), hc = G.items[hs]?.g;
		if (hs !== scroll && hc && hc <= (CFG.upgrade_boost_max || 0) && !(shop_for(a.name) && !G.items[a.name]?.cash) && gold_ok(hc) && character.gold - hc >= CFG.gold_reserve) {
			await ensure_scroll(hs);
			if (!has_computer()) await go("upgrade");
			await wait_budget(1, RESERVE.errand);
			const p3 = await T(upgrade(k, find_slot(hs, 0), null, true)).catch(() => null);
			if (p3?.chance >= floor) { game_log(`upgrade ${a.name}: ${hs} lifts +${from + 1} from ${Math.round(preview.chance * 100)}% to ${Math.round(p3.chance * 100)}%`, C.info); preview = p3; scroll = hs; }
		}
	}
	if (preview && !(preview.chance >= floor)) { // a Primling (or other allowed offering) in the bags may lift it over
		const ok_ = character.items.findIndex((i) => i && (CFG.upgrade_high.offerings || []).includes(i.name) && !i.l);
		if (ok_ >= 0) {
			await wait_budget(1, RESERVE.errand);
			const p2 = await T(upgrade(k, find_slot(scroll, 0), ok_, true)).catch(() => null);
			if (p2?.chance >= floor) { preview = p2; off = ok_; game_log(`upgrade ${a.name}: using ${character.items[ok_].name} (${Math.round(p2.chance * 100)}%)`, C.info); }
		}
	}
	if (!preview || !(preview.chance >= floor)) throw { reason: "low_chance", chance: preview?.chance };
	await mass_production();
	await wait_budget(1, RESERVE.errand);
	const r = await T(upgrade(k, find_slot(scroll, 0), off), 60_000); // the server takes 500·L·√L ms (+7: ~9s, +9: 13.5s)
	game_log(`upgrade ${a.name} +${from}→+${from + 1} (${(preview.chance * 100).toFixed(0)}%): ${r?.success ? "OK" : "FAILED"}`, r?.success ? C.ok : C.bad);
	log_ev("upgrade", { item: a.name, from, chance: +preview.chance.toFixed(3), ok: !!r?.success });
	return r;
}
// One compound step: three copies at level `from` + a compound scroll (cscroll0/1/2 by grade) → one at from+1.
// Failure destroys all three, hence the same success gate as upgrades.
async function run_compound(a, row, floor) {
	const from = input_level(a, row);
	const scroll = a.scroll || "cscroll" + Math.max(0, item_grade({ name: a.name, level: from }));
	if (!input_slots(a, from, 3)) throw { reason: "input_missing", want: `3x ${a.name}+${from}` }; // before walking anywhere
	if (!has_computer()) await go("compound");
	await ensure_scroll(scroll);
	if (!has_computer()) await go("compound");
	const ks = input_slots(a, from, 3);
	if (!ks) throw { reason: "input_missing", want: `3x ${a.name}+${from}` };
	await wait_budget(1, RESERVE.errand);
	const preview = await T(compound(ks[0], ks[1], ks[2], find_slot(scroll, 0), null, true));
	if (!preview || !(preview.chance >= (floor ?? chance_floor(a.name, CFG.min_compound_chance)))) throw { reason: "low_chance", chance: preview?.chance };
	await mass_production();
	await wait_budget(1, RESERVE.errand);
	const r = await T(compound(ks[0], ks[1], ks[2], find_slot(scroll, 0)), 40_000); // the server takes 10s to combine
	game_log(`compound ${a.name} +${from}→+${from + 1} (${(preview.chance * 100).toFixed(0)}%): ${r?.success ? "OK" : "FAILED"}`, r?.success ? C.ok : C.bad);
	log_ev("compound", { item: a.name, from, chance: +preview.chance.toFixed(3), ok: !!r?.success });
	return r;
}

// Own compounding (CFG.compound_auto). A group = one item name at one level with >= 3 spare copies across bags and
// bank. Bank copies are fetched on the next bank visit (bag_plan) and kept in the bags until compounded.
const compound_key = (name, level) => `cmp:${name}:${level}`;
// v25.32: the bank nearly full (CFG.compound_bank_full): odds no longer hold compounds back. On under purge_below free,
// off again at 2x that (one visit fetches up to 18 set copies: without the margin they'd go back to the bank uncompounded),
// and only on a count seen in the last 6 h (it's saved: a stale one after a restart or a manual clear-out)
let bank_tight_on = false;
const bank_tight = () => {
	const bf = state.bank_free, b = CFG.merchant?.purge_below || 0.1;
	if (!CFG.compound_bank_full || !bf || !(bf.total > 0) || Date.now() - (bf.at || 0) > 6 * 3600_000) return (bank_tight_on = false);
	if (bf.free < bf.total * b) bank_tight_on = true;
	else if (bf.free >= bf.total * b * 2) bank_tight_on = false;
	return bank_tight_on;
};
// ...and only for sets combined with the cheap scroll (cscroll0) and with no titled copy: a cscroll1 is 240k a roll, a
// cscroll2 9.2M
// (one rule for every bypass — the ceiling in compound_spare, the odds pause in compound_groups and the floor in
// task_compound: a set only the floor bypass refused stayed a group and took every attempt of every run)
const tight_item = (it) => bank_tight() && !it.p && item_grade({ name: it.name, level: it.level || 0 }) <= 0;
const tight_ok = (g, ks) => tight_item({ name: g.name, level: g.level }) && !ks.some((k) => character.items[k]?.p);
const odds_pause = (key) => /low_chance/.test(skip_why[key] || "");
function compound_spare(it, k, needed) {
	const def = it && G.items[it.name];
	// v24.73: a copy a member would wear is no longer left out. Three skull amulets sat in the merchant's bags, each
	// "wanted" for one empty amulet slot, so there was never a set of three; the +1 goes to whoever wanted the +0.
	// (v24.87: titled copies too — the server doesn't check titles; the result is the first copy, so a titled one goes first)
	return !!def?.compound && !it.l && !it.b && !needed.has(k) && (it.level || 0) < (tight_item(it) ? CFG.compound_max_level : cmp_top(it.name)) &&
		!CFG.keep.includes(it.name);
}
// Report: three or more equal copies in the bags that aren't being compounded, and why
function compound_why() {
	const by = {}, needed = needed_slots(), groups = compound_groups();
	character.items.forEach((it, k) => { if (it && G.items[it.name]?.compound) (by[compound_key(it.name, it.level || 0)] = by[compound_key(it.name, it.level || 0)] || []).push([it, k]); });
	const out = [];
	for (const key in by) {
		const L = by[key], [it] = L[0];
		if (L.length < 3 || groups.some((g) => g.key === key)) continue;
		const lv = it.level || 0;
		const why_ = skipped(key) ? `paused ${mins(state.gear_skip[key])} (${skip_why[key] || "?"})` : lv >= cmp_top(it.name) ? `+${lv} is its ceiling here (max +${CFG.compound_max_level}, or the odds were under ${Math.round(CFG.compound_min_chance * 100)}%)`
			: CFG.keep.includes(it.name) ? "on the keep list" : L.some(([i]) => i.l || i.b) ? "locked or bound copies" : L.some(([i]) => i.p) ? "titled copies" : L.some(([, k]) => needed.has(k)) ? "copies held for a quest or project"
			: !CFG.compound_auto ? "compound_auto is off" : merchant_does_it() ? "the merchant compounds" : "?";
		out.push(`${it.name}+${lv} x${L.length}: ${why_}`);
	}
	return out;
}
// Compound ceilings (v24.15): item -> { level, at } where the server's odds were under our floor; 7 days (saved)
const cmp_cap = (name, level) => { state.cmp_caps[name] = { level, at: Date.now() }; cmp_cache = null; };
const cmp_top = (name) => {
	const c = state.cmp_caps[name];
	let top = Math.min(CFG.compound_max_level, c && Date.now() - c.at < 7 * 86400_000 ? c.level : Infinity);
	// a refusal for its odds paused before v24.15 (a 6h skip, no ceiling recorded) counts too
	for (let L = 0; L < top; L++) if (skipped(compound_key(name, L)) && /low_chance/.test(skip_why[compound_key(name, L)] || "")) { top = L; break; }
	return top;
};
let cmp_cache = null; // { key, at, list }: keyed by bags + bank snapshot + pauses; bag_class asks once per item
function compound_groups(needed) {
	// while the merchant is online it compounds for everyone (shared bank); fighters hand it their spares instead
	if (!CFG.compound_auto || merchant_does_it()) return [];
	const key = character.items.map((i) => (i ? `${i.name}${i.level || 0}${i.l ? "l" : ""}` : "")).join() + "|" +
		(state.bank_gear || []).length + "|" + Object.keys(state.gear_skip).filter((k) => k.startsWith("cmp:") && skipped(k)).join() + "|" + bank_tight();
	if (cmp_cache && cmp_cache.key === key && Date.now() - cmp_cache.at < 2000) return cmp_cache.list;
	needed = needed || needed_slots();
	const by = {};
	const add = (it, where, k) => {
		const key = compound_key(it.name, it.level || 0);
		const g = (by[key] = by[key] || { name: it.name, level: it.level || 0, key, bags: [], bank: 0 });
		if (where === "bags") g.bags.push(k); else g.bank++;
	};
	character.items.forEach((it, k) => { if (compound_spare(it, k, needed)) add(it, "bags", k); });
	for (const it of state.bank_gear || []) if (compound_spare(it, -1, needed)) add(it, "bank");
	for (const g of Object.values(by)) g.bags.sort((a, b) => (character.items[b]?.p ? 1 : 0) - (character.items[a]?.p ? 1 : 0));
	const list = Object.values(by).filter((g) => g.bags.length + g.bank >= 3 && (!skipped(g.key) || (odds_pause(g.key) && tight_ok(g, g.bags))))
		.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)); // cheapest scrolls / best odds first
	cmp_cache = { key, at: Date.now(), list };
	return list;
}
// Bank copies to fetch so a group reaches 3 in the bags (task_bank entries; one attempt per copy per 2h)
// Bank copies to fetch for up to compound_per_run whole sets in one bank visit (cheapest level first), within the free
// bag slots minus 6 for loot. Keys get a 10-min retry guard (bag_plan), not the 2h one: a successful fetch lowers the
// bank count anyway.
function compound_fetches(groups) {
	const out = [];
	let room = Math.max(0, character.esize - 6), sets = CFG.compound_per_run;
	for (const g of groups) {
		if (sets <= 0 || room <= 0) break;
		const n_sets = Math.min(sets, Math.floor((g.bags.length + g.bank) / 3));
		const copies = Math.min(g.bank, room, Math.max(0, n_sets * 3 - g.bags.length));
		for (let i = 0; i < copies; i++) out.push({ name: g.name, level: g.level, key: `${g.key}:${i}` });
		room -= copies;
		sets -= Math.floor((g.bags.length + copies) / 3);
	}
	return out;
}
// Bag slots held for a group: the copies that, with the bank's, make up complete sets of three
function compound_slots(needed) {
	const keep = new Set();
	for (const g of compound_groups()) g.bags.slice(0, Math.floor((g.bags.length + g.bank) / 3) * 3).forEach((k) => keep.add(k));
	return keep;
}
// Compound every complete group in the bags (up to compound_per_run). A failed preview pauses that group 6h; a
// result that's a member's upgrade is picked up by equip_upgrades/share_gear.
async function task_compound() {
	let n = 0;
	for (let guard = 0; guard < CFG.compound_per_run * 2 && n < CFG.compound_per_run; guard++) {
		if (state.errand) state.errand_at = Date.now(); // progress keeps the errand lock
		const g = compound_groups().find((x) => x.bags.length >= 3);
		if (!g) break;
		// rebuyable odds only when the three copies are cheap: a +L copy embodies 3^L base copies (v23.1)
		const wanted = gear_takers().filter((m) => m.ctype !== "merchant").some((m) => gear_gain_min({ name: g.name, level: g.level + 1 }, m.ctype, m.g)); // (v25.36)
		const floor = tight_ok(g, g.bags.slice(0, 3)) ? 0 : Math.min(shop_for(g.name) && !G.items[g.name]?.cash && 3 * (G.items[g.name]?.g || 0) * Math.pow(3, g.level) <= CFG.rebuy_loss_max
			? CFG.compound_min_chance_rebuyable : CFG.compound_min_chance, wanted ? CFG.compound_min_chance_wanted : 1);
		const sc_cost = G.items["cscroll" + Math.max(0, item_grade({ name: g.name, level: g.level }))]?.g || 0;
		if (!gold_ok(sc_cost)) { town_reason.compound = `gold budget (${g.name}+${g.level} needs a ${fmt_k(sc_cost)} scroll)`; break; }
		try {
			// resources: the exact spare slots, so run_compound never grabs a guide-needed copy of the same item
			const before = g.bags.slice(0, 3).map((k) => character.items[k]);
			const r = await run_compound({ name: g.name, level: g.level, resources: g.bags.map((num) => ({ num })) }, null, floor);
			n++;
			if (!r?.success) {
				await sleep_ms(500); // let the bag update arrive
				// inputs still there = the server refused without rolling (not a real failure): don't retry soon, or
				// each retry would cost a town trip
				const untouched = before.every((it, i) => character.items[g.bags[i]] === it);
				skip(g.key, untouched ? 6 * 3600_000 : 600_000, untouched ? `refused: ${why(r)}` : "last compound failed");
			}
		} catch (e) {
			// only verdicts about the items themselves are worth a 6h pause; walking/transient failures retry in 10 min
			const item_verdict = ["low_chance", "not_combinable", "mismatch"].includes(why(e));
			// v24.15: odds don't change — that level is this item's compound ceiling (7 days): no more fetching the copies
			// out of the bank every 6h to be refused again
			if (why(e) === "low_chance") cmp_cap(g.name, g.level);
			if (item_verdict) n++; // v24.74: a verdict on one set is a result — it used to pause all compounding 15 min ("achieved nothing")
			skip(g.key, item_verdict ? 6 * 3600_000 : 600_000, `${why(e)}${e?.chance !== undefined ? ` (${Math.round(e.chance * 100)}%)` : ""}`); // no gold: retry in 10 min
			town_reason.compound = `${g.name}+${g.level}: ${why(e)}`;
			game_log(`compound ${g.name}+${g.level}: ${why(e)}; retrying in ${item_verdict ? "6h" : "10 min"}`, C.dim);
		}
	}
	return n;
}

