<script setup lang="ts">
import { pathTo } from '../../src/routes'
import { peerLine, type PeerCard } from '../lib/challenges'
import { photoSrc } from '../lib/photo'
import type { Arrivals } from '../lib/live-list'
import { reportPath } from '../lib/reports'
import MemberPhoto from './MemberPhoto.vue'
import ConnectMark from './ConnectMark.vue'

const props = defineProps<{
  peers: PeerCard[]
  challengeId: string
  kind: 'same_boat' | 'been_there'
  action: string
  nobody: string
  /** Outlines the rebels a refresh brought (R-NAV-12). */
  arrived?: Arrivals<PeerCard>
  /** Draws each rebel's photo beside their name (R-PROF-7). */
  photosOn?: boolean
}>()
const emit = defineEmits<{ connect: [] }>()

// Connecting goes through the double opt-in screen, never a direct email
// (R-ASK-10, R-CONN-1).
function connectPath(peer: PeerCard): string {
  const path = pathTo('connect', {
    challengeId: props.challengeId,
    memberId: peer.memberId,
  })
  return `${path}?kind=${props.kind}`
}
</script>

<template>
  <p v-if="peers.length === 0" class="empty">{{ nobody }}</p>
  <ul v-else class="stack peer-list" :class="`peer-${kind}`">
    <li
      v-for="peer in peers"
      :key="peer.memberId"
      class="card peer"
      :class="{ 'card-new': arrived?.isNew(peer) }"
      @click="arrived?.clear(peer)"
    >
      <div :class="{ 'with-photo': photosOn }">
        <MemberPhoto
          v-if="photosOn"
          :name="peer.name"
          :src="photoSrc(peer.photo)"
        />
        <div class="stack-tight">
          <span class="card-title">{{ peer.name }}</span>
          <span v-if="peerLine(peer)" class="mono peer-meta">{{
            peerLine(peer)
          }}</span>
        </div>
      </div>
      <p class="small peer-note">{{ peer.note }}</p>
      <RouterLink
        :to="connectPath(peer)"
        :class="[
          'btn',
          'btn-small',
          kind === 'same_boat' ? 'btn-primary' : 'btn-dark',
        ]"
        @click="emit('connect')"
        ><ConnectMark />{{ action }}</RouterLink
      >
      <RouterLink
        v-if="peer.challengeId"
        :to="reportPath({ challengeId: peer.challengeId })"
        class="small report-link"
        >Report</RouterLink
      >
    </li>
  </ul>
</template>
