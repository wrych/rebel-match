<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PresentationStage from '../components/PresentationStage.vue'
import { fetchPresentation } from '../lib/presentation'
import { script } from '../presentation/script'
import type { PresentationData } from '../presentation/world'

const data = ref<PresentationData | null>(null)
const problem = ref<string | null>(null)

onMounted(async () => {
  try {
    data.value = await fetchPresentation()
  } catch {
    problem.value = 'The presentation could not be loaded.'
  }
})
</script>

<template>
  <section class="screen">
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="!data" class="empty">Loading the network…</p>
    <PresentationStage v-else :data="data" :script="script" />
  </section>
</template>
