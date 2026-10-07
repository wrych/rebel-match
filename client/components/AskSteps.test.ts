// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { askJourney, onboardingJourney } from '../lib/steps'
import AskSteps from './AskSteps.vue'

describe('AskSteps', () => {
  it('announces the journey it is given', () => {
    const header = mount(AskSteps, {
      props: { journey: onboardingJourney, current: 1 },
    })
    expect(header.find('ol').attributes('aria-label')).toBe('Onboarding')
  })

  it('shows the journey labels in order', () => {
    const header = mount(AskSteps, {
      props: { journey: onboardingJourney, current: 1 },
    })
    expect(header.findAll('li').map((step) => step.text())).toEqual([
      '1 Profile',
      '2 Privacy',
      '3 Usage',
    ])
  })

  it('marks earlier steps done and the current one as the step', () => {
    const header = mount(AskSteps, {
      props: { journey: askJourney, current: 2 },
    })
    const [describe, domain, matches] = header.findAll('li')
    expect(describe?.classes()).toContain('done')
    expect(domain?.attributes('aria-current')).toBe('step')
    expect(domain?.classes()).toContain('now')
    expect(matches?.classes()).toEqual([])
  })
})
