// Dev-only tuning panel for the intro particles (intro.ts): a floating panel on the right of
// the home page with a slider per setting, applied live. index.astro loads it only under
// `npm run dev`, so it never ships. "Copy values" puts the current settings on the clipboard
// in the shape of `params`, to paste back into intro.ts as the new defaults.
import { params, retune } from "./intro"

type Key = keyof typeof params

type Slider = [Key, string, number, number, number] // [setting, label, min, max, step]

// Every setting in `params`, in its order, grouped by stage
const GROUPS: [string, Slider[]][] = [
    [
        "Collision",
        [
            ["approach", "Collide after (screens scrolled)", 0.05, 0.6, 0.01],
            ["rush", "Rush into each other (1 steady)", 1, 4, 0.1],
            ["glide", "Scroll smoothing (ms)", 0, 400, 10],
            ["blend", "Real text to particles over (share of the approach)", 0, 1, 0.01],
            ["crush", "Crush into each other over (screens, 0 at once)", 0, 0.6, 0.01],
            ["ragged", "Ragged break line (px, 0 straight)", 0, 80, 1],
            ["soft", "Blur reaches out from the centre (px)", 0, 400, 1],
            ["blur", "Blur at the centre (px)", 0, 16, 0.5],
        ],
    ],
    [
        "Burst, then the magnet",
        [
            ["pop", "Pop at impact (px/s)", 0, 2000, 10],
            ["scatter", "Pop scatter (°, 360 any way)", 0, 360, 1],
            ["squash", "Pop up and down (share)", 0, 1, 0.05],
            ["puff", "Cloud slows down (per second)", 0.5, 10, 0.1],
            ["hold", "Cloud before the pull, once shredded (ms)", 0, 2000, 10],
            ["stagger", "Picked up one by one over (ms)", 0, 1500, 10],
            ["ramp", "Each pull builds over (ms)", 0, 1000, 10],
        ],
    ],
    [
        "Magnet",
        [
            ["pull", "Pull (px/s²)", 500, 20000, 100],
            ["fall", "Ease-off radius (px)", 20, 400, 5],
            ["drag", "Drag (per second)", 0.5, 12, 0.1],
            ["bounce", "Bounce (0 none, 1 springy)", 0, 1, 0.05],
        ],
    ],
    [
        "Trail",
        [
            ["trail", "Trail along the path (ms)", 0, 1500, 10],
            ["taper", "Packed near the pointer (1 even)", 0.5, 4, 0.1],
            ["cloud", "Cloud spread (px)", 0, 120, 1],
        ],
    ],
    [
        "Organic",
        [
            ["wander", "Eddies push (px/s², 0 none)", 0, 8000, 50],
            ["billow", "Eddies in the cloud (share)", 0, 1, 0.05],
            ["eddy", "Eddy size (px)", 20, 600, 5],
            ["churn", "Eddies change (per second)", 0, 4, 0.05],
            ["fray", "Trail widens to the tail (0 tube)", 0, 6, 0.1],
            ["vary", "Pulls differ (0 all alike)", 0, 0.9, 0.05],
        ],
    ],
    [
        "Vanishing",
        [
            ["reach", "Fades within (px of the pointer)", 5, 300, 5],
            ["fade", "Fade out over (ms)", 0, 1500, 10],
        ],
    ],
    [
        "Look",
        [
            ["size", "Particle size (px)", 1, 4, 0.5],
            ["opacity", "Faintest particle", 0, 1, 0.05],
            ["warm", "Grey to orange after the impact (ms)", 0, 2000, 10],
            ["cool", "Orange to grey near the text (px)", 0, 800, 5],
        ],
    ],
    [
        "Scrolling back",
        [
            ["emerge", "Come out of the pointer over (ms)", 0, 3000, 10],
            ["land", "Click into place over (ms)", 5, 400, 5],
            ["rest", "Particles to real text over (ms)", 0, 1500, 10],
        ],
    ],
]
const SLIDERS = GROUPS.flatMap(([, sliders]) => sliders)

const defaults = { ...params }

const CSS = `
.tune {
    position: fixed;
    z-index: 10;
    top: 50%;
    right: 16px;
    transform: translateY(-50%);
    width: 248px;
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 12px;
    background: var(--white);
    border: 1px solid var(--gray-200);
    font: 400 12px/1.3 var(--sans);
    letter-spacing: 0;
    color: var(--gray-700);
}
.tune header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.tune strong {
    font-weight: 500;
    color: var(--gray-main);
}
.tune .rows {
    display: grid;
    gap: 8px;
    margin-top: 4px;
}
.tune h3 {
    margin: 8px 0 0;
    padding-top: 8px;
    border-top: 1px dashed var(--gray-200);
    font: inherit;
    font-weight: 500;
    color: var(--gray-500);
}
.tune label {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px;
}
.tune output {
    font-variant-numeric: tabular-nums;
    color: var(--gray-main);
}
.tune input {
    grid-column: 1 / -1;
    width: 100%;
    margin: 0;
    accent-color: var(--primary);
}
.tune footer {
    display: flex;
    gap: 8px;
    margin-top: 12px;
}
.tune button {
    font: inherit;
    color: var(--gray-main);
    background: var(--gray-50);
    border: 1px solid var(--gray-200);
    padding: 4px 8px;
    cursor: pointer;
}
.tune footer button {
    flex: 1;
}
.tune[data-folded] .rows,
.tune[data-folded] footer {
    display: none;
}
`

const decimals = (step: number) => (String(step).split(".")[1] ?? "").length

function mount() {
    // Home page only, once
    const main = document.querySelector("main")
    if (!main || !document.querySelector(".intro[data-burst]") || main.querySelector(".tune")) return
    const panel = document.createElement("aside")
    panel.className = "tune"
    panel.setAttribute("aria-label", "Particle settings")
    panel.innerHTML = `<style>${CSS}</style>
        <header><strong>Particles</strong><button type="button" class="fold" aria-expanded="true">Hide</button></header>
        <div class="rows">${GROUPS.map(
            ([group, sliders]) =>
                `<h3>${group}</h3>` +
                sliders
                    .map(
                        ([key, label, min, max, step]) =>
                            `<label><span>${label}</span><output data-for="${key}"></output><input type="range" name="${key}" min="${min}" max="${max}" step="${step}"></label>`,
                    )
                    .join(""),
        ).join("")}</div>
        <footer><button type="button" data-act="copy">Copy values</button><button type="button" data-act="reset">Reset</button></footer>`

    const show = () => {
        for (const [key, , , , step] of SLIDERS) {
            panel.querySelector<HTMLInputElement>(`input[name="${key}"]`)!.value = String(params[key])
            panel.querySelector<HTMLOutputElement>(`output[data-for="${key}"]`)!.value = params[key].toFixed(decimals(step))
        }
    }
    show()

    // Size changes re-sample the text, so that one waits for the slider to be let go
    const set = (e: Event) => {
        const input = e.target as HTMLInputElement
        const key = input.name as Key
        if (!(key in params)) return
        if (key === "size" && e.type === "input") return
        params[key] = +input.value
        show()
        retune(key === "size")
    }
    panel.addEventListener("input", set)
    panel.addEventListener("change", set)

    panel.addEventListener("click", async (e) => {
        const button = (e.target as HTMLElement).closest("button")
        if (!button) return
        if (button.classList.contains("fold")) {
            const folded = panel.toggleAttribute("data-folded")
            button.textContent = folded ? "Show" : "Hide"
            button.setAttribute("aria-expanded", String(!folded))
        } else if (button.dataset.act === "reset") {
            Object.assign(params, defaults)
            show()
            retune(true)
        } else if (button.dataset.act === "copy") {
            const text = Object.entries(params)
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
    main.append(panel)
}

document.addEventListener("nav:enter", mount)
mount()
