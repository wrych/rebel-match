import { useRoute, useRouter } from 'vue-router'

/** The name of the route that answers an address as not found (R-NAV-8). */
export const NOT_FOUND_ROUTE = 'not-found'

/** Shows the not-found screen in place of the current address, which stays
 * in the bar: not found, never forbidden (R-NAV-8). Call from setup. */
export function useNotFound(): () => Promise<void> {
  const route = useRoute()
  const router = useRouter()
  return async () => {
    await router.replace({
      name: NOT_FOUND_ROUTE,
      params: { pathMatch: route.path.slice(1).split('/') },
    })
  }
}
