// @vitest-environment jsdom
import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PeerCards from './PeerCards.vue'

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
    (kind, action) => {
      const cards = mount(PeerCards, {
        props: { peers: [peer], challengeId: 'c-1', kind, action, nobody: '' },
        global: { stubs: { RouterLink: RouterLinkStub } },
      })
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
