// On a phone (under 600px) the panels are bottom sheets: a bar of chips along the bottom of the
// window, one for each panel, and a tap opens that panel as a sheet sliding up over the page (one at
// a time; drag the header down or tap the chevron to close it). Everything below is the desktop
// panel; the phone's rules are at the end of DOCK_CSS and `register()`.
// The dev-only tuning panels (tune.ts for the intro particles, dock-tune.ts for the grid's
// bulge) are built here, so they look and work the same. A floating card with a slider per
// setting in foldable groups, applied live. A changed setting shows its value in the accent
// and counts in the header; double-click a setting to put it back. "Copy values" puts all
// of them on the clipboard in the shape of `params`, to paste back into the source as the
// new defaults. Folding is remembered per panel (localStorage, best effort).
type Num = Record<string, number>

/** [setting, label, min, max, step] */
export type Slider<K extends string> = [K, string, number, number, number]

export interface Options<P extends Num> {
    id: string
    title: string
    label: string
    side?: "left" | "right"
    groups: [string, Slider<keyof P & string>[]][]
    params: P
    /** Settings applied only when the slider is let go (costly ones) */
    late?: (keyof P & string)[]
    /** A setting changed (null: all reset); `done` when the slider was let go */
    onChange: (key: (keyof P & string) | null, done: boolean) => void
}

const CHEVRON = `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`

export const CSS = `
.tune {
    position: fixed;
    z-index: 10;
    top: 50%;
    right: 16px;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    width: 272px;
    max-height: calc(100vh - 32px);
    overflow: hidden;
    background: color-mix(in srgb, var(--white) 90%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--gray-200);
    border-radius: 12px;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--black) 6%, transparent), 0 16px 40px color-mix(in srgb, var(--black) 10%, transparent);
    font: 400 12px/1.3 var(--sans);
    letter-spacing: 0;
    color: var(--gray-700);
}
.tune.left {
    right: auto;
    left: 16px;
}
.tune header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 10px 10px 14px;
    border-bottom: 1px solid var(--gray-100);
}
.tune header strong {
    flex: 1;
    font: 400 14px/1 var(--pixel);
    letter-spacing: -0.03em;
    text-transform: lowercase;
    color: var(--gray-900);
}
.tune .count {
    padding: 3px 7px;
    border-radius: 999px;
    font-size: 10px;
    line-height: 1;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
}
.tune .icon {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--gray-500);
    cursor: var(--cursor-hand);
}
.tune .icon:hover {
    background: var(--gray-100);
    color: var(--gray-900);
}
.tune .icon svg {
    transition: transform 0.2s;
}
.tune[data-folded] .icon svg {
    transform: rotate(-90deg);
}
.tune .body {
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--gray-200) transparent;
    padding: 0 14px;
}
.tune details + details {
    border-top: 1px solid var(--gray-100);
}
.tune summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0 4px;
    list-style: none;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gray-500);
    cursor: var(--cursor-hand);
    user-select: none;
}
.tune summary::-webkit-details-marker {
    display: none;
}
.tune summary::after {
    content: "";
    width: 5px;
    height: 5px;
    margin-right: 3px;
    border: solid var(--gray-400);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
    transition: transform 0.2s;
}
.tune details:not([open]) summary {
    padding-bottom: 12px;
}
.tune details:not([open]) summary::after {
    transform: rotate(-45deg);
}
.tune details[open] {
    padding-bottom: 8px;
}
.tune .row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 4px 8px;
    padding: 6px 0 0;
}
.tune .row span {
    color: var(--gray-700);
}
.tune output {
    min-width: 34px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--gray-900);
    background: var(--gray-100);
    transition: color 0.2s, background-color 0.2s;
}
.tune .row[data-changed] output {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
}
.tune input[type="range"] {
    grid-column: 1 / -1;
    width: 100%;
    height: 16px;
    margin: 0;
    background: transparent;
    cursor: var(--cursor-hand);
    -webkit-appearance: none;
    appearance: none;
}
.tune input[type="range"]::-webkit-slider-runnable-track {
    height: 3px;
    border-radius: 3px;
    background: linear-gradient(to right, var(--primary) var(--p, 0%), var(--gray-200) var(--p, 0%));
}
.tune input[type="range"]::-moz-range-track {
    height: 3px;
    border-radius: 3px;
    background: var(--gray-200);
}
.tune input[type="range"]::-moz-range-progress {
    height: 3px;
    border-radius: 3px;
    background: var(--primary);
}
.tune input[type="range"]::-webkit-slider-thumb {
    width: 14px;
    height: 14px;
    margin-top: -5.5px;
    border: 1px solid var(--gray-300);
    border-radius: 50%;
    background: var(--white);
    box-shadow: 0 1px 3px color-mix(in srgb, var(--black) 18%, transparent);
    transition: transform 0.15s, border-color 0.15s;
    -webkit-appearance: none;
    appearance: none;
}
.tune input[type="range"]::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 1px solid var(--gray-300);
    border-radius: 50%;
    background: var(--white);
    box-shadow: 0 1px 3px color-mix(in srgb, var(--black) 18%, transparent);
}
.tune input[type="range"]:hover::-webkit-slider-thumb,
.tune input[type="range"]:active::-webkit-slider-thumb {
    border-color: var(--primary);
    transform: scale(1.15);
}
.tune input[type="range"]:focus-visible {
    outline: none;
}
.tune input[type="range"]:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 3px var(--primary-200);
}
.tune footer {
    display: flex;
    gap: 8px;
    padding: 10px 14px 12px;
    border-top: 1px solid var(--gray-100);
}
.tune footer button {
    flex: 1;
    height: 28px;
    border-radius: 6px;
    font: 500 12px/1 var(--sans);
    cursor: var(--cursor-hand);
    transition: background-color 0.15s;
}
.tune .ghost {
    border: 1px solid var(--gray-200);
    background: var(--white);
    color: var(--gray-900);
}
.tune .ghost:hover {
    background: var(--gray-50);
}
.tune .primary {
    border: 1px solid var(--gray-900);
    background: var(--gray-900);
    color: var(--white);
}
.tune .primary:hover {
    background: var(--gray-700);
}
.tune .hint {
    margin: 0 0 10px;
    font-size: 10px;
    color: var(--gray-400);
}
.tune[data-folded] header {
    border-bottom: 0;
}
.tune[data-folded] .body,
.tune[data-folded] footer {
    display: none;
}
`

// Panels on the same side of the window stack in a column there instead of overlapping (the
// Scroll panel on top), kept in <body> so they outlive Barba's page swaps; each page's own
// panels remove themselves where they do not apply. The column scrolls when they do not fit.
const DOCK_CSS = `
.tune-dock {
    position: fixed;
    /* Over an open post (50), under the loader (100, which hides them anyway) */
    z-index: 60;
    top: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 272px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    pointer-events: none;
}
.tune-dock::-webkit-scrollbar {
    display: none;
}
.tune-dock.right {
    right: 16px;
    /* Below the dark mode cord, which hangs on this side (Cord.astro) */
    top: 152px;
}
.tune-dock.left {
    left: 16px;
}
.tune-dock > .tune {
    position: static;
    transform: none;
    flex: none;
    max-height: none;
    pointer-events: auto;
}
/* In the column it is the column that scrolls: a body that scrolls (but has nothing to) and
   keeps the wheel to itself would stop the column from ever moving over the rows */
.tune-dock > .tune .body {
    overflow-y: visible;
    overscroll-behavior: auto;
}
/* Centred while they fit (two spacers share the room), scrollable from the top when they
   do not (the spacers shrink to nothing) */
.tune-dock::before,
.tune-dock::after {
    content: "";
    flex: 1 1 0;
}
.tune-dock::before {
    order: -2;
}
.tune-dock::after {
    order: 2;
}
.tune-dock > [data-tune="scroll"] {
    order: -1;
}
html[data-splash] .tune-dock,
html[data-splash] .tune-bar {
    display: none;
}
.tune-bar {
    display: none;
}
/* A phone: a bar of chips along the bottom and each panel a sheet sliding up over the page */
@media (max-width: 599px) {
    .tune-dock {
        position: static;
        display: contents;
    }
    .tune-dock::before,
    .tune-dock::after {
        display: none;
    }
    .tune-bar {
        position: fixed;
        z-index: 62;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        gap: 8px;
        padding: 6px 12px calc(6px + env(safe-area-inset-bottom));
        overflow-x: auto;
        scrollbar-width: none;
        background: color-mix(in srgb, var(--white) 88%, transparent);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-top: 1px solid var(--gray-200);
    }
    .tune-bar::-webkit-scrollbar {
        display: none;
    }
    .tune-bar button {
        flex: none;
        height: 28px;
        padding: 0 12px;
        border: 1px solid var(--gray-200);
        border-radius: 999px;
        background: var(--white);
        color: var(--gray-900);
        font: 500 12px/1 var(--sans);
        text-transform: lowercase;
    }
    .tune-bar button[data-open] {
        border-color: var(--gray-900);
        background: var(--gray-900);
        color: var(--white);
    }
    .tune-dock > .tune {
        position: fixed;
        z-index: 61;
        top: auto;
        left: 0;
        right: 0;
        bottom: calc(41px + env(safe-area-inset-bottom));
        width: auto;
        max-height: 68vh;
        display: flex;
        flex-direction: column;
        border-radius: 16px 16px 0 0;
        border-bottom: 0;
        box-shadow: 0 -8px 32px color-mix(in srgb, var(--black) 14%, transparent);
        background: color-mix(in srgb, var(--white) 96%, transparent);
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .tune-dock > .tune[data-folded] {
        display: none;
    }
    .tune-dock > .tune .body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
    }
    /* The grab handle, over the header */
    .tune-dock > .tune header {
        position: relative;
        padding-top: 18px;
        touch-action: none;
    }
    .tune-dock > .tune header::before {
        content: "";
        position: absolute;
        top: 7px;
        left: 50%;
        width: 36px;
        height: 4px;
        border-radius: 2px;
        background: var(--gray-200);
        transform: translateX(-50%);
    }
    /* The cloth recorder is for a desktop window */
    html .scrub-open,
    html .scrub {
        display: none;
    }
}
`

// H hides every dev panel (and the scrub button and timeline) and shows them again, for a clean look
// at the page. Kept for the tab's session, so a reload leaves them as they were. Typing in a field
// is left alone.
const HIDE_CSS = `
html[data-tune-hidden] .tune-dock,
html[data-tune-hidden] .tune-bar,
html[data-tune-hidden] .tune,
html[data-tune-hidden] .scrub,
html[data-tune-hidden] .scrub-open {
    display: none !important;
}
`
const HIDE_KEY = "tune:hidden"
if (!document.getElementById("tune-hide-css")) {
    document.head.insertAdjacentHTML("beforeend", `<style id="tune-hide-css">${HIDE_CSS}</style>`)
    try {
        if (sessionStorage.getItem(HIDE_KEY) === "1") document.documentElement.setAttribute("data-tune-hidden", "")
    } catch {}
    addEventListener("keydown", (e) => {
        if (e.key.toLowerCase() !== "h" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
        if ((e.target as Element | null)?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])")) return
        const hidden = document.documentElement.toggleAttribute("data-tune-hidden")
        try {
            sessionStorage.setItem(HIDE_KEY, hidden ? "1" : "0")
        } catch {}
    })
}

/** Put a panel in its side's column (made on first use) */
export function dock(el: HTMLElement, side: "left" | "right" = "right") {
    let column = document.querySelector<HTMLElement>(`.tune-dock.${side}`)
    if (!column) {
        if (!document.getElementById("tune-dock-css")) document.head.insertAdjacentHTML("beforeend", `<style id="tune-dock-css">${DOCK_CSS}</style>`)
        column = document.createElement("div")
        column.className = `tune-dock ${side}`
        document.body.append(column)
    }
    column.append(el)
    register(el)
}

// The phone's bar: a chip for each panel, which opens that panel as a sheet and closes the others
const sheets: HTMLElement[] = []
let bar: HTMLElement | undefined
const narrow = matchMedia("(max-width: 599px)")
function register(el: HTMLElement) {
    if (!bar) {
        bar = document.createElement("div")
        bar.className = "tune-bar"
        document.body.append(bar)
        // A page swap takes a page's own panels away: their chips go too
        document.addEventListener("nav:enter", () => setTimeout(prune, 50))
    }
    const chip = document.createElement("button")
    chip.type = "button"
    chip.textContent = el.querySelector("strong")?.textContent ?? el.dataset.tune ?? ""
    chip.addEventListener("click", () => {
        for (const other of sheets) {
            if (other !== el && !other.hasAttribute("data-folded")) other.querySelector<HTMLButtonElement>(".fold")?.click()
        }
        el.querySelector<HTMLButtonElement>(".fold")?.click()
    })
    new MutationObserver(() => chip.toggleAttribute("data-open", !el.hasAttribute("data-folded"))).observe(el, { attributes: true, attributeFilter: ["data-folded"] })
    chip.toggleAttribute("data-open", !el.hasAttribute("data-folded"))
    bar.append(chip)
    chips.set(el, chip)
    sheets.push(el)
}
const chips = new Map<HTMLElement, HTMLElement>()
function prune() {
    for (const el of [...sheets]) {
        if (el.isConnected) continue
        chips.get(el)?.remove()
        chips.delete(el)
        sheets.splice(sheets.indexOf(el), 1)
    }
}

// Pulling a sheet's header down closes it (a phone)
function swipe(el: HTMLElement) {
    const head = el.querySelector<HTMLElement>("header")!
    let y0 = 0
    let dy = 0
    let id = -1
    head.addEventListener("pointerdown", (e) => {
        if (!narrow.matches || (e.target as Element).closest("button")) return
        id = e.pointerId
        y0 = e.clientY
        dy = 0
        el.style.transition = "none"
        head.setPointerCapture(id)
    })
    head.addEventListener("pointermove", (e) => {
        if (e.pointerId !== id) return
        dy = Math.max(0, e.clientY - y0)
        el.style.transform = `translateY(${dy}px)`
    })
    const end = (e: PointerEvent) => {
        if (e.pointerId !== id) return
        id = -1
        el.style.transition = ""
        el.style.transform = ""
        if (dy > 70) el.querySelector<HTMLButtonElement>(".fold")?.click()
    }
    head.addEventListener("pointerup", end)
    head.addEventListener("pointercancel", end)
}

const decimals = (step: number) => (String(step).split(".")[1] ?? "").length

const remember = {
    get: (k: string) => {
        try {
            return localStorage.getItem(k)
        } catch {
            return null
        }
    },
    set: (k: string, v: string | null) => {
        try {
            if (v === null) localStorage.removeItem(k)
            else localStorage.setItem(k, v)
        } catch {}
    },
}

export function panel<P extends Num>({ id, title, label, side = "right", groups, params, late = [], onChange }: Options<P>) {
    const values = params as Num
    const defaults: Num = { ...params }
    const el = document.createElement("aside")
    el.className = `tune ${side}`
    el.dataset.tune = id
    el.setAttribute("aria-label", label)
    el.innerHTML = `<style>${CSS}</style>
        <header><strong>${title}</strong><span class="count" hidden></span><button type="button" class="icon fold" aria-expanded="true" aria-label="Fold the panel">${CHEVRON}</button></header>
        <div class="body">${groups
            .map(
                ([group, sliders]) =>
                    `<details open><summary>${group}</summary>${sliders
                        .map(
                            ([key, text, min, max, step]) =>
                                `<label class="row" data-key="${key}" title="Double-click to reset"><span>${text}</span><output></output><input type="range" name="${key}" min="${min}" max="${max}" step="${step}"></label>`,
                        )
                        .join("")}</details>`,
            )
            .join("")}<p class="hint">Double-click a setting to reset it.</p></div>
        <footer><button type="button" class="ghost" data-act="reset">Reset all</button><button type="button" class="primary" data-act="copy">Copy values</button></footer>`

    const ranges = new Map(groups.flatMap(([, sliders]) => sliders.map(([key, , min, max, step]) => [key as string, { min, max, step }] as const)))
    const rows = [...el.querySelectorAll<HTMLElement>(".row")]
    const count = el.querySelector<HTMLElement>(".count")!

    const show = () => {
        let changed = 0
        for (const row of rows) {
            const key = row.dataset.key!
            const { min, max, step } = ranges.get(key)!
            const v = values[key]
            const input = row.querySelector("input")!
            input.value = String(v)
            input.style.setProperty("--p", `${(((v - min) / (max - min)) * 100).toFixed(2)}%`)
            row.querySelector("output")!.value = v.toFixed(decimals(step))
            const differs = Math.abs(v - defaults[key]) > step / 2
            row.toggleAttribute("data-changed", differs)
            if (differs) changed++
        }
        count.hidden = !changed
        count.textContent = `${changed} changed`
    }
    show()

    const set = (e: Event) => {
        const input = e.target as HTMLInputElement
        const key = input.name as keyof P & string
        if (!(key in values)) return
        if (e.type === "input" && late.includes(key)) {
            // Applied on release; meanwhile just move the readout
            input.closest(".row")!.querySelector("output")!.value = (+input.value).toFixed(decimals(ranges.get(key)!.step))
            return
        }
        values[key] = +input.value
        show()
        onChange(key, e.type === "change")
    }
    el.addEventListener("input", set)
    el.addEventListener("change", set)

    el.addEventListener("dblclick", (e) => {
        const row = (e.target as Element).closest<HTMLElement>(".row")
        if (!row) return
        const key = row.dataset.key as keyof P & string
        values[key] = defaults[key]
        show()
        onChange(key, true)
    })

    const fold = el.querySelector<HTMLButtonElement>(".fold")!
    const setFolded = (folded: boolean) => {
        el.toggleAttribute("data-folded", folded)
        fold.setAttribute("aria-expanded", String(!folded))
        fold.setAttribute("aria-label", folded ? "Unfold the panel" : "Fold the panel")
        remember.set(`tune:${id}:folded`, folded ? "1" : "0")
    }
    // Folded unless it was left open (Vansh, 2026-11-07: every panel starts collapsed)
    setFolded(narrow.matches || remember.get(`tune:${id}:folded`) !== "0")
    swipe(el)

    el.addEventListener("click", async (e) => {
        const button = (e.target as HTMLElement).closest("button")
        if (!button) return
        if (button === fold) setFolded(!el.hasAttribute("data-folded"))
        else if (button.dataset.act === "reset") {
            Object.assign(values, defaults)
            show()
            onChange(null, true)
        } else if (button.dataset.act === "copy") {
            const text = Object.entries(values)
                .map(([key, value]) => `    ${key}: ${value},`)
                .join("\n")
            try {
                await navigator.clipboard.writeText(text)
                button.textContent = "Copied"
            } catch {
                console.log(text)
                button.textContent = "In console"
            }
            setTimeout(() => (button.textContent = "Copy values"), 1200)
        }
    })
    return el
}
