// Text Curtain lives in its own repo (r-vansh/text-curtain, hosted on GitHub Pages). This module
// only lays that page over the stage in an iframe, so a push to that repo shows up here.
import type { Mount } from "../../lib/types"

const mount: Mount = (canvas) => {
    const frame = document.createElement("iframe")
    frame.src = "https://r-vansh.github.io/text-curtain/"
    frame.title = "Text Curtain"
    frame.loading = "lazy"
    frame.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;display:block"
    canvas.after(frame)
    return {
        pause() {},
        resume() {},
        stop() {
            frame.remove()
        },
    }
}

export default mount
