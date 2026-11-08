<script setup lang="ts">
/** A member as search and connect codes show them: their photo while
 * photos are on, name, then job title, organization, sector and company
 * size, as the deck's cards do; never an email; marked when the viewer is
 * already connected with them; a link when `to` is given (R-FIND-3,
 * R-CONN-6, R-CONN-8, R-PROF-7). */
import { peerLine } from '../lib/challenges'
import type { MemberCard } from '../lib/people'
import { photoSrc } from '../lib/photo'
import MemberPhoto from './MemberPhoto.vue'

defineProps<{
  card: MemberCard
  to?: string | undefined
  photosOn?: boolean
}>()
</script>

<template>
  <component
    :is="to === undefined ? 'div' : 'RouterLink'"
    :to="to"
    class="card peer"
  >
    <span :class="{ 'with-photo': photosOn }">
      <MemberPhoto
        v-if="photosOn"
        :name="card.name"
        :src="photoSrc(card.photo)"
      />
      <span class="stack-tight">
        <span class="card-head">
          <span class="card-title">{{ card.name }}</span>
          <span v-if="card.connectionId" class="chip chip-accent"
            >Connected</span
          >
        </span>
        <span v-if="peerLine(card)" class="mono peer-meta">{{
          peerLine(card)
        }}</span>
      </span>
    </span>
    <slot />
  </component>
</template>

<style scoped>
a.card {
  color: inherit;
  text-decoration: none;
}
</style>
