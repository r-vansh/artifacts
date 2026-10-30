// Signal tear: the page is cut into bands on the 24px rhythm that slam shut from the
// sides, ripping the poster away in streaks. On arrival the strips fly back in, snap
// into the slot with a settling glitch, and the bands clear top to bottom.
import type { Fx, Rect } from "../types"
import { program } from "../gl"

const frag = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D tx;
uniform vec2 res,ts;
uniform vec4 R;
uniform vec3 bg,ink,pri;
uniform float k,ph,fr,cy,md,pa;
float H(float n){return fract(sin(n*.1731+.371)*43758.5453);}
vec2 band(float y,float sd){
float c=floor(y/96.);
float r=floor(y/24.)-c*4.;
float a=0.,b=4.;
for(int i=1;i<4;i++){
float f=float(i);
if(H(c*7.13+f*1.91+sd)>.45){if(f<=r)a=f;else if(f<b)b=f;}
}
return c*96.+vec2(a,b)*24.;
}
float io(float x){return x<.5?4.*x*x*x:1.-pow(2.-2.*x,3.)/2.;}
float ei(float x){return x*(.3+.7*x);}
float bk(float x){float c=.9,m=x-1.;return 1.+(c+1.)*m*m*m+c*m*m;}
float cv(float x,float a,float b){return clamp(x-a+.5,0.,1.)*clamp(b-x+.5,0.,1.);}
vec4 over(vec4 s,vec4 d){return s+d*(1.-s.a);}
float sw,ly,yc;
bool dl;
vec4 pst(float lx){
float c=cv(lx,0.,sw)*yc;
float u=clamp(lx/sw,0.,1.);
return vec4(texture2D(tx,(vec2(dl?u:1.-u,ly)-.5)*ts+.5).rgb,1.)*c;
}
// The poster slice under this pixel: lx along the travel, L drag length (sign = side), f fringe, mb block density
vec4 slice(float lx,float L,float f,float mb){
vec4 s=pst(lx);
float c0=s.a;
if(f>.5){
vec4 r=pst(lx+f*.5),b=pst(lx-f*.5);
s.r=mix(s.r,r.r,r.a);
s.b=mix(s.b,b.b,b.a);
}
if(mb>0.&&c0>.99){
vec2 g=floor(v_uv*res/24.);
float m=H(g.x*13.7+g.y*71.3+fr*3.1);
if(m<mb){
float sy=(floor(H(m*57.)*5.)-2.)*24./R.w;
ly+=sy;
vec4 o=pst(lx+(floor(H(m*91.)*7.)-3.)*24.);
ly-=sy;
if(o.a>.99)s=o;
}
}
float a=abs(L);
if(a>1.){
float row=floor(v_uv.y*res.y/8.);
float t0=L>0.?-lx:lx-sw;
float m=clamp(a*(.25+.25*floor(H(row*1.37)*4.))-t0+.5,0.,1.)*clamp(t0+.5,0.,1.);
float e=L>0.?.5+H(row*.71)*12.:sw-.5-H(row*.71)*12.;
s=over(s,pst(e)*m);
}
float lead=max(cv(lx,-f,sw-f)*yc-c0,0.)*step(.5,f);
float trail=max(cv(lx,f,sw+f)*yc-c0,0.)*step(.5,f);
s=over(s,vec4(ink,1.)*trail);
s=over(s,vec4(pri,1.)*lead*(1.-s.a));
return s;
}
float line(float y,float at){return clamp(1.-abs(y-at),0.,1.);}
void main(){
vec2 p=v_uv*res;
vec4 col=vec4(0.);
float W0=-40.,W1=res.x+40.;
if(ph<.5){
if(k<=0.){gl_FragColor=col;return;}
if(k>=1.){gl_FragColor=vec4(bg,1.);return;}
vec2 b=band(p.y,0.);
dl=mod(floor(b.x/96.),2.)<.5;
float xx=dl?p.x:res.x-p.x;
float d=.25*pow(clamp(abs(floor(p.y/96.)*96.+48.-cy)/md,0.,1.),.85);
float D=.58,lag=.05+.045*floor(H(b.x*.53+2.)*3.);
float eI=mix(W0,W1,ei(clamp((k-d)/D,0.,1.)));
float e2=mix(W0,W1,ei(clamp((k-.02-d)/D,0.,1.)));
float eB=mix(W0,W1,ei(clamp((k-d-lag)/D,0.,1.)));
col=vec4(ink,1.)*clamp(eI-xx+.5,0.,1.);
yc=cv(p.y,max(b.x,R.y),min(b.y,R.y+R.w));
if(yc>0.){
sw=R.z;
ly=(p.y-R.y)/R.w;
float s0=dl?R.x:res.x-R.x-R.z;
float an=smoothstep(0.,.1,k);
float j=(H(b.x*1.3+fr*.71)-.5)*an*16.;
j=floor(j/4.+.5)*4.*step(.45,H(b.x*.9+fr*1.7));
float push=eI-s0;
float off=max(push,-an*(6.+18.*H(b.x*2.1))+j);
float v=push>=off?(eI-e2)/.02/30.:0.;
float f=min(v*.05+abs(j)*.5+an*3.,10.);
col=over(slice(xx-s0-off,v*1.2,f,.2*smoothstep(.0,.12,k)*(1.-smoothstep(.35,.6,k))),col);
}
col=over(vec4(bg,1.)*clamp(eB-xx+.5,0.,1.),col);
float fy=md*pow(clamp(k/.25,0.,1.),1./.85);
float la=max(line(p.y,cy-fy),line(p.y,cy+fy))*(1.-smoothstep(.22,.28,k));
col=over(vec4(pri,1.)*la,col);
}else{
if(k<=0.){gl_FragColor=vec4(bg,1.);return;}
if(k>=1.){gl_FragColor=col;return;}
vec2 b=band(p.y,5.);
bool sd=mod(floor(b.x/96.),2.)>.5;
float xx=sd?p.x:res.x-p.x;
float st=.26+.36*(floor(p.y/96.)*96./res.y);
float D=.22,lag=.04+.03*floor(H(b.x*.53+7.)*3.);
float eB=mix(W0,W1,io(clamp((k-st)/D,0.,1.)));
float eI=mix(W0,W1,io(clamp((k-st-lag)/D,0.,1.)));
col=vec4(ink,1.)*clamp(xx-eI+.5,0.,1.);
col=over(vec4(bg,1.)*clamp(xx-eB+.5,0.,1.),col);
float ys=res.y*clamp((k-.26)/.36,0.,1.);
float la=line(p.y,ys)*smoothstep(.26,.28,k)*(1.-smoothstep(.6,.62,k));
vec2 c=band(p.y-R.y,11.);
yc=cv(p.y,max(c.x+R.y,R.y),min(c.y+R.y,R.y+R.w));
if(yc>0.){
dl=mod(floor(c.x/96.),2.)>.5;
float sx=dl?p.x:res.x-p.x;
sw=R.z;
ly=(p.y-R.y)/R.w;
float s0=dl?R.x:res.x-R.x-R.z;
float dd=.3*clamp(c.x/R.w,0.,1.);
float q=clamp((k-dd)/.42,0.,1.);
float q2=clamp((k-.02-dd)/.42,0.,1.);
float A=res.x+40.;
float off=A*(1.-bk(q));
float v=A*(bk(q)-bk(q2))/.02/56.;
float sa=smoothstep(.5,.8,q)*(1.-smoothstep(.55,.82,k));
float j=(H(c.x*1.3+fr*.71)-.5)*sa*40.;
j=floor(j/4.+.5)*4.*step(.5,H(c.x*.9+fr*1.7));
off+=j;
float f=min(abs(v)*.05+abs(j)*.4,10.);
col=over(slice(sx-s0-off,-v*1.2,f,.18*sa)*pa,col);
}
col=over(vec4(pri,1.)*la,col);
}
gl_FragColor=col;
}`

const fx: Fx = {
    setup({ gl, w, h, src, dest, tex, texSize, palette, phase }) {
        const p = program(gl, frag)
        const cy = src.y + src.h / 2
        const fallback = (): Rect => {
            const r = src.h / src.w
            const fw = Math.min(w * 0.45, (h * 0.7) / r)
            return { x: w * 0.75 - fw / 2, y: (h - fw * r) / 2, w: fw, h: fw * r }
        }
        return {
            draw(t) {
                const out = phase === "out" && t <= 0.5
                const k = out ? Math.min(1, t * 2) : Math.min(1, Math.max(0, (t - 0.5) * 2))
                const r = out ? src : dest() || fallback()
                // Cover-fit the texture to the rect it is drawn in
                const ra = r.w / r.h
                const ta = texSize[0] / texSize[1]
                gl.clearColor(0, 0, 0, 0)
                gl.clear(gl.COLOR_BUFFER_BIT)
                p.use()
                gl.activeTexture(gl.TEXTURE0)
                gl.bindTexture(gl.TEXTURE_2D, tex)
                gl.uniform1i(p.u("tx"), 0)
                gl.uniform2f(p.u("res"), w, h)
                gl.uniform2f(p.u("ts"), Math.min(ra / ta, 1), Math.min(ta / ra, 1))
                gl.uniform4f(p.u("R"), r.x, r.y, r.w, r.h)
                gl.uniform3fv(p.u("bg"), palette.bg)
                gl.uniform3fv(p.u("ink"), palette.ink)
                gl.uniform3fv(p.u("pri"), palette.primary)
                gl.uniform1f(p.u("k"), k)
                gl.uniform1f(p.u("ph"), out ? 0 : 1)
                // Tile noise ticks at 12fps; the band motion stays continuous
                gl.uniform1f(p.u("fr"), Math.floor((k * (out ? 480 : 900)) / 83) + (out ? 0 : 50))
                gl.uniform1f(p.u("cy"), cy)
                gl.uniform1f(p.u("md"), Math.max(cy, h - cy) + 48)
                gl.uniform1f(p.u("pa"), 1 - Math.min(1, Math.max(0, (k - 0.88) / 0.12)))
                p.draw()
            },
            dispose: () => p.dispose(),
        }
    },
}
export default fx
