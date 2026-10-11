let played = false

/** Whether the sign-in screen plays the mark's intro now: once per page load,
 * and never for a member who prefers reduced motion (R-LOOK-5). */
export function takeIntro(reducedMotion: boolean): boolean {
  if (played || reducedMotion) return false
  played = true
  return true
}

/** Whether this browser asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
