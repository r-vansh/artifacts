// Dev-only tuning panel for the intro particles (intro.ts): a floating panel on the right of
// the home page with a slider per setting, applied live. index.astro loads it only under
// `npm run dev`, so it never ships. "Copy values" puts the current settings on the clipboard
// in the shape of `params`, to paste back into intro.ts as the new defaults.
import { params, retune } from "./intro"
import { dock, panel, type Slider as Row } from "./panel"

type Key = keyof typeof params

type Slider = Row<Key> // [setting, label, min, max, step]

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
function mount() {
    // Home page only, once; it goes when a page swap leaves the home page
    const here = document.querySelector('[data-tune="particles"]')
    if (!document.querySelector(".intro[data-burst]")) return here?.remove()
    if (here) return
    dock(
        panel({
            id: "particles",
            title: "Particles",
            label: "Particle settings",
            groups: GROUPS,
            params,
            // Size changes re-sample the text, so that one waits for the slider to be let go
            late: ["size"],
            onChange: (key) => retune(key === "size" || key === null),
        }),
        "right",
    )
}

document.addEventListener("nav:enter", mount)
mount()
