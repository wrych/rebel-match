<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchContact, type Contact } from '../lib/connections'

const route = useRoute()
const id = String(route.params.id)
const contact = ref<Contact | null>(null)
const missing = ref(false)
const problem = ref<string | null>(null)

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
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.contact-email {
  color: var(--accent);
  overflow-wrap: anywhere;
}
</style>
