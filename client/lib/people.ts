import { apiPaths, fill } from '../../src/api-paths'
import type { MemberCard, SearchAnswer } from '../../src/services/member-search'
import { sectors } from '../../src/profile-options'
import {
  printQuery,
  tokenize,
  type QueryToken,
  type SearchField,
} from '../../src/search/query'
import { openProfileCode, tokenOf } from './codes'
import { findJson } from './request'
import { pathTo } from '../../src/routes'

export type { MemberCard, SearchAnswer }

/** Where a member's card is shown (S45). */
export const personPath = (memberId: string): string =>
  pathTo('person', { memberId })

/** Where a direct request to a member is written (S46). */
export const personConnectPath = (memberId: string): string =>
  pathTo('person-connect', { memberId })

/** Whether search is offered: hosts have it on and the member may search
 * (R-FIND-1, R-ROLE-4). */
export function searchOpen(
  memberSearch: number,
  permissions: readonly string[],
): boolean {
  return memberSearch === 1 && permissions.includes('member:search')
}

/** The cards a query finds, or null while hosts have search off
 * (R-FIND-1, R-FIND-3). */
export function searchMembers(query: string): Promise<SearchAnswer | null> {
  return findJson<SearchAnswer>(
    `${apiPaths.memberSearch}?q=${encodeURIComponent(query)}`,
    'search unavailable',
  )
}

/** A member's card, or null for one search would not find (R-FIND-6). */
export async function fetchMemberCard(
  memberId: string,
): Promise<MemberCard | null> {
  const found = await findJson<{ card: MemberCard }>(
    fill(apiPaths.memberCard, { id: memberId }),
    'card unavailable',
  )
  return found?.card ?? null
}

/** One operator of the query as a chip: its place among the query's parts,
 * so removing it removes that part alone (R-FIND-4). */
export interface QueryChip {
  index: number
  label: string
}

const fieldLabels: Readonly<Record<SearchField, string>> = {
  name: 'Name',
  company: 'Company',
  title: 'Title',
  sector: 'Sector',
}

function valueLabel(token: QueryToken): string {
  if (token.field !== 'sector') return token.value
  return sectors.find((each) => each.key === token.value)?.label ?? token.value
}

/** Each operator in the query, as the chips below the box show it. */
export function chipsOf(query: string): QueryChip[] {
  return tokenize(query).flatMap((token, index) =>
    token.field === null
      ? []
      : [
          {
            index,
            label: `${fieldLabels[token.field]}: ${valueLabel(token)}`.trim(),
          },
        ],
  )
}

/** The query without the part at `index`. */
export function withoutPart(query: string, index: number): string {
  return printQuery(tokenize(query).filter((_token, at) => at !== index))
}

/** The query with an operator added at its end, waiting for its value when
 * `value` is empty (R-FIND-4). */
export function withOperator(
  query: string,
  field: SearchField,
  value = '',
): string {
  const added: QueryToken = { field, value, quoted: false }
  return printQuery([...tokenize(query), added])
}

/** Whom S45 and S46 show, and the profile code that reached them, if any. */
export interface Reached {
  card: MemberCard
  profileCode: string | null
}

/** The member a card screen is about: by id where search reaches them, or
 * by the profile code in the address's fragment; null for neither
 * (R-FIND-6, R-CODE-3). */
export async function reachedFrom(route: {
  params: Record<string, unknown>
  hash: string
}): Promise<Reached | null> {
  const memberId = route.params['memberId']
  if (typeof memberId === 'string') {
    const card = await fetchMemberCard(memberId)
    return card === null ? null : { card, profileCode: null }
  }
  const token = tokenOf(route.hash)
  const opened = token === null ? null : await openProfileCode(token)
  return opened === null ? null : { card: opened.card, profileCode: token }
}
