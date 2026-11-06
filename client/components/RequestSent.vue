<script setup lang="ts">
/** A request on its way, or one already waiting, with no contact detail
 * yet: S13 (R-CONN-1, R-CONN-5). */
defineProps<{
  firstName: string
  outcome: 'created' | 'exists'
  backTo: string
  backLabel: string
}>()
</script>

<template>
  <div class="stack">
    <p class="kicker kicker-accent">
      {{ outcome === 'created' ? 'Request sent' : 'Already asked' }}
    </p>
    <h1 class="display display-lg">Over to {{ firstName }}</h1>
    <p class="lede">
      {{
        outcome === 'created'
          ? `We let ${firstName} know.`
          : `You already asked ${firstName}, and they have not answered yet.`
      }}
      When they accept, you both get each other’s contact.
    </p>
  </div>
  <RouterLink :to="backTo" class="row-link">{{ backLabel }}</RouterLink>
</template>
