// The loading animation, on the first page of a visit: the Flow Field experiment
// (src/experiments/flow-field) full screen over the page. It waits, faint, for a click
// (the gate), then draws itself in and opens through to the page. The whole thing is
// gone within `LIMIT` ms of that click, whatever state the experiment is in; its sound
// then fades out over `FADE`.
//
// Base.astro decides before the first paint whether it plays (once per visit; every load
// under `npm run dev`; never under reduced motion) and loads this module. If it cannot
// start by `LATE`, the veil lifts at once. "splash:done" on `document` says it is over (the
// home page holds the intro effect back until then).
import mount from "../experiments/flow-field/main"

declare global {
    interface Window {
        splashPointer?: { x: number; y: number }
    }
}

const LATE = 4000 // ms after navigation: if it cannot start by then, it does not play
const OUT = 3700 // ms after the click: the reveal out starts
const LIMIT = 6000 // ms after the click: everything is torn down, whatever the state
const CLICK = ["pointerdown", "keydown"]

const root = document.documentElement
const veil = document.querySelector<HTMLElement>(".splash")
const canvas = document.createElement("canvas")
let exp: ReturnType<typeof mount> | undefined
let over = false

const APPEAR = 2 // s: the faint form fades in on load instead of appearing at once
const FADE = 0.9 // s: the sound fades out once the loader is gone, instead of cutting off

const finish = () => {
    if (over) return
    over = true
    veil?.style.setProperty("display", "none")
    root.removeAttribute("data-splash")
    document.dispatchEvent(new Event("splash:done"))
    // Only the sound is left: let it fade, then tear the experiment down
    const stop = () => {
        exp?.stop()
        canvas.remove()
    }
    if (exp?.fade) exp.fade(FADE).then(stop, stop)
    else stop()
}

if (!veil || performance.now() > LATE) finish()
else {
    try {
        canvas.setAttribute("aria-hidden", "true")
        canvas.style.opacity = "0"
        veil.append(canvas)
        // No tuning panel, even under `npm run dev`; shorter timings than the experiment's
        // own page, so the exit fits the limit
        // The paper is the page's own grey, so the reveal out opens onto the page without a
        // white cloud round the edge (the experiment's own page keeps its white)
        const background = getComputedStyle(canvas).getPropertyValue("--gray-50").trim() || undefined
        exp = mount(canvas, { gui: false, background, gateText: "click anywhere", gateAt: window.splashPointer ?? null, revealTime: 3, exitTime: 2, gateDelay: 0.15, clickReplay: false })
        // The failsafe is no use now that setup has worked. The veil's white stays under the
        // canvas while it fades in; it steps aside when the reveal out starts.
        veil.style.animation = "none"
        // Fades in over APPEAR, timed from the third painted frame, so a slow start (the
        // shaders compiling, the first draws) cannot eat the fade and make the form seem to
        // appear at once
        let frames = 0
        let from = 0
        const fadeIn = (now: number) => {
            if (over) return
            if (++frames > 2) {
                from ||= now
                const k = Math.min((now - from) / (APPEAR * 1000), 1)
                canvas.style.opacity = String(k * k * (3 - 2 * k))
                if (k === 1) return
            }
            requestAnimationFrame(fadeIn)
        }
        requestAnimationFrame(fadeIn)
        exp.resume()
        const hide = () => (document.hidden ? exp?.pause() : exp?.resume())
        document.addEventListener("visibilitychange", hide)

        // The first click or Enter/Space is the gate; from there the clock runs
        let started = false
        const start = (e: Event) => {
            if (started) return
            // Space would scroll the page under the veil
            if (e instanceof KeyboardEvent && e.key === " ") e.preventDefault()
            if (e instanceof KeyboardEvent && e.key !== "Enter" && e.key !== " ") return
            started = true
            CLICK.forEach((t) => removeEventListener(t, start, true))
            setTimeout(() => {
                if (over) return
                veil.style.pointerEvents = "none"
                veil.setAttribute("data-live", "") // the canvas paints its own paper; open onto the page
                exp?.out?.().then(finish, finish)
            }, OUT)
            setTimeout(finish, LIMIT)
        }
        CLICK.forEach((t) => addEventListener(t, start, true))
        // ...and so would a held or repeated Space after the gate has opened
        const noScroll = (e: KeyboardEvent) => e.key === " " && !over && e.preventDefault()
        addEventListener("keydown", noScroll, true)
    } catch (err) {
        console.error(err)
        finish()
    }
}
