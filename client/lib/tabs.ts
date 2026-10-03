/** A tab in the bottom bar and the paths it stands for. */
export interface Tab {
  label: string
  to: string
  /** Path prefixes that belong to the tab, so it stays lit deeper in. */
  owns: readonly string[]
}

// Swipe joins when the Offer journey's screen exists, and Feedback with its
// own task (R-FB-1): a tab that leads nowhere is worse than none.
export const tabs: readonly Tab[] = [
  { label: 'Submit', to: '/ask', owns: ['/ask', '/challenges/'] },
  { label: 'Matches', to: '/matches', owns: ['/matches'] },
]

/** The bar belongs to member screens, as in the prototype: not before
 * sign-in or onboarding, and not on the welcome screen, whose two doors are
 * the navigation there. */
export function showsTabs(access: unknown, name: unknown): boolean {
  return access === 'onboarded' && name !== 'welcome'
}

/** The tab a path sits under, if any. */
export function activeTab(path: string): Tab | undefined {
  return tabs.find((tab) =>
    tab.owns.some((prefix) => path === prefix || path.startsWith(prefix)),
  )
}

/** What a screen reader hears for the Matches tab (R-MINE-4). */
export function matchesLabel(waiting: number): string {
  if (waiting === 0) return 'Matches'
  return `Matches, ${String(waiting)} ${waiting === 1 ? 'request' : 'requests'} waiting`
}
