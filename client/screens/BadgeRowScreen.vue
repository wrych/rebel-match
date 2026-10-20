<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BadgeArt from '../components/BadgeArt.vue'
import {
  bestOf,
  fetchBadges,
  hasNew,
  markBadgesSeen,
  nextLevel,
  type RowView,
} from '../lib/badges'
import { day } from '../lib/when'

const route = useRoute()
const router = useRouter()
const row = ref<RowView | null>(null)
const problem = ref<string | null>(null)

const best = computed(() => (row.value === null ? null : bestOf(row.value)))
const next = computed(() => (row.value === null ? null : nextLevel(row.value)))

const counted = (count: number, counts: readonly [string, string]): string =>
  `${String(count)} ${count === 1 ? counts[0] : counts[1]}`

const progress = computed(() => {
  if (row.value === null || next.value === null) return null
  const done = Math.min(row.value.count, next.value.needs)
  return {
    done,
    percent: Math.round((done / next.value.needs) * 100),
    toGo: next.value.needs - done,
  }
})

function levelStatus(level: RowView['levels'][number]): string {
  if (level.earnedAt !== null) return `Earned ${day(level.earnedAt)}`
  return `${String(Math.min(row.value?.count ?? 0, level.needs))} of ${String(level.needs)}`
}

// An unknown row is as absent as any other address that does not exist; a
// known one, once shown, is no longer new (R-NAV-8, R-BADGE-10).
onMounted(async () => {
  try {
    const overview = await fetchBadges()
    row.value =
      overview.rows.find((each) => each.row === route.params['row']) ?? null
  } catch {
    problem.value = 'These badges could not be loaded. Try again.'
    return
  }
  if (row.value === null) {
    await router.replace({
      name: 'not-found',
      params: { pathMatch: route.path.slice(1).split('/') },
    })
    return
  }
  if (hasNew(row.value))
    await markBadgesSeen([row.value.row]).catch(() => undefined)
})
</script>

<template>
  <section class="screen">
    <RouterLink to="/badges" class="kicker back">← Badges</RouterLink>

    <template v-if="row && best">
      <div class="hero">
        <BadgeArt :row="row.row" :tier="best.tier" :size="150" />
        <p class="kicker kicker-accent">{{ row.title }}</p>
        <h1 class="display display-lg">{{ best.name }}</h1>
        <p class="lede">{{ counted(row.count, row.counts) }} so far.</p>
      </div>

      <section
        v-if="next && progress"
        class="card next"
        aria-label="Next level"
      >
        <div class="title-row">
          <span class="card-title">Next: {{ next.name }}</span>
          <span class="mono small">{{ progress.done }} / {{ next.needs }}</span>
        </div>
        <div
          class="meter"
          role="progressbar"
          :aria-valuenow="progress.done"
          aria-valuemin="0"
          :aria-valuemax="next.needs"
          :aria-label="`Towards ${next.name}`"
        >
          <span :style="{ width: `${String(progress.percent)}%` }" />
        </div>
        <span class="small">{{ progress.toGo }} more to go.</span>
      </section>

      <section class="stack" aria-labelledby="ladder">
        <h2 id="ladder" class="display display-md">The ladder</h2>
        <ul class="ladder">
          <li v-for="level in row.levels" :key="level.level" class="rung">
            <BadgeArt
              :row="row.row"
              :tier="
                level.earnedAt === null ? 'locked' : (level.level as 1 | 2 | 3)
              "
              :size="56"
            />
            <span class="rung-text">
              <span class="card-title">{{ level.name }}</span>
              <span class="kicker">{{ counted(level.needs, row.counts) }}</span>
            </span>
            <span class="small status" :class="{ ok: level.earnedAt }">{{
              levelStatus(level)
            }}</span>
          </li>
          <li class="rung">
            <BadgeArt
              :row="row.row"
              :tier="row.crown.held ? 'crown' : 'locked'"
              :size="56"
            />
            <span class="rung-text">
              <span class="card-title">{{ row.crown.name }}</span>
              <span class="kicker">The most of anyone</span>
            </span>
            <span class="small status" :class="{ ok: row.crown.held }">{{
              row.crown.held ? 'Yours, for now' : 'Not yours yet'
            }}</span>
          </li>
        </ul>
      </section>

      <p class="small">
        {{ row.explains }} The crown goes to whoever has the most, and moves
        when someone overtakes them.
      </p>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.back {
  text-decoration: none;
}

.hero {
  display: grid;
  justify-items: center;
  gap: 0.6rem;
  text-align: center;
}

.next {
  gap: 0.6rem;
}

.meter {
  height: 8px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--line);
}

.meter span {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--accent);
}

.ladder {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rung {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.6rem 0;
  border-bottom: var(--line-width) solid var(--line);
}

.rung-text {
  display: grid;
  flex: 1;
  gap: 0.2rem;
}

.status {
  max-width: 8rem;
  text-align: right;
  color: var(--muted);
}

.status.ok {
  color: var(--ok);
}
</style>
