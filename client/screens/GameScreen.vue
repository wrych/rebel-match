<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DAYS_PER_JOB, jobOf } from '../../src/game/levels'
import HappyOnly from '../components/HappyOnly.vue'
import SavedTick from '../components/SavedTick.vue'
import { fetchConfig } from '../lib/api'
import { fetchGame, jobName, shareName, type GameState } from '../lib/game'
import { currentMood } from '../lib/mood'

const route = useRoute()
const router = useRouter()
const game = ref<GameState | null>(null)
const problem = ref<string | null>(null)
const saving = ref(false)
const savedShown = ref(false)
const tickMs = ref<number | null>(null)
let tickTimer: ReturnType<typeof setTimeout> | undefined

const resume = computed(() => {
  const level = game.value?.resumeLevel ?? 1
  const job = jobOf(level)
  const day = job === 'rebel' ? level : ((level - 1) % DAYS_PER_JOB) + 1
  return { level, job: jobName(job), day: job === 'rebel' ? null : day }
})

async function load(): Promise<void> {
  try {
    game.value = await fetchGame()
    if (game.value === null)
      await router.replace({
        name: 'not-found',
        params: { pathMatch: route.path.slice(1).split('/') },
      })
  } catch {
    problem.value = 'The office could not be opened. Reload to try again.'
  }
}

function tick(): void {
  if (tickMs.value === null) return
  savedShown.value = true
  clearTimeout(tickTimer)
  tickTimer = setTimeout(() => {
    savedShown.value = false
  }, tickMs.value)
}

// Without the tick's length the choice still saves; only the tick is missing.
async function loadTickMs(): Promise<void> {
  try {
    tickMs.value = (await fetchConfig()).limits.savedTickMs
  } catch {
    tickMs.value = null
  }
}

async function toggleSharing(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const wanted = input.checked
  saving.value = true
  problem.value = null
  try {
    await shareName(wanted)
  } catch {
    input.checked = !wanted
    problem.value = 'That did not save. Try again.'
    return
  } finally {
    saving.value = false
  }
  if (game.value !== null) game.value = { ...game.value, shared: wanted }
  tick()
}

// Nothing is asked of the server, and no player made, until the member is
// in happy mode (R-GAME-1).
watch(
  currentMood,
  async (mood) => {
    if (mood === 'happy' && game.value === null)
      await Promise.all([load(), loadTickMs()])
  },
  { immediate: true },
)
</script>

<template>
  <HappyOnly>
    <section class="screen">
      <div class="stack">
        <p class="kicker kicker-accent">9toRevolution</p>
        <h1 class="display display-lg">The office</h1>
      </div>

      <p v-if="problem" class="alert" role="alert">{{ problem }}</p>

      <template v-if="game">
        <div class="card stack-tight">
          <p class="mono">You play as</p>
          <p class="display display-md">{{ game.pseudonym }}</p>
          <p>
            Next: {{ resume.job
            }}<template v-if="resume.day">, day {{ resume.day }}</template> ·
            level {{ resume.level }}
          </p>
          <p v-if="game.best" class="small">
            Your best: level {{ game.best.level }}
          </p>
        </div>

        <div class="stack-tight rule">
          <div class="head">
            <label class="check">
              <input
                type="checkbox"
                role="switch"
                :checked="game.shared"
                :disabled="saving"
                @change="toggleSharing"
              />
              <span>Show my name on the leaderboard</span>
            </label>
            <SavedTick :shown="savedShown" />
          </div>
          <p class="small">
            Off, the board shows {{ game.pseudonym }} instead, and nobody can
            tell it is you.
          </p>
        </div>

        <RouterLink to="/9torevolution/leaderboard" class="btn btn-ghost"
          >Leaderboard</RouterLink
        >
      </template>
    </section>
  </HappyOnly>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
</style>
