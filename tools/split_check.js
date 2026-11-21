// Static check of the src/ split: a role's file set (common + its role + main) must not use a name that only the
// other role's file declares, unless common.js has a default for it ("Role hooks"); and no name may be declared in
// two files except those defaults. Exit 1 with the list otherwise. Used by test/roles.js.
const fs = require("fs"), path = require("path");
const SRC = path.join(__dirname, "..", "src");
const DECL = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
// top-level declarations of a file, each with the identifiers its block references (comments and strings removed;
// object keys `name:` don't count)
function blocks(file) {
	const lines = fs.readFileSync(path.join(SRC, file), "utf8").split("\n"), out = [];
	lines.forEach((l, i) => { const m = l.match(DECL); if (m) out.push({ name: m[1] || m[2], line: i + 1, fn: /function/.test(l.split(/[=(]/)[0]) }); });
	for (let k = 0; k < out.length; k++) {
		const body = lines.slice(out[k].line - 1, k + 1 < out.length ? out[k + 1].line - 1 : lines.length).join("\n")
			.replace(/\/\/.*$/gm, "").replace(/`(?:\\.|[^`\\])*`/g, (m) => m.replace(/\$\{([^}]*)\}/g, " $1 ").replace(/[^${}\w\s]/g, " "))
			.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
		out[k].refs = new Set(body.match(/(?<![\w$.])[A-Za-z_$][\w$]*(?!\s*:(?!:))/g) || []);
	}
	return out;
}
function check() {
	const files = ["common.js", "fighter.js", "merchant.js", "main.js"], B = Object.fromEntries(files.map((f) => [f, blocks(f)]));
	const names = (f) => new Set(B[f].map((b) => b.name));
	const errs = [];
	const defaults = new Set(B["common.js"].filter((b) => b.fn).map((b) => b.name));
	// declared twice: only a common default replaced by a role file's function
	const seen = {};
	for (const f of files) for (const b of B[f]) {
		if (seen[b.name] && !(seen[b.name] === "common.js" && defaults.has(b.name) && b.fn && (f === "fighter.js" || f === "merchant.js")))
			errs.push(`${b.name} declared in ${seen[b.name]} and ${f}:${b.line}`);
		seen[b.name] = seen[b.name] || f;
	}
	for (const [role, other] of [["fighter.js", "merchant.js"], ["merchant.js", "fighter.js"]]) {
		const have = new Set(["common.js", role, "main.js"].flatMap((f) => [...names(f)])), theirs = names(other);
		for (const f of ["common.js", role, "main.js"]) for (const b of B[f]) for (const r of b.refs)
			if (theirs.has(r) && !have.has(r)) errs.push(`${f}:${b.line} ${b.name} uses ${r}, which only ${other} declares (add a default to common.js "Role hooks")`);
	}
	return errs;
}
module.exports = { check };
if (require.main === module) {
	const e = check();
	if (e.length) { console.error("FAIL: split check\n  " + e.join("\n  ")); process.exit(1); }
	console.log("ok - split check: no role uses a name only the other role declares");
}
