import andyMoesch from '../assets/makers/andy-moesch.jpg'
import ivoPejakovic from '../assets/makers/ivo-pejakovic.jpg'
import pascalDulex from '../assets/makers/pascal-dulex.jpg'

/** A person who made the app, as the impressum shows them (R-PROF-4). */
export interface Maker {
  name: string
  responsibilities: readonly string[]
  /** Without one, the card shows the maker's initials. */
  portrait: string | null
}

export const makers: readonly Maker[] = [
  {
    name: 'Pascal Dulex',
    responsibilities: ['Idea', 'Design', 'Marketing'],
    portrait: pascalDulex,
  },
  {
    name: 'Ivo Pejakovic',
    responsibilities: ['Coordination', 'Community'],
    portrait: ivoPejakovic,
  },
  {
    name: 'Andy Moesch',
    responsibilities: ['Engineering', 'Operations'],
    portrait: andyMoesch,
  },
  {
    name: 'Community',
    responsibilities: ['Challenges', 'Experience', 'Connections'],
    portrait: null,
  },
]

/** The first letter of each part of a name, upper-cased. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}
