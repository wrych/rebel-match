<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
} from 'vue'
import { DAYS_PER_JOB, jobOf } from '../../src/game/levels'
import { abandonDay, jobName } from '../lib/game'
import { currentMood } from '../lib/mood'
import { availableActions, type ActionKind } from './core/actions'
import type { Spot } from './core/floors'
import { floors } from './core/floors'
import { startDay, type Tuning } from './core/state'
import { actionLabel, heading, keyAction, steers } from './input/keys'
import Joystick from './Joystick.vue'
import { hintWords, type GameHint } from './hints'
import { advance } from './loop'
import { drawDay } from './render/draw'
import { contextOf, pagePalette } from './render/palette'
import {
  clockText,
  follow,
  greyAt,
  TILES_TALL,
  toFloor,
  type View,
} from './render/view'
import FloorMap from './FloorMap.vue'
import MasterclassPicker from './MasterclassPicker.vue'
import type { Input } from './core/step'

const props = defineProps<{
  level: number
  tuning: Tuning
  seed: number
  hints?: readonly GameHint[]
}>()
const emit = defineEmits<{
  seen: [hint: GameHint]
  ended: [result: { outcome: 'won' | 'lost'; score: number; seconds: number }]
  leave: [seconds: number]
}>()

const MS_PER_SECOND = 1000
const state = shallowRef(startDay(props.level, { ...props.tuning }, props.seed))
const paused = ref(false)
const portrait = ref(false)
const hidden = ref(false)
const mapShown = ref(false)
const choice = ref<ActionKind[] | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const held = new Set<string>()
let stick: Spot = { x: 0, y: 0 }
let pending: ActionKind | undefined
let pendingChosen: number[] = []
const choosing = ref<number[] | null>(null)
const hintQueue = ref<GameHint[]>([...(props.hints ?? [])])
const hint = computed(() => hintQueue.value[0])
let lastView: View | null = null
let lastScale = 1
let carry = 0
let last: number | null = null
let frame = 0
let over = false

const playedSeconds = (): number => Math.max(1, Math.round(state.value.clock))

function goneUnfinished(): void {
  if (over) return
  over = true
  abandonDay(props.level, playedSeconds())
}

const offered = computed(() =>
  availableActions(state.value).map((action) => action.kind),
)
const calm = computed(() => currentMood.value !== 'happy')
const unpaused = computed(
  () => !paused.value && !portrait.value && !hidden.value && !calm.value,
)
const running = computed(
  () => choosing.value === null && hint.value === undefined && unpaused.value,
)

function dismissHint(): void {
  const shown = hintQueue.value[0]
  if (shown === undefined) return
  hintQueue.value = hintQueue.value.slice(1)
  emit('seen', shown)
}
const job = computed(() => jobOf(props.level))
const title = computed(() =>
  job.value === 'rebel'
    ? `Rebel · level ${String(props.level)}`
    : `${jobName(job.value)} · day ${String(((props.level - 1) % DAYS_PER_JOB) + 1)}`,
)
const troubled = computed(() => {
  const lost = state.value.mode === 'boss' ? 'rebel' : 'grey'
  const count = state.value.employees.filter((e) => e.spirit === lost).length
  return `${state.value.mode === 'boss' ? 'Rebels' : 'Grey'} ${String(count)} of ${String(state.value.employees.length)}`
})

function press(kind: ActionKind): void {
  if (choice.value === null && offered.value.length > 1) {
    choice.value = offered.value
    return
  }
  choice.value = null
  if (kind === 'masterclass') {
    choosing.value = []
    return
  }
  pending = kind
}

function toggleChosen(id: number): void {
  const chosen = choosing.value
  if (chosen === null) return
  const seats = state.value.tuning['rebel.masterclassSeats']
  if (chosen.includes(id)) choosing.value = chosen.filter((c) => c !== id)
  else if (chosen.length < seats) choosing.value = [...chosen, id]
}

function sendToMasterclass(): void {
  pendingChosen = choosing.value ?? []
  pending = 'masterclass'
  choosing.value = null
}

function tap(event: MouseEvent): void {
  const element = canvas.value
  if (choosing.value === null || element === null || lastView === null) return
  const box = element.getBoundingClientRect()
  const ratio = element.width / Math.max(1, box.width)
  const at = toFloor(lastView, lastScale, {
    x: (event.clientX - box.left) * ratio,
    y: (event.clientY - box.top) * ratio,
  })
  const grey = greyAt(state.value, at)
  if (grey !== undefined) toggleChosen(grey.id)
}

function onKeyDown(event: KeyboardEvent): void {
  if (choosing.value !== null) {
    if (event.code === 'Escape') choosing.value = null
    return
  }
  if (event.code === 'Escape' || event.code === 'KeyP')
    paused.value = !paused.value
  if (!running.value || event.target instanceof HTMLButtonElement) return
  playKey(event)
}

function playKey(event: KeyboardEvent): void {
  if (steers(event.code)) held.add(event.code)
  if (event.code === 'KeyM') mapShown.value = !mapShown.value
  if (steers(event.code) || event.code === 'Space') event.preventDefault()
  const kind = keyAction(event.code, offered.value)
  if (kind === 'masterclass') choosing.value = []
  else if (kind !== undefined) pending = kind
}

function onKeyUp(event: KeyboardEvent): void {
  held.delete(event.code)
}

function input(): Input {
  const keys = heading(held)
  const move = keys.x !== 0 || keys.y !== 0 ? keys : stick
  if (pending === undefined) return { move }
  return { move, act: pending, chosen: pendingChosen }
}

function releaseKeys(): void {
  held.clear()
}

function draw(): void {
  const element = canvas.value
  const ctx = contextOf(element)
  if (element === null || ctx === null) return
  const ratio = window.devicePixelRatio || 1
  element.width = Math.round(element.clientWidth * ratio)
  element.height = Math.round(element.clientHeight * ratio)
  if (element.height === 0) return
  const view = follow(
    state.value.player.position,
    floors[state.value.floor],
    element.width / element.height,
  )
  lastView = view
  lastScale = element.height / TILES_TALL
  drawDay(
    ctx,
    state.value,
    view,
    pagePalette(),
    lastScale,
    new Set(choosing.value ?? []),
  )
}

function tick(now: number): void {
  const elapsed = last === null ? 0 : (now - last) / MS_PER_SECOND
  last = now
  if (running.value && state.value.outcome === null) {
    const next = advance(state.value, input(), elapsed, carry)
    state.value = next.state
    carry = next.carry
    if (next.acted) {
      pending = undefined
      pendingChosen = []
    }
    if (next.state.outcome !== null) {
      over = true
      emit('ended', {
        outcome: next.state.outcome,
        score: next.state.score,
        seconds: playedSeconds(),
      })
    }
  }
  draw()
  frame = requestAnimationFrame(tick)
}

function onResize(): void {
  portrait.value = window.innerHeight > window.innerWidth
}

function onVisibility(): void {
  hidden.value = document.visibilityState === 'hidden'
  releaseKeys()
}

function leave(): void {
  over = true
  emit('leave', playedSeconds())
}

onMounted(() => {
  onResize()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('resize', onResize)
  window.addEventListener('blur', releaseKeys)
  window.addEventListener('pagehide', goneUnfinished)
  document.addEventListener('visibilitychange', onVisibility)
  frame = requestAnimationFrame(tick)
})
onBeforeUnmount(goneUnfinished)
onUnmounted(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('blur', releaseKeys)
  window.removeEventListener('pagehide', goneUnfinished)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <Teleport to="body">
    <div class="play">
      <canvas ref="canvas" class="floor" @click="tap" />
      <Joystick @move="stick = $event" />

      <div class="hud">
        <span class="mono">{{
          clockText(state.clock, props.tuning.dayLengthSeconds)
        }}</span>
        <span class="mono">{{ title }}</span>
        <span class="mono">{{ troubled }}</span>
        <button type="button" class="hud-button" @click="mapShown = !mapShown">
          Map
        </button>
        <button type="button" class="hud-button" @click="paused = true">
          Pause
        </button>
      </div>

      <FloorMap v-if="mapShown" :state="state" class="map" />

      <div class="actions">
        <template v-if="choice">
          <button
            v-for="kind in choice"
            :key="kind"
            type="button"
            class="action"
            @click="press(kind)"
          >
            {{ actionLabel(kind) }}
          </button>
        </template>
        <button
          v-else-if="offered.length > 0"
          type="button"
          class="action action-lit"
          @click="press(offered[0] ?? 'takeFile')"
        >
          {{
            offered.length > 1
              ? `${actionLabel(offered[0] ?? 'help')} …`
              : actionLabel(offered[0] ?? 'help')
          }}
        </button>
      </div>

      <MasterclassPicker
        v-if="choosing"
        :state="state"
        :chosen="choosing"
        @toggle="toggleChosen"
        @send="sendToMasterclass"
        @cancel="choosing = null"
      />

      <div
        v-if="hint && !calm && !portrait"
        class="overlay"
        role="dialog"
        :aria-label="hintWords(hint).title"
      >
        <p class="display display-md">{{ hintWords(hint).title }}</p>
        <p class="hint">{{ hintWords(hint).text }}</p>
        <button type="button" class="btn btn-dark" @click="dismissHint">
          Got it
        </button>
      </div>
      <div v-if="calm" class="overlay" role="status">
        <p class="display display-md">Nobody here</p>
        <p>The rebels only come out in happy mode. Switch back to carry on.</p>
        <button type="button" class="btn btn-ghost" @click="leave">
          Leave the office
        </button>
      </div>
      <div v-else-if="portrait" class="overlay" role="status">
        <p class="display display-md">Turn your phone</p>
        <p>The office is played in landscape.</p>
      </div>
      <div v-else-if="paused" class="overlay" role="dialog" aria-label="Paused">
        <p class="display display-md">Paused</p>
        <button type="button" class="btn btn-dark" @click="paused = false">
          Back to work
        </button>
        <button type="button" class="btn btn-ghost" @click="leave">
          Leave the office
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.play {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #d9d7d2;
  user-select: none;
  -webkit-user-select: none;
}

.floor {
  width: 100%;
  height: 100%;
  display: block;
}

.hud {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  right: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.9rem;
  pointer-events: none;
}

.hud .mono {
  padding: 0.2rem 0.5rem;
  border-radius: 8px;
  background: rgb(255 255 255 / 80%);
  color: #111010;
}

.hud-button {
  pointer-events: auto;
  min-height: 2.5rem;
  padding: 0 0.9rem;
  border: 0;
  border-radius: 999px;
  background: #111010;
  color: #faf8f4;
  font-weight: 700;
}

.map {
  position: absolute;
  top: 3.5rem;
  right: 0.5rem;
}

.actions {
  position: absolute;
  right: 1.2rem;
  bottom: 1.2rem;
  display: flex;
  gap: 0.6rem;
}

.action {
  min-width: 5.5rem;
  min-height: 5.5rem;
  border: 0;
  border-radius: 50%;
  background: rgb(17 16 16 / 70%);
  color: #faf8f4;
  font-weight: 800;
}

.action-lit {
  background: var(--accent);
  color: var(--on-accent);
}

.hint {
  max-width: 34rem;
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.8rem;
  padding: 1.5rem;
  background: rgb(250 248 244 / 92%);
  color: #111010;
  text-align: center;
}
</style>
