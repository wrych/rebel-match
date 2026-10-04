<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { consentWordsOf } from '../../src/consent'
import AnalyticsWords from '../components/AnalyticsWords.vue'
import { fetchConfig, type ClientConfig } from '../lib/api'
import {
  afterOnboarding,
  completeOnboarding,
  fetchDraft,
} from '../lib/onboarding'
import { forgetMe } from '../lib/session'

const router = useRouter()
const name = ref('')
const jobTitle = ref('')
const org = ref('')
// Not asked here, but sent back as given so saving never erases it.
const sector = ref('')
const accepted = ref(false)
const consentVersion = ref<string | null>(null)
// Optional and unticked unless they already opted in (R-ANA-4, ADR 0026).
const analytics = ref(false)
const analyticsVersion = ref<string | null>(null)
const limits = ref<ClientConfig['limits'] | null>(null)
const sending = ref(false)
const problem = ref<string | null>(null)

const consentWords = computed(() =>
  consentVersion.value === null ? [] : consentWordsOf(consentVersion.value),
)
const ready = computed(
  () =>
    name.value.trim() !== '' &&
    accepted.value &&
    consentWords.value.length > 0 &&
    !sending.value,
)

async function load(): Promise<void> {
  try {
    const [draft, config] = await Promise.all([fetchDraft(), fetchConfig()])
    name.value = draft.name ?? ''
    jobTitle.value = draft.jobTitle ?? ''
    org.value = draft.org ?? ''
    sector.value = draft.sector ?? ''
    consentVersion.value = draft.consentVersion
    analyticsVersion.value = draft.analyticsVersion
    analytics.value = draft.analyticsOptIn
    limits.value = config.limits
  } catch {
    problem.value = 'The form could not be loaded. Reload to try again.'
  }
}

// After a change of words only the words are new; what they typed stays.
async function reloadConsent(): Promise<void> {
  try {
    const draft = await fetchDraft()
    consentVersion.value = draft.consentVersion
    analyticsVersion.value = draft.analyticsVersion
  } catch {
    problem.value = 'The new terms could not be loaded. Reload to try again.'
  }
}

async function submit(): Promise<void> {
  if (consentVersion.value === null) return
  sending.value = true
  problem.value = null
  try {
    const outcome = await completeOnboarding({
      name: name.value,
      jobTitle: jobTitle.value,
      org: org.value,
      sector: sector.value,
      consentVersion: consentVersion.value,
      ...(analytics.value && analyticsVersion.value !== null
        ? { analyticsVersion: analyticsVersion.value }
        : {}),
    })
    if (outcome === 'stale') {
      accepted.value = false
      analytics.value = false
      problem.value = 'The terms have just changed. Please read them again.'
      await reloadConsent()
      return
    }
    forgetMe()
    const next = new URLSearchParams(window.location.search).get('next')
    await router.push(afterOnboarding(next))
  } catch {
    problem.value = 'That did not save. Try again.'
  } finally {
    sending.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">One minute, then you are in</p>
      <h1 class="display display-lg">Welcome to Rebel Match</h1>
      <p class="lede">
        Two things before you start: your name, and how we use your data.
      </p>
    </div>

    <form class="stack" @submit.prevent="submit">
      <div class="field">
        <label for="name">Your name</label>
        <input
          id="name"
          v-model="name"
          class="input"
          autocomplete="name"
          required
          :maxlength="limits?.nameMaxChars"
        />
      </div>
      <div class="field">
        <label for="job-title">Job title (optional)</label>
        <input
          id="job-title"
          v-model="jobTitle"
          class="input"
          autocomplete="organization-title"
          :maxlength="limits?.jobTitleMaxChars"
        />
      </div>
      <div class="field">
        <label for="org">Organization (optional)</label>
        <input
          id="org"
          v-model="org"
          class="input"
          autocomplete="organization"
          :maxlength="limits?.orgMaxChars"
        />
      </div>
      <p class="small">
        Your name, job title and organization appear on the cards other members
        see.
      </p>

      <section class="card-solid consent" aria-labelledby="consent-heading">
        <h2 id="consent-heading" class="kicker">How we use your data</h2>
        <p v-for="(paragraph, index) in consentWords" :key="index">
          {{ paragraph }}
        </p>
      </section>

      <label class="check">
        <input v-model="accepted" type="checkbox" />
        <span>I have read this and agree.</span>
      </label>

      <section
        v-if="analyticsVersion"
        class="stack-tight"
        aria-labelledby="usage-heading"
      >
        <h2 id="usage-heading" class="kicker">Usage data (optional)</h2>
        <AnalyticsWords :version="analyticsVersion" />
        <label class="check">
          <input v-model="analytics" type="checkbox" />
          <span>Yes, help improve Rebel Match: count how I use the app.</span>
        </label>
      </section>

      <button type="submit" class="btn btn-primary" :disabled="!ready">
        Continue
      </button>
    </form>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.consent {
  margin-top: 0.5rem;
}
</style>
