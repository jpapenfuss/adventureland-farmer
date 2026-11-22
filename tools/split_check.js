// Static check of the src/ split: a role's file set (common + its role + main) must not use a name that only the
// other role's file declares, unless shared/ has a default for it (15_hooks.js); and no name may be declared in
// two files except those defaults. Exit 1 with the list otherwise. Used by test/roles.js.
const fs = require("fs"), path = require("path");
const SRC = path.join(__dirname, "..", "src");
const DECL = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
// top-level declarations of a file, each with the identifiers its block references (comments, strings and template
// text removed)
function blocks(file) {
	const lines = fs.readFileSync(path.join(SRC, file), "utf8").split("\n"), out = [];
	lines.forEach((l, i) => { const m = l.match(DECL); if (m) out.push({ name: m[1] || m[2], line: i + 1, fn: /function/.test(l.split(/[=(]/)[0]) }); });
	for (let k = 0; k < out.length; k++) {
		const body = lines.slice(out[k].line - 1, k + 1 < out.length ? out[k + 1].line - 1 : lines.length).join("\n")
			.replace(/\/\/.*$/gm, "").replace(/`(?:\\.|[^`\\])*`/g, (m) => " " + (m.match(/\$\{[^}]*\}/g) || []).map((x) => x.slice(2, -1)).join(" ") + " ")
			.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
		// an object key (`name:`) isn't a reference; a bare name before a ternary's ":" would be missed — rare enough
		out[k].refs = new Set(body.match(/(?<![\w$.])[A-Za-z_$][\w$]*\b(?!\s*:(?!:))/g) || []);
	}
	return out;
}
function check() {
	// the groups: every shared file counts as one ("common"), then each role file, then the last files
	const MAN = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
	const G = { "common.js": MAN.shared, "fighter.js": MAN.fighter, "merchant.js": MAN.merchant, "main.js": MAN.last };
	const files = Object.keys(G), B = Object.fromEntries(files.map((g) => [g, G[g].flatMap((f) => blocks(f).map((b) => ({ ...b, file: f })))]));
	const names = (f) => new Set(B[f].map((b) => b.name));
	const errs = [];
	const defaults = new Set(B["common.js"].filter((b) => b.fn).map((b) => b.name));
	// declared twice: only a common default replaced by a role file's function
	const seen = {};
	for (const f of files) for (const b of B[f]) {
		if (seen[b.name] && !(seen[b.name] === "common.js" && defaults.has(b.name) && b.fn && (f === "fighter.js" || f === "merchant.js")))
			errs.push(`${b.name} declared in ${seen[b.name]} and ${b.file}:${b.line}`);
		seen[b.name] = seen[b.name] || f;
	}
	for (const [role, other] of [["fighter.js", "merchant.js"], ["merchant.js", "fighter.js"]]) {
		const have = new Set(["common.js", role, "main.js"].flatMap((f) => [...names(f)])), theirs = names(other);
		for (const f of ["common.js", role, "main.js"]) for (const b of B[f]) for (const r of b.refs)
			if (theirs.has(r) && !have.has(r)) errs.push(`${b.file}:${b.line} ${b.name} uses ${r}, which only ${other} declares (add a default to shared/15_hooks.js)`);
	}
	// a statement that runs at load (setInterval, character.on...) in a role file must use something that file declares:
	// one that only uses shared names belongs in shared/ (v25.1: the xp/gold sampling had been carried to fighter.js)
	const DECL_OR_SKIP = /^(?:async\s+function|function|const|let|var|class|\/\/|\}|\)|\]|\s|$)/;
	for (const f of ["fighter.js", "merchant.js"]) {
		const lines = fs.readFileSync(path.join(SRC, f), "utf8").split("\n"), own = names(f);
		for (let i = 0; i < lines.length; i++) {
			if (DECL_OR_SKIP.test(lines[i])) continue;
			let j = i, depth = 0, txt = "";
			do { txt += lines[j] + "\n"; depth += (lines[j].match(/[({[]/g) || []).length - (lines[j].match(/[)}\]]/g) || []).length; j++; } while (depth > 0 && j < lines.length);
			const ids = new Set(txt.replace(/\/\/.*$/gm, "").match(/(?<![\w$.])[A-Za-z_$][\w$]*/g) || []);
			if (![...ids].some((x) => own.has(x))) errs.push(`${f}:${i + 1} runs at load but uses nothing ${f} declares (move it to shared/): ${lines[i].trim().slice(0, 60)}`);
			i = j - 1;
		}
	}
	return errs;
}
module.exports = { check };
if (require.main === module) {
	const e = check();
	if (e.length) { console.error("FAIL: split check\n  " + e.join("\n  ")); process.exit(1); }
	console.log("ok - split check: no role uses a name only the other role declares");
}
