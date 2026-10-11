<script setup lang="ts">
import { useId } from 'vue'
import {
  MARK_APART,
  MARK_BAND_OVERLAP,
  MARK_BAND_HEIGHT,
  MARK_BAND_TOP,
  MARK_BANDS,
  MARK_COUNTER,
  MARK_OVERLAP,
  MARK_PLACE,
  MARK_R,
  MARK_SIZE,
} from '../lib/mark'

defineProps<{ play?: boolean }>()

const R = MARK_R
const COUNTER = MARK_COUNTER
const PLACED = `translate(${MARK_PLACE.x} ${MARK_PLACE.y}) scale(${MARK_PLACE.scale})`
const MIRRORED = `translate(${MARK_SIZE} 0) scale(-1 1) ${PLACED}`
const apart = `${MARK_APART}px`
const overlap = `${MARK_OVERLAP}px`
const LEFT_MET = `translate(${MARK_OVERLAP} 0) ${PLACED}`
const RIGHT_MET = `translate(${-MARK_OVERLAP} 0) ${MIRRORED}`
const BAND_TOP = MARK_BAND_TOP
const BAND_HEIGHT = MARK_BAND_HEIGHT
const BANDS = Array.from({ length: MARK_BANDS }, (_, i) => i + 1)
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
        :height="BAND_HEIGHT + MARK_BAND_OVERLAP"
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
