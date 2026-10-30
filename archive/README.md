# Archive

Retired code kept for reference. Nothing here is built or type-checked (see `exclude` in `tsconfig.json`).

- `transitions/`: the WebGL shader page-opening effects (dither, glitch, halftone, ink, lift, shatter, swarm, warp) and their harness. Replaced by the Barba + GSAP transitions in `src/lib/barba.ts`. The harness imports `setTransition` from the old hand-rolled router (`src/lib/nav.ts`, also gone); restore it from git history if you revive these.
- `splash-p5.ts`: the first loading animation, a p5.js flow-field vortex drawn in greys (see `sessions.md` for the briefs). Replaced by the Flow Field experiment as the loader (`src/lib/splash.ts`). Its `p5` dependency is still in `package.json`; nothing imports it now.
