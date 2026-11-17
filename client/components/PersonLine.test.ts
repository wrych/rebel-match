// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PersonLine from './PersonLine.vue'

describe('PersonLine', () => {
  it('starts the line under the name with the cell flag (R-PROF-9)', () => {
    const line = mount(PersonLine, {
      props: { cell: 'japan', line: 'Coach · Rebels' },
    })

    expect(line.text()).toBe('🇯🇵Coach · Rebels')
    expect(line.find('[role="img"]').attributes('aria-label')).toBe(
      'Rebel cell: Japan',
    )
  })

  it('shows the flag alone when nothing else was given', () => {
    expect(
      mount(PersonLine, { props: { cell: 'spain', line: '' } }).text(),
    ).toBe('🇪🇸')
  })

  it('shows nothing without a cell or a line', () => {
    const line = mount(PersonLine, { props: { cell: null, line: '' } })
    expect(line.html()).toBe('<!--v-if-->')
  })
})
