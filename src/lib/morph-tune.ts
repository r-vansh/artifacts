// Dev-only tuning panel for a post opening (converge.ts): the bulge, the handover from the
// WebGL stand-in to the real card, the timing and the particles, applied live from the next
// opening on. On the right, on pages with the grid (panel.ts stacks it with the others).
// Grid.astro loads it only under `npm run dev`, so it never ships. "Copy values" puts the
// settings on the clipboard in the shape of `params`, to paste back into converge.ts.
import { params } from "./converge"
import { dock, panel, type Slider } from "./panel"

// Every setting in `params`, in its order
const GROUPS: [string, Slider<keyof typeof params>[]][] = [
    [
        "Timing",
        [
            ["flight", "Particle flight (ms)", 250, 2000, 10],
            ["spread", "Set-off stagger (ms)", 0, 500, 10],
        ],
    ],
    [
        "Bulge",
        [
            ["bulge", "Strength (0 none)", 0, 1.2, 0.01],
            ["relax", "Flat by (share of the growth)", 0.2, 1, 0.01],
            ["curve", "Lets go (1 evenly, higher sooner)", 0.5, 4, 0.05],
        ],
    ],
    [
        "Card",
        [
            ["solid", "Opaque by (share of the growth)", 0.05, 0.8, 0.01],
            ["handover", "Real card from (share of the growth)", 0.4, 0.95, 0.01],
            ["blur", "Blur leaving the poster (px)", 0, 40, 1],
        ],
    ],
    ["Particles", [["density", "Window px² per particle (higher: fewer)", 200, 3000, 50]]],
]

function mount() {
    // Pages with the grid, once; it goes when a page swap leaves them
    const here = document.querySelector('[data-tune="morph"]')
    if (!document.querySelector(".grid .card")) return here?.remove()
    if (here) return
    dock(panel({ id: "morph", title: "Morph", label: "Post opening settings", groups: GROUPS, params, onChange: () => {} }), "right")
}

document.addEventListener("nav:enter", mount)
mount()
