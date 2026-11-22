// Loader tests: fetch/cache/fallback, and that farmer.js run the loader's way (global indirect eval) exposes what the
// game and the console need.
const vm = require("vm"), fs = require("fs"), path = require("path");
const loader = fs.readFileSync(path.join(__dirname, "..", "loader.js"), "utf8");
const farmer = fs.readFileSync(path.join(__dirname, "..", "farmer.js"), "utf8");
let fails = 0;
const assert = (c, m) => { console.log(`${c ? "ok" : "FAIL"} - ${m}`); if (!c) fails++; };
function sandbox(fetch_impl, store = {}) {
	const logs = [], ran = [];
	const ctx = {
		game_log: (m) => logs.push(String(m)), set_message() {}, console, setTimeout, clearTimeout, Date, JSON, AbortController,
		fetch: fetch_impl, parent: {},
		window: { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = v) } },
	};
	ctx.window.window = ctx.window;
	vm.createContext(ctx);
	ctx.eval = (code) => ran.push(code.slice(0, 30)); // the loader's (0, eval)(text) resolves to this in the sandbox
	return { ctx, logs, ran, store };
}
const good = `const VERSION = "9.9";\n` + "// pad\n".repeat(3000);
(async () => {
	// 1) success: caches and runs
	let s = sandbox(async () => ({ ok: true, text: async () => good }));
	vm.runInContext(loader, s.ctx); await new Promise((r) => setTimeout(r, 20));
	assert(s.ran.length === 1 && JSON.parse(s.store.farmer_code).text === good && s.logs.some((l) => /farmer v9.9 loaded from GitHub/.test(l)), "download is cached and run");
	// 1b) v2: the API names master's newest commit → the file is fetched at that commit (not the cached branch copy)
	const SHA = "3f57324" + "a".repeat(33), urls = [];
	const MANI = JSON.stringify({ shared: ["shared/a.js"], fighter: ["fighter.js"], merchant: ["merchant.js"], last: ["main.js"] });
	s = sandbox(async (u, o) => { urls.push([u, o && o.headers]); return /api\.github\.com/.test(u) ? { ok: true, text: async () => SHA + "\n" } : /manifest\.json$/.test(u) ? { ok: true, text: async () => MANI } : { ok: true, text: async () => good }; });
	vm.runInContext(loader, s.ctx); await new Promise((r) => setTimeout(r, 20));
	assert(/repos\/jpapenfuss\/adventureland-farmer\/commits\/master$/.test(urls[0][0]) && urls[0][1].Accept === "application/vnd.github.sha"
		&& urls[1][0] === `https://raw.githubusercontent.com/jpapenfuss/adventureland-farmer/${SHA}/src/manifest.json`
		&& ["shared/a.js", "fighter.js", "main.js"].every((f, i) => urls[i + 2][0] === `https://raw.githubusercontent.com/jpapenfuss/adventureland-farmer/${SHA}/src/${f}`), `v4: the manifest, then the role's files at the newest commit (${urls.map((x) => x[0]).join(", ")})`);
	assert(s.ctx.window.farmer_loaded.sha === SHA && JSON.parse(s.store.farmer_code).sha === SHA && s.logs.some((l) => /farmer v9\.9 @3f57324 loaded from GitHub \(src: 3 files for the fighter\)$/.test(l)), "the commit is logged, passed on and cached");
	// 1b2) v4: the merchant fetches merchant.js; a commit without a manifest falls back to farmer.js at that commit
	{ const u3 = []; s = sandbox(async (u) => { u3.push(u); return /api\.github\.com/.test(u) ? { ok: true, text: async () => SHA } : /manifest\.json$/.test(u) ? { ok: true, text: async () => MANI } : { ok: true, text: async () => good }; });
		s.ctx.character = { ctype: "merchant" };
		vm.runInContext(loader, s.ctx); await new Promise((r) => setTimeout(r, 20));
		assert(u3.some((x) => /src\/merchant\.js$/.test(x)) && !u3.some((x) => /src\/fighter\.js$/.test(x)) && s.ran.length === 1, `v4: the merchant fetches merchant.js, not fighter.js (${u3.join(", ")})`); }
	{ const u2 = []; s = sandbox(async (u) => { u2.push(u); return /api\.github\.com/.test(u) ? { ok: true, text: async () => SHA } : /\/src\//.test(u) ? { ok: false, status: 404 } : { ok: true, text: async () => good }; });
		s.ctx.character = { ctype: "merchant" };
		vm.runInContext(loader, s.ctx); await new Promise((r) => setTimeout(r, 20));
		assert(u2.some((x) => /src\/manifest\.json$/.test(x)) && u2.includes(`https://raw.githubusercontent.com/jpapenfuss/adventureland-farmer/${SHA}/farmer.js`)
			&& s.ran.length === 1 && s.ctx.window.farmer_loaded.sha === SHA, `v4: no manifest at the commit → farmer.js at the commit (${u2.join(", ")})`); }
	// 1c) API refused (rate limit) → branch copy, said so
	s = sandbox(async (u) => (/api\.github\.com/.test(u) ? { ok: false, status: 403 } : { ok: true, text: async () => good }));
	vm.runInContext(loader, s.ctx); await new Promise((r) => setTimeout(r, 20));
	assert(s.ran.length === 1 && s.ctx.window.farmer_loaded.sha === null && s.logs.some((l) => /branch copy: may be up to 5 min behind/.test(l)), "no API → the branch copy runs, flagged as possibly behind");
	// 1d) the commit's file fails → branch copy
	s = sandbox(async (u) => (/api\.github\.com/.test(u) ? { ok: true, text: async () => SHA } : u.includes(SHA) ? { ok: false, status: 404 } : { ok: true, text: async () => good }));
	vm.runInContext(loader, s.ctx); await new Promise((r) => setTimeout(r, 20));
	assert(s.ran.length === 1 && s.ctx.window.farmer_loaded.sha === null && s.logs.some((l) => /branch copy/.test(l)), "the commit's file unavailable → branch copy");
	// 2) bad body → cached copy
	const store = { farmer_code: JSON.stringify({ text: good, at: Date.now() - 120000 }) };
	s = sandbox(async () => ({ ok: true, text: async () => "<html>404</html>" }), store);
	vm.runInContext(loader, s.ctx); await new Promise((r) => setTimeout(r, 20));
	assert(s.ran.length === 1 && s.logs.some((l) => /running the cached copy \(2 min old\)/.test(l)), "a bad download falls back to the cache");
	// 3) network error with cache → cache; without → nothing runs
	s = sandbox(async () => { throw new Error("offline"); }, { ...store });
	vm.runInContext(loader, s.ctx); await new Promise((r) => setTimeout(r, 20));
	assert(s.ran.length === 1 && s.logs.some((l) => /GitHub unreachable \(offline\)/.test(l)), "offline runs the cached copy");
	s = sandbox(async () => { throw new Error("offline"); });
	vm.runInContext(loader, s.ctx); await new Promise((r) => setTimeout(r, 20));
	assert(s.ran.length === 0 && s.logs.some((l) => /no cached copy — not running/.test(l)), "offline without a cache doesn't run");
	// 4) farmer.js run the loader's way: functions the game/console call are globals
	const smoke = fs.readFileSync(path.join(__dirname, "smoke.js"), "utf8");
	const mock_src = smoke.slice(0, smoke.indexOf("// Globals the game's code runner declares")); // the smoke test's mock runtime
	const c2 = eval(mock_src + "\nctx"); // direct eval: its consts stay in here; the last expression (ctx) is returned
	vm.createContext(c2);
	vm.runInContext(`(0, eval)(${JSON.stringify(farmer)})`, c2);
	const need = ["on_party_invite", "on_party_request", "on_destroy", "report", "history", "deaths", "selftest", "why_not", "park", "resume", "reload_farmer"].filter((n) => n !== "reload_farmer");
	const missing = need.filter((n) => typeof c2[n] !== "function");
	assert(!missing.length, `farmer via indirect eval exposes ${need.length} globals${missing.length ? " — missing " + missing : ""}`);
	assert(typeof c2.CFG === "undefined", "its top-level consts stay private (no clash with runner globals)");
	if (fails) { console.error(`${fails} loader test(s) FAILED`); process.exit(1); }
	console.log("LOADER ALL PASS");
})();
