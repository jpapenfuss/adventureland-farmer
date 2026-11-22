// =====================================================================
// Merchant (CFG.merchant). Not a party member: it never leads, fights or joins the game party. Fighters send it their
// heartbeats; it sends "mhb" back (position, free slots, gold). It carries potions out to fighters running low or
// short on bag space, collects their loot, casts mluck, and does the town work (bank, compounds, every upgrade project,
// exchange; selling only what the owner lists) for everyone, so fighters rarely leave the camp.
// =====================================================================
const is_merchant = () => character.ctype === "merchant" && CFG.merchant?.name === character.name;
// merchant_hb() / merchant_recent(): role functions (v25.11) — the fighters' in fighter/1_party.js; the merchant's say no
// Upgrade projects: the merchant does them while it's online (fighters keep fighting)
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
