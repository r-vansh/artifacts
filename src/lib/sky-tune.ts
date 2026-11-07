// Dev-only tuning panel for the sky across the top of the page (sky.ts: stars and meteors on the
// dark page, clouds and birds on the light one), applied live. On the left (panel.ts stacks it
// with the others, folded to begin with). sky.ts loads it only under `npm run dev`, so it never
// ships. "Copy values" puts the settings on the clipboard in the shape of `params`; "Play one
// now" sends a meteor shower (dark page) or a bird (light page) at once, with the sky on screen.
import { dev, params } from "./sky"
import { dock, panel, type Slider } from "./panel"

// Every setting in `params`, in its order
const GROUPS: [string, Slider<keyof typeof params>[]][] = [
    [
        "Sky",
        [["height", "Sky height (window heights)", 0.2, 1.2, 0.01]],
    ],
    [
        "Stars (dark)",
        [
            ["density", "Px² of sky per star (more is fewer)", 4000, 60000, 500],
            ["size", "Star size (px)", 0.5, 3, 0.1],
            ["glow", "Brightness", 0, 1, 0.01],
            ["twinkle", "How much they breathe", 0, 1, 0.01],
        ],
    ],
    [
        "Meteors (dark)",
        [
            ["first", "First shower after (s)", 1, 60, 1],
            ["gap", "Between showers (s, up to twice)", 5, 120, 1],
            ["meteors", "Most in a shower", 2, 12, 1],
            ["angle", "Angle below the horizontal (deg)", 5, 70, 1],
            ["speed", "Speed (px/s)", 200, 2000, 10],
            ["tail", "Tail length (px)", 20, 300, 5],
        ],
    ],
    [
        "Clouds (light)",
        [
            ["clouds", "How many", 0, 10, 1],
            ["cloudGlow", "How visible", 0, 1, 0.01],
            ["drift", "Speed (px/s, on average)", 0, 60, 0.5],
            ["driftVary", "Speeds differ (0 all alike)", 0, 1, 0.01],
            ["driftSize", "Bigger ones slower", 0, 1, 0.01],
            ["cloudMin", "Smallest width (px)", 20, 300, 5],
            ["cloudMax", "Biggest width (px)", 40, 600, 5],
            ["cloudSkew", "Mostly small (1 even)", 1, 4, 0.05],
        ],
    ],
    [
        "Birds (light)",
        [
            ["birdGlow", "How visible", 0, 1, 0.01],
            ["birdFirst", "First bird after (s)", 1, 60, 1],
            ["birdGap", "Between birds (s, up to twice)", 5, 120, 1],
            ["birdSpeed", "Speed (px/s)", 10, 200, 1],
        ],
    ],
]

const el = panel({
    id: "sky",
    title: "Sky",
    label: "Night sky settings",
    side: "left",
    groups: GROUPS,
    params,
    // Laying out and sowing again costs more: only when the slider is let go
    late: ["density", "height", "clouds", "cloudMin", "cloudMax", "cloudSkew", "driftVary", "driftSize"],
    onChange: (key) => {
        if (key === null || key === "density" || key === "height" || key === "clouds" || key === "cloudMin" || key === "cloudMax" || key === "cloudSkew" || key === "driftVary" || key === "driftSize") dev?.refit()
        else dev?.redraw()
        if (key === null || key === "first" || key === "birdFirst") dev?.reschedule()
    },
})
const now = document.createElement("button")
now.type = "button"
now.className = "ghost"
now.textContent = "Play one now"
now.addEventListener("click", () => dev?.now())
el.querySelector("footer")!.prepend(now)
dock(el, "left")
