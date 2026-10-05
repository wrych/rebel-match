<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { consentWordsOf } from '../../src/consent'
import AnalyticsToggle from '../components/AnalyticsToggle.vue'
import DeleteAccount from '../components/DeleteAccount.vue'
import SavedTick from '../components/SavedTick.vue'
import { fetchConfig, type ClientConfig } from '../lib/api'
import { fetchProfile, saveProfile, type OwnProfile } from '../lib/profile'
import { forgetMe } from '../lib/session'
import { when } from '../lib/when'

type Field = 'name' | 'jobTitle' | 'org'

const profile = ref<OwnProfile | null>(null)
const limits = ref<ClientConfig['limits'] | null>(null)
const problem = ref<string | null>(null)
const form = reactive({ name: '', jobTitle: '', org: '' })
// What the server last accepted: a save sends it with the one field changed.
const saved = reactive({ name: '', jobTitle: '', org: '' })
const ticks = reactive<Record<Field, boolean>>({
  name: false,
  jobTitle: false,
  org: false,
})
const errors = reactive<Record<Field, string | null>>({
  name: null,
  jobTitle: null,
  org: null,
})
const timers: Partial<Record<Field, ReturnType<typeof setTimeout>>> = {}
// Saves run one at a time, each built from what the server last accepted,
// so a quick second edit cannot carry a stale value over the first.
let queue: Promise<void> = Promise.resolve()

const consentWords = computed(() =>
  profile.value?.consentVersion
    ? consentWordsOf(profile.value.consentVersion)
    : [],
)

onMounted(async () => {
  try {
    const [own, config] = await Promise.all([fetchProfile(), fetchConfig()])
    profile.value = own
    limits.value = config.limits
    for (const field of ['name', 'jobTitle', 'org'] as const) {
      form[field] = own[field] ?? ''
      saved[field] = form[field]
    }
  } catch {
    problem.value = 'Your profile could not be loaded. Reload to try again.'
  }
})

function tick(field: Field): void {
  ticks[field] = true
  clearTimeout(timers[field])
  timers[field] = setTimeout(() => {
    ticks[field] = false
  }, limits.value?.savedTickMs ?? 0)
}

async function store(field: Field, value: string): Promise<void> {
  if (value === saved[field]) return
  try {
    await saveProfile({ ...saved, [field]: value })
    saved[field] = value
    forgetMe()
    tick(field)
  } catch {
    errors[field] = 'That did not save. Try again.'
  }
}

function save(field: Field): Promise<void> {
  const value = form[field].trim()
  errors[field] = null
  if (field === 'name' && value === '') {
    errors.name = 'Your name cannot be empty, so it was not saved.'
    return Promise.resolve()
  }
  form[field] = value
  queue = queue.then(() => store(field, value))
  return queue
}
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Your settings</p>
      <h1 class="display display-lg">Profile &amp; privacy</h1>
      <p class="lede">Changes save as you make them.</p>
    </div>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>

    <template v-if="profile">
      <div class="stack">
        <div class="field">
          <div class="label-row">
            <label for="name" class="label">Your name</label>
            <SavedTick :shown="ticks.name" />
          </div>
          <input
            id="name"
            v-model="form.name"
            class="input"
            autocomplete="name"
            :maxlength="limits?.nameMaxChars"
            :aria-invalid="errors.name !== null"
            aria-describedby="name-error"
            @change="save('name')"
          />
          <p v-if="errors.name" id="name-error" class="alert" role="alert">
            {{ errors.name }}
          </p>
        </div>
        <div class="field">
          <div class="label-row">
            <label for="job-title" class="label">Job title (optional)</label>
            <SavedTick :shown="ticks.jobTitle" />
          </div>
          <input
            id="job-title"
            v-model="form.jobTitle"
            class="input"
            autocomplete="organization-title"
            :maxlength="limits?.jobTitleMaxChars"
            @change="save('jobTitle')"
          />
          <p v-if="errors.jobTitle" class="alert" role="alert">
            {{ errors.jobTitle }}
          </p>
        </div>
        <div class="field">
          <div class="label-row">
            <label for="org" class="label">Organization (optional)</label>
            <SavedTick :shown="ticks.org" />
          </div>
          <input
            id="org"
            v-model="form.org"
            class="input"
            autocomplete="organization"
            :maxlength="limits?.orgMaxChars"
            @change="save('org')"
          />
          <p v-if="errors.org" class="alert" role="alert">{{ errors.org }}</p>
        </div>
        <p class="small">
          Signed in as <strong>{{ profile.email }}</strong
          >. Your name, job title and organization appear on the cards other
          members see.
        </p>
      </div>

      <AnalyticsToggle :opted-in="profile.analyticsOptIn" />

      <section class="stack-tight rule" aria-labelledby="consent-heading">
        <h2 id="consent-heading" class="kicker">The terms you accepted</h2>
        <p v-if="profile.consentAt" class="small">
          Version {{ profile.consentVersion }}, accepted
          <time :datetime="profile.consentAt">{{
            when(profile.consentAt)
          }}</time>
        </p>
        <div class="card-solid stack-tight">
          <p v-for="(paragraph, index) in consentWords" :key="index">
            {{ paragraph }}
          </p>
        </div>
      </section>

      <DeleteAccount :grace-days="limits?.erasureGraceDays ?? null" />
    </template>
  </section>
</template>

<style scoped>
.label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}
</style>
