---
title: garden
date: 2026-10-30
summary: "A dot-grid garden that makes music: click to plant, drag to move, hover to sway, and every action plays a note in one key."
tags: [generative, sound]
kind: interactive
status: playable
poster: ./poster.png
posterAlt: Dot-drawn trees and flowers growing from a grass strip, with a small flock of birds
sound: true
source: https://github.com/r-vansh/soundhub
background: "#101011"
---

A garden you plant, sway, drag and prune, with birds and pollen. Every sound is synthesized live with the Web Audio API, all tuned to one key, so whatever you play together sounds good.

**How it's made:** plants are drawn procedurally from a stored seed as cached dot stamps on one canvas, so a saved garden comes back identical. The grid and soil are rendered once and the loop sleeps when nothing moves. It started as a Framer code component (the hero of vanshrastogi.me) and lives in the soundhub repo.
