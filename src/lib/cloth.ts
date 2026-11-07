// The page is a cloth, with the dark mode cord sewn to its top edge (theme.ts, cord.ts). A web page
// can't be a WebGL texture, so what is on screen is painted onto a canvas from its measurements, in
// the old colours, and that picture is the cloth: fixed over the window, at first exactly where the
// page was, with the page already dark behind it.
// A slight pull peeks: it comes off its nails around the cord, what's left over drops into a fold, the
// dark page shows above it; let go and it is smoothed flat and the page comes back. A proper pull lets it go, from
// wherever the peek has got to: it comes off from the cord outward, falls, buckles into folds and
// piles up on the bottom edge of the window; then the floor opens and the pile drops out, the cord
// with it. Swapping the page for the cloth and back always happens within one task, so nothing can
// flash: drawn, then flipped.
//
// The simulation is a Verlet grid on the CPU, in many small steps so that it behaves like cloth and
// not like rubber: it can fold, but hardly stretch or squash (a few thousand nodes); the
// surface is a B-spline through those nodes in the vertex shader, so the folds are smooth and the
// flat sheet maps 1:1 onto the window. Lazy chunk (theme.ts), never under reduced motion. Settings
// are in `params`, tuned from the dev-only Cloth panel (cloth-tune.ts); they apply from the next fall.
export const params = {
    speed: 1, // slow motion: 1 normal, 0 stopped at the first frame
    nodes: 4800, // how many points the sheet has, on a large window
    fall: 1, // s: how long the top edge would take to reach the floor in free fall
    air: 1.5, // how much the air slows it (per second)
    release: 320, // ms: the page lets go over this long, spreading from the cord
    billow: 180, // px/s: how hard it comes away from the wall, which starts the folds
    folds: 3, // about how many folds down the window
    iterations: 8, // steps a 60th of a second: more stretches less, and costs more
    shear: 0.4, // how much it resists skewing
    bend: 0.4, // how much it resists folding: higher makes wider folds
    thick: 0.6, // how thick the cloth piles up (share of the space between its points)
    depth: 0.12, // how deep the pile can be, front to back (share of the window's height)
    friction: 0.35, // how much the pile grips itself and the floor
    gather: 6, // how much the pile draws in from the sides
    rest: 0, // ms: time to settle after the top lands
    hold: 0, // ms: the pile stays this long, then drops out of the window
    camera: 2, // how far away the eye is (window heights): lower exaggerates the depth
    // The light
    azimuth: -30, // deg: where it comes from: 0 above, -90 from the left, 90 from the right
    elevation: 70, // deg: how high: 90 straight on (flat, few shadows), low rakes across the folds
    key: 0.72, // how strong it is
    fill: 0.5, // the light from everywhere else, which keeps the shadows from going black
    bounce: 0.75, // how much of that reaches what faces down
    shadow: 0.85, // how much a fold's shadow takes from what lies behind it
    soft: 20, // px: how soft the shadows are
    cast: 0.55, // how dark its shadow on the page behind
    sheen: 0.18, // the soft light on what turns away, as cloth has
    headroom: 0.95, // what moves dims this far, so that what faces the light has somewhere to go
    through: 0.22, // how much of the print shows through on the back of the cloth
    // The peek, before it falls
    widen: 5, // how far from the cord it comes away from the wall, for how far it is pulled
    lean: 0.25, // how far the pulled point comes forward, for how far down
    pleats: 13, // how many folds fan out from the cord
    peel: 300, // how readily they start
    follow: 14, // how quickly the pulled point follows the cord
}

const HOME = 0.3 // s: after letting go, it is smoothed back flat over this long
const SUB = 3 // the surface has this many quads per quad of the sheet
const LIMIT = 6 // s: gone by now, whatever happens
const FAR = 400 // px: elements further off screen than this are not looked at
const MAX_PIXELS = 15e6 // in the picture of the page: a 5K screen at its full sharpness
const FRESH = 5000 // ms: a picture of the page older than this is painted again
const CORD_X = 13.4 // px: where the Figma cord crosses the top of the window, in its own drawing

type G = CanvasRenderingContext2D & { letterSpacing?: string; fontKerning?: string }

// --- The picture of the page ---------------------------------------------------------------

const SKIP = ".cord, .cloth, .splash, .tune-dock, .tune, .scrub, .scrub-open, .overlay, script, style, link, template, noscript, astro-dev-toolbar"
const icons = new Map<string, HTMLImageElement>()
const scratch = document.createElement("canvas")

const clear = (c: string) => !c || c === "transparent" || c === "rgba(0, 0, 0, 0)"

// Boxes sit on whole device pixels in the page, however they are laid out
function snapped(r: DOMRect, scale: number) {
    const x = Math.round(r.left * scale) / scale
    const y = Math.round(r.top * scale) / scale
    return new DOMRect(x, y, Math.round(r.right * scale) / scale - x, Math.round(r.bottom * scale) / scale - y)
}

function iconFor(cs: CSSStyleDeclaration) {
    const mask = cs.getPropertyValue("mask-image") || cs.getPropertyValue("-webkit-mask-image")
    const url = /url\("?(.+?)"?\)/.exec(mask)?.[1]
    if (!url) return
    let img = icons.get(url)
    if (!img) {
        img = new Image()
        img.src = url
        icons.set(url, img)
    }
    return img
}

// The masks have to be loaded before the click, since the painting cannot wait for them
function preload() {
    for (const el of document.querySelectorAll(".cross, .icon")) iconFor(getComputedStyle(el))
}

// Chrome's own dashes for a thin border: 3 on, about 2 off, the gap fitted to the length
function dashLine(g: G, x0: number, y0: number, x1: number, y1: number, colour: string) {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const few = Math.floor((len + 2) / 5)
    const lo = (len - few * 3) / Math.max(1, few - 1)
    const hi = (len - (few + 1) * 3) / Math.max(1, few)
    g.save()
    g.strokeStyle = colour
    g.lineWidth = 1
    g.setLineDash([3, hi <= 0 || Math.abs(lo - 2) < Math.abs(hi - 2) ? lo : hi])
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.stroke()
    g.restore()
}

function borders(g: G, r: DOMRect, cs: CSSStyleDeclaration) {
    const sides = [
        ["Top", r.left, r.top + 0.5, r.right, r.top + 0.5],
        ["Bottom", r.left, r.bottom - 0.5, r.right, r.bottom - 0.5],
        ["Left", r.left + 0.5, r.top, r.left + 0.5, r.bottom],
        ["Right", r.right - 0.5, r.top, r.right - 0.5, r.bottom],
    ] as const
    for (const [side, x0, y0, x1, y1] of sides) {
        const w = parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`))
        const style = cs.getPropertyValue(`border-${side.toLowerCase()}-style`)
        const colour = cs.getPropertyValue(`border-${side.toLowerCase()}-color`)
        if (!(w > 0) || style === "none" || clear(colour)) continue
        if (style === "dashed") dashLine(g, x0, y0, x1, y1, colour)
        else {
            g.fillStyle = colour
            if (y0 === y1) g.fillRect(x0, y0 - w / 2, x1 - x0, w)
            else g.fillRect(x0 - w / 2, y0, w, y1 - y0)
        }
    }
}

// The post card's guides are the 1px dashed borders of its ::before and ::after (see [slug].astro),
// 40px in; the right one one pixel further out. Drawn with the same dashes as any other border
function guides(g: G, r: DOMRect, cs: CSSStyleDeclaration) {
    const inset = parseFloat(cs.getPropertyValue("--frame")) || 40
    const colour = getComputedStyle(document.documentElement).getPropertyValue("--line").trim()
    const x = r.left + 1
    const y = r.top + 1
    const w = r.width - 2
    const h = r.height - 2
    for (const at of [inset, h - inset]) dashLine(g, x, y + at + 0.5, x + w, y + at + 0.5, colour)
    for (const at of [inset, w - inset + 1]) dashLine(g, x + at + 0.5, y, x + at + 0.5, y + h, colour)
}

function image(g: G, img: HTMLImageElement, r: DOMRect, fit: string) {
    if (!img.complete || !img.naturalWidth) return
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    const k = fit === "cover" ? Math.max(r.width / nw, r.height / nh) : fit === "contain" ? Math.min(r.width / nw, r.height / nh) : 0
    g.save()
    g.beginPath()
    g.rect(r.left, r.top, r.width, r.height)
    g.clip()
    if (k) g.drawImage(img, r.left + (r.width - nw * k) / 2, r.top + (r.height - nh * k) / 2, nw * k, nh * k)
    else g.drawImage(img, r.left, r.top, r.width, r.height)
    g.restore()
}

// A one-colour icon: the mask's shape in the element's background colour
function tinted(g: G, img: HTMLImageElement, r: DOMRect, colour: string, scale: number) {
    if (!img.complete || !img.naturalWidth) return
    const w = Math.max(1, Math.ceil(r.width * scale))
    const h = Math.max(1, Math.ceil(r.height * scale))
    scratch.width = w
    scratch.height = h
    const s = scratch.getContext("2d")!
    s.drawImage(img, 0, 0, w, h)
    s.globalCompositeOperation = "source-in"
    s.fillStyle = colour
    s.fillRect(0, 0, w, h)
    g.drawImage(scratch, r.left, r.top, r.width, r.height)
}

// Inline SVG (the logo, the mail icon): its paths, synchronously
function vector(g: G, el: SVGSVGElement, r: DOMRect) {
    const box = el.viewBox.baseVal
    const k = box?.width ? Math.min(r.width / box.width, r.height / box.height) : 1
    g.save()
    g.translate(r.left + (r.width - (box?.width || r.width) * k) / 2, r.top + (r.height - (box?.height || r.height) * k) / 2)
    g.scale(k, k)
    if (box?.width) g.translate(-box.x, -box.y)
    for (const path of el.querySelectorAll("path")) {
        const cs = getComputedStyle(path)
        if (cs.visibility === "hidden") continue
        const shape = new Path2D(path.getAttribute("d") ?? "")
        if (cs.fill !== "none") {
            g.fillStyle = cs.fill
            g.fill(shape, cs.fillRule === "evenodd" ? "evenodd" : "nonzero")
        }
        if (cs.stroke !== "none") {
            g.strokeStyle = cs.stroke
            g.lineWidth = parseFloat(cs.strokeWidth) || 1
            g.stroke(shape)
        }
    }
    g.restore()
}

// Word by word where the page set them, in their own font, as converge.ts does
function words(g: G, node: Text, cs: CSSStyleDeclaration, W: number, H: number, scale: number) {
    const text = node.data
    if (!/\S/.test(text)) return
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    g.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing
    g.fontKerning = "normal"
    g.fillStyle = cs.color
    g.textBaseline = "alphabetic"
    const m = g.measureText("x")
    const range = document.createRange()
    for (const match of text.matchAll(/\S+/g)) {
        range.setStart(node, match.index!)
        range.setEnd(node, match.index! + match[0].length)
        const r = range.getBoundingClientRect()
        if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue
        const word = cs.textTransform === "uppercase" ? match[0].toUpperCase() : cs.textTransform === "lowercase" ? match[0].toLowerCase() : match[0]
        // Baselines sit on whole device pixels too: the page rounds the font's ascent in those
        g.fillText(word, r.left, (Math.round(r.top * scale) + Math.round(m.fontBoundingBoxAscent * scale)) / scale)
    }
}

function walk(g: G, el: Element, alpha: number, W: number, H: number, scale: number) {
    if (el.matches(SKIP)) return
    const cs = getComputedStyle(el)
    if (cs.display === "none" || cs.visibility === "hidden" || cs.clipPath !== "none") return
    const a = alpha * parseFloat(cs.opacity)
    if (a < 0.004) return
    const raw = el.getBoundingClientRect()
    if (cs.display !== "inline" && raw.width + raw.height > 0 && (raw.bottom < -FAR || raw.top > H + FAR || raw.right < -FAR || raw.left > W + FAR)) return
    const r = snapped(raw, scale)

    g.globalAlpha = a
    if (el instanceof SVGSVGElement) return vector(g, el, r)
    if (el instanceof SVGElement) return
    const icon = iconFor(cs)
    if (icon) tinted(g, icon, r, cs.backgroundColor, scale)
    else if (!clear(cs.backgroundColor)) {
        const shadow = /^(.+\)) (-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px/.exec(cs.boxShadow)
        if (shadow) {
            // Canvas shadows ignore the canvas's own scale
            g.shadowColor = shadow[1]
            g.shadowOffsetX = +shadow[2] * scale
            g.shadowOffsetY = +shadow[3] * scale
            g.shadowBlur = +shadow[4] * scale
        }
        g.fillStyle = cs.backgroundColor
        const round = parseFloat(cs.borderTopLeftRadius)
        if (round > 0) {
            g.beginPath()
            g.roundRect(r.left, r.top, r.width, r.height, round)
            g.fill()
        } else g.fillRect(r.left, r.top, r.width, r.height)
        g.shadowColor = "transparent"
    }
    if (el.classList.contains("post")) guides(g, r, cs)
    borders(g, r, cs)
    if (el instanceof HTMLImageElement) return image(g, el, r, cs.objectFit)
    if (el instanceof HTMLCanvasElement) {
        // A 2D canvas (the intro's particles, Game of Life). WebGL ones read back blank, so those
        // stay out and the stage's poster, which is under them, shows
        if (el.width && el.height && el.getContext("2d")) g.drawImage(el, r.left, r.top, r.width, r.height)
        return
    }

    const clip = cs.overflowX !== "visible" || cs.overflowY !== "visible"
    if (clip) {
        g.save()
        g.beginPath()
        g.rect(r.left, r.top, r.width, r.height)
        g.clip()
    }
    // In the page's order, except what is raised with a z-index, which comes after
    const raised: [number, Element][] = []
    for (const node of el.childNodes) {
        if (node instanceof Text) {
            g.globalAlpha = a
            words(g, node, cs, W, H, scale)
        } else if (node instanceof Element) {
            const z = parseInt(getComputedStyle(node).zIndex)
            if (z > 0) raised.push([z, node])
            else walk(g, node, a, W, H, scale)
        }
    }
    for (const [, node] of raised.sort((p, q) => p[0] - q[0])) walk(g, node, a, W, H, scale)
    if (clip) g.restore()
}

function picture(W: number, H: number, width: number, height: number) {
    const c = document.createElement("canvas")
    c.width = width
    c.height = height
    // Opaque, so the text gets the same antialiasing as the page's
    const g = c.getContext("2d", { alpha: false }) as G
    g.imageSmoothingQuality = "high"
    const scale = width / W
    g.scale(scale, height / H)
    const body = document.body
    g.fillStyle = getComputedStyle(body).backgroundColor
    g.fillRect(0, 0, W, H)
    // The two vertical guide lines (global.css), which are the body's own pseudo-elements
    for (const side of ["::before", "::after"]) {
        const cs = getComputedStyle(body, side)
        if (cs.content === "none" || cs.display === "none") continue
        const top = -scrollY
        const x = body.getBoundingClientRect().left + parseFloat(cs.left) + 0.5
        dashLine(g, x, top, x, top + body.offsetHeight, cs.borderLeftColor)
    }
    for (const el of body.children) walk(g, el, 1, W, H, scale)
    return c
}

// --- WebGL ----------------------------------------------------------------------------------

// The sheet's surface, shared by what draws it for the eye and for the light
const SURFACE = `
uniform sampler2D sheet;
uniform ivec2 last;
// A node of the sheet; past its edges, carried on in a straight line, so the flat sheet stays
// exactly flat and exactly as wide as the window
vec3 node(ivec2 q) {
    ivec2 c = clamp(q, ivec2(0), last);
    vec3 p = texelFetch(sheet, c, 0).xyz;
    if (q != c) p = 2.0 * p - texelFetch(sheet, clamp(2 * c - q, ivec2(0), last), 0).xyz;
    return p;
}
vec4 spline(float t) {
    float s = 1.0 - t;
    return vec4(s * s * s, 3.0 * t * t * t - 6.0 * t * t + 4.0, -3.0 * t * t * t + 3.0 * t * t + 3.0 * t + 1.0, t * t * t) / 6.0;
}
vec4 slope(float t) {
    float s = 1.0 - t;
    return vec4(-s * s, 3.0 * t * t - 4.0 * t, -3.0 * t * t + 2.0 * t + 1.0, t * t) / 2.0;
}`

// Where a point falls on the wall, seen from the light, and how far it stands off it: a shadow map
// flattened onto the window. The flat sheet is all one height, so it can't shadow itself
const FROM_LIGHT = `
uniform vec2 view, margin, shear;
uniform float reach;
const float BASE = 0.1; // the height of the wall itself; 0 is nothing there at all
vec2 onWall(vec3 p) {
    return (p.xy - shear * p.z + margin) / (view + 2.0 * margin);
}
float height(float z) {
    return BASE + (1.0 - BASE) * clamp(z / reach, 0.0, 1.0);
}`

const VERTEX = `#version 300 es
precision highp float;
precision highp sampler2D;
layout(location = 0) in vec2 at;
uniform vec2 cellSize, view;
uniform float eye;
out vec2 uv;
out vec3 normal;
out vec3 world;
out float moved;
${SURFACE}
void main() {
    ivec2 i = ivec2(floor(at));
    vec2 t = at - vec2(i);
    vec4 bx = spline(t.x), by = spline(t.y), dx = slope(t.x), dy = slope(t.y);
    vec3 p = vec3(0.0), u = vec3(0.0), v = vec3(0.0);
    for (int y = 0; y < 4; y++) {
        for (int x = 0; x < 4; x++) {
            vec3 q = node(i + ivec2(x - 1, y - 1));
            p += q * bx[x] * by[y];
            u += q * dx[x] * by[y];
            v += q * bx[x] * dy[y];
        }
    }
    uv = at / vec2(last);
    normal = cross(u, v);
    world = p;
    moved = smoothstep(0.0, 40.0, length(p - vec3(at * cellSize, 0.0)));
    // As CSS perspective does it: the plane z = 0 is the window, 1:1
    float w = 1.0 - p.z / eye;
    vec2 ndc = (p.xy - view * 0.5) / (view * 0.5);
    gl_Position = vec4(ndc.x, -ndc.y, -p.z / eye * w, w);
}`

const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 uv;
in vec3 normal;
in vec3 world;
in float moved;
uniform sampler2D page, map;
uniform vec3 light, back, sun;
uniform float key, fill, bounce, shadow, sheen, headroom, through, bias;
out vec4 colour;
${FROM_LIGHT}
// How much of the light gets here: the moments of the heights the light sees, blurred, which
// is what makes the shadows soft (variance shadow mapping)
float lit() {
    vec2 m = texture(map, onWall(world)).rg;
    float t = height(world.z) + bias;
    if (t >= m.x) return 1.0;
    float spread = max(m.y - m.x * m.x, 0.00002);
    float d = m.x - t;
    return smoothstep(0.12, 1.0, spread / (spread + d * d));
}
float around(vec3 n) {
    return fill * mix(bounce, 1.0, 0.5 - 0.5 * n.y);
}
void main() {
    vec3 n = normalize(normal);
    if (!gl_FrontFacing) n = -n;
    vec3 c = texture(page, uv).rgb;
    if (!gl_FrontFacing) c = mix(back, c, through);
    float seen = mix(1.0, lit(), shadow);
    // All of it relative to the flat sheet, which is therefore exactly the page
    float flat_ = around(vec3(0.0, 0.0, 1.0)) + key * sun.z;
    float here = around(n) * mix(1.0, seen, 0.4) + key * max(dot(n, sun), 0.0) * seen;
    // Light adds up in linear terms; this is the same as doing it there, for a colour in sRGB
    c *= pow(min(here / flat_, 1.5) * mix(1.0, headroom, moved), 0.4545);
    // Cloth is fuzzy: it catches light where it turns away
    float fuzz = 1.0 - max(n.z, 0.0);
    c = mix(c, light, clamp(fuzz * fuzz * fuzz * sheen * (0.4 + 0.6 * seen), 0.0, 1.0));
    colour = vec4(c, 1.0);
}`

const LIGHT_VERTEX = `#version 300 es
precision highp float;
precision highp sampler2D;
layout(location = 0) in vec2 at;
out float h;
${SURFACE}
${FROM_LIGHT}
void main() {
    ivec2 i = ivec2(floor(at));
    vec2 t = at - vec2(i);
    vec4 bx = spline(t.x), by = spline(t.y);
    vec3 p = vec3(0.0);
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) p += node(i + ivec2(x - 1, y - 1)) * bx[x] * by[y];
    h = height(p.z);
    gl_Position = vec4(onWall(p) * 2.0 - 1.0, 1.0 - 2.0 * h, 1.0);
}`

const LIGHT_FRAGMENT = `#version 300 es
precision highp float;
in float h;
out vec4 moments;
void main() {
    moments = vec4(h, h * h, 0.0, 1.0);
}`

// A triangle over the whole of whatever is being drawn into
const WHOLE = `#version 300 es
precision highp float;
out vec2 q;
void main() {
    vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
    q = p * 0.5 + 0.5;
    gl_Position = vec4(p, 0.0, 1.0);
}`

const BLUR = `#version 300 es
precision highp float;
in vec2 q;
uniform sampler2D map;
uniform vec2 along;
out vec4 o;
void main() {
    o = texture(map, q) * 0.2270270270
        + (texture(map, q + along * 1.3846153846) + texture(map, q - along * 1.3846153846)) * 0.3162162162
        + (texture(map, q + along * 3.2307692308) + texture(map, q - along * 3.2307692308)) * 0.0702702703;
}`

// The cloth's shadow on the page behind it: the canvas is see-through there, so this only darkens
const WALL = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 q;
uniform sampler2D map;
uniform float darkness;
out vec4 o;
${FROM_LIGHT}
void main() {
    vec3 wall = vec3(q.x * view.x, (1.0 - q.y) * view.y, 0.0);
    o = vec4(0.0, 0.0, 0.0, darkness * smoothstep(0.0, BASE, texture(map, onWall(wall)).r));
}`

type Program = { program: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }
interface Layer {
    canvas: HTMLCanvasElement
    gl: WebGL2RenderingContext
    u: Program["u"]
    programs: { main: Program; light: Program; blur: Program; wall: Program }
    linked: boolean
    // The cloth from the light's side, blurred back and forth between these two
    shadows: { size: [number, number]; frames: WebGLFramebuffer[]; maps: WebGLTexture[] } | null
}

let layer: Layer | undefined
let unsupported = false

// Makes the context and compiles the shaders, which is the slow part
function warm() {
    preload()
    if (layer) return true
    if (unsupported) return false
    const canvas = document.createElement("canvas")
    canvas.className = "cloth"
    canvas.setAttribute("aria-hidden", "true")
    // Over the page's own layers, under the cord (Cord.astro) and an open post (50)
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:40;pointer-events:none"
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true, depth: true })
    if (!gl) {
        unsupported = true
        return false
    }
    const shader = (type: number, src: string) => {
        const s = gl.createShader(type)!
        gl.shaderSource(s, src)
        gl.compileShader(s)
        return s
    }
    const build = (vertex: string, fragment: string): Program => {
        const program = gl.createProgram()!
        gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex))
        gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment))
        gl.linkProgram(program)
        return { program, u: {} }
    }
    const main = build(VERTEX, FRAGMENT)
    canvas.addEventListener("webglcontextlost", dispose)
    layer = {
        canvas,
        gl,
        u: main.u,
        programs: { main, light: build(LIGHT_VERTEX, LIGHT_FRAGMENT), blur: build(WHOLE, BLUR), wall: build(WHOLE, WALL) },
        linked: false,
        shadows: null,
    }
    return true
}

// The shaders are done compiling, as far as can be told without waiting for them
function compiled() {
    const l = layer
    if (!l || l.linked) return true
    const parallel = l.gl.getExtension("KHR_parallel_shader_compile")
    return !parallel || Object.values(l.programs).every((p) => l.gl.getProgramParameter(p.program, parallel.COMPLETION_STATUS_KHR))
}

// Waits for them if it has to, which is what the question above avoids
function link() {
    const l = layer!
    if (l.linked) return
    const { gl } = l
    for (const p of Object.values(l.programs)) {
        if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) {
            unsupported = true
            throw new Error("cloth: shaders")
        }
        // Their uniforms can only be found now
        const count = gl.getProgramParameter(p.program, gl.ACTIVE_UNIFORMS) as number
        for (let i = 0; i < count; i++) {
            const name = gl.getActiveUniform(p.program, i)!.name
            p.u[name] = gl.getUniformLocation(p.program, name)
        }
    }
    gl.useProgram(l.programs.main.program)
    l.linked = true
}

// --- The cloth ------------------------------------------------------------------------------

// The timeline (scrub.ts, dev only) runs all this by hand, on its own clock
let frozen = false
let random = Math.random

const IDLE = 0
const PEEK = 1 // over the page, held at the top, its edge following the cord
const FALL = 2
let mode = IDLE
let under: ((on: boolean) => void) | undefined // puts the dark page behind it, or takes it away
let raf = 0
let tick = 0
let last = 0
let spare = 0
let time = 0 // s of simulation, from the moment it lets go
// Many small steps with one pass each make cloth far stiffer, for the same work, than a few big
// steps with many passes, which is what stops it stretching and squashing like rubber
let step = 1 / 480 // s
let count = 0 // the surface's indices
let surface = "" // the grid the surface was built for
let shaped = "" // the settings the sheet was built with
let readyFor = "" // what the picture shows
let painted: HTMLCanvasElement | undefined // on its way to the GPU
let paintedFor = ""
let readyAt = 0
let priming = false
let startScroll = 0

// The sheet: x, y, z per node (and a spare, as it goes up as a texture), and where each was
let W = 0
let H = 0
let cols = 0
let rows = 0
let cell = 0
let stepX = 0
let stepY = 0
let pos = new Float32Array(0)
let old = new Float32Array(0)
let free = new Uint8Array(0) // can move
let gone = new Uint8Array(0) // has let go of the wall for good
let at = new Float32Array(0) // ms: when it does
let kick = new Float32Array(0) // px/s: how hard it comes away
let drift = new Float32Array(0) // px/s: its head start or late start down
let linkA = new Int32Array(0)
let linkB = new Int32Array(0)
let linkLen = new Float32Array(0)
let linkK = new Float32Array(0)
let firm = 0 // of the links, the ones every pass goes over
// The grid that finds which nodes are near each other
let head = new Int32Array(0)
let next = new Int32Array(0)
let colOf = new Int16Array(0)
let rowOf = new Int16Array(0)
let gravity = 0
let eye = 0
let slope = 0
let landed = 0 // s: the top should have reached the floor by now
let open = 0 // s: the floor goes

// Where the cord is sewn on, and the part of the sheet that can move while it only peeks
let hook = 0 // a node of the top row
let hookX = 0
let order = new Int32Array(0) // the nodes that can come away from the wall, nearest the cord first
let orderFor = ""
let freed = 0 // how many of them have
let sinceLetGo = 0 // s
let fromHook = new Float32Array(0) // per node: px
let pleat = new Float32Array(0) // per node: 0 in the hollow of a fold fanning out from the cord, 1 on its crest
let force = 0
let pulled = 0 // px the cord asks for
let dip = 0 // px the top edge is down at the cord, easing after that

function allocate(width: number, height: number) {
    W = width
    H = height
    // Fewer on a small window, which has fewer pixels to show them (and usually a slower chip)
    cell = Math.sqrt((W * H) / (params.nodes * Math.min(1, Math.max(0.5, Math.sqrt((W * H) / 1296000)))))
    cols = Math.max(4, Math.round(W / cell) + 1)
    rows = Math.max(4, Math.round(H / cell) + 1)
    stepX = W / (cols - 1)
    stepY = H / (rows - 1)
    cell = (stepX + stepY) / 2
    const n = cols * rows
    pos = new Float32Array(n * 4)
    old = new Float32Array(n * 3)
    free = new Uint8Array(n)
    gone = new Uint8Array(n)
    at = new Float32Array(n)
    kick = new Float32Array(n)
    drift = new Float32Array(n)
    next = new Int32Array(n)
    colOf = new Int16Array(n)
    rowOf = new Int16Array(n)
    fromHook = new Float32Array(n)
    pleat = new Float32Array(n)
    for (let k = 0; k < n; k++) {
        colOf[k] = k % cols
        rowOf[k] = (k / cols) | 0
    }

    // What holds it together: neighbours first (every pass goes over these); then, once a step
    // since they are soft anyway, across each square (skew) and every other node (folding)
    const links: [number, number, number, number][] = []
    const stiff = (a: number, b: number, k: number) => {
        links.push([a, b, Math.hypot((colOf[a] - colOf[b]) * stepX, (rowOf[a] - rowOf[b]) * stepY), k])
    }
    for (let k = 0; k < n; k++) {
        if (colOf[k] + 1 < cols) stiff(k, k + 1, 1)
        if (rowOf[k] + 1 < rows) stiff(k, k + cols, 1)
    }
    firm = links.length
    for (let k = 0; k < n; k++) {
        const i = colOf[k]
        const j = rowOf[k]
        if (i + 1 < cols && j + 1 < rows) {
            stiff(k, k + cols + 1, params.shear)
            stiff(k + 1, k + cols, params.shear)
        }
        if (i + 2 < cols) stiff(k, k + 2, params.bend)
        if (j + 2 < rows) stiff(k, k + cols * 2, params.bend)
    }
    linkA = new Int32Array(links.length)
    linkB = new Int32Array(links.length)
    linkLen = new Float32Array(links.length)
    linkK = new Float32Array(links.length)
    links.forEach(([a, b, d, k], i) => {
        linkA[i] = a
        linkB[i] = b
        linkLen[i] = d
        linkK[i] = k
    })

    step = 1 / (60 * Math.max(1, params.iterations))
    gravity = (2 * H) / (params.fall * params.fall)
    eye = params.camera * H
    // A floor tilted so that it is seen exactly edge on: whatever lies on it, however near, stands
    // on the bottom edge of the window instead of dropping below it
    slope = H / (2 * eye)
    landed = params.release / 1000 + params.fall * 1.15
    open = landed + (params.rest + params.hold) / 1000
    force = params.billow * (H / 900)
}

// Flat on the wall again, with new folds waiting in it
function reset() {
    const n = cols * rows
    const reach = Math.hypot(Math.max(hookX, W - hookX), H) || 1
    // Each fall folds differently: three waves at different slants, so no two folds run alike
    const down = (Math.PI * 2 * params.folds) / H
    const over = (Math.PI * 2) / W
    const phase = Array.from({ length: 5 }, () => random() * Math.PI * 2)
    const slant = 1 + random() * 2
    hook = Math.max(0, Math.min(cols - 1, Math.round(hookX / stepX)))
    const turn = random() * Math.PI * 2
    for (let k = 0; k < n; k++) {
        const x = colOf[k] * stepX
        const y = rowOf[k] * stepY
        pos[k * 4] = old[k * 3] = x
        pos[k * 4 + 1] = old[k * 3 + 1] = y
        pos[k * 4 + 2] = old[k * 3 + 2] = 0
        const d = Math.hypot(x - hookX, y)
        fromHook[k] = d
        // Spreading from the cord, not quite in a perfect circle
        at[k] = params.release * Math.min(1, d / reach + 0.03 * Math.sin(x * 0.011 + y * 0.007))
        const a = Math.sin(y * down * 0.6 + x * over * slant + phase[0])
        const b = Math.sin(y * down * 1.3 - x * over * (slant + 1.7) + phase[1])
        const c = Math.sin(y * down * 2.1 + x * over * 4.3 + phase[2])
        kick[k] = force * Math.max(0.05, 0.5 + 0.3 * a + 0.2 * b + 0.12 * c)
        // And not all at the same pace, so the falling edge isn't a straight line
        const e = Math.sin(x * over * 2.6 + y * down * 0.3 + phase[3]) + 0.5 * Math.sin(x * over * 6.1 - y * down * 0.5 + phase[4])
        drift[k] = force * 0.45 * e
        gone[k] = 0
        free[k] = 0
        // Cloth pulled at one point gathers in folds that fan out from it; not evenly
        const fan = Math.atan2(y, x - hookX) * params.pleats * 2
        pleat[k] = 0.5 + 0.5 * Math.sin(fan + turn + 1.4 * Math.sin(fan * 0.37 + turn))
    }
    const key = `${hook}|${cols}x${rows}`
    if (orderFor !== key) {
        orderFor = key
        const nodes: number[] = []
        for (let k = 0; k < n; k++) if (rowOf[k] > 0 || Math.abs(colOf[k] - hook) > 1) nodes.push(k)
        order = Int32Array.from(nodes.sort((a, b) => fromHook[a] - fromHook[b]))
    }
    freed = 0
    sinceLetGo = 0
    pulled = dip = 0
    time = spare = 0
}

function solve(floorOn: boolean) {
    const p = pos
    const was = old
    const loose = free
    const A = linkA
    const B = linkB
    const L = linkLen
    const K = linkK
    // Neighbours every step; the soft links, across the squares and for folding, every other
    const m = tick & 1 ? firm : A.length
    const n = cols * rows
    const depth = params.depth * H
    const grip = params.friction * Math.min(1, step * 120)
    for (let c = 0; c < m; c++) {
        const a = A[c]
        const b = B[c]
        const wa = loose[a]
        const wb = loose[b]
        const w = wa + wb
        if (!w) continue
        const a4 = a * 4
        const b4 = b * 4
        const dx = p[b4] - p[a4]
        const dy = p[b4 + 1] - p[a4 + 1]
        const dz = p[b4 + 2] - p[a4 + 2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < 1e-5) continue
        const f = (((d - L[c]) / d) * K[c]) / w
        if (wa) {
            p[a4] += dx * f
            p[a4 + 1] += dy * f
            p[a4 + 2] += dz * f
        }
        if (wb) {
            p[b4] -= dx * f
            p[b4 + 1] -= dy * f
            p[b4 + 2] -= dz * f
        }
    }
    for (let i = 0; i < n; i++) {
        if (!loose[i]) continue
        const i4 = i * 4
        const i3 = i * 3
        if (p[i4 + 2] < 0) p[i4 + 2] = 0
        else if (p[i4 + 2] > depth) p[i4 + 2] = depth
        if (floorOn) {
            const floor = H - slope * p[i4 + 2]
            if (p[i4 + 1] > floor) {
                p[i4 + 1] = floor
                was[i3] += (p[i4] - was[i3]) * grip
                was[i3 + 2] += (p[i4 + 2] - was[i3 + 2]) * grip
            }
        }
    }
}

// The sheet can't pass through itself or lie flat on itself, which is what gives the pile its
// volume. Only down where the pile is
function collide() {
    const r = params.thick * cell
    if (r <= 0) return
    const size = 2 * r
    const p = pos
    const was = old
    const loose = free
    const cells = head
    const after = next
    const col = colOf
    const row = rowOf
    const n = cols * rows
    const top = H * 0.45
    const nx = Math.ceil(W * 1.2 / size) + 2
    const ny = Math.ceil((H - top) * 1.1 / size) + 2
    const nz = Math.ceil((params.depth * H) / size) + 2
    const total = nx * ny * nz
    let grid = cells
    if (grid.length < total) grid = head = new Int32Array(total)
    grid.fill(-1, 0, total)
    const grip = params.friction * 0.25
    const min = size * size
    for (let i = 0; i < n; i++) {
        if (!loose[i]) continue
        const y = p[i * 4 + 1]
        if (y < top) continue
        const cx = Math.max(0, Math.min(nx - 1, Math.floor((p[i * 4] + W * 0.1) / size)))
        const cy = Math.max(0, Math.min(ny - 1, Math.floor((y - top) / size)))
        const cz = Math.max(0, Math.min(nz - 1, Math.floor(p[i * 4 + 2] / size)))
        for (let z = Math.max(0, cz - 1); z <= Math.min(nz - 1, cz + 1); z++) {
            for (let v = Math.max(0, cy - 1); v <= Math.min(ny - 1, cy + 1); v++) {
                for (let u = Math.max(0, cx - 1); u <= Math.min(nx - 1, cx + 1); u++) {
                    for (let j = grid[u + nx * (v + ny * z)]; j >= 0; j = after[j]) {
                        // Neighbours on the sheet are held apart by the sheet itself
                        const di = col[i] - col[j]
                        const dj = row[i] - row[j]
                        if (di >= -2 && di <= 2 && dj >= -2 && dj <= 2) continue
                        const dx = p[i * 4] - p[j * 4]
                        const dy = p[i * 4 + 1] - p[j * 4 + 1]
                        const dz = p[i * 4 + 2] - p[j * 4 + 2]
                        const d2 = dx * dx + dy * dy + dz * dz
                        if (d2 >= min || d2 < 1e-6) continue
                        const d = Math.sqrt(d2)
                        const push = ((size - d) / d) * 0.5
                        p[i * 4] += dx * push
                        p[i * 4 + 1] += dy * push
                        p[i * 4 + 2] += dz * push
                        p[j * 4] -= dx * push
                        p[j * 4 + 1] -= dy * push
                        p[j * 4 + 2] -= dz * push
                        // What is touching grips, so the pile settles instead of simmering
                        was[i * 3] += (p[i * 4] - was[i * 3]) * grip
                        was[i * 3 + 1] += (p[i * 4 + 1] - was[i * 3 + 1]) * grip
                        was[i * 3 + 2] += (p[i * 4 + 2] - was[i * 3 + 2]) * grip
                        was[j * 3] += (p[j * 4] - was[j * 3]) * grip
                        was[j * 3 + 1] += (p[j * 4 + 1] - was[j * 3 + 1]) * grip
                        was[j * 3 + 2] += (p[j * 4 + 2] - was[j * 3 + 2]) * grip
                    }
                }
            }
        }
        const key = cx + nx * (cy + ny * cz)
        after[i] = grid[key]
        grid[key] = i
    }
}

// The peek. No springs: the sheet is nailed to the wall and hangs by its own weight, and the cord
// pulls one point of its top edge. It can't stretch, so that pulls it off its nails around there,
// further the further it is pulled, and what is left over drops forward into a fold; a free corner
// just flops. Let go, the point goes back up and the fold is smoothed away, without any bounce
function peelStep() {
    tick++
    const dt = step
    dip += (pulled - dip) * (1 - Math.exp(-params.follow * dt))
    const p = pos
    const was = old
    const reach = cell * 3 + dip * params.widen
    while (freed < order.length && fromHook[order[freed]] < reach) free[order[freed++]] = 1
    for (let c = Math.max(0, hook - 1); c <= Math.min(cols - 1, hook + 1); c++) {
        p[c * 4 + 1] = dip
        p[c * 4 + 2] = dip * params.lean
        was[c * 3 + 1] = p[c * 4 + 1]
        was[c * 3 + 2] = p[c * 4 + 2]
    }
    sinceLetGo = pulled > 0 ? 0 : sinceLetGo + dt
    const home = Math.min(1, sinceLetGo / HOME)
    const tidy = home * home * 0.25 * Math.min(1, dt * 120)
    const keep = 1 - (params.air + 1.5) * dt
    const weight = gravity * dt * dt * (1 - home)
    const start = (params.peel * dip * dt * dt) / 100
    const fanned = reach * 0.6
    for (let m = 0; m < freed; m++) {
        const i = order[m]
        const i3 = i * 3
        const i4 = i * 4
        const x = p[i4]
        const y = p[i4 + 1]
        const z = p[i4 + 2]
        const vx = (x - was[i3]) * keep
        const vy = (y - was[i3 + 1]) * keep
        const vz = (z - was[i3 + 2]) * keep
        was[i3] = x
        was[i3 + 1] = y
        was[i3 + 2] = z
        // The folds begin a little forward, near the cord, or nothing tells them which way to go
        const near = 1 - fromHook[i] / fanned
        p[i4] = x + vx
        p[i4 + 1] = y + vy + weight
        p[i4 + 2] = z + vz + (near > 0 ? start * near * pleat[i] : 0)
        if (tidy) {
            // Moved, not pushed: nothing to overshoot with
            const dx = (colOf[i] * stepX - p[i4]) * tidy
            const dy = (rowOf[i] * stepY - p[i4 + 1]) * tidy
            const dz = -p[i4 + 2] * tidy
            p[i4] += dx
            p[i4 + 1] += dy
            p[i4 + 2] += dz
            was[i3] += dx
            was[i3 + 1] += dy
            was[i3 + 2] += dz
        }
    }
    solve(false)
}

function fallStep() {
    tick++
    time += step
    const ms = time * 1000
    const n = cols * rows
    const p = pos
    const floorOn = time < open
    // The air, then more and more as the pile settles; back to normal for the drop
    const settling = floorOn ? Math.min(1, Math.max(0, (time - landed) / 0.25)) : 0
    const keep = (1 - params.air * step) * Math.pow(0.86, 120 * step * settling)
    const pull = gravity * step * step
    const middle = W / 2
    const inward = params.gather * step * step
    const zone = H * 0.3
    for (let i = 0; i < n; i++) {
        const i3 = i * 3
        const i4 = i * 4
        if (!gone[i]) {
            if (ms >= at[i]) {
                gone[i] = free[i] = 1
                old[i3 + 1] = p[i4 + 1] - drift[i] * step
                old[i3 + 2] = p[i4 + 2] - kick[i] * step
            } else if (!free[i]) continue
        }
        const x = p[i4]
        const y = p[i4 + 1]
        const z = p[i4 + 2]
        const vx = (x - old[i3]) * keep
        const vy = (y - old[i3 + 1]) * keep
        const vz = (z - old[i3 + 2]) * keep
        old[i3] = x
        old[i3 + 1] = y
        old[i3 + 2] = z
        // Low down the pile draws in from the sides
        const near = floorOn ? Math.max(0, (y - (H - zone)) / zone) : 0
        p[i4] = x + vx - (x - middle) * inward * near
        p[i4 + 1] = y + vy + pull
        p[i4 + 2] = z + vz
    }
    solve(floorOn)
    // The pile is pushed apart at about 120 Hz, however small the steps
    if (floorOn && tick % Math.max(1, Math.round(1 / (120 * step))) === 0) collide()
}

function draw() {
    const l = layer
    if (!l) return
    const { gl, programs: p, shadows } = l
    gl.activeTexture(gl.TEXTURE0)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.FLOAT, pos)
    if (shadows) {
        // The cloth as the light sees it
        gl.activeTexture(gl.TEXTURE2)
        gl.bindTexture(gl.TEXTURE_2D, null)
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadows.frames[0])
        gl.viewport(0, 0, shadows.size[0], shadows.size[1])
        gl.clearColor(0, 0, 0, 0)
        gl.clearDepth(1)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        gl.enable(gl.DEPTH_TEST)
        gl.useProgram(p.light.program)
        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0)
        // Softened, one way and then the other
        gl.disable(gl.DEPTH_TEST)
        gl.useProgram(p.blur.program)
        const across = W * 1.2 * 3.2
        const down = H * 1.2 * 3.2
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadows.frames[1])
        gl.bindTexture(gl.TEXTURE_2D, shadows.maps[0])
        gl.uniform2f(p.blur.u.along, params.soft / across, 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadows.frames[0])
        gl.bindTexture(gl.TEXTURE_2D, shadows.maps[1])
        gl.uniform2f(p.blur.u.along, 0, params.soft / down)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.bindTexture(gl.TEXTURE_2D, shadows.maps[0])
    }
    gl.viewport(0, 0, l.canvas.width, l.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    if (shadows) {
        gl.useProgram(p.wall.program)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    gl.enable(gl.DEPTH_TEST)
    gl.useProgram(p.main.program)
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0)
}

// Back flat on the wall, and nothing still on its way
// The cord is being held (cord.ts, through theme.ts): a peek that has begun stays while it is. A finger
// never holds still, so the pull amount kept crossing 0 and the peek healed and armed again over and
// over, a flicker at the top, on real touch screens only (a mouse holds steadier: Vansh, 2026-11-07)
let kept = false
export function keep(on: boolean) {
    kept = on
}

function healed() {
    if (kept || pulled > 0 || dip > 0.5) return false
    for (let m = 0; m < freed; m++) {
        const i = order[m]
        const i4 = i * 4
        if (Math.abs(pos[i4] - colOf[i] * stepX) > 0.8 || Math.abs(pos[i4 + 1] - rowOf[i] * stepY) > 0.8 || pos[i4 + 2] > 1.5) return false
    }
    return true
}

const afterFrame = new Event("cloth:frame")

function frame(now: number) {
    raf = frozen ? 1 : requestAnimationFrame(frame)
    spare += (Math.min(50, now - last) / 1000) * (frozen ? 1 : params.speed)
    last = now
    let steps = 0
    const advance = mode === PEEK ? peelStep : fallStep
    // Past 50 ms of work a frame it runs in slow motion instead of falling behind
    const most = Math.ceil(0.05 / step)
    while (spare >= step && steps < most) {
        advance()
        spare -= step
        steps++
    }
    if (steps === most) spare = 0
    if (!frozen) draw()
    // The cord (cord.ts) is sewn to where this sheet's nail is now: it takes its next step right here,
    // after the sheet's, not on its own frame callback, which came before this one every frame and so
    // always read the nail's position from the frame before, a lag that grew with how fast the sheet
    // moved (the top of the cord flickered more the harder it was pulled, on real touch screens)
    document.dispatchEvent(afterFrame)
    if (mode === PEEK) {
        if (healed()) heal()
        return
    }
    if (time < open) {
        if (time > LIMIT) dispose()
        return
    }
    // Gone when the whole of it is below the window
    for (let i = 1; i < pos.length; i += 4) if (pos[i] < H + 60) return time > LIMIT ? dispose() : undefined
    dispose()
}

// A scroll under a peek would leave the picture behind the page; a new width, any of it
function onScroll() {
    // Only a scroll that moved the page: Safari (an iPad) also fires "scroll" without it moving, as the
    // canvas goes on and off the page, which healed the peek at once, so that it armed and healed in
    // turn every frame (a flicker, and the page behind never showing the other theme: Vansh, 2026-11-07)
    // (a rubber-banded page, scrollY below 0, counts as at the top)
    if (mode === PEEK && Math.abs(Math.max(0, scrollY) - Math.max(0, startScroll)) > 0.5) heal()
}
function onResize() {
    if (document.documentElement.clientWidth !== W) stop()
}
function listen(on: boolean) {
    if (frozen) return
    const change = on ? addEventListener : removeEventListener
    change("scroll", onScroll)
    change("resize", onResize)
}

// The peek is over: the page again, in this task, so that nothing shows in between. The context
// stays for the next one
function heal() {
    kept = false
    cancelAnimationFrame(raf)
    raf = 0
    mode = IDLE
    listen(false)
    if (!frozen) {
        layer?.canvas.remove()
        under?.(false)
    }
    under = undefined
}

function dispose() {
    if (frozen && layer) {
        // The timeline keeps the canvas, and goes on to the new cord
        const fell = mode === FALL
        mode = IDLE
        raf = 0
        under = undefined
        if (fell) document.dispatchEvent(new Event("cloth:gone"))
        return
    }
    const was = mode
    if (was === PEEK) heal()
    cancelAnimationFrame(raf)
    raf = 0
    mode = IDLE
    listen(false)
    under = undefined
    readyFor = surface = shaped = ""
    const l = layer
    layer = undefined
    l?.canvas.remove()
    l?.gl.getExtension("WEBGL_lose_context")?.loseContext()
    if (was === FALL) document.dispatchEvent(new Event("cloth:gone"))
}

/** Takes a fall or a peek in progress away at once. One that is only warmed up stays ready */
export function stop() {
    if (mode === FALL) dispose()
    else if (mode === PEEK) heal()
}

const stateNow = () => {
    const root = document.documentElement
    return `${root.clientWidth}x${root.clientHeight}@${scrollX},${scrollY}|${root.dataset.theme ?? ""}|${JSON.stringify(params)}`
}

// Paints the page as it is now, in the old colours, so before any flip
function paint() {
    const { canvas, gl } = layer!
    const root = document.documentElement
    const width = root.clientWidth
    const height = root.clientHeight
    const most = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    // As sharp as the screen, or the first frame shows a soft copy of the page: only a limit on
    // the total, for very large windows
    const dpr = Math.min(devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (width * height)), most / width, most / height)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    // Where the Figma cord crosses the top of the window (the drawing is 22 wide)
    const rope = document.querySelector(".rope")?.getBoundingClientRect()
    hookX = rope ? rope.left + (CORD_X * rope.width) / 22 : width

    const settings = `${width}x${height}|${JSON.stringify(params)}`
    if (shaped !== settings) {
        allocate(width, height)
        shaped = settings
    }

    painted = picture(width, height, canvas.width, canvas.height)
    paintedFor = stateNow()
}

// The maps the cloth is drawn into as the light sees it, at half the window's resolution: the shadows
// are soft. Nothing to draw them with on an old GPU: no shadows then, which still works
function makeShadows() {
    const l = layer!
    const { gl } = l
    if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float")) return
    const size: [number, number] = [Math.round((W * 1.2) / 2), Math.round((H * 1.2) / 2)]
    const frames: WebGLFramebuffer[] = []
    const maps: WebGLTexture[] = []
    gl.activeTexture(gl.TEXTURE2)
    for (let i = 0; i < 2; i++) {
        const map = gl.createTexture()!
        gl.bindTexture(gl.TEXTURE_2D, map)
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, size[0], size[1])
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        const frame = gl.createFramebuffer()!
        gl.bindFramebuffer(gl.FRAMEBUFFER, frame)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, map, 0)
        if (!i) {
            const depth = gl.createRenderbuffer()
            gl.bindRenderbuffer(gl.RENDERBUFFER, depth)
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size[0], size[1])
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth)
        }
        const ready = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        if (!ready) return
        frames.push(frame)
        maps.push(map)
    }
    l.shadows = { size, frames, maps }
}

// The light and everything that follows from it. Nothing here touches the simulation, so the
// timeline can change it on the spot
function look() {
    const l = layer
    if (!l) return
    const { gl, programs: p } = l
    const a = (params.azimuth * Math.PI) / 180
    const e = (params.elevation * Math.PI) / 180
    // Pointing at the light: x right, y down, z at the eye
    const sun = [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)]
    const shear = [sun[0] / sun[2], sun[1] / sun[2]]
    const margin = [W * 0.1, H * 0.1]
    const reach = params.depth * H * 1.2
    for (const program of [p.light, p.wall, p.main]) {
        gl.useProgram(program.program)
        gl.uniform2f(program.u.view, W, H)
        gl.uniform2f(program.u.margin, margin[0], margin[1])
        gl.uniform2f(program.u.shear, shear[0], shear[1])
        gl.uniform1f(program.u.reach, reach)
        gl.uniform1i(program.u.sheet, 0)
        gl.uniform1i(program.u.map, 2)
        gl.uniform2i(program.u.last, cols - 1, rows - 1)
    }
    gl.useProgram(p.wall.program)
    gl.uniform1f(p.wall.u.darkness, params.cast)
    gl.useProgram(p.blur.program)
    gl.uniform1i(p.blur.u.map, 2)
    const { main } = p
    gl.useProgram(main.program)
    gl.uniform3fv(main.u.sun, sun)
    gl.uniform1f(main.u.key, params.key)
    gl.uniform1f(main.u.fill, params.fill)
    gl.uniform1f(main.u.bounce, params.bounce)
    gl.uniform1f(main.u.shadow, l.shadows ? params.shadow : 0)
    gl.uniform1f(main.u.sheen, params.sheen)
    gl.uniform1f(main.u.headroom, params.headroom)
    gl.uniform1f(main.u.through, params.through)
    gl.uniform1f(main.u.bias, 3 / reach)
}

// And readies the sheet and the GPU with it
function upload() {
    link()
    const l = layer!
    const { canvas, gl } = l
    const root = document.documentElement
    const width = root.clientWidth
    const tokens = getComputedStyle(root)
    const rgb = (name: string) => {
        const g = scratch.getContext("2d")!
        g.fillStyle = tokens.getPropertyValue(name).trim()
        const hex = String(g.fillStyle)
        return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
    }

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    // The sheet's squares run clockwise on screen, which is its front
    gl.frontFace(gl.CW)
    gl.clearColor(0, 0, 0, 0)
    gl.clearDepth(1)

    gl.activeTexture(gl.TEXTURE1)
    gl.deleteTexture(gl.getParameter(gl.TEXTURE_BINDING_2D))
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, painted!)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic")
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4)

    const grid = `${cols}x${rows}`
    if (surface !== grid) {
        surface = grid
        gl.activeTexture(gl.TEXTURE0)
        gl.deleteTexture(gl.getParameter(gl.TEXTURE_BINDING_2D))
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, cols, rows)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

        // The surface: finer than the sheet
        const across = (cols - 1) * SUB + 1
        const down = (rows - 1) * SUB + 1
        const points = new Float32Array(across * down * 2)
        for (let j = 0; j < down; j++) {
            for (let i = 0; i < across; i++) {
                points[(i + j * across) * 2] = i / SUB
                points[(i + j * across) * 2 + 1] = j / SUB
            }
        }
        const faces = new Uint32Array((across - 1) * (down - 1) * 6)
        let f = 0
        for (let j = 0; j + 1 < down; j++) {
            for (let i = 0; i + 1 < across; i++) {
                const a = i + j * across
                faces[f++] = a
                faces[f++] = a + 1
                faces[f++] = a + across
                faces[f++] = a + 1
                faces[f++] = a + across + 1
                faces[f++] = a + across
            }
        }
        count = f
        gl.bindVertexArray(gl.createVertexArray())
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
        gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, faces, gl.STATIC_DRAW)
    }

    if (!l.shadows || l.shadows.size[0] !== Math.round((width * 1.2) / 2)) makeShadows()
    look()
    const { main } = l.programs
    gl.useProgram(main.program)
    gl.uniform1i(main.u.page, 1)
    gl.uniform1f(main.u.eye, eye)
    gl.uniform2f(main.u.cellSize, stepX, stepY)
    // What the cloth catches where it turns away: white on a light page, a pale grey on a dark one
    gl.uniform3fv(main.u.light, rgb(root.dataset.theme === "dark" ? "--gray-600" : "--white"))
    gl.uniform3fv(main.u.back, rgb("--gray-100"))
    readyFor = paintedFor
    readyAt = performance.now()
    painted = undefined
}

function prepare() {
    if (!layer) return
    paint()
    upload()
}

const fresh = () => readyFor === stateNow() && performance.now() - readyAt < FRESH

/** The pointer is coming: the slow parts while nothing depends on them, so that the first pull
 *  doesn't stutter. Each on its own when the browser has time, with frames in between, because
 *  the cord is swaying and would show one long stall */
export function prime() {
    if (frozen || mode || priming || fresh()) return
    priming = true
    const later = (job: () => void) => {
        const guarded = () => {
            if (mode) {
                priming = false
                return
            }
            try {
                job()
            } catch (err) {
                priming = false
                console.error(err)
            }
        }
        if ("requestIdleCallback" in window) requestIdleCallback(guarded, { timeout: 200 })
        else setTimeout(guarded, 16)
    }
    const send = () => {
        upload()
        priming = false
    }
    const draw = () => {
        paint()
        later(send)
    }
    const wait = () => {
        if (compiled()) later(draw)
        else setTimeout(() => later(wait), 30)
    }
    later(() => {
        if (warm()) wait()
        else priming = false
    })
}

/** Over the page, exactly, with `flip(true)` putting the dark page behind it, in this task. False
 *  if it can't, with nothing changed. It heals by itself once `tug` has gone back to 0 */
export function arm(flip: (on: boolean) => void) {
    if (mode) return true
    if (!warm() || !layer) return false
    try {
        link()
        if (!frozen && !fresh()) prepare()
        reset()
        draw()
        if (layer.gl.getError() !== layer.gl.NO_ERROR) throw new Error("cloth: GL error")
        document.body.append(layer.canvas)
    } catch (err) {
        console.error(err)
        dispose()
        return false
    }
    under = flip
    flip(true)
    mode = PEEK
    startScroll = scrollY
    listen(true)
    if (!frozen) last = performance.now()
    raf = frozen ? 1 : requestAnimationFrame(frame)
    return true
}

/** How far down the cord has the top edge, in px */
export function tug(px: number) {
    pulled = px
}

/** The fall, from now, from wherever the peek has got to. False if it can't */
export function drop(flip: (on: boolean) => void) {
    if (mode === FALL) dispose()
    if (!arm(flip)) return false
    mode = FALL
    time = spare = 0
    under = undefined
    document.dispatchEvent(new Event("cloth:fall"))
    return true
}

/** How far the point the cord is sewn to has moved, in px on screen; nothing when it's not there */
export function anchor(): [number, number] | undefined {
    if (!mode) return
    const i = hook * 4
    const s = eye / (eye - pos[i + 2])
    return [W / 2 + (pos[i] - W / 2) * s - hook * stepX, H / 2 + (pos[i + 1] - H / 2) * s + scrollY - startScroll]
}

/** For the timeline (scrub.ts); nothing of this is in the build */
export const dev = import.meta.env.DEV
    ? {
          begin() {
              if (mode) stop()
              frozen = true
          },
          // Paints the page (it has to be the light one just then) and readies the GPU
          prepare() {
              if (!warm() || !layer) return false
              link()
              readyFor = surface = shaped = ""
              prepare()
              layer.canvas.style.visibility = ""
              document.body.append(layer.canvas)
              return true
          },
          reset() {
              mode = IDLE
              raf = 0
              under = undefined
              tick = 0
              time = spare = 0
          },
          // The same numbers each time, so the same folds
          seed(n: number) {
              let a = n * 2654435761
              random = () => {
                  a = (a + 0x6d2b79f5) | 0
                  let t = Math.imul(a ^ (a >>> 15), 1 | a)
                  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
                  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
              }
          },
          flat() {
              const n = cols * rows
              const out = new Float32Array(n * 4)
              for (let k = 0; k < n; k++) {
                  out[k * 4] = (k % cols) * stepX
                  out[k * 4 + 1] = ((k / cols) | 0) * stepY
              }
              return out
          },
          frame(now: number) {
              if (mode) frame(now)
              else last = now
          },
          mode: () => mode,
          time: () => time,
          landed: () => landed,
          pose: () => (mode ? pos.slice() : null),
          look,
          show(pose: Float32Array | null) {
              const l = layer
              if (!l) return
              l.canvas.style.visibility = pose ? "" : "hidden"
              if (!pose) return
              const keptPos = pos
              pos = pose as typeof pos
              draw()
              pos = keptPos
          },
          end() {
              frozen = false
              random = Math.random
              mode = IDLE
              raf = 0
              dispose()
          },
      }
    : undefined

document.addEventListener("nav:leave", stop)
preload()
