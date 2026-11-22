// =====================================================================
// fighter/8_merchant_parts.js — fighters only (src/manifest.json): the fighter's answers to functions whose real work is
// the merchant's (merchant/). Role functions (v25.12; were shared/19_hooks.js's defaults): each role declares
// its own, and farmer.js calls the running character's (tools/build.js).
// =====================================================================
function merchant_gives_to() { return true; }
function merchant_awaits_funds() { return false; }
function merchant_asks_funds() { return false; }
function merchant_sells() { return false; }
function merchant_fetch_give() {}
function merchant_fetch_stand() {}
function merchant_fetch_sale() {}
function facts_merchant() {}
function merchant_job() { return null; }
function bank_purge() { return 0; }
function stand_hold() { return new Set(); }
function stand_worthy() { return false; }
async function stand_close() {}
function merrit_on() { return false; }
function parcel_count() { return 0; }
