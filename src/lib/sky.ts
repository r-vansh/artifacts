// The sky across the top of every page (Vansh, 2026-11-07: dark mode is "not a normal dark
// mode"). Night, on the dark page: small pixel stars twinkle and, now and then, a short meteor
// shower crosses. Day, on the light page: a few faint clouds of round dots drift by and, rarely, a bird or
// two flies across. Subtle by design: faint, sparse, fading out towards the middle of the window,
// and it scrolls away with the top of the page. A lazy chunk that theme.ts loads at once (light
// is the default); it watches `data-theme` itself and crossfades between the two skies, so the
// right one is already there behind the cloth when the page falls. Only runs while on screen and
// the tab visible, at a low frame rate until something flies. Reduced motion: still stars and
// clouds, no meteors or birds.
export const params = {
    // Both
    height: 0.5, // the sky's height in window heights (it fades out over the lower half), at most 720 px
    // Night
    density: 8500, // px² of sky per star (more is fewer)
    size: 1.4, // star size in CSS px (they are small squares)
    glow: 0.7, // overall brightness, 0 to 1
    twinkle: 0.75, // how much the stars breathe, 0 to 1
    first: 4, // s until the first shower once it is on screen, then
    gap: 10, // s between showers (at least; up to twice this)
    meteors: 4, // at most this many in a shower
    angle: 33, // deg below the horizontal, heading left
    speed: 800, // px/s
    tail: 150, // px
    // Day
    clouds: 6, // how many are about
    drift: 15, // px/s, how fast they cross (on average)
    driftVary: 0.2, // how much their speeds differ, 0 (all the same) to 1
    driftSize: 0.4, // how much slower the big ones are, 0 to 1 (far things move slowly)
    cloudMin: 60, // px, the smallest cloud's width
    cloudMax: 290, // px, the biggest
    cloudSkew: 1.6, // how many are small: 1 even, higher is more small ones and fewer big
    cloudGlow: 0.55, // how visible, 0 to 1
    birdGlow: 0.55, // how visible the birds are, 0 to 1
    birdFirst: 4, // s until the first bird once it is on screen, then
    birdGap: 12, // s between birds (at least; up to twice this)
    birdSpeed: 70, // px/s
}

const tall = () => `min(${params.height * 100}vh, 720px)`
const root = document.documentElement
const reduce = matchMedia("(prefers-reduced-motion: reduce)")
const canvas = document.createElement("canvas")
canvas.className = "sky"
canvas.setAttribute("aria-hidden", "true")
const fade = "linear-gradient(to bottom, black 0%, black 45%, transparent 100%)"
Object.assign(canvas.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: tall(),
    zIndex: "-1",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 0.6s ease",
    maskImage: fade,
    webkitMaskImage: fade,
})
document.body.prepend(canvas)
const ctx = canvas.getContext("2d")!

const mulberry = (seed: number) => {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

interface Star {
    x: number
    y: number
    s: number // 1 or 2 device-independent squares
    a: number // base brightness
    w: number // twinkle speed (rad/s)
    p: number // phase
    warm: boolean
}
interface Meteor {
    x: number
    y: number
    born: number
    life: number
    dx: number
    dy: number
    v: number
    len: number
    peak: number
}
interface Cloud {
    x: number
    y: number
    k: number // its speed, as a share of `drift`
    a: number
    sprite: HTMLCanvasElement
    w: number // CSS px
    h: number
}
interface Bird {
    x: number // of the flock's lead
    y: number
    dir: number // 1 right, -1 left
    v: number
    born: number
    members: {
        dx: number
        dy: number
        ph: number
        half: number // half the wingspan, in dots
        unit: number // CSS px between its dots
        dot: number // CSS px, one dot
        rate: number // wing beats a second
        soar: boolean // glides, beating now and then
        a: number // how visible, relative
    }[]
    bob: number
}

type Mode = "night" | "day"

let mode: Mode = "night" // what is drawn now
let stars: Star[] = []
let meteors: Meteor[] = []
let queue: number[] = [] // when the next ones of the shower being played come out
let clouds: Cloud[] = []
let birds: Bird[] = []
let nextEvent = 0 // the next shower (night) or bird (day)
let W = 0
let H = 0
let dpr = 1
let ink = "#f7f7f8" // stars and meteors
let warm = "#fb4300"
let cloudInk = "#dddddf"
let birdInk = "#8e8e95"
let raf = 0
let last = 0
let prev = 0
let on = false // there is a sky to show
let seen = true // in the window
let running = false
let swap = 0

const rgba = (hex: string, a: number) => {
    const n = parseInt(hex.slice(1), 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`
}

const colours = () => {
    const css = getComputedStyle(root)
    const read = (name: string, fallback: string) => {
        const v = css.getPropertyValue(name).trim()
        return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback
    }
    ink = read("--gray-main", ink)
    warm = read("--primary", warm)
    cloudInk = read("--gray-200", cloudInk)
    birdInk = read("--gray-500", birdInk)
}

/* ── Night ── */

function sow() {
    const R = mulberry(20261107)
    const n = Math.round((W * H) / params.density)
    stars = []
    for (let i = 0; i < n; i++) {
        // Denser towards the top, where the sky is
        const y = H * R() ** 1.5
        stars.push({
            x: R() * W,
            y,
            s: R() < 0.12 ? 2 : 1,
            a: 0.35 + R() * 0.65,
            w: 0.5 + R() * 1.6,
            p: R() * Math.PI * 2,
            warm: R() < 0.04,
        })
    }
}

function shower(now: number) {
    const n = 2 + Math.floor(Math.random() * (params.meteors - 1))
    let t = now
    queue = []
    for (let i = 0; i < n; i++) {
        t += 120 + Math.random() * 520
        queue.push(t)
    }
}

function launch(now: number) {
    const a = (params.angle * Math.PI) / 180
    const v = params.speed * (0.8 + Math.random() * 0.4)
    const len = params.tail * (0.7 + Math.random() * 0.6)
    meteors.push({
        // Comes in over the top right of the sky, heading down and left
        x: W * (0.35 + Math.random() * 0.75),
        y: -10 - Math.random() * H * 0.25,
        born: now,
        life: 900 + Math.random() * 500,
        dx: -Math.cos(a),
        dy: Math.sin(a),
        v,
        len,
        peak: 0.28 + Math.random() * 0.22,
    })
}

const smooth = (k: number) => k * k * (3 - 2 * k)

function drawNight(now: number) {
    const t = now / 1000
    const px = params.size
    for (const s of stars) {
        const breathe = reduce.matches ? 1 : 1 - params.twinkle * (0.5 + 0.5 * Math.sin(t * s.w + s.p))
        const alpha = params.glow * s.a * breathe
        if (alpha < 0.02) continue
        ctx.fillStyle = rgba(s.warm ? warm : ink, s.warm ? alpha * 0.7 : alpha)
        // Whole device pixels, so the squares stay crisp
        const x = Math.round(s.x * dpr) / dpr
        const y = Math.round(s.y * dpr) / dpr
        ctx.fillRect(x, y, px * s.s, px * s.s)
    }
    for (const m of meteors) {
        const k = (now - m.born) / m.life
        if (k < 0 || k > 1) continue
        const d = (m.v * (now - m.born)) / 1000
        const hx = m.x + m.dx * d
        const hy = m.y + m.dy * d
        // In and out softly: brightest in the middle of its life
        const a = m.peak * params.glow * 1.6 * Math.sin(Math.PI * smooth(k))
        const tx = hx - m.dx * m.len
        const ty = hy - m.dy * m.len
        const g = ctx.createLinearGradient(hx, hy, tx, ty)
        g.addColorStop(0, rgba(ink, a))
        g.addColorStop(1, rgba(ink, 0))
        ctx.strokeStyle = g
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(hx, hy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
    }
}

/* ── Day ── */

const CELL = 5 // CSS px between the dots of a cloud, whatever its size
// A different set of clouds each visit, and the same ones while the page stays open (a resize or a
// theme change lays them out again, it does not draw new ones)
const CLOUD_SEED = (Math.random() * 2 ** 32) >>> 0

// A cloud made of round dots (like the garden's), never the same twice, in any size. The dots are
// always the same size; a bigger cloud is more of them. They are not on a square grid: a
// triangular lattice, every dot nudged off its place, over a silhouette that flows. The silhouette
// is a few soft-merged circles (the smooth minimum of their distance fields, so where two meet
// they blend instead of leaving a notch): big, rounded bumps along a flat base, with smaller puffs
// on their shoulders, so the top is fat and billowy, leaning to one side. Dots thin out and fade
// across the rim instead of stopping at an edge.
const smin = (a: number, b: number, k: number) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k
    return Math.min(a, b) - h * h * k * 0.25
}

function cloudSprite(R: () => number) {
    const S = CELL
    const width = params.cloudMin + R() ** params.cloudSkew * Math.max(0, params.cloudMax - params.cloudMin)
    const body = Math.max(S * 4, width * (0.17 + R() * 0.17))
    const pad = S * 1.8
    // Circles, in a frame where the flat base is y = 0 and up is negative
    const big: [number, number, number][] = []
    const n = 3 + Math.floor(R() * 4) + Math.round(width / 120)
    const heavy = R()
    for (let k = 0; k < n; k++) {
        const u = (k + 0.5 + (R() - 0.5) * 0.6) / n
        const bulk = 1 - Math.min(1, Math.abs(u - heavy) * 1.4)
        const r = Math.min(body * 0.85, body * (0.32 + bulk * 0.38 + R() * 0.16))
        big.push([u * width, -r * (0.5 + R() * 0.35), r])
    }
    const circles = big.slice()
    // Puffs on the upper shoulders of the big ones
    const puffs = 3 + Math.floor(R() * 3) + Math.round(width / 110)
    for (let k = 0; k < puffs; k++) {
        const [cx, cy, r] = big[Math.floor(R() * big.length)]
        const a = -Math.PI / 2 + (R() - 0.5) * 2.3
        const pr = r * (0.45 + R() * 0.4)
        circles.push([cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, pr])
    }
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    for (const [cx, cy, r] of circles) {
        minX = Math.min(minX, cx - r)
        maxX = Math.max(maxX, cx + r)
        minY = Math.min(minY, cy - r)
    }
    const w = maxX - minX + pad * 2
    const h = -minY + pad * 1.4
    const ox = pad - minX // where the frame's x = 0 sits in the sprite
    const oy = -minY + pad // and its y = 0 (the base)
    const k = body * 0.22
    // Signed distance to the cloud: negative inside, and flat along the base
    const field = (x: number, y: number) => {
        let d = Infinity
        for (const [cx, cy, r] of circles) d = smin(d, Math.hypot(x - cx, y - cy) - r, k)
        return -smin(-d, -y, k * 0.3)
    }
    const c = document.createElement("canvas")
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    const g = c.getContext("2d")!
    g.scale(dpr, dpr)
    g.fillStyle = cloudInk
    const rowH = S * 0.88
    const dotR = S * 0.4
    // Rows are laid from the base up, the lowest sitting just above it: a flat, whole bottom row
    for (let row = 0; ; row++) {
        const y = -S * 0.45 - row * rowH
        if (y < minY - S * 2) break
        const shift = (row % 2) * S * 0.5
        for (let x = minX - S * 2 + shift; x < maxX + S * 2; x += S) {
            const jx = x + (R() - 0.5) * S * 0.42
            const jy = y + (R() - 0.5) * S * 0.34
            const d = field(jx, jy)
            // Whole inside; half at the rim; none a little way out. The base stays crisp.
            const edge = row === 0 ? 0.35 : 1
            const p = Math.min(1, Math.max(0, 0.5 - (d / (S * 2.6)) * edge))
            if (p <= 0 || R() > Math.min(1, p * 1.7)) continue
            g.globalAlpha = Math.min(1, 0.35 + p * 0.75) * (0.85 + R() * 0.15)
            g.beginPath()
            g.arc(jx + ox, jy + oy, dotR, 0, Math.PI * 2)
            g.fill()
        }
    }
    return { sprite: c, w, h }
}

function gather() {
    const R = mulberry(CLOUD_SEED)
    clouds = []
    for (let i = 0; i < params.clouds; i++) {
        const { sprite, w, h } = cloudSprite(R)
        clouds.push({
            // Spread across the width, and a little beyond, so they come and go
            x: -w + ((i + R() * 0.8) / params.clouds) * (W + w * 2),
            y: H * (0.04 + R() * 0.58),
            // Speeds differ, and the bigger ones drift slower, as far things do
            k: Math.max(0.1, 1 + (R() * 2 - 1) * params.driftVary) * (1 + params.driftSize * (0.5 - Math.min(1, (w - params.cloudMin) / Math.max(1, params.cloudMax - params.cloudMin)))),
            a: 0.6 + R() * 0.4,
            sprite,
            w,
            h,
        })
    }
}

// A bird is a row of dots across its wings, up to a V and down to a dip: every dot of the span
// (-half..half) is raised, level or lowered by how far it is from the body. Frames: up, level, down,
// level
const wing = (half: number, frame: number) => {
    const out: [number, number][] = []
    for (let k = -half; k <= half; k++) {
        const far = Math.abs(k)
        out.push([k, frame === 0 ? -far : frame === 2 ? Math.max(0, far - 1) : far ? -1 : 0])
    }
    return out
}
const FRAMES = [0, 1, 2, 1]

// A bird or a flock, never quite the same, in different sizes: small quick flutterers, ordinary ones,
// big slow gliders that beat their wings now and then; one to four of them, in a loose V or a scatter.
// The dots are always the same size and spacing; a bigger bird has more of them across its wings
const DOT = 1.7 // CSS px, one dot of a bird
const UNIT = 2.3 // CSS px between its dots
function bird(now: number) {
    const dir = Math.random() < 0.5 ? 1 : -1
    const roll = Math.random()
    const n = roll < 0.45 ? 1 : roll < 0.75 ? 2 : roll < 0.92 ? 3 : 4
    const kind = Math.random()
    const v = params.birdSpeed * (0.55 + Math.random() * 0.9)
    const lead = Math.random() < 0.5
    birds.push({
        x: dir > 0 ? -50 : W + 50,
        y: H * (0.08 + Math.random() * 0.45),
        dir,
        v,
        born: now,
        bob: Math.random() * Math.PI * 2,
        members: Array.from({ length: n }, (_, i) => {
            // The flock's character, with a little difference from bird to bird
            const big = kind > 0.72
            const tiny = kind < 0.25
            // The size is the wingspan: 3 to 11 dots across, with a little difference within a flock
            const base = big ? 3.5 + Math.random() * 1.8 : tiny ? 1 + Math.random() * 0.8 : 2 + Math.random() * 1.2
            const half = Math.max(1, Math.round(base + (Math.random() - 0.5) * (i ? 1 : 0)))
            const scale = half / 2
            const side = i % 2 ? 1 : -1
            return {
                dx: -dir * i * (14 + Math.random() * 14) * scale,
                dy: i ? (lead ? side * Math.ceil(i / 2) * (5 + Math.random() * 4) * scale : (Math.random() - 0.5) * 18 * scale) : 0,
                ph: Math.random() * 4,
                half,
                unit: UNIT,
                dot: DOT,
                rate: (big ? 3.5 + Math.random() * 2 : tiny ? 8 + Math.random() * 3 : 5.5 + Math.random() * 2.5) / Math.sqrt(scale),
                soar: big ? Math.random() < 0.8 : Math.random() < 0.15,
                a: 0.75 + Math.random() * 0.25,
            }
        }),
    })
}

function drawDay(now: number, dt: number) {
    ctx.imageSmoothingEnabled = false
    for (const c of clouds) {
        if (!reduce.matches) {
            c.x += params.drift * c.k * dt
            if (c.x > W + 10) c.x = -c.w - 10 - Math.random() * W * 0.3
        }
        // Fades in at the left edge and out at the right, so none pops
        const edge = Math.min(1, Math.max(0, (c.x + c.w) / 60), Math.max(0, (W - c.x) / 60))
        ctx.globalAlpha = params.cloudGlow * c.a * edge
        ctx.drawImage(c.sprite, Math.round(c.x * dpr) / dpr, Math.round(c.y * dpr) / dpr, c.w, c.h)
    }
    ctx.globalAlpha = 1
    for (const b of birds) {
        b.x += b.dir * b.v * dt
        const t = now / 1000
        const edge = Math.min(1, Math.max(0, b.dir > 0 ? (b.x + 40) / 80 : (W + 40 - b.x) / 80), Math.max(0, b.dir > 0 ? (W + 40 - b.x) / 80 : (b.x + 40) / 80))
        for (const m of b.members) {
            ctx.fillStyle = rgba(birdInk, params.birdGlow * edge * m.a)
            // Gliders hold their wings level and beat them in short bursts
            const flap = !m.soar || Math.sin(t * 0.7 + m.ph * 1.7) > 0.45
            const frame = flap ? FRAMES[Math.floor(t * m.rate + m.ph) % 4] : 1
            const cx = b.x + m.dx
            const cy = b.y + m.dy + Math.sin(t * (m.soar ? 0.8 : 1.3) + b.bob + m.ph) * (m.soar ? 6 : 4)
            for (const [dx, dy] of wing(m.half, frame)) {
                ctx.fillRect(Math.round((cx + dx * m.unit) * dpr) / dpr, Math.round((cy + dy * m.unit) * dpr) / dpr, m.dot, m.dot)
            }
        }
    }
    birds = birds.filter((b) => (b.dir > 0 ? b.x - 60 < W : b.x + 60 > 0))
}

/* ── Both ── */

function draw(now: number, dt = 0) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (mode === "night") drawNight(now)
    else drawDay(now, dt)
}

function size(again = false) {
    const r = canvas.getBoundingClientRect()
    if (!r.width || !r.height) return
    dpr = Math.min(devicePixelRatio || 1, 2)
    const changed = again || Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1
    W = r.width
    H = r.height
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    if (changed) {
        if (mode === "night") sow()
        else gather()
    }
    draw(performance.now())
}

function frame(now: number) {
    raf = running ? requestAnimationFrame(frame) : 0
    // Slow things (stars breathing, clouds drifting): about 20 frames a second is plenty; smoother
    // only with a meteor or a bird out
    const busy = meteors.length > 0 || queue.length > 0 || birds.length > 0
    if (!busy && now - last < 48) return
    last = now
    const dt = Math.min(0.1, Math.max(0, (now - prev) / 1000))
    prev = now
    if (nextEvent && now >= nextEvent) {
        if (mode === "night") {
            shower(now)
            nextEvent = now + (params.gap + Math.random() * params.gap) * 1000
        } else {
            bird(now)
            nextEvent = now + (params.birdGap + Math.random() * params.birdGap) * 1000
        }
    }
    while (queue.length && queue[0] <= now) {
        queue.shift()
        launch(now)
    }
    meteors = meteors.filter((m) => now - m.born < m.life)
    draw(now, dt)
}

function sync() {
    // Not under the loading animation (splash.ts) until its reveal out opens onto the page: hidden
    // there, it would only take frames from the loader (it costs most on a phone)
    const veiled = root.hasAttribute("data-splash") && root.dataset.loader === "active"
    const go = on && seen && !document.hidden && !reduce.matches && !veiled
    if (go && !running) {
        running = true
        last = 0
        prev = performance.now()
        if (!nextEvent) nextEvent = prev + (mode === "night" ? params.first : params.birdFirst) * 1000
        raf = requestAnimationFrame(frame)
    } else if (!go && running) {
        running = false
        cancelAnimationFrame(raf)
        raf = 0
    }
}

// Night on the dark page, day on the light one. A change crossfades: the old sky fades out, the
// new one is laid out while it is hidden, then fades in
// The page that is really chosen: a peek under the cloth (data-peek, theme.ts) only looks at the other
// one, so the sky stays as it is (it used to swap to the other sky for the length of a pull and back
// on release, starting afresh each time, and showed the wrong sky for a moment)
const chosenDark = () => (root.dataset.peek ? root.dataset.peek === "light" : root.dataset.theme === "dark")

function theme() {
    const want: Mode = chosenDark() ? "night" : "day"
    clearTimeout(swap)
    if (!on) {
        on = true
        mode = want
        colours()
        size(true)
        canvas.style.opacity = "1"
        sync()
        return
    }
    if (want === mode) {
        canvas.style.opacity = "1"
        return
    }
    canvas.style.opacity = "0"
    swap = window.setTimeout(() => {
        mode = chosenDark() ? "night" : "day"
        meteors = []
        queue = []
        birds = []
        nextEvent = 0
        colours()
        size(true)
        canvas.style.opacity = "1"
        sync()
        if (running) nextEvent = performance.now() + (mode === "night" ? params.first : params.birdFirst) * 1000
    }, 650)
}

new MutationObserver(theme).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-peek"] })
new MutationObserver(() => sync()).observe(root, { attributes: true, attributeFilter: ["data-splash", "data-loader"] })
new ResizeObserver(() => on && size()).observe(canvas)
new IntersectionObserver(([e]) => {
    seen = e.isIntersecting
    sync()
}).observe(canvas)
document.addEventListener("visibilitychange", sync)
document.addEventListener("theme:change", () => {
    if (!on) return
    colours()
    size(true)
})
reduce.addEventListener("change", () => {
    sync()
    if (on) draw(performance.now())
})
theme()

/** For the tuning panel (sky-tune.ts); nothing of this is in the build */
export const dev = import.meta.env.DEV
    ? {
          // The sky's height, star density or cloud count changed: lay it out and sow again
          refit() {
              canvas.style.height = tall()
              if (on) size(true)
          },
          // A setting changed that only changes how it is drawn
          redraw() {
              if (on && !running) draw(performance.now())
          },
          // The wait for the first shower or bird, from now
          reschedule() {
              nextEvent = on ? performance.now() + (mode === "night" ? params.first : params.birdFirst) * 1000 : 0
          },
          // A shower (night) or a bird (day) now, while the sky is on screen and not under reduced motion
          now() {
              if (!running) return
              const t = performance.now()
              if (mode === "night") shower(t)
              else bird(t)
          },
          mode: () => mode,
      }
    : undefined
if (import.meta.env.DEV) import("./sky-tune")
