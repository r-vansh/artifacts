---
title: Game of Life
date: 2026-10-01
summary: Conway's Game of Life on the hero's dot grid. Hover to plant cells, tap to drop a pattern that grows.
tags: [generative, motion]
kind: interactive
status: sketch
poster: ./poster.png
posterAlt: A dark dot grid with clusters of orange live cells
source: https://github.com/r-vansh/artifacts/tree/main/src/experiments/game-of-life
background: "#0b0b0b"
---

A candidate for the vanshrastogi.me hero, before Grow Your Garden won. It runs and it's pleasant to watch, but it felt like a toy, not a game: there's nothing to aim for, so people hover once and move on.

**How it's made:** one canvas, typed arrays for the grid, a fixed-rate simulation with eased drawing so cells fade in and out instead of blinking. It reseeds when the population stops changing for 40 generations.
