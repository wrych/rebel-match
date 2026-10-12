<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ChallengeCard from '../components/ChallengeCard.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import { peerLine } from '../lib/challenges'
import {
  fetchCockpit,
  fetchConnected,
  fetchIncoming,
  markMatchesSeen,
  type Cockpit,
} from '../lib/cockpit'
import {
  answerRequest,
  byMember,
  contactPath,
  type ConnectedMember,
  type ConnectionView,
} from '../lib/connections'
import { arrivals, useLiveList } from '../lib/live-list'

const cockpit = ref<Cockpit | null>(null)
const incoming = ref<ConnectionView[]>([])
const connected = ref<ConnectionView[]>([])
const people = computed(() => byMember(connected.value))
const problem = ref<string | null>(null)
const answering = ref<string | null>(null)
const notice = ref<string | null>(null)
const failed = ref<string | null>(null)

const requestPath = (id: string): string =>
  `/matches/requests/${encodeURIComponent(id)}`
const matchesPath = (id: string): string =>
  `/challenges/${encodeURIComponent(id)}/matches`

const arrived = arrivals<ConnectionView>((request) => request.id)

// Marked before reading, so what arrives in between still badges the tab; a
// failed mark only leaves the badge up (R-MINE-4).
async function load(): Promise<void> {
  await markMatchesSeen().catch(() => undefined)
  try {
    const [mine, waiting, people] = await Promise.all([
      fetchCockpit(),
      fetchIncoming(),
      fetchConnected(),
    ])
    arrived.see(waiting)
    cockpit.value = mine
    incoming.value = waiting
    connected.value = people
    problem.value = null
  } catch {
    // A failed refresh keeps what is on screen; the next one tries again.
    if (cockpit.value === null)
      problem.value = 'Your matches could not be loaded. Reload to try again.'
  }
}

const live = useLiveList(load, 'cockpitPollSeconds')

// The badge's count is read out with the name, as the tab bar's is.
function connectionLabel(person: ConnectedMember): string | undefined {
  if (person.unseen === 0) return undefined
  return [
    person.other.name,
    `${String(person.unseen)} new`,
    peerLine(person.other),
  ]
    .filter((part) => part !== '')
    .join(', ')
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
    void live.refresh()
  } catch {
    failed.value = 'That did not save. Try again.'
  } finally {
    answering.value = null
  }
}

onMounted(() => live.refresh())
</script>

<template>
  <section class="screen">
    <PullToRefresh :live="live" />
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
        <div
          v-for="request in incoming"
          :key="request.id"
          class="card"
          :class="{ 'card-new': arrived.isNew(request) }"
          @click="arrived.clear(request)"
        >
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
          v-for="person in people"
          :key="person.other.memberId"
          :to="contactPath(person.id)"
          class="card request-row"
          :class="{ 'card-new': person.unseen > 0 }"
          :aria-label="connectionLabel(person)"
        >
          <span class="card-head">
            <span class="card-title">{{ person.other.name }}</span>
            <span v-if="person.unseen > 0" class="badge" aria-hidden="true">{{
              person.unseen
            }}</span>
          </span>
          <span v-if="peerLine(person.other)" class="mono peer-meta">{{
            peerLine(person.other)
          }}</span>
        </RouterLink>
      </section>

      <section class="stack rule" aria-labelledby="mine">
        <h2 id="mine" class="display display-md">Your challenges</h2>
        <template v-if="cockpit.challenges.length === 0">
          <p class="empty">You have not asked for help yet.</p>
          <RouterLink to="/ask" class="row-link">Ask for help</RouterLink>
        </template>
        <ChallengeCard
          v-for="challenge in cockpit.challenges"
          :key="challenge.id"
          :kicker="challenge.trend?.short ?? 'No trend yet'"
          :body="challenge.body"
          :counts="challenge.counts"
          :to="matchesPath(challenge.id)"
        />
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
