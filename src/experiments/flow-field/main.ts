// Flow Field: a lit heightfield, a crater with ridges round it, redrawn as a carpet
// of small curved marks, one per screen cell, each turned along a flow that swirls
// round the crater and inked by the shade there, like an engraving. The middle
// always shows; the rest bleeds in like watercolour on wet paper, and drops fall
// in the crater, sending ripples out across it. Two passes: the heightfield is lit
// per pixel of a small offscreen target, then the marks are drawn from it. Tap to
// replay the reveal.
import * as THREE from "three"
import gsap from "gsap"
import type { Mount } from "../../lib/types"
import { createSound } from "./sound"
import impactUrl from "./impact.m4a?url"
import rippleUrl from "./ripple.mp3?url"
import travelUrl from "./ripple-travel.m4a?url"
import { fieldFragment, fieldVertex, marksFragment, marksVertex, turbFieldFragment, turbFragment, turbVertex } from "./shaders"

// Reveal easing choices for the panel, as gsap eases
const EASES = { linear: "none", "ease-in": "power2.in", "ease-out": "power2.out", "ease-in-out": "power2.inOut" }
type Ease = keyof typeof EASES

// Sizes are in px at a 1000 px wide frame and positions in frame widths from the
// middle (+y up), so the look holds at any window size
export interface Options {
    /** Marks: cell size, length (share of a cell), how far each bends (radians),
        stroke width and how much it thickens in shadow, how far each cell's centre
        wanders (0..1) and how much marks vary in size and turn */
    cell: number
    markLength: number
    curve: number
    markWidth: number
    widthShade: number
    jitter: number
    variety: number
    /** How much the shadows fill in with marks */
    density: number
    /** 0..1, marks kept even in full light */
    base: number
    /** Where the ink ramp starts and is full (0..1 of shade); start above full inverts it */
    shadowStart: number
    shadowFull: number
    opacity: number
    /** CSS colours; empty takes the site's --gray-main and --white */
    ink: string
    background: string
    /** Size of the form, where the crater sits, and an optional push in at the
        start (how many times closer it ends than it starts, 1 = none, over s) */
    zoom: number
    offsetX: number
    offsetY: number
    pushIn: number
    pushTime: number
    /** The crater: radius, depth, the raised lip round it (height, width) and the
        small bump in its middle */
    craterRadius: number
    craterDepth: number
    craterFloor: number
    craterTiltX: number
    craterTiltY: number
    rimHeight: number
    rimWidth: number
    bump: number
    /** Ridges round the crater: height, spacing, how many before they die away,
        and how fast they drift outward (frame widths per second) */
    ringHeight: number
    ringSpacing: number
    rings: number
    ringDrift: number
    ringBreak: number
    /** Ridges stronger on one side (0 even, 1 one side only) and which side (degrees) */
    ringSide: number
    ringSideAngle: number
    /** Broad slow swell, and a soft ridge running out from the crater (height,
        direction in degrees, sideways offset) */
    undulate: number
    undulateScale: number
    fold: number
    foldAngle: number
    foldOffset: number
    /** Light: how steep the heights read, direction (degrees, 0 from the right,
        90 from above) and height above the surface (degrees), and how far and fast
        it sways */
    relief: number
    lightAngle: number
    lightHeight: number
    lightSway: number
    lightSpeed: number
    /** The light follows the pointer: angle up to 34° either way, height up to 15° */
    lightFollow: boolean
    /** The crater's wall: its own light height (degrees) and extra relief */
    wallLightHeight: number
    wallRelief: number
    /** Extra ink on the wall nearest the light, and light taken off the wall across */
    wallDark: number
    wallSweep: number
    /** Light for the ridges and everything outside the crater: from (degrees), height (degrees) */
    ringLightAngle: number
    ringLightHeight: number
    /** A bright sweep across the crater floor, on the side away from the light */
    floorSweep: number
    /** A torn white margin kept at the frame's edges (frame widths), and how warped the early lobes are */
    margin: number
    lobeWarp: number
    /** Early lobes that join later, and the stain's final outline (share of the way to
        the far corner) and how irregular it is */
    lobes: number
    outline: number
    outlineNoise: number
    /** Flow the marks follow: round the crater, curl noise, its scale and drift */
    swirl: number
    curl: number
    flowFreq: number
    flowDrift: number
    /** Reveal: seconds it takes, delay before it starts, easing */
    revealTime: number
    revealDelay: number
    revealEase: Ease
    /** Where it starts, frame widths from the middle */
    revealX: number
    revealY: number
    /** How far in from the front marks thin out (share of the frame) */
    revealSoft: number
    /** The core always shown round the origin (share of the way to the far corner)
        and how soft and torn its rim is */
    core: number
    coreEdge: number
    /** Watercolour spread: how far the wetter directions run ahead early and ease out
        (1 even everywhere; never speeds up, every direction reaches its outline at the end),
        how lopsided the wet paper makes it and at what scale, feathered fingers,
        strands curling off along the flow and their scale, the pigment rim's
        darkness and width, granulation, loose islands ahead of the front, and how
        far the edge creeps while it spreads */
    spread: number
    wetness: number
    wetScale: number
    feather: number
    tendrils: number
    tendrilScale: number
    edgeDark: number
    edgeBand: number
    granulation: number
    blooms: number
    islandReach: number
    creep: number
    /** Ripples, like a drop in water: height, ring width (half a wavelength), how
        far and how long (s) they run, extra light and shadow, how often a drop
        falls (s; 0 = only with the reveal), rings per drop, how much they stretch
        as they travel, the share of the run spent fading out, how far they shift
        and turn the marks, and how often (per second) a smaller drop falls nearby */
    shockHeight: number
    shockWidth: number
    shockReach: number
    shockTime: number
    shockTone: number
    shockEvery: number
    /** Seconds after the middle has revealed before the first drop falls */
    shockDelay: number
    /** Seconds the first drop takes to fade in (later ones fade in over 12% of their run) */
    shockFirstFade: number
    shockRings: number
    shockStretch: number
    shockFade: number
    shockRefract: number
    shockSecondary: number
    /** The opening bounce, a drop hitting water: on or off; the dome's height, how
        fast it springs (Hz) and dies away (s), its radius, how fast its ring runs out
        and how wide it is, and how much the marks point out from the middle meanwhile */
    bounceOn: boolean
    bounceHeight: number
    bounceFreq: number
    bouncePhase: number
    bounceDamp: number
    bounceSize: number
    bounceSpeed: number
    bounceWidth: number
    bounceRadial: number
    /** The opening's crater: its ink before the rim grows in, and when (s) and over
        how long (s) the rim grows in from the top */
    introInk: number
    introSwing: number
    /** Share of marks dropped in the splash, so they read as separate strokes */
    splashThin: number
    /** The impact, a heavy object dunked in the middle: on or off (on replaces the
        dome bounce and the first drop); the cavity's depth and the object's size; how
        fast (s) it sinks and how long (s) it holds; the centre's rebound (Hz) and how
        fast (s) it settles; how fast the rings run out, die away (s), widen
        (dispersion), how strong they are and how far they carry; how far they shove
        the surface; how strongly they are shaded; how hard the leading ring kicks the
        reveal out; and a camera jolt (share of the scale) */
    impactOn: boolean
    impactDepth: number
    impactSize: number
    impactAttack: number
    impactHold: number
    impactRebound: number
    impactDamp: number
    waveSpeed: number
    waveDecay: number
    waveDisp: number
    waveRings: number
    waveReach: number
    impactPush: number
    impactShade: number
    impactKick: number
    impactJolt: number
    /** The middle grows with the impact: the crater starts at this share of its size
        and eases out to full over impactGrowTime s */
    impactGrowFrom: number
    impactGrowTime: number
    /** The impact roughens the middle's rim, leaves a wobbly inner ring, and how long (s) they settle */
    impactDisturb: number
    impactInnerRing: number
    impactDisturbSettle: number
    rimStart: number
    rimTime: number
    /** Liquid turbulence over everything: on or off; strength (px at a 1000 px wide
        frame); swirl size (per frame width); speed; octaves (1..4); domain warp;
        how much it turns (curl) rather than pushes (0..1); drift direction (degrees)
        and speed (frame widths per second); small eddies (each octave's share);
        surface light and shade; caustics; ease off toward the frame edges (share of
        the frame); and how hard a ripple pushes it */
    turbOn: boolean
    /** "move": the liquid moves what each mark shows, marks keep their shape;
        "warp": the finished image is warped, marks stretch with it */
    turbMode: "move" | "warp"
    turbStrength: number
    turbScale: number
    turbSpeed: number
    turbOctaves: number
    turbWarp: number
    turbSwirl: number
    turbDriftAngle: number
    turbDriftSpeed: number
    turbEddies: number
    turbShade: number
    turbCaustics: number
    turbEdge: number
    turbRipple: number
    /** Calm round the crater (radius, frame widths; 0 none), and a burst at the start
        that settles: how many times stronger and faster it starts, and how long (s)
        it takes to settle */
    turbCalm: number
    turbBurst: number
    turbSettle: number
    /** How long (s) the calm middle takes to set in (it starts with none), and how far
        the surface drifts out from the crater over the reveal (share of its distance) */
    turbCalmTime: number
    turbOutward: number
    /** The reveal out (a loader's exit): seconds it takes, its easing, how soft and
        torn the clearing edge is, how far the camera pushes in (times), and whether a
        last drop falls as it starts */
    exitStyle: "open through" | "dry out" | "wash away"
    exitTime: number
    exitEase: Ease
    /** Loader time (s) the scrubbed reveal out starts from (after the reveal has settled) */
    exitStart: number
    exitSoft: number
    exitTear: number
    exitPush: number
    exitRipple: boolean
    /** The click-to-enter gate (browsers need a click before sound): on or off (the
        site can turn it off), the faint opacity while waiting, the label (mouse) and
        its touch version, and the transition on entering: how long (s), and its style
        ("dissolve": the faint frame lifts away in watercolour patches from the middle
        out; "fade": a plain fade). It's a layer over the real opening, which it never
        changes. */
    gateOn: boolean
    gateOpacity: number
    /** While the gate waits: how much faster the form drifts, and how much further. Faint as it is,
        at the speed that suits the full-strength form it looks almost still */
    gateSpeed: number
    gateSway: number
    gateText: string
    gateTouchText: string
    gateTime: number
    /** The cursor label's size (px) */
    gateLabelSize: number
    /** Where the pointer already is (px), so the label starts there instead of waiting for it to move */
    gateAt: { x: number; y: number } | null
    /** A short buffer (s) between the click and the impact, so audio is ready to play it */
    gateDelay: number
    gateTransition: "dissolve" | "fade"
    /** A click after the gate replays the reveal; the site's loader turns this off, so a
        second click cannot start it again */
    clickReplay: boolean
    /** Sound: on or off, master volume, and the levels of the impact recording, the
        ripple-drop recording and the waves (made in the browser), and how much the
        waves swell with each ring */
    soundOn: boolean
    soundVolume: number
    soundImpact: number
    soundRipple: number
    /** Each ripple plays a little faster or slower, by up to this share, so repeats differ */
    rippleVary: number
    /** Level of the ring travelling through the marks, and its delay after the drop (s) */
    soundTravel: number
    travelDelay: number
    soundWaves: number
    waveDepth: number
    /** Shows the tuning panel */
    gui: boolean
}

export const defaults: Options = {
    cell: 2,
    markLength: 1.1,
    curve: 0.65,
    markWidth: 0.8,
    widthShade: 1.45,
    jitter: 0.3,
    variety: 0.8,
    density: 3.2,
    base: 0.44,
    shadowStart: 0.15,
    shadowFull: 1,
    opacity: 0.8,
    ink: "",
    background: "",
    zoom: 1.21,
    offsetX: -0.03,
    offsetY: 0.0275,
    pushIn: 1.9,
    pushTime: 2.1,
    craterRadius: 0.1,
    craterDepth: 0.01,
    craterFloor: 0.43,
    craterTiltX: 0.1,
    craterTiltY: -0.3,
    rimHeight: 0.015,
    rimWidth: 0.045,
    bump: 0,
    ringHeight: 0.01,
    ringSpacing: 0.2,
    rings: 4,
    ringDrift: 0.01,
    ringBreak: 0.55,
    ringSide: 0.3,
    ringSideAngle: 180,
    undulate: 0.01,
    undulateScale: 5,
    fold: 0,
    foldAngle: 38.125,
    foldOffset: 0,
    relief: 0.7,
    lightAngle: 134.38,
    lightHeight: 25,
    lightSway: 20,
    lightSpeed: 0.4,
    lightFollow: false,
    wallLightHeight: 25,
    wallRelief: 1.7,
    wallDark: 0.08,
    wallSweep: 0.1,
    ringLightAngle: 146.38,
    ringLightHeight: 28,
    floorSweep: 0.5,
    margin: 0,
    lobeWarp: 0.5,
    lobes: 1,
    outline: 1.3,
    outlineNoise: 0.21,
    swirl: 0.75,
    curl: 2.35,
    flowFreq: 1.4,
    flowDrift: 0.95,
    revealTime: 3,
    revealDelay: 0,
    revealEase: "linear",
    revealX: -0.0125,
    revealY: 0.0562,
    revealSoft: 0.12,
    core: 0.135,
    coreEdge: 0.06,
    spread: 0.7,
    wetness: 0.7,
    wetScale: 1.5,
    feather: 0,
    tendrils: 0.25,
    tendrilScale: 3,
    edgeDark: 0.8,
    edgeBand: 4,
    granulation: 0,
    blooms: 1.6,
    islandReach: 0.8,
    creep: 1.55,
    shockHeight: 0.004,
    shockWidth: 0.06,
    shockReach: 0.6,
    shockTime: 6,
    shockTone: 2,
    shockEvery: 5,
    shockDelay: 0,
    shockFirstFade: 0.1,
    shockRings: 1,
    shockStretch: 0.35,
    shockFade: 0.35,
    shockRefract: 0.6,
    shockSecondary: 0.4,
    bounceOn: true,
    bounceHeight: 0.05,
    bounceFreq: 4,
    bouncePhase: -83,
    bounceDamp: 0.3,
    bounceSize: 0.08,
    bounceSpeed: 0.4,
    bounceWidth: 0.03,
    bounceRadial: 5.5,
    introInk: 0.2,
    introSwing: 0.2,
    splashThin: 0.1,
    impactOn: true,
    impactDepth: 0.095,
    impactSize: 0.05,
    impactAttack: 0.02,
    impactHold: 0.1,
    impactRebound: 3.5,
    impactDamp: 0.15,
    waveSpeed: 0.6,
    waveDecay: 4,
    waveDisp: 0.4,
    waveRings: 1.5,
    waveReach: 0.22,
    impactPush: 0.02,
    impactShade: 1,
    impactKick: 2,
    impactJolt: 0.006,
    impactGrowFrom: 0.35,
    impactGrowTime: 0.7,
    impactDisturb: 1,
    impactInnerRing: 0.6,
    impactDisturbSettle: 0.8,
    rimStart: 0.28,
    rimTime: 0.2,
    turbOn: true,
    turbMode: "move",
    turbStrength: 4,
    turbScale: 0.5,
    turbSpeed: 0.1,
    turbOctaves: 3,
    turbWarp: 0.7,
    turbSwirl: 0.8,
    turbDriftAngle: 20,
    turbDriftSpeed: 0.01,
    turbEddies: 0.35,
    turbShade: 0,
    turbCaustics: 0,
    turbEdge: 0.04,
    turbRipple: 1,
    turbCalm: 0.15,
    turbBurst: 1,
    turbSettle: 0.1,
    turbCalmTime: 0.5,
    turbOutward: 0,
    exitStyle: "open through",
    exitTime: 2,
    exitStart: 4,
    exitEase: "linear",
    exitSoft: 0.21,
    exitTear: 3,
    exitPush: 1.25,
    exitRipple: true,
    gateOn: true,
    gateOpacity: 0.15,
    gateSpeed: 2.5,
    gateSway: 1.4,
    gateText: "click to enter",
    gateTouchText: "tap to enter",
    gateTime: 0.6,
    gateLabelSize: 20,
    gateAt: null,
    gateDelay: 0.25,
    gateTransition: "dissolve",
    clickReplay: true,
    soundOn: true,
    soundVolume: 0.5,
    soundImpact: 0.8,
    soundRipple: 0.5,
    rippleVary: 0.04,
    soundTravel: 0.12,
    travelDelay: 0,
    soundWaves: 0.6,
    waveDepth: 0.7,
    gui: import.meta.env.DEV,
}

type NumKey = { [K in keyof Options]: Options[K] extends number ? K : never }[keyof Options]

const MIN_QUALITY = 0.5 // lowest share of the device pixel ratio (tier 3)
// A high refresh rate is no reason to draw this flat out: the GPU would have nothing left, and a
// saturated GPU is what makes the page and the cursor pill lag
const MAX_FRAME = 1000 / 60 // ms; at most this often
const SLOW_GAP = 300 // ms between two gate frames: slower than this twice running and the gate stands still
const STILL_MS = 60 // ms of the main thread in one draw of the gate: twice in a row and the gate stands still
const BIG_MS = 400 // ...or once, if it is this long
const GATE_FRAME = 1000 / 30 // ms; while the gate waits: faint and slow, it doesn't show

// Quality tiers: what the device's GPU actually manages decides how much it draws, so a strong
// phone (or any laptop) gets the full look and a mid-range one (a Moto G52, Adreno 610) steps down
// only as far as it has to. Measured on this machine's integrated GPU at 402 x 874 @3x (804 x 1748
// drawn), per frame: form 3.1 ms, liquid 0.6, marks 3.8, so 7.2 ms at tier 0 and 5.6 at tier 1; a
// mid-range phone's GPU is several times slower
export const TIERS = [
    // 0: the full look: the form and the liquid on a quarter of the buffer, 2x, 60 a second
    { pass: 4, quality: 1, frame: MAX_FRAME },
    // 1: the form and the liquid on a sixth (the marks keep their crisp hatching; the stain's
    // feathered edge is a touch rougher)
    { pass: 6, quality: 1, frame: MAX_FRAME },
    // 2: the same picture drawn 30 times a second
    { pass: 6, quality: 1, frame: GATE_FRAME },
    // 3: the lowest resolution (1x: the hatching turns soft), 30 a second
    { pass: 4, quality: MIN_QUALITY, frame: GATE_FRAME },
]
// Every threshold of the tier choice, in one place, to tune from a real phone
export const TUNING = {
    // The benchmark, while the gate waits: the GPU time of a frame (a timer query where the browser
    // has one, else a fence polled from the page; median of `samples` frames after `warmup`)
    // must fit these to keep a tier at 60 a second (tiers 0 and 1) or 30 (tier 2); the gate draws
    // only 30 a second, so each frame is timed on an idle GPU
    budget60: 13, // ms, of 16.7, on a touch screen: the page and the browser's compositing of a
    // window three times as dense need the rest
    budget60Desk: 15.5, // ms, with a mouse: a desktop's compositing costs little (a laptop's integrated
    // GPU at 1440 x 900 drawn at 1.5x measures 14.2 ms and holds 60, so it keeps the full look)
    budget30: 26, // ms, of 33.3
    warmup: 8, // gate frames first (shaders compiling, the fade in)
    samples: 7,
    // Without a GPU timer (iOS Safari, Firefox): the median time between `paceSamples` frames
    // drawn at the tier's own pace must stay within `paceSlack` times that pace
    paceSamples: 20,
    paceSlack: 1.15,
    // A device started at tier 1 by a hint goes back to tier 0 if its cost times this still fits
    up: 1.35,
    // Frame pacing (any time, also when the benchmark had no time: a tap in its first second):
    // frames averaging over `slow` times the tier's own pace for `slowFor` ms step one tier down
    slow: 1.25,
    slowFor: 750, // ms
    // ...with a mouse as lenient as the watchdog was before the tiers
    slowDesk: 1.4,
    slowForDesk: 1500, // ms
    // A tier forced with ?loader= gives way only when frames average over this times its pace
    collapse: 2.5,
}
// Hints, only for the tier a device starts at, never to hold it down: a GPU known to be mid-range
// or slower, or a touch device with few cores or little memory, starts at tier 1 (and is still
// measured, and goes back to 0 if it can). Apple's GPUs say only "Apple GPU", so iPhones start at 0
const WEAK_GPU = /Adreno \(TM\) [1-6]\d\d\b|Adreno [1-6]\d\d\b|Mali-(T|4|G[1-6]\d\b)|PowerVR|SwiftShader|llvmpipe|Software/i
const DEG = Math.PI / 180

const mount: Mount<Options> = (canvas, options) => {
    const c: Options = { ...defaults, ...options }

    // Colours come from the site's tokens; the named fallbacks only matter outside it (Framer)
    const css = getComputedStyle(canvas)
    const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
    const ink = c.ink || token("--gray-main", "black")
    const background = c.background || token("--white", "white")

    // The marks antialias themselves, so no MSAA
    // Transparent, premultiplied canvas, so the reveal out can open onto the page
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" })
    const screenCamera = new THREE.Camera()

    // State the timeline drives: the reveal, the push in, and the fade a loader exit uses
    const state = { reveal: 1, push: 1, fade: 1, exit: 0, paper: 1 }

    // Pass 1 target: shade, flow angle and reveal per pixel, at a quarter of the
    // drawing buffer (marks only read it at their cell centres). Float where the GPU
    // can render to it; the values fit 8 bits otherwise.
    const canFloat = renderer.extensions.has("EXT_color_buffer_half_float") || renderer.extensions.has("EXT_color_buffer_float")
    const target = new THREE.WebGLRenderTarget(1, 1, {
        type: canFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
    })

    const u = {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uCenter: { value: new THREE.Vector2(c.offsetX, c.offsetY) },
        uScale: { value: c.zoom },
        uCraterR: { value: c.craterRadius },
        uCraterDepth: { value: c.craterDepth },
        uCraterFloor: { value: c.craterFloor },
        uCraterTilt: { value: new THREE.Vector2(c.craterTiltX, c.craterTiltY) },
        uRimH: { value: c.rimHeight },
        uRimW: { value: c.rimWidth },
        uBumpH: { value: c.bump },
        uRingH: { value: c.ringHeight },
        uRingSpacing: { value: c.ringSpacing },
        uRingCount: { value: c.rings },
        uRingPhase: { value: 0 },
        uRingBreak: { value: c.ringBreak },
        uRingSide: { value: c.ringSide },
        uRingSideAngle: { value: c.ringSideAngle * DEG },
        uUndulate: { value: c.undulate },
        uUndulateScale: { value: c.undulateScale },
        uFold: { value: c.fold },
        uFoldAngle: { value: c.foldAngle * DEG },
        uFoldOffset: { value: c.foldOffset },
        uDropAt: { value: [0, 1, 2, 3].map(() => new THREE.Vector2()) },
        uDropFront: { value: new THREE.Vector4() },
        uDropAmp: { value: new THREE.Vector4() },
        uDropLen: { value: new THREE.Vector4(1, 1, 1, 1) },
        uRings: { value: c.shockRings },
        uBounceT: { value: 0 },
        uBounceAmp: { value: 0 },
        uBounceFreq: { value: c.bounceFreq },
        uBouncePhase: { value: 0 },
        uBounceDamp: { value: c.bounceDamp },
        uBounceSize: { value: c.bounceSize },
        uBounceSpeed: { value: c.bounceSpeed },
        uBounceWidth: { value: c.bounceWidth },
        uBounceRadial: { value: c.bounceRadial },
        uIntroOn: { value: 0 },
        uIntroInk: { value: c.introInk },
        uIntroSwing: { value: c.introSwing },
        uSplashThin: { value: c.splashThin },
        uImpactOn: { value: 0 },
        uImpactDepth: { value: c.impactDepth },
        uImpactSize: { value: c.impactSize },
        uImpactAttack: { value: c.impactAttack },
        uImpactHold: { value: c.impactHold },
        uImpactRebound: { value: c.impactRebound },
        uImpactDamp: { value: c.impactDamp },
        uWaveSpeed: { value: c.waveSpeed },
        uWaveDecay: { value: c.waveDecay },
        uWaveDisp: { value: c.waveDisp },
        uWaveRings: { value: c.waveRings },
        uWaveReach: { value: c.waveReach },
        uImpactPush: { value: c.impactPush },
        uImpactShade: { value: c.impactShade },
        uImpactKick: { value: c.impactKick },
        uDisturb: { value: c.impactDisturb },
        uInnerRing: { value: c.impactInnerRing },
        uDisturbSettle: { value: c.impactDisturbSettle },
        uRimStart: { value: c.rimStart },
        uRimTime: { value: c.rimTime },
        uRelief: { value: c.relief },
        uLight: { value: new THREE.Vector3(0, 0, 1) },
        uWallLight: { value: new THREE.Vector3(0, 0, 1) },
        uWallRelief: { value: c.wallRelief },
        uWallDark: { value: c.wallDark },
        uWallSweep: { value: c.wallSweep },
        uRingLight: { value: new THREE.Vector3(0, 0, 1) },
        uFloorSweep: { value: c.floorSweep },
        uMargin: { value: c.margin },
        uLobeWarp: { value: c.lobeWarp },
        uLobes: { value: c.lobes },
        uOutline: { value: c.outline },
        uOutlineNoise: { value: c.outlineNoise },
        uInkLo: { value: c.shadowStart },
        uInkHi: { value: c.shadowFull },
        uShockTone: { value: c.shockTone },
        uWaveSlope: { value: 1 },
        uRefract: { value: c.shockRefract },
        uSwirl: { value: c.swirl },
        uCurl: { value: c.curl },
        uFlowFreq: { value: c.flowFreq },
        uFlowDrift: { value: c.flowDrift },
        uReveal: { value: state.reveal },
        uExit: { value: 0 },
        uExitSoft: { value: c.exitSoft },
        uExitTear: { value: c.exitTear },
        uExitStyle: { value: 0 },
        uRevealOrigin: { value: new THREE.Vector2(c.revealX, c.revealY) },
        uRevealSoft: { value: c.revealSoft },
        uCore: { value: c.core },
        uCoreEdge: { value: c.coreEdge },
        uSpread: { value: c.spread },
        uWetness: { value: c.wetness },
        uWetScale: { value: c.wetScale },
        uFeather: { value: c.feather },
        uTendrils: { value: c.tendrils },
        uTendrilScale: { value: c.tendrilScale },
        uEdgeDark: { value: c.edgeDark },
        uEdgeBand: { value: c.edgeBand },
        uGranulation: { value: c.granulation },
        uBlooms: { value: c.blooms },
        uIslandReach: { value: c.islandReach },
        uCreep: { value: c.creep },
    }
    const quad = new THREE.PlaneGeometry(2, 2)
    const fieldScene = new THREE.Scene()
    const field = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: u, vertexShader: fieldVertex, fragmentShader: fieldFragment, depthTest: false, depthWrite: false }))
    field.frustumCulled = false
    fieldScene.add(field)

    // Pass 2: a full-screen quad that draws the marks. The shader writes the token
    // colours as they are, so convert them back from three's linear space.
    const m = {
        tForm: { value: target.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uPx: { value: 1 },
        uCell: { value: c.cell },
        uLength: { value: c.markLength },
        uCurve: { value: c.curve },
        uWidth: { value: c.markWidth },
        uWidthShade: { value: c.widthShade },
        uJitter: { value: c.jitter },
        uVariety: { value: c.variety },
        uOpacity: { value: c.opacity },
        uDensity: { value: c.density },
        uBase: { value: c.base },
        uGrain: { value: 0.5 },
        uInk: { value: new THREE.Color(ink).convertLinearToSRGB() },
        uBg: { value: new THREE.Color(background).convertLinearToSRGB() },
        uPaper: { value: 1 },
    }
    const marksScene = new THREE.Scene()
    const marks = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: m, vertexShader: marksVertex, fragmentShader: marksFragment, depthTest: false, depthWrite: false }))
    marks.frustumCulled = false
    marksScene.add(marks)

    // Pass 3 (optional): the liquid turbulence. The marks are drawn into a texture the
    // size of the screen, then sampled through the flowing liquid. When it's off this
    // target and pass are skipped, so it costs nothing.
    const scene = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false })
    // The flow itself is smooth, so it is worked out at a quarter of the size
    const flowTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false })
    const tf = {
        uRes: m.uRes,
        uTime: { value: 0 },
        uScale: { value: c.turbScale },
        uOctaves: { value: c.turbOctaves },
        uWarp: { value: c.turbWarp },
        uSwirl: { value: c.turbSwirl },
        uDrift: { value: new THREE.Vector2() },
        uEddies: { value: c.turbEddies },
        uEdge: { value: c.turbEdge },
        uCenter: u.uCenter,
        uScaleForm: u.uScale,
        uDropFront: u.uDropFront,
        uDropAmp: u.uDropAmp,
        uDropLen: u.uDropLen,
        uRipplePush: { value: c.turbRipple },
        uCalm: { value: c.turbCalm },
        uOutward: { value: 0 },
        uStrengthRef: { value: 1 },
    }
    const flowScene = new THREE.Scene()
    const flowQuad = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: tf, vertexShader: turbVertex, fragmentShader: turbFieldFragment, depthTest: false, depthWrite: false }))
    flowQuad.frustumCulled = false
    flowScene.add(flowQuad)
    const tu = {
        tScene: { value: scene.texture },
        tFlow: { value: flowTarget.texture },
        uRes: m.uRes,
        uStrength: { value: 0 },
        uShade: { value: c.turbShade },
        uCaustics: { value: c.turbCaustics },
        uInk: m.uInk,
        uBg: m.uBg,
    }
    // In "move" mode the marks pass reads the liquid itself
    Object.assign(m, {
        tFlow: { value: flowTarget.texture },
        uTurbMove: { value: 0 },
        uTurbStrength: tu.uStrength,
        uTurbShade: { value: 0 },
        uTurbCaustics: { value: 0 },
    })
    const mt = m as typeof m & { uTurbMove: { value: number }; uTurbShade: { value: number }; uTurbCaustics: { value: number } }
    const turbScene = new THREE.Scene()
    const turb = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: tu, vertexShader: turbVertex, fragmentShader: turbFragment, depthTest: false, depthWrite: false }))
    turb.frustumCulled = false
    turbScene.add(turb)
    // Under reduced motion the liquid holds still
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    // Under reduced motion the opening doesn't bounce: no impact, dome bounce, splash
    // swing or first drop
    // The loader's state on the document root, so the page can keep its own content
    // hidden while the loader covers it: data-loader="active" while it runs (and while
    // the gate waits), "out" during the reveal out, and removed once out() resolves
    const loaderState = (v?: "active" | "out") => {
        if (v) document.documentElement.setAttribute("data-loader", v)
        else document.documentElement.removeAttribute("data-loader")
    }
    // While the gate waits, nothing hits the water
    let gated = false
    const impactActive = () => c.impactOn && !still && !gated
    let turbTime = 0
    // The burst: stronger and faster as the reveal starts, settling over turbSettle s
    const burst = () => 1 + (c.turbBurst - 1) * Math.exp(-introTime / Math.max(c.turbSettle, 0.05))

    // The intro: only the reveal (and an optional push in) runs; the form is
    // otherwise fully there from the first frame
    // Sound, made in the browser; silent until the first click or key
    const sound = createSound(
        () => ({
            on: c.soundOn,
            volume: c.soundVolume,
            impact: c.soundImpact,
            ripple: c.soundRipple,
            rippleVary: c.rippleVary,
            travel: c.soundTravel,
            travelDelay: c.travelDelay,
            ringTime: c.shockTime,
            ringFade: c.shockFade,
            waves: c.soundWaves,
            waveDepth: c.waveDepth,
        }),
        { impact: impactUrl, ripple: rippleUrl, travel: travelUrl }
    )
    const intro = gsap.timeline({ paused: true })
    const playIntro = () => {
        loaderState("active")
        scrubbing = false
        sound.mute(gated)
        sound.replay()
        // a replay starts on still water
        drops.forEach((d) => (d.at = -1e9))
        intro.clear()
        intro
            .set(state, { reveal: 0, fade: 1, exit: 0, paper: 1, push: 1 / Math.max(c.pushIn, 1) }, 0)
            .call(() => impactActive() && (impactScheduled ? (impactScheduled = false) : sound.impact()), [], c.revealDelay)
            .call(() => (exitScrub = 0), [], 0)
            .to(state, { reveal: 1, duration: c.revealTime, ease: EASES[c.revealEase] }, c.revealDelay)
            // Fast at first, then easing in to a stop, as measured on the reference
            .fromTo(state, { push: 1 / Math.max(c.pushIn, 1) }, { push: 1, duration: c.pushTime, ease: "power2.out" }, 0)
            // The ripple fires as soon as the middle has revealed: when the crater's rim
            // has grown in (or straight away without the intro bounce)
            .call(() => !impactActive() && !still && fireFirstShock(), [], c.revealDelay + (c.bounceOn ? c.rimStart + 1.3 * c.rimTime : 0) + c.shockDelay)
            // with the impact on, the regular drops start counting from it
            .call(() => impactActive() && (lastDrop = time), [], c.revealDelay)
        introTime = 0
    }
    // The reveal out, the exit a loader uses: a last drop falls, the paper clears
    // from the middle outward with a torn edge as the camera pushes in, and the last
    // ink fades. Resolves when it's done.
    // The reveal out posed at progress v (0 before it, 1 at its end), on the same
    // curves it plays with, so scrubbing shows exactly the frames it plays
    let exitScrub = 0
    const poseExit = (v: number) => {
        exitScrub = v
        state.reveal = 1
        state.exit = gsap.parseEase(EASES[c.exitEase])(v)
        state.push = 1 + (c.exitPush - 1) * gsap.parseEase("power2.in")(v)
        state.fade = 1 - gsap.parseEase("power1.in")(Math.min(Math.max((v - 0.6) / 0.4, 0), 1))
        state.paper = 1 - Math.min(Math.max((v - 0.75) / 0.25, 0), 1)
    }
    const holdIntro = () => {
        introTime = intro.duration()
        intro.progress(1, true)
    }
    // Plays the rest of the reveal out from where the scrub sits
    // Scrubbing holds every clock at exitStart + v × duration, so a held frame is
    // fully still and a scrub value always gives the same picture, last drop included
    let scrubbing = false
    const scrubExit = (v: number) => {
        scrubbing = true
        sound.mute(true)
        holdIntro()
        time = c.exitStart + v * c.exitTime
        turbTime = c.turbSpeed * time
        // the intro's own clocks (impact tail, bounce) read the same moment too
        introTime = time
        drops.forEach((d) => (d.at = -1e9))
        nextDrop = 0
        if (c.exitRipple && !still) {
            const now = time
            time = c.exitStart
            fireShock()
            time = now
        }
        lastTick = time
        poseExit(v)
        render()
    }
    const playExitFromScrub = () => {
        scrubbing = false
        sound.mute(false)
        holdIntro()
        intro.clear()
        const from = { v: exitScrub }
        intro.to(from, { v: 1, duration: (1 - exitScrub) * c.exitTime, ease: "none", onUpdate: () => poseExit(from.v) }, introTime)
    }
    const playExit = () =>
        new Promise<void>((done) => {
            scrubbing = false
            loaderState("out")
            sound.mute(false)
            sound.out(c.exitTime)
            intro.clear()
            const t0 = introTime
            // Reduced motion: a short plain fade
            if (still) {
                intro.to(state, { fade: 0, paper: 0, duration: 0.2, ease: "none" }, t0).call(() => loaderState(), [], t0 + 0.2).call(done, [], t0 + 0.2)
                return
            }
            const T = c.exitTime
            intro
                .call(() => c.exitRipple && fireShock(), [], t0)
                .to(state, { exit: 1, duration: T, ease: EASES[c.exitEase] }, t0)
                .to(state, { push: state.push * c.exitPush, duration: T, ease: "power2.in" }, t0)
                .to(state, { fade: 0, duration: T * 0.4, ease: "power1.in" }, t0 + T * 0.6)
                .to(state, { paper: 0, duration: T * 0.25, ease: "none" }, t0 + T * 0.75)
                .call(() => (exitScrub = 1), [], t0 + T)
                .call(() => loaderState(), [], t0 + T)
                .call(done, [], t0 + T)
        })

    // Ripples, like drops falling in water: each drop sends a short train of rings
    // out from where it fell. The rings stretch as they travel, fade in, fall off
    // with distance and fade out by the reach. Four drops can overlap; a new one
    // takes the oldest slot. Everything runs on the clock, not the frame rate.
    const drops = [0, 1, 2, 3].map(() => ({ at: -1e9, size: 0, fadeIn: 0.12 }))
    let nextDrop = 0
    let lastDrop = -1
    let lastTick = 0
    const drop = (size: number, offset?: THREE.Vector2, fadeIn = 0.12) => {
        const slot = nextDrop
        nextDrop = (nextDrop + 1) % drops.length
        drops[slot].at = time
        drops[slot].size = size
        drops[slot].fadeIn = fadeIn
        u.uDropAt.value[slot].set(0, 0)
        if (offset) u.uDropAt.value[slot].copy(offset)
        // While the gate waits they fall in silence: nothing may sound before the first click
        if (!gated) sound.ripple(size)
    }
    function fireShock() {
        lastDrop = time
        drop(1)
    }
    // The first drop, as the middle reveals, comes in quickly so it reads straight away
    function fireFirstShock() {
        lastDrop = time
        drop(1, undefined, c.shockFirstFade / Math.max(c.shockTime, 1e-3))
    }
    const smooth = (a: number, b: number, x: number) => {
        const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
        return t * t * (3 - 2 * t)
    }
    const updateShock = () => {
        const dt = Math.min(0.1, Math.max(0, time - lastTick))
        lastTick = time
        if (c.shockEvery > 0 && (gated || lastDrop >= 0) && time - lastDrop > c.shockEvery) fireShock()
        // Now and then a smaller drop near the middle
        if (!entering && c.shockSecondary > 0 && Math.random() < c.shockSecondary * dt) {
            const a = Math.random() * Math.PI * 2
            drop(0.35 + Math.random() * 0.25, new THREE.Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(c.craterRadius * (0.3 + Math.random())))
        }
        const wave = 2 * c.shockWidth
        drops.forEach((d, i) => {
            const k = (time - d.at) / c.shockTime
            const reach = c.shockReach * k
            u.uDropFront.value.setComponent(i, reach)
            u.uDropLen.value.setComponent(i, wave * (1 + c.shockStretch * Math.max(0, k)))
            const on = k >= 0 && k < 1
            u.uDropAmp.value.setComponent(i, on ? (c.shockHeight * d.size * smooth(0, Math.max(d.fadeIn, 1e-3), k) * (1 - smooth(1 - c.shockFade, 1, k))) / Math.sqrt(1 + reach / wave) : 0)
        })
        u.uRings.value = c.shockRings
        u.uShockTone.value = c.shockTone
        u.uRefract.value = c.shockRefract
        // Slope measured against a full-height ring, so it doesn't scale twice with the height
        u.uWaveSlope.value = c.shockHeight > 0 ? wave / (c.shockHeight * Math.PI * 2) : 0
    }

    // The quality tier (see TIERS): where it starts, and whether ?loader=0..3 (or ?quality=)
    // forces one, to compare them on a phone
    const touchScreen = window.matchMedia?.("(hover: none), (pointer: coarse)").matches ?? false
    const forced = (() => {
        const q = new URLSearchParams(location.search)
        const s = q.get("loader") || q.get("quality")
        const v = s ? Number(s) : NaN
        return Number.isInteger(v) && v >= 0 && v < TIERS.length ? v : -1
    })()
    const gpuName = (() => {
        try {
            const gl = renderer.getContext()
            const info = gl.getExtension("WEBGL_debug_renderer_info")
            return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "")
        } catch {
            return ""
        }
    })()
    const nav = navigator as Navigator & { deviceMemory?: number }
    const hinted = WEAK_GPU.test(gpuName) || (touchScreen && ((nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory || 8) <= 3))
    // A GL drawn on the CPU (SwiftShader, llvmpipe) starts at the lowest tier outright, with no benchmark
    // (each step of which makes every target again): nothing a CPU draws holds a better one, and the
    // first frames of a higher one kept a test runner's page waiting for seconds (CI: an 8.7 s block)
    const software = /SwiftShader|llvmpipe|Software/i.test(gpuName)
    let tier = forced >= 0 ? forced : software ? TIERS.length - 1 : hinted ? 1 : 0
    const resize = () => {
        const { pass: smallPass, quality } = TIERS[tier]
        canvas.dataset.tier = String(tier)
        const w = Math.max(1, canvas.clientWidth)
        const h = Math.max(1, canvas.clientHeight)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * quality)
        renderer.setSize(w, h, false)
        const size = renderer.getDrawingBufferSize(new THREE.Vector2())
        target.setSize(Math.ceil(size.x / smallPass), Math.ceil(size.y / smallPass))
        scene.setSize(size.x, size.y)
        flowTarget.setSize(Math.ceil(size.x / smallPass), Math.ceil(size.y / smallPass))
        u.uRes.value.copy(size)
        m.uRes.value.copy(size)
        // Marks are sized against a 1000 px wide frame
        m.uPx.value = size.x / 1000
    }

    // The light leans toward the pointer
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    const onMove = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect()
        pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1
        pointer.ty = -(((e.clientY - r.top) / r.height) * 2 - 1)
    }
    // A click replays the reveal, except the click that opens the gate
    let entering = false
    // set when the gate has already scheduled the impact's sound for the opening
    let impactScheduled = false
    const onClick = () => {
        if (gated || entering || !c.clickReplay) return
        playIntro()
    }

    // The gate: the settled form, faint and silent, with a label in place of the
    // cursor (or centred on touch). Only the ink is faint: the paper stays opaque, so
    // the page underneath stays hidden until the reveal out. The first click, tap,
    // Enter or Space unlocks sound, fades the faint ink out, and the loader plays from
    // the start at full strength.
    // A touch screen: no hover, or a coarse main pointer (an iPad reports hover when it has a keyboard
    // or a trackpad, and then "(hover: none)" alone left it with a cursor pill that waits for a mouse
    // that never moves: no button at all, Vansh, 2026-11-07)
    const touch = window.matchMedia?.("(hover: none), (pointer: coarse)").matches ?? false
    // Anything that can be touched but did not say so (a touch laptop, an iPad in desktop mode): its
    // pill stands at the bottom like a touch screen's until a real mouse moves
    const maybeTouch = !touch && (navigator.maxTouchPoints ?? 0) > 0
    // The label is the cursor's stand-in (Figma node 3202:17823): a dark pill with a mouse
    // icon and the text, 6px padding and a 4px gap, Geist Light 16px in Gray/100 on a
    // gradient from Gray/700 to Gray/900, lifted by two shadows. The frame's 2.5 px backdrop blur
    // is left out: nothing shows through the opaque fill, and over a full-window canvas it was
    // costing every frame. A box-shadow, not a drop-shadow filter, for the same reason
    const label = document.createElement("div")
    Object.assign(label.style, {
        position: "fixed",
        left: "0",
        top: "0",
        zIndex: "3",
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "6px",
        background: "linear-gradient(128.5deg, var(--gray-700, #5c5c61) 0%, var(--gray-800, #434347) 21%, var(--gray-900, #2a2a2d) 40%)",
        boxShadow: "0 3px 2px color-mix(in srgb, var(--black, #000) 15%, transparent), 0 14px 12px color-mix(in srgb, var(--black, #000) 15%, transparent)",
        willChange: "transform",
        font: "300 16px/1 var(--sans, sans-serif)",
        letterSpacing: "-0.03em",
        textTransform: "lowercase",
        color: "var(--gray-100, #ededee)",
        whiteSpace: "nowrap",
        opacity: "0",
        transition: "opacity 0.2s",
    })
    // the mouse icon, 20 px: the body, its wheel and three click rays
    label.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" style="flex:none"><rect x="4.5" y="4.5" width="11" height="15" rx="5.5" stroke="currentColor"/><rect x="9" y="7" width="2" height="5" rx="1" fill="currentColor"/><rect x="9.5" y="0" width="1" height="3" rx=".5" fill="currentColor"/><rect x="5.503" y=".999" width="1" height="3" rx=".5" fill="currentColor" transform="rotate(-30 6.003 2.499)"/><rect x="12.503" y=".999" width="1" height="3" rx=".5" fill="currentColor" transform="rotate(30 13.003 2.499)"/></svg><span></span>'
    const labelIcon = label.firstElementChild as SVGElement
    const labelText = label.lastElementChild as HTMLElement
    // On a touch screen (Figma node 3293:19891): a tap icon (a hand with three rays) in place of the
    // mouse, 14px text, 4px padding, a radial gradient from Gray/500 down to Gray/900, and four 6px
    // squares standing at its outer corners like selection handles, down the screen's bottom, 60px up
    const tapIcon = document.createElement("span")
    tapIcon.style.cssText = "display:none;flex:none;width:16px;height:16px"
    tapIcon.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="display:block;overflow:visible"><path transform="translate(2 3.8)" d="M2.49586 11L0.663358 7.875C0.500212 7.58805 0.457187 7.24822 0.543672 6.92967C0.630157 6.61112 0.839131 6.3397 1.12499 6.17466C1.41085 6.00961 1.75039 5.96433 2.06951 6.0487C2.38863 6.13307 2.66142 6.34024 2.82836 6.625L3.99586 8.5V1.75C3.99586 1.41848 4.12755 1.10054 4.36197 0.866117C4.5964 0.631696 4.91434 0.5 5.24586 0.5C5.57738 0.5 5.89532 0.631696 6.12974 0.866117C6.36416 1.10054 6.49586 1.41848 6.49586 1.75V5.25C6.49586 4.91848 6.62755 4.60054 6.86197 4.36612C7.0964 4.1317 7.41434 4 7.74586 4C8.07738 4 8.39532 4.1317 8.62974 4.36612C8.86416 4.60054 8.99586 4.91848 8.99586 5.25V6.25C8.99586 5.91848 9.12755 5.60054 9.36197 5.36612C9.5964 5.1317 9.91434 5 10.2459 5C10.5774 5 10.8953 5.1317 11.1297 5.36612C11.3642 5.60054 11.4959 5.91848 11.4959 6.25V8.5C11.4959 10 10.9959 11 10.9959 11" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><rect x="6.72" y="0" width="1" height="3" rx=".5" fill="currentColor"/><rect x="3.72" y="1" width="1" height="3" rx=".5" fill="currentColor" transform="rotate(-30 4.22 2.5)"/><rect x="9.72" y="1" width="1" height="3" rx=".5" fill="currentColor" transform="rotate(30 10.22 2.5)"/></svg>'
    labelIcon.after(tapIcon)
    const handles = (
        [
            ["left:-6px;top:-6px", "var(--gray-700, #5c5c61)"],
            ["right:-6px;top:-6px", "var(--gray-900, #2a2a2d)"],
            ["right:-6px;bottom:-6px", "var(--gray-900, #2a2a2d)"],
            ["left:-6px;bottom:-6px", "var(--gray-800, #434347)"],
        ] as const
    ).map(([at, colour]) => {
        const h = document.createElement("i")
        h.style.cssText = `display:none;position:absolute;width:6px;height:6px;${at};background:${colour}`
        label.append(h)
        return h
    })
    // the label sits where the pointer is, in place of the cursor
    const placeLabel = (x: number, y: number) => {
        label.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%))`
    }
    // touch or reduced motion: still, centred in the lower third
    const centreLabel = () => {
        const r = canvas.getBoundingClientRect()
        label.style.transform = `translate(calc(${r.left + r.width / 2}px - 50%), ${r.top + r.height * 0.66}px)`
    }
    // The pill's two looks: the cursor's stand-in (the mouse, Figma 3202:17823) and the touch one (the
    // tap icon at the bottom of the window, Figma 3293:19891)
    const LOOKS = {
        cursor: {
            left: "0",
            top: "0",
            bottom: "",
            padding: "6px",
            font: "300 16px/1 var(--sans, sans-serif)",
            // Figma node 3298:19895 (2026-11-08): the radial gradient from Gray/500 to Gray/900 and the four
            // selection handles at its corners, as on a touch screen
            background:
                "radial-gradient(circle 120px at -28px -23px, var(--gray-500, #8e8e95) 0%, var(--gray-600, #74747b) 25%, var(--gray-700, #5c5c61) 50%, var(--gray-800, #434347) 75%, var(--gray-900, #2a2a2d) 100%)",
        },
        touch: {
            left: "50%",
            top: "auto",
            bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
            transform: "translateX(-50%)",
            padding: "4px",
            font: "300 14px/1 var(--sans, sans-serif)",
            background:
                "radial-gradient(circle 120px at -28px -23px, var(--gray-500, #8e8e95) 0%, var(--gray-600, #74747b) 25%, var(--gray-700, #5c5c61) 50%, var(--gray-800, #434347) 75%, var(--gray-900, #2a2a2d) 100%)",
        },
    }
    let touchLook = false
    const setLook = (touchy: boolean) => {
        touchLook = touchy
        Object.assign(label.style, touchy ? LOOKS.touch : LOOKS.cursor)
        labelText.textContent = touchy ? c.gateTouchText : c.gateText
        labelIcon.style.display = touchy ? "none" : ""
        tapIcon.style.display = touchy ? "block" : "none"
        for (const h of handles) h.style.display = "block"
    }
    const onGateMove = (e: PointerEvent) => {
        if (!gated || touch || still || e.pointerType === "touch") return
        // A real pointer moved: the cursor's stand-in, where it is
        if (touchLook) setLook(false)
        placeLabel(e.clientX, e.clientY)
        label.style.opacity = "1"
    }
    const settle = () => {
        intro.clear()
        introTime = 1000
        drops.forEach((d) => (d.at = -1e9))
        Object.assign(state, { reveal: 1, push: 1, fade: 1, exit: 0, paper: 1 })
    }
    const showGate = () => {
        loaderState("active")
        gated = true
        entering = false
        settle()
        sound.mute(true)
        state.fade = c.gateOpacity
        // The first ripple soon, so that it isn't still for the first few seconds
        lastDrop = time - c.shockEvery + 1
        if (!touch && !still) {
            canvas.style.cursor = "none"
            document.body.style.cursor = "none"
        }
        // no mouse on a touch screen: the tap icon, and the pill at the bottom of the window, 60px up
        setLook(touch)
        ;(canvas.parentElement ?? document.body).append(label)
        if (touch) {
            label.style.opacity = "1"
        } else if (still) {
            centreLabel()
            label.style.opacity = "1"
        } else if (c.gateAt) {
            placeLabel(c.gateAt.x, c.gateAt.y)
            label.style.opacity = "1"
        } else if (maybeTouch) {
            // No pointer has moved and the screen may be touched: the touch pill, until a mouse does
            setLook(true)
            label.style.opacity = "1"
        } else label.style.opacity = "0"
    }
    const enter = () => {
        if (!gated) return
        gated = false
        entering = true
        if (frozen) {
            frozen = false
            delete canvas.dataset.still
            last = 0
            if (running && !raf) raf = requestAnimationFrame(loop)
        }
        // No ripple, and no sound of one, in the moment before the impact
        lastDrop = -1
        label.style.opacity = "0"
        canvas.style.cursor = ""
        document.body.style.cursor = ""
        // The transition leaves the real opening untouched: the faint frame is copied
        // once onto an overlay laid exactly over the canvas, blended with multiply (so
        // its paper adds nothing), and lifts away while the opening plays underneath
        // from the start, with the impact and its sound landing on the click
        // A short buffer: wait until audio is running and the recordings are decoded
        // (at least gateDelay, at most a second), so the impact's sound plays cleanly
        // with it. The faint form keeps moving meanwhile.
        // The same on a touch screen as on a desktop (a version that did not wait for the audio on a
        // phone felt too fast, Vansh, 2026-11-07): sound.ts now also unlocks on the finger lifting, which
        // is when iOS starts audio, so this wait is over as soon as that happens instead of running out
        Promise.all([sound.ready(1), new Promise((r) => setTimeout(r, Math.max(c.gateDelay, 0) * 1000))]).then(() => {
            if (stopped) return
            // the impact's sound goes on the audio clock 50 ms ahead, and the visual
            // opening starts 50 ms from now to meet it
            const AHEAD = 0.05
            // the gate muted sound while waiting; unmute before the impact is scheduled
            sound.mute(false)
            sound.impact(AHEAD)
            impactScheduled = true
            setTimeout(() => {
            if (stopped) return
            const T = Math.max(c.gateTime, 0.01)
            render()
            // The faint frame is copied twice (the snapshot, and the overlay that lifts away) at a size
            // capped at about 1.6 million pixels: a phone's canvas is three times as dense as it is
            // wide, and copying it whole on the tap stalled the opening. The overlay is drawn at the
            // canvas's size on screen (CSS), so a smaller copy only softens the faint frame
            // On a phone the cap is the window's own size in CSS px (804 x 1748 is under 1.6 million,
            // so the copy, and the overlay redrawn and blended over the canvas every frame of the
            // dissolve, were at full size there)
            const cap = touchScreen ? Math.max(1, canvas.clientWidth * canvas.clientHeight) : 1.6e6
            const shrink = Math.min(1, Math.sqrt(cap / (canvas.width * canvas.height)))
            const snap = document.createElement("canvas")
            snap.width = Math.max(1, Math.round(canvas.width * shrink))
            snap.height = Math.max(1, Math.round(canvas.height * shrink))
            snap.getContext("2d")?.drawImage(canvas, 0, 0, snap.width, snap.height)
            const overlay = document.createElement("canvas")
            overlay.width = snap.width
            overlay.height = snap.height
            const octx = overlay.getContext("2d")!
            const r = canvas.getBoundingClientRect()
            Object.assign(overlay.style, {
                position: "fixed",
                left: `${r.left}px`,
                top: `${r.top}px`,
                width: `${r.width}px`,
                height: `${r.height}px`,
                pointerEvents: "none",
                zIndex: "2",
                mixBlendMode: "multiply",
            })
            ;(canvas.parentElement ?? document.body).append(overlay)
            // The dissolve mask: each cell of a small grid lifts at its own moment, sooner
            // near the middle, shaped by smooth value noise like the watercolour edge
            const MW = 96
            const MH = Math.max(1, Math.round((MW * overlay.height) / overlay.width))
            const mask = document.createElement("canvas")
            mask.width = MW
            mask.height = MH
            const mctx = mask.getContext("2d")!
            const img = mctx.createImageData(MW, MH)
            const hash = (x: number, y: number) => {
                const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
                return h - Math.floor(h)
            }
            const vnoise = (x: number, y: number) => {
                const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
                const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
                const a = hash(ix, iy), b = hash(ix + 1, iy), c2 = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
                return a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy
            }
            const order = new Float32Array(MW * MH)
            for (let y = 0; y < MH; y++)
                for (let x = 0; x < MW; x++) {
                    const dx = (x / MW - 0.5) * (MW / MH), dy = y / MH - 0.5
                    const dist = Math.min(1, Math.hypot(dx, dy) / Math.hypot(0.5 * (MW / MH), 0.5))
                    const n = 0.6 * vnoise(x / 9, y / 9) + 0.4 * vnoise(x / 3.5 + 17, y / 3.5 + 5)
                    order[y * MW + x] = 0.55 * dist + 0.45 * n
                }
            const dissolve = c.gateTransition === "dissolve" && !still
            const t0 = performance.now()
            const step = () => {
                const k = Math.min((performance.now() - t0) / (T * 1000), 1)
                const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2 // ease in-out
                octx.globalCompositeOperation = "copy"
                octx.drawImage(snap, 0, 0)
                octx.globalCompositeOperation = "destination-in"
                if (dissolve) {
                    // a cell is gone once the eased progress passes its order, with a soft edge
                    for (let i = 0; i < order.length; i++) {
                        const a = Math.min(Math.max((order[i] - (e * 1.25 - 0.15)) / 0.15, 0), 1)
                        img.data[i * 4 + 3] = a * 255
                    }
                    mctx.putImageData(img, 0, 0)
                    octx.imageSmoothingEnabled = true
                    octx.drawImage(mask, 0, 0, overlay.width, overlay.height)
                } else {
                    octx.fillStyle = `rgba(0,0,0,${1 - e})`
                    octx.fillRect(0, 0, overlay.width, overlay.height)
                }
                if (k < 1) requestAnimationFrame(step)
                else {
                    overlay.remove()
                    label.remove()
                    entering = false
                }
            }
            playIntro()
            step()
            }, AHEAD * 1000)
        })
    }
    const onGatePointer = () => enter()
    // the label hides when the pointer leaves the window
    const onGateLeave = (e: MouseEvent) => {
        if (!e.relatedTarget && gated && !touch && !still) label.style.opacity = "0"
    }
    document.addEventListener("mouseout", onGateLeave)
    const onGateKey = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") enter()
    }
    // As soon as the browser has it, where it can say so, not once a frame
    const gateMove = "onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove"
    window.addEventListener(gateMove, onGateMove as EventListener, { passive: true })
    window.addEventListener("pointerdown", onGatePointer)
    window.addEventListener("keydown", onGateKey)

    let running = false
    let raf = 0
    let last = 0
    let time = 0
    let introTime = 0
    let frameAvg = 16
    let slowFor = 0
    let lastEvery = 0

    // Down a tier (never back up once the loader is under way, so nothing flips back and forth);
    // the targets are made again only when the tier draws at another size
    const setTier = (next: number) => {
        const before = TIERS[tier]
        tier = next
        const now = TIERS[tier]
        if (now.pass !== before.pass || now.quality !== before.quality) resize()
        else canvas.dataset.tier = String(tier)
        frameAvg = gated ? GATE_FRAME : now.frame
        slowFor = -500
        bench.frames = Math.min(bench.frames, TUNING.warmup - 3) // the first frames after that are slow too
        bench.samples = []
    }

    // The benchmark (see TUNING), while the gate waits. Where the browser has a GPU timer
    // (Chrome on most desktops and many Androids), single gate frames are timed on the GPU: the
    // gate draws every other screen frame, so each starts on an idle GPU. Elsewhere (iOS Safari,
    // Firefox) the gate draws at the tier's own pace for a moment (faint and slow, it doesn't
    // show) and the screen's frame pacing says whether it holds: a GPU that can't keep up holds
    // the frames back. (A fence polled from the page was tried and dropped: its latency, 1-20 ms
    // for nothing at all, swamped the frame.) A device that holds its tier stays there; one that
    // doesn't steps down a tier and is measured again; one a hint started at tier 1 is tried at
    // tier 0 once. A forced tier skips it
    const gl = renderer.getContext() as WebGL2RenderingContext
    const timer = (() => {
        try {
            return gl.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
        } catch {
            return null
        }
    })()
    const bench = { on: forced < 0 && !software, frames: 0, probing: false, samples: [] as number[], lifted: false }
    // A verdict on the current tier: holds it, holds 30 a second, and whether tier 0 is worth a try
    const decide = (holds: boolean, holds30: boolean, tryFull: boolean) => {
        const done = () => (bench.on = false)
        bench.samples = []
        if (tier === 0) {
            // tried 0 after a hint and it didn't hold: back to 1 for good
            if (holds || bench.lifted) done()
            if (!holds) setTier(1)
        } else if (tier === 1) {
            if (hinted && !bench.lifted && tryFull) {
                // a hint started it low, but it measures well: the full look after all
                bench.lifted = true
                setTier(0)
            } else {
                // tier 2 draws the same picture, so it needs no measuring again; tier 3 is the floor
                done()
                if (!holds) setTier(holds30 ? 2 : 3)
            }
        } else {
            done()
            if (tier === 2 && !holds) setTier(3)
        }
    }
    const measured = (ms: number) => {
        bench.probing = false
        // NaN: no reading (the GPU was disjoint); a frame that never finished counts as 1 s
        if (stopped || !bench.on || Number.isNaN(ms)) return
        bench.samples.push(ms)
        const s = bench.samples.slice().sort((a, b) => a - b)
        // far too slow already after three: no need for the rest
        if (s.length < TUNING.samples && !(s.length >= 3 && s[0] > 1.5 * TUNING.budget30)) return
        const m = s[s.length >> 1]
        // what it found, on the canvas, to read on a phone (data-tier; data-gpu: median GPU ms at the tier measured)
        canvas.dataset.gpu = `${m.toFixed(1)}@${tier}`
        const b60 = touchScreen ? TUNING.budget60 : TUNING.budget60Desk
        const budget = TIERS[tier].frame === MAX_FRAME ? b60 : TUNING.budget30
        decide(m <= budget, m <= TUNING.budget30, m * TUNING.up <= b60)
    }
    // Frame pacing: the time between this draw and the last, at the tier's own pace
    const paced = (gap: number) => {
        if (stopped || !bench.on) return
        bench.samples.push(gap)
        const pace = TIERS[tier].frame
        const s = bench.samples.slice().sort((a, b) => a - b)
        // far too slow already after five: no need for the rest
        if (s.length < TUNING.paceSamples && !(s.length >= 5 && s[0] > 2 * pace)) return
        const m = s[s.length >> 1]
        canvas.dataset.gpu = `pace ${m.toFixed(1)}@${tier}`
        decide(m <= pace * TUNING.paceSlack, m <= GATE_FRAME * TUNING.paceSlack, m <= pace * TUNING.paceSlack)
    }
    const probe = () => {
        const q = timer && gl.createQuery()
        if (!timer || !q) return render()
        bench.probing = true
        gl.beginQuery(timer.TIME_ELAPSED_EXT, q)
        render()
        gl.endQuery(timer.TIME_ELAPSED_EXT)
        const t0 = performance.now()
        const check = () => {
            if (stopped) return
            if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
                if (performance.now() - t0 < 1000) setTimeout(check, 5)
                else {
                    gl.deleteQuery(q)
                    measured(1000)
                }
                return
            }
            const ms = gl.getParameter(timer.GPU_DISJOINT_EXT) ? NaN : gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6
            gl.deleteQuery(q)
            measured(ms)
        }
        setTimeout(check, 5)
    }

    const render = () => {
        u.uTime.value = time
        u.uReveal.value = state.reveal
        u.uExit.value = state.exit
        u.uExitSoft.value = c.exitSoft
        u.uExitTear.value = c.exitTear
        u.uExitStyle.value = ["open through", "dry out", "wash away"].indexOf(c.exitStyle)
        m.uPaper.value = state.paper
        // The bounce plays once from the start of the reveal...
        const bt = introTime - c.revealDelay
        // ...and is faded out by the time the rim has grown in, so later frames are untouched
        const introEnd = c.rimStart + 1.3 * c.rimTime + 0.06
        const bouncing = c.bounceOn && bt >= 0 && bt < introEnd
        u.uBounceT.value = Math.max(bt, 0)
        u.uBounceAmp.value = bouncing && !impactActive() && !still && !gated ? c.bounceHeight * (1 - smooth(introEnd - 0.16, introEnd, bt)) : 0
        u.uBounceFreq.value = c.bounceFreq
        u.uBouncePhase.value = c.bouncePhase * DEG
        u.uBounceDamp.value = c.bounceDamp
        u.uBounceSize.value = c.bounceSize
        u.uBounceSpeed.value = c.bounceSpeed
        u.uBounceWidth.value = c.bounceWidth
        u.uBounceRadial.value = c.bounceRadial
        // the rim's sweep is done by rimStart + 1.3 rimTime; after that nothing changes
        u.uIntroOn.value = c.bounceOn && bt >= 0 && bt < c.rimStart + 1.3 * c.rimTime ? 1 : 0
        u.uIntroInk.value = c.introInk
        u.uIntroSwing.value = still ? 0 : c.introSwing
        u.uSplashThin.value = c.splashThin
        // The impact runs from the start of the reveal until its rings have died away
        u.uImpactOn.value = impactActive() && bt >= 0 && bt < Math.max(c.waveDecay, c.impactDamp) * 6 ? 1 : 0
        u.uImpactDepth.value = c.impactDepth
        u.uImpactSize.value = c.impactSize
        u.uImpactAttack.value = c.impactAttack
        u.uImpactHold.value = c.impactHold
        u.uImpactRebound.value = c.impactRebound
        u.uImpactDamp.value = c.impactDamp
        u.uWaveSpeed.value = c.waveSpeed
        u.uWaveDecay.value = c.waveDecay
        u.uWaveDisp.value = c.waveDisp
        u.uWaveRings.value = c.waveRings
        u.uWaveReach.value = c.waveReach
        u.uImpactPush.value = c.impactPush
        u.uImpactShade.value = c.impactShade
        u.uImpactKick.value = c.impactKick
        u.uDisturb.value = c.impactDisturb
        u.uInnerRing.value = c.impactInnerRing
        u.uDisturbSettle.value = c.impactDisturbSettle
        // The middle grows with the impact, easing out (no overshoot) to its full size
        const gk = impactActive() && bt >= 0 ? Math.min(bt / Math.max(c.impactGrowTime, 0.01), 1) : 1
        u.uCraterR.value = c.craterRadius * (c.impactGrowFrom + (1 - c.impactGrowFrom) * (1 - (1 - gk) ** 3))
        u.uRimStart.value = c.rimStart
        u.uRimTime.value = c.rimTime
        // a small damped punch of the camera on impact
        const jt = introTime - c.revealDelay
        const jolt = impactActive() && jt >= 0 ? c.impactJolt * Math.exp(-jt / 0.12) * Math.sin(Math.PI * Math.min(jt / 0.05, 1)) : 0
        u.uScale.value = c.zoom * state.push * (1 + jolt)
        u.uCenter.value.set(c.offsetX, c.offsetY)
        u.uCraterTilt.value.set(c.craterTiltX, c.craterTiltY)
        u.uRingPhase.value = time * c.ringDrift
        m.uOpacity.value = c.opacity * state.fade
        m.uGrain.value = 0.3 + c.granulation
        updateShock()

        pointer.x += (pointer.tx - pointer.x) * 0.04
        pointer.y += (pointer.ty - pointer.y) * 0.04
        // The pointer swings the light only when lightFollow is on
        const px = c.lightFollow ? pointer.x : 0
        const py = c.lightFollow ? pointer.y : 0
        const az = (c.lightAngle + c.lightSway * Math.sin(time * c.lightSpeed)) * DEG + px * 0.6
        const el = Math.min(89, Math.max(1, c.lightHeight + py * 15)) * DEG
        u.uLight.value.set(Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el))
        const wel = Math.min(89, Math.max(1, c.wallLightHeight + py * 15)) * DEG
        u.uWallLight.value.set(Math.cos(az) * Math.cos(wel), Math.sin(az) * Math.cos(wel), Math.sin(wel))
        const raz = az + (c.ringLightAngle - c.lightAngle) * DEG
        const rel = Math.min(89, Math.max(1, c.ringLightHeight + py * 15)) * DEG
        u.uRingLight.value.set(Math.cos(raz) * Math.cos(rel), Math.sin(raz) * Math.cos(rel), Math.sin(rel))

        renderer.setRenderTarget(target)
        renderer.render(fieldScene, screenCamera)
        if (c.turbOn) {
            tf.uTime.value = turbTime
            tf.uScale.value = c.turbScale
            tf.uOctaves.value = c.turbOctaves
            tf.uWarp.value = c.turbWarp
            tf.uSwirl.value = c.turbSwirl
            tf.uEddies.value = c.turbEddies
            tu.uStrength.value = ((c.turbStrength * burst()) / 1000) * (gated || entering ? c.gateSway : 1)
            const settle = 1 - Math.exp(-introTime / Math.max(c.turbCalmTime, 0.05))
            tf.uCalm.value = c.turbCalm * settle
            tf.uOutward.value = c.turbOutward * (1 - Math.exp(-introTime / Math.max(c.turbSettle, 0.05)))
            tf.uStrengthRef.value = tu.uStrength.value
            tu.uShade.value = c.turbShade
            tu.uCaustics.value = c.turbCaustics
            tf.uEdge.value = c.turbEdge
            tf.uRipplePush.value = c.turbRipple
            const da = c.turbDriftAngle * DEG
            tf.uDrift.value.set(Math.cos(da), Math.sin(da)).multiplyScalar(turbTime * c.turbDriftSpeed / Math.max(c.turbSpeed, 1e-3))
            renderer.setRenderTarget(flowTarget)
            renderer.render(flowScene, screenCamera)
            const move = c.turbMode === "move"
            mt.uTurbMove.value = move ? 1 : 0
            mt.uTurbShade.value = c.turbShade
            mt.uTurbCaustics.value = c.turbCaustics
            if (move) {
                renderer.setRenderTarget(null)
                renderer.render(marksScene, screenCamera)
            } else {
                renderer.setRenderTarget(scene)
                renderer.render(marksScene, screenCamera)
                renderer.setRenderTarget(null)
                renderer.render(turbScene, screenCamera)
            }
        } else {
            mt.uTurbMove.value = 0
            renderer.setRenderTarget(null)
            renderer.render(marksScene, screenCamera)
        }
    }

    // The shaders compile in the background first (the browser's parallel compile, where it has one): a
    // first draw compiles them on the spot and waits for the driver, which on a slow or CPU-drawn GL
    // was one task of ten seconds in the middle of the page's load (Lighthouse: blocking time 9.6 s).
    // The loop waits for them, then draws as always; if they cannot be compiled ahead it does not wait
    let compiled = typeof renderer.compileAsync !== "function"
    const done = () => void ((compiled = true), (canvas.dataset.compiled = String(Math.round(performance.now()))))
    const compileDone: Promise<void> = compiled
        ? Promise.resolve()
        : (() => {
              // Each scene for the target it is drawn to (a program is made per target: compiled for the
              // screen alone, the first draw to a texture compiled them all again, on the spot)
              const jobs = ([[fieldScene, target], [flowScene, flowTarget], [marksScene, null], [marksScene, scene], [turbScene, null]] as const).map(([sc, to]) => {
                  renderer.setRenderTarget(to)
                  return renderer.compileAsync(sc, screenCamera)
              })
              renderer.setRenderTarget(null)
              return Promise.all(jobs).then(done, done)
          })()
    let nextDraw = 0
    let lateFrames = 0 // gate frames in a row that came more than SLOW_GAP after the one before
    let last0 = false // a frame has been drawn since the loop (re)started
    let heavy = 0 // gate frames in a row whose draw kept the main thread longer than STILL_MS
    let frozen = false // the gate stopped drawing (see the loop); the click starts it again
    const loop = (t: number) => {
        raf = 0
        if (!running) return
        if (!compiled) {
            raf = requestAnimationFrame(loop)
            return
        }
        // Not this one: the next one the screen offers
        // (the benchmark without a GPU timer has the gate draw at the tier's own pace for a moment)
        const pacing = bench.on && !timer && gated && !entering && bench.frames >= TUNING.warmup
        const every = gated && !pacing ? GATE_FRAME : TIERS[tier].frame
        if (t < nextDraw - 1) {
            raf = requestAnimationFrame(loop)
            return
        }
        nextDraw = Math.max(nextDraw + every, t)
        const gap = last ? t - last : 16
        const dt = Math.min(gap, 100)
        last = t
        // The gate's frames coming a third of a second apart or worse, twice running: the GL is drawn on the
        // CPU (a speed test's runner, a machine with no GPU driver) and its work is starving the page itself
        // (CI measured a frame every 1.3 s and 158 s of blocking: the draw calls return at once, the page's
        // own scrolling and layout then wait on the saturated machine). The gate stops where it is, a still
        // picture, until the click; the loader then plays as always. Nothing with a GPU gets near this
        if (gated && !entering && forced < 0 && last0) {
            lateFrames = gap > SLOW_GAP ? lateFrames + 1 : 0
            if (lateFrames >= 2 || gap > 1500) {
                frozen = true
                canvas.dataset.still = ""
                return
            }
        }
        last0 = true
        if (!scrubbing) {
            time += dt / 1000
            if (!still) turbTime += (dt / 1000) * c.turbSpeed * burst() * (gated || entering ? c.gateSpeed : 1)
            introTime += dt / 1000
            intro.time(Math.min(introTime, intro.duration()))
        }

        // Frame pacing: frames that stay slow step one tier down (see TIERS, TUNING). The gate
        // opening (30 to 60 a second) starts the average afresh, or the gate's slower frames
        // would count as slow, and the tap's own work (the audio starting, the snapshot, the
        // dissolve) doesn't count. Slow time is counted as it passes, up to 250 ms a frame (so
        // a hidden tab coming back does not count): it used to sum dt, capped at 100 ms, which
        // took 15 frames, about 5 s at 3 fps, to act
        // the benchmark only runs while the gate waits; a tap before it is done leaves the rest to this
        if (!gated) bench.on = false
        if (every !== lastEvery) {
            frameAvg = every
            slowFor = -500
        }
        lastEvery = every
        frameAvg += (dt - frameAvg) * 0.05
        const slow = every * (forced >= 0 && tier === forced ? TUNING.collapse : touchScreen ? TUNING.slow : TUNING.slowDesk)
        if (entering || bench.on) slowFor = Math.min(slowFor, 0)
        else slowFor = frameAvg > slow ? slowFor + Math.min(gap, 250) : 0
        if (slowFor > (touchScreen ? TUNING.slowFor : TUNING.slowForDesk) && tier < TIERS.length - 1) setTier(tier + 1)

        // While the gate waits, now and then a frame is timed on the GPU instead (the benchmark),
        // or the pace of the frames is (the first two at a new pace don't count)
        let drawn = false
        if (bench.on && gated && !entering && ++bench.frames > TUNING.warmup) {
            if (timer) {
                if (!bench.probing) {
                    probe()
                    drawn = true
                }
            } else if (bench.frames > TUNING.warmup + 2) paced(gap)
        }
        const t0 = performance.now()
        if (!drawn) render()
        // A GL drawn on the CPU (SwiftShader, llvmpipe: a machine with no GPU driver, a speed test's
        // headless Chrome on a small runner) spends the main thread inside its draw calls, waiting for
        // frames of seconds each: Lighthouse measured 158 s of blocking on GitHub's runner. While the gate
        // waits, one draw of over BIG_MS, or two in a row over STILL_MS, and it stops where it is: a still
        // picture until the click (the loader then plays as always, slowly if it must). A real GPU's draw
        // calls return at once, so this never touches one; slow GPUs are what the tiers are for
        if (gated && !entering && forced < 0) {
            const cost = performance.now() - t0
            heavy = cost > STILL_MS ? heavy + 1 : 0
            if (cost > BIG_MS || heavy >= 2) {
                frozen = true
                canvas.dataset.still = ""
                return
            }
        }
        raf = requestAnimationFrame(loop)
    }

    // Tuning panel: dev only, so the build drops it, and loaded on demand so the reveal
    // isn't held up by it. Every setting appears once, bound to where it lives now
    // and mirrored into c, so Copy values reads c.
    let gui: { destroy(): void } | undefined
    let turbGui: { destroy(): void } | undefined
    let soundGui: { destroy(): void } | undefined
    let keysOff = () => {}
    let stopped = false
    if (import.meta.env.DEV && c.gui) {
        import("./tune").then(({ createPanel }) => {
            if (stopped) return
            const opt = (key: NumKey) => ({ key, get: () => c[key], set: (v: number) => (c[key] = v) })
            const uni = (key: NumKey, target: { value: number }, scale = 1) => ({
                key,
                get: () => target.value / scale,
                set: (v: number) => {
                    target.value = v * scale
                    c[key] = v
                },
            })
            const origin = (key: "revealX" | "revealY", axis: "x" | "y") => ({
                key,
                get: () => u.uRevealOrigin.value[axis],
                set: (v: number) => (u.uRevealOrigin.value[axis] = c[key] = v),
            })
            const round = (v: unknown) => (typeof v === "number" ? +v.toFixed(5) : v)
            gui = createPanel({
                container: canvas.parentElement ?? document.body,
                title: "Flow Field",
                defaults,
                folders: [
                    {
                        title: "Reveal",
                        rows: [
                            { ...opt("revealTime"), label: "Duration (s)", min: 0.3, max: 8, step: 0.1 },
                            { ...opt("revealDelay"), label: "Delay (s)", min: 0, max: 4, step: 0.1 },
                            {
                                key: "revealEase",
                                label: "Easing",
                                choices: Object.keys(EASES),
                                get: () => c.revealEase,
                                set: (v: string) => (c.revealEase = v as Ease),
                            },
                            { ...origin("revealX", "x"), label: "Origin x", hint: "Frame widths from the middle", min: -0.5, max: 0.5, step: 0.01 },
                            { ...origin("revealY", "y"), label: "Origin y", min: -0.3, max: 0.3, step: 0.01 },
                            { ...uni("core", u.uCore), label: "Core", hint: "Middle that always shows", min: 0, max: 0.8, step: 0.01 },
                            { ...uni("coreEdge", u.uCoreEdge), label: "Core edge", hint: "How soft and torn its rim is", min: 0, max: 0.2, step: 0.005 },
                            { ...uni("spread", u.uSpread), label: "Spread curve", hint: "Lower: wetter parts lead early and ease out; 1 is even", min: 0.2, max: 1, step: 0.05 },
                            { ...uni("wetness", u.uWetness), label: "Wetness", hint: "How lopsided the stain grows", min: 0, max: 1, step: 0.01 },
                            { ...uni("wetScale", u.uWetScale), label: "Wetness scale", min: 0.5, max: 8, step: 0.1 },
                            { ...uni("feather", u.uFeather), label: "Feather", hint: "Soft fingers along the edge", min: 0, max: 4, step: 0.05 },
                            { ...uni("tendrils", u.uTendrils), label: "Strands", hint: "Curling off the edge along the flow", min: 0, max: 3, step: 0.05 },
                            { ...uni("tendrilScale", u.uTendrilScale), label: "Strand scale", min: 0.5, max: 10, step: 0.1 },
                            { ...uni("blooms", u.uBlooms), label: "Islands", hint: "Loose clumps ahead of the front", min: 0, max: 3, step: 0.05 },
                            { ...uni("islandReach", u.uIslandReach), label: "Island reach", hint: "How far out they fly early on", min: 0, max: 1, step: 0.01 },
                            { ...uni("revealSoft", u.uRevealSoft), label: "Thinning band", hint: "How far in from the front marks thin out", min: 0.005, max: 0.4, step: 0.005 },
                            { ...uni("edgeDark", u.uEdgeDark), label: "Edge darkening", hint: "Pigment gathered at the front", min: 0, max: 2, step: 0.05 },
                            { ...uni("edgeBand", u.uEdgeBand), label: "Edge band", min: 0.2, max: 4, step: 0.05 },
                            { ...uni("granulation", u.uGranulation), label: "Granulation", hint: "Uneven settling at the front", min: 0, max: 2, step: 0.05 },
                            { ...uni("creep", u.uCreep), label: "Creep", hint: "How much the edge wriggles while it spreads", min: 0, max: 3, step: 0.05 },
                            { ...uni("lobeWarp", u.uLobeWarp), label: "Lobe warp", hint: "Less round early lobes", min: 0, max: 3, step: 0.05 },
                            { ...uni("margin", u.uMargin), label: "Edge margin", hint: "Torn white margin at the frame's edges", min: 0, max: 0.15, step: 0.005 },
                            { ...uni("lobes", u.uLobes), label: "Early lobes", hint: "Separate patches that join up later", min: 0, max: 3, step: 0.05 },
                            { ...uni("outline", u.uOutline), label: "Final outline", hint: "Where the stain stops; 1.5 fills the frame", min: 0.4, max: 1.6, step: 0.01 },
                            { ...uni("outlineNoise", u.uOutlineNoise), label: "Outline noise", hint: "How irregular the final outline is", min: 0, max: 1, step: 0.01 },
                            { ...opt("pushIn"), label: "Push in", hint: "Times closer it ends than it starts; 1 is none", min: 1, max: 4, step: 0.05 },
                            { ...opt("pushTime"), label: "Push in time (s)", min: 0.3, max: 6, step: 0.1 },
                            {
                                label: "Scrub",
                                hint: "Drag to preview; Replay restarts it",
                                min: 0,
                                max: 1,
                                step: 0.01,
                                initial: 1,
                                listen: true,
                                get: () => state.reveal,
                                set: (v: number) => {
                                    introTime = intro.duration()
                                    intro.progress(1, true)
                                    sound.mute(true)
                                    state.reveal = v
                                },
                            },
                        ],
                    },
                    {
                        title: "Marks",
                        rows: [
                            { ...uni("cell", m.uCell), label: "Cell size (px)", hint: "At a 1000 px wide frame", min: 2, max: 20, step: 0.5 },
                            { ...uni("markLength", m.uLength), label: "Length (cells)", min: 0.2, max: 3, step: 0.05 },
                            { ...uni("curve", m.uCurve), label: "Curve", hint: "0 is a straight dash, higher a hook", min: 0, max: 3.5, step: 0.05 },
                            { ...uni("markWidth", m.uWidth), label: "Width (px)", min: 0.3, max: 5, step: 0.05 },
                            { ...uni("widthShade", m.uWidthShade), label: "Width in shadow", hint: "Extra weight where it's darkest", min: 0, max: 2, step: 0.05 },
                            { ...uni("jitter", m.uJitter), label: "Jitter", hint: "How far marks wander from the grid", min: 0, max: 1, step: 0.01 },
                            { ...uni("variety", m.uVariety), label: "Variety", hint: "Differences in size and turn", min: 0, max: 1, step: 0.01 },
                            { ...opt("opacity"), label: "Opacity", min: 0.1, max: 1, step: 0.01 },
                            { ...uni("density", m.uDensity), label: "Density", hint: "How fast shadows fill with marks", min: 0.3, max: 4, step: 0.01 },
                            { ...uni("base", m.uBase), label: "Light fill", hint: "Marks kept even in full light", min: 0, max: 1, step: 0.01 },
                            { ...uni("shadowStart", u.uInkLo), label: "Shadow start", hint: "Shade where ink begins", min: 0, max: 1, step: 0.01 },
                            { ...uni("shadowFull", u.uInkHi), label: "Shadow full", hint: "Start above full inverts the shading", min: 0, max: 1, step: 0.01 },
                        ],
                    },
                    {
                        title: "Form",
                        rows: [
                            { ...opt("zoom"), label: "Zoom", min: 0.3, max: 4, step: 0.01 },
                            { ...opt("offsetX"), label: "Crater x", hint: "Frame widths from the middle", min: -0.5, max: 0.5, step: 0.01 },
                            { ...opt("offsetY"), label: "Crater y", min: -0.3, max: 0.3, step: 0.01 },
                            { ...uni("craterRadius", u.uCraterR), label: "Crater radius", min: 0.02, max: 0.4, step: 0.005 },
                            { ...uni("craterDepth", u.uCraterDepth), label: "Crater depth", min: 0, max: 0.1, step: 0.001 },
                            { ...uni("craterFloor", u.uCraterFloor), label: "Crater floor", hint: "Share of the radius that is flat", min: 0, max: 0.95, step: 0.01 },
                            { ...opt("craterTiltX"), label: "Crater tilt x", hint: "Steepens one wall", min: -0.8, max: 0.8, step: 0.01 },
                            { ...opt("craterTiltY"), label: "Crater tilt y", min: -0.8, max: 0.8, step: 0.01 },
                            { ...uni("rimHeight", u.uRimH), label: "Lip height", hint: "The raised edge round it", min: 0, max: 0.05, step: 0.001 },
                            { ...uni("rimWidth", u.uRimW), label: "Lip width", min: 0.005, max: 0.1, step: 0.001 },
                            { ...uni("bump", u.uBumpH), label: "Middle bump", min: 0, max: 0.03, step: 0.001 },
                            { ...uni("ringHeight", u.uRingH), label: "Ridge height", min: 0, max: 0.04, step: 0.0005 },
                            { ...uni("ringSpacing", u.uRingSpacing), label: "Ridge spacing", min: 0.02, max: 0.3, step: 0.002 },
                            { ...uni("rings", u.uRingCount), label: "Ridges", hint: "How many before they die away", min: 0.5, max: 8, step: 0.1 },
                            { ...opt("ringDrift"), label: "Ridge drift", hint: "Outward, frame widths per second", min: -0.05, max: 0.05, step: 0.001 },
                            { ...uni("ringBreak", u.uRingBreak), label: "Ridge break-up", hint: "How much they vary round the circle", min: 0, max: 2, step: 0.05 },
                            { ...uni("ringSide", u.uRingSide), label: "Ridges one-sided", hint: "0 even all round, 1 only on one side", min: 0, max: 1, step: 0.01 },
                            { ...uni("ringSideAngle", u.uRingSideAngle, DEG), label: "Ridge side (°)", hint: "0 right, 90 above, 180 left", min: -180, max: 180, step: 1 },
                            { ...uni("undulate", u.uUndulate), label: "Swell", min: 0, max: 0.03, step: 0.0005 },
                            { ...uni("undulateScale", u.uUndulateScale), label: "Swell scale", min: 0.5, max: 10, step: 0.1 },
                            { ...uni("fold", u.uFold), label: "Fold", hint: "Soft ridge running out from the crater", min: 0, max: 0.03, step: 0.0005 },
                            { ...uni("foldAngle", u.uFoldAngle, DEG), label: "Fold direction (°)", min: -180, max: 180, step: 1 },
                            { ...uni("foldOffset", u.uFoldOffset), label: "Fold offset", min: -0.3, max: 0.3, step: 0.005 },
                        ],
                    },
                    {
                        title: "Impact",
                        rows: [
                            {
                                key: "impactOn",
                                label: "Impact",
                                hint: "A heavy object dunked in the middle; replaces the dome bounce and first drop",
                                choices: ["off", "on"],
                                get: () => (c.impactOn ? "on" : "off"),
                                set: (v: string) => (c.impactOn = v === "on"),
                            },
                            { ...opt("impactDepth"), label: "Depth", hint: "How deep the cavity sinks", min: 0, max: 0.1, step: 0.001 },
                            { ...opt("impactSize"), label: "Object size", min: 0.01, max: 0.2, step: 0.002 },
                            { ...opt("impactAttack"), label: "Attack (s)", hint: "How fast it sinks", min: 0.005, max: 0.3, step: 0.005 },
                            { ...opt("impactHold"), label: "Hold (s)", hint: "How long it stays down", min: 0, max: 0.3, step: 0.005 },
                            { ...opt("impactRebound"), label: "Rebound (Hz)", hint: "The centre's down-up spring", min: 0.5, max: 12, step: 0.1 },
                            { ...opt("impactDamp"), label: "Centre settles (s)", min: 0.05, max: 2, step: 0.01 },
                            { ...opt("waveSpeed"), label: "Wave speed", min: 0.05, max: 2, step: 0.01 },
                            { ...opt("waveDecay"), label: "Damping (s)", hint: "How fast the rings die away", min: 0.05, max: 4, step: 0.01 },
                            { ...opt("waveDisp"), label: "Dispersion", hint: "How fast the ring spacing widens", min: 0, max: 5, step: 0.05 },
                            { ...opt("waveRings"), label: "Ring strength", min: 0, max: 4, step: 0.05 },
                            { ...opt("waveReach"), label: "Reach", hint: "How far out the rings carry", min: 0.05, max: 3, step: 0.01 },
                            { ...opt("impactPush"), label: "Displacement", hint: "How far the rings shove the surface", min: 0, max: 0.1, step: 0.001 },
                            { ...opt("impactShade"), label: "Shading", hint: "Crests light, troughs and cavity dark", min: 0, max: 2, step: 0.01 },
                            { ...opt("impactKick"), label: "Reveal kick", hint: "Leading ring pushes the stain out", min: 0, max: 4, step: 0.05 },
                            { ...opt("impactGrowFrom"), label: "Middle starts at", hint: "Share of the crater size it grows from", min: 0.05, max: 1, step: 0.01 },
                            { ...opt("impactGrowTime"), label: "Middle grows over (s)", min: 0.05, max: 3, step: 0.01 },
                            { ...opt("impactDisturb"), label: "Centre disturbance", hint: "Roughens the middle's rim", min: 0, max: 2, step: 0.01 },
                            { ...opt("impactInnerRing"), label: "Inner ring", hint: "Wobbly ring of disturbed marks inside the middle", min: 0, max: 2, step: 0.01 },
                            { ...opt("impactDisturbSettle"), label: "Disturbance settles (s)", min: 0.05, max: 5, step: 0.05 },
                            { ...opt("impactJolt"), label: "Camera jolt", hint: "A small punch of the camera", min: 0, max: 0.05, step: 0.001 },
                        ],
                    },
                    {
                        title: "Intro bounce",
                        rows: [
                            {
                                key: "bounceOn",
                                label: "Bounce",
                                hint: "A drop hitting water as the reveal starts",
                                choices: ["off", "on"],
                                get: () => (c.bounceOn ? "on" : "off"),
                                set: (v: string) => (c.bounceOn = v === "on"),
                            },
                            { ...opt("bounceHeight"), label: "Height", min: 0, max: 0.08, step: 0.001 },
                            { ...opt("bounceFreq"), label: "Spring (Hz)", hint: "How fast it springs down and back", min: 0.5, max: 8, step: 0.1 },
                            { ...opt("bouncePhase"), label: "Start of swing (°)", hint: "Where in its spring the drop starts", min: -180, max: 180, step: 1 },
                            { ...opt("bounceDamp"), label: "Dies away (s)", min: 0.05, max: 1.5, step: 0.01 },
                            { ...opt("bounceSize"), label: "Dome size", min: 0.01, max: 0.2, step: 0.002 },
                            { ...opt("bounceSpeed"), label: "Ring speed", hint: "How fast its ring runs out", min: 0, max: 1.5, step: 0.01 },
                            { ...opt("bounceWidth"), label: "Ring width", min: 0.005, max: 0.15, step: 0.001 },
                            { ...opt("bounceRadial"), label: "Radial marks", hint: "Marks point out from the middle while it bounces", min: 0, max: 6, step: 0.05 },
                            { ...opt("introInk"), label: "Splash ink", hint: "Crater's tone before its rim grows in", min: 0, max: 1, step: 0.01 },
                            { ...opt("introSwing"), label: "Splash swing", hint: "How far the middle swings dark and pale", min: 0, max: 0.3, step: 0.005 },
                            { ...opt("splashThin"), label: "Splash sparseness", hint: "Share of marks dropped while it splashes", min: 0, max: 0.95, step: 0.01 },
                            { ...opt("rimStart"), label: "Rim grows in at (s)", min: 0, max: 2, step: 0.01 },
                            { ...opt("rimTime"), label: "Rim grows over (s)", min: 0.02, max: 2, step: 0.01 },
                        ],
                    },
                    {
                        title: "Enter",
                        rows: [
                            {
                                key: "gateOn",
                                label: "Click to enter",
                                hint: "A faint, silent loader until the first click",
                                choices: ["off", "on"],
                                get: () => (c.gateOn ? "on" : "off"),
                                set: (v: string) => (c.gateOn = v === "on"),
                            },
                            { ...opt("gateSpeed"), label: "Waiting drift speed", hint: "How much faster the form drifts while it waits", min: 0, max: 12, step: 0.1 },
                            { ...opt("gateSway"), label: "Waiting drift size", hint: "How much further it moves while it waits", min: 0, max: 5, step: 0.05 },
                            { ...opt("gateOpacity"), label: "Waiting opacity", min: 0, max: 1, step: 0.01, set: (v: number) => { c.gateOpacity = v; if (gated) state.fade = v } },
                            { ...opt("gateDelay"), label: "Enter delay (s)", hint: "A short buffer between the click and the impact", min: 0, max: 1, step: 0.01 },
                            { ...opt("gateLabelSize"), label: "Label size (px)", min: 8, max: 48, step: 1, set: (v: number) => { c.gateLabelSize = v; label.style.fontSize = `${v}px` } },
                            { ...opt("gateTime"), label: "Transition time (s)", min: 0.05, max: 3, step: 0.05 },
                            {
                                key: "gateTransition",
                                label: "Transition",
                                choices: ["dissolve", "fade"],
                                get: () => c.gateTransition,
                                set: (v: string) => (c.gateTransition = v as Options["gateTransition"]),
                            },
                        ],
                    },
                    {
                        title: "Reveal out",
                        rows: [
                            {
                                key: "exitStyle",
                                label: "Style",
                                choices: ["open through", "dry out", "wash away"],
                                get: () => c.exitStyle,
                                set: (v: string) => (c.exitStyle = v as Options["exitStyle"]),
                            },
                            { ...opt("exitTime"), label: "Duration (s)", min: 0.2, max: 5, step: 0.05 },
                            { ...opt("exitStart"), label: "Scrub starts at (s)", hint: "Loader time the scrubbed exit begins from", min: 0, max: 20, step: 0.1 },
                            {
                                key: "exitEase",
                                label: "Easing",
                                choices: Object.keys(EASES),
                                get: () => c.exitEase,
                                set: (v: string) => (c.exitEase = v as Ease),
                            },
                            { ...opt("exitSoft"), label: "Edge softness", min: 0.005, max: 0.3, step: 0.005 },
                            { ...opt("exitTear"), label: "Edge tear", hint: "How ragged the clearing edge is", min: 0, max: 3, step: 0.05 },
                            { ...opt("exitPush"), label: "Push in", hint: "How much closer the camera ends", min: 1, max: 3, step: 0.01 },
                            {
                                key: "exitRipple",
                                label: "Last drop",
                                hint: "A ripple as it starts",
                                choices: ["off", "on"],
                                get: () => (c.exitRipple ? "on" : "off"),
                                set: (v: string) => (c.exitRipple = v === "on"),
                            },
                            {
                                label: "Scrub",
                                hint: "Share of the exit: drag to hold a frame, , and . step one frame",
                                min: 0,
                                max: 1,
                                step: 0.005,
                                initial: 0,
                                listen: true,
                                get: () => exitScrub,
                                set: (v: number) => scrubExit(v),
                            },
                        ],
                    },
                    {
                        title: "Ripple",
                        rows: [
                            { ...opt("shockRings"), label: "Rings", min: 1, max: 8, step: 0.5 },
                            { ...opt("shockWidth"), label: "Ring width", hint: "Half a wavelength", min: 0.005, max: 0.15, step: 0.001 },
                            { ...opt("shockStretch"), label: "Stretch", hint: "Rings widen as they travel", min: 0, max: 2, step: 0.05 },
                            { ...opt("shockHeight"), label: "Height", min: 0, max: 0.03, step: 0.0005 },
                            { ...opt("shockReach"), label: "Reach", hint: "How far out the rings run", min: 0.1, max: 1.5, step: 0.01 },
                            { ...opt("shockTime"), label: "Duration (s)", hint: "Shorter is faster", min: 0.5, max: 8, step: 0.1 },
                            { ...opt("shockFade"), label: "Fade", hint: "Share of the run spent dying away", min: 0.05, max: 1, step: 0.05 },
                            { ...opt("shockRefract"), label: "Refraction", hint: "How much the rings turn the marks", min: 0, max: 3, step: 0.05 },
                            { ...opt("shockTone"), label: "Light and shadow", hint: "Extra shading on the rings", min: 0, max: 4, step: 0.05 },
                            { ...opt("shockDelay"), label: "First drop after (s)", hint: "Delay after the middle has revealed", min: 0, max: 6, step: 0.05 },
                            { ...opt("shockFirstFade"), label: "First drop fade-in (s)", hint: "How quickly the first ripple comes in", min: 0.01, max: 2, step: 0.01 },
                            { ...opt("shockEvery"), label: "Repeat every (s)", hint: "0 drops only with the reveal", min: 0, max: 20, step: 0.5 },
                            { ...opt("shockSecondary"), label: "Small drops", hint: "Chance per second of a small drop nearby", min: 0, max: 1, step: 0.01 },
                        ],
                    },
                    {
                        title: "Light & flow",
                        rows: [
                            { ...uni("relief", u.uRelief), label: "Relief", hint: "How steep the heights read under the light", min: 0, max: 6, step: 0.05 },
                            { ...opt("lightAngle"), label: "Light from (°)", hint: "0 right, 90 above, 180 left", min: -180, max: 180, step: 1 },
                            { ...opt("lightHeight"), label: "Light height (°)", hint: "Lower rakes across and deepens shadows", min: 2, max: 88, step: 1 },
                            { ...opt("lightSway"), label: "Light sway (°)", min: 0, max: 90, step: 1 },
                            { ...opt("lightSpeed"), label: "Sway speed", min: 0, max: 2, step: 0.01 },
                            {
                                key: "lightFollow",
                                label: "Light follows pointer",
                                hint: "Off keeps the shading fixed",
                                choices: ["off", "on"],
                                get: () => (c.lightFollow ? "on" : "off"),
                                set: (v: string) => (c.lightFollow = v === "on"),
                            },
                            { ...opt("wallLightHeight"), label: "Wall light height (°)", hint: "Lower deepens the crater wall's crescents", min: 2, max: 88, step: 1 },
                            { ...uni("wallRelief", u.uWallRelief), label: "Wall relief", min: 0.2, max: 6, step: 0.05 },
                            { ...uni("wallDark", u.uWallDark), label: "Wall shadow", hint: "Ink on the wall nearest the light", min: 0, max: 1, step: 0.01 },
                            { ...uni("wallSweep", u.uWallSweep), label: "Wall highlight", hint: "Light on the wall across from it", min: 0, max: 1, step: 0.01 },
                            { ...uni("floorSweep", u.uFloorSweep), label: "Floor sweep", hint: "Bright sweep across the crater floor", min: 0, max: 1, step: 0.01 },
                            { ...opt("ringLightAngle"), label: "Ridge light from (°)", hint: "Light for everything outside the crater", min: -180, max: 180, step: 1 },
                            { ...opt("ringLightHeight"), label: "Ridge light height (°)", min: 2, max: 88, step: 1 },
                            { ...uni("swirl", u.uSwirl), label: "Swirl", hint: "Flow round the crater", min: 0, max: 3, step: 0.05 },
                            { ...uni("curl", u.uCurl), label: "Curl", hint: "Flow from noise", min: 0, max: 3, step: 0.05 },
                            { ...uni("flowFreq", u.uFlowFreq), label: "Flow scale", min: 0.2, max: 6, step: 0.05 },
                            { ...uni("flowDrift", u.uFlowDrift), label: "Flow speed", min: 0, max: 5, step: 0.05 },
                        ],
                    },
                ],
                actions: [
                    ["Replay reveal", playIntro],
                    ["Drop a ripple", fireShock],
                    ["Reveal out", playExit],
                    ["Show gate again", showGate],
                    ["Play out from scrub", playExitFromScrub],
                ],
                copy: () =>
                    (Object.keys(defaults) as (keyof Options)[])
                        .map((key) => `    ${key}: ${key === "gui" ? "import.meta.env.DEV" : JSON.stringify(round(c[key]))},`)
                        .join("\n"),
            })

            // O plays the reveal out, R replays the loader from the start
            const onKeys = (e: KeyboardEvent) => {
                if (e.metaKey || e.ctrlKey || e.altKey) return
                const t = e.target as HTMLElement
                if (t instanceof HTMLInputElement && t.type !== "range") return
                if (e.key === "o" || e.key === "O") playExit()
                if (e.key === "r" || e.key === "R") playIntro()
                // , and . step the reveal out one frame (40 ms) back or forward
                if (e.key === "," || e.key === ".") {
                    scrubExit(Math.min(1, Math.max(0, exitScrub + ((e.key === "." ? 1 : -1) * 0.04) / c.exitTime)))
                }
            }
            document.addEventListener("keydown", onKeys)
            keysOff = () => document.removeEventListener("keydown", onKeys)
            // A second panel, beside the first, for the liquid turbulence
            // A third panel, beside the others, for the sound levels
            soundGui = createPanel({
                container: canvas.parentElement ?? document.body,
                title: "Sound",
                defaults,
                right: 564,
                hotkey: "s",
                store: "flow-field-tune-sound",
                openByDefault: 1,
                toggle: {
                    key: "soundOn",
                    label: "Sound",
                    get: () => c.soundOn,
                    set: (on) => {
                        c.soundOn = on
                        sound.update()
                    },
                },
                folders: [
                    {
                        title: "Levels",
                        rows: [
                            { ...opt("soundVolume"), label: "Volume", min: 0, max: 1, step: 0.01, set: (v: number) => { c.soundVolume = v; sound.update() } },
                            { ...opt("soundImpact"), label: "Impact", hint: "Your impact recording", min: 0, max: 1.5, step: 0.01 },
                            { ...opt("soundRipple"), label: "Ripple", hint: "Your water-drop recording", min: 0, max: 1.5, step: 0.01 },
                            { ...opt("rippleVary"), label: "Ripple variation", hint: "Each drop plays up to this much faster or slower", min: 0, max: 0.3, step: 0.005 },
                            { ...opt("soundTravel"), label: "Ripple travel", hint: "The ring moving through the marks", min: 0, max: 1.5, step: 0.01 },
                            { ...opt("travelDelay"), label: "Travel delay (s)", hint: "After the drop", min: 0, max: 2, step: 0.01 },
                            { ...opt("soundWaves"), label: "Waves", min: 0, max: 1.5, step: 0.01, set: (v: number) => { c.soundWaves = v; sound.update() } },
                            { ...opt("waveDepth"), label: "Wave swell", hint: "How much the waves rise with each ring", min: 0, max: 1.5, step: 0.01 },
                        ],
                    },
                ],
                actions: [
                    ["Test impact", () => sound.test("impact")],
                    ["Test ripple", () => sound.test("ripple")],
                    ["Test travel", () => sound.test("travel")],
                    ["Test wave", () => sound.test("wave")],
                ],
                copy: () =>
                    (Object.keys(defaults) as (keyof Options)[])
                        .filter((key) => /^(sound|ripple|travel|wave)/.test(key))
                        .map((key) => `    ${key}: ${JSON.stringify(round(c[key]))},`)
                        .join("\n"),
            })

            turbGui = createPanel({
                container: canvas.parentElement ?? document.body,
                title: "Turbulence",
                defaults,
                right: 288,
                hotkey: "t",
                store: "flow-field-tune-turb",
                openByDefault: 3,
                toggle: { key: "turbOn", label: "Liquid turbulence", get: () => c.turbOn, set: (on) => (c.turbOn = on) },
                folders: [
                    {
                        title: "Flow",
                        rows: [
                            {
                                key: "turbMode",
                                label: "Mode",
                                hint: "Move: marks keep their shape. Warp: the image bends, marks too",
                                choices: ["move", "warp"],
                                get: () => c.turbMode,
                                set: (v: string) => (c.turbMode = v as Options["turbMode"]),
                            },
                            { ...opt("turbStrength"), label: "Strength (px)", hint: "How far things are pushed", min: 0, max: 40, step: 0.5 },
                            { ...opt("turbScale"), label: "Swirl size", hint: "Higher makes more, smaller swirls", min: 0.3, max: 12, step: 0.1 },
                            { ...opt("turbSpeed"), label: "Speed", min: 0, max: 1, step: 0.01 },
                            { ...opt("turbSwirl"), label: "Swirl", hint: "0 pushes, 1 turns round in eddies", min: 0, max: 1, step: 0.01 },
                            { ...opt("turbWarp"), label: "Warp", hint: "Folds the flow into itself", min: 0, max: 3, step: 0.05 },
                            { ...opt("turbDriftAngle"), label: "Drift direction (°)", min: -180, max: 180, step: 1 },
                            { ...opt("turbDriftSpeed"), label: "Drift speed", hint: "Frame widths per second", min: 0, max: 0.1, step: 0.002 },
                            { ...opt("turbOutward"), label: "Outward", hint: "Surface spreads out from the crater over the reveal", min: 0, max: 0.15, step: 0.002 },
                        ],
                    },
                    {
                        title: "Detail",
                        rows: [
                            { ...opt("turbOctaves"), label: "Octaves", hint: "Layers of finer swirls", min: 1, max: 4, step: 1 },
                            { ...opt("turbEddies"), label: "Eddies", hint: "How strong each finer layer is", min: 0, max: 1, step: 0.01 },
                            { ...opt("turbEdge"), label: "Edge ease", hint: "Calms near the frame edges", min: 0, max: 0.3, step: 0.005 },
                            { ...opt("turbRipple"), label: "Ripple push", hint: "How hard ripples stir it", min: 0, max: 4, step: 0.05 },
                            { ...opt("turbCalm"), label: "Calm middle", hint: "Still round the crater, stirring further out", min: 0, max: 0.5, step: 0.005 },
                            { ...opt("turbCalmTime"), label: "Calm sets in (s)", hint: "The middle moves at first, then settles", min: 0.05, max: 4, step: 0.05 },
                            { ...opt("turbBurst"), label: "Start burst", hint: "Times stronger and faster as the reveal starts", min: 1, max: 6, step: 0.05 },
                            { ...opt("turbSettle"), label: "Settle (s)", hint: "How long the burst takes to calm", min: 0.1, max: 6, step: 0.05 },
                        ],
                    },
                    {
                        title: "Surface",
                        rows: [
                            { ...opt("turbShade"), label: "Light and shade", min: 0, max: 0.6, step: 0.01 },
                            { ...opt("turbCaustics"), label: "Caustics", hint: "Soft brightening where the flow gathers", min: 0, max: 0.6, step: 0.01 },
                        ],
                    },
                ],
                actions: [],
                copy: () =>
                    (Object.keys(defaults) as (keyof Options)[])
                        .filter((key) => key.startsWith("turb"))
                        .map((key) => `    ${key}: ${JSON.stringify(round(c[key]))},`)
                        .join("\n"),
            })
        })
    }

    resize()
    if (c.gateOn) showGate()
    else playIntro()
    // The first picture waits for the shaders (compiled in the background, see `compiled`): drawn here
    // it would compile them all on the spot, inside the module's evaluation
    if (compiled) render()
    else compileDone.then(() => !stopped && render())

    // On a phone the address bar sliding in or out resizes the window several times in a row,
    // and each resize makes every target again: wait for it to settle (the canvas is stretched
    // by CSS meanwhile)
    let resizeTimer = 0
    const ro = new ResizeObserver(
        touchScreen
            ? () => {
                  clearTimeout(resizeTimer)
                  resizeTimer = window.setTimeout(() => !stopped && resize(), 150)
              }
            : resize
    )
    ro.observe(canvas)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("click", onClick)

    return {
        out: playExit,
        fade: (seconds) => sound.fade(seconds),
        pause() {
            sound.pause()
            running = false
            cancelAnimationFrame(raf)
            raf = 0
        },
        resume() {
            if (running) return
            sound.resume()
            running = true
            last = 0
            last0 = false
            lateFrames = 0
            raf = requestAnimationFrame(loop)
        },
        stop() {
            this.pause()
            stopped = true
            ro.disconnect()
            canvas.removeEventListener("pointermove", onMove)
            canvas.removeEventListener("click", onClick)
            intro.kill()
            sound.close()
            label.remove()
            document.body.style.cursor = ""
            document.removeEventListener("mouseout", onGateLeave)
            document.documentElement.removeAttribute("data-loader")
            window.removeEventListener(gateMove, onGateMove as EventListener)
            window.removeEventListener("pointerdown", onGatePointer)
            window.removeEventListener("keydown", onGateKey)
            gui?.destroy()
            turbGui?.destroy()
            soundGui?.destroy()
            keysOff()
            quad.dispose()
            ;(field.material as THREE.Material).dispose()
            ;(marks.material as THREE.Material).dispose()
            target.dispose()
            scene.dispose()
            flowTarget.dispose()
            ;(turb.material as THREE.Material).dispose()
            ;(flowQuad.material as THREE.Material).dispose()
            renderer.dispose()
        },
    }
}

export default mount
