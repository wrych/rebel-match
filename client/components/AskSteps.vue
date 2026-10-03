<script setup lang="ts">
defineProps<{ current: 1 | 2 | 3 }>()

const steps = ['Describe', 'Domain', 'Matches'] as const
</script>

<template>
  <ol class="steps" aria-label="Ask for help">
    <li
      v-for="(label, index) in steps"
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
