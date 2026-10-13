<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
import DoneNotice from '../components/DoneNotice.vue'
import { askJourney } from '../lib/steps'
import CaseList from '../components/CaseList.vue'
import ChallengeCard from '../components/ChallengeCard.vue'
import FollowButton from '../components/FollowButton.vue'
import MatchesFold from '../components/MatchesFold.vue'
import PeerCards from '../components/PeerCards.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import type { Variant } from '../../src/experiments'
import { fetchConfig } from '../lib/api'
import {
  fetchChallenge,
  fetchMatches,
  type Challenge,
  type Matches,
  type PeerCard,
} from '../lib/challenges'
import { reportEvent } from '../lib/events'
import { reportExposure, variantOf } from '../lib/flags'
import { arrivals, useLiveList } from '../lib/live-list'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const posted = route.query.posted === '1'
const challenge = ref<Challenge | null>(null)
const matches = ref<Matches | null>(null)
const missing = ref(false)
const problem = ref<string | null>(null)
const namedFirst = ref<number | null>(null)
const shownFirst = ref<number | null>(null)
const layout = ref<Variant<'matches_layout'>>('cards')
const nobodyYet = computed(
  () =>
    matches.value !== null &&
    matches.value.sameBoat.length === 0 &&
    matches.value.beenThere.length === 0,
)

const byMember = (peer: PeerCard): string => peer.memberId
const nameOf = (peer: PeerCard): string => peer.name
const sameBoatArrived = arrivals(byMember)
const beenThereArrived = arrivals(byMember)

function show(matched: Matches): void {
  sameBoatArrived.see(matched.sameBoat)
  beenThereArrived.see(matched.beenThere)
  matches.value = matched
}

// Only once the first read showed them; a failed refresh keeps them shown
// (R-NAV-12).
async function newer(): Promise<void> {
  if (matches.value === null) return
  const matched = await fetchMatches(id)
  if (matched !== null) show(matched)
}

const live = useLiveList(newer, 'challengeMatchesPollSeconds')

// Without the limits nothing is folded: every match shows, as before.
async function loadLimits(): Promise<void> {
  try {
    const { limits } = await fetchConfig()
    namedFirst.value = limits.matchesNamedFirst
    shownFirst.value = limits.matchesShownFirst
  } catch {
    namedFirst.value = null
    shownFirst.value = null
  }
}

function opened(section: 'same_boat' | 'been_there' | 'cases'): void {
  reportEvent({ event: 'matches_section_opened', props: { section } })
}

function connectTapped(kind: 'same_boat' | 'been_there'): void {
  reportEvent({ event: 'match_connect_tapped', props: { kind } })
}

onMounted(async () => {
  // Dropped from the URL at once, so going back, reloading or bookmarking
  // never announces the post a second time.
  if (posted) void router.replace({ query: {} })
  void loadLimits()
  try {
    // Read once, so the layout stays what the screen opened with (R-ASK-16).
    const [found, matched, assigned] = await Promise.all([
      fetchChallenge(id),
      fetchMatches(id),
      variantOf('matches_layout'),
    ])
    missing.value = found === null || matched === null
    challenge.value = found
    layout.value = assigned.variant
    if (matched === null) return
    show(matched)
    if (assigned.assigned) reportExposure('matches_layout', assigned.variant)
  } catch {
    problem.value = 'Your matches could not be loaded. Reload to try again.'
  }
})
</script>

<template>
  <AskSteps v-if="!posted" :journey="askJourney" :current="3" />
  <section class="screen">
    <PullToRefresh :live="live" />
    <p v-if="missing" class="empty">There is no challenge of yours here.</p>

    <template v-else-if="challenge && matches">
      <DoneNotice v-if="posted">
        <strong>Your challenge is live.</strong> Rebels who can help will now
        see it.
      </DoneNotice>

      <div v-if="layout === 'cards'" class="stack-tight">
        <p class="kicker">Your challenge · {{ matches.trend.short }}</p>
        <p class="mine">{{ challenge.body }}</p>
      </div>
      <ChallengeCard
        v-else
        :kicker="`Your challenge · ${matches.trend.short}`"
        :body="challenge.body"
        :counts="{
          sameBoat: matches.sameBoat.length,
          beenThere: matches.beenThere.length,
          cases: matches.cases.length,
        }"
      />

      <h1 class="display display-lg rule">Your matches</h1>

      <section class="stack" aria-labelledby="same-boat">
        <div class="stack-tight">
          <h2 id="same-boat" class="display display-md kicker-accent">
            Same boat: rebels facing this now
          </h2>
          <p class="small purpose">Connect and compare notes.</p>
        </div>
        <MatchesFold
          v-slot="{ shown }"
          :layout="layout"
          section="sameBoat"
          :names="matches.sameBoat.map(nameOf)"
          :shown-first="shownFirst"
          :named-first="namedFirst"
          @opened="opened('same_boat')"
        >
          <PeerCards
            :peers="matches.sameBoat.slice(0, shown)"
            :challenge-id="id"
            kind="same_boat"
            :arrived="sameBoatArrived"
            action="Connect"
            nobody="You’re the first rebel here. Others will find your challenge in their deck."
            @connect="connectTapped('same_boat')"
          />
        </MatchesFold>
      </section>

      <section class="stack rule" aria-labelledby="been-there">
        <div class="stack-tight">
          <h2 id="been-there" class="display display-md">
            Been there: rebels who’ve solved it
          </h2>
          <p class="small purpose">Ask how they did it.</p>
        </div>
        <MatchesFold
          v-slot="{ shown }"
          :layout="layout"
          section="beenThere"
          :names="matches.beenThere.map(nameOf)"
          :shown-first="shownFirst"
          :named-first="namedFirst"
          @opened="opened('been_there')"
        >
          <PeerCards
            :peers="matches.beenThere.slice(0, shown)"
            :challenge-id="id"
            kind="been_there"
            :arrived="beenThereArrived"
            action="Ask them"
            nobody="No one has shared experience here yet. Rebels who have will see your challenge."
            @connect="connectTapped('been_there')"
          />
        </MatchesFold>
      </section>

      <RouterLink v-if="nobodyYet" to="/offer" class="btn btn-dark"
        >Help another rebel meanwhile</RouterLink
      >

      <section class="stack rule" aria-labelledby="cases">
        <div class="stack-tight">
          <h2 id="cases" class="display display-md">Case studies</h2>
          <p class="small purpose">Read how they made the shift.</p>
        </div>
        <MatchesFold
          v-slot="{ shown }"
          :layout="layout"
          section="cases"
          :names="matches.cases.map((study) => study.org)"
          :shown-first="shownFirst"
          :named-first="namedFirst"
          @opened="opened('cases')"
        >
          <CaseList :cases="matches.cases.slice(0, shown)" />
        </MatchesFold>
        <RouterLink
          :to="`/trends/${encodeURIComponent(matches.trend.id)}`"
          class="row-link"
          >More on {{ matches.trend.short }}</RouterLink
        >
      </section>

      <div class="stack rule">
        <FollowButton :trend="matches.trend" />
      </div>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.purpose {
  margin: 0;
  color: var(--muted);
}

.fold {
  justify-self: start;
}
</style>
