// =====================================================================
// merchant/2_stand.js — merchant only (src/manifest.json): the stand (it lists only what the owner names in
// CFG.merchant.stand.list, plus Merrit's decoy: one health potion at an absurd price), Merrit's parcels (they need a
// listing), what the merchant sells (only with sell_junk)
// =====================================================================
// Fixed NPCs on Mainland (roamers — citizens, ones with a boundary or a loop — don't count)
function fixed_npcs() {
	const out = [];
	for (const n of G.maps.main?.npcs || []) {
		if (/^citizen/.test(n.id || "") || n.boundary || n.loop) continue;
		if (Array.isArray(n.position)) out.push(n.position);
		for (const p of n.positions || []) if (Array.isArray(p)) out.push(p);
	}
	return out;
}
// Can a stand stand here? Region, NPC and stand spacing, and walkable straight from (0,0) (Merrit's centre)
function spot_ok(x, y, keep = true) {
	const M = CFG.merchant.merrit;
	if (!in_rect(x, y, M.square) && !in_rect(x, y, M.aisle)) return false;
	if (fixed_npcs().some(([nx, ny]) => Math.hypot(nx - x, ny - y) <= M.npc_gap)) return false;
	for (const e of Object.values(parent.entities || {})) {
		if (!e || e.type !== "character" || !e.stand || e.name === character.name || e.map && e.map !== "main") continue;
		const dx = Math.abs(e.x - x), dy = Math.abs(e.y - y);
		if (Math.hypot(dx, dy) <= M.stand_gap || (dx <= M.stand_gap && dy <= M.stand_vgap)) return false;
		// v25.28 (owner): keep our distance from other merchants' stands, well past the server's 10 px rule. A stand that
		// sets up within keep_px of ours later makes our spot not ok: we move to the next one (Merrit's 2 minutes restart)
		if (keep && Math.hypot(dx, dy) < (M.keep_px || 0)) return false;
	}
	if (typeof can_move === "function") {
		try { if (!can_move({ map: "main", x: 0, y: 0, going_x: x, going_y: y, base: character.base || { h: 8, v: 7, vn: 2 } })) return false; } catch (e) {}
	}
	return true;
}
// Our spot: the saved one while it still qualifies, else the qualifying grid point nearest (0,0)
function merrit_spot() {
	const M = CFG.merchant.merrit;
	if (state.mspot && spot_ok(state.mspot.x, state.mspot.y)) return state.mspot;
	const pts = [];
	for (const r of [M.square, M.aisle]) for (let x = r[0]; x <= r[2]; x += M.step) for (let y = r[1]; y <= r[3]; y += M.step) pts.push([x, y]);
	pts.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
	let p = pts.find(([x, y]) => spot_ok(x, y));
	// v25.28: the square too crowded for keep_px — the valid spot farthest from every other stand
	if (!p) {
		const stands = Object.values(parent.entities || {}).filter((e) => e?.type === "character" && e.stand && e.name !== character.name && (!e.map || e.map === "main"));
		const gap = ([x, y]) => Math.min(Infinity, ...stands.map((e) => Math.hypot(e.x - x, e.y - y)));
		p = pts.filter(([x, y]) => spot_ok(x, y, false)).sort((a, b) => gap(b) - gap(a))[0];
	}
	state.mspot = p ? { x: p[0], y: p[1] } : null;
	if (p) game_log(`merrit: stand spot ${p[0]},${p[1]}`, C.dim);
	return state.mspot;
}
function merrit_on() { return is_merchant() && !!CFG.merchant.merrit?.enabled; }
// Parcel arrivals (any item named "Market Parcel"): counted every 30s on the merchant
let parcel_ids = null, parcels_prev = null;
function parcel_count() {
	if (!parcel_ids) parcel_ids = Object.keys(G.items).filter((n) => /market parcel/i.test(G.items[n]?.name || ""));
	return parcel_ids.reduce((a, n) => a + held_any(n), 0);
}
setInterval(() => {
	if (!merrit_on()) return;
	const n = parcel_count();
	if (parcels_prev !== null && n > parcels_prev) { state.parcel_at = Date.now(); log_ev("parcel", { n: n - parcels_prev }); game_log(`merrit: Market Parcel received`, C.ok); }
	parcels_prev = n;
	if (!character.stand || character.moving || walking()) state.stand_since = 0;
	else if (!state.stand_since) state.stand_since = Date.now();
}, 30_000);
const unit_value = (it) => {
	const f = typeof calculate_item_value === "function" ? calculate_item_value : parent?.calculate_item_value;
	return Math.max(1, Math.round(f ? f({ ...it, q: 1 }) : (G.items[it.name]?.g || 0) * 0.6));
};
function stand_worthy(it, k, needed, cmp) {
	const d = it && G.items[it.name], S_ = CFG.merchant.stand;
	if (!d || it.l || it.b || needed.has(k) || cmp.has(k) || CFG.keep.includes(it.name) || !tradeable(it.name) || gear_wanted_by(it)) return false;
	if (!(S_.list || []).includes(it.name)) return false; // v25.15: only what the owner lists
	return unit_value(it) >= S_.min_value || (GEAR.has(d.type) && (it.level || 0) >= 3) || item_grade(it) >= 1 || !!it.p;
}
// Bag slots held back for the stand: the most valuable candidates, as many as there are free trade slots
let stand_cache = null;
function stand_hold() {
	if (!CFG.merchant?.stand?.enabled || !is_merchant()) return new Set();
	const key = character.items.map((i) => (i ? i.name + (i.level || 0) + (i.q || 1) : "")).join() + Object.keys(state.stand).length;
	if (stand_cache && stand_cache.key === key && Date.now() - stand_cache.at < 2000) return stand_cache.set;
	const needed = needed_slots(), cmp = compound_slots(needed), free = TRADE_SLOTS.length - Object.keys(state.stand).length;
	const ks = character.items.map((it, k) => (stand_worthy(it, k, needed, cmp) ? k : -1)).filter((k) => k >= 0)
		.sort((a, b) => unit_value(character.items[b]) - unit_value(character.items[a])).slice(0, Math.max(0, free));
	stand_cache = { key, at: Date.now(), set: new Set(ks) };
	return stand_cache.set;
}
async function stand_close() {
	if (!character.stand || typeof close_stand !== "function") return;
	await T(close_stand(), 3000).catch(() => {});
	await until(() => !character.stand, 2000);
}
// Idle at home: open the stand, notice sales, cut stale prices, list new stock (one listing action per call)
let stand_busy = false;
async function stand_tick() {
	const S_ = CFG.merchant.stand;
	if (!S_?.enabled || stand_busy || walking() || errand_busy()) return;
	stand_busy = true;
	try {
		const now = Date.now(), sl = character.slots || {};
		// sales: a listing whose slot emptied (we only take items down by re-listing, which updates state first)
		if (character.stand) for (const slot in state.stand) { // trade slots are only reliable while the stand is open
			const L_ = state.stand[slot], cur = sl[slot];
			const unit = L_.per_unit ? L_.price : L_.price / Math.max(1, L_.q);
			// v24.7: with per-unit prices a buyer can take part of a stack: the slot keeps the item with a smaller q
			if (cur && cur.name === L_.name && (cur.q || 1) < (L_.q || 1)) {
				const q_s = (L_.q || 1) - (cur.q || 1);
				log_ev("sold", { item: `${L_.name}+${L_.level}`, q: q_s, price: Math.round(unit * q_s) });
				game_log(`stand: sold ${q_s} of ${L_.name} for ${fmt_k(Math.round(unit * q_s))}`, C.gold || C.ok);
				L_.q = cur.q || 1;
				continue;
			}
			if (cur && cur.name === L_.name) continue;
			{
				log_ev("sold", { item: `${L_.name}+${L_.level}`, q: L_.q, price: Math.round(unit * (L_.q || 1)) });
				game_log(`stand: sold ${L_.name}+${L_.level}${L_.q > 1 ? " x" + L_.q : ""} for ${fmt_k(Math.round(unit * (L_.q || 1)))}`, C.gold || C.ok);
				delete state.stand[slot];
			}
		}
		if (!character.stand) {
			let k = character.items.findIndex((i) => i && G.items[i.name]?.stand);
			if (k < 0) {
				if (skipped("stand:buy") || character.gold < (G.items[S_.item]?.g || 40000) + CFG.merchant.donate.keep) return;
				skip("stand:buy", 6 * 3600_000, "buying a stand");
				await buy_from_npc(S_.item, 1).catch((e) => game_log(`stand: buying ${S_.item}: ${why(e)}`, C.dim));
				return;
			}
			await T(open_stand(k), 3000).catch(() => {});
			return;
		}
		// v25.15: a listing of an item the owner hasn't listed (from before stand.list, or taken off the list) comes down
		for (const slot in state.stand) {
			if (state.stand[slot].decoy) continue; // v25.26: Merrit's listing stays up
			const L_ = state.stand[slot];
			if ((S_.list || []).includes(L_.name)) continue;
			if (sl[slot]) await T(unequip(slot), 5000).then(() => game_log(`stand: took ${L_.name}+${L_.level || 0} down — not on the owner's stand list`, C.dim)).catch(() => {});
			if (!(character.slots || {})[slot]) delete state.stand[slot]; // still up (unequip failed): retried next tick
			return;
		}
		// v19.7: a listed piece that's now an upgrade for one of us comes off the stand
		for (const slot in state.stand) {
			const cur = sl[slot];
			if (!cur || !GEAR.has(G.items[cur.name]?.type) || !wanted_by_member(cur)) continue;
			await T(unequip(slot), 5000).then(() => game_log(`stand: took ${cur.name}+${cur.level || 0} down — an upgrade for the party`, C.ok)).catch(() => {});
			delete state.stand[slot];
			return;
		}
		// price cuts: re-list at the lower price
		for (const slot in state.stand) {
			const L_ = state.stand[slot];
			if (L_.decoy) continue; // v25.26: Merrit's listing keeps its price
			// v24.5: the server's price is per unit (a buyer pays price x q); stacks were listed at q times their value.
			// A stack listed before (no per_unit) is re-listed at once at the per-unit price.
			const old = L_.q > 1 && !L_.per_unit;
			if (!old && now - (L_.cut_at || L_.at) < S_.cut_every_h * 3600_000) continue;
			const min_price = Math.ceil(L_.value * S_.floor);
			const next = old ? Math.ceil(L_.value * S_.markup) : Math.max(min_price, Math.floor(L_.price * (1 - S_.cut)));
			L_.cut_at = now;
			if (next >= L_.price) { L_.per_unit = true; continue; }
			await T(unequip(slot), 5000).catch(() => {});
			const k = character.items.findIndex((i) => i && i.name === L_.name && (i.level || 0) === L_.level);
			if (k < 0) { delete state.stand[slot]; return; }
			await T(trade(k, slot, next, L_.q), 5000).then(() => { L_.price = next; L_.per_unit = true; game_log(`stand: ${L_.name} now ${fmt_k(next)}${L_.q > 1 ? " each" : ""}`, C.dim); })
				.catch(() => delete state.stand[slot]);
			return;
		}
		// v25.26 (owner): Merrit gives a parcel only to a stand with a listing (server: market_patron.js hasListing — a
		// trade slot holding an item with a price > 0). With the owner's list empty, one common item (stand.decoy: a
		// health potion) is listed at an absurd price nobody pays, so there's always a listing.
		// (Bought anyway: the sale is logged like any other, at that price, and another potion goes up.) A failed listing
		// pauses the decoy 10 min and the owner's listings carry on; no potion in the bags is logged once an hour.
		const D_ = S_.decoy;
		if (D_?.name && !skipped("stand:decoy") && !Object.values(state.stand).some((L) => L.decoy)) {
			const ds = TRADE_SLOTS.find((t) => !sl[t] && !state.stand[t]), dk = character.items.findIndex((i) => i && i.name === D_.name && !i.l);
			if (ds && dk < 0) { skip("stand:decoy", 3_600_000, `no ${D_.name} in the bags`); game_log(`stand: no ${D_.name} in the bags for Merrit's listing`, C.dim); }
			else if (ds) {
				await wait_budget(1, RESERVE.errand);
				const ok = await T(trade(dk, ds, D_.price, 1), 5000).then(() => true).catch((e) => {
					skip("stand:decoy", 600_000, why(e)); game_log(`stand: listing the ${D_.name} for Merrit: ${why(e)} (again in 10 min)`, C.dim); return false; });
				if (ok) {
					state.stand[ds] = { name: D_.name, level: 0, q: 1, price: D_.price, value: D_.price, at: now, per_unit: true, decoy: true };
					game_log(`stand: listed 1 ${D_.name} at ${fmt_k(D_.price)} (for Merrit's parcels; nobody will pay that)`, C.dim);
					return;
				}
			}
		}
		// new listing
		const slot = TRADE_SLOTS.find((t) => !sl[t] && !state.stand[t]);
		const k = [...stand_hold()][0];
		if (!slot || k === undefined) return;
		const it = character.items[k], q = it.q || 1, value = unit_value(it), price = Math.ceil(value * S_.markup); // per unit
		await wait_budget(1, RESERVE.errand);
		await T(trade(k, slot, price, q), 5000).then(() => {
			state.stand[slot] = { name: it.name, level: it.level || 0, q, price, value, at: now, per_unit: true };
			stand_cache = null;
			game_log(`stand: listed ${it.name}+${it.level || 0}${q > 1 ? " x" + q : ""} at ${fmt_k(price)}${q > 1 ? " each" : ""} (value ${fmt_k(value)}${q > 1 ? " each" : ""})`, C.dim);
		}).catch((e) => game_log(`stand: listing ${it.name}: ${why(e)}`, C.dim));
	} finally { stand_busy = false; }
}
// ---- from the shared code (v24.95–v25.6): used by the merchant only ----
// Item types that always stay in the bags: consumables, scrolls, tools, keys
// Item types the bot may ever sell, list on the stand or purge from the bank: gear, plain materials, gems. Everything
// else (dungeon keys, licences, cosmetics, quest items, tomes, flutes, containers...) is only ever kept or banked.
const TRADE_TYPES = new Set(["material", "gem"]);
const tradeable = (name) => { const d = G.items[name]; return !!d && (GEAR.has(d.type) || TRADE_TYPES.has(d.type)) && !recipe_input(name); };
// ---- from the shared code (v24.95–v25.6): used by the merchant only ----
// ---- Stand (CFG.merchant.stand) ----
const TRADE_SLOTS = Array.from({ length: 16 }, (_, i) => "trade" + (i + 1));
// ---- bag_class's merchant sells (v25.5): pieces pulled from the bank by a purge, dead compound pieces (sell_junk only) ----
function merchant_sells(item) {
	if (!CFG.sell_junk) return false;
	if (Date.now() - (state.purge[purge_key(item)] || 0) < 86_400_000) return true;
	return !!(CFG.merchant.sell_dead_compounds && dead_compound(item)); // v24.15
}
// ---- from the shared code (v24.95–v25.6): used by the merchant only ----
// A compound piece at its ceiling that no member wants: it can't go further and nobody wears it (v24.15). The merchant
// sells it (an NPC pays its value: ~134k for an Amulet of HP +2) — it held 12 of those, refetched every 6h.
function dead_compound(it) {
	const def = it && G.items[it.name];
	return !!def?.compound && !it.l && !it.b && !it.p && (it.level || 0) > 0 && (it.level || 0) >= cmp_top(it.name) &&
		!CFG.keep.includes(it.name) && !wanted_by_member(it);
}
