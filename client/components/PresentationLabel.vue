<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name: string
  photo: string | null
  at: { x: number; y: number }
  opacity: number
}>()

const initials = computed(() =>
  props.name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase(),
)
const place = computed(() => ({
  left: `${String(props.at.x)}px`,
  top: `${String(props.at.y)}px`,
  opacity: String(props.opacity),
}))
</script>

<template>
  <div class="tag" :style="place">
    <span class="pointer" aria-hidden="true" />
    <div class="card">
      <img v-if="props.photo" class="photo" :src="props.photo" alt="" />
      <span v-else class="photo initials" aria-hidden="true">{{
        initials
      }}</span>
      <span class="name">{{ props.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.tag {
  position: absolute;
  pointer-events: none;
}

.pointer {
  position: absolute;
  left: 0;
  bottom: 0.6rem;
  height: 2rem;
  border-left: 2px solid var(--accent);
}

.card {
  position: absolute;
  bottom: 2.6rem;
  left: 0;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.5rem 1.1rem 0.5rem 0.5rem;
  transform: translateX(-50%);
  border: 2px solid var(--accent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--paper) 85%, transparent);
  white-space: nowrap;
}

.photo {
  width: 3.4rem;
  height: 3.4rem;
  border-radius: 50%;
  object-fit: cover;
}

.initials {
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-mono);
  font-weight: 700;
}

.name {
  font-family: var(--font-display);
  font-size: 1.6rem;
  letter-spacing: 0.02em;
  color: var(--ink);
}
</style>
