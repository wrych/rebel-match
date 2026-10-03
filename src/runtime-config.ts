import { loadConfig, type Config } from './config.js'
import { withLocalSessionSecret } from './local-secret.js'

/** The configuration every entry point runs on: the environment, plus the
 * generated session secret a local PGlite run keeps (ADR 0024). */
export async function loadRuntimeConfig(): Promise<Config> {
  return loadConfig(await withLocalSessionSecret(process.env))
}
