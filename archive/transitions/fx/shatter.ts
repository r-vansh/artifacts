// Shatter: the clicked poster fractures from the click point and bursts toward the
// camera while a shockwave of cracks runs across the page and glass shards close it
// to the page colour. On the entry page the shards fall away and the poster's pieces
// fly in from depth and snap together in their slot.
import type { Fx, Rect } from "../types"

const vert = `attribute vec2 aP,aC;
attribute vec3 aB,aR;
attribute float aD;
uniform vec4 uRect;
uniform vec2 uRes,uO;
uniform float uK,uPh,uM,uF;
varying vec3 vB;
varying vec2 vUv;
varying float vSh,vFog,vFill,vLine,vSep,vRim;
float cl(float x){return clamp(x,0.,1.);}
float eo(float x){x=1.-cl(x);return 1.-x*x*x;}
mat3 rot(vec3 a,float t){float s=sin(t),c=cos(t),o=1.-c;
return mat3(o*a.x*a.x+c,o*a.x*a.y+a.z*s,o*a.z*a.x-a.y*s,o*a.x*a.y-a.z*s,o*a.y*a.y+c,o*a.y*a.z+a.x*s,o*a.z*a.x+a.y*s,o*a.y*a.z-a.x*s,o*a.z*a.z+c);}
void main(){
vec2 P=uRect.xy+aP*uRect.zw,C=uRect.xy+aC*uRect.zw;
vec2 dv=C-uO;float dl=length(dv);vec2 dir=dl>.01?dv/dl:vec2(0.,-1.);
vec3 ax=normalize(vec3(-dir.y,dir.x,0.)+(aR-.5)*.4);
float th=0.,fog=0.,fill=1.,line=0.,sc=1.,k=uK;vec3 T=vec3(0.);
float sg=sign(aR.x-.5);
if(uM<.5){
if(uPh<.5){
float kd=.02+aD*.45;
float e=cl((k-kd-.02)/.5);
fill=step(.001,e);
float r=1.-eo(e);
th=(1.1+aR.x*.3)*r;
T.z=-60.*r;
line=cl((k-kd)/.012)*(1.-cl((k-kd-.015)/.05));
}else{
float kd=aD*.32;
float e=cl((k-kd-.03)/.45),g=e*e;
th=-(.6+aR.x*.8)*g;
T=vec3(dir*30.*g,0.)+vec3(0.,300.,uF*.25)*g;
fill=1.-smoothstep(.6,1.,e);
line=cl((k-kd)/.01)*(1.-cl((k-kd-.01)/.03))*.85;
}
}else{
if(uPh<.5){
float e=cl((k-.02-aD*.1)/.85),m=eo(e);
T=vec3(dir*(3.*cl(k/.05)+(25.+aR.x*90.)*m)+vec2(0.,420.*e*e-(30.+aR.y*60.)*m),-uF*(.12+.2*aR.y)*m);
th=(.5+aR.z*.9)*sg*(m*.6+e*.5);
sc=1.-smoothstep(.82,1.,e);
line=cl(k/.04)*(1.-cl(e*5.));
}else{
float e=cl((k-.04-aD*.22)/.5),b=1.-e,b4=b*b*b*b;
float ov=sin(3.1416*cl((e-.62)/.38));
T=vec3(dir*((90.+aR.x*200.)*b4-4.*ov),uF*(1.2+aR.y*1.2)*b*b*b);
th=(1.2+aR.z*1.4)*sg*b4-.03*sg*ov;
sc=smoothstep(0.,.25,e);
line=cl((e-.85)/.1)*(1.-cl((k-.62-aD*.1)/.05))*.5;
}
}
mat3 R=rot(ax,th);
vec3 q=vec3(P-C,0.);
vec3 w=vec3(C,0.)+R*(q*sc)+T;
if(sc==1.)w=vec3(P,0.)+(R*q-q)+T;
w.z=max(w.z,-.6*uF);
vec2 sp=uRes*.5+(w.xy-uRes*.5)*uF/(uF+w.z);
gl_Position=vec4(sp.x/uRes.x*2.-1.,1.-sp.y/uRes.y*2.,0.,1.);
vec3 N=R*vec3(0.,0.,-1.),L=normalize(vec3(-.45,-.65,-.6));
vSh=(dot(N,L)+L.z)*1.6;
vSep=cl(abs(th)*6.+length(T)*.05);
vRim=vSep*cl(vSh*3.);
vB=aB;vUv=aP;vFog=fog;vFill=fill;vLine=line;
}`

const frag = (deriv: boolean) => `${deriv ? "#extension GL_OES_standard_derivatives : enable\n" : ""}precision highp float;
uniform sampler2D uT;
uniform vec2 uTs;
uniform vec3 uBg,uLn,uInk,uWh,uPr;
uniform float uM,uA,uDpr;
varying vec3 vB;
varying vec2 vUv;
varying float vSh,vFog,vFill,vLine,vSep,vRim;
void main(){
${deriv ? "vec3 d3=vB/max(fwidth(vB),vec3(1e-5));float d=min(d3.x,min(d3.y,d3.z));" : "float d=99.;"}
vec3 c=uM>.5?texture2D(uT,(vUv-.5)*uTs+.5).rgb:uBg;
c=mix(c,uBg,vFog);
float s=vSh*(1.-vFog),ed=clamp(uDpr+.5-d,0.,1.);
c=mix(c,uWh,clamp(s,0.,1.)*.3);
c=mix(c,uM>.5?uInk:uLn,clamp(-s,0.,1.)*(.3-.1*uM));
c=mix(c,uWh,ed*vRim*(1.-vFog));
float a=vFill*mix(1.,clamp(d+.5,0.,1.),vSep);
float ln=clamp(.5*uDpr+.5-d,0.,1.)*vLine;
vec4 o=vec4(uPr,1.)*ln+vec4(c*a,a)*(1.-ln);
gl_FragColor=o*uA;
}`

// Small seeded PRNG so both pages build the same fracture
const prng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
}

// A spider-web fracture of a W x H rect around (cx, cy): straight radial cracks to the
// rim, rings denser near the impact, every cell split into separate triangles.
// Rows of 11 floats per vertex: P(2) C(2) B(3) R(3) D(1), positions divided by `sx, sy`.
function fracture(W: number, H: number, cx: number, cy: number, spokes: number, rings: number, seed: number, pw: number, sx = 1, sy = 1) {
    const r = prng(seed)
    const rim: [number, number][] = []
    const sides: [number, number, number, number][] = [
        [0, 0, W, 0],
        [W, 0, W, H],
        [W, H, 0, H],
        [0, H, 0, 0],
    ]
    for (const [x0, y0, x1, y1] of sides) {
        const n = Math.max(2, Math.round((spokes * Math.hypot(x1 - x0, y1 - y0)) / (2 * (W + H))))
        for (let i = 0; i < n; i++) {
            const f = (i + (i ? (r() - 0.5) * 0.6 : 0)) / n
            rim.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f])
        }
    }
    const N = rim.length
    const ring = (i: number) => Math.pow(i / rings, pw)
    const V: [number, number][][] = []
    for (let i = 0; i <= rings; i++) {
        const row: [number, number][] = []
        for (let j = 0; j < N; j++) {
            if (i === 0) row.push([cx, cy])
            else if (i === rings) row.push(rim[j])
            else {
                const a = rim[j]
                const b = rim[(j + 1) % N]
                const tj = (r() - 0.5) * 0.24
                const qx = a[0] + (b[0] - a[0]) * tj
                const qy = a[1] + (b[1] - a[1]) * tj
                const f = ring(i) + (r() - 0.5) * 0.45 * (ring(i + 1) - ring(i - 1)) * 0.5
                row.push([cx + (qx - cx) * f, cy + (qy - cy) * f])
            }
        }
        V.push(row)
    }
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy))
    const out: number[] = []
    const tri = (a: [number, number], b: [number, number], c: [number, number]) => {
        const gx = (a[0] + b[0] + c[0]) / 3
        const gy = (a[1] + b[1] + c[1]) / 3
        const rr = [r(), r(), r()]
        const d = Math.hypot(gx - cx, gy - cy) / far
        ;[a, b, c].forEach((p, i) => out.push(p[0] / sx, p[1] / sy, gx / sx, gy / sy, +(i === 0), +(i === 1), +(i === 2), rr[0], rr[1], rr[2], d))
    }
    for (let i = 0; i < rings; i++)
        for (let j = 0; j < N; j++) {
            const j1 = (j + 1) % N
            if (i === 0) tri(V[0][j], V[1][j], V[1][j1])
            else if (r() < 0.5) {
                tri(V[i][j], V[i][j1], V[i + 1][j1])
                tri(V[i][j], V[i + 1][j1], V[i + 1][j])
            } else {
                tri(V[i][j], V[i][j1], V[i + 1][j])
                tri(V[i][j1], V[i + 1][j1], V[i + 1][j])
            }
        }
    return new Float32Array(out)
}

// The click point, so the out half can crack from where the visitor pressed
let press: { x: number; y: number; at: number } | null = null
if (typeof addEventListener === "function") addEventListener("pointerdown", (e) => (press = { x: e.clientX, y: e.clientY, at: performance.now() }), { capture: true, passive: true })

const fx: Fx = {
    setup({ gl, w, h, dpr, src, dest, tex, texSize, palette, phase }) {
        const deriv = !!gl.getExtension("OES_standard_derivatives")
        const sh = (type: number, s: string) => {
            const o = gl.createShader(type)!
            gl.shaderSource(o, s)
            gl.compileShader(o)
            if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) || "shader")
            return o
        }
        const p = gl.createProgram()!
        gl.attachShader(p, sh(gl.VERTEX_SHADER, vert))
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag(deriv)))
        gl.linkProgram(p)
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link")
        const U = new Map<string, WebGLUniformLocation | null>()
        const u = (n: string) => {
            if (!U.has(n)) U.set(n, gl.getUniformLocation(p, n))
            return U.get(n)!
        }
        const attrs = (["aP", 2, "aC", 2, "aB", 3, "aR", 3, "aD", 1] as const).reduce<[number, number, number][]>((l, x, i, a) => {
            if (i % 2 === 0) l.push([gl.getAttribLocation(p, x as string), a[i + 1] as number, l.reduce((s, y) => s + y[1], 0)])
            return l
        }, [])
        const mk = (data: Float32Array) => {
            const b = gl.createBuffer()!
            gl.bindBuffer(gl.ARRAY_BUFFER, b)
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
            return { b, n: data.length / 11 }
        }
        const fallback = (): Rect => {
            const r = src.h / src.w
            const fw = Math.min(w * 0.4, (h * 0.7) / r)
            return { x: w * 0.75 - fw / 2, y: (h - fw * r) / 2, w: fw, h: fw * r }
        }
        // Where the fracture starts: the click on the index, the slot's centre on the entry page
        const recent = press && performance.now() - press.at < 3000 && press.x >= src.x && press.x <= src.x + src.w && press.y >= src.y && press.y <= src.y + src.h
        const pu: [number, number] = phase === "out" && recent ? [(press!.x - src.x) / src.w, (press!.y - src.y) / src.h] : [0.5, 0.5]
        const poster = mk(fracture(src.w, src.h, src.w * pu[0], src.h * pu[1], 11, 3, 7, 1.15, src.w, src.h))
        let page: { b: WebGLBuffer; n: number; o: [number, number] } | null = null
        // Built on first use; follows the slot if the entry page's layout settles in the first frames
        const pageAt = (o: [number, number], k: number) => {
            if (page && k < 0.12 && Math.hypot(o[0] - page.o[0], o[1] - page.o[1]) > 16) {
                gl.deleteBuffer(page.b)
                page = null
            }
            if (!page) page = { ...mk(fracture(w, h, o[0], o[1], 26, 7, 3, 1.45)), o }
            return page
        }
        const bind = (m: { b: WebGLBuffer }) => {
            gl.bindBuffer(gl.ARRAY_BUFFER, m.b)
            for (const [loc, size, off] of attrs) {
                gl.enableVertexAttribArray(loc)
                gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 44, off * 4)
            }
        }
        const mask = (r: Rect) => {
            gl.enable(gl.SCISSOR_TEST)
            const x0 = Math.round(r.x * dpr)
            const y0 = Math.round((h - r.y - r.h) * dpr)
            gl.scissor(x0, y0, Math.round((r.x + r.w) * dpr) - x0, Math.round((h - r.y) * dpr) - y0)
            gl.clearColor(palette.bg[0], palette.bg[1], palette.bg[2], 1)
            gl.clear(gl.COLOR_BUFFER_BIT)
            gl.disable(gl.SCISSOR_TEST)
        }
        return {
            draw(t) {
                const inn = t > 0.5
                const k = inn ? (t - 0.5) * 2 : t * 2
                gl.disable(gl.SCISSOR_TEST)
                if (t <= 0 || t >= 1) {
                    gl.clearColor(0, 0, 0, 0)
                    return gl.clear(gl.COLOR_BUFFER_BIT)
                }
                // The bridge: flat, opaque page colour
                if (Math.abs(t - 0.5) < 1e-6) {
                    gl.clearColor(palette.bg[0], palette.bg[1], palette.bg[2], 1)
                    return gl.clear(gl.COLOR_BUFFER_BIT)
                }
                gl.clearColor(0, 0, 0, 0)
                gl.clear(gl.COLOR_BUFFER_BIT)
                const home = inn ? dest() || fallback() : src
                const o: [number, number] = inn
                    ? [Math.min(w - 40, Math.max(40, home.x + home.w / 2)), Math.min(h - 40, Math.max(40, home.y + Math.min(home.h, h - home.y) / 2))]
                    : [src.x + src.w * pu[0], src.y + src.h * pu[1]]
                if (inn ? k < 0.78 : k > 0.03) mask(home)
                gl.useProgram(p)
                gl.enable(gl.BLEND)
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
                gl.activeTexture(gl.TEXTURE0)
                gl.bindTexture(gl.TEXTURE_2D, tex)
                gl.uniform1i(u("uT"), 0)
                const ra = home.w / home.h
                const ta = texSize[0] / texSize[1]
                gl.uniform2f(u("uTs"), Math.min(ra / ta, 1), Math.min(ta / ra, 1))
                gl.uniform3fv(u("uBg"), palette.bg)
                gl.uniform3fv(u("uLn"), palette.line)
                gl.uniform3fv(u("uInk"), palette.ink)
                gl.uniform3fv(u("uWh"), palette.white)
                gl.uniform3fv(u("uPr"), palette.primary)
                gl.uniform1f(u("uDpr"), dpr)
                gl.uniform2f(u("uRes"), w, h)
                gl.uniform1f(u("uK"), k)
                gl.uniform1f(u("uPh"), inn ? 1 : 0)
                gl.uniform1f(u("uF"), 1400)
                const pg = pageAt(o, k)
                gl.uniform2fv(u("uO"), pg.o)
                gl.uniform4f(u("uRect"), 0, 0, 1, 1)
                gl.uniform1f(u("uM"), 0)
                gl.uniform1f(u("uA"), 1)
                bind(pg)
                gl.drawArrays(gl.TRIANGLES, 0, pg.n)
                gl.uniform2fv(u("uO"), o)
                gl.uniform4f(u("uRect"), home.x, home.y, home.w, home.h)
                gl.uniform1f(u("uM"), 1)
                gl.uniform1f(u("uA"), inn ? 1 - smooth01((k - 0.9) / 0.1) : 1)
                bind(poster)
                gl.drawArrays(gl.TRIANGLES, 0, poster.n)
            },
            dispose() {
                gl.deleteProgram(p)
                gl.deleteBuffer(poster.b)
                if (page) gl.deleteBuffer(page.b)
            },
        }
    },
}

const smooth01 = (x: number) => {
    const t = Math.min(1, Math.max(0, x))
    return t * t * (3 - 2 * t)
}

export default fx
