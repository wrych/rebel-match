<script setup lang="ts">
/** Ban member… or Lift ban for one member, offered only to a host holding
 * `member:ban` (R-MOD-9, R-ROLE-4), on their moderation page and their member
 * page alike. Emits `changed` after every answer, so the page reads the
 * member again and shows what the server now holds. */
import { onMounted, ref } from 'vue'
import BanForm from './BanForm.vue'
import { fetchConfig } from '../lib/api'
import { banMember, unbanMember } from '../lib/moderation'
import { loadMe } from '../lib/session'

const props = defineProps<{
  memberId: string
  name: string
  status: string
}>()
const emit = defineEmits<{ changed: [] }>()

const mayBan = ref(false)
const maxChars = ref<number | null>(null)
const banning = ref(false)
const busy = ref(false)
const problem = ref<string | null>(null)

const words = {
  done: null,
  gone: 'Someone changed that meanwhile. Here is how it is now.',
  refused: 'You cannot ban yourself, or the last member who can grant roles.',
} as const

async function change(
  act: () => Promise<'done' | 'gone' | 'refused'>,
): Promise<void> {
  busy.value = true
  problem.value = null
  try {
    problem.value = words[await act()]
    banning.value = false
  } catch {
    problem.value = 'That did not go through. Try again.'
  }
  busy.value = false
  emit('changed')
}

onMounted(async () => {
  const me = await loadMe().catch(() => null)
  mayBan.value = me?.permissions.includes('member:ban') === true
  if (mayBan.value)
    maxChars.value =
      (await fetchConfig().catch(() => null))?.limits.banNoteMaxChars ?? null
})
</script>

<template>
  <div
    v-if="mayBan && (status === 'active' || status === 'banned')"
    class="stack-tight"
  >
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <BanForm
      v-if="banning"
      :busy="busy"
      :name="name"
      :max-chars="maxChars"
      @ban="(note) => change(() => banMember(props.memberId, note))"
      @cancel="banning = false"
    />
    <div v-else class="actions">
      <button
        v-if="status === 'active'"
        type="button"
        class="btn btn-dark btn-small"
        :disabled="busy"
        @click="banning = true"
      >
        Ban member…
      </button>
      <button
        v-if="status === 'banned'"
        type="button"
        class="btn btn-ghost btn-small"
        :disabled="busy"
        @click="change(() => unbanMember(props.memberId))"
      >
        Lift ban
      </button>
    </div>
  </div>
</template>
