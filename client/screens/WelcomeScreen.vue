<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { fetchConfig } from '../lib/api'
import { fetchMatchesNews, NO_NEWS, type MatchesNews } from '../lib/cockpit'
import { reportEvent } from '../lib/events'
import { poll } from '../lib/poll'
import { loadMe, type Me } from '../lib/session'
import { matchesBadge, matchesLabel } from '../lib/tabs'

const MS_PER_SECOND = 1000
const me = ref<Me | null>(null)
const news = ref<MatchesNews>(NO_NEWS)
const badge = computed(() => matchesBadge(news.value))
let stopPolling: (() => void) | undefined
let gone = false

// This screen has no tab bar, so its matches link carries the badge, read now
// and on the same timer as the tab's (R-MINE-4, R-CONN-7). A failed read
// shows none.
async function readNews(): Promise<void> {
  try {
    news.value = await fetchMatchesNews()
  } catch {
    news.value = NO_NEWS
  }
}

async function startPolling(): Promise<void> {
  const config = await fetchConfig().catch(() => null)
  if (config === null || gone) return
  stopPolling = poll(() => {
    void readNews()
  }, config.limits.matchesPollSeconds * MS_PER_SECOND)
}

onMounted(async () => {
  void readNews()
  void startPolling()
  me.value = await loadMe()
})

onUnmounted(() => {
  gone = true
  stopPolling?.()
})

function chose(journey: 'ask' | 'offer'): void {
  reportEvent({ event: 'journey_chosen', props: { journey } })
}
</script>

<template>
  <section class="screen screen-hero">
    <div class="stack">
      <h1 class="display display-xl">
        Welcome{{ me?.name ? `, ${me.name}` : '' }}
      </h1>
      <p class="lede">Bring a challenge, or help someone with theirs.</p>
    </div>

    <div class="stack">
      <RouterLink to="/ask" class="door door-ask" @click="chose('ask')">
        <span class="door-title">Ask for help</span>
        <span class="door-body">
          Bring your challenge and we find the members living it, the ones who
          solved it, and the case studies that apply.
        </span>
      </RouterLink>
      <RouterLink to="/offer" class="door door-offer" @click="chose('offer')">
        <span class="door-title">Offer help</span>
        <span class="door-body">
          Swipe through other members’ challenges and say where you can share
          experience or where you’re in the same boat.
        </span>
      </RouterLink>
    </div>

    <RouterLink
      to="/matches"
      class="row-link"
      :aria-label="`Your ${matchesLabel(news).toLowerCase()}`"
    >
      <span class="row-link-label">
        Your matches
        <span v-if="badge > 0" class="badge" aria-hidden="true">{{
          badge
        }}</span>
      </span>
    </RouterLink>
  </section>
</template>
