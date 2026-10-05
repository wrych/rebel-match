<script setup lang="ts">
import { ref } from 'vue'
import { deleteHistory } from '../lib/profile'

const confirming = ref(false)
const busy = ref(false)
const done = ref(false)
const problem = ref<string | null>(null)

async function forget(): Promise<void> {
  busy.value = true
  problem.value = null
  try {
    await deleteHistory()
    done.value = true
    confirming.value = false
  } catch {
    problem.value =
      'That did not go through. Your history is still here; try again.'
  }
  busy.value = false
}
</script>

<template>
  <section class="stack-tight rule" aria-labelledby="history-heading">
    <h2 id="history-heading" class="kicker">Your activity history</h2>
    <p class="small">
      We record which challenges you are shown, kept with your account and never
      shown to anyone. You can delete it at any time. Your challenges, your
      answers to other members' challenges, what you follow and your connections
      stay.
    </p>
    <p v-if="done" class="small" role="status">
      Your activity history is deleted.
    </p>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <div v-if="confirming" class="stack-tight">
      <p class="alert" role="alert">
        Delete your activity history? This cannot be undone.
      </p>
      <div class="actions">
        <button
          type="button"
          class="btn btn-dark btn-small"
          :disabled="busy"
          @click="forget"
        >
          Delete my history
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
      Delete my activity history…
    </button>
  </section>
</template>
