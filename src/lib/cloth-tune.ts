// Dev-only tuning panel for the page falling like a cloth (cloth.ts), applied from the next fall.
// On the left (panel.ts stacks it with the others). Cord.astro loads it only under `npm run dev`,
// so it never ships. "Copy values" puts the settings on the clipboard in the shape of `params`.
import { params } from "./cloth"
import { dock, panel, type Slider } from "./panel"

// Every setting in `params`, in its order
const GROUPS: [string, Slider<keyof typeof params>[]][] = [
    ["Watch", [["speed", "Slow motion (1 normal, 0 stopped)", 0, 1, 0.01]]],
    [
        "The peek",
        [
            ["widen", "Comes off the wall, for the pull", 1, 12, 0.1],
            ["lean", "Pulled point comes forward", 0, 1, 0.01],
            ["pleats", "Folds fanning out from the cord", 2, 40, 1],
            ["peel", "How readily they start", 0, 3000, 10],
            ["follow", "Follows the cord", 2, 60, 1],
        ],
    ],
    [
        "The fall",
        [
            ["nodes", "Points in the sheet", 400, 8000, 100],
            ["fall", "Fall time (s)", 0.3, 2, 0.01],
            ["air", "Air", 0, 4, 0.05],
            ["release", "Lets go over (ms)", 0, 1500, 10],
            ["billow", "Comes off the wall (px/s)", 0, 1500, 10],
            ["folds", "Folds down the window", 1, 16, 0.5],
        ],
    ],
    [
        "The sheet",
        [
            ["iterations", "Steps a frame: less elastic (costs more)", 2, 24, 1],
            ["shear", "Resists skew", 0, 1, 0.01],
            ["bend", "Resists folding", 0, 1, 0.01],
        ],
    ],
    [
        "The pile",
        [
            ["thick", "Thickness", 0, 1, 0.01],
            ["depth", "Depth (share of the height)", 0.02, 0.5, 0.01],
            ["friction", "Grip", 0, 1, 0.01],
            ["gather", "Draws in from the sides", 0, 12, 0.1],
            ["rest", "Settles for (ms)", 0, 2000, 10],
            ["hold", "Stays for (ms)", 0, 5000, 50],
        ],
    ],
    [
        "The light",
        [
            ["azimuth", "From (0 above, -90 left, 90 right)", -180, 180, 1],
            ["elevation", "How high (low rakes across the folds)", 15, 88, 1],
            ["key", "Strength", 0, 1.5, 0.01],
            ["fill", "Light from everywhere else", 0, 1.5, 0.01],
            ["bounce", "Of that, on what faces down", 0, 1, 0.01],
        ],
    ],
    [
        "The shadows",
        [
            ["shadow", "On the cloth", 0, 1, 0.01],
            ["soft", "How soft (px)", 0, 40, 0.5],
            ["cast", "On the page behind", 0, 1, 0.01],
        ],
    ],
    [
        "The cloth",
        [
            ["sheen", "Fuzz where it turns away", 0, 1, 0.01],
            ["headroom", "Dims as it moves, to leave room for light", 0.7, 1, 0.01],
            ["through", "Print showing on the back", 0, 1, 0.01],
            ["camera", "Eye distance (window heights)", 0.8, 6, 0.1],
        ],
    ],
]

// These only change how it's lit, so the timeline shows them at once, without simulating again
const LOOK = new Set<string>(["azimuth", "elevation", "key", "fill", "bounce", "shadow", "soft", "cast", "sheen", "headroom", "through"])

dock(panel({ id: "cloth", title: "Cloth", label: "Falling page settings", side: "left", groups: GROUPS, params, onChange: (key) => document.dispatchEvent(new Event(key && LOOK.has(key) ? "cloth:relook" : "cloth:retune")) }), "left")
