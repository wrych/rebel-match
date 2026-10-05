// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InvitesScreen from './InvitesScreen.vue'

const invite = {
  id: 'i-1',
  label: 'Main stage',
  validFrom: '2026-11-08T09:00:00.000Z',
  validUntil: '2026-11-08T21:00:00.000Z',
  maxUses: 400,
  uses: 3,
  state: 'active',
  joinUrl: 'http://localhost:5173/?invite=abc',
  createdBy: 'host@example.invalid',
  createdAt: '2026-11-08T08:00:00.000Z',
}
const limits = {
  inviteDefaultHours: 12,
  inviteDefaultMaxUses: 400,
  inviteLabelMaxChars: 120,
}

interface Reply {
  status: number
  body?: unknown
}

/** Serves the list and config, and answers each POST with `post` and each
 * PATCH with `patch`. */
function server(
  post: Reply = { status: 201, body: { invite } },
  patch: Reply = { status: 200, body: { invite: { ...invite, maxUses: 600 } } },
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const reply: Reply =
      init?.method === 'POST'
        ? post
        : init?.method === 'PATCH'
          ? patch
          : {
              status: 200,
              body: url === '/api/config' ? { limits } : { invites: [invite] },
            }
    return Promise.resolve({
      ok: reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(InvitesScreen)
  await flushPromises()
  return screen
}

function postBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
  const [, init] = fetchMock.mock.calls.find(
    ([, options]) => (options as RequestInit | undefined)?.method === 'POST',
  ) as [string, RequestInit]
  return JSON.parse(String(init.body))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('InvitesScreen', () => {
  it('lists each invite with state, uses against cap and join URL (R-INV-9)', async () => {
    server()
    const text = (await mountScreen()).text()

    expect(text).toContain('Main stage')
    expect(text).toContain('active')
    expect(text).toContain('3 of 400 used')
    expect(text).toContain('http://localhost:5173/?invite=abc')
  })

  it('creates with only a label, leaving the rest to defaults (R-INV-2,4,10)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await screen.find('#label').setValue('Main stage')
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(postBody(fetchMock)).toEqual({ label: 'Main stage' })
    expect(screen.find('[role="status"]').text()).toContain('Created')
  })

  it('sends a chosen window as instants and a cap as a number', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await screen.find('#label').setValue('Side room')
    await screen.find('#valid-from').setValue('2026-11-08T09:00')
    await screen.find('#valid-until').setValue('2026-11-08T21:00')
    await screen.find('#max-uses').setValue('50')
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(postBody(fetchMock)).toEqual({
      label: 'Side room',
      validFrom: new Date('2026-11-08T09:00').toISOString(),
      validUntil: new Date('2026-11-08T21:00').toISOString(),
      maxUses: 50,
    })
  })

  it('says so when the window ends before it starts', async () => {
    server({ status: 400, body: { error: 'bad_window' } })
    const screen = await mountScreen()

    await screen.find('#label').setValue('Backwards')
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(screen.find('[role="status"]').text()).toContain('must end after')
  })

  it('revokes and says the next scan joins the queue (R-INV-3,5)', async () => {
    const fetchMock = server({ status: 204 })
    const screen = await mountScreen()

    const revoke = screen
      .findAll('button')
      .find((button) => button.text() === 'Revoke')
    await revoke?.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/invites/i-1/revoke', {
      method: 'POST',
    })
    expect(screen.find('[role="status"]').text()).toContain('Revoked')
  })

  it('says so when the list cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )

    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })

  it('raises a cap from the card, keeping the same code (R-INV-4)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await screen
      .findAll('button')
      .find((b) => b.text() === 'Raise cap…')
      ?.trigger('click')
    await screen.find('input[type="number"][id^="cap-"]').setValue('600')
    await screen.find('form.raise').trigger('submit')
    await flushPromises()

    const [url, init] = fetchMock.mock.calls.find(
      ([, options]) => (options as RequestInit | undefined)?.method === 'PATCH',
    ) as [string, RequestInit]
    expect(url).toBe('/api/admin/invites/i-1')
    expect(JSON.parse(String(init.body))).toEqual({ maxUses: 600 })
    expect(screen.find('[role="status"]').text()).toContain(
      'now admits up to 600',
    )
  })

  it('says what a cap must be when the server refuses it', async () => {
    server(undefined, { status: 400, body: { error: 'bad_cap' } })
    const screen = await mountScreen()

    await screen
      .findAll('button')
      .find((b) => b.text() === 'Raise cap…')
      ?.trigger('click')
    await screen.find('input[type="number"][id^="cap-"]').setValue('300')
    await screen.find('form.raise').trigger('submit')
    await flushPromises()

    expect(screen.find('[role="status"]').text()).toContain('more than 400')
  })
})
