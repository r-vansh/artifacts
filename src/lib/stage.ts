// Shared loader for every <Stage>. Loads an experiment's module only once its stage
// is on screen, pauses it off screen or in a background tab, honours reduced motion,
// and falls back to the poster if anything throws.
import type { Experiment, Mount } from "./types"

// Vite turns each match into its own chunk, fetched only when import() runs
const modules = import.meta.glob<{ default: Mount }>("../experiments/*/main.ts")

const reduce = matchMedia("(prefers-reduced-motion: reduce)")

function fail(stage: HTMLElement, err: unknown) {
    console.error(err)
    stage.dataset.state = "error"
}

async function boot(stage: HTMLElement, canvas: HTMLCanvasElement) {
    const load = modules[`../experiments/${stage.dataset.slug}/main.ts`]
    if (!load) return fail(stage, new Error(`No main.ts for ${stage.dataset.slug}`))
    stage.dataset.state = "loading"

    let exp: Experiment
    try {
        const mod = await load()
        exp = mod.default(canvas)
    } catch (err) {
        return fail(stage, err)
    }
    stage.dataset.state = "live"

    let onScreen = true
    const sync = () => (onScreen && !document.hidden ? exp.resume() : exp.pause())
    new IntersectionObserver(([e]) => {
        onScreen = e.isIntersecting
        sync()
    }).observe(stage)
    document.addEventListener("visibilitychange", sync)
    addEventListener("pagehide", () => exp.stop(), { once: true })
}

for (const stage of document.querySelectorAll<HTMLElement>("[data-stage]")) {
    const canvas = stage.querySelector("canvas")!
    const play = stage.querySelector<HTMLButtonElement>("[data-play]")!

    if (reduce.matches) {
        // Poster stays; the visitor opts in
        stage.dataset.state = "paused"
        play.addEventListener("click", () => boot(stage, canvas), { once: true })
        continue
    }

    const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return
        io.disconnect()
        boot(stage, canvas)
    })
    io.observe(stage)
}
