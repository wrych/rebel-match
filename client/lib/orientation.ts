import { ref, type Ref } from 'vue'

/** Whether the screen is touch first, where turning the phone is how the game
 * is entered and left (ADR 0046). */
export function touchScreen(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
}

const isLandscape = (): boolean => window.innerWidth > window.innerHeight

/** Whether the screen is wider than tall now, kept current as the phone
 * turns; `stop` ends the watching. */
export function watchLandscape(): {
  landscape: Ref<boolean>
  stop: () => void
} {
  const landscape = ref(isLandscape())
  const update = (): void => {
    landscape.value = isLandscape()
  }
  window.addEventListener('resize', update)
  window.addEventListener('orientationchange', update)
  return {
    landscape,
    stop: () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    },
  }
}
