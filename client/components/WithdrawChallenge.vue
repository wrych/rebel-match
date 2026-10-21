<script setup lang="ts">
/** Withdraw for one of the member's own challenges, after one confirmation
 * (R-ASK-17). Emits `withdrawn` once it is gone, or was already. */
import { ref } from 'vue'
import { withdrawChallenge } from '../lib/challenges'

const props = defineProps<{ challengeId: string }>()
const emit = defineEmits<{ withdrawn: [] }>()

const confirming = ref(false)
const busy = ref(false)
const problem = ref<string | null>(null)

async function withdraw(): Promise<void> {
  busy.value = true
  problem.value = null
  try {
    await withdrawChallenge(props.challengeId)
    confirming.value = false
    emit('withdrawn')
  } catch {
    problem.value = 'That did not go through. Your challenge is still up.'
  }
  busy.value = false
}
</script>

<template>
  <div class="stack-tight">
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <div v-if="confirming" class="stack-tight">
      <p class="alert" role="alert">
        Withdraw this challenge? Nobody will see it again, and requests waiting
        about it close. This cannot be undone.
      </p>
      <div class="actions">
        <button
          type="button"
          class="btn btn-dark btn-small"
          :disabled="busy"
          @click="withdraw"
        >
          Withdraw
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
      Withdraw…
    </button>
  </div>
</template>
