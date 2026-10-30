// Warp: the camera dives into the poster. It zooms through with a radial blur and
// speed lines, bursts out of the far side in a light ring, then the entry page pulls
// back out of the poster's centre and settles it into its slot.
import type { Fx, Rect } from "../types"
import { program, smooth, clamp01 } from "../gl"

const frag = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D tx;
uniform vec2 res,ts,rf;
uniform vec3 bg,ln,md,pri,wh;
uniform vec4 hole,pt;
uniform float hw,hi,pa,dpr,bl,ca,cvs,ss,sph,rr,rw,gw,ga,inph,hr,dot0;
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
float h1(float n){return fract(sin(n*12.9898)*43758.5453);}
float box(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,q.y),0.);}
vec4 over(vec4 s,vec4 d){return s+d*(1.-s.a);}
uniform vec2 f,pc,ph;
float seg(vec2 a,vec2 b,float k){
a=f+(a-f)*k;b=f+(b-f)*k;
vec2 d=b-a;d=mix(d,vec2(1e-4),step(abs(d),vec2(1e-4)));
vec2 t1=(pc-ph-a)/d,t2=(pc+ph-a)/d;
vec2 lo=min(t1,t2),hh=max(t1,t2);
return max(clamp(min(hh.x,hh.y),0.,1.)-clamp(max(lo.x,lo.y),0.,1.),0.);
}
vec4 tap(vec2 q){
float m=clamp(.5-box(q-pc,ph)*dpr,0.,1.);
vec2 uv=(q-pc)/(2.*ph)*ts+.5;
return vec4(texture2D(tx,uv).rgb,1.)*m;
}
void main(){
vec2 p=v_uv*res;
float n=ign(gl_FragCoord.xy);
float rd=length(p-rf);
float x=(rr-rd)*inph;
float side=clamp(.5+x*dpr,0.,1.);
float glow=exp(-max(x,0.)/gw)*ga*side;
vec3 rc=bg+(wh-bg)*glow+(n-.5)/255.*step(.003,glow);
float core=clamp(.5+(rw*.5-abs(x-rw*.5))*dpr,0.,1.)*step(.001,rr)*ga;
vec4 col=vec4(0.);
if(side<1.){
float hd=box(p-hole.xy,hole.zw)-hr;
float cv=clamp(.5+hd*dpr*cvs,0.,1.);
cv=max(cv,clamp(.5-box(p-pt.xy,pt.zw)*dpr,0.,1.)*dot0);
col=vec4(bg,1.)*cv;
if(ss>0.){
vec2 d=p-f;float r=length(d);
float u=(atan(d.y,d.x)/6.2831853+.5)*240.;
float id=floor(u);
float du=(u-id-.2-.6*h1(id+1.))*6.2831853/240.*r;
float L=(50.+200.*h1(id+3.))*(.6+.8*ss);
float R=length(res)*1.2;
float a=r-mod(sph*(.55+.9*h1(id+7.))*R*.6+h1(id+5.)*R,R);
float seg=clamp(.5-a*dpr,0.,1.)*clamp(.5+(a+L)*dpr,0.,1.);
float dash=clamp((2.-abs(fract(a/8.)-.5)*8.)*dpr+.5,0.,1.);
float line=clamp(.5+(.5-abs(du))*dpr,0.,1.);
float fade=smoothstep(60.,260.,r)*step(h1(id+11.),.55);
col=over(vec4(h1(id+13.)<.3?md:ln,1.)*line*seg*dash*fade*ss*cv,col);
}
vec2 qe=f+(p-f)*(1.-bl),qs=f+(p-f)*(1.+ca);
vec2 lo=min(qs,qe)-pc,hi2=max(qs,qe)-pc;
if(all(lessThan(lo,ph+2.))&&all(greaterThan(hi2,-ph-2.))){
vec4 pc4;
if(bl*length(p-f)<1.){pc4=tap(p);}
else{
vec3 tc=vec3(0.);
for(int i=0;i<12;i++){
vec2 q=f+(p-f)*(1.-bl*(float(i)+n)/12.);
tc+=texture2D(tx,(q-pc)/(2.*ph)*ts+.5).rgb;
}
vec3 cv3=vec3(seg(p,qe,1.+ca),seg(p,qe,1.),seg(p,qe,1.-ca));
pc4=vec4(tc/12.*cv3,cv3.g);
}
col=over(pc4*pa,col);
}
col=over(vec4(pri,1.)*exp(min(x,0.)/hw)*(1.-side)*ga*hi*step(.001,rr),col);
}
col=mix(col,vec4(rc,1.),side);
gl_FragColor=mix(col,vec4(pri,1.),core);
}`

const mix = (a: number, b: number, k: number) => a + (b - a) * k
const ctr = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2]
const io = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(2 - 2 * x, 3) / 2)

const fx: Fx = {
    setup({ gl, w, h, dpr, src, dest, tex, texSize, palette }) {
        const p = program(gl, frag)
        const sc: [number, number] = [w / 2, h / 2]
        const cover = (r: Rect) => Math.max(w / r.w, h / r.h)
        const far = (c: [number, number]) => Math.hypot(Math.max(c[0], w - c[0]), Math.max(c[1], h - c[1]))
        const fallback = (): Rect => {
            const ar = src.h / src.w
            const fw = Math.min(w * 0.45, (h * 0.7) / ar)
            return { x: w * 0.75 - fw / 2, y: (h - fw * ar) / 2, w: fw, h: fw * ar }
        }
        // Log-scale zoom: the out half accelerates, the in half decelerates; vn is speed normalised to its peak
        const S1 = Math.log(cover(src) * 5)
        const zOut = (k: number) => S1 * Math.pow(clamp01((k - 0.03) / 0.97), 1.9)
        const vOutMax = (S1 * 1.9) / 0.97
        const IN = 0.86
        const flat = (a: number) => {
            gl.clearColor(palette.bg[0] * a, palette.bg[1] * a, palette.bg[2] * a, a)
            gl.clear(gl.COLOR_BUFFER_BIT)
        }
        return {
            draw(t) {
                if (t <= 0 || t >= 1) return flat(0)
                if (t === 0.5) return flat(1)
                gl.clearColor(0, 0, 0, 0)
                gl.clear(gl.COLOR_BUFFER_BIT)
                let home: Rect, s: number, c: [number, number], vn: number, k: number
                let hw = 1, hi = 0, ss = 0, sph = 0, rr = 0, rw = 0, gw = 1, ga = 0, inph = 1, cvs = 1, hr = -1e4, dot0 = 0
                let hole: Rect = src
                let rf = sc
                if (t < 0.5) {
                    k = t * 2
                    if (k >= 0.96) return flat(1)
                    home = src
                    // Anticipation: a small press into the grid, then the dive
                    const g = 1 - 0.03 * Math.sin(Math.PI * smooth(0, 0.24, k))
                    s = g * Math.exp(zOut(k))
                    vn = (zOut(Math.min(1, k + 0.005)) - zOut(k)) / 0.005 / vOutMax
                    const m = io(clamp01(k / 0.6))
                    c = [mix(ctr(src)[0], sc[0], m), mix(ctr(src)[1], sc[1], m)]
                    // The page is swept away outward from the card
                    cvs = -1
                    hr = far(ctr(src)) * smooth(0.02, 0.62, k)
                    dot0 = 1
                    ss = smooth(0.08, 0.3, k) * (1 - smooth(0.7, 0.88, k))
                    sph = k * 0.9
                    const rk = clamp01((k - 0.64) / 0.3)
                    rf = c
                    gw = 18 + 40 * vn
                    rr = (far(c) + 6 * gw) * Math.pow(rk, 2)
                    rw = 1.5 + 2.5 * vn
                    hw = gw * 1.3
                    hi = 0.6
                    ga = rk > 0 ? 1 - smooth(0.88, 0.95, k) : 0
                } else {
                    k = (t - 0.5) * 2
                    const d = dest() || fallback()
                    home = d
                    const S0 = Math.log(cover(d) * 2.8)
                    const e = (x: number) => 1 - Math.pow(1 - clamp01(x / IN), 4)
                    s = Math.exp(S0 * (1 - e(k)))
                    vn = Math.pow(1 - clamp01(k / IN), 3)
                    c = [mix(sc[0], ctr(d)[0], e(k)), mix(sc[1], ctr(d)[1], e(k))]
                    // The page opens outward from the slot once the poster has nearly landed
                    const wk = io(clamp01((k - 0.32) / 0.52))
                    hole = d
                    hr = wk > 0 ? (far(ctr(d)) + 4) * wk : -1e4
                    dot0 = k < 0.88 ? 1 : 0
                    ss = 1 - smooth(0.06, 0.36, k)
                    sph = 1 - k * 1.2
                    const rk = clamp01(k / 0.34)
                    gw = 14 + 40 * (1 - rk)
                    rr = (far(sc) + 4 * gw) * (1 - Math.pow(1 - rk, 3))
                    rw = 1.5 + 2.5 * (1 - rk)
                    hw = gw * 0.6
                    hi = 0.4
                    ga = rk < 1 ? 1 - smooth(0.6, 1, rk) : 0
                    inph = -1
                }
                const pa = t > 0.5 ? 1 - smooth(0.88, 1, k) : 1
                const ra = home.w / home.h
                const ta = texSize[0] / texSize[1]
                p.use()
                gl.activeTexture(gl.TEXTURE0)
                gl.bindTexture(gl.TEXTURE_2D, tex)
                gl.uniform1i(p.u("tx"), 0)
                gl.uniform2f(p.u("res"), w, h)
                gl.uniform2f(p.u("ts"), Math.min(ra / ta, 1), Math.min(ta / ra, 1))
                gl.uniform2fv(p.u("pc"), c)
                gl.uniform2f(p.u("ph"), (home.w / 2) * s, (home.h / 2) * s)
                gl.uniform2fv(p.u("f"), c)
                gl.uniform2fv(p.u("rf"), rf)
                gl.uniform3fv(p.u("bg"), palette.bg)
                gl.uniform3fv(p.u("ln"), palette.line)
                gl.uniform3fv(p.u("md"), palette.mid)
                gl.uniform3fv(p.u("pri"), palette.primary)
                gl.uniform3fv(p.u("wh"), palette.white)
                gl.uniform4f(p.u("hole"), ...ctr(hole), hole.w / 2, hole.h / 2)
                gl.uniform4f(p.u("pt"), ...ctr(home), home.w / 2, home.h / 2)
                gl.uniform1f(p.u("dpr"), dpr)
                gl.uniform1f(p.u("hw"), hw)
                gl.uniform1f(p.u("hi"), hi)
                gl.uniform1f(p.u("bl"), 0.24 * Math.pow(vn, 1.3))
                gl.uniform1f(p.u("ca"), 0.013 * vn * vn)
                gl.uniform1f(p.u("cvs"), cvs)
                gl.uniform1f(p.u("ss"), ss)
                gl.uniform1f(p.u("sph"), sph)
                gl.uniform1f(p.u("rr"), rr)
                gl.uniform1f(p.u("rw"), rw)
                gl.uniform1f(p.u("gw"), gw)
                gl.uniform1f(p.u("ga"), ga)
                gl.uniform1f(p.u("inph"), inph)
                gl.uniform1f(p.u("hr"), hr)
                gl.uniform1f(p.u("dot0"), dot0)
                gl.uniform1f(p.u("pa"), pa)
                p.draw()
            },
            dispose: () => p.dispose(),
        }
    },
}
export default fx
