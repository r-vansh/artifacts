// Scroll effect for the index intro: as the page scrolls, the "ART/facts" heading and the
// line under it slide towards each other (driven by the eased scroll position) until they
// touch on the page's centre line. Scrolling on pushes them into each other (over `crush`
// of the window height), and only what is pushed past the point of contact breaks off, so a
// light touch chips the tips and the rest crumbles from where they meet as the scroll goes
// on, along a ragged line (`ragged`) that stays short of the centre line, so the halves never
// overlap; the text blurs more the nearer the centre it is (`soft`, `blur`). The real text
// hands over to the particle-drawn text gradually over the last `blend` of the approach, and
// takes over again over `rest` ms once the particles are home. Each particle that breaks off
// bursts out, the primary
// colour, into a cloud around the collision and settles there (`puff`); the debris stays
// until the whole text is shredded, and `hold` ms after that the pointer, which acts as a
// magnet, picks them up one by one (over `stagger` ms, each pull building over `ramp` ms). The magnet is a force, not a tween, so they speed up and settle with a little
// overshoot (`bounce`). They follow the pointer's path: each is pulled to where the pointer
// was a moment ago (the first ones to where it is now, the last ones up to `trail` ms back),
// so the swarm strings out along the line the pointer drew and gathers in a soft cloud on it
// when it stops. To keep that organic rather than a neat tube, while things move a slowly
// changing field of eddies pushes them about (`wander`), the trail frays wider towards its
// tail (`fray`) and each particle pulls a little differently (`vary`). The first time a
// particle reaches its spot by the pointer it fades out for good (`reach`, `fade`), so the
// swarm is gone once it has caught up with the pointer. Scrolling back above the impact
// brings them back out of the pointer, where it is now, one by one over `emerge` ms: each
// leaves it already on its way and fades in as it goes, and the text pulls it straight to
// its spot in it, wherever the text is (the same pull, ramp and eddies; they do not gather in
// the middle first, nor show up on the pointer all at once). Their colour never jumps: when
// they break off they are the text's grey and warm up to the primary orange (`warm`), and on the way
// back they cool to the grey again as they near their spots (`cool`), so the real text takes
// over unseen both ways. Before it breaks off a particle is drawn in the text's grey where
// the text is, so the text is all particles from the touch on. The text is copied
// onto a canvas glyph by glyph at the positions the browser laid it out at, then sampled into
// particles; the real text is only faded out (it stays in the accessibility tree). Skipped
// under reduced motion. Every setting lives in `params`, which the dev-only panel (tune.ts)
// changes live.
interface Dot {
    k: number // the part it came from: 0 heading, 1 line
    x: number // where it sits in the text before the slide, in page px
    y: number
    px: number // where it is drawn, in window px
    py: number
    vx: number // px/s
    vy: number
    free: boolean // moving on its own: pulled by the pointer, or on its way back to the text
    // Its own random draws, kept raw so the settings can change live
    dir: number // radians: straight out of the point of impact
    jit: number // -0.5 to 0.5: how far its pop strays from that, as a share of `scatter`
    spd: number // its pop speed, as a share of `pop`
    lag: number // 0 to 1: where along the path it follows (raised to `taper`)
    ox: number // where it settles in the cloud, in units of `cloud`
    oy: number
    shade: number // 0 to 1: its opacity between `opacity` and 1
    wake: number // 0 to 1: when, within `stagger`, the magnet (or the text) picks it up
    grit: number // 0 to 1: how much weaker its pull is, as a share of `vary`
    whim: number // -0.5 to 0.5: how differently from its neighbours the eddies push it
    done: boolean // it has reached the pointer once and is fading out, for good
    vis: number // 0 to 1: how visible it is
    out: number // on the way back: when it comes out of the pointer (ms, performance.now())
    tint: number // 0 the text's grey to 1 the primary orange
    depth: number // px: how far behind the point of contact it is, along the way its half runs in
    rag: number // 0 to 1: how much further than that it holds on, as a share of `ragged`
    haze: number // how blurred it is drawn, near the break: 0 sharp, up to BANDS
    brk: number // when it broke off (ms, performance.now())
}

// The shipped settings. The dev-only panel (tune.ts) changes them live and copies them back
// out in this shape.
export const params = {
    // The collision
    approach: 0.1, // of the window height scrolled until the two collide
    rush: 1.5, // how they pick up speed into each other: 1 steady, higher rushes in at the end
    glide: 120, // ms: how softly the slide follows the scroll
    blend: 0.2, // share of the approach over which the real text fades into the particle-drawn text (all particles by the touch)
    crush: 0.1, // of the window height scrolled after they touch until they have crumbled away (0: all at once on touching)
    ragged: 16, // px: how uneven the line they crumble along is, short of the centre line (0: a straight cut on it)
    soft: 120, // px: how far from the centre line the blur reaches, from nothing out there to `blur` at the line (0: sharp)
    blur: 6, // px: how blurred the text is right at the centre line
    // The burst: a cloud first, then the magnet takes over
    pop: 800, // px/s: the fastest a particle flies outwards at impact
    scatter: 270, // degrees: how far the pops stray from straight out of the impact, all told (360: any way, one full cloud; 90 makes two lobes)
    squash: 0.7, // the up-and-down part of the pop, as a share of the sideways part
    puff: 1.5, // per second: how quickly the cloud slows down (it spreads about pop / puff px), and its eddies with it
    hold: 0, // ms: how long the cloud hangs, once the text is all shredded, before the magnet starts picking particles up
    stagger: 400, // ms: the magnet picks them up one by one over this long, in random order
    ramp: 310, // ms: how long each particle's pull takes to build up to full
    // The magnet
    pull: 10000, // px/s²: the magnet's pull at full strength, from `fall` px out
    fall: 80, // px: closer than this the pull eases off, so they settle instead of colliding
    drag: 6, // per second: how fast they lose speed against the path (top speed = pull / drag)
    bounce: 0, // 0 to 1: how much they overshoot as they settle (0: none, 1: springy)
    // The trail
    trail: 500, // ms of the pointer's path they string out along (0: all on the pointer, as one cloud)
    taper: 2, // how the trail thins out: 1 evenly, higher packs more of them near the pointer
    cloud: 20, // px: the spread of the cloud they settle in on the pointer, and around its path
    // Organic: what keeps the swarm from moving as one neat tube
    wander: 4000, // px/s²: how hard the eddies push particles about while things move (0: not at all)
    billow: 0.15, // share of that in the cloud before the magnet, where nothing holds them back
    eddy: 220, // px: how big the eddies are
    churn: 0.8, // how fast the eddies change, per second
    fray: 3, // how much wider the trail gets towards its tail (0: an even tube, 2: three times as wide)
    vary: 0.55, // 0 to 0.9: how differently they pull, so some hang back and some rush ahead
    // Vanishing: the first time they reach the pointer they fade out, for good
    reach: 80, // px: how close to its spot by the pointer a particle gets before it fades
    fade: 300, // ms: how long it takes to fade out (and to show again when the page scrolls back)
    // The look
    size: 1, // px: one particle (and the spacing they are sampled at)
    opacity: 0.5, // the faintest orange particle; the rest range up to fully opaque (grey ones are solid, like the text)
    warm: 600, // ms: after the impact they turn from the text's grey to orange over this long
    cool: 200, // px: on the way back they turn from orange to the text's grey within this distance of their spot
    // Scrolling back: out of the pointer, then straight into the text (with the same pull and
    // ramp as the magnet)
    emerge: 700, // ms: they come out of the pointer one by one over this long, in random order
    land: 60, // ms: in the last `fall` px each is drawn into its spot this quickly (lower: snappier)
    rest: 300, // ms: once they are all home, the particle-drawn text fades into the real text over this long
}
const STEPS = 48 // points along the path; each particle follows its own spot between two of them
const STILL = 6 // px/s: slower than this a particle counts as settled, so the loop can stop
const LAST = 0.02 // on the way back, the share still out when the text takes over (they just join it)
const SHADES = 16 // steps between the text's grey and the primary orange
const BANDS = 16 // steps of blur towards the centre line, fine enough not to show as bands

let intro: HTMLElement | null = null
let parts: HTMLElement[] = []
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
// Where the blurred edge is drawn sharp, a band at a time, before it is copied over blurred
const haze = document.createElement("canvas")
let hctx: CanvasRenderingContext2D | null = null
let dpr = 1
let shift: { x: number; y: number }[] = [] // each part's offset at the moment of impact
let runs: { x: number; y: number }[] = [] // the way each part runs in (unit vectors)
let lens: number[] = [] // px: how far each part slides in to the touch
let deepest = 0 // px: the furthest any particle is behind the point of contact
let dots: Dot[] = []
let path: { t: number; x: number; y: number }[] = [] // the pointer's recent positions, oldest first
let moved = -Infinity // when the pointer last moved
let shades: string[][] = [] // per part, its colours from its text's grey to the primary orange, SHADES of them
let measured = "" // the layout the dots were sampled at (see `layout()`)
let cw = 0 // canvas size in CSS px
let ch = 0
let cur = 0
let loose = false // past the impact
let shred = 0 // when the last of the text broke off (0 while some of it holds)
let after = 0 // 0 to 1: how much the particle-drawn text still shows after the way back
let raf = 0
let last = 0
let live = false

const clamp = (n: number) => Math.min(1, Math.max(0, n))

// Draws every glyph of el onto c where the browser put it (r: the canvas origin in client px)
function copy(c: CanvasRenderingContext2D, el: HTMLElement, r: DOMRect, scale: number) {
    const css = getComputedStyle(el)
    c.font = `${css.fontStyle} ${css.fontWeight} ${parseFloat(css.fontSize) * scale}px ${css.fontFamily}`
    c.fillStyle = css.color
    const range = document.createRange()
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
        const text = node.textContent ?? ""
        for (let i = 0; i < text.length; i++) {
            if (!text[i].trim()) continue
            range.setStart(node, i)
            range.setEnd(node, i + 1)
            const box = range.getBoundingClientRect()
            const m = c.measureText(text[i])
            const ascent = m.fontBoundingBoxAscent / scale
            const base = box.top + (box.height - ascent - m.fontBoundingBoxDescent / scale) / 2 + ascent
            c.fillText(text[i], (box.left - r.left) * scale, (base - r.top) * scale)
        }
    }
}

// The red, green and blue of a CSS colour, as the canvas reads it ("#rrggbb" when opaque)
function rgb(c: CanvasRenderingContext2D, css: string) {
    c.fillStyle = css
    const hex = String(c.fillStyle)
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

// The page width and where the intro and its two parts sit, which is all the particles'
// places depend on. Offsets ignore the slide's transforms. The intro sits at a share of the
// window height on wide screens, so a height-only resize moves it too
function layout() {
    if (!intro) return ""
    const top = Math.round(intro.getBoundingClientRect().top + scrollY)
    return [document.documentElement.clientWidth, top, ...parts.flatMap((el) => [el.offsetLeft, el.offsetTop, el.offsetWidth])].join()
}

// The canvas covers the window
function fit() {
    if (!canvas) return
    dpr = Math.min(2, devicePixelRatio || 1)
    cw = canvas.clientWidth
    ch = canvas.clientHeight
    canvas.width = haze.width = Math.round(cw * dpr)
    canvas.height = haze.height = Math.round(ch * dpr)
    ctx = canvas.getContext("2d")
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    hctx = haze.getContext("2d")
    hctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

// The particles' colours, mixed from two tokens: their own part's grey (the heading and the line
// are different greys) and the primary orange
function tint(o: CanvasRenderingContext2D) {
    const orange = rgb(o, getComputedStyle(document.documentElement).getPropertyValue("--primary").trim())
    shades = parts.map((el) => {
        const grey = rgb(o, getComputedStyle(el).color)
        return Array.from({ length: SHADES }, (_, i) => `rgb(${grey.map((v, j) => Math.round(v + ((orange[j] - v) * i) / (SHADES - 1))).join(",")})`)
    })
}

function measure() {
    if (!intro) return
    for (const el of parts) el.style.transform = ""
    const width = document.documentElement.clientWidth
    measured = layout()

    // Where they meet: side by side they close the gap on the centre line; stacked (phones)
    // they meet halfway between them, both centred
    const [a, b] = parts.map((el) => el.getBoundingClientRect())
    // Side by side they meet in the middle of the gap between them, so each travels half of
    // it (the heading and the line are not equally wide, so that is not the page's centre);
    // stacked, both centre on the page
    const cx = b.left >= a.right ? (a.right + b.left) / 2 : width / 2
    const cy = (a.top + a.height / 2 + b.top + b.height / 2) / 2
    shift =
        b.left >= a.right
            ? [
                  { x: cx - a.right, y: cy - (a.top + a.height / 2) },
                  { x: cx - b.left, y: cy - (b.top + b.height / 2) },
              ]
            : [
                  { x: cx - (a.left + a.width / 2), y: (a.bottom + b.top) / 2 - a.bottom },
                  { x: cx - (b.left + b.width / 2), y: (a.bottom + b.top) / 2 - b.top },
              ]

    // The way each part runs in; how far behind the point of contact a particle is along it
    // says how far the two have to push into each other before it breaks off
    lens = shift.map((s) => Math.hypot(s.x, s.y))
    runs = shift.map((s, k) => ({ x: s.x / (lens[k] || 1), y: s.y / (lens[k] || 1) }))
    deepest = 0

    // Sample the glyphs at twice the size, one particle every `size` px of ink
    const scale = 2
    const off = document.createElement("canvas")
    const o = off.getContext("2d", { willReadFrequently: true })
    if (!o) return
    tint(o)
    dots = []
    parts.forEach((el, k) => {
        const r = el.getBoundingClientRect()
        const box = new DOMRect(r.left - 2, r.top - 2, r.width + 4, r.height + 4)
        off.width = Math.ceil(box.width * scale)
        off.height = Math.ceil(box.height * scale)
        copy(o, el, box, scale)
        const data = o.getImageData(0, 0, off.width, off.height).data
        const step = params.size * scale
        for (let y = 0; y < off.height; y += step) {
            for (let x = 0; x < off.width; x += step) {
                if (data[(Math.floor(y) * off.width + Math.floor(x)) * 4 + 3] < 110) continue
                const px = box.left + x / scale
                const py = box.top + y / scale
                // Popped away from the point of impact, faster the closer it was
                const dx = px + shift[k].x - cx
                const dy = py + shift[k].y - cy
                const d = Math.hypot(dx, dy) || 1
                // A soft cloud: denser in the middle, no hard edge
                const spread = Math.sqrt(-2 * Math.log(1 - Math.random() * 0.99))
                const spot = Math.random() * Math.PI * 2
                const depth = Math.max(0, -(dx * runs[k].x + dy * runs[k].y))
                deepest = Math.max(deepest, depth)
                dots.push({
                    k,
                    x: px,
                    y: py + scrollY,
                    // Where it is at impact, in case that has already happened
                    px: px + shift[k].x,
                    py: py + shift[k].y,
                    vx: 0,
                    vy: 0,
                    // Sampled again past the impact (a resize): already the magnet's
                    free: loose,
                    dir: Math.atan2(dy, dx),
                    jit: Math.random() - 0.5,
                    spd: (0.25 + Math.random() * 0.75) * Math.max(0.35, 1 - d / 400),
                    lag: Math.random(),
                    ox: Math.cos(spot) * spread,
                    oy: Math.sin(spot) * spread,
                    shade: Math.random(),
                    wake: Math.random(),
                    grit: Math.random(),
                    whim: Math.random() - 0.5,
                    done: false,
                    vis: 1,
                    out: 0,
                    tint: 0,
                    depth,
                    rag: Math.random(),
                    haze: 0,
                    brk: 0,
                })
            }
        }
    })
}

// Where the pointer was at time t (ms), between the two samples around it
function along(t: number) {
    let i = path.length - 1
    while (i > 0 && path[i].t > t) i--
    const a = path[i]
    const b = path[i + 1]
    if (!b || a.t >= t) return a
    const k = (t - a.t) / (b.t - a.t || 1)
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}

// A slowly changing field of eddies about `eddy` px across: the direction it pushes at (x, y)
function flow(x: number, y: number, now: number) {
    const s = 1 / params.eddy
    const t = (now / 1000) * params.churn
    return (Math.sin(x * s + t) + Math.sin(y * s * 1.3 - t * 0.7) + Math.sin((x - y) * s * 0.6 + t * 1.3)) * Math.PI
}

// Moves a particle `n` short steps of `sec` s. With `aim`, it is pulled towards (x, y), a spot
// moving at (vx, vy) px/s, with `grip` (0 to 1) of its pull; without, or at grip 0, it only
// drifts and slows at `puff`. Eddies push it with `stir` px/s². `vary`: how much weaker its
// own pull may be. Returns how far it is from the spot (Infinity without one)
function seek(d: Dot, aim: boolean, x: number, y: number, vx: number, vy: number, grip: number, stir: number, vary: number, n: number, sec: number, now: number) {
    const held = aim && grip > 0
    // In the cloud it slows at `puff`; held, at `drag`, against the spot it heads for
    const drag = params.puff + (params.drag - params.puff) * grip
    // Its own pull, and the stiffness that gives close to its spot (ω)
    const pull = params.pull * (1 - Math.min(0.9, vary) * d.grit)
    const w = Math.sqrt(pull / params.fall)
    // Extra damping close to its spot, enough that `bounce` 0 settles without overshooting
    // (critical damping, 2ω) and 1 adds none
    const settle = Math.max(0, 2 * (1 - params.bounce) * w - params.drag)
    let gap = Infinity
    for (let s = 0; s < n; s++) {
        const tx = vx * grip
        const ty = vy * grip
        let near = 0
        let dist = 0
        let ux = 0
        let uy = 0
        if (held) {
            // Full pull from `fall` px out, easing off closer in so it settles on its spot
            const dx = x - d.px
            const dy = y - d.py
            dist = Math.hypot(dx, dy) || 1
            gap = dist
            ux = dx / dist
            uy = dy / dist
            const f = pull * grip * Math.min(1, dist / params.fall)
            d.vx += ux * f * sec
            d.vy += uy * f * sec
            near = 1 - Math.min(1, dist / params.fall)
        }
        // Pushed about by the eddies: neighbours drift together, each a little its own way
        if (stir > 0) {
            const angle = flow(d.px, d.py, now) + d.whim * 1.5
            d.vx += Math.cos(angle) * stir * sec
            d.vy += Math.sin(angle) * stir * sec
        }
        // Loses speed against the spot it heads for, not against the page, so the drag does
        // not hold it back from a moving pointer
        const damp = Math.exp(-(drag + settle * near * grip) * sec)
        d.vx = tx + (d.vx - tx) * damp
        d.vy = ty + (d.vy - ty) * damp
        // Never closes in faster than it could still stop from without overshooting
        // (ω · distance, ω = √(pull / fall)), plus `bounce` of its top speed, which is what
        // carries it past its spot (1: not capped at all)
        if (held && params.bounce < 1) {
            const closing = (d.vx - tx) * ux + (d.vy - ty) * uy
            const limit = w * dist + (params.bounce * pull) / params.drag
            if (closing > limit) {
                d.vx -= ux * (closing - limit)
                d.vy -= uy * (closing - limit)
            }
        }
        d.px += d.vx * sec
        d.py += d.vy * sec
    }
    return gap
}

// Breaks a particle off the text where it is, and it bursts out; the magnet takes it from there
function snap(d: Dot, now: number) {
    const angle = d.dir + (d.jit * params.scatter * Math.PI) / 180
    const speed = d.spd * params.pop
    d.free = true
    d.haze = 0
    d.done = false
    d.vis = 1
    d.tint = 0
    d.brk = now
    d.vx = Math.cos(angle) * speed
    d.vy = Math.sin(angle) * speed * params.squash
}

// Scrolled down to the touch again while some were on their way back to the text: the ones
// still inside the pointer stay gone, the rest are the magnet's again from where they are
function touch(now: number) {
    for (const d of dots) {
        if (!d.free) continue
        d.done = d.vis <= 0
        d.brk = now
    }
}

// Scrolled back above the impact: the ones that had vanished wait inside the pointer and come
// out one by one over `emerge` ms; the rest head home from where they are. The text pulls
// them all home
function recall(now: number) {
    for (const d of dots) {
        d.out = d.done && d.vis <= 0 && path.length ? now + d.wake * params.emerge : now
        d.done = false
    }
}

// Moves and draws everything; true while something is still moving
function step(now: number, dt: number) {
    if (!intro || !ctx) return false
    const a = clamp(cur / (innerHeight * params.approach))
    if (a >= 1 && !loose) touch(now)
    else if (a < 1 && loose) recall(now)
    loose = a >= 1
    const t = a ** params.rush
    // Once they touch they push on into each other as the scroll goes on, all the way after
    // another `crush` of the window height: what reaches the point of contact (less up to
    // `ragged`) breaks off
    const crush = innerHeight * params.crush
    const press = loose ? (crush > 0 ? clamp((cur - innerHeight * params.approach) / crush) : 1) * deepest : 0
    // How much of the text is drawn as particles rather than the real text: blended in over
    // the last `blend` of the approach, so it is all particles by the touch
    const pre = loose ? 1 : params.blend > 0 ? clamp((a - (1 - params.blend)) / params.blend) : 0
    // While the magnet is picking them up or the path is still catching up with the pointer
    let busy = loose && ((shred > 0 && now - shred < params.hold + params.stagger + params.ramp) || now - moved < params.trail + 50)
    let whole = 0 // how many are still part of the text
    let away = 0 // how many are still on their way back to the text
    // The path from the pointer back to `trail` ms ago, at STEPS points, with how fast each
    // point is moving
    const marks =
        loose && path.length
            ? Array.from({ length: STEPS }, (_, i) => {
                  const at = now - (i / (STEPS - 1)) * params.trail
                  const p = along(at)
                  const q = along(at - 16)
                  return { x: p.x, y: p.y, vx: (p.x - q.x) / 0.016, vy: (p.y - q.y) / 0.016 }
              })
            : null
    // Short steps, so a stiff pull stays steady when frames are slow
    const n = Math.ceil(dt / 17)
    const sec = dt / 1000 / n
    const fading = dt / Math.max(1, params.fade)
    for (const d of dots) {
        // Its spot in the text, where the text is now: slid in, and once they touch, pushed on
        // into the other half
        const tx = d.x + shift[d.k].x * t + runs[d.k].x * press
        const ty = d.y - scrollY + shift[d.k].y * t + runs[d.k].y * press
        // Still part of the text, drawn in its grey where it is. It breaks off up to `ragged`
        // px before it reaches the point of contact, never past it, so the halves never overlap
        if (!d.free) {
            d.px = tx
            d.py = ty
            d.vis = 1
            d.tint = 0
            d.haze = 0
            if (loose && press >= d.depth - d.rag * params.ragged) snap(d, now)
            else {
                whole++
                // Blurred more the nearer the centre line: from nothing `soft` px out, easing in
                // (squared) so there is no edge where it starts, up to `blur` at the line; it
                // builds up as the halves come together (once the particles have taken over
                // from the real text)
                if (pre > 0 && params.soft > 0 && params.blur > 0) {
                    const off = d.depth + lens[d.k] * (1 - t) - press // px from the centre line
                    const near = clamp(1 - off / params.soft)
                    d.haze = Math.ceil(near * near * pre * BANDS)
                }
            }
            continue
        }
        if (loose) {
            // Gone: it reached the pointer once and has faded out
            if (d.done && d.vis <= 0) continue
            const since = now - d.brk
            // Its point on the path (0 at the pointer, 1 at the tail), between the two marks
            // around it, so they do not line up in bands
            const u = d.lag ** params.taper
            let mx = 0
            let my = 0
            let mvx = 0
            let mvy = 0
            if (marks) {
                const at = u * (STEPS - 1)
                const i = Math.min(STEPS - 2, Math.floor(at))
                const f = at - i
                const m0 = marks[i]
                const m1 = marks[i + 1]
                mx = m0.x + (m1.x - m0.x) * f
                my = m0.y + (m1.y - m0.y) * f
                mvx = m0.vx + (m1.vx - m0.vx) * f
                mvy = m0.vy + (m1.vy - m0.vy) * f
            }
            // How firmly the magnet has it: 0 while it is in the cloud (until the whole text is
            // shredded), building up to 1 once its turn comes after that
            const grip = shred > 0 ? clamp((now - Math.max(shred, d.brk) - params.hold - d.wake * params.stagger) / Math.max(1, params.ramp)) : 0
            // How fast its point on the path moves (0 to 1): the trail frays and the eddies
            // stir only while things move, so a still swarm settles. In the cloud they only
            // billow (`billow`); at full strength they would carry it off in streams
            const motion = Math.min(1, Math.hypot(mvx, mvy) / 400) * grip
            // The cloud's eddies die down twice as fast as it slows (`puff`), so debris left
            // hanging settles soon (at the same pace they kept it stirring for 5s)
            const calm = Math.exp((-2 * params.puff * since) / 1000)
            const stir = Math.max((1 - grip) * params.billow * calm, motion) * params.wander
            // Pulled to its spot around its point on the path
            const spread = params.cloud * (1 + params.fray * u * motion)
            const gap = seek(d, !!marks, mx + d.ox * spread, my + d.oy * spread, mvx, mvy, grip, stir, params.vary, n, sec, now)
            // The first time the magnet has it fully and it reaches its spot by the pointer,
            // it fades out for good; until then it shows (again, if it was on its way back)
            if (!d.done && grip >= 1 && gap < params.reach) d.done = true
            // The text's grey when it breaks off, warming up to orange
            d.tint = clamp(since / Math.max(1, params.warm))
            d.vis = d.done ? Math.max(0, d.vis - fading) : Math.min(1, d.vis + fading)
            if ((d.done && d.vis > 0) || Math.abs(d.vx) + Math.abs(d.vy) > STILL) busy = true
            continue
        }
        // On its way back. Until its turn it waits, hidden, inside the pointer (following it)
        away++
        busy = true
        if (now < d.out) {
            const p = path.at(-1)
            if (p) {
                d.px = p.x + d.ox * params.cloud * 0.5
                d.py = p.y + d.oy * params.cloud * 0.5
            }
            d.vx = d.vy = 0
            d.vis = 0
            d.tint = 1
            continue
        }
        // Then the text pulls it straight to its spot, the pull building over `ramp` ms, and it
        // fades in as it goes. Eddies while it travels, none within `fall` px of its spot, so
        // it lands exactly (any left there would hold the weaker-pulling ones a pixel or two
        // off it)
        d.vis = Math.min(1, d.vis + fading)
        const grip = clamp((now - d.out) / Math.max(1, params.ramp))
        const far = Math.hypot(tx - d.px, ty - d.py)
        // Orange on its way, cooling to the text's grey as it nears its spot
        d.tint = clamp(far / Math.max(1, params.cool))
        const stir = Math.max((1 - grip) * params.billow, grip * clamp((far - params.fall) / 400)) * params.wander
        // Every one at full pull on the way home: the weaker pulls only made a slow tail
        const gap = seek(d, true, tx, ty, 0, 0, grip, stir, 0, n, sec, now)
        // In the last `fall` px it is drawn into its spot quickly (`land`) rather than creeping
        // up on it, as the overshoot cap alone would have it
        if (grip >= 1 && gap < params.fall) {
            const k = 1 - Math.exp(-dt / Math.max(1, params.land))
            d.px += (tx - d.px) * k
            d.py += (ty - d.py) * k
            d.vx *= 1 - k
            d.vy *= 1 - k
        }
        // Arrived: the text holds it from here
        if (grip >= 1 && Math.hypot(tx - d.px, ty - d.py) < 1 && Math.abs(d.vx) + Math.abs(d.vy) < 30) d.free = false
    }
    // The moment the last of the text breaks off, the magnet can start
    if (!loose || whole > 0) shred = 0
    else if (!shred) shred = now
    // The real text shows only before the impact, once the particles are back in it. The last
    // few stragglers would keep it waiting for a second, so they just join it
    if (!loose && away > 0 && away <= dots.length * LAST) {
        for (const d of dots) d.free = false
        away = 0
    }
    // ...and blended back out over `rest` ms once they are all home again
    if (loose || away > 0) after = 1
    else if (after > 0) {
        after = Math.max(0, after - dt / Math.max(1, params.rest))
        busy = true
    }
    // Eased in and out (smoothstep), so neither fade starts or stops abruptly
    const v = Math.max(pre, after)
    const veil = v * v * (3 - 2 * v)
    parts.forEach((el, k) => {
        el.style.transform = t ? `translate3d(${(shift[k].x * t).toFixed(1)}px,${(shift[k].y * t).toFixed(1)}px,0)` : ""
        el.style.opacity = veil > 0 ? (1 - veil).toFixed(3) : ""
    })
    // The box round them lets go of its line as the text turns to particles, and takes it back
    intro?.style.setProperty("--frame", (1 - veil).toFixed(3))
    ctx.clearRect(0, 0, cw, ch)
    if (veil <= 0) return busy
    const size = params.size
    // Part by part and shade by shade, so the colour changes only so many times a frame
    for (let i = 0; i < SHADES * shades.length; i++) {
        const k = Math.floor(i / SHADES)
        ctx.fillStyle = shades[k][i % SHADES]
        for (const d of dots) {
            if (d.vis <= 0 || d.haze > 0 || d.k !== k || Math.round(d.tint * (SHADES - 1)) !== i % SHADES) continue
            if (d.px < -size || d.py < -size || d.px > cw || d.py > ch) continue
            // Solid while grey, like the text; its own opacity once orange. The text's own
            // particles show as much as the particle-drawn text does
            const own = params.opacity + d.shade * (1 - params.opacity)
            ctx.globalAlpha = (1 - d.tint * (1 - own)) * d.vis * (d.free ? 1 : veil)
            ctx.fillRect(d.px, d.py, size, size)
        }
    }
    ctx.globalAlpha = 1
    // The text near the break, band by band: drawn sharp onto `haze` around where that band
    // is, then copied over with that band's blur (where the canvas cannot blur, it stays sharp)
    if (hctx) {
        for (let b = 1; b <= BANDS; b++) {
            let x0 = Infinity
            let y0 = Infinity
            let x1 = -Infinity
            let y1 = -Infinity
            // Each part in its own grey
            for (let k = 0; k < shades.length; k++) {
                hctx.fillStyle = shades[k][0]
                for (const d of dots) {
                    if (d.haze !== b || d.k !== k) continue
                    hctx.fillRect(d.px, d.py, size, size)
                    x0 = Math.min(x0, d.px)
                    y0 = Math.min(y0, d.py)
                    x1 = Math.max(x1, d.px + size)
                    y1 = Math.max(y1, d.py + size)
                }
            }
            if (x0 === Infinity) continue
            const r = (b / BANDS) * params.blur
            // Room for the blur to spread, kept inside the canvas
            const left = Math.max(0, Math.floor(x0 - r * 3))
            const top = Math.max(0, Math.floor(y0 - r * 3))
            const w = Math.min(cw, Math.ceil(x1 + r * 3)) - left
            const h = Math.min(ch, Math.ceil(y1 + r * 3)) - top
            if (w > 0 && h > 0) {
                // Clipped to the box, or the canvas blurs a layer the size of the whole window
                ctx.save()
                ctx.beginPath()
                ctx.rect(left, top, w, h)
                ctx.clip()
                ctx.filter = `blur(${r.toFixed(2)}px)`
                ctx.globalAlpha = veil
                ctx.drawImage(haze, left * dpr, top * dpr, w * dpr, h * dpr, left, top, w, h)
                ctx.restore()
            }
            hctx.clearRect(left - 1, top - 1, w + 2, h + 2)
        }
    }
    return busy
}

function frame(now: number) {
    const dt = Math.min(64, now - last || 16.7)
    last = now
    cur += (scrollY - cur) * (1 - Math.exp(-dt / Math.max(1, params.glide)))
    if (Math.abs(scrollY - cur) < 0.2) cur = scrollY
    const busy = step(now, dt)
    raf = busy || cur !== scrollY ? requestAnimationFrame(frame) : 0
}
const kick = () => {
    if (!raf) {
        // The layout may have moved since the last run (zoom, a late font): sample again if so
        if (live && intro && layout() !== measured) measure()
        last = performance.now()
        raf = requestAnimationFrame(frame)
    }
}
// pointerover too: it fires when the page scrolls under a pointer that has not moved yet
const point = (e: PointerEvent) => {
    const now = performance.now()
    path.push({ t: now, x: e.clientX, y: e.clientY })
    // Keep as much of it as the trail needs, plus the sample before that
    while (path.length > 2 && path[1].t < now - params.trail - 100) path.shift()
    moved = now
    if (loose) kick()
}
// Sample again only when the layout really moved: phones resize as the address bar comes and
// goes without moving the intro, and sampling is not cheap. Checking the width alone missed
// height-only resizes on wide screens, leaving the particle copy off the real text
const resize = () => {
    if (layout() !== measured) measure()
    fit()
    kick()
}

function stop() {
    if (!live) return
    live = false
    cancelAnimationFrame(raf)
    raf = 0
    removeEventListener("scroll", kick)
    removeEventListener("resize", resize)
    for (const type of ["pointermove", "pointerdown", "pointerover"] as const) removeEventListener(type, point)
    for (const el of parts) {
        el.style.transform = ""
        el.style.opacity = ""
    }
    intro?.style.removeProperty("--frame")
    canvas?.remove()
    intro = canvas = ctx = null
    parts = []
    dots = []
    path = []
    loose = false
    after = 0
}

async function start() {
    stop()
    const el = document.querySelector<HTMLElement>(".intro[data-burst]")
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const found = [el.querySelector<HTMLElement>("h1"), el.querySelector<HTMLElement>("p")]
    if (!found[0] || !found[1]) return
    live = true
    await document.fonts.ready
    // A page change may have come in while the fonts loaded
    if (!live || !el.isConnected) return
    intro = el
    parts = found as HTMLElement[]
    canvas = document.createElement("canvas")
    canvas.className = "burst"
    canvas.setAttribute("aria-hidden", "true")
    intro.append(canvas)
    fit()
    measure()
    cur = scrollY
    if (step(performance.now(), 16.7)) kick()
    addEventListener("scroll", kick, { passive: true })
    addEventListener("resize", resize)
    for (const type of ["pointermove", "pointerdown", "pointerover"] as const) addEventListener(type, point, { passive: true })
}

document.addEventListener("nav:enter", start)
document.addEventListener("nav:leave", stop)
// The dark mode switch changed the text's greys
document.addEventListener("theme:change", () => {
    const o = document.createElement("canvas").getContext("2d")
    if (o && dots.length) tint(o)
    kick()
})
start()

// After a change to `params`: wakes the loop so it shows, and samples the text again when
// the particle size changed
export function retune(resample = false) {
    if (!live || !intro) return
    if (resample) measure()
    kick()
}
