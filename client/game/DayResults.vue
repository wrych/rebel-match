<script setup lang="ts">
import { computed } from 'vue'
import { LAST_BOSS_LEVEL } from '../../src/game/levels'
import type { DayResult } from '../lib/game'

/** How a day went, where the best stands, and what next (R-GAME-8,
 * R-GAME-14). */
const props = defineProps<{
  level: number
  outcome: 'won' | 'lost'
  score: number
  seconds: number
  result: DayResult
}>()
const emit = defineEmits<{
  share: []
  next: []
  retry: []
  leave: []
  rebel: []
  ask: []
}>()

const SECONDS_PER_MINUTE = 60
const won = computed(() => props.outcome === 'won')
const ceo = computed(() => won.value && props.level === LAST_BOSS_LEVEL)
const sharePrompt = computed(
  () => props.result.newBest && !props.result.state.shared,
)
const headline = computed(() => {
  if (won.value) return '17:00. Home time.'
  return props.level > LAST_BOSS_LEVEL
    ? 'The office turned grey.'
    : 'The rebels took over. Honestly? Good.'
})
const tally = computed(() =>
  props.level > LAST_BOSS_LEVEL
    ? `People helped: ${String(props.score)}`
    : `Spirits crushed: ${String(props.score)}`,
)
const time = computed(() => {
  const minutes = Math.floor(props.seconds / SECONDS_PER_MINUTE)
  const seconds = props.seconds % SECONDS_PER_MINUTE
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`
})
const place = computed(() => {
  const at = props.result.place
  return at === null
    ? 'Win a day to join the leaderboard.'
    : `Your best stands at #${String(at.position)} of ${String(at.of)}.`
})
</script>

<template>
  <section class="results card stack-tight" aria-labelledby="results-title">
    <template v-if="ceo">
      <p class="kicker kicker-accent">CEO, day 3</p>
      <h2 id="results-title" class="display display-lg">
        Every spirit crushed. The board is thrilled.
      </h2>
      <div class="screen-glow" aria-hidden="true">CR</div>
      <p>Your own screen just turned colourful.</p>
    </template>
    <template v-else>
      <p class="kicker kicker-accent">{{ won ? 'Day won' : 'Day lost' }}</p>
      <h2 id="results-title" class="display display-lg">
        {{ headline }}
      </h2>
    </template>

    <p class="mono">{{ tally }} · {{ time }}</p>
    <p>
      {{ place }}
      <RouterLink to="/9torevolution/leaderboard">Leaderboard</RouterLink>
    </p>

    <div class="buttons">
      <template v-if="ceo">
        <button type="button" class="btn btn-dark" @click="emit('rebel')">
          Be a rebel
        </button>
        <button type="button" class="btn btn-ghost" @click="emit('ask')">
          Continue
        </button>
      </template>
      <template v-else-if="!won">
        <button type="button" class="btn btn-dark" @click="emit('retry')">
          Retry
        </button>
        <button type="button" class="btn btn-ghost" @click="emit('leave')">
          Leave
        </button>
      </template>
      <template v-else>
        <button
          v-if="sharePrompt"
          type="button"
          class="btn btn-dark"
          @click="emit('share')"
        >
          Share and continue
        </button>
        <button
          type="button"
          :class="sharePrompt ? 'btn btn-ghost' : 'btn btn-dark'"
          @click="emit('next')"
        >
          Continue
        </button>
        <button type="button" class="btn btn-ghost" @click="emit('leave')">
          Leave
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.buttons {
  display: grid;
  gap: 0.5rem;
}

.screen-glow {
  justify-self: center;
  display: grid;
  place-items: center;
  width: 7rem;
  height: 4.5rem;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--accent), var(--door), var(--token));
  color: #fff;
  font-family: var(--font-display);
  font-size: 2rem;
}
</style>
