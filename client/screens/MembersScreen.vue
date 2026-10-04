<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { peerLine } from '../lib/challenges'
import { fetchMembers, matchesSearch, type RosterMember } from '../lib/members'

const members = ref<RosterMember[]>([])
const loaded = ref(false)
const search = ref('')
const problem = ref<string | null>(null)

const shown = computed(() =>
  members.value.filter((member) => matchesSearch(member, search.value)),
)

onMounted(async () => {
  try {
    members.value = await fetchMembers()
  } catch {
    problem.value = 'The members could not be loaded.'
  }
  loaded.value = true
})
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Host tools</p>
      <h1 class="display display-lg">Members</h1>
      <p class="lede">
        Everyone who has joined or asked to. Open a member to see all that is
        held about them, change their roles or delete them.
      </p>
    </div>

    <div class="field">
      <label for="member-search">Search by email or name</label>
      <input id="member-search" v-model="search" class="input" type="search" />
    </div>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="loaded && shown.length === 0" class="empty">
      Nobody matches.
    </p>

    <ul class="stack members">
      <li v-for="member in shown" :key="member.id">
        <RouterLink
          :to="`/admin/members/${encodeURIComponent(member.id)}`"
          class="card member"
        >
          <div class="card-head">
            <div class="stack-tight">
              <span class="card-title">{{ member.name ?? member.email }}</span>
              <span v-if="peerLine(member)" class="mono line">{{
                peerLine(member)
              }}</span>
            </div>
            <span class="chip chip-dashed">{{ member.status }}</span>
          </div>
          <p v-if="member.name" class="small email">{{ member.email }}</p>
          <p v-if="member.roles.length > 0" class="roles">
            <span v-for="role in member.roles" :key="role" class="chip">{{
              role
            }}</span>
          </p>
        </RouterLink>
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
  display: block;
  color: inherit;
  text-decoration: none;
}

.member:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.line,
.email {
  margin: 0;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.roles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.4rem 0 0;
}
</style>
