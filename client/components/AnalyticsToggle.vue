<script setup lang="ts">
import { computed, ref } from 'vue'
import { chooseAnalytics } from '../lib/analytics-consent'
import { useConfig } from '../lib/config'
import { forgetMe } from '../lib/session'
import AnalyticsWords from './AnalyticsWords.vue'
import SavedTick from './SavedTick.vue'

const props = defineProps<{ optedIn: boolean }>()

const checked = ref(props.optedIn)
let tickTimer: ReturnType<typeof setTimeout> | undefined
const saving = ref(false)
const savedShown = ref(false)
const problem = ref<string | null>(null)
const loaded = useConfig(
  (config) => ({
    version: config.analyticsVersion,
    tickMs: config.limits.savedTickMs,
  }),
  null,
  problem,
  'This setting could not be loaded. Reload to try again.',
)
const version = computed(() => loaded.value?.version ?? null)
const tickMs = computed(() => loaded.value?.tickMs ?? 0)

async function change(): Promise<void> {
  if (version.value === null) return
  const wanted = checked.value
  saving.value = true
  savedShown.value = false
  problem.value = null
  try {
    const outcome = await chooseAnalytics(wanted, version.value)
    if (outcome === 'stale') {
      checked.value = !wanted
      problem.value = 'The wording has just changed. Reload to read it.'
      return
    }
    forgetMe()
    savedShown.value = true
    clearTimeout(tickTimer)
    tickTimer = setTimeout(() => {
      savedShown.value = false
    }, tickMs.value)
  } catch {
    checked.value = !wanted
    problem.value = 'That did not save. Try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="stack-tight rule" aria-labelledby="usage-heading">
    <div class="head">
      <h2 id="usage-heading" class="kicker">Usage data</h2>
      <SavedTick :shown="savedShown" />
    </div>
    <label class="check">
      <input
        v-model="checked"
        type="checkbox"
        :disabled="saving || version === null"
        @change="change"
      />
      <span>Help improve Rebel Match (optional data collection)</span>
    </label>
    <details v-if="version">
      <summary class="small">What this means</summary>
      <AnalyticsWords :version="version" />
    </details>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
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
