<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CardDeck from '../components/CardDeck.vue'
import { gameOpen } from '../lib/game'
import { initials, makers } from '../lib/makers'
import { currentMood } from '../lib/mood'
import { touchScreen, watchLandscape } from '../lib/orientation'

const router = useRouter()
const index = ref(0)
const maker = computed(() => makers[index.value])
const open = ref(false)
const touch = touchScreen()
const { landscape, stop } = watchLandscape()
// The community card is the door to 9toRevolution, in happy mode only, for a
// member who may play while hosts have the game on; calm mode closes it at
// once, whenever the answer about it arrives (R-GAME-1, ADR 0046).
const door = computed(
  () =>
    currentMood.value === 'happy' &&
    open.value &&
    index.value === makers.length - 1,
)

watch(
  currentMood,
  async (mood) => {
    if (mood === 'happy' && !open.value) open.value = await gameOpen()
  },
  { immediate: true },
)
watch(landscape, async (wide) => {
  if (wide && touch && door.value) await router.push('/9torevolution')
})
onUnmounted(stop)
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Impressum</p>
      <h1 class="display display-lg">Made by rebels</h1>
      <p class="lede">
        Rebel Match connects rebels through shared challenges. It is a free,
        non-commercial community project, built in our spare time. The beta
        launches at the Global CR Summit 2026.
      </p>
    </div>

    <CardDeck
      v-if="maker"
      :index="index"
      :count="makers.length"
      noun="maker"
      @browse="index = $event"
    >
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
        <a v-if="maker.email" :href="`mailto:${maker.email}`" class="mono">{{
          maker.email
        }}</a>
      </div>
      <svg
        v-if="door && touch"
        viewBox="0 0 24 24"
        role="img"
        aria-label="Turn your phone sideways"
        class="turn"
      >
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M3 14a9 9 0 0 0 7 7M21 10a9 9 0 0 0-7-7" />
      </svg>
      <RouterLink
        v-else-if="door"
        to="/9torevolution"
        class="btn btn-ghost btn-small"
        >Be a rebel</RouterLink
      >
    </CardDeck>

    <p class="small">
      A joint initiative supported by
      <a href="https://xigo.ch" target="_blank" rel="noopener noreferrer"
        >xigo.ch</a
      >
      and
      <a
        href="https://transformation-architects.ch"
        target="_blank"
        rel="noopener noreferrer"
        >transformation-architects.ch</a
      >.
    </p>

    <div class="stack-tight">
      <h2 class="kicker kicker-ink">Tell us what you think</h2>
      <p class="small">
        Rebel Match is a beta, and your feedback shapes what comes next. Tell us
        what works, what doesn’t and what you miss: use Feedback in the menu
        once you are signed in, or write to any of us.
      </p>
    </div>

    <div class="stack-tight">
      <h2 class="kicker kicker-ink">Please share responsibly</h2>
      <p class="small">
        Describe your challenges in general terms. Don’t share confidential
        company information, names of other people, or anything you’re not
        allowed to share.
      </p>
    </div>

    <div class="stack-tight">
      <RouterLink to="/privacy" class="row-link">
        <span class="row-link-label">Your data: the privacy notice</span>
      </RouterLink>
      <RouterLink to="/terms" class="row-link">
        <span class="row-link-label">Terms of use and disclaimer</span>
      </RouterLink>
    </div>

    <p class="footnote">Beta, October 2026 · No ads, no fees</p>
  </section>
</template>

<style scoped>
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

.deck-author a {
  color: var(--card-meta);
  overflow-wrap: anywhere;
}

.small a {
  color: inherit;
}

.turn {
  justify-self: end;
  width: 1.4rem;
  height: 1.4rem;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.6;
  animation: tilt 2.4s ease-in-out infinite;
}

@keyframes tilt {
  0%,
  60%,
  100% {
    transform: rotate(0deg);
  }

  30% {
    transform: rotate(-90deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .turn {
    animation: none;
  }
}
</style>
