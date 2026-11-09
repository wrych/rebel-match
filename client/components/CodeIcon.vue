<script setup lang="ts">
/** A QR mark beside a way to a code; `live` adds the spinning ring the live
 * code wears, for the code that connects at once (R-CODE-1, R-CODE-5). */
defineProps<{ live?: boolean }>()
</script>

<template>
  <svg
    class="code-icon"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    aria-hidden="true"
    focusable="false"
  >
    <path
      class="qr"
      d="M3 3h6v6H3zM3 15h6v6H3zM15 15h2v2h-2zM19 19h2v2h-2zM15 19h2v2h-2zM19 15h2v2h-2z"
    />
    <rect class="qr-eye" x="5" y="5" width="2" height="2" />
    <rect class="qr-eye" x="5" y="17" width="2" height="2" />
    <path v-if="!live" class="qr" d="M15 3h6v6h-6z" />
    <rect v-if="!live" class="qr-eye" x="17" y="5" width="2" height="2" />
    <g v-if="live" class="spinner">
      <circle class="spinner-track" cx="18" cy="6" r="4" />
      <circle class="spinner-arc" cx="18" cy="6" r="4" />
    </g>
  </svg>
</template>

<style scoped>
.code-icon {
  flex: none;
  overflow: visible;
}

.qr {
  fill: none;
  stroke: currentcolor;
  stroke-width: 2;
  stroke-linejoin: round;
}

.qr-eye {
  fill: currentcolor;
}

.spinner circle {
  fill: none;
  stroke-width: 2.5;
}

.spinner-track {
  stroke: currentcolor;
  opacity: 0.2;
}

.spinner-arc {
  stroke: var(--accent);
  stroke-dasharray: 17 25.2;
  stroke-linecap: round;
}

.spinner {
  transform-origin: 18px 6px;
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
