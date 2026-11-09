<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAction } from '../lib/action'
import type { Trend } from '../lib/challenges'
import { fetchFollowed, setFollowing } from '../lib/follows'

const props = defineProps<{ trend: Pick<Trend, 'id' | 'short'> }>()

const following = ref(false)
const problem = ref<string | null>(null)
const { busy: saving, run } = useAction(problem)

onMounted(async () => {
  try {
    following.value = (await fetchFollowed()).some(
      (each) => each.id === props.trend.id,
    )
  } catch {
    problem.value = 'Whether you follow this could not be loaded.'
  }
})

async function toggle(): Promise<void> {
  problem.value = null
  await run(async () => {
    await setFollowing(props.trend.id, !following.value)
    following.value = !following.value
  }, 'That did not save. Try again.')
}
</script>

<template>
  <button
    type="button"
    class="btn"
    :class="following ? 'btn-dark' : 'btn-ghost'"
    :aria-pressed="following"
    :disabled="saving"
    @click="toggle"
  >
    {{ following ? 'Following' : 'Follow' }} “{{ trend.short }}”
  </button>
  <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
</template>
