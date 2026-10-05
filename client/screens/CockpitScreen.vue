<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { fetchConfig } from '../lib/api'
import { peerLine } from '../lib/challenges'
import {
  fetchCockpit,
  fetchConnected,
  fetchIncoming,
  type Cockpit,
} from '../lib/cockpit'
import { answerRequest, type ConnectionView } from '../lib/connections'
import { poll } from '../lib/poll'

const cockpit = ref<Cockpit | null>(null)
const incoming = ref<ConnectionView[]>([])
const connected = ref<ConnectionView[]>([])
const problem = ref<string | null>(null)
const answering = ref<string | null>(null)
const notice = ref<string | null>(null)
const failed = ref<string | null>(null)

const requestPath = (id: string): string =>
  `/matches/requests/${encodeURIComponent(id)}`
const contactPath = (id: string): string =>
  `/matches/requests/${encodeURIComponent(id)}/contact`
const matchesPath = (id: string): string =>
  `/challenges/${encodeURIComponent(id)}/matches`

const MS_PER_SECOND = 1000
let stopPolling: (() => void) | undefined
let gone = false

async function load(): Promise<void> {
  const [mine, waiting, people] = await Promise.all([
    fetchCockpit(),
    fetchIncoming(),
    fetchConnected(),
  ])
  cockpit.value = mine
  incoming.value = waiting
  connected.value = people
}

// A failed refresh keeps what is on screen; the next one tries again.
function refresh(): void {
  load().catch(() => undefined)
}

function afterAnswer(
  request: ConnectionView,
  verdict: 'accept' | 'decline',
  outcome: 'done' | 'gone',
): string {
  if (outcome === 'gone') return 'That request is no longer waiting for you.'
  return verdict === 'accept'
    ? `You are connected with ${request.other.name}.`
    : `You declined ${request.other.name}. Nothing was shared.`
}

// The answered request leaves the list at once; the refresh that follows
// brings an accepted one back under connections (R-MINE-2, R-MINE-5).
async function answer(
  request: ConnectionView,
  verdict: 'accept' | 'decline',
): Promise<void> {
  answering.value = request.id
  notice.value = null
  failed.value = null
  try {
    const outcome = await answerRequest(request.id, verdict)
    incoming.value = incoming.value.filter((each) => each.id !== request.id)
    notice.value = afterAnswer(request, verdict, outcome)
    refresh()
  } catch {
    failed.value = 'That did not save. Try again.'
  } finally {
    answering.value = null
  }
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
        <p v-else class="small">
          Accepting shares your email addresses with each other. Open a request
          to read it in full first.
        </p>
        <p v-if="notice" class="notice notice-solid" role="status">
          {{ notice }}
        </p>
        <p v-if="failed" class="alert" role="alert">{{ failed }}</p>
        <div v-for="request in incoming" :key="request.id" class="card">
          <RouterLink :to="requestPath(request.id)" class="request-row">
            <span class="card-head">
              <span class="card-title">{{ request.other.name }}</span>
              <span
                class="chip"
                :class="
                  request.kind === 'same_boat' ? 'chip-accent' : 'chip-ink'
                "
                >{{
                  request.kind === 'same_boat' ? 'Same boat' : 'Been there'
                }}</span
              >
            </span>
            <span v-if="request.message" class="small request-note">{{
              request.message
            }}</span>
          </RouterLink>
          <div class="actions">
            <button
              type="button"
              class="btn btn-ghost btn-small"
              :disabled="answering !== null"
              :aria-label="`Decline ${request.other.name}`"
              @click="answer(request, 'decline')"
            >
              Decline
            </button>
            <button
              type="button"
              class="btn btn-primary btn-small"
              :disabled="answering !== null"
              :aria-label="`Accept ${request.other.name}`"
              @click="answer(request, 'accept')"
            >
              Accept
            </button>
          </div>
        </div>
      </section>

      <section class="stack rule" aria-labelledby="connections">
        <h2 id="connections" class="display display-md">Your connections</h2>
        <p v-if="connected.length === 0" class="empty">
          No connections yet. They show here once a request is accepted.
        </p>
        <RouterLink
          v-for="connection in connected"
          :key="connection.id"
          :to="contactPath(connection.id)"
          class="card request-row"
        >
          <span class="card-title">{{ connection.other.name }}</span>
          <span v-if="peerLine(connection.other)" class="mono peer-meta">{{
            peerLine(connection.other)
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
