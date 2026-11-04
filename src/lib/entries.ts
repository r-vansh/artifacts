import { getCollection, type CollectionEntry } from "astro:content"

export type Entry = CollectionEntry<"experiments">

/** All entries, newest first, featured pinned on top, each with its number: its place in that
 *  order, counting up from 1 (Vansh, 2026-11-05; it used to count by date, oldest first, so
 *  the newest post had the highest number). A new post becomes 001 and the rest move down one.
 *  Tag pages show a subset but keep these numbers. */
export async function getEntries() {
    const all = await getCollection("experiments")
    const sorted = [...all].sort(
        (a, b) => Number(b.data.featured) - Number(a.data.featured) || b.data.date.valueOf() - a.data.date.valueOf()
    )
    return sorted.map((entry, i) => ({ entry, number: i + 1 }))
}

/** Height / width an entry's card (and the first block on its page) is shown at. Every card
 *  is square for now, posters are cropped to fit; the entry's own `ratio` is not used. */
export const ratioOf = (_e: Entry) => 1

export const pad = (n: number) => `#${String(n).padStart(3, "0")}`

export const isoDate = (d: Date) => d.toISOString().slice(0, 10)

/** Where a card links: the entry page, or straight out for external entries. */
export const href = (e: Entry) => (e.data.kind === "external" ? e.data.url! : `/${e.id}`)
