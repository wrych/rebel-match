<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FIRST_REBEL_LEVEL, firstDayOf } from '../../src/game/levels'
import HappyOnly from '../components/HappyOnly.vue'
import DayResults from '../game/DayResults.vue'
import GameLobby from '../game/GameLobby.vue'
import PlayView from '../game/PlayView.vue'
import { hintsDue, type GameHint } from '../game/hints'
import { reportEvent } from '../lib/events'
import {
  fetchGame,
  recordDay,
  seeHint,
  shareName,
  type DayResult,
  type GameState,
} from '../lib/game'
import { currentMood } from '../lib/mood'
import { touchScreen, watchLandscape } from '../lib/orientation'

interface Ended {
  level: number
  outcome: 'won' | 'lost'
  score: number
  seconds: number
  result: DayResult
}

const route = useRoute()
const router = useRouter()
const game = ref<GameState | null>(null)
const problem = ref<string | null>(null)
const playing = ref<{ level: number; seed: number } | null>(null)
const ended = ref<Ended | null>(null)
const lastDay = ref<string | null>(null)
const chosen = ref<number | null>(null)
const touch = touchScreen()
const { landscape, stop } = watchLandscape()
// Left for the lobby while the phone is still on its side: the next day waits
// until it has been turned upright and back.
const resting = ref(false)
// The day on the floor has ended, though its record may still be on its way.
const over = ref(false)

// On a touch screen the phone's side is the game and upright is the lobby;
// elsewhere the stage shows while there is a day or its results (ADR 0046).
const staged = computed(
  () =>
    (playing.value !== null || ended.value !== null) &&
    (!touch || landscape.value),
)

const SEED_RANGE = 0x7fffffff

async function notFound(): Promise<void> {
  await router.replace({
    name: 'not-found',
    params: { pathMatch: route.path.slice(1).split('/') },
  })
}

async function load(): Promise<void> {
  try {
    game.value = await fetchGame()
    if (game.value === null) await notFound()
    else reportEvent({ event: 'game_opened', props: {} })
  } catch {
    problem.value = 'The office could not be opened. Reload to try again.'
  }
}

function start(level: number): void {
  ended.value = null
  over.value = false
  lastDay.value = null
  void document.documentElement.requestFullscreen?.().catch(() => undefined)
  playing.value = { level, seed: Math.floor(Math.random() * SEED_RANGE) }
}

function toLobby(): void {
  playing.value = null
  ended.value = null
  over.value = false
  resting.value = touch && landscape.value
  if (document.fullscreenElement)
    void document.exitFullscreen().catch(() => undefined)
}

async function record(
  level: number,
  outcome: 'won' | 'lost' | 'abandoned',
  seconds: number,
): Promise<DayResult | null> {
  try {
    const result = await recordDay({ level, outcome, playSeconds: seconds })
    if (result === null) {
      problem.value = 'The office has closed.'
      game.value = null
      return null
    }
    game.value = result.state
    return result
  } catch {
    problem.value = 'That day could not be recorded.'
    return null
  }
}

// Every day is recorded, then its results card shows (R-GAME-14).
async function dayEnded(day: {
  outcome: 'won' | 'lost'
  score: number
  seconds: number
}): Promise<void> {
  const day0 = playing.value
  over.value = true
  const result = await record(day0?.level ?? 1, day.outcome, day.seconds)
  if (playing.value !== day0 || day0 === null) return
  if (result === null) toLobby()
  else ended.value = { ...day, level: day0.level, result }
}

async function dayLeft(seconds: number): Promise<void> {
  const level = playing.value?.level ?? 1
  toLobby()
  await record(level, 'abandoned', seconds)
}

const play = ref<{ leave: () => void } | null>(null)

function leaveDay(): void {
  play.value?.leave()
}

async function shareAndContinue(): Promise<void> {
  try {
    await shareName(true)
    if (game.value !== null) game.value = { ...game.value, shared: true }
  } catch {
    problem.value = 'Your name could not be shared. Try again from the lobby.'
  }
  next()
}

function hintSeen(hint: GameHint): void {
  seeHint(hint)
  if (game.value !== null)
    game.value = {
      ...game.value,
      hintsSeen: [...game.value.hintsSeen, hint],
    }
}

function next(): void {
  if (ended.value !== null) start(ended.value.level + 1)
}

function retry(): void {
  if (ended.value !== null) start(firstDayOf(ended.value.level))
}

function leave(): void {
  const outcome = ended.value?.outcome
  lastDay.value =
    outcome === undefined ? null : outcome === 'won' ? 'Day won.' : 'Day lost.'
  toLobby()
}

function nextLevel(): number {
  return chosen.value ?? game.value?.resumeLevel ?? 1
}

// Turning the phone on its side starts a day, unless one is under way or
// waiting for its results to be read (R-GAME-1, R-GAME-12).
watch([landscape, game], ([wide, loaded]) => {
  if (!wide) resting.value = false
  if (!touch || !wide || loaded === null || resting.value) return
  if (playing.value === null && ended.value === null) start(nextLevel())
})
onUnmounted(stop)

// Nothing is asked of the server, and no player made, until the member is
// in happy mode (R-GAME-1).
watch(
  currentMood,
  async (mood) => {
    if (mood === 'happy' && game.value === null) await load()
  },
  { immediate: true },
)
</script>

<template>
  <HappyOnly>
    <section class="screen">
      <div class="stack">
        <p class="kicker kicker-accent">9toRevolution</p>
        <h1 class="display display-lg">The office</h1>
      </div>

      <p v-if="problem" class="alert" role="alert">{{ problem }}</p>

      <GameLobby
        v-if="game"
        :game="game"
        :last-day="lastDay"
        :touch="touch"
        :day-under-way="playing !== null && !over"
        :results-waiting="over"
        @start="start"
        @choose="chosen = $event"
        @leave-day="leaveDay"
        @back="leave"
        @shared="game = { ...game, shared: $event }"
      />
    </section>
  </HappyOnly>
  <Teleport to="body">
    <div v-show="staged" class="stage">
      <PlayView
        v-if="playing && game"
        ref="play"
        :key="`${playing.level}-${playing.seed}`"
        :level="playing.level"
        :seed="playing.seed"
        :tuning="game.tuning"
        :hints="hintsDue(playing.level, game.tuning, game.hintsSeen)"
        @seen="hintSeen"
        @ended="dayEnded"
        @leave="dayLeft"
      />
      <div v-if="ended" class="results-layer">
        <DayResults
          v-bind="ended"
          @share="shareAndContinue"
          @next="next"
          @retry="retry"
          @leave="leave"
          @rebel="start(FIRST_REBEL_LEVEL)"
          @ask="router.push('/ask')"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #d9d7d2;
}

.results-layer {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  overflow-y: auto;
  background: rgb(17 16 16 / 45%);
}

.results-layer > * {
  width: min(32rem, 100%);
}
</style>
