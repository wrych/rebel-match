<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import ConfirmAction from './ConfirmAction.vue'
import { deleteAccount, type DeleteOutcome } from '../lib/profile'
import { forgetMe } from '../lib/session'
import { graceSpan } from '../lib/when'

defineProps<{ graceDays: number | null }>()

const router = useRouter()
const confirming = ref(false)
const busy = ref(false)
const problem = ref<string | null>(null)

const refusals: Record<Exclude<DeleteOutcome['result'], 'deleted'>, string> = {
  'last-admin':
    'You are the only one who can give roles. Make someone else admin first, then delete your account.',
  'created-invites':
    'Invite links you created are still in the app. Ask another host to deal with them first.',
}

async function erase(): Promise<void> {
  busy.value = true
  problem.value = null
  try {
    const outcome = await deleteAccount()
    if (outcome.result === 'deleted') {
      forgetMe()
      const until = encodeURIComponent(outcome.eraseAfter)
      await router.replace(`/login?account=deleted&until=${until}`)
      return
    }
    problem.value = refusals[outcome.result]
    confirming.value = false
  } catch {
    problem.value =
      'That did not go through. Your account is still here; try again.'
  }
  busy.value = false
}
</script>

<template>
  <section class="stack-tight rule" aria-labelledby="delete-heading">
    <h2 id="delete-heading" class="kicker">Delete your account</h2>
    <p class="small">
      You are signed out and hidden from everyone at once. After
      {{ graceSpan(graceDays) }} your profile, your challenges, your connection
      requests, what you were shown, swiped and followed, and the emails we sent
      you are erased for good. Until then, ask for a sign-in link with your
      email and the email lets you keep your account.
    </p>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <ConfirmAction
      v-model:open="confirming"
      trigger-label="Delete my account…"
      confirm-label="Delete my account"
      keep-label="Keep it"
      :busy="busy"
      @confirm="erase"
    >
      Delete your account? You are signed out now, and it is erased after
      {{ graceSpan(graceDays) }} unless you keep it.
    </ConfirmAction>
  </section>
</template>
