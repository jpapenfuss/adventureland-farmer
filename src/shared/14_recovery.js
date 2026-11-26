// =====================================================================
// Recovery, death, parking
// =====================================================================
// Low-HP recovery — the merchant only: fighters never flee. Cancel any walk (it would block the channel), teleport to
// town (3s channel), fight back only if hit, and stay out until recover_hp/recover_mp. use_town has no cooldown and fails while > 5 monsters target us, so
// retries are spaced 1.5s apart; it's re-channelled only if something followed us below flee_hp.
// v24.4: the 3s town channel is cancelled by every hit we take, every attack, heal or skill we cast and every potion
// (drinking is an "equip" packet; server: player.c = {}). The old flee channelled and fought back in the same tick, and
// sustain() drank within 2s, so the teleport almost never landed; and it only re-channelled below flee_hp, so one potion
// above 25% left us "recovering" in place — a melee fighter shot from range stood still until it died. Now: while
// anything is on us (or hit us in the last quiet_ms), fight it (walking to it if melee) and drink; once it's quiet,
// channel, and do nothing that would cancel it until it lands; retry until we're home.
const hurt_ms = () => { const h = pmring.hits[pmring.hits.length - 1]; return h ? Date.now() - h.t : Infinity; };
const channeling = () => !!character.c?.town || Date.now() - (state.town_at || 0) < 700; // the server's update can lag our send
const at_town_spot = () => { const sp = G.maps[character.map]?.spawns?.[0]; return !!sp && Math.hypot(character.x - sp[0], character.y - sp[1]) < 150; };
// park(): finish the current errand, go to town and stand there (still fighting back). resume(): carry on.
function park() { state.parked = true; state.park_home = false; game_log("Parking after the current errand", C.info); }
// v24.93: unpause() in the CODE console lifts paused tasks — all town ones by default, or those starting with `prefix`
// ("town:loop", "upg:", "cmp:"...). The script's own variables (state...) aren't reachable from the console.
function unpause(prefix = "town:") {
	const gone = Object.keys(state.gear_skip).filter((k) => k.startsWith(prefix));
	for (const k of gone) delete state.gear_skip[k];
	save_state();
	game_log(gone.length ? `unpaused: ${gone.join(", ")}` : `nothing paused under "${prefix}"`, C.info);
	return gone;
}
function resume() { state.parked = false; state.last_target_at = Date.now(); game_log("Resuming", C.info); }
// While parked: one trip to town, then stand and defend
function park_tick() {
	if (!errand_busy() && !state.park_home) {
		if (walking()) halt("park_tick");
		state.park_home = errand("park", async () => { await go("town"); });
	}
	fight_back(); // v25.11: a role function — the fighter's full combat (fighter/3_combat.js), the merchant's plain attack (merchant/0_loop.js)
	set_message(errand_busy() ? `Parking (${state.errand})` : "Parked");
}
if (CFG.park_key && typeof map_key === "function") map_key(CFG.park_key, "snippet", "state.parked ? resume() : park()");
