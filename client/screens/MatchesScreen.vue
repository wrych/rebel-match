<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
import DoneNotice from '../components/DoneNotice.vue'
import { askJourney } from '../lib/steps'
import CaseList from '../components/CaseList.vue'
import FoldedList from '../components/FoldedList.vue'
import FollowButton from '../components/FollowButton.vue'
import PeerCards from '../components/PeerCards.vue'
import { fetchConfig } from '../lib/api'
import {
  fetchChallenge,
  fetchMatches,
  moreMatches,
  type Challenge,
  type Matches,
} from '../lib/challenges'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const posted = route.query.posted === '1'
const challenge = ref<Challenge | null>(null)
const matches = ref<Matches | null>(null)
const missing = ref(false)
const problem = ref<string | null>(null)
const shownFirst = ref<number | null>(null)
const nobodyYet = computed(
  () =>
    matches.value !== null &&
    matches.value.sameBoat.length === 0 &&
    matches.value.beenThere.length === 0,
)

// Without the limit nothing is folded: every match shows, as before.
async function loadShownFirst(): Promise<void> {
  try {
    shownFirst.value = (await fetchConfig()).limits.matchesShownFirst
  } catch {
    shownFirst.value = null
  }
}

onMounted(async () => {
  // Dropped from the URL at once, so going back, reloading or bookmarking
  // never announces the post a second time.
  if (posted) void router.replace({ query: {} })
  void loadShownFirst()
  try {
    const [found, matched] = await Promise.all([
      fetchChallenge(id),
      fetchMatches(id),
    ])
    missing.value = found === null || matched === null
    challenge.value = found
    matches.value = matched
  } catch {
    problem.value = 'Your matches could not be loaded. Reload to try again.'
  }
})
</script>

<template>
  <AskSteps v-if="!posted" :journey="askJourney" :current="3" />
  <section class="screen">
    <p v-if="missing" class="empty">There is no challenge of yours here.</p>

    <template v-else-if="challenge && matches">
      <DoneNotice v-if="posted">
        <strong>Your challenge is live.</strong> Rebels who can help will now
        see it.
      </DoneNotice>

      <div class="stack-tight">
        <p class="kicker">Your challenge · {{ matches.trend.short }}</p>
        <p class="mine">{{ challenge.body }}</p>
      </div>

      <h1 class="display display-lg rule">Your matches</h1>

      <section class="stack" aria-labelledby="same-boat">
        <div class="stack-tight">
          <h2 id="same-boat" class="display display-md kicker-accent">
            Same boat: rebels facing this now
          </h2>
          <p class="small purpose">Connect and compare notes.</p>
        </div>
        <FoldedList
          v-slot="{ shown }"
          :count="matches.sameBoat.length"
          :first="shownFirst"
          :more="(hidden) => moreMatches('sameBoat', hidden)"
        >
          <PeerCards
            :peers="matches.sameBoat.slice(0, shown)"
            :challenge-id="id"
            kind="same_boat"
            action="Connect"
            nobody="You’re the first rebel here. Others will find your challenge in their deck."
          />
        </FoldedList>
      </section>

      <section class="stack rule" aria-labelledby="been-there">
        <div class="stack-tight">
          <h2 id="been-there" class="display display-md">
            Been there: rebels who’ve solved it
          </h2>
          <p class="small purpose">Ask how they did it.</p>
        </div>
        <FoldedList
          v-slot="{ shown }"
          :count="matches.beenThere.length"
          :first="shownFirst"
          :more="(hidden) => moreMatches('beenThere', hidden)"
        >
          <PeerCards
            :peers="matches.beenThere.slice(0, shown)"
            :challenge-id="id"
            kind="been_there"
            action="Ask them"
            nobody="No one has shared experience here yet. Rebels who have will see your challenge."
          />
        </FoldedList>
      </section>

      <RouterLink v-if="nobodyYet" to="/offer" class="btn btn-dark"
        >Help another rebel meanwhile</RouterLink
      >

      <section class="stack rule" aria-labelledby="cases">
        <div class="stack-tight">
          <h2 id="cases" class="display display-md">Case studies</h2>
          <p class="small purpose">Read how they made the shift.</p>
        </div>
        <FoldedList
          v-slot="{ shown }"
          :count="matches.cases.length"
          :first="shownFirst"
          :more="(hidden) => moreMatches('cases', hidden)"
        >
          <CaseList :cases="matches.cases.slice(0, shown)" />
        </FoldedList>
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
