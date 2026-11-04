// A post opening and closing as a morph through particles (Vansh, 2026-11-05).
//
// Opening: the clicked poster comes apart into particles in its colours, which set off at
// once towards where the card will be (its size and place follow from the window, so they do
// not wait for the post to load); the card grows out of the poster (from the poster's box to
// its own, blurred and faint at first, sharpening as it settles) as soon as it is there, and
// the particles fly onto it: each has a spot on the card (most where the first image goes,
// many on its edges and dashed guides, the rest over it) and stays on it as the card moves,
// turning the colour of what is there. They fade as the card comes in, and are gone the
// moment it is fully there. Closing is the same played back: the card shrinks and blurs into
// the poster while particles of its colours peel off it and fly home, and the poster fades
// back in as they arrive.
//
// Lightweight on purpose: one canvas of plain 2D squares, colours sampled from tiny copies of
// the poster and the first image, the card moved with transform and opacity (and a blur that
// eases out); preloaded by overlay.ts.
type RGB = [number, number, number]
type Box = { x: number; y: number; w: number; h: number }
// A card's shape: its box (window px), its first media block (card px) and that block's colours
type Shape = { box: Box; first: Box | null; at: (u: number, v: number) => RGB }
type Dot = {
    x: number // where it is drawn (window px)
    y: number
    vx: number // px/s while drifting (only while the card's place is not known)
    vy: number
    sx: number // where its flight starts (window px; on closing, a spot on the card instead)
    sy: number
    lx: number // its spot on the card (card px) or in the poster (window px)
    ly: number
    bend: number // how far its path bows off the straight line, as a share of its length
    wait: number // ms before it sets off
    s0: number // size at the start and the end
    s1: number
    c0: RGB // colour at the start and the end
    c1: RGB
    img: boolean // its spot is in the first image (it fades first, into the image)
}

// The morph's settings, live: the dev-only Morph panel (morph-tune.ts) changes them
export const params = {
    flight: 700, // ms each particle takes (the card grows over flight + spread)
    spread: 60, // ms: the latest a particle sets off after the first (small: none sits still)
    bulge: 0.55, // the lens at its strongest (share of magnification at the centre)
    relax: 0.75, // the bulge is flat by this share of the growth
    curve: 1.5, // how it relaxes: 1 evenly, higher lets go sooner
    solid: 0.15, // the (stand-in) card is opaque by this share of the growth
    handover: 0.8, // the real card takes over from the stand-in from this share (over 0.15)
    blur: 14, // px: the card's blur as it leaves the poster
    density: 600, // px² of window per particle (fewer particles when higher)
}
const all = () => params.flight + params.spread
const FRAME = 40 // px: the card's frame (its guides are this far in)
const G = 24 // the sampling grid of an image

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (t: number) => Math.min(1, Math.max(0, t))
// A soft ease both ways (quintic), and a step that is flat at both ends
// Moving at once, settling softly (an ease-out: 20% of the way 7% into the time). An ease-in
// here (the quintic it was) left the particles still for the first ~200 ms: a pause
const ease = (t: number) => 1 - (1 - t) ** 3
const smooth = (a: number, b: number, t: number) => {
    const k = clamp((t - a) / (b - a))
    return k * k * (3 - 2 * k)
}
const mix = (a: number, b: number, k: number) => a + (b - a) * k

// Any CSS colour as rgb, through a 1px canvas
const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!
function rgb(css: string): RGB {
    probe.clearRect(0, 0, 1, 1)
    probe.fillStyle = "#000"
    probe.fillStyle = css
    probe.fillRect(0, 0, 1, 1)
    const d = probe.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2]]
}
const token = (name: string) => rgb(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#fff")

// An element's colours on a G x G grid (an image or 2D canvas drawn tiny, else its fill), as a
// lookup by position in its box (0..1)
function colours(el: Element | null | undefined): (u: number, v: number) => RGB {
    const fill = el ? rgb(getComputedStyle(el).backgroundColor) : token("--gray-100")
    const flat = () => fill
    const src = el instanceof HTMLImageElement ? el : el?.querySelector?.("img, canvas")
    if (!(src instanceof HTMLImageElement || src instanceof HTMLCanvasElement)) return flat
    if (src instanceof HTMLImageElement && (!src.complete || !src.naturalWidth)) return flat
    try {
        const c = document.createElement("canvas")
        c.width = c.height = G
        const g = c.getContext("2d", { willReadFrequently: true })!
        g.drawImage(src, 0, 0, G, G)
        const d = g.getImageData(0, 0, G, G).data
        // A WebGL canvas without a kept buffer reads as clear: use the fill then
        if (!d.some((v, i) => i % 4 === 3 && v > 0)) return flat
        return (u, v) => {
            const i = (Math.min(G - 1, (v * G) | 0) * G + Math.min(G - 1, (u * G) | 0)) * 4
            return [d[i], d[i + 1], d[i + 2]]
        }
    } catch {
        return flat
    }
}

const boxOf = (r: DOMRect): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height })
const posterOf = (from: HTMLElement) => from.querySelector("img, .fill") ?? from

// The card laid out in the window
function shapeOf(post: HTMLElement): Shape {
    const box = boxOf(post.getBoundingClientRect())
    const block = post.querySelector(".media > *")
    const r = block?.getBoundingClientRect()
    return { box, first: r && r.width ? { x: r.left - box.x, y: r.top - box.y, w: r.width, h: r.height } : null, at: colours(block) }
}

// Where the card will be, before it has loaded (the rules in [slug].astro and Grid.astro): from
// 900px wide, 16:10, at most 1280 wide, 90% of the window high and the guides apart, centred;
// its first block is the media column's (73.333% of the frame, on the right) at 880:560, in
// the poster's colours (the first block shows the poster). Narrower, the card is one column
// of unknown height: no estimate, the particles wait for it
function estimate(from: HTMLElement): Shape | null {
    if (innerWidth < 900) return null
    const probeEdge = document.createElement("div")
    probeEdge.style.cssText = "position:absolute;visibility:hidden;width:var(--edge)"
    document.body.append(probeEdge)
    const edge = probeEdge.offsetWidth
    probeEdge.remove()
    const w = Math.min(1280, innerWidth - 2 * edge, innerHeight * 0.9 * 1.6)
    const h = w / 1.6
    const inner = w - 2 - 2 * FRAME
    const mw = inner * 0.73333
    return {
        box: { x: (innerWidth - w) / 2, y: (innerHeight - h) / 2, w, h },
        first: { x: 1 + FRAME + inner - mw, y: 1 + FRAME, w: mw, h: Math.min((mw * 560) / 880, h - 2 - 2 * FRAME) },
        at: colours(posterOf(from)),
    }
}

// Spots on a card shape (card px) with their colours
function cardSpots(shape: Shape, n: number) {
    const { w, h } = shape.box
    const first = shape.first
    const white = token("--white")
    const guide = token("--gray-200")
    const lines = [
        [0, 0, w, 0],
        [0, h, w, h],
        [0, 0, 0, h],
        [w, 0, w, h],
        [0, FRAME, w, FRAME],
        [0, h - FRAME, w, h - FRAME],
        [FRAME, 0, FRAME, h],
        [w - FRAME, 0, w - FRAME, h],
    ]
    return Array.from({ length: n }, () => {
        const k = Math.random()
        if (first && k < 0.35) {
            const u = Math.random()
            const v = Math.random() * (Math.min(first.h, h - FRAME - first.y) / first.h)
            return { x: first.x + u * first.w, y: first.y + v * first.h, c: shape.at(u, v), img: true }
        }
        if (k < 0.85) {
            const [x1, y1, x2, y2] = lines[(Math.random() * lines.length) | 0]
            const t = Math.random()
            return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, c: guide, img: false }
        }
        // Over the card's white, never inside the image (white specks on it)
        let x = 0
        let y = 0
        for (let i = 0; i < 8; i++) {
            x = rand(0, w)
            y = rand(0, h)
            if (!first || x < first.x || x > first.x + first.w || y < first.y || y > first.y + first.h) break
        }
        return { x, y, c: white, img: false }
    })
}

// Spots in the poster (window px) with their colours
function posterSpots(from: HTMLElement, n: number) {
    const poster = posterOf(from)
    const r = poster.getBoundingClientRect()
    const at = colours(poster)
    return Array.from({ length: n }, () => {
        const u = Math.random()
        const v = Math.random()
        return { x: r.left + u * r.width, y: r.top + v * r.height, c: at(u, v) }
    })
}

const count = () => Math.round(Math.min(2400, Math.max(900, (innerWidth * innerHeight) / params.density)))
const between = (a: Box, b: Box, k: number): Box => ({ x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), w: mix(a.w, b.w, k), h: mix(a.h, b.h, k) })

// The bulge (opening only; Vansh, 2026-11-05, "you can use shaders or WebGL"): the card is a
// web page, which WebGL cannot draw, so while it bulges a stand-in is drawn instead: a picture
// of the card made once on a 2D canvas (its white, its dashed guides, its first image, its
// title, summary, tags and chips, at their measured places in their own fonts), shown through
// a lens shader (WebGL2) on a quad over the card's box: its middle swollen, its edges bowed
// out, blurred through the texture's mipmaps. As the bulge relaxes, the real card fades in
// over the stand-in and the stand-in out. No WebGL2: the morph without the bulge.

// The card as a picture (card px, at the window's pixel ratio, at most 2). Everything is
// measured once, here, while the card is laid out untouched; `paint()` draws from those
// measurements (again when the first image arrives, mid-morph, when the card is scaled)
function snapshot(post: HTMLElement, box: Box) {
    const dpr = Math.min(2, devicePixelRatio || 1)
    const c = document.createElement("canvas")
    c.width = Math.max(1, Math.round(box.w * dpr))
    c.height = Math.max(1, Math.round(box.h * dpr))
    const g = c.getContext("2d")!
    const rel = (r: DOMRect) => ({ x: r.left - box.x, y: r.top - box.y, w: r.width, h: r.height })
    const css = getComputedStyle(post)
    const paper = css.backgroundColor === "rgba(0, 0, 0, 0)" ? `rgb(${token("--white").join(",")})` : css.backgroundColor
    const grey = `rgb(${token("--gray-100").join(",")})`
    const guide = `rgb(${token("--gray-200").join(",")})`
    // The media blocks in view: an image (cropped to fill), else its fill
    const blocks = [...post.querySelectorAll<HTMLElement>(".media > *")].flatMap((block) => {
        const r = rel(block.getBoundingClientRect())
        if (r.y > box.h || r.w < 1) return []
        const img = block instanceof HTMLImageElement ? block : block.querySelector("img")
        const fill = getComputedStyle(block.querySelector(".poster, .fill") ?? block).backgroundColor
        return [{ r, img, fill: fill === "rgba(0, 0, 0, 0)" ? grey : fill }]
    })
    const chips = [...post.querySelectorAll<HTMLElement>(".chip")].map((chip) => ({ r: rel(chip.getBoundingClientRect()), fill: getComputedStyle(chip).backgroundColor }))
    // The text, word by word where the page set it, with its font and colour
    const words: { font: string; spacing: string; colour: string; word: string; r: Box }[] = []
    for (const el of post.querySelectorAll<HTMLElement>("h1, .summary, .tags span, .chip")) {
        const cs = getComputedStyle(el)
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        const spacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing
        const lower = cs.textTransform === "lowercase"
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        const range = document.createRange()
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.textContent ?? ""
            for (const m of text.matchAll(/\S+/g)) {
                range.setStart(node, m.index!)
                range.setEnd(node, m.index! + m[0].length)
                words.push({ font, spacing, colour: cs.color, word: lower ? m[0].toLowerCase() : m[0], r: rel(range.getBoundingClientRect()) })
            }
        }
    }
    const paint = () => {
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.clearRect(0, 0, box.w, box.h)
        g.fillStyle = paper
        g.fillRect(0, 0, box.w, box.h)
        g.strokeStyle = grey
        g.strokeRect(0.5, 0.5, box.w - 1, box.h - 1)
        // The dashed guides, 40px in
        g.strokeStyle = guide
        g.setLineDash([4, 4])
        g.beginPath()
        for (const y of [FRAME + 0.5, box.h - FRAME - 0.5]) (g.moveTo(0, y), g.lineTo(box.w, y))
        for (const x of [FRAME + 0.5, box.w - FRAME + 0.5]) (g.moveTo(x, 0), g.lineTo(x, box.h))
        g.stroke()
        g.setLineDash([])
        for (const { r, img, fill } of blocks) {
            const top = Math.max(r.y, FRAME)
            const bottom = Math.min(r.y + r.h, box.h - FRAME)
            g.save()
            g.beginPath()
            g.rect(r.x, top, r.w, bottom - top)
            g.clip()
            if (img && img.complete && img.naturalWidth) {
                const k = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight)
                const w = img.naturalWidth * k
                const h = img.naturalHeight * k
                g.drawImage(img, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h)
            } else {
                g.fillStyle = fill
                g.fillRect(r.x, r.y, r.w, r.h)
            }
            g.restore()
        }
        for (const { r, fill } of chips) {
            g.fillStyle = fill
            g.fillRect(r.x, r.y, r.w, r.h)
        }
        g.textBaseline = "alphabetic"
        for (const { font, spacing, colour, word, r } of words) {
            g.font = font
            ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = spacing
            g.fillStyle = colour
            const m = g.measureText(word)
            // On its line: the glyphs centred in the word's box, as the page sets them
            g.fillText(word, r.x, r.y + (r.h - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent)
        }
    }
    paint()
    return { canvas: c, paint }
}

// The lens: a quad over the card's box (grown by the bulge, so the bowed edges show), the
// stand-in as its texture
function lens() {
    const canvas = document.createElement("canvas")
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false })
    if (!gl) return null
    const dpr = Math.min(2, devicePixelRatio || 1)
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    canvas.setAttribute("aria-hidden", "true")
    canvas.style.cssText = `position:fixed;inset:0;z-index:51;pointer-events:none;width:${innerWidth}px;height:${innerHeight}px`
    const shader = (type: number, src: string) => {
        const sh = gl.createShader(type)!
        gl.shaderSource(sh, src)
        gl.compileShader(sh)
        return sh
    }
    const prog = gl.createProgram()!
    gl.attachShader(
        prog,
        shader(
            gl.VERTEX_SHADER,
            `#version 300 es
in vec2 p; uniform vec4 box; uniform vec2 view; uniform float grow; out vec2 q;
void main() {
    q = (p - 0.5) * grow; // card-normalised, -0.5..0.5 on the card itself
    vec2 at = box.xy + box.zw * (0.5 + q);
    gl_Position = vec4(at / view * 2.0 - 1.0, 0.0, 1.0) * vec4(1.0, -1.0, 1.0, 1.0);
}`,
        ),
    )
    gl.attachShader(
        prog,
        shader(
            gl.FRAGMENT_SHADER,
            `#version 300 es
precision mediump float;
in vec2 q; uniform sampler2D tex; uniform float bulge, alpha, blur; out vec4 o;
void main() {
    // A lens: each point shows the card nearer its centre, most at the middle, none past the
    // corners' circle, so the middle swells and the edges bow out
    float r = length(q) / 0.7071;
    vec2 s = q * (1.0 - bulge * max(0.0, 1.0 - r * r)) + 0.5;
    if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0) discard;
    o = texture(tex, s, blur) * alpha;
}`,
        ),
    )
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, "p")
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const u = (n: string) => gl.getUniformLocation(prog, n)
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.uniform2f(u("view"), innerWidth, innerHeight)
    return {
        canvas,
        /** The stand-in (again, once its image has loaded) */
        picture(src: HTMLCanvasElement) {
            gl.bindTexture(gl.TEXTURE_2D, tex)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
            gl.generateMipmap(gl.TEXTURE_2D)
        },
        draw(at: Box, bulge: number, alpha: number, blur: number) {
            gl.viewport(0, 0, canvas.width, canvas.height)
            gl.clearColor(0, 0, 0, 0)
            gl.clear(gl.COLOR_BUFFER_BIT)
            if (alpha <= 0.002) return
            gl.uniform4f(u("box"), at.x, at.y, at.w, at.h)
            gl.uniform1f(u("grow"), 1 + bulge * 0.9)
            gl.uniform1f(u("bulge"), bulge)
            gl.uniform1f(u("alpha"), alpha)
            gl.uniform1f(u("blur"), blur)
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        },
        drop() {
            gl.getExtension("WEBGL_lose_context")?.loseContext()
            canvas.remove()
        },
    }
}

// The card drawn at a box between the poster's and its own: moved and scaled there (its
// layout untouched), as its own GPU layer (a picture moved and blurred, not repainted every
// frame), never quite at opacity 0 (so it is painted, and its images decoded, before it shows)
function placeCard(post: HTMLElement, own: Box, at: Box, shown: number, k: number) {
    post.style.willChange = "transform, opacity, filter"
    post.style.transformOrigin = "0 0"
    post.style.transform = `translate(${at.x - own.x}px, ${at.y - own.y}px) scale(${at.w / own.w}, ${at.h / own.h})`
    post.style.opacity = String(Math.max(0.001, shown))
    const blur = params.blur * (1 - k) ** 2
    post.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : ""
}
const freeCard = (post: HTMLElement) => {
    post.style.transform = post.style.transformOrigin = post.style.opacity = post.style.filter = post.style.willChange = ""
}

// The canvas and its loop: `step(t)` moves the dots (t: ms since the flight began, -1 while
// drifting) and returns false when it is over; `alpha(d, t)` is a dot's opacity
function swarm(dots: Dot[], step: (t: number) => boolean | void, alpha: (d: Dot, t: number) => number) {
    const canvas = document.createElement("canvas")
    canvas.setAttribute("aria-hidden", "true")
    canvas.style.cssText = `position:fixed;inset:0;z-index:51;pointer-events:none;width:${innerWidth}px;height:${innerHeight}px`
    const dpr = Math.min(2, devicePixelRatio || 1)
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    const ctx = canvas.getContext("2d")!
    ctx.scale(dpr, dpr)
    document.body.append(canvas)
    let raf = 0
    let last = performance.now()
    let start = 0
    let gone = false
    const s = {
        go() {
            if (!start) start = performance.now()
        },
        stop() {
            if (gone) return
            gone = true
            cancelAnimationFrame(raf)
            canvas.remove()
        },
    }
    const frame = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now
        const t = start ? now - start : -1
        if (t < 0)
            for (const d of dots) {
                // Drifting apart, slowing down
                d.x += d.vx * dt
                d.y += d.vy * dt
                d.vx *= 0.97
                d.vy *= 0.97
            }
        const more = step(t)
        ctx.clearRect(0, 0, innerWidth, innerHeight)
        for (const d of dots) {
            const a = alpha(d, t)
            if (a <= 0.01) continue
            const e = t < 0 ? 0 : ease(clamp((t - d.wait) / params.flight))
            ctx.globalAlpha = a
            ctx.fillStyle = `rgb(${mix(d.c0[0], d.c1[0], e)},${mix(d.c0[1], d.c1[1], e)},${mix(d.c0[2], d.c1[2], e)})`
            const z = mix(d.s0, d.s1, e)
            ctx.fillRect(d.x - z / 2, d.y - z / 2, z, z)
        }
        if (more === false) return s.stop()
        raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return s
}

// One step along a particle's bowed path, from (ax, ay) to (bx, by)
function along(d: Dot, ax: number, ay: number, bx: number, by: number, e: number) {
    const mx = (ax + bx) / 2 - (by - ay) * d.bend
    const my = (ay + by) / 2 + (bx - ax) * d.bend
    const m = 1 - e
    d.x = m * m * ax + 2 * m * e * mx + e * e * bx
    d.y = m * m * ay + 2 * m * e * my + e * e * by
}

const newDot = (x: number, y: number, c: RGB): Dot => {
    const a = Math.random() * Math.PI * 2
    const v = rand(10, 60)
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, sx: x, sy: y, lx: 0, ly: 0, bend: rand(-0.16, 0.16), wait: Math.random() * params.spread, s0: rand(2, 3.2), s1: rand(1.2, 2.2), c0: c, c1: c, img: false }
}

/** Opening: the poster comes apart and the particles set off at once towards where the card
 *  will be; `land(post)` brings the card in, growing out of the poster. Resolves when done
 *  (the card left as laid out) */
export function begin(from: HTMLElement) {
    const dots = posterSpots(from, count()).map((p) => newDot(p.x, p.y, p.c))
    const poster = boxOf(posterOf(from).getBoundingClientRect())
    from.style.opacity = "0"
    // Where the particles aim (the estimate, or the card itself once it is there and known),
    // and the card, its box, and when it arrived
    let aim: Box | null = null
    let card: HTMLElement | undefined
    let own: Box = poster
    let arrived = 0
    let late = false // the post came after the flight was well under way: it fades in, not pops
    let now = 0 // the flight's time at the last frame
    let shown = 0 // how much of the card shows (0..1): the particles fade as it comes in
    let done: (() => void) | undefined
    let first: Box | null = null // the first image on the card (card px), and where it is now (window px)
    let image: Box | null = null
    // The bulge: the lens and the card's stand-in (none without WebGL2)
    let glass: ReturnType<typeof lens> = null
    let stand: ReturnType<typeof snapshot> | undefined
    const aimAt = (shape: Shape) => {
        aim = shape.box
        first = shape.first
        cardSpots(shape, dots.length).forEach((p, i) => {
            const d = dots[i]
            d.sx = d.x
            d.sy = d.y
            d.lx = p.x
            d.ly = p.y
            d.c1 = p.c
            d.img = p.img
        })
    }
    const s = swarm(
        dots,
        (t) => {
            now = t
            if (t < 0 || !aim) return
            const k = ease(clamp(t / all()))
            // The particles aim at the card a step ahead of it (a sharper ease-out: 45% of the
            // way grown 11% into the time), so they burst out of the poster at once instead of
            // riding the card while it is still poster-sized
            const to = between(poster, aim, 1 - (1 - clamp(t / all())) ** 5)
            for (const d of dots) along(d, d.sx, d.sy, to.x + d.lx * (to.w / aim.w), to.y + d.ly * (to.h / aim.h), ease(clamp((t - d.wait) / params.flight)))
            if (!card) return
            // The card comes in as it grows, and no faster than a quarter second from the moment
            // it is there (if the post was slow, it does not pop in half shown)
            // Only a late post fades in over a quarter second; on time, it follows the growth
            // (this ramp used to apply every time, and kept the card see-through for most of it)
            const ramp = late ? clamp((performance.now() - arrived) / 260) : 1
            shown = Math.min(smooth(0.3, 0.95, k), ramp)
            const at = between(poster, own, k)
            let over = shown >= 1
            if (glass) {
                // Never see-through (Vansh, 2026-11-05: the grid showed through it, and the text
                // doubled): the stand-in, bulging, is opaque early in the growth; the real card comes
                // to full opacity under it, hidden; only then, the bulge relaxed, does the stand-in
                // fade away and uncover it
                const solid = Math.min(smooth(0.02, params.solid, k), ramp)
                const out = smooth(params.handover, Math.min(1, params.handover + 0.15), k)
                placeCard(card, own, at, Math.min(ramp, smooth(params.handover - 0.15, params.handover - 0.02, k)), k)
                const flat = clamp(k / params.relax)
                glass.draw(at, params.bulge * (1 - flat) ** params.curve, solid * (1 - out), Math.max(0, ((3 * params.blur) / 14) * (1 - k) ** 2 - 0.2))
                over = out >= 1 && ramp >= 1
            } else placeCard(card, own, at, shown, k)
            if (first) image = { x: at.x + first.x * (at.w / own.w), y: at.y + first.y * (at.h / own.h), w: first.w * (at.w / own.w), h: first.h * (at.h / own.h) }
            if (over && k >= 1) {
                freeCard(card)
                glass?.drop()
                done?.()
                return false
            }
        },
        // Those bound for the image, and any passing over it, go first, as it comes up (they
        // dissolve into it rather than speckle it); the rest are gone a little before the card
        // is solid
        (d, t) => {
            if (t < 0) return 1
            const over = d.img || (image && d.x >= image.x && d.x <= image.x + image.w && d.y >= image.y && d.y <= image.y + image.h)
            return 1 - (over ? smooth(0.1, 0.45, shown) : smooth(0.3, 0.8, shown))
        },
    )
    const shape = estimate(from)
    if (shape) {
        aimAt(shape)
        s.go()
    }
    return {
        land(post: HTMLElement) {
            card = post
            freeCard(post)
            const real = shapeOf(post)
            own = real.box
            // No estimate (narrow window): aim now, from where they drifted to. With one, keep
            // flying where they are going (the card is laid out by the same rules)
            if (!aim) {
                aimAt(real)
                s.go()
            }
            arrived = performance.now()
            late = now > 120
            // The lens, under the particles, with the card's picture, taken now while the card is
            // laid out untouched (painted again when its first image arrives, if it had not yet)
            glass = lens()
            if (glass) {
                stand = snapshot(post, own)
                glass.picture(stand.canvas)
                const pending = post.querySelector<HTMLImageElement>(".media img")
                if (pending && !pending.complete)
                    pending.addEventListener(
                        "load",
                        () => {
                            if (!glass || !stand) return
                            stand.paint()
                            glass.picture(stand.canvas)
                        },
                        { once: true },
                    )
                const dots = document.querySelector("body > canvas[aria-hidden]")
                document.body.insertBefore(glass.canvas, dots)
            }
            placeCard(post, own, poster, 0, 0)
            return new Promise<void>((res) => (done = res))
        },
        /** The post closed or failed before landing: let go, give the card and poster back */
        stop() {
            s.stop()
            glass?.drop()
            if (card) freeCard(card)
            done?.()
            from.style.opacity = ""
        },
    }
}

/** Closing: the card shrinks and blurs back into the poster while particles of its colours
 *  peel off it and fly home; the poster fades back in as they arrive. Resolves when done */
export function leave(post: HTMLElement, from: HTMLElement) {
    const n = count()
    freeCard(post)
    const shape = shapeOf(post)
    const own = shape.box
    const home = posterSpots(from, n)
    const poster = boxOf(posterOf(from).getBoundingClientRect())
    const dots = cardSpots(shape, n).map((p, i) => {
        const d = newDot(own.x + p.x, own.y + p.y, p.c)
        d.lx = p.x
        d.ly = p.y
        d.sx = home[i].x
        d.sy = home[i].y
        d.c1 = home[i].c
        ;[d.s0, d.s1] = [d.s1, d.s0]
        return d
    })
    from.style.opacity = "0"
    return new Promise<void>((res) => {
        const s = swarm(
            dots,
            (t) => {
                if (t < 0) return
                const k = 1 - ease(clamp(t / all()))
                const at = between(poster, own, k)
                placeCard(post, own, at, smooth(0.3, 0.95, k), k)
                for (const d of dots) along(d, at.x + d.lx * (at.w / own.w), at.y + d.ly * (at.h / own.h), d.sx, d.sy, ease(clamp((t - d.wait) / params.flight)))
                from.style.opacity = String(smooth(0.5, 1, t / all()))
                if (t > all() + 120) {
                    from.style.opacity = ""
                    res()
                    return false
                }
            },
            // In as it sets off (over the card, in its colour), out as it reaches the poster
            (d, t) => clamp((t - d.wait + 120) / 120) * (1 - clamp((t - d.wait - params.flight * 0.75) / 220)),
        )
        s.go()
    })
}

