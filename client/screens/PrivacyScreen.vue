<script setup lang="ts">
import markdown from '../../docs/legal/privacy-notice.md?raw'
import LegalText from '../components/LegalText.vue'
import { parseLegal } from '../lib/legal'

const notice = parseLegal(markdown)
</script>

<template>
  <section class="screen">
    <LegalText :document="notice" />
    <RouterLink to="/terms" class="row-link">
      <span class="row-link-label">Terms of use</span>
    </RouterLink>
  </section>
</template>
