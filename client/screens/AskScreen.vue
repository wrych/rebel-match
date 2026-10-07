<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
import { askJourney } from '../lib/steps'
import NewestChallenges from '../components/NewestChallenges.vue'
import { fetchConfig } from '../lib/api'
import {
  fetchNewestChallenges,
  submitChallenge,
  type NewestChallenge,
} from '../lib/challenges'

const router = useRouter()
const draft = ref('')
const limits = ref<{ min: number; max: number } | null>(null)
const sending = ref(false)
const problem = ref<string | null>(null)
const inspiration = ref<NewestChallenge[]>([])

// The server trims before it counts, so the counter does too (R-CFG-2).
const length = computed(() => draft.value.trim().length)
const ready = computed(
  () =>
    limits.value !== null &&
    length.value >= limits.value.min &&
    length.value <= limits.value.max &&
    !sending.value,
)

// Inspiration is a nicety: without it the form still works, so a failure
// only leaves the section out.
async function loadInspiration(): Promise<void> {
  try {
    inspiration.value = await fetchNewestChallenges()
  } catch {
    inspiration.value = []
  }
}

onMounted(async () => {
  void loadInspiration()
  try {
    const config = await fetchConfig()
    limits.value = {
      min: config.limits.challengeMinChars,
      max: config.limits.challengeMaxChars,
    }
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
  <AskSteps :journey="askJourney" :current="1" />
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
      v-if="inspiration.length > 0"
      class="stack-tight rule"
      aria-labelledby="inspiration-heading"
    >
      <h2 id="inspiration-heading" class="kicker">Inspiration</h2>
      <NewestChallenges :challenges="inspiration" />
    </section>
  </section>
</template>
