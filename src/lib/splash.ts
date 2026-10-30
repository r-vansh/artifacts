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

const LATE = 4000 // ms after navigation: if it cannot start by then, it does not play
const OUT = 2300 // ms after the click: the reveal out starts
const LIMIT = 3900 // ms after the click: everything is torn down, whatever the state
const CLICK = ["pointerdown", "keydown"]

const root = document.documentElement
const veil = document.querySelector<HTMLElement>(".splash")
const canvas = document.createElement("canvas")
let exp: ReturnType<typeof mount> | undefined
let over = false

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
        veil.append(canvas)
        // No tuning panel, even under `npm run dev`; shorter timings than the experiment's
        // own page, so the exit fits the limit
        exp = mount(canvas, { gui: false, revealTime: 1.8, exitTime: 1.4, gateDelay: 0.15 })
        // The canvas paints its own paper, so the veil's white steps aside and the reveal
        // out can open onto the page. The failsafe is no use now that setup has worked.
        veil.setAttribute("data-live", "")
        veil.style.animation = "none"
        exp.resume()
        const hide = () => (document.hidden ? exp?.pause() : exp?.resume())
        document.addEventListener("visibilitychange", hide)

        // The first click or Enter/Space is the gate; from there the clock runs
        let started = false
        const start = (e: Event) => {
            if (started) return
            if (e instanceof KeyboardEvent && e.key !== "Enter" && e.key !== " ") return
            started = true
            CLICK.forEach((t) => removeEventListener(t, start, true))
            setTimeout(() => {
                if (over) return
                veil.style.pointerEvents = "none"
                exp?.out?.().then(finish, finish)
            }, OUT)
            setTimeout(finish, LIMIT)
        }
        CLICK.forEach((t) => addEventListener(t, start, true))
    } catch (err) {
        console.error(err)
        finish()
    }
}
