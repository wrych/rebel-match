<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchConfig } from '../lib/api'
import { screenFrom, sendFeedback, type FeedbackReply } from '../lib/feedback'
import { solveHumanCheck } from '../lib/human-check'
import { fetchProfile } from '../lib/profile'
import { loadMe } from '../lib/session'

const route = useRoute()
const message = ref('')
const name = ref('')
const email = ref('')
const maxChars = ref<number | null>(null)
const sending = ref(false)
const sent = ref(false)
const checking = ref(false)
const checkHost = ref<HTMLElement | null>(null)
const failed = ref<'error' | 'check' | 'busy' | null>(null)

const blank = computed(() => message.value.trim() === '')

// What the profile says goes in first; anything typed meanwhile is kept.
function fillIn(known: { name?: string | null; email?: string }): void {
  if (name.value === '') name.value = known.name ?? ''
  if (email.value === '') email.value = known.email ?? ''
}

async function prefill(): Promise<void> {
  const me = await loadMe().catch(() => null)
  if (me === null) return
  if (!me.onboarded) {
    fillIn({ name: me.name })
    return
  }
  fillIn(await fetchProfile().catch(() => ({ name: me.name })))
}

onMounted(async () => {
  void prefill()
  maxChars.value = await fetchConfig()
    .then((config) => config.limits.feedbackMaxChars)
    .catch(() => null)
})

function draft(): Parameters<typeof sendFeedback>[0] {
  return {
    message: message.value,
    name: name.value,
    email: email.value,
    screen: screenFrom(route.query['from']),
  }
}

// A visitor's message waits on the human check, which solves itself, then
// goes again with the answer, once (R-FB-2).
async function sendWithCheck(): Promise<FeedbackReply | 'unsolved'> {
  const reply = await sendFeedback(draft())
  if (reply.state !== 'human-check') return reply
  checking.value = true
  try {
    await nextTick()
    if (checkHost.value === null) return 'unsolved'
    const payload = await solveHumanCheck(checkHost.value, reply.challenge)
    if (payload === null) return 'unsolved'
    const again = await sendFeedback(draft(), payload)
    return again.state === 'human-check' ? 'unsolved' : again
  } finally {
    checking.value = false
  }
}

async function send(): Promise<void> {
  sending.value = true
  failed.value = null
  try {
    const reply = await sendWithCheck()
    if (reply === 'unsolved') failed.value = 'check'
    else if (reply.state === 'busy') failed.value = 'busy'
    else sent.value = true
  } catch {
    failed.value = 'error'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section v-if="sent" class="screen">
    <p class="kicker kicker-accent">Feedback</p>
    <h1 class="display display-lg">Thank you</h1>
    <p class="notice notice-solid" role="status">
      Your feedback is on its way to the team.
    </p>
    <RouterLink to="/" class="btn btn-dark">Back to the app</RouterLink>
  </section>

  <section v-else class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Feedback</p>
      <h1 class="display display-lg">Tell us what you think</h1>
      <p class="lede">
        What works, what doesn’t, what you miss. It goes straight to the team.
      </p>
    </div>

    <form class="stack" @submit.prevent="send">
      <div class="field">
        <label for="feedback-message">Your feedback</label>
        <textarea
          id="feedback-message"
          v-model="message"
          class="input"
          rows="6"
          :maxlength="maxChars ?? undefined"
          required
        ></textarea>
      </div>
      <div class="field">
        <label for="feedback-name">Your name (optional)</label>
        <input
          id="feedback-name"
          v-model="name"
          class="input"
          type="text"
          autocomplete="name"
        />
      </div>
      <div class="field">
        <label for="feedback-email">Your email (optional)</label>
        <input
          id="feedback-email"
          v-model="email"
          class="input"
          type="email"
          autocomplete="email"
          inputmode="email"
        />
        <p class="footnote">Leave it in if you would like an answer.</p>
      </div>
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="sending || blank"
      >
        Send feedback
      </button>
    </form>

    <div v-if="checking" class="stack" role="status">
      <p class="small">
        One moment: a quick check that you are a person, not a script. It runs
        by itself.
      </p>
      <div ref="checkHost" />
    </div>
    <p v-if="failed === 'error'" class="alert" role="alert">
      That did not go through. Check what you wrote and try again.
    </p>
    <p v-else-if="failed === 'check'" class="alert" role="alert">
      The check did not finish. Try again.
    </p>
    <p v-else-if="failed === 'busy'" class="alert" role="alert">
      Too much feedback has come from here for now. Try again a little later.
    </p>
  </section>
</template>
