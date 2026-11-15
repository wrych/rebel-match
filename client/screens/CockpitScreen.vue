<script setup lang="ts">
import { pathTo } from '../../src/routes'
import ConnectMark from '../components/ConnectMark.vue'
import KindChip from '../components/KindChip.vue'
import { computed, onMounted, ref } from 'vue'
import ChallengeCard from '../components/ChallengeCard.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import WithdrawChallenge from '../components/WithdrawChallenge.vue'
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
import { fetchConfig } from '../lib/api'
import { useLiveResource } from '../lib/live-list'
import { searchOpen } from '../lib/people'
import SearchIcon from '../components/SearchIcon.vue'
import { loadMe } from '../lib/session'

// Marked before reading, so what arrives in between still badges the tab; a
// failed mark only leaves the badge up (R-MINE-4).
async function fetchLists(): Promise<{
  mine: Cockpit
  waiting: ConnectionView[]
  people: ConnectionView[]
}> {
  await markMatchesSeen().catch(() => undefined)
  const [mine, waiting, people] = await Promise.all([
    fetchCockpit(),
    fetchIncoming(),
    fetchConnected(),
  ])
  return { mine, waiting, people }
}

const {
  data: lists,
  problem,
  arrived,
  live,
} = useLiveResource(fetchLists, 'cockpitPollSeconds', {
  initial: null,
  failure: 'Your matches could not be loaded. Reload to try again.',
  arrivals: {
    of: (found) => found.waiting,
    id: (request: ConnectionView) => request.id,
  },
})
const cockpit = computed(() => lists.value?.mine ?? null)
const incoming = computed(() => lists.value?.waiting ?? [])
const connected = computed(() => lists.value?.people ?? [])
const people = computed(() => byMember(connected.value))
const answering = ref<string | null>(null)
const notice = ref<string | null>(null)
const waitingShown = computed(
  () => incoming.value.length > 0 || notice.value !== null,
)
const failed = ref<string | null>(null)
const withdrawnNotice = ref<string | null>(null)
const canSearch = ref(false)

const requestPath = (id: string): string => pathTo('request', { id })
const matchesPath = (id: string): string => pathTo('matches', { id })

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
    if (lists.value !== null)
      lists.value = {
        ...lists.value,
        waiting: lists.value.waiting.filter((each) => each.id !== request.id),
      }
    notice.value = afterAnswer(request, verdict, outcome)
    void live.refresh()
  } catch {
    failed.value = 'That did not save. Try again.'
  } finally {
    answering.value = null
  }
}

async function afterWithdraw(): Promise<void> {
  withdrawnNotice.value = 'Withdrawn. Nobody else sees it any more.'
  await live.refresh()
}

// Offered only while hosts have search on, to those who may search (R-FIND-1).
async function offerSearch(): Promise<void> {
  const [config, me] = await Promise.all([fetchConfig(), loadMe()])
  canSearch.value =
    me !== null && searchOpen(config.limits.memberSearch, me.permissions)
}

onMounted(() => {
  void offerSearch().catch(() => undefined)
  return live.refresh()
})
</script>

<template>
  <section class="screen">
    <PullToRefresh :live="live" />
    <h1 class="display display-lg">Your matches</h1>

    <template v-if="cockpit">
      <section v-if="waitingShown" class="stack" aria-labelledby="waiting">
        <h2 id="waiting" class="display display-md kicker-accent">
          Waiting for you
        </h2>
        <p v-if="incoming.length > 0" class="small">
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
              <KindChip :kind="request.kind" />
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
              <ConnectMark />Accept
            </button>
          </div>
        </div>
      </section>

      <section
        class="stack"
        :class="{ rule: waitingShown }"
        aria-labelledby="connections"
      >
        <div class="title-row">
          <h2 id="connections" class="display display-md">Your connections</h2>
          <RouterLink
            v-if="canSearch"
            to="/people"
            class="btn btn-small btn-ghost"
            aria-label="Search members"
            ><SearchIcon />Search</RouterLink
          >
        </div>
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
        <div class="title-row">
          <h2 id="mine" class="display display-md">Your challenges</h2>
          <RouterLink to="/ask" class="btn btn-small btn-ghost"
            >Ask for help</RouterLink
          >
        </div>
        <p v-if="cockpit.challenges.length === 0" class="empty">
          You have not asked for help yet.
        </p>
        <p v-if="withdrawnNotice" class="notice notice-solid" role="status">
          {{ withdrawnNotice }}
        </p>
        <div
          v-for="challenge in cockpit.challenges"
          :key="challenge.id"
          class="stack-tight"
        >
          <WithdrawChallenge
            :challenge-id="challenge.id"
            :offered="!challenge.withdrawn"
            @withdrawn="afterWithdraw"
          >
            <ChallengeCard
              :kicker="challenge.trend?.short ?? 'No trend yet'"
              :body="challenge.body"
              :counts="challenge.counts"
              :withdrawn="challenge.withdrawn"
              :hidden-reason="challenge.hiddenReason"
              :to="challenge.counts ? matchesPath(challenge.id) : undefined"
            />
          </WithdrawChallenge>
        </div>
      </section>

      <section class="stack rule" aria-labelledby="following">
        <h2 id="following" class="display display-md">Following</h2>
        <p v-if="cockpit.following.length === 0" class="empty">
          You follow no trends yet.
        </p>
        <ul v-else class="follow-list">
          <li v-for="trend in cockpit.following" :key="trend.id">
            <RouterLink
              :to="pathTo('trend', { trendId: trend.id })"
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
