<script setup lang="ts">
defineProps<{ play?: boolean }>()

const R =
  'M 39.643585,106.78487 V 85.48201 h 9.583887 9.583888 l 9.120152,21.14849 9.120151,21.14849 22.171824,0.16184 22.171823,0.16184 -10.41248,-21.4647 C 105.25597,94.832385 99.816648,83.729507 98.895457,81.964908 c -0.92119,-1.764599 -1.674896,-3.333348 -1.674896,-3.486105 0,-0.152763 1.323794,-1.170533 2.941769,-2.261721 7.38226,-4.978694 14.15185,-15.463931 16.185,-25.068507 1.43469,-6.777433 0.93807,-17.397044 -1.10397,-23.607207 C 112.26241,18.475884 106.64219,11.194155 98.881204,6.3420655 89.738315,0.62602927 85.037725,0.17270381 37.293505,0.40254252 L 0.5734947,0.57931118 0.42386977,64.33352 0.27424542,128.08773 H 19.958915 39.643585 Z m 0,-63.291104 V 29.909335 l 14.834884,0.02966 c 12.754546,0.0255 15.115889,0.177032 16.838733,1.08058 7.122842,3.735581 8.590749,16.524336 2.598702,22.64043 -1.172109,1.196375 -3.083758,2.453342 -4.248106,2.793268 -1.164353,0.339919 -8.396127,0.619592 -16.070609,0.621482 l -13.953604,0.0034 z'
const PLACED = 'translate(44.6 142) scale(1.61)'
const MIRRORED = `translate(480 0) scale(-1 1) ${PLACED}`
</script>

<template>
  <svg
    class="rebel-mark"
    :class="{ 'rebel-mark-play': play }"
    viewBox="38 43 404 404"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="38" y="43" width="404" height="404" fill="#000" />
    <g class="rebel-mark-rs" fill="#fff">
      <g class="rebel-mark-left">
        <path fill-rule="evenodd" :d="R" :transform="PLACED" />
      </g>
      <g class="rebel-mark-right">
        <path fill-rule="evenodd" :d="R" :transform="MIRRORED" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.rebel-mark {
  --rebel-mark-overlap: 58px;
  display: block;
}

/* Difference against white cancels to black, so the Rs' overlap draws the figure. */
.rebel-mark-rs {
  isolation: isolate;
}

.rebel-mark-right {
  mix-blend-mode: difference;
  transform: translateX(calc(-1 * var(--rebel-mark-overlap)));
}

.rebel-mark-left {
  transform: translateX(var(--rebel-mark-overlap));
}

.rebel-mark-play .rebel-mark-left,
.rebel-mark-play .rebel-mark-right {
  animation: rebel-mark-meet var(--mark-meet) cubic-bezier(0.65, 0, 0.35, 1)
    both;
}

@keyframes rebel-mark-meet {
  from {
    transform: none;
  }
}
</style>
