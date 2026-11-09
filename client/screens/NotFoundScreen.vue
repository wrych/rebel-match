<script setup lang="ts">
import { feedbackPath } from '../lib/feedback'

const feedback = feedbackPath('not-found')
</script>

<template>
  <section class="screen screen-hero">
    <div class="stack">
      <p class="kicker kicker-accent">404</p>
      <h1 class="display display-xl">Not here</h1>
      <p class="lede">
        That page does not exist. It may have been a link to something you
        cannot see.
      </p>
    </div>
    <div class="stack">
      <RouterLink to="/" class="btn btn-dark">Start again</RouterLink>
      <p class="small">
        Did a link in the app bring you here?
        <RouterLink :to="feedback">Tell us in the feedback form</RouterLink>.
      </p>
    </div>
  </section>
</template>
