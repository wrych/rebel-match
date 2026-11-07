<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchConfig } from '../lib/api'
import { saveFindable } from '../lib/profile'
import SavedTick from './SavedTick.vue'

const props = defineProps<{ findable: boolean; codesOn?: boolean }>()

const checked = ref(props.findable)
const tickMs = ref(0)
let tickTimer: ReturnType<typeof setTimeout> | undefined
const saving = ref(false)
const savedShown = ref(false)
const problem = ref<string | null>(null)

onMounted(async () => {
  try {
    tickMs.value = (await fetchConfig()).limits.savedTickMs
  } catch {
    tickMs.value = 0
  }
})

async function change(): Promise<void> {
  const wanted = checked.value
  saving.value = true
  savedShown.value = false
  problem.value = null
  try {
    await saveFindable(wanted)
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
  <section class="stack-tight rule" aria-labelledby="findable-heading">
    <div class="head">
      <h2 id="findable-heading" class="kicker">Search</h2>
      <SavedTick :shown="savedShown" />
    </div>
    <label class="check">
      <input
        v-model="checked"
        type="checkbox"
        :disabled="saving"
        @change="change"
      />
      <span>Findable in search</span>
    </label>
    <p class="small">
      Other members can find you by your name, organization, job title or
      sector, and ask to connect. Your email stays private until you accept.
    </p>
    <p v-if="props.codesOn" class="small">
      Turned off, others can still reach you through a connect code you show or
      share. Your profile code is turned off separately, below.
    </p>
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
