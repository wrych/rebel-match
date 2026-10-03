<script setup lang="ts">
import { peerLine, type PeerCard } from '../lib/challenges'

const props = defineProps<{
  peers: PeerCard[]
  challengeId: string
  kind: 'same_boat' | 'been_there'
  action: string
  nobody: string
}>()

// Connecting goes through the double opt-in screen, never a direct email
// (R-ASK-10, R-CONN-1).
function connectPath(peer: PeerCard): string {
  const challenge = encodeURIComponent(props.challengeId)
  const member = encodeURIComponent(peer.memberId)
  return `/challenges/${challenge}/connect/${member}?kind=${props.kind}`
}
</script>

<template>
  <p v-if="peers.length === 0" class="empty">{{ nobody }}</p>
  <ul v-else class="stack peer-list" :class="`peer-${kind}`">
    <li v-for="peer in peers" :key="peer.memberId" class="card peer">
      <div class="stack-tight">
        <span class="card-title">{{ peer.name }}</span>
        <span v-if="peerLine(peer)" class="mono peer-meta">{{
          peerLine(peer)
        }}</span>
      </div>
      <p class="small peer-note">{{ peer.note }}</p>
      <RouterLink
        :to="connectPath(peer)"
        :class="[
          'btn',
          'btn-small',
          kind === 'same_boat' ? 'btn-primary' : 'btn-dark',
        ]"
        >{{ action }}</RouterLink
      >
    </li>
  </ul>
</template>
