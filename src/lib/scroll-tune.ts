// Dev-only tuning panel for the smooth scrolling (smooth.ts, Lenis): every Lenis on the site,
// the page's and an open post's, takes these settings, applied live. On every page, on the
// left above the Bulge panel (panel.ts stacks them). nav.ts loads it only under `npm run dev`,
// so it never ships. "Copy values" puts the settings on the clipboard in the shape of
// `params`, to paste back into smooth.ts.
import { params, retune } from "./smooth"
import { dock, panel, type Slider } from "./panel"

// Every setting in `params`, in its order
const GROUPS: [string, Slider<keyof typeof params>[]][] = [
    [
        "Wheel",
        [
            ["smooth", "Smooth wheel (0 native)", 0, 1, 1],
            ["lerp", "Glide (lower is longer)", 0.01, 1, 0.01],
            ["duration", "Fixed duration (s, 0 uses the glide)", 0, 3, 0.05],
            ["wheel", "Wheel distance", 0.2, 4, 0.05],
        ],
    ],
    [
        "Touch",
        [
            ["syncTouch", "Smooth touch (0 native)", 0, 1, 1],
            ["syncTouchLerp", "Touch glide", 0.01, 0.5, 0.005],
            ["inertia", "Touch inertia", 1, 3, 0.05],
            ["touch", "Touch distance", 0.2, 4, 0.05],
        ],
    ],
]

if (!document.querySelector('[data-tune="scroll"]')) dock(panel({ id: "scroll", title: "Scroll", label: "Scroll settings", groups: GROUPS, params, onChange: (key) => retune(key) }), "left")
