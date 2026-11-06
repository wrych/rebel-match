// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProfileCodeControls from './ProfileCodeControls.vue'

function answer(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: status < 300, status, json: async () => body }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const on = { token: 't-1', enabled: true }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ProfileCodeControls (R-CODE-4)', () => {
  it('turns the code off, the same code', async () => {
    answer(200, { token: 't-1', enabled: false })
    const controls = mount(ProfileCodeControls, { props: { code: on } })
    await controls.find('input[type=checkbox]').setValue(false)
    await flushPromises()

    expect(controls.emitted('changed')).toEqual([
      [{ token: 't-1', enabled: false }],
    ])
  })

  it('resets the code and says the old one no longer works', async () => {
    const fetchMock = answer(200, { token: 't-2', enabled: true })
    const controls = mount(ProfileCodeControls, { props: { code: on } })
    await controls.find('button').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/me/profile-code/reset', {
      method: 'POST',
    })
    expect(controls.emitted('changed')).toEqual([
      [{ token: 't-2', enabled: true }],
    ])
    expect(controls.text()).toContain('Your old code no longer works')
  })

  it('says so when a change did not save', async () => {
    answer(500, {})
    const controls = mount(ProfileCodeControls, { props: { code: on } })
    await controls.find('button').trigger('click')
    await flushPromises()

    expect(controls.find('[role=alert]').text()).toContain('did not save')
    expect(controls.emitted('changed')).toBeUndefined()
  })

  it('puts the box back when turning the code off did not save', async () => {
    answer(500, {})
    const controls = mount(ProfileCodeControls, { props: { code: on } })
    const box = controls.find('input[type=checkbox]')
    await box.setValue(false)
    await flushPromises()

    expect((box.element as HTMLInputElement).checked).toBe(true)
    expect(controls.text()).toContain('Profile code: on')
  })
})
