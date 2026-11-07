import { anchor, hold, peek, prime, takeOver, toggle } from "./theme"

// The cord the dark mode switch hangs from (src/components/Cord.astro, Figma node 3252:17850):
// a chain of light masses on soft springs with a heavier sun at the end. A pointer brushing past
// drags the cord along; near the sun it pulls the sun to itself, which stretches the cord until
// the sun slips off and swings back; pressed, the sun can be pulled about. The dashes stretch
// with the cord (`pathLength`).
//
// The cord hangs straight under gravity, but the Figma curve has a bend in it, so what is drawn
// is the curve plus each mass's displacement from where it settles: at rest, exactly the Figma
// drawing. It is sewn to the page's top edge (cloth.ts), and only a held pull reaches the page (a
// hover or a click just moves the cord): pulled a little, the page follows and shows the dark one
// behind; pulled past `commit`, the page comes off and the cord falls with it, and a new one lowers
// from the top. Left alone it keeps swaying a little in a slow, uneven breeze, so the loop runs for as
// long as the cord is on screen and in reach; off screen, under an open post or the loader the
// breeze dies down and the loop stops once the cord is still. Lazy chunk (Cord.astro), not loaded
// under reduced motion. Settings are in `params`, tuned from the dev-only Cord panel (cord-tune.ts).
export const params = {
    gravity: 1400, // px/s²
    stiffness: 1000, // the springs: lower stretches more
    give: 30, // damping along the springs: lower bounces longer
    recoil: 60, // damping on the sun's bounce along the cord (its swing is left alone)
    bend: 800, // how much the cord keeps smooth
    drag: 3, // air: how soon a swing dies down (per second)
    weight: 4, // the sun's mass (each of the rest weighs 0.3)
    brush: 40, // how much of the pointer's speed a passing pointer gives the cord
    width: 30, // px: how far from the pointer the cord feels it
    reach: 80, // px: how far from the sun the pointer pulls it
    magnet: 500, // how hard
    grip: 2000, // how hard a pressed sun follows the pointer
    pull: 1.7, // how far a pressed sun can go from the top, in cord lengths
    tug: 300, // px/s: the sun's jolt down when pressed (twice that from the keyboard)
    spin: 120, // how fast the sun turns to follow the cord
    wobble: 7, // how soon its turning settles
    sway: 40, // the air that keeps it swinging when nothing touches it (px/s² at the sun)
    period: 3.4, // s: how long one sway takes
    dead: 6, // px: this much pull does nothing, so a sway or a passing pointer can't lift the page
    peek: 12, // how readily the page's edge follows the cord: higher gives way sooner
    commit: 90, // px: pulled this far, the page comes off
    tap: 1200, // px/s: the sun's jolt from a click, which only tugs at the cord
}

const N = 12 // segments
const STEP = 1 / 240 // s
const NODE = 0.3 // mass of a point on the cord
const TILT = -15 // deg: the sun's angle in the Figma drawing
const SLACK = 0.5 // a compressed spring pushes back this much of a stretched one's pull
const MAX = 1500 // px/s: the pointer's speed, as far as the cord is concerned
const LIFT = 180 // px: how far above its place a new cord starts
const ENTER = 800 // ms: how long it takes to lower

const box = document.querySelector<HTMLElement>(".cord")!
const rope = box.querySelector<SVGSVGElement>(".rope")!
const path = rope.querySelector("path")!
const pull = box.querySelector<HTMLElement>(".pull")!
const sun = box.querySelector<HTMLElement>(".sun")!

// The piece is scaled up as a whole; all of this works in the drawing's own px
const size = parseFloat(getComputedStyle(box).getPropertyValue("--size")) || 1
const figma = path.getAttribute("d")!
const total = path.getTotalLength()
// The dash pattern is laid out on this length whatever the cord's real length is
path.setAttribute("pathLength", String(total))

const zeros = () => new Float64Array(N + 1)
const [x, y, vx, vy, fx, fy, homeX, homeY, curveX, curveY] = Array.from({ length: 10 }, zeros)
for (let i = 0; i <= N; i++) {
    const p = path.getPointAtLength((total * i) / N)
    curveX[i] = p.x
    curveY[i] = p.y
}

// The point the cord is sewn on at: the first one below the top of the window, which is where the
// page's top edge is. Scrolled so far that none of it shows, it isn't sewn on at all
function seam() {
    let i = 1
    while (i < N - 2 && curveY[i] * size < scrollY) i++
    return i
}
const inReach = () => scrollY < curveY[N - 2] * size

let originX = 0
let pointer: { x: number; y: number; vx: number; vy: number; t: number } | undefined
let near = false
let held = false
let angle = 0
let turn = 0
let raf = 0
let last = 0
let spare = 0
let onScreen = true
let clock = 0 // s: the breeze's own time
let gust = 0 // how much of the breeze is blowing: eases in and out, so it never jolts
let calm = false // while finding where the cord settles
let frozen = false // the timeline (scrub.ts, dev only) is running all this by hand
let sewn = false // has gone with the page
let lowering = 0 // when the new cord started down
let spent = false // this press has already switched
let moved = false // this press has dragged
let pressX = 0
let pressY = 0
let cut = 0 // the first point drawn: above the top edge there is nothing once it can move
let pin = 0 // the last point held in place: at the top, or where it is sewn on
let natural = 0 // px: how long the cord hangs from there, left alone
let liftX = 0 // px: how far the held part has moved
let liftY = 0

const mass = (i: number) => (i === N ? params.weight : NODE)
const breezy = () => !calm && !sewn && params.sway > 0 && onScreen && !box.inert && !document.documentElement.hasAttribute("data-splash")
// Where a mass is drawn
const seenX = (i: number) => curveX[i] + x[i] - homeX[i]
const seenY = (i: number) => curveY[i] + y[i] - homeY[i]

function step(dt: number, air: number) {
    const k = params.stiffness
    const rest = total / N
    fx.fill(0)
    fy.fill(0)
    for (let i = 1; i <= N; i++) fy[i] = params.gravity * mass(i)
    gust += ((breezy() ? 1 : 0) - gust) * Math.min(1, dt * 1.5)
    clock += dt
    // Two sines that never line up the same way twice; stronger down the cord, as it swings
    const w = (2 * Math.PI * clock) / params.period
    const breeze = gust * params.sway * (Math.sin(w) + 0.45 * Math.sin(w * 1.618 + 1))
    for (let i = 1; i <= N; i++) fx[i] = breeze * mass(i) * (i / N)
    for (let i = 0; i < N; i++) {
        const dx = x[i + 1] - x[i]
        const dy = y[i + 1] - y[i]
        const d = Math.hypot(dx, dy) || 1
        const stretch = d - rest
        const closing = ((vx[i + 1] - vx[i]) * dx + (vy[i + 1] - vy[i]) * dy) / d
        const f = (k * (stretch < 0 ? stretch * SLACK : stretch) + params.give * closing) / d
        fx[i] += f * dx
        fy[i] += f * dy
        fx[i + 1] -= f * dx
        fy[i + 1] -= f * dy
    }
    for (let i = 1; i < N; i++) {
        fx[i] += params.bend * ((x[i - 1] + x[i + 1]) / 2 - x[i])
        fy[i] += params.bend * ((y[i - 1] + y[i + 1]) / 2 - y[i])
    }
    // A chain's own damping barely touches the whole cord's bounce: a let-go sun shot past the top
    const toX = x[N] - x[pin]
    const toY = y[N] - y[pin]
    const span = Math.hypot(toX, toY) || 1
    // Only while it is taut: on a slack cord this held the falling sun back to about 70 px/s
    const taut = Math.min(1, Math.max(0, (span - natural) / 8))
    const along = (taut * params.recoil * (vx[N] * toX + vy[N] * toY)) / (span * span)
    fx[N] -= along * toX
    fy[N] -= along * toY
    if (pointer && !sewn) {
        for (let i = 1; i <= N; i++) {
            const d = Math.hypot(pointer.x - seenX(i), pointer.y - seenY(i))
            if (d >= params.width) continue
            const by = (1 - d / params.width) * params.brush * NODE
            fx[i] += pointer.vx * by
            fy[i] += pointer.vy * by
        }
        const dx = pointer.x - seenX(N)
        const dy = pointer.y - seenY(N)
        const d = Math.hypot(dx, dy)
        if (held) {
            // As far as the pointer, or as far as the cord can go
            const ax = pointer.x - curveX[0]
            const ay = pointer.y - curveY[0]
            const scale = Math.min(1, (params.pull * total) / (Math.hypot(ax, ay) || 1))
            fx[N] += params.grip * (curveX[0] + ax * scale - seenX(N))
            fy[N] += params.grip * (curveY[0] + ay * scale - seenY(N))
        } else if (d < params.reach) {
            const by = params.magnet * (1 - d / params.reach)
            fx[N] += dx * by
            fy[N] += dy * by
        }
        const fade = Math.exp(-dt * 12)
        pointer.vx *= fade
        pointer.vy *= fade
    }
    for (let i = pin + 1; i <= N; i++) {
        vx[i] = (vx[i] + (fx[i] / mass(i)) * dt) * air
        vy[i] = (vy[i] + (fy[i] / mass(i)) * dt) * air
        x[i] += vx[i] * dt
        y[i] += vy[i] * dt
    }
    // The sun follows the last piece of the cord a little late (the cord hangs straight at rest,
    // so this is the turn away from the drawing)
    const lean = Math.atan2(x[N] - x[N - 1], Math.max(0.01, y[N] - y[N - 1])) * (180 / Math.PI)
    turn += (params.spin * (-lean - angle) - params.wobble * turn) * dt
    angle += turn * dt
}

// A smooth line through the points (Catmull-Rom as Béziers)
function line() {
    const X = (i: number) => seenX(Math.max(0, Math.min(N, i)))
    const Y = (i: number) => seenY(Math.max(0, Math.min(N, i)))
    const n = (v: number) => v.toFixed(2)
    let d = `M${n(X(cut))} ${n(Y(cut))}`
    for (let i = cut; i < N; i++) {
        d += `C${n(X(i) + (X(i + 1) - X(i - 1)) / 6)} ${n(Y(i) + (Y(i + 1) - Y(i - 1)) / 6)} ${n(X(i + 1) - (X(i + 2) - X(i)) / 6)} ${n(Y(i + 1) - (Y(i + 2) - Y(i)) / 6)} ${n(X(i + 1))} ${n(Y(i + 1))}`
    }
    return d
}

function draw() {
    path.setAttribute("d", line())
    pull.style.transform = `translate(${(x[N] - homeX[N]).toFixed(2)}px, ${(y[N] - homeY[N]).toFixed(2)}px)`
    sun.style.transform = `rotate(${(TILT + angle).toFixed(2)}deg)`
}

const naturalFrom = (i: number) => Math.hypot(homeX[N] - homeX[i], homeY[N] - homeY[i])

// From which point the cord is held and drawn, its dashes carrying on where they would have been
function drawFrom(point: number) {
    if (cut === point) return
    cut = pin = point
    natural = naturalFrom(point)
    path.setAttribute("pathLength", String((total * (N - point)) / N))
    path.style.strokeDashoffset = point ? String((total * point) / N) : ""
}

// Back on the Figma drawing itself
function rest() {
    x.set(homeX)
    y.set(homeY)
    vx.fill(0)
    vy.fill(0)
    angle = turn = 0
    drawFrom(0)
    path.setAttribute("d", figma)
    pull.style.transform = sun.style.transform = ""
}

function still() {
    if (held || gust > 0.01 || breezy() || Math.abs(turn) > 2) return false
    for (let i = 1; i <= N; i++) if (Math.hypot(vx[i], vy[i]) > 3) return false
    return !pointer || Math.hypot(pointer.vx, pointer.vy) < 3
}

// The top of the cord follows the sheet's nail through a short low-pass (time constant SMOOTH, s): the
// sheet's top edge ripples a little, a few px up and down from frame to frame, and the cord's top end
// copied every ripple (seen in Vansh's screen recording from a phone, 2026-11-07: its top end jumped 10
// to 25 px against the sheet's edge from one frame to the next while the rest of the cord was smooth)
const SMOOTH = 0.03
let nail: [number, number] | undefined
let frameDt = 0.016

// Where the top of the cord should be: where it is sewn on, or on its way down from above
function top(now: number): [number, number] {
    if (lowering) {
        const t = (now - lowering) / ENTER
        if (t >= 1) lowering = 0
        else return [0, -LIFT * (1 - t) ** 3]
    }
    const a = sewn || inReach() ? anchor() : undefined
    drawFrom(a ? cut || seam() : 0)
    if (!a) {
        nail = undefined
        return [0, 0]
    }
    // Only while it is peeking: the fall is fast, and a cord that trails it would come apart from it
    if (!nail || sewn) nail = [a[0], a[1]]
    else {
        const k = 1 - Math.exp(-frameDt / SMOOTH)
        nail[0] += (a[0] - nail[0]) * k
        nail[1] += (a[1] - nail[1]) * k
    }
    return [nail[0] / size, nail[1] / size]
}

// What the pull does to the page
function feel() {
    if (sewn || lowering) return
    const down = seenY(N) - curveY[N]
    if (held && !spent && down > params.commit) {
        spent = true
        toggle()
        if (sewn) return
    }
    // Only while held, and not again once this press has switched. By how much the cord is
    // stretched, not by where the sun is: the cord hangs from the page, so a sun that only follows
    // the page down must not hold it there
    peek(held && !spent ? Math.max(0, down - liftY - params.dead) * size * params.peek : 0)
}

function frame(now: number) {
    raf = 0
    frameDt = Math.min(0.05, (now - last) / 1000)
    spare += frameDt
    last = now
    const air = Math.exp(-params.drag * STEP)
    const fromX = liftX
    const fromY = liftY
    const [toX, toY] = top(now)
    const steps = Math.floor(spare / STEP)
    for (let i = 1; i <= steps; i++) {
        liftX = fromX + ((toX - fromX) * i) / steps
        liftY = fromY + ((toY - fromY) * i) / steps
        for (let j = 0; j <= pin; j++) {
            x[j] = homeX[j] + liftX
            y[j] = homeY[j] + liftY
        }
        step(STEP, air)
        spare -= STEP
    }
    draw()
    feel()
    if (still()) {
        // Still, but held out of place by the pointer: stays until the pointer moves
        let off = 0
        for (let i = 1; i <= N; i++) off = Math.max(off, Math.hypot(x[i] - homeX[i], y[i] - homeY[i]))
        if (off < 0.3) rest()
        return
    }
    raf = frozen ? 0 : requestAnimationFrame(frame)
}

// The sheet has taken its step (cloth.ts): the cord takes its own now, in the same frame, so that its
// top end is where the sheet's nail is, not where it was a frame ago
document.addEventListener("cloth:frame", () => {
    if (!raf || frozen) return
    cancelAnimationFrame(raf)
    raf = 0
    frame(performance.now())
})

function wake() {
    if (raf || frozen) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
}

// Where the cord settles, hanging straight from the top of the Figma curve
function settle() {
    for (let i = 0; i <= N; i++) {
        x[i] = curveX[0]
        y[i] = curveY[0] + (total * i) / N
    }
    vx.fill(0)
    vy.fill(0)
    const air = Math.exp(-8 * STEP)
    const kept = pointer
    pointer = undefined
    calm = true
    gust = 0
    for (let i = 0; i < 2400; i++) step(STEP, air)
    calm = false
    pointer = kept
    homeX.set(x)
    homeY.set(y)
    natural = naturalFrom(pin)
    rest()
}

/** After a change to `params` (the dev panel) */
export function retune() {
    settle()
    wake()
}

function measure() {
    originX = rope.getBoundingClientRect().left + scrollX
}

function point(e: PointerEvent) {
    if (e.pointerType === "touch" && !held) return
    if (frozen || sewn || box.inert || document.documentElement.hasAttribute("data-splash")) return
    const px = (e.clientX + scrollX - originX) / size
    const py = (e.clientY + scrollY) / size
    if (held && Math.hypot(px - pressX, py - pressY) > 4) moved = true
    const now = e.timeStamp
    if (pointer) {
        const dt = Math.max(1, now - pointer.t) / 1000
        const clip = (v: number) => Math.max(-MAX, Math.min(MAX, v))
        pointer.vx += (clip((px - pointer.x) / dt) - pointer.vx) * 0.5
        pointer.vy += (clip((py - pointer.y) / dt) - pointer.vy) * 0.5
        pointer.x = px
        pointer.y = py
        pointer.t = now
    } else pointer = { x: px, y: py, vx: 0, vy: 0, t: now }
    const margin = params.reach + params.width
    const was = near
    near = Math.hypot(px - seenX(N), py - seenY(N)) < margin || (Math.abs(px - curveX[0]) < margin && py < seenY(N) + margin)
    if (near && !was) prime()
    if (near || was || held) wake()
}

function away() {
    pointer = undefined
    near = false
    wake()
}

settle()
measure()
addEventListener("resize", measure)
// The breeze only where it can be seen (a hidden tab pauses the loop by itself)
new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting
    wake()
}).observe(rope)
document.addEventListener("overlay:close", wake)
document.addEventListener("splash:done", wake)
wake()
addEventListener("pointermove", point, { passive: true })
// Leaving the window (`pointerleave` alone does not always fire: see dock.ts)
document.addEventListener("mouseout", (e) => e.relatedTarget || held || away())
// Pulling the cord down at the top of the page must not also pull the page (Safari's rubber band: an
// iPad's page moved under the finger, which scrolled it and cancelled the pointer, so the peek armed and
// healed again and again at the moment of the pull: a flicker at the top, Vansh, 2026-11-07). The page's
// own overscroll is off while it is held, and a touch that moves is not allowed to scroll
const pageFree = () => document.documentElement.style.removeProperty("overscroll-behavior")
addEventListener("touchmove", (e) => held && e.preventDefault(), { passive: false })
// The cord is not text: nothing to select, no menu on a long press
for (const t of ["contextmenu", "selectstart", "dragstart"]) box.addEventListener(t, (e) => e.preventDefault())
pull.addEventListener("pointerdown", (e) => {
    held = true
    hold(true)
    document.documentElement.style.setProperty("overscroll-behavior", "none")
    spent = moved = false
    point(e)
    pressX = pointer?.x ?? 0
    pressY = pointer?.y ?? 0
    prime()
    pull.setPointerCapture(e.pointerId)
    vy[N] += params.tug
    wake()
})
const release = (e: PointerEvent) => {
    held = false
    hold(false)
    pageFree()
    if (e.pointerType === "touch") away()
    else wake()
}
pull.addEventListener("pointerup", release)
pull.addEventListener("pointercancel", release)
pull.addEventListener("click", (e) => {
    // The keyboard: theme.ts has switched, and this shows it
    if (!e.detail) vy[N] += params.tug * 2
    // A click is no pull: it only tugs at the cord
    else if (!spent && !moved) vy[N] += params.tap
    wake()
})
// The page has come off, and the cord with it: out of reach, and free to fall the whole window
document.addEventListener("cloth:fall", () => {
    if (!inReach()) return
    sewn = true
    held = false
    hold(false)
    pageFree()
    pointer = undefined
    near = false
    drawFrom(cut || seam())
    pull.style.pointerEvents = "none"
    // In the colour that shows on the page and on what's behind it (it may have been hovered)
    pull.style.color = "var(--gray-500)"
    box.style.height = `${document.documentElement.clientHeight + scrollY}px`
    wake()
})
// A new one, lowered from above
document.addEventListener("cloth:gone", () => {
    if (!sewn) return
    sewn = false
    drawFrom(0)
    for (let i = 0; i <= N; i++) {
        x[i] = homeX[i]
        y[i] = homeY[i] - LIFT
    }
    vx.fill(0)
    vy.fill(0)
    angle = turn = 0
    liftX = 0
    liftY = -LIFT
    lowering = frozen ? last : performance.now()
    pull.style.pointerEvents = pull.style.color = box.style.height = ""
    showIcon()
    wake()
})
// Moon on the light page that the pull turns dark, sun on the dark one (Cord.astro). It follows the
// page on top, which during a pull is not data-theme, and a falling cord keeps the one it had
const root = document.documentElement
const showIcon = () => {
    if (sewn) return
    const peek = root.dataset.peek
    const light = peek === "dark" || (peek === undefined && root.dataset.theme !== "dark")
    box.dataset.icon = light ? "moon" : "sun"
}
new MutationObserver(showIcon).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-peek"] })
showIcon()
takeOver()

const clean = () => {
    held = spent = moved = sewn = near = false
    hold(false)
    lowering = liftX = liftY = spare = clock = gust = 0
    pointer = undefined
    box.style.height = pull.style.color = ""
    rest()
}

/** For the timeline (scrub.ts); nothing of this is in the build */
export const dev = import.meta.env.DEV
    ? {
          begin() {
              cancelAnimationFrame(raf)
              raf = 0
              frozen = true
          },
          reset(now: number) {
              clean()
              last = now
          },
          frame,
          sun: () => [seenX(N), seenY(N)] as [number, number],
          press(px: number, py: number) {
              held = true
              spent = moved = false
              pointer = { x: px, y: py, vx: 0, vy: 0, t: 0 }
              vy[N] += params.tug
          },
          move(px: number, py: number, dt: number) {
              if (!pointer) return
              pointer.vx = (px - pointer.x) / dt
              pointer.vy = (py - pointer.y) / dt
              pointer.x = px
              pointer.y = py
          },
          release() {
              held = false
              pointer = undefined
          },
          pose: () => ({
              d: path.getAttribute("d") ?? "",
              length: path.getAttribute("pathLength") ?? "",
              offset: path.style.strokeDashoffset,
              pull: pull.style.transform,
              sun: sun.style.transform,
              height: box.style.height,
              color: pull.style.color,
          }),
          show(p: { d: string; length: string; offset: string; pull: string; sun: string; height: string; color: string }) {
              path.setAttribute("d", p.d)
              path.setAttribute("pathLength", p.length)
              path.style.strokeDashoffset = p.offset
              pull.style.transform = p.pull
              sun.style.transform = p.sun
              box.style.height = p.height
              pull.style.color = p.color
              pull.style.pointerEvents = "none"
          },
          end() {
              frozen = false
              clean()
              pull.style.pointerEvents = ""
              wake()
          },
      }
    : undefined
