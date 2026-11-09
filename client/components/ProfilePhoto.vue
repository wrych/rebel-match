<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { useAction } from '../lib/action'
import type { ClientConfig } from '../lib/api'
import type { Crop } from '../lib/crop'
import {
  encodeSquare,
  ownPhotoUrl,
  readPicture,
  removePhoto,
  savePhoto,
} from '../lib/photo'
import MemberPhoto from './MemberPhoto.vue'
import PhotoCropper from './PhotoCropper.vue'
import SavedTick from './SavedTick.vue'

const props = defineProps<{
  name: string
  photoAt: string | null
  limits: Pick<
    ClientConfig['limits'],
    | 'savedTickMs'
    | 'photoSidePx'
    | 'photoJpegQuality'
    | 'photoMaxZoom'
    | 'photoKeyStepPx'
    | 'photoZoomStep'
  >
}>()

const shown = ref<string | null>(
  props.photoAt === null ? null : ownPhotoUrl(props.photoAt),
)
const savedShown = ref(false)
const problem = ref<string | null>(null)
const action = useAction(problem)
const busy = action.busy
const picker = ref<HTMLInputElement | null>(null)
const framing = shallowRef<ImageBitmap | null>(null)
let tickTimer: ReturnType<typeof setTimeout> | undefined

function tick(): void {
  savedShown.value = true
  clearTimeout(tickTimer)
  tickTimer = setTimeout(() => {
    savedShown.value = false
  }, props.limits.savedTickMs)
}

function closeFraming(): void {
  framing.value?.close()
  framing.value = null
}

onBeforeUnmount(closeFraming)

async function save(crop: Crop, picture: ImageBitmap): Promise<void> {
  const jpeg = await encodeSquare(picture, crop, props.limits)
  if ((await savePhoto(jpeg)) === 'refused') {
    problem.value = 'That picture could not be used. Try another one.'
    return
  }
  closeFraming()
  shown.value = ownPhotoUrl(new Date().toISOString())
  tick()
}

function run(work: () => Promise<void>): Promise<void> {
  savedShown.value = false
  problem.value = null
  return action.run(work, 'That did not save. Try again.')
}

async function chosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file === undefined) return
  problem.value = null
  closeFraming()
  try {
    framing.value = await readPicture(file)
  } catch {
    problem.value = 'That picture could not be read. Try another one.'
  }
}

function use(crop: Crop): Promise<void> {
  const picture = framing.value
  return picture === null ? Promise.resolve() : run(() => save(crop, picture))
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
    <PhotoCropper
      v-if="framing"
      :picture="framing"
      :limits="props.limits"
      :busy="busy"
      @use="use"
      @cancel="closeFraming"
    />
    <div v-else class="photo-row">
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
      Other members see your photo beside your name: on match cards, in the
      deck, in search and on your page. Hosts see it on your page in their
      tools, and, if you are in the summit presentation, it is shown on stage.
      In the network replay it marks your own point, for you only. You choose
      the square it is cut to, on your device, and where or when it was taken is
      not kept.
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
