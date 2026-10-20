// Game of Life: a dot grid running Conway's Game of Life. Hover (mouse) or tap
// (touch) plants cells that grow and die on their own; the grid reseeds itself when
// it goes quiet. Ported from the Framer hero (framer/GameOfLifeHero.tsx): the
// property controls became Options, the React effect became mount().
import type { Mount } from "../../lib/types"

export interface Options {
    dotColor: string
    aliveColor: string
    spacing: number
    dotSize: number
    aliveSize: number
    speed: number
    density: number
    hoverPlant: boolean
    brush: number
    smooth: number
}

export const defaults: Options = {
    dotColor: "rgba(255,255,255,0.12)",
    aliveColor: "#FF5A2F",
    spacing: 20,
    dotSize: 1.5,
    aliveSize: 4,
    speed: 8,
    density: 0.12,
    hoverPlant: true,
    brush: 1,
    smooth: 0.25,
}

// Patterns as [x, y] offsets
const GLIDER = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]
const R_PENTOMINO = [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]]
const ACORN = [[1, 0], [3, 1], [0, 2], [1, 2], [4, 2], [5, 2], [6, 2]]
const TAP_PATTERNS = [R_PENTOMINO, ACORN, GLIDER]

const TAP_SLOP = 10 // px a finger may move and still count as a tap
const QUIET_GENERATIONS = 40 // unchanged population this long → reseed

const mount: Mount<Options> = (canvas, options) => {
    const c: Options = { ...defaults, ...options }
    const ctx = canvas.getContext("2d")!

    let cols = 0
    let rows = 0
    let w = 0
    let h = 0
    let cells = new Uint8Array(0)
    let next = new Uint8Array(0)
    let vis = new Float32Array(0) // eased 0..1 per cell for drawing
    let population = 0
    let quiet = 0
    let running = false
    let raf = 0
    let last = 0
    let acc = 0
    let dirty = true // something to draw even if the sim is paused

    const idx = (x: number, y: number) => ((y + rows) % rows) * cols + ((x + cols) % cols)

    const stamp = (pattern: number[][], ox: number, oy: number) => {
        const flip = Math.random() < 0.5
        for (const [px, py] of pattern) cells[idx(ox + (flip ? -px : px), oy + py)] = 1
        dirty = true
    }

    const seed = () => {
        for (let i = 0; i < cells.length; i++) cells[i] = Math.random() < c.density ? 1 : 0
        const extra = Math.max(2, Math.round((cols * rows) / 600))
        for (let i = 0; i < extra; i++) {
            stamp(
                TAP_PATTERNS[i % TAP_PATTERNS.length],
                Math.floor(Math.random() * cols),
                Math.floor(Math.random() * rows)
            )
        }
        quiet = 0
        dirty = true
    }

    const resize = () => {
        const rect = canvas.getBoundingClientRect()
        w = rect.width
        h = rect.height
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.max(1, Math.round(w * dpr))
        canvas.height = Math.max(1, Math.round(h * dpr))
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const s = Math.max(4, c.spacing)
        const nc = Math.max(1, Math.floor(w / s))
        const nr = Math.max(1, Math.floor(h / s))
        if (nc !== cols || nr !== rows) {
            cols = nc
            rows = nr
            cells = new Uint8Array(cols * rows)
            next = new Uint8Array(cols * rows)
            vis = new Float32Array(cols * rows)
            seed()
        }
        dirty = true
        if (!running) draw(true)
    }

    const step = () => {
        let pop = 0
        for (let y = 0; y < rows; y++) {
            const up = ((y - 1 + rows) % rows) * cols
            const mid = y * cols
            const down = ((y + 1) % rows) * cols
            for (let x = 0; x < cols; x++) {
                const l = (x - 1 + cols) % cols
                const r = (x + 1) % cols
                const n =
                    cells[up + l] + cells[up + x] + cells[up + r] +
                    cells[mid + l] + cells[mid + r] +
                    cells[down + l] + cells[down + x] + cells[down + r]
                const v = n === 3 || (cells[mid + x] && n === 2) ? 1 : 0
                next[mid + x] = v
                pop += v
            }
        }
        const t = cells
        cells = next
        next = t
        // Stable or dying grids get a fresh seed so it never goes dead
        quiet = pop === population ? quiet + 1 : 0
        population = pop
        if (quiet > QUIET_GENERATIONS || pop < cols * rows * 0.01) seed()
        dirty = true
    }

    const draw = (instant: boolean) => {
        const s = w / cols
        const sy = h / rows
        const ox = s / 2
        const oy = sy / 2
        const k = instant ? 1 : c.smooth <= 0 ? 1 : Math.min(1, 1 - c.smooth + 0.05)
        ctx.clearRect(0, 0, w, h)

        // Base grid: one path, one fill
        ctx.fillStyle = c.dotColor
        ctx.beginPath()
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const cx = ox + x * s
                const cy = oy + y * sy
                ctx.moveTo(cx + c.dotSize, cy)
                ctx.arc(cx, cy, c.dotSize, 0, Math.PI * 2)
            }
        }
        ctx.fill()

        // Live cells, eased in and out
        let settling = false
        ctx.fillStyle = c.aliveColor
        ctx.beginPath()
        for (let i = 0; i < cells.length; i++) {
            const target = cells[i]
            let v = vis[i]
            if (v !== target) {
                v += (target - v) * k
                if (Math.abs(target - v) < 0.02) v = target
                else settling = true
                vis[i] = v
            }
            if (v <= 0.01) continue
            const x = i % cols
            const y = (i / cols) | 0
            const r = c.dotSize + (c.aliveSize - c.dotSize) * v
            const cx = ox + x * s
            const cy = oy + y * sy
            ctx.moveTo(cx + r, cy)
            ctx.arc(cx, cy, r, 0, Math.PI * 2)
        }
        ctx.fill()
        dirty = settling
    }

    const plantAt = (clientX: number, clientY: number, pattern?: number[][]) => {
        const rect = canvas.getBoundingClientRect()
        const gx = Math.floor(((clientX - rect.left) / rect.width) * cols)
        const gy = Math.floor(((clientY - rect.top) / rect.height) * rows)
        if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return
        if (pattern) return stamp(pattern, gx - 1, gy - 1)
        const b = Math.max(0, Math.round(c.brush))
        for (let y = -b; y <= b; y++) {
            for (let x = -b; x <= b; x++) {
                if (Math.random() < 0.5) cells[idx(gx + x, gy + y)] = 1
            }
        }
        dirty = true
    }

    // Hover planting for mouse/pen; taps plant a growing pattern. Taps are detected
    // on pointer-up with little movement, so swiping still scrolls the page.
    let downX = 0
    let downY = 0
    let downId = -1
    let lastPlant = 0
    const onMove = (e: PointerEvent) => {
        if (e.pointerType === "touch" || !c.hoverPlant) return
        const now = performance.now()
        if (now - lastPlant < 40) return
        lastPlant = now
        plantAt(e.clientX, e.clientY)
    }
    const onDown = (e: PointerEvent) => {
        downId = e.pointerId
        downX = e.clientX
        downY = e.clientY
    }
    const onUp = (e: PointerEvent) => {
        if (e.pointerId !== downId) return
        downId = -1
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_SLOP) return
        plantAt(e.clientX, e.clientY, TAP_PATTERNS[Math.floor(Math.random() * TAP_PATTERNS.length)])
    }
    const onCancel = () => {
        downId = -1
    }

    const loop = (t: number) => {
        raf = 0
        if (!running) return
        const dt = last ? Math.min(t - last, 100) : 0
        last = t
        acc += dt
        const interval = 1000 / Math.max(0.5, c.speed)
        while (acc >= interval) {
            acc -= interval
            step()
        }
        if (dirty) draw(false)
        raf = requestAnimationFrame(loop)
    }

    resize()
    for (let i = 0; i < 12; i++) step()
    draw(true)

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onCancel)

    return {
        pause() {
            running = false
            cancelAnimationFrame(raf)
            raf = 0
        },
        resume() {
            if (running) return
            running = true
            last = 0
            raf = requestAnimationFrame(loop)
        },
        stop() {
            this.pause()
            ro.disconnect()
            canvas.removeEventListener("pointermove", onMove)
            canvas.removeEventListener("pointerdown", onDown)
            canvas.removeEventListener("pointerup", onUp)
            canvas.removeEventListener("pointercancel", onCancel)
        },
    }
}

export default mount
