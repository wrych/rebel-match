// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const solve = vi.fn(() => Promise.resolve('solved' as string | null))
vi.mock('../lib/human-check', () => ({ solveHumanCheck: solve }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { from: 'matches' } }),
}))

type Answer = { status: number; body?: unknown }

const ME = {
  id: 'm-ada',
  name: 'Ada',
  onboarded: true,
  analyticsOptIn: false,
  roles: ['member'],
  permissions: [],
}

function serve(
  answers: Record<string, Answer>,
  posts: Answer[],
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const answer =
      url === '/api/feedback' && init?.method === 'POST'
        ? (posts.shift() ?? { status: 500 })
        : (answers[url] ?? { status: 401 })
    return Promise.resolve(
      new Response(
        answer.body === undefined ? null : JSON.stringify(answer.body),
        { status: answer.status },
      ),
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const config = {
  status: 200,
  body: { limits: { feedbackMaxChars: 4000 }, build: {} },
}

async function screen(): Promise<ReturnType<typeof mount>> {
  vi.resetModules()
  const { default: FeedbackScreen } = await import('./FeedbackScreen.vue')
  const wrapper = mount(FeedbackScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return wrapper
}

function posted(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls
    .filter(([url]) => url === '/api/feedback')
    .map(([, init]) => JSON.parse((init as RequestInit).body as string))
}

afterEach(() => {
  vi.unstubAllGlobals()
  solve.mockClear()
})

describe('FeedbackScreen', () => {
  it('fills in a member’s name and email and sends with the screen (R-FB-1)', async () => {
    const fetchMock = serve(
      {
        '/auth/me': { status: 200, body: ME },
        '/api/profile': {
          status: 200,
          body: { name: 'Ada Lovelace', email: 'ada@example.invalid' },
        },
        '/api/config': config,
      },
      [{ status: 204 }],
    )
    const wrapper = await screen()

    expect(
      (wrapper.find('#feedback-name').element as HTMLInputElement).value,
    ).toBe('Ada Lovelace')
    expect(
      (wrapper.find('#feedback-email').element as HTMLInputElement).value,
    ).toBe('ada@example.invalid')

    await wrapper.find('#feedback-message').setValue('Lovely deck')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(posted(fetchMock)).toEqual([
      {
        message: 'Lovely deck',
        name: 'Ada Lovelace',
        email: 'ada@example.invalid',
        screen: 'matches',
      },
    ])
    expect(solve).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Thank you')
  })

  it('leaves a visitor’s fields empty and solves the check before sending (R-FB-2)', async () => {
    const fetchMock = serve({ '/api/config': config }, [
      { status: 200, body: { state: 'human-check', challenge: {} } },
      { status: 204 },
    ])
    const wrapper = await screen()

    expect(
      (wrapper.find('#feedback-name').element as HTMLInputElement).value,
    ).toBe('')
    await wrapper.find('#feedback-message').setValue('Hello')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(solve).toHaveBeenCalledOnce()
    expect(posted(fetchMock)[1]).toMatchObject({
      message: 'Hello',
      altcha: 'solved',
    })
    expect(wrapper.text()).toContain('Thank you')
  })

  it('keeps what was written when there has been too much feedback', async () => {
    serve({ '/api/config': config }, [{ status: 429 }])
    const wrapper = await screen()

    await wrapper.find('#feedback-message').setValue('Hello')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Try again')
    expect(
      (wrapper.find('#feedback-message').element as HTMLTextAreaElement).value,
    ).toBe('Hello')
  })

  it('cannot send an empty message', async () => {
    serve({ '/api/config': config }, [])
    const wrapper = await screen()

    expect(
      wrapper.find('button[type="submit"]').attributes('disabled'),
    ).toBeDefined()
  })
})
