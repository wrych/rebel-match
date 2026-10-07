<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CardDeck from '../components/CardDeck.vue'
import { gameOpen } from '../lib/game'
import { initials, makers } from '../lib/makers'
import { currentMood } from '../lib/mood'

const index = ref(0)
const maker = computed(() => makers[index.value])
const open = ref(false)
// The last card leads to 9toRevolution, in happy mode only, for a member
// who may play while hosts have the game on (R-GAME-1, R-PROF-4). Calm mode
// hides it at once, whenever the answer about the door arrives.
const door = computed(() => currentMood.value === 'happy' && open.value)
const count = computed(() => makers.length + (door.value ? 1 : 0))

watch(
  currentMood,
  async (mood) => {
    if (mood === 'happy' && !open.value) open.value = await gameOpen()
  },
  { immediate: true },
)
watch(count, (cards) => {
  if (index.value >= cards) index.value = cards - 1
})
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Impressum</p>
      <h1 class="display display-lg">Made by rebels</h1>
    </div>

    <CardDeck
      :index="index"
      :count="count"
      noun="maker"
      @browse="index = $event"
    >
      <template v-if="maker">
        <img
          v-if="maker.portrait"
          :src="maker.portrait"
          :alt="`Portrait of ${maker.name}`"
          class="portrait"
          width="480"
          height="480"
        />
        <span v-else class="portrait portrait-initials" aria-hidden="true">{{
          initials(maker.name)
        }}</span>
        <div class="deck-author">
          <p class="deck-text">{{ maker.name }}</p>
          <span class="mono">{{ maker.responsibilities.join(' · ') }}</span>
        </div>
      </template>
      <template v-else>
        <svg
          class="portrait boss"
          viewBox="0 0 64 64"
          role="img"
          aria-label="A boss in a grey suit"
        >
          <circle cx="32" cy="32" r="31" class="boss-ground" />
          <path d="M14 60c2-14 9-20 18-20s16 6 18 20z" class="boss-suit" />
          <path d="M29 40h6l-1 4 2 12-4 4-4-4 2-12z" class="boss-tie" />
          <circle cx="32" cy="27" r="10" class="boss-face" />
          <path
            d="M22 25c1-8 6-11 10-11s9 3 10 11c-3-3-6-4-10-4s-7 1-10 4z"
            class="boss-hair"
          />
        </svg>
        <div class="deck-author">
          <p class="deck-text">9toRevolution</p>
          <span class="mono">A game · grey office · colourful ending</span>
        </div>
        <RouterLink to="/9torevolution" class="btn btn-dark"
          >Be a rebel</RouterLink
        >
      </template>
    </CardDeck>
  </section>
</template>

<style scoped>
.boss {
  display: block;
}

.boss-ground {
  fill: var(--paper);
}

.boss-suit {
  fill: #5d5b57;
}

.boss-tie {
  fill: #2c2b29;
}

.boss-face {
  fill: #c9c5bd;
}

.boss-hair {
  fill: #3a3936;
}

.portrait {
  justify-self: center;
  width: min(100%, 14rem);
  height: auto;
  aspect-ratio: 1;
  border-radius: 999px;
  border: var(--sticker-border);
  object-fit: cover;
}

.portrait-initials {
  display: grid;
  place-items: center;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 4rem;
}
</style>
