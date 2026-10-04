<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AnalyticsToggle from '../components/AnalyticsToggle.vue'
import { reportEvent } from '../lib/events'
import { loadMe, type Me } from '../lib/session'

const me = ref<Me | null>(null)

onMounted(async () => {
  me.value = await loadMe()
})

function chose(journey: 'ask' | 'offer'): void {
  reportEvent({ event: 'journey_chosen', props: { journey } })
}
</script>

<template>
  <section class="screen screen-hero">
    <div class="stack">
      <p class="kicker kicker-accent">You are in</p>
      <h1 class="display display-xl">
        Welcome{{ me?.name ? `, ${me.name}` : '' }}
      </h1>
      <p class="lede">
        Two doors: bring a challenge, or help someone with theirs.
      </p>
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

    <RouterLink to="/matches" class="row-link">Your matches</RouterLink>

    <AnalyticsToggle v-if="me" :opted-in="me.analyticsOptIn" />
  </section>
</template>
