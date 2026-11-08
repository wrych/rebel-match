// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MemberPhoto from './MemberPhoto.vue'
import PeerCards from './PeerCards.vue'
import PersonCard from './PersonCard.vue'

const KEY = 'k'.repeat(43)
const peer = {
  memberId: 'm-ben',
  name: 'Ben Rebel',
  jobTitle: null,
  org: 'Buurtzorg',
  sector: null,
  companySize: null,
  photo: KEY,
  note: 'Been there.',
  challengeId: null,
}

describe('MemberPhoto (R-PROF-7)', () => {
  it('shows the photo as a picture only: no link, not draggable', () => {
    const photo = mount(MemberPhoto, {
      props: { name: 'Ben Rebel', src: '/api/photos/x' },
    })
    const img = photo.find('img')
    expect(img.attributes('src')).toBe('/api/photos/x')
    expect(img.attributes('draggable')).toBe('false')
    expect(photo.find('a').exists()).toBe(false)
  })

  it('shows the initials without a photo', () => {
    const photo = mount(MemberPhoto, {
      props: { name: 'Ben Rebel', src: null },
    })
    expect(photo.find('img').exists()).toBe(false)
    expect(photo.text()).toBe('BR')
  })
})

describe('photos on cards (R-PROF-7)', () => {
  const stubs = { global: { stubs: { RouterLink: true } } }

  it('draws a rebel’s photo by its key while photos are on', () => {
    const cards = mount(PeerCards, {
      props: {
        peers: [
          peer,
          { ...peer, memberId: 'm-cleo', name: 'Cleo', photo: null },
        ],
        challengeId: 'c-1',
        kind: 'been_there',
        action: 'Ask them',
        nobody: '',
        photosOn: true,
      },
      ...stubs,
    })
    expect(cards.find('img').attributes('src')).toBe(`/api/photos/${KEY}`)
    expect(cards.text()).toContain('C')
    expect(cards.findAll('.member-photo')).toHaveLength(2)
  })

  it('draws neither photo nor initials while photos are off', () => {
    const cards = mount(PeerCards, {
      props: {
        peers: [peer],
        challengeId: 'c-1',
        kind: 'been_there',
        action: 'Ask them',
        nobody: '',
      },
      ...stubs,
    })
    expect(cards.find('.member-photo').exists()).toBe(false)
  })

  it('draws a searched member’s photo beside their name', () => {
    const card = mount(PersonCard, {
      props: {
        card: { ...peer, connectionId: null },
        photosOn: true,
      },
      ...stubs,
    })
    expect(card.find('img').attributes('src')).toBe(`/api/photos/${KEY}`)
    expect(card.text()).toContain('Ben Rebel')
  })
})
