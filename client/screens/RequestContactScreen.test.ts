// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RequestContactScreen from './RequestContactScreen.vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'r1' } }) }))

function serve(response: object): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(RequestContactScreen)
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RequestContactScreen', () => {
  it('shows the email and a pre-filled mailto once accepted (R-CONN-3)', async () => {
    const contact = {
      name: 'Sam Boat',
      email: 'sam@example.invalid',
      mailto: 'mailto:sam@example.invalid?subject=Rebel%20Match',
    }
    serve({ ok: true, status: 200, json: async () => ({ contact }) })
    const screen = await mountScreen()

    expect(screen.text()).toContain('sam@example.invalid')
    expect(screen.find('a').attributes('href')).toBe(contact.mailto)
  })

  it('shows no contact when the server gives none (R-CONN-6)', async () => {
    serve({ ok: false, status: 404 })
    const screen = await mountScreen()

    expect(screen.find('.empty').text()).toContain('only once a request')
    expect(screen.find('a').exists()).toBe(false)
  })

  it('says so when the contact cannot be loaded', async () => {
    serve({ ok: false, status: 500 })

    expect((await mountScreen()).find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })
})
