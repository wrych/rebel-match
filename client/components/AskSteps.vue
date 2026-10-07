<script setup lang="ts">
import type { Journey } from '../lib/steps'

defineProps<{ journey: Journey; current: 1 | 2 | 3 }>()
</script>

<template>
  <ol class="steps" :aria-label="journey.name">
    <li
      v-for="(label, index) in journey.labels"
      :key="label"
      :class="{
        done: index + 1 < current,
        now: index + 1 === current,
      }"
      :aria-current="index + 1 === current ? 'step' : undefined"
    >
      <span class="step-number">{{ index + 1 }}</span> {{ label }}
    </li>
  </ol>
</template>
