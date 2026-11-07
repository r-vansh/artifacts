// Dev-only timeline for the cloth and the cord: a scripted pull is simulated once, by the real code
// (cord.ts, theme.ts and cloth.ts on a virtual clock, with a scripted pointer), and every frame is
// recorded, so it can be scrubbed both ways, played slowly and stepped with the arrow keys. A change
// to a setting in the Cord or Cloth panel simulates it again with the same folds, so two settings
// can be compared; "New folds" rolls different ones. Cord.astro loads this only under `npm run dev`,
// so it never ships. Closing puts everything back as it was, the saved theme too.
import { dev as themeDev } from "./theme"
import { dev as clothDev } from "./cloth"
import { dev as cordDev, params as cordParams } from "./cord"

const FPS = 60
const BUDGET = 20 // ms of simulating a frame, so the page stays alive meanwhile
const MOST = 12 // s: a recording ends here whatever is going on
const LOWER = 1.5 // s: kept after the page has gone, for the new cord to come down
const PEEK = 1
const FALL = 2

type CordPose = ReturnType<NonNullable<typeof cordDev>["pose"]>
interface Frame {
    time: number // the cloth's own clock
    pose: Float32Array | null // the sheet; none while it is flat on the wall
    hidden: boolean // the page has gone
    cord: CordPose
}

const CSS = `
/* At the top of the window, in the accent: in the middle of the posters it went unnoticed */
.scrub-open {
    position: fixed;
    z-index: 61;
    left: 50%;
    top: 16px;
    transform: translateX(-50%);
    padding: 8px 16px;
    font: 500 14px/1.3 var(--sans);
    letter-spacing: 0;
    color: var(--white);
    background: var(--primary);
    border: 0;
    border-radius: 999px;
}
.scrub-open:hover {
    background: var(--primary-400);
}
.scrub {
    position: fixed;
    z-index: 61;
    left: 50%;
    bottom: 52px;
    transform: translateX(-50%);
    font: 400 12px/1.3 var(--sans);
    letter-spacing: 0;
    color: var(--gray-700);
    background: color-mix(in srgb, var(--white) 90%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--gray-200);
    display: flex;
    align-items: center;
    gap: 12px;
    width: min(860px, calc(100vw - 32px));
    padding: 10px 12px;
    border-radius: 12px;
}
.scrub button,
.scrub select {
    flex: none;
    height: 26px;
    padding: 0 8px;
    font: inherit;
    color: inherit;
    background: var(--gray-100);
    border: 0;
    border-radius: 6px;
}
.scrub button:hover,
.scrub select:hover {
    color: var(--gray-main);
}
.scrub .play {
    width: 34px;
    padding: 0;
}
.scrub .track {
    position: relative;
    flex: 1;
    min-width: 0;
    padding-top: 14px;
}
.scrub input {
    display: block;
    width: 100%;
    margin: 0;
    accent-color: var(--primary);
}
/* How much of it has been simulated */
.scrub .baked {
    position: absolute;
    left: 0;
    bottom: -3px;
    height: 2px;
    background: var(--primary-300);
}
.scrub .mark {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-size: 10px;
    white-space: nowrap;
    color: var(--gray-500);
}
.scrub .mark::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 12px;
    height: 5px;
    border-left: 1px solid var(--gray-400);
}
.scrub .now {
    flex: none;
    width: 52px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--gray-main);
}
html[data-splash] .scrub-open {
    display: none;
}
`

let bar: HTMLElement | undefined
let slider: HTMLInputElement
let now: HTMLElement
let baked: HTMLElement
let markBox: HTMLElement
let playButton: HTMLButtonElement
let script = "proper"
let rate = 1

let frames: Frame[] = []
let flat = new Float32Array(0)
let seed = 1
let at = 0 // the frame shown
let drawn = -1 // the frame on the canvas
let lastLength = 300 // frames the last recording took, to show how far this one has got
let keepAt = 0 // s: where to be when a new recording has got that far
let playing = false
let playFrom = 0
let playClock = 0
let player = 0
let baker = 0
let retuner = 0

// The recording in progress
let clock = 0 // ms
let done = true
let endAt = Infinity
let hidden = false
let wasMode = 0
let sunX = 0
let sunY = 0
let pressed = false
let letGo = false
let marks: [string, number][] = []

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t))

// The pointer in the script, in the cord's own px
function direct(s: number) {
    const cord = cordDev!
    if (!pressed && s >= 0.3) {
        pressed = true
        cord.press(sunX, sunY)
        marks.push(["press", s])
    }
    if (!pressed) return
    if (script === "proper") {
        const k = ease((s - 0.3) / 1)
        cord.move(sunX + 8 * k, sunY + (cordParams.commit + 30) * k, 1 / FPS)
        return
    }
    if (letGo) return
    const k = ease((s - 0.3) / 0.8)
    cord.move(sunX + 6 * k, sunY + cordParams.commit * 0.6 * k, 1 / FPS)
    if (s >= 1.7) {
        letGo = true
        cord.release()
        marks.push(["let go", s])
    }
}

function advance() {
    clock += 1000 / FPS
    const s = clock / 1000
    direct(s)
    cordDev!.frame(clock)
    clothDev!.frame(clock)
    const mode = clothDev!.mode()
    if (mode === FALL && wasMode !== FALL) {
        marks.push(["comes off", s], ["lands", s + clothDev!.landed()])
        cordDev!.release()
    }
    if (mode === 0 && wasMode === FALL) {
        hidden = true
        marks.push(["gone", s])
        endAt = s + LOWER
    }
    if (mode === 0 && wasMode === PEEK) {
        marks.push(["healed", s])
        endAt = s + 0.4
    }
    wasMode = mode
    frames.push({ time: clothDev!.time(), pose: clothDev!.pose(), hidden, cord: cordDev!.pose() })
    if (s >= endAt || s >= MOST) done = true
}

function slice() {
    const start = performance.now()
    while (!done && performance.now() - start < BUDGET) advance()
    slider.max = String(Math.max(0, frames.length - 1))
    const wanted = Math.round(keepAt * FPS)
    if (!playing) at = Math.min(wanted, frames.length - 1)
    drawMarks()
    if (done) lastLength = frames.length
    baked.style.width = done ? "100%" : `${Math.min(99, (frames.length / lastLength) * 100)}%`
    show()
    baker = done ? 0 : requestAnimationFrame(slice)
}

function record() {
    cancelAnimationFrame(baker)
    frames = []
    marks = []
    clock = 0
    done = false
    drawn = -1
    baked.style.width = "0"
    endAt = Infinity
    hidden = pressed = letGo = false
    wasMode = 0
    themeDev!.reset()
    clothDev!.reset()
    cordDev!.reset(0)
    let ready = false
    themeDev!.light(() => {
        ready = clothDev!.prepare()
    })
    if (!ready) {
        now.textContent = "no WebGL"
        done = true
        return
    }
    clothDev!.seed(seed)
    flat = clothDev!.flat()
    ;[sunX, sunY] = cordDev!.sun()
    baker = requestAnimationFrame(slice)
}

function drawMarks() {
    const last = Math.max(1, frames.length - 1) / FPS
    markBox.replaceChildren(
        ...marks
            .filter(([, s]) => s <= last)
            .map(([name, s]) => {
                const el = document.createElement("span")
                el.className = "mark"
                el.textContent = name
                el.style.left = `${(s / last) * 100}%`
                return el
            }),
    )
}

function show() {
    const f = frames[at]
    if (!f) return
    // The cloth only if it has to be drawn again; the recording has moved the cord, so that always
    if (at !== drawn) clothDev!.show(f.hidden ? null : (f.pose ?? flat))
    drawn = at
    cordDev!.show(f.cord)
    slider.value = String(at)
    now.textContent = `${(at / FPS).toFixed(2)} s`
}

function pause() {
    playing = false
    cancelAnimationFrame(player)
    playButton.textContent = "Play"
}

function play() {
    playing = true
    playButton.textContent = "Pause"
    playFrom = at >= frames.length - 1 ? 0 : at
    playClock = performance.now()
    const run = (t: number) => {
        at = Math.round(playFrom + (((t - playClock) / 1000) * FPS * rate))
        if (at >= frames.length) {
            // Round again
            at = 0
            playFrom = 0
            playClock = t
        }
        keepAt = at / FPS
        show()
        player = requestAnimationFrame(run)
    }
    player = requestAnimationFrame(run)
}

function close() {
    if (!bar) return
    pause()
    cancelAnimationFrame(baker)
    clearTimeout(retuner)
    removeEventListener("keydown", onKey)
    clothDev!.end()
    cordDev!.end()
    themeDev!.end()
    bar.remove()
    bar = undefined
    frames = []
    launcher.hidden = false
}

function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close()
}

async function open() {
    if (bar || document.querySelector(".cord")?.hasAttribute("inert")) return
    launcher.hidden = true
    bar = document.createElement("div")
    bar.className = "scrub"
    bar.setAttribute("aria-label", "Cloth timeline")
    bar.innerHTML = `<button type="button" class="play">Play</button>
<div class="track"><div class="marks"></div><input type="range" min="0" max="0" step="1" value="0" aria-label="Time"><div class="baked"></div></div>
<span class="now">simulating</span>
<select class="script" aria-label="What happens"><option value="proper">Proper pull</option><option value="slight">Slight pull, let go</option></select>
<select class="rate" aria-label="Speed"><option value="1">1x</option><option value="0.5">1/2x</option><option value="0.25">1/4x</option><option value="0.1">1/10x</option></select>
<button type="button" class="folds">New folds</button>
<button type="button" class="done" aria-label="Close">Close</button>`
    document.body.append(bar)
    slider = bar.querySelector("input")!
    now = bar.querySelector(".now")!
    baked = bar.querySelector(".baked")!
    markBox = bar.querySelector(".marks")!
    playButton = bar.querySelector(".play")!
    playButton.addEventListener("click", () => (playing ? pause() : play()))
    slider.addEventListener("input", () => {
        pause()
        at = +slider.value
        keepAt = at / FPS
        show()
    })
    bar.querySelector<HTMLSelectElement>(".script")!.addEventListener("change", (e) => {
        script = (e.target as HTMLSelectElement).value
        keepAt = at = 0
        pause()
        record()
    })
    bar.querySelector<HTMLSelectElement>(".rate")!.addEventListener("change", (e) => {
        rate = +(e.target as HTMLSelectElement).value
        if (playing) play()
    })
    bar.querySelector(".folds")!.addEventListener("click", () => {
        seed++
        record()
    })
    bar.querySelector(".done")!.addEventListener("click", close)
    addEventListener("keydown", onKey)

    // The pull happens at the top of the page
    if (scrollY > 0) scrollTo({ top: 0, behavior: "instant" })
    await themeDev!.load()
    themeDev!.begin()
    clothDev!.begin()
    cordDev!.begin()
    keepAt = at = 0
    record()
}

document.head.insertAdjacentHTML("beforeend", `<style id="scrub-css">${CSS}</style>`)
const launcher = document.createElement("button")
launcher.type = "button"
launcher.className = "scrub-open"
launcher.textContent = "Scrub the cloth"
launcher.addEventListener("click", open)
document.body.append(launcher)
// A change in a panel: again, with the same folds, at the same moment
document.addEventListener("cloth:retune", () => {
    if (!bar) return
    clearTimeout(retuner)
    retuner = window.setTimeout(record, 150)
})
// A change to how it's lit: at once, nothing to simulate
document.addEventListener("cloth:relook", () => {
    if (!bar) return
    clothDev!.look()
    drawn = -1
    show()
})
document.addEventListener("nav:leave", close)
