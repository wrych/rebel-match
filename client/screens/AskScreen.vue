<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
import { fetchConfig } from '../lib/api'
import { challengeExamples, submitChallenge } from '../lib/challenges'

const router = useRouter()
const draft = ref('')
const minChars = ref<number | null>(null)
const sending = ref(false)
const problem = ref<string | null>(null)

// The server trims before it counts, so the counter does too (R-CFG-2).
const length = computed(() => draft.value.trim().length)
const ready = computed(
  () =>
    minChars.value !== null && length.value >= minChars.value && !sending.value,
)

onMounted(async () => {
  try {
    minChars.value = (await fetchConfig()).limits.challengeMinChars
  } catch {
    problem.value = 'The form could not be loaded. Reload to try again.'
  }
})

async function submit(): Promise<void> {
  if (!ready.value) return
  sending.value = true
  problem.value = null
  try {
    const challenge = await submitChallenge(draft.value)
    await router.push(`/challenges/${encodeURIComponent(challenge.id)}`)
  } catch {
    problem.value = 'That did not save. Try again.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <AskSteps :current="1" />
  <section class="screen">
    <div class="stack">
      <h1 class="display display-lg">What’s your challenge?</h1>
      <p id="challenge-hint" class="lede">
        One challenge, in your own words. Be specific: what do you observe, what
        do you want to change, and where are you struggling?
      </p>
    </div>

    <form class="stack" @submit.prevent="submit">
      <div class="field">
        <label for="challenge">Your challenge</label>
        <textarea
          id="challenge"
          v-model="draft"
          class="input"
          rows="8"
          aria-describedby="challenge-hint challenge-count"
        ></textarea>
        <p id="challenge-count" class="footnote" aria-live="polite">
          {{ length }} characters<template v-if="minChars !== null">
            · at least {{ minChars }}</template
          >
        </p>
      </div>
      <button type="submit" class="btn btn-primary" :disabled="!ready">
        Submit
      </button>
      <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    </form>

    <section class="stack-tight rule" aria-labelledby="examples-heading">
      <h2 id="examples-heading" class="kicker">Examples</h2>
      <ul class="hints">
        <li v-for="example in challengeExamples" :key="example">
          {{ example }}
        </li>
      </ul>
    </section>
  </section>
</template>
