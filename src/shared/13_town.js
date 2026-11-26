// =====================================================================
// Town run: one errand doing everything due, in walking order
// =====================================================================
let bags_warned = 0; // last "bags full and nothing to bank" warning (repeated at most every 10 min)
// The tasks a town run can do. town_due() also returns plan/min_free/pot_min/relaxed — never derive "what's due" from
// its truthy keys: the numeric fields would make a town run permanently due.
const TOWN_TASKS = ["hunt", "tokens", "craft", "guide", "compound", "upgrade", "stat", "forge", "exchange", "elixir", "sell", "restock", "bank"];
const due_tasks = (due) => TOWN_TASKS.filter((k) => due[k]);
// A trip that can't wait: nearly full bags, bags short with something to sell/bank, potions low. (Hunts: the tank's party
// rule, hunts_trip_due — fighter/5_town.js.)
const town_urgent = (due) => character.esize <= 3 ? `bags ${character.esize} free` : due.restock ? "potions" :
	(due.plan.free < due.min_free && (due.sell || (due.bank && due.plan.bank.length > 0))) ? `bags short (${due.plan.free} free)` : "";
// Town trips in the last hour on this version: what triggered each (v18.6) and what was due on them.
// span: minutes covered (less than 60 right after an update)
function town_causes(ms = 3600_000) {
	const all = hist.ev.filter((e) => e.type === "town" && Date.now() - e.t < ms);
	const ev = all.filter((e) => e.v === VERSION), by = {}, trig = {};
	for (const e of ev) {
		for (const w of (e.due || "").split("+").filter(Boolean)) by[w] = (by[w] || 0) + 1;
		const t = e.trig || "?"; trig[t] = (trig[t] || 0) + 1;
	}
	const first = hist.ev.find((e) => e.v === VERSION && e.type === "loaded")?.t;
	const span = Math.round(Math.min(ms, Date.now() - (first && first > Date.now() - ms ? first : Date.now() - ms)) / 60_000);
	const sort = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
	return { n: ev.length, older: all.length - ev.length, span, by: sort(by), trig: sort(trig) };
}
// relaxed: the partner is already in town, so use the trip — bank at < bag_min_free × sync_factor free slots,
// restock potions below pot_min × sync_factor
// What a town run would do now (see TOWN_TASKS). sell/bank only when bags are short (or, with a computer, once
// sell_batch junk items pile up); bank also when needed items wait in the bank.
// Town tasks that came due but achieved nothing pause 15 min (town:<task>), so one stuck task can't drive the loop brake
const compound_town_due = () => !skipped("town:compound") && compound_groups().some((g) => g.bags.length >= 3);
const forge_town_due = () => { if (skipped("town:forge")) return false; const c = craft_pick(); return !!c && craft_inputs_in_bags(c.id); };
function town_due(relaxed = false) {
	const plan = bag_plan();
	let min_free = relaxed ? CFG.bag_min_free * CFG.party.sync_factor : CFG.bag_min_free;
	let pot_min = relaxed ? CFG.pot_min * CFG.party.sync_factor : CFG.pot_min;
	if (merchant_recent()) { min_free = Math.min(min_free, CFG.merchant.fighter_min_free); pot_min = Math.min(pot_min, CFG.merchant.fighter_pot_min); }
	const short = plan.free < min_free;
	if (plan.free === 0 && !plan.sell.length && !plan.bank.length && Date.now() - bags_warned > 600_000) {
		bags_warned = Date.now();
		game_log("Bags full and everything in them is marked keep — run report() to see why", C.bad);
	}
	const due = {
		hunt: hunt_due(),
		craft: !!next_quest_craft(),
		compound: compound_town_due(),
		upgrade: !skipped("town:upgrade") && upgrade_due(),
		forge: forge_town_due(),
		stat: !skipped("town:stat") && !!stat_scroll_list().find((r) => r.ok),
		tokens: !skipped("town:tokens") && !!token_pick(),
		exchange: !skipped("town:exchange") && exchange_pick() >= 0,
		elixir: elixir_buy_due(),
		guide: !!next_guide_row(state.guide),
		sell: !skipped("town:sell") && plan.sell.length > 0 && (short || (has_computer() && plan.sell.length >= CFG.sell_batch) ||
			(is_merchant() && plan.sell.some((k) => character.items[k] && (state.purge[purge_key(character.items[k])] || sell_plain_item(character.items[k]))))),
		restock: !skipped("town:restock") && (pot_count("hp") < pot_min || pot_count("mp") < pot_min),
		// fetches of our bank upgrades alone don't send us while the merchant is online: it fetches and delivers them
		bank: !skipped("town:bank") && CFG.bank && ((short && plan.free + plan.sell.length < min_free && plan.bank.length > 0) ||
			plan.fetch.some((f) => !(merchant_recent() && String(f.key || "").startsWith("gear:")))),
		plan, min_free, pot_min, relaxed,
	};
	// merchant online: a fighter doesn't walk to town for guide steps alone more than once per guide_gap_ms; they're
	// done on the next trip that happens for another reason
	if (merchant_recent() && due.guide && !due_tasks(due).some((k) => k !== "guide") &&
		Date.now() - (state.last_town || 0) < CFG.merchant.guide_gap_ms) due.guide = false;
	return due;
}
// state.town_end_at: when the last run finished (the soft gap counts from there, not from leaving)
function town_run(due) {
	return errand("town", async () => {
		try { await town_body(due); } finally {
			state.town_end_at = Date.now();
			await ptown_wait().catch(() => {}); // v24.28: everyone on the trip walks back together
		}
	});
}
async function town_body(due) {
	{
		await stand_close(); // a stand slows us to speed 10
		// v24.61: a party fighter never teleports to town (the others walk); the tank walks there with the party behind it
		if (ptown_on()) { if (!is_follower()) await ptown_lead(); } else await town_hop().catch(() => 0);
		// each step refreshes the errand lock: a long run that keeps making progress is never taken for a hung one (other
		// code would then start a walk and interrupt this run's smart_move)
		const step = async (label, fn) => { state.errand_at = Date.now(); try { return await fn(); } catch (e) { town_reason[label] = town_reason[label] || why(e); game_log(`${label}: ${why(e)}`, C.dim); } };
		// step: run one task, record why it failed (for report()), never let one failure end the run.
		// A task that achieves nothing (bank full, item on another bank floor, no gold) pauses 15 min,
		// so an unfixable condition can't send us to town every town_min_gap_ms
		const bag_step = async (key, fn) => {
			delete town_reason[key];
			const n = (await step(key, fn)) || 0;
			if (!n) skip("town:" + key, 900_000, town_reason[key] || "achieved nothing");
			return n;
		};
		let did = 0;
		const town_t0 = Date.now();
		if (collect_list(true).length) did += (await step("collect", task_collect)) || 0; // v24.75
		if (worn_for_me()) did += (await step("handover", task_worn_handover)) || 0; // v25.39
		if (due.hunt) did += await hunt_step(step);
		if (!skipped("town:tokens") && token_pick()) did += await bag_step("tokens", task_tokens); // Daisy: next to the hunt
		if (due.craft) did += (await step("craft", quest_crafts)) || 0;
		// Guide steps: keep going while the next row is local (no walking); rows that walk count toward the cap;
		// a failed row is paused and we move on to the next one instead of ending the run
		if (due.guide) for (let i = 0, far = 0, fails = 0; i < 60; i++) {
			if (character.rip || state.recovering || character.hp < character.max_hp * 0.5) break;
			const row = next_guide_row(guide_refresh());
			if (!row) break;
			const local = row_is_local(row);
			if (!local && far >= CFG.guide_steps_per_run) break;
			if (!local) far++;
			if (await step("guide", () => guide_step(row))) did++;
			else if (++fails >= 5) break;
		}
		guide_refresh(); // needs may have changed (crafted, upgraded) before deciding what to bank
		if (compound_town_due()) did += await bag_step("compound", task_compound);
		if (!skipped("town:upgrade") && upgrade_due()) did += await bag_step("upgrade", task_upgrade);
		if (!skipped("town:stat") && stat_scroll_list().some((r) => r.ok)) did += await bag_step("stat", task_stat);
		if (forge_town_due()) did += await bag_step("forge", task_craft_power);
		if (!skipped("town:exchange") && exchange_pick() >= 0) did += await bag_step("exchange", task_exchange);
		if (elixir_buy_due()) did += await bag_step("elixir", task_elixir);
		// Still in the bank after the guide's retrieves: store/fetch now, before walking anywhere else
		let banked = false;
		if (CFG.bank && on_bank_floor() && !skipped("town:bank")) {
			const here = bag_plan();
			if (here.bank.length || here.fetch.length) { did += await bag_step("bank", () => task_bank(here.fetch)); banked = true; }
		}
		const plan = bag_plan();
		const short = plan.free < (due.min_free || CFG.bag_min_free);
		if (due.sell || (short && plan.sell.length && !skipped("town:sell"))) did += await bag_step("sell", task_sell);
		// in town anyway: top potions up well before they'd run low (else a potion trip follows this one)
		const topup = Math.ceil(CFG.pot_buy * CFG.town_topup);
		if (due.restock) did += await bag_step("restock", () => task_restock(due.pot_min));
		else if (!is_merchant() && !skipped("town:restock") && (pot_count("hp") < topup || pot_count("mp") < topup)) did += (await step("restock", () => task_restock(topup))) || 0;
		const after = bag_plan();
		// standing in the bank anyway (guide retrieves): store what's bankable now, short on space or not
		// in town anyway: store everything bankable (not only when short), so a bag trip doesn't follow this one
		if (CFG.bank && !banked && !skipped("town:bank") && ((after.free < 2 * Math.max(due.min_free || 0, CFG.bag_min_free) || on_bank_floor()) && after.bank.length || after.fetch.length))
			did += await bag_step("bank", () => task_bank(after.fetch));
		// the bank visit may have fetched the missing copies of a group: compound now, while still in town
		if (compound_town_due()) did += await bag_step("compound", task_compound);
		// ...or a set piece to upgrade (v24.69)
		if (!skipped("town:upgrade") && upgrade_due()) did += await bag_step("upgrade", task_upgrade);
		state.last_pick = 0; // re-evaluate where to fight
		state.last_town_did = did; // v24.92: the loop brake spares a merchant whose runs get work done
		log_ev("town", { due: due_tasks(due).join("+"), did, secs: Math.round((Date.now() - town_t0) / 1000), trig: state.town_trig || "?", v: VERSION });
		return did;
	}
}

// ---- Party town trips (v24.28, CFG.party.town_together) ----
// state.ptown: { id, by (who started it), at, leavers (members known to be going), pending (we'll go once free),
// joined (we went: our heartbeat pt), done (our work's finished: waiting in town), why (why we went / stayed) }
// ptown_on(): role function (v25.11, fighter/5_town.js; the merchant never joins a party trip)
// The town teleport (to this map's spawn: server transport_player_to(player, player.in)) when it cuts the walk to
// main's town by town_hop_px. 3s channel; a hit or a move cancels it, and it fails with more than 5 monsters on us.
// Channel the town teleport (3s) to this map's spawn: true if we arrived
async function town_teleport() {
	if (walking()) { halt("town_teleport"); }
	state.town_at = Date.now();
	await T(use_skill("use_town"), 8000).catch(() => {});
	await until(() => !character.c?.town && Date.now() - state.town_at > 1500, 6000);
	return at_town_spot();
}
async function town_hop() {
	if (!CFG.town_hop || character.rip || typeof use_skill !== "function" || hit_on_me()) return 0;
	const town = dest_point("main"), sp = dest_point(character.map);
	if (!town || !sp) return 0;
	const here = route_to(town.map, town.x, town.y), there = route_to(town.map, town.x, town.y, sp);
	if (!here || !there || here.d - there.d < CFG.town_hop_px) return 0;
	const ok = await town_teleport();
	game_log(ok ? `town: teleported (~${Math.round(here.d - there.d)}px less walking)` : "town: the teleport didn't happen; walking", C.dim);
	return ok ? 1 : 0;
}
// Starts a town run when something is due. Blockers are recorded (report() shows them; with a nearly full bag the
// log says so every 5 min). Nearly full bags lower the HP floor and ignore attackers, and a patrol walk yields to
// town — otherwise a priest hovering at 60-70% HP, or a patrol between waypoints, can farm with a full bag for hours.
let town_block_logged = 0; // last "town needed but waiting" log (at most every 5 min)
function town_check() {
	if (ptown_join_tick()) return; // v24.28: a member's trip we're going on
	if (Date.now() - state.last_town < CFG.town_min_gap_ms) return;
	if (skipped("town:loop") && character.esize > 3) return;
	const townies = partners().filter((p) => p.errand === "town").map((p) => p.name);
	const due = town_due(townies.length > 0); // a member in town → share the trip
	const what = due_tasks(due);
	if (party_trip_check(due, what)) return; // v24.99: the tank's party trips (fighter/)
	if (!what.length) return void (state.town_block = null);
	// A member's own hunt never starts a trip by itself: the tank's party trip goes once every completable hunt in the
	// party is ready (v25.59, owner; party_trip_check). Stat scrolls alone wait too (v24.77).
	if (what.every((k) => k === "hunt" || k === "stat")) return void (state.town_block = { what: what.join("+"), blockers: ["a hunt or stat scrolls alone wait for the party's hunt trip or the next trip"], at: Date.now() });
	const critical = character.esize <= 3; // nearly full bags: go even when attacked or lower on HP
	// deferrable-only work (no bag/potion shortage, no hunt) waits town_soft_gap_ms; the next trip does it anyway
	if (fighter_defers_town(due, what)) return; // v25.5: fighter/ — work that can wait
	const attacked = !!get_nearest_monster({ target: character.name });
	const floor = critical ? CFG.town_hp_critical : CFG.town_hp;
	const blockers = [];
	if (errand_busy()) blockers.push(`errand ${state.errand}`);
	if (attacked && !critical) blockers.push("under attack");
	if (character.hp < character.max_hp * floor) blockers.push(`HP ${Math.round((character.hp / character.max_hp) * 100)}% < ${floor * 100}%`);
	// a patrol/pack walk yields to town — only when nothing else holds the trip (v24.4: stopped every tick otherwise, and
	// with HP under the floor the walk to the pack froze until regen)
	if (!blockers.length && walking() && !errand_busy()) { halt("town_check"); blockers.push("stopping a pack walk"); }
	state.town_block = { what: what.join("+"), blockers, at: Date.now() };
	if (blockers.length) {
		if (critical && Date.now() - town_block_logged > 300_000) {
			town_block_logged = Date.now();
			game_log(`Town needed (${what.join("+")}, ${due.plan.free} free) but waiting: ${blockers.join(", ")}`, C.warn);
		}
		return;
	}
	// Loop brake: more than 6 runs in 10 minutes means something keeps coming back due — pause non-critical runs
	state.town_runs = (state.town_runs || []).filter((t) => Date.now() - t < 600_000);
	// (v24.92: not the merchant while its runs get work done — 6 runs of upgrades in 10 min paused it 15 min, idle with 12M)
	// (v25.48, owner: "The merchant should never be rate limited in town trips; he lives there": never the merchant)
	if (state.town_runs.length >= 6 && !critical && !is_merchant()) {
		if (!skipped("town:loop")) {
			skip("town:loop", 900_000, `${state.town_runs.length} runs in 10 min; last due: ${what.join("+")}`);
			game_log(`Town: ${state.town_runs.length} trips in 10 min (${what.join("+")} keeps coming back) — pausing town trips 15 min. Send report().`, C.bad);
		}
		return;
	}
	state.town_runs.push(Date.now());
	state.last_town = Date.now();
	state.town_trig = town_urgent(due) || (due.relaxed ? "joined a member's trip" : "deferrable");
	game_log(`Town: ${what.join("+")} (${due.plan.free} free${due.relaxed ? ", with " + townies.join(", ") : ""})`, C.dim);
	if (town_run(due)) ptown_start(what);
}

// v25.59: Daisy's step. Success is a hunt held afterwards (a reply that took none isn't); a failure pauses Daisy 5 min,
// doubling each time in a row up to 2 h — a 5-min pause made a party trip every 5 min (Fable)
async function hunt_step(step) {
	const r = await step("hunt", run_hunt);
	// (the player update with the new hunt can arrive after Daisy's reply — wait for it before judging; Fable)
	if (r?.started && !(character.s.monsterhunt?.c > 0)) await until(() => character.s.monsterhunt?.c > 0, 2000).catch(() => {});
	if (character.s.monsterhunt?.c > 0) { state.hunt_fails = 0; return 1; }
	state.hunt_fails = (state.hunt_fails || 0) + 1;
	skip("hunt:auto", Math.min(7_200_000, 300_000 * 2 ** (state.hunt_fails - 1)), "Daisy gave no hunt");
	return 0;
}
