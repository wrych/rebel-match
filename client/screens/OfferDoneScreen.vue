<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { readTally, tallyLine } from '../lib/offer-session'

const summary = tallyLine(readTally())
const trustShown = ref(false)
const trustCard = ref<HTMLElement | null>(null)
const emptyCard = ref<HTMLElement | null>(null)

async function revealTrust(): Promise<void> {
  trustShown.value = true
  await nextTick()
  trustCard.value?.focus()
}

async function dismissTrust(): Promise<void> {
  trustShown.value = false
  await nextTick()
  emptyCard.value?.focus()
}
</script>

<template>
  <section class="screen">
    <div class="stack">
      <h1 class="display display-lg">That’s everyone for now</h1>
      <p class="lede">
        {{ summary }}. What members swipe tells HQ which topics need a session.
      </p>
    </div>

    <article
      v-if="trustShown"
      ref="trustCard"
      class="trend-card trust"
      tabindex="-1"
      aria-labelledby="trust-title"
    >
      <p class="kicker kicker-accent">Trend 0</p>
      <h2 id="trust-title" class="trend-title">Trust</h2>
      <p class="mono trend-from">Rules → Trust</p>
      <p class="mono trend-from">Peers: everyone in the room</p>
      <p class="small trust-credit">
        With thanks to the Corporate Rebels bucket list.
      </p>
      <button
        type="button"
        class="btn btn-ghost btn-small"
        @click="dismissTrust"
      >
        Back
      </button>
    </article>
    <button
      v-else
      ref="emptyCard"
      type="button"
      class="empty empty-card"
      aria-label="No more cards"
      @click="revealTrust"
      @keydown.right.prevent="revealTrust"
    >
      No more cards
    </button>

    <RouterLink to="/ask" class="btn btn-dark"
      >Submit your challenge</RouterLink
    >
  </section>
</template>
