// Page-to-page navigation without a reload. This stub is all the index ships; Barba and
// GSAP (src/lib/barba.ts) load on idle or the first sign of interest. A click that lands
// before they are ready is just a normal page load, so nothing depends on them.
let ready: Promise<unknown> | undefined
const load = () => (ready ??= import("./barba").catch(() => (ready = undefined)))

for (const ev of ["pointerover", "pointerdown", "touchstart", "focusin"]) addEventListener(ev, load, { once: true, passive: true })
if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 3000 })
else setTimeout(load, 2000)

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
