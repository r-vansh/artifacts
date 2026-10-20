import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"

export default defineConfig({
    site: "https://artifacts.vanshrastogi.me",
    trailingSlash: "never",
    integrations: [sitemap()],
    build: {
        // The whole stylesheet is a few KB: inlining saves a render-blocking request
        inlineStylesheets: "always",
        format: "file",
    },
})
