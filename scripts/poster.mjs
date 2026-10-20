// Grabs a poster for an experiment from its running canvas.
// Usage: npm run build && npm run poster -- <slug> [seconds to let it run, default 3]
// Needs Chrome or Chromium; set CHROME_PATH if it isn't found.
import { chromium } from "playwright-core"
import { createServer } from "node:http"
import { readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { extname, join } from "node:path"

const [slug, wait = "3"] = process.argv.slice(2)
if (!slug) {
    console.error("Usage: npm run poster -- <slug> [seconds]")
    process.exit(1)
}

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".avif": "image/avif", ".webp": "image/webp", ".png": "image/png" }
const server = createServer(async (req, res) => {
    let p = join("dist", decodeURIComponent(new URL(req.url, "http://x").pathname))
    if (!extname(p)) p += ".html"
    try {
        res.writeHead(200, { "Content-Type": types[extname(p)] ?? "application/octet-stream" })
        res.end(await readFile(p))
    } catch {
        res.writeHead(404).end()
    }
}).listen(0)
const port = server.address().port

const candidates = [process.env.CHROME_PATH, "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"]
const executablePath = candidates.find((p) => p && existsSync(p))
const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 })
await page.goto(`http://localhost:${port}/x/${slug}/play`)
await page.waitForSelector('[data-state="live"]', { timeout: 10000 })
await page.waitForTimeout(Number(wait) * 1000)
const png = await page.locator("canvas").screenshot()
await writeFile(`src/experiments/${slug}/poster.png`, png)
console.log(`Saved src/experiments/${slug}/poster.png. Rebuild to use it.`)
await browser.close()
server.close()
