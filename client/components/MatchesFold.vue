<script setup lang="ts">
import type { Variant } from '../../src/experiments'
import { moreMatches, type MatchesSection } from '../lib/challenges'
import FoldedList from './FoldedList.vue'
import MatchesSummary from './MatchesSummary.vue'

/** A matches section folded as the member's layout has it: its first cards
 * and a count of the rest, or a sentence and its cards on a tap; the slot
 * gets how many cards to show (R-ASK-15, R-ASK-16). */
defineProps<{
  layout: Variant<'matches_layout'>
  section: MatchesSection
  names: string[]
  shownFirst: number | null
  namedFirst: number | null
}>()
const emit = defineEmits<{ opened: [] }>()
</script>

<template>
  <FoldedList
    v-if="layout === 'cards'"
    v-slot="{ shown }"
    :count="names.length"
    :first="shownFirst"
    :more="(hidden) => moreMatches(section, hidden)"
    @opened="emit('opened')"
  >
    <slot :shown="shown" />
  </FoldedList>
  <MatchesSummary
    v-else
    :section="section"
    :names="names"
    :named="namedFirst"
    @opened="emit('opened')"
  >
    <slot :shown="names.length" />
  </MatchesSummary>
</template>
