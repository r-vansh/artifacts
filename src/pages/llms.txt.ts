import type { APIContext } from "astro"
import { getEntries, href } from "../lib/entries"

// Plain-text index for AI crawlers, matching vanshrastogi.me/llms.txt
export async function GET(context: APIContext) {
    const items = await getEntries()
    const lines = items.map(
        ({ entry }) => `- [${entry.data.title}](${new URL(href(entry), context.site)}): ${entry.data.summary}`
    )
    const body = [
        "# art/facts",
        "",
        "> Experiments by Vansh Rastogi, product designer: playable sketches, sound toys, motion studies and ideas that didn't work. Portfolio: https://vanshrastogi.me",
        "",
        "## Experiments",
        "",
        ...lines,
        "",
    ].join("\n")
    return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
