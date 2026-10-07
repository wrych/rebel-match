<script setup lang="ts">
import type { LegalDocument } from '../lib/legal'
import LegalRuns from './LegalRuns.vue'

defineProps<{ document: LegalDocument }>()
</script>

<template>
  <article class="stack legal">
    <div class="stack-tight">
      <h1 class="display display-lg">{{ document.title }}</h1>
      <p class="small">
        Version
        <time :datetime="document.version">{{ document.version }}</time>
      </p>
    </div>
    <template v-for="(block, index) in document.blocks" :key="index">
      <h2 v-if="block.kind === 'heading'" class="heading">
        {{ block.text }}
      </h2>
      <p v-else-if="block.kind === 'paragraph'">
        <LegalRuns :runs="block.inlines" />
      </p>
      <ul v-else-if="block.kind === 'list'">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
          <LegalRuns :runs="item.inlines" />
          <ul v-if="item.items.length > 0">
            <li v-for="(sub, subIndex) in item.items" :key="subIndex">
              <LegalRuns :runs="sub" />
            </li>
          </ul>
        </li>
      </ul>
      <hr v-else class="divider" />
    </template>
  </article>
</template>

<style scoped>
.legal p,
.legal ul {
  margin: 0;
  line-height: 1.5;
  color: var(--ink-soft);
}

.legal ul {
  display: grid;
  gap: 0.4rem;
  padding-left: 1.2rem;
}

.legal ul ul {
  margin-top: 0.4rem;
}

.legal a {
  color: inherit;
  overflow-wrap: anywhere;
}

.heading {
  margin: 0.75rem 0 0;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--ink);
}

.divider {
  width: 100%;
  margin: 0.75rem 0 0;
  border: 0;
  border-top: 1px solid var(--line);
}
</style>
