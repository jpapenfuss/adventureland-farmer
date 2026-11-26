// =====================================================================
// Party: the tank leads (packs, directives); the others follow it, assist its target, priests heal.
// Members talk with send_cm every beat_ms (free when they run in one browser: localStorage; else a small call cost).
// =====================================================================
// Is this character configured into a party of 2+? / the other configured members
const in_party_cfg = () => (CFG.party.members || []).includes(character.name) && CFG.party.members.length > 1;
const others = () => (CFG.party.members || []).filter((n) => n !== character.name);
// Party members are known only through their heartbeats (state.partners: name -> last message + t).
// "Fresh" = heard from in the last 20s (10 missed heartbeats → treat as offline).
const fresh = (p) => !!p && Date.now() - p.t < 20_000; // 10 missed beats: a busy member skips some (budget)
const partners_any = () => others().map((n) => state.partners[n]).filter(fresh);   // online, dead or alive
const partners = () => partners_any().filter((p) => !p.rip);                        // online and alive
// Position: live from its entity when it's in view on our map, else from its last heartbeat
function partner_pos(p) {
	const e = parent.entities?.[p.name];
	return e && character.map === p.map ? { map: p.map, x: e.x, y: e.y } : { map: p.map, x: p.x, y: p.y };
}
// Alive members on our map within maxd px (400 ≈ in view and in heal range). Only these count in the fight model.
function partners_near(maxd = 400) {
	return partners().filter((p) => {
		if (p.map !== character.map) return false;
		const pos = partner_pos(p);
		return Math.hypot(pos.x - character.x, pos.y - character.y) <= maxd;
	});
}
// Leader: the party's tank (CFG.gear_tank: a warrior before a paladin, then by name), dead or alive — a dead leader is
// still the leader. Everyone picks the same one from the heartbeats. With no tank online nobody leads: the name is
// then the tank's from its last heartbeat if we ever had one, else null. A character outside a party leads itself.
function leader_name() {
	if (!in_party_cfg()) return character.name;
	return pick_leader([{ name: character.name, ctype: character.ctype }, ...partners_any()]) ||
		pick_leader(others().map((n) => state.partners[n]).filter(Boolean));
}
const TANK_ORDER = ["warrior", "paladin"];
function pick_leader(all) {
	const tk = all.filter((m) => CFG.gear_tank.includes(m.ctype))
		.sort((a, b) => TANK_ORDER.indexOf(a.ctype) - TANK_ORDER.indexOf(b.ctype) || (a.name < b.name ? -1 : 1));
	return tk.length ? tk[0].name : null;
}
const leader_name_any = leader_name;
const leader_hb = () => state.partners[leader_name()];
// In a party, everyone but the leader follows — with no tank online too (nobody leads, nobody picks a spot)
const is_follower = () => in_party_cfg() && leader_name() !== character.name;
// v24.13: the server's xp multiplier (1 + gear/party/other xp% / 100): party kill xp is split equally among an account's
// characters, so a member earning less in the same fights has a lower one. Breakdown: worn gear's xp, the party bonus.
const xp_mult = () => (Number.isFinite(character.xpm) ? +character.xpm.toFixed(3) : null);
function xp_mult_text() {
	const m = xp_mult();
	if (m === null) return "xp multiplier: not reported by the client";
	let gear = 0;
	for (const s of GEAR_SLOTS) { const it = character.slots?.[s]; if (it) gear += item_props(it, character.ctype).xp || 0; }
	const pn = Object.keys(get_party() || {}).filter((n) => n !== CFG.merchant?.name).length, party = [0, 0, 10, 16, 20, 24, 25, 30, 36, 40][pn] || 0;
	const other = Math.round(m * 100 - 100 - gear - party);
	return `xp multiplier x${m.toFixed(2)} = 100% + gear ${Math.round(gear)}% + party ${party}%${other ? ` + other ${other}%` : ""}`;
}
// ---- Verdicts shared with the party (v24.6) ----
// Together, only the leader picks, from its own tables, so what a member learns is sent to the other fighters (v25.82:
// a member's death, for the tank to judge; a type skipped after an impossible fight).
// A message to the other fighters (fire and forget)
function tell_party(msg) {
	if (typeof send_cm === "function" && others().length) Promise.resolve(send_cm(others(), msg)).catch(() => {});
}
function share_verdict(v) {
	if (in_party_cfg()) tell_party({ k: "verdict", ...v });
}
// Code messages from the other characters (v25.1: a named function; the fighters' own kinds are fighter_cm in fighter/)
function on_cm_message(m) {
	if (m?.message?.k) seen.cm[m.message.k] = (seen.cm[m.message.k] || 0) + 1;
	if (m && (m.message?.k === "ping" || m.message?.k === "pong") && party_names_all().includes(m.name)) {
		if (m.message.k === "ping") Promise.resolve(send_cm([m.name], { k: "pong", id: m.message.id, v: VERSION })).catch(() => {});
		else if (st_runs[m.message.id]) st_runs[m.message.id].pong[m.name] = { v: m.message.v, ms: Date.now() - st_runs[m.message.id].at };
		return;
	}
	if (fighter_cm(m)) return; // v25.1: tgt, mhb, verdict, ptown, ptown_off, bill (fighter/)
	if (m && m.message?.k === "bank" && party_names_all().includes(m.name)) return void adopt_bank(m);
	if (m && m.message?.k === "bankq" && party_names_all().includes(m.name)) return void answer_bankq(m.name); // v25.64
	if (m && (m.message?.k === "rreq" || m.message?.k === "rrep") && party_names_all().includes(m.name)) {
		if (m.message.k === "rreq") report_reply(m); else report_collect(m);
		return;
	}
	if (m && m.message?.k === "gold" && ((CFG.party.members || []).includes(m.name) || m.name === CFG.merchant?.name)) {
		log_ev("gold", { from: m.name, g: +m.message.g || 0 }); // (v25.80: the ledger adjustment comes from the game's gold_received event)
		return;
	}
	if (!m || !(CFG.party.members || []).includes(m.name) || m.message?.k !== "hb") return;
	const first = !fresh(state.partners[m.name]);
	state.partners[m.name] = { ...m.message, name: m.name, t: Date.now() };
	if (m.message.gold_xfer_at > (state.gold_xfer_at || 0)) state.gold_xfer_at = m.message.gold_xfer_at; // one party-wide clock
	if (first) game_log(`party: ${m.name} (${m.message.ctype} ${m.message.level}) online; ${leader_name() || "nobody"} leads`, C.info);
	if (first && other_build(m.message.v, m.message.b)) game_log(`party: ${m.name} runs ${build_txt(m.message.v, m.message.b)}, we run ${build_txt(VERSION, BUILD)} - load the same version on every character`, C.warn);
}
if (typeof character.on === "function") character.on("cm", on_cm_message);
setInterval(() => { if (spent() < BUDGET.soft - RESERVE.chat) heartbeat(); }, CFG.party.beat_ms);
// Game party membership. Accepting an invite (or having your join request accepted) makes the server pull you out of
// your current party, so:
//  - a member already partied with another configured member never accepts (that would split the party);
//  - every member partied with another member invites the missing ones (duplicates are harmless: the server answers
//    "already_in_party"), and the missing member also asks to join (request) - so no single member, possibly idle or on
//    an old script version that doesn't know the newcomer, can block it;
//  - only when no configured member is partied with another does the leader start a party by inviting everyone.
const members_cfg = () => CFG.party.members || [];
const in_member_party = () => Object.keys(get_party() || {}).some((n) => n !== character.name && members_cfg().includes(n));
const party_said = {}; // log key -> last time, so the 10s tick logs each fact at most once a minute
function party_log(key, msg) {
	if (Date.now() - (party_said[key] || 0) < 60_000) return;
	party_said[key] = Date.now();
	game_log(msg, C.info);
}
function on_party_invite(name) {
	if (!members_cfg().includes(name)) return;
	if (in_member_party()) return party_log("ignore:" + name, `party: ignoring ${name}'s invite (already partied with a member)`);
	party_log("accept:" + name, `party: accepting ${name}'s invite`);
	accept_party_invite(name);
}
function on_party_request(name) {
	if (!members_cfg().includes(name)) return;
	party_log("raccept:" + name, `party: letting ${name} join`);
	accept_party_request(name);
}
