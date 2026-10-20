import { defineCollection } from "astro:content"
import { z } from "astro/zod"
import { glob } from "astro/loaders"

export const TAGS = ["game", "sound", "motion", "type", "ui", "visual", "generative", "failed"] as const

const experiments = defineCollection({
    // One folder per entry; folders starting with _ (the template) are skipped
    loader: glob({ pattern: "[!_]*/index.md", base: "./src/experiments", generateId: ({ entry }) => entry.split("/")[0] }),
    schema: ({ image }) =>
        z
            .object({
                title: z.string(),
                date: z.coerce.date(),
                summary: z.string().max(140),
                tags: z.array(z.enum(TAGS)).min(1),
                kind: z.enum(["interactive", "visual", "video", "external", "writeup"]),
                status: z.enum(["playable", "sketch", "retired"]),
                poster: image(),
                posterAlt: z.string(),
                preview: z.string().optional(),
                url: z.url().optional(),
                source: z.url().optional(),
                sound: z.boolean().default(false),
                inPortfolio: z.url().optional(),
                featured: z.boolean().default(false),
                background: z.string().default("var(--bg)"),
            })
            .refine((d) => d.kind !== "external" || d.url, { message: "external entries need a url" }),
})

export const collections = { experiments }
