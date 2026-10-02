// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AccessRequestedScreen from './AccessRequestedScreen.vue'

const limits = { applicantNameMaxChars: 120, applicantOrgMaxChars: 160 }

/** Answers `/api/config` with the limits and `/auth/applicant` with `status`. */
function server(status = 204): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url === '/api/config'
        ? { ok: true, status: 200, json: async () => ({ limits }) }
        : { ok: status < 300, status },
    ),
  )
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
    server()
    const text = mount(AccessRequestedScreen).text()

    expect(text).toContain('approved by a person')
    expect(text).toContain('that email will contain your login link')
    expect(text).not.toContain('Check your email')
  })

  it('offers no form without a handle, since nothing could be saved', () => {
    server()
    expect(mount(AccessRequestedScreen).find('form').exists()).toBe(false)
  })

  it('saves the optional name and org with the handle (R-AUTH-11,12)', async () => {
    sessionStorage.setItem('rm_applicant_handle', 'h.s')
    const fetchMock = server(204)
    const screen = mount(AccessRequestedScreen)

    await fillAndSave(screen)

    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === '/auth/applicant',
    ) as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      handle: 'h.s',
      name: 'Ada Rebel',
      org: 'Rebels',
    })
    expect(screen.find('[role="status"]').text()).toContain('can now find you')
  })

  it('keeps Save disabled while both fields are empty (R-AUTH-12)', () => {
    sessionStorage.setItem('rm_applicant_handle', 'h.s')
    server()

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

  it('caps the fields at the limits the server enforces (R-CFG-2)', async () => {
    sessionStorage.setItem('rm_applicant_handle', 'h.s')
    server()
    const screen = mount(AccessRequestedScreen)
    await flushPromises()

    expect(screen.find('#name').attributes('maxlength')).toBe('120')
    expect(screen.find('#org').attributes('maxlength')).toBe('160')
  })
})
