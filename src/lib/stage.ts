// Shared loader for every <Stage>. Loads an experiment's module only once its stage
// is on screen, pauses it off screen or in a background tab, honours reduced motion,
// and falls back to the poster if anything throws. Stages that arrive through client
// navigation (src/lib/nav.ts) are picked up on "nav:enter" and stopped on "nav:leave".
import type { Experiment, Mount } from "./types"

// Vite turns each match into its own chunk, fetched only when import() runs
const modules = import.meta.glob<{ default: Mount }>("../experiments/*/main.ts")

const reduce = matchMedia("(prefers-reduced-motion: reduce)")
const seen = new WeakSet<HTMLElement>()
const cleanups = new Set<() => void>()
// What stops one stage, so an overlay can let go of the stages inside it (see overlay.ts)
const stops = new WeakMap<HTMLElement, () => void>()

function fail(stage: HTMLElement, err: unknown) {
    console.error(err)
    stage.dataset.state = "error"
}

async function boot(stage: HTMLElement, canvas: HTMLCanvasElement) {
    const load = modules[`../experiments/${stage.dataset.slug}/main.ts`]
    if (!load) return fail(stage, new Error(`No main.ts for ${stage.dataset.slug}`))
    stage.dataset.state = "loading"

    let exp: Experiment | undefined
    let io: IntersectionObserver | undefined
    let dead = false
    let onScreen = true
    const sync = () => (onScreen && !document.hidden ? exp?.resume() : exp?.pause())
    const dispose = () => {
        dead = true
        io?.disconnect()
        document.removeEventListener("visibilitychange", sync)
        removeEventListener("pagehide", dispose)
        cleanups.delete(dispose)
        exp?.stop()
    }
    cleanups.add(dispose)
    stops.set(stage, dispose)

    try {
        // The loader is the same experiment and listens for the same click, so wait for it
        if (document.documentElement.hasAttribute("data-splash"))
            await new Promise((r) => document.addEventListener("splash:done", r, { once: true }))
        const mod = await load()
        if (dead) return
        exp = mod.default(canvas)
    } catch (err) {
        cleanups.delete(dispose)
        return fail(stage, err)
    }
    stage.dataset.state = "live"

    io = new IntersectionObserver(([e]) => {
        onScreen = e.isIntersecting
        sync()
    })
    io.observe(stage)
    document.addEventListener("visibilitychange", sync)
    addEventListener("pagehide", dispose, { once: true })
}

function init() {
    for (const stage of document.querySelectorAll<HTMLElement>("[data-stage]")) {
        if (seen.has(stage)) continue
        seen.add(stage)
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
        cleanups.add(() => io.disconnect())
        stops.set(stage, () => io.disconnect())
    }
}

document.addEventListener("nav:leave", () => {
    for (const f of [...cleanups]) f()
    cleanups.clear()
})
document.addEventListener("nav:enter", init)
document.addEventListener("overlay:open", init)
document.addEventListener("overlay:close", (e) => {
    for (const stage of (e as CustomEvent<HTMLElement>).detail.querySelectorAll<HTMLElement>("[data-stage]")) stops.get(stage)?.()
})
init()
