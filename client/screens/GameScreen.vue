<script setup lang="ts">
import { ref, watch } from 'vue'
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
  lastDay.value = null
  void document.documentElement.requestFullscreen?.().catch(() => undefined)
  playing.value = { level, seed: Math.floor(Math.random() * SEED_RANGE) }
}

function stopPlaying(): number {
  const level = playing.value?.level ?? 1
  playing.value = null
  if (document.fullscreenElement)
    void document.exitFullscreen().catch(() => undefined)
  return level
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
  const level = stopPlaying()
  const result = await record(level, day.outcome, day.seconds)
  if (result !== null) ended.value = { ...day, level, result }
}

async function dayLeft(seconds: number): Promise<void> {
  await record(stopPlaying(), 'abandoned', seconds)
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
  lastDay.value = ended.value?.outcome === 'won' ? 'Day won.' : 'Day lost.'
  ended.value = null
}

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

      <DayResults
        v-if="ended"
        v-bind="ended"
        @share="shareAndContinue"
        @next="next"
        @retry="retry"
        @leave="leave"
        @rebel="start(FIRST_REBEL_LEVEL)"
        @ask="router.push('/ask')"
      />
      <GameLobby
        v-else-if="game"
        :game="game"
        :last-day="lastDay"
        @start="start"
        @shared="game = { ...game, shared: $event }"
      />
    </section>
  </HappyOnly>
  <PlayView
    v-if="playing && game"
    :level="playing.level"
    :seed="playing.seed"
    :tuning="game.tuning"
    :hints="hintsDue(playing.level, game.tuning, game.hintsSeen)"
    @seen="hintSeen"
    @ended="dayEnded"
    @leave="dayLeft"
  />
</template>
