<script setup lang="ts">
/** **Profile code: on / off** and **Reset code**, on S47 and the profile
 * screen alike (R-CODE-4). */
import { ref } from 'vue'
import {
  resetProfileCode,
  setProfileCode,
  type ProfileCode,
} from '../lib/codes'

const props = defineProps<{ code: ProfileCode }>()
const emit = defineEmits<{ changed: [code: ProfileCode] }>()

const busy = ref(false)
const problem = ref<string | null>(null)
const resetDone = ref(false)

async function apply(change: () => Promise<ProfileCode>): Promise<boolean> {
  busy.value = true
  problem.value = null
  try {
    emit('changed', await change())
    return true
  } catch {
    problem.value = 'That did not save. Try again.'
    return false
  } finally {
    busy.value = false
  }
}

async function toggle(event: Event): Promise<void> {
  const box = event.target as HTMLInputElement
  if (!(await apply(() => setProfileCode(box.checked))))
    box.checked = props.code.enabled
}

async function reset(): Promise<void> {
  resetDone.value = false
  await apply(resetProfileCode)
  resetDone.value = problem.value === null
}
</script>

<template>
  <div class="stack-tight">
    <label class="check">
      <input
        type="checkbox"
        :checked="props.code.enabled"
        :disabled="busy"
        @change="toggle"
      />
      <span>Profile code: {{ props.code.enabled ? 'on' : 'off' }}</span>
    </label>
    <p class="small">
      Off, your code answers as not found until you turn it on again, the same
      code. Reset makes a new one at once, so a code printed or posted stops
      working.
    </p>
    <button
      type="button"
      class="btn btn-ghost btn-small"
      :disabled="busy"
      @click="reset"
    >
      Reset code
    </button>
    <p v-if="resetDone" class="small" role="status">
      Done. Your old code no longer works.
    </p>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </div>
</template>
