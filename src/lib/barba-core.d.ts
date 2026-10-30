// @barba/core points "types" at a folder without an index, so declare the slice we use
declare module "@barba/core" {
    interface Page {
        container: HTMLElement
        html: string
        url: { href: string }
    }
    interface Data {
        current: Page
        next: Page
        trigger: Element | "popstate" | "back" | "forward" | "barba"
    }
    type Hook = (fn: (data?: Data) => void | Promise<void>) => void
    const barba: {
        hooks: { before: Hook; afterLeave: Hook; beforeEnter: Hook; afterEnter: Hook }
        init(options: {
            timeout?: number
            prevent?: (args: { href: string }) => boolean
            transitions: object[]
        }): void
    }
    export default barba
}
