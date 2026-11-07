// Sound for the Flow Field: Vansh's two recordings for the impact and each ripple
// drop, played as they are, over a bed of waves made in the browser with Web Audio
// that swells with each ring and fades on the reveal out. Browsers only let audio start after a click or key
// press, so the context is made and resumed on the first interaction; before that the
// visuals run silent.

export interface SoundSettings {
    on: boolean
    volume: number
    /** Levels of the impact recording, the ripple-drop recording and the waves */
    impact: number
    ripple: number
    /** Each ripple plays up to this share faster or slower */
    rippleVary: number
    /** The ring travelling through the marks: level, and delay after the drop (s) */
    travel: number
    travelDelay: number
    /** The ring's run (s) and the share of it spent fading out, so the travel sound follows it */
    ringTime: number
    ringFade: number
    waves: number
    /** How much the waves swell with each ring (0..1) */
    waveDepth: number
}

/** The sounds themselves, on any context (live or offline), at a given time */
export function voices(ctx: BaseAudioContext, out: AudioNode, get: () => SoundSettings) {
    // two seconds of brown noise, reused by every sound
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = noise.getChannelData(0)
    let last = 0
    for (let i = 0; i < data.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
        data[i] = last * 3.5
    }
    const source = (loop = false) => {
        const s = ctx.createBufferSource()
        s.buffer = noise
        s.loop = loop
        return s
    }
    // Every gain change ramps (exponentially, from a tiny value), so nothing clicks
    const envelope = (g: AudioParam, t: number, peak: number, attack: number, decay: number) => {
        g.setValueAtTime(0.0001, t)
        g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack)
        g.exponentialRampToValueAtTime(0.0001, t + attack + decay)
    }

    // A ring passing: a swell of low water, panned a little so the rings feel like they move
    const swell = (t: number, size = 1, length = 2.2) => {
        const s = get()
        if (s.waves <= 0 || s.waveDepth <= 0) return
        const n = source(true)
        const lp = ctx.createBiquadFilter()
        lp.type = "lowpass"
        lp.frequency.setValueAtTime(260, t)
        lp.frequency.linearRampToValueAtTime(700, t + length * 0.3)
        lp.frequency.linearRampToValueAtTime(260, t + length)
        const pan = ctx.createStereoPanner()
        pan.pan.setValueAtTime((Math.random() - 0.5) * 0.8, t)
        pan.pan.linearRampToValueAtTime((Math.random() - 0.5) * 0.8, t + length)
        const g = ctx.createGain()
        envelope(g.gain, t, 0.35 * s.waves * s.waveDepth * size, length * 0.3, length * 0.7)
        n.connect(lp).connect(pan).connect(g).connect(out)
        n.start(t, Math.random() * 1.5)
        n.stop(t + length + 0.1)
    }

    // The quiet bed of water, breathing slowly; returns a stop
    const bed = (t: number) => {
        const s = get()
        const n = source(true)
        const lp = ctx.createBiquadFilter()
        lp.type = "lowpass"
        lp.frequency.value = 380
        const lfo = ctx.createOscillator()
        const depth = ctx.createGain()
        lfo.frequency.value = 0.083
        depth.gain.value = 160
        lfo.connect(depth).connect(lp.frequency)
        const level = ctx.createGain()
        level.gain.setValueAtTime(0.0001, t)
        level.gain.exponentialRampToValueAtTime(Math.max(0.12 * s.waves, 0.0002), t + 2)
        n.connect(lp).connect(level).connect(out)
        n.start(t)
        lfo.start(t)
        return {
            level,
            stop(at: number) {
                level.gain.cancelScheduledValues(at)
                level.gain.setTargetAtTime(0, at, 0.3)
                n.stop(at + 2)
                lfo.stop(at + 2)
            },
        }
    }

    return { swell, bed }
}

/** The live sound: one context, made on the first interaction, behind a limiter */
export function createSound(get: () => SoundSettings, files: { impact: string; ripple: string; travel: string }) {
    let ctx: AudioContext | undefined
    let master: GainNode | undefined
    let v: ReturnType<typeof voices> | undefined
    let water: ReturnType<ReturnType<typeof voices>["bed"]> | undefined
    let muted = false // while scrubbing
    const samples: { impact?: AudioBuffer; ripple?: AudioBuffer; travel?: AudioBuffer } = {}
    // The recordings decode straight away, before any click: an offline context needs
    // no gesture and warns about nothing, and its buffers play in the live one
    const decoder = new OfflineAudioContext(2, 1, 48000)
    const loaded = Promise.all(
        (["impact", "ripple", "travel"] as const).map((key) =>
            fetch(files[key])
                .then((r) => r.arrayBuffer())
                .then((b) => decoder.decodeAudioData(b))
                .then((buf) => (samples[key] = buf))
                .catch(() => console.warn(`Flow Field: couldn't decode the ${key} sound`))
        )
    )

    const setup = () => {
        if (ctx) return
        ctx = new AudioContext()
        const limiter = ctx.createDynamicsCompressor()
        limiter.threshold.value = -6
        limiter.knee.value = 6
        limiter.ratio.value = 12
        limiter.attack.value = 0.003
        limiter.release.value = 0.15
        master = ctx.createGain()
        master.gain.value = get().on ? get().volume : 0
        master.connect(limiter).connect(ctx.destination)
        v = voices(ctx, master, get)
    }
    // The travel sounds still running, oldest first; at most two overlap
    const travelling: { g: GainNode; src: AudioBufferSourceNode }[] = []
    // The ring moving through the marks: comes in quickly, fades out with the ring's
    // own fade and ends when the ring does; a new ring crossfades the oldest out
    const travel = (level: number, pan: number, rate: number, delay: number) => {
        const buf = samples.travel
        if (!buf || level <= 0) return
        const t = ctx!.currentTime + delay
        while (travelling.length >= 2) {
            const old = travelling.shift()!
            old.g.gain.cancelScheduledValues(t)
            old.g.gain.setTargetAtTime(0.0001, t, 0.1)
            old.src.stop(t + 0.6)
        }
        const run = Math.min(get().ringTime, buf.duration / rate)
        const src = ctx!.createBufferSource()
        src.buffer = buf
        src.playbackRate.value = rate
        const g = ctx!.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(level, t + 0.02)
        g.gain.setValueAtTime(level, t + run * (1 - get().ringFade))
        g.gain.exponentialRampToValueAtTime(0.0001, t + run)
        const p = ctx!.createStereoPanner()
        p.pan.value = pan
        // softened a little, so it's felt more than heard
        const soft = ctx!.createBiquadFilter()
        soft.type = "lowpass"
        soft.frequency.value = 3500
        src.connect(soft).connect(g).connect(p).connect(master!)
        src.start(t)
        src.stop(t + run + 0.05)
        const voice = { g, src }
        travelling.push(voice)
        src.onended = () => {
            const i = travelling.indexOf(voice)
            if (i >= 0) travelling.splice(i, 1)
        }
    }
    // Plays a recording at a level, panned a little
    const play = (key: "impact" | "ripple" | "travel", level: number, pan = 0, rate = 1, delay = 0) => {
        const buf = samples[key]
        if (!buf || level <= 0) return
        const t = ctx!.currentTime + delay
        const src = ctx!.createBufferSource()
        src.buffer = buf
        src.playbackRate.value = rate
        const g = ctx!.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(level, t + 0.002)
        const p = ctx!.createStereoPanner()
        p.pan.value = pan
        src.connect(g).connect(p).connect(master!)
        src.start(t)
    }
    const live = () => !!ctx && ctx.state === "running" && get().on && !muted
    const unlock = () => {
        setup()
        ctx!.resume().then(() => {
            if (!water && get().waves > 0) water = v!.bed(ctx!.currentTime)
        })
    }
    window.addEventListener("pointerdown", unlock, { once: true })
    window.addEventListener("keydown", unlock, { once: true })
    // iOS Safari starts audio only from a touch ending or a click, not from the touch starting: unlock
    // there too (harmless when already unlocked), so the context is running as soon as the finger lifts
    window.addEventListener("touchend", unlock, { once: true })
    window.addEventListener("click", unlock, { once: true })

    return {
        /** The heavy drop at the start: thump, splash, and the leading ring's swell */
        /** `ahead` (s) schedules it that far ahead on the audio clock */
        impact(ahead = 0) {
            if (!live()) return
            play("impact", get().impact, 0, 1, ahead)
            // its leading ring moves through the marks too
            travel(get().travel, 0, 1, ahead + get().travelDelay)
            v!.swell(ctx!.currentTime + ahead + 0.15, 1.4, 3)
        },
        /** A ripple leaving (the 5 s drops, and the last drop of the reveal out) */
        ripple(size = 1) {
            if (!live()) return
            const s = Math.min(Math.max(size, 0.2), 1)
            const pan = (Math.random() - 0.5) * 0.6
            const rate = 1 + (Math.random() * 2 - 1) * get().rippleVary
            play("ripple", get().ripple * s, pan, rate)
            // then the ring moving out through the marks
            travel(get().travel * s, pan, rate, get().travelDelay)
            v!.swell(ctx!.currentTime, size)
        },
        /** The reveal out: a soft swell, then the water fades as it opens */
        out(seconds: number) {
            if (!live()) return
            const t = ctx!.currentTime
            v!.swell(t, 1, seconds)
            water?.level.gain.setTargetAtTime(0, t + seconds * 0.5, seconds * 0.2)
        },
        /** Replay: the water bed comes back up */
        replay() {
            // rings still travelling from before fade away, so nothing stacks
            if (ctx)
                for (const old of travelling.splice(0)) {
                    old.g.gain.cancelScheduledValues(ctx.currentTime)
                    old.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1)
                    old.src.stop(ctx.currentTime + 0.6)
                }
            if (!ctx || !water) return
            const t = ctx.currentTime
            water.level.gain.cancelScheduledValues(t)
            water.level.gain.setTargetAtTime(0.12 * get().waves, t, 0.5)
        },
        test(which: "impact" | "ripple" | "travel" | "wave") {
            setup()
            ctx!.resume().then(() => {
                if (which === "wave") v!.swell(ctx!.currentTime + 0.02, 1.2, 2.5)
                else if (which === "travel") travel(get().travel, 0, 1, 0)
                else play(which, get()[which])
            })
        },
        /** Fades everything out over `seconds` (the loader is gone); resolves when silent */
        fade(seconds: number) {
            if (!ctx || !master) return Promise.resolve()
            const t = ctx.currentTime
            master.gain.cancelScheduledValues(t)
            master.gain.setValueAtTime(master.gain.value, t)
            master.gain.setTargetAtTime(0, t, seconds / 5)
            return new Promise<void>((r) => setTimeout(r, seconds * 1000))
        },
        /** Silent while scrubbing */
        mute(on: boolean) {
            muted = on
            if (master && ctx) master.gain.setTargetAtTime(on || !get().on ? 0 : get().volume, ctx.currentTime, 0.05)
        },
        /** Volume and level changes from the panel */
        update() {
            if (!ctx) return
            master!.gain.setTargetAtTime(get().on && !muted ? get().volume : 0, ctx.currentTime, 0.05)
            water?.level.gain.setTargetAtTime(0.12 * get().waves, ctx.currentTime, 0.3)
        },
        /** Resolves once audio is running and the recordings are decoded, or after at
            most `max` seconds, whichever comes first */
        ready(max = 1) {
            setup()
            const running = ctx!.resume().catch(() => {})
            return Promise.race([Promise.all([running, loaded]), new Promise((r) => setTimeout(r, max * 1000))]).then(() => {})
        },
        pause() {
            if (ctx?.state === "running") ctx.suspend()
        },
        resume() {
            if (ctx?.state === "suspended") ctx.resume().catch(() => {})
        },
        close() {
            window.removeEventListener("pointerdown", unlock)
            window.removeEventListener("keydown", unlock)
            window.removeEventListener("touchend", unlock)
            window.removeEventListener("click", unlock)
            water?.stop(ctx?.currentTime ?? 0)
            ctx?.close().catch(() => {})
            ctx = undefined
        },
    }
}
