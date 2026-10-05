<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { fetchConfig } from '../lib/api'
import { fetchCockpit, fetchIncoming, type Cockpit } from '../lib/cockpit'
import type { ConnectionView } from '../lib/connections'
import { poll } from '../lib/poll'

const cockpit = ref<Cockpit | null>(null)
const incoming = ref<ConnectionView[]>([])
const problem = ref<string | null>(null)

const requestPath = (id: string): string =>
  `/matches/requests/${encodeURIComponent(id)}`
const matchesPath = (id: string): string =>
  `/challenges/${encodeURIComponent(id)}/matches`

const MS_PER_SECOND = 1000
let stopPolling: (() => void) | undefined
let gone = false

async function load(): Promise<void> {
  const [mine, waiting] = await Promise.all([fetchCockpit(), fetchIncoming()])
  cockpit.value = mine
  incoming.value = waiting
}

// A failed refresh keeps what is on screen; the next one tries again.
function refresh(): void {
  load().catch(() => undefined)
}

onMounted(async () => {
  try {
    await load()
  } catch {
    problem.value = 'Your matches could not be loaded. Reload to try again.'
    return
  }
  const config = await fetchConfig().catch(() => null)
  if (config === null || gone) return
  stopPolling = poll(refresh, config.limits.matchesPollSeconds * MS_PER_SECOND)
})

onUnmounted(() => {
  gone = true
  stopPolling?.()
})
</script>

<template>
  <section class="screen">
    <div class="stack">
      <h1 class="display display-lg">Your matches</h1>
    </div>

    <template v-if="cockpit">
      <section class="stack" aria-labelledby="waiting">
        <h2 id="waiting" class="display display-md kicker-accent">
          Waiting for you
        </h2>
        <p v-if="incoming.length === 0" class="empty">No requests waiting.</p>
        <RouterLink
          v-for="request in incoming"
          :key="request.id"
          :to="requestPath(request.id)"
          class="card request-row"
        >
          <span class="card-head">
            <span class="card-title">{{ request.other.name }}</span>
            <span
              class="chip"
              :class="request.kind === 'same_boat' ? 'chip-accent' : 'chip-ink'"
              >{{
                request.kind === 'same_boat' ? 'Same boat' : 'Been there'
              }}</span
            >
          </span>
          <span v-if="request.message" class="small request-note">{{
            request.message
          }}</span>
        </RouterLink>
      </section>

      <section class="stack rule" aria-labelledby="mine">
        <h2 id="mine" class="display display-md">Your challenges</h2>
        <template v-if="cockpit.challenges.length === 0">
          <p class="empty">You have not asked for help yet.</p>
          <RouterLink to="/ask" class="row-link">Ask for help</RouterLink>
        </template>
        <RouterLink
          v-for="challenge in cockpit.challenges"
          :key="challenge.id"
          :to="matchesPath(challenge.id)"
          class="card challenge-row"
        >
          <span class="kicker">{{
            challenge.trend?.short ?? 'No trend yet'
          }}</span>
          <span class="mine">{{ challenge.body }}</span>
          <span class="mono counts">
            {{ challenge.counts.sameBoat }} same boat ·
            {{ challenge.counts.beenThere }} been there ·
            {{ challenge.counts.cases }} case studies
          </span>
        </RouterLink>
      </section>

      <section class="stack rule" aria-labelledby="following">
        <h2 id="following" class="display display-md">Following</h2>
        <p v-if="cockpit.following.length === 0" class="empty">
          You follow no trends yet.
        </p>
        <ul v-else class="follow-list">
          <li v-for="trend in cockpit.following" :key="trend.id">
            <RouterLink
              :to="`/trends/${encodeURIComponent(trend.id)}`"
              class="chip"
              >{{ trend.short }}</RouterLink
            >
          </li>
        </ul>
      </section>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
