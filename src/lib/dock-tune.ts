// Dev-only tuning panel for the grid's bulge (dock.ts): a floating panel on the left of any
// page with the grid (home, tags), a slider per setting, applied live (built by panel.ts).
// Grid.astro loads it only under `npm run dev`, so it never ships. "Copy values" puts the
// settings on the clipboard in the shape of `params`, to paste back into dock.ts.
import { params, retune } from "./dock"
import { dock, panel, type Slider } from "./panel"

// Every setting in `params`, in its order
const GROUPS: [string, Slider<keyof typeof params>[]][] = [
    [
        "Bulge",
        [
            ["max", "Scale at the top (1 flat)", 1, 2.5, 0.01],
            ["radius", "Radius (column pitches)", 0.5, 4, 0.05],
            ["round", "Shape (0 soft bump, 1 flat top)", 0, 1, 0.05],
            ["depth", "Perspective (px, lower is more 3D)", 100, 3000, 10],
        ],
    ],
    [
        "Surface",
        [
            ["tilt", "Posts turn with it (0 flat)", 0, 2, 0.05],
            ["push", "Lens push outward (0 none)", 0, 3, 0.05],
            ["shade", "Shade as they turn away", 0, 1, 0.05],
        ],
    ],
    [
        "Motion",
        [
            ["ease", "Follows the cursor (1 instant)", 0.02, 1, 0.01],
            ["swell", "Rises and sinks (1 instant)", 0.02, 1, 0.01],
        ],
    ],
]

function mount() {
    // Pages with the grid, once; it goes when a page swap leaves them
    const here = document.querySelector('[data-tune="dock"]')
    if (!document.querySelector(".grid .card")) return here?.remove()
    if (here) return
    dock(panel({ id: "dock", title: "Bulge", label: "Bulge settings", side: "left", groups: GROUPS, params, onChange: () => retune() }), "left")
}

document.addEventListener("nav:enter", mount)
mount()
