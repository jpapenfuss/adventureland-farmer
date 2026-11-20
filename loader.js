const LOADER = "1"; // Adventure Land farmer loader: paste this (once) into each character's CODE slot; it runs the latest farmer.js
// =====================================================================
// Fetches farmer.js from the public GitHub repo below and runs it, so a release reaches every character by restarting
// its code (no pasting). The last good download is cached in the browser; if GitHub is unreachable that copy runs.
//   reload_farmer()  — stop and restart the code (picks up a new release)
// raw.githubusercontent.com serves text/plain with nosniff, so a <script src> won't run it: the text is fetched and run
// with a global indirect eval instead. That behaves like pasted code: function declarations become globals (the game
// still finds on_party_invite, on_destroy...; report(), history(), selftest() work from the console), and top-level
// const/let stay private to the eval (so they can't clash with the runner's own globals).
// =====================================================================
const FARMER_URL = "https://raw.githubusercontent.com/OWNER/REPO/master/farmer.js"; // set to your repo
const FARMER_CACHE = "farmer_code"; // localStorage key: { text, version, at }

function farmer_cached() {
	try { return JSON.parse(window.localStorage.getItem(FARMER_CACHE) || "null"); } catch (e) { return null; }
}
function farmer_run(text, how) {
	const v = (text.match(/^const VERSION = "([^"]+)"/) || [])[1] || "?";
	window.farmer_loaded = { version: v, how, url: FARMER_URL, loader: LOADER, at: Date.now() };
	game_log(`farmer v${v} ${how}`, "#8f8");
	(0, eval)(text); // global indirect eval (see above)
}
const farmer_valid = (text) => typeof text === "string" && text.startsWith("const VERSION =") && text.length > 10_000;
async function farmer_load() {
	let text = null, err = null;
	try {
		const ctl = typeof AbortController === "function" ? new AbortController() : null;
		const timer = ctl && setTimeout(() => ctl.abort(), 10_000);
		const res = await fetch(`${FARMER_URL}?t=${Date.now()}`, { cache: "no-store", signal: ctl?.signal });
		if (timer) clearTimeout(timer);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		text = await res.text();
		if (!farmer_valid(text)) throw new Error("download doesn't look like farmer.js");
	} catch (e) { err = e; text = null; }
	if (text) {
		try { window.localStorage.setItem(FARMER_CACHE, JSON.stringify({ text, at: Date.now() })); } catch (e) { game_log("farmer: couldn't cache the download: " + e, "#fa0"); }
		return farmer_run(text, "loaded from GitHub");
	}
	const c = farmer_cached();
	if (c && farmer_valid(c.text)) {
		const mins = Math.round((Date.now() - c.at) / 60_000);
		game_log(`farmer: GitHub unreachable (${err && err.message}) — running the cached copy (${mins} min old)`, "#fa0");
		return farmer_run(c.text, "loaded from cache");
	}
	game_log(`farmer: can't load (${err && err.message}) and no cached copy — not running`, "#f55");
	set_message("farmer load failed", "red");
}
// Stop and restart the code: the restart runs this loader again, which fetches the latest farmer.js
// stop_runner() removes this iframe (calling on_destroy, which saves state), so the restart is scheduled on the game page
function reload_farmer() {
	if (typeof parent.stop_runner !== "function" || typeof parent.start_runner !== "function") {
		return game_log("farmer: stop and start the code (the play button) to reload");
	}
	game_log("farmer: reloading…");
	parent.setTimeout(() => { parent.stop_runner(); parent.setTimeout(() => parent.start_runner(), 500); }, 0);
}
farmer_load();
