// =====================================================================
// Role hooks (v24.94): functions that live in one role's file, called from code every character runs. Each default
// here is what that function returns for the OTHER role; the role's own file declares the real one, later in the
// load order (shared/, then fighter.js or merchant.js, then main.js), and a later function declaration replaces an
// earlier one. Every call site is reached by one role only (is_merchant() and the like decide), so a default never
// stands in for real work. tools/split_check.js lists any use of a role-only name that has no default here.
// =====================================================================
// merchant.js
function merchant_tick() {}
function merchant_gives_to() { return true; }
function merchant_awaits_funds() { return false; }
function merchant_asks_funds() { return false; }
function merchant_sells() { return false; }
function merchant_fight_back() { return false; }
function merchant_fetch_give() {}
function merchant_fetch_stand() {}
function merchant_fetch_sale() {}
function recover() {}
function facts_merchant() {}
function merchant_job() { return null; }
function bank_purge() { return 0; }
function stand_hold() { return new Set(); }
function stand_worthy() { return false; }
async function stand_close() {}
function merrit_on() { return false; }
function parcel_count() { return 0; }
// fighter.js
function fighter_tick() { return 250; }
function fighter_defers_town() { return false; }
function fighter_fight_back() { return false; }
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
function task_tokens() { return 0; }
function collect_list() { return []; }
function collect_due() { return []; }
function collect_key() { return ""; }
async function task_collect() { return 0; }
function set_piece_plan() { return null; }
function set_piece_fetch() { return []; }
function set_piece_start() {}
