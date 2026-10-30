// Liquid lift: the poster peels off the grid, melts into the page colour while the
// page dissolves behind it, then re-forms on the entry page and springs into its slot.
import type { Fx, Rect } from "../types"
import { program, smooth } from "../gl"

const frag = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D tx;
uniform vec2 res,ts,par;
uniform vec4 rc,sk;
uniform vec3 bg,ink,pri,wh,ln;
uniform float rad,wp,ch,lift,melt,pa,th,dir,sa,tm,sl,R;
uniform vec2 o;
vec3 pm(vec3 x){return mod((x*34.+1.)*x,289.);}
float sn(vec2 v){const vec4 C=vec4(.211324865,.366025404,-.577350269,.024390244);vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=x0.x>x0.y?vec2(1.,0.):vec2(0.,1.);vec4 x2=x0.xyxy+C.xxzz;x2.xy-=i1;i=mod(i,289.);vec3 p=pm(pm(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));vec3 m=max(.5-vec3(dot(x0,x0),dot(x2.xy,x2.xy),dot(x2.zw,x2.zw)),0.);m=m*m;m=m*m;vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;vec3 a=x-floor(x+.5);m*=1.792843-.853735*(a*a+h*h);vec3 g;g.x=a.x*x0.x+h.x*x0.y;g.yz=a.yz*x2.xz+h.yz*x2.yw;return 130.*dot(m,g);}
float fb(vec2 p,float n){float s=0.,a=.5;for(int i=0;i<3;i++){if(float(i)>=n)break;s+=a*sn(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
float box(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
vec4 over(vec4 s,vec4 d){return s+d*(1.-s.a);}
void main(){
vec2 px=v_uv*res;
float mn=min(res.x,res.y);
float d=length(px-o)/R+.12;
if(abs(d-th)<.13)d+=fb(px/(mn*.3)+vec2(tm,-tm*.7),3.)*.12;
float c=dir>0.?step(d,th):step(th,d);
vec2 sq=px-sk.xy;float sd=box(sq,sk.zw,0.);
c=max(c,clamp(1.5-sd,0.,1.)*sa);
vec4 col=vec4(bg*c,c);
float e=abs(sd);
float da=(1.-smoothstep(.5,1.,e))*step(.5,fract((px.x+px.y)/8.))*sa*sl;
col=over(vec4(ln,1.)*da,col);
float la=(1.-smoothstep(.4,1.6,abs(d-th)*R))*step(.001,th)*step(th,1.3);
col=over(vec4(pri,1.)*la,col);
vec2 hb=rc.zw,q=px-rc.xy;
float hm=min(hb.x,hb.y);
if(pa>0.&&length(max(abs(q)-hb,0.))<wp+60.){
vec2 qn=q/hm*.9;
vec2 w=wp>0.?vec2(fb(qn+vec2(tm,0.),2.),fb(qn+vec2(5.2,1.3)-tm,2.)):vec2(0.);
float wn=wp/hm;
vec2 qw=q+w*wp;
vec2 so=vec2(0.,4.+18.*lift);
float bl=4.+20.*lift;
float sh=(1.-smoothstep(-bl,bl,box(qw-so,hb*.97,rad)))*.16*lift*pa*(1.-smoothstep(0.,.5,melt));
col=over(vec4(ink,1.)*sh,col);
vec2 cd=normalize(w+1e-4)*ch;
float s0=box(qw,hb,rad);
vec3 m3=clamp(.5-vec3(box(qw+cd,hb,rad),s0,box(qw-cd,hb,rad)),0.,1.);
float n=melt>0.?fb(qn*1.6+w*.8-tm,2.)*.5+.5:1.;
float v=n*.7+clamp(-s0/hm,0.,1.)*.45;
float k=melt*1.25;
float mv=smoothstep(k-.02,k+.02,v);
m3*=mv*pa;
vec2 uv=(qw/(2.*hb))*ts+.5+par;
vec2 cu=cd*.4/(2.*hb)*ts;
vec3 tc=vec3(texture2D(tx,uv+cu).r,texture2D(tx,uv).g,texture2D(tx,uv-cu).b);
vec3 L=normalize(vec3(-.4,-.6,.7));
vec3 N=normalize(vec3(w*wn*2.5,1.));
tc*=1.+.3*(dot(N,L)-L.z);
float sp=pow(max(dot(N,normalize(L+vec3(0.,0.,1.))),0.),40.)*min(wn*4.,1.);
float ri=(1.-smoothstep(0.,7.,-s0))*lift*.35;
tc=mix(tc,wh,clamp(sp*.25+ri,0.,1.));
float sm=(1.-smoothstep(.0,.03,abs(v-k)))*step(.01,melt)*step(melt,.99)*pa;
tc=mix(tc,pri,sm*m3.g);
tc=clamp(tc,0.,1.);
float ma=max(m3.r,max(m3.g,m3.b));
col=vec4(tc*m3+col.rgb*(1.-m3),ma+col.a*(1.-ma));
}
gl_FragColor=col;
}`

const io = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(2 - 2 * x, 3) / 2)
const back = (x: number) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2)
const mix = (a: number, b: number, k: number) => a + (b - a) * k
const lerp = (a: Rect, b: Rect, k: number): Rect => ({ x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), w: mix(a.w, b.w, k), h: mix(a.h, b.h, k) })

const fx: Fx = {
    setup({ gl, w, h, src, dest, tex, texSize, palette }) {
        const p = program(gl, frag)
        // Where the out phase leaves the liquid and the in phase picks it up
        const g0 = Math.min(1.12, (w * 0.78) / src.w, (h * 0.72) / src.h)
        const mid: Rect = { x: mix(src.x + src.w / 2, w / 2, 0.4), y: mix(src.y + src.h / 2, h / 2, 0.4), w: src.w * g0, h: src.h * g0 }
        mid.x -= mid.w / 2
        mid.y -= mid.h / 2
        const fallback = (): Rect => {
            const r = src.h / src.w
            const fw = Math.min(w * 0.6, (h * 0.6) / r)
            return { x: (w - fw) / 2, y: (h - fw * r) / 2, w: fw, h: fw * r }
        }
        return {
            draw(t) {
                gl.clearColor(0, 0, 0, 0)
                gl.clear(gl.COLOR_BUFFER_BIT)
                let r: Rect, home: Rect, o: [number, number], sk: Rect
                let rad, wp, lift, melt, pa, th, dir, sa, tm, sl
                let sx = 1, sy = 1
                if (t <= 0.5) {
                    const k = Math.min(1, t * 2)
                    // Anticipation: a small press into the grid before it lifts
                    const dip = 1 - 0.035 * Math.sin(Math.PI * smooth(0, 0.22, k))
                    const m = io(smooth(0.14, 1, k))
                    r = lerp(src, mid, m)
                    const g = dip * (1 + 0.06 * smooth(0.14, 1, k))
                    r = { x: r.x + (r.w * (1 - g)) / 2, y: r.y + (r.h * (1 - g)) / 2, w: r.w * g, h: r.h * g }
                    home = src
                    lift = smooth(0.06, 0.45, k)
                    rad = 12 * lift
                    wp = Math.pow(smooth(0.12, 0.9, k), 1.5) * 0.3
                    melt = smooth(0.5, 0.97, k)
                    pa = k >= 1 ? 0 : smooth(0, 0.04, k)
                    th = k >= 1 ? 9 : mix(-0.01, 1.3, Math.pow(smooth(0.04, 0.9, k), 1.2))
                    dir = 1
                    o = [src.x + src.w / 2, src.y + src.h / 2]
                    sk = src
                    sa = smooth(0.02, 0.1, k)
                    sl = 1 - smooth(0.5, 0.8, k)
                    tm = k * 0.6
                } else {
                    const k = Math.min(1, (t - 0.5) * 2)
                    const dst = dest() || fallback()
                    const x = smooth(0, 1, (k - 0.06) / 0.74) * 0.35 + Math.min(1, Math.max(0, (k - 0.06) / 0.74)) * 0.65
                    const m = back(x)
                    r = lerp(mid, dst, m)
                    // Squash and stretch along the travel, from the spring's velocity
                    const vel = (back(Math.min(1, x + 0.01)) - m) / 0.01
                    const dx = Math.abs(dst.x + dst.w / 2 - (mid.x + mid.w / 2))
                    const dy = Math.abs(dst.y + dst.h / 2 - (mid.y + mid.h / 2))
                    const s = Math.min(0.1, vel * 0.035) * (x < 1 ? 1 : 0)
                    const ax = dx / (dx + dy + 1e-3)
                    sx = 1 + s * (ax - 0.5)
                    sy = 1 + s * (0.5 - ax)
                    home = dst
                    lift = 1 - smooth(0.4, 0.8, k)
                    rad = 12 * (1 - smooth(0.4, 0.78, k))
                    wp = Math.pow(1 - smooth(0.04, 0.74, k), 1.5) * 0.3
                    melt = 1 - smooth(0.02, 0.38, k)
                    pa = k >= 1 ? 0 : 1 - smooth(0.9, 1, k)
                    th = k <= 0 ? -1 : k >= 1 ? 9 : mix(-0.01, 1.3, io(smooth(0.12, 0.92, k)))
                    dir = -1
                    o = [dst.x + dst.w / 2, dst.y + dst.h / 2]
                    // Keep the real media hidden until the poster has landed on it
                    sk = dst
                    sa = k < 0.8 ? 1 : 0
                    sl = 0
                    tm = 0.6 + k * 0.9
                }
                const hw = (r.w / 2) * sx
                const hh = (r.h / 2) * sy
                const hm = Math.min(hw, hh)
                // Cover-fit the texture to the rect it lands in
                const ra = home.w / home.h
                const ta = texSize[0] / texSize[1]
                const ts: [number, number] = [Math.min(ra / ta, 1), Math.min(ta / ra, 1)]
                const cx = r.x + r.w / 2
                const cy = r.y + r.h / 2
                const par: [number, number] = [((home.x + home.w / 2 - cx) / r.w) * 0.05, ((home.y + home.h / 2 - cy) / r.h) * 0.05]
                p.use()
                gl.activeTexture(gl.TEXTURE0)
                gl.bindTexture(gl.TEXTURE_2D, tex)
                gl.uniform1i(p.u("tx"), 0)
                gl.uniform2f(p.u("res"), w, h)
                gl.uniform2fv(p.u("ts"), ts)
                gl.uniform2fv(p.u("par"), par)
                gl.uniform4f(p.u("rc"), cx, cy, hw, hh)
                gl.uniform4f(p.u("sk"), sk.x + sk.w / 2, sk.y + sk.h / 2, sk.w / 2, sk.h / 2)
                gl.uniform3fv(p.u("bg"), palette.bg)
                gl.uniform3fv(p.u("ink"), palette.ink)
                gl.uniform3fv(p.u("pri"), palette.primary)
                gl.uniform3fv(p.u("wh"), palette.white)
                gl.uniform3fv(p.u("ln"), palette.line)
                gl.uniform1f(p.u("rad"), Math.min(rad, hm * 0.25))
                gl.uniform1f(p.u("wp"), wp * hm)
                gl.uniform1f(p.u("ch"), Math.min(1.6, wp * 8))
                gl.uniform1f(p.u("lift"), lift)
                gl.uniform1f(p.u("melt"), melt)
                gl.uniform1f(p.u("pa"), pa)
                gl.uniform1f(p.u("th"), th)
                gl.uniform1f(p.u("dir"), dir)
                gl.uniform1f(p.u("sa"), sa)
                gl.uniform1f(p.u("sl"), sl)
                gl.uniform1f(p.u("tm"), tm)
                gl.uniform2fv(p.u("o"), o)
                gl.uniform1f(p.u("R"), Math.hypot(Math.max(o[0], w - o[0]), Math.max(o[1], h - o[1])))
                p.draw()
            },
            dispose: () => p.dispose(),
        }
    },
}
export default fx
