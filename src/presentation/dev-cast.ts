import type { CastEntry } from './cast.js'

const at = (name: string): string => `${name}@example.invalid`

const stand = (
  handle: string,
  name: string,
  member: string | null,
  groups: string[] = [],
): CastEntry => ({
  handle,
  name,
  groups,
  ...(member === null ? {} : { email: at(member) }),
})

/** Fictional stand-ins for the presentation's cast over the dev seed, used in
 * a development deployment without a cast file (R-PRES-5, R-SEED-2). The
 * real names and photos come only from the private file. */
export const devCast: readonly CastEntry[] = [
  stand('founder-one', 'Founder one', null),
  stand('founder-two', 'Founder two', null),
  stand('author-one', 'Elena Marchetti', 'elena.marchetti', ['authors']),
  stand('author-two', 'Yusuf Kaya', 'yusuf.kaya', ['authors']),
  stand('pioneer', 'Ana Ferreira', 'ana.ferreira', ['pioneers']),
  stand('builder', 'Priya Raman', 'priya.raman'),
  stand('dev-one', 'Milan Horvat', 'milan.horvat', ['developers']),
  stand('dev-two', 'Hanna Vogt', 'hanna.vogt', ['developers']),
  stand('dev-three', 'Lars Petersen', 'lars.petersen', ['developers']),
  stand('tester-one', 'Sanne Kuipers', 'sanne.kuipers', ['betaTesters']),
  stand('tester-two', 'Ola Nyberg', 'ola.nyberg', ['betaTesters']),
  stand('tester-three', 'Diego Salas', 'diego.salas', ['betaTesters']),
  stand('tester-four', 'Nadia Osei', 'nadia.osei', ['betaTesters']),
  stand('tester-five', 'Ruben Vos', 'ruben.vos', ['betaTesters']),
]
