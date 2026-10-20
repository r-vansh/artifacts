# art/facts

Experiments by [Vansh Rastogi](https://vanshrastogi.me), live at **artifacts.vanshrastogi.me**. Built with Astro as a static site: the index ships almost no JavaScript, and each experiment's code loads only when its stage scrolls into view.

## Run it

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # type check, build to dist/, then the size budget
```

Node 22.22 or newer.

## Post an experiment

1. Copy `src/experiments/_template` to `src/experiments/<slug>` (no leading underscore).
2. Write `main.ts`: a `mount(canvas, options)` function that returns `pause`, `resume` and `stop`. No framework needed. `src/experiments/game-of-life/main.ts` is a full example ported from a Framer component.
3. Fill in the frontmatter in `index.md` and write a short note.
4. `npm run build && npm run poster -- <slug>` grabs `poster.png` from the running canvas. Rebuild.
5. Push a branch: Cloudflare Pages gives it a preview URL. Merge to publish.

The build fails if the frontmatter is wrong (unknown tag, summary over 140 characters, missing poster) or if a page goes over budget.

## Rules every experiment follows

The loader in `src/lib/stage.ts` handles most of these for you.

- Pause when off screen or when the tab is hidden (the loader calls `pause()` and `resume()`).
- Pointer events only, so mouse and touch share one path; taps shouldn't block page scrolling.
- No sound until the first tap or click, with a visible mute toggle.
- With reduced motion on, the poster shows with a "play anyway" button (handled by the loader).
- `stop()` cancels frames, removes listeners, closes audio and ends workers.
- A crash shows the poster and a short note (handled by the loader).

## Budget

Checked by `scripts/budget.mjs` on every build (gzipped sizes) and by Lighthouse in CI.

| What | Limit |
| --- | --- |
| A page's HTML with inlined CSS | 30 KB |
| JS a page loads before an experiment | 5 KB |
| One experiment's own code | 60 KB |
| The font file | 30 KB |
| Lighthouse performance, mobile | 95 or higher |

## Layout

```
src/
  experiments/<slug>/   index.md, main.ts, poster.png
  components/           Card, Grid, Stage, TagBar
  layouts/Base.astro
  lib/                  stage.ts (loader), types.ts (the mount contract), entries.ts
  pages/                index, x/[slug], x/[slug]/play, tags/[tag], rss.xml, llms.txt
scripts/                budget.mjs, poster.mjs
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds the site and publishes `dist/` to GitHub Pages on every push to `main`. One-time setup: Settings → Pages → Source "GitHub Actions" and custom domain `artifacts.vanshrastogi.me`, plus a CNAME at Namecheap (host `artifacts`, value `r-vansh.github.io`).
