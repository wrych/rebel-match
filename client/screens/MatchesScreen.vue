<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
import DoneNotice from '../components/DoneNotice.vue'
import { askJourney } from '../lib/steps'
import CaseList from '../components/CaseList.vue'
import ChallengeCard from '../components/ChallengeCard.vue'
import FollowButton from '../components/FollowButton.vue'
import MatchesSummary from '../components/MatchesSummary.vue'
import PeerCards from '../components/PeerCards.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import { fetchConfig } from '../lib/api'
import {
  fetchChallenge,
  fetchMatches,
  type Challenge,
  type Matches,
  type PeerCard,
} from '../lib/challenges'
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

// Without the limit nothing is folded: every match shows, as before.
async function loadNamedFirst(): Promise<void> {
  try {
    namedFirst.value = (await fetchConfig()).limits.matchesNamedFirst
  } catch {
    namedFirst.value = null
  }
}

onMounted(async () => {
  // Dropped from the URL at once, so going back, reloading or bookmarking
  // never announces the post a second time.
  if (posted) void router.replace({ query: {} })
  void loadNamedFirst()
  try {
    const [found, matched] = await Promise.all([
      fetchChallenge(id),
      fetchMatches(id),
    ])
    missing.value = found === null || matched === null
    challenge.value = found
    if (matched !== null) show(matched)
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

      <ChallengeCard
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
        <MatchesSummary
          section="sameBoat"
          :names="matches.sameBoat.map(nameOf)"
          :named="namedFirst"
        >
          <PeerCards
            :peers="matches.sameBoat"
            :challenge-id="id"
            kind="same_boat"
            :arrived="sameBoatArrived"
            action="Connect"
            nobody="You’re the first rebel here. Others will find your challenge in their deck."
          />
        </MatchesSummary>
      </section>

      <section class="stack rule" aria-labelledby="been-there">
        <div class="stack-tight">
          <h2 id="been-there" class="display display-md">
            Been there: rebels who’ve solved it
          </h2>
          <p class="small purpose">Ask how they did it.</p>
        </div>
        <MatchesSummary
          section="beenThere"
          :names="matches.beenThere.map(nameOf)"
          :named="namedFirst"
        >
          <PeerCards
            :peers="matches.beenThere"
            :challenge-id="id"
            kind="been_there"
            :arrived="beenThereArrived"
            action="Ask them"
            nobody="No one has shared experience here yet. Rebels who have will see your challenge."
          />
        </MatchesSummary>
      </section>

      <RouterLink v-if="nobodyYet" to="/offer" class="btn btn-dark"
        >Help another rebel meanwhile</RouterLink
      >

      <section class="stack rule" aria-labelledby="cases">
        <div class="stack-tight">
          <h2 id="cases" class="display display-md">Case studies</h2>
          <p class="small purpose">Read how they made the shift.</p>
        </div>
        <MatchesSummary
          section="cases"
          :names="matches.cases.map((study) => study.org)"
          :named="namedFirst"
        >
          <CaseList :cases="matches.cases" />
        </MatchesSummary>
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
</style>
