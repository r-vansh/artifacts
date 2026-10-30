// Particle swarm: the poster breaks into a grid of pixels that peel off from the edges,
// stream through a flow field and are drawn into one vortex at the viewport centre while
// the page closes around it. On the entry page the vortex expels them on spiralling arcs
// and they spring into the exact grid of the destination slot.
import type { Fx, Rect } from "../types"
import { program, smooth } from "../gl"

const HEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`

const vert = `precision highp float;
attribute vec4 a;
uniform vec2 res,grid,C,O,dd;
uniform vec4 rc;
uniform float k,ph,dpr,g;
varying vec2 vq,vh,vuv,vcell;
varying float vm,va,vt,vs,vaa;
const float PI=3.14159265;
float hs(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c);}
vec2 flow(vec2 p,float t){
vec2 v=cos(dot(p,vec2(.0071,.0043))+t*2.3+1.1)*vec2(.517,-.856);
v+=cos(dot(p,vec2(-.0052,.0109))-t*3.1+4.2)*vec2(.902,.431)*.8;
v+=cos(dot(p,vec2(.0157,-.0121))+t*1.7+2.5)*vec2(-.611,-.792)*.5;
return v/2.3;
}
vec2 pout(float s,vec2 S,float h,float h3){
float r=1.-pow(s,1.7);
vec2 p=C+rot(3.4*(.8+.4*h)*pow(1.-r,1.4))*(S-C)*r;
vec2 L=normalize(S-O+.001)*30.*sin(PI*min(s*1.6,1.))*(1.-s);
return p+L+flow(S+h3*90.,s)*46.*(.4+1.2*h3)*sin(PI*s)*(1.-s);
}
vec2 pin(float s,vec2 T,vec2 o,float h,float h3){
float r=pow(1.-s,3.2);
vec2 v=C+o-T;
float u=clamp((s-.5)/.5,0.,1.);
r-=min(4.,.012*length(v))/(length(v)+1e-3)*sin(PI*2.*u)*(1.-u)*(1.-u);
vec2 p=T+rot(-3.6*(.8+.4*h)*r*(1.-r))*v*r;
return p+flow(T+h3*90.,s+3.)*34.*(.4+1.2*h3)*sin(PI*min(s*2.,1.))*(1.-smoothstep(.3,.6,s));
}
void main(){
vec2 c=a.xy,q=a.zw;
float h=hs(c),h3=hs(c+31.7),sp=step(hs(c+17.3),.03);
vec2 cs=rc.zw*g/grid;
vec2 X0=O-rc.zw*g*.5;
vec2 S=X0+(c+.5)*cs;
float base=min(cs.x,cs.y);
float s,m,sz,lag=mix(.045,.12,sp);
vec2 P,Pt;
if(ph<.5){
vec2 u=(c+.5)/grid;
float ed=min(min(u.x,1.-u.x)*rc.z,min(u.y,1.-u.y)*rc.w)/(.5*min(rc.z,rc.w));
ed+=(sin(u.x*9.+u.y*4.)+sin(u.y*11.-u.x*5.+2.))*.06;
s=clamp((k-.04-.36*clamp(ed,0.,1.)-.12*h)/.44,0.,1.);
P=pout(s,S,h,h3);Pt=pout(max(s-lag,0.),S,h,h3);
m=smoothstep(0.,.12,s);
sz=base*mix(1.,.36,smoothstep(0.,.25,s))*mix(1.,.5,smoothstep(.7,1.,s))*mix(1.,.6,sp);
va=1.-smoothstep(.82,1.,s);
vt=max(smoothstep(.6,1.,s)*.85,smoothstep(0.,.2,s)*sp);
}else{
float dn=clamp((length(S-C)-dd.x)/(dd.y-dd.x),0.,1.);
s=clamp((k-.02-.48*dn-.06*h)/.32,0.,1.);
float orr=7.+15.*hs(c+4.1);
vec2 o=rot(k*160./orr+h*6.283)*vec2(orr,0.);
P=pin(s,S,o,h,h3);Pt=pin(max(s-lag,0.),S,o,h,h3);
m=1.-smoothstep(.6,1.,s);
sz=mix(mix(1.4,base*.4,smoothstep(0.,.3,s)),base,smoothstep(.45,.8,s))*smoothstep(0.,.05,k)*mix(1.,.6,sp*m);
va=1.;
vt=max((1.-smoothstep(0.,.2,s))*.7,(1.-smoothstep(.2,.7,s))*sp);
}
vec2 d=P-Pt;
float len=length(d);
if(len>1e-4){float l=min(len,sz*1.6+3.);Pt=P-d/len*l;d=P-Pt;len=l;}
float an=len>1e-4?atan(d.y,d.x):0.,fl=1.;
if(abs(an)>PI*.5){an-=sign(an)*PI;fl=-1.;}
an*=m*clamp(len/sz-.3,0.,1.);
vec2 u=vec2(cos(an),sin(an)),n=vec2(-u.y,u.x);
vec2 he=mix(cs*.5*(1.+.8*smoothstep(0.,.3,m)),vec2(len*.5+sz*.5,sz*.5),m);
float aa=smoothstep(.35,1.,m),ex=aa/dpr;
vec2 w=(P+Pt)*.5+u*q.x*(he.x+ex)+n*q.y*(he.y+ex);
if(m<=0.)w=X0+(c+.5+q*.5)*cs;
vq=q*(he+ex);vh=he;
vuv=(c+q*.5+.5)/grid;
vcell=(c+.5)/grid;
vm=m;vaa=aa;vs=m*len/(len+sz+1e-3)*fl;
gl_Position=vec4(w/res*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
}`

const frag = `${HEAD}
uniform sampler2D tx,cl;
uniform vec2 ts;
uniform vec3 pri;
uniform float dpr,ga;
varying vec2 vq,vh,vuv,vcell;
varying float vm,va,vt,vs,vaa;
void main(){
vec2 cv=clamp((vh-abs(vq))*dpr+.5,0.,1.);
float c=mix(1.,cv.x*cv.y,vaa);
c*=mix(1.,smoothstep(-vh.x,vh.x*.3,vq.x*sign(vs)),abs(vs));
vec3 col=mix(texture2D(tx,(vuv-.5)*ts+.5).rgb,texture2D(cl,vcell).rgb,vm);
col=mix(col,pri,vt);
float a=c*va*ga;
gl_FragColor=vec4(col*a,a);
}`

const down = `${HEAD}
uniform sampler2D tx;
uniform vec2 grid,ts;
void main(){
vec2 c=floor(gl_FragCoord.xy);
vec3 s=vec3(0.);
for(int i=0;i<4;i++)for(int j=0;j<4;j++){
vec2 q=(c+(vec2(float(i),float(j))+.5)/4.)/grid;
s+=texture2D(tx,(q-.5)*ts+.5).rgb;
}
gl_FragColor=vec4(s/16.,1.);
}`

const back = `${HEAD}
varying vec2 v_uv;
uniform vec2 res,C,ic;
uniform vec4 hole;
uniform vec3 bg,pri;
uniform float R,f,gi,gs,fo;
float hs(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}
void main(){
vec2 px=v_uv*res;
float cv=max(smoothstep(R-f,R,length(px-ic)),fo);
vec2 b=abs(px-hole.xy)-hole.zw;
cv=max(cv,clamp(.5-max(b.x,b.y),0.,1.));
vec2 e=px-C;
float gw=gi*exp(-dot(e,e)/(gs*gs))*.24+(hs(gl_FragCoord.xy)-.5)/255.*step(.001,gi);
gw=clamp(gw,0.,1.);
gl_FragColor=vec4(pri*gw+bg*cv*(1.-gw),gw+cv*(1.-gw));
}`

const N = 120

function compile(gl: WebGLRenderingContext) {
    const p = gl.createProgram()!
    for (const [type, src] of [
        [gl.VERTEX_SHADER, vert],
        [gl.FRAGMENT_SHADER, frag],
    ] as const) {
        const s = gl.createShader(type)!
        gl.shaderSource(s, src)
        gl.compileShader(s)
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader")
        gl.attachShader(p, s)
    }
    gl.bindAttribLocation(p, 0, "a")
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link")
    return p
}

const io = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(2 - 2 * x, 3) / 2)

const fx: Fx = {
    setup({ gl, canvas, w, h, dpr, src, dest, tex, texSize, palette, phase }) {
        const nx = N
        const ny = Math.max(24, Math.min(220, Math.round((N * src.h) / src.w)))
        const verts = new Float32Array(nx * ny * 24)
        const Q = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]
        let o = 0
        for (let y = 0; y < ny; y++)
            for (let x = 0; x < nx; x++)
                for (let i = 0; i < 12; i += 2) {
                    verts[o++] = x
                    verts[o++] = y
                    verts[o++] = Q[i]
                    verts[o++] = Q[i + 1]
                }
        const buf = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
        const pp = compile(gl)
        const ul = new Map<string, WebGLUniformLocation | null>()
        const u = (n: string) => {
            if (!ul.has(n)) ul.set(n, gl.getUniformLocation(pp, n))
            return ul.get(n)!
        }
        const bp = program(gl, back)
        const dp = program(gl, down)
        const cells = gl.createTexture()!
        const fb = gl.createFramebuffer()
        let ts: [number, number] | null = null
        const C: [number, number] = [w / 2, h / 2]

        const fallback = (): Rect => {
            const r = src.h / src.w
            const fw = Math.min(w * 0.45, (h * 0.8) / r)
            return { x: w * 0.75 - fw / 2, y: (h - fw * r) / 2, w: fw, h: fw * r }
        }
        // Average the poster over each cell once, for the flat colour of a flying particle
        const bake = (r: Rect) => {
            const ra = r.w / r.h
            const ta = texSize[0] / texSize[1]
            ts = [Math.min(ra / ta, 1), Math.min(ta / ra, 1)]
            gl.bindTexture(gl.TEXTURE_2D, cells)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nx, ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
            for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cells, 0)
            gl.viewport(0, 0, nx, ny)
            gl.disable(gl.BLEND)
            dp.use()
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, tex)
            gl.uniform1i(dp.u("tx"), 0)
            gl.uniform2f(dp.u("grid"), nx, ny)
            gl.uniform2fv(dp.u("ts"), ts)
            dp.draw()
            gl.bindFramebuffer(gl.FRAMEBUFFER, null)
            gl.viewport(0, 0, canvas.width, canvas.height)
        }
        const flat = (a: number) => {
            gl.clearColor(palette.bg[0] * a, palette.bg[1] * a, palette.bg[2] * a, a)
            gl.clear(gl.COLOR_BUFFER_BIT)
        }

        return {
            draw(t) {
                const out = phase === "out"
                gl.bindFramebuffer(gl.FRAMEBUFFER, null)
                gl.viewport(0, 0, canvas.width, canvas.height)
                if (out ? t <= 0 : t >= 1) return flat(0)
                if (out ? t >= 0.5 : t <= 0.5) return flat(1)
                const k = out ? t * 2 : (t - 0.5) * 2
                const r = out ? src : dest() || fallback()
                if (!ts) bake(r)
                const g = out ? 1 - 0.03 * Math.sin(Math.PI * smooth(0, 0.22, k)) : 1
                const cx = r.x + r.w / 2
                const cy = r.y + r.h / 2
                flat(0)
                gl.enable(gl.BLEND)
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

                // The page closes in towards the vortex, or opens out from the slot
                let R, ic: [number, number], gi, gs, hole: number[]
                if (out) {
                    ic = C
                    R = (Math.hypot(w / 2, h / 2) + 28) * (1 - io(smooth(0.04, 0.72, k)))
                    gi = smooth(0.3, 0.8, k) * (1 - smooth(0.84, 1, k))
                    gs = 4 + 56 * (1 - smooth(0.7, 1, k))
                    hole = [cx, cy, r.w / 2 + 2, r.h / 2 + 2]
                } else {
                    ic = [cx, cy]
                    R = (Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + 90) * io(smooth(0.28, 0.9, k))
                    gi = smooth(0, 0.05, k) * (1 - smooth(0.3, 0.6, k))
                    gs = 4 + 56 * smooth(0, 0.15, k)
                    hole = k < 0.9 ? [cx, cy, r.w / 2, r.h / 2] : [-9, -9, 0, 0]
                }
                bp.use()
                gl.uniform2f(bp.u("res"), w, h)
                gl.uniform2fv(bp.u("C"), C)
                gl.uniform2fv(bp.u("ic"), ic)
                gl.uniform4fv(bp.u("hole"), hole)
                gl.uniform3fv(bp.u("bg"), palette.bg)
                gl.uniform3fv(bp.u("pri"), palette.primary)
                gl.uniform1f(bp.u("R"), R)
                gl.uniform1f(bp.u("f"), 28)
                gl.uniform1f(bp.u("gi"), gi)
                gl.uniform1f(bp.u("gs"), gs)
                gl.uniform1f(bp.u("fo"), out ? smooth(0.14, 0.4, k) : 0)
                bp.draw()

                // Range of slot-cell distances from the vortex, for the launch stagger
                const ds = [0, 1].flatMap((i) => [0, 1].map((j) => Math.hypot(r.x + i * r.w - C[0], r.y + j * r.h - C[1])))
                const inside = C[0] > r.x && C[0] < r.x + r.w && C[1] > r.y && C[1] < r.y + r.h
                const dmin = inside ? 0 : Math.hypot(Math.max(r.x - C[0], 0, C[0] - r.x - r.w), Math.max(r.y - C[1], 0, C[1] - r.y - r.h))

                gl.useProgram(pp)
                gl.bindBuffer(gl.ARRAY_BUFFER, buf)
                gl.enableVertexAttribArray(0)
                gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0)
                gl.activeTexture(gl.TEXTURE0)
                gl.bindTexture(gl.TEXTURE_2D, tex)
                gl.uniform1i(u("tx"), 0)
                gl.activeTexture(gl.TEXTURE1)
                gl.bindTexture(gl.TEXTURE_2D, cells)
                gl.uniform1i(u("cl"), 1)
                gl.uniform2f(u("res"), w, h)
                gl.uniform2f(u("grid"), nx, ny)
                gl.uniform2fv(u("C"), C)
                gl.uniform2f(u("O"), cx, cy)
                gl.uniform2f(u("dd"), dmin, Math.max(...ds) + 1)
                gl.uniform4f(u("rc"), r.x, r.y, r.w, r.h)
                gl.uniform1f(u("k"), k)
                gl.uniform1f(u("ph"), out ? 0 : 1)
                gl.uniform1f(u("dpr"), dpr)
                gl.uniform1f(u("g"), g)
                gl.uniform2fv(u("ts"), ts!)
                gl.uniform3fv(u("pri"), palette.primary)
                gl.uniform1f(u("ga"), out ? 1 : 1 - smooth(0.9, 1, k))
                gl.drawArrays(gl.TRIANGLES, 0, nx * ny * 6)
                gl.activeTexture(gl.TEXTURE0)
            },
            dispose() {
                gl.deleteProgram(pp)
                gl.deleteBuffer(buf)
                gl.deleteTexture(cells)
                gl.deleteFramebuffer(fb)
                bp.dispose()
                dp.dispose()
            },
        }
    },
}
export default fx
