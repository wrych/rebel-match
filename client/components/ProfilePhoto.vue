<script setup lang="ts">
import { ref } from 'vue'
import type { ClientConfig } from '../lib/api'
import { ownPhotoUrl, removePhoto, savePhoto, squarePhoto } from '../lib/photo'
import MemberPhoto from './MemberPhoto.vue'
import SavedTick from './SavedTick.vue'

const props = defineProps<{
  name: string
  photoAt: string | null
  limits: Pick<
    ClientConfig['limits'],
    'savedTickMs' | 'photoSidePx' | 'photoJpegQuality'
  >
}>()

const shown = ref<string | null>(
  props.photoAt === null ? null : ownPhotoUrl(props.photoAt),
)
const busy = ref(false)
const savedShown = ref(false)
const problem = ref<string | null>(null)
const picker = ref<HTMLInputElement | null>(null)
let tickTimer: ReturnType<typeof setTimeout> | undefined

function tick(): void {
  savedShown.value = true
  clearTimeout(tickTimer)
  tickTimer = setTimeout(() => {
    savedShown.value = false
  }, props.limits.savedTickMs)
}

async function shaped(file: File): Promise<Blob | null> {
  try {
    return await squarePhoto(file, props.limits)
  } catch {
    return null
  }
}

async function upload(file: File): Promise<void> {
  const jpeg = await shaped(file)
  if (jpeg === null) {
    problem.value = 'That picture could not be read. Try another one.'
    return
  }
  if ((await savePhoto(jpeg)) === 'refused') {
    problem.value = 'That picture could not be used. Try another one.'
    return
  }
  shown.value = ownPhotoUrl(new Date().toISOString())
  tick()
}

async function run(work: () => Promise<void>): Promise<void> {
  busy.value = true
  savedShown.value = false
  problem.value = null
  try {
    await work()
  } catch {
    problem.value = 'That did not save. Try again.'
  } finally {
    busy.value = false
  }
}

async function chosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file !== undefined) await run(() => upload(file))
}

function remove(): Promise<void> {
  return run(async () => {
    await removePhoto()
    shown.value = null
    tick()
  })
}
</script>

<template>
  <section class="stack-tight" aria-labelledby="photo-heading">
    <div class="head">
      <h2 id="photo-heading" class="label">Your photo (optional)</h2>
      <SavedTick :shown="savedShown" />
    </div>
    <div class="photo-row">
      <div class="photo">
        <MemberPhoto :name="props.name" :src="shown" />
      </div>
      <div class="stack-tight">
        <input
          ref="picker"
          class="picker"
          tabindex="-1"
          type="file"
          accept="image/*"
          aria-label="Choose a photo"
          :disabled="busy"
          @change="chosen"
        />
        <button
          type="button"
          class="btn btn-ghost btn-small"
          :disabled="busy"
          @click="picker?.click()"
        >
          {{ shown ? 'Change photo' : 'Add a photo' }}
        </button>
        <button
          v-if="shown"
          type="button"
          class="btn btn-ghost btn-small"
          :disabled="busy"
          @click="remove"
        >
          Remove photo
        </button>
      </div>
    </div>
    <p class="small">
      Only you see your photo for now. It is cropped to a square on your device,
      and where or when it was taken is not kept.
    </p>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.photo-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.photo {
  width: 6rem;
  flex: none;
}

.picker {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
