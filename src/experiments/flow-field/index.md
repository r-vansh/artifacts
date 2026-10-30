---
title: Flow Field
date: 2026-10-28
summary: Curved pen marks shade a rippled crater that bleeds in like watercolour as drops ripple through it. Tap to replay.
tags: [generative, motion, visual]
kind: interactive
status: sketch
poster: ./poster.png
posterAlt: A rippled crater drawn entirely with short grey pen strokes on white
source: https://github.com/r-vansh/artifacts/tree/main/src/experiments/flow-field
background: "var(--white)"
---

A loading animation in the making: the shape should feel drawn rather than rendered, like an engraving that grows while the page loads.

**How it's made:** Three.js renders the noise-shaped surface offscreen, shading it from a moving light and noting which way a swirling flow runs across it at each point. A second pass cuts the screen into small cells and draws one short curved mark in each, turned along that flow and inked by the shade there, so shadows fill in with heavy marks and lit areas thin out to paper white. The middle always shows; the rest bleeds in like watercolour on wet paper, spreading fast then creeping to a stop, further where the paper is wetter, with feathered fingers, fine tendrils ahead of the front and a faint dark rim where the pigment gathers. Drops fall in the crater and send out rings like ripples in water, lit on their crests, shaded in their troughs, and shifting the marks beneath them as they pass.
