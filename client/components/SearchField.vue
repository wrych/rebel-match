<script setup lang="ts">
/** The search above a screen of folded cards (R-CFG-5, R-PROF-8). */
defineProps<{ id: string; label: string }>()
const search = defineModel<string>({ required: true })
</script>

<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <!-- Not v-model: it waits while a phone keyboard composes a word, so the
    search would only react on Enter. -->
    <input
      :id="id"
      :value="search"
      class="input"
      type="search"
      @input="search = ($event.target as HTMLInputElement).value"
    />
  </div>
</template>
