// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PeerCards from './PeerCards.vue'

vi.mock('../lib/config', async (original) => ({
  ...(await original<typeof import('../lib/config')>()),
  sharedConfig: async () => ({ limits: { connectMark: 1 } }),
}))

const peer = {
  memberId: 'm-ben',
  name: 'Ben Rebel',
  jobTitle: null,
  org: 'Buurtzorg',
  sector: null,
  companySize: null,
  photo: null,
  note: 'Been there.',
  challengeId: 'c-ben',
}

describe('PeerCards', () => {
  it.each([
    ['same_boat', 'Connect'],
    ['been_there', 'Ask'],
  ] as const)(
    'marks the %s action with the mark, not Report (R-LOOK-7)',
    async (kind, action) => {
      const cards = mount(PeerCards, {
        props: { peers: [peer], challengeId: 'c-1', kind, action, nobody: '' },
        global: { stubs: { RouterLink: RouterLinkStub } },
      })
      await flushPromises()
      const link = (label: string): boolean | undefined =>
        cards
          .findAll('a')
          .find((a) => a.text() === label)
          ?.find('.connect-mark')
          .exists()

      expect(link(action)).toBe(true)
      expect(link('Report')).toBe(false)
    },
  )
})
