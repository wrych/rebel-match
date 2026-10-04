import { routeTable, type RouteDef } from '../../src/routes'

export type AdminLink = RouteDef & { label: string }

// Each admin screen's path and permission come from the route table
// (ADR 0017), so no list can offer a door the router would refuse.
const adminScreens: readonly AdminLink[] = [
  { name: 'admin-applicants', label: 'Applicants' },
  { name: 'admin-invites', label: 'Invite links' },
  { name: 'admin-members', label: 'Members' },
  { name: 'admin-outbox', label: 'Outbound message log' },
].flatMap(({ name, label }) => {
  const route = routeTable.find((candidate) => candidate.name === name)
  return route === undefined ? [] : [{ ...route, label }]
})

/** The host tools these permissions open (R-ROLE-4). */
export function adminLinksFor(permissions: readonly string[]): AdminLink[] {
  return adminScreens.filter(
    (screen) =>
      screen.permission === undefined ||
      permissions.includes(screen.permission),
  )
}
