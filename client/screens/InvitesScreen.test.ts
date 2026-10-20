// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventBadge } from '../lib/invites'
import InvitesScreen from './InvitesScreen.vue'

const invite = {
  id: 'i-1',
  label: 'Main stage',
  validFrom: '2026-11-08T09:00:00.000Z',
  validUntil: '2026-11-08T21:00:00.000Z',
  maxUses: 400,
  uses: 3,
  opens: 7,
  state: 'active',
  joinUrl: 'http://localhost:5173/?invite=abc',
  createdBy: 'host@example.invalid',
  createdAt: '2026-11-08T08:00:00.000Z',
  eventBadge: null as EventBadge | null,
}
const limits = {
  invitesPollSeconds: 60,
  inviteDefaultHours: 12,
  inviteDefaultMaxUses: 400,
  inviteLabelMaxChars: 120,
  savedTickMs: 2000,
  badgeLogoMaxBytes: 2048,
}

interface Reply {
  status: number
  body?: unknown
}

let listed = [invite]

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
              body: url === '/api/config' ? { limits } : { invites: listed },
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

function copyButton(
  screen: ReturnType<typeof mount>,
): ReturnType<ReturnType<typeof mount>['find']> {
  return screen.find('button[aria-label="Copy the join URL of Main stage"]')
}

function postBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
  const [, init] = fetchMock.mock.calls.find(
    ([, options]) => (options as RequestInit | undefined)?.method === 'POST',
  ) as [string, RequestInit]
  return JSON.parse(String(init.body))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  listed = [invite]
})

describe('InvitesScreen', () => {
  it('lists each invite with state, uses against cap and join URL (R-INV-9)', async () => {
    server()
    const text = (await mountScreen()).text()

    expect(text).toContain('Main stage')
    expect(text).toContain('active')
    expect(text).toContain('7 opened · 3 of 400 used')
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

  it('reads YYYY-MM-DD days as the whole of them, in local time', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await screen.find('#label').setValue('Summit')
    await screen.find('#valid-from').setValue('2026-11-08')
    await screen.find('#valid-until').setValue('2026-11-09')
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(postBody(fetchMock)).toEqual({
      label: 'Summit',
      validFrom: new Date(2026, 10, 8).toISOString(),
      validUntil: new Date(2026, 10, 10).toISOString(),
    })
  })

  it('says how to write a day it cannot read, sending nothing', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await screen.find('#label').setValue('Typo')
    await screen.find('#valid-until').setValue('08.11.2026')
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(
      fetchMock.mock.calls.some(
        ([, options]) =>
          (options as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false)
    expect(screen.find('[role="status"]').text()).toContain('YYYY-MM-DD')
  })

  it('sends a chosen window as instants and a cap as a number', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await screen.find('#label').setValue('Side room')
    await screen.find('#valid-from').setValue('2026-11-08 09:00')
    await screen.find('#valid-until').setValue('2026-11-08 21:00')
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

  it('copies the join URL to the clipboard from the card', async () => {
    server()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const screen = await mountScreen()

    await copyButton(screen).trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('http://localhost:5173/?invite=abc')
    expect(screen.find('[role="status"]').text()).toContain('Copied')
    expect(copyButton(screen).attributes('title')).toBe('Copied')
  })

  it('lets the tick fade, and drops it when a later copy fails', async () => {
    vi.useFakeTimers()
    server()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const screen = await mountScreen()

    await copyButton(screen).trigger('click')
    await flushPromises()
    vi.advanceTimersByTime(2000)
    await flushPromises()
    expect(copyButton(screen).attributes('title')).toBe('Copy')

    await copyButton(screen).trigger('click')
    await flushPromises()
    writeText.mockRejectedValueOnce(new Error('denied'))
    await copyButton(screen).trigger('click')
    await flushPromises()
    expect(copyButton(screen).attributes('title')).toBe('Copy')
    vi.useRealTimers()
  })

  it('keeps the tick until the next copy when the config is unavailable', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          ok: url !== '/api/config',
          status: url === '/api/config' ? 500 : 200,
          json: async () => ({ invites: [invite] }),
        }),
      ),
    )
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    const screen = await mountScreen()

    await copyButton(screen).trigger('click')
    await flushPromises()
    vi.advanceTimersByTime(60_000)
    await flushPromises()

    expect(copyButton(screen).attributes('title')).toBe('Copied')
    vi.useRealTimers()
  })

  it('says so when the clipboard refuses', async () => {
    server()
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const screen = await mountScreen()

    await copyButton(screen).trigger('click')
    await flushPromises()

    expect(screen.find('[role="status"]').text()).toContain('not copied')
  })

  it('outlines an invite another host creates while it is open (R-NAV-12)', async () => {
    vi.useFakeTimers()
    server()
    const screen = await mountScreen()
    expect(screen.find('.card-new').exists()).toBe(false)

    listed = [{ ...invite, id: 'i2', label: 'Side stage' }, invite]
    await vi.advanceTimersByTimeAsync(60_000)

    expect(screen.find('.card-new .card-title').text()).toBe('Side stage')
    screen.unmount()
  })
})

describe('event badges on a new invite (R-BADGE-4, R-BADGE-5)', () => {
  const summit = {
    id: 'b-1',
    name: 'Stormed the Summit',
    ticketLine: 'SUMMIT',
    bigLine: '2026',
    hasLogo: true,
  }
  const logo =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20z"/></svg>'

  async function upload(
    screen: ReturnType<typeof mount>,
    text: string,
  ): Promise<void> {
    const input = screen.find('#badge-logo')
    Object.defineProperty(input.element, 'files', {
      value: [new File([text], 'summit.svg', { type: 'image/svg+xml' })],
    })
    await input.trigger('change')
    await flushPromises()
  }

  it('sends a new badge with its logo as uploaded, previewing the ticket', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await screen.find('#label').setValue('Main stage')
    await screen.findAll('input[type="radio"]')[1]!.setValue(true)
    await screen.find('#badge-name').setValue('Stormed the Summit')
    await screen.find('#badge-ticket').setValue('SUMMIT')
    await screen.find('#badge-big').setValue('2026')
    await upload(screen, logo)

    expect(screen.find('.preview image').attributes('href')).toMatch(
      /^data:image\/svg\+xml/,
    )
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(postBody(fetchMock)).toEqual({
      label: 'Main stage',
      eventBadge: {
        name: 'Stormed the Summit',
        ticketLine: 'SUMMIT',
        bigLine: '2026',
        logoSvg: logo,
      },
    })
  })

  it('keeps what the host typed while the logo was being read', async () => {
    const fetchMock = server()
    const screen = await mountScreen()
    await screen.find('#label').setValue('Main stage')
    await screen.findAll('input[type="radio"]')[1]!.setValue(true)
    let finish: (text: string) => void = () => undefined
    const file = new File([logo], 'summit.svg', { type: 'image/svg+xml' })
    Object.defineProperty(file, 'text', {
      value: () => new Promise<string>((resolve) => (finish = resolve)),
    })
    const input = screen.find('#badge-logo')
    Object.defineProperty(input.element, 'files', { value: [file] })

    await input.trigger('change')
    await screen.find('#badge-name').setValue('Stormed the Summit')
    await screen.find('#badge-ticket').setValue('SUMMIT')
    await screen.find('#badge-big').setValue('2026')
    finish(logo)
    await flushPromises()
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(postBody(fetchMock)).toMatchObject({
      eventBadge: { name: 'Stormed the Summit', logoSvg: logo },
    })
  })

  it('says a logo is too big before sending it', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await screen.findAll('input[type="radio"]')[1]!.setValue(true)
    await upload(screen, `${logo}${' '.repeat(4096)}`)

    expect(screen.find('.badge-fields [role="alert"]').text()).toContain(
      'at most 2 kB',
    )
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false)
  })

  it('gives a second invite the badge of another, and shows it on the card', async () => {
    listed = [{ ...invite, eventBadge: summit }]
    const fetchMock = server()
    const screen = await mountScreen()

    expect(screen.find('.event-badge').text()).toContain('Stormed the Summit')
    expect(screen.find('.event-badge image').attributes('href')).toBe(
      '/api/event-badges/b-1/logo.svg',
    )
    await screen.find('#label').setValue('Workshop room')
    await screen.findAll('input[type="radio"]')[2]!.setValue(true)
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(postBody(fetchMock)).toEqual({
      label: 'Workshop room',
      eventBadgeId: 'b-1',
    })
    listed = [invite]
  })

  it('says why the server refused a logo', async () => {
    server({ status: 400, body: { error: 'bad_logo' } })
    const screen = await mountScreen()

    await screen.find('#label').setValue('Main stage')
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(screen.find('[role="status"]').text()).toContain(
      'The logo was not taken',
    )
  })
})
