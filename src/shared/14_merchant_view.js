// =====================================================================
// Merchant (CFG.merchant). Not a party member: it never leads, fights or joins the game party. Fighters send it their
// heartbeats; it sends "mhb" back (position, free slots, gold). It carries potions out to fighters running low or
// short on bag space, collects their bankable/sellable items, casts mluck, and does the town work (sell, bank,
// compound, upgrade projects, exchange) for everyone, so fighters rarely leave the pack.
// =====================================================================
const is_merchant = () => character.ctype === "merchant" && CFG.merchant?.name === character.name;
const merchant_hb = () => (!is_merchant() && fresh(state.merchant) && state.merchant.name === CFG.merchant?.name ? state.merchant : null);
// Upgrade projects: the merchant does them while it's online (fighters keep fighting)
// Who does the shared work (compounding, upgrade/craft projects, town thresholds) must not flip with a single missed
// heartbeat (the merchant skips beats when its call budget is tight): "merchant online" = heard within 10 minutes
const merchant_recent = () => !is_merchant() && !!state.merchant && state.merchant.name === CFG.merchant?.name &&
	Date.now() - state.merchant.t < 600_000 && !state.merchant.rip;
const merchant_does_it = () => merchant_recent();
// ---- Monster tokens (CFG.token_auto) ----
// Best shop piece by points per token: class gear a member would wear (+0), not already owned (bags or bank)
// ---- Must-hold items (CFG.hold) ----
const hold_price = (n) => G.tokens?.[CFG.hold?.[n]]?.[n];
const hold_missing = () => Object.keys(CFG.hold || {}).filter((n) => G.items[n] && held_any(n) === 0);
// ---- Merrit: a stand spot that earns Market Parcels ----
const in_rect = (x, y, r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
function why_not(mtype) { return why_not_fighter(mtype); } // v25.3: the fighters' answer is in fighter/

// xp and gold samples every minute, for rates() (every character; v25.1: back from fighter/, where v24.95 had carried it
// with send_own_gold — the merchant stopped sampling)
setInterval(() => {
	stats.samples.push({ t: Date.now(), xp: stats.xp, gold: character.gold + stats.adj });
	if (stats.samples.length > 61) stats.samples.shift();
}, 60_000);
