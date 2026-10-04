<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { requestLink, keepHandle } from '../lib/admission'
import { fetchConfig } from '../lib/api'
import { linkNotice } from '../lib/link-notice'

const router = useRouter()
const email = ref('')
const sending = ref(false)
const answer = ref<'check-email' | 'not-approved' | null>(null)
const failed = ref(false)
const deadLink = linkNotice(window.location.search)
const consentVersion = ref<string | null>(null)
const problem = ref<string | null>(null)

onMounted(async () => {
  try {
    consentVersion.value = (await fetchConfig()).consentVersion
  } catch {
    problem.value = 'The server is not reachable yet.'
  }
})

async function send(): Promise<void> {
  sending.value = true
  failed.value = false
  try {
    const query = new URLSearchParams(window.location.search)
    const reply = await requestLink(email.value, {
      next: query.get('next'),
      invite: query.get('invite'),
    })
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
  } catch {
    failed.value = true
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
      <p v-if="failed" class="alert" role="alert">
        That did not go through. Check the address and try again.
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
