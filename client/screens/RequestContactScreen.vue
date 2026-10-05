<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchContact, overInOrder, type Contact } from '../lib/connections'

const route = useRoute()
const id = String(route.params.id)
const contact = ref<Contact | null>(null)
const missing = ref(false)
const problem = ref<string | null>(null)
const over = computed(() => overInOrder(contact.value?.over ?? []))

onMounted(async () => {
  try {
    contact.value = await fetchContact(id)
    missing.value = contact.value === null
  } catch {
    problem.value = 'The contact could not be loaded. Reload to try again.'
  }
})
</script>

<template>
  <section class="screen">
    <p v-if="missing" class="empty">
      There is no contact to show here. Emails are shared only once a request is
      accepted.
    </p>

    <template v-else-if="contact">
      <div class="stack">
        <p class="kicker kicker-accent">Connected</p>
        <h1 class="display display-lg">Over to you and {{ contact.name }}</h1>
        <p class="lede">
          You both opted in, so you both have each other’s email now. Either of
          you can write first.
        </p>
      </div>

      <div class="card">
        <span class="card-title">{{ contact.name }}</span>
        <span class="mono contact-email">{{ contact.email }}</span>
      </div>

      <a :href="contact.mailto" class="btn btn-primary"
        >Write to {{ contact.name }}</a
      >

      <section v-if="over.length > 0" class="stack rule" aria-labelledby="over">
        <h2 id="over" class="display display-md">Connected over</h2>
        <article
          v-for="each in over"
          :key="each.id"
          class="card"
          :class="{ 'card-new': each.unseen }"
        >
          <span class="card-head">
            <span class="small">{{
              each.direction === 'outgoing'
                ? 'You reached out'
                : `${contact.name} reached out`
            }}</span>
            <span class="tags">
              <span v-if="each.unseen" class="chip chip-accent">New</span>
              <span
                class="chip"
                :class="each.kind === 'same_boat' ? 'chip-accent' : 'chip-ink'"
                >{{
                  each.kind === 'same_boat' ? 'Same boat' : 'Been there'
                }}</span
              >
            </span>
          </span>
          <div v-if="each.challenge" class="stack-tight">
            <p class="kicker">
              About {{ each.challenge.trendShort ?? 'a challenge' }}
            </p>
            <p class="mine">{{ each.challenge.body }}</p>
          </div>
          <p v-if="each.message" class="small peer-note">
            “{{ each.message }}”
          </p>
        </article>
      </section>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.4rem;
}

.contact-email {
  color: var(--accent);
  overflow-wrap: anywhere;
}
</style>
