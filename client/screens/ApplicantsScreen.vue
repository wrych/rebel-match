<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  decide,
  fetchApplicants,
  type Applicant,
  type Decision,
} from '../lib/applicants'
import { when } from '../lib/when'

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
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Host tools</p>
      <h1 class="display display-lg">Applicants</h1>
      <p class="lede">
        People asking to join. Approving sends their sign-in link straight away.
      </p>
    </div>

    <p v-if="notice" class="notice notice-solid" role="status">{{ notice }}</p>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="loaded && applicants.length === 0" class="empty">
      Nobody is waiting.
    </p>

    <article v-for="applicant in applicants" :key="applicant.id" class="card">
      <div class="card-head">
        <div class="stack-tight">
          <span class="card-title">{{
            applicant.name ?? applicant.email
          }}</span>
          <span v-if="applicant.org" class="small">{{ applicant.org }}</span>
        </div>
        <span class="chip chip-dashed">Waiting</span>
      </div>
      <p class="mono meta">
        <span v-if="applicant.name">{{ applicant.email }} · </span>
        asked
        <time :datetime="applicant.requestedAt">{{
          when(applicant.requestedAt)
        }}</time>
      </p>
      <div class="actions">
        <button
          type="button"
          class="btn btn-primary btn-small"
          :disabled="busy !== null"
          @click="act(applicant, 'approve')"
        >
          Approve
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-small"
          :disabled="busy !== null"
          @click="act(applicant, 'reject')"
        >
          Reject
        </button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.meta {
  margin: 0;
  color: var(--muted);
  overflow-wrap: anywhere;
}
</style>
