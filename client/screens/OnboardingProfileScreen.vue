<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  companySizeKeys,
  companySizes,
  pickedOrBlank,
  sectorKeys,
  sectors,
} from '../../src/profile-options'
import AskSteps from '../components/AskSteps.vue'
import { fetchConfig, type ClientConfig } from '../lib/api'
import {
  fetchDraft,
  keepTyped,
  onboardingSteps,
  stepPath,
  typedProfile,
  type TypedProfile,
} from '../lib/onboarding'
import { onboardingJourney } from '../lib/steps'

const route = useRoute()
const router = useRouter()
const form = reactive<TypedProfile>({
  name: '',
  jobTitle: '',
  org: '',
  sector: '',
  companySize: '',
})
const limits = ref<ClientConfig['limits'] | null>(null)
const problem = ref<string | null>(null)

const next = computed(() => {
  const given = route.query['next']
  return typeof given === 'string' ? given : null
})
const ready = computed(() => form.name.trim() !== '')

async function startingProfile(): Promise<TypedProfile> {
  const typed = typedProfile()
  if (typed !== null) return typed
  const draft = await fetchDraft()
  return {
    name: draft.name ?? '',
    jobTitle: draft.jobTitle ?? '',
    org: draft.org ?? '',
    sector: draft.sector ?? '',
    companySize: draft.companySize ?? '',
  }
}

onMounted(async () => {
  try {
    const [profile, config] = await Promise.all([
      startingProfile(),
      fetchConfig(),
    ])
    Object.assign(form, profile, {
      sector: pickedOrBlank(profile.sector, sectorKeys),
      companySize: pickedOrBlank(profile.companySize, companySizeKeys),
    })
    limits.value = config.limits
  } catch {
    problem.value = 'The form could not be loaded. Reload to try again.'
  }
})

async function proceed(): Promise<void> {
  if (!ready.value) return
  keepTyped({ ...form })
  await router.push(stepPath(onboardingSteps.privacy, next.value))
}
</script>

<template>
  <AskSteps :journey="onboardingJourney" :current="1" />
  <section class="screen">
    <div class="stack-tight">
      <h1 class="display display-lg">Your profile</h1>
      <p class="lede">
        Your name and profile information may be seen by other members.
      </p>
    </div>

    <form class="stack" @submit.prevent="proceed">
      <div class="field">
        <label for="name">Your name</label>
        <input
          id="name"
          v-model="form.name"
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
          v-model="form.jobTitle"
          class="input"
          autocomplete="organization-title"
          :maxlength="limits?.jobTitleMaxChars"
        />
      </div>
      <div class="field">
        <label for="org">Organization (optional)</label>
        <input
          id="org"
          v-model="form.org"
          class="input"
          autocomplete="organization"
          :maxlength="limits?.orgMaxChars"
        />
      </div>
      <div class="field">
        <label for="sector">Sector (optional)</label>
        <select id="sector" v-model="form.sector" class="input">
          <option value="">Not given</option>
          <option
            v-for="choice in sectors"
            :key="choice.key"
            :value="choice.key"
          >
            {{ choice.label }}
          </option>
        </select>
      </div>
      <div class="field">
        <label for="company-size">Company size (optional)</label>
        <select id="company-size" v-model="form.companySize" class="input">
          <option value="">Not given</option>
          <option
            v-for="size in companySizes"
            :key="size.key"
            :value="size.key"
          >
            {{ size.label }}
          </option>
        </select>
      </div>

      <p class="small">
        Nothing is saved or sent yet. You will see how we use your data on the
        next step. <RouterLink to="/privacy">Privacy notice</RouterLink>
      </p>

      <button type="submit" class="btn btn-primary" :disabled="!ready">
        Continue
      </button>
    </form>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
