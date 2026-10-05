// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeleteHistory from './DeleteHistory.vue'

function respond(status: number): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok: status < 300, status })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DeleteHistory (R-STAT-4)', () => {
  it('says what goes and what stays, and asks once before deleting', async () => {
    const fetchMock = respond(204)
    const screen = mount(DeleteHistory)

    expect(screen.text()).toContain('which challenges you are shown')
    expect(screen.text()).toContain('your connections stay')
    await screen.find('button').trigger('click')
    expect(fetchMock).not.toHaveBeenCalled()

    await screen.find('button.btn-dark').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/me/history', {
      method: 'DELETE',
    })
    expect(screen.find('[role="status"]').text()).toContain('deleted')
  })

  it('keeps everything when the member changes their mind', async () => {
    const fetchMock = respond(204)
    const screen = mount(DeleteHistory)

    await screen.find('button').trigger('click')
    await screen.find('button.btn-ghost').trigger('click')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.text()).toContain('Delete my activity history')
  })

  it('says so when it did not go through, and never claims it did', async () => {
    respond(500)
    const screen = mount(DeleteHistory)

    await screen.find('button').trigger('click')
    await screen.find('button.btn-dark').trigger('click')
    await flushPromises()

    expect(screen.find('[role="alert"]').text()).toContain('still here')
    expect(screen.find('[role="status"]').exists()).toBe(false)
  })
})
