<script setup lang="ts">
/** A host says why they ban a member and confirms it, once, or thinks
 * better of it (R-MOD-9). Emits `ban` with the reason, or `cancel`. */
import { computed, ref } from 'vue'

/** `maxChars` is the server's limit, null until the config is read. */
defineProps<{ busy: boolean; name: string; maxChars: number | null }>()
const emit = defineEmits<{ ban: [note: string]; cancel: [] }>()

const note = ref('')
const ready = computed(() => note.value.trim() !== '')
</script>

<template>
  <fieldset class="stack-tight ban-form" :disabled="busy">
    <legend class="small">Ban {{ name }}</legend>
    <p class="small">
      Their sessions end at once and they cannot sign in again. Nothing of
      theirs is shown to anyone, their waiting requests close and their open
      reports are handled. Nothing is erased: lifting the ban brings it all
      back, except what a host hid on its own.
    </p>
    <label class="stack-tight">
      <span class="small">Why? Only hosts see this.</span>
      <textarea v-model="note" rows="3" :maxlength="maxChars ?? undefined" />
    </label>
    <div class="actions">
      <button
        type="button"
        class="btn btn-dark btn-small"
        :disabled="!ready"
        @click="emit('ban', note.trim())"
      >
        Ban
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
.ban-form {
  border: 0;
  margin: 0;
  padding: 0;
}
</style>
