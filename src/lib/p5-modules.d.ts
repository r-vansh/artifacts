// p5 exports "p5/core" and "p5/math" without types; the class is the one "p5" declares, and an
// addon is a function p5.registerAddon() takes
declare module "p5/core" {
    import p5 from "p5"
    export default p5
}
declare module "p5/math" {
    const math: (p5: unknown) => void
    export default math
}
