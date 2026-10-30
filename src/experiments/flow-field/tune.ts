// Dev-only tuning panel for the Flow Field, in the same spirit as src/lib/tune.ts: a
// floating panel on the right of the stage with a slider per setting, applied live.
// main.ts loads it only under `npm run dev`, so it never ships. Double-click a slider
// to reset it; a key (H for the main panel) hides and shows it. Which folders are open
// and whether the panel is folded are remembered (localStorage), the values are not.
// Several panels can sit side by side, each with its own place, key and memory.

export interface Row {
    /** The Options key it copies and resets as; none for runtime-only controls */
    key?: string
    label: string
    hint?: string
    min: number
    max: number
    step: number
    get(): number
    set(v: number): void
    /** Reset value when there is no key */
    initial?: number
    /** Value changes on its own (the reveal scrub), so the panel keeps it in view */
    listen?: boolean
}

export interface Choice {
    key: string
    label: string
    hint?: string
    choices: string[]
    get(): string
    set(v: string): void
}

export interface Folder {
    title: string
    rows: (Row | Choice)[]
}

export interface Spec {
    container: HTMLElement
    title: string
    /** The Options defaults, for resets */
    defaults: object
    folders: Folder[]
    /** Buttons in the footer, beside Copy values and Reset all */
    actions: [string, () => void][]
    /** The current settings in the shape of the Options defaults */
    copy(): string
    /** An on/off switch at the top of the panel */
    toggle?: { key: string; label: string; get(): boolean; set(on: boolean): void }
    /** Where it sits (px from the right), the key that folds it, its localStorage key,
        and how many folders start open */
    right?: number
    hotkey?: string
    store?: string
    openByDefault?: number
}

const CSS = `
.ff-tune .switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px dashed var(--gray-200);
    color: var(--gray-900);
    font-weight: 500;
}
.ff-tune .switch button {
    width: 30px;
    height: 16px;
    padding: 2px;
    border: 1px solid var(--gray-300);
    border-radius: 8px;
    background: var(--gray-100);
}
.ff-tune .switch button::before {
    content: "";
    display: block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--gray-500);
    transition: transform 0.15s;
}
.ff-tune .switch button[aria-checked="true"] {
    background: var(--gray-main);
    border-color: var(--gray-main);
}
.ff-tune .switch button[aria-checked="true"]::before {
    background: var(--white);
    transform: translateX(14px);
}
.ff-tune[data-off] .body {
    opacity: 0.45;
}
.ff-tune[data-folded] .switch {
    display: none;
}
.ff-tune {
    position: absolute;
    z-index: 2;
    top: 12px;
    right: 12px;
    width: 264px;
    max-height: calc(100% - 24px);
    display: flex;
    flex-direction: column;
    background: var(--white);
    border: 1px solid var(--gray-200);
    font: 400 12px/1.3 var(--sans);
    letter-spacing: 0;
    color: var(--gray-700);
    -webkit-font-smoothing: antialiased;
}
.ff-tune button {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
}
.ff-tune :focus-visible {
    outline: 1px solid var(--primary);
    outline-offset: 2px;
}
.ff-tune > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px dashed var(--gray-200);
}
.ff-tune > header strong {
    font-weight: 500;
    color: var(--gray-main);
}
.ff-tune > header span {
    color: var(--gray-500);
}
.ff-tune .fold {
    color: var(--gray-600);
}
.ff-tune .fold:hover {
    color: var(--gray-main);
}
.ff-tune kbd {
    font: inherit;
    padding: 0 4px;
    margin-left: 4px;
    border: 1px solid var(--gray-200);
    color: var(--gray-500);
}
.ff-tune .body {
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--gray-300) transparent;
}
.ff-tune section + section {
    border-top: 1px dashed var(--gray-200);
}
.ff-tune h3 {
    margin: 0;
    font: inherit;
}
.ff-tune h3 button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 12px;
    font-weight: 500;
    color: var(--gray-900);
}
.ff-tune h3 button:hover {
    background: var(--gray-50);
}
.ff-tune h3 button::after {
    content: "+";
    font-weight: 400;
    color: var(--gray-500);
}
.ff-tune h3 button[aria-expanded="true"]::after {
    content: "−";
}
.ff-tune .rows {
    display: grid;
    gap: 12px;
    padding: 2px 12px 14px;
}
.ff-tune .rows[hidden] {
    display: none;
}
.ff-tune .row {
    display: grid;
    grid-template-columns: 1fr auto;
    column-gap: 8px;
    row-gap: 4px;
    align-items: baseline;
}
.ff-tune .row small {
    grid-column: 1 / -1;
    margin-top: -2px;
    font-size: 11px;
    color: var(--gray-500);
}
.ff-tune output {
    font-variant-numeric: tabular-nums;
    color: var(--gray-main);
}
.ff-tune .row[data-changed] output {
    color: var(--primary);
}
.ff-tune input[type="range"] {
    grid-column: 1 / -1;
    --p: 50%;
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 14px;
    margin: 0;
    background: linear-gradient(var(--gray-main), var(--gray-main)) 0 50% / var(--p) 1px no-repeat,
        linear-gradient(var(--gray-200), var(--gray-200)) 0 50% / 100% 1px no-repeat;
    cursor: pointer;
}
.ff-tune input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--white);
    border: 1px solid var(--gray-main);
}
.ff-tune input[type="range"]::-moz-range-thumb {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--white);
    border: 1px solid var(--gray-main);
}
.ff-tune input[type="range"]:hover::-webkit-slider-thumb,
.ff-tune input[type="range"]:focus-visible::-webkit-slider-thumb {
    border-color: var(--primary);
    background: var(--primary);
}
.ff-tune input[type="range"]:hover::-moz-range-thumb,
.ff-tune input[type="range"]:focus-visible::-moz-range-thumb {
    border-color: var(--primary);
    background: var(--primary);
}
.ff-tune input[type="range"]:focus-visible {
    outline: none;
}
.ff-tune .choices {
    grid-column: 1 / -1;
    display: flex;
    border: 1px solid var(--gray-200);
}
.ff-tune .choices button {
    flex: 1;
    padding: 4px 0;
    color: var(--gray-600);
}
.ff-tune .choices button + button {
    border-left: 1px solid var(--gray-200);
}
.ff-tune .choices button[aria-pressed="true"] {
    background: var(--gray-main);
    color: var(--white);
}
.ff-tune > footer {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 10px 12px 12px;
    border-top: 1px dashed var(--gray-200);
}
.ff-tune > footer button {
    padding: 6px 8px;
    border: 1px solid var(--gray-200);
    background: var(--gray-50);
    color: var(--gray-main);
}
.ff-tune > footer button:last-child:nth-child(odd) {
    grid-column: 1 / -1;
}
.ff-tune > footer button:hover {
    border-color: var(--gray-400);
}
.ff-tune > footer button.primary {
    background: var(--gray-main);
    border-color: var(--gray-main);
    color: var(--white);
}
.ff-tune[data-folded] {
    width: auto;
}
.ff-tune[data-folded] > header {
    border-bottom: 0;
    padding: 8px 10px;
}
.ff-tune[data-folded] > header span,
.ff-tune[data-folded] .body,
.ff-tune[data-folded] > footer {
    display: none;
}
`

const decimals = (step: number) => (String(step).split(".")[1] ?? "").length
const isChoice = (row: Row | Choice): row is Choice => "choices" in row

interface Saved {
    /** (stored per panel) */
    folded?: boolean
    open?: Record<string, boolean>
}

function load(store: string): Saved {
    try {
        return JSON.parse(localStorage.getItem(store) ?? "{}") as Saved
    } catch {
        return {}
    }
}

function save(store: string, saved: Saved) {
    try {
        localStorage.setItem(store, JSON.stringify(saved))
    } catch {
        // Private windows and blocked storage: the panel just won't remember
    }
}

export function createPanel(spec: Spec) {
    const store = spec.store ?? "flow-field-tune"
    const hotkey = (spec.hotkey ?? "h").toLowerCase()
    const saved = load(store)
    saved.open ??= {}
    const panel = document.createElement("aside")
    panel.className = "ff-tune"
    panel.setAttribute("aria-label", `${spec.title} settings`)
    panel.style.right = `${spec.right ?? 12}px`

    const style = document.createElement("style")
    style.textContent = CSS
    panel.append(style)

    const header = document.createElement("header")
    header.innerHTML = `<div><strong>Tune</strong> <span>${spec.title}</span></div><button type="button" class="fold"></button>`
    const fold = header.querySelector<HTMLButtonElement>(".fold")!
    panel.append(header)

    let showSwitch = () => {}
    if (spec.toggle) {
        const t = spec.toggle
        const row = document.createElement("div")
        row.className = "switch"
        row.innerHTML = `<span>${t.label}</span><button type="button" role="switch"></button>`
        const b = row.querySelector("button")!
        b.setAttribute("aria-label", t.label)
        showSwitch = () => {
            b.setAttribute("aria-checked", String(t.get()))
            panel.toggleAttribute("data-off", !t.get())
        }
        b.addEventListener("click", () => {
            t.set(!t.get())
            showSwitch()
        })
        panel.append(row)
        showSwitch()
    }

    const body = document.createElement("div")
    body.className = "body"
    panel.append(body)

    // Each row knows how to redraw itself and how to go back to its default
    const views: { show(): void; reset(): void; listen: boolean }[] = []

    const defaultOf = (row: Row | Choice) => {
        const defaults = spec.defaults as Record<string, unknown>
        if (row.key !== undefined && row.key in defaults) {
            const v = defaults[row.key]
            return isChoice(row) && typeof v === "boolean" ? (v ? "on" : "off") : v
        }
        return isChoice(row) ? row.get() : row.initial ?? row.get()
    }

    spec.folders.forEach(({ title, rows }, index) => {
        const section = document.createElement("section")
        const open = saved.open![title] ?? index < (spec.openByDefault ?? 2)
        const id = `${store}-${index}`
        section.innerHTML = `<h3><button type="button" aria-expanded="${open}" aria-controls="${id}">${title}</button></h3>`
        const list = document.createElement("div")
        list.className = "rows"
        list.id = id
        list.hidden = !open
        section.querySelector("button")!.addEventListener("click", (e) => {
            const button = e.currentTarget as HTMLButtonElement
            const now = button.getAttribute("aria-expanded") !== "true"
            button.setAttribute("aria-expanded", String(now))
            list.hidden = !now
            saved.open![title] = now
            save(store, saved)
        })

        for (const row of rows) {
            const el = document.createElement("div")
            el.className = "row"
            el.innerHTML = `<span>${row.label}</span><output></output>${row.hint ? `<small>${row.hint}</small>` : ""}`
            const output = el.querySelector("output")!
            const initial = defaultOf(row)

            if (isChoice(row)) {
                const group = document.createElement("div")
                group.className = "choices"
                group.setAttribute("role", "group")
                group.setAttribute("aria-label", row.label)
                for (const choice of row.choices) {
                    const b = document.createElement("button")
                    b.type = "button"
                    b.textContent = choice.replace(/^ease-/, "")
                    b.dataset.value = choice
                    b.addEventListener("click", () => {
                        row.set(choice)
                        show()
                    })
                    group.append(b)
                }
                el.append(group)
                output.remove()
                const show = () => {
                    for (const b of group.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === row.get()))
                    el.toggleAttribute("data-changed", row.get() !== initial)
                }
                views.push({ show, reset: () => row.set(initial as string), listen: false })
            } else {
                const input = document.createElement("input")
                input.type = "range"
                input.min = String(row.min)
                input.max = String(row.max)
                input.step = String(row.step)
                input.setAttribute("aria-label", row.label)
                input.title = "Double-click to reset"
                el.append(input)
                const show = () => {
                    const v = row.get()
                    input.value = String(v)
                    input.style.setProperty("--p", `${((v - row.min) / (row.max - row.min)) * 100}%`)
                    output.value = v.toFixed(decimals(row.step))
                    el.toggleAttribute("data-changed", Math.abs(v - (initial as number)) > row.step / 2)
                }
                input.addEventListener("input", () => {
                    row.set(+input.value)
                    show()
                })
                input.addEventListener("dblclick", () => {
                    row.set(initial as number)
                    show()
                })
                views.push({ show, reset: () => row.set(initial as number), listen: !!row.listen })
            }
            list.append(el)
        }
        section.append(list)
        body.append(section)
    })

    const showAll = () => views.forEach((v) => v.show())
    showAll()

    const footer = document.createElement("footer")
    const button = (label: string, run: () => void, primary = false) => {
        const b = document.createElement("button")
        b.type = "button"
        b.textContent = label
        if (primary) b.className = "primary"
        b.addEventListener("click", run)
        footer.append(b)
        return b
    }
    spec.actions.forEach(([label, run], i) => button(label, run, i === 0))
    const copy = button("Copy values", async () => {
        const text = spec.copy()
        try {
            await navigator.clipboard.writeText(text)
            copy.textContent = "Copied"
        } catch {
            console.log(text)
            copy.textContent = "In console"
        }
        setTimeout(() => (copy.textContent = "Copy values"), 1200)
    })
    button("Reset all", () => {
        views.forEach((v) => v.reset())
        if (spec.toggle) {
            const on = (spec.defaults as Record<string, unknown>)[spec.toggle.key]
            if (typeof on === "boolean") spec.toggle.set(on)
            showSwitch()
        }
        showAll()
    })
    panel.append(footer)

    const setFolded = (folded: boolean) => {
        panel.toggleAttribute("data-folded", folded)
        fold.innerHTML = `${folded ? "Show" : "Hide"}<kbd>${hotkey.toUpperCase()}</kbd>`
        fold.setAttribute("aria-expanded", String(!folded))
        saved.folded = folded
        save(store, saved)
    }
    setFolded(!!saved.folded)
    fold.addEventListener("click", () => setFolded(!panel.hasAttribute("data-folded")))

    const onKey = (e: KeyboardEvent) => {
        if (e.key.toLowerCase() !== hotkey) return
        if (e.metaKey || e.ctrlKey || e.altKey) return
        const t = e.target as HTMLElement
        if (t.isContentEditable || (t instanceof HTMLInputElement && t.type !== "range") || t instanceof HTMLTextAreaElement) return
        setFolded(!panel.hasAttribute("data-folded"))
    }
    document.addEventListener("keydown", onKey)

    // Keep values that change on their own (and the actions' effects) in view
    const timer = setInterval(() => {
        if (panel.hasAttribute("data-folded")) return
        views.forEach((v) => v.listen && v.show())
    }, 150)

    spec.container.append(panel)
    return {
        destroy() {
            clearInterval(timer)
            document.removeEventListener("keydown", onKey)
            panel.remove()
        },
    }
}
