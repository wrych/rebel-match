<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
import ConsentWords from '../components/ConsentWords.vue'
import { fetchConfig } from '../lib/api'
import {
  afterOnboarding,
  completeOnboarding,
  fetchDraft,
  forgetTyped,
  onboardingSteps,
  stepPath,
  typedProfile,
  type OnboardingDraft,
  type TypedProfile,
} from '../lib/onboarding'
import { forgetMe, loadMe } from '../lib/session'
import { onboardingJourney } from '../lib/steps'

const route = useRoute()
const router = useRouter()
const consentVersion = ref<string | null>(null)
const profile = ref<TypedProfile | null>(null)
const alreadyShares = ref(false)
const hintShare = ref<number | null>(null)
const confirm = ref<HTMLButtonElement | null>(null)
const confirmInView = ref(true)
const sending = ref(false)
const problem = ref<string | null>(null)
let observer: IntersectionObserver | undefined

const next = computed(() => {
  const given = route.query['next']
  return typeof given === 'string' ? given : null
})
const showHint = computed(
  () => hintShare.value !== null && !confirmInView.value,
)

function storedProfile(draft: OnboardingDraft): TypedProfile | null {
  if (draft.name === null) return null
  return {
    name: draft.name,
    jobTitle: draft.jobTitle ?? '',
    org: draft.org ?? '',
    sector: draft.sector ?? '',
    companySize: draft.companySize ?? '',
  }
}

onMounted(async () => {
  try {
    const [draft, config, me] = await Promise.all([
      fetchDraft(),
      fetchConfig(),
      loadMe(),
    ])
    profile.value = typedProfile() ?? storedProfile(draft)
    if (profile.value === null) {
      await router.replace(stepPath(onboardingSteps.profile, next.value))
      return
    }
    consentVersion.value = draft.consentVersion
    hintShare.value = config.limits.scrollHintShare
    alreadyShares.value = me?.analyticsOptIn ?? false
  } catch {
    problem.value = 'The summary could not be loaded. Reload to try again.'
  }
})

// The hint follows the button: shown while it is out of view, gone once it
// shows (R-ONB-10). Without IntersectionObserver there is no hint.
watch(confirm, (button) => {
  observer?.disconnect()
  if (button === null || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(([entry]) => {
    confirmInView.value = entry?.isIntersecting ?? true
  })
  observer.observe(button)
})

onBeforeUnmount(() => observer?.disconnect())

function nudge(): void {
  if (hintShare.value === null) return
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollBy({
    top: window.innerHeight * hintShare.value,
    behavior: still ? 'auto' : 'smooth',
  })
}

async function reloadWords(): Promise<void> {
  try {
    consentVersion.value = (await fetchDraft()).consentVersion
  } catch {
    problem.value = 'The new words could not be loaded. Reload to try again.'
  }
}

async function onwards(): Promise<void> {
  forgetTyped()
  forgetMe()
  await router.push(
    alreadyShares.value
      ? afterOnboarding(next.value)
      : stepPath(onboardingSteps.usage, next.value),
  )
}

async function confirmRead(): Promise<void> {
  if (profile.value === null || consentVersion.value === null) return
  sending.value = true
  problem.value = null
  try {
    const outcome = await completeOnboarding({
      ...profile.value,
      consentVersion: consentVersion.value,
    })
    if (outcome === 'stale') {
      problem.value = 'The words have just changed. Please read them again.'
      await reloadWords()
      return
    }
    await onwards()
  } catch {
    problem.value = 'That did not save. Try again.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <AskSteps :journey="onboardingJourney" :current="2" />
  <section class="screen">
    <div class="stack-tight">
      <h1 class="display display-lg">How we use your data</h1>
      <p class="lede">
        A short summary. The full privacy notice is linked below.
      </p>
    </div>

    <template v-if="consentVersion">
      <ConsentWords :version="consentVersion" />

      <div class="stack-tight">
        <RouterLink to="/privacy" class="row-link">
          <span class="row-link-label">Read the full privacy notice</span>
        </RouterLink>
        <RouterLink to="/terms" class="row-link">
          <span class="row-link-label">Read the full terms of use</span>
        </RouterLink>
      </div>

      <div class="stack-tight">
        <button
          ref="confirm"
          type="button"
          class="btn btn-primary"
          :disabled="sending"
          @click="confirmRead"
        >
          I have read the privacy notice and the terms of use
        </button>
        <p class="small saves">
          Your profile is saved when you tap this button.
        </p>
      </div>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>

  <button
    v-if="showHint"
    type="button"
    class="btn btn-dark hint"
    aria-label="Scroll down"
    @click="nudge"
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M5 9l7 7 7-7" />
    </svg>
  </button>
</template>

<style scoped>
.saves {
  text-align: center;
}

.hint {
  position: fixed;
  bottom: 1.25rem;
  left: 50%;
  width: 3.25rem;
  min-height: 3.25rem;
  padding: 0;
  border: 2px solid var(--paper);
  transform: translateX(-50%);
  box-shadow: 0 6px 16px rgb(17 16 16 / 30%);
}

.hint:active:not(:disabled) {
  transform: translateX(-50%) translateY(1px);
}
</style>
