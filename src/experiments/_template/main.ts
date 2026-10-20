// Template experiment: a plain module, no framework. mount() draws into the canvas
// and returns pause/resume/stop. The site's loader calls pause() off screen and in
// background tabs, and stop() when the page goes away.
import type { Mount } from "../../lib/types"

export interface Options {
    color: string
}

export const defaults: Options = { color: "#FF5A2F" }

const mount: Mount<Options> = (canvas, options) => {
    const c: Options = { ...defaults, ...options }
    const ctx = canvas.getContext("2d")!
    let raf = 0
    let running = false

    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.round(canvas.clientWidth * dpr)
        canvas.height = Math.round(canvas.clientHeight * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const loop = (t: number) => {
        if (!running) return
        const w = canvas.clientWidth
        const h = canvas.clientHeight
        ctx.clearRect(0, 0, w, h)
        ctx.fillStyle = c.color
        ctx.beginPath()
        ctx.arc(w / 2 + Math.sin(t / 600) * w * 0.3, h / 2, 6, 0, Math.PI * 2)
        ctx.fill()
        raf = requestAnimationFrame(loop)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    return {
        pause() {
            running = false
            cancelAnimationFrame(raf)
        },
        resume() {
            if (running) return
            running = true
            raf = requestAnimationFrame(loop)
        },
        stop() {
            this.pause()
            ro.disconnect()
        },
    }
}

export default mount
