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
    css?: string // its end colour as a string, made once
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
    // Switching to the previous / next post inside the open card (`swap()`)
    switchTime: 540, // ms: the whole switch, one gesture from the click to the new content settled
    switchTurn: 0.4, // the turn, as a share of it: the old content gone, the new card in, the stir at its widest
    switchScatter: 6, // px: how far the particles stir about their spots at the turn
    switchFlow: 12, // px: how far they flow towards the new content after it
    switchBlur: 5, // px: the content's blur, at its peak at the turn
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
    const bg = el && getComputedStyle(el).backgroundColor
    // A clear background (a <picture>, an image) is not black: the media's own grey then
    const fill = bg && !/^rgba\(.*,\s*0\)$|^transparent$/.test(bg) ? rgb(bg) : token("--gray-100")
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

// A touch screen (an iPad, a phone) gets a lighter morph: its canvases (the particles', the
// lens's and the stand-in picture) at most 1.5 device px per px, at most 1400 particles. A mouse
// keeps 2 and 2400
const coarse = matchMedia("(pointer: coarse)").matches
const ratio = () => Math.min(coarse ? 1.5 : 2, devicePixelRatio || 1)
const count = () => Math.round(Math.min(coarse ? 1400 : 2400, Math.max(900, (innerWidth * innerHeight) / params.density)))
const between = (a: Box, b: Box, k: number): Box => ({ x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), w: mix(a.w, b.w, k), h: mix(a.h, b.h, k) })

// A 1px dashed line as Chrome draws a thin dashed border (3 on, about 2 off, the gap fitted to the
// length), so the stand-in's guides are the page's own (and the real card's, [slug].astro)
function dashed(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const few = Math.floor((len + 2) / 5)
    const lo = (len - few * 3) / Math.max(1, few - 1)
    const hi = (len - (few + 1) * 3) / Math.max(1, few)
    g.save()
    g.lineWidth = 1
    g.setLineDash([3, hi <= 0 || Math.abs(lo - 2) < Math.abs(hi - 2) ? lo : hi])
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.stroke()
    g.restore()
}

// The bulge (opening only; Vansh, 2026-11-05, "you can use shaders or WebGL"): the card is a
// web page, which WebGL cannot draw, so while it bulges a stand-in is drawn instead: a picture
// of the card made once on a 2D canvas (its white, its dashed guides, its first image, its
// title, summary, tags and chips, at their measured places in their own fonts), shown through
// a lens shader (WebGL2) on a quad over the card's box: its middle swollen, its edges bowed
// out, blurred through the texture's mipmaps. As the bulge relaxes, the real card fades in
// over the stand-in and the stand-in out. No WebGL2: the morph without the bulge.

// Text word by word where the page set it (window px), with its font and colour
function wordsIn(els: Iterable<HTMLElement>) {
    const words: { font: string; spacing: string; colour: string; word: string; r: DOMRect }[] = []
    const range = document.createRange()
    for (const el of els) {
        const cs = getComputedStyle(el)
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        const spacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing
        const lower = cs.textTransform === "lowercase"
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.textContent ?? ""
            for (const m of text.matchAll(/\S+/g)) {
                range.setStart(node, m.index!)
                range.setEnd(node, m.index! + m[0].length)
                words.push({ font, spacing, colour: cs.color, word: lower ? m[0].toLowerCase() : m[0], r: range.getBoundingClientRect() })
            }
        }
    }
    return words
}

// The card as a picture (card px, at the window's pixel ratio, at most 2). Everything is
// measured once, here, while the card is laid out untouched; `paint()` draws from those
// measurements (again when the first image arrives, mid-morph, when the card is scaled)
function snapshot(post: HTMLElement, box: Box) {
    const dpr = ratio()
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
    const words = wordsIn(post.querySelectorAll<HTMLElement>("h1, .summary, .tags span, .chip")).map((w) => ({ ...w, r: rel(w.r) }))
    const paint = () => {
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.clearRect(0, 0, box.w, box.h)
        g.fillStyle = paper
        g.fillRect(0, 0, box.w, box.h)
        g.strokeStyle = grey
        g.strokeRect(0.5, 0.5, box.w - 1, box.h - 1)
        // The dashed guides, 40px in
        g.strokeStyle = guide
        for (const y of [FRAME + 0.5, box.h - FRAME - 0.5]) dashed(g, 0, y, box.w, y)
        for (const x of [FRAME + 0.5, box.w - FRAME + 0.5]) dashed(g, x, 0, x, box.h)
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
function buildLens() {
    const canvas = document.createElement("canvas")
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false })
    if (!gl) return null
    const dpr = ratio()
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
        /** The window may have changed size since it was built ahead */
        fit() {
            const dpr = ratio()
            const w = Math.round(innerWidth * dpr)
            const h = Math.round(innerHeight * dpr)
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w
                canvas.height = h
            }
            canvas.style.width = `${innerWidth}px`
            canvas.style.height = `${innerHeight}px`
            gl.useProgram(prog)
            gl.uniform2f(u("view"), innerWidth, innerHeight)
        },
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
            prewarm()
        },
    }
}

// The first opening used to stall for a good while: a full-window WebGL2 context, two shaders
// compiled and linked (asking for the link status waits for the driver) and the first draw, all in
// the frames of the morph. So one lens is built and drawn once ahead, in an idle moment, and the
// opening takes it (a new one is built after the morph, for the next)
let spare: ReturnType<typeof buildLens> | undefined
let warming = 0
export function prewarm() {
    if (spare || warming) return
    const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200))
    warming = 1
    idle(
        () => {
            warming = 0
            if (spare || document.querySelector("body > .overlay")) return
            const l = buildLens()
            if (!l) return
            // A first draw, so the driver compiles for real
            const c = document.createElement("canvas")
            c.width = c.height = 2
            l.picture(c)
            l.draw({ x: 0, y: 0, w: 2, h: 2 }, 0, 0.01, 0)
            spare = l
        },
        { timeout: 2000 },
    )
}
function lens() {
    const l = spare ?? buildLens()
    spare = undefined
    l?.fit()
    return l
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
    const dpr = ratio()
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
            // A string made for every particle every frame is garbage for the collector (up to 2400
            // a frame): the end colour, where most sit for the second half, is made once
            if (e >= 1) ctx.fillStyle = d.css ??= `rgb(${d.c1[0]},${d.c1[1]},${d.c1[2]})`
            else ctx.fillStyle = `rgb(${mix(d.c0[0], d.c1[0], e) | 0},${mix(d.c0[1], d.c1[1], e) | 0},${mix(d.c0[2], d.c1[2], e) | 0})`
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
    let cover = 0 // how opaque the card's picture (the stand-in, or the card) is over the first image
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
                cover = Math.max(solid, Math.min(ramp, smooth(params.handover - 0.15, params.handover - 0.02, k)))
                const out = smooth(params.handover, Math.min(1, params.handover + 0.15), k)
                placeCard(card, own, at, Math.min(ramp, smooth(params.handover - 0.15, params.handover - 0.02, k)), k)
                const flat = clamp(k / params.relax)
                glass.draw(at, params.bulge * (1 - flat) ** params.curve, solid * (1 - out), Math.max(0, ((3 * params.blur) / 14) * (1 - k) ** 2 - 0.2))
                over = out >= 1 && ramp >= 1
            } else {
                cover = shown
                placeCard(card, own, at, shown, k)
            }
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
            const over = d.img || (image && d.x >= image.x - 2 && d.x <= image.x + image.w + 2 && d.y >= image.y - 2 && d.y <= image.y + image.h + 2)
            // Over the picture, none once it is solid enough to read as the card (a post that came
            // late used to show particles on it while it ramped in), and they go faster before that
            if (over && cover > 0.5) return 0
            return 1 - (over ? smooth(0.0, 0.3, Math.max(shown, cover)) : smooth(0.3, 0.8, shown))
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

// Previous / next inside the open card (Vansh, 2026-11-07: first "just scramble small particles
// and switch posts. i don't want too much moving switch", then "more smooth and morphed. but
// not slow"). The card's shell (its white, edge, guides, corners and the previous / next chips)
// stays still: it reads as the same card changing what it shows. Nothing flies, slides or
// scales. The old content (title, summary, tags, the other chips, the media column) dissolves
// under a soft blur into small particles of its own colours, which stir a few px about their
// spots; as soon as the new card is there (at once, when it was prefetched) the particles morph
// into it: they turn the new content's colours and flow a little (small, local, eased) towards
// it, the media's onto the new picture's strong parts, the old words' onto the nearest new
// words, while new words' particles come up where those are; the new content comes up out of
// the same blur under them, which relaxes as they fade. One continuous dissolve, not out,
// swap, in. The real old and new content never show together (the new starts the moment the
// old is gone), and the particles fade where the new media is first, so none speckle it once
// it is solid. Every ramp is a smoothstep or the site's FLOW. A 2D canvas only: no WebGL.

// A CSS cubic-bezier as a function of time (by bisection: a few calls a frame)
function bezier(x1: number, y1: number, x2: number, y2: number) {
    const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3
    return (t: number) => {
        if (t <= 0 || t >= 1) return clamp(t)
        let lo = 0
        let hi = 1
        for (let i = 0; i < 18; i++) {
            const s = (lo + hi) / 2
            if (at(x1, x2, s) < t) lo = s
            else hi = s
        }
        return at(y1, y2, (lo + hi) / 2)
    }
}
const FLOW = bezier(0.16, 1, 0.3, 1) // the site's ease: quick to start, a long soft settle

type Mote = Dot & {
    kind: 0 | 1 | 2 // 0 on the media (old colours, then new), 1 the old words, 2 the new words
    ox: number // where the stir takes it (px off its spot), and its wobble's phase
    oy: number
    ph: number
    dx: number // how far it flows towards the new content (px)
    dy: number
    cg: RGB // its colour before the morph, and after
    cr: RGB
    gone: number // how far it has faded under the new content (only grows)
    a: number // its opacity this frame
}
type TextBit = { r: Box; c: RGB; weight: number }
type Area = { r: Box; at: (u: number, v: number) => RGB }

function cut(a: Box, b: Box): Box | null {
    const x = Math.max(a.x, b.x)
    const y = Math.max(a.y, b.y)
    const w = Math.min(a.x + a.w, b.x + b.w) - x
    const h = Math.min(a.y + a.h, b.y + b.h) - y
    return w > 1 && h > 1 ? { x, y, w, h } : null
}
const inside = (b: Box | null, x: number, y: number) => !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

// The parts of a card that change (the previous / next chips are shell: they stay)
// What fades and blurs: the title block, the media and the chips. On a phone the title block has no
// box of its own (display: contents, so its lines can share a grid with the chips), and opacity and
// blur do nothing to a boxless element: its lines are faded instead
const partsOf = (post: HTMLElement) => {
    const out: HTMLElement[] = []
    for (const t of post.querySelectorAll<HTMLElement>(".title")) {
        if (getComputedStyle(t).display === "contents") out.push(...(t.children as HTMLCollectionOf<HTMLElement>))
        else out.push(t)
    }
    out.push(...post.querySelectorAll<HTMLElement>(".media, .links .chip:not(.step), .mini"))
    return out
}
const freeParts = (els: HTMLElement[]) => {
    for (const el of els) el.style.opacity = el.style.filter = el.style.willChange = ""
}
function styleParts(els: HTMLElement[], opacity: number, blur: number) {
    for (const el of els) {
        el.style.willChange = "opacity, filter"
        el.style.opacity = String(Math.max(0.001, opacity))
        el.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : ""
    }
}

// What shows of a card's content (window px): its media column between the guides, the blocks
// in it, and its text (words in their colour, the chips in their fill)
function contentOf(post: HTMLElement) {
    const box = boxOf(post.getBoundingClientRect())
    const view = cut(box, { x: 0, y: 0, w: innerWidth, h: innerHeight }) ?? box
    // The media scrolls under the bands (a desktop, and a phone, where the whole card scrolls inside its
    // frame): what counts is what shows between the guides. Between 600 and 899px the whole card
    // scrolls in the window instead: then it is all of the window's part of it
    const fr = parseFloat(getComputedStyle(post).getPropertyValue("--frame")) || FRAME
    const whole = false // (nothing under 900px scrolls as a whole card any more: the phone's fixed frame)
    const frame = whole ? view : (cut(view, { x: box.x, y: box.y + fr, w: box.w, h: box.h - 2 * fr }) ?? view)
    const media = post.querySelector<HTMLElement>(".media")
    const area = media ? cut(boxOf(media.getBoundingClientRect()), frame) : null
    const blocks =
        area && media
            ? [...media.children].flatMap((el) => {
                  const r = boxOf(el.getBoundingClientRect())
                  return cut(r, area) ? [{ el, r }] : []
              })
            : []
    const seen = new Map<string, RGB>()
    const colour = (css: string) => seen.get(css) ?? (seen.set(css, rgb(css)), seen.get(css)!)
    // The chips' fills count less than the words' ink (they are mostly flat)
    const chips: TextBit[] = [...post.querySelectorAll<HTMLElement>(".links .chip:not(.step)")].map((el) => {
        const r = boxOf(el.getBoundingClientRect())
        return { r, c: colour(getComputedStyle(el).backgroundColor), weight: r.w * r.h * 0.3 }
    })
    const words: TextBit[] = wordsIn(post.querySelectorAll<HTMLElement>(".title h1, .title .summary, .title .tags span, .links .chip:not(.step)")).map((w) => ({
        r: boxOf(w.r),
        c: colour(w.colour),
        weight: w.r.width * w.r.height,
    }))
    const texts = [...chips, ...words].filter((b) => b.r.w > 0 && cut(b.r, view))
    return { area, blocks, texts }
}

// Spots on text (window px), picked by ink
function textSpots(texts: TextBit[], n: number) {
    const total = texts.reduce((s, b) => s + b.weight, 0)
    if (!texts.length || !total) return []
    return Array.from({ length: n }, () => {
        let k = Math.random() * total
        const b = texts.find((it) => (k -= it.weight) <= 0) ?? texts[texts.length - 1]
        return { x: b.r.x + Math.random() * b.r.w, y: b.r.y + Math.random() * b.r.h, c: b.c }
    })
}
// Its picture is there to take colours from (or it has none: a fill)
const ready = (el: Element) => {
    const img = el instanceof HTMLImageElement ? el : el.querySelector("img")
    return !img || (img.complete && img.naturalWidth > 0)
}
// The colour at a point of a media column, from its blocks (the paper between them)
const mediaAt = (blocks: Area[], paper: RGB) => (x: number, y: number) => {
    const b = blocks.find((b) => inside(b.r, x, y))
    return b ? b.at((x - b.r.x) / b.r.w, (y - b.r.y) / b.r.h) : paper
}

/** Previous / next: the open card's content dissolves into small particles in place and they
 *  morph into the next post's, as one gesture over `switchTime`. Everything heavy (the page
 *  fetched and parsed, the new card built) is done before this is called; at the turn the loop
 *  calls `turn()` in its own frame, which puts the new card in the layer (hidden) and returns
 *  its post, and the particles carry on into it without a pause. `finished` resolves when the
 *  new content has settled; `stop()` lets go of it all and gives the content its look back */
export function swap(post: HTMLElement, poster: HTMLElement | null | undefined, turn: () => HTMLElement | null | undefined) {
    const T = params.switchTime
    const at0 = params.switchTurn * T // the turn: the old content gone, the stir at its widest
    const rest = T - at0
    const old = contentOf(post)
    const n = count()
    const nm = Math.round(n * (old.area ? (old.texts.length ? 0.75 : 1) : 0))
    const bg = getComputedStyle(post).backgroundColor
    const paper = bg === "rgba(0, 0, 0, 0)" ? token("--white") : rgb(bg)
    const mote = (x: number, y: number, c: RGB, kind: 0 | 1 | 2): Mote => {
        const d = newDot(x, y, c)
        // Small, like the site's other particles
        d.s0 = d.s1 = rand(1.4, 2.4)
        const a = Math.random() * Math.PI * 2
        const r = params.switchScatter * Math.sqrt(Math.random())
        return { ...d, kind, ox: Math.cos(a) * r, oy: Math.sin(a) * r, ph: Math.random() * Math.PI * 2, dx: 0, dy: 0, cg: c, cr: c, gone: 0, a: 0 }
    }

    // The media: spots over the column as it shows, in the old picture's colours
    const oldAt = mediaAt(old.blocks.map((b) => ({ r: b.r, at: colours(b.el) })), paper)
    const posterAt = poster && ready(posterOf(poster)) ? colours(posterOf(poster)) : null
    const area = old.area
    const dots: Mote[] = []
    if (area)
        for (let i = 0; i < nm; i++) {
            const x = area.x + Math.random() * area.w
            const y = area.y + Math.random() * area.h
            const d = mote(x, y, oldAt(x, y), 0)
            d.c0 = d.c1 = [...d.cg] as RGB
            d.img = true
            dots.push(d)
        }
    const words = n - dots.length
    for (const p of textSpots(old.texts, words)) {
        const d = mote(p.x, p.y, p.c, 1)
        d.c0 = d.c1 = [...d.cg] as RGB
        dots.push(d)
    }

    // At the turn: the new card's content, hidden, and where the particles go in it
    const into = (next: HTMLElement) => {
        const real = contentOf(next)
        styleParts(partsOf(next), 0, params.switchBlur)
        // The new media's colours (its picture's own if it is there already, else, for the
        // first block, the poster's: the same picture; it is never waited for). Each media
        // particle flows a little, at most `switchFlow` px, to the most marked of a few nearby
        // points of it (away from their average tone): the dots gather on its strong parts
        const at = mediaAt(
            real.blocks.map((b, i) => ({ r: b.r, at: i === 0 && posterAt && !ready(b.el) ? posterAt : colours(b.el) })),
            paper,
        )
        const R = params.switchFlow
        for (const d of dots) {
            if (d.kind !== 0) continue
            const near = [[0, 0], ...Array.from({ length: 4 }, () => [rand(-R, R), rand(-R, R)])]
            const cs = near.map(([x, y]) => at(d.sx + x, d.sy + y))
            const mean = cs.reduce((s, c) => s + lum(c), 0) / cs.length
            let best = 0
            for (let i = 1; i < cs.length; i++) if (Math.abs(lum(cs[i]) - mean) > Math.abs(lum(cs[best]) - mean) + 6) best = i
            d.dx = near[best][0]
            d.dy = near[best][1]
            d.cr = cs[best]
        }
        // The old words' particles flow onto the nearest of a few new word spots (if one is
        // near enough, else they stay and fade); the new words' come up where those are
        const spots = textSpots(real.texts, words)
        if (spots.length)
            for (const d of dots) {
                if (d.kind !== 1) continue
                let best = spots[(Math.random() * spots.length) | 0]
                for (let i = 0; i < 5; i++) {
                    const p = spots[(Math.random() * spots.length) | 0]
                    if (Math.hypot(p.x - d.sx, p.y - d.sy) < Math.hypot(best.x - d.sx, best.y - d.sy)) best = p
                }
                if (Math.hypot(best.x - d.sx, best.y - d.sy) > R * 4) continue
                d.dx = best.x - d.sx
                d.dy = best.y - d.sy
                d.cr = best.c
            }
        for (const p of spots.slice(0, Math.round(words * 0.6))) {
            const d = mote(p.x, p.y, p.c, 2)
            d.c0 = d.c1 = d.cg
            dots.push(d)
        }
        return partsOf(next)
    }

    let olds = partsOf(post)
    let news: HTMLElement[] = []
    let turned = false
    let gone = false
    let done: () => void = () => {}
    const finished = new Promise<void>((res) => (done = res))
    // One gesture: the stir swells out of the click and back into the new content as a single
    // bump (sin², warped so it peaks at the turn): moving all the time, slowing only for the
    // instant it turns round, still only at the very start and end
    const bump = (t: number) => {
        const w = t < at0 ? (0.5 * t) / at0 : 0.5 + (0.5 * (t - at0)) / rest
        return Math.sin(Math.PI * clamp(w)) ** 2
    }
    const s = swarm(
        dots,
        (t) => {
            if (t < 0) return
            // The turn, in this frame: the new card goes in, and the particles carry on into it
            if (!turned && t >= at0) {
                turned = true
                freeParts(olds)
                olds = []
                const next = turn()
                if (gone) return false
                if (next) news = into(next)
            }
            // The old content dissolves under a blur that peaks at the turn
            const ko = smooth(0, at0, t)
            if (olds.length) styleParts(olds, 1 - ko, params.switchBlur * ko)
            // The new content comes up out of the same blur right after it, settling softly
            const k = turned ? clamp((t - at0) / rest) : 0
            const shown = turned ? smooth(0, 0.6, k) : 0
            if (news.length) styleParts(news, shown, params.switchBlur * (1 - FLOW(k)))
            // The morph: colours and the small flow towards the new content, from the turn
            const m = turned ? smooth(0, 0.7, k) : 0
            const spread = bump(t)
            const appear = smooth(0, at0 * 0.6, t)
            for (const d of dots) {
                const w = t / 110 + d.ph
                d.x = d.sx + d.dx * m + spread * (d.ox + Math.sin(w) * 1.2)
                d.y = d.sy + d.dy * m + spread * (d.oy + Math.cos(w * 1.3) * 1.2)
                let a = appear
                if (d.kind === 2) a = smooth(0, 0.4, k)
                else if (m > 0) for (let i = 0; i < 3; i++) d.c0[i] = mix(d.cg[i], d.cr[i], m)
                if (shown > 0) d.gone = Math.max(d.gone, d.img || inside(area, d.x, d.y) ? smooth(0.15, 0.55, shown) : smooth(0.35, 0.9, shown))
                d.a = a * (1 - d.gone)
            }
            if (k >= 1) {
                freeParts(news)
                news = []
                done()
                return false
            }
        },
        (d) => (d as Mote).a,
    )
    s.go()
    return {
        finished,
        stop() {
            if (gone) return
            gone = true
            s.stop()
            freeParts(olds)
            freeParts(news)
            olds = []
            news = []
            done()
        },
    }
}
