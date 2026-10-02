// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AccessRequestedScreen from './AccessRequestedScreen.vue'

function server(status: number): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok: status < 300, status })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function fillAndSave(screen: ReturnType<typeof mount>): Promise<void> {
  await screen.find('#name').setValue('Ada Rebel')
  await screen.find('#org').setValue('Rebels')
  await screen.find('form').trigger('submit')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('AccessRequestedScreen', () => {
  it('promises the approval email carries the login link, not a check-your-email (R-AUTH-9)', () => {
    const text = mount(AccessRequestedScreen).text()

    expect(text).toContain('approved by a person')
    expect(text).toContain('that email will contain your login link')
    expect(text).not.toContain('Check your email')
  })

  it('offers no form without a handle, since nothing could be saved', () => {
    expect(mount(AccessRequestedScreen).find('form').exists()).toBe(false)
  })

  it('saves the optional name and org with the handle (R-AUTH-11,12)', async () => {
    sessionStorage.setItem('rm_applicant_handle', 'h.s')
    const fetchMock = server(204)
    const screen = mount(AccessRequestedScreen)

    await fillAndSave(screen)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/auth/applicant')
    expect(JSON.parse(String(init.body))).toEqual({
      handle: 'h.s',
      name: 'Ada Rebel',
      org: 'Rebels',
    })
    expect(screen.find('[role="status"]').text()).toContain('can now find you')
  })

  it('keeps Save disabled while both fields are empty (R-AUTH-12)', () => {
    sessionStorage.setItem('rm_applicant_handle', 'h.s')

    const button = mount(AccessRequestedScreen).find('button[type="submit"]')

    expect(button.attributes('disabled')).toBeDefined()
  })

  it('says the request is no longer waiting when the server cannot find it', async () => {
    sessionStorage.setItem('rm_applicant_handle', 'h.s')
    server(404)
    const screen = mount(AccessRequestedScreen)

    await fillAndSave(screen)

    expect(screen.find('[role="alert"]').text()).toContain('no longer waiting')
  })

  it('reassures that the request stands when saving fails', async () => {
    sessionStorage.setItem('rm_applicant_handle', 'h.s')
    server(500)
    const screen = mount(AccessRequestedScreen)

    await fillAndSave(screen)

    expect(screen.find('[role="alert"]').text()).toContain(
      'recorded either way',
    )
  })
})
