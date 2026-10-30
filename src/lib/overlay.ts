// A post opens as an overlay over the grid instead of a page of its own. The click is
// caught on a card, the entry page is fetched, and its <main> is shown in a layer over the
// home page (which keeps its place underneath). The URL changes to the post's, so the link
// can be shared and Back closes it; opened directly, /<slug> is still a full page.
const SAME = /^\/[^/.]+$/ // /<slug>: not /tags/x, not a file
const reduced = matchMedia("(prefers-reduced-motion: reduce)")

let layer: HTMLElement | undefined
let trigger: HTMLElement | undefined
let pushed = false
let busy = false

const sync = (doc: Document) => {
    // Scoped styles are inlined per page, so bring over the ones this document does not have yet
    const have = new Set([...document.head.querySelectorAll("style")].map((s) => s.textContent))
    for (const s of doc.head.querySelectorAll("style")) if (!have.has(s.textContent)) document.head.append(document.importNode(s, true))
}

const siblings = () => [...document.body.children].filter((el) => el !== layer && !el.classList.contains("splash")) as HTMLElement[]

async function open(url: URL, from: HTMLElement) {
    if (layer || busy) return
    busy = true
    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        const doc = new DOMParser().parseFromString(await res.text(), "text/html")
        const main = doc.querySelector<HTMLElement>('main[data-barba-namespace="entry"]')
        if (!main) throw new Error("no entry")
        sync(doc)
        // This <main> is not a page to swap: keep Barba away from it
        main.removeAttribute("data-barba")
        main.removeAttribute("data-barba-namespace")

        layer = document.createElement("div")
        layer.className = "overlay"
        layer.setAttribute("role", "dialog")
        layer.setAttribute("aria-modal", "true")
        layer.setAttribute("aria-label", doc.title)
        layer.tabIndex = -1
        layer.append(document.importNode(main, true))
        document.body.append(layer)
        siblings().forEach((el) => el.setAttribute("inert", ""))

        trigger = from
        history.pushState({ overlay: true }, "", url)
        pushed = true
        document.title = doc.title

        // The page's own scripts (the stage loader) are not run by innerHTML; load them by URL
        await Promise.all(
            [...doc.querySelectorAll<HTMLScriptElement>("script[type=module][src]")].map((s) =>
                import(/* @vite-ignore */ new URL(s.getAttribute("src")!, location.href).href).catch(console.error)
            )
        )
        document.dispatchEvent(new Event("overlay:open"))
        layer.focus({ preventScroll: true })
        layer.classList.add("on")
    } catch {
        location.href = url.href
    } finally {
        busy = false
    }
}

const home = document.title

function remove() {
    if (!layer) return
    const gone = layer
    layer = undefined
    pushed = false
    siblings().forEach((el) => el.removeAttribute("inert"))
    document.title = home
    // Stages inside stop and let go of their canvases
    document.dispatchEvent(new CustomEvent("overlay:close", { detail: gone }))
    const done = () => gone.remove()
    if (reduced.matches) done()
    else {
        gone.classList.remove("on")
        gone.classList.add("out")
        setTimeout(done, 250)
    }
    trigger?.focus({ preventScroll: true })
}

// Closed from the page (the back chip, Esc): Back out of the pushed entry, which closes it
const dismiss = () => (pushed ? history.back() : remove())

addEventListener(
    "click",
    (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        const a = (e.target as Element).closest?.<HTMLAnchorElement>("a[href]")
        if (!a) return
        if (layer?.contains(a) && a.classList.contains("back")) {
            e.preventDefault()
            e.stopImmediatePropagation()
            return dismiss()
        }
        if (layer || !a.closest(".card") || a.origin !== location.origin || !SAME.test(a.pathname)) return
        e.preventDefault()
        e.stopImmediatePropagation()
        open(new URL(a.href), a)
    },
    true
)

addEventListener("keydown", (e) => {
    if (e.key === "Escape" && layer) dismiss()
})

// Back closes the overlay (and Forward would not reopen it: that is a normal page then)
addEventListener(
    "popstate",
    (e) => {
        if (!layer) return
        e.stopImmediatePropagation()
        remove()
    },
    true
)

// A link inside the overlay that goes to another page (a tag) is a normal navigation
document.addEventListener("nav:leave", () => layer && remove())
