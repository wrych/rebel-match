<script setup lang="ts">
import { currentMood } from '../lib/mood'
</script>

<template>
  <slot v-if="currentMood === 'happy'" />
  <section v-else class="screen screen-hero">
    <div class="stack">
      <p class="kicker kicker-accent">9toRevolution</p>
      <h1 class="display display-lg">Nobody here</h1>
      <p class="lede">The rebels only come out in happy mode.</p>
    </div>
    <RouterLink to="/impressum" class="btn btn-dark"
      >Back to the impressum</RouterLink
    >
  </section>
</template>
