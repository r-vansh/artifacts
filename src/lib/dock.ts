// A bulge under the pointer on the index grid, as if the page were pushed up into a dome
// there (Vansh, 2026-11-04; it replaced a macOS-dock scale the same day). Each poster (with
// its number/title row) and each crosshair is a flat tile on that dome: lifted towards you
// (perspective, so it grows), turned to follow the surface, pushed outward like a lens and
// shaded as it turns away. The lens follows the pointer with a little lag and sinks when the
// pointer leaves. Only for a real hover pointer and without reduced motion; transforms only,
// the layout never moves. The settings are live: `dock-tune.ts` (dev only) changes them from
// a panel and calls `retune()`.
export const params = {
    max: 1.05, // scale at the top of the bulge (1 flat)
    radius: 2, // bulge radius, in column pitches (poster centre to poster centre)
    round: 0.3, // profile: 0 a soft bump, 1 a flat top with steep sides (always flat at the rim)
    depth: 500, // perspective (px): lower turns the tilted posts more dramatically
    tilt: 2, // posts turn with the surface (0 keep facing you)
    push: 0.75, // lens push outward (1 as the perspective gives it, 0 none)
    shade: 0, // posts darken as they turn away (black overlay at most this strong)
    ease: 1, // the lens follows the pointer (1 instant)
    swell: 0.08, // the bulge rises and sinks as the pointer comes and goes (share per frame, 1 instant)
}

const fine = matchMedia("(hover: hover) and (pointer: fine)")
const reduced = matchMedia("(prefers-reduced-motion: reduce)")

interface Item {
    card: HTMLElement
    crosses: HTMLElement[]
    last: string // the card's transform last written, to skip writes that change nothing
    lastCross: string[]
}

let items: Item[] = []
let px = -1e4
let py = -1e4
let lx = 0 // the lens centre, chasing the pointer
let ly = 0
let amt = 0 // 0 flat, 1 full bulge
let raf = 0
let open = false // a post is open over the grid

const collect = () => {
    items = [...document.querySelectorAll<HTMLElement>(".grid .card")].map((card) => {
        const crosses = [...card.querySelectorAll<HTMLElement>(".cross")]
        return { card, crosses, last: "", lastCross: crosses.map(() => "") }
    })
}

const toward = (from: number, to: number, snap: number, rate = params.ease) => (Math.abs(to - from) < snap ? to : from + (to - from) * rate)
let catching = false // the lens is gliding back to the pointer after it came back into the window
const DEG = 180 / Math.PI
const LIMIT = 75 // degrees: a tile never turns fully edge-on

// The dome at a point: lift (z), turn (rx, ry), lens push (tx, ty) and how far it faces away
function surface(x: number, y: number, R: number, H: number) {
    const dx = x - lx
    const dy = y - ly
    const d = Math.hypot(dx, dy)
    const t = d / R
    if (t >= 1 || H <= 0) return null
    const { round, depth, tilt, push } = params
    // (1 - t^p)²: p 2 is a soft bump, higher p a flatter top with steeper sides. Flat at the
    // rim whatever p, so a tile leaving the dome eases flat instead of snapping (a sphere,
    // √(1 - t²), was infinitely steep there: the tiles at the edge turned the most)
    const p = 2 + 4 * round
    const tp = t ** p
    const z = H * (1 - tp) ** 2
    const slope = d > 0 ? ((H / R) * -2 * p * (tp / t) * (1 - tp)) : 0 // dz/dd
    const gx = d > 0 ? (slope * dx) / d : 0
    const gy = d > 0 ? (slope * dy) / d : 0
    // One turn about the axis along the slope (rotateY then rotateX also twisted the tile
    // in its own plane at large angles)
    const g = Math.hypot(gx, gy)
    const angle = Math.min(LIMIT, Math.atan(g) * DEG * tilt)
    const turn = 1 - Math.cos(angle / DEG)
    const spin = g > 1e-6 ? ` rotate3d(${(gy / g).toFixed(4)}, ${(-gx / g).toFixed(4)}, 0, ${angle.toFixed(2)}deg)` : ""
    const k = depth / (depth - z) - 1
    const transform = `translate(${(dx * k * push).toFixed(1)}px, ${(dy * k * push).toFixed(1)}px) perspective(${depth}px) translateZ(${z.toFixed(1)}px)${spin}`
    return { z, turn, transform }
}

function frame() {
    raf = 0
    // Off under the loader (html[data-splash]) and while a post is open over the grid
    const live = !open && !document.documentElement.hasAttribute("data-splash")
    const want = live && px > -1e3 ? 1 : 0
    // The lens appears where the pointer is, then chases it. If the pointer comes back while
    // the old bulge has not sunk yet, the bulge glides over to it instead of jumping
    if (want && amt < 0.02) {
        lx = px
        ly = py
        catching = false
    }
    if (want) {
        const rate = catching ? Math.min(params.ease, 0.18) : params.ease
        lx = toward(lx, px, 0.3, rate)
        ly = toward(ly, py, 0.3, rate)
        if (lx === px && ly === py) catching = false
    }
    // The bulge rises and sinks at its own pace (`swell`), whatever the lens's speed, so leaving
    // and coming back never pops it in or out
    amt = toward(amt, want, 0.003, params.swell)
    const moving = amt !== want || (want === 1 && (lx !== px || ly !== py))

    // Read everything first (layout boxes: the transforms are on the children), then write
    const rects = items.map((it) => it.card.getBoundingClientRect())
    const w = rects[0]?.width ?? 0
    const pitch = rects.length > 1 && Math.abs(rects[1].top - rects[0].top) < 1 ? Math.abs(rects[1].left - rects[0].left) : 1.8 * w
    const R = params.radius * pitch
    const H = params.depth * (1 - 1 / Math.max(params.max, 1)) * amt
    const crossAt = items.map((it, i) =>
        it.crosses.map((c) => (c.offsetParent ? { x: rects[i].left + c.offsetLeft + c.offsetWidth / 2, y: rects[i].top + c.offsetTop + c.offsetHeight / 2 } : null)),
    )

    items.forEach((it, i) => {
        const r = rects[i]
        const near = r.bottom > -R && r.top < innerHeight + R
        // The poster is the square at the bottom of the card
        const s = near ? surface(r.left + r.width / 2, r.bottom - r.width / 2, R, H) : null
        const next = s?.transform ?? ""
        if (next !== it.last) {
            it.last = next
            const st = it.card.style
            if (s) {
                st.setProperty("--t", next)
                st.setProperty("--w", `${r.width.toFixed(1)}px`)
                st.setProperty("--shade", (params.shade * Math.min(1, s.turn * 3)).toFixed(3))
                st.zIndex = String(1 + Math.round(s.z))
            } else {
                st.removeProperty("--t")
                st.removeProperty("--shade")
                st.zIndex = ""
            }
        }
        it.crosses.forEach((c, j) => {
            const at = crossAt[i][j]
            const cs = at && near ? surface(at.x, at.y, R, H) : null
            const t = cs?.transform ?? ""
            if (t !== it.lastCross[j]) {
                it.lastCross[j] = t
                c.style.transform = t
            }
        })
    })
    if (moving) raf = requestAnimationFrame(frame)
}

const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame)
}

/** Settings changed (the dev panel): run the loop again */
export const retune = () => {
    for (const it of items) it.last = ""
    kick()
}

const off = () => {
    if (px < -1e3) return
    px = py = -1e4
    catching = true
    kick()
}

if (fine.matches && !reduced.matches) {
    collect()
    addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return
        px = e.clientX
        py = e.clientY
        kick()
    })
    addEventListener("scroll", kick, { passive: true })
    addEventListener("resize", retune)
    // The pointer leaving the window: `pointerleave` on the root does not always fire, a
    // `mouseout` with nothing to go to does
    document.documentElement.addEventListener("pointerleave", off)
    document.addEventListener("mouseout", (e) => !e.relatedTarget && off())
    addEventListener("blur", off)
    // The pointer may be resting on a poster when the loader or a post goes away: bulge
    // there then, not on the next move
    document.addEventListener("splash:done", kick)
    document.addEventListener("overlay:open", () => {
        open = true
        kick()
    })
    document.addEventListener("overlay:close", () => {
        open = false
        kick()
    })
    // Barba swaps pages: pick up the new grid, or drop the old one
    document.addEventListener("nav:enter", () => {
        open = false
        collect()
        kick()
    })
    document.addEventListener("nav:leave", () => {
        items = []
    })
}
