<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AnalyticsWords from '../components/AnalyticsWords.vue'
import AskSteps from '../components/AskSteps.vue'
import DoneNotice from '../components/DoneNotice.vue'
import { chooseAnalytics } from '../lib/analytics-consent'
import { fetchConfig } from '../lib/api'
import { afterOnboarding } from '../lib/onboarding'
import { forgetMe } from '../lib/session'
import { onboardingJourney } from '../lib/steps'

const route = useRoute()
const router = useRouter()
const version = ref<string | null>(null)
const sending = ref(false)
const problem = ref<string | null>(null)

const next = computed(() => {
  const given = route.query['next']
  return typeof given === 'string' ? given : null
})

onMounted(async () => {
  try {
    version.value = (await fetchConfig()).analyticsVersion
  } catch {
    problem.value = 'This step could not be loaded. Reload to try again.'
  }
})

async function share(): Promise<void> {
  if (version.value === null) return
  sending.value = true
  problem.value = null
  try {
    const outcome = await chooseAnalytics(true, version.value, 'onboarding')
    if (outcome === 'stale') {
      problem.value = 'The wording has just changed. Reload to read it.'
      return
    }
    forgetMe()
    await router.replace(afterOnboarding(next.value))
  } catch {
    problem.value = 'That did not save. Try again.'
  } finally {
    sending.value = false
  }
}

async function decline(): Promise<void> {
  await router.replace(afterOnboarding(next.value))
}
</script>

<template>
  <AskSteps :journey="onboardingJourney" :current="3" />
  <section class="screen">
    <DoneNotice>
      <strong>Profile saved.</strong> You can always edit it under
      <RouterLink to="/profile">Profile &amp; privacy</RouterLink>, in the menu.
    </DoneNotice>

    <div class="stack-tight">
      <h1 class="display display-lg">Share usage data?</h1>
      <p class="lede">
        This is optional. Rebel Match works the same either way.
      </p>
    </div>

    <template v-if="version">
      <AnalyticsWords :version="version" />

      <div class="stack-tight">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="sending"
          @click="share"
        >
          Share usage data
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="sending"
          @click="decline"
        >
          No thanks
        </button>
      </div>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
