<script setup lang="ts">
/** A member as search and connect codes show them: name, then job title,
 * organization, sector and company size, as the deck's cards do; never an
 * email; a link when `to` is given (R-FIND-3, R-CONN-6). */
import { peerLine } from '../lib/challenges'
import type { MemberCard } from '../lib/people'

defineProps<{ card: MemberCard; to?: string | undefined }>()
</script>

<template>
  <component
    :is="to === undefined ? 'div' : 'RouterLink'"
    :to="to"
    class="card peer"
  >
    <span class="stack-tight">
      <span class="card-title">{{ card.name }}</span>
      <span v-if="peerLine(card)" class="mono peer-meta">{{
        peerLine(card)
      }}</span>
    </span>
    <slot />
  </component>
</template>
