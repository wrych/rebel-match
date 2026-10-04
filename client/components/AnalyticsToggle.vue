<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { chooseAnalytics } from '../lib/analytics-consent'
import { fetchConfig } from '../lib/api'
import { forgetMe } from '../lib/session'
import AnalyticsWords from './AnalyticsWords.vue'

const props = defineProps<{ optedIn: boolean }>()

const checked = ref(props.optedIn)
const version = ref<string | null>(null)
const saving = ref(false)
const status = ref<string | null>(null)
const problem = ref<string | null>(null)

onMounted(async () => {
  try {
    version.value = (await fetchConfig()).analyticsVersion
  } catch {
    problem.value = 'This setting could not be loaded. Reload to try again.'
  }
})

async function change(): Promise<void> {
  if (version.value === null) return
  const wanted = checked.value
  saving.value = true
  status.value = null
  problem.value = null
  try {
    const outcome = await chooseAnalytics(wanted, version.value)
    if (outcome === 'stale') {
      checked.value = !wanted
      problem.value = 'The wording has just changed. Reload to read it.'
      return
    }
    forgetMe()
    status.value = wanted
      ? 'Thanks: we now count how you use the app.'
      : 'Done: nothing about you is recorded any more.'
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
    <h2 id="usage-heading" class="kicker">Usage data</h2>
    <label class="check">
      <input
        v-model="checked"
        type="checkbox"
        :disabled="saving || version === null"
        @change="change"
      />
      <span>Count how I use the app.</span>
    </label>
    <details v-if="version">
      <summary class="small">What this means</summary>
      <AnalyticsWords :version="version" />
    </details>
    <p v-if="status" class="small" role="status">{{ status }}</p>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
