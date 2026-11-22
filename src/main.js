// =====================================================================
// main.js — loaded last by every character: death handling, the main loop (tick) and start-up, the overview.
// =====================================================================
// =====================================================================
// Main loop
// =====================================================================
let next_respawn = 0;
// First tick after dying: be more careful with that monster (safety × 0.6 per death) and avoid that pack for
// death_pack_cooldown_ms; drop the errand and measurement in progress
function on_death() {
	if (state.dead_handled) return;
	state.dead_handled = true;
	// v24.51: our own suicide (regrouping) is not the camp's doing: logged, nothing blamed, nothing rested
	if (Date.now() - suicide_at < 20_000) {
		Object.assign(state, { session: null, pack: null, park_home: false, errand: null, recovering: false, fled_home: false, ptown: null });
		return;
	}
	const pmd = postmortem();
	// v20.0: a death with no damage seen in the last 10s (dead when the script started, or killed while it wasn't
	// watching) is logged as unexplained and doesn't blame the pack: it used to cut the pack's safety ×0.6 on no evidence
	pmd.watched_s = Math.round((Date.now() - seen.since) / 1000);
	pmd.unexplained = !Object.keys(pmd.dmg10 || {}).length;
	log_ev("death", pmd);
	bucket().deaths++;
	const p = state.pack;
	const killer = pmd.killer && G.monsters[pmd.killer] ? pmd.killer : p?.mtype;
	if (!pmd.unexplained) safety_tune("death");
	if (pmd.unexplained) game_log(`Died with no damage seen (script watching for ${pmd.watched_s}s) — not blaming ${p?.mtype || "the pack"}`, C.warn);
	else if (p) {
		// v24.16: killed by another monster than the spot's (a roamer: the ent at gscorpion), the spot isn't cooled down —
		// that sent the party away from its best spot, through the caves, and back 30 min later
		const roamer = !!killer && killer !== p.mtype;
		incident(killer || p.mtype, 0.6);
		if (!roamer) state.cooldown[pack_key(p)] = Date.now() + CFG.death_pack_cooldown_ms;
		delete state.probe_ok[killer || p.mtype];
		share_verdict({ kind: "incident", mtype: killer || p.mtype, mult: 0.6, key: roamer ? null : pack_key(p), cd: roamer ? 0 : state.cooldown[pack_key(p)], death: true });
		game_log(`Died at ${p.mtype} (main damage: ${killer || "?"}); safety for it now x${danger_of(killer || p.mtype).toFixed(2)}`);
	}
	Object.assign(state, { session: null, pack: null, park_home: false, errand: null, recovering: false, fled_home: false, ptown: null });
}
// Main loop: one decision per tick (see the header for the order). Reschedules itself: 200ms normally, sooner when the
// next attack is due (never under 50ms), 500ms when over the call budget, 1s while dead, 5s with nowhere to fight.
function tick() {
	let wait = 200;
	try {
		meter_socket();
		if (spent() > BUDGET.soft) wait = 500;
		else if (character.rip) {
			if (character.cave && !state.dead_handled) cave_died(); // v25.22 (role function)
			probe_check(); // v24.3: a probe ends as failed when the leader dies, not "held" after respawning
			on_death();
			if (Date.now() >= next_respawn && can_spend(1, RESERVE.potion)) {
				next_respawn = Date.now() + 5000; // retry every 5s; a "cant_respawn" reply says exactly how long to wait
				Promise.resolve(respawn()).catch((e) => { if (e?.ms > 0) next_respawn = Date.now() + e.ms + 200; });
			}
			wait = 1000;
		} else if (character.cave) { // v25.22: inside the Cave of Many Dreams (fighter/9_cave.js): its own loop — no party
			state.dead_handled = false; // break (dying costs nothing there), no town, no camps
			wait = cave_tick();
		} else if (party_break_tick()) { // v24.51: the party isn't whole — suicide to town, or wait there
			state.dead_handled = false;
			state.recovering = false;
			wait = 500;
		} else if (flee_tick()) { // role function (v25.11): only the merchant flees to town; fighters never do
			state.dead_handled = false;
			wait = 250; // recovery reacts faster (re-channel, heals)
		} else if (state.parked) {
			state.dead_handled = false;
			park_tick();
			wait = 300;
		} else {
			state.dead_handled = false;
			if (Date.now() - state.last_guide > CFG.guide_interval_ms) guide_refresh();
			// v24.58: the tank decides. A follower doesn't start a town trip or go to an event by itself: it joins the
			// party's trip when one is announced, tells the tank what it needs (heartbeat: tn), and follows.
			if (is_follower()) ptown_join_tick(); else town_check();
			if (!is_follower() && event_tick()) { loot_chests(); setTimeout(tick, 200); return; }
			wait = role_tick(); // role function (v25.11): fighter/0_loop.js, merchant/0_loop.js
		}
	} catch (e) { game_log("tick: " + e); log_error("tick: " + e); }
	setTimeout(tick, wait);
}

setInterval(() => { if (spent() <= BUDGET.soft) sustain(); }, 250); // potions/regen checked 4x a second
setInterval(gap_tick, 250);
// v25.14: keep the browser from throttling a background tab (Safari's sleeping tabs froze the party at 4:11 AM: no
// heartbeats, so the tank waited "in town" for members standing next to it). The game's performance_trick() plays a
// silent looping sound (parent.sounds.empty: the game's `var sounds`, js/functions.js). It is called only while that loop
// doesn't exist (it creates it then; called again it would play a second copy) — so a load before the game's Howl is
// ready retries a minute later. A stopped loop is replayed only while Howler's audio runs (or Howler has no Web Audio
// context: HTML5 audio) — a play() while the browser blocks sound (tab not clicked since the load) queues a copy.
function keep_awake() {
	try {
		const snd = parent.sounds?.empty;
		if (!snd) { if (typeof performance_trick === "function") performance_trick(); return; }
		const ctx_ = parent.Howler?.ctx;
		if (typeof snd.playing === "function" && !snd.playing() && (!ctx_ || ctx_.state === "running")) snd.play();
	} catch (e) {}
}
keep_awake();
setInterval(keep_awake, 60_000);
tick();

// =====================================================================
// OVERVIEW
// Adventure Land farmer. Source in src/ (manifest.json: shared/ for every character, then fighter/ or merchant/, then
// main.js); built into farmer.js. VERSION (first line of shared/00_config.js) is the only version number, and
// report() prints it. What changed between versions is in the git history and REFACTOR.md, not here.
//
// Each tick (main.js tick()), first match wins:
//   1. Dead → respawn as soon as the server allows (in the cave: the cave's own revive vote).
//   2. Inside the Cave of Many Dreams → its own loop (fighter/9_cave.js); none of the steps below.
//   3. The party isn't whole (a member dead or offline) → the others use the suicide command and wait in town
//      (party_break_tick). Nobody suicides for any other reason; fighters never flee.
//   4. The merchant, HP < flee_hp → walk to town, fight back only if hit, resume when recovered (flee_tick).
//   5. park() was called → finish the current errand, stand in town until resume().
//   6. Town work, when something is due (the tank starts a party trip; followers only join it): Daisy (hunt, tokens)
//      → quest crafts → compound → upgrade project → stat scrolls → exchange → elixir → sell → potions → bank. With
//      the merchant online, fighters leave compounds and upgrade projects to it and go only when bags or potions
//      run low; work that can wait is deferred to the next trip (fighter_defers_town).
//   7. The role's own tick (role_tick): the merchant's merchant_tick, or the fighter's fighter_tick:
//      - Follower → stay with the tank; heal (priest); hit what already targets the party, the tank's target first.
//        Exception (v25.20): where the tank kills its targets in one hit, each follower picks its own random
//        untouched monster of that type at the tank's camp.
//      - The tank → once a day the cave (below); a live boss we can survive; else the chosen camp.
//
// The tank decides. Only it starts a fight on an untouched monster, and only with every member within engage_px
//   (tank_first, enforced in fire()), except the one-hit free-for-all above. Hopeless monsters are never attacked.
//
// Where to fight (the tank): live boss > monster hunt > own-quest materials > best xp/s camp (CFG.goal_w); the party's
//   goals are merged (a monster on two lists wins; otherwise members take turns). An own Cole quest whose output is
//   gear counts only while that piece is an upgrade for the member and no copy is owned (v25.15). The camp is
//   reviewed every 30 min (10 once the party is stronger). A camp's xp/s is measured only on time the party is all
//   there and ready (v25.16: held, unheard-member and frozen-tab seconds are left out).
//
// Safety: fight_math follows the server's damage formula on live monster stats, with the party's damage and a near
//   priest's heals; per-monster multiplier = calibration (actual ÷ predicted damage) × incidents. Probing is off.
//
// Cave of Many Dreams (fighter/9_cave.js; CFG.cave): once a day (cave_info) the tank leads the party to Dorr (main
//   816,1200) and enters (cave_enter). Inside, for up to 24 min: the floor's camps (each at most 5 min), its floor
//   keeper, its guard camp, then the stairs; a goal with no progress for 45 s, or one the party died at twice, is
//   given up for the visit. Every character votes by cave_policy (never the wolves or a shadow; rewards that cost
//   nothing; revive where we fell when the purse has the Amber). A cave merchant's item is bought with the purse.
//
// Bags — every item is KEEP, SELL or BANK; acted on when free slots drop below bag_min_free:
//   KEEP: locked, potions/scrolls/tools/computer, CFG.keep, what quests and the upgrade project need, compound sets,
//         stand stock the owner listed (merchant), anything fetched from the bank in the last hour.
//   SELL: only what the owner lists (CFG.sell_plain, and sell_junk for the merchant's purges/dead compounds; both off).
//   BANK: everything else. Needed items, gear upgrades and compound copies in the bank are fetched back.
//
// Gear: items are scored per class (primary stats by G.classes lstats, the rest by CFG.gear_w, class weapon/offhand
//   modifiers, set bonuses; item titles via the game's own stat calc). Every 5s wear the best bag upgrade, drink the
//   best elixir, else hand a spare to a nearby member it upgrades. The bank is account-wide: upgrades seen there are
//   fetched for whoever they fit. Must-hold items (CFG.hold) are kept by every character.
//   Upgrades and compounds are the merchant's while it's online (v25.17: the fighters' own pieces too — they're banked
//   or handed over and it upgrades them from the copy). A project is the piece (NPC-sold, or a copy we own) whose
//   upgraded copy beats a member's worn piece most per gold, aimed no higher than the run will go (v25.19: base odds,
//   the next scroll's boost, the floor — 80%, 60% with a spare copy, 20% for shop pieces); weapons go to +7 with no
//   budget (upgrade_weapon). Stat scrolls only on +7 pieces or higher. Tokens buy class gear for a member; recipes
//   whose output a member would wear are crafted; exchangeables are opened.
//
// Party (CFG.party): the tank leads; members talk via send_cm heartbeats every beat_ms, invite each other without
//   splitting a party; fighters near the merchant hand it all gold above merchant.fund_keep (500k). The watchdog
//   catches frozen, no-progress and lost-follower stalls. keep_awake() plays the game's silent loop
//   (performance_trick) so a background tab isn't throttled — click each tab once after a reload.
//
// Merchant (CFG.merchant): not a party member. Carries potions to fighters low on potions or bag space and collects
//   their loot; casts mluck; fetches bank upgrades for them; runs every compound and upgrade project; every 10 min
//   checks Ponty: a piece that's an upgrade as listed (≤ secondhand_gold_per_pt), a head start for an upgrade (cheaper
//   than building it), a shiny copy over a plain one, compound-route copies, quest materials; levels by donating;
//   idle at home it opens its stand but lists only what the owner names (stand.list, empty — so Merrit, who needs a
//   listing, gives no parcels).
//
// Install: paste loader.js (once) into each character's CODE slot. Loader v4 fetches the newest commit's
//   src/manifest.json and runs only that character's files (cached copy if GitHub is down); reload_farmer() restarts
//   it. Releases can also be restarted remotely through the game's MCP API (browser_code_reload).
//
// Diagnostics (CODE console, copyable text box): report() — this character at once, then the whole party in one
//   box; report(6) adds 6h history each; report("solo") just us; party_report() re-opens it; history(hours)
//   (history(h, "solo") just us), deaths(n), why_not("monster"); gear_check(); selftest(); park()/resume();
//   unpause() (lifts town:* pauses); forget() (clears learned data); ui() (log size; off by default).
//
// Server behaviour relied on (checked against kaansoral/adventureland):
//   - call cost: > 200 per rolling 4s disconnects; move 2.5, equip 4, unequip 7; cm 1-2; character.cc = server total.
//   - client promises never time out → every game call goes through T(); every walk through go() (walk_timeout_ms).
//   - compound takes 10s on the server (5s with massproduction); an upgrade to +L takes 500·L·√L ms.
//   - use_town: 3s channel, cancelled by attacking/moving/equipping; fails with > 5 monsters targeting you.
//   - chests: gold multiplier lost beyond 400px or after 8 min; respawn rip_time 12s.
//   - a computer bypasses shop/upgrade/compound/craft/exchange distance checks, not Daisy's.
//   - monster-hunt kills and XP are credited to every party member; XP is split by damage dealt; merchants get none.
//   - send_gold / send_item: same map, < 400px; cm reaches only characters on the same server.
//   - bank_b / bank_u floors stay locked until a bkey / ukey is used; bank contents arrive after entering.
//   - an open stand sets speed to 10; two-handed weapons (G.classes[].doublehand) need the offhand empty.
//   - the runner defines ~350 globals (e.g. pm, smart, T): a top-level const/let with one of those names aborts the
//     whole script (test/smoke.js checks this); function declarations may replace them.
//   - Progression Guide rows: upgrade action.level = INPUT level, request.level = target; farm rows carry
//     action.route {monster, map, boundary, safe}; reason "bees" = save Bee Wings for Cole.
// =====================================================================
