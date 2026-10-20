import rss from "@astrojs/rss"
import type { APIContext } from "astro"
import { getEntries, href } from "../lib/entries"

export async function GET(context: APIContext) {
    const items = await getEntries()
    return rss({
        title: "art/facts",
        description: "Experiments by Vansh Rastogi.",
        site: context.site!,
        items: items
            .sort((a, b) => b.entry.data.date.valueOf() - a.entry.data.date.valueOf())
            .map(({ entry }) => ({
                title: entry.data.title,
                pubDate: entry.data.date,
                description: entry.data.summary,
                link: href(entry),
                categories: entry.data.tags,
            })),
    })
}
