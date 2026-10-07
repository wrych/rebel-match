<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DAYS_PER_JOB, jobOf } from '../../src/game/levels'
import HappyOnly from '../components/HappyOnly.vue'
import SavedTick from '../components/SavedTick.vue'
import { fetchConfig } from '../lib/api'
import PlayView from '../game/PlayView.vue'
import {
  fetchGame,
  jobName,
  recordDay,
  shareName,
  type GameState,
} from '../lib/game'
import { currentMood } from '../lib/mood'

const route = useRoute()
const router = useRouter()
const game = ref<GameState | null>(null)
const problem = ref<string | null>(null)
const saving = ref(false)
const savedShown = ref(false)
const tickMs = ref<number | null>(null)
const playing = ref<{ level: number; seed: number } | null>(null)
const lastDay = ref<string | null>(null)

const SEED_RANGE = 0x7fffffff

function start(): void {
  if (game.value === null) return
  lastDay.value = null
  void document.documentElement.requestFullscreen?.().catch(() => undefined)
  playing.value = {
    level: game.value.resumeLevel,
    seed: Math.floor(Math.random() * SEED_RANGE),
  }
}

// The day is recorded whatever happened, and the lobby shows where the
// player now stands (R-GAME-14, R-GAME-16).
async function finish(
  outcome: 'won' | 'lost' | 'abandoned',
  seconds: number,
): Promise<void> {
  const level = playing.value?.level ?? 1
  playing.value = null
  if (document.fullscreenElement)
    void document.exitFullscreen().catch(() => undefined)
  try {
    const result = await recordDay({ level, outcome, playSeconds: seconds })
    if (result === null) {
      problem.value = 'The office has closed.'
      game.value = null
      return
    }
    game.value = result.state
    lastDay.value =
      outcome === 'won' ? 'Day won.' : outcome === 'lost' ? 'Day lost.' : null
  } catch {
    problem.value = 'That day could not be recorded.'
  }
}
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

        <p v-if="lastDay" class="lede" role="status">{{ lastDay }}</p>
        <button type="button" class="btn btn-dark" @click="start">
          Start the day
        </button>
        <RouterLink to="/9torevolution/leaderboard" class="btn btn-ghost"
          >Leaderboard</RouterLink
        >
      </template>
    </section>
  </HappyOnly>
  <PlayView
    v-if="playing && game"
    :level="playing.level"
    :seed="playing.seed"
    :tuning="game.tuning"
    @ended="finish($event.outcome, $event.seconds)"
    @leave="finish('abandoned', $event)"
  />
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
</style>
