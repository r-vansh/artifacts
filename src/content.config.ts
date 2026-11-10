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
                // Real entries have a poster image; a placeholder can use a solid fill instead
                poster: image().optional(),
                posterAlt: z.string().default(""),
                ratio: z.number().positive().optional(),
                fill: z.string().default("var(--gray-200)"),
                // More media shown under the stage: a video (file name in the entry's folder), an image, or a solid block with a ratio (height / width)
                gallery: z
                    .array(z.object({ video: z.string().optional(), image: image().optional(), alt: z.string().default(""), ratio: z.number().positive().default(0.75), fill: z.string().default("var(--gray-100)") }))
                    .default([]),
                preview: z.string().optional(),
                url: z.url().optional(),
                source: z.url().optional(),
                sound: z.boolean().default(false),
                inPortfolio: z.url().optional(),
                featured: z.boolean().default(false),
                background: z.string().default("var(--gray-50)"),
            })
            .refine((d) => d.kind !== "external" || d.url, { message: "external entries need a url" })
            .refine((d) => d.poster || d.ratio, { message: "entries need a poster, or a ratio (height / width) for a solid fill" }),
})

export const collections = { experiments }
