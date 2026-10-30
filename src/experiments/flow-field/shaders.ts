// GLSL for the flow field: a heightfield over the screen, lit and given a flow and
// a reveal per pixel offscreen (pass 1), then redrawn as one curved mark per screen
// cell (pass 2).

// 3D simplex noise by Ian McEwan, Ashima Arts (MIT): github.com/ashima/webgl-noise
const noise = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`

// Pass 1: the form as a heightfield over the screen, worked out per pixel of a small
// offscreen target. Positions are in frame widths from the middle (+y up), so the
// look holds at any window size. Each pixel holds what the marks need: r = ink
// (0 lit, 1 shadow), g = the stroke direction as an angle (0..1 for -pi..pi), b =
// how far the reveal is past this point, (x + 0.5) / 4 with x in units of the soft
// interior, a = 1 (marks may sit here). Values stay in 0..1 so an 8-bit target works.
export const fieldVertex = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const fieldFragment = /* glsl */ `
${noise}
uniform float uTime;
uniform vec2 uRes;          // drawing buffer, for the aspect
uniform vec2 uCenter;       // the crater, frame widths from the middle
uniform float uScale;       // size of the whole form (zoom times push-in)

uniform float uCraterR;     // the crater's radius
uniform float uCraterDepth;
uniform float uCraterFloor; // share of the radius that is flat floor
uniform vec2 uCraterTilt;   // shifts the floor, so one wall is steeper than the other
uniform float uRimH;        // the raised lip round it
uniform float uRimW;
uniform float uBumpH;       // the small bump in its middle
uniform float uRingH;       // the ridges outside it
uniform float uRingSpacing;
uniform float uRingCount;   // how many before they die away
uniform float uRingPhase;   // how far they have drifted out
uniform float uRingBreak;   // how much they break up and vary round the circle
uniform float uRingSide;    // 0 even all round, 1 only on one side
uniform float uRingSideAngle; // which side, radians (0 right, pi left)
uniform float uUndulate;    // broad, slow swell
uniform float uUndulateScale;
uniform float uFold;        // a soft ridge running out from the crater
uniform float uFoldAngle;
uniform float uFoldOffset;

uniform vec2 uDropAt[4];    // ripples: where each drop fell
uniform vec4 uDropFront;    // how far each ring train has run
uniform vec4 uDropAmp;      // its height now (0 when the drop is spent)
uniform vec4 uDropLen;      // its wavelength now
uniform float uRings;       // rings per train

// The opening bounce, a drop hitting water: a dome in the middle that springs down
// into the crater and back, and one ring running out from it, both dying away
uniform float uBounceT;     // seconds since the reveal started
uniform float uBounceAmp;   // height (0 when off)
uniform float uBounceFreq;  // Hz
uniform float uBouncePhase; // radians, where in its swing it starts
uniform float uBounceDamp;  // s
uniform float uBounceSize;  // the dome's radius
uniform float uBounceSpeed; // how fast the ring runs out
uniform float uBounceWidth; // the ring's width
uniform float uBounceRadial; // marks point out from the middle while it bounces
uniform float uIntroOn;     // 1 while the opening runs
uniform float uIntroInk;    // the crater's ink before its rim grows in (a pale splash)
uniform float uIntroSwing;  // how far that ink swings dark and pale with the splash
uniform float uSplashThin;  // share of marks dropped in the splash, so they read as separate strokes
// The impact: a heavy object dunked in the middle, as a deterministic water model
// (so replays and scrubbing stay exact). The centre sinks into a cavity with a crown
// round it, then rebounds as a damped spring; the energy leaves as a leading ring
// and a train of smaller rings whose spacing widens as they travel (dispersion)
uniform float uImpactOn;
uniform float uImpactDepth;   // how deep the cavity sinks
uniform float uImpactSize;    // the object's radius
uniform float uImpactAttack;  // s, how fast it sinks
uniform float uImpactHold;    // s, how long it stays down before rebounding
uniform float uImpactRebound; // Hz, the centre's down-up spring
uniform float uImpactDamp;    // s, how fast the centre settles
uniform float uWaveSpeed;     // how fast the leading ring runs out
uniform float uWaveDecay;     // s, how fast the rings die away
uniform float uWaveDisp;      // how fast the ring spacing widens (dispersion)
uniform float uWaveRings;     // strength of the rings
uniform float uWaveReach;     // how far out they carry
uniform float uImpactPush;    // how far the rings shove the surface
uniform float uImpactShade;   // light on crests, shadow in troughs and the cavity
uniform float uImpactKick;    // how hard the leading ring kicks the reveal stain out
uniform float uDisturb;       // how much the impact roughens the middle's rim
uniform float uInnerRing;     // a wobbly ring of disturbed marks at half the middle's radius
uniform float uDisturbSettle; // s, how long those take to settle
uniform float uRimStart;    // s, when the rim starts growing in from the top
uniform float uRimTime;     // s, how long it takes

uniform float uRelief;      // how steep the heights read under the light
uniform vec3 uLight;        // unit vector toward the light, z out of the screen
uniform vec3 uWallLight;    // the same light, lower, for the crater's wall only
uniform float uWallRelief;  // extra relief on the wall
uniform float uWallDark;    // extra ink on the wall nearest the light (it faces away)
uniform float uWallSweep;   // light taken off the wall across from it (it faces the light)
uniform vec3 uRingLight;    // the light for everything outside the crater, ridges included
uniform float uFloorSweep;  // a bright sweep across the floor, on the side away from the light
uniform float uMargin;      // a torn white margin kept at the frame's edges, frame widths
uniform float uLobeWarp;    // how much the early stain's lobes are warped
uniform float uLobes;       // early on the stain breaks into separate lobes that join later
uniform float uOutline;     // where the stain stops at the end, share of the way to the far corner
uniform float uOutlineNoise; // how irregular that final outline is
uniform float uInkLo;       // shade where ink starts
uniform float uInkHi;       // shade where ink is full
uniform float uShockTone;   // extra light and shadow on the ripples
uniform float uWaveSlope;   // 1 / steepest ripple slope
uniform float uRefract;     // how far the ripples shift and turn the marks

uniform float uSwirl;       // flow round the crater
uniform float uCurl;        // flow from curl noise
uniform float uFlowFreq;
uniform float uFlowDrift;

uniform float uReveal;      // progress 0..1
uniform float uExit;        // the reveal out: 0 none, 1 all cleared
uniform float uExitSoft;    // how soft the clearing edge is
uniform float uExitTear;    // how torn the clearing edge is
uniform float uExitStyle;   // 0 open through, 1 dry out, 2 wash away
uniform vec2 uRevealOrigin; // frame widths from the middle
uniform float uRevealSoft;  // how far in from the front marks thin out, frame widths
uniform float uCore;        // radius always shown
uniform float uCoreEdge;
uniform float uSpread;      // progress to radius; 0.5 is diffusion (radius ~ sqrt t)
uniform float uWetness;     // how lopsided the stain grows
uniform float uWetScale;
uniform float uFeather;
uniform float uTendrils;    // strands curling off the edge along the flow
uniform float uTendrilScale;
uniform float uEdgeDark;    // pigment gathered at the front
uniform float uEdgeBand;
uniform float uGranulation;
uniform float uBlooms;      // loose islands beyond the front
uniform float uIslandReach; // how far ahead of the front they reach early on
uniform float uCreep;

varying vec2 vUv;

const float TAU = 6.28318;

float fbm(vec3 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
        sum += amp * snoise(p);
        p = p * 2.03 + vec3(1.7, 9.2, 3.1);
        amp *= 0.5;
    }
    return sum;
}

// Water ripples: each drop sends out a short train of rings (a Gaussian packet of
// a cosine) centred on its front. Up to four drops overlap and add up.
float waves(vec2 q) {
    float s = 0.0;
    for (int i = 0; i < 4; i++) {
        if (uDropAmp[i] <= 0.0) continue;
        float x = (length(q - uDropAt[i]) - uDropFront[i]) / uDropLen[i];
        s += uDropAmp[i] * exp(-4.0 * x * x / (uRings * uRings)) * cos(TAU * x) * smoothstep(0.7 * uCraterR, 1.3 * uCraterR, length(q));
    }
    return s;
}

// Height at q (form space: frame widths from the crater, before scaling)
float height(vec2 q) {
    float r = length(q);
    // A bowl with a flat floor, shifted so one wall is steeper
    float rb = length(q - uCraterTilt * uCraterR);
    float h = -uCraterDepth * (1.0 - smoothstep(uCraterFloor * uCraterR, uCraterR, rb));
    float lip = (r - uCraterR) / uRimW;
    h += uRimH * exp(-lip * lip);
    float b = r / (0.25 * uCraterR);
    h += uBumpH * exp(-b * b);
    // Ridges beyond the lip, dying away after uRingCount of them
    // Ridges beyond the lip, dying away after uRingCount of them, broken up and
    // wobbling round the circle so they never read as perfect rings
    float out_ = r - uCraterR;
    float ang = atan(q.y, q.x);
    vec2 aroundQ = vec2(cos(ang), sin(ang));
    float brk = snoise(vec3(aroundQ * 0.9, out_ * 4.0 + 1.3));
    float wob = snoise(vec3(aroundQ * 0.7, out_ * 2.0 + 7.0)) * 0.15 * uRingSpacing * uRingBreak;
    float fade = smoothstep(0.0, 0.6 * uRingSpacing, out_) * (1.0 - smoothstep((uRingCount - 0.5) * uRingSpacing, (uRingCount + 0.8) * uRingSpacing, out_));
    fade *= clamp(1.0 + uRingBreak * brk, 0.0, 2.0);
    // Stronger on one side, fading smoothly round to the other
    float side = dot(aroundQ, vec2(cos(uRingSideAngle), sin(uRingSideAngle)));
    fade *= mix(1.0, smoothstep(-0.9, 0.3, side), uRingSide);
    h += uRingH * fade * cos(TAU * (out_ + wob - uRingPhase) / uRingSpacing);
    h += uUndulate * snoise(vec3(q * uUndulateScale, uTime * 0.04));
    // The fold: a soft ridge from near the crater outward
    vec2 along = vec2(cos(uFoldAngle), sin(uFoldAngle));
    float across = dot(q, vec2(-along.y, along.x)) - uFoldOffset;
    h += uFold * exp(-across * across / 0.0012) * smoothstep(0.5 * uCraterR, 1.6 * uCraterR, dot(q, along));
    if (uBounceAmp > 0.0) {
        float env = exp(-uBounceT / max(uBounceDamp, 1e-3));
        float b2 = r / max(uBounceSize, 1e-4);
        h += uBounceAmp * env * cos(TAU * uBounceFreq * uBounceT + uBouncePhase) * exp(-b2 * b2);
        float rr = (r - uBounceSpeed * uBounceT) / max(uBounceWidth, 1e-4);
        h += 0.6 * uBounceAmp * env * exp(-rr * rr) * smoothstep(0.0, uBounceSize, r);
    }
    return h + waves(q);
}

void main() {
    float aspect = uRes.x / uRes.y;
    vec2 p = (vUv - 0.5) * vec2(1.0, 1.0 / aspect);
    vec2 q = (p - uCenter) / uScale;
    float impact = 0.0;  // surface height from the impact (negative is sunk)
    float leading = 0.0; // the leading ring, for the reveal kick
    if (uImpactOn > 0.5) {
        float t = uBounceT;
        float ri = length(q);
        float sz = max(uImpactSize, 1e-4);
        // The centre: sinks hard, holds, then springs up and down, settling
        float attack = 1.0 - exp(-t / max(uImpactAttack, 1e-3));
        float ts = max(t - uImpactHold, 0.0);
        float spring = -cos(6.28318 * uImpactRebound * ts) * exp(-ts / max(uImpactDamp, 1e-3));
        float centre = uImpactDepth * attack * spring;
        float cavity = exp(-ri * ri / (sz * sz));
        // the crown: the displaced water piles up round the cavity
        float cr = (ri - 1.4 * sz) / (0.6 * sz);
        float crown = 0.45 * exp(-cr * cr) * attack * exp(-t / max(uImpactDamp, 1e-3));
        // The ring train: a packet behind a front that runs out; the rings widen as they go
        float front = uWaveSpeed * t;
        float lambda = 1.6 * sz * (1.0 + uWaveDisp * t);
        float behind = front - ri;
        float train = smoothstep(-0.5 * lambda, 0.3 * lambda, behind) * exp(-max(behind, 0.0) / (3.0 * lambda));
        float rings = sin(6.28318 * behind / lambda) * train;
        float env = uWaveRings * uImpactDepth * exp(-t / max(uWaveDecay, 1e-3))
            * exp(-ri / max(uWaveReach, 1e-3)) * smoothstep(0.5 * sz, 1.5 * sz, ri) / sqrt(1.0 + ri / sz);
        impact = centre * cavity + uImpactDepth * crown + env * rings;
        float lb = behind / lambda;
        leading = exp(-t / max(uWaveDecay, 1e-3)) * exp(-lb * lb * 4.0) * smoothstep(0.5 * sz, 1.5 * sz, ri);
        // The impact roughens the middle: its rim wobbles with low-frequency noise
        float dset = exp(-t / max(uDisturbSettle, 1e-3));
        float wob = snoise(vec3((ri > 1e-4 ? q / ri : vec2(0.0)) * 1.8, 3.7 + 0.3 * t));
        q *= 1.0 + uDisturb * 0.25 * wob * dset * smoothstep(0.3 * uCraterR, uCraterR, ri);
        // Shove what lies under the rings: outward on crests, back in troughs
        q -= (ri > 1e-4 ? q / ri : vec2(0.0)) * uImpactPush * (env * rings + uImpactDepth * crown) / max(uImpactDepth, 1e-5);
    }

    // Slope by central differences, in height per frame width
    const float e = 0.0015;
    vec2 grad = vec2(height(q + vec2(e, 0.0)) - height(q - vec2(e, 0.0)), height(q + vec2(0.0, e)) - height(q - vec2(0.0, e))) / (2.0 * e);
    vec3 n = normalize(vec3(-grad * uRelief, 1.0));
    float lit = dot(n, uLight);
    // The crater's wall gets its own lower light and extra relief, so it reads as a
    // dark crescent on the far side and a bright one on the near side, while the
    // floor and the ridges keep the main light
    float rw = length(q - uCraterTilt * uCraterR) / uCraterR;
    float wall = smoothstep(uCraterFloor - 0.15, uCraterFloor + 0.1, rw) * (1.0 - smoothstep(0.95, 1.25, rw));
    vec3 nw = normalize(vec3(-grad * uRelief * uWallRelief, 1.0));
    lit = mix(lit, dot(nw, uWallLight) + (uLight.z - uWallLight.z), wall);
    // Outside the crater the ridges take their own light, so the rim's crescent and
    // the ridges' bands can each sit where the reference has them
    lit = mix(lit, dot(n, uRingLight) + (uLight.z - uRingLight.z), smoothstep(1.1, 1.5, rw));
    // A smoothstep that is defined for either order of its ends
    float shade = 1.0 - lit;
    float span = uInkHi - uInkLo;
    float ink = abs(span) < 1e-4 ? step(uInkLo, shade) : clamp((shade - uInkLo) / span, 0.0, 1.0);
    ink = ink * ink * (3.0 - 2.0 * ink);
    // One-sided wall: inside a bowl the wall nearest the light faces away from it and
    // darkens, the wall across faces it and opens up. A smooth weight round the
    // crater, aligned to the light, so the dark rim is a crescent, not a ring.
    vec2 fromC = rw > 1e-4 ? (q - uCraterTilt * uCraterR) / (rw * uCraterR) : vec2(0.0);
    float toLight = dot(fromC, normalize(uLight.xy + 1e-5));
    ink += wall * (uWallDark * smoothstep(-0.2, 0.6, toLight) - uWallSweep * smoothstep(-0.1, 0.7, -toLight));
    // The floor: a broad bright sweep on the side away from the light, the rest a
    // little darker, so the two read apart
    float floorMask = 1.0 - smoothstep(uCraterFloor - 0.05, uCraterFloor + 0.2, rw);
    ink += floorMask * uFloorSweep * (0.4 * smoothstep(-0.3, 0.5, toLight) - smoothstep(-0.2, 0.8, -toLight + 0.3 * (1.0 - rw)));
    // The opening: the crater starts as a pale splash, and its dark rim grows in from
    // the top, sweeping round both sides; gone entirely once the sweep is done
    float density = 1.0; // share of marks kept (below 1 only in the splash)
    if (uIntroOn > 0.5) {
        float fromTop = acos(clamp(dot(fromC, vec2(0.0, 1.0)), -1.0, 1.0)) / 3.14159;
        float show = smoothstep(0.0, 1.0, (uBounceT - uRimStart) / max(uRimTime, 1e-3) - 0.3 * fromTop);
        float inCrater = 1.0 - smoothstep(1.0, 1.4, rw);
        // fills in, empties to pale, fills again: a 0.2 s swing peaking at 0.12 s
        float splash = uIntroInk + uIntroSwing * cos(TAU * (uBounceT - 0.12) / 0.2) * exp(-uBounceT / 0.4);
        ink = mix(ink, splash, inCrater * (1.0 - show));
        density = 1.0 - uSplashThin * inCrater * (1.0 - show);
    }
    ink = clamp(ink, 0.0, 1.0);
    // Ripples get a little extra light and shadow, so they read even when shallow
    vec2 wg = vec2(waves(q + vec2(e, 0.0)) - waves(q - vec2(e, 0.0)), waves(q + vec2(0.0, e)) - waves(q - vec2(0.0, e))) / (2.0 * e) * uWaveSlope;
    ink = clamp(ink + uShockTone * dot(wg, normalize(uLight.xy + 1e-5)) * 0.5, 0.0, 1.0);

    // Flow: round the crater, plus curl noise, bent by the ripples
    float r = length(q);
    vec2 round_ = r > 1e-4 ? vec2(-q.y, q.x) / r : vec2(1.0, 0.0);
    vec3 fq = vec3(q * uFlowFreq * 3.0, uTime * 0.05 * uFlowDrift);
    const float h = 0.01;
    float f0 = snoise(fq);
    vec2 curl = vec2(snoise(fq + vec3(0.0, h, 0.0)) - f0, -(snoise(fq + vec3(h, 0.0, 0.0)) - f0)) / h;
    vec2 dir = round_ * uSwirl + curl * 0.2 * uCurl - wg * uRefract;
    // While the drop bounces, marks near the middle point out from it
    if (uBounceAmp > 0.0) {
        float near = exp(-r * r / max(4.0 * uBounceSize * uBounceSize, 1e-6));
        // ...easing back to the normal flow as the rim finishes growing in
        float fan = 1.0 - smoothstep(uRimStart, uRimStart + 1.3 * uRimTime, uBounceT);
        dir += (r > 1e-4 ? q / r : vec2(0.0)) * uBounceRadial * fan * near * 3.0;
    }
    float angle = atan(dir.y, dir.x) / TAU + 0.5;

    // Reveal, on the screen (the paper): watercolour dropped on wet paper. A core
    // round the origin always shows. Outside it the stain spreads from the core's
    // torn rim like diffusion (fast, then creeping to a stop), further where the
    // paper is wetter, with feathered fingers, strands that curl off along the flow
    // and loose islands beyond the front. Marks thin out over a wide band inside it.
    vec2 o = p - uRevealOrigin;
    float d = length(o) / 0.62; // 1 at the frame's far corner from the middle
    float t = clamp(uReveal, 0.0, 1.0);
    float core = 1.0 - smoothstep(uCore - uCoreEdge, uCore, d + 0.5 * uCoreEdge * snoise(vec3(o * 9.0, 2.3)));
    vec2 heading = d > 1e-4 ? o / length(o) : vec2(1.0, 0.0);
    vec2 lobeWarp = uLobeWarp * vec2(snoise(vec3(o * 3.0, 21.0)), snoise(vec3(o * 3.0, 37.0)));
    float wet = 0.6 * snoise(vec3((heading + 0.6 * lobeWarp) * uWetScale * 0.5, 4.1)) + 0.4 * snoise(vec3((o + 0.08 * lobeWarp) * uWetScale * 1.6, 7.7));
    float reach = mix(1.0 + uWetness * (wet - 1.0) * 0.5, 1.0, smoothstep(0.7, 1.0, t));
    // The stain stops at an irregular outline of its own, short of the corners
    float outline = uOutline * (1.0 + uOutlineNoise * fbm(vec3(heading * 1.3 + 0.2 * lobeWarp, 9.1)));
    float front = uCore + (outline - uCore) * pow(t, uSpread) * reach;
    vec3 pq = vec3(o * uTendrilScale * 1.6 + vec2(1.0, -0.7) * t * uCreep, 0.0);
    vec2 warp = vec2(fbm(pq * 0.5 + vec3(3.1, 1.2, 0.0)), fbm(pq * 0.5 + vec3(-2.7, 5.4, 1.3)));
    float wetEdge = front - d + uFeather * 0.06 * fbm(pq + vec3(warp * 1.6, 0.0));
    // the impact's leading ring kicks the stain outward as it passes
    wetEdge += uImpactKick * 0.08 * leading;
    // Strands: noise stretched along the flow (round the crater), so they curl off
    float theta = atan(q.y, q.x);
    float strand = snoise(vec3(theta * 3.0 + warp.x, r * uTendrilScale * 6.0, 0.3 * t * uCreep));
    wetEdge += uTendrils * 0.12 * smoothstep(0.35, 0.85, strand) * smoothstep(0.25, 0.0, -wetEdge);
    // Islands: loose clumps ahead of the front
    float clump = smoothstep(0.55, 0.85, 0.5 + 0.5 * fbm(vec3(o * 7.0, 11.0) + vec3(warp, 0.0)));
    // Early on they fly further out, along the flow, and the main stain catches up
    float islandReach = 0.2 + uIslandReach * (1.0 - smoothstep(0.1, 0.6, t));
    float clumpFlow = smoothstep(0.55, 0.85, 0.5 + 0.5 * fbm(vec3(theta * 2.0 + warp.y, r * 5.0, 13.0)));
    wetEdge = max(wetEdge, (max(clump, clumpFlow) - 0.6) * uBlooms * 0.1 * smoothstep(islandReach, 0.0, -wetEdge));
    // A torn white margin at the frame's edges, kept through the zoom
    if (uMargin > 0.0) {
        vec2 fromEdge = min(vUv, 1.0 - vUv) * vec2(1.0, 1.0 / aspect);
        float margin = uMargin * (1.0 + 0.9 * fbm(vec3(p * 9.0, 5.5)));
        // Its own sharp falloff, so it tears the edge without greying the inside
        wetEdge = min(wetEdge, (min(fromEdge.x, fromEdge.y) - margin) * uRevealSoft / 0.012);
    }
    // Early on, low-frequency lobes cut the stain into separate patches that join up
    float lobe = snoise(vec3((o + 0.05 * lobeWarp) * 4.0, 31.0));
    wetEdge -= uLobes * 0.12 * (1.0 - smoothstep(0.15, 0.6, t)) * smoothstep(-0.1, 0.4, -lobe) * (1.0 - core);
    float x = wetEdge / max(uRevealSoft, 1e-3) - uGranulation * snoise(vec3(o * 150.0, 3.3));
    x = mix(x, 3.5, core);
    // The reveal out: the paper clears from the middle outward, the edge torn like
    // the stain's own, so the page underneath comes through as the water drains
    // "opened" is where the page underneath shows through (marks and paper gone)
    float opened = 0.0;
    if (uExit > 0.0) {
        // noise by position (not by direction), so the edge has no spikes at the middle
        float tear = uExitTear * 0.12 * fbm(vec3(o * 4.0 + 0.3 * warp, 17.0 + 2.0 * uExit));
        float edge;
        if (uExitStyle < 0.5) {
            // Open through: a hole from the middle, pushed open to fill the frame
            edge = d - (uExit * 1.7 - 0.15 + tear);
        } else if (uExitStyle < 1.5) {
            // Dry out: the stain recedes through its noisy edge toward the middle
            edge = (1.55 - uExit * 1.7 + tear) - d;
        } else {
            // Wash away: everything dissolves in noisy patches at once
            edge = 0.5 + 0.5 * fbm(vec3(o * 5.0 + warp, 23.0)) + 0.1 * tear - uExit * 1.25;
        }
        x = min(x, edge / max(uExitSoft, 1e-3));
        opened = 1.0 - smoothstep(-uExitSoft, 0.0, edge);
    }
    // The pigment rim: a thin dark band just inside the front, fainter once dried
    float band = max(uEdgeBand, 1e-3) * 0.03;
    float rim = smoothstep(0.0, band * 0.3, wetEdge) * (1.0 - smoothstep(band * 0.3, band, wetEdge));
    ink += uEdgeDark * rim * (1.0 - core) * mix(1.0, 0.35, smoothstep(0.85, 1.0, t));

    // The impact leaves a wobbly ring of disturbed marks inside the middle, settling slowly
    if (uImpactOn > 0.5 && uInnerRing > 0.0) {
        float rq = length(q);
        float ang = atan(q.y, q.x);
        float rr = 0.5 * uCraterR * (1.0 + 0.25 * snoise(vec3(cos(ang), sin(ang), 9.1) * 1.5));
        float band = (rq - rr) / (0.12 * uCraterR);
        ink += uInnerRing * 0.35 * exp(-band * band) * (0.6 + 0.4 * snoise(vec3(q * 60.0, 2.0))) * exp(-uBounceT / max(uDisturbSettle, 1e-3));
    }
    // Impact shading: crests light, troughs and the cavity dark
    ink -= uImpactShade * impact / max(uImpactDepth, 1e-5) * 0.5;
    gl_FragColor = vec4(clamp(ink, 0.0, 1.0), angle, clamp((x + 0.5) * 0.25, 0.0, 1.0), density * (1.0 - opened));
}
`

// Pass 2: the screen is cut into cells, each holding one short curved mark (a hook
// or crescent) read from pass 1 at the cell's jittered centre: turned along the
// flow, inked by the shading. Marks may spill into their neighbours, so each pixel
// draws the marks of its own cell and the eight around it.
export const marksVertex = /* glsl */ `
void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const marksFragment = /* glsl */ `
uniform sampler2D tForm;
uniform float uPaper;      // 1 opaque paper, 0 fully see-through (the end of the reveal out)
uniform sampler2D tFlow;    // the liquid (see the turbulence passes)
uniform float uTurbMove;    // 1 when the liquid moves what the marks show
uniform float uTurbStrength; // offset, share of the frame width
uniform float uTurbShade;
uniform float uTurbCaustics;
uniform vec2 uRes;         // drawing buffer, px
uniform float uPx;         // drawing-buffer px per px of a 1000 px wide frame
uniform float uCell;       // px at a 1000 px wide frame
uniform float uLength;     // of a cell
uniform float uCurve;      // radians the arc turns through; 0 is a straight dash
uniform float uWidth;      // px at a 1000 px wide frame
uniform float uWidthShade; // extra width in full shadow, as a share of uWidth
uniform float uJitter;
uniform float uVariety;
uniform float uOpacity;
uniform float uDensity;
uniform float uBase;       // share of marks kept even in full light
uniform float uGrain;      // per-mark spread in when each one appears at the front
uniform vec3 uInk;
uniform vec3 uBg;

vec2 hash22(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    return fract((q.xx + q.yz) * q.zy);
}

// Distance to a mark of length len that bends through bend radians (an arc of a
// circle), centred on the origin, running along x and bulging toward +y
float sdMark(vec2 p, float len, float bend, float halfWidth) {
    if (bend < 0.02) return length(vec2(max(abs(p.x) - 0.5 * len, 0.0), p.y)) - halfWidth;
    float r = len / bend;
    vec2 sc = vec2(sin(0.5 * bend), cos(0.5 * bend));
    p.y += r;
    p.x = abs(p.x);
    return (sc.y * p.x > sc.x * p.y ? length(p - sc * r) : abs(length(p) - r)) - halfWidth;
}

void main() {
    float cell = uCell * uPx;
    vec2 px = gl_FragCoord.xy;
    vec2 home = floor(px / cell);
    float clear = 1.0;
    // The paper is opened where the field's alpha drops below the splash's lowest
    // density; read it with a hand-made bilinear tap so the edge is smooth
    vec2 ts = vec2(textureSize(tForm, 0));
    vec2 fp = px / uRes * ts - 0.5;
    vec2 fi = floor(fp);
    vec2 ff = fp - fi;
    float a00 = texture2D(tForm, (fi + vec2(0.5, 0.5)) / ts).a;
    float a10 = texture2D(tForm, (fi + vec2(1.5, 0.5)) / ts).a;
    float a01 = texture2D(tForm, (fi + vec2(0.5, 1.5)) / ts).a;
    float a11 = texture2D(tForm, (fi + vec2(1.5, 1.5)) / ts).a;
    float paper = smoothstep(0.0, 0.3, mix(mix(a00, a10, ff.x), mix(a01, a11, ff.x), ff.y)) * uPaper;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 id = home + vec2(float(i), float(j));
            vec2 h = hash22(id);
            vec2 g = hash22(id + 17.31);
            vec2 centre = (id + 0.5 + (h - 0.5) * uJitter) * cell;
            // Liquid: each mark keeps its shape and place; it reads the surface from
            // where the liquid has carried it, one offset per mark
            vec2 suv = centre / uRes;
            vec4 fl = vec4(0.5);
            if (uTurbMove > 0.5) {
                fl = texture2D(tFlow, suv);
                suv += (fl.rg - 0.5) * 16.0 * uTurbStrength * vec2(1.0, uRes.x / uRes.y);
                suv = 1.0 - abs(1.0 - abs(suv));
            }
            vec4 f = texture2D(tForm, suv);
            if (f.a < 0.003) continue;
            // a splash keeps only some marks (alpha is 1 everywhere else)
            if (hash22(id + 41.7).x > f.a) continue;
            float x = f.b * 4.0 - 0.5;
            float ink = f.r;
            float shown = f.a * smoothstep(0.0, 1.0, x - g.x * uGrain);
            // Interleaved gradient noise spreads the keep thresholds evenly between
            // neighbours, so mid shadows read as even hatching, not patches
            // (blended with a little plain hash, so neighbours are not too regular)
            float rank = mix(fract(52.9829189 * fract(dot(id, vec2(0.06711056, 0.00583715)))), g.x, 0.35);
            float keep = smoothstep(rank - 0.08, rank + 0.08, ink * uDensity + uBase);
            float a = shown * keep * uOpacity * mix(0.55, 1.0, smoothstep(0.0, 1.0, ink));
            // The liquid's surface as a tone on the marks: lighter where it faces the
            // light or gathers into a caustic, darker where it turns away
            if (uTurbMove > 0.5) a *= clamp(1.0 - uTurbShade * (fl.b * 2.0 - 1.0) - uTurbCaustics * fl.a, 0.0, 2.0);
            if (a < 0.003) continue;
            float angle = (f.g - 0.5) * 6.28318 + (h.y - 0.5) * uVariety * 1.2;
            float len = uLength * cell * (1.0 + (h.x - 0.5) * uVariety);
            vec2 q = px - centre;
            float cs = cos(angle);
            float sn = sin(angle);
            q = vec2(cs * q.x + sn * q.y, cs * q.y - sn * q.x);
            float halfWidth = 0.5 * uWidth * uPx * (1.0 + uWidthShade * ink * ink);
            float dist = sdMark(q, len, uCurve * (1.0 + (g.x - 0.5) * uVariety), halfWidth);
            clear *= 1.0 - a * clamp(0.5 - dist, 0.0, 1.0);
        }
    }
    // Premultiplied: the page shows through where the paper has opened
    float inkA = (1.0 - clear) * uPaper;
    float alpha = max(paper, inkA);
    gl_FragColor = vec4(mix(uBg, uInk, 1.0 - clear) * alpha, alpha);
}
`

// Pass 3 (optional): liquid turbulence over everything drawn so far. The flow is
// smooth, so it is worked out on a small target first: the offset is the curl of a
// domain-warped noise potential, so it swirls and eddies rather than jitters. Then the
// finished marks are sampled through it at full size. Its slope adds a little light
// and shade, and where the flow converges a soft caustic brightens, both mixed from
// the ink and paper colours only.
export const turbVertex = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

// The flow, per pixel of the small target: rg = offset (flow over 16, around 0.5,
// with the edge ease and ripple push in it), b = surface light, a = convergence;
// all kept in 0..1
export const turbFieldFragment = /* glsl */ `
${noise}
uniform vec2 uRes;
uniform float uTime;
uniform float uScale;       // swirls across the frame width
uniform float uOctaves;
uniform float uWarp;        // domain warp
uniform float uSwirl;       // how much of the offset turns round (curl) rather than pushes
uniform vec2 uDrift;        // the whole field's drift, frame widths
uniform float uEddies;      // small-scale detail
uniform float uEdge;        // eases off within this share of the frame from its edges
// The ripple can push the liquid: its rings, in frame widths round the crater
uniform vec2 uCenter;
uniform float uScaleForm;
uniform vec4 uDropFront;
uniform vec4 uDropAmp;
uniform vec4 uDropLen;
uniform float uRipplePush;
uniform float uStrengthRef; // the strength the offset is scaled by later, to undo it here
uniform float uCalm;        // calm round the crater: radius, frame widths
uniform float uOutward;     // how far the surface has drifted out from the crater, share of its distance

varying vec2 vUv;

// A noise potential, domain-warped, with up to four octaves
float potential(vec2 p) {
    vec3 q = vec3(p * uScale - uDrift * uScale, uTime);
    q.xy += uWarp * vec2(snoise(q * 0.5 + vec3(3.1, 7.7, 0.0)), snoise(q * 0.5 + vec3(-5.3, 1.9, 4.0)));
    float sum = 0.0;
    float amp = 1.0;
    for (int i = 0; i < 4; i++) {
        if (float(i) >= uOctaves) break;
        sum += amp * snoise(q);
        q = vec3(q.xy * 2.07 + vec2(1.3, -2.1), q.z * 1.3);
        amp *= uEddies;
    }
    return sum;
}

void main() {
    vec2 p = (vUv - 0.5) * vec2(1.0, uRes.y / uRes.x);
    const float e = 0.004;
    float f0 = potential(p);
    float fx = potential(p + vec2(e, 0.0));
    float fy = potential(p + vec2(0.0, e));
    vec2 grad = vec2(fx - f0, fy - f0) / e;
    vec2 flow = mix(grad, vec2(grad.y, -grad.x), uSwirl) / max(uScale, 1e-3);
    float lit = dot(grad / max(length(grad), 1.0), normalize(vec2(-0.6, 0.8)));
    float converge = clamp(-(fx + fy - 2.0 * f0) / (e * e) * 0.0004 / max(uScale * uScale, 1e-3), 0.0, 1.0);
    // Eases off toward the frame's edges, and swells where a ripple ring passes
    vec2 fromEdge = min(vUv, 1.0 - vUv) * vec2(1.0, uRes.y / uRes.x);
    float fade = smoothstep(0.0, max(uEdge, 1e-4), min(fromEdge.x, fromEdge.y));
    float push = 0.0;
    float r = length(p - uCenter) / max(uScaleForm, 1e-3);
    for (int i = 0; i < 4; i++) {
        if (uDropAmp[i] <= 0.0) continue;
        float x = (r - uDropFront[i]) / uDropLen[i];
        push += exp(-x * x) * uDropAmp[i] / 0.004;
    }
    // Calm round the crater, stirring up further out
    float calm = smoothstep(0.5 * uCalm, 1.5 * uCalm, length(p - uCenter));
    flow *= fade * calm * (1.0 + uRipplePush * push);
    // An outward drift from the crater: everything reads from a little nearer the
    // middle, so the surface spreads out (in frame widths, like the flow)
    flow -= (p - uCenter) * uOutward / max(uStrengthRef, 1e-5);
    gl_FragColor = vec4(clamp(flow / 16.0 + 0.5, 0.0, 1.0), 0.5 + 0.5 * lit * fade, converge * fade);
}
`

// Sampling the marks through the flow, at full size
export const turbFragment = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tFlow;
uniform vec2 uRes;
uniform float uStrength;    // offset, share of the frame width
uniform float uShade;
uniform float uCaustics;
uniform vec3 uInk;
uniform vec3 uBg;

varying vec2 vUv;

void main() {
    float aspect = uRes.x / uRes.y;
    vec4 fl = texture2D(tFlow, vUv);
    vec2 offset = (fl.rg - 0.5) * 16.0 * uStrength;

    // Sample through it, mirrored at the edges so nothing tears
    vec2 uv = vUv + offset * vec2(1.0, aspect);
    uv = 1.0 - abs(1.0 - abs(uv));
    // The marks pass is premultiplied: un-premultiply to shade, premultiply again to write
    vec4 sc = texture2D(tScene, uv);
    vec3 col = sc.a > 1e-4 ? sc.rgb / sc.a : uBg;

    // Surface: light and shade from the flow's slope, and a soft caustic where it converges
    // Only where there is ink, so the bare paper stays clean
    float inked = smoothstep(0.02, 0.25, distance(col, uBg));
    float k = inked * uShade * (fl.b * 2.0 - 1.0) * 0.5;
    col = mix(col, k > 0.0 ? uBg : uInk, abs(k));
    col = mix(col, uBg, uCaustics * fl.a);
    gl_FragColor = vec4(col * sc.a, sc.a);
}
`
