// Safari's own pinch events, which it fires whatever the page's CSS says.
const GESTURES = ['gesturestart', 'gesturechange', 'gestureend'] as const

const cancel = (event: Event): void => {
  event.preventDefault()
}

// A second finger on the screen starts a pinch.
const cancelPinch = (event: TouchEvent): void => {
  if (event.touches.length > 1) event.preventDefault()
}

/** Stops pinching and double-tapping from zooming the page, as iOS Safari
 * ignores the viewport's say on zoom; returns what lets zoom go again. The
 * game holds it while it shows (R-GAME-12). */
export function holdZoom(): () => void {
  for (const name of GESTURES) document.addEventListener(name, cancel)
  document.addEventListener('touchmove', cancelPinch, { passive: false })
  document.addEventListener('dblclick', cancel)
  return () => {
    for (const name of GESTURES) document.removeEventListener(name, cancel)
    document.removeEventListener('touchmove', cancelPinch)
    document.removeEventListener('dblclick', cancel)
  }
}
