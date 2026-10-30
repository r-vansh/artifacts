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
4. `npm run build && npm run poster -- <slug>` grabs `poster.png` from the running canvas. Rebuild. Every card shows its poster as a square (cropped to fill), so keep the important part in the middle.
5. Push to `main`, then publish by hand: Actions → Deploy → Run workflow (see Deploy below).

The build fails if the frontmatter is wrong (unknown tag, summary over 140 characters, missing poster) or if a page goes over budget.

## The index grid

A post opens as an overlay over the grid, not a page of its own (`src/lib/overlay.ts`): the URL changes to `/<slug>`, Back or Esc closes it, and opening `/<slug>` directly still gives the full page.


A plain grid of square posters, five across on wide screens (4, 3 and 2 on smaller ones), each with the post's number above it, after the Figma frame 3180:17526. It is CSS only, so it looks the same with or without JS. The rules are in `CLAUDE.md` ("Index grid").

## The loading animation

On the first page of a visit, the Flow Field experiment covers the page full screen, faint, until a click (or Enter/Space). Then it draws itself in and opens through to the page, and the loader is gone about 5.7 s after that click (6 s at the latest). It plays once per tab session, on every load under `npm run dev`, and never under reduced motion or without JS. It is `src/lib/splash.ts`, a lazy chunk that `Base.astro` loads, mounting `src/experiments/flow-field` with no tuning panel. Details are in `CLAUDE.md` ("Loading animation").

## The intro effect

On the home page, scrolling makes the "ART/facts" heading and the line under it slide together, crumble into orange particles from where they meet, and stream to the pointer, where they vanish. Scrolling back up brings them out of the pointer and rebuilds the text. It lives in `src/lib/intro.ts` and loads after the page is idle, so it stays out of the first load.

To tune it, run `npm run dev` and use the panel on the right of the home page: every setting has a slider and applies live. "Copy values" puts them on the clipboard; paste them over `params` near the top of `intro.ts` to make them the defaults. The panel only exists in dev and is not in the build. What each stage does, and what has been tried, is in `CLAUDE.md` ("Intro effect").

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
  components/           Card, Contact, Grid, Stage
  layouts/Base.astro
  lib/                  stage.ts (loader), types.ts (the mount contract), entries.ts,
                        intro.ts (the heading's scroll burst), tune.ts (its dev-only panel),
                        splash.ts (the loading animation), nav.ts + barba.ts (page swaps)
  pages/                index, [slug], [slug]/play, tags/[tag], rss.xml, llms.txt
scripts/                budget.mjs, poster.mjs
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds the site and publishes `dist/` to GitHub Pages when run by hand (Actions → Deploy → Run workflow), so pushes don't go live on their own. One-time setup: Settings → Pages → Source "GitHub Actions" and custom domain `artifacts.vanshrastogi.me`, plus a CNAME at Namecheap (host `artifacts`, value `r-vansh.github.io`).
