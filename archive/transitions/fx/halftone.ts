// Lens + halftone print. Out: a glass dome swells from the card and reprints the
// poster as a riso dot screen (ink, primary, primary-200 overprinted on bg), then
// paper dots grow over it until the page is flat bg. In: the screen is born on the
// media slot, gets finer until it is the continuous poster, while a dotted circle
// opens the page around it.
import type { Fx, Rect } from "../types"
import { program, smooth } from "../gl"

const frag = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D tex;
uniform vec2 R,T,F;
uniform vec4 A;
uniform vec3 bg,ink,pri,pril;
uniform float ph,L,H,S,cell,tone,D,Rv,band,rc,fade,shade,aa;
vec2 K;
vec2 rot(vec2 p,float a){float s=sin(a),c=cos(a);return vec2(c*p.x-s*p.y,s*p.x+c*p.y);}
vec4 img(vec2 p){
    vec2 e=A.zw*S,u=(p-K)/e+.5,b=(.5-abs(u-.5))*e;
    float ra=A.w/A.z,ta=T.y/T.x;
    return vec4(texture2D(tex,.5+(u-.5)*vec2(min(1.,ta/ra),min(1.,ra/ta))).rgb,clamp(min(b.x,b.y)/aa*.5+.5,0.,1.));
}
vec3 cel(vec2 p,float a,float c){vec2 q=rot(p,a)/c,i=floor(q)+.5;return vec3(rot(i*c,-a),length(q-i)*c);}
float dt(float d,float r,float a){return clamp((r-d)/(2.*a)+.5,0.,1.)*clamp(r/a,0.,1.);}
float lum(vec3 c){return dot(c,vec3(.3,.59,.11));}
void main(){
    vec2 p=v_uv*R;
    K=A.xy+A.zw*.5;
    vec2 d=p-K;
    float l=length(d),r=min(l/max(L,1.),1.),z=sqrt(1.-r*r);
    vec3 n=vec3(d/max(l,1e-3)*r,z),lv=normalize(vec3(-.45,-.55,.7));
    float lit=dot(n,lv),sh=shade*(.5-.5*lit),m=H*z,a=aa*(1.-m*.5);
    vec2 pk=K+d*(1.-m*.44),pp=K+d*(1.-m*.5),pl=K+d*(1.-m*.56);
    vec3 ck=cel(pk,.785,cell),cp=cel(pp,.262,cell),cl=cel(pl,1.309,cell);
    vec4 s0=img(pp);
    vec3 sk=img(ck.xy).rgb,sp=img(cp.xy).rgb,sl=img(cl.xy).rgb;
    float ik=smoothstep(.4,1.,(1.-lum(sk))*s0.a+sh*.6);
    float ip=clamp(((1.-lum(sp))*.6+(sp.r-sp.b)*.6)*s0.a+sh*.7,0.,1.);
    float il=clamp((1.-lum(sl))*1.4*s0.a+sh,0.,1.);
    float hl=pow(max(dot(n,normalize(lv+vec3(0,0,1))),0.),24.)*H;
    float rr=cell*.75*(1.-hl);
    vec3 c=bg*mix(vec3(1.),pril,dt(cl.z,rr*sqrt(il),a));
    c*=mix(vec3(1.),pri,dt(cp.z,rr*sqrt(ip),a));
    c=mix(c,ink,dt(ck.z,rr*sqrt(ik),a));
    c=mix(c,mix(bg,s0.rgb,s0.a),tone);
    vec3 cf=cel(pp,0.,cell*1.3);
    float g=smoothstep(0.,1.,clamp(F.x+F.y*length(cf.xy-K)/D,0.,1.));
    c=mix(c,bg,dt(cf.z,cell*1.05*g,a));
    float al;
    if(ph<.5){
        float e=L-l,lr=clamp(e/(2.*aa)+.5,0.,1.)*clamp(L,0.,1.);
        float rim=(1.-g)*clamp(L/40.,0.,1.);
        c=mix(c,ink,dt(abs(e-1.5),.75,aa)*rim);
        c=mix(c,pri,dt(abs(e-4.5),1.,aa)*rim*clamp(.2-lit*1.5,0.,1.));
        al=lr;
    }else{
        vec2 b=A.zw*.5-abs(d);
        float ir=clamp(min(b.x,b.y)/(2.*aa)+.5,0.,1.);
        vec3 cr=cel(p,0.,rc);
        float cb=smoothstep(Rv-band,Rv,length(cr.xy-K)),mr=dt(cr.z,rc*.8*sqrt(cb),aa);
        vec3 cc=mix(pri,bg,smoothstep(0.,.3,cb));
        c=mix(cc*mr,c,ir);
        al=mix(mr,1.,ir)*(1.-fade);
        c*=1.-fade;
        gl_FragColor=vec4(c,al);
        return;
    }
    gl_FragColor=vec4(c*al,al);
}`

const fx: Fx = {
    setup(ctx) {
        const { gl, w, h, dpr, src, palette: pal } = ctx
        const p = program(gl, frag)
        const far = (x: number, y: number) => Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y))
        const unit = Math.min(1.2, Math.max(0.6, Math.min(w, h) / 800))
        const shade = ctx.hasPoster ? 0.3 : 0.85
        const set = (name: string, ...v: number[]) => {
            const l = p.u(name)
            if (v.length === 1) gl.uniform1f(l, v[0])
            else if (v.length === 2) gl.uniform2f(l, v[0], v[1])
            else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2])
            else gl.uniform4f(l, v[0], v[1], v[2], v[3])
        }
        return {
            draw(t) {
                const flat = t === 0.5
                const b = flat ? pal.bg : [0, 0, 0]
                gl.clearColor(b[0], b[1], b[2], flat ? 1 : 0)
                gl.clear(gl.COLOR_BUFFER_BIT)
                if (flat || t <= 0 || t >= 1) return
                const out = t < 0.5
                const k = out ? t * 2 : t * 2 - 1
                const a: Rect = out ? src : ctx.dest() ?? { x: (w - src.w) / 2, y: (h - src.h) / 2, w: src.w, h: src.h }
                const cx = a.x + a.w / 2
                const cy = a.y + a.h / 2
                const r0 = Math.hypot(a.w, a.h) / 2
                const fr = far(cx, cy)
                p.use()
                gl.activeTexture(gl.TEXTURE0)
                gl.bindTexture(gl.TEXTURE_2D, ctx.tex)
                gl.uniform1i(p.u("tex"), 0)
                set("R", w, h)
                set("T", ...ctx.texSize)
                set("A", a.x, a.y, a.w, a.h)
                set("bg", ...pal.bg)
                set("ink", ...pal.ink)
                set("pri", ...pal.primary)
                set("pril", ...pal.primaryLight)
                set("aa", 0.6 / dpr + 0.2)
                set("ph", out ? 0 : 1)
                if (out) {
                    const L = r0 * 1.1 * smooth(0, 0.3, k) + (fr * 1.05 - r0 * 1.1) * smooth(0.15, 0.85, k) ** 2
                    set("L", L)
                    set("H", 0.8 * (1 - 0.4 * smooth(0.6, 1, k)))
                    set("S", 1 + Math.max(0, L / r0 - 1) * 0.5)
                    set("cell", unit * (5 + 11 * smooth(0, 0.9, k)))
                    set("tone", 1 - smooth(0, 0.3, k))
                    set("F", 2.6 * k - 1.3, -0.3)
                    set("D", fr)
                    set("shade", shade)
                } else {
                    const H = 0.8 * (1 - smooth(0, 0.75, k))
                    const band = Math.min(260, Math.max(90, Math.min(w, h) * 0.25))
                    set("L", r0 * 1.15)
                    set("H", H)
                    set("S", 1)
                    set("cell", unit * (13 - 11.8 * smooth(0.15, 0.8, k)))
                    set("tone", smooth(0.6, 0.88, k))
                    set("F", 1 - 2.6 * k, 0.4)
                    set("D", r0)
                    set("shade", (shade * H) / 0.8)
                    set("Rv", (fr + band + 20) * smooth(0.08, 0.8, k))
                    set("band", band)
                    set("rc", unit * 14)
                    set("fade", smooth(0.88, 1, k))
                }
                p.draw()
            },
            dispose: () => p.dispose(),
        }
    },
}
export default fx
