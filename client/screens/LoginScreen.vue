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
  <h1>Rebel Match</h1>

  <template v-if="answer === 'check-email'">
    <p role="status">
      Check your email: we sent a sign-in link to {{ email }}. It works once,
      for a short while.
    </p>
  </template>

  <template v-else-if="answer === 'not-approved'">
    <p role="status">
      Your request to join Rebel Match was not approved, so we cannot send a
      sign-in link to {{ email }}. If you think this is a mistake, talk to the
      host.
    </p>
  </template>

  <template v-else>
    <p v-if="deadLink" role="alert">{{ deadLink }}</p>
    <p>Enter your email and we will send you a link to sign in.</p>

    <form @submit.prevent="send">
      <label for="email">Email</label>
      <input
        id="email"
        v-model="email"
        type="email"
        autocomplete="email"
        required
      />
      <button type="submit" :disabled="sending || email.trim() === ''">
        Send me a link
      </button>
    </form>
    <p v-if="failed" role="alert">
      That did not go through. Check the address and try again.
    </p>
  </template>

  <p v-if="problem" role="status">{{ problem }}</p>
  <p v-else-if="consentVersion" role="status">
    Server reachable — consent version {{ consentVersion }}
  </p>
</template>

<style scoped>
form {
  display: grid;
  gap: 0.5rem;
  max-width: 20rem;
}

input,
button {
  font: inherit;
  padding: 0.6rem;
}
</style>
