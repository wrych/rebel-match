<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DAYS_PER_JOB, jobOf } from '../../src/game/levels'
import SavedTick from '../components/SavedTick.vue'
import { fetchConfig } from '../lib/api'
import { jobName, shareName, type GameState } from '../lib/game'

/** The office's lobby: who the player is, where they stand, the sharing
 * switch, and which job to play from (R-GAME-15, R-GAME-16). */
const props = defineProps<{ game: GameState; lastDay: string | null }>()
const emit = defineEmits<{ start: [level: number]; shared: [on: boolean] }>()

const chosen = ref(props.game.resumeLevel)
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

  <fieldset v-if="starts.length > 1" class="stack-tight rule">
    <legend class="kicker">Play from</legend>
    <label v-for="level in starts" :key="level" class="check">
      <input v-model="chosen" type="radio" name="start" :value="level" />
      <span>{{ describe(level) }}</span>
    </label>
  </fieldset>

  <button type="button" class="btn btn-dark" @click="emit('start', chosen)">
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

fieldset {
  border: 0;
  margin: 0;
  padding: 0;
}
</style>
