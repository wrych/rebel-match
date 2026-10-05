/** Calls `onHold` when a pointer stays down for `holdMs()`; `held()` then
 * says whether the next click ends that hold, so it can be ignored (R-MEM-3). */
export function longPress(
  onHold: () => void,
  holdMs: () => number,
): {
  start: () => void
  release: () => void
  abandon: () => void
  held: () => boolean
} {
  let timer: ReturnType<typeof setTimeout> | undefined
  let fired = false
  let down = false
  return {
    start: () => {
      fired = false
      down = true
      clearTimeout(timer)
      timer = setTimeout(() => {
        fired = true
        onHold()
      }, holdMs())
    },
    release: () => {
      clearTimeout(timer)
      down = false
    },
    abandon: () => {
      clearTimeout(timer)
      // Leaving while pressed means no click follows. Touch reports leaving
      // only after the release, and that click must still end the hold.
      if (down) fired = false
      down = false
    },
    held: () => {
      const was = fired
      fired = false
      return was
    },
  }
}
