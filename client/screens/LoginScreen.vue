<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  requestLink,
  keepHandle,
  TooManyRequests,
  type LinkRequest,
} from '../lib/admission'
import { fetchConfig } from '../lib/api'
import { countInviteOpen } from '../lib/invite-open'
import { solveHumanCheck } from '../lib/human-check'
import { accountNotice, linkNotice } from '../lib/link-notice'

const router = useRouter()
const email = ref('')
const sending = ref(false)
const answer = ref<'check-email' | 'not-approved' | null>(null)
const failed = ref<'error' | 'check' | 'busy' | null>(null)
const checking = ref(false)
const checkHost = ref<HTMLElement | null>(null)
const deadLink = linkNotice(window.location.search)
const accountGone = accountNotice(window.location.search)
const consentVersion = ref<string | null>(null)
const problem = ref<string | null>(null)

let stopCounting = (): void => undefined

onMounted(async () => {
  const invite = new URLSearchParams(window.location.search).get('invite')
  if (invite !== null && invite !== '') stopCounting = countInviteOpen(invite)
  try {
    consentVersion.value = (await fetchConfig()).consentVersion
  } catch {
    problem.value = 'The server is not reachable yet.'
  }
})

onUnmounted(() => {
  stopCounting()
})

function ask(altcha?: string): Promise<LinkRequest> {
  const query = new URLSearchParams(window.location.search)
  return requestLink(email.value, {
    next: query.get('next'),
    invite: query.get('invite'),
    ...(altcha === undefined ? {} : { altcha }),
  })
}

// Past the per-network pace for new applicants the server asks for a human
// check: the widget solves it unattended, and the request goes again with the
// answer, once (R-NFR-8).
async function askWithCheck(): Promise<LinkRequest | 'unsolved'> {
  const reply = await ask()
  if (reply.state !== 'human-check' || reply.challenge === undefined)
    return reply
  checking.value = true
  try {
    await nextTick()
    if (checkHost.value === null) return 'unsolved'
    const payload = await solveHumanCheck(checkHost.value, reply.challenge)
    if (payload === null) return 'unsolved'
    const again = await ask(payload)
    return again.state === 'human-check' ? 'unsolved' : again
  } finally {
    checking.value = false
  }
}

async function send(): Promise<void> {
  sending.value = true
  failed.value = null
  try {
    const reply = await askWithCheck()
    if (reply === 'unsolved' || reply.state === 'human-check') {
      failed.value = 'check'
      return
    }
    if (reply.state === 'access-requested') {
      keepHandle(reply.handle)
      await router.push(
        reply.inviteRefused === true
          ? '/access-requested?invite=invalid'
          : '/access-requested',
      )
      return
    }
    answer.value = reply.state
  } catch (error) {
    failed.value = error instanceof TooManyRequests ? 'busy' : 'error'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section v-if="answer === 'check-email'" class="screen">
    <p class="kicker kicker-accent">Link on its way</p>
    <h1 class="display display-lg">Check your email</h1>
    <div class="card-solid" role="status">
      <p class="kicker">Sent to</p>
      <p class="sent-to">{{ email }}</p>
      <p>
        We sent you a sign-in link. It works once, for a short while: open it on
        this phone and tap Sign in.
      </p>
    </div>
  </section>

  <section v-else-if="answer === 'not-approved'" class="screen">
    <p class="kicker">Request closed</p>
    <h1 class="display display-lg">Not approved</h1>
    <p class="notice notice-solid" role="status">
      Your request to join Rebel Match was not approved, so we cannot send a
      sign-in link to {{ email }}. If you think this is a mistake, talk to the
      host.
    </p>
  </section>

  <section v-else class="screen screen-hero">
    <div class="stack">
      <h1 class="display display-xl">
        Rebel<br /><span class="mark">Match</span>
        <span class="beta">Beta</span>
      </h1>
      <p class="lede">
        Corporate Rebels connects the organizations replacing bureaucracy with
        better systems. Rebel Match is where the members help each other do the
        work.
      </p>
    </div>

    <div class="stack">
      <p v-if="deadLink" class="notice" role="alert">{{ deadLink }}</p>
      <p v-if="accountGone" class="notice notice-solid" role="status">
        {{ accountGone }}
      </p>
      <form class="stack" @submit.prevent="send">
        <div class="field">
          <label for="email">Your email</label>
          <input
            id="email"
            v-model="email"
            class="input"
            type="email"
            autocomplete="email"
            inputmode="email"
            placeholder="you@organization.org"
            required
          />
        </div>
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="sending || email.trim() === ''"
        >
          Send me a link
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
        That did not go through. Check the address and try again.
      </p>
      <p v-else-if="failed === 'check'" class="alert" role="alert">
        The check did not finish. Try again.
      </p>
      <p v-else-if="failed === 'busy'" class="alert" role="alert">
        Too many sign-in requests have come from this network. Try again a
        little later.
      </p>
      <p class="small">
        No password. We email you a link that signs you in on this phone.
      </p>
      <p v-if="problem" class="footnote" role="status">{{ problem }}</p>
      <p v-else-if="consentVersion" class="footnote" role="status">
        Server reachable — consent version {{ consentVersion }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.sent-to {
  font-size: 1.2rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}
</style>
