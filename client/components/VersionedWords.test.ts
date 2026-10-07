// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import VersionedWords from './VersionedWords.vue'

describe('VersionedWords', () => {
  it('shows each heading above its paragraph', () => {
    const words = mount(VersionedWords, {
      props: { words: [{ heading: 'Why', text: 'To see what works.' }] },
    })
    expect(words.find('h3').text()).toBe('Why')
    expect(words.find('p').text()).toBe('To see what works.')
  })

  it('shows a paragraph without a heading as it is', () => {
    const words = mount(VersionedWords, {
      props: { words: ['Older words.'] },
    })
    expect(words.find('h3').exists()).toBe(false)
    expect(words.text()).toBe('Older words.')
  })

  it('draws the solid card only when asked', () => {
    const plain = mount(VersionedWords, { props: { words: ['A.'] } })
    const solid = mount(VersionedWords, {
      props: { words: ['A.'], solid: true },
    })
    expect(plain.classes()).toContain('card')
    expect(solid.classes()).toContain('card-solid')
  })
})
