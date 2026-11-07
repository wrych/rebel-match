// @vitest-environment jsdom
import {
  enableAutoUnmount,
  flushPromises,
  mount,
  RouterLinkStub,
} from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import PeopleScreen from './PeopleScreen.vue'

const route = reactive({
  path: '/people',
  query: {} as Record<string, string>,
})
const replace = vi.fn((to: { query?: Record<string, string> }) => {
  if (to.query !== undefined) route.query = to.query
  return Promise.resolve()
})
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))

const ben = {
  memberId: 'm-ben',
  name: 'Ben Okafor',
  jobTitle: 'Coach',
  org: 'Acme',
  sector: 'Retail',
  companySize: null,
  connectionId: null,
}

function server(
  answer: unknown = { results: [ben], more: false },
  memberSearch = 1,
  connectCodes = 0,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/config')
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ limits: { memberSearch, connectCodes } }),
      })
    return Promise.resolve(
      answer === null
        ? { ok: false, status: 404 }
        : { ok: true, status: 200, json: async () => answer },
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(q?: string): Promise<ReturnType<typeof mount>> {
  route.query = q === undefined ? {} : { q }
  const screen = mount(PeopleScreen, {
    attachTo: document.body,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

const searched = (fetchMock: ReturnType<typeof vi.fn>): string[] =>
  fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.startsWith('/api/members/search'))

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockClear()
  document.body.innerHTML = ''
})

describe('PeopleScreen (S44)', () => {
  it('searches the query in the address and shows the cards, no email', async () => {
    const fetchMock = server()
    const screen = await mountScreen('ben')

    expect(searched(fetchMock)).toEqual(['/api/members/search?q=ben'])
    expect(screen.text()).toContain('Ben Okafor')
    expect(screen.text()).toContain('Coach · Acme · Retail')
    expect(screen.findComponent(RouterLinkStub).props('to')).toBe(
      '/people/m-ben',
    )
    expect(screen.html()).not.toContain('@')
  })

  it('marks a member already connected (R-CONN-8)', async () => {
    server({ results: [{ ...ben, connectionId: 'r1' }], more: false })
    const screen = await mountScreen('ben')

    expect(screen.find('.peer-list').text()).toContain('Connected')
  })

  it('keeps a submitted query in the address (R-NAV-1)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()
    await screen.find('input[type=search]').setValue('  ana  ')
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(replace).toHaveBeenCalledWith({ query: { q: 'ana' } })
    expect(searched(fetchMock)).toEqual(['/api/members/search?q=ana'])
  })

  it('searches again when the same query is submitted, as after a failure', async () => {
    const fetchMock = server()
    const screen = await mountScreen('ben')
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(searched(fetchMock)).toEqual([
      '/api/members/search?q=ben',
      '/api/members/search?q=ben',
    ])
    expect(replace).not.toHaveBeenCalled()
  })

  it('keeps the answer to the newest query when an older one comes back last', async () => {
    const slow: ((value: unknown) => void)[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/config'
          ? Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ limits: { memberSearch: 1 } }),
            })
          : new Promise((resolve) => slow.push(resolve)),
      ),
    )
    const screen = await mountScreen('an')
    route.query = { q: 'zed' }
    await flushPromises()
    const reply = (results: unknown[]): unknown => ({
      ok: true,
      status: 200,
      json: async () => ({ results, more: false }),
    })
    slow[1]?.(reply([]))
    await flushPromises()
    slow[0]?.(reply([ben]))
    await flushPromises()

    expect(screen.text()).not.toContain('Ben Okafor')
    expect(screen.find('.empty').text()).toContain('Nobody matches')
  })

  it('lets the member search again after clearing a search still under way', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/config'
          ? Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ limits: { memberSearch: 1 } }),
            })
          : new Promise(() => undefined),
      ),
    )
    const screen = await mountScreen('sector:retail')
    route.query = {}
    await flushPromises()

    expect(
      screen.find('button[type=submit]').attributes('disabled'),
    ).toBeUndefined()
  })

  it('says how to search with no query, and searches nothing', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    expect(screen.text()).toContain('Every term has to match')
    expect(searched(fetchMock)).toEqual([])
  })

  it('says how to search when no term is long enough (R-FIND-2)', async () => {
    server({ results: [], more: false, tooShort: true })
    const screen = await mountScreen('a')

    expect(screen.text()).toContain('Every term has to match')
  })

  it('says more match without saying how many (R-FIND-3)', async () => {
    server({ results: [ben], more: true })
    const screen = await mountScreen('ben')

    expect(screen.text()).toContain('More match — add a term to narrow it down')
  })

  it('says when nobody matches', async () => {
    server({ results: [], more: false })
    const screen = await mountScreen('zed')

    expect(screen.find('.empty').text()).toContain('Nobody matches')
  })

  it('shows each operator as a chip, and removing one searches again (R-FIND-4)', async () => {
    const fetchMock = server()
    const screen = await mountScreen('ben company:acme')
    const chip = screen.find('button[aria-label="Remove Company: acme"]')
    await chip.trigger('click')
    await flushPromises()

    expect(replace).toHaveBeenCalledWith({ query: { q: 'ben' } })
    expect(searched(fetchMock).at(-1)).toBe('/api/members/search?q=ben')
  })

  it('adds an operator to the box and focuses it (R-FIND-4)', async () => {
    server()
    const screen = await mountScreen('ben')
    const add = screen
      .findAll('button')
      .find((button) => button.text() === '+ Title')
    await add?.trigger('click')
    await flushPromises()

    const box = screen.find('input[type=search]').element as HTMLInputElement
    expect(box.value).toBe('ben title:')
    expect(document.activeElement).toBe(box)
  })

  it('adds a picked sector and searches', async () => {
    server()
    const screen = await mountScreen('ben')
    await screen.find('select').setValue('retail')
    await flushPromises()

    expect(replace).toHaveBeenCalledWith({
      query: { q: 'ben sector:retail' },
    })
  })

  it.each([
    [1, true],
    [0, false],
  ])(
    'offers Your code while codes are on (%i): %s (R-CODE-1)',
    async (connectCodes, offered) => {
      server(undefined, 1, connectCodes)
      const screen = await mountScreen()

      expect(
        screen
          .findAllComponents(RouterLinkStub)
          .some((link) => link.props('to') === '/me/code'),
      ).toBe(offered)
    },
  )

  it('is not found while hosts have search off (R-FIND-1)', async () => {
    server(undefined, 0)
    await mountScreen()

    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'not-found' }),
    )
  })
})
