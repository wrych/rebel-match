<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  decide,
  fetchApplicants,
  type Applicant,
  type Decision,
} from '../lib/applicants'

const applicants = ref<Applicant[]>([])
const loaded = ref(false)
const problem = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref<string | null>(null)

const doneNotice: Record<Decision, (email: string) => string> = {
  approve: (email) => `Approved ${email}: their sign-in link is on its way.`,
  reject: (email) => `Rejected ${email}.`,
}

async function load(): Promise<void> {
  try {
    applicants.value = await fetchApplicants()
    problem.value = null
  } catch {
    problem.value = 'The applicants could not be loaded.'
  }
  loaded.value = true
}

function noticeFor(
  outcome: Awaited<ReturnType<typeof decide>>,
  decision: Decision,
  email: string,
): string {
  if (outcome === 'done') return doneNotice[decision](email)
  if (outcome === 'link-failed')
    return `Approved ${email}, but the email failed. They can ask for a link on the login screen.`
  return `${email} was already decided by someone else.`
}

async function act(applicant: Applicant, decision: Decision): Promise<void> {
  busy.value = applicant.id
  try {
    const outcome = await decide(applicant.id, decision)
    notice.value = noticeFor(outcome, decision, applicant.email)
    await load()
  } catch {
    notice.value = `That did not go through for ${applicant.email}. Try again.`
  } finally {
    busy.value = null
  }
}

onMounted(load)
</script>

<template>
  <h1>Applicants</h1>

  <p v-if="notice" role="status">{{ notice }}</p>
  <p v-if="problem" role="alert">{{ problem }}</p>
  <p v-else-if="loaded && applicants.length === 0">Nobody is waiting.</p>

  <article
    v-for="applicant in applicants"
    :key="applicant.id"
    class="applicant"
  >
    <header>
      <strong>{{ applicant.name ?? applicant.email }}</strong>
      <span v-if="applicant.org"> · {{ applicant.org }}</span>
    </header>
    <p>
      <span v-if="applicant.name">{{ applicant.email }} · </span>
      asked
      <time :datetime="applicant.requestedAt">{{ applicant.requestedAt }}</time>
    </p>
    <button
      type="button"
      :disabled="busy !== null"
      @click="act(applicant, 'approve')"
    >
      Approve
    </button>
    <button
      type="button"
      :disabled="busy !== null"
      @click="act(applicant, 'reject')"
    >
      Reject
    </button>
  </article>
</template>

<style scoped>
.applicant {
  border-top: 1px solid currentColor;
  padding: 0.5rem 0;
}

button {
  font: inherit;
  padding: 0.6rem 1rem;
  margin-right: 0.5rem;
}
</style>
