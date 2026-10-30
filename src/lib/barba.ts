// Barba swaps <main data-barba="container"> between static pages; GSAP animates it.
// Loaded lazily by nav.ts. Barba does not run scripts or reset scroll, so both are done
// in beforeEnter. "nav:leave" / "nav:enter" tell stage.ts to stop and start experiments.
import barba from "@barba/core"
import { gsap } from "gsap"

const reduced = matchMedia("(prefers-reduced-motion: reduce)")
const scrolls = new Map<string, number>()
const HEAD = 'meta[name="description"],link[rel="canonical"],meta[property^="og:"],meta[name^="twitter:"]'

const tween = (target: gsap.TweenTarget, vars: gsap.TweenVars) =>
    new Promise<void>((done) => gsap.to(target, { ...vars, onComplete: done }))

const viaHistory = (trigger: unknown) => typeof trigger === "string"

function syncHead(html: string) {
    const doc = new DOMParser().parseFromString(html, "text/html")
    // Scoped styles are inlined per page, so bring over the ones this page does not have yet
    const have = new Set([...document.head.querySelectorAll("style")].map((s) => s.textContent))
    for (const s of doc.head.querySelectorAll("style")) if (!have.has(s.textContent)) document.head.append(document.importNode(s, true))
    document.title = doc.title
    document.head.querySelectorAll(HEAD).forEach((n) => n.remove())
    doc.head.querySelectorAll(HEAD).forEach((n) => document.head.append(document.importNode(n, true)))
}

// Module scripts the new page lists (Stage.astro's loader for stage.ts) that this document has not run.
// The browser dedupes by URL, so ones already loaded cost nothing.
const loadScripts = (html: string) =>
    Promise.all(
        [...new DOMParser().parseFromString(html, "text/html").querySelectorAll<HTMLScriptElement>("script[type=module][src]")].map((s) =>
            import(/* @vite-ignore */ new URL(s.getAttribute("src")!, location.href).href).catch(console.error)
        )
    )

// Scripts inside a swapped-in container do not run on their own
function rerun(container: HTMLElement) {
    for (const old of container.querySelectorAll("script")) {
        const s = document.createElement("script")
        s.textContent = old.textContent
        old.replaceWith(s)
    }
}

const fade = {
    name: "fade",
    leave: ({ current }: { current: { container: HTMLElement } }) => tween(current.container, { opacity: 0, duration: reduced.matches ? 0 : 0.25, ease: "power1.out" }),
    enter: ({ next }: { next: { container: HTMLElement } }) =>
        new Promise<void>((done) =>
            gsap.fromTo(next.container, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: reduced.matches ? 0 : 0.4, ease: "power2.out", clearProps: "transform", onComplete: done })
        ),
}

history.scrollRestoration = "manual"

barba.hooks.before(() => {
    scrolls.set(location.href, scrollY)
})
barba.hooks.afterLeave(() => {
    document.dispatchEvent(new Event("nav:leave"))
})
barba.hooks.beforeEnter((data) => {
    const next = data?.next
    // Barba also runs these hooks for the page that was loaded directly (trigger "barba"); nothing to swap then
    if (!next || data.trigger === "barba") return
    next.container.style.opacity = "0"
    syncHead(next.html)
    rerun(next.container)
    scrollTo(0, viaHistory(data.trigger) ? (scrolls.get(next.url.href) ?? 0) : 0)
    document.querySelectorAll<HTMLAnchorElement>("footer nav a").forEach((a) => {
        if (a.pathname === location.pathname) a.setAttribute("aria-current", "page")
        else a.removeAttribute("aria-current")
    })
})
barba.hooks.afterEnter(async (data) => {
    if (!data || data.trigger === "barba") return
    await loadScripts(data.next.html)
    document.dispatchEvent(new Event("nav:enter"))
})

barba.init({
    timeout: 6000,
    // Files and the bare /play stage are real documents, not swappable pages
    prevent: ({ href }) => /\.\w+$|\/play$/.test(new URL(href, location.href).pathname),
    transitions: [fade],
})
