// Fails the build when a page goes over the performance budget in the plan.
// Sizes are gzipped, since that's what visitors download.
import { readFile, readdir, stat } from "node:fs/promises"
import { gzipSync } from "node:zlib"
import { join, relative } from "node:path"

const KB = 1024
const BUDGET = {
    html: 30 * KB, // a page's HTML with its inlined CSS
    pageJs: 5 * KB, // JS a page loads before any experiment
    experiment: 60 * KB, // one experiment's own chunk
    font: 30 * KB,
}

const gz = (buf) => gzipSync(buf, { level: 9 }).length
const fmt = (n) => `${(n / KB).toFixed(1)} KB`

async function* walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) yield* walk(p)
        else yield p
    }
}

const files = []
for await (const f of walk("dist")) files.push(f)

const problems = []
const rows = []
const check = (label, size, limit) => {
    rows.push([label, fmt(size), fmt(limit), size <= limit ? "ok" : "OVER"])
    if (size > limit) problems.push(`${label}: ${fmt(size)} > ${fmt(limit)}`)
}

// Experiment chunks are the files Vite split out of import.meta.glob; name them
// by their source folder (Vite names chunks after the module, here "main")
const jsFiles = files.filter((f) => f.endsWith(".js"))
const loaderOrShared = new Set()

for (const f of files.filter((f) => f.endsWith(".html"))) {
    const html = await readFile(f, "utf8")
    check(`page ${relative("dist", f)}`, gz(html), BUDGET.html)
    // Module scripts the page loads up front, plus their static imports
    const seen = new Set()
    const queue = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => join("dist", m[1]))
    let js = 0
    while (queue.length) {
        const p = queue.shift()
        if (seen.has(p)) continue
        seen.add(p)
        loaderOrShared.add(p)
        const src = await readFile(p, "utf8")
        js += gz(src)
        for (const m of src.matchAll(/(?:^|[;\s}])import\s*(?:[\w{}\s,*$]+from\s*)?["']\.\/([^"']+\.js)["']/g)) {
            queue.push(join(p, "..", m[1]))
        }
    }
    // Inline module scripts count too
    for (const m of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) js += gz(m[1])
    if (js) check(`  js ${relative("dist", f)}`, js, BUDGET.pageJs)
}

for (const f of jsFiles.filter((f) => !loaderOrShared.has(f))) {
    check(`experiment ${relative("dist", f)}`, gz(await readFile(f)), BUDGET.experiment)
}

for (const f of files.filter((f) => f.endsWith(".woff2"))) {
    check(`font ${relative("dist", f)}`, (await stat(f)).size, BUDGET.font)
}

const w = Math.max(...rows.map((r) => r[0].length))
console.log("\nBudget (gzipped)")
for (const r of rows) console.log(`${r[0].padEnd(w)}  ${r[1].padStart(8)} / ${r[2].padStart(8)}  ${r[3]}`)

if (problems.length) {
    console.error(`\nOver budget:\n${problems.map((p) => `  ${p}`).join("\n")}`)
    process.exit(1)
}
console.log("\nAll pages within budget.")
