<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { floors } from './core/floors'
import type { DayState } from './core/state'
import { drawDay } from './render/draw'
import { contextOf, pagePalette } from './render/palette'

/** The whole floor drawn small, so trouble out of view can be found
 * (R-GAME-12). */
const props = defineProps<{ state: DayState }>()

const MAP_TILE_PX = 6
const canvas = ref<HTMLCanvasElement | null>(null)

function draw(): void {
  const element = canvas.value
  const ctx = contextOf(element)
  if (element === null || ctx === null) return
  const floor = floors[props.state.floor]
  element.width = floor.width * MAP_TILE_PX
  element.height = floor.height * MAP_TILE_PX
  drawDay(
    ctx,
    props.state,
    { x: 0, y: 0, width: floor.width, height: floor.height },
    pagePalette(),
    MAP_TILE_PX,
  )
}

onMounted(draw)
watch(() => props.state, draw)
</script>

<template>
  <canvas ref="canvas" class="floor-map" role="img" aria-label="Floor map" />
</template>

<style scoped>
.floor-map {
  border: 2px solid #111010;
  border-radius: 8px;
  background: #d9d7d2;
}
</style>
