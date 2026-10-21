<script setup lang="ts">
/** One of the member's own challenges, with a crossed eye in its corner to
 * withdraw it after one confirmation (R-ASK-17). The challenge is the
 * default slot; the eye sits over it rather than inside it, as the card may
 * be a link. Emits `withdrawn` once it is gone, or was already. */
import { ref } from 'vue'
import { withdrawChallenge } from '../lib/challenges'

const props = withDefaults(
  defineProps<{ challengeId: string; offered?: boolean }>(),
  { offered: true },
)
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
    <div class="withdrawable" :class="{ offered }">
      <slot />
      <button
        v-if="offered && !confirming"
        type="button"
        class="withdraw-eye"
        aria-label="Withdraw this challenge"
        title="Withdraw"
        @click="confirming = true"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
          />
          <path d="M1 1l22 22" />
        </svg>
      </button>
    </div>
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
  </div>
</template>

<style scoped>
.withdrawable {
  position: relative;
}

/* Room for the eye, so a long trend name never runs under it. */
.offered :deep(.card-head),
.offered :deep(.stack-tight > .kicker:first-child) {
  padding-right: 2.5rem;
}

.withdraw-eye {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
}

.withdraw-eye:hover,
.withdraw-eye:focus-visible {
  color: var(--ink);
}
</style>
