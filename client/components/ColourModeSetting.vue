<script setup lang="ts">
/** The profile screen's switch between the calm default and happy mode,
 * remembered for this browser only (R-LOOK-2). */
import { ref } from 'vue'
import { applyMood, currentMood } from '../lib/mood'
import SavedTick from './SavedTick.vue'

const props = defineProps<{ tickMs: number }>()

const ticked = ref(false)
let tickTimer: ReturnType<typeof setTimeout> | undefined

function change(event: Event): void {
  applyMood((event.target as HTMLInputElement).checked ? 'happy' : 'calm')
  ticked.value = true
  clearTimeout(tickTimer)
  tickTimer = setTimeout(() => {
    ticked.value = false
  }, props.tickMs)
}
</script>

<template>
  <section class="stack-tight rule" aria-labelledby="colour-mode-heading">
    <div class="head">
      <h2 id="colour-mode-heading" class="kicker">Colour mode</h2>
      <SavedTick :shown="ticked" />
    </div>
    <label class="check">
      <input
        type="checkbox"
        role="switch"
        :checked="currentMood === 'happy'"
        @change="change"
      />
      <span>Happy colour mode</span>
    </label>
    <p class="small">Kept in this browser only, and never sent to us.</p>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}
</style>
