<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PersonCard from '../components/PersonCard.vue'
import { fetchConfig } from '../lib/api'
import { codesOpen } from '../lib/codes'
import {
  chipsOf,
  personPath,
  searchMembers,
  withOperator,
  withoutPart,
  type SearchAnswer,
} from '../lib/people'
import { sectors } from '../../src/profile-options'
import type { SearchField } from '../../src/search/query'

const route = useRoute()
const router = useRouter()

const queryInUrl = (): string =>
  typeof route.query['q'] === 'string' ? route.query['q'] : ''

const draft = ref(queryInUrl())
const answer = ref<SearchAnswer | null>(null)
const searching = ref(false)
const problem = ref<string | null>(null)
const box = ref<HTMLInputElement | null>(null)
const sectorPick = ref('')
const codesOn = ref(false)

const chips = computed(() => chipsOf(draft.value))
const showHelp = computed(
  () => queryInUrl().trim() === '' || answer.value?.tooShort === true,
)

async function notFound(): Promise<void> {
  await router.replace({
    name: 'not-found',
    params: { pathMatch: route.path.slice(1).split('/') },
  })
}

let latest = 0

// Only the newest search answers, however its responses arrive.
async function run(query: string): Promise<void> {
  const mine = ++latest
  if (query.trim() === '') {
    answer.value = null
    searching.value = false
    return
  }
  searching.value = true
  problem.value = null
  try {
    const found = await searchMembers(query)
    if (mine !== latest) return
    if (found === null) await notFound()
    else answer.value = found
  } catch {
    if (mine === latest)
      problem.value = 'The search did not go through. Try again.'
  } finally {
    if (mine === latest) searching.value = false
  }
}

// The address already holding the query, as after a failed search, is
// searched again rather than navigated to.
async function search(): Promise<void> {
  const q = draft.value.trim()
  if (q === queryInUrl()) await run(q)
  else await router.replace({ query: q === '' ? {} : { q } })
}

async function removeChip(index: number): Promise<void> {
  draft.value = withoutPart(draft.value, index)
  await search()
}

async function addOperator(field: SearchField): Promise<void> {
  draft.value = withOperator(draft.value, field)
  await nextTick()
  const input = box.value
  if (input === null) return
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}

async function addSector(): Promise<void> {
  if (sectorPick.value === '') return
  draft.value = withOperator(draft.value, 'sector', sectorPick.value)
  sectorPick.value = ''
  await search()
}

watch(
  () => route.query['q'],
  () => {
    draft.value = queryInUrl()
    void run(queryInUrl())
  },
)

onMounted(async () => {
  const config = await fetchConfig().catch(() => null)
  if (config !== null && config.limits.memberSearch !== 1) {
    await notFound()
    return
  }
  codesOn.value = config !== null && codesOpen(config.limits.connectCodes)
  await run(queryInUrl())
})
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Connect directly</p>
      <h1 class="display display-lg">Find a member</h1>
      <RouterLink v-if="codesOn" to="/me/code" class="row-link"
        >Or show your code</RouterLink
      >
    </div>

    <form class="stack-tight" role="search" @submit.prevent="search">
      <div class="search-row">
        <input
          id="people-query"
          ref="box"
          v-model="draft"
          type="search"
          aria-label="Search members"
          class="input"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="A name, or company:acme"
        />
        <button type="submit" class="btn btn-primary" :disabled="searching">
          Search
        </button>
      </div>
      <ul v-if="chips.length > 0" class="chip-row" aria-label="In your search">
        <li v-for="chip in chips" :key="chip.index">
          <button
            type="button"
            class="chip chip-ink"
            :aria-label="`Remove ${chip.label}`"
            @click="removeChip(chip.index)"
          >
            {{ chip.label }} <span aria-hidden="true">×</span>
          </button>
        </li>
      </ul>
      <div class="chip-row">
        <button type="button" class="chip" @click="addOperator('company')">
          + Company
        </button>
        <button type="button" class="chip" @click="addOperator('title')">
          + Title
        </button>
        <label class="chip sector-pick">
          + Sector
          <select
            v-model="sectorPick"
            aria-label="Add a sector"
            @change="addSector"
          >
            <option value="" disabled>+ Sector</option>
            <option
              v-for="choice in sectors"
              :key="choice.key"
              :value="choice.key"
            >
              {{ choice.label }}
            </option>
          </select>
        </label>
      </div>
    </form>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>

    <div v-if="showHelp" class="stack-tight small">
      <p>
        Type at least part of a name, or narrow by a field:
        <code>company:</code>, <code>title:</code> or <code>sector:</code>.
        Quotes keep words together: <code>company:"corporate rebels"</code>.
        Every term has to match.
      </p>
    </div>

    <template v-else-if="answer">
      <p v-if="answer.results.length === 0" class="empty">
        Nobody matches. Try fewer terms, or the start of a word.
      </p>
      <ul v-else class="stack peer-list" aria-label="Members found">
        <li v-for="card in answer.results" :key="card.memberId">
          <PersonCard :card="card" :to="personPath(card.memberId)" />
        </li>
      </ul>
      <p v-if="answer.more" class="small" role="status">
        More match — add a term to narrow it down
      </p>
    </template>
  </section>
</template>

<style scoped>
.search-row {
  display: flex;
  gap: 0.4rem;
}

.search-row .input {
  flex: 1;
  min-width: 0;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chip-row button {
  background: none;
  cursor: pointer;
}

.sector-pick {
  position: relative;
  cursor: pointer;
}

.sector-pick select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
