// Small WebGL1 helpers shared by the effects. Fullscreen quad only.
export const VERT = `attribute vec2 a;
varying vec2 v_uv;
void main(){v_uv=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}`

function shader(gl: WebGLRenderingContext, type: number, src: string) {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader")
    return s
}

/** Compile a fullscreen program. The vertex shader provides v_uv (0..1, y down); write only the fragment shader. */
export function program(gl: WebGLRenderingContext, frag: string) {
    const p = gl.createProgram()!
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, frag))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link")
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(p, "a")
    const uniforms = new Map<string, WebGLUniformLocation | null>()
    const u = (name: string) => {
        if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(p, name))
        return uniforms.get(name)!
    }
    return {
        /** Select the program and bind the quad; then set uniforms and call draw(). */
        use() {
            gl.useProgram(p)
            gl.bindBuffer(gl.ARRAY_BUFFER, buf)
            gl.enableVertexAttribArray(loc)
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
        },
        u,
        draw() {
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        },
        dispose() {
            gl.deleteProgram(p)
            gl.deleteBuffer(buf)
        },
    }
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const smooth = (a: number, b: number, x: number) => {
    const t = clamp01((x - a) / (b - a))
    return t * t * (3 - 2 * t)
}
