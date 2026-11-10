// The hover video on the grid cards (Card.astro loads this on the first pointer-over, so it is not first-load JS)
// Hover only (a mouse): the video's file is fetched on the first hover, and it starts over each time.
// The sound fades in over 0.8 s and out over 0.4 s (a short rAF tween, no library)
export default function (first: Event) {
    const LEVEL = 0.6
    let wait = 0
    const fades = new WeakMap<HTMLVideoElement, number>()
    const fade = (v: HTMLVideoElement, to: number, ms: number, done?: () => void) => {
        cancelAnimationFrame(fades.get(v) ?? 0)
        const from = v.volume
        const t0 = performance.now()
        const tick = (now: number) => {
            const k = Math.min(1, (now - t0) / ms)
            v.volume = from + (to - from) * k
            if (k < 1) fades.set(v, requestAnimationFrame(tick))
            else done?.()
        }
        fades.set(v, requestAnimationFrame(tick))
    }
    const cardOf = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.(".card") ?? null
    // A video that had to start muted, and the card it is on: the next click or key press anywhere
    // is a gesture the browser accepts, so the sound comes on then, without a second hover
    let silenced: HTMLVideoElement | null = null
    const unlock = () => {
        const v = silenced
        silenced = null
        if (!v || v.paused || !v.classList.contains("on")) return
        v.muted = false
        v.volume = 0
        fade(v, LEVEL, 800)
    }
    addEventListener("pointerdown", unlock, true)
    addEventListener("keydown", unlock, true)
    const start = (v: HTMLVideoElement, retried = false) => {
        // A fade-out still running from the last time must not pause this start
        cancelAnimationFrame(fades.get(v) ?? 0)
        v.currentTime = 0
        v.volume = 0
        v.muted = false
        v.play().then(
            () => {
                v.classList.add("on")
                silenced = null
                fade(v, LEVEL, 800)
            },
            (err: DOMException) => {
                // Only a refusal of sound (NotAllowedError) is worth falling back on; any other
                // failure is not (a pause that came in the way is tried once more)
                if (err?.name === "AbortError" && !retried) return void setTimeout(() => start(v, true), 120)
                if (err?.name !== "NotAllowedError") return
                v.muted = true
                v.play().then(() => {
                    v.classList.add("on")
                    silenced = v
                }, () => {})
            },
        )
    }
    const over = (e: Event) => {
        const card = cardOf(e.target)
        // Moving between the card's own children is not coming in
        if (!card || card.contains((e as PointerEvent).relatedTarget as Node | null)) return
        const v = card.querySelector("video")
        if (!v) return
        clearTimeout(wait)
        // A short pause first, so sweeping the pointer across the grid starts no downloads
        wait = window.setTimeout(() => start(v), 150)
    }
    const out = (e: Event) => {
        const card = cardOf(e.target)
        if (!card || card.contains((e as PointerEvent).relatedTarget as Node | null)) return
        clearTimeout(wait)
        const v = card.querySelector("video")
        if (!v) return
        v.classList.remove("on")
        fade(v, 0, 400, () => v.pause())
    }
    document.addEventListener("pointerover", over)
    document.addEventListener("pointerout", out)
    over(first)
}
