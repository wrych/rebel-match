import type { MatchesNews } from './cockpit'

/** A tab in the bottom bar and the paths it stands for. */
export interface Tab {
  label: string
  to: string
  /** Path prefixes that belong to the tab, so it stays lit deeper in. */
  owns: readonly string[]
}

export const tabs: readonly Tab[] = [
  { label: 'Submit', to: '/ask', owns: ['/ask', '/challenges/'] },
  { label: 'Swipe', to: '/offer', owns: ['/offer'] },
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

const counted = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`

/** The number on the Matches badge (R-MINE-4, R-CONN-7). */
export function matchesBadge(news: MatchesNews): number {
  return news.waiting + news.connected
}

/** What a screen reader hears for the Matches tab (R-MINE-4, R-CONN-7). */
export function matchesLabel(news: MatchesNews): string {
  const parts = [
    news.waiting > 0 &&
      counted(news.waiting, 'request', 'requests') + ' waiting',
    news.connected > 0 &&
      counted(news.connected, 'new connection', 'new connections'),
  ].filter((part) => part !== false)
  return ['Matches', ...parts].join(', ')
}
