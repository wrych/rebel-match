<script setup lang="ts">
/** A member's photo, round, filling the width its place gives it, or their
 * initials where there is none. Never a link, never enlarged, never dragged
 * out of the page (R-PROF-6). */
import { computed } from 'vue'
import { initials } from '../lib/makers'

const props = defineProps<{ name: string; src: string | null }>()

const letters = computed(() => initials(props.name).slice(0, 2))
</script>

<template>
  <span class="member-photo-box">
    <img
      v-if="props.src"
      class="member-photo"
      :src="props.src"
      alt=""
      draggable="false"
    />
    <span
      v-else
      class="member-photo member-photo-initials"
      aria-hidden="true"
      >{{ letters }}</span
    >
  </span>
</template>

<style scoped>
.member-photo-box {
  display: block;
  container-type: inline-size;
}

.member-photo {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 999px;
  border: var(--sticker-border);
  object-fit: cover;
  pointer-events: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.member-photo-initials {
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-size: 40cqi;
  line-height: 1;
}
</style>
