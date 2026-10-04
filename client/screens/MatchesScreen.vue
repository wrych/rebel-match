<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
import CaseList from '../components/CaseList.vue'
import FollowButton from '../components/FollowButton.vue'
import PeerCards from '../components/PeerCards.vue'
import {
  fetchChallenge,
  fetchMatches,
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
const nobodyYet = computed(
  () =>
    matches.value !== null &&
    matches.value.sameBoat.length === 0 &&
    matches.value.beenThere.length === 0,
)

onMounted(async () => {
  // Dropped from the URL at once, so going back, reloading or bookmarking
  // never announces the post a second time.
  if (posted) void router.replace({ query: {} })
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
  <AskSteps v-if="!posted" :current="3" />
  <section class="screen">
    <p v-if="missing" class="empty">There is no challenge of yours here.</p>

    <template v-else-if="challenge && matches">
      <p v-if="posted" class="notice notice-ok" role="status">
        <strong>✓ Your challenge is live.</strong> Rebels who can help will now
        see it.
      </p>

      <div class="stack-tight">
        <h1 class="display display-lg">Rebels who can help</h1>
        <p class="kicker">{{ matches.trend.short }}</p>
        <p class="mine">{{ challenge.body }}</p>
      </div>

      <section class="stack rule" aria-labelledby="same-boat">
        <div class="stack-tight">
          <h2 id="same-boat" class="display display-md kicker-accent">
            Rebels facing this now
          </h2>
          <p class="small purpose">Connect and compare notes.</p>
        </div>
        <PeerCards
          :peers="matches.sameBoat"
          :challenge-id="id"
          kind="same_boat"
          action="Connect"
          nobody="You’re the first rebel here. Others will find your challenge in their deck."
        />
      </section>

      <section class="stack rule" aria-labelledby="been-there">
        <div class="stack-tight">
          <h2 id="been-there" class="display display-md">
            Rebels who’ve been there
          </h2>
          <p class="small purpose">Ask how they solved it.</p>
        </div>
        <PeerCards
          :peers="matches.beenThere"
          :challenge-id="id"
          kind="been_there"
          action="Ask them"
          nobody="No one has shared experience here yet. Rebels who have will see your challenge."
        />
      </section>

      <RouterLink v-if="nobodyYet" to="/offer" class="btn btn-dark"
        >Help another rebel meanwhile</RouterLink
      >

      <section class="stack rule" aria-labelledby="cases">
        <div class="stack-tight">
          <h2 id="cases" class="display display-md">
            Rebel organizations that did it
          </h2>
          <p class="small purpose">Read how they made the shift.</p>
        </div>
        <CaseList :cases="matches.cases" />
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
