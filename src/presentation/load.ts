import { readFileSync } from 'node:fs'
import { isDevelopmentDeployment, type Config } from '../config.js'
import { parseCast, type CastEntry } from './cast.js'
import { devCast } from './dev-cast.js'

/** The presentation's cast: the private file the deployment points to, read
 * once at start, or the fictional stand-ins in a development deployment
 * without one; anywhere else, nobody (R-PRES-5). A file that cannot be read
 * stops the start, naming the setting rather than the file's contents. */
export function presentationCast(
  config: Pick<Config, 'presentationCastFile' | 'env'> & {
    mail: Pick<Config['mail'], 'delivery'>
  },
  read: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): readonly CastEntry[] {
  const path = config.presentationCastFile
  if (path === undefined) return isDevelopmentDeployment(config) ? devCast : []
  let text: string
  try {
    text = read(path)
  } catch {
    throw new Error('PRESENTATION_CAST_FILE cannot be read')
  }
  return parseCast(text)
}
