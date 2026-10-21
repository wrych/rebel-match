<script setup lang="ts">
/** A member's challenges on their page in the host tools, each with Hide (and
 * why) or Unhide (R-MOD-8, R-MEM-2). A withdrawn one shows no text. */
import { onMounted, ref } from 'vue'
import {
  fetchMemberChallenges,
  hiddenAs,
  hideChallenge,
  unhideChallenge,
  type ModeratedChallenge,
  type ModerationReason,
} from '../lib/moderation'

const props = defineProps<{ memberId: string }>()

const challenges = ref<ModeratedChallenge[] | null>(null)
const problem = ref<string | null>(null)
const hiding = ref<string | null>(null)
const reason = ref<ModerationReason>('spam')
const busy = ref(false)

const reasons: { value: ModerationReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'other', label: 'Other' },
]

async function load(): Promise<void> {
  try {
    challenges.value = (await fetchMemberChallenges(props.memberId)) ?? []
  } catch {
    problem.value = 'Their challenges could not be loaded.'
  }
}

function startHiding(id: string): void {
  hiding.value = id
  reason.value = 'spam'
  problem.value = null
}

// Each change ends by reading the list again, so it shows what the server
// now holds, a change someone else made meanwhile included.
async function change(act: () => Promise<'done' | 'gone'>): Promise<void> {
  busy.value = true
  problem.value = null
  try {
    if ((await act()) === 'gone')
      problem.value = 'Someone changed that meanwhile. Here is how it is now.'
    hiding.value = null
  } catch {
    problem.value = 'That did not go through. Try again.'
  }
  busy.value = false
  await load()
}

onMounted(load)
</script>

<template>
  <article class="card">
    <h2 class="card-title">Challenges</h2>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-if="challenges && challenges.length === 0" class="small">
      They have posted none.
    </p>
    <ul v-if="challenges" class="list">
      <li
        v-for="challenge in challenges"
        :key="challenge.id"
        class="stack-tight item"
      >
        <span class="card-head">
          <span class="kicker">{{ challenge.trendShort ?? 'No trend' }}</span>
          <span v-if="challenge.state === 'withdrawn'" class="chip"
            >Withdrawn</span
          >
          <span
            v-else-if="challenge.state === 'hidden'"
            class="chip chip-accent"
            >Hidden</span
          >
        </span>
        <p v-if="challenge.body === null" class="small">
          Withdrawn by its author; its text is theirs alone.
        </p>
        <p v-else class="mine">{{ challenge.body }}</p>

        <template v-if="challenge.state === 'hidden'">
          <p v-if="challenge.hiddenReason" class="small">
            Hidden {{ hiddenAs(challenge.hiddenReason) }}. Only its author sees
            it.
          </p>
          <button
            type="button"
            class="btn btn-ghost btn-small"
            :disabled="busy"
            @click="change(() => unhideChallenge(challenge.id))"
          >
            Unhide
          </button>
        </template>

        <fieldset
          v-else-if="challenge.state === 'shown' && hiding === challenge.id"
          class="stack-tight hide-form"
          :disabled="busy"
        >
          <legend class="small">Hide it as</legend>
          <div class="reasons">
            <label v-for="each in reasons" :key="each.value" class="reason">
              <input v-model="reason" type="radio" :value="each.value" />
              {{ each.label }}
            </label>
          </div>
          <p class="small">
            It is gone for everyone but its author, who sees why, and requests
            waiting about it close. You can unhide it.
          </p>
          <div class="actions">
            <button
              type="button"
              class="btn btn-dark btn-small"
              @click="change(() => hideChallenge(challenge.id, reason))"
            >
              Hide
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-small"
              @click="hiding = null"
            >
              Cancel
            </button>
          </div>
        </fieldset>

        <button
          v-else-if="challenge.state === 'shown'"
          type="button"
          class="btn btn-ghost btn-small"
          :disabled="busy"
          @click="startHiding(challenge.id)"
        >
          Hide…
        </button>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: grid;
  gap: 1rem;
}

.item + .item {
  border-top: 1px solid var(--line);
  padding-top: 1rem;
}

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
