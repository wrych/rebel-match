/** Calls `onHold` when a pointer stays down on an element for `holdMs()`;
 * `held()` then says whether the click that follows ends that hold, so it
 * can be ignored (R-MEM-3). Releasing stops the timer. Leaving the element,
 * or a cancelled pointer, while still pressed forgets the hold, as no click
 * will follow; touch reports leaving after the release, which keeps it. */
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
