export type Mood = 'calm' | 'happy'

const MOOD_KEY = 'rm_mood'

/** The colour mode this browser chose last, calm unless it chose happy. A
 * browser refusing storage simply starts calm. */
export function savedMood(): Mood {
  try {
    return localStorage.getItem(MOOD_KEY) === 'happy' ? 'happy' : 'calm'
  } catch {
    return 'calm'
  }
}

/** Shows a colour mode and remembers it for this browser. */
export function applyMood(mood: Mood): void {
  document.documentElement.dataset['mood'] = mood
  try {
    localStorage.setItem(MOOD_KEY, mood)
  } catch {
    // Storage refused: the mode holds for this page only.
  }
}
