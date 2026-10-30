// The loading animation (the splash), on the first page of a visit, after Vansh's reference
// GIF and briefs: thousands of fine curved strokes draw a fingerprint-like vortex into
// existence in the middle of a white screen (`reveal`), a soft shockwave passes through it
// from near its middle (`shockAt`), it flows on by itself for a moment (`hold`), then the
// strokes and the white fade out over the page (`fade`). Any click, key, wheel or touch
// skips to the fade.
//
// The strokes are particles in a flow field, each leaving a short trail. The field is the
// curl of a stream function, so it swirls instead of piling up. The stream function is
// vortices of very different sizes, strengths and turns that drift about (VORTICES,
// `wander`), plus two octaves of noise whose coordinates are themselves bent by a third
// (`warp`), which folds the streamlines into loops and ridges, and whose strength varies
// from region to region (`calm`), so some parts comb smoothly while others fold. On top of
// that, a gentle fountain (POLES) and a pull back inside the outline (`pull`). Every stroke
// moves at about the same speed, so the dashes come out alike, and most are reborn just
// behind another on its streamline (`chain`), so they line up as ridges.
//
// The outline is stretched, turned, bulged and dented (OUTLINE, `ragged`), with two small
// satellites (SATELLITES), so it is no ball. Where strokes are born follows a density that is
// soft at the outline, a little shaded (`shade`), and split by a slow noise into dense
// regions, open ones and empty gaps (`regions`, `patchy`). While it reveals, strokes are only
// born inside a reach that grows from the middle, so the form is drawn outwards.
//
// The shockwave is a band (`shockWidth`) running out from its origin (`shockX`, `shockY`) at
// `shockSpeed`, weakening as it goes (`shockReach`). Each stroke it passes gets a push: out
// from the origin, and sideways by an amount that changes round the ring (`shockSwirl`), so
// the strokes bend, stretch and swirl locally instead of the whole form turning. The push
// goes into a velocity of the stroke's own that dies away (`shockDamping`), so after the
// band has passed the strokes ease back into the field's flow. Strokes pushed out pack the
// front denser and leave the middle thinner, and for a moment fewer are reborn behind the
// front (`shockHollow`, recovering over `shockRecover`), so it reads as a disturbance
// travelling through the ridges, never as a drawn ring.
//
// p5.js (its core and math modules only) runs the loop and the noise. The field is computed
// on a coarse grid every other frame and each stroke reads it bilinearly; the simulation runs
// at a fixed 60 steps a second; strokes are drawn straight onto the canvas context in a dozen
// batches by opacity and width, not a stroke() each, so a frame costs a few ms of the main
// thread. If frames still run slow, fewer strokes are reborn.
//
// Base.astro decides before the first paint whether it plays (once per visit; every load
// under `npm run dev`; never under reduced motion), shows the white veil and loads this
// module. If it never starts, the veil lifts on its own after 5 s. "splash:done" on
// `document` says it is over (the home page holds the intro effect back until then).
import p5 from "p5/core"
import math from "p5/math"

p5.registerAddon(math)
// resizeCanvas() (which pixelDensity() calls too) asks the accessibility module, left out
// here, without checking that it is there
const proto = p5.prototype as unknown as { _addAccsOutput?: () => boolean }
proto._addAccsOutput ??= () => false

// The shipped settings
export const params = {
    // Timing
    reveal: 2000, // ms: the form is drawn into existence, from its middle outwards
    hold: 1800, // ms: then it flows on by itself
    fade: 900, // ms: then the strokes and the white fade out over the page
    // Size, centred in the window
    size: 0.39, // the form's width, as a share of the window's
    tall: 0.68, // but never taller than this share of the window's height
    phone: 0.84, // in windows under 700 px wide: its width as a share of the window's
    // The strokes
    count: 9000, // strokes in a form 520 px across (scaled by its area)
    trail: 12, // steps (1/60 s each) a stroke trails behind it
    speed: 0.24, // form radii per second: every stroke moves at about this speed, so the dashes come out alike
    life: 2.2, // s: how long a stroke lives on average (half to one and a half that), fading in and out
    width: 0.65, // px: a stroke's average width (0.4 to 0.9)
    ink: 0.75, // a stroke's average opacity
    // The flow
    turbulence: 0.85, // how much the noise bends the flow
    grain: 1.6, // the noise's scale: higher makes smaller folds
    warp: 0.45, // form radii: how far a third noise bends the first two, folding the streamlines
    calm: 0.7, // how much the noise's strength varies from region to region (0: the same everywhere)
    evolve: 0.05, // how fast the noise changes, per second
    wander: 0.1, // form radii: how far the vortices drift
    pull: 1.2, // how hard strays are pulled back inside the outline
    // The look
    ragged: 0.2, // how irregular the outline is, as a share of the radius
    shade: 0.25, // how much the form is shaded like a ball lit from the upper right (0: flat)
    regions: 0.7, // how strongly a slow noise splits it into dense regions and open ones
    gaps: 0.9, // how empty the small gaps between the flowing structures are (0: no gaps)
    patchy: 0.35, // finer patchiness inside those
    chain: 0.6, // share of the strokes reborn just behind another on its streamline, so they line up in ridges
    // The shockwave
    shockAt: 2000, // ms: when it sets off
    shockX: 0.06, // form radii: where from
    shockY: 0.04,
    shockSpeed: 0.85, // form radii per second: how fast the band runs out
    shockWidth: 0.16, // form radii: how wide the band is (a soft Gaussian)
    shockForce: 1.5, // form radii/s²: its push at the start
    shockReach: 1.4, // form radii: it weakens to a third over this far, and dies out before the outline
    shockSwirl: 0.6, // the sideways share of the push, changing round the ring
    shockDamping: 2.6, // per second: how fast a stroke's push dies away, easing it back into the flow
    shockHollow: 0.5, // share of the strokes not reborn just behind the front, so the middle thins
    shockRecover: 0.8, // s: how long that thinning takes to fill back in
}

// In form radii, y down: x, y, strength (positive turns clockwise on screen), radius. Very
// different sizes, so no one spiral rules
const VORTICES = [
    [0.32, -0.22, 0.38, 0.36],
    [-0.45, -0.28, -0.4, 0.5],
    [0.48, 0.38, -0.28, 0.32],
    [-0.22, 0.5, 0.34, 0.4],
    [0.05, 0.02, -0.2, 0.65],
    [0.7, -0.6, 0.18, 0.26],
    [0, 0, 0.12, 1.1], // a slow turn of the whole form, which holds it together
]
// Small clouds near the form: x, y, radius, and the turn of their own small vortex
const SATELLITES = [
    [-1.38, 0.18, 0.27, 0.7],
    [1.22, 0.72, 0.16, -0.6],
]
// x, y, strength (positive: strokes stream away, negative: they crowd in), radius
const POLES = [[0.38, -0.42, 0.25, 0.35]]
// The outline: stretched (x, y) and turned (radians), with a bulge and a dent at an angle,
// each [angle, height as a share of the radius, angular width]
const OUTLINE = { stretch: [1.14, 0.9], turn: -0.35, bulge: [2.5, 0.16, 0.55], dent: [-0.85, -0.28, 0.32] }
const LIGHT = [0.5, -0.6, 0.62] // where the shading's light comes from (y down), unit length
const SPAN = 1.75 // the field covers -SPAN..SPAN form radii both ways
const GRID = 48 // field samples across
const ANGLES = 64 // samples round the outline (and round the shockwave)
const STEP = 1000 / 60 // ms: one simulation step
const LEVELS = 6 // opacity batches (times two widths)
const LATE = 3500 // ms after navigation: if it cannot start by then, it does not play
const SKIP = ["pointerdown", "keydown", "wheel", "touchstart"]

const root = document.documentElement
const veil = document.querySelector<HTMLElement>(".splash")

const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
    return t * t * (3 - 2 * t)
}
// The shortest way round from angle b to angle a
const apart = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
// An angle in -π..π as an index into a table of ANGLES samples round the circle
const slotOf = (th: number) => Math.round(((th + Math.PI) / (2 * Math.PI)) * ANGLES) % ANGLES

// A small seeded generator, so every run is drawn alike
function seeded(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function run() {
    let sketch: p5 | null = null
    let over = false
    let exit = params.reveal + params.hold // ms of the animation: when the fade starts (sooner on a skip)
    let t = 0
    const skip = () => (exit = Math.min(exit, t))
    const finish = () => {
        if (over) return
        over = true
        for (const ev of SKIP) removeEventListener(ev, skip)
        removeEventListener("resize", fit)
        sketch?.remove()
        root.removeAttribute("data-splash")
        veil?.removeAttribute("data-lift")
        document.dispatchEvent(new Event("splash:done"))
    }
    const fit = () => sketch?.resizeCanvas(veil!.clientWidth, veil!.clientHeight)
    if (!veil) return finish()

    const rand = seeded(7)
    // The field on its grid: velocity (form radii per second, before `speed`) and density
    const N1 = GRID + 1
    const H = (2 * SPAN) / GRID
    const psi = new Float32Array(N1 * N1)
    const fu = new Float32Array(N1 * N1)
    const fv = new Float32Array(N1 * N1)
    const fd = new Float32Array(N1 * N1)
    const rim = new Float32Array(ANGLES) // the outline's radius round the form, in its stretched frame
    const twist = new Float32Array(ANGLES) // -1..1: which way and how hard the shockwave pushes sideways, round its ring
    const centres = VORTICES.map((v) => [v[0], v[1]])
    const [sx, sy] = OUTLINE.stretch
    const cos = Math.cos(-OUTLINE.turn)
    const sin = Math.sin(-OUTLINE.turn)

    // The strokes: where each is, its trail (a ring shared by all, one slot a step), its own
    // push from the shockwave, and its own draws
    let n = 0
    let xs = new Float32Array(0)
    let ys = new Float32Array(0)
    let tx = new Float32Array(0)
    let ty = new Float32Array(0)
    let pvx = new Float32Array(0)
    let pvy = new Float32Array(0)
    let age = new Float32Array(0)
    let life = new Float32Array(0)
    let born = new Int32Array(0)
    let ink = new Float32Array(0)
    let thick = new Uint8Array(0)
    let alive = new Uint8Array(0)
    let limit = 0 // how many the form needs at its current size
    let cap = 0 // how many may live, lowered if frames run slow
    let steps = 0
    let frames = 1 // the first frame does the field's second half
    let spent = 6 // ms: a frame's own work, smoothed

    // The field, half its rows at a time (`part` 0 or 1): it changes slowly, and that halves a frame's share
    const field = (now: number, s: p5, part: number) => {
        const p = params
        const sec = now / 1000
        const tt = sec * p.evolve
        // The vortices drift, each its own way
        for (let i = 0; i < VORTICES.length - 1; i++) {
            centres[i][0] = VORTICES[i][0] + p.wander * (2 * s.noise(i * 7.3, sec * 0.15) - 1)
            centres[i][1] = VORTICES[i][1] + p.wander * (2 * s.noise(i * 7.3 + 50, sec * 0.15) - 1)
        }
        // The outline round the form (two scales of noise, a bulge and a dent), and the
        // shockwave's sideways push round its ring
        for (let a = 0; a < ANGLES; a++) {
            const th = (a / ANGLES) * 2 * Math.PI - Math.PI // as atan2() gives it
            const c = Math.cos(th)
            const z = Math.sin(th)
            const [bth, bh, bw] = OUTLINE.bulge
            const [dth, dh, dw] = OUTLINE.dent
            rim[a] =
                1 +
                p.ragged * (2 * s.noise(c * 1.1 + 10, z * 1.1 + 10, sec * 0.08) - 1) +
                0.4 * p.ragged * (2 * s.noise(c * 3 + 30, z * 3 + 30, sec * 0.12) - 1) +
                bh * Math.exp(-((apart(th, bth) / bw) ** 2)) +
                dh * Math.exp(-((apart(th, dth) / dw) ** 2))
            twist[a] = 2 * s.noise(c * 1.5 + 90, z * 1.5 + 90) - 1
        }
        const amp = 0.25 * p.turbulence
        const g = p.grain
        for (let j = part; j < N1; j += 2) {
            const y = -SPAN + j * H
            for (let i = 0; i < N1; i++) {
                const x = -SPAN + i * H
                // Noise in two octaves, its coordinates bent by a third, its strength varying by region
                const wx = p.warp * (2 * s.noise(x * 1.1 + 5, y * 1.1 + 5, tt) - 1)
                const wy = p.warp * (2 * s.noise(x * 1.1 + 105, y * 1.1 + 105, tt) - 1)
                const strength = amp * (1 - p.calm + 2 * p.calm * s.noise(x * 0.8 + 30, y * 0.8 + 30, tt * 0.5))
                let q =
                    strength *
                    (2 * s.noise((x + wx) * g + 20, (y + wy) * g + 20, tt) - 1 + 0.45 * (2 * s.noise((x + wx) * 2.1 * g + 60, (y + wy) * 2.1 * g + 60, tt * 1.3) - 1))
                for (let k = 0; k < VORTICES.length; k++) {
                    const dx = x - centres[k][0]
                    const dy = y - centres[k][1]
                    const r = VORTICES[k][3]
                    q += VORTICES[k][2] * r * r * Math.exp(-(dx * dx + dy * dy) / (2 * r * r))
                }
                for (const [cx, cy, r, k] of SATELLITES) {
                    const dx = x - cx
                    const dy = y - cy
                    q += k * r * r * Math.exp(-(dx * dx + dy * dy) / (2 * r * r))
                }
                psi[j * N1 + i] = q
            }
        }
        for (let j = part; j < N1; j += 2) {
            const y = -SPAN + j * H
            for (let i = 0; i < N1; i++) {
                const x = -SPAN + i * H
                const at = j * N1 + i
                // The curl of the stream function
                const up = psi[Math.max(j - 1, 0) * N1 + i]
                const down = psi[Math.min(j + 1, GRID) * N1 + i]
                const left = psi[j * N1 + Math.max(i - 1, 0)]
                const right = psi[j * N1 + Math.min(i + 1, GRID)]
                let u = (down - up) / (2 * H)
                let v = -(right - left) / (2 * H)
                for (const [px, py, k, r] of POLES) {
                    const dx = x - px
                    const dy = y - py
                    const f = (k / r) * Math.exp(-(dx * dx + dy * dy) / (2 * r * r))
                    u += f * dx
                    v += f * dy
                }
                // Where it is against the outline, measured in its stretched, turned frame
                const qx = (x * cos - y * sin) / sx
                const qy = (x * sin + y * cos) / sy
                const d = Math.hypot(qx, qy)
                const edge = rim[slotOf(Math.atan2(qy, qx))]
                let out = d - edge
                let toward = [x, y, Math.hypot(x, y)]
                let inside = 1 - smooth(edge - 0.12, edge + 0.02, d)
                for (const [cx, cy, r] of SATELLITES) {
                    const lx = x - cx
                    const ly = y - cy
                    const dl = Math.hypot(lx, ly)
                    if (dl - r < out) {
                        out = dl - r
                        toward = [lx, ly, dl]
                    }
                    inside = Math.max(inside, 0.8 * (1 - smooth(r - 0.1, r + 0.02, dl)))
                }
                // Outside all of it, pulled back in
                if (out > 0) {
                    u -= (p.pull * out * toward[0]) / toward[2]
                    v -= (p.pull * out * toward[1]) / toward[2]
                }
                fu[at] = u
                fv[at] = v
                // Density: soft at the outline, a little shaded, split into dense regions, open
                // ones and gaps, and finely patchy
                const reach = Math.max(1, d / edge) // the shading's normal, kept unit length past the edge
                const nx = qx / edge / reach
                const ny = qy / edge / reach
                const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
                const dark = 1 - Math.min(1, Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]))
                // Broad dense and open regions, and small gaps cut by a finer noise (p5's noise
                // sits mostly between 0.3 and 0.7, so that is where the cuts go)
                const region = s.noise(x * 1.1 + 70, y * 1.1 + 70, tt * 0.8)
                const gap = s.noise(x * 3.6 + 150, y * 3.6 + 150, tt)
                const dense = (1 - 0.65 * p.regions + 0.65 * p.regions * smooth(0.38, 0.64, region)) * (1 - p.gaps * (1 - smooth(0.2, 0.26, gap)))
                const patch = smooth(0.25, 0.72, s.noise(x * 2.6 + 40, y * 2.6 + 40, tt))
                fd[at] = inside * (1 - p.shade + p.shade * dark ** 1.3) * dense * (1 - p.patchy + p.patchy * patch)
            }
        }
    }

    // Bilinear read of a grid at (x, y), in form radii
    const read = (grid: Float32Array, x: number, y: number) => {
        const gx = Math.min(Math.max((x + SPAN) / H, 0), GRID - 0.001)
        const gy = Math.min(Math.max((y + SPAN) / H, 0), GRID - 0.001)
        const i = gx | 0
        const j = gy | 0
        const fx = gx - i
        const fy = gy - j
        const a = j * N1 + i
        return (grid[a] * (1 - fx) + grid[a + 1] * fx) * (1 - fy) + (grid[a + N1] * (1 - fx) + grid[a + N1 + 1] * fx) * fy
    }

    // How much fewer strokes are reborn at (x, y) because the shockwave has just passed there
    const hollow = (x: number, y: number) => {
        const p = params
        if (t < p.shockAt) return 0
        const passed = (t - p.shockAt) / 1000 - Math.hypot(x - p.shockX, y - p.shockY) / p.shockSpeed
        return passed > 0 ? p.shockHollow * Math.exp(-passed / p.shockRecover) : 0
    }

    // A stroke is born where the density (and, while it reveals, the reach so far) allows
    const spawn = (i: number, reach: number) => {
        const T = params.trail
        // Mostly just behind a grown stroke, a few steps back along where it came from, so the
        // two ride the same streamline as dashes of one ridge
        if (rand() < params.chain) {
            const j = Math.floor(rand() * n)
            if (alive[j] && steps - born[j] >= T && age[j] < life[j]) {
                const k = (steps + 1) % T // its oldest point, and the one after it
                const ox = tx[j * T + k]
                const oy = ty[j * T + k]
                const x = ox - 3 * (tx[j * T + ((k + 1) % T)] - ox)
                const y = oy - 3 * (ty[j * T + ((k + 1) % T)] - oy)
                if (Math.hypot(x, y) < reach && read(fd, x, y) > 0.05 && rand() > hollow(x, y)) return place(i, x, y)
            }
        }
        for (let tries = 0; tries < 12; tries++) {
            const moon = rand() < 0.1 ? SATELLITES[rand() < 0.7 ? 0 : 1] : null
            const x = moon ? moon[0] + (2 * rand() - 1) * moon[2] * 1.1 : (2 * rand() - 1) * 1.5
            const y = moon ? moon[1] + (2 * rand() - 1) * moon[2] * 1.1 : (2 * rand() - 1) * 1.3
            if (Math.hypot(x, y) > reach || rand() > read(fd, x, y) * (1 - hollow(x, y))) continue
            return place(i, x, y)
        }
        alive[i] = 0
    }
    const place = (i: number, x: number, y: number) => {
        xs[i] = x
        ys[i] = y
        const T = params.trail
        for (let k = 0; k < T; k++) {
            tx[i * T + k] = x
            ty[i * T + k] = y
        }
        pvx[i] = 0
        pvy[i] = 0
        age[i] = 0
        life[i] = params.life * (0.5 + rand())
        born[i] = steps
        ink[i] = params.ink * (0.6 + 0.8 * rand())
        thick[i] = rand() < 0.5 ? 0 : 1
        alive[i] = 1
    }

    // Room for as many strokes as the form needs at its first size. A resize only changes how
    // many may live (never more than that), so the form carries on instead of starting over.
    const allot = (w: number, h: number) => {
        const across = w < 700 ? params.phone * w : Math.min(params.size * w, params.tall * h)
        const count = Math.round(params.count * (across / 520) ** 2)
        if (n) {
            limit = Math.min(count, n)
            cap = Math.min(cap, limit)
            return
        }
        n = limit = count
        const T = params.trail
        xs = new Float32Array(n)
        ys = new Float32Array(n)
        tx = new Float32Array(n * T)
        ty = new Float32Array(n * T)
        pvx = new Float32Array(n)
        pvy = new Float32Array(n)
        age = new Float32Array(n)
        life = new Float32Array(n)
        born = new Int32Array(n)
        ink = new Float32Array(n)
        thick = new Uint8Array(n)
        alive = new Uint8Array(n)
        cap = n
    }

    // One fixed step: every stroke moves along the field (midpoint) plus its own push from the
    // shockwave, ages, and is reborn when it dies or strays
    const step = () => {
        const p = params
        const T = p.trail
        const dt = STEP / 1000
        const scale = p.speed
        const reach = t < p.reveal ? 0.15 + 1.5 * (1 - (1 - t / p.reveal) ** 3) : 9
        const want = t < p.reveal ? Math.ceil(cap * smooth(0, 1, t / p.reveal + 0.05)) : cap
        const slot = (steps + 1) % T
        // The shockwave's band: how far out it is, and how hard it pushes by now
        const since = (t - p.shockAt) / 1000
        const front = since * p.shockSpeed
        const force = since > 0 && front < 1.1 ? p.shockForce * Math.exp(-front / p.shockReach) * (1 - smooth(0.55, 1.05, front)) : 0
        const decay = Math.exp(-p.shockDamping * dt)
        for (let i = 0; i < n; i++) {
            if (!alive[i] || age[i] > life[i]) {
                if (i < want) spawn(i, reach)
                else alive[i] = 0
                if (!alive[i]) continue
            }
            // Along the field (midpoint), at nearly the same speed everywhere: slower only where it is still
            const x = xs[i]
            const y = ys[i]
            let u = read(fu, x, y)
            let v = read(fv, x, y)
            let m = Math.hypot(u, v) + 1e-6
            let k = (0.5 * dt * scale * Math.tanh(m / 0.15)) / m
            const mx = x + k * u
            const my = y + k * v
            u = read(fu, mx, my)
            v = read(fv, mx, my)
            m = Math.hypot(u, v) + 1e-6
            k = (dt * scale * Math.tanh(m / 0.15)) / m
            // The shockwave pushes the strokes in its band out and sideways, into a velocity of
            // their own that dies away
            if (force) {
                const dx = x - p.shockX
                const dy = y - p.shockY
                const r = Math.hypot(dx, dy) + 1e-6
                const band = (r - front) / p.shockWidth
                if (band > -3 && band < 3) {
                    const f = (force * Math.exp(-band * band) * dt) / r
                    const side = p.shockSwirl * twist[slotOf(Math.atan2(dy, dx))]
                    pvx[i] += f * (dx - side * dy)
                    pvy[i] += f * (dy + side * dx)
                }
            }
            pvx[i] *= decay
            pvy[i] *= decay
            const nx = x + k * u + pvx[i] * dt
            const ny = y + k * v + pvy[i] * dt
            xs[i] = nx
            ys[i] = ny
            tx[i * T + slot] = nx
            ty[i * T + slot] = ny
            age[i] += dt
            if (Math.abs(nx) > SPAN || Math.abs(ny) > SPAN) age[i] = life[i] + 1
            // Strays well outside the outline fade out quickly
            else if (age[i] < life[i] - 0.1 && read(fd, nx, ny) < 0.03) age[i] = life[i] - 0.1
        }
        steps++
        t = steps * STEP
    }

    const draw = (s: p5) => {
        const ctx = s.drawingContext as CanvasRenderingContext2D
        const p = params
        const T = p.trail
        const W = s.width
        const Hh = s.height
        const across = W < 700 ? p.phone * W : Math.min(p.size * W, p.tall * Hh)
        const R = across / 2
        const dpr = s.pixelDensity()
        const global = t < exit ? 1 : Math.max(0, 1 - (t - exit) / p.fade)
        const paths = Array.from({ length: LEVELS * 2 }, () => new Path2D())
        const slot = steps % T
        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue
            const a = age[i]
            const fadeIn = Math.min(1, a / 0.35, (life[i] - a) / 0.5)
            const alpha = ink[i] * Math.max(fadeIn, 0) * global
            const level = Math.min(LEVELS, Math.round(alpha * LEVELS))
            if (level < 1) continue
            const path = paths[(level - 1) * 2 + thick[i]]
            const points = Math.min(T, steps - born[i] + 1)
            if (points < 3) continue
            // Every other point of the trail, oldest first, joined by curves through their
            // midpoints, so the strokes bend smoothly at half the drawing
            const first = slot - points + 1 + T
            let k = first % T
            let px = tx[i * T + k]
            let py = ty[i * T + k]
            path.moveTo(px, py)
            for (let j = 2; j < points - 1; j += 2) {
                k = (first + j) % T
                const qx = tx[i * T + k]
                const qy = ty[i * T + k]
                path.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2)
                px = qx
                py = qy
            }
            k = slot % T
            path.quadraticCurveTo(px, py, tx[i * T + k], ty[i * T + k])
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, s.width * dpr, s.height * dpr)
        ctx.setTransform(dpr * R, 0, 0, dpr * R, (dpr * W) / 2, (dpr * Hh) / 2)
        // Plain ends and joins: under a pixel wide they look the same and draw faster
        ctx.lineCap = "butt"
        ctx.lineJoin = "miter"
        for (let level = 1; level <= LEVELS; level++) {
            ctx.globalAlpha = level / LEVELS
            for (let w = 0; w < 2; w++) {
                ctx.lineWidth = (p.width * (w ? 1.35 : 0.65)) / R
                ctx.stroke(paths[(level - 1) * 2 + w])
            }
        }
    }

    sketch = new p5((s: p5) => {
        let last = 0
        let acc = 0
        let colour = ""
        s.setup = () => {
            // p5 starts once the page has loaded; if that took too long, the page has shown long enough
            if (performance.now() > LATE) return finish()
            try {
                s.createCanvas(veil.clientWidth, veil.clientHeight)
                s.pixelDensity(Math.min(devicePixelRatio || 1, 2))
                s.noiseSeed(7)
                s.noiseDetail(2, 0.5)
                colour = getComputedStyle(root).getPropertyValue("--gray-main").trim()
                allot(s.width, s.height)
                field(0, s, 0) // the other half on the first frame, to keep this task short
            } catch (error) {
                console.error(error)
                return finish()
            }
            veil.style.animation = "none" // the failsafe: from here on this lifts the veil itself
            for (const ev of SKIP) addEventListener(ev, skip, { passive: true })
            addEventListener("resize", fit)
        }
        s.draw = () => {
            if (over) return
            try {
                const now = performance.now()
                acc += Math.min(now - (last || now - STEP), 100)
                last = now
                allot(s.width, s.height)
                const before = performance.now()
                if (acc >= STEP) field(t, s, frames++ % 2)
                for (let k = 0; acc >= STEP && k < 4; k++, acc -= STEP) step()
                acc = Math.min(acc, STEP)
                if (t >= exit && !veil.hasAttribute("data-lift")) {
                    veil.style.setProperty("--lift", `${params.fade}ms`)
                    veil.setAttribute("data-lift", "")
                }
                if (t >= exit + params.fade) return finish()
                ;(s.drawingContext as CanvasRenderingContext2D).strokeStyle = colour
                draw(s)
                // Frames that run long get fewer strokes reborn; quick ones get them back
                spent = 0.9 * spent + 0.1 * (performance.now() - before)
                if (spent > 10) cap = Math.max(Math.round(0.4 * limit), Math.round(cap * 0.97))
                else if (spent < 6) cap = Math.min(limit, cap + Math.ceil(limit * 0.01))
            } catch (error) {
                console.error(error)
                finish()
            }
        }
    }, veil)
}

run()
