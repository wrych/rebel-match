<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchSettings, type SettingsGroup } from '../lib/settings'

const groups = ref<SettingsGroup[]>([])
const problem = ref<string | null>(null)

onMounted(async () => {
  try {
    groups.value = await fetchSettings()
  } catch {
    problem.value = 'The settings could not be loaded.'
  }
})
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Host tools</p>
      <h1 class="display display-lg">Settings</h1>
      <p class="lede">
        How this copy of Rebel Match is set up. To change a value, set its
        variable on the deployment and deploy again.
      </p>
    </div>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>

    <article
      v-for="(group, index) in groups"
      :key="group.title"
      class="card"
      :aria-labelledby="`group-${index}`"
    >
      <h2 :id="`group-${index}`" class="card-title">{{ group.title }}</h2>
      <p class="small">{{ group.explanation }}</p>
      <dl class="settings">
        <div v-for="setting in group.settings" :key="setting.name" class="row">
          <dt>{{ setting.name }}</dt>
          <dd class="value">
            {{ setting.value }}
            <span v-if="setting.changed" class="chip chip-accent">Changed</span>
            <span v-else-if="setting.fixed" class="chip chip-dashed"
              >Fixed in code</span
            >
          </dd>
          <dd class="small">{{ setting.explanation }}</dd>
          <dd v-if="setting.envVar" class="mono var">{{ setting.envVar }}</dd>
        </div>
      </dl>
    </article>
  </section>
</template>

<style scoped>
.settings {
  margin: 0.4rem 0 0;
}

.row {
  padding: 0.8rem 0;
  border-top: 1px solid var(--line);
}

dt {
  font-weight: 700;
}

dd {
  margin: 0.2rem 0 0;
}

.value {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  overflow-wrap: anywhere;
}

.var {
  color: var(--muted);
  font-size: 0.8rem;
}
</style>
