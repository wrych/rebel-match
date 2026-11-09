import { ref } from 'vue'

export type Mood = 'calm' | 'happy'

const MOOD_KEY = 'rm_mood'
const ICONS: Record<Mood, string> = {
  calm: '/favicon.svg',
  happy: '/favicon-happy.svg',
}

let choices = 0

/** The colour mode this browser chose last, or null when it never chose or
 * refuses storage. */
export function savedMood(): Mood | null {
  try {
    const saved = localStorage.getItem(MOOD_KEY)
    return saved === 'happy' || saved === 'calm' ? saved : null
  } catch {
    return null
  }
}

/** The colour mode shown now, for any screen that depends on it. */
export const currentMood = ref<Mood>('calm')

function showMood(mood: Mood): void {
  currentMood.value = mood
  document.documentElement.dataset['mood'] = mood
  document
    .querySelector<HTMLLinkElement>('link[rel="icon"]')
    ?.setAttribute('href', ICONS[mood])
}

/** Shows a colour mode the member chose and remembers it for this browser. */
export function applyMood(mood: Mood): void {
  choices += 1
  showMood(mood)
  try {
    localStorage.setItem(MOOD_KEY, mood)
  } catch {
    // Storage refused: the mode holds for this page only.
  }
}

/** Shows the mode this browser chose, or else calm until the hosts' default
 * arrives, without storing it as a choice (R-LOOK-2, R-LOOK-6). */
export async function startMood(
  hostsDefault: () => Promise<Mood>,
): Promise<void> {
  const saved = savedMood()
  showMood(saved ?? 'calm')
  if (saved !== null) return
  const choicesBefore = choices
  const mood = await hostsDefault().catch((): Mood => 'calm')
  if (choices === choicesBefore) showMood(mood)
}
