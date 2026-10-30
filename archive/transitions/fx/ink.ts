// Ink: the poster dissolves into a marbled ink flood that blooms from the card, swirled
// along curl-noise flow lines, then paper chases the ink off screen. On the entry page
// the ink blooms back out of the slot, the poster precipitates from it, and the page is
// revealed in the wake as the ink recedes toward the corners.
import type { Fx, Rect } from "../types"
import { program, smooth } from "../gl"

const frag = `#extension GL_OES_standard_derivatives : enable
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D tx;
uniform vec2 res,ts;
uniform vec4 rc;
uniform vec3 bg,ink,mid,pri,wh,ln;
uniform float S,A,fA,fB,sw,sp,pa,dz,gr,md,tm,fz,vv;
vec2 hs(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453)*2.-1.;}
vec3 nd(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*f*(f*(f*6.-15.)+10.),du=30.*f*f*(f*(f-2.)+1.);
vec2 ga=hs(i),gb=hs(i+vec2(1.,0.)),gc=hs(i+vec2(0.,1.)),gd=hs(i+vec2(1.,1.));
float va=dot(ga,f),vb=dot(gb,f-vec2(1.,0.)),vc=dot(gc,f-vec2(0.,1.)),vd=dot(gd,f-vec2(1.,1.)),k=va-vb-vc+vd;
return vec3(va+u.x*(vb-va)+u.y*(vc-va)+u.x*u.y*k,ga+u.x*(gb-ga)+u.y*(gc-ga)+u.x*u.y*(ga-gb-gc+gd)+du*(u.yx*k+vec2(vb,vc)-va));}
float fb(vec2 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*nd(p).x;p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.7,1.3);a*=.5;}return s;}
float box(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,q.y),0.);}
float h1(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec4 over(vec4 s,vec4 d){return s+d*(1.-s.a);}
void main(){
vec2 px=v_uv*res,d=px-rc.xy;
float phi=box(d,rc.zw);
vec2 q=d/S;
for(int i=0;i<3;i++){vec3 n=nd(q*1.15+vec2(4.1,2.3)+tm);q+=vec2(n.z,-n.y)*sw*.333;}
float ph=box(q*S,rc.zw);
float amp=A*(.2+.8*smoothstep(0.,S*1.3,ph));
float fi=nd(q*18.+3.).x;
float pA=ph+amp*fb(q*1.2+vec2(1.7,9.2))+fi*3.;
float pB=ph+amp*fb(q*1.05+vec2(8.3,2.8))+fi*2.5;
float eA=pA-fA,eB=pB-fB;
float wA=fwidth(pA)*.7+.05,wB=fwidth(pB)*.7+.05;
float kA=1.-smoothstep(-wA,wA,eA),kB=1.-smoothstep(-wB,wB,eB);
float sl=1.-smoothstep(-.5,.5,phi);
if(md>.5)kB*=1.-sl;
float sat=smoothstep(0.,wB*2.+1.,eB)*exp(-max(eB,0.)/4.)*(1.-sl*md);
vec4 o=vec4(0.);
if(kA>0.){
float m=fb(q*2.2+vec2(7.3,-2.1));
float b=sin(q.y*5.+q.x*2.+m*6.+tm*3.),b2=sin(q.x*3.1-q.y*1.7+m*4.-tm*2.);
float fw=fwidth(b)+.01,fw2=fwidth(b2)+.01;
vec2 uv=(q*S/sp)/(2.*rc.zw)*ts+.5;
vec3 pv=texture2D(tx,1.-abs(1.-mod(uv*.6+.2,2.))).rgb;
vec3 c=mix(ink,mix(ink,mid,.22),smoothstep(-fw,fw,b));
c=mix(c,pv,smoothstep(.62-fw2,.62+fw2,b2));
float hr=1.-smoothstep(0.,fw*1.3,abs(b+.6));
c=mix(c,mix(mix(mid,wh,.3),pri,exp(eA/60.)),hr*.7);
c=mix(c,mix(mid,bg,.75+.15*fi),sat*.75);
o=vec4(c,1.)*kA;
float ps=box(q*S/sp,rc.zw)*sp;
float pm=1.-smoothstep(-fwidth(ps)*.7-.05,fwidth(ps)*.7+.05,ps);
float pt=.5+.5*b2*.8+.2*m;
float pw=fwidth(pt)*.8+.002;
pm=max(pm,sl*md*smoothstep(-pw,pw,fz*1.3-.15-pt))*smoothstep(-pw,pw,pa*1.3-.15-pt);
vec3 pc=texture2D(tx,uv).rgb;
float vt=mix(1.05,.84,vv);
pc=mix(pc,ink,smoothstep(vt-fw,vt+fw,-b));
o=over(vec4(pc,1.)*pm*kA,o);
}
if(eA>0.&&eA<9.){float hb=1.-eA/9.;
float fib=smoothstep(-.25,.45,nd(q*vec2(70.,64.)).x+fi*.4);
o=over(o,vec4(mix(ink,mid,.35),1.)*hb*hb*fib*.35);}
vec3 pp=mix(bg,ln,h1(gl_FragCoord.xy)*gr);
if(md<.5)o=over(vec4(pp,1.)*kB,o);
else{
o=over(o,vec4(pp,1.)*(1.-kA));
o*=1.-kB;
if(sl>0.){float v=fb(d/38.)*.8+.5;o*=1.-sl*smoothstep(v-.12,v+.12,dz*1.4-.2);}
}
o.rgb+=(h1(gl_FragCoord.xy+7.)-.5)/255.*o.a;
gl_FragColor=o;
}`

const eo = (x: number) => 1 - Math.pow(1 - x, 3)
const mix = (a: number, b: number, k: number) => a + (b - a) * k

// Distance from the rect's edge to the farthest viewport corner
const far = (r: Rect, w: number, h: number) => {
    let m = 0
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
        m = Math.max(m, Math.hypot(Math.max(Math.abs(x - r.x - r.w / 2) - r.w / 2, 0), Math.max(Math.abs(y - r.y - r.h / 2) - r.h / 2, 0)))
    }
    return m
}

const fx: Fx = {
    setup({ canvas, gl, w, h, dpr, src, dest, tex, texSize, palette }) {
        gl.getExtension("OES_standard_derivatives")
        // Noise-heavy shader: cap the backing store near 3.2M px, edges stay antialiased
        const sc = Math.min(dpr, Math.sqrt(3.2e6 / (w * h)))
        canvas.width = Math.round(w * sc)
        canvas.height = Math.round(h * sc)
        gl.viewport(0, 0, canvas.width, canvas.height)
        const p = program(gl, frag)
        const S = Math.min(w, h) * 0.5
        const A = S * 0.55
        const fallback = (): Rect => {
            const r = src.h / src.w
            const fw = Math.min(w * 0.45, (h * 0.7) / r)
            return { x: w * 0.75 - fw / 2, y: (h - fw * r) / 2, w: fw, h: fw * r }
        }
        return {
            draw(t) {
                const flat = Math.abs(t - 0.5) < 1e-6
                if (flat) gl.clearColor(palette.bg[0], palette.bg[1], palette.bg[2], 1)
                else gl.clearColor(0, 0, 0, 0)
                gl.clear(gl.COLOR_BUFFER_BIT)
                if (flat || t <= 0 || t >= 1) return
                const out = t < 0.5
                const k = out ? t * 2 : (t - 0.5) * 2
                const r = out ? src : dest() || fallback()
                const hm = Math.min(r.w, r.h) / 2
                const full = far(r, w, h) + A * 0.8 + 40
                let fA, fB, sw, sp, pa, dz, gr, tm
                if (out) {
                    // A slow seep from the card's edge, then the surge; paper chases it out
                    fA = mix(-24, full, 0.025 * eo(smooth(0, 0.2, k)) + 0.95 * Math.pow(smooth(0.06, 0.62, k), 1.6))
                    fB = mix(-hm - 40, full * 0.9, smooth(0.5, 1, k)) + full * 0.5 * smooth(0.9, 1, k)
                    sw = 0.8 * Math.pow(k, 1.3)
                    sp = 1 + 2.2 * k * k
                    pa = 1 - smooth(0.2, 0.7, k)
                    dz = 0
                    tm = k * 0.35
                } else {
                    // Ink blooms out of the slot, the page is revealed in its wake
                    fA = mix(-hm - A * 0.2 - 30, full, eo(smooth(0, 0.55, k)))
                    fB = mix(-hm - 40, full * 0.7, smooth(0.18, 0.97, k)) + full * 0.5 * smooth(0.9, 1, k)
                    sw = 0.45 * Math.pow(Math.sin(Math.PI * Math.min(1, k / 0.72)), 0.7)
                    sp = 1 + 1.3 * (1 - eo(smooth(0, 0.75, k)))
                    pa = smooth(0.04, 0.42, k)
                    dz = smooth(0.84, 1, k)
                    tm = 0.6 - k * 0.3
                }
                gr = 0.35 * Math.sin(Math.PI * k)
                const ra = r.w / r.h
                const ta = texSize[0] / texSize[1]
                p.use()
                gl.activeTexture(gl.TEXTURE0)
                gl.bindTexture(gl.TEXTURE_2D, tex)
                gl.uniform1i(p.u("tx"), 0)
                gl.uniform2f(p.u("res"), w, h)
                gl.uniform2f(p.u("ts"), Math.min(ra / ta, 1), Math.min(ta / ra, 1))
                gl.uniform4f(p.u("rc"), r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2)
                gl.uniform3fv(p.u("bg"), palette.bg)
                gl.uniform3fv(p.u("ink"), palette.ink)
                gl.uniform3fv(p.u("mid"), palette.mid)
                gl.uniform3fv(p.u("pri"), palette.primary)
                gl.uniform3fv(p.u("wh"), palette.white)
                gl.uniform3fv(p.u("ln"), palette.line)
                gl.uniform1f(p.u("S"), S)
                gl.uniform1f(p.u("A"), A)
                gl.uniform1f(p.u("fA"), fA)
                gl.uniform1f(p.u("fB"), fB)
                gl.uniform1f(p.u("sw"), sw)
                gl.uniform1f(p.u("sp"), sp)
                gl.uniform1f(p.u("pa"), pa)
                gl.uniform1f(p.u("dz"), dz)
                gl.uniform1f(p.u("gr"), gr)
                gl.uniform1f(p.u("md"), out ? 0 : 1)
                gl.uniform1f(p.u("tm"), tm)
                gl.uniform1f(p.u("fz"), out ? 0 : smooth(0.3, 0.62, k))
                gl.uniform1f(p.u("vv"), out ? Math.min(1, sw * 3) : 1 - smooth(0.35, 0.75, k))
                p.draw()
            },
            dispose: () => p.dispose(),
        }
    },
}
export default fx
