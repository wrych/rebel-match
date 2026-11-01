import type { CompanySize, Sector } from '../../profile-options.js'
import type { SeedMember } from '../types.js'

// Fictional names, crossed so no pairing is anyone in particular.
const firstNames = [
  'Amara',
  'Bastian',
  'Chloé',
  'Dario',
  'Eva',
  'Femke',
  'Gustav',
  'Hiba',
  'Ines',
  'Jakob',
  'Kaja',
  'Luca',
  'Mara',
  'Noor',
  'Oskar',
  'Paula',
  'Quentin',
  'Rosa',
  'Stijn',
  'Tilde',
  'Umut',
  'Vera',
  'Wim',
  'Zofia',
]
const lastNames = [
  'Albers',
  'Bakker',
  'Costa',
  'Dahl',
  'Eriksen',
  'Fischer',
  'Graaf',
  'Haddad',
  'Iversen',
  'Jansen',
  'Keller',
  'Lund',
  'Moreau',
  'Novak',
  'Olsen',
  'Peeters',
  'Quist',
  'Rossi',
  'Sorensen',
  'Thiel',
  'Unger',
  'Visser',
  'Weber',
  'Zeller',
]
const jobTitles = [
  'People lead',
  'Team coach',
  'COO',
  'Head of HR',
  'Ops manager',
  'Agile coach',
  'Founder',
  'Finance lead',
  'Org designer',
  'Plant manager',
  'Product lead',
  'Change lead',
]
const orgs = [
  'Brightwater',
  'Kloosterhof',
  'Northwind Works',
  'Alpenrot',
  'Tidewell',
  'Vireo Health',
  'Stellwerk',
  'Lumen & Co',
  'Fjordline',
  'Oaktree Schools',
  'Copperleaf',
  'Mosaik Studio',
  'Grünfeld',
  'Harbourside',
  'Quarry Lane',
  'Solenne',
  'Riverbend Care',
  'Atelier Nord',
  'Pinecrest',
  'Ventura Labs',
]
const sectors: Sector[] = [
  'healthcare',
  'software-technology',
  'manufacturing',
  'education',
  'financial-services',
  'government',
  'retail',
  'logistics',
  'nonprofit',
  'energy-utilities',
  'media-creative',
  'hospitality',
]
const sizes: CompanySize[] = ['11-50', '51-250', '251-1000', '1001+', '1-10']

// Steps coprime to each list's length, so neighbours in the crowd differ in
// every field and no two members share a name.
const pick = <T>(list: readonly T[], index: number, step: number): T =>
  list[(index * step) % list.length] as T

const slug = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** `count` more fictional members for a dev network worth looking at
 * (R-SEED-10), on the non-routable domain (R-SEED-2). */
export function crowd(count: number): SeedMember[] {
  return Array.from({ length: count }, (_, index) => {
    const first = pick(firstNames, index, 1)
    const last = pick(
      lastNames,
      index + Math.floor(index / firstNames.length),
      5,
    )
    return {
      email: `${slug(first)}.${slug(last)}@example.invalid`,
      name: `${first} ${last}`,
      jobTitle: pick(jobTitles, index, 5),
      org: pick(orgs, index, 7),
      sector: pick(sectors, index, 5),
      companySize: pick(sizes, index, 3),
      roles: ['member'],
    }
  })
}
