<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HappyOnly from '../components/HappyOnly.vue'
import { fetchLeaderboard, jobName, type Leaderboard } from '../lib/game'
import { currentMood } from '../lib/mood'

const route = useRoute()
const router = useRouter()
const board = ref<Leaderboard | null>(null)
const problem = ref<string | null>(null)

async function load(): Promise<void> {
  try {
    board.value = await fetchLeaderboard()
    if (board.value === null)
      await router.replace({
        name: 'not-found',
        params: { pathMatch: route.path.slice(1).split('/') },
      })
  } catch {
    problem.value = 'The leaderboard could not be loaded.'
  }
}

// Nothing is asked of the server until the member is in happy mode, so calm
// mode shows the same notice whether the game is on or off (R-GAME-1).
watch(
  currentMood,
  async (mood) => {
    if (mood === 'happy' && board.value === null) await load()
  },
  { immediate: true },
)
</script>

<template>
  <HappyOnly>
    <section class="screen">
      <div class="stack">
        <p class="kicker kicker-accent">9toRevolution</p>
        <h1 class="display display-lg">Leaderboard</h1>
        <p v-if="board" class="lede">
          {{ board.of }} {{ board.of === 1 ? 'player' : 'players' }} with a day
          won. Names show only for those who share them.
        </p>
      </div>

      <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
      <p v-else-if="board && board.of === 0" class="empty">
        Nobody has won a day yet.
      </p>

      <ol v-if="board && board.of > 0" class="board">
        <li
          v-for="(row, index) in board.rows"
          :key="index"
          class="row"
          :class="{ mine: row.mine }"
          :aria-current="row.mine ? 'true' : undefined"
        >
          <span class="place mono">{{ row.place }}</span>
          <span class="name">{{ row.name }}</span>
          <span class="job mono"
            >{{ jobName(row.job) }} · level {{ row.level }}</span
          >
        </li>
        <li v-if="board.own" class="row mine own" aria-current="true">
          <span class="place mono">{{ board.own.place }}</span>
          <span class="name">{{ board.own.name }}</span>
          <span class="job mono"
            >{{ jobName(board.own.job) }} · level {{ board.own.level }}</span
          >
        </li>
      </ol>
    </section>
  </HappyOnly>
</template>

<style scoped>
.board {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 2.5rem 1fr;
  gap: 0.1rem 0.75rem;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 14px;
}

.place {
  grid-row: span 2;
  align-self: center;
  font-size: 1.2rem;
}

.name {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.job {
  color: var(--muted);
  font-size: 0.8rem;
}

.mine {
  border: var(--sticker-border);
}

.own {
  margin-top: 0.8rem;
}
</style>
