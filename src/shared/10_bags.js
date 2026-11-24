// =====================================================================
// Bags: keep / sell / bank
// =====================================================================
// Junk: CFG.sell names, or (if auto_sell_gear, or while the bank is full) plain gear: +0, no title (.p), normal grade
// (item_grade 0), NPC value <= sell_max_value. Never locked/bound/kept/needed items.
const sell_plain_item = (it) => !!it && (CFG.sell_plain || []).includes(it.name) && !(it.level > 0) && !it.p && !it.l && !it.b;
function is_junk(item) {
	if (!item || item.l || item.b || CFG.keep.includes(item.name) || needed_slots().has(character.items.indexOf(item))) return false;
	if (CFG.sell.includes(item.name) || sell_plain_item(item)) return true;
	const def = G.items[item.name];
	if (!CFG.sell_junk) return false;
	if (!(CFG.auto_sell_gear || bank_is_full()) || !def || !GEAR.has(def.type)) return false; // bank full: selling is the only way to make room
	if (gear_wanted_by(item)) return false; // an upgrade for us or a party member
	return !(item.level > 0) && !item.p && item_grade(item) === 0 && item_value(item) <= CFG.sell_max_value;
}
// KEEP / SELL / BANK for one bag item (see the header). `needed` = slots holding copies the guide/quests need.
const purge_key = (it) => `${it.name}:${it.level || 0}${it.p ? ":" + it.p : ""}${it.stat_type ? ":" + it.stat_type : ""}`;
function bag_class(item, needed = needed_slots(), held_cmp) {
	if (!item) return "empty";
	if ((held_cmp || compound_slots(needed)).has(character.items.indexOf(item))) return "keep"; // waiting to be compounded
	if (stand_hold().has(character.items.indexOf(item))) return "keep"; // stock for the stand
	const def = G.items[item.name];
	if (sell_plain_item(item) && !needed.has(character.items.indexOf(item)) && !CFG.keep.includes(item.name)) return "sell"; // before "fetched within the hour → keep"
	if (item.l || item.b || !def || CFG.keep.includes(item.name) || BAG_TYPES.has(def.type) ||
		item.name === CFG.hp_pot || item.name === CFG.mp_pot || needed.has(character.items.indexOf(item)) ||
		(Date.now() - (state.fetched[item.name] || 0) < 3600_000 && !(def.compound && (merchant_does_it() || is_merchant()))) ||
		(Date.now() - (state.fetched[item.name] || 0) < 7200_000 && GEAR.has(def.type) && !equip_paused(item) && self_taker_ok() && gear_gain(item, character.ctype, my_gear())) ||
		(GEAR.has(def.type) && wanted_by_member(item))) return "keep"; // fetched within the hour (except compound copies the merchant handles), or an upgrade for one of us (v19.7)
	// bank purge (v24.7: after the keep rules, by the exact copy — a purge of a plain helmet+3 sold the project's helmet+3,
	// and a titled copy fetched for a fighter)
	if (merchant_sells(item)) return "sell"; // v25.5: merchant/ — a purge pull, a dead compound piece
	if (is_junk(item)) return "sell";
	return CFG.bank ? "bank" : "keep";
}
// Why bag_class says "keep" (report only; mirrors bag_class's keep branches in order)
function keep_reason(item, k, needed, cmp) {
	const def = G.items[item.name];
	if (cmp.has(k)) return "compound";
	if (stand_hold().has(k)) return "stand";
	if (item.l || item.b) return "locked";
	if (!def) return "unknown";
	if (CFG.keep.includes(item.name)) return "keep-list";
	if (BAG_TYPES.has(def.type) || item.name === CFG.hp_pot || item.name === CFG.mp_pot) return "supplies";
	if (needed.has(k)) return travel_slots_held().has(k) ? "travel gear (worn)" : state.upg && item.name === state.upg.name ? "upgrade" : "guide/quest";
	if (Date.now() - (state.fetched[item.name] || 0) < 3600_000) return "fetched";
	if (Date.now() - (state.fetched[item.name] || 0) < 7200_000 && self_taker_ok()) return "fetched (for us)";
	if (GEAR.has(def.type) && wanted_by_member(item)) return "for party";
	return CFG.bank ? "other" : "no-bank";
}
// Bag slot indices whose item matches f
const slots_where = (f) => character.items.map((it, i) => (f(it) ? i : -1)).filter((i) => i >= 0);
// What a bank/sell visit would do now: slots to sell, slots to bank, item names to fetch from the bank, free slots
function bag_plan() {
	const needed = needed_slots();
	const cmp = compound_slots(needed);
	const sell = slots_where((i) => bag_class(i, needed, cmp) === "sell"), bank = slots_where((i) => bag_class(i, needed, cmp) === "bank");
	// Fetch a needed item when the bags are short of it and the bank has some, at most one attempt per item name every
	// 2 hours (persisted), whatever happens to the fetched copy. Gear: only when no copy at any level is in the bags or
	// worn (counting only +0 copies, or not counting worn ones, lets a fetched copy look missing again — a fetch/bank
	// loop). Stackables (quest materials): when the bags hold fewer than needed (v23.0: before, any copy in the bags
	// blocked the fetch, while quest progress counted bags + bank — "spores 12(+8 bank)/20" never farmed, fetched or
	// crafted). A fetched stack merges into the bag stack (the server's add_item), so the craft's one-stack rule is met.
	const worn = (n) => Object.values(character.slots || {}).filter((i) => i && i.name === n).length;
	const short_of = (n) => (G.items[n]?.s ? held_any(n) < (state.needs.get(n) || 1) && bank_share(n) > 0 : held_any(n) + worn(n) === 0);
	const fetch = [...state.needs.keys()].filter((n) => (state.bank_seen[n] || 0) > 0 && short_of(n) &&
		!BAG_TYPES.has(G.items[n]?.type) && Date.now() - (state.fetch_try[n] || 0) > 2 * 3600_000);
	{
		const c = craft_pick();
		if (c) for (const [q, n] of G.craft[c.id].items || []) if (held_any(n) < q && (state.bank_seen[n] || 0) > 0 &&
			Date.now() - (state.fetch_try["craft:" + n] || 0) > 1_800_000) fetch.push({ name: n, key: "craft:" + n });
	}
	merchant_fetch_give(fetch); // v25.0: merchant/
	for (const n of hold_missing()) if (state.bank_seen[n] > 0 && Date.now() - (state.fetch_try["hold:" + n] || 0) > 1_800_000) fetch.push({ name: n, key: "hold:" + n });
	const bx = CFG.elixir_auto && character.ctype !== "merchant" && !elixir_active() && !best_elixir() && bank_elixir();
	if (bx) fetch.push({ name: bx.name, key: "elixir:" + bx.name });
	merchant_fetch_stand(fetch); // v25.0: merchant/
	// v24.85: an upgrade project starts from the best copy we own below its target — the bank's too. It bought a +0 and
	// upgraded it from scratch while a +5 of the same piece lay in the bank (Torlis's mace+7 project: mace+5 banked).
	{
		const P = state.upg;
		if (P && !skipped("upg:" + P.name)) {
			const have = best_level_held(P.name);
			const b = (state.bank_gear || []).filter((i) => i.name === P.name && !i.p && (i.level || 0) < P.to && (i.level || 0) > have).sort((x, y) => (y.level || 0) - (x.level || 0))[0];
			if (b && Date.now() - (state.fetch_try[`upgin:${P.name}`] || 0) > 1_800_000) fetch.push({ name: P.name, level: b.level || 0, exact: true, key: `upgin:${P.name}` });
		}
	}
	const bu_ = bank_upgrades(); // a piece that wins as it is comes first: nothing is fetched to be upgraded meanwhile
	for (const u of [...bu_, ...compound_fetches(compound_groups())])
		if (Date.now() - (state.fetch_try[u.key] || 0) > (u.key.startsWith("cmp:") ? 600_000 : 2 * 3600_000)) fetch.push(u);
	merchant_fetch_sale(fetch); // v25.0: merchant/
	return { sell, bank, fetch, free: character.esize };
}
// Nearest NPC with a shop on this map (any shop buys anything), else one on main
function nearest_shop() {
	const search = (mapname) => {
		let best = null, bd = Infinity;
		for (const npc of G.maps[mapname]?.npcs || []) {
			if (!npc.position || !G.npcs[npc.id]?.items) continue;
			const d = mapname === character.map ? Math.hypot(npc.position[0] - character.x, npc.position[1] - character.y) : 0;
			if (d < bd) (bd = d), (best = { map: mapname, x: npc.position[0], y: npc.position[1] + NPC_STAND_Y });
		}
		return best;
	};
	return search(character.map) || search("main");
}
async function task_sell() {
	const slots = slots_where((i) => bag_class(i) === "sell");
	if (!slots.length) return 0;
	if (!has_computer()) { const shop = nearest_shop(); if (shop) await go(shop); }
	let n = 0;
	for (const k of slots) {
		const it = character.items[k];
		if (bag_class(it) !== "sell") continue;
		await wait_budget(1, RESERVE.bulk);
		await T(sell(k, it.q || 1)).then(() => {
			n++;
			// v25.33: each sale on the record (the owner allows gear sales by rule now — gear_purge)
			log_ev("npc_sold", { item: `${it.name}+${it.level || 0}${it.p ? ":" + it.p : ""}`, q: it.q || 1 });
			if (GEAR.has(G.items[it.name]?.type)) game_log(`sold ${it.name}+${it.level || 0}${(it.q || 1) > 1 ? " x" + it.q : ""} to an NPC`, C.dim);
		}).catch((e) => game_log("sell: " + why(e)));
		await sleep_ms(PACE_MS);
	}
	if (n) game_log(`Sold ${n} junk item${n === 1 ? "" : "s"}`, C.ok);
	return n;
}
// bank pack id -> [floor map, unlock gold, unlock shells] (game data; the code iframe may only have it on parent)
const bank_packs_list = () => (typeof bank_packs !== "undefined" && bank_packs) || parent.bank_packs || {};
// Bank contents are only visible inside the bank: snapshot item counts every 2s while there (state.bank_seen)
// v20.0: only while standing on a bank floor (character.bank lingers after leaving, so a stale copy used to overwrite
// a fresher one). A changed snapshot is shared with the other characters (at most once a minute), who adopt it when
// it's newer than theirs: the merchant banks most often, so fighters stop chasing pieces someone already took.
let bank_hash = "", bank_sent_at = 0;
// Items as { "name": qty, "name+3": qty, "name*": qty (locked) } — the report's JSON dumps (v24.68)
function items_dump(items) {
	const d = {};
	for (const i of items || []) if (i) { const k = i.name + (i.level ? "+" + i.level : "") + (i.l ? "*" : ""); d[k] = (d[k] || 0) + (i.q || 1); }
	return Object.fromEntries(Object.entries(d).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}
function remember_bank() {
	if (!character.bank || !on_bank_floor()) return;
	const seen = {};
	const gear = [];
	let free = 0, total = 0;
	for (const k in character.bank) if (k.startsWith("items")) for (const i of character.bank[k] || []) { total++; if (!i) free++; }
	if (total) state.bank_free = { free, total, at: Date.now() };
	// v24.5: locked items (the owner's) are left out — fetched, nothing would use them, and they never went back
	for (const k in character.bank) if (k.startsWith("items")) for (const i of character.bank[k] || []) if (i && !i.l) {
		seen[i.name] = (seen[i.name] || 0) + (i.q || 1);
		if ((GEAR.has(G.items[i.name]?.type) || G.items[i.name]?.type === "elixir") && gear.length < 400) gear.push({ name: i.name, level: i.level || 0, p: i.p, stat_type: i.stat_type });
	}
	state.bank_seen = seen;
	state.bank_dump = items_dump(Object.keys(character.bank).filter((k) => k.startsWith("items")).flatMap((k) => character.bank[k] || [])); // v24.68: everything, for report()
	state.bank_gear = gear;
	state.bank_at = Date.now();
	state.bank_by = character.name;
	const h = JSON.stringify([seen, gear.map((i) => i.name + i.level)]);
	if (h === bank_hash) return;
	const wait = 60_000 - (Date.now() - bank_sent_at);
	if (wait <= 0) return void send_bank_view(h);
	// v25.64 (Fable): a change within a minute of the last send went unsent if we left the bank before reading it again —
	// it goes when the minute is up (the newest view then)
	if (!bank_send_timer) bank_send_timer = setTimeout(() => { bank_send_timer = null; send_bank_view(JSON.stringify([state.bank_seen, (state.bank_gear || []).map((i) => i.name + i.level)])); }, wait + 50);
}
let bank_send_timer = null;
// Our bank view to the others (all of them, or `to`)
function send_bank_view(h, to = party_names_all().filter((n) => n !== character.name)) {
	if (typeof send_cm !== "function" || !state.bank_at || !to.length) return;
	if (h) { bank_hash = h; bank_sent_at = Date.now(); if (bank_send_timer) { clearTimeout(bank_send_timer); bank_send_timer = null; } } // (no second send — Fable)
	// by: who read it (an answer can relay another character's view — Fable)
	Promise.resolve(send_cm(to, { k: "bank", at: state.bank_at, by: state.bank_by || character.name, seen: state.bank_seen, gear: state.bank_gear, free: state.bank_free, dump: state.bank_dump })).catch(() => {});
}
// v25.64 (Fable): a character offline when a view was sent never got it — on load it asks the others for theirs (each
// answers with its own; adopt_bank keeps the newest)
function ask_bank_view() {
	const to = party_names_all().filter((n) => n !== character.name);
	if (typeof send_cm === "function" && to.length) Promise.resolve(send_cm(to, { k: "bankq" })).catch(() => {});
	send_bank_view(null); // and ours to them: a held change, or a newer view, isn't lost to a reload or a late loader (Fable)
}
// A bankq answered at most every 30 s per asker (the view can be large)
const bankq_at = {};
function answer_bankq(name) {
	if (Date.now() - (bankq_at[name] || 0) < 30_000) return;
	bankq_at[name] = Date.now();
	send_bank_view(null, [name]);
}
// Another character's bank snapshot: adopt it if it's newer than ours
function adopt_bank(m) {
	const b = m.message;
	if (!(b.at > (state.bank_at || 0)) || !b.seen || !Array.isArray(b.gear)) return;
	Object.assign(state, { bank_seen: b.seen, bank_gear: b.gear, bank_at: b.at, bank_by: b.by || m.name });
	if (b.free) state.bank_free = b.free;
	if (b.dump && typeof b.dump === "object") state.bank_dump = b.dump;
	cmp_cache = null;
}
setInterval(remember_bank, 2000);
const town_reason = {}; // task -> why it achieved nothing (shown by report())
// After every usable pack was found full, sell junk for 6h (bank space doesn't free itself; this re-checks it later)
const bank_is_full = () => Date.now() - (state.bank_full_at || 0) < 6 * 3600_000;
// Store bankable items into packs on the current floor; stops at the first bank_full
async function store_here() {
	let stored = 0, full = false;
	for (let k = character.items.length - 1; k >= 0; k--) { // from the end: storing never shifts earlier slots
		if (bag_class(character.items[k]) !== "bank") continue;
		await wait_budget(1, RESERVE.bulk);
		const r = await T(bank_store(k)).catch((e) => e);
		if (r?.reason === "bank_full") { full = true; break; }
		if (!r?.failed && !r?.reason) stored++;
		else game_log(`bank: ${character.items[k]?.name}: ${why(r)}`, C.dim);
		await sleep_ms(PACE_MS);
	}
	return { stored, full };
}
// Wait (up to 10s) until we're on this bank floor and its pack contents have arrived
const floor_loaded = (map) => until(() => character.map === map && character.bank && Object.keys(character.bank).some((k) => k.startsWith("items")), 20_000);
// Bank visit: store everything classed BANK (overflowing to other unlocked floors), then fetch needed items
async function task_bank(fetch_names) {
	const store = slots_where((i) => bag_class(i) === "bank");
	if (!store.length && !fetch_names.length) return (town_reason.bank = "nothing to store or fetch"), 0;
	// v24.22: one character of an account in the bank at a time (server: "X is in the bank"); walking at its door with
	// another inside retried the door until the walk timed out, flooding the log
	if (character.map !== "bank") {
		const inside = [...partners_any(), ...[merchant_hb()].filter(Boolean)].filter((p) => fresh(p) && /^bank/.test(p.map || "")).map((p) => p.name);
		if (inside.length) { town_reason.bank = `${inside.join(", ")} in the bank: waiting`; throw { reason: "bank_busy" }; }
	}
	try { if (character.map !== "bank") await go({ map: "bank" }); } catch (e) { town_reason.bank = "can't reach the bank: " + why(e); throw e; }
	// the bank's contents arrive separately after entering; if they haven't after 20s, walk out and back in once
	if (!(await floor_loaded("bank"))) {
		log_error("bank didn't load (retrying once)");
		try { await go({ map: "main" }); await go({ map: "bank" }); } catch (e) {}
		if (!(await floor_loaded("bank"))) {
			const seen_b = `map ${character.map}, bank ${character.bank ? Object.keys(character.bank).join("/") || "empty" : "none"}`;
			town_reason.bank = `bank didn't load (twice; ${seen_b})`;
			log_error(`bank didn't load: ${seen_b}`);
			throw { reason: "bank_not_loaded" };
		}
	}
	let { stored, full } = await store_here();
	// main floor full → other floors you've unlocked. bank_b/bank_u sit behind doors the server keeps locked until a
	// bkey/ukey is used; an unlocked floor's packs show up in character.bank (items8 for bank_b, items24 for bank_u).
	const packs = bank_packs_list();
	const unlocked_floors = [...new Set(Object.keys(character.bank || {}).filter((k) => packs[k]).map((k) => packs[k][0]))];
	if (full) for (const floor of unlocked_floors.filter((f) => f !== "bank")) {
		if (!slots_where((i) => bag_class(i) === "bank").length) break;
		try { await go({ map: floor }); } catch (e) { game_log(`bank: can't reach ${floor}: ${why(e)}`, C.dim); continue; }
		if (!(await floor_loaded(floor))) continue;
		const r = await store_here();
		stored += r.stored;
		full = r.full;
		if (!full) break;
	}
	if (full) {
		state.bank_full_at = Date.now();
		town_reason.bank = "every bank pack you can use is full";
		const has_key = character.items.some((i) => i && (i.name === "bkey" || i.name === "ukey"));
		game_log(`Bank full (floors: ${unlocked_floors.join(", ")}): ${CFG.sell_junk ? "selling plain +0 junk until there's room" : "nothing is sold (sell_junk is off) — what doesn't fit stays in the bags"}.` +
			(has_key ? " You hold a bank key: use it in the bank to unlock another floor." : " A Bank Key (bkey) unlocks the bank_b floor."), C.bad);
	} else if (!stored && store.length) town_reason.bank = "store calls failed (see gray bank: lines)";
	// pull back what bags need: packs on this floor first, then other unlocked floors that hold what's left (v18.1:
	// before, a piece on bank_b/bank_u was listed as a bank upgrade forever and never fetched)
	let got = 0;
	// v24.5: never a locked copy; a gear piece (bank_upgrades) by its title and stat type too — the first copy at that
	// name/level could be a worse one, which went back after 1-2h and was fetched again every 2h
	const match = (want) => (i) => i && !i.l && i.name === (want.name || want) && (want.level === undefined || (i.level || 0) === want.level) &&
		(!want.exact || ((i.p || null) === (want.p || null) && (i.stat_type || null) === (want.stat_type || null)));
	const fetch_here = async (wants) => {
		const left = [];
		for (const want of wants) {
			if (character.esize < 2) break; // keep a slot free for loot
			// a name (any copy), or { name, level, key } for one exact gear piece (bank_upgrades)
			const name = want.name || want, key = want.key || name;
			state.fetch_try[key] = Date.now();
			let found = false;
			for (const p in character.bank) {
				if (!p.startsWith("items") || (packs[p] && packs[p][0] !== character.map)) continue;
				const n = (character.bank[p] || []).findIndex(match(want));
				if (n < 0) continue;
				await wait_budget(1, RESERVE.bulk);
				found = true;
				await T(bank_retrieve(p, n)).then(() => { got++; state.fetched[name] = Date.now(); state.fetch_res[key] = { at: Date.now(), ok: true }; game_log(`bank: fetched ${name} from ${p}`, C.dim); })
					.catch((e) => { state.fetch_res[key] = { at: Date.now(), why: why(e) }; game_log(`bank: fetching ${name} failed: ${why(e)}`, C.dim); });
				await sleep_ms(PACE_MS);
				break;
			}
			if (!found) { left.push(want); state.fetch_res[key] = { at: Date.now(), why: `not on ${character.map}` }; }
		}
		return left;
	};
	let left = await fetch_here(fetch_names);
	for (const floor of unlocked_floors.filter((f) => f !== character.map)) {
		if (!left.length || character.esize < 2) break;
		const there = left.filter((w) => Object.keys(character.bank || {}).some((p) => p.startsWith("items") && packs[p]?.[0] === floor && (character.bank[p] || []).some(match(w))));
		if (!there.length) continue;
		try { await go({ map: floor }); } catch (e) { game_log(`bank: can't reach ${floor}: ${why(e)}`, C.dim); continue; }
		if (!(await floor_loaded(floor))) continue;
		const still = await fetch_here(there);
		left = left.filter((w) => !there.includes(w) || still.includes(w));
	}
	for (const w of left) game_log(`bank: ${w.name || w} not found in the bank; not trying again for 2h`, C.dim);
	got += await bank_purge(); // role function: 0 on a fighter
	remember_bank();
	game_log(`Bank: stored ${stored}, retrieved ${got}; ${character.esize} slots free`, C.ok);
	return stored + got;
}
// Buy potions back up to pot_buy when either kind drops below pot_min. Each kind gets half the gold: the configured
// potion if that half covers the full refill, else the cheap tier (hpot0/mpot0, 20g instead of 100g) — so a new,
// poor character still gets potions. May dip into gold_reserve (potions are what it's for).
const CHEAP_POT = { hp: "hpot0", mp: "mpot0" };
async function task_restock(pot_min = CFG.pot_min, pot_buy = CFG.pot_buy) {
	if (pot_count("hp") >= pot_min && pot_count("mp") >= pot_min) return 0;
	if (!has_computer()) await go("potions");
	let n = 0;
	for (const [kind, best] of [["hp", CFG.hp_pot], ["mp", CFG.mp_pot]]) {
		const want = pot_buy - pot_count(kind);
		if (want <= 0) continue;
		const budget = character.gold / (kind === "hp" ? 2 : 1); // hp first takes up to half; mp gets what's left
		const p = budget >= want * (G.items[best].g || 1) ? best : CHEAP_POT[kind];
		const q = Math.min(want, Math.floor(budget / (G.items[p].g || 1)));
		if (q <= 0) { town_reason.restock = `can't afford ${kind} potions (${character.gold} gold)`; continue; }
		await wait_budget(1, RESERVE.errand);
		tag_spend("potions");
		await T(buy(p, q)).then(() => n++).catch((e) => game_log(`restock ${p}: ${why(e)}`));
	}
	return n;
}
