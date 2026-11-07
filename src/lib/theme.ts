// The light/dark switch, worked by the cord (src/components/Cord.astro, src/lib/cord.ts). The
// choice is kept in localStorage; Base.astro's head script applies it before the first paint. Dark
// mode itself is CSS: global.css turns the token ramps over under html[data-theme="dark"].
// Either way, the old page comes off like a cloth (cloth.ts, lazy) with the other one already
// behind it; a slight pull only peeks at that, with nothing saved (`data-peek` while it is only a
// look, "light" or "dark" for the page that is behind). If the cloth can't run or hasn't loaded,
// the colours just fade. Only a held pull switches, in either direction; the keyboard has no other
// way, so it switches straight off, and so does a click while the cord's physics aren't there
// (reduced motion, or not loaded yet).
// "theme:change" on `document` says the colours have settled (what reads them, like the intro's
// particles, reads them again).
const FADE = 400 // ms: global.css fades the colours over this long (.theme-fade)

const root = document.documentElement
const pull = document.querySelector<HTMLButtonElement>(".pull")
const motion = matchMedia("(prefers-reduced-motion: no-preference)")
let timer = 0
let cloth: typeof import("./cloth") | undefined
let chosen = root.dataset.theme === "dark"
let cordWorks = false

// The sky across the top of the page (sky.ts, lazy): stars and meteors on the dark page, clouds and
// birds on the light one. Loaded once, then it follows `data-theme` by itself
let skyLoaded = false
const loadSky = () => {
    if (skyLoaded) return
    skyLoaded = true
    import("./sky").catch(() => (skyLoaded = false))
}

const label = () => pull?.setAttribute("aria-label", chosen ? "Switch to light mode" : "Switch to dark mode")

function apply(next: boolean, fade: boolean) {
    if (fade) root.classList.add("theme-fade")
    chosen = next
    if (next) loadSky()
    if (next) root.dataset.theme = "dark"
    else delete root.dataset.theme
    delete root.dataset.peek
    try {
        localStorage.setItem("theme", next ? "dark" : "light")
    } catch {}
    label()
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(root).getPropertyValue("--gray-50").trim())
    clearTimeout(timer)
    timer = window.setTimeout(
        () => {
            root.classList.remove("theme-fade")
            document.dispatchEvent(new Event("theme:change"))
        },
        fade ? FADE : 0,
    )
}

// The other page behind the cloth, as a look only: nothing is saved or announced
const behind = (on: boolean) => {
    if (on) {
        if (!chosen) loadSky()
        if (chosen) delete root.dataset.theme
        else root.dataset.theme = "dark"
        root.dataset.peek = chosen ? "light" : "dark"
    } else {
        if (chosen) root.dataset.theme = "dark"
        else delete root.dataset.theme
        delete root.dataset.peek
    }
}

export function toggle() {
    const next = !chosen
    root.classList.remove("theme-fade")
    if (motion.matches && cloth?.drop(behind)) return apply(next, false)
    cloth?.stop() // a fall still going goes at once
    apply(next, motion.matches)
}

/** The cord is being pulled this far (px): the top of the page follows it, if there is a page to
 *  peek under */
export function peek(px: number) {
    if (!cloth) return
    if (px > 0 && !cloth.arm(behind)) return
    cloth.tug(px)
}

export const anchor = () => cloth?.anchor()

/** The cord is held (true) or let go (false): a peek that has begun is not healed while it is held */
export const hold = (on: boolean) => cloth?.keep(on)

/** The pointer is near the cord */
export function prime() {
    cloth?.prime()
}

/** From here a pointer's click no longer switches: it takes a pull (cord.ts) */
export function takeOver() {
    cordWorks = true
}

/** Loads the cloth, on idle with the cord's physics (Cord.astro) */
export function ready() {
    import("./cloth")
        .then((m) => {
            cloth = m
        })
        .catch(() => {})
}

let saved: [boolean, string | null] = [false, null]

/** For the timeline (scrub.ts); nothing of this is in the build */
export const dev = import.meta.env.DEV
    ? {
          async load() {
              cloth = await import("./cloth")
          },
          begin() {
              let stored: string | null = null
              try {
                  stored = localStorage.getItem("theme")
              } catch {}
              saved = [chosen, stored]
          },
          // Light again as far as the code is concerned, with the dark page behind
          reset() {
              chosen = false
              clearTimeout(timer)
              root.classList.remove("theme-fade")
              behind(true)
          },
          // Whatever has to see the light page, in one task
          light(job: () => void) {
              behind(false)
              job()
              behind(true)
          },
          end() {
              clearTimeout(timer)
              chosen = saved[0]
              behind(false)
              if (chosen) root.dataset.theme = "dark"
              try {
                  if (saved[1] === null) localStorage.removeItem("theme")
                  else localStorage.setItem("theme", saved[1])
              } catch {}
              label()
              document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(root).getPropertyValue("--gray-50").trim())
              document.dispatchEvent(new Event("theme:change"))
          },
      }
    : undefined

label()
// (the light page has its sky too, clouds and birds: loaded when the page is idle; under `npm run dev`
// at once, so its tuning panel is there)
if (chosen || import.meta.env.DEV) loadSky()
else if ("requestIdleCallback" in window) requestIdleCallback(loadSky, { timeout: 3000 })
else setTimeout(loadSky, 1500)
pull?.addEventListener("focus", prime)
pull?.addEventListener("click", (e) => {
    if (!cordWorks || !e.detail) toggle()
})
