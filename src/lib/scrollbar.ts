// The page's own scrollbar (Vansh, 2026-11-08): the browser's is hidden (global.css) and this thin
// one shows only while the pointer is near the right edge of the window, or being dragged. A lazy
// chunk that nav.ts loads on the first mouse move near that edge; a touch screen never gets it
export {}
const root = document.documentElement
const bar = document.createElement("div")
const thumb = document.createElement("div")
bar.className = "scrollbar"
bar.setAttribute("aria-hidden", "true")
bar.append(thumb)
document.body.append(bar)

const NEAR = 40 // px from the right edge where it appears
const MIN = 32 // px: the shortest thumb
let hold = 0
let drag: { y: number; top: number } | undefined

function place() {
    const view = root.clientHeight
    const all = root.scrollHeight
    const room = all - view
    bar.style.display = room > 1 ? "" : "none"
    if (room <= 1) return
    const h = Math.max(MIN, (view / all) * view)
    thumb.style.height = `${h}px`
    thumb.style.transform = `translateY(${(scrollY / room) * (view - h)}px)`
}
const show = (on: boolean) => bar.classList.toggle("on", on || !!drag)

addEventListener("scroll", place, { passive: true })
addEventListener("resize", place)
new ResizeObserver(place).observe(document.body)
addEventListener(
    "pointermove",
    (e) => {
        if (e.pointerType === "touch") return
        if (drag) {
            const view = root.clientHeight
            const h = thumb.offsetHeight
            const room = root.scrollHeight - view
            scrollTo({ top: ((drag.top + e.clientY - drag.y) / (view - h)) * room, behavior: "instant" as ScrollBehavior })
            return
        }
        const near = e.clientX >= innerWidth - NEAR
        clearTimeout(hold)
        if (near) show(true)
        else hold = window.setTimeout(() => show(false), 250)
    },
    { passive: true },
)
document.addEventListener("mouseleave", () => show(false))
thumb.addEventListener("pointerdown", (e) => {
    e.preventDefault()
    thumb.setPointerCapture(e.pointerId)
    drag = { y: e.clientY, top: thumb.getBoundingClientRect().top }
    show(true)
})
const end = () => {
    drag = undefined
    hold = window.setTimeout(() => show(false), 600)
}
thumb.addEventListener("pointerup", end)
thumb.addEventListener("pointercancel", end)
// A click on the track pages towards it
bar.addEventListener("pointerdown", (e) => {
    if (e.target !== bar) return
    const to = e.clientY < thumb.getBoundingClientRect().top ? -1 : 1
    scrollBy({ top: to * root.clientHeight * 0.9, behavior: "smooth" })
})
place()
