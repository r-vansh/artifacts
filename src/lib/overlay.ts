// A post opens as an overlay over the grid instead of a page of its own. The click is
// caught on a card, the entry page is fetched, and its <main> is shown in a layer over the
// home page (which keeps its place underneath). The URL changes to the post's, so the link
// can be shared and Back closes it; opened directly, /<slug> is still a full page.
const SAME = /^\/[^/.]+$/ // /<slug>: not /tags/x, not a file
const reduced = matchMedia("(prefers-reduced-motion: reduce)")

let layer: HTMLElement | undefined
let trigger: HTMLElement | undefined
let pushed = false
let busy = false
let closing: HTMLElement | undefined
let reveal: Animation[] = []

const FLOW = "cubic-bezier(0.16, 1, 0.3, 1)" // quick to start, then a long, soft settle

const stopAll = () => {
    for (const a of reveal) a.cancel()
    reveal = []
    closing?.remove()
    closing = undefined
}

const sync = (doc: Document) => {
    // Scoped styles are inlined per page, so bring over the ones this document does not have yet
    const have = new Set([...document.head.querySelectorAll("style")].map((s) => s.textContent))
    for (const s of doc.head.querySelectorAll("style")) if (!have.has(s.textContent)) document.head.append(document.importNode(s, true))
}

// What an open post makes inert: the page, not the loader and not the dev panels (the Scroll
// panel tunes the post's own scrolling)
const siblings = () =>
    [...document.body.children].filter((el) => el !== layer && !el.classList.contains("splash") && !el.classList.contains("tune-dock")) as HTMLElement[]

// The particles a post opens and closes with (converge.ts, loaded on the first click,
// alongside the fetch)
type Particles = typeof import("./converge")
type Flock = ReturnType<Particles["begin"]> | undefined
let particles: Promise<Particles | undefined> | undefined
const loadParticles = () => import("./converge").catch(() => (particles = undefined))
// Loaded with the overlay (which itself loads on idle), so the first click does not wait for it
if (!reduced.matches) particles = loadParticles()
let flock: Promise<Flock> | undefined

async function open(url: URL, from: HTMLElement) {
    if (layer || busy) return
    busy = true
    stopAll()
    if (!reduced.matches) particles ??= loadParticles()
    flock = reduced.matches ? undefined : particles?.then((m) => m?.begin(from))
    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        const doc = new DOMParser().parseFromString(await res.text(), "text/html")
        const main = doc.querySelector<HTMLElement>('main[data-barba-namespace="entry"]')
        if (!main) throw new Error("no entry")
        sync(doc)
        // This <main> is not a page to swap: keep Barba away from it
        main.removeAttribute("data-barba")
        main.removeAttribute("data-barba-namespace")

        layer = document.createElement("div")
        layer.className = "overlay"
        layer.setAttribute("role", "dialog")
        layer.setAttribute("aria-modal", "true")
        layer.setAttribute("aria-label", doc.title)
        layer.tabIndex = -1
        layer.append(document.importNode(main, true))
        // With the particles, the card stays hidden until it morphs out of the poster: at 0.001,
        // not 0, so it is painted (and its images decoded) while the particles drift, not in
        // the middle of the morph
        if (flock) (layer.firstElementChild as HTMLElement).style.opacity = "0.001"
        // The scrim's crosshair marks: a 140px pattern of the 40px mark (kept after <main>,
        // which stays the layer's first child: the panel)
        layer.insertAdjacentHTML(
            "beforeend",
            `<svg class="marks" aria-hidden="true"><defs><pattern id="overlay-marks" width="140" height="140" patternUnits="userSpaceOnUse"><image href="/overlay-mark.svg" width="40" height="40"/></pattern></defs><rect width="100%" height="100%" fill="url(#overlay-marks)"/></svg>`,
        )
        // Only the card's own scrolling parts (the media column, the write-up, or the whole
        // card when it is one column) take a wheel; anywhere else it would scroll the page
        layer.addEventListener(
            "wheel",
            (e) => {
                for (let el = e.target as HTMLElement | null; el && el !== layer; el = el.parentElement) {
                    if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) return
                }
                e.preventDefault()
            },
            { passive: false },
        )
        document.body.append(layer)
        siblings().forEach((el) => el.setAttribute("inert", ""))

        trigger = from
        history.pushState({ overlay: true }, "", url)
        pushed = true
        document.title = doc.title

        const el = layer
        el.focus({ preventScroll: true })
        el.classList.add("on")
        // The page's own scripts (the stage loader) and "overlay:open" (stages start, the post's
        // own scrolling attaches) wait until the morph has landed, so a heavy experiment
        // booting (shaders, first draws) cannot make it stutter; the stage shows its poster
        // until then
        if (!reduced.matches) await arrive(el)
        if (layer !== el) return
        // innerHTML does not run module scripts: load them by URL
        await Promise.all(
            [...doc.querySelectorAll<HTMLScriptElement>("script[type=module][src]")].map((s) =>
                import(/* @vite-ignore */ new URL(s.getAttribute("src")!, location.href).href).catch(console.error)
            )
        )
        if (layer === el) document.dispatchEvent(new Event("overlay:open"))
    } catch {
        flock?.then((f) => f?.stop())
        location.href = url.href
    } finally {
        busy = false
    }
}

// The scrim dims while the card morphs out of the clicked poster (converge.ts: it grows from
// the poster's box to its own, out of a blur, with the poster's particles flying onto it and
// taking its colours). Without the particles (they could not load), the rise below instead
async function arrive(el: HTMLElement) {
    const panel = el.firstElementChild as HTMLElement
    const post = panel.querySelector<HTMLElement>(".post")
    const f = await flock
    if (!f || !post || layer !== el) {
        panel.style.opacity = ""
        return grow(el)
    }
    // No waiting here: the particles left at the click; the card joins them as it is (painted
    // invisibly first, then coming in over a quarter second at least)
    // Only the scrim fades up: fading the whole layer faded the card in it too, see-through
    reveal = scrim(el, 0, 1, { duration: 450, easing: "ease-out" })
    // From here the morph sets the card's own opacity (hidden at first, out of the poster)
    const landing = f.land(post)
    panel.style.opacity = ""
    await landing
}

// The scrim alone (its frosted ::before and its crosshair marks), faded without the card
function scrim(el: HTMLElement, from: number, to: number, timing: KeyframeAnimationOptions) {
    const marks = el.querySelector<SVGElement>(":scope > .marks")
    return [
        el.animate([{ opacity: from }, { opacity: to }], { ...timing, pseudoElement: "::before" }),
        ...(marks ? [marks.animate([{ opacity: from }, { opacity: to }], timing)] : []),
    ]
}

// The scrim dims gently while the panel rises a little into place, uncovered by a soft,
// feathered edge that flows down from its top; its blocks follow a beat behind, coming into
// focus as they settle. Transform on the panel is a translate only (stages size their
// canvases from it, so no scale)
function grow(el: HTMLElement) {
    const panel = el.firstElementChild as HTMLElement
    // A mask 2.5 times the panel's height: opaque, a feathered half-panel edge, clear. Moved
    // from the clear end to the opaque end, the edge sweeps down the panel
    panel.style.maskImage = "linear-gradient(to bottom, black 0%, black 40%, transparent 60%, transparent 100%)"
    panel.style.maskSize = "100% 250%"
    panel.style.maskRepeat = "no-repeat"
    const rise = panel.animate(
        [
            { opacity: 0, transform: "translateY(24px)", maskPosition: "0 100%" },
            { opacity: 1, transform: "none", maskPosition: "0 0" },
        ],
        { duration: 1000, easing: FLOW },
    )
    const unmask = () => {
        panel.style.maskImage = panel.style.maskSize = panel.style.maskRepeat = ""
    }
    rise.finished.then(unmask, unmask)
    reveal = [
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: "ease-out" }),
        rise,
        ...[...panel.querySelectorAll(".post .info, .post .media")].map((child, i) =>
            (child as HTMLElement).animate(
                [
                    { opacity: 0, transform: "translateY(14px)", filter: "blur(4px)" },
                    { opacity: 1, transform: "none", filter: "blur(0)" },
                ],
                { duration: 900, delay: 160 + i * 110, easing: FLOW, fill: "backwards" },
            ),
        ),
    ]
}

// Card <-> full window. Expanded, the card fills the window edge to edge and only the media
// grows: the text column keeps the width it had (--info-w), so nothing re-wraps, and the
// media column takes the rest. The class sets the end state; then, as a morph:
// - the card's box (white, guides, corners) grows or shrinks between the measured sizes;
// - its content is laid out once, at the end (the inner frame is frozen there, and the box
//   clips it), and flies from where it was: the media column moves and scales, the text
//   column moves.
// Box and content share duration and ease, so the content stays put in the card all along
// (its offset from the card's moving corner is linear in the same progress). No layout runs
// per frame but the card's own box, and a stage's canvas is resized once.
const MORPH = 700
let morph: Animation[] = []
let morphDone: (() => void) | undefined

// The ripple expand (cards with data-ripple; test-11 for now): instead of the morph, a liquid
// ripple runs out from the expand button over the whole overlay, and the expanded page is
// revealed inside it, its edge riding the wave. Made of:
// - a still copy of the card where it was, under the post, so the card does not vanish;
// - the post switched to its full-window layout at once, clipped to a circle round the
//   button that grows to the farthest corner (clip-path);
// - an SVG displacement filter on the whole layer (scrim, marks, the copy and the post): its
//   map is a ring of waves (a sine under a soft envelope, pushing along the radius) drawn once
//   on a canvas, placed each frame so the ring sits on the circle's edge; the push dies away
//   as the ring reaches the corners. Outside the map, a flat mid-grey means no push.
const RIPPLE = 1000 // ms: the ripple crossing the window
const PUSH = 46 // px: the strongest push of the wave
const RING = 0.75 // where the ring sits in the map, as a share of its half-width
let rippleMapUrl = ""
function rippleMap() {
    if (rippleMapUrl) return rippleMapUrl
    const N = 512
    const c = document.createElement("canvas")
    c.width = c.height = N
    const g = c.getContext("2d")!
    const im = g.createImageData(N, N)
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            const nx = ((x + 0.5) / N) * 2 - 1
            const ny = ((y + 0.5) / N) * 2 - 1
            const r = Math.hypot(nx, ny)
            const d = r - RING
            const w = r > 0 ? Math.sin((d / 0.07) * Math.PI) * Math.exp(-(d * d) / (2 * 0.1 * 0.1)) : 0
            const i = (y * N + x) * 4
            im.data[i] = 128 + 127 * (r > 0 ? (nx / r) * w : 0)
            im.data[i + 1] = 128 + 127 * (r > 0 ? (ny / r) * w : 0)
            im.data[i + 2] = 0
            im.data[i + 3] = 255
        }
    }
    g.putImageData(im, 0, 0)
    return (rippleMapUrl = c.toDataURL())
}
function rippleFilter() {
    let svg = document.getElementById("post-ripple-svg")
    if (!svg) {
        document.body.insertAdjacentHTML(
            "beforeend",
            `<svg id="post-ripple-svg" width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="post-ripple" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feFlood flood-color="rgb(128,128,0)" result="flat"/><feImage href="${rippleMap()}" preserveAspectRatio="none" result="ring"/><feComposite in="ring" in2="flat" operator="over" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`,
        )
        svg = document.getElementById("post-ripple-svg")!
    }
    return { ring: svg.querySelector("feImage")!, push: svg.querySelector("feDisplacementMap")! }
}
// FLOW's feel (fast out, long soft finish) for the frame loop
const FLOW_AT = (k: number) => 1 - (1 - k) ** 4
let rippling: (() => void) | undefined
function rippleExpand(el: HTMLElement, post: HTMLElement, x: number, y: number) {
    rippling?.()
    // The card as it is now, left where it is under the post
    const old = post.getBoundingClientRect()
    const look = getComputedStyle(post)
    const still = post.cloneNode(true) as HTMLElement
    still.inert = true
    still.setAttribute("aria-hidden", "true")
    // Pinned as it looks now: inside the expanded layer it would take the full-window style
    Object.assign(still.style, {
        position: "fixed",
        left: `${old.left}px`,
        top: `${old.top}px`,
        width: `${old.width}px`,
        height: `${old.height}px`,
        margin: "0",
        // Over the scrim's marks, under the post (same level, earlier in the layer)
        zIndex: "1",
        borderColor: look.borderColor,
        boxShadow: look.boxShadow,
        transition: "none",
    })
    const main = post.closest("main")!
    el.insertBefore(still, main)
    const media = post.querySelector<HTMLElement>(".media")
    const stillMedia = still.querySelector<HTMLElement>(".media")
    if (media && stillMedia) stillMedia.scrollTop = media.scrollTop

    // The page, at once, inside a circle that grows from the button
    el.classList.add("full")
    const reach = Math.max(Math.hypot(x, y), Math.hypot(innerWidth - x, y), Math.hypot(x, innerHeight - y), Math.hypot(innerWidth - x, innerHeight - y))
    const { ring, push } = rippleFilter()
    el.style.filter = "url(#post-ripple)"
    const t0 = performance.now()
    let raf = 0
    const end = () => {
        cancelAnimationFrame(raf)
        rippling = undefined
        el.style.filter = ""
        post.style.clipPath = ""
        still.remove()
    }
    rippling = end
    const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / RIPPLE)
        const r = reach * 1.04 * FLOW_AT(k)
        post.style.clipPath = `circle(${r.toFixed(1)}px at ${x}px ${y}px)`
        const size = (2 * Math.max(r, 1)) / RING
        ring.setAttribute("x", String(x - size / 2))
        ring.setAttribute("y", String(y - size / 2))
        ring.setAttribute("width", String(size))
        ring.setAttribute("height", String(size))
        // Swells in fast, then dies away by the time the wave has crossed the window
        push.setAttribute("scale", String(PUSH * Math.sin(Math.min(1, k * 4) * (Math.PI / 2)) * (1 - k) ** 1.2))
        if (k < 1 && post.isConnected) raf = requestAnimationFrame(tick)
        else end()
    }
    raf = requestAnimationFrame(tick)
}

// Card <-> full window. Expanded, the card fills the window edge to edge and only the media
// grows: the text column keeps the width it had (--info-w), so nothing re-wraps, and the
// media column takes the rest. The class sets the end state; then, as a morph:
// - the card's box (white, guides, corners) grows or shrinks between the measured sizes;
// - its content is laid out once, at the end (the inner frame is frozen there, and the box
//   clips it), and flies from where it was: the media column moves and scales, the text
//   column moves.
// Box and content share duration and ease, so the content stays put in the card all along
// (its offset from the card's moving corner is linear in the same progress). No layout runs
// per frame but the card's own box, and a stage's canvas is resized once.
// A card with data-ripple expands by the ripple instead (above).
function expand(el: HTMLElement, button: HTMLAnchorElement) {
    const post = el.querySelector<HTMLElement>(".post")
    const inner = post?.querySelector<HTMLElement>(".inner")
    const info = post?.querySelector<HTMLElement>(".info")
    const media = post?.querySelector<HTMLElement>(".media")
    if (!post || !inner || !info || !media) return
    morphDone?.()
    rippling?.()
    const oc = post.getBoundingClientRect()
    const oi = info.getBoundingClientRect()
    const om = media.getBoundingClientRect()
    const full = !el.classList.contains("full")
    button.setAttribute("aria-label", full ? "Back to the card" : "Expand")
    if (full) post.style.setProperty("--info-w", `${oi.width}px`)
    if (full && post.hasAttribute("data-ripple") && !reduced.matches) {
        const b = button.getBoundingClientRect()
        return rippleExpand(el, post, b.left + b.width / 2, b.top + b.height / 2)
    }
    el.classList.toggle("full", full)
    if (!full) post.style.removeProperty("--info-w")
    if (reduced.matches) return
    const nc = post.getBoundingClientRect()
    const ni = info.getBoundingClientRect()
    const nm = media.getBoundingClientRect()
    const ninner = inner.getBoundingClientRect()

    Object.assign(inner.style, { right: "auto", bottom: "auto", width: `${ninner.width}px`, height: `${ninner.height}px` })
    post.style.overflow = "clip"
    media.style.transformOrigin = "0 0"
    // Where a block was in the old card, against where it is in the new one
    const from = (o: DOMRect, n: DOMRect) => [o.left - oc.left - (n.left - nc.left), o.top - oc.top - (n.top - nc.top)]
    const [ix, iy] = from(oi, ni)
    const [mx, my] = from(om, nm)
    const run = { duration: MORPH, easing: FLOW }
    morph = [
        post.animate([{ width: `${oc.width}px`, height: `${oc.height}px` }, { width: `${nc.width}px`, height: `${nc.height}px` }], run),
        media.animate([{ transform: `translate(${mx}px, ${my}px) scale(${om.width / nm.width})` }, { transform: "none" }], run),
        info.animate([{ transform: `translate(${ix}px, ${iy}px)` }, { transform: "none" }], run),
    ]
    const done = () => {
        if (morphDone !== done) return
        morphDone = undefined
        for (const a of morph) a.cancel()
        morph = []
        inner.style.right = inner.style.bottom = inner.style.width = inner.style.height = ""
        media.style.transformOrigin = ""
        post.style.overflow = ""
    }
    morphDone = done
    Promise.all(morph.map((a) => a.finished)).then(done, () => {})
}

const home = document.title

function remove(instant = false) {
    if (!layer) return
    const gone = layer
    layer = undefined
    pushed = false
    siblings().forEach((el) => el.removeAttribute("inert"))
    document.title = home
    // Stages inside stop and let go of their canvases
    document.dispatchEvent(new CustomEvent("overlay:close", { detail: gone }))
    // Any particles still flying in go
    const opening = flock
    flock = undefined
    const from = trigger
    const post = gone.querySelector<HTMLElement>(".post")
    if (instant || reduced.matches) {
        opening?.then((f) => f?.stop())
        stopAll()
        gone.remove()
    }
    else {
        for (const a of reveal) a.cancel()
        reveal = []
        closing = gone
        const panel = gone.firstElementChild as HTMLElement
        // With the particles: the card dissolves into particles of its own colours (they come
        // in over it as it fades), which fly back into the poster as it fades in; the scrim
        // clears meanwhile. Without them: the panel sinks a little as it fades
        const back =
            particles && post && from
                ? particles.then(async (m) => {
                      ;(await opening)?.stop()
                      if (!m) return
                      from.style.opacity = "0"
                      return m.leave(post, from)
                  })
                : (opening?.then((f) => f?.stop()), undefined)
        // (with the particles the card morphs itself back into the poster: only the scrim
        // clears here, once the card is on its way)
        const anims = back
            ? []
            : [panel.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(12px)" }], { duration: 380, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" })]
        const fade = back
            ? scrim(gone, 1, 0, { duration: 560, delay: 260, easing: "ease-in-out", fill: "forwards" })
            : [gone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, delay: 80, easing: "ease-in-out", fill: "forwards" })]
        Promise.all([...anims.map((a) => a.finished), ...fade.map((a) => a.finished), back?.catch(() => {})]).then(
            () => {
                if (closing === gone) closing = undefined
                gone.remove()
            },
            () => {}
        )
    }
    trigger?.focus({ preventScroll: true })
}

// Closed from the page (the back chip, Esc): Back out of the pushed entry, which closes it
const dismiss = () => (pushed ? history.back() : remove())

addEventListener(
    "click",
    (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        // A click on the dimmed area round the panel closes it
        if (layer && e.target === layer) {
            e.preventDefault()
            return dismiss()
        }
        const a = (e.target as Element).closest?.<HTMLAnchorElement>("a[href]")
        if (!a) return
        if (layer?.contains(a) && a.classList.contains("back")) {
            e.preventDefault()
            e.stopImmediatePropagation()
            return dismiss()
        }
        // The card's expand corner: the card grows to fill the window, edge to edge, like a
        // page; again and it goes back
        if (layer?.contains(a) && a.classList.contains("expand")) {
            e.preventDefault()
            e.stopImmediatePropagation()
            return expand(layer, a)
        }
        if (layer || !a.closest(".card") || a.origin !== location.origin || !SAME.test(a.pathname)) return
        e.preventDefault()
        e.stopImmediatePropagation()
        open(new URL(a.href), a)
    },
    true
)

addEventListener("keydown", (e) => {
    if (e.key === "Escape" && layer) dismiss()
})

// Back closes the overlay (and Forward would not reopen it: that is a normal page then)
addEventListener(
    "popstate",
    (e) => {
        if (!layer) return
        e.stopImmediatePropagation()
        remove()
    },
    true
)

// A link inside the overlay that goes to another page (a tag) is a normal navigation
document.addEventListener("nav:leave", () => layer && remove(true))

export {}
