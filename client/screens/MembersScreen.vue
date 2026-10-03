<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  eraseMember,
  fetchMembers,
  matchesSearch,
  type EraseOutcome,
  type RosterMember,
} from '../lib/members'
import { when } from '../lib/when'

const members = ref<RosterMember[]>([])
const loaded = ref(false)
const search = ref('')
const problem = ref<string | null>(null)
const notice = ref<string | null>(null)
const confirming = ref<string | null>(null)
const busy = ref(false)

const shown = computed(() =>
  members.value.filter((member) => matchesSearch(member, search.value)),
)

const outcomeNotice: Record<EraseOutcome, (email: string) => string> = {
  erased: (email) => `Deleted ${email} and everything attached to them.`,
  gone: (email) => `${email} was already gone.`,
  'created-invites': (email) =>
    `${email} created invite links, so they stay for now. Those links have to be dealt with first.`,
  'last-admin': (email) =>
    `${email} is the only admin left, so they stay. Make someone else admin first.`,
}

async function load(): Promise<void> {
  try {
    members.value = await fetchMembers()
    problem.value = null
  } catch {
    problem.value = 'The members could not be loaded.'
  }
  loaded.value = true
}

function ask(member: RosterMember): void {
  notice.value = null
  confirming.value = member.id
}

async function erase(member: RosterMember): Promise<void> {
  busy.value = true
  try {
    notice.value = outcomeNotice[await eraseMember(member.id)](member.email)
    confirming.value = null
    await load()
  } catch {
    notice.value = `That did not go through for ${member.email}. Try again.`
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Host tools</p>
      <h1 class="display display-lg">Members</h1>
      <p class="lede">
        Find someone who asked to be removed and delete them with their
        challenges, requests, swipes, follows and messages.
      </p>
    </div>

    <div class="field">
      <label for="member-search">Search by email or name</label>
      <input id="member-search" v-model="search" class="input" type="search" />
    </div>

    <p v-if="notice" class="notice notice-solid" role="status">{{ notice }}</p>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="loaded && shown.length === 0" class="empty">
      Nobody matches.
    </p>

    <article v-for="member in shown" :key="member.id" class="card">
      <div class="card-head">
        <div class="stack-tight">
          <span class="card-title">{{ member.name ?? member.email }}</span>
          <span v-if="member.name" class="small">{{ member.email }}</span>
        </div>
        <span class="chip chip-dashed">{{ member.status }}</span>
      </div>
      <p class="mono meta">
        <span v-if="member.roles.length > 0"
          >{{ member.roles.join(', ') }} ·
        </span>
        since
        <time :datetime="member.joinedAt">{{ when(member.joinedAt) }}</time>
      </p>

      <div v-if="confirming === member.id" class="stack-tight">
        <p class="alert" role="alert">
          Delete {{ member.email }} for good? Everything they wrote goes with
          them. This cannot be undone.
        </p>
        <div class="actions">
          <button
            type="button"
            class="btn btn-dark btn-small"
            :disabled="busy"
            @click="erase(member)"
          >
            Delete for good
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-small"
            :disabled="busy"
            @click="confirming = null"
          >
            Keep
          </button>
        </div>
      </div>
      <div v-else class="actions">
        <button
          type="button"
          class="btn btn-ghost btn-small"
          :disabled="busy"
          @click="ask(member)"
        >
          Delete…
        </button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.meta {
  margin: 0;
  color: var(--muted);
  overflow-wrap: anywhere;
}
</style>
