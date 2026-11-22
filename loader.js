const LOADER = "4"; // Adventure Land farmer loader: paste this (once) into each character's CODE slot; it runs the latest farmer.js
// =====================================================================
// Fetches farmer.js from the public GitHub repo below and runs it, so a release reaches every character by restarting
// its code (no pasting). The last good download is cached in the browser; if GitHub is unreachable that copy runs.
//   reload_farmer()  — stop and restart the code (picks up a new release)
// raw.githubusercontent.com serves text/plain with nosniff, so a <script src> won't run it: the text is fetched and run
// with a global indirect eval instead. That behaves like pasted code: function declarations become globals (the game
// still finds on_party_invite, on_destroy...; report(), history(), selftest() work from the console), and top-level
// const/let stay private to the eval (so they can't clash with the runner's own globals).
// v2: raw.githubusercontent.com serves a branch's file from a cache for up to 5 minutes (a ?t= query doesn't get past
// it), so a reload right after a push could run the previous build. The loader now asks the GitHub API for the
// branch's newest commit and fetches the file at that commit (never stale); the branch URL is only the fallback when
// the API is unreachable or rate-limited (60 requests/hour per IP). The commit is shown in the load line and passed on
// in window.farmer_loaded.sha, so two builds can't be mistaken for each other.
// v4: the script is split into files listed in src/manifest.json: "shared" (every character), "fighter" / "merchant"
// (the role's own), "last". At the newest commit the loader reads the manifest and fetches only what this character
// runs — shared + its role (merchant for the merchant, fighter for everyone else) + last — and runs them as one text.
// A commit without a manifest (or a failed download) falls back to farmer.js, the build of every file together,
// which loaders v1–v3 keep using.
// =====================================================================
const FARMER_REPO = "jpapenfuss/adventureland-farmer", FARMER_BRANCH = "master";
const FARMER_URL = `https://raw.githubusercontent.com/${FARMER_REPO}/${FARMER_BRANCH}/farmer.js`;
const FARMER_CACHE = "farmer_code"; // localStorage key: { text, sha, at }

function farmer_cached() {
	try { return JSON.parse(window.localStorage.getItem(FARMER_CACHE) || "null"); } catch (e) { return null; }
}
function farmer_run(text, how, sha, url) {
	const v = (text.match(/^const VERSION = "([^"]+)"/) || [])[1] || "?";
	window.farmer_loaded = { version: v, how, url, sha: sha || null, loader: LOADER, at: Date.now() };
	game_log(`farmer v${v}${sha ? " @" + sha.slice(0, 7) : ""} ${how}`, "#8f8");
	(0, eval)(text); // global indirect eval (see above)
}
const farmer_valid = (text) => typeof text === "string" && text.startsWith("const VERSION =") && text.length > 10_000;
async function farmer_get(url, headers) {
	const ctl = typeof AbortController === "function" ? new AbortController() : null;
	const timer = ctl && setTimeout(() => ctl.abort(), 10_000);
	try {
		const res = await fetch(url, { cache: "no-store", signal: ctl?.signal, headers });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return await res.text();
	} finally { if (timer) clearTimeout(timer); }
}
async function farmer_load() {
	let text = null, err = null, sha = null, url = FARMER_URL, how = "loaded from GitHub";
	try { // the branch's newest commit, as a bare 40-hex string
		const r = (await farmer_get(`https://api.github.com/repos/${FARMER_REPO}/commits/${FARMER_BRANCH}`, { Accept: "application/vnd.github.sha" })).trim();
		if (/^[0-9a-f]{40}$/.test(r)) sha = r;
	} catch (e) {}
	const role = typeof character !== "undefined" && character && character.ctype === "merchant" ? "merchant" : "fighter";
	const raw = (f) => `https://raw.githubusercontent.com/${FARMER_REPO}/${sha}/${f}`;
	for (const u of sha ? ["manifest", raw("farmer.js"), FARMER_URL] : [FARMER_URL]) {
		try {
			if (u === "manifest") { // v4: this role's files at the commit, in the manifest's order, run as one text
				const man = JSON.parse(await farmer_get(raw("src/manifest.json")));
				const files = [...(man.shared || []), ...(man[role] || []), ...(man.last || [])];
				if (!files.length) throw new Error("empty manifest");
				text = (await Promise.all(files.map((f) => farmer_get(raw("src/" + f))))).join("");
				if (!farmer_valid(text)) throw new Error("src/ download doesn't look like the script");
				url = raw("src/manifest.json"); how = `loaded from GitHub (src: ${files.length} files for the ${role})`;
				break;
			}
			text = await farmer_get(u === FARMER_URL ? `${u}?t=${Date.now()}` : u);
			if (!farmer_valid(text)) throw new Error("download doesn't look like farmer.js");
			url = u; how = "loaded from GitHub";
			break;
		} catch (e) { err = e; text = null; }
	}
	if (text) {
		if (url === FARMER_URL) { sha = null; how = "loaded from GitHub (branch copy: may be up to 5 min behind the newest push)"; }
		try { window.localStorage.setItem(FARMER_CACHE, JSON.stringify({ text, sha, at: Date.now() })); } catch (e) { game_log("farmer: couldn't cache the download: " + e, "#fa0"); }
		return farmer_run(text, how, sha, url);
	}
	const c = farmer_cached();
	if (c && farmer_valid(c.text)) {
		const mins = Math.round((Date.now() - c.at) / 60_000);
		game_log(`farmer: GitHub unreachable (${err && err.message}) — running the cached copy (${mins} min old)`, "#fa0");
		return farmer_run(c.text, "loaded from cache", c.sha, "cache");
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
