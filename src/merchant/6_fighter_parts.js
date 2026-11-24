// =====================================================================
// merchant/6_fighter_parts.js — merchant only (src/manifest.json): the merchant's answers to functions whose real work
// is the fighters' (fighter/). Role functions (v25.12; were shared/19_hooks.js's defaults): each role declares
// its own, and farmer.js calls the running character's (tools/build.js).
// =====================================================================
function fighter_defers_town() { return false; }
function why_not_fighter() { return "the merchant doesn't fight"; }
function facts_stat() {}
function facts_elixir() {}
function facts_safety() {}
function facts_guide_farm() {}
function facts_dir_held() {}
function facts_shared() {}
function facts_goals() {}
function facts_hunt() {}
function facts_owe() {}
function facts_camp_time() {}
function heartbeat() {}
function party_invite_tick() {}
function tank_cover() { return null; }
function fighter_cm() { return false; }
function event_tick() { return false; }
function party_trip_check() { return false; }
function safety_tune() {}
async function swap_worn() { return false; }
function stat_scroll_list() { return []; }
function event_live() { return null; }
function refresh_directive() {}
function ptown_start() {}
function ptown_recv() {}
async function ptown_lead() {}
async function ptown_wait() {}
function facts_doing() {}
function facts_party() {}
function facts_bosses() {}
function facts_probe() {}
function facts_engage() {}
function facts_picks() {}
function facts_targets() {}
function facts_quests() {}
function party_break_tick() { return false; }
function ptown_join_tick() { return false; }
function probe_check() {}
function gap_kind() { return null; }
function follower_tick() {}
function party_heal() { return false; }
function token_pick() { return null; }
function send_tokens() { return false; }
function task_tokens() { return 0; }
function collect_list() { return []; }
function collect_due() { return []; }
function collect_key() { return ""; }
async function task_collect() { return 0; }
async function task_worn_handover() { return 0; } // v25.39: fighters only
function worn_for_me() { return null; }
function set_piece_plan() { return null; }
function set_piece_fetch() { return []; }
function set_piece_start() {}
function cave_tick() { return 250; }
function cave_died() {}
function cave_watch_deaths() {} // v25.41: fighters only
function facts_cave() {}
function cave_entry_tick() { return false; }
