import { getCollection, type CollectionEntry } from "astro:content"

export type Entry = CollectionEntry<"experiments">

/** All entries, newest first, featured pinned on top, each with its running number. */
export async function getEntries() {
    const all = await getCollection("experiments")
    const oldestFirst = [...all].sort((a, b) => a.data.date.valueOf() - b.data.date.valueOf())
    const number = new Map(oldestFirst.map((e, i) => [e.id, i + 1]))
    const sorted = [...all].sort(
        (a, b) => Number(b.data.featured) - Number(a.data.featured) || b.data.date.valueOf() - a.data.date.valueOf()
    )
    return sorted.map((entry) => ({ entry, number: number.get(entry.id)! }))
}

export const pad = (n: number) => `#${String(n).padStart(3, "0")}`

export const isoDate = (d: Date) => d.toISOString().slice(0, 10)

/** Where a card links: the entry page, or straight out for external entries. */
export const href = (e: Entry) => (e.data.kind === "external" ? e.data.url! : `/x/${e.id}`)
