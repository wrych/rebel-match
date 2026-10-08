<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { DAYS_PER_JOB, jobOf } from '../../src/game/levels'
import SavedTick from '../components/SavedTick.vue'
import { fetchConfig } from '../lib/api'
import { jobName, shareName, type GameState } from '../lib/game'
import { allHints, hintWords } from './hints'

/** The office's lobby: who the player is, where they stand, the sharing
 * switch, which job to play from, and how to play (R-GAME-15, R-GAME-16,
 * R-GAME-18). */
const props = defineProps<{
  game: GameState
  lastDay: string | null
  /** Turning the phone starts a day, rather than a button (ADR 0046). */
  touch: boolean
  dayUnderWay: boolean
  /** A finished day whose results card waits on the phone's side. */
  resultsWaiting: boolean
}>()
const emit = defineEmits<{
  start: [level: number]
  choose: [level: number]
  leaveDay: []
  back: []
  shared: [on: boolean]
}>()

const chosen = ref(props.game.resumeLevel)
watch(chosen, (level) => {
  emit('choose', level)
})
const saving = ref(false)
const savedShown = ref(false)
const problem = ref<string | null>(null)
const tickMs = ref<number | null>(null)
let tickTimer: ReturnType<typeof setTimeout> | undefined

function describe(level: number): string {
  const job = jobOf(level)
  if (job === 'rebel') return `Rebel · level ${String(level)}`
  const day = ((level - 1) % DAYS_PER_JOB) + 1
  return `${jobName(job)}, day ${String(day)} · level ${String(level)}`
}

const starts = computed(() => {
  const levels = new Set([...props.game.playFrom, props.game.resumeLevel])
  return [...levels].sort((a, b) => a - b)
})

function tick(): void {
  if (tickMs.value === null) return
  savedShown.value = true
  clearTimeout(tickTimer)
  tickTimer = setTimeout(() => {
    savedShown.value = false
  }, tickMs.value)
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
  emit('shared', wanted)
  tick()
}

onMounted(async () => {
  try {
    tickMs.value = (await fetchConfig()).limits.savedTickMs
  } catch {
    tickMs.value = null
  }
})
</script>

<template>
  <div class="card stack-tight">
    <p class="mono">You play as</p>
    <p class="display display-md">{{ game.pseudonym }}</p>
    <p>Next: {{ describe(game.resumeLevel) }}</p>
    <p v-if="game.best" class="small">Your best: level {{ game.best.level }}</p>
  </div>

  <p v-if="lastDay" class="lede" role="status">{{ lastDay }}</p>
  <p v-if="problem" class="alert" role="alert">{{ problem }}</p>

  <div v-if="dayUnderWay" class="card stack-tight" role="status">
    <p>Your day is paused. Turn your phone sideways to carry on.</p>
    <button type="button" class="btn btn-ghost" @click="emit('leaveDay')">
      Leave the day
    </button>
  </div>

  <div v-if="resultsWaiting" class="card stack-tight" role="status">
    <p>Your day is over. Turn your phone sideways to see how it went.</p>
    <button type="button" class="btn btn-ghost" @click="emit('back')">
      Back to the office
    </button>
  </div>

  <fieldset
    v-if="starts.length > 1 && !dayUnderWay && !resultsWaiting"
    class="stack-tight rule"
  >
    <legend class="kicker">Play from</legend>
    <label v-for="level in starts" :key="level" class="check">
      <input v-model="chosen" type="radio" name="start" :value="level" />
      <span>{{ describe(level) }}</span>
    </label>
  </fieldset>

  <p v-if="touch && !dayUnderWay && !resultsWaiting" class="lede">
    Turn your phone sideways to start the day.
  </p>
  <button
    v-else-if="!dayUnderWay && !resultsWaiting"
    type="button"
    class="btn btn-dark"
    @click="emit('start', chosen)"
  >
    Start the day
  </button>

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
      Off, the board shows {{ game.pseudonym }} instead, and nobody can tell it
      is you.
    </p>
  </div>

  <details class="rule">
    <summary class="kicker">How to play</summary>
    <div class="stack-tight">
      <section v-for="hint in allHints" :key="hint">
        <h2 class="small-head">{{ hintWords(hint).title }}</h2>
        <p class="small">{{ hintWords(hint).text }}</p>
      </section>
    </div>
  </details>

  <RouterLink to="/9torevolution/leaderboard" class="btn btn-ghost"
    >Leaderboard</RouterLink
  >
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

summary {
  cursor: pointer;
}

.small-head {
  font-size: 1rem;
  margin: 0;
}

fieldset {
  border: 0;
  margin: 0;
  padding: 0;
}
</style>
