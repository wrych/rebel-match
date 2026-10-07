<script setup lang="ts">
import { computed, ref } from 'vue'
import CardDeck from '../components/CardDeck.vue'
import { initials, makers } from '../lib/makers'

const index = ref(0)
const maker = computed(() => makers[index.value])
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Impressum</p>
      <h1 class="display display-lg">Made by rebels</h1>
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
      </div>
    </CardDeck>
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
</style>
