// The contract every interactive experiment follows. An experiment is a plain module
// with no framework: art/facts and Framer each wrap it in a few lines, so one source
// feeds both sites.
export interface Experiment {
    /** Stop animating (off screen, tab hidden). Keep state. */
    pause(): void
    /** Pick up where pause() left off. */
    resume(): void
    /** Tear down for good: cancel frames, remove listeners, close audio, end workers. */
    stop(): void
    /** Optional: play an exit (a loader's reveal out); resolves when it's done. */
    out?(): Promise<void>
    /** Optional: fade the sound out over `seconds`; resolves when it is silent */
    fade?(seconds: number): Promise<void>
}

export type Mount<Options = Record<string, unknown>> = (
    canvas: HTMLCanvasElement,
    options?: Partial<Options>
) => Experiment
