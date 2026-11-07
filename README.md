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
3. Fill in the frontmatter in `index.md`. Only the title, summary and tags show on the post; `source` adds a "github" link and an interactive post gets an "open" link to its fullscreen stage. Extra images go in `gallery`.
4. `npm run build && npm run poster -- <slug>` grabs `poster.png` from the running canvas. Rebuild. Every card shows its poster as a square (cropped to fill), so keep the important part in the middle.
5. Push to `main`, then publish by hand: Actions → Deploy → Run workflow (see Deploy below).

The build fails if the frontmatter is wrong (unknown tag, summary over 140 characters, missing poster) or if a page goes over budget.

## The index grid

A grid of square posters, five across on wide screens at most (4, 3 and 2 on smaller ones), each with the post's number and title above it, and a dashed crosshair where four posters meet, after the Figma frames 3203:17832 and 3208:17894. Posts run newest first and are numbered in that order, so the newest is .001. Above the grid the heading and its line sit in a hairline box; the logo is on the left guide line, and shows a selection frame when hovered.

With a mouse, the grid bulges under the pointer like a dome: the posters near it lift, turn and spread a little, and the bulge sinks when the pointer leaves (`src/lib/dock.ts`). It only adds transforms, so without JS the grid is the same, flat.

## Opening a post

A post opens over the grid, not as a page of its own (`src/lib/overlay.ts`). The clicked poster comes apart into particles in its own colours, which fly onto the post's card as it grows out of the poster, bulging like a lens, and settles (`src/lib/converge.ts`; the bulge is a WebGL shader over a picture of the card, which then hands over to the real card). Closing plays it back into the poster. The URL changes to `/<slug>`; Back, Esc, the close corner or a click outside closes it, and opening `/<slug>` directly still gives the full page. With reduced motion it opens without the effects; without WebGL2, without the bulge.

Two chevron chips on the card (and the left and right arrow keys) switch to the previous or next post, round the ends of the list: the content scrambles into small particles in its own colours and comes back as the neighbour's, in about half a second, while the card's frame stays still. The address follows the post (Back or Esc still closes in one step), and the next posts are fetched ahead. Reloading an open post goes back to the grid, closed; Esc leaves no focus ring on the card.

The card follows the Figma frames 3236:43212 and 3243:43542: 16:10, dashed guides 40px in, the title, summary and tags on the left, the "open" and "github" links at the bottom, and the media on the right, scrolling on its own under frosted bands at the top and bottom. The expand corner fills the window with it; only the media grows. Its icons are in `public/icons`.

## Dark mode: the cord

A dashed cord hangs from the top of every page, ending in a moon on the light page and a sun on the dark one (Figma node 3252:17850; `src/components/Cord.astro`, physics in `src/lib/cord.ts`). It sways on its own, and a pointer passing by swings and stretches it, but only holding the click and pulling reaches the page; a plain click just tugs at the cord.

The page itself is a cloth (`src/lib/cloth.ts`). A slight pull peels it off the wall around the cord, with the dark page showing behind; let go and it heals flat, with nothing changed. A proper pull, about 105 px, tears it away: it falls, folds and piles up on the bottom edge, then drops out of the window with the cord, and a new cord lowers from the top. It works both ways: pulling in dark mode lets the dark page fall to show the light one. The choice is kept in localStorage; light is the default, and the system setting is not read.

Dark mode is the same colour tokens turned over (`src/styles/global.css`), so keep using tokens and it follows. WebGL can't draw a web page, so `cloth.ts` paints what is on screen onto a canvas from its measurements: **a new kind of CSS on a page has to be taught to the painter**, or the fabric won't quite match the page. Under reduced motion, without WebGL2, or before the cloth has loaded it is a plain colour fade. Enter on the focused cord switches straight away. The dark frames are in Figma (`3273:17727` page, `3274:17839` scrim, `3274:18283` card); the dashed lines use one token, `--line`.

## The footer

Under the grid: "Let's nerd out about design", the View Resume button, the address (a click copies it, as on vanshrastogi.me), and five social icons, each with a name-and-handle tag on hover (`src/components/Contact.astro`, Figma `3203:17832`). The button darkens on hover and four corner brackets slide in around it.

The bottom of every page is the real garden (`src/components/Garden.astro`, `src/experiments/garden`): a dot-grid garden you plant, sway and drag, with birds, pollen and soft synthesized sound, ported from the Framer component in the soundhub repo (`r-vansh/soundhub`). It starts when it nears the screen, pauses off screen, takes the theme's colours, and its sound fades in and out (the loader's click already counts as the gesture; if the page has had none, the first click anywhere does). It is also a post (`/garden`); both share one saved garden. Pictures of it stand in until it starts and under reduced motion.

## The loading animation

On the first page of a visit, the Flow Field experiment covers the page full screen, faint, with ripples crossing it in silence, until a click (or Enter/Space). The pointer is a small dark pill reading "click anywhere" (Figma node 3202:17823) while it waits. Then it draws itself in and opens through to the page, and the loader is gone about 5.7 s after that click (6 s at the latest). It plays once per tab session, on every load under `npm run dev`, and never under reduced motion or without JS. It is `src/lib/splash.ts`, a lazy chunk that `Base.astro` loads, mounting `src/experiments/flow-field` with no tuning panel.

## The intro effect

On the home page, scrolling makes the "ART/FACTS" heading and the line under it (in their box) slide together, crumble into orange particles from where they meet, and stream to the pointer, where they vanish. Scrolling back up brings them out of the pointer and rebuilds the text. It lives in `src/lib/intro.ts` and loads after the page is idle, so it stays out of the first load.

## Scrolling and cursors

Scrolling is smoothed with Lenis (`src/lib/smooth.ts`), on the page and inside an open post; it loads after the page is idle and is off under reduced motion. The cursors are pixel-art SVGs from Figma (`public/cursor.svg`, and `public/cursor-hand.svg` on anything clickable), with `-dark` copies for dark mode; the sun on the cord uses the browser's grab cursor.

## Tuning panels

Under `npm run dev`, panels on the sides of the page tune the effects live: Scroll (every page), Bulge (the grid's dome), Morph (opening a post), Particles (the intro effect, home page), Cord, Cloth and Garden (the garden's Framer controls: sliders, switches, menus and colours; changing one starts it again with its plants kept). Morph also holds the switch between posts. Every setting has a slider; double-click one to reset it. "Copy values" puts them on the clipboard; paste them over `params` near the top of the matching file (`smooth.ts`, `dock.ts`, `converge.ts`, `intro.ts`, `cord.ts`, `cloth.ts`; the garden's go in `defaults` in `src/experiments/garden/main.ts`) to make them the defaults. The panels exist only in dev and are not in the build.

The orange **Scrub the cloth** button at the top of the window (also dev only, `src/lib/scrub.ts`) records a scripted pull and gives you a timeline: drag it both ways, play it slowly, step with the arrow keys. Moving a Cord or Cloth slider simulates it again with the same folds; the light and shadow sliders apply at once. Close or Esc puts everything back. The loader's waiting screen has no panel of its own: tune it on `/flow-field` with "Show gate again" and the "Waiting drift" sliders.

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
| JS a page loads before an experiment | 6 KB |
| One experiment's own code | 60 KB |
| The font file | 30 KB |
| Lighthouse performance, mobile | 95 or higher |

Anything heavy loads lazily: the post overlay and its particles, Barba and GSAP, Lenis, the intro effect, the cord's physics, the cloth and the garden's code. The home page's first-load JS is about 5.2 KB.

## Layout

```
src/
  experiments/<slug>/   index.md, main.ts, poster.png
  components/           Card, Contact, Cord, Garden, Grid, Stage
  layouts/Base.astro
  lib/                  stage.ts (loader), types.ts (the mount contract), entries.ts,
                        overlay.ts + converge.ts (opening a post), dock.ts (the grid's bulge),
                        smooth.ts (Lenis), intro.ts (the heading's scroll burst),
                        splash.ts (the loading animation), nav.ts + barba.ts (page swaps),
                        theme.ts + cord.ts + cloth.ts (dark mode, the cord, the page as a cloth),
                        panel.ts + *-tune.ts (cord, cloth, garden, morph...), tune.ts and scrub.ts (dev only: panels, timeline)
  pages/                index, [slug] (the post card), [slug]/play, tags/[tag], rss.xml, llms.txt
public/                 icons/, social/ (dark icons), cursors, fonts, crosshair and overlay marks,
                        favicon-light/dark.svg (picked by the browser's colour scheme) and apple-touch-icon.png
src/assets/             social/ (the icons), footer/ (the garden's stand-in pictures)
scripts/                budget.mjs, poster.mjs
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds the site and publishes `dist/` to GitHub Pages when run by hand (Actions → Deploy → Run workflow), so pushes don't go live on their own. One-time setup: Settings → Pages → Source "GitHub Actions" and custom domain `artifacts.vanshrastogi.me`, plus a CNAME at Namecheap (host `artifacts`, value `r-vansh.github.io`).
