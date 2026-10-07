<script setup lang="ts">
import markdown from '../../docs/legal/terms-of-use.md?raw'
import LegalText from '../components/LegalText.vue'
import { parseLegal } from '../lib/legal'

const terms = parseLegal(markdown)
</script>

<template>
  <section class="screen">
    <LegalText :document="terms" />
    <RouterLink to="/privacy" class="row-link">
      <span class="row-link-label">Privacy notice</span>
    </RouterLink>
  </section>
</template>
