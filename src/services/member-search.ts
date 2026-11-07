import {
  isSearchable,
  parseQuery,
  tokenize,
  type ParsedQuery,
  type SearchField,
} from '../search/query.js'
import { trackNothing, type Track } from './analytics.js'
import { canReach } from './reach.js'

/** A member as search shows them: what the deck's card shows, never an email
 * (R-FIND-3, R-CONN-6). Sector and company size are labels. */
export interface MemberCard {
  memberId: string
  name: string
  jobTitle: string | null
  org: string | null
  sector: string | null
  companySize: string | null
  /** Their photo's key, or null without one (R-PROF-7). */
  photo: string | null
  /** The viewer's accepted request with this member to open the contact
   * by, or null while they are not connected (R-CONN-8). */
  connectionId: string | null
}

/** What a search narrows by: folded terms, words split by single spaces,
 * plain words counted as name terms (R-FIND-2). */
export type SearchTerms = Record<SearchField, string[]>

/** A card with what reach is decided on (R-FIND-6). */
export interface CardFacts {
  card: MemberCard
  /** Active and onboarded. */
  reachable: boolean
  findable: boolean
}

export interface MemberSearchStore {
  /** Active, onboarded, findable members other than the caller matching
   * every term at the start of a word, best first, at most `limit`
   * (R-FIND-3). */
  search(
    callerId: string,
    terms: SearchTerms,
    limit: number,
  ): Promise<MemberCard[]>
  /** A member's card as `viewerId` sees it, whatever the member's state,
   * or null for no such member. */
  card(viewerId: string, memberId: string): Promise<CardFacts | null>
}

/** The limits a search runs by, read per request (ADR 0031). */
export interface SearchRules {
  searchOn: boolean
  minChars: number
  maxResults: number
}

export interface SearchAnswer {
  results: MemberCard[]
  more: boolean
  tooShort?: true
}

export interface MemberSearchService {
  /** At most `maxResults` cards for a query; `more` when others match too,
   * never how many; `tooShort` when no term is long enough (R-FIND-2,3). */
  search(callerId: string, query: string): Promise<SearchAnswer>
  /** A member's card if reach allows it, else null (R-FIND-6). */
  card(callerId: string, memberId: string): Promise<MemberCard | null>
}

const SEPARATORS = /[\s/.,;:'’"()&+_‐‑‒–—-]+/gu

function wordsOf(value: string): string {
  return value.replace(SEPARATORS, ' ').trim()
}

function termsOf(parsed: ParsedQuery): SearchTerms {
  const words = (values: string[]): string[] =>
    values.map(wordsOf).filter((value) => value !== '')
  return {
    name: words([...parsed.free, ...parsed.name]),
    company: words(parsed.company),
    title: words(parsed.title),
    sector: words(parsed.sector),
  }
}

function operatorsOf(query: string): SearchField[] {
  const used = new Set<SearchField>()
  for (const token of tokenize(query)) if (token.field) used.add(token.field)
  return [...used]
}

function resultsWord(answer: SearchAnswer): 'none' | 'some' | 'more' {
  if (answer.more) return 'more'
  return answer.results.length === 0 ? 'none' : 'some'
}

async function runSearch(
  store: MemberSearchStore,
  rules: SearchRules,
  callerId: string,
  terms: SearchTerms,
): Promise<SearchAnswer> {
  const found = await store.search(callerId, terms, rules.maxResults + 1)
  return {
    results: found.slice(0, rules.maxResults),
    more: found.length > rules.maxResults,
  }
}

/** Member search (R-FIND-1..3, R-FIND-8, ADR 0062): a few cards for a
 * query, never a directory; the usage event names the operators used and
 * how many results there were in a word, never the query. */
export function createMemberSearch(deps: {
  store: MemberSearchStore
  rules: () => SearchRules
  track?: Track
}): MemberSearchService {
  const track = deps.track ?? trackNothing
  return {
    search: async (callerId, query) => {
      const rules = deps.rules()
      const terms = termsOf(parseQuery(query))
      if (!isSearchable({ ...terms, free: [] }, rules.minChars))
        return { results: [], more: false, tooShort: true }
      const answer = await runSearch(deps.store, rules, callerId, terms)
      void track(callerId, {
        name: 'member_searched',
        operators: operatorsOf(query),
        results: resultsWord(answer),
      })
      return answer
    },
    card: async (callerId, memberId) => {
      const facts = await deps.store.card(callerId, memberId)
      if (facts === null) return null
      const reached = canReach({
        isCaller: memberId === callerId,
        reachable: facts.reachable,
        findable: facts.findable,
        searchOn: deps.rules().searchOn,
        presentsCode: false,
        codesOn: false,
      })
      return reached ? facts.card : null
    },
  }
}
