<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchConfig } from '../lib/api'
import {
  fetchNotifications,
  headline,
  markNotificationsSeen,
  type NotificationView,
} from '../lib/notifications'
import { when } from '../lib/when'

const notes = ref<NotificationView[]>([])
const loaded = ref(false)
const more = ref(false)
const loading = ref(false)
const problem = ref<string | null>(null)
let pageSize = 0

// What was new stays outlined for this visit; the server counts it seen from
// now on, so the menu's badge clears (R-NOTE-5, R-NOTE-6). A failed mark only
// leaves them new for next time.
async function show(page: NotificationView[]): Promise<void> {
  notes.value = [...notes.value, ...page]
  more.value = pageSize > 0 && page.length >= pageSize
  await markNotificationsSeen(
    page.filter((note) => note.isNew).map((note) => note.id),
  ).catch(() => undefined)
}

async function older(): Promise<void> {
  const last = notes.value.at(-1)
  if (last === undefined || loading.value) return
  loading.value = true
  try {
    await show(await fetchNotifications(last.id))
  } catch {
    problem.value = 'Older notifications could not be loaded. Try again.'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const [page, config] = await Promise.all([
      fetchNotifications(),
      fetchConfig().catch(() => null),
    ])
    pageSize = config?.limits.notificationsPageSize ?? 0
    await show(page)
  } catch {
    problem.value = 'Your notifications could not be loaded. Try again.'
  } finally {
    loaded.value = true
  }
})
</script>

<template>
  <section class="screen">
    <div class="stack">
      <h1 class="display display-lg">Notifications</h1>
    </div>

    <section class="stack" aria-label="Your notifications">
      <p v-if="loaded && !problem && notes.length === 0" class="empty">
        Nothing yet. When someone wants to connect with you, it shows here.
      </p>
      <RouterLink
        v-for="note in notes"
        :key="note.id"
        :to="note.path"
        class="card note"
        :class="{ 'card-new': note.isNew }"
      >
        <span class="card-title">{{ headline(note) }}</span>
        <span class="mono small"
          ><span v-if="note.isNew" class="new">New · </span
          ><time :datetime="note.at">{{ when(note.at) }}</time></span
        >
      </RouterLink>
      <button
        v-if="more"
        type="button"
        class="btn btn-ghost btn-small"
        :disabled="loading"
        @click="older"
      >
        Show older
      </button>
    </section>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.note {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: inherit;
  text-decoration: none;
}

.new {
  font-weight: 700;
}
</style>
