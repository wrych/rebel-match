<script setup lang="ts">
import { computed } from 'vue'
import { initials } from '../lib/makers'

const props = defineProps<{ name: string; src: string | null }>()

const letters = computed(() => initials(props.name).slice(0, 2))
</script>

<template>
  <img v-if="props.src" class="member-photo" :src="props.src" alt="" />
  <span v-else class="member-photo member-photo-initials" aria-hidden="true">{{
    letters
  }}</span>
</template>

<style scoped>
.member-photo {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 999px;
  border: var(--sticker-border);
  object-fit: cover;
}

.member-photo-initials {
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-size: 2.5rem;
}
</style>
