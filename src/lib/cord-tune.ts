// Dev-only tuning panel for the dark mode switch's cord (cord.ts), applied live. On the left
// (panel.ts stacks it with the others). Cord.astro loads it only under `npm run dev`, so it never
// ships. "Copy values" puts the settings on the clipboard in the shape of `params`.
import { params, retune } from "./cord"
import { dock, panel, type Slider } from "./panel"

// Every setting in `params`, in its order
const GROUPS: [string, Slider<keyof typeof params>[]][] = [
    [
        "Cord",
        [
            ["gravity", "Gravity (px/s²)", 200, 4000, 50],
            ["stiffness", "Stiffness (lower stretches more)", 500, 10000, 100],
            ["give", "Spring damping", 0, 30, 0.5],
            ["recoil", "Bounce damping", 0, 60, 1],
            ["bend", "Smoothness", 0, 800, 10],
            ["drag", "Air (swing dies sooner)", 0, 6, 0.05],
            ["weight", "Sun's weight", 0.5, 10, 0.1],
        ],
    ],
    [
        "Pointer",
        [
            ["brush", "Brush (share of its speed)", 0, 60, 1],
            ["width", "Brush radius (px)", 4, 80, 1],
            ["reach", "Sun's pull radius (px)", 0, 160, 1],
            ["magnet", "Sun's pull", 0, 3000, 10],
        ],
    ],
    [
        "Press",
        [
            ["grip", "Grip", 200, 8000, 50],
            ["pull", "Longest pull (cord lengths)", 1, 2.5, 0.05],
            ["tug", "Jolt on press (px/s)", 0, 1500, 10],
        ],
    ],
    [
        "Sun",
        [
            ["spin", "Turning speed", 10, 500, 5],
            ["wobble", "Turning damping", 0, 40, 0.5],
        ],
    ],
    [
        "The page",
        [
            ["dead", "Pull that does nothing (px)", 0, 40, 1],
            ["peek", "How readily the edge gives way", 0.2, 20, 0.1],
            ["commit", "Comes off at (px)", 20, 104, 1],
            ["tap", "A click's tug (px/s)", 0, 3000, 50],
        ],
    ],
    [
        "Breeze",
        [
            ["sway", "Strength (0 none)", 0, 300, 1],
            ["period", "One sway (s)", 1, 8, 0.1],
        ],
    ],
]

dock(panel({ id: "cord", title: "Cord", label: "Dark mode cord settings", side: "left", groups: GROUPS, params, onChange: () => {
    retune()
    document.dispatchEvent(new Event("cloth:retune"))
} }), "left")
