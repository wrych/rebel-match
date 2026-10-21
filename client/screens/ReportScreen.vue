<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchConfig } from '../lib/api'
import type { ModerationReason } from '../lib/moderation'
import {
  fetchReportTarget,
  sendReport,
  type ReportItem,
  type ReportOutcome,
  type ReportTarget,
} from '../lib/reports'
import { thankOnReturn } from '../lib/thanks'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const item: ReportItem =
  route.name === 'report-request' ? { requestId: id } : { challengeId: id }

const target = ref<ReportTarget | null>(null)
const missing = ref(false)
const reason = ref<ModerationReason | null>(null)
const comment = ref('')
const maxChars = ref<number | null>(null)
const sending = ref(false)
const problem = ref<string | null>(null)
const already = ref(false)

const reasons: { value: ModerationReason; label: string; hint: string }[] = [
  {
    value: 'spam',
    label: 'Spam',
    hint: 'Advertising, a sales pitch, or posted over and over',
  },
  {
    value: 'inappropriate',
    label: 'Inappropriate or offensive',
    hint: 'Insulting, harassing or out of place here',
  },
  { value: 'other', label: 'Something else', hint: 'Tell the hosts below' },
]

const what = computed(() =>
  'challengeId' in item ? 'this challenge' : 'this note',
)
const length = computed(() => comment.value.trim().length)

const refusals: Record<Exclude<ReportOutcome, 'reported'>, string> = {
  not_found: 'That is no longer there to report.',
  already_reported: 'You already reported this.',
  too_many:
    'You have reported a lot today. Please find a host in person instead.',
}

const thanksFor = (): string =>
  'challengeId' in item
    ? 'Thanks, a host will look at it. You won’t see that challenge again.'
    : 'Thanks, a host will look at it. The request is closed.'

// Back where the member came from; a report opened from a link has nowhere
// to go back to, so it goes home.
async function leave(): Promise<void> {
  if (router.options.history.state['back'] === null) {
    await router.replace('/welcome')
    return
  }
  router.back()
}

onMounted(async () => {
  try {
    const [found, config] = await Promise.all([
      fetchReportTarget(item),
      fetchConfig().catch(() => null),
    ])
    target.value = found
    missing.value = found === null
    already.value = found?.alreadyReported ?? false
    maxChars.value = config?.limits.reportCommentMaxChars ?? null
  } catch {
    problem.value = 'This could not be loaded. Reload to try again.'
  }
})

async function send(): Promise<void> {
  if (reason.value === null || sending.value) return
  sending.value = true
  problem.value = null
  try {
    const outcome = await sendReport(item, reason.value, comment.value)
    if (outcome === 'reported') {
      thankOnReturn(thanksFor())
      await leave()
      return
    }
    if (outcome === 'already_reported') already.value = true
    else problem.value = refusals[outcome]
  } catch {
    problem.value = 'That did not go through. Try again.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section class="screen">
    <button type="button" class="small back" @click="leave">← Back</button>

    <p v-if="missing" class="empty">There is nothing here to report.</p>

    <template v-else-if="target">
      <div class="stack">
        <p class="kicker kicker-accent">Report</p>
        <h1 class="display display-lg">What’s wrong with {{ what }}?</h1>
      </div>

      <div class="card">
        <p v-if="target.trendShort" class="kicker">{{ target.trendShort }}</p>
        <p v-if="target.body" class="small peer-note">{{ target.body }}</p>
        <p v-else class="small">
          It is no longer shown, but you can still report it.
        </p>
      </div>

      <p v-if="already" class="notice notice-solid" role="status">
        You already reported this. A host will look at it.
      </p>

      <form v-else class="stack" @submit.prevent="send">
        <fieldset class="stack-tight reasons">
          <legend class="card-title">Why are you reporting it?</legend>
          <label
            v-for="each in reasons"
            :key="each.value"
            class="card reason"
            :class="{ chosen: reason === each.value }"
          >
            <input
              v-model="reason"
              type="radio"
              name="reason"
              :value="each.value"
            />
            <span class="stack-tight">
              <span class="card-title">{{ each.label }}</span>
              <span class="small">{{ each.hint }}</span>
            </span>
          </label>
        </fieldset>

        <div class="field">
          <label for="comment">Anything hosts should know? (optional)</label>
          <textarea
            id="comment"
            v-model="comment"
            class="input"
            rows="3"
            :maxlength="maxChars ?? undefined"
            aria-describedby="comment-count"
          ></textarea>
          <p id="comment-count" class="footnote" aria-live="polite">
            {{ length }}<template v-if="maxChars"> / {{ maxChars }}</template>
          </p>
        </div>

        <p class="small">
          A host will look at it. Whoever wrote it won’t learn who reported it.
        </p>

        <button
          type="submit"
          class="btn btn-primary"
          :disabled="reason === null || sending"
        >
          Send report
        </button>
      </form>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.back {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
}

.reasons {
  border: 0;
  margin: 0;
  padding: 0;
}

.reason {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  cursor: pointer;
}

.reason input {
  margin-top: 0.2rem;
}

.reason.chosen {
  outline: 3px solid var(--accent);
  outline-offset: -1px;
}
</style>
