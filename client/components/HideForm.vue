<script setup lang="ts">
/** A host picks why something is hidden, then hides it or thinks better of
 * it (R-MOD-8). Emits `hide` with the reason, or `cancel`. */
import { ref } from 'vue'
import type { ModerationReason } from '../lib/moderation'

defineProps<{ busy: boolean; what: string }>()
const emit = defineEmits<{ hide: [reason: ModerationReason]; cancel: [] }>()

const reason = ref<ModerationReason>('spam')
const reasons: { value: ModerationReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'other', label: 'Other' },
]
</script>

<template>
  <fieldset class="stack-tight hide-form" :disabled="busy">
    <legend class="small">Hide it as</legend>
    <div class="reasons">
      <label v-for="each in reasons" :key="each.value" class="reason">
        <input v-model="reason" type="radio" :value="each.value" />
        {{ each.label }}
      </label>
    </div>
    <p class="small">
      {{ what }} is gone for everyone but its author, who sees why, and requests
      waiting about it close. You can unhide it.
    </p>
    <div class="actions">
      <button
        type="button"
        class="btn btn-dark btn-small"
        @click="emit('hide', reason)"
      >
        Hide
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-small"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </fieldset>
</template>

<style scoped>
.hide-form {
  border: 0;
  margin: 0;
  padding: 0;
}

.reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.2rem;
}

.reason {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 700;
}
</style>
