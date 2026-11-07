// Dev-only controls for the garden strip (Garden.astro, src/experiments/garden/main.ts), the same
// ones the Framer component has as property controls: sliders, switches, menus and colours, in
// groups. Every change starts the garden again with the new settings (its plants are kept: it
// saves them), through "garden:options" on `document`. Garden.astro loads this only under
// `npm run dev`, so it never ships. Settings are remembered in localStorage; "Copy values" puts
// the changed ones on the clipboard in the shape of the garden's `defaults`.
import { defaults, type Options } from "../experiments/garden/main"
import { CSS, dock } from "./panel"

type Key = keyof Options
type Control =
    | { key: Key; type: "range"; label: string; min: number; max: number; step: number }
    | { key: Key; type: "switch"; label: string }
    | { key: Key; type: "menu"; label: string; options: string[] }
    | { key: Key; type: "colour"; label: string }
    | { key: Key; type: "colours"; label: string }

const GROUPS: [string, Control[]][] = [
    [
        "Plants",
        [
            { key: "spacing", type: "range", label: "Grid gap (px)", min: 2, max: 24, step: 1 },
            { key: "gridDot", type: "range", label: "Grid dot", min: 0, max: 3, step: 0.05 },
            { key: "plantDot", type: "range", label: "Plant dot", min: 0.5, max: 6, step: 0.1 },
            { key: "minHeight", type: "range", label: "Min height", min: 20, max: 400, step: 5 },
            { key: "maxHeight", type: "range", label: "Max height", min: 40, max: 600, step: 5 },
            { key: "maxFill", type: "range", label: "Tallest, share of the garden (0 off)", min: 0, max: 1, step: 0.01 },
            { key: "plantOn", type: "menu", label: "Plant on", options: ["Ground", "Anywhere"] },
            { key: "maxPlants", type: "range", label: "Max plants", min: 1, max: 100, step: 1 },
            { key: "persist", type: "switch", label: "Remember the garden" },
        ],
    ],
    [
        "Ground",
        [
            { key: "showGround", type: "switch", label: "Show ground" },
            { key: "groundHeight", type: "range", label: "Ground height", min: 9, max: 160, step: 1 },
        ],
    ],
    [
        "Life",
        [
            { key: "wind", type: "range", label: "Wind", min: 0, max: 3, step: 0.05 },
            { key: "pollen", type: "switch", label: "Pollen" },
            { key: "birds", type: "switch", label: "Birds" },
            { key: "birdRate", type: "range", label: "Bird rate", min: 1, max: 20, step: 1 },
            { key: "showCounter", type: "switch", label: "Counter" },
        ],
    ],
    [
        "Sound",
        [
            { key: "sound", type: "switch", label: "Sound" },
            { key: "volume", type: "range", label: "Volume", min: 0, max: 1, step: 0.01 },
            { key: "startMuted", type: "switch", label: "Start muted" },
            { key: "showMute", type: "switch", label: "Mute icon" },
            { key: "treeTap", type: "menu", label: "Tree tap", options: ["Marimba", "Floor Tom", "Leaf Shaker", "Wood Knock"] },
            { key: "pollenSound", type: "menu", label: "Pollen sound", options: ["Breath", "Celesta", "Dewdrop", "Glint"] },
            { key: "ambient", type: "switch", label: "Ambient" },
            { key: "ambientVolume", type: "range", label: "Ambient volume", min: 0, max: 1, step: 0.01 },
        ],
    ],
    [
        "Colours",
        [
            { key: "gridColor", type: "colour", label: "Grid" },
            { key: "soilColor", type: "colour", label: "Soil" },
            { key: "stemColor", type: "colour", label: "Stem" },
            { key: "leafColor", type: "colour", label: "Leaf" },
            { key: "leafDarkColor", type: "colour", label: "Leaf, dark" },
            { key: "trunkColor", type: "colour", label: "Trunk" },
            { key: "centerColor", type: "colour", label: "Flower centre" },
            { key: "goldColor", type: "colour", label: "Gold" },
            { key: "pollenColor", type: "colour", label: "Pollen" },
            { key: "birdColor", type: "colour", label: "Birds" },
            { key: "textColor", type: "colour", label: "Text and icon" },
            { key: "petalColors", type: "colours", label: "Petals (comma separated)" },
        ],
    ],
]

const STORE = "tune:garden:values"
const EXTRA = `
.tune .row.line {
    grid-template-columns: 1fr;
}
.tune .row.line input[type="text"],
.tune .row select {
    min-width: 0;
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--gray-200);
    border-radius: 4px;
    font: 400 11px/1 var(--sans);
    color: var(--gray-900);
    background: var(--white);
}
.tune .row select {
    cursor: var(--cursor-hand);
}
.tune .row input[type="checkbox"] {
    width: 28px;
    height: 16px;
    margin: 0;
    border-radius: 999px;
    background: var(--gray-200);
    cursor: var(--cursor-hand);
    -webkit-appearance: none;
    appearance: none;
    position: relative;
    transition: background-color 0.15s;
}
.tune .row input[type="checkbox"]::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--white);
    transition: transform 0.15s;
}
.tune .row input[type="checkbox"]:checked {
    background: var(--primary);
}
.tune .row input[type="checkbox"]:checked::after {
    transform: translateX(12px);
}
.tune .row[data-changed] > span {
    color: var(--primary);
}
.tune .swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-right: 6px;
    border: 1px solid var(--gray-200);
    border-radius: 2px;
    vertical-align: -1px;
}
`

const base = defaults as unknown as Record<string, unknown>
let values: Record<string, unknown> = { ...base }
try {
    Object.assign(values, JSON.parse(localStorage.getItem(STORE) ?? "{}"))
} catch {}

const differs = (key: string) => JSON.stringify(values[key]) !== JSON.stringify(base[key])
const changed = () => Object.fromEntries(Object.keys(values).filter(differs).map((k) => [k, values[k]]))

const control = (c: Control) => {
    const v = values[c.key]
    const k = c.key
    switch (c.type) {
        case "range":
            return `<label class="row" data-key="${k}" title="Double-click to reset"><span>${c.label}</span><output>${v}</output><input type="range" name="${k}" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}"></label>`
        case "switch":
            return `<label class="row" data-key="${k}" title="Double-click to reset"><span>${c.label}</span><input type="checkbox" name="${k}"${v ? " checked" : ""}></label>`
        case "menu":
            return `<label class="row" data-key="${k}" title="Double-click to reset"><span>${c.label}</span><select name="${k}">${c.options.map((o) => `<option${o === v ? " selected" : ""}>${o}</option>`).join("")}</select></label>`
        case "colour":
            return `<label class="row line" data-key="${k}" title="Double-click to reset"><span><i class="swatch"></i>${c.label}</span><input type="text" name="${k}" value="${v}" spellcheck="false"></label>`
        case "colours":
            return `<label class="row line" data-key="${k}" title="Double-click to reset"><span>${c.label}</span><input type="text" name="${k}" value="${(v as string[]).join(", ")}" spellcheck="false"></label>`
    }
}

const el = document.createElement("aside")
el.className = "tune left"
el.dataset.tune = "garden"
el.setAttribute("aria-label", "Garden settings")
el.innerHTML = `<style>${CSS}${EXTRA}</style>
    <header><strong>Garden</strong><span class="count" hidden></span><button type="button" class="icon fold" aria-expanded="true" aria-label="Fold the panel"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></header>
    <div class="body">${GROUPS.map(([name, list]) => `<details${name === "Plants" || name === "Sound" ? " open" : ""}><summary>${name}</summary>${list.map(control).join("")}</details>`).join("")}<p class="hint">Double-click a setting to reset it. Changes start the garden again (its plants are kept).</p></div>
    <footer><button type="button" class="ghost" data-act="reset">Reset all</button><button type="button" class="primary" data-act="copy">Copy values</button></footer>`

const count = el.querySelector<HTMLElement>(".count")!
const rows = [...el.querySelectorAll<HTMLElement>(".row")]
const list = GROUPS.flatMap(([, c]) => c)

// What the panel shows: values, which ones differ, the swatches
const show = () => {
    let n = 0
    for (const row of rows) {
        const key = row.dataset.key!
        const c = list.find((x) => x.key === key)!
        row.toggleAttribute("data-changed", differs(key))
        if (differs(key)) n++
        if (c.type === "range") {
            const input = row.querySelector<HTMLInputElement>("input")!
            input.value = String(values[key])
            input.style.setProperty("--p", `${((((values[key] as number) - c.min) / (c.max - c.min)) * 100).toFixed(2)}%`)
            row.querySelector("output")!.value = String(+(values[key] as number).toFixed(2))
        } else if (c.type === "switch") row.querySelector<HTMLInputElement>("input")!.checked = !!values[key]
        else if (c.type === "menu") row.querySelector<HTMLSelectElement>("select")!.value = String(values[key])
        else if (c.type === "colour") {
            row.querySelector<HTMLInputElement>("input")!.value = String(values[key])
            row.querySelector<HTMLElement>(".swatch")!.style.background = String(values[key])
        } else row.querySelector<HTMLInputElement>("input")!.value = (values[key] as string[]).join(", ")
    }
    count.hidden = !n
    count.textContent = `${n} changed`
}
show()

let timer = 0
const apply = () => {
    try {
        localStorage.setItem(STORE, JSON.stringify(changed()))
    } catch {}
    clearTimeout(timer)
    timer = window.setTimeout(() => document.dispatchEvent(new CustomEvent("garden:options", { detail: changed() })), 200)
}

const read = (e: Event) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement
    const key = t.name
    if (!key) return
    const c = list.find((x) => x.key === key)
    if (!c) return
    if (c.type === "range") values[key] = +t.value
    else if (c.type === "switch") values[key] = (t as HTMLInputElement).checked
    else if (c.type === "menu") values[key] = t.value
    else if (c.type === "colour") {
        // Text: take it when the browser accepts it as a colour
        if (e.type !== "change" || !CSS_SUPPORTS(t.value)) return
        values[key] = t.value.trim()
    } else {
        if (e.type !== "change") return
        const parts = t.value.split(",").map((s) => s.trim()).filter((s) => CSS_SUPPORTS(s))
        if (!parts.length) return
        values[key] = parts
    }
    show()
    apply()
}
const CSS_SUPPORTS = (colour: string) => !!colour.trim() && window.CSS.supports("color", colour.trim())
el.addEventListener("input", read)
el.addEventListener("change", read)

el.addEventListener("dblclick", (e) => {
    const row = (e.target as Element).closest<HTMLElement>(".row")
    if (!row) return
    values[row.dataset.key!] = base[row.dataset.key!]
    show()
    apply()
})

const fold = el.querySelector<HTMLButtonElement>(".fold")!
// Folded unless it was left open, like every panel (panel.ts)
const setFolded = (folded: boolean) => {
    el.toggleAttribute("data-folded", folded)
    fold.setAttribute("aria-expanded", String(!folded))
    fold.setAttribute("aria-label", folded ? "Unfold the panel" : "Fold the panel")
    try {
        localStorage.setItem("tune:garden:folded", folded ? "1" : "0")
    } catch {}
}
let stored: string | null = null
try {
    stored = localStorage.getItem("tune:garden:folded")
} catch {}
setFolded(matchMedia("(max-width: 599px)").matches || stored !== "0")
fold.addEventListener("click", () => setFolded(!el.hasAttribute("data-folded")))
el.addEventListener("click", async (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]")
    if (!button) return
    if (button.dataset.act === "reset") {
        values = { ...base }
        show()
        apply()
    } else {
        const text = Object.entries(changed())
            .map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`)
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

dock(el, "left")
// Settings kept from last time apply from the start
if (Object.keys(changed()).length) document.dispatchEvent(new CustomEvent("garden:options", { detail: changed() }))
