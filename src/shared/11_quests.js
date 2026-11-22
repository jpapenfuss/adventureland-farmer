// =====================================================================
// Quests (Cole & other quest NPCs), monster hunts
// =====================================================================
// Drop rates (chance per kill) for Cole's materials from the game's drop tables (design/drops.py), used only if
// the client's G.drops is missing. E.g. bees drop Bee Wings 1 in 100, goos Gooey Slime 1 in 1000.
const DROP_FALLBACK = { beewings: [["bee", 0.01]], gslime: [["goo", 0.001]], spores: [["minimush", 1 / 60]],
	crabclaw: [["crab", 0.001]], frogt: [["squigtoad", 1 / 400]], ascale: [["armadillo", 0.0008]], feather0: [["bigbird", 0.05]],
	dstones: [["stoneworm", 1 / 300]], pleather: [["porcupine", 0.001]], bfur: [["arcticbee", 0.001]], cscale: [["croc", 0.0009]] };
// [[monster, chance per kill], ...] for an item, from G.drops.monsters (entries are [chance, item, ...])
function drop_sources(item) {
	const out = [], mons = G.drops?.monsters;
	if (mons) for (const mt in mons) for (const d of mons[mt] || []) if (Array.isArray(d) && d[1] === item && typeof d[0] === "number") out.push([mt, d[0]]);
	return out.length ? out : DROP_FALLBACK[item] || [];
}
// Fighters sharing loot: the server gives each chest item to a random party member wherever it is, weighted by its xp
// share (equal among one account's fighters; the merchant's is 0). Our expected cut of any drop is 1 / party_n().
const party_n = () => 1 + (in_party_cfg() ? partners().length : 0);
// Best place to farm an item: the safe monster/area with the most items per second (chance × kills/s) — counted as
// the items that reach US (v23.1: ÷ party_n; quest times were ~n x too optimistic and stall checks fired early)
function best_source(item) {
	let best = null;
	for (const [mt, rate] of drop_sources(item)) {
		const f = fight_profile(mt);
		if (!f) continue;
		each_area((pack, area) => {
			if (pack.type !== mt) return;
			const est = Math.min(1 / (f.ttk + CFG.walk_overhead), area.count / expected_respawn(mt, pack)) * state.realism;
			const kps = meas_aged(pack_key(area), est * Math.max(1, f.xp)) / Math.max(1, f.xp); // measured (aged) xp/s ÷ xp per kill
			const ips = (rate * kps) / party_n();
			if (!best || ips > best.ips) best = { monster: mt, ...area, ips };
		});
	}
	return best;
}
// Copies we have anywhere: bags + worn + last seen in the bank
const owned = (name) =>
	character.items.reduce((n, i) => n + (i && i.name === name ? i.q || 1 : 0), 0) +
	Object.values(character.slots || {}).filter((i) => i && i.name === name).length + (state.bank_seen[name] || 0);
// Has the guide asked for this recipe within guide_quest_keep_h?
const is_guide_quest = (id) => CFG.guide_enabled && !!state.guide_quests[id] && Date.now() - (state.guide_quests[id].last || 0) < CFG.guide_quest_keep_h * 3600_000;
// v25.15: an own quest whose output is gear is worth farming only while that piece is an upgrade for us and we have no
// copy (bags or bank: bank_upgrades fetches a bank copy). The 4:09 AM report: the party committed to goo for Cole's
// Wanderer's Attire (~11,530 min), not an upgrade for it, and the bank held a wcap, a wbreeches and six wshoes. Each
// fighter judges its own quests; a piece a partner would wear stays that partner's goal (its heartbeat's goals).
// → the reason it's skipped, or null. 10 s cache (quest_recipes runs from several report lines and the goal picker).
let qskip_cache = { at: 0, m: new Map() };
function quest_skip_why(id) {
	if (Date.now() - qskip_cache.at > 10_000) qskip_cache = { at: Date.now(), m: new Map() };
	if (qskip_cache.m.has(id)) return qskip_cache.m.get(id);
	const out = G.craft[id]?.output?.name || id, d = G.items[out];
	let why = null;
	if (d && GEAR.has(d.type) && CFG.gear_auto) {
		if (held_any(out) > 0 || (state.bank_seen[out] || 0) > 0 || (state.bank_gear || []).some((i) => i.name === out)) why = "a copy is in our bags or the bank";
		else if (!gear_gain({ name: out, level: 0 }, character.ctype, my_gear())) why = "not an upgrade for us";
	}
	qskip_cache.m.set(id, why);
	return why;
}
// Quest recipes to work on, in order: guide quests (in the order the guide asked), then own quests (quest_crafts /
// quest_npcs). Skips outputs our class can't wear.
function quest_recipes() {
	const mode = CFG.quest_crafts;
	// v24.7: the merchant can't farm, so it never parked a quest and "wanted" every one: it fetched and kept the fighters'
	// materials from the bank (a slot each, its serving needs free slots) and they farmed them again
	if (!mode || is_merchant()) return [];
	const guide = [], own = [];
	for (const id in G.craft) {
		const r = G.craft[id];
		if (!r.quest || CFG.quest_craft_skip.includes(id)) continue;
		const out = r.output?.name || id;
		if (GEAR.has(G.items[out]?.type) && !can_wear(out)) continue; // e.g. quiver for a priest
		if (is_guide_quest(id)) { guide.push(id); continue; }
		if (Array.isArray(mode) ? !mode.includes(id)
			: !CFG.quest_npcs.includes(r.quest) || (mode === "materials" && r.items.some(([, n]) => GEAR.has(G.items[n]?.type)))) continue;
		if (!Array.isArray(mode) && quest_skip_why(id)) continue; // v25.15 (a list of ids is the owner's choice)
		own.push(id);
	}
	guide.sort((a, b) => state.guide_quests[a].first - state.guide_quests[b].first);
	if (Array.isArray(mode)) own.sort((a, b) => mode.indexOf(a) - mode.indexOf(b));
	return [...guide, ...own];
}
// wanted: not yet crafted quest_craft_max times and not owned (inputs stay in bags while wanted);
// open: wanted and actionable right now (not shelved, affordable)
function recipe_wanted(id) {
	const r = G.craft[id];
	return (state.crafted[id] || 0) < CFG.quest_craft_max && owned(r.output?.name || id) < CFG.quest_craft_max && !quest_parked(id);
}
// Hours to farm a quest's missing materials at our kill rates. Materials with no drop source (bought, crafted) and
// ones we can't fight for right now don't count: only a finite, slow estimate parks a quest (no churn on a bad minute)
function quest_eta_h(id) {
	let s = 0;
	for (const [q, n, l] of G.craft[id]?.items || []) {
		const have = owned_in_bags_or_bank(n, l);
		if (have >= q) continue;
		if (l || GEAR.has(G.items[n]?.type)) continue; // gear inputs come from upgrades/buys, not drops
		const src = best_source(n);
		if (!src || !(src.ips > 0)) continue;
		s += (q - have) / src.ips;
	}
	return s / 3600;
}
// Parked: farming it would take > quest_park_h (until it drops under quest_unpark_h); re-estimated every 10 min
const quest_park_cache = new Map(); // id -> { at, parked, eta }
function quest_parked(id) {
	if (!CFG.quest_park_h) return false;
	const c = quest_park_cache.get(id), now = Date.now();
	if (c && now - c.at < 600_000) return c.parked;
	quest_park_cache.set(id, { at: now, parked: c?.parked || false, eta: c?.eta }); // guards re-entry (best_source → needs)
	const eta = quest_eta_h(id), was = c?.parked || state.quest_park?.[id];
	const parked = was ? eta > CFG.quest_unpark_h : eta > CFG.quest_park_h;
	state.quest_park = state.quest_park || {};
	if (parked && !state.quest_park[id]) { game_log(`quest ${id}: ~${Number.isFinite(eta) ? Math.round(eta) + "h" : "no source"} to farm — parked, materials banked`, C.dim); log_ev("quest_park", { id, eta: Number.isFinite(eta) ? Math.round(eta) : null }); }
	if (parked) state.quest_park[id] = { at: state.quest_park[id]?.at || now, eta: Number.isFinite(eta) ? +eta.toFixed(1) : null };
	else if (state.quest_park[id]) { delete state.quest_park[id]; game_log(`quest ${id}: ~${Math.round(eta)}h now — unparked`, C.info); }
	quest_park_cache.set(id, { at: now, parked, eta });
	return parked;
}
function recipe_open(id) {
	return recipe_wanted(id) && !skipped("qc:" + id) && (G.craft[id].cost || 0) <= character.gold - CFG.gold_reserve;
}
// auto_craft needs ONE unlocked stack per input holding the full amount at the exact level
const has_inputs = (r) => r.items.every(([q, name, level]) =>
	character.items.some((i) => i && i.name === name && (i.level || 0) === (level || 0) && !i.l && (i.q || 1) >= q));
function next_quest_craft() {
	for (const id of quest_recipes()) if (recipe_open(id) && has_inputs(G.craft[id])) return id;
	return null;
}
// Craft every quest recipe whose inputs we hold, at its NPC (up to 10 per run), then wear the result if its slot is
// empty. A failure pauses that recipe 5 min (10 if its NPC can't be found).
async function quest_crafts() {
	let n = 0, id;
	while ((id = next_quest_craft()) && n < 10) {
		if (character.esize < 1) { game_log(`craft ${id}: no free slot`, C.dim); break; }
		const r = G.craft[id];
		if (!has_computer()) {
			const loc = find_npc(r.quest);
			if (!loc) { skip("qc:" + id, 600_000); break; }
			if (character.map !== loc.map || Math.hypot(character.x - loc.x, character.y - loc.y) > 250) await go({ map: loc.map, x: loc.x, y: loc.y + NPC_STAND_Y }); // walk if > 250px away
		}
		await wait_budget(1, RESERVE.errand);
		tag_spend("crafting");
		const res = await T(auto_craft(id)).catch((e) => e);
		const ok = res && !res.failed && !res.reason;
		game_log(`craft ${id} at ${G.npcs[r.quest]?.name || r.quest}: ${ok ? "OK" : "FAILED " + why(res)}`, ok ? C.ok : C.bad);
		if (!ok) { skip("qc:" + id, 300_000); break; }
		n++;
		state.crafted[id] = (state.crafted[id] || 0) + 1;
		save_state();
		await sleep_ms(400); // let the crafted item arrive in the bags
		await equip_if_empty(r.output?.name || id);
	}
	return n;
}
// Equipment type → slots it can go in
const SLOT_FOR = { helmet: ["helmet"], chest: ["chest"], pants: ["pants"], gloves: ["gloves"], shoes: ["shoes"],
	cape: ["cape"], belt: ["belt"], amulet: ["amulet"], orb: ["orb"], ring: ["ring1", "ring2"], earring: ["earring1", "earring2"],
	quiver: ["offhand"], shield: ["offhand"], source: ["offhand"], misc_offhand: ["offhand"] };
// Wear a freshly crafted piece only if its slot is empty (never replaces gear you or the guide chose)
async function equip_if_empty(name) {
	const def = G.items[name];
	if (!def || !can_wear(name) || character.ctype === "merchant") return;
	const slot = (SLOT_FOR[def.type] || []).find((sl) => sl in (character.slots || {}) && !character.slots[sl]);
	const k = character.items.findIndex((i) => i && i.name === name);
	if (!slot || k < 0) return;
	const main = character.slots.mainhand && G.items[character.slots.mainhand.name];
	if (slot === "offhand" && main?.wtype && (G.classes[character.ctype]?.doublehand || {})[main.wtype]) return; // two-hander
	await wait_budget(EMIT_COST.equip, RESERVE.errand);
	await T(equip(k, slot)).then(() => game_log(`equipped ${name} → ${slot}`, C.ok)).catch((e) => game_log(`equip ${name}: ${why(e)}`, C.dim));
}
// Material count for a recipe: bags at that level, plus the bank's last-seen count for +0 materials
const owned_in_bags_or_bank = (n, l) => held(n, l) + (l ? 0 : bank_share(n));
function bank_share(n) {
	const pool = state.bank_seen[n] || 0;
	if (!pool || is_merchant() || !in_party_cfg()) return pool;
	const mine = Math.max(0, (state.needs.get(n) || 0) - held_any(n));
	const claims = [...(mine > 0 ? [{ name: character.name, s: mine }] : []),
		...partners().filter((p) => p.qshort?.[n] > 0).map((p) => ({ name: p.name, s: p.qshort[n] }))].sort((a, b) => (a.name < b.name ? -1 : 1));
	let left = pool;
	for (const c of claims) { const take = Math.min(left, c.s); if (c.name === character.name) return take; left -= take; }
	return left; // not short of it ourselves (crafting materials...): what the members short of it leave
}
// Visit Daisy when we have no hunt or a finished one (h.c = kills left)
const hunt_due = () => {
	const h = character.s.monsterhunt;
	return (CFG.auto_monster_hunt || CFG.hunt_passive) && character.ctype !== "merchant" && (!h || h.c === 0) && !skipped("hunt:auto");
};
// Daisy: one call turns in a finished hunt ({completed}) or starts a new one ({started}); after a turn-in we call again
// right away so the next hunt starts on the same visit (at most 2 calls)
async function run_hunt() {
	await go_npc("monsterhunter");
	let r;
	for (let i = 0; i < 2; i++) {
		await wait_budget(1, RESERVE.errand);
		r = await T(interact("monsterhunt"));
		if (r?.completed) { game_log("Monster hunt turned in (+monstertoken)", C.info); await sleep_ms(300); continue; } // 300ms: let
// the turn-in's player update arrive before asking again
		break;
	}
	const h = character.s.monsterhunt;
	if (r?.started) game_log(`Monster hunt: ${h?.c ?? "?"}x ${h?.id ?? "?"}`, C.info);
	return r;
}
// ---- World bosses (CFG.boss) ----
// team "all" (v23.1, the default): every online member counts wherever it is — a boss target gathers the party.
// boss_tick only engages once everyone is there and it's safe with them (team "party").
function boss_safe(name, team = "all") {
	const m = G.monsters[name];
	const f = m && fight_math({ ...m, hp: 1, "1hp": false }, true, team); // their side of the fight only
	if (!f) return false;
	if ((f.their_dps + f.self_dps) * CFG.boss.tank_s > f.hp_pool * safety_now() * heal_mult(f)) return false;
	const squish = Math.min(character.max_hp, ...fight_mates(team).map((p) => p.max_hp || Infinity));
	return f.their_dps / (m.frequency || 1) <= squish * CFG.boss.one_hit;
}
// ---- Server events (CFG.events) ----
// parent.S comes in two shapes: one key per live event/boss ({ goobrawl: {...}, snowman: { live, map, x, y } }), or
// (current live servers) { schedule, event_flags, event_ends, ... }. ev_info(name) reads either.
function ev_info(name) {
	const S_ = (typeof parent !== "undefined" && parent.S) || {};
	if (S_[name]) return S_[name];
	const flag = S_.event_flags?.[name], end = S_.event_ends?.[name];
	if (flag || (end && Date.parse(end) > Date.now())) return { live: true, end };
	return null;
}
// Are we at the event? goobrawl: on its map; others: within 800px of the event's reported position
function event_here(name) {
	const ev = CFG.events[name], e = ev_info(name);
	if (ev.map) return character.map === ev.map;
	return !!e && e.map === character.map && Number.isFinite(e.x) && Math.hypot(e.x - character.x, e.y - character.y) < 800;
}
