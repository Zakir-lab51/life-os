import type { Transition, Variants } from "motion/react"

/*
  Shared motion, tuned to feel like Apple's interfaces: springs rather than fixed
  durations. `bounce` is how much a spring overshoots, `visualDuration` how long it
  feels. The CSS side of the same system (--ease-spring and friends) lives in the
  MOTION block of globals.css.
*/

/** The default: settles smoothly with a hint of overshoot. */
export const SPRING: Transition = { type: "spring", bounce: 0.15, visualDuration: 0.5 }
/** Quick feedback: highlighters, small swaps. */
export const SPRING_SNAPPY: Transition = { type: "spring", bounce: 0.12, visualDuration: 0.32 }
/** Playful: icons and small things that pop. */
export const SPRING_BOUNCY: Transition = { type: "spring", bounce: 0.32, visualDuration: 0.45 }

/** Tiles and page titles rise into place one after another (PageTransition staggers them). */
export const RISE: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING },
}
