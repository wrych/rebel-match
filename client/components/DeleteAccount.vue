<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { deleteAccount, type DeleteOutcome } from '../lib/profile'
import { forgetMe } from '../lib/session'

const router = useRouter()
const confirming = ref(false)
const busy = ref(false)
const problem = ref<string | null>(null)

const refusals: Record<Exclude<DeleteOutcome, 'deleted'>, string> = {
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
    if (outcome === 'deleted') {
      forgetMe()
      await router.replace('/login?account=deleted')
      return
    }
    problem.value = refusals[outcome]
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
      Deletes your account together with your profile, your challenges, your
      connection requests, what you swiped and followed, and the emails we sent
      you. It cannot be undone.
    </p>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <div v-if="confirming" class="stack-tight">
      <p class="alert" role="alert">
        Delete your account for good? Everything above goes, now.
      </p>
      <div class="actions">
        <button
          type="button"
          class="btn btn-dark btn-small"
          :disabled="busy"
          @click="erase"
        >
          Delete my account
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-small"
          :disabled="busy"
          @click="confirming = false"
        >
          Keep it
        </button>
      </div>
    </div>
    <button
      v-else
      type="button"
      class="btn btn-ghost btn-small"
      @click="confirming = true"
    >
      Delete my account…
    </button>
  </section>
</template>
