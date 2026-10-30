// Page-opening transition harness. Loaded on every page and tiny; the effect itself
// (fx/*.ts, a WebGL shader) is a separate chunk fetched on first hover or click.
// The page swap itself is src/lib/nav.ts; see types.ts for how an effect is split around it.
import { setTransition } from "../nav"
import type { Fx, FxContext, FxInstance, Palette, Rect } from "./types"

const FX = import.meta.glob<{ default: Fx }>("./fx/*.ts")
const NAMES = Object.keys(FX).map((k) => k.slice(5, -3))
const OUT_MS = 480
const IN_MS = 900

const pickFx = () => {
    try {
        const q = new URLSearchParams(location.search).get("fx")
        if (q) localStorage.setItem("fx", q)
        const v = q || localStorage.getItem("fx") || NAMES[0]
        return NAMES.includes(v) ? v : ""
    } catch {
        return NAMES[0]
    }
}

type RGB = [number, number, number]
const rgbOf = (css: string): RGB => {
    const x = document.createElement("canvas").getContext("2d")!
    x.canvas.width = x.canvas.height = 1
    x.fillStyle = css || "black"
    x.fillRect(0, 0, 1, 1)
    const d = x.getImageData(0, 0, 1, 1).data
    return [d[0] / 255, d[1] / 255, d[2] / 255]
}
const palette = (): Palette => {
    const s = getComputedStyle(document.documentElement)
    const c = (n: string) => rgbOf(s.getPropertyValue(n).trim())
    return {
        bg: c("--gray-50"),
        line: c("--gray-200"),
        mid: c("--gray-500"),
        ink: c("--gray-main"),
        primary: c("--primary"),
        primaryLight: c("--primary-200"),
        white: c("--white"),
        black: c("--black"),
    }
}

interface Handoff {
    src: Rect
    fill: RGB
}

function context(h: Handoff, phase: "out" | "in", img?: HTMLImageElement): FxContext {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const canvas = document.createElement("canvas")
    const w = innerWidth
    const vh = innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(vh * dpr)
    canvas.setAttribute("aria-hidden", "true")
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:2147483000;pointer-events:none"
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false })
    if (!gl) throw new Error("no webgl")
    gl.viewport(0, 0, canvas.width, canvas.height)
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    let texSize: [number, number] = [1, 1]
    if (img) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        texSize = [img.naturalWidth, img.naturalHeight]
    } else {
        const f = h.fill.map((v) => Math.round(v * 255))
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([f[0], f[1], f[2], 255]))
    }
    document.body.append(canvas)
    return {
        canvas,
        gl,
        w,
        h: vh,
        dpr,
        src: h.src,
        dest: () => {
            const el = document.querySelector(".media > :first-child")
            if (!el) return null
            const r = el.getBoundingClientRect()
            return { x: r.left, y: r.top, w: r.width, h: r.height }
        },
        tex,
        texSize,
        hasPoster: !!img,
        fill: h.fill,
        palette: palette(),
        phase,
    }
}

/** Run draw(t) from a to b over ms; resolves once the last frame has been drawn. */
const play = (draw: (t: number) => void, a: number, b: number, ms: number) =>
    new Promise<void>((done) => {
        const t0 = performance.now()
        const tick = (now: number) => {
            const k = Math.min(1, (now - t0) / ms)
            draw(a + (b - a) * k)
            if (k < 1) requestAnimationFrame(tick)
            else done()
        }
        requestAnimationFrame(tick)
    })

const finish = (ctx?: FxContext) => {
    if (!ctx) return
    ctx.gl.getExtension("WEBGL_lose_context")?.loseContext()
    ctx.canvas.remove()
}

const reduced = matchMedia("(prefers-reduced-motion: reduce)")
const isCard = (a: Element) => a.matches(".card a[data-fx]")

// Load the effect's chunk while the pointer is still on the card
addEventListener("pointerover", (e) => {
    const a = (e.target as Element).closest?.<HTMLAnchorElement>(".card a[data-fx]")
    const name = a && !reduced.matches && pickFx()
    if (name) FX[`./fx/${name}.ts`]().catch(() => {})
})
// Back/forward can restore a half-played overlay from bfcache
addEventListener("pageshow", (e) => {
    if (e.persisted) document.querySelectorAll("body > canvas[aria-hidden]").forEach((c) => c.remove())
})

// Out over the clicked card (t 0 to 0.5), swap the page under the flat bridge frame,
// then in over the new page's first media block (t 0.5 to 1)
setTransition(async (a, swap) => {
    const name = isCard(a) && !reduced.matches ? pickFx() : ""
    const media = name ? a.querySelector<HTMLElement>("img, .fill") : null
    if (!name || !media) return swap()

    const r = media.getBoundingClientRect()
    const img = media instanceof HTMLImageElement ? media : undefined
    const h: Handoff = {
        src: { x: r.left, y: r.top, w: r.width, h: r.height },
        fill: img ? [0, 0, 0] : rgbOf(getComputedStyle(media).backgroundColor),
    }
    let fx: Fx | undefined
    let out: FxContext | undefined
    let outFx: FxInstance | undefined
    try {
        const load = FX[`./fx/${name}.ts`]()
        fx = (await Promise.race([load, new Promise<never>((_, no) => setTimeout(no, 700))])).default
        if (img && !img.complete) await img.decode()
        out = context(h, "out", img)
        outFx = fx.setup(out)
        await play(outFx.draw, 0, 0.5, OUT_MS)
    } catch {
        finish(out)
        out = undefined
    }
    try {
        await swap()
    } catch (err) {
        finish(out)
        throw err
    }
    if (!out || !fx) return

    let inn: FxContext | undefined
    try {
        inn = context(h, "in", img)
        const inFx = fx.setup(inn)
        inFx.draw(0.5)
        outFx?.dispose?.()
        finish(out)
        await play(inFx.draw, 0.5, 1, IN_MS)
        inFx.dispose?.()
    } catch {
        finish(out)
    }
    finish(inn)
})

// Dev-only picker so the effects can be compared side by side
if (import.meta.env.DEV && NAMES.length) {
    const bar = document.createElement("div")
    bar.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483600;display:flex;gap:4px;font:12px/1 monospace"
    const paint = () => {
        const cur = pickFx()
        bar.querySelectorAll("button").forEach((b) => {
            b.style.background = b.textContent === cur ? "#000" : "#fff"
            b.style.color = b.textContent === cur ? "#fff" : "#000"
        })
    }
    for (const n of [...NAMES, "off"]) {
        const b = document.createElement("button")
        b.textContent = n
        b.style.cssText = "padding:6px 8px;border:1px solid #888;cursor:pointer"
        b.onclick = () => {
            localStorage.setItem("fx", n)
            paint()
        }
        bar.append(b)
    }
    document.body.append(bar)
    paint()
}
