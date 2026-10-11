<script setup lang="ts">
import { useId } from 'vue'

defineProps<{ play?: boolean }>()

const OUTLINE =
  'M 39.643585,106.78487 V 85.48201 h 9.583887 9.583888 l 9.120152,21.14849 9.120151,21.14849 22.171824,0.16184 22.171823,0.16184 -10.41248,-21.4647 C 105.25597,94.832385 99.816648,83.729507 98.895457,81.964908 c -0.92119,-1.764599 -1.674896,-3.333348 -1.674896,-3.486105 0,-0.152763 1.323794,-1.170533 2.941769,-2.261721 7.38226,-4.978694 14.15185,-15.463931 16.185,-25.068507 1.43469,-6.777433 0.93807,-17.397044 -1.10397,-23.607207 C 112.26241,18.475884 106.64219,11.194155 98.881204,6.3420655 89.738315,0.62602927 85.037725,0.17270381 37.293505,0.40254252 L 0.5734947,0.57931118 0.42386977,64.33352 0.27424542,128.08773 H 19.958915 39.643585 Z'
const COUNTER =
  'M 39.643585,43.493766 V 29.909335 l 14.834884,0.02966 c 12.754546,0.0255 15.115889,0.177032 16.838733,1.08058 7.122842,3.735581 8.590749,16.524336 2.598702,22.64043 -1.172109,1.196375 -3.083758,2.453342 -4.248106,2.793268 -1.164353,0.339919 -8.396127,0.619592 -16.070609,0.621482 l -13.953604,0.0034 z'
const R = `${OUTLINE} ${COUNTER}`
const PLACED = 'translate(44.6 142) scale(1.61)'
const MIRRORED = `translate(480 0) scale(-1 1) ${PLACED}`
const APART = -4
const OVERLAP = 64
const apart = `${APART}px`
const overlap = `${OVERLAP}px`
const LEFT_MET = `translate(${OVERLAP} 0) ${PLACED}`
const RIGHT_MET = `translate(${-OVERLAP} 0) ${MIRRORED}`
const BAND_TOP = 142
const BAND_HEIGHT = 41.25
const BANDS = [1, 2, 3, 4, 5]
const id = useId()
</script>

<template>
  <svg
    class="rebel-mark"
    :class="{ 'rebel-mark-play': play }"
    viewBox="0 0 480 480"
    aria-hidden="true"
    focusable="false"
  >
    <defs v-if="play">
      <mask :id="`${id}-left`">
        <path
          class="rebel-mark-matte"
          fill-rule="evenodd"
          :d="R"
          :transform="LEFT_MET"
        />
      </mask>
      <mask :id="`${id}-right`">
        <path
          class="rebel-mark-matte"
          fill-rule="evenodd"
          :d="R"
          :transform="RIGHT_MET"
        />
      </mask>
      <mask :id="`${id}-wink`">
        <g :mask="`url(#${id}-left)`">
          <path class="rebel-mark-matte" :d="COUNTER" :transform="RIGHT_MET" />
        </g>
      </mask>
      <mask :id="`${id}-squint`">
        <g :mask="`url(#${id}-right)`">
          <path class="rebel-mark-matte" :d="COUNTER" :transform="LEFT_MET" />
        </g>
      </mask>
    </defs>
    <rect width="480" height="480" fill="#000" />
    <g class="rebel-mark-rs" fill="#fff">
      <g class="rebel-mark-left">
        <path fill-rule="evenodd" :d="R" :transform="PLACED" />
      </g>
      <g class="rebel-mark-right">
        <path fill-rule="evenodd" :d="R" :transform="MIRRORED" />
      </g>
    </g>
    <template v-if="play">
      <g :mask="`url(#${id}-wink)`">
        <path class="rebel-mark-lid" d="M240 140H302V230Q271 242 240 230Z" />
      </g>
      <g :mask="`url(#${id}-squint)`">
        <path class="rebel-mark-lid" d="M185 140H245V193Q215 197 185 193Z" />
      </g>
      <path class="rebel-mark-shut" d="M250 222Q271 232 292 222" />
    </template>
    <g class="rebel-mark-bands">
      <rect
        v-for="band in BANDS"
        :key="band"
        x="0"
        :y="BAND_TOP + (band - 1) * BAND_HEIGHT"
        width="480"
        :height="BAND_HEIGHT + 0.5"
        :style="{ fill: `var(--mark-band-${band})` }"
      />
    </g>
  </svg>
</template>

<style scoped>
.rebel-mark {
  --rebel-mark-ease: cubic-bezier(0.65, 0, 0.35, 1);
  --rebel-mark-lid-open: -50px;
  display: block;
}

/* Difference against white cancels to black, so the Rs' overlap draws the figure. */
.rebel-mark-rs {
  isolation: isolate;
}

.rebel-mark-left {
  transform: translateX(v-bind(apart));
}

.rebel-mark-right {
  mix-blend-mode: difference;
  transform: translateX(calc(-1 * v-bind(apart)));
}

/* Multiplied in, a band tints the white and leaves the black; calm's are white. */
.rebel-mark-bands {
  mix-blend-mode: multiply;
}

/* A stroke widens each matte by a screen pixel or so, so a lid hides the eye's
   anti-aliased rim at any size. */
.rebel-mark-matte {
  fill: #fff;
  stroke: #fff;
  stroke-width: 3px;
  vector-effect: non-scaling-stroke;
}

.rebel-mark-lid {
  fill: #000;
  transform: translateY(var(--rebel-mark-lid-open));
}

.rebel-mark-shut {
  fill: none;
  stroke: #fff;
  stroke-width: 4;
  stroke-linecap: round;
  opacity: 0;
}

.rebel-mark-play .rebel-mark-left {
  animation: rebel-mark-left var(--mark-intro) both;
}

.rebel-mark-play .rebel-mark-right {
  animation: rebel-mark-right var(--mark-intro) both;
}

.rebel-mark-play .rebel-mark-lid {
  animation: rebel-mark-wink var(--mark-intro) both;
}

.rebel-mark-play .rebel-mark-shut {
  animation: rebel-mark-shut var(--mark-intro) both;
}

/* Over the intro: rest, slide in, rest, wink, and slide out as the black clears. */
@keyframes rebel-mark-left {
  0%,
  4.5% {
    transform: translateX(v-bind(apart));
    animation-timing-function: var(--rebel-mark-ease);
  }
  50%,
  84.1% {
    transform: translateX(v-bind(overlap));
    animation-timing-function: var(--rebel-mark-ease);
  }
  100% {
    transform: translateX(v-bind(apart));
  }
}

@keyframes rebel-mark-right {
  0%,
  4.5% {
    transform: translateX(calc(-1 * v-bind(apart)));
    animation-timing-function: var(--rebel-mark-ease);
  }
  50%,
  84.1% {
    transform: translateX(calc(-1 * v-bind(overlap)));
    animation-timing-function: var(--rebel-mark-ease);
  }
  100% {
    transform: translateX(calc(-1 * v-bind(apart)));
  }
}

@keyframes rebel-mark-wink {
  0%,
  63.6% {
    transform: translateY(var(--rebel-mark-lid-open));
    animation-timing-function: ease-in;
  }
  71.3%,
  76.4% {
    transform: none;
    animation-timing-function: ease-out;
  }
  84.1%,
  100% {
    transform: translateY(var(--rebel-mark-lid-open));
  }
}

@keyframes rebel-mark-shut {
  0% {
    opacity: 0;
    animation-timing-function: step-end;
  }
  71.3% {
    opacity: 1;
    animation-timing-function: step-end;
  }
  76.4%,
  100% {
    opacity: 0;
  }
}
</style>
