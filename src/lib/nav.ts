// Page-to-page navigation without a reload. This stub is all the index ships; Barba and
// GSAP (src/lib/barba.ts) load on idle or the first sign of interest. A click that lands
// before they are ready is just a normal page load, so nothing depends on them.
let ready: Promise<unknown> | undefined
const load = () => (ready ??= import("./barba").catch(() => (ready = undefined)))

for (const ev of ["pointerover", "pointerdown", "touchstart", "focusin"]) addEventListener(ev, load, { once: true, passive: true })
if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 3000 })
else setTimeout(load, 2000)

// Smooth scrolling (src/lib/smooth.ts, Lenis), also lazy: on idle or the first wheel
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const smooth = () => import("./smooth").catch(() => {})
    addEventListener("wheel", smooth, { once: true, passive: true })
    if ("requestIdleCallback" in window) requestIdleCallback(smooth, { timeout: 3000 })
    else setTimeout(smooth, 2000)
    // Its tuning panel, only under `npm run dev` (the build strips this)
    if (import.meta.env.DEV) import("./scroll-tune")
}

// The page's own scrollbar (src/lib/scrollbar.ts), loaded the first time a mouse comes near the right
// edge; a touch screen scrolls by touch and never loads it
if (matchMedia("(hover: hover)").matches) {
    const onMove = (e: PointerEvent) => {
        if (e.pointerType === "touch" || e.clientX < innerWidth - 40) return
        removeEventListener("pointermove", onMove)
        import("./scrollbar").catch(() => {})
    }
    addEventListener("pointermove", onMove, { passive: true })
}

// Warm the browser cache for the page a link points at, so Barba's fetch is instant
const warmed = new Set<string>()
addEventListener(
    "pointerover",
    (e) => {
        const a = (e.target as Element).closest?.<HTMLAnchorElement>("a[href]")
        if (!a || a.origin !== location.origin || warmed.has(a.href) || /\.\w+$|\/play$/.test(a.pathname)) return
        warmed.add(a.href)
        const l = document.createElement("link")
        l.rel = "prefetch"
        l.href = a.href
        document.head.append(l)
    },
    { passive: true }
)
