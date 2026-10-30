// Dither: the page breaks into a pixel grid and a Bayer threshold sweeps out from the
// card. The poster pixelates and posterises away, then decodes back in at its new slot.
import type { Fx } from "../types"
import { program, clamp01 } from "../gl"

const frag = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D tex;
uniform vec2 R,O,TS;
uniform vec4 S;
uniform float H,dpr,C,F,BL,PO,PV,G,W,HP,IN;
uniform vec3 bg,ln,ink,pr,pl;
float b2(vec2 a){a=floor(a);return fract(a.x*.5+a.y*a.y*.75);}
float b4(vec2 a){return b2(a*.5)*.25+b2(a);}
float b8(vec2 a){return b4(a*.5)*.25+b2(a);}
float hs(vec2 a){return fract(sin(dot(a,vec2(127.1,311.7)))*43758.5453);}
float md;
float rad(vec2 c){vec2 d=c-O;float a=atan(d.y,d.x);return length(d)/md+.04+.02*sin(a*3.+W)+.012*sin(a*7.-W*1.7);}
vec3 tx(vec2 q){
vec2 uv=clamp(q,vec2(0.),S.zw)/S.zw;
float ra=(S.z/S.w)/(TS.x/TS.y);
if(ra>1.)uv.y=(uv.y-.5)/ra+.5;else uv.x=(uv.x-.5)*ra+.5;
return texture2D(tex,uv).rgb;
}
void main(){
vec2 p=vec2(gl_FragCoord.x,H-gl_FragCoord.y)/dpr;
md=length(max(O,R-O));
vec2 cl=floor(p/C);
float r=rad((cl+.5)*C)+.03*hs(cl);
float bt=b8(cl);
float e=(F-r)/.22;
vec4 o=vec4(0.);
vec2 f=p-cl*C;
bool gr=(f.x<1./dpr&&mod(cl.y+floor(f.y*.5),2.)<1.)||(f.y<1./dpr&&mod(cl.x+floor(f.x*.5),2.)<1.);
if(IN<.5){
if(e>bt){o=vec4(bg,1.);if(gr&&e<.9)o=vec4(ln,1.);}
else if(e>bt-.35){
float s=clamp((e-bt+.35)/.35,0.,1.);
vec2 g=abs(f-C*.5);
if(max(g.x,g.y)<mix(.18,.5,s)*C)o=vec4(e>bt-.15?pr:ink,1.);
}
}else{
if(e<=bt){o=vec4(bg,1.);if(gr&&r<F+.16)o=vec4(ln,1.);}
float q=C*.5;
vec2 lc=(floor(p/q)+.5)*q;
float rl=rad(lc);
if(F>0.&&rl>F&&rl<F+q/md)o=vec4(pr,1.);
}
vec2 q=p-S.xy;
if(q.x>=0.&&q.y>=0.&&q.x<S.z&&q.y<S.w){
vec2 bk=floor(q/BL);
if(b4(floor(q/G))<PV){
vec2 bc=(bk+.5)*BL;
float k=BL*.25*step(1.5,BL*dpr);
vec3 c=(tx(bc)+tx(bc+k)+tx(bc-k)+tx(bc+vec2(k,-k))+tx(bc+vec2(-k,k)))*.2;
float l=dot(c,vec3(.299,.587,.114))+(1.-HP)*(hs(bk+7.)-.5)*.6;
float lv=floor(clamp(l,0.,1.)*2.99+.5+(b4(bk)-.47)*.7);
vec3 rp=lv<1.?ink:lv<2.?pr:lv<3.?pl:bg;
o=vec4(mix(c,rp,PO),1.);
}else if(IN<.5)o=vec4(bg,1.);
}
gl_FragColor=o;
}`

const fx: Fx = {
    setup(ctx) {
        const { gl, dpr, w, h, palette: c } = ctx
        const p = program(gl, frag)
        // Cell size in whole device pixels so the grid never beats at fractional dpr
        const C = Math.round(Math.min(10, Math.max(6, Math.round(Math.max(w, h) / 160))) * dpr) / dpr
        const f1 = (n: string, v: number) => gl.uniform1f(p.u(n), v)
        const cols = Object.entries({ bg: c.bg, ln: c.line, ink: c.ink, pr: c.primary, pl: c.primaryLight })
        return {
            draw(t) {
                const bridge = Math.abs(t - 0.5) < 1e-6
                if (bridge) gl.clearColor(c.bg[0], c.bg[1], c.bg[2], 1)
                else gl.clearColor(0, 0, 0, 0)
                gl.clear(gl.COLOR_BUFFER_BIT)
                if (bridge || t <= 0 || t >= 1) return
                const out = t < 0.5
                const r = out ? ctx.src : ctx.dest() || ctx.src
                const lo = Math.max(1, Math.floor(Math.log2(Math.max(2, (Math.min(r.w, r.h) * dpr) / 5))))
                let s, k, F, PO, PV, G
                if (out) {
                    // 10 steps over the out half
                    s = Math.floor(t * 20) / 10
                    k = Math.min(lo, Math.floor(s * lo * 1.4) + 1)
                    PO = clamp01((s - 0.1) / 0.4)
                    F = s * 1.6
                    PV = 1 - clamp01((s - 0.6) / 0.3)
                    G = 2 ** k / dpr
                } else {
                    // 12 steps; the block size halves each step down to one device pixel
                    s = Math.floor((t - 0.5) * 24) / 12
                    k = Math.max(0, lo - Math.floor((s / 0.67) * (lo + 1)))
                    PO = k / lo
                    F = clamp01((s - 0.15) / 0.7) * 1.6
                    PV = k ? clamp01((s + 0.08) / 0.25) : 1 - clamp01((s - 0.67) / 0.2)
                    G = k ? 2 ** k / dpr : C
                }
                p.use()
                gl.uniform2f(p.u("R"), w, h)
                gl.uniform2f(p.u("O"), Math.min(w, Math.max(0, r.x + r.w / 2)), Math.min(h, Math.max(0, r.y + r.h / 2)))
                gl.uniform2fv(p.u("TS"), ctx.texSize)
                gl.uniform4f(p.u("S"), r.x, r.y, r.w, r.h)
                f1("H", gl.drawingBufferHeight)
                f1("dpr", dpr)
                f1("C", C)
                f1("F", F)
                f1("BL", 2 ** k / dpr)
                f1("PO", PO)
                f1("PV", PV)
                f1("G", G)
                f1("W", s * 6)
                f1("HP", ctx.hasPoster ? 1 : 0)
                f1("IN", out ? 0 : 1)
                for (const [n, v] of cols) gl.uniform3fv(p.u(n), v)
                gl.activeTexture(gl.TEXTURE0)
                gl.bindTexture(gl.TEXTURE_2D, ctx.tex)
                gl.uniform1i(p.u("tex"), 0)
                p.draw()
            },
            dispose: () => p.dispose(),
        }
    },
}
export default fx
