<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { rolePermissions } from '../../src/access'
import { peerLine } from '../lib/challenges'
import {
  deleteMember,
  eraseNow,
  fetchMember,
  grantRole,
  restoreMember,
  revokeRole,
  type EraseOutcome,
  type MemberDetail,
} from '../lib/members'
import { fetchConfig } from '../lib/api'
import { loadMe } from '../lib/session'
import { day, graceSpan, when } from '../lib/when'

const route = useRoute()
const id = String(route.params.id)
const member = ref<MemberDetail | null>(null)
const missing = ref(false)
const problem = ref<string | null>(null)
const notice = ref<string | null>(null)
const canGrant = ref(false)
const confirming = ref(false)
const confirmingNow = ref(false)
const graceDays = ref<number | null>(null)
const busy = ref(false)
const erased = ref(false)
const roles = Object.keys(rolePermissions)

const eraseNotice: Record<Exclude<EraseOutcome, 'erased'>, string> = {
  gone: 'They were already gone.',
  'created-invites':
    'They created invite links, so they stay for now. Those links have to be dealt with first.',
  'last-admin':
    'They are the only admin left, so they stay. Make someone else admin first.',
}

async function load(): Promise<void> {
  const found = await fetchMember(id)
  member.value = found
  missing.value = found === null
}

onMounted(async () => {
  try {
    const [me, config] = await Promise.all([loadMe(), fetchConfig(), load()])
    graceDays.value = config.limits.erasureGraceDays
    canGrant.value = me?.permissions.includes('role:grant') ?? false
  } catch {
    problem.value = 'This member could not be loaded.'
  }
})

async function toggle(role: string, event: Event): Promise<void> {
  const box = event.target as HTMLInputElement
  const give = box.checked
  notice.value = null
  busy.value = true
  try {
    const outcome = give
      ? await grantRole(id, role)
      : await revokeRole(id, role)
    if (outcome === 'last-holder')
      notice.value = `Nobody else could give roles, so they keep ${role}.`
    if (outcome === 'gone')
      notice.value = 'They are no longer an active member.'
  } catch {
    notice.value = 'That did not go through. Try again.'
  }
  busy.value = false
  await load()
  // A refused change leaves the roles as they were, which Vue does not
  // re-render, so the box is set from what the member holds.
  box.checked = member.value?.roles.includes(role) ?? !give
}

// Each change ends by reading the member again, so the page shows what the
// server now holds.
async function act(change: () => Promise<string | null>): Promise<void> {
  busy.value = true
  notice.value = null
  try {
    notice.value = await change()
  } catch {
    notice.value = 'That did not go through. Try again.'
  }
  confirming.value = false
  confirmingNow.value = false
  busy.value = false
  if (!erased.value) await load()
}

async function remove(): Promise<void> {
  await act(async () => {
    const outcome = await deleteMember(id)
    return outcome.result === 'deleted'
      ? `Deleted. They are hidden from everyone and will be erased on ${day(outcome.eraseAfter)} unless restored.`
      : eraseNotice[outcome.result]
  })
}

async function restore(): Promise<void> {
  await act(async () =>
    (await restoreMember(id)) === 'restored'
      ? 'Restored. They can sign in and are seen again.'
      : 'There was nothing to restore.',
  )
}

async function erase(): Promise<void> {
  await act(async () => {
    const outcome = await eraseNow(id)
    if (outcome !== 'erased') return eraseNotice[outcome]
    erased.value = true
    return null
  })
}
</script>

<template>
  <section class="screen">
    <RouterLink to="/admin/members" class="small back">← Members</RouterLink>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="missing" class="empty">There is no such member.</p>

    <div v-else-if="erased" class="stack">
      <h1 class="display display-lg">Deleted</h1>
      <p class="notice notice-solid" role="status">
        {{ member?.email }} and everything attached to them are gone for good.
      </p>
    </div>

    <template v-else-if="member">
      <div class="stack">
        <p class="kicker kicker-accent">Host tools · Member</p>
        <h1 class="display display-lg">{{ member.name ?? member.email }}</h1>
        <p v-if="peerLine(member)" class="mono line">{{ peerLine(member) }}</p>
      </div>

      <p v-if="notice" class="notice notice-solid" role="status">
        {{ notice }}
      </p>

      <article class="card">
        <h2 class="card-title">Profile</h2>
        <dl class="facts">
          <dt>Name</dt>
          <dd>{{ member.name ?? '—' }}</dd>
          <dt>Job title</dt>
          <dd>{{ member.jobTitle ?? '—' }}</dd>
          <dt>Organization</dt>
          <dd>{{ member.org ?? '—' }}</dd>
          <dt>Sector</dt>
          <dd>{{ member.sector ?? '—' }}</dd>
          <dt>Company size</dt>
          <dd>{{ member.companySize ?? '—' }}</dd>
          <dt>Email</dt>
          <dd>{{ member.email }}</dd>
        </dl>
      </article>

      <article class="card">
        <h2 class="card-title">Account</h2>
        <dl class="facts">
          <dt>Status</dt>
          <dd>{{ member.status }}</dd>
          <dt>Joined</dt>
          <dd>
            <time :datetime="member.joinedAt">{{ when(member.joinedAt) }}</time>
            <template v-if="member.joinedVia">
              through “{{ member.joinedVia }}”</template
            >
          </dd>
          <template v-if="member.requestedName || member.requestedOrg">
            <dt>Said when asking to join</dt>
            <dd>
              {{
                [member.requestedName, member.requestedOrg]
                  .filter(Boolean)
                  .join(', ')
              }}
            </dd>
          </template>
        </dl>
      </article>

      <article class="card">
        <h2 class="card-title">Privacy</h2>
        <dl class="facts">
          <dt>Consent</dt>
          <dd v-if="member.consentVersion && member.consentAt">
            Version {{ member.consentVersion }}, accepted
            <time :datetime="member.consentAt">{{
              when(member.consentAt)
            }}</time>
          </dd>
          <dd v-else>Not given yet</dd>
          <dt>Help improve Rebel Match</dt>
          <dd>{{ member.analyticsOptIn ? 'Opted in' : 'Not opted in' }}</dd>
        </dl>
      </article>

      <article class="card">
        <h2 class="card-title">Activity</h2>
        <dl class="facts">
          <dt>Challenges</dt>
          <dd>{{ member.challenges }}</dd>
          <dt>Connection requests sent</dt>
          <dd>{{ member.requestsSent }}</dd>
          <dt>Connection requests received</dt>
          <dd>{{ member.requestsReceived }}</dd>
        </dl>
      </article>

      <article class="card">
        <h2 class="card-title">Roles</h2>
        <fieldset v-if="canGrant" class="roles" :disabled="busy">
          <legend class="small">What they may do</legend>
          <label v-for="role in roles" :key="role" class="role">
            <input
              type="checkbox"
              :checked="member.roles.includes(role)"
              @change="toggle(role, $event)"
            />
            {{ role }}
          </label>
        </fieldset>
        <p v-else class="small">
          {{ member.roles.length > 0 ? member.roles.join(', ') : 'None' }}
        </p>
      </article>

      <article v-if="member.status === 'deleted'" class="card deleted">
        <h2 class="card-title">Set to be deleted</h2>
        <p class="small">
          Hidden from everyone and erased for good on
          <time v-if="member.eraseAfter" :datetime="member.eraseAfter">{{
            day(member.eraseAfter)
          }}</time
          >{{
            member.deletedBySelf
              ? ', as they asked. They can still keep it with the link we email them when they ask to sign in.'
              : ', as a host deleted them. Only a host can restore them.'
          }}
        </p>
        <div v-if="confirmingNow" class="stack-tight">
          <p class="alert" role="alert">
            Erase {{ member.email }} now? Everything about them goes for good,
            and nobody can restore it.
          </p>
          <div class="actions">
            <button
              type="button"
              class="btn btn-dark btn-small"
              :disabled="busy"
              @click="erase"
            >
              Erase now
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-small"
              :disabled="busy"
              @click="confirmingNow = false"
            >
              Keep for now
            </button>
          </div>
        </div>
        <div v-else class="actions">
          <button
            type="button"
            class="btn btn-primary btn-small"
            :disabled="busy"
            @click="restore"
          >
            Restore
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-small"
            :disabled="busy"
            @click="confirmingNow = true"
          >
            Erase now…
          </button>
        </div>
      </article>

      <article v-else class="card">
        <h2 class="card-title">Delete</h2>
        <div v-if="confirming" class="stack-tight">
          <p class="alert" role="alert">
            Delete {{ member.email }}? They are hidden from everyone at once and
            erased with everything they wrote after {{ graceSpan(graceDays) }},
            unless restored.
          </p>
          <div class="actions">
            <button
              type="button"
              class="btn btn-dark btn-small"
              :disabled="busy"
              @click="remove"
            >
              Delete
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-small"
              :disabled="busy"
              @click="confirming = false"
            >
              Keep
            </button>
          </div>
        </div>
        <div v-else class="stack-tight">
          <p class="small">
            Hides them at once and erases them with their challenges, requests,
            swipes, follows and messages after {{ graceSpan(graceDays) }} (GDPR
            erasure). Until then you can restore them.
          </p>
          <button
            type="button"
            class="btn btn-ghost btn-small"
            @click="confirming = true"
          >
            Delete…
          </button>
        </div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.deleted {
  border: var(--line-width) solid var(--accent-line);
}

.back {
  color: var(--muted);
}

.line {
  margin: 0;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.facts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 0.4rem 0.8rem;
  margin: 0.6rem 0 0;
}

.facts dt {
  color: var(--muted);
}

.facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.roles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.2rem;
  border: 0;
  margin: 0.4rem 0 0;
  padding: 0;
}

.role {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 700;
}
</style>
