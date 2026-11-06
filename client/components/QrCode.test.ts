// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { encode } from 'uqr'
import { describe, expect, it } from 'vitest'
import QrCode from './QrCode.vue'

describe('QrCode (ADR 0063)', () => {
  it('draws the code with a four-module quiet zone, named for readers', () => {
    const value = 'https://app.example/p#t=abc'
    const bare = encode(value, { border: 0 }).size
    const code = mount(QrCode, { props: { value, label: 'Profile code' } })

    const svg = code.find('svg')
    expect(svg.attributes('aria-label')).toBe('Profile code')
    expect(svg.attributes('viewBox')).toBe(
      `0 0 ${String(bare + 8)} ${String(bare + 8)}`,
    )
    expect(code.find('path').attributes('d')).toMatch(/^M4 4h1v1h-1z/)
  })
})
