// The contract between the transition harness (index.ts) and each effect (fx/*.ts).
//
// One effect is one timeline t in [0, 1] split around a client-side page swap. The
// index page plays t 0 -> 0.5 over the card the visitor clicked, nav.ts swaps <main>,
// and the new page plays t 0.5 -> 1. The two halves use separate contexts (and
// canvases), so any state that matters must be derivable from t alone. Seed noise
// from constants, not Math.random().
//
// Bridge frame: draw(0.5) MUST be a fully opaque, flat palette.bg frame. The swap
// happens while it is on screen, so a flat bridge makes the page change invisible.
//
// Alpha: the canvas is premultiplied-alpha, drawn over the live page. Anywhere the
// effect outputs alpha < 1 the real page shows through (the index in t < 0.5, the
// entry page in t > 0.5). Output premultiplied colours (rgb * a).

export interface Rect {
    x: number
    y: number
    w: number
    h: number
}

/** Colours read from the CSS variables, as 0-1 RGB. Never hard-code colours in a shader. */
export interface Palette {
    bg: [number, number, number] // --gray-50, the page background
    line: [number, number, number] // --gray-200, dashed page rules
    mid: [number, number, number] // --gray-500
    ink: [number, number, number] // --gray-main
    primary: [number, number, number] // --primary
    primaryLight: [number, number, number] // --primary-200
    white: [number, number, number]
    black: [number, number, number]
}

export interface FxContext {
    canvas: HTMLCanvasElement
    gl: WebGLRenderingContext
    /** Viewport size in CSS px; the canvas backing store is w*dpr by h*dpr. */
    w: number
    h: number
    dpr: number
    /** The clicked card, in viewport CSS px (origin top-left, y down) when it was clicked. */
    src: Rect
    /** The entry page's first media block in viewport CSS px; null on the index page. Call it inside draw, not in setup. */
    dest: () => Rect | null
    /** The card's poster as a texture, uv (0,0) = top-left; a 1x1 fill-colour texture for placeholder entries. */
    tex: WebGLTexture
    texSize: [number, number]
    hasPoster: boolean
    /** Fill colour (0-1 RGB) of placeholder cards. */
    fill: [number, number, number]
    palette: Palette
    /** Which page this context is on. */
    phase: "out" | "in"
}

export interface FxInstance {
    /** Render the frame for timeline position t in [0, 1]. Must clear and fully redraw. */
    draw(t: number): void
    /** Free programs and buffers. The harness also calls loseContext(). */
    dispose?(): void
}

export interface Fx {
    setup(ctx: FxContext): FxInstance
}
