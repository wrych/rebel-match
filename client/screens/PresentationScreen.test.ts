// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import PresentationScreen from './PresentationScreen.vue'

const StageStub = defineComponent({
  name: 'PresentationStage',
  props: {
    data: { type: Object, required: true },
    script: { type: Object, required: true },
  },
  template: '<div class="stage-stub" />',
})

const data = {
  timeline: { nodes: [], links: [], moons: [], own: null },
  cast: [],
}

function serve(ok: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        ok
          ? { ok: true, status: 200, json: async () => data }
          : { ok: false, status: 500 },
      ),
    ),
  )
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(PresentationScreen, {
    global: { stubs: { PresentationStage: StageStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => vi.unstubAllGlobals())

describe('PresentationScreen (R-PRES-1)', () => {
  it('plays the network the server sends, to the committed script', async () => {
    serve(true)
    const screen = await mountScreen()
    const stage = screen.findComponent(StageStub)

    expect(stage.props('data')).toEqual(data)
    expect(
      (stage.props('script') as { length: number }).length,
    ).toBeGreaterThan(0)
  })

  it('says when it could not be loaded', async () => {
    serve(false)
    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toBe(
      'The presentation could not be loaded.',
    )
  })
})
