<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { consentTexts } from '../../src/consent'
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
const accepted = ref(false)
const consentVersion = ref<string | null>(null)
const limits = ref<ClientConfig['limits'] | null>(null)
const sending = ref(false)
const problem = ref<string | null>(null)

const consentWords = computed(() =>
  consentVersion.value === null
    ? []
    : (consentTexts[consentVersion.value] ?? []),
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
    consentVersion.value = draft.consentVersion
    limits.value = config.limits
  } catch {
    problem.value = 'The form could not be loaded. Reload to try again.'
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
      consentVersion: consentVersion.value,
    })
    if (outcome === 'stale') {
      accepted.value = false
      problem.value = 'The terms have just changed. Please read them again.'
      await load()
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
  <h1>Welcome to Rebel Match</h1>
  <p>Two things before you start: your name, and how we use your data.</p>

  <form @submit.prevent="submit">
    <label for="name">Your name</label>
    <input
      id="name"
      v-model="name"
      autocomplete="name"
      required
      :maxlength="limits?.nameMaxChars"
    />
    <label for="job-title">Job title (optional)</label>
    <input
      id="job-title"
      v-model="jobTitle"
      autocomplete="organization-title"
      :maxlength="limits?.jobTitleMaxChars"
    />
    <label for="org">Organization (optional)</label>
    <input
      id="org"
      v-model="org"
      autocomplete="organization"
      :maxlength="limits?.orgMaxChars"
    />

    <section aria-labelledby="consent-heading">
      <h2 id="consent-heading">How we use your data</h2>
      <p v-for="(paragraph, index) in consentWords" :key="index">
        {{ paragraph }}
      </p>
    </section>

    <label class="accept">
      <input v-model="accepted" type="checkbox" />
      I have read this and agree.
    </label>

    <button type="submit" :disabled="!ready">Continue</button>
  </form>

  <p v-if="problem" role="alert">{{ problem }}</p>
</template>

<style scoped>
form {
  display: grid;
  gap: 0.5rem;
  max-width: 28rem;
}

input:not([type='checkbox']),
button {
  font: inherit;
  padding: 0.6rem;
}

.accept {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
</style>
