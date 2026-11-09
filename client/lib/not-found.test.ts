// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  type Router,
} from 'vue-router'
import { NOT_FOUND_ROUTE, useNotFound } from './not-found'

const Gone = defineComponent({
  setup() {
    const notFound = useNotFound()
    return () => h('button', { onClick: notFound }, 'gone')
  },
})

const Missing = { render: () => h('p', 'not found') }

async function openAt(
  path: string,
): Promise<{ router: Router; app: VueWrapper }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Missing },
      { path: '/badges/:row', component: Gone },
      { path: '/:pathMatch(.*)*', name: NOT_FOUND_ROUTE, component: Missing },
    ],
  })
  await router.push('/')
  await router.push(path)
  const app = mount(RouterView, { global: { plugins: [router] } })
  await flushPromises()
  return { router, app }
}

describe('useNotFound (R-NAV-8)', () => {
  it('shows the not-found screen at the address that was asked for', async () => {
    const { router, app } = await openAt('/badges/speak')

    await app.find('button').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe(NOT_FOUND_ROUTE)
    expect(router.currentRoute.value.path).toBe('/badges/speak')
    expect(app.text()).toBe('not found')
  })

  it('takes the place of the address in history rather than adding one', async () => {
    const { router, app } = await openAt('/badges/speak')

    await app.find('button').trigger('click')
    await flushPromises()
    router.back()
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
  })
})
