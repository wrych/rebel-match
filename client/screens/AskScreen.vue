<script setup lang="ts">
import { pathTo } from '../../src/routes'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
import { useAction } from '../lib/action'
import { askJourney } from '../lib/steps'
import NewestChallenges from '../components/NewestChallenges.vue'
import { useConfig } from '../lib/config'
import {
  fetchNewestChallenges,
  submitChallenge,
  type NewestChallenge,
} from '../lib/challenges'

const router = useRouter()
const draft = ref('')
const problem = ref<string | null>(null)
const limits = useConfig(
  (config) => ({
    min: config.limits.challengeMinChars,
    max: config.limits.challengeMaxChars,
  }),
  null,
  problem,
  'The form could not be loaded. Reload to try again.',
)
const { busy: sending, run } = useAction(problem)
const lastSubmitted = ref<NewestChallenge[]>([])

// The server trims before it counts, so the counter does too (R-CFG-2).
const length = computed(() => draft.value.trim().length)
const ready = computed(
  () =>
    limits.value !== null &&
    length.value >= limits.value.min &&
    length.value <= limits.value.max &&
    !sending.value,
)

// The last submitted list is a nicety: without it the form still works, so a
// failure only leaves the section out.
async function loadLastSubmitted(): Promise<void> {
  try {
    lastSubmitted.value = await fetchNewestChallenges()
  } catch {
    lastSubmitted.value = []
  }
}

onMounted(() => {
  void loadLastSubmitted()
})

async function submit(): Promise<void> {
  if (!ready.value) return
  problem.value = null
  await run(async () => {
    const challenge = await submitChallenge(draft.value)
    await router.push(pathTo('challenge', { id: challenge.id }))
  }, 'That did not save. Try again.')
}
</script>

<template>
  <AskSteps :journey="askJourney" :current="1" />
  <section class="screen">
    <div class="stack">
      <h1 class="display display-lg">What’s your challenge?</h1>
      <p id="challenge-hint" class="lede">
        One challenge, in your own words.<br />
        Be specific: what do you observe, what do you want to change, and where
        are you struggling?
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
          :maxlength="limits?.max"
          aria-describedby="challenge-hint challenge-count"
        ></textarea>
        <p id="challenge-count" class="footnote" aria-live="polite">
          {{ length }} characters<template v-if="limits">
            · {{ limits.min }} to {{ limits.max }}</template
          >
        </p>
      </div>
      <button type="submit" class="btn btn-primary" :disabled="!ready">
        Submit
      </button>
      <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    </form>

    <section
      v-if="lastSubmitted.length > 0"
      class="stack-tight rule"
      aria-labelledby="last-submitted-heading"
    >
      <h2 id="last-submitted-heading" class="kicker kicker-ink">
        Last submitted
      </h2>
      <NewestChallenges :challenges="lastSubmitted" />
    </section>
  </section>
</template>
