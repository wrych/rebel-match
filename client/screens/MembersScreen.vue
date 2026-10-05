<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { rolePermissions } from '../../src/access'
import { peerLine } from '../lib/challenges'
import { longPress } from '../lib/long-press'
import {
  deleteMember,
  fetchMembers,
  forEachMember,
  grantRole,
  matchesSearch,
  revokeRole,
  type EachOutcome,
  type RosterMember,
} from '../lib/members'
import { fetchConfig } from '../lib/api'
import { loadMe } from '../lib/session'
import { day, graceSpan } from '../lib/when'

const router = useRouter()
const members = ref<RosterMember[]>([])
const loaded = ref(false)
const search = ref('')
const problem = ref<string | null>(null)
const canGrant = ref(false)
const canDelete = ref(false)
const holdMs = ref(0)
const graceDays = ref<number | null>(null)
const selecting = ref(false)
const selected = reactive(new Set<string>())
const role = ref<string>(Object.keys(rolePermissions)[0] ?? '')
const confirmingDelete = ref(false)
const busy = ref(false)
const report = ref<string[]>([])
const roles = Object.keys(rolePermissions)

const shown = computed(() =>
  members.value.filter((member) => matchesSearch(member, search.value)),
)
// Only selected members still in view are acted on, so a search never hides
// whom an action reaches.
const chosen = computed(() =>
  shown.value.filter((member) => selected.has(member.id)),
)

const who = (member: RosterMember): string => member.name ?? member.email
const pathOf = (member: RosterMember): string =>
  `/admin/members/${encodeURIComponent(member.id)}`

async function load(): Promise<void> {
  members.value = await fetchMembers()
}

onMounted(async () => {
  try {
    const [me, config] = await Promise.all([loadMe(), fetchConfig(), load()])
    canGrant.value = me?.permissions.includes('role:grant') ?? false
    canDelete.value = me?.permissions.includes('member:delete') ?? false
    holdMs.value = config.limits.holdToSelectMs
    graceDays.value = config.limits.erasureGraceDays
  } catch {
    problem.value = 'The members could not be loaded.'
  }
  loaded.value = true
})

function select(member: RosterMember): void {
  report.value = []
  selecting.value = true
  if (selected.has(member.id)) selected.delete(member.id)
  else selected.add(member.id)
}

function stopSelecting(): void {
  selecting.value = false
  confirmingDelete.value = false
  selected.clear()
}

let pressed: RosterMember | null = null
const press = longPress(
  () => {
    if (pressed !== null && !selected.has(pressed.id)) select(pressed)
  },
  () => holdMs.value,
)

function hold(member: RosterMember): void {
  pressed = member
  press.start()
}

// While selecting, a tap on a card chooses it; otherwise it opens the
// member's page, leaving a modified click to the browser.
function open(event: MouseEvent, member: RosterMember): void {
  // A keyboard activation has no pointer behind it, so it never ends a hold.
  const endsHold = press.held() && event.detail > 0
  if (endsHold) {
    event.preventDefault()
    return
  }
  if (selecting.value) {
    event.preventDefault()
    select(member)
    return
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey) return
  event.preventDefault()
  void router.push(pathOf(member))
}

function summary<T>(
  outcomes: EachOutcome<T>[],
  done: T,
  doneWords: string,
  reasons: Partial<Record<T & string, string>>,
): string[] {
  const succeeded = outcomes.filter((each) => each.outcome === done)
  const lines =
    succeeded.length === 0
      ? []
      : [
          `${doneWords} ${succeeded.map((each) => who(each.member)).join(', ')}.`,
        ]
  for (const each of outcomes) {
    if (each.outcome === done) continue
    const reason =
      each.outcome === 'failed'
        ? 'that did not go through; try again.'
        : (reasons[each.outcome as T & string] ?? String(each.outcome))
    lines.push(`${who(each.member)}: ${reason}`)
  }
  return lines
}

// The outcomes are shown whatever happens next; a list that cannot be
// refreshed says so rather than passing for current.
async function finish(lines: string[]): Promise<void> {
  report.value = lines
  stopSelecting()
  busy.value = false
  try {
    await load()
  } catch {
    report.value = [
      ...lines,
      'The list could not be refreshed. Reload the page to see it as it is.',
    ]
  }
}

async function give(): Promise<void> {
  busy.value = true
  const lacking = chosen.value.filter((m) => !m.roles.includes(role.value))
  const already = chosen.value.filter((m) => m.roles.includes(role.value))
  const outcomes = await forEachMember(lacking, (id) =>
    grantRole(id, role.value),
  )
  await finish([
    ...summary(outcomes, 'done', `Gave ${role.value} to`, {
      gone: 'they are no longer an active member.',
    }),
    ...already.map((m) => `${who(m)}: already had ${role.value}.`),
  ])
}

async function takeAway(): Promise<void> {
  busy.value = true
  const holding = chosen.value.filter((m) => m.roles.includes(role.value))
  const without = chosen.value.filter((m) => !m.roles.includes(role.value))
  const outcomes = await forEachMember(holding, (id) =>
    revokeRole(id, role.value),
  )
  await finish([
    ...summary(outcomes, 'done', `Took ${role.value} away from`, {
      gone: 'they no longer had it.',
      'last-holder': `nobody else could give roles, so they keep ${role.value}.`,
    }),
    ...without.map((m) => `${who(m)}: did not have ${role.value}.`),
  ])
}

async function erase(): Promise<void> {
  busy.value = true
  let eraseAfter: string | null = null
  const outcomes = await forEachMember(chosen.value, async (id) => {
    const outcome = await deleteMember(id)
    if (outcome.result === 'deleted') eraseAfter = outcome.eraseAfter
    return outcome.result
  })
  const when =
    eraseAfter === null
      ? ''
      : ` They will be erased on ${day(eraseAfter)} unless restored.`
  await finish(
    summary(outcomes, 'deleted', 'Deleted, hidden from everyone:', {
      gone: 'they were already gone.',
      'created-invites':
        'they created invite links, so they stay until those are dealt with.',
      'last-admin': 'they are the only admin left, so they stay.',
    }).map((line, index) => (index === 0 && when !== '' ? line + when : line)),
  )
}
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Host tools</p>
      <h1 class="display display-lg">Members</h1>
      <p class="lede">
        Everyone who has joined or asked to. Open a member to see all that is
        held about them, or tick the circle on a card (or hold the card) to act
        on several at once.
      </p>
    </div>

    <div class="field">
      <label for="member-search">Search by email or name</label>
      <input id="member-search" v-model="search" class="input" type="search" />
    </div>

    <div v-if="report.length > 0" class="notice notice-solid" role="status">
      <p v-for="line in report" :key="line">{{ line }}</p>
    </div>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="loaded && shown.length === 0" class="empty">
      Nobody matches.
    </p>

    <div
      v-if="selecting"
      class="card action-bar stack-tight"
      role="region"
      aria-label="Selected members"
    >
      <div class="bar-head">
        <strong>{{ chosen.length }} selected</strong>
        <button
          type="button"
          class="btn btn-ghost btn-small"
          @click="shown.forEach((m) => selected.add(m.id))"
        >
          Select all shown
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-small"
          @click="stopSelecting"
        >
          Done
        </button>
      </div>
      <div v-if="canGrant" class="bar-roles">
        <label for="bulk-role" class="small">Role</label>
        <select id="bulk-role" v-model="role" class="input">
          <option v-for="option in roles" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
        <button
          type="button"
          class="btn btn-primary btn-small"
          :disabled="busy || chosen.length === 0"
          @click="give"
        >
          Give
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-small"
          :disabled="busy || chosen.length === 0"
          @click="takeAway"
        >
          Take away
        </button>
      </div>
      <div v-if="canDelete && confirmingDelete" class="stack-tight">
        <p class="alert" role="alert">
          Delete {{ chosen.length }}
          {{ chosen.length === 1 ? 'member' : 'members' }}? They are hidden from
          everyone at once and erased with everything they wrote after
          {{ graceSpan(graceDays) }}, unless restored.
        </p>
        <div class="actions">
          <button
            type="button"
            class="btn btn-dark btn-small"
            :disabled="busy"
            @click="erase"
          >
            Delete
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-small"
            :disabled="busy"
            @click="confirmingDelete = false"
          >
            Keep
          </button>
        </div>
      </div>
      <button
        v-else-if="canDelete"
        type="button"
        class="btn btn-ghost btn-small"
        :disabled="busy || chosen.length === 0"
        @click="confirmingDelete = true"
      >
        Delete…
      </button>
    </div>

    <ul class="stack members">
      <li
        v-for="member in shown"
        :key="member.id"
        class="card member"
        :class="{ selected: selected.has(member.id) }"
      >
        <button
          type="button"
          class="selector"
          role="checkbox"
          :aria-checked="selected.has(member.id)"
          :aria-label="`Select ${who(member)}`"
          @click="select(member)"
        >
          <span aria-hidden="true">✓</span>
        </button>
        <a
          :href="pathOf(member)"
          class="member-link"
          @click="open($event, member)"
          @pointerdown="hold(member)"
          @pointerup="press.release()"
          @pointerleave="press.abandon()"
          @pointercancel="press.abandon()"
          @contextmenu="selecting && $event.preventDefault()"
        >
          <span class="card-head">
            <span class="stack-tight">
              <span class="card-title">{{ who(member) }}</span>
              <span v-if="peerLine(member)" class="mono line">{{
                peerLine(member)
              }}</span>
            </span>
            <span
              v-if="member.status === 'deleted' && member.eraseAfter"
              class="chip chip-accent"
              >Erased {{ day(member.eraseAfter) }}</span
            >
            <span v-else class="chip chip-dashed">{{ member.status }}</span>
          </span>
          <span v-if="member.name" class="small email">{{ member.email }}</span>
          <span v-if="member.roles.length > 0" class="roles">
            <span v-for="held in member.roles" :key="held" class="chip">{{
              held
            }}</span>
          </span>
        </a>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.members {
  list-style: none;
  margin: 0;
  padding: 0;
}

.member {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.5rem;
  align-items: start;
}

.member.selected {
  outline: 3px solid var(--accent);
  outline-offset: -1px;
}

.selector {
  display: grid;
  place-items: center;
  position: relative;
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0.15rem;
  padding: 0;
  border: 1.5px solid var(--line-strong);
  border-radius: 50%;
  background: transparent;
  color: transparent;
  font-size: 0.65rem;
  line-height: 1;
  cursor: pointer;
}

/* The circle is drawn small, but a finger still gets a full-size target. */
.selector::before {
  content: '';
  position: absolute;
  inset: -0.6rem;
}

.selected .selector {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}

.selector:focus-visible,
.member-link:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.member-link {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  color: inherit;
  text-decoration: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.line,
.email {
  color: var(--muted);
  overflow-wrap: anywhere;
}

.roles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.action-bar {
  position: sticky;
  top: 0.5rem;
  z-index: 5;
  border: 2px solid var(--accent);
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}

.bar-head,
.bar-roles {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.bar-head strong {
  margin-right: auto;
}

.bar-roles .input {
  width: auto;
  min-width: 7rem;
}
</style>
