// Smooth scrolling for the whole page (Lenis; Vansh, 2026-11-04). Loaded lazily by nav.ts on
// idle or the first wheel, never under reduced motion; a wheel before it is ready scrolls
// natively. The page still scrolls the window, so everything that reads `scrollY` or listens
// for "scroll" (the intro, the bulge, Barba's scroll restore) keeps working.
//
// An open post (overlay.ts) scrolls inside itself, not the page: the page's instance skips
// it, and each of its scrolling parts gets a Lenis of its own while it is open (Vansh,
// 2026-11-05: the media column scrolled natively, without the glide).
//
// Every instance takes the same settings, `params`, tuned from the dev-only Scroll panel
// (scroll-tune.ts), which calls `retune()`.
import Lenis, { type LenisOptions } from "lenis"

export const params = {
    smooth: 1, // smooth the wheel (0 native)
    lerp: 0.1, // glide: share of the way to the target per frame (lower is longer)
    duration: 0, // a fixed duration per scroll instead of the glide (s; 0 uses the glide)
    wheel: 1, // wheel distance multiplier
    syncTouch: 0, // smooth touch too (0 native, Lenis's default)
    syncTouchLerp: 0.075, // touch glide
    inertia: 1.7, // touch inertia (exponent of the flick's speed)
    touch: 1, // touch distance multiplier
}

// Exponential ease-out, for the fixed duration
const easing = (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t))

const options = (): LenisOptions => ({
    autoRaf: true,
    smoothWheel: params.smooth >= 0.5,
    lerp: params.lerp,
    // Only with a duration: Lenis takes an easing on its own as "a 1 s duration", which
    // overrides the glide
    duration: params.duration > 0 ? params.duration : undefined,
    easing: params.duration > 0 ? easing : undefined,
    wheelMultiplier: params.wheel,
    syncTouch: params.syncTouch >= 0.5,
    syncTouchLerp: params.syncTouchLerp,
    touchInertiaExponent: params.inertia,
    touchMultiplier: params.touch,
})

// Things that scroll on their own or must not scroll the page: an open post (its own
// instances below) and the dev panels
const page = () => new Lenis({ ...options(), prevent: (node) => node.classList.contains("overlay") || node.classList.contains("tune") })
export let lenis = page()

// The open post's scrolling parts: the media column, or the whole card when it is one column
// (narrow windows). Whichever is a scroll container gets an instance; Lenis measures an
// element's scrollHeight but only re-measures when its box resizes, so an image loading
// inside (which makes it taller) re-measures it too.
let inside: { lenis: Lenis; off: () => void }[] = []
function attach() {
    detach()
    const layer = document.querySelector<HTMLElement>(".overlay")
    if (!layer) return
    for (const el of layer.querySelectorAll<HTMLElement>(".post, .post .media")) {
        if (!/auto|scroll/.test(getComputedStyle(el).overflowY)) continue
        const own = new Lenis({ ...options(), wrapper: el, content: el, eventsTarget: el })
        const remeasure = () => own.resize()
        el.addEventListener("load", remeasure, true)
        inside.push({ lenis: own, off: () => el.removeEventListener("load", remeasure, true) })
    }
}
function detach() {
    for (const { lenis: own, off } of inside) {
        off()
        own.destroy()
    }
    inside = []
}
document.addEventListener("overlay:open", attach)
document.addEventListener("overlay:close", detach)
// Across the 900px breakpoint the part that scrolls changes (media column / whole card)
let settle = 0
addEventListener("resize", () => {
    clearTimeout(settle)
    settle = window.setTimeout(() => inside.length && attach(), 200)
})
// Loaded while a post is already open
attach()

/** Settings changed (the Scroll panel). Most apply live; the wheel and touch distances are
 *  copied into Lenis's input handler when it is made, so those make the instances again
 *  (they keep the scroll position: the page and the post scroll natively underneath) */
export const retune = (key?: keyof typeof params | null) => {
    if (key === "wheel" || key === "touch" || key == null) {
        lenis.destroy()
        lenis = page()
        if (inside.length) attach()
        return
    }
    for (const l of [lenis, ...inside.map((i) => i.lenis)]) Object.assign(l.options, options())
}

// A page swap: drop any glide still running, so it cannot fight Barba's scroll reset
document.addEventListener("nav:leave", () => {
    detach()
    lenis.scrollTo(scrollY, { immediate: true, force: true })
})
document.addEventListener("nav:enter", () => lenis.resize())
